/**
 * Vercel Hobby read-only Aurora storefront data proxy.
 * Avoid Apps Script ContentService browser CORS/JSONP fallback latency.
 * The upstream URL is pinned server-side and only GET action=public is allowed.
 */
const VALID_SCRIPT=/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
const respond=(res,status,body)=>{
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(body));
};
export default async function handler(req,res){
  if(req.method!=='GET'&&req.method!=='HEAD')
    return respond(res,405,{ok:false,error:'Only GET is allowed.'});
  let url;
  try{url=new URL(process.env.AURORA_SCRIPT_POST_URL||'');}catch{
    return respond(res,503,{ok:false,error:'Storefront data is not configured.'});
  }
  if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!VALID_SCRIPT.test(url.pathname)||
     url.username||url.password||url.search||url.hash)
    return respond(res,503,{ok:false,error:'Storefront backend configuration is invalid.'});
  url.searchParams.set('action','public');
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const upstream=await fetch(url.toString(),{method:'GET',redirect:'follow',signal:controller.signal,cache:'no-store'});
    if(!upstream.ok||!['script.google.com','script.googleusercontent.com'].includes(new URL(upstream.url).hostname))
      return respond(res,502,{ok:false,error:'Public bakery catalog is temporarily unavailable.'});
    const source=await upstream.text();
    if(source.length>250000) return respond(res,502,{ok:false,error:'Public catalog response exceeded its limit.'});
    let data;try{data=JSON.parse(source);}catch{return respond(res,502,{ok:false,error:'Public catalog returned invalid JSON.'});}
    if(!data||data.ok!==true||!data.data||typeof data.data!=='object'||Array.isArray(data.data)||
       !Number.isFinite(data.schema_version))
      return respond(res,502,{ok:false,error:'Public catalog has not been initialized.'});
    res.statusCode=200;
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Cache-Control','public, s-maxage=20, stale-while-revalidate=30');
    if(req.method==='HEAD')return res.end();
    res.end(source);
  }catch{
    return respond(res,504,{ok:false,error:'The public bakery catalog timed out.'});
  }finally{clearTimeout(timer);}
}
