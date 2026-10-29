/**
 * Independent Firebase Authentication REST transport for the Cloudflare-only
 * migration preview. It bypasses modular Auth SDK registration failures but
 * still uses Google's OFFICIAL Firebase Identity Toolkit endpoints.
 *
 * Credentials go directly from the browser to Google's HTTPS endpoint, never
 * to Cloudflare, GitHub, or Apps Script. Tokens are held only in React memory,
 * never localStorage, sessionStorage, cookies, the URL or logs.
 *
 * The Cloudflare Worker verifies Firebase-signed ID tokens and requires an
 * explicitly provisioned private Firestore staff_roles/{uid} document.
 */
import {firebaseConfig} from './firebaseClient';

const IDENTITY_BASE='https://identitytoolkit.googleapis.com/v1/accounts:';
const TOKEN_BASE='https://securetoken.googleapis.com/v1/token';
const KNOWN_GOOGLE_AUTH_ERRORS=new Set([
  'INVALID_LOGIN_CREDENTIALS','INVALID_PASSWORD','EMAIL_NOT_FOUND',
  'INVALID_EMAIL','MISSING_EMAIL','MISSING_PASSWORD','USER_DISABLED',
  'OPERATION_NOT_ALLOWED','TOO_MANY_ATTEMPTS_TRY_LATER',
  'API_KEY_INVALID','INVALID_API_KEY','PROJECT_NOT_FOUND',
  'INVALID_ID_TOKEN','TOKEN_EXPIRED','USER_NOT_FOUND',
  'INVALID_REFRESH_TOKEN','MISSING_REFRESH_TOKEN',
  'INVALID_OOB_CODE','EXPIRED_OOB_CODE','QUOTA_EXCEEDED',
  'CAPTCHA_CHECK_FAILED','INVALID_CAPTCHA_RESPONSE',
  'WEB_INTERNAL_ERROR','UNAUTHORIZED_DOMAIN'
]);

export type RestStaffAuthSession={
  idToken:string; refreshToken:string;
  uid:string; email:string; emailVerified:boolean; expiresAt:number;
};

export class FirebaseRestAuthError extends Error {
  constructor(public readonly code:string){
    super(code);
    this.name='FirebaseRestAuthError';
  }
}

type RequestOptions={
  fetcher?:typeof fetch;
  apiKey?:string;
  now?:()=>number;
};
type GenericObject=Record<string,unknown>;
const object=(v:unknown):v is GenericObject=>
  typeof v==='object'&&v!==null&&!Array.isArray(v);
const str=(v:unknown):string=>typeof v==='string'?v:'';
const credentialsKey=(options:RequestOptions):string=>{
  const key=options.apiKey||firebaseConfig.apiKey||'';
  if(typeof key!=='string'||!/^AIza[A-Za-z0-9_-]{20,}$/.test(key))
    throw new FirebaseRestAuthError('FIREBASE_API_KEY_UNAVAILABLE');
  return key;
};
const sessionToken=(v:unknown)=>typeof v==='string'&&v.length>=40&&v.length<=8192;
const googleErrorCode=(data:unknown):string=>{
  const googleMessage=object(data)&&object(data.error)?str(data.error.message):'';
  const known=/^[A-Z][A-Z0-9_]{2,90}$/.exec(googleMessage.split(':')[0]?.trim()||'');
  return known&&KNOWN_GOOGLE_AUTH_ERRORS.has(known[0])?known[0]:'AUTH_REQUEST_REJECTED';
};

async function postGoogle(
  kind:string,payload:GenericObject,options:RequestOptions,
  tokenService=false
):Promise<GenericObject>{
  const url=tokenService?TOKEN_BASE+'?key='+encodeURIComponent(credentialsKey(options))
    :IDENTITY_BASE+kind+'?key='+encodeURIComponent(credentialsKey(options));
  let response:Response;
  try{
    response=await (options.fetcher||fetch)(url,{
      method:'POST',
      headers:{'Content-Type':tokenService?'application/x-www-form-urlencoded':'application/json'},
      body:tokenService?new URLSearchParams(payload as Record<string,string>).toString()
        :JSON.stringify(payload),
      cache:'no-store',
      signal:AbortSignal.timeout(12000)
    });
  }catch{
    // Never include a raw browser/network exception: it can contain requests.
    throw new FirebaseRestAuthError('AUTH_NETWORK_UNAVAILABLE');
  }
  let body:unknown;
  try{body=await response.json();}catch{
    throw new FirebaseRestAuthError('AUTH_RESPONSE_INVALID');
  }
  if(!response.ok)throw new FirebaseRestAuthError(googleErrorCode(body));
  if(!object(body))throw new FirebaseRestAuthError('AUTH_RESPONSE_INVALID');
  return body;
}

async function lookupUser(idToken:string,options:RequestOptions){
  const result=await postGoogle('lookup',{idToken},options);
  const user=Array.isArray(result.users)?result.users[0]:null;
  if(!object(user)||!str(user.localId)||!str(user.email))
    throw new FirebaseRestAuthError('AUTH_USER_LOOKUP_FAILED');
  return {uid:str(user.localId),email:str(user.email).trim().toLowerCase(),
    emailVerified:user.emailVerified===true};
}

export async function signInFirebaseStaffRest(
  email:string,password:string,options:RequestOptions={}
):Promise<RestStaffAuthSession>{
  if(!email.trim()||!password)
    throw new FirebaseRestAuthError('AUTH_CREDENTIALS_MISSING');
  const result=await postGoogle('signInWithPassword',{
    email:email.trim(),password,returnSecureToken:true
  },options);
  const idToken=str(result.idToken),refreshToken=str(result.refreshToken);
  const uid=str(result.localId),seconds=Number(result.expiresIn);
  if(!sessionToken(idToken)||!sessionToken(refreshToken)||!uid||
      !Number.isFinite(seconds)||seconds<60||seconds>86400)
    throw new FirebaseRestAuthError('AUTH_RESPONSE_INVALID');
  const profile=await lookupUser(idToken,options);
  if(profile.uid!==uid||profile.email!==email.trim().toLowerCase())
    throw new FirebaseRestAuthError('AUTH_IDENTITY_MISMATCH');
  return {idToken,refreshToken,uid,email:profile.email,
    emailVerified:profile.emailVerified,
    expiresAt:(options.now||Date.now)()+seconds*1000};
}

export async function refreshFirebaseStaffRest(
  session:RestStaffAuthSession, options:RequestOptions={}
):Promise<RestStaffAuthSession>{
  const result=await postGoogle('',{
    grant_type:'refresh_token',refresh_token:session.refreshToken
  },options,true);
  const idToken=str(result.id_token),refreshToken=str(result.refresh_token);
  const uid=str(result.user_id),seconds=Number(result.expires_in);
  if(!sessionToken(idToken)||!sessionToken(refreshToken)||
     uid!==session.uid||!Number.isFinite(seconds)||seconds<60||seconds>86400)
    throw new FirebaseRestAuthError('AUTH_REFRESH_INVALID');
  const profile=await lookupUser(idToken,options);
  if(profile.uid!==session.uid||profile.email!==session.email)
    throw new FirebaseRestAuthError('AUTH_IDENTITY_MISMATCH');
  return {...session,idToken,refreshToken,
    emailVerified:profile.emailVerified,
    expiresAt:(options.now||Date.now)()+seconds*1000};
}

/** Email-enumeration-resistant reset; never return whether an account exists. */
export async function requestFirebaseStaffPasswordReset(
  email:string, options:RequestOptions={}
):Promise<void>{
  if(!email.trim())throw new FirebaseRestAuthError('AUTH_CREDENTIALS_MISSING');
  try {
    await postGoogle('sendOobCode',{
      requestType:'PASSWORD_RESET',email:email.trim()
    },options);
  } catch(error) {
    // Do not reveal whether a given email exists.
    if(error instanceof FirebaseRestAuthError &&
       (error.code==='EMAIL_NOT_FOUND'||error.code==='INVALID_LOGIN_CREDENTIALS'))
      return;
    throw error;
  }
}

export async function sendFirebaseStaffVerification(
  session:RestStaffAuthSession,options:RequestOptions={}
):Promise<void>{
  await postGoogle('sendOobCode',{
    requestType:'VERIFY_EMAIL',idToken:session.idToken
  },options);
}

/** Returns only safe, owner-actionable errors; never include raw API payloads. */
export function describeFirebaseRestAuthError(error:unknown):string{
  const code=error instanceof FirebaseRestAuthError?error.code:'AUTH_UNEXPECTED_FAILURE';
  switch(code){
    case 'INVALID_LOGIN_CREDENTIALS':
    case 'INVALID_PASSWORD':
    case 'EMAIL_NOT_FOUND':
      return 'Firebase password or email does not match the existing Email/Password account. Use the Firebase Authentication password, not the old bakery staff password. (auth/invalid-credential)';
    case 'OPERATION_NOT_ALLOWED':
      return 'Enable Firebase Authentication → Sign-in method → Email/Password. (auth/operation-not-allowed)';
    case 'USER_DISABLED':
      return 'This Firebase Authentication account is disabled. (auth/user-disabled)';
    case 'TOO_MANY_ATTEMPTS_TRY_LATER':
    case 'QUOTA_EXCEEDED':
      return 'Too many login attempts. Avoid trying repeatedly; Firebase temporarily rate-limited sign-in. (auth/too-many-requests)';
    case 'INVALID_EMAIL':
    case 'MISSING_EMAIL':
      return 'Please enter a valid Firebase account email. (auth/invalid-email)';
    case 'AUTH_NETWORK_UNAVAILABLE':
      return 'Could not contact Google Firebase Authentication. Check the browser connection, DNS or content blockers. (firebase/network-unavailable)';
    case 'API_KEY_INVALID':
    case 'INVALID_API_KEY':
    case 'PROJECT_NOT_FOUND':
    case 'FIREBASE_API_KEY_UNAVAILABLE':
    case 'UNAUTHORIZED_DOMAIN':
      return 'Firebase Web API key or project/domain configuration is invalid. (firebase/configuration)';
    case 'AUTH_IDENTITY_MISMATCH':
      return 'The signed-in account does not match the expected Firebase user. Access denied. (firebase/identity-mismatch)';
    case 'AUTH_CREDENTIALS_MISSING':
      return 'Please enter your Firebase email and password.';
    default:
      return 'Firebase Authentication request could not complete. Safe error code: '+code;
  }
}
