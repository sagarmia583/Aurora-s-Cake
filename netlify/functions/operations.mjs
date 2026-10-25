/**
 * Optional same-origin Google Apps Script POST relay for Netlify Free.
 * Resolves browser CORS/ContentService redirect problems without a paid gateway.
 * Does NOT replace authorization: Apps Script verifies staff Google tokens,
 * customer receipt keys, prices, statuses and checkout rate limits.
 * Netlify Functions consume Free plan credits; usage is NOT unlimited.
 */
const SCRIPT_RE=/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
export default async function operations(request) {
  const response=(status,message)=>new Response(JSON.stringify({ok:false,success:false,code:'proxy_error',error:message}),{
    status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
  });
  if(request.method!=='POST') return response(405,'POST is required.');
  const origin=request.headers.get('origin');
  if(origin && origin!==new URL(request.url).origin) return response(403,'Cross-origin requests are not permitted.');
  const declaredLength=Number(request.headers.get('content-length')||0);
  if(declaredLength>50000) return response(413,'Request too large.');
  const raw=await request.text();
  if(!raw||raw.length>50000) return response(413,'Request too large.');
  let payload;
  try {payload=JSON.parse(raw);} catch {return response(400,'Invalid JSON.');}
  const allowed=['create_order','get_order_status','staff_session','staff_orders','staff_mutate','staff_catalog',
    'staff_catalog_update','customer_session','customer_orders','customer_claim_order','create_custom_cake',
    'get_custom_cake_status','staff_custom_cakes','staff_custom_quote'];
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||!allowed.includes(payload.action))
    return response(400,'Unknown action.');
  let target;
  try {target=new URL(process.env.AURORA_SCRIPT_POST_URL||'');}
  catch {return response(503,'Bakery backend URL has not been configured.');}
  if(target.protocol!=='https:'||target.hostname!=='script.google.com'||!SCRIPT_RE.test(target.pathname)
    ||target.username||target.password||target.search||target.hash)
    return response(503,'Invalid bakery backend configuration.');
  try {
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),24000);
    let upstream;
    try {upstream=await fetch(target.href,{method:'POST',redirect:'follow',credentials:'omit',
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
    return new Response(JSON.stringify(reply),{status:200,
      headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
        'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
  } catch {
    return response(502,'Bakery backend is temporarily unreachable. Retry the same order reference.');
  }
}
export const config={path:'/api/operations'};
