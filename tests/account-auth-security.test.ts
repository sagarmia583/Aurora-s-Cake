import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash, randomUUID } from 'node:crypto';
import { signOutStaffPassword } from '../src/services/sheetStaffApi';

const customerToken='12345678-1234-4234-8234-123456789abc'.repeat(2);
const staffToken='23456789-1234-4234-8234-123456789abc'.repeat(2);
const password='fixture-password-long',replacement='replacement-password-long';
function harness(){
  let now=Date.parse('2026-10-30T12:00:00.000Z'),revision=1,locked=false,hashChecks=0,conflict=false,lostAck=false;
  let onLock:(()=>void)|undefined;
  const tables:Record<string,{headers:string[];rows:{sheet_row:number;cells:unknown[]}[]}>={},commits=new Map<string,any>();
  const changes:any[][]=[],cache=new Map<string,string>();
  class Clock extends Date{constructor(value?:string|number){super(value??now);}static now(){return now;}}
  const props:Record<string,string>={AURORA_DATABASE_BACKEND:'supabase',AURORA_SUPABASE_SERVICE_KEY:'sb_secret_'+'fixture-secret-'.repeat(4),AURORA_STAFF_USERS:'{}'};
  const ctx:any={Date:Clock,JSON,Object,Array,String,Number,Math,isFinite,isNaN,console:{error(){},warn(){},log(){}},
    Utilities:{getUuid:randomUUID,DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_:string,text:string)=>Array.from(createHash('sha256').update(text).digest())},
    PropertiesService:{getScriptProperties:()=>({getProperty:(key:string)=>props[key]??null})},
    LockService:{getScriptLock:()=>({tryLock:()=>{if(locked)return false;locked=true;const hook=onLock;onLock=undefined;hook?.();return true;},releaseLock:()=>{assert.equal(locked,true);locked=false;}})},
    CacheService:{getScriptCache:()=>({get:(key:string)=>cache.get(key)??null,put:(key:string,value:string)=>cache.set(key,value),remove:(key:string)=>cache.delete(key)})},
    ContentService:{MimeType:{JSON:'json',JAVASCRIPT:'js'},createTextOutput:(content:string)=>({content,setMimeType(){return this;}})},
    SpreadsheetApp:{openById:()=>{throw new Error('Active database must not fall back to Sheets');}},
    UrlFetchApp:{fetch:(url:string,options:any)=>{
      const input=JSON.parse(options.payload);assert.equal(input.p_project_ref,'dtvefwpaxwffxglqbfoo');
      const response=(status:number,value:any)=>({getResponseCode:()=>status,getContentText:()=>JSON.stringify(value)});
      if(url.endsWith('aurora_runtime_snapshot'))return response(200,{project_ref:input.p_project_ref,revision:String(revision),tables:structuredClone(tables)});
      assert.ok(url.endsWith('aurora_runtime_commit'));const prior=commits.get(input.p_operation_id);
      if(prior){assert.equal(prior.payload,JSON.stringify(input));return response(200,prior.reply);}
      if(conflict){conflict=false;revision++;}
      if(input.p_expected_revision!==String(revision))return response(409,{code:'40001',message:'revision_conflict'});
      changes.push(structuredClone(input.p_changes));
      for(const change of input.p_changes){const table=tables[change.table],at=table.rows.findIndex(row=>row.sheet_row===change.row),row={sheet_row:change.row,cells:change.cells};if(at<0)table.rows.push(row);else table.rows[at]=row;}
      revision++;const reply={ok:true,revision:String(revision)};commits.set(input.p_operation_id,{payload:JSON.stringify(input),reply});
      if(lostAck){lostAck=false;throw new Error('Simulated acknowledgement lost after commit');}return response(200,reply);
    }}
  };
  vm.createContext(ctx);for(const file of ['Code.gs','StaffOperations.gs','AccountAuth.gs','SupabaseStore.gs'])vm.runInContext(fs.readFileSync(new URL('../apps-script/'+file,import.meta.url),'utf8'),ctx);
  const seed=(name:string,records:Record<string,unknown>[])=>{const headers=[...ctx.PRIVATE_ORDER_SCHEMAS[name]];tables[name]={headers,rows:records.map((record,index)=>({sheet_row:index+2,cells:headers.map(key=>record[key]??'')}))};};
  seed('customer_accounts',[{id:'customer_fixture',phone:'01700000000',name:'Fixture customer',address:'Original address',email:'fixture@example.test',active:true,password_salt:'fixture-salt',password_hash:ctx.auroraAccountHash_(password,'fixture-salt'),failed_attempts:0,locked_until:0,created_at:new Clock().toISOString(),updated_at:new Clock().toISOString()}]);
  seed('staff_accounts',[{id:'staff_fixture',username:'fixture_rider',name:'Fixture rider',role:'delivery_man',active:true,password_salt:'fixture-salt',password_hash:ctx.auroraAccountHash_(password,'fixture-salt')}]);
  seed('auth_sessions',[
    {token_hash:ctx.auroraAccountDigest_(customerToken),account_type:'customer',account_id:'customer_fixture',created_at:new Clock().toISOString(),expires_at:new Clock(now+7*86400000).toISOString(),revoked:false},
    {token_hash:ctx.auroraAccountDigest_(staffToken),account_type:'staff',account_id:'staff_fixture',created_at:new Clock().toISOString(),expires_at:new Clock(now+12*3600000).toISOString(),revoked:false}
  ]);
  const originalHash=ctx.auroraAccountHash_;ctx.auroraAccountHash_=(value:string,salt:string)=>{hashChecks++;return originalHash(value,salt);};
  const post=(payload:Record<string,unknown>)=>JSON.parse(ctx.doPost({postData:{type:'text/plain',contents:JSON.stringify(payload)}}).content);
  const record=(name:string,index=0)=>Object.fromEntries(tables[name].headers.map((key,column)=>[key,tables[name].rows[index].cells[column]]));
  const mutate=(name:string,key:string,value:unknown,index=0)=>{tables[name].rows[index].cells[tables[name].headers.indexOf(key)]=value;revision++;};
  return {ctx,post,record,mutate,changes,tables,onLock:(fn:()=>void)=>{onLock=fn;},advance:(ms:number)=>{now+=ms;},conflict:()=>{conflict=true;},loseAck:()=>{lostAck=true;},get hashes(){return hashChecks;},get locked(){return locked;},get revision(){return revision;}};
}

test('staff logout durably revokes a retained token and retrying a lost acknowledgement is idempotent',()=>{
  const h=harness();assert.equal(h.post({action:'staff_session',auth_token:staffToken}).ok,true);h.loseAck();
  assert.deepEqual(h.post({action:'staff_password_logout',auth_token:staffToken}),{ok:true,revoked:true});
  assert.equal(h.record('auth_sessions',1).revoked,true);assert.equal(h.record('auth_sessions').revoked,false);
  assert.equal(h.post({action:'staff_session',auth_token:staffToken}).code,'unauthorized');
  const revision=h.revision;assert.deepEqual(h.post({action:'staff_password_logout',auth_token:staffToken}),{ok:true,revoked:true});assert.equal(h.revision,revision);
  assert.equal(h.post({action:'staff_password_logout',auth_token:'not-a-token'}).code,'unauthorized');
});
test('a conflicted logout never claims revocation and a retry confirms the final unusable token',()=>{
  const h=harness();h.conflict();const failed=h.post({action:'staff_password_logout',auth_token:staffToken});
  assert.equal(failed.ok,false);assert.equal(failed.code,'submission_uncertain');assert.equal(failed.revoked,undefined);assert.equal(h.record('auth_sessions',1).revoked,false);
  assert.equal(h.post({action:'staff_password_logout',auth_token:staffToken}).revoked,true);assert.equal(h.post({action:'staff_session',auth_token:staffToken}).code,'unauthorized');
});
test('current password change and closure share five-attempt lockout, including malformed inputs',()=>{
  const h=harness();for(let attempt=0;attempt<5;attempt++){
    const reply=h.post({action:attempt%2?'customer_phone_close':'customer_phone_password',auth_token:customerToken,current_password:attempt===0?null:'incorrect-password',new_password:replacement});
    assert.equal(reply.code,'invalid_credentials');assert.equal(h.record('customer_accounts').failed_attempts,attempt<4?attempt+1:0);
  }
  const afterFive=h.hashes;assert.equal(afterFive,4,'malformed input counts without expensive hashing');assert.ok(Number(h.record('customer_accounts').locked_until)>Date.parse('2026-10-30T12:00:00Z'));
  for(let attempt=0;attempt<3;attempt++)assert.equal(h.post({action:'customer_phone_password',auth_token:customerToken,current_password:password,new_password:replacement}).code,'too_many_attempts');
  assert.equal(h.hashes,afterFive);assert.equal(h.record('customer_accounts').active,true);assert.equal(h.record('auth_sessions').revoked,false);
  assert.equal(h.changes.length,5);assert.ok(h.changes.every(delta=>delta.length===1&&delta[0].table==='customer_accounts'),'failure checkpoint must not commit unrelated rows');assert.equal(h.locked,false);
});
test('an existing future lockout blocks current-password hashing and ordinary login consistently',()=>{
  const h=harness();h.mutate('customer_accounts','locked_until',Date.parse('2026-10-30T12:15:00Z'));
  assert.equal(h.post({action:'customer_phone_password',auth_token:customerToken,current_password:password,new_password:replacement}).code,'too_many_attempts');
  assert.equal(h.post({action:'customer_phone_login',phone:'01700000000',password}).code,'too_many_attempts');assert.equal(h.hashes,0);assert.equal(h.changes.length,0);
});
test('password update reauthenticates after the lock and rejects a session revoked while waiting',()=>{
  const h=harness();h.onLock(()=>h.mutate('auth_sessions','revoked',true));
  const result=h.post({action:'customer_phone_password',auth_token:customerToken,current_password:password,new_password:replacement});
  assert.equal(result.code,'unauthorized');assert.equal(h.hashes,0);assert.equal(h.changes.length,0);assert.equal(h.locked,false);
});
test('fresh lockout counters are read under the lock rather than overwritten from a stale request snapshot',()=>{
  const h=harness();h.onLock(()=>h.mutate('customer_accounts','failed_attempts',4));
  assert.equal(h.post({action:'customer_phone_password',auth_token:customerToken,current_password:'incorrect-password',new_password:replacement}).code,'invalid_credentials');
  assert.equal(h.record('customer_accounts').failed_attempts,0);assert.ok(Number(h.record('customer_accounts').locked_until)>Date.parse('2026-10-30T12:00:00Z'));
});
test('password change after lockout expiry atomically resets counters, revokes old devices and starts one replacement session',()=>{
  const h=harness();h.mutate('customer_accounts','locked_until',Date.parse('2026-10-30T12:15:00Z'));h.advance(15*60000+1);
  h.mutate('auth_sessions','revoked','false');const result=h.post({action:'customer_phone_password',auth_token:customerToken,current_password:password,new_password:replacement});
  assert.equal(result.ok,true);assert.match(result.auth_token,/^[a-f0-9-]{72}$/i);assert.equal(h.record('auth_sessions').revoked,true);assert.equal(h.tables.auth_sessions.rows.length,3);
  assert.equal(h.post({action:'customer_phone_session',auth_token:customerToken}).code,'unauthorized');assert.equal(h.post({action:'customer_phone_session',auth_token:result.auth_token}).ok,true);
  assert.equal(h.record('customer_accounts').locked_until,0);assert.equal(h.record('customer_accounts').failed_attempts,0);assert.equal(h.changes.length,1);assert.equal(h.changes[0].length,3);
});
test('an invalid replacement password does not commit counter resets, password changes or session revocations',()=>{
  const h=harness();h.mutate('customer_accounts','failed_attempts',2);const before=h.record('customer_accounts');
  const result=h.post({action:'customer_phone_password',auth_token:customerToken,current_password:password,new_password:'short'});
  assert.equal(result.code,'invalid_password');assert.deepEqual(h.record('customer_accounts'),before);assert.equal(h.changes.length,0);assert.equal(h.record('auth_sessions').revoked,false);
});
test('a failed security-counter commit is uncertain rather than falsely acknowledging an uncounted rejection',()=>{
  const h=harness();h.conflict();const result=h.post({action:'customer_phone_password',auth_token:customerToken,current_password:'incorrect-password',new_password:replacement});
  assert.equal(result.code,'submission_uncertain');assert.equal('persisted' in result,false);assert.equal(h.record('customer_accounts').failed_attempts,0);assert.equal(h.record('auth_sessions').revoked,false);
});
test('a password failure checkpoint refuses to commit unrelated staged changes',()=>{
  const h=harness();h.ctx.auroraSupabaseBegin_();const book=h.ctx.auroraSpreadsheet_(),accounts=h.ctx.auroraPrivateTable_(book,'customer_accounts');
  book.getSheetByName('customer_accounts').getRange(2,accounts.headers.indexOf('address')+1).setValues([['Unrelated pending edit']]);
  assert.throws(()=>h.ctx.auroraAccountVerifyPassword_(accounts,accounts.rows[0],'incorrect-password'),/fresh account transaction/);
  h.ctx.auroraSupabaseDiscard_();assert.equal(h.changes.length,0);assert.equal(h.record('customer_accounts').address,'Original address');assert.equal(h.record('customer_accounts').failed_attempts,0);
});
test('staff logout transport requires an explicit server revocation acknowledgement',async t=>{
  const endpoint='https://script.google.com/macros/s/FIXTURE/exec';
  let mode='confirmed';const requests:any[]=[];
  t.mock.method(globalThis,'fetch',async(_url:unknown,options:RequestInit)=>{requests.push(JSON.parse(String(options.body)));if(mode==='lost')throw new Error('Lost acknowledgement');return new Response(JSON.stringify(mode==='confirmed'?{ok:true,revoked:true}:{ok:true}),{status:200});});
  await signOutStaffPassword(endpoint,staffToken);assert.deepEqual(requests,[{action:'staff_password_logout',auth_token:staffToken}]);
  mode='missing';await assert.rejects(()=>signOutStaffPassword(endpoint,staffToken),/not confirmed/);mode='lost';await assert.rejects(()=>signOutStaffPassword(endpoint,staffToken),/Lost acknowledgement/);
  const count=requests.length;await assert.rejects(()=>signOutStaffPassword(endpoint,'header.payload.signature'),/valid employee session/);assert.equal(requests.length,count);
});
