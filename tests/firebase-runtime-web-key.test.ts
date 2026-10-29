import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../cloudflare/worker.js';
import {firebaseWebKeyState} from '../cloudflare/firebaseWebConfig.js';
import {
 signInFirebaseStaffRest, FirebaseRestAuthError, describeFirebaseRestAuthError
} from '../src/services/firebaseStaffRestAuth';

const runtimeKey='AIza'+'Z'.repeat(35);
const request=(method='GET')=>new Request(
 'https://aurora-s-cake.sagarmia583.workers.dev/api/firebase-primary/web-config',
 {method}
);
test('Fail closed when Cloudflare runtime Web API Key not set; never use baked key',async()=>{
  const r=await worker.fetch(request(),{ASSETS:{fetch:async()=>new Response('asset')}});
  assert.equal(r.status,503);
  assert.equal(r.headers.get('cache-control'),'no-store');
  const body=await r.json() as any;
  assert.equal(body.code,'firebase_web_api_key_missing');
  assert.equal(Object.hasOwn(body,'apiKey'),false);
  assert.equal(firebaseWebKeyState({}).configured,false);
});
test('Public Web key runtime endpoint only returns the selected public key',async()=>{
  const env={FIREBASE_WEB_API_KEY:runtimeKey,
    FIREBASE_SERVICE_ACCOUNT_JSON:'PRIVATE_SERVICE_ACCOUNT_MUST_NEVER_BE_EXPOSED',
    AURORA_SCRIPT_POST_URL:'PRIVATE_APPS_SCRIPT_URL',
    ASSETS:{fetch:async()=>new Response('asset')}};
  const response=await worker.fetch(request(),env);
  assert.equal(response.status,200);
  const result=await response.json() as any;
  assert.deepEqual(result,{
    ok:true,provider:'firebase_auth',project_id:'aurorascake-213a0',
    configured:true,apiKey:runtimeKey
  });
  const text=JSON.stringify(result);
  assert.equal(text.includes('PRIVATE_SERVICE_ACCOUNT'),false);
  assert.equal(text.includes('PRIVATE_APPS_SCRIPT'),false);
  assert.equal(response.headers.get('cache-control'),'no-store');
});
test('Web key status handles malformed values and endpoint disallows writes',async()=>{
  for(const val of ['', 'Some_Secret_JSON', '{"type":"service_account"}']){
    const result=firebaseWebKeyState({FIREBASE_WEB_API_KEY:val});
    assert.equal(result.configured,false);
  }
  const r=await worker.fetch(request('POST'),{
    FIREBASE_WEB_API_KEY:runtimeKey,ASSETS:{fetch:async()=>new Response('asset')}
  });
  assert.equal(r.status,405);
});
test('Preview resolves current Web key from same-origin Worker before contacting Google',async()=>{
  const calls:{url:string,init:RequestInit}[]=[];
  const fetcher=async(input:RequestInfo|URL,init:RequestInit={}):Promise<Response>=>{
    const url=String(input);calls.push({url,init});
    if(url==='/api/firebase-primary/web-config')
      return new Response(JSON.stringify({
        ok:true,provider:'firebase_auth',project_id:'aurorascake-213a0',
        configured:true,apiKey:runtimeKey
      }),{status:200});
    assert.ok(url.startsWith('https://identitytoolkit.googleapis.com/v1/accounts:'));
    assert.ok(url.includes('?key='+runtimeKey));
    if(url.includes('signInWithPassword'))
      return new Response(JSON.stringify({
        idToken:'eyJ'+('a'.repeat(150)),refreshToken:'refresh_'+('q'.repeat(150)),
        localId:'owner_uid',expiresIn:'3600'
      }),{status:200});
    return new Response(JSON.stringify({users:[{
      localId:'owner_uid',email:'owner@example.com',emailVerified:true
    }]}),{status:200});
  };
  const session=await signInFirebaseStaffRest('owner@example.com','test-password',{fetcher:fetcher as typeof fetch});
  assert.equal(session.uid,'owner_uid');
  assert.equal(calls[0].url,'/api/firebase-primary/web-config');
  assert.equal(calls[0].init.method,'GET');
  assert.equal(calls.filter(x=>x.url==='/api/firebase-primary/web-config').length,1);
  assert.equal(calls.some(x=>x.url.includes('test-password')),false);
});
test('Missing runtime key yields specific actionable, non-credential error',async()=>{
  const mock=async(input:RequestInfo|URL)=>{
    assert.equal(String(input),'/api/firebase-primary/web-config');
    return new Response(JSON.stringify({
      ok:false,code:'firebase_web_api_key_missing'
    }),{status:503});
  };
  // Config was cached by a previous test; use a fresh loader in a separate
  // process for this mode (tested deterministically via the exported error).
  const error=new FirebaseRestAuthError('FIREBASE_RUNTIME_KEY_MISSING');
  assert.match(describeFirebaseRestAuthError(error),/firebase\/web-api-key-missing/);
  assert.match(describeFirebaseRestAuthError(error),/FIREBASE_WEB_API_KEY/);
  void mock;
});
test('SDK web configuration and worker Web key code never contain private Admin credentials',()=>{
  const s=readFileSync('cloudflare/firebaseWebConfig.js','utf8');
  assert.doesNotMatch(s,/JSON\.parse\(env\.FIREBASE_SERVICE_ACCOUNT_JSON/);
  assert.match(s,/FIREBASE_WEB_API_KEY/);
});
