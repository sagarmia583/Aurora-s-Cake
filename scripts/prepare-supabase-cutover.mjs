/** Offline, explicit owner-review SQL preparation. No network or live writes. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { prepareSnapshot,generateSql,canonical,sha256,assertPrivatePath,TARGET_PROJECT_REF } from './prepare-supabase-import.mjs';
import { checkCutoverEvidence } from './verify-supabase-cutover.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const SQL008_FILE=path.join(ROOT,'supabase/migrations/20261030_008_cutover_status.sql');
const sqlText=value=>`convert_from(decode('${Buffer.from(String(value),'utf8').toString('hex')}','hex'),'UTF8')`;
const same=(a,b)=>canonical(a)===canonical(b);
class SafePreparationError extends Error {}
function requireCondition(value,message){if(!value)throw new SafePreparationError(message);}
const keys=table=>table.headers.map(header=>header.trim().toLowerCase());
function rowForAudit(snapshot,audit){return snapshot.tables[audit.table]?.rows[audit.sheet_row-2];}
function knownOrphan(audit){return same({...audit,sheet_row:2},{table:'order_items',sheet_row:2,code:'unresolved_reference',field:'order_id',target_table:'orders',severity:'blocker'});}
function formulas(snapshot){
  const found=[];
  for(const [name,table] of Object.entries(snapshot.tables))for(let index=0;index<(table.formulas?.length||0);index++){
    for(let col=0;col<(table.formulas[index]?.length||0);col++){
      const formula=table.formulas[index][col];if(formula===null||formula==='')continue;
      const fields=keys(table),row=table.rows[index];
      found.push({table:name,sheet_row:index+2,column:col+1,formula,cells:row,headers:table.headers,
        is_constant_phone:name==='settings'&&fields[col]==='value'&&fields.includes('key')&&row[fields.indexOf('key')]==='phone'&&typeof formula==='string'&&/^=\+?\d+$/.test(formula)});
    }
  }
  return found;
}
export function classifyReviewedFindings(snapshot,baseline,manifest,baselineManifest){
  requireCondition(baselineManifest.audits.length<=1&&baselineManifest.audits.every(knownOrphan),'Baseline contains findings outside the initially reviewed legacy orphan.');
  const oldOrphan=baselineManifest.audits[0];
  if(oldOrphan){
    const original=rowForAudit(baseline,oldOrphan);
    requireCondition(same(snapshot.tables.order_items?.headers,baseline.tables.order_items.headers)&&snapshot.tables.order_items.rows.filter(row=>same(row,original)).length===1,
      'The original legacy orphan row changed or disappeared; separate owner review is required.');
  }
  for(const audit of manifest.audits){
    requireCondition(oldOrphan&&knownOrphan(audit)&&same(snapshot.tables.order_items.headers,baseline.tables.order_items.headers)&&same(rowForAudit(snapshot,audit),rowForAudit(baseline,oldOrphan)),
      'New or changed source findings require separate review; no owner SQL was generated.');
  }
  requireCondition(manifest.audits.length<=1,'Multiple source findings require separate review.');
  const beforeFormulas=formulas(baseline),afterFormulas=formulas(snapshot);
  requireCondition(beforeFormulas.length<=1&&beforeFormulas.every(f=>f.is_constant_phone),'Baseline formulas require separate review.');
  requireCondition(afterFormulas.length<=1&&afterFormulas.every(f=>f.is_constant_phone),'New or nonconstant source formulas require separate review.');
  requireCondition(beforeFormulas.length===afterFormulas.length,'The known phone formula disappeared or formula metadata is incomplete; separate review is required.');
  if(afterFormulas.length){
    const before=beforeFormulas[0],after=afterFormulas[0];
    requireCondition(before&&before.formula===after.formula&&same(before.headers,after.headers)&&same(before.cells,after.cells),
      'The constant phone formula or computed value changed; separate owner review is required.');
  }
  return {legacy_orphan:manifest.audits.length===1,constant_phone_formula:afterFormulas.length===1,
    findings:[...manifest.audits.map(a=>({table:a.table,sheet_row:a.sheet_row,code:'preserve_existing_orphan_without_inventing_parent'})),
      ...afterFormulas.map(f=>({table:f.table,sheet_row:f.sheet_row,column:f.column,code:'accept_constant_phone_formula_as_static_value',formula_sha256:sha256(f.formula)}))]};
}
function stripTransaction(sql,label){
  requireCondition((sql.match(/^BEGIN;\r?$/gm)||[]).length===1&&(sql.match(/^COMMIT;\r?$/gm)||[]).length===1,`${label} transaction wrapper changed; review composition before generating SQL.`);
  return sql.replace(/^BEGIN;\r?\n/m,'').replace(/^COMMIT;\r?\n/m,'');
}

function ownerSql(prepared,review,auditHash,note){
  const m=prepared.manifest,run=sqlText(m.run_id),digest=sqlText(m.source_sha256);
  const sql008=stripTransaction(fs.readFileSync(SQL008_FILE,'utf8'),'SQL 008');
  const staging=stripTransaction(generateSql(prepared),'Generated staging SQL');
  return [
    '-- PRIVATE OWNER FILE: includes customer/auth/receipt data encoded as SQL data.',
    '-- This complete SQL file runs in the Supabase Dashboard SQL Editor, not the Apps Script editor.',
    '-- Intended Dashboard project: dtvefwpaxwffxglqbfoo. Verify the selected project manually.',
    '-- Run ONLY while the SAME reviewed write freeze remains active and all other writers stay paused.',
    '-- Running this complete file explicitly accepts the listed preservation findings:',
    review.legacy_orphan?'-- ACCEPT: preserve the unchanged legacy order_items orphan; do not delete it or invent a parent order.':'-- No legacy orphan remains in this final source.',
    review.constant_phone_formula?'-- ACCEPT: the unchanged constant numeric settings.phone formula becomes a static value; original formula is preserved.':'-- No spreadsheet formula requires static acceptance in this final source.',
    '-- Review note is stored in private runtime metadata. Review the companion .review.json before Run.',
    '-- This file does NOT select a backend, clear the freeze, send email, or activate the website.',
    `-- Exact final run: ${m.run_id}; source SHA-256: ${m.source_sha256}`,
    'BEGIN;',"SET LOCAL lock_timeout = '10s';","SET LOCAL statement_timeout = '120s';",
    "SELECT pg_advisory_xact_lock(hashtextextended('aurora-runtime-promotion',0));",
    "DO $guard$ BEGIN IF EXISTS(SELECT 1 FROM aurora_runtime.state) THEN RAISE EXCEPTION 'Runtime is already initialized; stop and reconcile, never overwrite it'; END IF; END $guard$;",
    sql008,staging,
    '-- Promote only this literal final run/checksum, with the exact reviewed PostgreSQL JSONB audit hash.',
    `SELECT aurora_runtime.promote_staged_run(p_run_id=>${run},p_expected_source_sha256=>${digest},p_accept_static_formulas=>${review.constant_phone_formula?'true':'false'},p_reviewed_audits_sha256=>${sqlText(auditHash)},p_review_note=>${sqlText(note)}) AS owner_promotion;`,
    '-- Verify promoted headers, cells and original formulas against the complete expected source.',
    `DO $verify_final$ BEGIN
  IF (SELECT count(*) FROM aurora_runtime.state)<>1
     OR NOT EXISTS(SELECT 1 FROM aurora_runtime.state WHERE import_run_id=${run} AND revision=1)
     OR (SELECT count(*) FROM aurora_runtime.tables)<>${m.table_count}
     OR (SELECT count(*) FROM aurora_runtime.rows)<>${m.row_count}
     OR EXISTS(SELECT table_name,headers FROM pg_temp.aurora_expected_tables EXCEPT SELECT table_name,headers FROM aurora_runtime.tables)
     OR EXISTS(SELECT table_name,sheet_row,cells,formulas FROM pg_temp.aurora_expected_rows EXCEPT SELECT table_name,sheet_row,cells,source_formulas FROM aurora_runtime.rows)
  THEN RAISE EXCEPTION 'Final runtime readback failed; complete owner transaction rolled back'; END IF;
  IF public.aurora_runtime_cutover_status('dtvefwpaxwffxglqbfoo')->>'run_id' IS DISTINCT FROM ${run}
     OR public.aurora_runtime_cutover_status('dtvefwpaxwffxglqbfoo')->>'source_sha256' IS DISTINCT FROM ${digest}
  THEN RAISE EXCEPTION 'Final runtime lineage mismatch; complete owner transaction rolled back'; END IF;
END $verify_final$;`,
    'COMMIT;',
    "SELECT public.aurora_runtime_cutover_status('dtvefwpaxwffxglqbfoo') AS final_runtime_lineage;"
  ].join('\n')+'\n';
}

export async function prepareCutover({snapshot,evidence,baseline,PGlite,reviews={}}){
  requireCondition(baseline,'The original private baseline is required.');
  const freshness=checkCutoverEvidence({snapshot,evidence,baseline});
  const prepared=prepareSnapshot(snapshot,TARGET_PROJECT_REF),old=prepareSnapshot(baseline,TARGET_PROJECT_REF);
  const review=classifyReviewedFindings(snapshot,baseline,prepared.manifest,old.manifest);
  const db=new PGlite();let auditHash;
  try{
    auditHash=(await db.query("SELECT encode(sha256(convert_to($1::jsonb::text,'UTF8')),'hex') AS hash",[canonical(prepared.manifest.audits)])).rows[0].hash;
  }finally{await db.close();}
  const note=typeof reviews.note==='string'?reviews.note.trim():'';
  const pending=[];
  if(review.legacy_orphan&&reviews.acknowledgeLegacyOrphan!==true)pending.push('acknowledge_known_legacy_orphan');
  if(review.constant_phone_formula&&reviews.acceptConstantPhoneFormula!==true)pending.push('accept_constant_phone_formula');
  if(note.length<20||note.length>2000)pending.push('explicit_owner_review_note_20_to_2000_characters');
  const sql=pending.length?null:ownerSql(prepared,review,auditHash,note);
  const report={preparation_version:1,mode:'dry_run',target_project_ref:TARGET_PROJECT_REF,
    run_id:prepared.manifest.run_id,source_sha256:prepared.manifest.source_sha256,manifest_sha256:prepared.manifest_sha256,
    reviewed_audits_sha256:auditHash,table_count:prepared.manifest.table_count,row_count:prepared.manifest.row_count,
    named_finding_count:review.findings.length,pending_review_count:pending.length,
    owner_sql_sha256:sql?sha256(sql):null,live_network_writes:false,production_cutover_ready:false};
  return {prepared,freshness,review,pending,sql,report,reviewArtifact:{...report,findings:review.findings,pending_reviews:pending,
    explicit_acceptance:{legacy_orphan:reviews.acknowledgeLegacyOrphan===true,constant_phone_formula:reviews.acceptConstantPhoneFormula===true},
    review_note:note||null,freeze_evidence:freshness}};
}

function readPrivate(filename,json=true){
  assertPrivatePath(filename);assertPrivatePath(fs.realpathSync(filename));
  requireCondition(fs.statSync(filename).size<=64*1024*1024,'Input exceeds 64 MiB.');
  const value=fs.readFileSync(filename,'utf8');return json?JSON.parse(value):value;
}
export async function main(args=process.argv.slice(2)){
  const options={};
  for(let i=0;i<args.length;i++){
    const key=args[i];
    requireCondition(!Object.hasOwn(options,key),'Duplicate option.');
    if(['--acknowledge-known-legacy-orphan','--accept-constant-phone-formula'].includes(key)){options[key]=true;continue;}
    requireCondition(['--input','--evidence','--baseline','--project-ref','--pglite-module','--review-note-file','--out'].includes(key)&&args[i+1],'Unknown or incomplete option.');options[key]=args[++i];
  }
  requireCondition(options['--project-ref']===TARGET_PROJECT_REF,'Explicit authorized project pin is required.');
  requireCondition(options['--input']&&options['--evidence']&&options['--baseline'],'Final snapshot, freeze evidence and baseline are required.');
  const runtime=options['--pglite-module']?await import(pathToFileURL(path.resolve(options['--pglite-module'])).href):await import('@electric-sql/pglite');
  const result=await prepareCutover({snapshot:readPrivate(options['--input']),evidence:readPrivate(options['--evidence']),baseline:readPrivate(options['--baseline']),PGlite:runtime.PGlite,
    reviews:{acknowledgeLegacyOrphan:options['--acknowledge-known-legacy-orphan'],acceptConstantPhoneFormula:options['--accept-constant-phone-formula'],note:options['--review-note-file']?readPrivate(options['--review-note-file'],false):undefined}});
  if(options['--out']){
    requireCondition(result.sql!==null,'Explicit named finding acknowledgments and a valid owner review note are required; no files were written.');
    const output=assertPrivatePath(options['--out']);requireCondition(output.endsWith('.sql'),'Owner output must be a private .sql file.');
    result.reviewArtifact.mode='prepared_private_owner_sql';
    const stem=output.slice(0,-4),files=[[output,result.sql],[stem+'.review.json',JSON.stringify(result.reviewArtifact,null,2)+'\n'],[stem+'.manifest.json',JSON.stringify({...result.prepared.manifest,manifest_sha256:result.prepared.manifest_sha256},null,2)+'\n'],[stem+'.backup.json',canonical(result.prepared.backup)+'\n']];
    requireCondition(!files.some(([name])=>fs.existsSync(name)),'An output already exists; refusing to overwrite any owner artifact or backup.');
    for(const [name,value]of files)fs.writeFileSync(name,value,{flag:'wx',mode:0o600});
    result.report.mode='prepared_private_owner_sql';result.report.files_written=files.length;
  }
  process.stdout.write(JSON.stringify(result.report,null,2)+'\n');return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{await main();}catch(error){
    // Do not print assertion objects, source cells, formulas or private review notes.
    const message=error instanceof SafePreparationError?error.message:'Check private inputs, freeze evidence, project pin and trusted local PostgreSQL runtime; private error contents were suppressed.';
    process.stderr.write(`Owner SQL preparation failed: ${message}\n`);process.exitCode=1;
  }
}
