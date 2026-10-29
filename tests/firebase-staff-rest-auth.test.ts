import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  signInFirebaseStaffRest, refreshFirebaseStaffRest,
  sendFirebaseStaffVerification,requestFirebaseStaffPasswordReset,
  describeFirebaseRestAuthError,FirebaseRestAuthError,googleAuthFailureCode
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

test('HTTP referrer-blocked API key and service restrictions report actionable safe errors',async()=>{
  for(const [message,expected] of [
    ['API_KEY_HTTP_REFERRER_BLOCKED','firebase/api-key-referrer-blocked'],
    ['Requests from referer https://example.test/ are blocked.','firebase/api-key-referrer-blocked'],
    ['API_KEY_SERVICE_BLOCKED','firebase/identity-toolkit-api-blocked'],
    ['API has not been used in project 123 or is disabled.','firebase/identity-toolkit-api-blocked'],
    ['API_KEY_INVALID','firebase/configuration']
  ]){
    const mock=useMock(()=>new Response(JSON.stringify({error:{
      message,code:403,status:'PERMISSION_DENIED'
    }}),{status:403}));
    await assert.rejects(()=>signInFirebaseStaffRest(email,'dummy-password',mock),failure=>{
      assert.ok(failure instanceof FirebaseRestAuthError);
      const e=failure as FirebaseRestAuthError;
      assert.equal(e.httpStatus,403);
      assert.equal(e.step,'signInWithPassword');
      const safe=describeFirebaseRestAuthError(e);
      assert.match(safe,new RegExp(expected));
      assert.doesNotMatch(safe,/https:\/\/example/);
      assert.doesNotMatch(safe,/dummy-password/);
      assert.doesNotMatch(safe,/123/);
      return true;
    });
  }
});
test('Unknown Google errors include only safe HTTP status and the failed auth stage',async()=>{
  const privateMessage='The Google error includes owner@example.com and https://service.invalid/?token=PRIVATE';
  const mock=useMock(()=>new Response(JSON.stringify({error:{
    code:403,message:privateMessage,status:'SOMETHING_ELSE'
  }}),{status:403}));
  await assert.rejects(()=>signInFirebaseStaffRest(email,'dummy-password',mock),failure=>{
    assert.ok(failure instanceof FirebaseRestAuthError);
    assert.equal(failure.code,'AUTH_HTTP_403');
    const safe=describeFirebaseRestAuthError(failure);
    assert.match(safe,/AUTH_HTTP_403/);
    assert.match(safe,/HTTP 403/);
    assert.match(safe,/signInWithPassword/);
    assert.doesNotMatch(safe,/owner@example\.com|service\.invalid|PRIVATE|dummy-password/);
    return true;
  });
});
test('Post-password profile lookup failures identify lookup stage without exposing tokens',async()=>{
  const mock=useMock(({url})=>url.includes(':signInWithPassword?')
    ?ok({idToken,refreshToken,localId:uid,expiresIn:'3600'})
    :new Response(JSON.stringify({error:{code:403,status:'PERMISSION_DENIED',
        message:'API_KEY_SERVICE_BLOCKED'}}),{status:403})
  );
  await assert.rejects(()=>signInFirebaseStaffRest(email,'dummy-password',mock),failure=>{
    assert.ok(failure instanceof FirebaseRestAuthError);
    assert.equal(failure.step,'lookup');
    assert.equal(failure.code,'API_KEY_SERVICE_BLOCKED');
    assert.doesNotMatch(describeFirebaseRestAuthError(failure),/eyJ|refresh_/);
    return true;
  });
});
test('Known colon-delimited Google login errors are still treated as generic credentials',()=>{
  assert.equal(googleAuthFailureCode({error:{message:'INVALID_LOGIN_CREDENTIALS : Invalid password'}},400),'INVALID_LOGIN_CREDENTIALS');
  const safe=describeFirebaseRestAuthError(new FirebaseRestAuthError('INVALID_LOGIN_CREDENTIALS','signInWithPassword',400));
  assert.match(safe,/auth\/invalid-credential/);
  assert.doesNotMatch(safe,/HTTP 400/);
});
test('Google nested reason and challenge codes do not leak raw private API errors',()=>{
  assert.equal(googleAuthFailureCode({error:{
    message:'Access denied for owner@example.com',
    errors:[{reason:'accessNotConfigured'}],status:'PERMISSION_DENIED'
  }},403),'SERVICE_DISABLED');
  assert.equal(googleAuthFailureCode({error:{message:'INVALID_RECAPTCHA_TOKEN'}},400),'INVALID_RECAPTCHA_TOKEN');
  assert.match(describeFirebaseRestAuthError(new FirebaseRestAuthError('INVALID_RECAPTCHA_TOKEN','signInWithPassword',400)),/challenge-required/);
});
