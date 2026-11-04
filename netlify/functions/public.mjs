/**
 * Netlify same-origin, read-only Google Sheets catalogue.
 * No private Sheet records or browser credentials are forwarded.
 */
const pattern=/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
const err=(status,code)=>new Response(JSON.stringify({ok:false,code}),{status,headers:{
  'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
export default async function publicCatalog(request,{
  scriptUrl=process.env.AURORA_SCRIPT_POST_URL,fetcher=globalThis.fetch
}={}){
  if(request.method!=='GET'&&request.method!=='HEAD')return err(405,'method_not_allowed');
  let url;try{url=new URL(scriptUrl||'');}catch{return err(503,'backend_not_configured');}
  if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!pattern.test(url.pathname)||
     url.username||url.password||url.search||url.hash)return err(503,'backend_not_configured');
  url.searchParams.set('action','public');
  try{
    const upstream=await fetcher(url.href,{method:'GET',redirect:'follow',cache:'no-store',
      signal:AbortSignal.timeout(12000)});
    if(!upstream.ok||!['script.google.com','script.googleusercontent.com'].includes(new URL(upstream.url).hostname))
      return err(502,'catalog_unavailable');
    const body=await upstream.text();
    if(body.length>250000)return err(502,'catalog_oversized');
    let data;try{data=JSON.parse(body);}catch{return err(502,'catalog_invalid');}
    if(data?.ok!==true||!data.data||typeof data.data!=='object'||Array.isArray(data.data)||
      !Number.isFinite(data.schema_version))return err(502,'catalog_invalid');
    return new Response(request.method==='HEAD'?null:body,{status:200,headers:{
      'Content-Type':'application/json; charset=utf-8',
      'Cache-Control':'public, s-maxage=20, stale-while-revalidate=30',
      'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
  }catch{return err(504,'catalog_timeout');}
}
export const config={path:'/api/public'};
