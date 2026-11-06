/**
 * Read-only Netlify + Google Sheets release smoke check.
 * Only GET /api/backend-health and GET /api/public.
 * Usage: node scripts/check-netlify-sheets-release.mjs https://YOUR-SITE.netlify.app
 */
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const forbidden=new Set([
 'auth_token','id_token','token_hash','password_hash','password_salt',
 'customer_access_token','customer_google_sub','receipt_json',
 'staff_accounts','customer_accounts','auth_sessions','orders','order_items',
 'accounting_entries','payment_events','cash_deposits','refund_ledger'
]);
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const ensure=(ok,message)=>{if(!ok)throw new Error(message);};

export function validateSiteOrigin(raw,{approvedCustomOrigin=''}={}){
 let url;
 try{url=new URL(raw);}catch{throw new Error('Enter a valid HTTPS Netlify site origin.');}
 ensure(url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&
  !url.hash&&(url.pathname==='/'||url.pathname==='')&&!url.port,
  'Only a clean HTTPS origin is accepted (no path, port, credentials or query).');
 const netlify=/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.netlify\.app$/i.test(url.hostname);
 const custom=!!approvedCustomOrigin&&url.origin===approvedCustomOrigin;
 ensure(netlify||custom,'Origin must be a *.netlify.app site or explicitly approved custom HTTPS origin.');
 return url.origin;
}
function scanPrivate(value,path='data',depth=0){
 ensure(depth<=12,'Unexpectedly nested public catalogue.');
 if(Array.isArray(value)){
  ensure(value.length<=5000,'Public catalogue has too many items.');
  value.forEach((v,i)=>scanPrivate(v,path+'['+i+']',depth+1));
 }else if(object(value)){
  for(const [key,item] of Object.entries(value)){
   ensure(!forbidden.has(key.toLowerCase()),'Private data field exposed: '+path+'.'+key);
   scanPrivate(item,path+'.'+key,depth+1);
  }
 }
}
export function expectedAppsScriptRelease(){
 const code=readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8');
 const match=code.match(/var AURORA_BACKEND_RELEASE\s*=\s*'([A-Za-z0-9._-]+)'/);
 ensure(match,'Apps Script source release ID missing.');
 return match[1];
}
export async function checkNetlifySheetsRelease({
 siteUrl,expectedRelease=expectedAppsScriptRelease(),fetcher=globalThis.fetch,
 approvedCustomOrigin=''
}={}){
 const origin=validateSiteOrigin(siteUrl,{approvedCustomOrigin});
 const get=async path=>{
  const response=await fetcher(origin+path,{
   method:'GET',credentials:'omit',redirect:'error',cache:'no-store',
   headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)
  });
  ensure(response.ok,path+' returned HTTP '+response.status+'; check Netlify Functions.');
  ensure(/application\/json/i.test(response.headers.get('content-type')||''),
   path+' returned non-JSON (possibly SPA fallback or Google sign-in).');
  const body=await response.text();
  ensure(body.length>0&&body.length<=500000,path+' response empty or oversized.');
  try{return JSON.parse(body);}catch{throw new Error(path+' returned invalid JSON.');}
 };
 const health=await get('/api/backend-health');
 ensure(health.ok===true,'Backend health is not OK.');
 ensure(health.database_backend==='google_sheets','Backend is not Google Sheets.');
 ensure(health.expected_release===expectedRelease,'Netlify expects a different Apps Script release.');
 ensure(health.installed_release===expectedRelease&&health.up_to_date===true,
  'Installed Apps Script release is outdated. Publish matching version.');
 ensure(health.writes_frozen===false,'Google Sheets writes are frozen or their state is unknown.');
 const publicData=await get('/api/public');
 ensure(publicData.ok===true&&publicData.schema_version===1&&object(publicData.data)&&
  Array.isArray(publicData.data.products),'Public Google Sheets schema version 1 is invalid.');
 scanPrivate(publicData.data);
 ensure(publicData.data.products.length>0,'Published product catalogue is empty.');
 return {origin,release:expectedRelease,products:publicData.data.products.length,
  order_submission_enabled:publicData.data.order_submission_enabled===true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const siteUrl=process.argv[2];
 if(!siteUrl){
  console.error('Usage: node scripts/check-netlify-sheets-release.mjs https://YOUR-SITE.netlify.app');
  process.exitCode=2;
 }else{
  checkNetlifySheetsRelease({siteUrl,approvedCustomOrigin:process.env.AURORA_APPROVED_NETLIFY_ORIGIN||''})
   .then(r=>console.log('READ-ONLY CHECK PASS:',r.origin,'|',r.release,'|',r.products,
      'products | checkout enabled:',r.order_submission_enabled))
   .catch(error=>{console.error('READ-ONLY CHECK FAILED:',error.message);process.exitCode=1;});
 }
}
