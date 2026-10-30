/** Offline SQL 007 acceptance. Fresh private in-memory DB; never calls Supabase. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prepareSnapshot, TARGET_PROJECT_REF, assertPrivatePath, generateSql, sha256 } from './prepare-supabase-import.mjs';
import { verificationFixture } from './verify-supabase-staging.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const HASH=bytes=>createHash('sha256').update(bytes).digest('hex');
function readPrivate(filename){
  assertPrivatePath(filename);assertPrivatePath(fs.realpathSync(filename));
  if(fs.statSync(filename).size>64*1024*1024)throw new Error('Private input exceeds 64 MiB.');
  return fs.readFileSync(filename,'utf8');
}

export async function verifyRuntime({snapshot,PGlite,sql=undefined}){
  const prepared=prepareSnapshot(snapshot,TARGET_PROJECT_REF), expectedSql=generateSql(prepared);
  if(sql!==undefined)assert.equal(sha256(sql),sha256(expectedSql),'Prepared SQL must match the current generator.');
  const stagingSql=fs.readFileSync(path.join(ROOT,'supabase/migrations/20261030_006_migration_staging.sql'),'utf8');
  const runtimeSql=fs.readFileSync(path.join(ROOT,'supabase/migrations/20261030_007_private_runtime_store.sql'),'utf8');
  const cutoverSql=fs.readFileSync(path.join(ROOT,'supabase/migrations/20261030_008_cutover_status.sql'),'utf8');
  const manifest=prepared.manifest, db=new PGlite(), ref=TARGET_PROJECT_REF;
  const checks={};
  try{
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
    await db.exec(stagingSql);await db.exec(sql??expectedSql);await db.exec(runtimeSql);await db.exec(cutoverSql);
    const lineage=async()=>((await db.query('SELECT public.aurora_runtime_cutover_status($1) AS result',[ref])).rows[0].result);
    assert.deepEqual(await lineage(),{project_ref:ref,promoted:false});
    await assert.rejects(db.query('SELECT public.aurora_runtime_cutover_status($1)',['wrong-project']),/wrong_project/);
    const promote=(formula,hash,note,sourceHash=manifest.source_sha256)=>db.query('SELECT aurora_runtime.promote_staged_run($1,$2,$3,$4,$5) AS result',[manifest.run_id,sourceHash,formula,hash,note]);
    await assert.rejects(promote(true,null,null,'0'.repeat(64)),/verified_source_required/);
    checks.exact_source_checksum_required='passed';
    const hasBlocker=manifest.audits.some(a=>a.severity==='blocker');
    if(hasBlocker)await assert.rejects(promote(true,null,null),/exact_audit_review_and_note_required/);
    const auditHash=(await db.query("SELECT encode(sha256(convert_to((manifest->'audits')::text,'UTF8')),'hex') AS hash FROM aurora_migration.runs WHERE run_id=$1",[manifest.run_id])).rows[0].hash;
    // This acknowledgment exists only in the disposable test DB, never in production.
    const note='Offline test acknowledgment only: preserve reviewed preexisting source records unchanged.';
    const hasFormula=prepared.tables.some(table=>table.rows.some(row=>row.formulas?.some(value=>value!==null&&value!=='')));
    if(hasFormula)await assert.rejects(promote(false,auditHash,note),/formula_recalculation_requires_explicit_review/);
    checks.source_audit_ack_required=hasBlocker?'passed':'not_applicable_no_audits';
    checks.static_formula_ack_required=hasFormula?'passed':'not_applicable_no_formulas';
    const promotion=(await promote(true,auditHash,note)).rows[0].result;
    assert.equal(promotion.tables,manifest.table_count);assert.equal(promotion.rows,manifest.row_count);assert.equal(promotion.live_backend_changed,false);
    assert.equal((await promote(true,auditHash,note)).rows[0].result.already_promoted,true);
    checks.promotion_idempotency='passed';
    for(const role of ['anon','authenticated']){
      await db.exec('SET ROLE '+role);
      await assert.rejects(db.query('SELECT public.aurora_runtime_snapshot($1)',[ref]),/permission denied/);
      await assert.rejects(db.query('SELECT public.aurora_runtime_cutover_status($1)',[ref]),/permission denied/);
      await assert.rejects(db.query('SELECT public.aurora_runtime_commit($1,$2,$3,$4)',[ref,'1',randomUUID(),'[]']),/permission denied/);
      await db.exec('RESET ROLE');
    }
    checks.browser_role_rpc_denial='passed';
    await db.exec('SET ROLE service_role');
    await assert.rejects(db.query('SELECT * FROM aurora_runtime.rows'),/permission denied/);
    await assert.rejects(db.query('SELECT aurora_runtime.promote_staged_run($1,$2,true,$3,$4)',[manifest.run_id,manifest.source_sha256,auditHash,note]),/permission denied/);
    checks.service_role_direct_table_and_promotion_denial='passed';
    const read=async()=>((await db.query('SELECT public.aurora_runtime_snapshot($1) AS result',[ref])).rows[0].result);
    const before=await read();assert.equal(before.revision,'1');
    assert.deepEqual(await lineage(),{project_ref:ref,promoted:true,run_id:manifest.run_id,source_sha256:manifest.source_sha256,source_exported_at:new Date(manifest.source.exported_at).toISOString(),revision:'1'});
    checks.private_lineage_metadata_and_browser_denial='passed';
    assert.equal(Object.keys(before.tables).length,manifest.table_count);
    for(const table of prepared.tables){
      assert.deepEqual(before.tables[table.name].headers,table.headers);
      assert.deepEqual(before.tables[table.name].rows,table.rows.map(row=>({sheet_row:row.sheet_row,cells:row.cells})));
    }
    checks.all_headers_and_cells_parity='passed';
    const settings=before.tables.settings;
    assert.ok(settings&&settings.headers.length===2&&settings.rows.length,'Aurora settings fixture required.');
    const original=settings.rows[0], values=original.cells.slice();values[1]='Disposable offline verification';
    const delta=[{table:'settings',row:original.sheet_row,cells:values}], op=randomUUID();
    const commit=(rev,id,changes)=>db.query('SELECT public.aurora_runtime_commit($1,$2,$3,$4::jsonb) AS result',[ref,rev,id,JSON.stringify(changes)]);
    assert.equal((await commit('1',op,delta)).rows[0].result.revision,'2');
    const replay=(await commit('1',op,delta)).rows[0].result;
    assert.equal(replay.replayed,true);assert.equal(replay.revision,'2');
    await assert.rejects(commit('1',randomUUID(),delta),/revision_conflict/);
    await assert.rejects(commit('1',op,[{...delta[0],cells:original.cells}]),/operation_id_conflict/);
    checks.cas_and_idempotent_operation_replay='passed';
    const second=values.slice();second[1]='This change must roll back';
    await assert.rejects(commit('2',randomUUID(),[{...delta[0],cells:second},{table:'not_a_real_source_tab',row:2,cells:['invalid']}]),/invalid_row_cells/);
    const afterFailure=await read();assert.equal(afterFailure.revision,'2');
    assert.deepEqual(afterFailure.tables.settings.rows.find(row=>row.sheet_row===original.sheet_row).cells,values);
    checks.multirow_failed_delta_rollback='passed';
    const changedKey=values.slice();changedKey[0]='forbidden_replacement_key';
    await assert.rejects(commit('2',randomUUID(),[{...delta[0],cells:changedKey}]),/record_key_immutable/);
    const appended=['offline_unique_key_'+randomUUID(),'disposable'];
    const appendAt=Math.max(...settings.rows.map(row=>row.sheet_row))+1;
    assert.equal((await commit('2',randomUUID(),[{table:'settings',row:appendAt,cells:appended}])).rows[0].result.revision,'3');
    await assert.rejects(commit('3',randomUUID(),[{table:'settings',row:appendAt+1,cells:appended}]),/duplicate_record_key/);
    checks.immutable_existing_keys_and_unique_appends='passed';
    assert.equal((await lineage()).revision,'3');
    return {verification_version:1,engine:'PGlite PostgreSQL (independent in-memory instance)',
      scope:'offline_runtime_bridge_only',live_network_writes:false,target_project_ref:ref,
      run_id:manifest.run_id,source_sha256:manifest.source_sha256,
      runtime_schema_sql_sha256:HASH(runtimeSql),staging_schema_sql_sha256:HASH(stagingSql),cutover_status_sql_sha256:HASH(cutoverSql),
      table_count:manifest.table_count,row_count:manifest.row_count,audit_blocker_count:manifest.audits.length,
      checks,production_cutover_ready:false};
  }finally{await db.close();}
}

export async function main(args=process.argv.slice(2)){
  const options={};
  for(let i=0;i<args.length;i++){
    const key=args[i];
    if(key==='--fixture'){if(options[key])throw new Error('Duplicate fixture flag.');options[key]=true;continue;}
    if(!['--input','--project-ref','--pglite-module','--generated-sql','--report'].includes(key)||!args[i+1]||Object.hasOwn(options,key))throw new Error('Unknown or incomplete verification option.');
    options[key]=args[++i];
  }
  if(options['--project-ref']!==TARGET_PROJECT_REF)throw new Error('Explicit authorized project pin is required.');
  if(Boolean(options['--fixture'])===Boolean(options['--input']))throw new Error('Choose --fixture or private --input.');
  const snapshot=options['--fixture']?verificationFixture():JSON.parse(readPrivate(options['--input']));
  const sql=options['--generated-sql']?readPrivate(options['--generated-sql']):undefined;
  const runtime=options['--pglite-module']?await import(pathToFileURL(path.resolve(options['--pglite-module'])).href):await import('@electric-sql/pglite');
  const report=await verifyRuntime({snapshot,PGlite:runtime.PGlite,sql});
  if(options['--report']){
    const output=assertPrivatePath(options['--report']);
    if(!output.endsWith('.json'))throw new Error('Use a private JSON report.');
    fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  }
  process.stdout.write(JSON.stringify(report,null,2)+'\n');return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{await main();}catch(_){process.stderr.write('Offline runtime verification failed; private assertion contents were suppressed.\n');process.exitCode=1;}
}
