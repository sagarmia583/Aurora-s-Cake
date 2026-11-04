/** Public, read-only Netlify same-origin proxy to the existing Google Apps Script.
 * Never forwards credentials or accesses private Google Sheets tables.
 */
const SCRIPT_RE = /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
const headers = {'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const reject = (status,code) => new Response(JSON.stringify({ok:false,code}),{status,headers:{...headers,'Cache-Control':'no-store'}});
export default async function publicCatalog(request,{scriptUrl=process.env.AURORA_SCRIPT_POST_URL,fetcher=globalThis.fetch}={}) {
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
       !Number.isFinite(record.schema_version))return reject(502,'public_catalog_invalid');
    return new Response(request.method==='HEAD'?null:raw,{status:200,headers:{
      ...headers,'Cache-Control':'public, s-maxage=20, stale-while-revalidate=30'
    }});
  }catch{return reject(504,'public_catalog_timeout');}
}
export const config={path:'/api/public'};
