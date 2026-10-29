import { json, scriptUrl, expectedUpstream } from '../../cloudflare/shared.js';

export async function onRequest({request,env}) {
  if(!['GET','HEAD'].includes(request.method)) return json(405,{ok:false,error:'Only GET is allowed.'});
  const endpoint=scriptUrl(env);
  if(!endpoint) return json(503,{ok:false,error:'Storefront data is not configured.'});
  endpoint.searchParams.set('action','public');
  try {
    const response=await fetch(endpoint.href,{
      method:'GET',redirect:'follow',cache:'no-store',signal:AbortSignal.timeout(12000)
    });
    if(!expectedUpstream(response))return json(502,{ok:false,error:'Storefront backend is unavailable.'});
    const source=await response.text();
    if(source.length>250000)return json(502,{ok:false,error:'Public catalog exceeds limit.'});
    let catalog;
    try{catalog=JSON.parse(source);}catch{return json(502,{ok:false,error:'Invalid public catalog.'});}
    if(!catalog||catalog.ok!==true||!catalog.data||
       typeof catalog.data!=='object'||Array.isArray(catalog.data)||
       !Number.isFinite(catalog.schema_version))
      return json(502,{ok:false,error:'Public catalog is not initialized.'});
    return new Response(request.method==='HEAD'?null:source,{status:200,
      headers:{'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff',
        'Cache-Control':'public, s-maxage=20, stale-while-revalidate=30'}});
  }catch{
    return json(504,{ok:false,error:'Public catalog timed out.'});
  }
}
