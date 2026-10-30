import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash, randomUUID } from 'node:crypto';

type Row = unknown[];
const source=fs.readFileSync(new URL('../apps-script/Campaigns.gs',import.meta.url),'utf8');
const customerHeaders=['customer_id','user_id','customer_name','customer_phone','customer_email','delivery_address','delivery_zone_id','marketing_consent','email_verified'];
function harness() {
  const tables:Record<string,Row[]>={customers:[customerHeaders],settings:[['key','value'],['shop_name','Aurora <Cake>']]};
  const props:Record<string,string>={AURORA_CAMPAIGN_OWNER_EMAIL:'owner@example.test'};
  const sent:any[]=[],triggers:any[]=[];let quota=100,active='owner@example.test',effective=active,lockHeld=false,html='',failSend=false,failAck=false;
  let beforeSend:((message:any)=>void)|undefined;
  const sheet=(name:string):any=>({
    getName:()=>name,getLastRow:()=>tables[name].length,getLastColumn:()=>Math.max(0,...tables[name].map(row=>row.length)),getMaxRows:()=>1000,insertRowsAfter:()=>{},
    setFrozenRows:()=>{},setColumnWidths:()=>{},
    getRange:(r:number,c:number,h=1,w=1)=>{
      const range:any={getValues:()=>Array.from({length:h},(_,ri)=>Array.from({length:w},(_,ci)=>tables[name][r+ri-1]?.[c+ci-1]??'')),setValues:(values:Row[])=>{
        if(name==='email_deliveries'&&failAck&&values.some(row=>row.includes('sent'))){failAck=false;throw new Error('simulated lost ack write');}
        values.forEach((row,ri)=>{tables[name][r+ri-1]??=[];row.forEach((value,ci)=>{tables[name][r+ri-1][c+ci-1]=value;});});return range;
      },activate:()=>{}};
      for(const method of ['setFontWeight','setFontColor','setBackground','setWrap'])range[method]=()=>range;return range;
    }
  });
  const menu:any={addItem:()=>menu,addToUi:()=>{}};
  const ui={createMenu:()=>menu,alert:()=>{},showModalDialog:(output:any)=>{html=output.html;}};
  const book:any={getId:()=> 'test-sheet',getSheetByName:(name:string)=>name in tables?sheet(name):null,insertSheet:(name:string)=>{tables[name]=[];return sheet(name);},getActiveSheet:()=>sheet('email_campaigns'),getActiveRange:()=>({getRow:()=>2}),setActiveSheet:()=>{}};
  const properties={getProperty:(name:string)=>props[name]??null,setProperty:(name:string,value:string)=>{props[name]=value;return properties;},deleteProperty:(name:string)=>{delete props[name];return properties;}};
  const ctx:Record<string,any>={Date,Math,JSON,Object,Array,String,Number,encodeURIComponent,console,
    PropertiesService:{getScriptProperties:()=>properties},Session:{getActiveUser:()=>({getEmail:()=>active}),getEffectiveUser:()=>({getEmail:()=>effective})},
    SpreadsheetApp:{getUi:()=>ui,flush:()=>assert.equal(lockHeld,true)},
    LockService:{getScriptLock:()=>({tryLock:()=>{if(lockHeld)return false;lockHeld=true;return true;},releaseLock:()=>{assert.equal(lockHeld,true);lockHeld=false;}})},
    Utilities:{getUuid:randomUUID,DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_:string,text:string)=>Array.from(createHash('sha256').update(text).digest())},
    ScriptApp:{getService:()=>({getUrl:()=> 'https://script.google.com/macros/s/TEST_DEPLOYMENT/exec'}),getProjectTriggers:()=>triggers,newTrigger:(handler:string)=>{const b:any={forSpreadsheet:()=>b,onOpen:()=>b,timeBased:()=>b,everyMinutes:()=>b,create:()=>{const trigger={getHandlerFunction:()=>handler,getUniqueId:()=>randomUUID()};triggers.push(trigger);return trigger;}};return b;},deleteTrigger:(trigger:any)=>triggers.splice(triggers.indexOf(trigger),1)},
    HtmlService:{createHtmlOutput:(value:string)=>{const result:any={html:value,setWidth:()=>result,setHeight:()=>result};return result;}},
    MailApp:{getRemainingDailyQuota:()=>quota,sendEmail:(message:any)=>{assert.equal(lockHeld,false,'Mail service must not block customer operations');beforeSend?.(message);sent.push(message);quota--;if(failSend){failSend=false;throw new Error('send acknowledgement unavailable');}}},
    auroraSpreadsheet_:()=>book,
    auroraSheetCell_:(value:unknown)=>typeof value==='string'&&/^[=+\-@]/.test(value)?"'"+value:value,
    auroraActive_:(value:unknown)=>value===true||String(value).toLowerCase()==='true',
    auroraRows_:()=>[{key:'shop_name',value:'Aurora <Cake>'}],PUBLIC_SETTINGS_KEYS:['shop_name'],auroraPairs_:()=>({shop_name:'Aurora <Cake>'}),
    auroraSubscriptionCampaignRecipients_:()=>tables.customers.slice(1).filter(values=>values[7]===true&&values[8]===true).map(values=>({customer_id:values[0],email:values[4]})),
    auroraCustomerUnsubscribeToken_:(id:string)=>'opaque-signed-'+createHash('sha256').update(id).digest('hex'),
  };
  vm.createContext(ctx);vm.runInContext(source,ctx);ctx.auroraSetupCampaignTables_(book);
  function records(name:string){return tables[name].slice(1).map(values=>Object.fromEntries(tables[name][0].map((key,index)=>[String(key),values[index]])));}
  function change(name:string,row:number,key:string,value:unknown){tables[name][row+1][tables[name][0].indexOf(key)]=value;}
  function addCustomer(id:string,email:string,consent=true,verified=true){tables.customers.push([id,'phone|'+email,'Test Person','01700000000',email,'Private test address','zone',consent,verified]);}
  function draft(patch:Record<string,unknown>={}){const row={id:'campaign-test',subject:'Meet our cake <b>range</b>',body:'A new cake <script>bad()</script>\nReady to explore?',product_url:'https://bakery.test/product',status:'draft',recipient_count:0,sent_count:0,skipped_count:0,unknown_count:0,created_at:new Date().toISOString(),...patch};tables.email_campaigns.push(tables.email_campaigns[0].map(key=>row[String(key) as keyof typeof row]??''));}
  function preview(){ctx.auroraPreviewCampaign();return JSON.parse(props.AURORA_CAMPAIGN_REVIEW).token;}
  return {ctx,tables,props,sent,triggers,records,change,addCustomer,draft,preview,get html(){return html;},get lockHeld(){return lockHeld;},setQuota:(value:number)=>{quota=value;},identity:(a:string,e=a)=>{active=a;effective=e;},failSend:()=>{failSend=true;},failAck:()=>{failAck=true;},onSend:(fn:(message:any)=>void)=>{beforeSend=fn;}};
}

test('campaign setup preserves records and installs only the open menu without sending',()=>{
  const h=harness();h.draft();const before=structuredClone(h.tables.email_campaigns);h.ctx.setupCampaignTools();h.ctx.setupCampaignTools();
  assert.deepEqual(h.tables.email_campaigns,before);assert.equal(h.sent.length,0);assert.equal(h.triggers.length,1);assert.equal(h.triggers[0].getHandlerFunction(),'auroraCampaignOnOpen');
});
test('owner checks block other editors, anonymous web contexts and forged workers',()=>{
  const h=harness();h.addCustomer('c1','a@example.test');h.draft();h.identity('visitor@example.test','owner@example.test');
  assert.throws(()=>h.ctx.auroraPreviewCampaign(),/owner/);assert.throws(()=>h.ctx.auroraConfirmCampaign('anything'),/owner/);assert.throws(()=>h.ctx.setupCampaignTools(),/owner/);
  h.identity('','owner@example.test');assert.throws(()=>h.ctx.auroraResumeCampaigns(),/owner/);
  h.identity('owner@example.test');assert.throws(()=>h.ctx.auroraCampaignTick({triggerUid:'forged'}),/installed/);assert.equal(h.sent.length,0);
});
test('review shows escaped content and changed content or audience requires a fresh approval',()=>{
  const h=harness();h.addCustomer('c1','a@example.test');h.draft();const token=h.preview();
  assert.match(h.html,/&lt;script&gt;bad\(\)&lt;\/script&gt;/);assert.match(h.html,/1 verified, opted-in recipients/);assert.equal(h.sent.length,0);
  h.change('email_campaigns',0,'body','Changed announcement');assert.throws(()=>h.ctx.auroraConfirmCampaign(token),/changed/);
  const current=h.preview();h.addCustomer('c2','b@example.test');assert.throws(()=>h.ctx.auroraConfirmCampaign(current),/changed/);assert.equal(h.sent.length,0);
});
test('only opted-in verified addresses receive individual deduplicated messages with opaque unsubscribe links',()=>{
  const h=harness();h.addCustomer('c1','a@example.test');h.addCustomer('c2','A@example.test');h.addCustomer('c3','no@example.test',false);h.addCustomer('c4','unverified@example.test',true,false);h.draft();
  h.ctx.auroraConfirmCampaign(h.preview());assert.equal(h.sent.length,1);const message=h.sent[0];assert.equal(message.to,'a@example.test');assert.equal('cc' in message,false);assert.equal('bcc' in message,false);assert.match(message.body,/Unsubscribe: https:\/\/script.google.com/);assert.match(message.htmlBody,/&lt;script&gt;/);assert.equal(message.body.includes('customer_id='),false);assert.equal(message.body.includes('a@example.test'),false);
  assert.equal(h.records('email_campaigns')[0].status,'completed');assert.equal(h.records('email_deliveries')[0].status,'sent');assert.equal(h.triggers.some(t=>t.getHandlerFunction()==='auroraCampaignTick'),false);
});
test('quota exhaustion queues work and the immutable approved content is used on resume',()=>{
  const h=harness();h.addCustomer('c1','a@example.test');h.draft();h.setQuota(10);h.ctx.auroraConfirmCampaign(h.preview());
  assert.equal(h.sent.length,0);assert.equal(h.records('email_campaigns')[0].status,'waiting_quota');assert.equal(h.triggers.some(t=>t.getHandlerFunction()==='auroraCampaignTick'),true);
  h.change('email_campaigns',0,'subject','Edited after approval');h.change('email_campaigns',0,'next_attempt_at','');h.setQuota(11);h.ctx.auroraResumeCampaigns();
  assert.equal(h.sent.length,1);assert.equal(h.sent[0].subject,'Meet our cake <b>range</b>');assert.equal(h.records('email_campaigns')[0].status,'completed');
});
test('uncertain sends are quarantined and never automatically retried',()=>{
  const h=harness();h.addCustomer('c1','a@example.test');h.draft();h.failSend();h.ctx.auroraConfirmCampaign(h.preview());
  assert.equal(h.sent.length,1);assert.equal(h.records('email_deliveries')[0].status,'unknown');assert.equal(h.records('email_campaigns')[0].status,'completed_with_issues');h.ctx.auroraResumeCampaigns();assert.equal(h.sent.length,1);
});
test('lost acknowledgement write keeps a durable claim and recovery never duplicates the mail',()=>{
  const h=harness();h.addCustomer('c1','a@example.test');h.draft();h.failAck();assert.throws(()=>h.ctx.auroraConfirmCampaign(h.preview()),/lost ack/);
  assert.equal(h.sent.length,1);assert.equal(h.records('email_deliveries')[0].status,'sending');assert.equal(h.lockHeld,false);assert.equal(h.props.AURORA_CAMPAIGN_WORKER_LEASE,undefined);
  h.ctx.auroraResumeCampaigns();assert.equal(h.sent.length,1);assert.equal(h.records('email_deliveries')[0].status,'unknown');
});
test('unsubscribe during a batch is rechecked before the next recipient is claimed',()=>{
  const h=harness();h.addCustomer('c1','a@example.test');h.addCustomer('c2','b@example.test');h.draft();h.onSend(()=>h.change('customers',1,'marketing_consent',false));h.ctx.auroraConfirmCampaign(h.preview());
  assert.equal(h.sent.length,1);assert.equal(h.records('email_deliveries')[1].status,'skipped');assert.equal(h.records('email_campaigns')[0].skipped_count,1);
});
test('a live worker lease prevents another worker from claiming the same queue',()=>{
  const h=harness();h.addCustomer('c1','a@example.test');h.draft();h.setQuota(10);h.ctx.auroraConfirmCampaign(h.preview());h.setQuota(100);h.change('email_campaigns',0,'next_attempt_at','');
  h.props.AURORA_CAMPAIGN_WORKER_LEASE=JSON.stringify({id:'another-worker',expires_at:Date.now()+60000});assert.equal(h.ctx.auroraCampaignRun_().busy,true);assert.equal(h.sent.length,0);assert.equal(h.lockHeld,false);
});
test('batches are bounded at forty and a later batch does not resend successful deliveries',()=>{
  const h=harness();for(let i=0;i<45;i++)h.addCustomer('c'+i,`subscriber${String(i).padStart(2,'0')}@example.test`);h.draft();h.ctx.auroraConfirmCampaign(h.preview());
  assert.equal(h.sent.length,40);assert.equal(h.records('email_campaigns')[0].status,'sending');h.ctx.auroraResumeCampaigns();assert.equal(h.sent.length,45);assert.equal(new Set(h.sent.map(message=>message.to)).size,45);assert.equal(h.records('email_campaigns')[0].status,'completed');
});
test('unsafe campaign links and empty audiences cannot be queued',()=>{
  for(const url of ['javascript:alert(1)','http://insecure.test','https://user:pass@example.test']){const h=harness();h.addCustomer('c1','a@example.test');h.draft({product_url:url});assert.throws(()=>h.preview(),/HTTPS/);assert.equal(h.sent.length,0);}
  const h=harness();h.addCustomer('c1','a@example.test',false);h.draft();assert.throws(()=>h.preview(),/no verified customers/);assert.equal(h.sent.length,0);
});
test('expired or replayed preview tokens do not queue a second campaign',()=>{
  const h=harness();h.addCustomer('c1','a@example.test');h.draft();const token=h.preview();const review=JSON.parse(h.props.AURORA_CAMPAIGN_REVIEW);review.expires_at=0;h.props.AURORA_CAMPAIGN_REVIEW=JSON.stringify(review);assert.throws(()=>h.ctx.auroraConfirmCampaign(token),/expired/);
  const fresh=h.preview();h.ctx.auroraConfirmCampaign(fresh);assert.throws(()=>h.ctx.auroraConfirmCampaign(fresh),/expired/);assert.equal(h.sent.length,1);
});

test('the campaign lease prevents overlapping workers during a slow send at the five-minute trigger boundary',()=>{
  const h=harness();h.addCustomer('c1','a@example.test');h.draft();
  h.onSend(()=>{
    const realDate=h.ctx.Date,shifted=Date.now()+5*60000;
    class SlowClock extends Date {static now(){return shifted;}}
    const lease=JSON.parse(h.props.AURORA_CAMPAIGN_WORKER_LEASE);assert.ok(lease.expires_at-Date.now()>6*60000);
    h.ctx.Date=SlowClock;try{assert.equal(h.ctx.auroraCampaignRun_().busy,true);}finally{h.ctx.Date=realDate;}
  });
  h.ctx.auroraConfirmCampaign(h.preview());assert.equal(h.sent.length,1);assert.equal(h.records('email_deliveries')[0].status,'sent');assert.equal(h.props.AURORA_CAMPAIGN_WORKER_LEASE,undefined);
});
