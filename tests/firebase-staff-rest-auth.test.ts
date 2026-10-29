import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  signInFirebaseStaffRest, refreshFirebaseStaffRest,
  sendFirebaseStaffVerification,requestFirebaseStaffPasswordReset,
  describeFirebaseRestAuthError,FirebaseRestAuthError
} from '../src/services/firebaseStaffRestAuth';

const apiKey='AIza'+'A'.repeat(35);
const idToken='eyJ'+('a'.repeat(250));
const nextToken='eyJ'+('b'.repeat(250));
const refreshToken='refresh_'+('q'.repeat(200));
const uid='BBvIWbYlSnYDmCVUZWooGHhJ1OO2';
const email='owner@example.com';
const ok=(body:unknown)=>new Response(JSON.stringify(body),{status:200});
const err=(code:string)=>new Response(JSON.stringify({error:{message:code,code:400}}),{status:400});
type RequestRecord={url:string;init:RequestInit};
const useMock=(handler:(r:RequestRecord)=>Response)=>{
  const records:RequestRecord[]=[];
  const fetcher=async(input:RequestInfo|URL,init?:RequestInit):Promise<Response>=>{
    const record={url:String(input),init:init||{}};
    records.push(record);return handler(record);
  };
  return {records,fetcher:fetcher as typeof fetch,apiKey,now:()=>1000000};
};

test('REST sign-in goes straight to Google HTTPS, never Cloudflare or Apps Script',async()=>{
  let signInCalls=0;
  const mock=useMock(({url,init})=>{
    assert.ok(url.startsWith('https://identitytoolkit.googleapis.com/v1/accounts:'));
    assert.equal(init.method,'POST');
    if(url.includes(':signInWithPassword?')){
      signInCalls++;
      assert.deepEqual(JSON.parse(String(init.body)),{
        email,password:'not-a-real-password',returnSecureToken:true
      });
      return ok({idToken,refreshToken,localId:uid,expiresIn:'3600'});
    }
    if(url.includes(':lookup?')){
      const json=JSON.parse(String(init.body));
      assert.equal(json.idToken,idToken);
      return ok({users:[{localId:uid,email,emailVerified:true}]});
    }
    throw new Error('unexpected auth endpoint');
  });
  const session=await signInFirebaseStaffRest(email,'not-a-real-password',mock);
  assert.equal(signInCalls,1);
  assert.equal(session.uid,uid);assert.equal(session.email,email);
  assert.equal(session.emailVerified,true);
  assert.equal(session.expiresAt,4600000);
  assert.equal(session.idToken,idToken);
  assert.equal(session.refreshToken,refreshToken);
  assert.equal(mock.records.length,2);
  // Endpoint must not put credentials in a URL, or send them to Cloudflare.
  for(const {url} of mock.records){
    assert.equal(url.includes(email),false);
    assert.equal(url.includes('not-a-real-password'),false);
    assert.equal(url.includes('workers.dev'),false);
  }
});

test('Incorrect email, invalid credential and unknown user map to the same safe UI message',async()=>{
  for(const code of ['INVALID_LOGIN_CREDENTIALS','INVALID_PASSWORD','EMAIL_NOT_FOUND']){
    const mock=useMock(()=>err(code));
    let e:unknown;
    try{await signInFirebaseStaffRest(email,'wrong',mock);}catch(error){e=error;}
    assert.ok(e instanceof FirebaseRestAuthError);
    assert.equal(describeFirebaseRestAuthError(e).includes('auth/invalid-credential'),true);
    assert.equal(describeFirebaseRestAuthError(e).includes('EMAIL_NOT_FOUND'),false);
    assert.equal(describeFirebaseRestAuthError(e).includes('INVALID_PASSWORD'),false);
  }
});
test('Provider disabled, rate limiting and network errors are safely classified',async()=>{
  for(const [apiCode,expected] of [
    ['OPERATION_NOT_ALLOWED','auth/operation-not-allowed'],
    ['TOO_MANY_ATTEMPTS_TRY_LATER','auth/too-many-requests'],
    ['API_KEY_INVALID','firebase/configuration']
  ]){
    const mock=useMock(()=>err(apiCode));
    await assert.rejects(()=>signInFirebaseStaffRest(email,'pwd',mock),e=>{
      assert.match(describeFirebaseRestAuthError(e),new RegExp(expected));return true;
    });
  }
  const failing=async()=>{throw new Error('SECRET_PII_OR_PRIVATE_URL');};
  await assert.rejects(()=>signInFirebaseStaffRest(email,'pwd',
    {apiKey,fetcher:failing as typeof fetch}),e=>{
    const message=describeFirebaseRestAuthError(e);
    assert.match(message,/network-unavailable/);
    assert.doesNotMatch(message,/SECRET_PII/);return true;
  });
});
test('Profile UID mismatch prevents session and keeps role protected',async()=>{
  const mock=useMock(({url})=>url.includes(':lookup?')
    ?ok({users:[{localId:'unrelated_uid',email,emailVerified:true}]})
    :ok({idToken,refreshToken,localId:uid,expiresIn:'3600'}));
  await assert.rejects(()=>signInFirebaseStaffRest(email,'pwd',mock),
    /AUTH_IDENTITY_MISMATCH/);
});
test('Refresh acquires new signed ID token and rechecks verified email',async()=>{
  let usedRefresh=false;
  const mock=useMock(({url,init})=>{
    if(url.startsWith('https://securetoken.googleapis.com/')){
      usedRefresh=true;
      assert.match(String(init.body),/grant_type=refresh_token/);
      return ok({id_token:nextToken,refresh_token:refreshToken,user_id:uid,
        expires_in:'3600'});
    }
    assert.ok(url.includes(':lookup?'));
    return ok({users:[{localId:uid,email,emailVerified:true}]});
  });
  const old={idToken,refreshToken,uid,email,emailVerified:false,expiresAt:0};
  const updated=await refreshFirebaseStaffRest(old,mock);
  assert.equal(usedRefresh,true);
  assert.equal(updated.emailVerified,true);
  assert.equal(updated.idToken,nextToken);
  assert.equal(updated.uid,uid);
});
test('Verification and password reset use official endpoint without exposing account existence',async()=>{
  const session={idToken,refreshToken,uid,email,emailVerified:false,expiresAt:1};
  let verified=false;
  const mock=useMock(({url,init})=>{
    assert.match(url,/:sendOobCode\?/);
    const body=JSON.parse(String(init.body));
    if(body.requestType==='VERIFY_EMAIL'){
      assert.equal(body.idToken,idToken);verified=true;return ok({email});
    }
    assert.equal(body.requestType,'PASSWORD_RESET');
    return err('EMAIL_NOT_FOUND');
  });
  await sendFirebaseStaffVerification(session,mock);
  await requestFirebaseStaffPasswordReset(email,mock);
  assert.equal(verified,true);
  assert.equal(mock.records.length,2);
});

test('Cloudflare preview imports REST auth, not Firebase Auth SDK or staff password storage',()=>{
  const src=readFileSync('src/components/FirebaseStaffPreview.tsx','utf8');
  assert.match(src,/signInFirebaseStaffRest/);
  assert.doesNotMatch(src,/getFirebaseAuth\(/);
  assert.doesNotMatch(src,/signInWithEmailAndPassword/);
  assert.doesNotMatch(src,/localStorage|sessionStorage|document\.cookie/);
  assert.match(src,/Auth transport: Google Firebase REST/);
});
