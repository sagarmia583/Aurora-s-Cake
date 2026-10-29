/**
 * Firebase Authentication ID-token verification for Cloudflare Workers.
 *
 * Never accept a Google Identity Services (accounts.google.com) ID token as a
 * Firebase ID token; Firebase tokens use securetoken.google.com/<project-id>.
 * The worker verifies RS256, Google's Firebase signing key, issuer, audience,
 * expiry and auth_time before looking up a private staff role in Firestore.
 *
 * No user can become an admin through login. Roles are provisioned only by
 * an offline, service-account-authorized bootstrap operation.
 */
const PROJECT_ID='aurorascake-213a0';
export const FIREBASE_KEYS_URL='https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const encoder=new TextEncoder();
let keyCache=null;
let cacheExpires=0;
const isObj=(v)=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const b64bytes=(str)=>{
  if(!/^[\w-]+$/.test(str))throw new Error('invalid_token_encoding');
  const b64=str.replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(b64+'='.repeat((4-b64.length%4)%4));
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
};
const jsonPart=(input)=>{
  const value=JSON.parse(new TextDecoder().decode(b64bytes(input)));
  if(!isObj(value))throw new Error('invalid_token_content');
  return value;
};
const fetchKeys=async(fetcher,nowMs)=>{
  if(keyCache&&cacheExpires>nowMs)return keyCache;
  const response=await fetcher(FIREBASE_KEYS_URL,{method:'GET',signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error('firebase_public_keys_unavailable');
  const value=await response.json();
  if(!isObj(value)||!Array.isArray(value.keys))throw new Error('firebase_public_keys_invalid');
  const keys=value.keys.filter(k=>isObj(k)&&k.kty==='RSA'&&k.alg==='RS256'&&
    typeof k.kid==='string'&&typeof k.n==='string'&&typeof k.e==='string');
  if(!keys.length)throw new Error('firebase_public_keys_invalid');
  const cacheHeader=response.headers?.get?.('cache-control')||'';
  const maxAge=Number(/(?:^|,)\s*max-age=(\d+)/i.exec(cacheHeader)?.[1]||'180');
  keyCache=keys;
  cacheExpires=nowMs+Math.min(3600,Math.max(30,Number.isFinite(maxAge)?maxAge:180))*1000;
  return keys;
};
export function validateFirebaseClaims(claim,nowSeconds=Math.floor(Date.now()/1000)){
  if(!isObj(claim) ||
    claim.aud!==PROJECT_ID ||
    claim.iss!=='https://securetoken.google.com/'+PROJECT_ID ||
    typeof claim.sub!=='string'||!/^[\w-]{1,128}$/.test(claim.sub)||
    !Number.isSafeInteger(claim.iat)||claim.iat>nowSeconds||
    !Number.isSafeInteger(claim.exp)||claim.exp<=nowSeconds||
    claim.exp-claim.iat>3600+300||
    !Number.isSafeInteger(claim.auth_time)||claim.auth_time>nowSeconds||
    claim.auth_time>claim.iat ||
    claim.email_verified!==true||
    typeof claim.email!=='string'||!claim.email.includes('@') ||
    claim.firebase?.sign_in_provider==='anonymous')
    throw new Error('invalid_firebase_token_claims');
  return {uid:claim.sub,email:claim.email.toLowerCase(),authTime:claim.auth_time};
}
export async function verifyFirebaseIdToken(token,{
  fetcher=globalThis.fetch,nowSeconds=Math.floor(Date.now()/1000),subtle=globalThis.crypto.subtle
}={}){
  if(typeof token!=='string'||token.length<100||token.length>8192)
    throw new Error('invalid_firebase_token');
  const parts=token.split('.');
  if(parts.length!==3)throw new Error('invalid_firebase_token');
  let header,claim,signature;
  try{header=jsonPart(parts[0]);claim=jsonPart(parts[1]);signature=b64bytes(parts[2]);}
  catch{throw new Error('invalid_firebase_token');}
  if(header.alg!=='RS256'||typeof header.kid!=='string'||!header.kid||
     (header.typ!==undefined&&header.typ!=='JWT'))
    throw new Error('invalid_firebase_token_algorithm');
  const identity=validateFirebaseClaims(claim,nowSeconds);
  const keys=await fetchKeys(fetcher,nowSeconds*1000);
  const key=keys.find(k=>k.kid===header.kid);
  if(!key)throw new Error('unknown_firebase_signing_key');
  const imported=await subtle.importKey('jwk',{
    kty:'RSA',n:key.n,e:key.e,alg:'RS256',ext:true
  },{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const verified=await subtle.verify('RSASSA-PKCS1-v1_5',imported,signature,
    encoder.encode(parts[0]+'.'+parts[1]));
  if(!verified)throw new Error('invalid_firebase_signature');
  return identity;
}
export function bearerFromRequest(request){
  const authorization=request.headers.get('authorization')||'';
  const match=/^Bearer ([A-Za-z0-9_.-]+)$/.exec(authorization);
  return match?match[1]:null;
}
