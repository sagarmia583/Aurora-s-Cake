import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/worker.js';

const script='https://script.google.com/macros/s/AKfycbFakeLongValidUid_1234567/exec';
const origin='https://aurora-s-cake.sagarmia583.workers.dev';
const env={
  AURORA_SCRIPT_POST_URL:script,
  FIREBASE_MIRROR_ENABLED:'false',
  FIREBASE_SERVICE_ACCOUNT_JSON:'',
  ASSETS:{fetch:async(request:Request)=>new Response('static:'+new URL(request.url).pathname,{status:200})},
};
const make=(pathname:string,method='GET',payload?:Record<string,unknown>,
  callerOrigin=origin)=>new Request(origin+pathname,{method,
    headers:payload?{'content-type':'text/plain;charset=utf-8',origin:callerOrigin}:undefined,
    body:payload?JSON.stringify(payload):undefined});

test('Worker routes static assets through ASSETS rather than returning the API React shell',async()=>{
  const asset=await worker.fetch(make('/assets/main-example.js'),env);
  assert.equal(await asset.text(),'static:/assets/main-example.js');
  const unknown=await worker.fetch(make('/api/unknown'),env);
  assert.equal(unknown.status,404);
  assert.match(await unknown.text(),/Unknown API route/);
});
test('Worker exposes API Firebase status and keeps server secrets out of response',async()=>{
  const response=await worker.fetch(make('/api/firebase-sync-status'),env);
  assert.equal(response.status,200);
  const body=await response.json() as Record<string,unknown>;
  assert.equal(body.provider,'firestore');
  assert.equal(body.enabled,false);
  assert.equal(body.deployment_platform,'cloudflare_pages');
  assert.equal(JSON.stringify(body).includes(script),false);
});
test('Worker checkout endpoint rejects hostile origins, invalid actions and GET',async()=>{
  assert.equal((await worker.fetch(make('/api/operations'),env)).status,405);
  assert.equal((await worker.fetch(make('/api/operations','POST',{action:'get_private_staff'}),env)).status,400);
  assert.equal((await worker.fetch(make('/api/operations','POST',{action:'staff_orders'},'https://bad.example'),env)).status,403);
});
test('Worker checkout forwards to Apps Script and responds without exposing receipt access',async()=>{
  const original=globalThis.fetch;
  let received='';
  globalThis.fetch=(async(url:RequestInfo|URL,init?:RequestInit)=>{
    received=String(init?.body);
    assert.equal(String(url),script);
    return {ok:true,status:200,url:'https://script.googleusercontent.com/macros/echo',
      text:async()=>JSON.stringify({ok:true,role:'order_manager'})} as Response;
  }) as typeof fetch;
  try {
    const response=await worker.fetch(make('/api/operations','POST',{action:'staff_session',id_token:'dummy'}),env);
    assert.equal(response.status,200);
    assert.equal((await response.json() as Record<string,unknown>).role,'order_manager');
    assert.match(received,/staff_session/);
  }finally{globalThis.fetch=original;}
});
