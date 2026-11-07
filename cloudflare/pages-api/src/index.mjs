/**
 * Aurora's Cake: secure cross-origin API for the static GitHub Pages frontend.
 * Existing Google Apps Script R5 remains the authority for all staff permissions,
 * customer receipt checks, COD orders, inventory and prices.
 * No private Google Sheet is directly exposed to the browser.
 */
const SCRIPT_RE=/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
const ALLOWED_ORIGIN='https://sagarmia583.github.io';
const EXPECTED_RELEASE='aurora-2026-11-03-staff-order-alerts-r5';
const UPSTREAM_HOSTS=new Set(['script.google.com','script.googleusercontent.com']);
const PUBLIC_TABLES=new Set(['schema_version','order_submission_enabled','customer_order_profile_sync_enabled',
  'settings','content','products','categories','flavors','addons','hero_slides','highlights',
  'faqs','links','banners','zones','slots','coupons','reviews']);
const PRIVATE_FIELDS=/^(?:orders?|order_items|customer_accounts|staff_accounts|auth_sessions|receipt_json|customer_access_token|customer_google_sub|customer_phone|delivery_address|recipient_phone|sender_phone|account_id|password(?:_hash|_salt)?|auth_token|token_hash|session_token|private_key|secret_key|api_key|cash_deposits|accounting_entries|refund_ledger)$/i;
const ACTIONS=new Set([
  'create_order','get_order_status','customer_review_submit','customer_shared_order',
  'staff_order_link','customer_receipt_recover','customer_contact_submit','staff_session',
  'staff_orders','staff_mutate','staff_legacy_receipt','staff_catalog','staff_catalog_update',
  'staff_customer_lookup','customer_session','customer_orders','customer_claim_order',
  'create_custom_cake','get_custom_cake_status','staff_custom_cakes','staff_custom_quote',
  'staff_item_costings','staff_password_login','staff_password_logout',
  'staff_account_create','staff_account_set_active','staff_account_reset_password',
  'staff_cms_list','staff_cms_create','staff_cms_update','staff_cms_delete',
  'staff_image_upload','staff_push_register','customer_phone_signup',
  'customer_phone_login','customer_phone_session','customer_phone_logout',
  'customer_phone_profile','customer_phone_orders','customer_phone_claim',
  'customer_phone_password','customer_phone_close','customer_phone_save_order_profile',
  'customer_email_status','customer_email_subscribe','customer_email_unsubscribe'
]);
const JSON_HEADERS={'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer','Vary':'Origin'};
const allowedPath=(path)=>['/api/public','/api/backend-health','/api/operations','/api/image'].includes(path);
const fail=(status,code,message='Request rejected.',cors={})=>
  new Response(JSON.stringify({ok:false,code,error:message}),{status,
    headers:{...JSON_HEADERS,...cors}});
function validBackend(value){
  let url;
  try{url=new URL(value||'');}catch{return null;}
  if(url.protocol!=='https:' || url.hostname!=='script.google.com' ||
    !SCRIPT_RE.test(url.pathname)||url.username||url.password||url.search||url.hash)return null;
  return url;
}
function isSafePublicCatalogue(payload){
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||
    Object.keys(payload).some(key=>!PUBLIC_TABLES.has(key))||
    !Array.isArray(payload.products)||!payload.settings||
    typeof payload.settings!=='object'||Array.isArray(payload.settings))return false;
  let count=0;
  const scan=(value,depth=0)=>{
    if(++count>30000||depth>12)return false;
    if(Array.isArray(value))return value.length<=5000&&value.every(x=>scan(x,depth+1));
    if(value&&typeof value==='object')
      return Object.entries(value).every(([key,val])=>!PRIVATE_FIELDS.test(key)&&scan(val,depth+1));
    return value===null||['string','number','boolean'].includes(typeof value);
  };
  return scan(payload);
}
function corsHeaders(origin,allowed){
  return origin===allowed?{
    'Access-Control-Allow-Origin':allowed,
    'Access-Control-Allow-Methods':'GET, POST, OPTIONS, HEAD',
    'Access-Control-Allow-Headers':'content-type',
    'Access-Control-Max-Age':'600'
  }:{};
}
function guardedDestination(url){
  return url.protocol==='https:' && UPSTREAM_HOSTS.has(url.hostname) &&
    !url.username&&!url.password;
}
/**
 * Follow only Google Apps Script ContentService's single redirected GET.
 * NEVER forward original POST body, staff token or browser headers to the
 * redirected URL. This preserves response confirmation after side effects.
 */
async function callGoogle(url, options, fetcher){
  const upstream=await fetcher(url.href,{...options,redirect:'manual',credentials:'omit'});
  if([301,302,303].includes(upstream.status)){
    const loc=upstream.headers.get('location');
    if(!loc)throw new Error('Missing ContentService redirect');
    const redirected=new URL(loc,url);
    if(!guardedDestination(redirected)||redirected.hostname!=='script.googleusercontent.com')
      throw new Error('Untrusted ContentService redirect');
    const final=await fetcher(redirected.href,{method:'GET',redirect:'manual',
      credentials:'omit',cache:'no-store',signal:options.signal});
    if(final.status>=300&&final.status<400)throw new Error('Too many ContentService redirects');
    if(final.url && !guardedDestination(new URL(final.url)))throw new Error('Unexpected final origin');
    return final;
  }
  if(upstream.status>=300&&upstream.status<400)throw new Error('Unsupported ContentService redirect');
  if(upstream.url&&!guardedDestination(new URL(upstream.url)))
    throw new Error('Unexpected upstream origin');
  return upstream;
}
export async function handlePagesApi(request,env={},fetcher=globalThis.fetch){
  let url;
  try{url=new URL(request.url);}catch{return fail(400,'bad_url');}
  if(!allowedPath(url.pathname)||url.search && url.pathname!=='/api/image')
    return fail(404,'not_found');
  const allowed=env.AURORA_ALLOWED_ORIGIN||ALLOWED_ORIGIN;
  const origin=request.headers.get('origin');
  const cors=corsHeaders(origin,allowed);
  if(origin&&origin!==allowed)return fail(403,'invalid_origin','Origin not allowed.');
  if(request.method==='OPTIONS'){
    if(!origin||origin!==allowed)return fail(403,'invalid_origin');
    if(!['/api/operations','/api/public','/api/backend-health','/api/image'].includes(url.pathname))
      return fail(404,'not_found');
    return new Response(null,{status:204,headers:{...JSON_HEADERS,...cors}});
  }
  const backend=validBackend(env.AURORA_SCRIPT_POST_URL);
  if(!backend)return fail(503,'backend_not_configured','Apps Script /exec endpoint is not configured.',cors);
  if(url.pathname==='/api/operations'){
    if(request.method!=='POST')return fail(405,'post_only','POST required.',cors);
    // Require a browser Origin: public checkout requests are guarded by the
    // Apps Script's own idempotency/rate limiting. Staff requests still need
    // valid server-checked auth_token or verified Google ID token.
    if(origin!==allowed)return fail(403,'missing_origin','Approved browser origin required.',cors);
    const declared=Number(request.headers.get('content-length')||0);
    if(declared>950000)return fail(413,'request_too_large','Request too large.',cors);
    if(!/^text\/plain(?:;|$)/i.test(request.headers.get('content-type')||''))
      return fail(415,'content_type','Plain-text JSON is required.',cors);
    const raw=await request.text();
    if(!raw||raw.length>950000)return fail(413,'request_too_large','Request too large.',cors);
    let payload;
    try{payload=JSON.parse(raw);}catch{return fail(400,'invalid_json','Invalid JSON.',cors);}
    if(!payload||typeof payload!=='object'||Array.isArray(payload)||!ACTIONS.has(payload.action))
      return fail(400,'invalid_action','Action not permitted.',cors);
    if(raw.length>50000&&payload.action!=='staff_image_upload')
      return fail(413,'request_too_large','Request too large.',cors);
    try{
      const signal=AbortSignal.timeout(24000);
      const upstream=await callGoogle(backend,{method:'POST',body:raw,
        headers:{'Content-Type':'text/plain;charset=utf-8'},signal},fetcher);
      if(!upstream.ok)return fail(502,'upstream_unavailable','Backend did not confirm this request. Retry with the same reference.',cors);
      const text=await upstream.text();
      if(text.length>1200000)return fail(502,'oversized_backend_reply','Unexpected backend response.',cors);
      let json;
      try{json=JSON.parse(text);}catch{return fail(502,'invalid_backend_reply','Backend did not confirm this request. Retry the same order.',cors);}
      if(!json||typeof json!=='object'||Array.isArray(json))
        return fail(502,'invalid_backend_reply','Invalid backend response.',cors);
      return new Response(JSON.stringify(json),{status:200,headers:{...JSON_HEADERS,...cors}});
    }catch{return fail(502,'backend_unavailable','Backend confirmation unavailable. Retry the original order reference.',cors);}
  }
  if(!['GET','HEAD'].includes(request.method))
    return fail(405,'get_only','GET required.',cors);
  if(url.pathname==='/api/image'){
    const id=url.searchParams.get('id')||'';
    if(!/^[A-Za-z0-9_-]{12,150}$/.test(id)||[...url.searchParams.keys()].some(key=>key!=='id'))
      return fail(404,'image_not_found','Image not found.',cors);
    backend.searchParams.set('action','public_image');
    backend.searchParams.set('id',id);
    try{
      const response=await callGoogle(backend,{method:'GET',cache:'no-store',signal:AbortSignal.timeout(18000)},fetcher);
      if(!response.ok)return fail(502,'image_unavailable','Image unavailable.',cors);
      const data=await response.json();
      if(data?.ok!==true||typeof data.base64!=='string'||data.base64.length>900000||
        !['image/jpeg','image/png','image/webp'].includes(data.mime_type))
        return fail(404,'image_unavailable','Image unavailable.',cors);
      const bytes=Uint8Array.from(atob(data.base64),char=>char.charCodeAt(0));
      if(!bytes.length||bytes.length>650000)return fail(502,'image_too_large','Image too large.',cors);
      const jpeg=bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
      const png=bytes.length>=8&&[137,80,78,71,13,10,26,10].every((x,i)=>bytes[i]===x);
      const webp=bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
      if(!((data.mime_type==='image/jpeg'&&jpeg)||(data.mime_type==='image/png'&&png)||(data.mime_type==='image/webp'&&webp)))
        return fail(502,'invalid_image_data','Invalid image.',cors);
      return new Response(request.method==='HEAD'?null:bytes,{status:200,headers:{
        ...cors,'Content-Type':data.mime_type,'X-Content-Type-Options':'nosniff',
        'Cache-Control':'public,max-age=3600,s-maxage=604800,stale-while-revalidate=86400'
      }});
    }catch{return fail(502,'image_unavailable','Image unavailable.',cors);}
  }
  backend.searchParams.set('action',url.pathname==='/api/public'?'public':'health');
  try{
    const response=await callGoogle(backend,{method:'GET',cache:'no-store',signal:AbortSignal.timeout(12000)},fetcher);
    if(!response.ok)return fail(502,'upstream_unavailable','Backend unavailable.',cors);
    const text=await response.text();
    if(text.length>250000)return fail(502,'oversized_reply','Backend response too large.',cors);
    let body;
    try{body=JSON.parse(text);}catch{return fail(502,'invalid_reply','Invalid JSON from backend.',cors);}
    if(url.pathname==='/api/public'){
      if(body?.ok!==true||body.schema_version!==1||!isSafePublicCatalogue(body.data))
        return fail(502,'invalid_public_catalog','Invalid public catalogue.',cors);
      return new Response(request.method==='HEAD'?null:text,{status:200,headers:{
        ...JSON_HEADERS,...cors,'Cache-Control':'public,s-maxage=20,stale-while-revalidate=30'}});
    }
    if(body?.ok!==true||body.service!=='aurora_public_content'||body.database_backend!=='google_sheets'||
       body.release!==EXPECTED_RELEASE||typeof body.writes_frozen!=='boolean')
      return fail(503,'invalid_backend_release','Production Apps Script R5 required.',cors);
    return new Response(request.method==='HEAD'?null:JSON.stringify({
      ok:true,provider:'google_sheets',up_to_date:true,
      expected_release:EXPECTED_RELEASE,installed_release:body.release,
      database_backend:'google_sheets',writes_frozen:body.writes_frozen
    }),{status:200,headers:{...JSON_HEADERS,...cors}});
  }catch{return fail(504,'backend_timeout','Backend unavailable.',cors);}
}
export default { fetch:handlePagesApi };
