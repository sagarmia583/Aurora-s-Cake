import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmailSubscriptionPanel } from '../src/components/EmailSubscriptionPanel';
import { getEmailSubscription, requestEmailSubscription, unsubscribeEmail, validateEmailSubscription, isEmailSetupUnavailable } from '../src/services/emailSubscriptions';
import { BakeryOperationsError } from '../src/services/sheetStaffApi';
import relay from '../netlify/functions/operations.mjs';
const endpoint='https://script.google.com/macros/s/TEST_DEPLOYMENT/exec';

test('email updates are optional and unchecked; guest users see an account sign-in path',()=>{
  const guest=renderToStaticMarkup(<EmailSubscriptionPanel endpoint={endpoint} onSignIn={()=>{}}/>);assert.match(guest,/Sign in to manage emails/);assert.doesNotMatch(guest,/type="checkbox"/);
  const signed=renderToStaticMarkup(<EmailSubscriptionPanel endpoint={endpoint} authToken="private-session" initialEmail="customer@example.test"/>);
  assert.match(signed,/type="checkbox"/);assert.doesNotMatch(signed,/checked=""/);assert.match(signed,/Send confirmation email/);assert.match(signed,/disabled=""/);
});
test('authenticated email preference writes use private POST bodies and never expose credentials or addresses in URLs',async()=>{
  const old=globalThis.fetch;const calls:{url:string;body:Record<string,unknown>}[]=[];
  globalThis.fetch=(async(url:RequestInfo|URL,options?:RequestInit)=>{calls.push({url:String(url),body:JSON.parse(String(options?.body))});return new Response(JSON.stringify({ok:true,subscription:{email:'customer@example.test',status:'pending_confirmation',marketing_consent:false,email_verified:false}}),{status:200,headers:{'Content-Type':'application/json'}});}) as typeof fetch;
  try{
    await assert.rejects(()=>requestEmailSubscription(endpoint,'private-session','customer@example.test',false),/Choose product/);assert.equal(calls.length,0);
    await requestEmailSubscription(endpoint,'private-session','customer@example.test',true);await getEmailSubscription(endpoint,'private-session');await unsubscribeEmail(endpoint,'private-session');
    assert.deepEqual(calls.map(call=>call.body.action),['customer_email_subscribe','customer_email_status','customer_email_unsubscribe']);
    assert.equal(calls[0].body.marketing_consent,true);assert.equal(calls[0].body.auth_token,'private-session');
    assert.equal(calls.every(call=>!call.url.includes('private-session')&&!call.url.includes('customer@example.test')),true);
  }finally{globalThis.fetch=old;}
});
test('malformed or falsely verified preferences fail validation, and an old backend is identified without affecting login',()=>{
  assert.throws(()=>validateEmailSubscription({email:'x@example.test',status:'subscribed',marketing_consent:true,email_verified:false}),/could not be verified/);
  assert.throws(()=>validateEmailSubscription({email:'x@example.test',status:'subscribed',marketing_consent:'true',email_verified:true}),/could not be verified/);
  assert.equal(isEmailSetupUnavailable(new BakeryOperationsError('unknown action','invalid_action')),true);assert.equal(isEmailSetupUnavailable(new BakeryOperationsError('setup','setup_required')),true);assert.equal(isEmailSetupUnavailable(new Error('network')),false);
});
test('the shared Cloudflare/Vercel/Netlify relay accepts only customer email controls and denies campaign sends',async()=>{
  const forwarded:string[]=[];
  const fetcher=(async(_url:RequestInfo|URL,options?:RequestInit)=>{forwarded.push(JSON.parse(String(options?.body)).action);return {ok:true,url:'https://script.googleusercontent.com/macros/echo?test=1',text:async()=>JSON.stringify({ok:true})} as Response;}) as typeof fetch;
  const request=(action:string)=>new Request('https://bakery.test/api/operations',{method:'POST',headers:{Origin:'https://bakery.test','Content-Type':'text/plain'},body:JSON.stringify({action,auth_token:'private-session'})});
  for(const action of ['customer_email_status','customer_email_subscribe','customer_email_unsubscribe','customer_phone_save_order_profile'])assert.equal((await relay(request(action),{scriptUrl:endpoint,fetcher})).status,200);
  for(const action of ['send_campaign','auroraConfirmCampaign','email_confirm','email_unsubscribe'])assert.equal((await relay(request(action),{scriptUrl:endpoint,fetcher})).status,400);
  assert.equal(forwarded.length,4);
});
