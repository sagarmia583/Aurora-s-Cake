/** Read-only Netlify health check for the sole Google Sheets backend. */
import {EXPECTED_RELEASE} from '../../functions/api/backend-health.js';
const respond=(status,body)=>new Response(JSON.stringify(body),{status,headers:{
  'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
export default async function backendHealth(request,{
  scriptUrl=process.env.AURORA_SCRIPT_POST_URL,fetcher=globalThis.fetch
}={}){
  if(request.method!=='GET')return respond(405,{ok:false,code:'method_not_allowed'});
  let url;try{url=new URL(scriptUrl||'');}catch{return respond(503,{ok:false,code:'backend_not_configured'});}
  if(url.protocol!=='https:'||url.hostname!=='script.google.com'||
     !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname)||
     url.username||url.password||url.search||url.hash)
    return respond(503,{ok:false,code:'backend_not_configured'});
  url.searchParams.set('action','health');
  try{
    const result=await fetcher(url.href,{method:'GET',redirect:'follow',cache:'no-store',
      signal:AbortSignal.timeout(12000)});
    if(!result.ok||!['script.google.com','script.googleusercontent.com'].includes(new URL(result.url).hostname))
      return respond(502,{ok:false,code:'health_unavailable'});
    const data=await result.json();
    if(data?.ok!==true||data.service!=='aurora_public_content')
      return respond(502,{ok:false,code:'health_invalid'});
    const installed=typeof data.release==='string'?data.release:'unknown';
    if(data.database_backend!=='google_sheets')
      return respond(503,{ok:false,code:'unexpected_database_backend',installed_release:installed});
    return respond(200,{ok:true,database_backend:'google_sheets',expected_release:EXPECTED_RELEASE,
      installed_release:installed,up_to_date:installed===EXPECTED_RELEASE,
      writes_frozen:typeof data.writes_frozen==='boolean'?data.writes_frozen:null});
  }catch{return respond(504,{ok:false,code:'health_timeout'});}
}
export const config={path:'/api/backend-health'};
