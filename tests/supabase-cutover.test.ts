import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { prepareCutover,classifyReviewedFindings } from '../scripts/prepare-supabase-cutover.mjs';
import { prepareSnapshot,canonical,TARGET_PROJECT_REF } from '../scripts/prepare-supabase-import.mjs';
import { CUTOVER_RELEASE } from '../scripts/verify-supabase-cutover.mjs';

const fixture=(final=false):any=>({schema_version:1,target_project_ref:TARGET_PROJECT_REF,
 source:{spreadsheet_id:'private_cutover_fixture',exported_at:final?'2026-10-30T12:07:05.000Z':'2026-10-30T08:00:00.000Z'},
 tables:{settings:{headers:['key','value'],rows:[['shop_name','Test bakery'],['phone',1700000000]],formulas:[[null,null],[null,'=01700000000']]},
 products:{headers:['id','name'],rows:[['cake_original','Fixture cake']]},
 orders:{headers:['id','total_amount','receipt_json'],rows:[['order_present',12.25,JSON.stringify({id:'order_present',total_amount:12.25,customer_access_token:'PRIVATE_CAPABILITY'})]]},
 order_items:{headers:['id','order_id','product_id','unit_price','quantity','subtotal'],rows:[['item_legacy','order_missing','cake_original',12.25,1,12.25]]}}});
const evidence=():any=>({schema_version:1,target_project_ref:TARGET_PROJECT_REF,
 before:{observed_at:'2026-10-30T12:07:01.000Z',health:{ok:true,release:CUTOVER_RELEASE,database_backend:'google_sheets',writes_frozen:true,frozen_at:'2026-10-30T12:00:00.000Z'}},
 after:{observed_at:'2026-10-30T12:07:11.000Z',health:{ok:true,release:CUTOVER_RELEASE,database_backend:'google_sheets',writes_frozen:true,frozen_at:'2026-10-30T12:00:00.000Z'}},
 export_started_at:'2026-10-30T12:07:02.000Z',export_completed_at:'2026-10-30T12:07:10.000Z'});
const reviews={acknowledgeLegacyOrphan:true,acceptConstantPhoneFormula:true,note:'Owner explicitly reviewed preserving the existing orphan and the unchanged constant phone formula as a static value.'};
const classify=(current=fixture(true),baseline=fixture())=>classifyReviewedFindings(current,baseline,prepareSnapshot(current,TARGET_PROJECT_REF).manifest,prepareSnapshot(baseline,TARGET_PROJECT_REF).manifest);
const modulePath=process.env.AURORA_TEST_PGLITE_MODULE;
const pgOptions={skip:!modulePath};
const loadPg=async()=> (await import(pathToFileURL(path.resolve(modulePath!)).href)).PGlite;

test('only the unchanged known orphan and constant phone formula are eligible for named review',()=>{
 const review=classify();assert.equal(review.legacy_orphan,true);assert.equal(review.constant_phone_formula,true);
 assert.equal(review.findings.length,2);assert.doesNotMatch(JSON.stringify(review),/1700000000|PRIVATE_CAPABILITY|order_missing/);
 const moved=fixture(true);moved.tables.order_items.rows.unshift(['item_valid','order_present','cake_original',1,1,1]);
 assert.equal(classify(moved).legacy_orphan,true);
});
test('new, changed or missing legacy findings cannot be automatically acknowledged',()=>{
 const changed=fixture(true);changed.tables.order_items.rows[0][1]='different_missing_order';assert.throws(()=>classify(changed),/legacy orphan row changed/);
 const gone=fixture(true);gone.tables.order_items.rows=[];assert.throws(()=>classify(gone),/disappeared/);
 const extra=fixture(true);extra.tables.order_items.rows.push(['item_new_orphan','another_missing','cake_original',1,1,1]);assert.throws(()=>classify(extra),/New or changed/);
 const unknown=fixture(true);unknown.tables.unreviewed={headers:['id'],rows:[['unknown']]};assert.throws(()=>classify(unknown),/New or changed/);
});
test('changed/volatile/omitted formula metadata requires separate review',()=>{
 const volatile=fixture(true);volatile.tables.settings.formulas[1][1]='=RAND()';assert.throws(()=>classify(volatile),/nonconstant/);
 const changed=fixture(true);changed.tables.settings.formulas[1][1]='=01800000000';assert.throws(()=>classify(changed),/formula or computed value changed/);
 const value=fixture(true);value.tables.settings.rows[1][1]=1800000000;assert.throws(()=>classify(value),/formula or computed value changed/);
 const omitted=fixture(true);delete omitted.tables.settings.formulas;assert.throws(()=>classify(omitted),/metadata is incomplete/);
});

test('PostgreSQL computes exact audit hash; missing named owner acknowledgments yields no SQL',pgOptions,async()=>{
 const PGlite=await loadPg();const result=await prepareCutover({snapshot:fixture(true),baseline:fixture(),evidence:evidence(),PGlite});
 assert.equal(result.sql,null);assert.equal(result.pending.length,3);assert.equal(result.report.mode,'dry_run');
 const db=new PGlite();try{
  const actual=(await db.query("SELECT encode(sha256(convert_to($1::jsonb::text,'UTF8')),'hex') AS hash",[canonical(result.prepared.manifest.audits)])).rows[0].hash;
  assert.equal(result.report.reviewed_audits_sha256,actual);
 }finally{await db.close();}
 assert.doesNotMatch(JSON.stringify(result.report),/PRIVATE_CAPABILITY|1700000000|order_missing|Owner explicitly/);
});

test('the complete owner SQL atomically imports/promotes exact data, preserves orphan/formula and refuses overwrite',pgOptions,async()=>{
 const PGlite=await loadPg();const result=await prepareCutover({snapshot:fixture(true),baseline:fixture(),evidence:evidence(),PGlite,reviews});
 assert.equal(result.pending.length,0);assert.ok(result.sql);assert.equal((result.sql!.match(/^BEGIN;$/gm)||[]).length,1);assert.equal((result.sql!.match(/^COMMIT;$/gm)||[]).length,1);
 assert.match(result.sql!,/Running this complete file explicitly accepts/);assert.doesNotMatch(result.sql!,/PRIVATE_CAPABILITY|01700000000|DELETE FROM|TRUNCATE|latest/i);
 const db=new PGlite();try{
  await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;');
  await db.exec(fs.readFileSync('supabase/migrations/20261030_006_migration_staging.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261030_007_private_runtime_store.sql','utf8'));
  await db.exec(result.sql!);
  const lineage=(await db.query('SELECT public.aurora_runtime_cutover_status($1) AS result',[TARGET_PROJECT_REF])).rows[0].result;
  assert.equal(lineage.run_id,result.prepared.manifest.run_id);assert.equal(lineage.source_sha256,result.prepared.manifest.source_sha256);assert.equal(lineage.revision,'1');
  for(const table of result.prepared.tables){
   const headers=(await db.query('SELECT headers FROM aurora_runtime.tables WHERE table_name=$1',[table.name])).rows[0].headers;assert.deepEqual(headers,table.headers);
   const rows=(await db.query('SELECT sheet_row,cells,source_formulas AS formulas FROM aurora_runtime.rows WHERE table_name=$1 ORDER BY sheet_row',[table.name])).rows;
   assert.deepEqual(rows,table.rows.map((row:any)=>({sheet_row:row.sheet_row,cells:row.cells,formulas:row.formulas})));
  }
  assert.equal(Number((await db.query("SELECT count(*) AS n FROM aurora_runtime.rows WHERE table_name='orders'")).rows[0].n),1);
  await assert.rejects(db.exec(result.sql!),/Runtime is already initialized/);await db.exec('ROLLBACK');
  assert.equal((await db.query('SELECT revision::text FROM aurora_runtime.state')).rows[0].revision,'1');
 }finally{await db.close();}
});

test('post-promotion readback failure rolls back the complete owner transaction',pgOptions,async()=>{
 const PGlite=await loadPg(),result=await prepareCutover({snapshot:fixture(true),baseline:fixture(),evidence:evidence(),PGlite,reviews});
 const marker='-- Verify promoted headers, cells and original formulas against the complete expected source.';
 assert.ok(result.sql!.includes(marker));
 const corrupted=result.sql!.replace(marker,"UPDATE aurora_runtime.rows SET cells='[]'::jsonb WHERE table_name='settings' AND sheet_row=2;\n"+marker);
 const db=new PGlite();try{
  await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;');
  await db.exec(fs.readFileSync('supabase/migrations/20261030_006_migration_staging.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261030_007_private_runtime_store.sql','utf8'));
  await assert.rejects(db.exec(corrupted),/Final runtime readback failed/);await db.exec('ROLLBACK');
  for(const table of ['aurora_runtime.state','aurora_runtime.rows','aurora_migration.runs'])assert.equal(Number((await db.query('SELECT count(*) AS n FROM '+table)).rows[0].n),0);
  assert.equal((await db.query("SELECT to_regprocedure('public.aurora_runtime_cutover_status(text)') AS function")).rows[0].function,null);
 }finally{await db.close();}
});

test('stale/unfrozen evidence fails before any owner SQL can be prepared',pgOptions,async()=>{
 const PGlite=await loadPg(),open=evidence();open.before.health.writes_frozen=false;
 await assert.rejects(prepareCutover({snapshot:fixture(true),baseline:fixture(),evidence:open,PGlite,reviews}),/writes_frozen/);
 await assert.rejects(prepareCutover({snapshot:fixture(),baseline:fixture(),evidence:evidence(),PGlite,reviews}),/fresh export interval/);
});

test('CLI defaults to no files; explicit reviewed output is private and never overwrites',pgOptions,async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'private-aurora-cutover-'));
 try{
  const input=path.join(directory,'final.json'),baseline=path.join(directory,'baseline.json'),proof=path.join(directory,'evidence.json'),note=path.join(directory,'note.txt'),output=path.join(directory,'owner.sql');
  fs.writeFileSync(input,JSON.stringify(fixture(true)));fs.writeFileSync(baseline,JSON.stringify(fixture()));fs.writeFileSync(proof,JSON.stringify(evidence()));fs.writeFileSync(note,reviews.note);
  const args=['scripts/prepare-supabase-cutover.mjs','--input',input,'--baseline',baseline,'--evidence',proof,'--project-ref',TARGET_PROJECT_REF,'--pglite-module',modulePath!];
  const dry=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(dry.status,0,dry.stderr);assert.equal(JSON.parse(dry.stdout).pending_review_count,3);assert.equal(fs.readdirSync(directory).length,4);
  const missing=spawnSync(process.execPath,[...args,'--out',output],{encoding:'utf8'});assert.equal(missing.status,1);assert.equal(fs.existsSync(output),false);
  const explicit=[...args,'--acknowledge-known-legacy-orphan','--accept-constant-phone-formula','--review-note-file',note,'--out',output];
  const written=spawnSync(process.execPath,explicit,{encoding:'utf8'});assert.equal(written.status,0,written.stderr);assert.equal(JSON.parse(written.stdout).files_written,4);
  assert.doesNotMatch(written.stdout,/PRIVATE_CAPABILITY|01700000000|Owner explicitly/);
  assert.equal(JSON.parse(fs.readFileSync(output.replace('.sql','.review.json'),'utf8')).mode,'prepared_private_owner_sql');
  const repeat=spawnSync(process.execPath,explicit,{encoding:'utf8'});assert.equal(repeat.status,1);assert.match(repeat.stderr,/refusing to overwrite/);
 }finally{
  const actual=fs.realpathSync(directory),temp=fs.realpathSync(os.tmpdir());
  assert.equal(path.dirname(actual),temp,'Cleanup must stay in the created temp parent');
  assert.ok(path.basename(actual).startsWith('private-aurora-cutover-'),'Cleanup must target this test directory');
  fs.rmSync(actual,{recursive:true,force:true});
 }
});
