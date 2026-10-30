import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash, randomUUID } from 'node:crypto';

const owner='owner@example.test',origin='https://dtvefwpaxwffxglqbfoo.supabase.co';
function harness(){
  let now=Date.parse('2026-10-30T12:23:45.000Z'),active=owner,effective=owner,locked=false;
  let heartbeatStatus=200,heartbeatBody:any=null,runtimeReady=true,freezeOnLock=false,cacheValue:string|null=null,exportedAt:string|null=null;
  const props:Record<string,string>={AURORA_CAMPAIGN_OWNER_EMAIL:owner,AURORA_SUPABASE_SERVICE_KEY:'sb_secret_'+'PRIVATE_FIXTURE_'.repeat(4),AURORA_CAMPAIGN_WORKER_ID:'installed_worker'};
  const effects={sheet:0,drive:0,locks:0,mail:0,triggerDeletes:0},requests:{url:string;options:any}[]=[],removed:string[]=[],logs:string[]=[];
  const properties={getProperty:(key:string)=>props[key]??null,setProperty:(key:string,value:string)=>{props[key]=value;return properties;},deleteProperty:(key:string)=>{delete props[key];return properties;}};
  class FixtureDate extends Date{constructor(value?:string|number){super(value??now);}static now(){return now;}}
  const ctx:any={console:{log(value:unknown){logs.push(String(value));},error(){},warn(){}},Date:FixtureDate,JSON,Object,Array,String,Number,Math,
    Session:{getActiveUser:()=>({getEmail:()=>active}),getEffectiveUser:()=>({getEmail:()=>effective})},
    PropertiesService:{getScriptProperties:()=>properties},
    LockService:{getScriptLock:()=>({tryLock:()=>{effects.locks++;if(locked)return false;locked=true;if(freezeOnLock)props.AURORA_MIGRATION_FROZEN_AT=new FixtureDate().toISOString();return true;},releaseLock:()=>{assert.equal(locked,true);locked=false;}})},
    CacheService:{getScriptCache:()=>({get:()=>cacheValue,put:()=>{},remove:(key:string)=>removed.push(key)})},
    SpreadsheetApp:{openById:()=>{effects.sheet++;throw new Error('Unexpected Sheet access');},getActiveSpreadsheet:()=>{effects.sheet++;throw new Error('Unexpected Sheet access');}},
    DriveApp:{createFolder:()=>{effects.drive++;throw new Error('Unexpected Drive write');}},
    MailApp:{getRemainingDailyQuota:()=>100,sendEmail:()=>{effects.mail++;}},
    ScriptApp:{getProjectTriggers:()=>[{getHandlerFunction:()=> 'auroraCampaignTick'}],deleteTrigger:()=>{effects.triggerDeletes++;}},
    Utilities:{getUuid:randomUUID,DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_:string,value:string)=>Array.from(createHash('sha256').update(value).digest())},
    ContentService:{MimeType:{JSON:'json',JAVASCRIPT:'js'},createTextOutput:(content:string)=>({content,setMimeType(){return this;}})},
    UrlFetchApp:{fetch:(url:string,options:any)=>{
      requests.push({url,options});const response=(status:number,value:any)=>({getResponseCode:()=>status,getContentText:()=>JSON.stringify(value)});
      if(url.endsWith('/aurora_operational_heartbeat'))return response(heartbeatStatus,heartbeatBody??{ok:true,applied:true,checked_at:'2026-10-30T12:23:45.123456+00:00'});
      if(url.endsWith('/aurora_runtime_cutover_status'))return response(200,{project_ref:'dtvefwpaxwffxglqbfoo',promoted:runtimeReady,run_id:'sheet_'+'a'.repeat(32),source_sha256:'a'.repeat(64),source_exported_at:exportedAt??new FixtureDate().toISOString(),revision:'1'});
      assert.equal(url,origin+'/rest/v1/rpc/aurora_runtime_snapshot');
      return runtimeReady?response(200,{project_ref:'dtvefwpaxwffxglqbfoo',revision:'1',tables:{settings:{headers:['key','value'],rows:[]}}}):response(400,{message:'runtime_not_promoted'});
    }}
  };
  vm.createContext(ctx);
  for(const file of ['Code.gs','StaffOperations.gs','AccountAuth.gs','CustomerMaster.gs','PublicImages.gs','Campaigns.gs','SupabaseStore.gs','MigrationControl.gs'])vm.runInContext(fs.readFileSync(new URL('../apps-script/'+file,import.meta.url),'utf8'),ctx);
  const post=(payload:any)=>JSON.parse(ctx.doPost({postData:{type:'text/plain',contents:JSON.stringify(payload)}}).content);
  const health=()=>JSON.parse(ctx.doGet({parameter:{action:'health'}}).content);
  return {ctx,props,effects,requests,removed,logs,post,health,
    advance:(ms:number)=>{now+=ms;},identity:(a:string,e=a)=>{active=a;effective=e;},
    heartbeat:(status:number,body:any)=>{heartbeatStatus=status;heartbeatBody=body;},runtime:(ready:boolean)=>{runtimeReady=ready;},
    exportedAt:(value:string)=>{exportedAt=value;},
    freezeOnLock:()=>{freezeOnLock=true;},cache:(value:any)=>{cacheValue=JSON.stringify(value);},get locked(){return locked;}};
}
const plain=(value:any)=>JSON.parse(JSON.stringify(value));

test('owner freeze is off by default, idempotent, observable and drains for seven minutes without changing authority',()=>{
  const h=harness();assert.deepEqual(plain(h.ctx.auroraMigrationStatus_()),{writes_frozen:false,frozen_at:null});
  const first=h.ctx.beginMigrationFreeze();assert.equal(first.writes_frozen,true);assert.equal(first.frozen_at,'2026-10-30T12:23:45.000Z');assert.equal(first.drain_until,'2026-10-30T12:30:45.000Z');
  h.advance(3*60000);assert.equal(h.ctx.beginMigrationFreeze().frozen_at,first.frozen_at);assert.equal(h.ctx.auroraMigrationDrainReady_(),false);
  h.advance(4*60000);assert.equal(h.ctx.auroraMigrationDrainReady_(),true);
  assert.equal(h.props.AURORA_DATABASE_BACKEND,undefined);assert.equal(h.props.AURORA_CAMPAIGN_WORKER_ID,'installed_worker');
  const health=h.health();assert.equal(health.ok,true);assert.equal(health.writes_frozen,true);assert.equal(health.frozen_at,first.frozen_at);assert.equal(health.database_backend,'google_sheets');
  assert.ok(h.removed.some(key=>key.includes('_sheets_')));assert.ok(h.removed.some(key=>key.includes('_supabase_')));assert.equal(h.requests.length,0);assert.equal(h.locked,false);
});
test('every new POST, including an ambiguous checkout retry and email form, is blocked before database access',()=>{
  const h=harness();h.ctx.beginMigrationFreeze();h.props.AURORA_DATABASE_BACKEND='supabase';h.runtime(false);
  for(const action of ['create_order','customer_phone_login','customer_phone_logout','staff_mutate','staff_image_upload','customer_email_unsubscribe']){
    const reply=h.post({action,request_id:'same-possibly-persisted-request'});assert.equal(reply.code,'migration_frozen');assert.equal(reply.retryable,true);assert.equal('persisted' in reply,false);
  }
  const form=JSON.parse(h.ctx.doPost({parameter:{action:'email_confirm',token:'existing-link'},postData:{type:'application/x-www-form-urlencoded',contents:''}}).content);
  assert.equal(form.code,'migration_frozen');assert.equal(h.requests.length,0);assert.equal(h.effects.sheet,0);assert.equal(h.effects.drive,0);assert.equal(h.effects.mail,0);
});
test('frozen public content remains readable and disables checkout even in a pre-freeze cached payload',()=>{
  const h=harness();h.cache({ok:true,data:{order_submission_enabled:true,products:[],settings:{shop_name:'Fixture'}}});h.ctx.beginMigrationFreeze();
  const reply=JSON.parse(h.ctx.doGet({parameter:{action:'public'}}).content);assert.equal(reply.ok,true);assert.equal(reply.data.order_submission_enabled,false);assert.equal(reply.data.settings.shop_name,'Fixture');assert.equal(h.effects.sheet,0);
});
test('corrupt and future freeze metadata fail closed without echoing raw values; original-source cancellation recovers',()=>{
  const h=harness();h.props.AURORA_MIGRATION_FROZEN_AT='accidentally-pasted-private-value';
  h.props.AURORA_MIGRATION_SOURCE_BACKEND='google_sheets';
  assert.deepEqual(plain(h.ctx.auroraMigrationStatus_()),{writes_frozen:true,frozen_at:null});assert.equal(h.ctx.auroraMigrationDrainReady_(),false);
  assert.equal(h.ctx.beginMigrationFreeze().frozen_at,null);assert.equal(h.props.AURORA_MIGRATION_FROZEN_AT,'accidentally-pasted-private-value');
  assert.equal(JSON.stringify(h.health()).includes('accidentally-pasted'),false);assert.throws(()=>h.ctx.endMigrationFreeze(),/Select/);
  h.props.AURORA_MIGRATION_FROZEN_AT='2026-10-31T12:23:45.000Z';assert.equal(h.ctx.auroraMigrationDrainReady_(),false);
  assert.equal(h.ctx.cancelMigrationFreeze().writes_frozen,false);assert.equal(h.props.AURORA_DATABASE_BACKEND,undefined);assert.equal(h.health().writes_frozen,false);
});
test('anonymous, different-account and non-owner editor calls cannot freeze, unfreeze or verify credentials',()=>{
  for(const method of ['beginMigrationFreeze','cancelMigrationFreeze','endMigrationFreeze','verifySupabaseConnection']){
    for(const identity of [['',owner],['other@example.test',owner],['other@example.test','other@example.test']]){
      const h=harness();h.identity(identity[0],identity[1]);assert.throws(()=>h.ctx[method]());assert.equal(h.props.AURORA_MIGRATION_FROZEN_AT,undefined);assert.equal(h.requests.length,0);assert.equal(h.effects.locks,0);
    }
  }
});
test('operational key verification uses a real pinned six-hour slot and returns only safe status',()=>{
  const h=harness();const before={...h.props};assert.deepEqual(plain(h.ctx.verifySupabaseConnection()),{ok:true,code:'supabase_connection_verified'});
  assert.equal(h.requests.length,1);const request=h.requests[0],payload=JSON.parse(request.options.payload);
  assert.equal(request.url,origin+'/rest/v1/rpc/aurora_operational_heartbeat');assert.equal(payload.p_slot,'2026-10-30T12:00:00.000Z');assert.match(payload.p_request_id,/^[a-f0-9-]{36}$/i);assert.equal(request.options.followRedirects,false);assert.equal('Authorization' in request.options.headers,false);
  assert.equal(h.props.AURORA_DATABASE_BACKEND,before.AURORA_DATABASE_BACKEND);assert.equal(h.props.AURORA_MIGRATION_FROZEN_AT,undefined);
  h.heartbeat(403,{message:'PRIVATE server response '+h.props.AURORA_SUPABASE_SERVICE_KEY});assert.deepEqual(plain(h.ctx.verifySupabaseConnection()),{ok:false,code:'connection_unavailable'});
  assert.deepEqual(h.logs,['supabase_connection_verified','connection_unavailable']);assert.equal(h.logs.join(' ').includes(h.props.AURORA_SUPABASE_SERVICE_KEY),false);
  assert.equal(h.requests.every(r=>!r.url.includes('runtime_snapshot')),true);
});
test('Supabase unfreeze requires drain, current-key verification and a promoted runtime without selecting or promoting it',()=>{
  const h=harness();h.ctx.beginMigrationFreeze();h.props.AURORA_DATABASE_BACKEND='supabase';
  assert.throws(()=>h.ctx.endMigrationFreeze(),/seven minutes/);h.advance(7*60000);assert.throws(()=>h.ctx.endMigrationFreeze(),/Verify/);
  h.ctx.verifySupabaseConnection();h.runtime(false);assert.throws(()=>h.ctx.endMigrationFreeze(),/Private database/);assert.equal(h.props.AURORA_MIGRATION_FROZEN_AT,'2026-10-30T12:23:45.000Z');
  const failedHealth=h.health();assert.equal(failedHealth.ok,false);assert.equal(failedHealth.writes_frozen,true);assert.equal(failedHealth.database_backend,undefined);
  h.runtime(true);h.props.AURORA_SUPABASE_SERVICE_KEY+='ROTATED';assert.throws(()=>h.ctx.endMigrationFreeze(),/Verify/);h.ctx.verifySupabaseConnection();
  h.exportedAt('2026-10-30T12:23:45.000Z');assert.throws(()=>h.ctx.endMigrationFreeze(),/final promoted source/);
  h.exportedAt('2026-10-31T12:30:45.000Z');assert.throws(()=>h.ctx.endMigrationFreeze(),/final promoted source/);
  h.exportedAt('2026-10-30T12:30:45.000Z');
  assert.equal(h.ctx.endMigrationFreeze().writes_frozen,false);assert.equal(h.props.AURORA_DATABASE_BACKEND,'supabase');assert.equal(h.health().database_backend,'supabase');
  assert.equal(h.requests.some(r=>r.url.includes('promote')||r.url.includes('commit')),false);
});
test('cancellation cannot change authority or guess a missing/corrupt recorded source',()=>{
  const h=harness();h.ctx.beginMigrationFreeze();h.props.AURORA_DATABASE_BACKEND='supabase';
  assert.throws(()=>h.ctx.cancelMigrationFreeze(),/recorded original backend/);assert.equal(h.props.AURORA_DATABASE_BACKEND,'supabase');
  h.props.AURORA_DATABASE_BACKEND='google_sheets';delete h.props.AURORA_MIGRATION_SOURCE_BACKEND;assert.throws(()=>h.ctx.cancelMigrationFreeze(),/recorded original backend/);
  h.props.AURORA_MIGRATION_SOURCE_BACKEND='wrong-source';assert.throws(()=>h.ctx.cancelMigrationFreeze(),/recorded original backend/);
  assert.equal(h.ctx.auroraMigrationFrozen_(),true);
});
test('frozen campaign runs/ticks and owner mutations leave queues and installed triggers intact',()=>{
  const h=harness();h.ctx.beginMigrationFreeze();
  assert.deepEqual(plain(h.ctx.auroraCampaignRun_()),{processed:0,migration_frozen:true});assert.deepEqual(plain(h.ctx.auroraCampaignTick({triggerUid:'installed_worker'})),{processed:0,migration_frozen:true});
  for(const method of ['setupSheetDatabase','setupAuroraOwnerOnce','setupAuroraImagesOnce','backfillCustomerMasterOnce','setupCampaignTools','auroraNewCampaignDraft','auroraPreviewCampaign','auroraConfirmCampaign','auroraResumeCampaigns'])assert.throws(()=>h.ctx[method](),(e:any)=>e.code==='migration_frozen');
  assert.equal(h.effects.triggerDeletes,0);assert.equal(h.props.AURORA_CAMPAIGN_WORKER_ID,'installed_worker');assert.equal(h.props.AURORA_CAMPAIGN_WORKER_LEASE,undefined);assert.equal(h.requests.length,0);assert.equal(h.effects.mail,0);assert.equal(h.effects.sheet,0);
});
test('a campaign that waited for the lock rechecks the freeze before acquiring a lease or claiming work',()=>{
  const h=harness();h.freezeOnLock();assert.deepEqual(plain(h.ctx.auroraCampaignRun_()),{processed:0,migration_frozen:true});assert.equal(h.locked,false);assert.equal(h.props.AURORA_CAMPAIGN_WORKER_LEASE,undefined);assert.equal(h.effects.triggerDeletes,0);assert.equal(h.effects.mail,0);assert.equal(h.effects.sheet,0);
});
