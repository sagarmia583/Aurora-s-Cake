import assert from 'node:assert/strict';
import test from 'node:test';
import relay from '../netlify/functions/operations.mjs';
import { ORDER_RECEIPT_BASE, readOrderTrackingKey, websiteOrderTrackingLink } from '../apps/staff-mobile/src/orderTrackingLink';

const origin='https://aurorascake.netlify.app';
const endpoint=origin+'/api/operations';
const configured='https://script.google.com/macros/s/AKfycbw38J4AzlYkAhNtyDAp_CP34fUk9Epae6xz46AQFbF9ye1VsZjxTXmzbJgs52WEoWETMw/exec';
const make=(action:string,originValue=origin)=>new Request(endpoint,{method:'POST',
  headers:{'Content-Type':'text/plain;charset=utf-8','Origin':originValue},
  body:JSON.stringify({action,id_token:'redacted-token'})});
test('free POST relay refuses off-origin use, unsupported routes and non-POST requests',async()=>{
  assert.equal((await relay(new Request(endpoint))).status,405);
  assert.equal((await relay(make('staff_orders','https://malicious.example'))).status,403);
  assert.equal((await relay(make('get_every_private_order'))).status,400);
  assert.equal((await relay(make('customer_phone_history'))).status,400);
});
test('free POST relay accepts only a pinned Google Apps Script HTTPS endpoint',async()=>{
  const old=process.env.AURORA_SCRIPT_POST_URL;
  try{
    process.env.AURORA_SCRIPT_POST_URL='https://example.com/fake';
    assert.equal((await relay(make('staff_orders'))).status,503);
    process.env.AURORA_SCRIPT_POST_URL='https://script.google.com.evil.example/macros/s/bad/exec';
    assert.equal((await relay(make('staff_orders'))).status,503);
  }finally{
    if(old===undefined)delete process.env.AURORA_SCRIPT_POST_URL;else process.env.AURORA_SCRIPT_POST_URL=old;
  }
});
test('free relay forwards selected action without printing Google tokens or exposing upstream redirects',async()=>{
  const oldEnv=process.env.AURORA_SCRIPT_POST_URL;
  const previous=globalThis.fetch;
  process.env.AURORA_SCRIPT_POST_URL=configured;
  let lastUrl='',received='';
  globalThis.fetch=(async(url:RequestInfo|URL,options?:RequestInit)=>{
    lastUrl=String(url);received=String(options?.body);
    return {ok:true,url:'https://script.googleusercontent.com/macros/echo?x=1',text:async()=>JSON.stringify({ok:true,role:'admin'})} as Response;
  }) as typeof fetch;
  try {
    const response=await relay(make('staff_session'));
    assert.equal(response.status,200);
    assert.equal((await response.json()).role,'admin');
    assert.equal(lastUrl,configured);
    assert.match(received,/staff_session/);
    assert.equal(response.headers.get('Cache-Control'),'no-store');
  }finally{
    globalThis.fetch=previous;
    if(oldEnv===undefined)delete process.env.AURORA_SCRIPT_POST_URL;else process.env.AURORA_SCRIPT_POST_URL=oldEnv;
  }
});

test('customer links use the website and keep the original private key in the fragment', () => {
  const id = 'ord_11111111-1111-4111-8111-111111111111';
  const key = 'a'.repeat(72);
  const legacy = ORDER_RECEIPT_BASE + '?action=receipt&ref=' + id + '&access=' + key;
  const tracking = new URL(websiteOrderTrackingLink(legacy, id));
  assert.equal(tracking.origin + tracking.pathname, 'https://aurorascake.netlify.app/track-order');
  assert.equal(tracking.search, '');
  assert.deepEqual(readOrderTrackingKey(new URLSearchParams(tracking.hash.slice(1))), {orderId: id, accessKey: key});
  assert.equal(websiteOrderTrackingLink(legacy, id.replace(/1$/, '2')), '');
  assert.equal(websiteOrderTrackingLink(legacy.replace('script.google.com', 'example.com'), id), '');
});

test('tracking reads fail closed when Netlify has no backend, and work with its configured script', async () => {
  let calls=0;
  const fetcher=(async (url, request) => {
    calls++;
    assert.equal(url, configured);
    assert.equal(JSON.parse(String(request?.body)).action, 'customer_shared_order');
    return {ok:true,url:configured,text:async()=>JSON.stringify({ok:false,code:'forbidden'})} as Response;
  }) as typeof fetch;
  assert.equal((await relay(make('customer_shared_order'),{scriptUrl:'',fetcher})).status,503);
  assert.equal((await relay(make('staff_orders'),{scriptUrl:'',fetcher})).status,503);
  assert.equal(calls,0,'no authenticated request may accidentally reach production');
  const response = await relay(make('customer_shared_order'),{scriptUrl:configured,fetcher});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.equal((await response.json()).code,'forbidden');
  assert.equal(calls,1);
});

test('production builds customer links from the configured deployment after its URL changes', async () => {
  const id='ord_11111111-1111-4111-8111-111111111111';
  const key='a'.repeat(72);
  const scriptUrl='https://script.google.com/macros/s/new_deployment/exec';
  const rawLink=scriptUrl+'?action=receipt&ref='+id+'&access='+key;
  const req=new Request(endpoint,{method:'POST',headers:{Origin:origin},
    body:JSON.stringify({action:'staff_order_link',order_id:id})});
  const fetcher=(async()=>({
    ok:true,url:scriptUrl,text:async()=>JSON.stringify({ok:true,order_id:id,share_url:rawLink}),
  } as Response)) as typeof fetch;
  const result=await relay(req,{scriptUrl,fetcher});
  const shareUrl=(await result.json()).share_url;
  assert.equal(result.status,200);
  assert.equal(shareUrl,origin+'/track-order#ref='+id+'&access='+key);
  assert.equal(websiteOrderTrackingLink(shareUrl,id),shareUrl);
  assert.equal(websiteOrderTrackingLink(rawLink,id),'');
});

test('Netlify Deploy Preview blocks all POST actions before any production Apps Script request',async()=>{
  let calls=0;
  const scriptUrl=configured;
  const fetcher=(async()=>{
    calls++;
    throw new Error('Preview must never contact the live Google Sheet');
  }) as typeof fetch;
  for(const url of [
    'https://deploy-preview-43--aurorascake.netlify.app/api/operations',
    'https://feature-checkout--aurorascake.netlify.app/api/operations',
  ]){
    for(const action of ['create_order','staff_mutate','staff_password_login','get_order_status']){
      const target=new URL(url);
      const request=new Request(url,{method:'POST',headers:{Origin:target.origin},body:JSON.stringify({action})});
      const result=await relay(request,{scriptUrl,fetcher});
      assert.equal(result.status,403,action);
    }
  }
  assert.equal(calls,0);
});
