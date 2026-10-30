/** Offline lossless Sheet backup -> private Supabase staging SQL. Never connects. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const TARGET_PROJECT_REF = 'dtvefwpaxwffxglqbfoo';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_BYTES = 64 * 1024 * 1024;
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (object(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
export const sha256 = value => createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');

const DOMAINS = {
  public_content: ['settings','content','hero_slides','highlights','faqs','links','banners'],
  catalog: ['categories','products','product_variants','flavors','product_addons','delivery_zones','delivery_slots','coupons','reviews'],
  orders: ['orders','order_items','custom_cake_requests'],
  identity: ['staff_accounts','customer_accounts','auth_sessions','customers','customer_sessions','customer_challenges'],
  customer_profiles: ['customer_master','customer_contact_requests'],
  marketing: ['customer_subscriptions','email_subscriptions','email_campaigns','email_deliveries'],
  financial: ['inventory_items','inventory_movements','refund_returns','order_cost_snapshots','rider_cash_deposits','cake_cost_items']
};
const MONEY_HEADERS = new Set(['base_price','sale_price','price','unit_price','subtotal','discount_amount','total_amount','delivery_fee','estimated_price','quoted_price','amount','cost','unit_cost','total_cost','cost_amount','cash_amount','refund_amount','paid_amount','balance','purchase_price','selling_price','deposit_amount']);
const ID_HEADERS = ['id','token_hash','session_id','challenge_id','key'];
function error(message) { throw new Error(message); }
function scalar(value, where) {
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    if (value.includes('\0')) error(`${where}: NUL cannot be represented by PostgreSQL JSONB; re-export it with an explicit encoding.`);
    return;
  }
  if (typeof value === 'number' && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))) return;
  error(`${where}: use JSON scalar cells and export large numeric identifiers as strings.`);
}
export function decimalToPaisa(value) {
  const text = String(value);
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('not an exact amount with at most two decimal places');
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace(/^-/, '').split('.');
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return negative ? -amount : amount;
}
function tableDomain(name) { return Object.entries(DOMAINS).find(([, names]) => names.includes(name))?.[0] || 'unmapped'; }
function headerKeys(headers) { return headers.map(header => header.trim().toLowerCase()); }
function sourceId(keys, cells) {
  const key = ID_HEADERS.find(candidate => keys.includes(candidate));
  const value = key ? cells[keys.indexOf(key)] : null;
  return value === undefined || value === null || value === '' ? null : String(value);
}

/** Returns no row data in manifest/summary. The prepared value is private. */
export function prepareSnapshot(input, projectRef) {
  if (projectRef !== TARGET_PROJECT_REF || input?.target_project_ref !== TARGET_PROJECT_REF) error('Target project pin missing or different from the authorized Supabase project.');
  if (!object(input) || input.schema_version !== 1 || !object(input.source) || !object(input.tables)) error('Expected schema_version 1, source metadata and a tables object.');
  if (Object.keys(input).some(key=>!['schema_version','target_project_ref','source','tables'].includes(key)) || Object.keys(input.source).some(key=>!['spreadsheet_id','exported_at'].includes(key))) error('Unsupported snapshot metadata; use the documented lossless contract.');
  const source = input.source;
  if (typeof source.spreadsheet_id !== 'string' || !/^[a-zA-Z0-9_-]{10,150}$/.test(source.spreadsheet_id)) error('Invalid source spreadsheet identifier.');
  if (typeof source.exported_at !== 'string' || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(source.exported_at) || !Number.isFinite(Date.parse(source.exported_at))) error('source.exported_at must be an ISO timestamp with timezone.');
  const tables = [], audits = [], tableNames = Object.keys(input.tables).sort();
  if (!tableNames.length) error('Snapshot contains no tables; export every source tab, including empty tabs.');
  for (const name of tableNames) {
    if (!name || name.length > 150 || name.includes('\0')) error('Invalid source tab name.');
    const table = input.tables[name];
    if (!object(table) || !Array.isArray(table.headers) || !Array.isArray(table.rows)) error(`Tab ${name}: headers and rows must be arrays.`);
    if (Object.keys(table).some(key => !['headers','rows','formulas','column_types'].includes(key))) error(`Tab ${name}: unsupported table metadata; do not silently omit source data.`);
    const headers = table.headers;
    if (headers.some(value => typeof value !== 'string' || value.includes('\0'))) error(`Tab ${name}: header cells must be strings without NUL.`);
    if (table.column_types !== undefined && (!Array.isArray(table.column_types) || table.column_types.length !== headers.length || table.column_types.some(type => !['string','number','boolean','datetime','json','mixed','empty'].includes(type)))) error(`Tab ${name}: invalid column_types metadata.`);
    if (table.formulas !== undefined && (!Array.isArray(table.formulas) || table.formulas.length !== table.rows.length)) error(`Tab ${name}: formulas must have one array per source row.`);
    const keys = headerKeys(headers), counts = Object.create(null), seen = new Set(), totals = {};
    for (const key of keys) counts[key] = (counts[key] || 0) + 1;
    if (keys.some(key => !key || counts[key] > 1)) audits.push({table:name,code:'ambiguous_headers',severity:'blocker'});
    if (tableDomain(name) === 'unmapped') audits.push({table:name,code:'unmapped_table',severity:'blocker'});
    const rows = table.rows.map((cells, index) => {
      const where = `Tab ${name}, sheet row ${index + 2}`;
      if (!Array.isArray(cells) || cells.length > headers.length) error(`${where}: row must be an array no wider than the header range.`);
      cells.forEach(value => scalar(value, where));
      const formulas = table.formulas === undefined ? null : table.formulas[index];
      if (formulas !== null && (!Array.isArray(formulas) || formulas.length !== cells.length || formulas.some(value => value !== null && typeof value !== 'string'))) error(`${where}: formula cells must be strings or null, matching row width.`);
      formulas?.forEach(value => scalar(value, where));
      const id = sourceId(keys, cells);
      if (id !== null) { if (seen.has(id)) audits.push({table:name,sheet_row:index+2,code:'duplicate_source_id',severity:'blocker'}); seen.add(id); }
      for (let col=0; col<keys.length; col++) {
        if (!MONEY_HEADERS.has(keys[col]) || cells[col] === '' || cells[col] === undefined || cells[col] === null) continue;
        try { totals[keys[col]] = (totals[keys[col]] || 0n) + decimalToPaisa(cells[col]); }
        catch { audits.push({table:name,sheet_row:index+2,column:col+1,code:'invalid_money',severity:'blocker'}); }
      }
      const receiptIndex = keys.indexOf('receipt_json');
      if (receiptIndex >= 0 && cells[receiptIndex] !== '' && cells[receiptIndex] !== null && cells[receiptIndex] !== undefined) {
        let receipt;
        try { receipt = JSON.parse(cells[receiptIndex]); if (!object(receipt)) throw new Error(); }
        catch { audits.push({table:name,sheet_row:index+2,code:'invalid_receipt_json',severity:'blocker'}); }
        if (receipt && id !== null && has(receipt,'id') && String(receipt.id) !== id) audits.push({table:name,sheet_row:index+2,code:'receipt_id_mismatch',severity:'blocker'});
        const amount = cells[keys.indexOf('total_amount')];
        if (receipt && has(receipt,'total_amount') && amount !== undefined && amount !== '') {
          try { if (decimalToPaisa(receipt.total_amount) !== decimalToPaisa(amount)) throw new Error(); }
          catch { audits.push({table:name,sheet_row:index+2,code:'receipt_total_mismatch',severity:'blocker'}); }
        }
      }
      const rowData = {sheet_row:index+2,source_id:id,cells,formulas};
      return {...rowData,row_sha256:sha256(rowData)};
    });
    const normalized = {headers,column_types:table.column_types ?? null,rows};
    tables.push({name,...normalized,table_sha256:sha256(normalized),money_totals_paisa:Object.fromEntries(Object.entries(totals).map(([key,value])=>[key,value.toString()]))});
  }
  // Audit ownership and known relations without rewriting or discarding the source.
  const byName = new Map(tables.map(table=>[table.name,table]));
  const field = (table,row,key) => row.cells[headerKeys(table.headers).indexOf(key)];
  const ids = name => new Set((byName.get(name)?.rows || []).map(row=>row.source_id).filter(value=>value!==null));
  const relations = [
    ['products','category_id','categories'],['product_variants','product_id','products'],
    ['order_items','order_id','orders'],['order_items','product_id','products'],
    ['customer_subscriptions','customer_id','customer_accounts'],
    ['email_deliveries','campaign_id','email_campaigns']
  ];
  for (const [from,key,to] of relations) {
    const table=byName.get(from); if (!table) continue;
    const targetIds=ids(to);
    for (const row of table.rows) {
      const value=field(table,row,key);
      if (value!==undefined && value!==null && value!=='' && !targetIds.has(String(value))) audits.push({table:from,sheet_row:row.sheet_row,code:'unresolved_reference',field:key,target_table:to,severity:'blocker'});
    }
  }
  const accounts={customer:ids('customer_accounts'),staff:ids('staff_accounts')};
  const sessions=byName.get('auth_sessions');
  for (const row of sessions?.rows || []) {
    const kind=field(sessions,row,'account_type'), id=field(sessions,row,'account_id');
    if (!has(accounts,kind) || !accounts[kind].has(String(id))) audits.push({table:'auth_sessions',sheet_row:row.sheet_row,code:'unresolved_session_owner',severity:'blocker'});
  }
  const orders=byName.get('orders');
  for (const row of orders?.rows || []) {
    let receipt;try {receipt=JSON.parse(field(orders,row,'receipt_json'));} catch {continue;}
    if (receipt?.customer_account_id && !accounts.customer.has(String(receipt.customer_account_id))) audits.push({table:'orders',sheet_row:row.sheet_row,code:'unresolved_receipt_owner',severity:'blocker'});
  }
  const backup = {schema_version:1,target_project_ref:projectRef,source:{spreadsheet_id:source.spreadsheet_id,exported_at:source.exported_at},tables:Object.fromEntries(tables.map(table=>[table.name,{headers:table.headers,rows:table.rows.map(row=>row.cells),...(input.tables[table.name].column_types ? {column_types:input.tables[table.name].column_types}:{}),...(input.tables[table.name].formulas ? {formulas:input.tables[table.name].formulas}:{})}]))};
  const digest = sha256(backup), runId = 'sheet_' + digest.slice(0,32);
  const manifest = {
    schema_version:1,run_id:runId,target_project_ref:projectRef,source:backup.source,source_sha256:digest,
    scope:'private_staging_only',production_cutover_ready:false,
    table_count:tables.length,row_count:tables.reduce((sum,table)=>sum+table.rows.length,0),
    tables:tables.map(table=>({name:table.name,domain:tableDomain(table.name),row_count:table.rows.length,column_count:table.headers.length,table_sha256:table.table_sha256,money_totals_paisa:table.money_totals_paisa,production_projection:'pending'})),
    audits,
    required_cutover_gates:['complete_source_tab_inventory','resolve_projection_audits','transactional_runtime_and_auth_mapping','media_and_email_dependencies','private_api_acceptance','write_freeze_and_final_reconciliation']
  };
  return {backup,tables,manifest,manifest_sha256:sha256(manifest)};
}

const sqlText = value => value === null ? 'NULL' : `convert_from(decode('${Buffer.from(String(value),'utf8').toString('hex')}','hex'),'UTF8')`;
const sqlJson = value => value === null ? 'NULL' : `${sqlText(canonical(value))}::jsonb`;

export function generateSql(prepared) {
  const {manifest:m,tables} = prepared, run = sqlText(m.run_id);
  const lines = [
    '-- PRIVATE: full source data, credentials hashes, receipt capabilities and personal details.',
    `-- Intended project: ${TARGET_PROJECT_REF}. Verify the selected dashboard/API project separately.`,
    '-- Requires 20261030_006_migration_staging.sql. Does not change the live business schema.',
    'BEGIN;', "SET LOCAL lock_timeout = '10s';", "SET LOCAL statement_timeout = '120s';",
    `SELECT pg_advisory_xact_lock(hashtextextended(${run}, 0));`,
    'CREATE TEMP TABLE aurora_expected_tables (LIKE aurora_migration.source_tables INCLUDING DEFAULTS) ON COMMIT DROP;',
    'CREATE TEMP TABLE aurora_expected_rows (LIKE aurora_migration.source_rows INCLUDING DEFAULTS) ON COMMIT DROP;',
    `INSERT INTO aurora_migration.runs(run_id,schema_version,target_project_ref,source_spreadsheet_id,source_exported_at,source_sha256,manifest) VALUES (${run},1,${sqlText(m.target_project_ref)},${sqlText(m.source.spreadsheet_id)},${sqlText(m.source.exported_at)}::timestamptz,${sqlText(m.source_sha256)},${sqlJson(m)}) ON CONFLICT (run_id) DO NOTHING;`,
    `DO $verify$ BEGIN IF NOT EXISTS (SELECT 1 FROM aurora_migration.runs WHERE run_id=${run} AND schema_version=1 AND target_project_ref=${sqlText(TARGET_PROJECT_REF)} AND source_sha256=${sqlText(m.source_sha256)} AND manifest=${sqlJson(m)}) THEN RAISE EXCEPTION 'Existing migration run conflicts with expected manifest'; END IF; END $verify$;`
  ];
  for (const table of tables) {
    lines.push(`INSERT INTO pg_temp.aurora_expected_tables(run_id,table_name,headers,column_types,row_count,table_sha256) VALUES (${run},${sqlText(table.name)},${sqlJson(table.headers)},${sqlJson(table.column_types)},${table.rows.length},${sqlText(table.table_sha256)});`);
    for (const row of table.rows) lines.push(`INSERT INTO pg_temp.aurora_expected_rows(run_id,table_name,sheet_row,source_id,cells,formulas,row_sha256) VALUES (${run},${sqlText(table.name)},${row.sheet_row},${sqlText(row.source_id)},${sqlJson(row.cells)},${sqlJson(row.formulas)},${sqlText(row.row_sha256)});`);
  }
  lines.push(
    'INSERT INTO aurora_migration.source_tables SELECT * FROM pg_temp.aurora_expected_tables ON CONFLICT (run_id,table_name) DO NOTHING;',
    'INSERT INTO aurora_migration.source_rows SELECT * FROM pg_temp.aurora_expected_rows ON CONFLICT (run_id,table_name,sheet_row) DO NOTHING;',
    `DO $verify$ BEGIN
  IF (SELECT count(*) FROM aurora_migration.source_tables WHERE run_id=${run}) <> ${m.table_count}
     OR (SELECT count(*) FROM aurora_migration.source_rows WHERE run_id=${run}) <> ${m.row_count}
     OR EXISTS (SELECT * FROM pg_temp.aurora_expected_tables EXCEPT SELECT * FROM aurora_migration.source_tables WHERE run_id=${run})
     OR EXISTS (SELECT * FROM pg_temp.aurora_expected_rows EXCEPT SELECT * FROM aurora_migration.source_rows WHERE run_id=${run})
  THEN RAISE EXCEPTION 'Migration reconciliation failed; transaction rolled back'; END IF;
END $verify$;`,
    `UPDATE aurora_migration.runs SET status='verified_staging',verified_at=now() WHERE run_id=${run};`,
    'COMMIT;',
    `SELECT run_id,status,manifest->>'table_count' AS table_count,manifest->>'row_count' AS row_count FROM aurora_migration.runs WHERE run_id=${run};`
  );
  return lines.join('\n') + '\n';
}

/** Files must live in an explicitly private directory outside the source checkout. */
export function assertPrivatePath(filename, repoRoot = REPO_ROOT) {
  const absolute = path.resolve(filename), relative = path.relative(path.resolve(repoRoot), absolute);
  if (relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) error('Private export/import artifacts must be outside the repository checkout.');
  const segments = absolute.split(/[\\/]/);
  if (segments.some(segment=>/^(public|dist|build|static|www|wwwroot|\.git)$/i.test(segment)) || !segments.slice(0,-1).some(segment=>/^(?:\.private|private(?:[-_].*)?)$/i.test(segment))) error('Use an explicitly private directory, outside public/build/source folders.');
  // Resolve existing parent junctions/symlinks too; lexical checks alone are insufficient.
  const parent = path.dirname(absolute);
  if (fs.existsSync(parent)) {
    const actualParent = fs.realpathSync(parent), actualRepo = fs.realpathSync(repoRoot);
    if (actualParent !== parent) assertPrivatePath(path.join(actualParent,path.basename(absolute)), actualRepo);
  }
  return absolute;
}

export function summary(prepared) {
  const m = prepared.manifest;
  return {mode:'dry_run',target_project_ref:m.target_project_ref,run_id:m.run_id,table_count:m.table_count,row_count:m.row_count,source_sha256:m.source_sha256,manifest_sha256:prepared.manifest_sha256,audit_blocker_count:m.audits.length,production_cutover_ready:false};
}
export function main(args = process.argv.slice(2)) {
  const options = {};
  for (let i=0;i<args.length;i+=2) {
    if (!['--input','--project-ref','--out'].includes(args[i]) || !args[i+1] || has(options,args[i])) error('Usage: --input <private snapshot.json> --project-ref <authorized ref> [--out <private stage.sql>]');
    options[args[i]]=args[i+1];
  }
  if (!options['--input']) error('An explicit private snapshot is required. No network reads or writes are performed.');
  const filename = assertPrivatePath(options['--input']);
  assertPrivatePath(fs.realpathSync(filename));
  if (fs.statSync(filename).size > MAX_BYTES) error('Snapshot exceeds the 64 MiB offline input limit; use a reviewed bounded export.');
  const input = JSON.parse(fs.readFileSync(filename,'utf8'));
  const prepared = prepareSnapshot(input,options['--project-ref']);
  const result = summary(prepared);
  if (options['--out']) {
    const sqlFile = assertPrivatePath(options['--out']);
    if (!sqlFile.endsWith('.sql')) error('Output must use a .sql extension.');
    const stem = sqlFile.slice(0,-4), files = [
      [sqlFile,generateSql(prepared)],
      [stem+'.manifest.json',JSON.stringify({...prepared.manifest,manifest_sha256:prepared.manifest_sha256},null,2)+'\n'],
      [stem+'.backup.json',canonical(prepared.backup)+'\n']
    ];
    if (files.some(([name])=>fs.existsSync(name))) error('Output already exists; refusing to overwrite any backup, manifest or import.');
    // Artifacts contain credentials/PII. POSIX mode is advisory on Windows; use a private user ACL.
    for (const [name,contents] of files) fs.writeFileSync(name,contents,{flag:'wx',mode:0o600});
    result.mode='prepared_private_sql'; result.files_written=files.length;
  }
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  return prepared;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (failure) { process.stderr.write(`Migration preparation failed: ${failure.message}\n`); process.exitCode=1; }
}
