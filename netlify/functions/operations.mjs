import { PRODUCTION_NETLIFY_ORIGIN, withBakeryCors } from './shared-cors.mjs';
/**
 * Optional same-origin Google Apps Script POST relay for Netlify Free.
 * Resolves browser CORS/ContentService redirect problems without a paid gateway.
 * Does NOT replace authorization: Apps Script verifies staff Google tokens,
 * customer receipt keys, prices, statuses and checkout rate limits.
 * Netlify Functions consume Free plan credits; usage is NOT unlimited.
 */
const SCRIPT_RE=/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
function trackingLink(value,orderId,scriptUrl) {
  if(typeof value!=='string')return value;
  try {
    const receipt=new URL(value);
    const key=receipt.searchParams.get('access');
    if(receipt.origin+receipt.pathname!==scriptUrl||receipt.username||receipt.password||receipt.hash||
      receipt.searchParams.get('action')!=='receipt'||receipt.searchParams.get('ref')!==orderId||
      !/^ord_[0-9a-f-]{36}$/i.test(orderId)||!key||!/^[a-f0-9-]{72}$/i.test(key))return value;
    const link=new URL('/track-order',PRODUCTION_NETLIFY_ORIGIN);
    link.hash=new URLSearchParams({ref:orderId,access:key}).toString();
    return link.href;
  }catch{return value;}
}
async function operations(request, { scriptUrl = process.env.AURORA_SCRIPT_POST_URL, fetcher = globalThis.fetch } = {}) {
  const response=(status,message)=>new Response(JSON.stringify({ok:false,success:false,code:'proxy_error',error:message}),{
    status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
  });
  if(request.method!=='POST') return response(405,'POST is required.');
  // Deploy previews may inherit production environment variables. Never forward
  // preview traffic to the authoritative production Sheet, even if it has a
  // valid production Apps Script /exec configured. All preview POST is disabled.
  const requestHost=new URL(request.url).hostname.toLowerCase();
  const netlifyPreviewHost=/^(?:deploy-preview-[0-9]+|[a-z0-9-]+)--[a-z0-9-]+\.netlify\.app$/.test(requestHost);
  const nonProductionNetlifyContext=['deploy-preview','branch-deploy','preview-server'].includes(process.env.CONTEXT||'');
  if(netlifyPreviewHost || nonProductionNetlifyContext)
    return response(403,'Preview operations are disabled to protect the live Google Sheet.');
  // First-party origins are verified by shared-cors.mjs before this handler runs.
  // Apps Script performs authenticated staff/customer authorization.
  const declaredLength=Number(request.headers.get('content-length')||0);
  if(declaredLength>950000) return response(413,'Request too large.');
  const raw=await request.text();
  if(!raw||raw.length>950000) return response(413,'Request too large.');
  let payload;
  try {payload=JSON.parse(raw);} catch {return response(400,'Invalid JSON.');}
  const allowed=['create_order','get_order_status','customer_review_submit','customer_shared_order','staff_order_link','customer_receipt_recover','customer_contact_submit','staff_session','staff_orders','staff_mutate','staff_legacy_receipt','staff_catalog',
    'staff_catalog_update','staff_customer_lookup','customer_session','customer_orders','customer_claim_order','create_custom_cake',
    'get_custom_cake_status','staff_custom_cakes','staff_custom_quote','staff_item_costings',
    'staff_password_login','staff_password_logout','staff_account_create','staff_account_set_active',
    'staff_account_reset_password','staff_cms_list','staff_cms_create','staff_cms_update','staff_cms_delete','staff_image_upload','staff_push_register','customer_phone_signup','customer_phone_login','customer_phone_session',
    'customer_phone_logout','customer_phone_profile','customer_phone_orders','customer_phone_claim','customer_phone_password','customer_phone_close','customer_phone_save_order_profile',
    'customer_email_status','customer_email_subscribe','customer_email_unsubscribe'];
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||!allowed.includes(payload.action))
    return response(400,'Unknown action.');
  if(raw.length>50000&&payload.action!=='staff_image_upload')
    return response(413,'Large requests are only allowed for staff image uploads.');
  let target;
  // Fail closed for every route. A staging preview must NEVER silently
  // send private receipt links or account operations to a production script.
  try {target=new URL(scriptUrl||'');}
  catch {return response(503,'Bakery backend URL has not been configured.');}
  if(target.protocol!=='https:'||target.hostname!=='script.google.com'||!SCRIPT_RE.test(target.pathname)
    ||target.username||target.password||target.search||target.hash)
    return response(503,'Invalid bakery backend configuration.');
  try {
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),24000);
    let upstream;
    try {upstream=await fetcher(target.href,{method:'POST',redirect:'follow',credentials:'omit',
      headers:{'Content-Type':'text/plain;charset=utf-8'},body:raw,signal:controller.signal});}
    finally {clearTimeout(timeout);}
    const finalHost=new URL(upstream.url).hostname;
    if(finalHost!=='script.google.com'&&finalHost!=='script.googleusercontent.com')
      return response(502,'Unexpected bakery backend redirect.');
    if(!upstream.ok) return response(502,'Bakery backend returned an error.');
    const text=await upstream.text();
    let reply;
    try {reply=JSON.parse(text);} catch {return response(502,'Bakery backend returned invalid JSON.');}
    if(!reply||typeof reply!=='object'||Array.isArray(reply))
      return response(502,'Unexpected bakery backend response.');
    if(reply.ok===true&&new URL(request.url).origin===PRODUCTION_NETLIFY_ORIGIN){
      if(payload.action==='staff_order_link'&&reply.order_id===payload.order_id&&typeof reply.share_url==='string')
        reply.share_url=trackingLink(reply.share_url,reply.order_id,target.href);
      const orders=payload.action==='staff_orders'&&Array.isArray(reply.orders)?reply.orders:
        payload.action==='staff_mutate'?[reply.order]:[];
      for(const order of orders){
        if(typeof order?.id==='string'&&typeof order.customer_share_url==='string')
          order.customer_share_url=trackingLink(order.customer_share_url,order.id,target.href);
      }
    }
    return new Response(JSON.stringify(reply),{status:200,
      headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
        'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
  } catch {
    return response(502,'Bakery backend is temporarily unreachable. Retry the same order reference.');
  }
}
// API routing is configured centrally in netlify.toml; Netlify's default
// /.netlify/functions/<name> path remains available for internal rewrites.

export default function handler(request, context={}) {
  return withBakeryCors(request, incoming=>operations(incoming,context), ['POST']);
}
