// Native app requests may omit Origin. Every browser request must be same-origin.
export const PRODUCTION_NETLIFY_ORIGIN='https://aurorascake.netlify.app';
const json=(status,code)=>new Response(JSON.stringify({ok:false,success:false,code,error:'Request not allowed.'}),{
  status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'}
});
export async function withBakeryCors(request,handler,allowedMethods){
  const origin=request.headers.get('origin');
  if(origin && origin!==new URL(request.url).origin)return json(403,'invalid_origin');
  if(!allowedMethods.includes(request.method))return json(405,'method_not_allowed');
  const result=await handler(request);
  const headers=new Headers(result.headers);
  const vary=headers.get('Vary');
  headers.set('Vary',vary?vary+', Origin':'Origin');
  return new Response(result.body,{status:result.status,statusText:result.statusText,headers});
}
