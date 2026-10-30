import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash, createHmac, randomUUID } from 'node:crypto';

const source=fs.readFileSync(new URL('../apps-script/SupabaseStore.gs',import.meta.url),'utf8');
const pin='dtvefwpaxwffxglqbfoo';
function backend(){
  let revision=1, lostAcks=0;
  const state:any={settings:{headers:['key','value'],rows:[{sheet_row:2,cells:['accepting_orders',true]}]},
    orders:{headers:['id','receipt_json','customer_email'],rows:[{sheet_row:2,cells:['ord_original','{"id":"ord_original"}','private@example.test']}]},
    customer_accounts:{headers:['id','phone','failed_attempts','locked_until','permissions'],rows:[{sheet_row:2,cells:['customer_original','01700000000',0,0,'preserve-owner-column']}]}};
  const commits=new Map<string,{payload:string;result:any}>(),calls:any[]=[];
  function rpc(name:string,payload:any){
    calls.push({name,payload:structuredClone(payload)});
    assert.equal(payload.p_project_ref,pin);
    if(name==='aurora_runtime_snapshot')return {project_ref:pin,revision:String(revision),tables:structuredClone(state)};
    assert.equal(name,'aurora_runtime_commit');
    const canonical=JSON.stringify(payload),old=commits.get(payload.p_operation_id);
    if(old){assert.equal(old.payload,canonical);return old.result;}
    if(payload.p_expected_revision!==String(revision))throw {status:409,body:{code:'40001',message:'revision_conflict'}};
    const next=structuredClone(state);
    for(const change of payload.p_changes){
      const table=next[change.table];assert.ok(table);const at=table.rows.findIndex((r:any)=>r.sheet_row===change.row);
      const entry={sheet_row:change.row,cells:structuredClone(change.cells)};
      if(at<0)table.rows.push(entry);else table.rows[at]=entry;
    }
    for(const key of Object.keys(state))state[key]=next[key];revision++;
    const result={ok:true,revision:String(revision),replayed:false};commits.set(payload.p_operation_id,{payload:canonical,result});
    if(lostAcks>0){lostAcks--;throw new Error('lost acknowledgement');}return result;
  }
  return {rpc,calls,state,loseAck:()=>{lostAcks++;},externalChange:(fn:(s:any)=>void)=>{fn(state);revision++;},get revision(){return revision;}};
}
function harness(server=backend(),enabled=true){
  const props:Record<string,string>={AURORA_SUPABASE_SERVICE_KEY:'sb_secret_'+'private-fixture'.repeat(4),...(enabled?{AURORA_DATABASE_BACKEND:'supabase'}:{})};
  let nativeFlush=0;
  const ctx:any={console,PropertiesService:{getScriptProperties:()=>({getProperty:(k:string)=>props[k]??null})},
    Utilities:{getUuid:randomUUID},auroraConfiguredId_:()=> 'source_sheet',SpreadsheetApp:{flush:()=>{nativeFlush++;}},
    UrlFetchApp:{fetch:(url:string,options:any)=>{
      assert.ok(url.startsWith('https://'+pin+'.supabase.co/rest/v1/rpc/'));
      assert.equal(options.followRedirects,false);assert.equal(options.headers.apikey,props.AURORA_SUPABASE_SERVICE_KEY);
      assert.equal('Authorization' in options.headers,false);
      try {const body=server.rpc(url.split('/').at(-1)!,JSON.parse(options.payload));return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(body)};}
      catch(error:any){if(!error.status)throw error;return {getResponseCode:()=>error.status,getContentText:()=>JSON.stringify(error.body)};}
    }}};
  vm.createContext(ctx);vm.runInContext(source,ctx);
  return {ctx,server,props,get nativeFlush(){return nativeFlush;}};
}
const plain=(value:any)=>JSON.parse(JSON.stringify(value));

test('store is off by default and neither loads data nor intercepts native flush',()=>{
  const h=harness(undefined,false);assert.equal(h.ctx.auroraSupabaseBegin_(),false);
  h.ctx.auroraPersistenceFlush_();assert.equal(h.nativeFlush,1);assert.equal(h.server.calls.length,0);
  assert.throws(()=>h.ctx.auroraSupabaseBook_(),/Private database/);
  h.props.AURORA_DATABASE_BACKEND='supabse';assert.throws(()=>h.ctx.auroraSupabaseBegin_(),(e:any)=>e.code==='invalid_database_backend');assert.equal(h.server.calls.length,0);
});
test('one consistent snapshot backs actual range reads, ID TextFinder and scalar values',()=>{
  const h=harness();h.ctx.auroraSupabaseBegin_();const book=h.ctx.auroraSupabaseBook_(),orders=book.getSheetByName('orders');
  assert.equal(book.getSheetByName('missing'),null);assert.equal(orders.getLastRow(),2);assert.equal(orders.getLastColumn(),3);
  assert.equal(orders.getRange(2,1,1,1).createTextFinder('ord_original').matchEntireCell(true).findNext().getRow(),2);
  assert.equal(orders.getRange(2,1).createTextFinder('ord').matchEntireCell(true).findNext(),null);
  assert.equal(book.getSheetByName('settings').getRange(2,2).getValues()[0][0],true);
  assert.deepEqual(plain(orders.getRange(3,1,1,3).getValues()),[['','','']]);
  assert.equal(h.server.calls.length,1);
});
test('atomic commit sends only changed rows and preserves extra columns and original IDs',()=>{
  const h=harness();h.ctx.auroraSupabaseBegin_();const book=h.ctx.auroraSupabaseBook_();
  book.getSheetByName('orders').getRange(2,2).setValues([['{"id":"ord_original","status":"confirmed"}']]);
  book.getSheetByName('customer_accounts').getRange(2,3).setValues([[1]]);
  book.getSheetByName('orders').getRange(3,1,1,3).setValues([['ord_new','{"id":"ord_new"}','']]);
  assert.equal(h.server.state.orders.rows.length,1,'no write before explicit flush');h.ctx.auroraSupabaseFlush_();
  const payload=h.server.calls.find((c:any)=>c.name==='aurora_runtime_commit').payload;
  assert.equal(payload.p_changes.length,3);assert.ok(payload.p_changes.every((c:any)=>c.row>1&&Array.isArray(c.cells)));
  assert.equal(h.server.state.orders.rows[0].cells[0],'ord_original');assert.equal(h.server.state.orders.rows[0].cells[2],'private@example.test');
  assert.equal(h.server.state.customer_accounts.rows[0].cells[4],'preserve-owner-column');
  assert.equal(h.ctx.auroraSupabaseHasChanges_(),false);h.ctx.auroraSupabaseFlush_();assert.equal(h.server.calls.length,2);
});
test('lost acknowledgement reuses exact commit ID and delta instead of duplicating append',()=>{
  const h=harness();h.ctx.auroraSupabaseBegin_();h.server.loseAck();
  h.ctx.auroraSupabaseBook_().getSheetByName('orders').getRange(3,1,1,3).setValues([['ord_new','{}','']]);h.ctx.auroraSupabaseFlush_();
  const commits=h.server.calls.filter((c:any)=>c.name==='aurora_runtime_commit');
  assert.equal(commits.length,2);assert.deepEqual(commits[0].payload,commits[1].payload);assert.equal(h.server.state.orders.rows.length,2);assert.equal(h.server.revision,2);
});
test('two request snapshots cannot overwrite each other: second commit conflicts atomically',()=>{
  const server=backend(),a=harness(server),b=harness(server);a.ctx.auroraSupabaseBegin_();b.ctx.auroraSupabaseBegin_();
  a.ctx.auroraSupabaseBook_().getSheetByName('settings').getRange(2,2).setValues([[false]]);a.ctx.auroraSupabaseFlush_();
  b.ctx.auroraSupabaseBook_().getSheetByName('orders').getRange(2,2).setValues([['stale']]);
  assert.throws(()=>b.ctx.auroraSupabaseFlush_(),(e:any)=>e.code==='revision_conflict'&&e.uncertain===false);
  assert.equal(server.state.orders.rows[0].cells[1],'{"id":"ord_original"}');assert.equal(server.state.settings.rows[0].cells[1],false);
  assert.throws(()=>b.ctx.auroraSupabaseBook_(),/Private database/,'poisoned snapshot cannot continue');
});
test('refresh cannot discard a pending write and live handles read refreshed consent state',()=>{
  const h=harness();h.ctx.auroraSupabaseBegin_();const sheet=h.ctx.auroraSupabaseBook_().getSheetByName('settings'),range=sheet.getRange(2,2);
  range.setValues([[false]]);assert.throws(()=>h.ctx.auroraSupabaseRefresh_(),(e:any)=>e.code==='database_refresh_has_pending_changes');
  h.ctx.auroraSupabaseFlush_();h.server.externalChange((s:any)=>{s.settings.rows[0].cells[1]=true;});h.ctx.auroraSupabaseRefresh_();assert.equal(range.getValues()[0][0],true);
});
test('explicit auth lockout checkpoint persists even when the caller then rejects credentials',()=>{
  const h=harness();h.ctx.auroraSupabaseBegin_();const accounts=h.ctx.auroraSupabaseBook_().getSheetByName('customer_accounts');
  assert.throws(()=>{accounts.getRange(2,3).setValues([[5]]);h.ctx.auroraSupabaseFlush_();throw new Error('invalid_credentials');},/invalid_credentials/);
  assert.equal(h.server.state.customer_accounts.rows[0].cells[2],5);
});
test('header edits, sparse appends, nested cells and oversized ranges fail closed',()=>{
  const h=harness();h.ctx.auroraSupabaseBegin_();const book=h.ctx.auroraSupabaseBook_(),sheet=book.getSheetByName('settings');
  assert.throws(()=>sheet.getRange(1,1).setValues([['renamed']]));assert.throws(()=>sheet.getRange(4,1).setValues([['sparse']]));
  assert.throws(()=>sheet.getRange(2,2).setValues([[{}]]));assert.throws(()=>sheet.getRange(1,1,50002,1));assert.throws(()=>book.insertSheet('new'));
  sheet.getRange(1,1,1,2).setValues([['key','value']]);assert.equal(h.ctx.auroraSupabaseHasChanges_(),false);
});
test('Sheet literal apostrophe semantics preserve leading plus/minus/formula-like text without execution',()=>{
  const h=harness();h.ctx.auroraSupabaseBegin_();const range=h.ctx.auroraSupabaseBook_().getSheetByName('settings').getRange(2,2);
  range.setValues([["'+8801700000000"]]);assert.equal(range.getValues()[0][0],'+8801700000000');
  range.setValues([["'=literal"]]);assert.equal(range.getValues()[0][0],'=literal');
});
test('SQL keeps all rows private, atomically CAS-applies deltas and limits owner promotion',()=>{
  const sql=fs.readFileSync(new URL('../supabase/migrations/20261030_007_private_runtime_store.sql',import.meta.url),'utf8');
  assert.match(sql,/FOR UPDATE/);assert.match(sql,/revision_conflict.*ERRCODE='40001'/);assert.match(sql,/operation_id_conflict/);
  assert.match(sql,/p_reviewed_audits_sha256 IS DISTINCT FROM audit_hash/);assert.match(sql,/formula_recalculation_requires_explicit_review/);
  assert.match(sql,/REVOKE ALL ON FUNCTION aurora_runtime\.promote_staged_run\(text,text,boolean,text,text\) FROM PUBLIC, anon, authenticated, service_role/);
  assert.equal((sql.match(/GRANT EXECUTE/g)||[]).length,2);assert.doesNotMatch(sql.replace(/^--.*$/gm,''),/DELETE FROM|TRUNCATE|EXECUTE format|GRANT .* TO (anon|authenticated)/i);
  assert.match(sql,/record_key_immutable/);assert.match(sql,/duplicate_record_key/);assert.match(sql,/jsonb_array_length\(p_changes\) NOT BETWEEN 1 AND 1000/);
});

test('active campaign bridge commits before mail and rechecks Supabase consent after an intervening unsubscribe',()=>{
  const h=harness(),ctx=h.ctx;const editor:unknown[][]=[];let selectedRow=2,locked=false,html='';const sent:any[]=[],triggers:any[]=[];
  const properties={getProperty:(key:string)=>h.props[key]??null,setProperty:(key:string,value:string)=>{h.props[key]=value;return properties;},deleteProperty:(key:string)=>{delete h.props[key];return properties;}};
  h.props.AURORA_CAMPAIGN_OWNER_EMAIL='owner@example.test';h.props.AURORA_SUBSCRIPTION_SECRET='fixture-secret';
  ctx.PropertiesService={getScriptProperties:()=>properties};
  ctx.Session={getActiveUser:()=>({getEmail:()=> 'owner@example.test'}),getEffectiveUser:()=>({getEmail:()=> 'owner@example.test'})};
  ctx.Utilities={...ctx.Utilities,DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},
    computeDigest:(_:string,value:string)=>Array.from(createHash('sha256').update(value).digest()),
    computeHmacSha256Signature:(value:string,key:string)=>Array.from(createHmac('sha256',key).update(value).digest())};
  ctx.LockService={getScriptLock:()=>({tryLock:()=>{if(locked)return false;locked=true;return true;},releaseLock:()=>{assert.equal(locked,true);locked=false;}})};
  const physicalSheet:any={getName:()=> 'email_campaigns',getLastRow:()=>editor.length,getLastColumn:()=>editor[0].length,
    getRange:(r:number,c:number,height=1,width=1)=>{const range:any={getRow:()=>r,getValues:()=>Array.from({length:height},(_,y)=>Array.from({length:width},(_,x)=>editor[r+y-1]?.[c+x-1]??'')),
      setValues:(values:unknown[][])=>{values.forEach((row,y)=>{editor[r+y-1]??=[];row.forEach((value,x)=>{editor[r+y-1][c+x-1]=value;});});return range;},activate:()=>{selectedRow=r;}};return range;}};
  const book={getSheetByName:(name:string)=>name==='email_campaigns'?physicalSheet:null,getActiveSheet:()=>physicalSheet,getActiveRange:()=>({getRow:()=>selectedRow}),setActiveSheet:()=>{},getId:()=> 'fixture_sheet'};
  ctx.SpreadsheetApp={openById:()=>book,flush:()=>{},getUi:()=>({alert:()=>{},showModalDialog:(output:any)=>{html=output.html;}})};
  ctx.HtmlService={createHtmlOutput:(value:string)=>{const out:any={html:value,setWidth:()=>out,setHeight:()=>out};return out;}};
  ctx.ScriptApp={getService:()=>({getUrl:()=> 'https://script.google.com/macros/s/FIXTURE/exec'}),getProjectTriggers:()=>triggers,
    newTrigger:(handler:string)=>{const builder:any={timeBased:()=>builder,everyMinutes:()=>builder,create:()=>{const t={getUniqueId:randomUUID,getHandlerFunction:()=>handler};triggers.push(t);return t;}};return builder;},deleteTrigger:(t:any)=>triggers.splice(triggers.indexOf(t),1)};
  for(const file of ['Code.gs','AccountAuth.gs','CustomerSubscriptions.gs','Campaigns.gs'])vm.runInContext(fs.readFileSync(new URL('../apps-script/'+file,import.meta.url),'utf8'),ctx);
  const seed=(headers:string[],records:Record<string,unknown>[])=>({headers:plain(headers),rows:records.map((record,index)=>({sheet_row:index+2,cells:headers.map(key=>record[key]??'')}))});
  h.server.state.settings=seed(['key','value'],[{key:'shop_name',value:'Fixture Bakery'}]);
  h.server.state.email_campaigns=seed(ctx.AURORA_CAMPAIGN_SCHEMAS.email_campaigns,[]);h.server.state.email_deliveries=seed(ctx.AURORA_CAMPAIGN_SCHEMAS.email_deliveries,[]);
  h.server.state.customer_accounts=seed(ctx.PRIVATE_ORDER_SCHEMAS.customer_accounts,[{id:'customer_1',active:true},{id:'customer_2',active:true}]);
  h.server.state.customer_subscriptions=seed(ctx.AURORA_SUBSCRIPTION_HEADERS,[
    {id:'subscription_1',customer_id:'customer_1',email:'first@example.test',marketing_consent:true,email_verified:true,status:'subscribed'},
    {id:'subscription_2',customer_id:'customer_2',email:'second@example.test',marketing_consent:true,email_verified:true,status:'subscribed'}]);
  editor.push(plain(ctx.AURORA_CAMPAIGN_SCHEMAS.email_campaigns));
  ctx.MailApp={getRemainingDailyQuota:()=>100,sendEmail:(message:any)=>{
    assert.equal(locked,false);const deliveries=h.server.state.email_deliveries;const status=deliveries.headers.indexOf('status');
    assert.equal(deliveries.rows[0].cells[status],'sending','durable claim must exist before MailApp');sent.push(message);
    h.server.externalChange((s:any)=>{const subs=s.customer_subscriptions;subs.rows[1].cells[subs.headers.indexOf('status')]='unsubscribed';subs.rows[1].cells[subs.headers.indexOf('marketing_consent')]=false;});
  }};
  ctx.auroraNewCampaignDraft();assert.equal(editor.length,2);
  editor[1][editor[0].indexOf('subject')]='New cake';editor[1][editor[0].indexOf('body')]='Owner-approved launch';
  ctx.auroraPreviewCampaign();assert.match(html,/2 verified/);
  ctx.auroraConfirmCampaign(JSON.parse(h.props.AURORA_CAMPAIGN_REVIEW).token);
  assert.equal(sent.length,1);assert.equal(sent[0].to,'first@example.test');
  const deliveries=h.server.state.email_deliveries;assert.deepEqual(deliveries.rows.map((row:any)=>row.cells[deliveries.headers.indexOf('status')]),['sent','skipped']);
  assert.equal(editor[1][editor[0].indexOf('status')],'completed');assert.equal(locked,false);
  const token=ctx.auroraCustomerUnsubscribeToken_('customer_1'),beforeGet=h.server.revision;
  const page=ctx.doGet({parameter:{action:'email_unsubscribe',token}});assert.match(page.html,/Unsubscribe/);assert.equal(h.server.revision,beforeGet,'signed GET must not mutate preferences');
  const result=ctx.doPost({parameter:{action:'email_unsubscribe',token},postData:{type:'application/x-www-form-urlencoded',contents:''}});
  assert.match(result.html,/You are unsubscribed/);const subs=h.server.state.customer_subscriptions;
  assert.equal(subs.rows[0].cells[subs.headers.indexOf('status')],'unsubscribed');assert.equal(subs.rows[0].cells[subs.headers.indexOf('marketing_consent')],false);
});
