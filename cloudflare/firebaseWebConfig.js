/**
 * Cloudflare-only PUBLIC Firebase Web API-key configuration.
 *
 * Unlike FIREBASE_SERVICE_ACCOUNT_JSON, a Firebase Web API key is a public
 * identifier included in every Firebase client request. It must match the
 * app's Firebase project and allow Identity Toolkit API + Token Service API.
 *
 * Set FIREBASE_WEB_API_KEY as a Cloudflare **Runtime Variable** (not a secret
 * build variable). Do not put a private service account key in this field.
 *
 * Deliberately fail closed instead of returning the historical unverified
 * baked frontend fallback key from src/services/firebaseWebConfig.ts.
 */
export const PROJECT_ID='aurorascake-213a0';
export const WEB_KEY_NAME='FIREBASE_WEB_API_KEY';
export function firebaseWebKeyState(env){
  const key=typeof env?.FIREBASE_WEB_API_KEY==='string'
    ?env.FIREBASE_WEB_API_KEY.trim():'';
  if(!key)return {configured:false,code:'firebase_web_api_key_missing'};
  if(!/^AIza[A-Za-z0-9_-]{20,}$/.test(key))
    return {configured:false,code:'firebase_web_api_key_invalid_format'};
  return {configured:true,code:'configured',key};
}
export function firebaseWebConfigHandler({request,env}){
  const method=request.method;
  const headers={
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer'
  };
  if(method!=='GET')return new Response(JSON.stringify({ok:false,code:'method_not_allowed'}),{status:405,headers});
  const value=firebaseWebKeyState(env);
  if(!value.configured)
    return new Response(JSON.stringify({
      ok:false,provider:'firebase_auth',project_id:PROJECT_ID,
      configured:false,code:value.code
    }),{status:503,headers});
  // The Web API key is intentionally PUBLIC. Do not return runtime env,
  // service account credentials or other values from this handler.
  return new Response(JSON.stringify({
    ok:true,provider:'firebase_auth',project_id:PROJECT_ID,
    configured:true,apiKey:value.key,
  }),{status:200,headers});
}
