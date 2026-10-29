import {generateKeyPairSync,createSign} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIREBASE_KEYS_URL,verifyFirebaseIdToken,validateFirebaseClaims
} from '../cloudflare/firebaseStaffAuth.js';
import {handleFirebaseStaffApi} from '../cloudflare/firebaseStaffApi.js';
import worker from '../cloudflare/worker.js';

const project='aurorascake-213a0';
const now=Math.floor(Date.now()/1000);
const keys=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk=keys.publicKey.export({format:'jwk'});
const base64=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
const makeToken=(overrides:Record<string,unknown>={},kid='test-kid',key=keys.privateKey)=>{
  const header=base64({alg:'RS256',kid,typ:'JWT'});
  const payload=base64({
    iss:'https://securetoken.google.com/'+project,aud:project,sub:'owner_firebase_uid',
    iat:now-100,exp:now+3000,auth_time:now-180,
    email:'owner@example.com',email_verified:true,
    firebase:{sign_in_provider:'password'},...overrides
  });
  const input=header+'.'+payload;
  const signer=createSign('RSA-SHA256');signer.update(input);signer.end();
  return input+'.'+signer.sign(key).toString('base64url');
};
const env={
  FIREBASE_PRIMARY_STAFF_ENABLED:'true',FIREBASE_MIRROR_ENABLED:'true',
  FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({type:'service_account',
    project_id:project,client_email:'test-staff@'+project+'.iam.gserviceaccount.com',
    private_key:keys.privateKey.export({format:'pem',type:'pkcs8'})}),
};
const origin='https://aurora-s-cake.sagarmia583.workers.dev';
const req=(path:string,token?:string,method='GET')=>new Request(origin+path,{
  method,headers:token?{Authorization:'Bearer '+token}:undefined
});
const roleDoc=(role='super_admin',active=true,email='owner@example.com')=>({
  name:'projects/'+project+'/databases/(default)/documents/staff_roles/owner_firebase_uid',
  fields:{role:{stringValue:role},active:{booleanValue:active},email:{stringValue:email},
    name:{stringValue:'Owner'}}
});
const orderDoc={
  name:'projects/'+project+'/databases/(default)/documents/orders/ord_abcdefghij',
  fields:{id:{stringValue:'ord_abcdefghij'},order_number:{stringValue:'AC-100'},
    customer_name:{stringValue:'Test customer'},customer_phone:{stringValue:'01700000000'},
    status:{stringValue:'pending'},created_at:{stringValue:'2026-10-29T11:00:00Z'},
    total_amount:{doubleValue:500},delivery_otp:{stringValue:'SECRET-OTP'},
    customer_access_token:{stringValue:'SECRET-RECEIPT'},items:{arrayValue:{values:[]}}}
};

test('Firebase ID token claims reject forged issuer, cross-project, expired, unverified email',()=>{
  const base={iss:'https://securetoken.google.com/'+project,aud:project,
    sub:'owner_firebase_uid',iat:now-100,exp:now+2000,auth_time:now-130,
    email:'owner@example.com',email_verified:true};
  assert.equal(validateFirebaseClaims(base,now).uid,'owner_firebase_uid');
  for(const mutation of [
    {iss:'https://accounts.google.com'}, {aud:'evil-project'},
    {email_verified:false},{exp:now-1},{auth_time:now+300},
    {sub:''},{iat:now+100},{firebase:{sign_in_provider:'anonymous'}}
  ])assert.throws(()=>validateFirebaseClaims({...base,...mutation},now));
});
test('Only a real RS256 signature over the correct Firebase project passes',async()=>{
  let keyCalls=0;
  const fetcher=async(url:RequestInfo|URL)=>{
    assert.equal(String(url),FIREBASE_KEYS_URL);keyCalls++;
    return new Response(JSON.stringify({keys:[{
      kty:'RSA',alg:'RS256',kid:'test-kid',n:jwk.n,e:jwk.e
    }]}),{status:200,headers:{'cache-control':'public, max-age=300'}});
  };
  const signed=makeToken();
  const valid=await verifyFirebaseIdToken(signed,{fetcher,nowSeconds:now});
  assert.equal(valid.email,'owner@example.com');
  assert.ok(keyCalls>=1);
  const stolen=makeToken({},'test-kid',generateKeyPairSync('rsa',{modulusLength:2048}).privateKey);
  await assert.rejects(()=>verifyFirebaseIdToken(stolen,{fetcher,nowSeconds:now}),/invalid_firebase_signature/);
  const foreign=makeToken({aud:'foreign-project'});
  await assert.rejects(()=>verifyFirebaseIdToken(foreign,{fetcher,nowSeconds:now}),/invalid_firebase_token_claims/);
});
test('Anonymous and unprovisioned clients cannot see staff orders',async()=>{
  const endpoint='/api/firebase-primary/staff/orders';
  assert.equal((await handleFirebaseStaffApi({request:req(endpoint),env})).status,401);
  const auth=async()=>({uid:'owner_firebase_uid',email:'owner@example.com',authTime:now});
  const unprovisioned=await handleFirebaseStaffApi({request:req(endpoint,makeToken()),env},{
    verifier:auth,fetcher:async(url:RequestInfo|URL,init?:RequestInit)=>{
      if(String(url).includes('oauth2.googleapis.com'))return new Response(
        JSON.stringify({access_token:'test_access',expires_in:3600}),{status:200});
      assert.match(String(url),/staff_roles/);
      return new Response('',{status:404});
    }
  });
  assert.equal(unprovisioned.status,403);
  assert.equal((await unprovisioned.json() as any).code,'staff_role_not_provisioned');
});
test('Provisioned active Firebase staff sees only whitelisted private order fields',async()=>{
  let roleReads=0,orderReads=0;
  const result=await handleFirebaseStaffApi({
    request:req('/api/firebase-primary/staff/orders?role=super_admin',makeToken()),env
  },{
    verifier:async()=>({uid:'owner_firebase_uid',email:'owner@example.com',authTime:now}),
    fetcher:async(url:RequestInfo|URL)=>{
      const target=String(url);
      if(target.includes('oauth2.googleapis.com'))return new Response(
        JSON.stringify({access_token:'test_access',expires_in:3600}),{status:200});
      if(target.includes('/staff_roles/')){roleReads++;return new Response(JSON.stringify(roleDoc()),{status:200});}
      if(target.includes('/orders?')){orderReads++;return new Response(JSON.stringify({documents:[orderDoc]}),{status:200});}
      throw new Error('Unexpected URL '+target);
    }
  });
  assert.equal(result.status,200);
  const body=await result.json() as any;
  assert.equal(body.read_only,true);
  assert.equal(body.orders.length,1);
  assert.equal(body.orders[0].total_amount,500);
  assert.equal(roleReads,1);assert.equal(orderReads,1);
  const text=JSON.stringify(body);
  assert.equal(text.includes('SECRET-OTP'),false);
  assert.equal(text.includes('SECRET-RECEIPT'),false);
});
test('Disabled role or spoofed email fails closed before reading orders',async()=>{
  for(const document of [roleDoc('super_admin',false),roleDoc('super_admin',true,'other@example.com')]){
    const response=await handleFirebaseStaffApi({
      request:req('/api/firebase-primary/staff/orders',makeToken()),env
    },{
      verifier:async()=>({uid:'owner_firebase_uid',email:'owner@example.com',authTime:now}),
      fetcher:async(url:RequestInfo|URL)=>{
        if(String(url).includes('oauth2.googleapis.com'))return new Response(
          JSON.stringify({access_token:'test_access',expires_in:3600}),{status:200});
        if(String(url).includes('/staff_roles/'))return new Response(JSON.stringify(document),{status:200});
        throw new Error('Unauthorized user must not get order query');
      }
    });
    assert.equal(response.status,403);
  }
});
test('Worker routing does not accept unauthenticated staff read or any writes',async()=>{
  const runtime={...env,ASSETS:{fetch:async()=>new Response('asset')}};
  const none=await worker.fetch(req('/api/firebase-primary/staff/session'),runtime);
  assert.equal(none.status,401);
  const post=await worker.fetch(req('/api/firebase-primary/staff/orders',undefined,'POST'),runtime);
  assert.equal(post.status,405);
});
