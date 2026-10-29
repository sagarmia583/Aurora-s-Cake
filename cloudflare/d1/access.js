/**
 * Cloudflare Access is the only authentication provider for D1 staff actions.
 * A client-supplied email/role/header alone grants nothing.
 * Explicit team domain + application AUD required; deny by default.
 */
const decoder=new TextDecoder();
const cleanHost=(v)=>typeof v==='string'&&/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(v)?v:null;
const bytes=(input)=>{
  if(!/^[A-Za-z0-9_-]+$/.test(input))throw Error('access_encoding');
  const raw=atob(input.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-input.length%4)%4));
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
};
const parse=(segment)=>{
  const obj=JSON.parse(decoder.decode(bytes(segment)));
  if(!obj||typeof obj!=='object'||Array.isArray(obj))throw Error('access_token_invalid');
  return obj;
};
export async function verifyCloudflareAccess(request,env,{fetcher=globalThis.fetch,now=Math.floor(Date.now()/1000)}={}){
  const host=cleanHost(env?.CF_ACCESS_TEAM_DOMAIN);
  const aud=env?.CF_ACCESS_AUD;
  if(!host||typeof aud!=='string'||aud.length<8)return null;
  const token=request.headers.get('Cf-Access-Jwt-Assertion')||'';
  if(token.length<100||token.length>12000)return null;
  try{
    const parts=token.split('.');
    if(parts.length!==3)return null;
    const header=parse(parts[0]),payload=parse(parts[1]);
    if(header.alg!=='RS256'||typeof header.kid!=='string'||!header.kid ||
      payload.iss!=='https://'+host ||
      !Array.isArray(payload.aud)||!payload.aud.includes(aud)||
      !Number.isInteger(payload.exp)||payload.exp<=now||
      !Number.isInteger(payload.iat)||payload.iat>now||
      (payload.nbf!==undefined&&(!Number.isInteger(payload.nbf)||payload.nbf>now))||
      typeof payload.email!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)||
      typeof payload.sub!=='string'||payload.sub.length<3)return null;
    const jwkResponse=await fetcher('https://'+host+'/cdn-cgi/access/certs',{
      method:'GET',signal:AbortSignal.timeout(5000)
    });
    if(!jwkResponse.ok)return null;
    const body=await jwkResponse.json();
    const key=Array.isArray(body?.keys)?body.keys.find(k=>
      k?.kid===header.kid&&k.kty==='RSA'&&typeof k.n==='string'&&typeof k.e==='string'):null;
    if(!key)return null;
    const cryptoKey=await crypto.subtle.importKey('jwk',{
      kty:'RSA',n:key.n,e:key.e,alg:'RS256',ext:true
    },{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',cryptoKey,bytes(parts[2]),
      new TextEncoder().encode(parts[0]+'.'+parts[1]));
    return valid?{email:payload.email.toLowerCase(),subject:payload.sub}:null;
  }catch{return null;}
}
export async function authorizedD1Staff(request,env,opts){
  const identity=await verifyCloudflareAccess(request,env,opts);
  if(!identity||!env?.AURORA_DB)return null;
  const row=await env.AURORA_DB.prepare(
    'SELECT id,access_email,role,active FROM staff_members WHERE access_email=? AND active=1'
  ).bind(identity.email).first();
  return row&&row.active===1?{id:row.id,role:row.role,email:identity.email}:null;
}
