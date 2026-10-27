import assert from 'node:assert/strict';
import test from 'node:test';
import relay from '../netlify/functions/operations.mjs';

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
    const phoneTracking=await relay(make('customer_phone_tracking'));
    assert.equal(phoneTracking.status,200);
    assert.match(received,/customer_phone_tracking/);
    assert.equal(response.headers.get('Cache-Control'),'no-store');
  }finally{
    globalThis.fetch=previous;
    if(oldEnv===undefined)delete process.env.AURORA_SCRIPT_POST_URL;else process.env.AURORA_SCRIPT_POST_URL=oldEnv;
  }
});
