import { withBakeryCors } from './shared-cors.mjs';
/** Public, read-only Netlify same-origin proxy to the existing Google Apps Script.
 * Never forwards credentials or accesses private Google Sheets tables.
 */
const SCRIPT_RE = /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;

const PUBLIC_TABLES = new Set([
  'schema_version','order_submission_enabled','customer_order_profile_sync_enabled',
  'settings','content','products','categories','flavors','addons',
  'hero_slides','highlights','faqs','links','banners','zones','slots',
  'coupons','reviews'
]);
const PRIVATE_FIELDS = /^(?:orders?|order_items|customer_accounts|staff_accounts|auth_sessions|receipt_json|customer_access_token|customer_google_sub|customer_phone|delivery_address|recipient_phone|sender_phone|account_id|password(?:_hash|_salt)?|auth_token|token_hash|session_token|private_key|secret_key|api_key|cash_deposits|accounting_entries|refund_ledger)$/i;
/** Refuse private schema drift rather than passing unexpected server JSON to
 * unauthenticated visitors. The authoritative Apps Script should allowlist too.
 */
function isSafePublicCatalogue(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  if (Object.keys(payload).some(key => !PUBLIC_TABLES.has(key))) return false;
  if (!Array.isArray(payload.products) || !payload.settings ||
      typeof payload.settings !== 'object' || Array.isArray(payload.settings)) return false;
  let nodes=0;
  const scan=(value,depth=0)=>{
    if (++nodes>30000 || depth>12) return false;
    if (Array.isArray(value)) return value.length<=5000 &&
      value.every(entry=>scan(entry,depth+1));
    if (value && typeof value==='object')
      return Object.entries(value).every(([key,entry])=>!PRIVATE_FIELDS.test(key)&&scan(entry,depth+1));
    return value===null || ['string','boolean','number'].includes(typeof value);
  };
  return scan(payload);
}
const headers = {'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const reject = (status,code) => new Response(JSON.stringify({ok:false,code}),{status,headers:{...headers,'Cache-Control':'no-store'}});
async function publicCatalog(request,{scriptUrl=process.env.AURORA_SCRIPT_POST_URL,fetcher=globalThis.fetch}={}) {
  if(request.method!=='GET'&&request.method!=='HEAD')return reject(405,'get_only');
  let url;
  try{url=new URL(scriptUrl||'');}catch{return reject(503,'sheets_backend_not_configured');}
  if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!SCRIPT_RE.test(url.pathname)||
     url.username||url.password||url.search||url.hash)return reject(503,'invalid_sheets_backend');
  url.searchParams.set('action','public');
  try{
    const upstream=await fetcher(url.href,{method:'GET',redirect:'follow',credentials:'omit',
      cache:'no-store',signal:AbortSignal.timeout(12000)});
    if(!upstream.ok || !['script.google.com','script.googleusercontent.com'].includes(new URL(upstream.url).hostname))
      return reject(502,'public_catalog_unavailable');
    const raw=await upstream.text();
    if(raw.length>250000)return reject(502,'public_catalog_too_large');
    let record;
    try{record=JSON.parse(raw);}catch{return reject(502,'public_catalog_invalid');}
    if(record?.ok!==true || !record.data || typeof record.data!=='object' || Array.isArray(record.data) ||
       record.schema_version!==1 || !isSafePublicCatalogue(record.data))
      return reject(502,'public_catalog_invalid');
    return new Response(request.method==='HEAD'?null:raw,{status:200,headers:{
      ...headers,'Cache-Control':'public, s-maxage=20, stale-while-revalidate=30'
    }});
  }catch{return reject(504,'public_catalog_timeout');}
}
// API routing is configured centrally in netlify.toml; Netlify's default
// /.netlify/functions/<name> path remains available for internal rewrites.

export default function handler(request, context={}) {
  return withBakeryCors(request, incoming=>publicCatalog(incoming,context), ['GET','HEAD']);
}
