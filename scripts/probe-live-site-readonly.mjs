/**
 * Live-site read-only diagnostic for Aurora's Cake.
 * Never POST, never authenticate, never print response bodies or order data.
 * Designed to determine whether Restricted Google Sheet access broke
 * the public Apps Script catalog and whether Netlify relay routes are live.
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const LIVE_ORIGIN='https://aurorascake.netlify.app';
const privateFields=new Set([
  'orders','order_items','customer_accounts','staff_accounts','auth_sessions',
  'customer_access_token','customer_google_sub','receipt_json','token_hash',
  'auth_token','password_hash','password_salt','delivery_address',
  'customer_phone','recipient_phone','sender_phone','accounting_entries',
  'rider_cash_deposits','refund_returns','customer_sessions','customer_challenges'
]);
const safe=(value,depth=0)=>{
  if(depth>15)return false;
  if(Array.isArray(value))return value.length<5001&&value.every(v=>safe(v,depth+1));
  if(value&&typeof value==='object'){
    return Object.entries(value).every(([key,v])=>!privateFields.has(key.toLowerCase())&&safe(v,depth+1));
  }
  return value===null || ['string','number','boolean'].includes(typeof value);
};
function defaultScriptUrl(){
  const file=readFileSync(new URL('../src/services/googleSheets.ts',import.meta.url),'utf8');
  const match=file.match(/export const DEFAULT_SHEETS_ENDPOINT\s*=\s*configuredEndpoint\s*\|\|\s*'([^']+)'/);
  if(!match)return null;
  const url=new URL(match[1]);
  return url.protocol==='https:'&&url.hostname==='script.google.com'&&
    /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname)?url:null;
}
const detail=(response,body)=>{
  const json=/application\/json/i.test(response.headers.get('content-type')||'');
  let parsed=null;
  if(json && body.length<500000){try{parsed=JSON.parse(body);}catch{}}
  return {status:response.status,json,parsed};
};
async function get(url,{fetcher=globalThis.fetch,allowedHosts=[]}={}){
  try{
    const res=await fetcher(url,{
      method:'GET',credentials:'omit',redirect:'follow',cache:'no-store',
      headers:{Accept:'application/json,text/html;q=0.8'},signal:AbortSignal.timeout(13000)
    });
    const finalHost=new URL(res.url||url).hostname;
    if(allowedHosts.length&&!allowedHosts.includes(finalHost))
      return {status:0,reason:'unexpected_redirect'};
    const body=await res.text();
    if(body.length>500000)return {status:res.status,reason:'oversized_response'};
    return {...detail(res,body),reason:res.ok?'':'http_error'};
  }catch(e){return {status:0,reason:e?.name==='TimeoutError'?'timeout':'network_error'};}
}
function catalogue(x){
  if(!x.json)return {http:x.status,ok:false,reason:x.reason||'non_json'};
  const r=x.parsed;
  if(r?.ok!==true||r.schema_version!==1||!r.data||!Array.isArray(r.data.products))
    return {http:x.status,ok:false,reason:'invalid_public_schema'};
  if(!safe(r.data))return {http:x.status,ok:false,reason:'private_field_detected'};
  return {http:x.status,ok:true,products:r.data.products.length,checkoutAdvertised:r.data.order_submission_enabled===true};
}
function health(x){
  if(!x.json||x.parsed?.ok!==true)return {http:x.status,ok:false,reason:x.reason||'not_healthy'};
  return {http:x.status,ok:true,sheets:x.parsed.database_backend==='google_sheets',
    releaseCurrent:x.parsed.up_to_date===true,writeFrozen:x.parsed.writes_frozen===true};
}
export async function probeLiveSite({fetcher=globalThis.fetch,scriptUrl=defaultScriptUrl()}={}){
  const netHosts=['aurorascake.netlify.app'];
  const googleHosts=['script.google.com','script.googleusercontent.com'];
  const [homepage,relayHealth,relayCatalog,directHealth,directCatalog]=await Promise.all([
    get(LIVE_ORIGIN+'/',{fetcher,allowedHosts:netHosts}),
    get(LIVE_ORIGIN+'/api/backend-health',{fetcher,allowedHosts:netHosts}),
    get(LIVE_ORIGIN+'/api/public',{fetcher,allowedHosts:netHosts}),
    scriptUrl?get(new URL(scriptUrl.href+'?action=health').href,{fetcher,allowedHosts:googleHosts}):Promise.resolve({status:0,reason:'missing_script_source'}),
    scriptUrl?get(new URL(scriptUrl.href+'?action=public').href,{fetcher,allowedHosts:googleHosts}):Promise.resolve({status:0,reason:'missing_script_source'})
  ]);
  const result={
    home:{http:homepage.status,ok:homepage.status===200},
    netlifyHealth:health(relayHealth),
    netlifyCatalog:catalogue(relayCatalog),
    directScriptHealth:{
      http:directHealth.status,ok:directHealth.parsed?.ok===true,
      sheets:directHealth.parsed?.database_backend==='google_sheets',
      reason:directHealth.reason||undefined
    },
    directScriptCatalog:catalogue(directCatalog)
  };
  const usableCatalog=result.netlifyCatalog.ok||result.directScriptCatalog.ok;
  return {result,usableCatalog,
    pass:result.home.ok&&usableCatalog&&
      (result.netlifyHealth.ok||result.directScriptHealth.ok)};
}
if(process.argv[1] && import.meta.url===new URL('file://'+resolve(process.argv[1])).href){
  probeLiveSite().then(({result,pass})=>{
    // print status flags ONLY; never upstream JSON, phones, auth or token values
    console.log('Aurora read-only production probe:',JSON.stringify(result,null,2));
    if(!pass){console.error('Live read-only check incomplete; review route status before release.');process.exitCode=1;}
  }).catch(error=>{console.error('Read-only probe failed:',error?.message||'unknown');process.exitCode=1;});
}
