import { json, scriptUrl, expectedUpstream } from '../../cloudflare/shared.js';

export async function onRequest({request,env}) {
  if(!['GET','HEAD'].includes(request.method))return json(405,{ok:false,error:'GET required.'});
  const imageId=new URL(request.url).searchParams.get('id')||'';
  if(!/^[A-Za-z0-9_-]{12,150}$/.test(imageId))return json(404,{ok:false,error:'Image not found.'});
  const endpoint=scriptUrl(env);
  if(!endpoint)return json(503,{ok:false,error:'Image backend is not configured.'});
  endpoint.searchParams.set('action','public_image');
  endpoint.searchParams.set('id',imageId);
  try {
    const response=await fetch(endpoint.href,{redirect:'follow',signal:AbortSignal.timeout(18000)});
    if(!expectedUpstream(response))return json(502,{ok:false,error:'Image upstream failed.'});
    const data=await response.json();
    if(!data||data.ok!==true||typeof data.base64!=='string'||data.base64.length>900000||
       !['image/jpeg','image/png','image/webp'].includes(data.mime_type))
      return json(404,{ok:false,error:'Image unavailable.'});
    const bytes=Uint8Array.from(atob(data.base64),character=>character.charCodeAt(0));
    if(bytes.length===0||bytes.length>650000)return json(502,{ok:false,error:'Image exceeds limit.'});
    const jpeg=bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    const png=bytes.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
    const webp=bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&
      String.fromCharCode(...bytes.slice(8,12))==='WEBP';
    if(!((data.mime_type==='image/jpeg'&&jpeg)||(data.mime_type==='image/png'&&png)||
         (data.mime_type==='image/webp'&&webp)))return json(502,{ok:false,error:'Invalid image content.'});
    return new Response(request.method==='HEAD'?null:bytes,{status:200,
      headers:{'Content-Type':data.mime_type,'Content-Length':String(bytes.length),
        'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",
        'Cache-Control':'public,max-age=3600,s-maxage=604800,stale-while-revalidate=86400'}});
  }catch{return json(502,{ok:false,error:'Image temporarily unavailable.'});}
}
