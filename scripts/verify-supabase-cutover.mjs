/** Offline freshness evidence checks. No network, database writes or promotion. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareSnapshot, TARGET_PROJECT_REF, assertPrivatePath } from './prepare-supabase-import.mjs';

export const CUTOVER_RELEASE = 'aurora-2026-10-30-supabase-store-r2';
const DRAIN_MS=7*60*1000;
function requireCondition(value,message){if(!value)throw new Error(message);}
function timestamp(value,label){
  requireCondition(typeof value==='string'&&/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value),`${label} must be an ISO timestamp with timezone.`);
  const parsed=Date.parse(value);requireCondition(Number.isFinite(parsed),`${label} is invalid.`);return parsed;
}

/** Evidence contains public health metadata and operator-recorded capture times only. */
export function checkCutoverEvidence({snapshot,evidence,baseline=undefined}){
  const prepared=prepareSnapshot(snapshot,TARGET_PROJECT_REF);
  requireCondition(evidence?.schema_version===1&&evidence.target_project_ref===TARGET_PROJECT_REF,'Cutover evidence project/version pin is missing or different.');
  const before=evidence.before,after=evidence.after;
  requireCondition(before?.health&&after?.health,'Both before and after health observations are required.');
  for(const observation of [before,after]){
    const health=observation.health;
    const correctRelease=health.release===CUTOVER_RELEASE||
      (health.release===undefined&&health.installed_release===CUTOVER_RELEASE&&health.expected_release===CUTOVER_RELEASE&&health.up_to_date===true);
    requireCondition(health.ok===true&&correctRelease,'Health does not confirm the required deployed r2 release.');
    requireCondition(health.database_backend==='google_sheets','Source authority must remain google_sheets throughout the final export.');
    requireCondition(health.writes_frozen===true,'Both health observations must confirm writes_frozen=true.');
  }
  requireCondition(before.health.frozen_at===after.health.frozen_at,'Freeze changed during the export; repeat after a complete fresh drain.');
  const frozen=timestamp(before.health.frozen_at,'frozen_at');
  requireCondition(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(before.health.frozen_at)&&new Date(frozen).toISOString()===before.health.frozen_at,'frozen_at must be an exact valid UTC health timestamp.');
  const observedBefore=timestamp(before.observed_at,'before.observed_at'),observedAfter=timestamp(after.observed_at,'after.observed_at');
  const started=timestamp(evidence.export_started_at,'export_started_at'),completed=timestamp(evidence.export_completed_at,'export_completed_at');
  const exported=timestamp(snapshot.source.exported_at,'source.exported_at');
  requireCondition(observedBefore>=frozen+DRAIN_MS,'The before-export observation is earlier than the seven-minute drain deadline.');
  requireCondition(started>=observedBefore&&completed>=started&&observedAfter>=completed,'Capture/observation timestamps are not in a consistent order.');
  requireCondition(exported>=started&&exported<=completed,'Snapshot exported_at must fall within the recorded fresh export interval.');
  let retainedBaselineTables=null;
  if(baseline){
    const old=prepareSnapshot(baseline,TARGET_PROJECT_REF);
    const oldNames=Object.keys(baseline.tables);
    requireCondition(oldNames.every(name=>Object.hasOwn(snapshot.tables,name)),'The final export omitted one or more baseline source tabs.');
    requireCondition(prepared.manifest.run_id!==old.manifest.run_id,'The final export is the old staging run; do not promote it.');
    retainedBaselineTables=oldNames.length;
  }
  return {verification_version:1,scope:'offline_final_export_freshness_only',live_network_writes:false,
    target_project_ref:TARGET_PROJECT_REF,required_release:CUTOVER_RELEASE,
    frozen_at:before.health.frozen_at,drain_deadline:new Date(frozen+DRAIN_MS).toISOString(),
    export_started_at:evidence.export_started_at,export_completed_at:evidence.export_completed_at,
    run_id:prepared.manifest.run_id,source_sha256:prepared.manifest.source_sha256,manifest_sha256:prepared.manifest_sha256,
    table_count:prepared.manifest.table_count,row_count:prepared.manifest.row_count,audit_blocker_count:prepared.manifest.audits.length,
    baseline_table_count_retained:retainedBaselineTables,
    checks:{same_freeze_before_and_after:'passed',seven_minute_drain_before_capture:'passed',source_authority_unchanged:'passed',deployed_release:'passed',export_timestamp_freshness:'passed',baseline_inventory:baseline?'passed':'not_supplied'},
    unverified_conditions:['all_other_deployments_integrations_and_manual_sheet_writers_paused','native_export_is_complete_and_observation_times_are_truthful','runtime_is_uninitialized_or_matches_the_intended_final_run','owner_review_of_exact_final_audits_and_static_formulas','final_staging_readback_and_runtime_promotion','post_switch_private_api_acceptance'],
    production_cutover_ready:false};
}

function readPrivate(filename){
  assertPrivatePath(filename);assertPrivatePath(fs.realpathSync(filename));
  requireCondition(fs.statSync(filename).size<=64*1024*1024,'Input exceeds 64 MiB.');
  return JSON.parse(fs.readFileSync(filename,'utf8'));
}
export function main(args=process.argv.slice(2)){
  const options={};
  for(let i=0;i<args.length;i+=2){
    requireCondition(['--input','--evidence','--baseline','--project-ref','--report'].includes(args[i])&&args[i+1]&&!Object.hasOwn(options,args[i]),'Unknown, duplicate or incomplete option.');
    options[args[i]]=args[i+1];
  }
  requireCondition(options['--project-ref']===TARGET_PROJECT_REF,'Explicit authorized project pin is required.');
  requireCondition(options['--input']&&options['--evidence'],'Private final snapshot and freeze evidence are required.');
  const report=checkCutoverEvidence({snapshot:readPrivate(options['--input']),evidence:readPrivate(options['--evidence']),baseline:options['--baseline']?readPrivate(options['--baseline']):undefined});
  if(options['--report']){
    const file=assertPrivatePath(options['--report']);requireCondition(file.endsWith('.json'),'Use a private JSON report.');
    fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  }
  process.stdout.write(JSON.stringify(report,null,2)+'\n');return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{main();}catch(error){process.stderr.write(`Cutover evidence verification failed: ${error.message}\n`);process.exitCode=1;}
}
