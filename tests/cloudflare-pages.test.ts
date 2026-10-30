import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest as operations } from '../functions/api/operations.js';
import { onRequest as publicData } from '../functions/api/public.js';
import { onRequest as backendHealth } from '../functions/api/backend-health.js';
import { onRequest as imageHandler } from '../functions/api/image.js';
import { onRequest as mirrorStatus } from '../functions/api/firebase-sync-status.js';
import { scriptUrl } from '../cloudflare/shared.js';

const endpoint='https://script.google.com/macros/s/AKfycbFakeLongValidUid_1234567/exec';
const env={
  AURORA_SCRIPT_POST_URL:endpoint,
  FIREBASE_MIRROR_ENABLED:'false',
  FIREBASE_SERVICE_ACCOUNT_JSON:'',
};
const origin='https://auroras-cake-pages.pages.dev';
const request=(path:string,method='GET',payload?:unknown,requestOrigin=origin)=>
  new Request(origin+path,{method,
    headers: payload ? {'content-type':'text/plain;charset=utf-8','origin':requestOrigin}:undefined,
    body:payload?JSON.stringify(payload):undefined,
  });
const jsonOf=async (response:Response)=>await response.json() as Record<string,any>;

test('Cloudflare Page function uses only approved Apps Script backend and rejects untrusted URLs',()=>{
  assert.equal(scriptUrl(env)?.href,endpoint);
  assert.equal(scriptUrl({AURORA_SCRIPT_POST_URL:'https://evil.example/macros/s/x/exec'}),null);
  assert.equal(scriptUrl({AURORA_SCRIPT_POST_URL:'https://script.google.com.evil.example/macros/s/x/exec'}),null);
  assert.equal(scriptUrl({AURORA_SCRIPT_POST_URL:endpoint+'?other=1'}),null);
});
test('Cloudflare operations disallow untrusted Origin, GET, and unknown operations',async()=>{
  assert.equal((await operations({request:request('/api/operations'),env})).status,405);
  assert.equal((await operations({request:request('/api/operations','POST',{action:'get_full_database'}),env})).status,400);
  assert.equal((await operations({
    request:request('/api/operations','POST',{action:'staff_orders'},'https://attacker.example'),env
  })).status,403);
});
test('Cloudflare proxy relays staff responses without modifying source or accessing Firestore',async()=>{
  const previous=globalThis.fetch;
  let forwardedUrl='',forwardedBody='';
  globalThis.fetch=(async (url:RequestInfo|URL,opts?:RequestInit)=>{
    forwardedUrl=String(url);forwardedBody=String(opts?.body);
    return {
      ok:true,status:200,url:'https://script.googleusercontent.com/macros/echo?key=mock',
      text:async()=>JSON.stringify({ok:true,role:'delivery_man'}),
    } as Response;
  }) as typeof fetch;
  try{
    const r=await operations({request:request('/api/operations','POST',
      {action:'staff_session',id_token:'mock'}),env});
    assert.equal(r.status,200);
    assert.deepEqual(await jsonOf(r),{ok:true,role:'delivery_man'});
    assert.equal(r.headers.get('cache-control'),'no-store');
    assert.equal(forwardedUrl,endpoint);
    assert.match(forwardedBody,/staff_session/);
  }finally{globalThis.fetch=previous;}
});
test('Cloudflare order mirror only consumes server-confirmed successful receipt',async()=>{
  const previous=globalThis.fetch;
  globalThis.fetch=(async()=>{
    return {
      ok:true,status:200,url:'https://script.googleusercontent.com/macros/echo?key=mock',
      text:async()=>JSON.stringify({success:true,persisted:true,order:{id:'ord_fake'}}),
    } as Response;
  }) as typeof fetch;
  try{
    const r=await operations({request:request('/api/operations','POST',
      {action:'create_order',request_id:'test'}),env});
    assert.equal(r.status,200);
    assert.equal(r.headers.get('x-aurora-firebase-mirror'),'not_configured');
    assert.equal((await jsonOf(r)).persisted,true);
  }finally{globalThis.fetch=previous;}
});
test('Cloudflare public proxy validates structured Apps Script response',async()=>{
  const previous=globalThis.fetch;
  globalThis.fetch=(async()=>{
    return {ok:true,url:'https://script.googleusercontent.com/macros/echo',
      text:async()=>JSON.stringify({ok:true,schema_version:1,data:{products:[]}})} as Response;
  }) as typeof fetch;
  try{
    const r=await publicData({request:request('/api/public'),env});
    assert.equal(r.status,200);
    assert.equal((await jsonOf(r)).schema_version,1);
  }finally{globalThis.fetch=previous;}
});
test('Cloudflare health check follows release semantics',async()=>{
  const previous=globalThis.fetch;
  globalThis.fetch=(async()=>({ok:true,url:'https://script.googleusercontent.com/macros/echo',
    json:async()=>({ok:true,service:'aurora_public_content',release:'old-release',database_backend:'google_sheets',private_key:'never-output'})}) as Response) as typeof fetch;
  try{
    const r=await backendHealth({request:request('/api/backend-health'),env});
    const result=await jsonOf(r);
    assert.equal(result.up_to_date,false);
    assert.equal(result.database_backend,'google_sheets');
    assert.equal(JSON.stringify(result).includes('never-output'),false);
  }finally{globalThis.fetch=previous;}
});
test('Cloudflare image refuses unknown IDs, missing configuration and untrusted hosts',async()=>{
  assert.equal((await imageHandler({request:request('/api/image?id=bad'),env})).status,404);
  assert.equal((await imageHandler({request:request('/api/image?id=validImage_123456789012'),
    env:{AURORA_SCRIPT_POST_URL:''}})).status,503);
});
test('Cloudflare Firestore readiness never discloses secrets',async()=>{
  const secretEnv={...env,FIREBASE_MIRROR_ENABLED:'true',
    FIREBASE_SERVICE_ACCOUNT_JSON:'not-json-secret-PRIVATE123'};
  const r=await mirrorStatus({request:request('/api/firebase-sync-status'),env:secretEnv});
  const body=await r.text();
  assert.equal(JSON.parse(body).configured,false);
  assert.equal(body.includes('PRIVATE123'),false);
  assert.equal(JSON.parse(body).project_id,'aurorascake-213a0');
});

test('Cloudflare Firebase status identifies credential problems without leaking secrets',async()=>{
  const wrongProject={type:'service_account',project_id:'unrelated-project',
    client_email:'mirror@unrelated-project.iam.gserviceaccount.com',
    private_key:'-----BEGIN PRIVATE KEY-----\\nINVALID\\n-----END PRIVATE KEY-----'};
  const cases=[
    {value:'not-json',reason:'invalid_json'},
    {value:JSON.stringify(wrongProject),reason:'wrong_project_id'},
    {value:JSON.stringify({...wrongProject,project_id:'aurorascake-213a0'}),reason:'invalid_private_key'},
  ];
  for(const item of cases){
    const r=await mirrorStatus({request:request('/api/firebase-sync-status'),
      env:{...env,FIREBASE_MIRROR_ENABLED:'true',FIREBASE_SERVICE_ACCOUNT_JSON:item.value}});
    const body=await r.text();
    assert.equal(JSON.parse(body).configuration_code,item.reason);
    assert.equal(JSON.parse(body).deployment_platform,'cloudflare_pages');
    assert.ok(!body.includes('BEGIN PRIVATE KEY'));
  }
});

test('Cloudflare Firestore probe does not trust client-supplied role or raw access tokens',async()=>{
  const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,
    privateKeyEncoding:{type:'pkcs8',format:'pem'},
    publicKeyEncoding:{type:'spki',format:'pem'}});
  const probeEnv={...env,FIREBASE_MIRROR_ENABLED:'true',
    FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({
      type:'service_account',project_id:'aurorascake-213a0',
      client_email:'mirror@aurorascake-213a0.iam.gserviceaccount.com',
      private_key:privateKey,
    })};
  const previous=globalThis.fetch;
  let role='delivery_man';
  const requests:string[]=[];
  globalThis.fetch=(async(url:RequestInfo|URL,options?:RequestInit)=>{
    const target=String(url); requests.push(target);
    if(target===endpoint) return {
      ok:true,status:200,url:'https://script.googleusercontent.com/macros/echo',
      text:async()=>JSON.stringify({ok:true,role,orders:[],snapshot_complete:true}),
    } as Response;
    if(target.includes('oauth2.googleapis.com/token'))return new Response(
      JSON.stringify({access_token:'fake_access_token',expires_in:3600}),{status:200});
    if(target.includes('firestore.googleapis.com')) {
      assert.equal(options?.method,'PATCH');
      assert.match(String(options?.body),/server_side_mirror_permission_test/);
      return new Response(JSON.stringify({name:'integration_checks/cloudflare_pages'}),{status:200});
    }
    throw new Error('Unexpected outgoing request '+target);
  }) as typeof fetch;
  try{
    const payload={action:'staff_orders',id_token:'fake-staff-token',firebase_mirror_probe:true,
      role:'super_admin'};
    let r=await operations({request:request('/api/operations','POST',payload),env:probeEnv});
    assert.equal(r.status,200);
    assert.equal((await jsonOf(r)).firebase_probe,undefined);
    assert.equal(requests.filter(x=>x.includes('firestore.googleapis.com')).length,0);
    role='super_admin';
    r=await operations({request:request('/api/operations','POST',payload),env:probeEnv});
    assert.equal(r.status,200);
    assert.deepEqual((await jsonOf(r)).firebase_probe,{ok:true,code:'write_verified'});
    assert.equal(requests.filter(x=>x.includes('firestore.googleapis.com')).length,1);
  }finally{globalThis.fetch=previous;}
});
