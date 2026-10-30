/** Owner-controlled write freeze. Inactive until explicitly started in editor. */
var AURORA_MIGRATION_DRAIN_MS_ = 7 * 60 * 1000;
var AURORA_MIGRATION_FROZEN_PROP_ = 'AURORA_MIGRATION_FROZEN_AT';
var AURORA_MIGRATION_SOURCE_PROP_ = 'AURORA_MIGRATION_SOURCE_BACKEND';
var AURORA_MIGRATION_VERIFIED_PROP_ = 'AURORA_SUPABASE_CONNECTION_VERIFIED';

function auroraMigrationIso_(value) {
  if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value))return null;
  var parsed=new Date(value);return Number.isFinite(parsed.getTime())&&parsed.toISOString()===value?value:null;
}
function auroraMigrationStatus_() {
  var raw=PropertiesService.getScriptProperties().getProperty(AURORA_MIGRATION_FROZEN_PROP_);
  // Any nonempty corrupt value remains frozen. Never echo it in health output.
  return {writes_frozen:raw!==null&&raw!==undefined&&raw!=='',frozen_at:auroraMigrationIso_(raw)};
}
function auroraMigrationFrozen_() { return auroraMigrationStatus_().writes_frozen; }
function auroraMigrationDrainReady_() {
  var status=auroraMigrationStatus_(),stamp=status.frozen_at?Date.parse(status.frozen_at):NaN;
  return status.writes_frozen&&Number.isFinite(stamp)&&stamp<=Date.now()&&Date.now()-stamp>=AURORA_MIGRATION_DRAIN_MS_;
}
function auroraMigrationAssertWritable_() {
  if(auroraMigrationFrozen_()){
    var error=new Error('Bakery updates are paused for database migration. Retry later with the same request ID.');
    error.code='migration_frozen';error.auroraMigrationFrozen=true;throw error;
  }
}
function auroraMigrationOwner_() {
  var email=auroraRequireInteractiveSetup_(),props=PropertiesService.getScriptProperties();
  var configured=String(props.getProperty('AURORA_CAMPAIGN_OWNER_EMAIL')||'').trim().toLowerCase();
  if(configured){if(configured!==email)throw new Error('Only the configured bakery owner can manage migration.');return email;}
  var people;try{people=JSON.parse(props.getProperty('AURORA_STAFF_USERS')||'{}');}catch(_){people=null;}
  if(!people||!people[email]||people[email].role!=='super_admin')throw new Error('Configure the bakery owner before managing migration.');
  return email;
}
function auroraMigrationBackend_() {
  var raw=PropertiesService.getScriptProperties().getProperty('AURORA_DATABASE_BACKEND');
  if(raw===null||raw===undefined||raw===''||raw==='google_sheets')return 'google_sheets';
  if(raw==='supabase')return 'supabase';
  throw new Error('Fix the configured database backend before continuing migration.');
}
function auroraMigrationClearCache_() {
  var suffix=auroraConfiguredId_()||'bound',cache=CacheService.getScriptCache();
  ['aurora_public_profiles_email_v1_sheets_','aurora_public_profiles_email_v1_supabase_','aurora_public_profiles_email_v1_'].forEach(function(prefix){cache.remove(prefix+suffix);});
}
function beginMigrationFreeze() {
  auroraMigrationOwner_();var lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))throw new Error('An update is running. Retry starting the freeze.');
  try{
    var props=PropertiesService.getScriptProperties(),status=auroraMigrationStatus_();
    if(!status.writes_frozen){
      var source=auroraMigrationBackend_();
      props.setProperty(AURORA_MIGRATION_SOURCE_PROP_,source);
      props.setProperty(AURORA_MIGRATION_FROZEN_PROP_,new Date().toISOString());
      status=auroraMigrationStatus_();
    }
    auroraMigrationClearCache_();
    var result={ok:true,writes_frozen:true,frozen_at:status.frozen_at,
      drain_until:status.frozen_at?new Date(Date.parse(status.frozen_at)+AURORA_MIGRATION_DRAIN_MS_).toISOString():null,
      drain_ready:auroraMigrationDrainReady_()};
    console.log(JSON.stringify(result));return result;
  }finally{lock.releaseLock();}
}
function auroraMigrationKeyDigest_(key) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,key,Utilities.Charset.UTF_8)
    .map(function(byte){return ('0'+((byte+256)%256).toString(16)).slice(-2);}).join('');
}
function auroraMigrationVerifyResult_(ok,code) {
  var allowed=['server_key_missing_or_invalid','connection_unavailable','connection_invalid_response','supabase_connection_verified'];
  if(allowed.indexOf(code)<0)code='connection_unavailable';
  console.log(code);return {ok:ok===true,code:code};
}
/** Verifies only the isolated operational RPC. No business data read/write. */
function verifySupabaseConnection() {
  auroraMigrationOwner_();var props=PropertiesService.getScriptProperties();
  var key=String(props.getProperty('AURORA_SUPABASE_SERVICE_KEY')||'');
  if(!/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(key)&&!/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key))return auroraMigrationVerifyResult_(false,'server_key_missing_or_invalid');
  var headers={apikey:key};if(/^eyJ/.test(key))headers.Authorization='Bearer '+key;
  var slot=new Date(Math.floor(Date.now()/(6*3600000))*(6*3600000)).toISOString();
  try{
    var response=UrlFetchApp.fetch('https://dtvefwpaxwffxglqbfoo.supabase.co/rest/v1/rpc/aurora_operational_heartbeat',{
      method:'post',contentType:'application/json',headers:headers,
      payload:JSON.stringify({p_slot:slot,p_request_id:Utilities.getUuid()}),muteHttpExceptions:true,
      followRedirects:false,validateHttpsCertificates:true
    });
    var status=response.getResponseCode(),body=response.getContentText();
    if(status<200||status>=300||body.length>4096)return auroraMigrationVerifyResult_(false,'connection_unavailable');
    var result=JSON.parse(body);
    if(!result||result.ok!==true||typeof result.applied!=='boolean'||typeof result.checked_at!=='string'||!Number.isFinite(Date.parse(result.checked_at)))return auroraMigrationVerifyResult_(false,'connection_invalid_response');
    props.setProperty(AURORA_MIGRATION_VERIFIED_PROP_,JSON.stringify({project_ref:'dtvefwpaxwffxglqbfoo',key_sha256:auroraMigrationKeyDigest_(key),verified_at:new Date().toISOString()}));
    return auroraMigrationVerifyResult_(true,'supabase_connection_verified');
  }catch(_){return auroraMigrationVerifyResult_(false,'connection_unavailable');}
}
function auroraMigrationConnectionVerified_() {
  var props=PropertiesService.getScriptProperties(),record;
  try{record=JSON.parse(props.getProperty(AURORA_MIGRATION_VERIFIED_PROP_)||'null');}catch(_){return false;}
  var key=String(props.getProperty('AURORA_SUPABASE_SERVICE_KEY')||'');
  if(!record||record.project_ref!=='dtvefwpaxwffxglqbfoo'||!auroraMigrationIso_(record.verified_at)||!key)return false;
  var elapsed=Date.now()-Date.parse(record.verified_at);
  return elapsed>=0&&elapsed<=24*3600000&&record.key_sha256===auroraMigrationKeyDigest_(key);
}
function auroraMigrationUnfreeze_(cancel) {
  auroraMigrationOwner_();var lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))throw new Error('An update is running. Retry ending the freeze.');
  try{
    var props=PropertiesService.getScriptProperties(),status=auroraMigrationStatus_(),backend=auroraMigrationBackend_();
    if(!cancel&&backend!=='supabase')throw new Error('Select the verified Supabase backend before completing migration. Use cancellation to keep the original source.');
    if(status.writes_frozen){
      var source=props.getProperty(AURORA_MIGRATION_SOURCE_PROP_);
      if(cancel&&(['google_sheets','supabase'].indexOf(source)<0||source!==backend))throw new Error('Cancellation requires the valid recorded original backend to remain selected. No database authority was changed.');
      if(!cancel&&!auroraMigrationDrainReady_())throw new Error('Keep writes frozen until at least seven minutes after the valid freeze timestamp.');
      if(!cancel&&!auroraMigrationConnectionVerified_())throw new Error('Verify the current private Supabase connection before reopening writes.');
      if(!cancel){
        // The operational RPC proves the key, not business-store promotion.
        // Require a real snapshot AND post-drain source provenance. A morning
        // staging import cannot silently become the final live database.
        try{
          auroraSupabaseBegin_();
          var revision=auroraSupabaseContext_().revision;
          var final=auroraSupabaseRpc_('aurora_runtime_cutover_status',{p_project_ref:'dtvefwpaxwffxglqbfoo'});
          var exported=final&&auroraMigrationIso_(final.source_exported_at)?Date.parse(final.source_exported_at):NaN;
          if(!final||final.project_ref!=='dtvefwpaxwffxglqbfoo'||final.promoted!==true||typeof final.source_sha256!=='string'||
             !/^[a-f0-9]{64}$/.test(final.source_sha256)||final.run_id!=='sheet_'+final.source_sha256.slice(0,32)||
             String(final.revision)!==revision||!Number.isFinite(exported)||exported<Date.parse(status.frozen_at)+AURORA_MIGRATION_DRAIN_MS_||exported>Date.now()+60000)
            throw new Error('The final promoted source must match this freeze and be exported after its seven-minute drain.');
        }finally{auroraSupabaseDiscard_();}
      }
    }
    props.deleteProperty(AURORA_MIGRATION_FROZEN_PROP_);props.deleteProperty(AURORA_MIGRATION_SOURCE_PROP_);
    auroraMigrationClearCache_();
    console.log(cancel?'migration_freeze_cancelled':'migration_freeze_ended');
    return {ok:true,writes_frozen:false,frozen_at:null};
  }finally{lock.releaseLock();}
}
function cancelMigrationFreeze() { return auroraMigrationUnfreeze_(true); }
function endMigrationFreeze() { return auroraMigrationUnfreeze_(false); }
