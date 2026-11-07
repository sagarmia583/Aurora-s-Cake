/** Netlify-only public image gateway for private Google Apps Script image assets. */
const SCRIPT_RE=/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
const reply=(status,code)=>new Response(JSON.stringify({ok:false,code}),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export default async function publicImage(request,{scriptUrl=process.env.AURORA_SCRIPT_POST_URL,fetcher=globalThis.fetch}={}){
  if(request.method!=='GET'&&request.method!=='HEAD')return reply(405,'get_only');
  const id=new URL(request.url).searchParams.get('id')||'';
  if(!/^[A-Za-z0-9_-]{12,150}$/.test(id))return reply(404,'image_not_found');
  let endpoint;
  try{endpoint=new URL(scriptUrl||'');}catch{return reply(503,'backend_not_configured');}
  if(endpoint.protocol!=='https:'||endpoint.hostname!=='script.google.com'||!SCRIPT_RE.test(endpoint.pathname)||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)return reply(503,'invalid_backend');
  endpoint.searchParams.set('action','public_image');endpoint.searchParams.set('id',id);
  try{
    const response=await fetcher(endpoint.href,{method:'GET',redirect:'follow',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(18000)});
    if(!response.ok||!['script.google.com','script.googleusercontent.com'].includes(new URL(response.url).hostname))return reply(502,'image_upstream_failed');
    const data=await response.json();
    if(data?.ok!==true||typeof data.base64!=='string'||data.base64.length>900000||!['image/jpeg','image/png','image/webp'].includes(data.mime_type))return reply(404,'image_unavailable');
    const bytes=Uint8Array.from(atob(data.base64),c=>c.charCodeAt(0));
    if(!bytes.length||bytes.length>650000)return reply(502,'image_exceeds_limit');
    const jpeg=bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    const png=bytes.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
    const webp=bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
    if(!((data.mime_type==='image/jpeg'&&jpeg)||(data.mime_type==='image/png'&&png)||(data.mime_type==='image/webp'&&webp)))return reply(502,'invalid_image_content');
    return new Response(request.method==='HEAD'?null:bytes,{status:200,headers:{'Content-Type':data.mime_type,'Content-Length':String(bytes.length),'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Cache-Control':'public,max-age=3600,s-maxage=604800,stale-while-revalidate=86400'}});
  }catch{return reply(502,'image_unavailable');}
}
export const config={path:'/api/image'};
