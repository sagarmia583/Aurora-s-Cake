import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash, createHmac, randomUUID } from 'node:crypto';
const source=fs.readFileSync(new URL('../apps-script/CustomerSubscriptions.gs',import.meta.url),'utf8');
type Row=unknown[];
function harness(){
  let now=Date.parse('2026-10-30T06:00:00Z'),held=false,identity='customer-a',quota=100,failMail=false,writes=0,failAfterEmail=false;
  class Clock extends Date {constructor(value?:any){super(value===undefined?now:value);}static now(){return now;}}
  const tables:Record<string,Row[]>={},props:Record<string,string>={},mails:any[]=[],accounts:any[]=[{id:'customer-a',email:'original@example.test',active:true}];
  const sheet=(name:string):any=>({getLastRow:()=>tables[name].length,getLastColumn:()=>Math.max(0,...tables[name].map(row=>row.length)),getMaxRows:()=>1000,insertRowsAfter:()=>{},setFrozenRows:()=>{},setColumnWidths:()=>{},getRange:(r:number,c:number,h=1,w=1)=>{const range:any={getValues:()=>Array.from({length:h},(_,ri)=>Array.from({length:w},(_,ci)=>tables[name][r+ri-1]?.[c+ci-1]??'')),setValues:(values:Row[])=>{writes++;values.forEach((row,ri)=>{tables[name][r+ri-1]??=[];row.forEach((value,ci)=>{tables[name][r+ri-1][c+ci-1]=value;});});if(name==='customer_subscriptions'&&failAfterEmail&&c===tables[name][0].indexOf('email')+1){failAfterEmail=false;throw new Error('Interrupted after email update');}return range;}};for(const method of ['setFontWeight','setBackground','setFontColor','setWrap'])range[method]=()=>range;return range;}});
  const book={getSheetByName:(name:string)=>name in tables?sheet(name):null,insertSheet:(name:string)=>{tables[name]=[];return sheet(name);}};
  const properties={getProperty:(key:string)=>props[key]??null,setProperty:(key:string,value:string)=>{props[key]=value;return properties;},deleteProperty:(key:string)=>delete props[key]};
  const reject=(code:string,message:string)=>{throw Object.assign(new Error(message),{code,auroraValidation:true});};
  const ctx:Record<string,any>={Date:Clock,JSON,Object,Array,String,Number,Math,encodeURIComponent,console,
    PropertiesService:{getScriptProperties:()=>properties},
    LockService:{getScriptLock:()=>({tryLock:()=>{if(held)return false;held=true;return true;},releaseLock:()=>{assert.equal(held,true);held=false;}})},
    Utilities:{getUuid:randomUUID,DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_:any,text:string)=>Array.from(createHash('sha256').update(text).digest()),computeHmacSha256Signature:(text:string,key:string)=>Array.from(createHmac('sha256',key).update(text).digest()),formatDate:()=>new Clock().toISOString().slice(0,10)},
    MailApp:{getRemainingDailyQuota:()=>quota,sendEmail:(message:any)=>{assert.equal(held,false);mails.push(message);quota--;if(failMail)throw new Error('Interrupted mail send');}},
    SpreadsheetApp:{flush:()=>assert.equal(held,true)},ScriptApp:{getService:()=>({getUrl:()=> 'https://script.google.com/macros/s/TEST_DEPLOYMENT/exec'})},
    HtmlService:{createHtmlOutput:(html:string)=>({html})},auroraSpreadsheet_:()=>book,
    auroraReject_:reject,auroraActive_:(value:any)=>value===undefined||value===null||value===''||value===true||String(value).toLowerCase()==='true',auroraSheetCell_:(value:any)=>typeof value==='string'&&/^[=+\-@]/.test(value)?"'"+value:value,
    auroraAccountAuthenticate_:(_:string,token:string)=>{if(token!=='private-session')reject('unauthorized','Sign in again.');return accounts.find(account=>account.id===identity)||reject('unauthorized','No account.');},
    auroraAccountToken_:()=>randomUUID()+randomUUID(),auroraAccountDigest_:(text:string)=>createHash('sha256').update(text).digest('hex'),
    auroraPrivateTable_:()=>({rows:accounts}),auroraAccountValue_:(_:unknown,id:string)=>accounts.find(account=>account.id===id),
  };
  vm.createContext(ctx);vm.runInContext(source,ctx);ctx.auroraSetupSubscriptions_(book);
  const post=(action:string,patch:Record<string,unknown>={})=>ctx.auroraSubscriptionPost_({action,auth_token:'private-session',...patch});
  const rows=()=>tables.customer_subscriptions.slice(1).map(values=>Object.fromEntries(tables.customer_subscriptions[0].map((key,index)=>[String(key),values[index]])));
  const change=(index:number,key:string,value:unknown)=>{tables.customer_subscriptions[index+1][tables.customer_subscriptions[0].indexOf(key)]=value;};
  const token=()=>decodeURIComponent(mails.at(-1).body.match(/token=([^\s]+)/)[1]);
  return {ctx,tables,props,mails,accounts,post,rows,change,token,get writes(){return writes;},advance:(ms=61000)=>{now+=ms;},as:(id:string)=>{identity=id;if(!accounts.some(account=>account.id===id))accounts.push({id,email:'',active:true});},setQuota:(value:number)=>quota=value,failMail:()=>failMail=true,failEmailWrite:()=>failAfterEmail=true};
}

test('email subscription requests require account authentication and explicit consent',()=>{
  const h=harness();assert.throws(()=>h.post('customer_email_status',{auth_token:'forged'}),/Sign in/);
  for(const consent of [undefined,false,'true',1])assert.throws(()=>h.post('customer_email_subscribe',{email:'a@example.test',marketing_consent:consent}),/Choose product/);
  assert.equal(h.mails.length,0);assert.equal(h.rows().length,0);
});
test('confirmation GET only displays a form; explicit signed POST activates the subscription without changing account identity',()=>{
  const h=harness();const before=structuredClone(h.accounts);const result=h.post('customer_email_subscribe',{email:'NEW@EXAMPLE.TEST',marketing_consent:true});
  assert.equal(result.confirmation_sent,true);assert.equal(result.subscription.marketing_consent,false);assert.equal(result.subscription.email_verified,false);assert.equal(h.rows()[0].status,'pending_confirmation');
  const token=h.token();assert.equal(token.includes('new@example.test'),false);assert.equal(JSON.stringify(h.rows()).includes(token),false);
  const writes=h.writes,props=structuredClone(h.props);const page=h.ctx.auroraSubscriptionLinkGet_('email_confirm',token);assert.match(page.html,/method="post"/);assert.match(page.html,/Confirm email updates/);assert.equal(h.writes,writes);assert.deepEqual(h.props,props);
  assert.match(h.ctx.auroraSubscriptionLinkPost_('email_confirm',token).html,/Email confirmed/);assert.equal(h.rows()[0].status,'subscribed');assert.equal(h.rows()[0].marketing_consent,true);assert.equal(h.rows()[0].email_verified,true);assert.deepEqual(h.accounts,before);
  assert.match(h.ctx.auroraSubscriptionLinkPost_('email_confirm',token).html,/already confirmed/);
});
test('tampered, expired and replaced verification links cannot turn on email marketing',()=>{
  const h=harness();h.post('customer_email_subscribe',{email:'a@example.test',marketing_consent:true});const first=h.token();
  assert.match(h.ctx.auroraSubscriptionLinkPost_('email_confirm',first+'a').html,/unavailable/);assert.equal(h.rows()[0].marketing_consent,false);
  h.advance();h.post('customer_email_subscribe',{email:'b@example.test',marketing_consent:true});assert.match(h.ctx.auroraSubscriptionLinkPost_('email_confirm',first).html,/unavailable/);
  h.advance(25*3600000);assert.match(h.ctx.auroraSubscriptionLinkPost_('email_confirm',h.token()).html,/unavailable/);assert.equal(h.rows()[0].marketing_consent,false);
});
test('unsubscribe GET is read-only and POST stops every subscription for the same normalized email',()=>{
  const h=harness();h.post('customer_email_subscribe',{email:'a@example.test',marketing_consent:true});h.ctx.auroraSubscriptionLinkPost_('email_confirm',h.token());
  h.as('customer-b');h.advance();h.post('customer_email_subscribe',{email:'A@example.test',marketing_consent:true});h.ctx.auroraSubscriptionLinkPost_('email_confirm',h.token());
  const token=h.ctx.auroraCustomerUnsubscribeToken_('customer-a'),writes=h.writes;
  h.ctx.auroraSubscriptionLinkGet_('email_unsubscribe',token);assert.equal(h.writes,writes);assert.equal(h.rows().every(row=>row.marketing_consent===true),true);
  assert.match(h.ctx.auroraSubscriptionLinkPost_('email_unsubscribe',token).html,/unsubscribed/);assert.equal(h.rows().every(row=>row.marketing_consent===false&&row.status==='unsubscribed'),true);
});
test('rate limits survive failed sends and cover cooldown, per-account, per-email and global daily quotas',()=>{
  const h=harness();h.failMail();assert.throws(()=>h.post('customer_email_subscribe',{email:'a@example.test',marketing_consent:true}),/could not confirm/);
  assert.throws(()=>h.post('customer_email_subscribe',{email:'b@example.test',marketing_consent:true}),/wait/);assert.equal(h.mails.length,1);
  const per=harness();for(let i=0;i<3;i++){per.advance();per.post('customer_email_subscribe',{email:`a${i}@example.test`,marketing_consent:true});}per.advance();assert.throws(()=>per.post('customer_email_subscribe',{email:'last@example.test',marketing_consent:true}),/wait/);
  const mail=harness();for(let i=0;i<3;i++){mail.as('c'+i);mail.advance();mail.post('customer_email_subscribe',{email:'shared@example.test',marketing_consent:true});}mail.as('c4');mail.advance();assert.throws(()=>mail.post('customer_email_subscribe',{email:'shared@example.test',marketing_consent:true}),/wait/);
  const total=harness();for(let i=0;i<50;i++){total.as('customer'+i);total.post('customer_email_subscribe',{email:`a${i}@example.test`,marketing_consent:true});}total.as('customer51');assert.throws(()=>total.post('customer_email_subscribe',{email:'last@example.test',marketing_consent:true}),/wait/);assert.equal(total.mails.length,50);
});
test('closed accounts and unconfirmed preferences are excluded from campaign recipients',()=>{
  const h=harness();h.post('customer_email_subscribe',{email:'a@example.test',marketing_consent:true});assert.equal(h.ctx.auroraSubscriptionCampaignRecipients_(h.ctx.auroraSpreadsheet_()).length,0);
  h.ctx.auroraSubscriptionLinkPost_('email_confirm',h.token());assert.equal(h.ctx.auroraSubscriptionCampaignRecipients_(h.ctx.auroraSpreadsheet_()).length,1);
  h.accounts[0].active=false;assert.equal(h.ctx.auroraSubscriptionCampaignRecipients_(h.ctx.auroraSpreadsheet_()).length,0);
});
test('no quota or invalid email creates neither a subscriber nor a mail attempt',()=>{
  const h=harness();for(const email of ['x','a@example.test\nBcc:bad@example.test','no space@example.test','a@-example.test'])assert.throws(()=>h.post('customer_email_subscribe',{email,marketing_consent:true}),/valid email/);
  h.setQuota(0);assert.throws(()=>h.post('customer_email_subscribe',{email:'a@example.test',marketing_consent:true}),/unavailable/);assert.equal(h.mails.length,0);assert.equal(h.rows().length,0);
});
test('unauthenticated GET cannot initialize secrets or retrieve a private preference',()=>{
  const h=harness();const before=structuredClone(h.props),writes=h.writes;
  assert.match(h.ctx.auroraSubscriptionLinkGet_('email_confirm','confirm.fake.1.fake.9999999999999.fake').html,/unavailable/);assert.deepEqual(h.props,before);assert.equal(h.writes,writes);assert.equal(h.mails.length,0);
});

test('blank or malformed consent, email verification and account active flags never qualify for campaigns',()=>{
  const h=harness();h.post('customer_email_subscribe',{email:'a@example.test',marketing_consent:true});h.ctx.auroraSubscriptionLinkPost_('email_confirm',h.token());
  for(const field of ['marketing_consent','email_verified']){
    for(const value of ['',null,undefined,false,'false',1]){h.change(0,field,value);assert.equal(h.ctx.auroraSubscriptionCampaignRecipients_(h.ctx.auroraSpreadsheet_()).length,0,field+':'+value);assert.equal(h.post('customer_email_status').subscription[field],false);}
    h.change(0,field,true);
  }
  for(const value of ['',null,undefined,false,'false',1]){h.accounts[0].active=value;assert.equal(h.ctx.auroraSubscriptionCampaignRecipients_(h.ctx.auroraSpreadsheet_()).length,0);}
  h.accounts[0].active=true;assert.equal(h.ctx.auroraSubscriptionCampaignRecipients_(h.ctx.auroraSpreadsheet_()).length,1);assert.equal(h.mails.length,1);
});

test('interrupted email replacement clears old consent before storing the new unverified address',()=>{
  const h=harness();h.post('customer_email_subscribe',{email:'verified@example.test',marketing_consent:true});h.ctx.auroraSubscriptionLinkPost_('email_confirm',h.token());
  h.advance();h.failEmailWrite();assert.throws(()=>h.post('customer_email_subscribe',{email:'not-verified@example.test',marketing_consent:true}),/Interrupted after email/);
  const row=h.rows()[0];assert.equal(row.email,'not-verified@example.test');assert.equal(row.marketing_consent,false);assert.equal(row.email_verified,false);assert.equal(row.status,'pending_confirmation');
  assert.equal(h.ctx.auroraSubscriptionCampaignRecipients_(h.ctx.auroraSpreadsheet_()).length,0);assert.equal(h.mails.length,1);
});
