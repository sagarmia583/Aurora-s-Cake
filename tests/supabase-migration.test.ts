import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TARGET_PROJECT_REF, assertPrivatePath, canonical, decimalToPaisa, generateSql, prepareSnapshot, sha256, summary } from '../scripts/prepare-supabase-import.mjs';
import { checkCutoverEvidence, CUTOVER_RELEASE } from '../scripts/verify-supabase-cutover.mjs';

const fixture = ():any => ({
  schema_version:1,target_project_ref:TARGET_PROJECT_REF,
  source:{spreadsheet_id:'sheet_private_export_123',exported_at:'2026-10-30T05:00:00.000Z'},
  tables:{
    settings:{headers:['key','value'],rows:[['phone','01700000000'],['accepting_orders',false]]},
    customer_accounts:{headers:['id','phone','password_salt','password_hash'],rows:[['customer_001','01700000000','PRIVATE_SALT','PRIVATE_HASH']]},
    auth_sessions:{headers:['token_hash','account_type','account_id','revoked'],rows:[['PRIVATE_SESSION_HASH','customer','customer_001',false]]},
    orders:{headers:['id','total_amount','receipt_json'],rows:[['order_001',1200.25,JSON.stringify({id:'order_001',customer_account_id:'customer_001',total_amount:1200.25,customer_access_token:'PRIVATE_CAPABILITY',items:[{product_id:'cake_001',quantity:1}]})]]},
    rider_cash_deposits:{headers:['id','amount','note'],rows:[['deposit_001',0,"'=HYPERLINK(\"https://example.com\")"],['deposit_002',-12.25,"'); DROP SCHEMA public CASCADE; --"]]},
    owner_custom_tab:{headers:['legacy_id','value','blank'],rows:[['0000026','=1+1',''],['0000036',false,null]],formulas:[[null,'=1+1',null],[null,null,null]],column_types:['string','mixed','empty']}
  }
});
const prepare = (snapshot=fixture())=>prepareSnapshot(snapshot,TARGET_PROJECT_REF);

test('all source tabs, exact string IDs, zero/false, receipt secrets and formulas survive staging',()=>{
  const snapshot=fixture(), prepared=prepare(snapshot);
  assert.deepEqual(prepared.backup,snapshot);
  assert.equal(prepared.manifest.table_count,6);
  assert.equal(prepared.manifest.row_count,9);
  assert.equal(prepared.manifest.production_cutover_ready,false);
  assert.equal(prepared.tables.find(t=>t.name==='customer_accounts')!.rows[0].source_id,'customer_001');
  assert.deepEqual(prepared.tables.find(t=>t.name==='owner_custom_tab')!.rows[0].formulas,[null,'=1+1',null]);
  assert.equal(prepared.manifest.tables.find(t=>t.name==='rider_cash_deposits')!.money_totals_paisa.amount,'-1225');
  assert.ok(prepared.manifest.audits.some(a=>a.table==='owner_custom_tab' && a.code==='unmapped_table'));
  assert.equal(prepared.manifest.audits.some(a=>a.code==='unresolved_session_owner'),false);
});

test('canonical hashes ignore table object ordering and preserve row/header ordering',()=>{
  const first=fixture(), second=fixture(); second.tables=Object.fromEntries(Object.entries(second.tables).reverse());
  assert.equal(prepare(first).manifest.source_sha256,prepare(second).manifest.source_sha256);
  assert.equal(prepare(first).manifest.run_id,prepare(second).manifest.run_id);
  second.tables.settings.rows.reverse();
  assert.notEqual(prepare(first).manifest.source_sha256,prepare(second).manifest.source_sha256);
  assert.equal(sha256(canonical(prepare(first).backup)),prepare(first).manifest.source_sha256);
});

test('SQL only writes private staging, encodes source values and reconciles exact rows atomically',()=>{
  const prepared=prepare(), sql=generateSql(prepared);
  assert.match(sql,/BEGIN;/);assert.match(sql,/COMMIT;/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/ON CONFLICT \(run_id,table_name,sheet_row\) DO NOTHING/);
  assert.match(sql,/EXCEPT SELECT \* FROM aurora_migration.source_rows/);
  assert.match(sql,/Migration reconciliation failed/);
  assert.doesNotMatch(sql,/INSERT INTO public\.|UPDATE public\.|DELETE FROM|TRUNCATE|CREATE OR REPLACE FUNCTION/i);
  assert.doesNotMatch(sql,/PRIVATE_HASH|PRIVATE_CAPABILITY|HYPERLINK|DROP SCHEMA public/);
  assert.ok(sql.includes(Buffer.from(canonical(fixture().tables.orders.rows[0])).toString('hex')));
});

test('ambiguous/malformed rows are retained and block projection rather than being dropped or repaired',()=>{
  const snapshot=fixture();
  snapshot.tables.orders.rows.push(['order_001','12.001','{bad JSON']);
  snapshot.tables.orders.rows.push(['order_002',3,JSON.stringify({id:'different',total_amount:4,customer_account_id:'unknown'})]);
  snapshot.tables.auth_sessions.rows.push(['another_hash','customer','missing',false]);
  snapshot.tables.unmodeled={headers:['id','id',''],rows:[['a','b','=1+1']]};
  const prepared=prepare(snapshot), codes=prepared.manifest.audits.map(a=>a.code);
  for (const code of ['invalid_receipt_json','duplicate_source_id','invalid_money','receipt_id_mismatch','receipt_total_mismatch','unresolved_session_owner','unresolved_receipt_owner','ambiguous_headers','unmapped_table']) assert.ok(codes.includes(code),code);
  assert.deepEqual(prepared.backup,snapshot);
});

test('known foreign keys cannot silently change to another ownership/catalog identity',()=>{
  const snapshot=fixture();
  snapshot.tables.order_items={headers:['id','order_id','product_id'],rows:[['item_original','order_missing','product_missing']]};
  const audits=prepare(snapshot).manifest.audits;
  assert.equal(audits.filter(a=>a.table==='order_items' && a.code==='unresolved_reference').length,2);
});

test('exact currency arithmetic uses signed integer paisa and refuses rounding',()=>{
  assert.equal(decimalToPaisa('000012.25'),1225n);
  assert.equal(decimalToPaisa('-0.05'),-5n);
  assert.equal(decimalToPaisa('99999999999999999999999.99'),9999999999999999999999999n);
  for(const value of ['1.001','1e2','1,200','NaN','৳12']) assert.throws(()=>decimalToPaisa(value));
});

test('target pin and unsupported/lossy source representation fail before generating SQL',()=>{
  assert.throws(()=>prepareSnapshot(fixture(),'other-project'),/project pin/);
  const mismatch=fixture();mismatch.target_project_ref='other-project';assert.throws(()=>prepare(mismatch),/project pin/);
  for(const bad of [Number.MAX_SAFE_INTEGER+1,Infinity,{secret:'not scalar'},'bad\0value']) {
    const snapshot=fixture();snapshot.tables.settings.rows[0][1]=bad;assert.throws(()=>prepare(snapshot));
  }
  const extra=fixture();extra.source.dropped_metadata='hidden';assert.throws(()=>prepare(extra),/Unsupported snapshot/);
  const ragged=fixture();ragged.tables.settings.rows.push(['extra','columns','lost']);assert.throws(()=>prepare(ragged),/wider/);
  const formulas=fixture();formulas.tables.owner_custom_tab.formulas[0]=[null];assert.throws(()=>prepare(formulas),/formula cells/);
});

test('short rows and empty tabs retain original widths and exact table inventory',()=>{
  const snapshot=fixture();snapshot.tables.empty_tab={headers:[],rows:[]};snapshot.tables.settings.rows.push(['short']);
  assert.deepEqual(prepare(snapshot).backup,snapshot);
});

test('summary has only counts/checksums and no private cells, receipt tokens or account identifiers',()=>{
  const printed=JSON.stringify(summary(prepare()));
  assert.doesNotMatch(printed,/PRIVATE_|customer_001|01700000000|password|receipt|sheet_private_export/);
  assert.match(printed,/dry_run/);
});

test('private path guard rejects repository/public output, including resolved public symlink targets',()=>{
  const repo=path.resolve('.');
  assert.throws(()=>assertPrivatePath(path.join(repo,'private','snapshot.json')),/outside/);
  assert.throws(()=>assertPrivatePath(path.join(os.tmpdir(),'public','private-aurora','snapshot.json')),/private directory/);
  assert.throws(()=>assertPrivatePath(path.join(os.tmpdir(),'unmarked','snapshot.json')),/private directory/);
  assert.equal(assertPrivatePath(path.join(os.tmpdir(),'private-aurora','snapshot.json')),path.resolve(os.tmpdir(),'private-aurora','snapshot.json'));
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'private-aurora-paths-'));
  const realpath=fs.realpathSync;
  try {
    const served=path.join(directory,'public'),link=path.join(directory,'private-link');
    fs.mkdirSync(served);fs.mkdirSync(link);
    // Simulate a resolved junction: Windows sandbox users cannot create symlinks.
    fs.realpathSync=((filename:fs.PathLike,...args:unknown[])=>path.resolve(String(filename))===link?served:(realpath as any)(filename,...args)) as typeof fs.realpathSync;
    assert.throws(()=>assertPrivatePath(path.join(link,'snapshot.json')),/private directory/);
  } finally {fs.realpathSync=realpath;fs.rmSync(directory,{recursive:true,force:true});}
});

test('CLI defaults to no writes, explicit preparation writes three private artifacts once',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'private-aurora-migration-'));
  try {
    const input=path.join(directory,'source.json'),out=path.join(directory,'aurora-supabase-stage.sql');
    fs.writeFileSync(input,JSON.stringify(fixture()));
    const run=(args:string[])=>spawnSync(process.execPath,['scripts/prepare-supabase-import.mjs','--input',input,'--project-ref',TARGET_PROJECT_REF,...args],{encoding:'utf8'});
    const dry=run([]);assert.equal(dry.status,0,dry.stderr);assert.equal(JSON.parse(dry.stdout).mode,'dry_run');assert.deepEqual(fs.readdirSync(directory),['source.json']);
    const written=run(['--out',out]);assert.equal(written.status,0,written.stderr);assert.equal(JSON.parse(written.stdout).files_written,3);
    const backup=JSON.parse(fs.readFileSync(out.replace(/\.sql$/,'.backup.json'),'utf8'));assert.deepEqual(backup,fixture());
    const again=run(['--out',out]);assert.equal(again.status,1);assert.match(again.stderr,/refusing to overwrite/);
    assert.doesNotMatch(written.stdout+written.stderr,/PRIVATE_HASH|PRIVATE_CAPABILITY|01700000000/);
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});

test('private staging migration enables and forces RLS without browser policies or grants',()=>{
  const sql=fs.readFileSync('supabase/migrations/20261030_006_migration_staging.sql','utf8');
  assert.equal((sql.match(/ENABLE ROW LEVEL SECURITY/g)||[]).length,3);
  assert.equal((sql.match(/FORCE ROW LEVEL SECURITY/g)||[]).length,3);
  assert.match(sql,/REVOKE ALL ON SCHEMA aurora_migration FROM PUBLIC, anon, authenticated/);
  assert.match(sql,/REVOKE ALL ON ALL TABLES IN SCHEMA aurora_migration/);
  assert.doesNotMatch(sql,/CREATE POLICY|GRANT .* TO (anon|authenticated)|CREATE TABLE.*public\./i);
  assert.match(sql,/target_project_ref = 'dtvefwpaxwffxglqbfoo'/);
});

const freezeEvidence=()=>({schema_version:1,target_project_ref:TARGET_PROJECT_REF,
  before:{observed_at:'2026-10-30T04:59:59.000Z',health:{ok:true,release:CUTOVER_RELEASE,database_backend:'google_sheets',writes_frozen:true,frozen_at:'2026-10-30T04:52:59.000Z'}},
  after:{observed_at:'2026-10-30T05:00:02.000Z',health:{ok:true,release:CUTOVER_RELEASE,database_backend:'google_sheets',writes_frozen:true,frozen_at:'2026-10-30T04:52:59.000Z'}},
  export_started_at:'2026-10-30T04:59:59.000Z',export_completed_at:'2026-10-30T05:00:01.000Z'});

test('cutover checker accepts fresh post-drain evidence without claiming live promotion/readiness',()=>{
  const snapshot=fixture(),old=fixture();old.source.exported_at='2026-10-30T01:00:00.000Z';
  const report=checkCutoverEvidence({snapshot,evidence:freezeEvidence(),baseline:old});
  assert.equal(report.table_count,6);assert.equal(report.baseline_table_count_retained,6);
  assert.equal(report.production_cutover_ready,false);assert.equal(report.live_network_writes,false);
  assert.doesNotMatch(JSON.stringify(report),/PRIVATE_HASH|PRIVATE_CAPABILITY|01700000000/);
  const proxy:any=freezeEvidence();
  delete proxy.before.health.release;Object.assign(proxy.before.health,{installed_release:CUTOVER_RELEASE,expected_release:CUTOVER_RELEASE,up_to_date:true});
  assert.equal(checkCutoverEvidence({snapshot,evidence:proxy}).checks.deployed_release,'passed');
});

test('cutover checker rejects stale snapshots, premature drain and changed freeze/backend',()=>{
  const stale=fixture();stale.source.exported_at='2026-10-30T01:00:00.000Z';
  assert.throws(()=>checkCutoverEvidence({snapshot:stale,evidence:freezeEvidence()}),/fresh export interval/);
  const premature=freezeEvidence();premature.before.health.frozen_at=premature.after.health.frozen_at='2026-10-30T04:53:00.000Z';
  assert.throws(()=>checkCutoverEvidence({snapshot:fixture(),evidence:premature}),/seven-minute/);
  const changed=freezeEvidence();changed.after.health.frozen_at='2026-10-30T04:52:58.000Z';
  assert.throws(()=>checkCutoverEvidence({snapshot:fixture(),evidence:changed}),/Freeze changed/);
  const switched=freezeEvidence();switched.after.health.database_backend='supabase';
  assert.throws(()=>checkCutoverEvidence({snapshot:fixture(),evidence:switched}),/authority/);
  const oldCode=freezeEvidence();oldCode.before.health.release='aurora-2026-10-30-supabase-store-r1';
  assert.throws(()=>checkCutoverEvidence({snapshot:fixture(),evidence:oldCode}),/r2 release/);
});

test('cutover checker requires unchanged baseline tab inventory and a new final run',()=>{
  const old=fixture(),snapshot=fixture();delete snapshot.tables.owner_custom_tab;
  assert.throws(()=>checkCutoverEvidence({snapshot,evidence:freezeEvidence(),baseline:old}),/omitted/);
  assert.throws(()=>checkCutoverEvidence({snapshot:old,evidence:freezeEvidence(),baseline:old}),/old staging run/);
});
