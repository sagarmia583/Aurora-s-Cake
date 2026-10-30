/** Independent, offline PostgreSQL/PGlite verification. Contains no credentials. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { prepareSnapshot, TARGET_PROJECT_REF, assertPrivatePath, generateSql, sha256 } from './prepare-supabase-import.mjs';

const REPO_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const SCHEMA_FILE=path.join(REPO_ROOT,'supabase/migrations/20261030_006_migration_staging.sql');
const hashFile=filename=>createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
function privateFile(filename) {
  assertPrivatePath(filename);assertPrivatePath(fs.realpathSync(filename));
  if(fs.statSync(filename).size>64*1024*1024)throw new Error('Private verification input exceeds 64 MiB.');
  return filename;
}
export function verificationFixture() {
  return {schema_version:1,target_project_ref:TARGET_PROJECT_REF,
    source:{spreadsheet_id:'offline_fixture_only',exported_at:'2026-10-30T00:00:00.000Z'},
    tables:{settings:{headers:['key','value'],rows:[['shop_name','Fixture bakery'],['enabled',false]]},
      orders:{headers:['id','total_amount','receipt_json'],rows:[['order_fixture',12.25,JSON.stringify({id:'order_fixture',total_amount:12.25})]]},
      archived_tab:{headers:['id','note'],rows:[['00026',"'); SELECT 1; --"]],formulas:[[null,'=1+1']]}}};
}

export async function verifyStaging({snapshot,PGlite,sql=undefined,provenance={}}) {
  const prepared=prepareSnapshot(snapshot,TARGET_PROJECT_REF), expectedSql=generateSql(prepared);
  if(sql!==undefined)assert.equal(sha256(sql),sha256(expectedSql),'Prepared SQL differs from the current validated generator.');
  else sql=expectedSql;
  const db=new PGlite();
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
    await db.exec(fs.readFileSync(SCHEMA_FILE,'utf8'));
    await db.exec(sql);await db.exec(sql);
    const runId=prepared.manifest.run_id;
    const storedRun=(await db.query('SELECT status,manifest,source_sha256 FROM aurora_migration.runs WHERE run_id=$1',[runId])).rows[0];
    assert.equal(storedRun.status,'verified_staging');assert.deepEqual(storedRun.manifest,prepared.manifest);assert.equal(storedRun.source_sha256,prepared.manifest.source_sha256);
    const storedTables=(await db.query('SELECT table_name,headers,column_types,row_count,table_sha256 FROM aurora_migration.source_tables WHERE run_id=$1 ORDER BY table_name',[runId])).rows;
    assert.equal(storedTables.length,prepared.tables.length);
    for(const table of prepared.tables){
      const stored=storedTables.find(candidate=>candidate.table_name===table.name);
      assert.deepEqual(stored,{table_name:table.name,headers:table.headers,column_types:table.column_types,row_count:table.rows.length,table_sha256:table.table_sha256});
      const rows=(await db.query('SELECT sheet_row,source_id,cells,formulas,row_sha256 FROM aurora_migration.source_rows WHERE run_id=$1 AND table_name=$2 ORDER BY sheet_row',[runId,table.name])).rows;
      assert.deepEqual(rows,table.rows);
    }
    const rowCount=Number((await db.query('SELECT count(*) AS n FROM aurora_migration.source_rows WHERE run_id=$1',[runId])).rows[0].n);
    assert.equal(rowCount,prepared.manifest.row_count);
    for(const role of ['anon','authenticated']){
      await db.exec('SET ROLE '+role);
      await assert.rejects(db.query('SELECT count(*) FROM aurora_migration.source_rows'),/permission denied/);
      await assert.rejects(db.query("UPDATE aurora_migration.runs SET status='staged'"),/permission denied/);
      await db.exec('RESET ROLE');
    }
    const nonempty=prepared.tables.find(table=>table.rows.length);
    if(nonempty){
      // Alter the checksum, not the row values: a same-run conflict must fail, never overwrite.
      const row=nonempty.rows[0], badHash=row.row_sha256==='0'.repeat(64)?'1'.repeat(64):'0'.repeat(64);
      await db.query('UPDATE aurora_migration.source_rows SET row_sha256=$1 WHERE run_id=$2 AND table_name=$3 AND sheet_row=$4',[badHash,runId,nonempty.name,row.sheet_row]);
      await assert.rejects(db.exec(sql),/reconciliation failed/);await db.exec('ROLLBACK');
      const stillBad=(await db.query('SELECT row_sha256 FROM aurora_migration.source_rows WHERE run_id=$1 AND table_name=$2 AND sheet_row=$3',[runId,nonempty.name,row.sheet_row])).rows[0].row_sha256;
      assert.equal(stillBad,badHash);
    }else{
      // Even an entirely empty workbook must reject unexpected extra source rows.
      await db.query("INSERT INTO aurora_migration.source_rows(run_id,table_name,sheet_row,cells,row_sha256) VALUES ($1,$2,2,'[]'::jsonb,$3)",[runId,prepared.tables[0].name,'0'.repeat(64)]);
      await assert.rejects(db.exec(sql),/reconciliation failed/);await db.exec('ROLLBACK');
    }
    return {verification_version:1,engine:'PGlite PostgreSQL (independent in-memory instance)',
      scope:'offline_staging_only',live_network_writes:false,target_project_ref:TARGET_PROJECT_REF,
      run_id:runId,source_sha256:prepared.manifest.source_sha256,manifest_sha256:prepared.manifest_sha256,
      generated_sql_sha256:sha256(sql),staging_schema_sql_sha256:hashFile(SCHEMA_FILE),
      table_count:prepared.manifest.table_count,row_count:rowCount,audit_blocker_count:prepared.manifest.audits.length,
      checks:{exact_table_and_cell_parity:'passed',formula_and_type_metadata:'passed',row_hashes_and_source_ids:'passed',idempotent_import:'passed',anonymous_read_write_denial:'passed',authenticated_read_write_denial:'passed',conflict_detection_and_rollback:'passed'},
      provenance,production_cutover_ready:false};
  }finally{await db.close();}
}

export async function main(args=process.argv.slice(2)) {
  const options={};
  for(let i=0;i<args.length;i++){
    const key=args[i];
    if(key==='--fixture'){if(options[key])throw new Error('Duplicate fixture option.');options[key]=true;continue;}
    if(!['--input','--project-ref','--pglite-module','--generated-sql','--raw-export','--normalizations','--report'].includes(key) || !args[i+1] || Object.hasOwn(options,key))throw new Error('Unknown or incomplete option.');
    options[key]=args[++i];
  }
  if(options['--project-ref']!==TARGET_PROJECT_REF)throw new Error('Explicit authorized --project-ref is required.');
  if(Boolean(options['--fixture'])===Boolean(options['--input']))throw new Error('Choose exactly one --fixture or --input <private snapshot.json>.');
  let runtime;
  if(options['--pglite-module'])runtime=await import(pathToFileURL(path.resolve(options['--pglite-module'])).href);
  else try{runtime=await import('@electric-sql/pglite');}catch{throw new Error('Install a trusted local @electric-sql/pglite runtime or pass --pglite-module <local dist/index.js>. No network installation is performed.');}
  const snapshot=options['--fixture']?verificationFixture():JSON.parse(fs.readFileSync(privateFile(options['--input']),'utf8'));
  const provenance={input_kind:options['--fixture']?'synthetic_fixture':'private_source_snapshot'};
  if(options['--raw-export'])provenance.raw_export_file_sha256=hashFile(privateFile(options['--raw-export']));
  if(options['--normalizations'])provenance.normalizations_file_sha256=hashFile(privateFile(options['--normalizations']));
  const sql=options['--generated-sql']?fs.readFileSync(privateFile(options['--generated-sql']),'utf8'):undefined;
  const report=await verifyStaging({snapshot,PGlite:runtime.PGlite,sql,provenance});
  if(options['--report']){
    const output=assertPrivatePath(options['--report']);
    if(!output.endsWith('.json'))throw new Error('Verification report must be a private .json file.');
    fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  }
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{await main();}catch(failure){
    // Assertion details can contain raw private rows; print only a safe fixed diagnostic.
    process.stderr.write('Offline staging verification failed. Review inputs/permissions and the local verifier; private assertion contents were suppressed.\n');process.exitCode=1;
  }
}
