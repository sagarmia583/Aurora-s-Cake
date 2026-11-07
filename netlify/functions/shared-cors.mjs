/**
 * CORS for the two first-party storefronts sharing ONE Netlify Functions
 * and Apps Script backend. This is not authentication; Apps Script enforces
 * staff roles, customer order receipts and all write permissions.
 *
 * Cross-origin access is permitted ONLY from production GitHub Pages to the
 * exact production Netlify site. Preview deploys must not accept Pages writes.
 */
export const GITHUB_PAGES_ORIGIN='https://sagarmia583.github.io';
export const PRODUCTION_NETLIFY_ORIGIN='https://aurorascake.netlify.app';
const json=(status,code)=>new Response(JSON.stringify({ok:false,success:false,code,error:'Request not allowed.'}),{
  status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'}
});
export async function withBakeryCors(request,handler,allowedMethods){
  let url;
  try{url=new URL(request.url);}catch{return json(400,'invalid_url');}
  const origin=request.headers.get('origin');
  const sameOrigin=origin===url.origin;
  const pagesAllowed=origin===GITHUB_PAGES_ORIGIN && url.origin===PRODUCTION_NETLIFY_ORIGIN;
  if(origin && !sameOrigin && !pagesAllowed)return json(403,'invalid_origin');
  const cors=pagesAllowed?{
    'Access-Control-Allow-Origin':GITHUB_PAGES_ORIGIN,
    'Access-Control-Allow-Methods':allowedMethods.join(', ')+', OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type',
    'Access-Control-Max-Age':'600',
  }:{};
  if(request.method==='OPTIONS'){
    if(!origin||!pagesAllowed)return json(403,'invalid_preflight');
    const requestedMethod=request.headers.get('access-control-request-method');
    const requestedHeaders=request.headers.get('access-control-request-headers')||'';
    if(!allowedMethods.includes(requestedMethod)||requestedHeaders.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean).some(x=>x!=='content-type'))
      return json(403,'invalid_preflight');
    return new Response(null,{status:204,headers:{...cors,'Vary':'Origin, Access-Control-Request-Method, Access-Control-Request-Headers','Cache-Control':'no-store'}});
  }
  if(!allowedMethods.includes(request.method))return json(405,'method_not_allowed');
  const result=await handler(request);
  const headers=new Headers(result.headers);
  headers.set('Vary',headers.has('Vary')?headers.get('Vary')+', Origin':'Origin');
  for(const [name,value] of Object.entries(cors))headers.set(name,value);
  return new Response(result.body,{status:result.status,statusText:result.statusText,headers});
}
