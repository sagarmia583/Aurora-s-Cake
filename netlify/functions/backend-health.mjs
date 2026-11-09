import { withBakeryCors } from './shared-cors.mjs';
/** Netlify-only read-only health metadata from authoritative Google Apps Script. */
const SCRIPT_RE=/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
const EXPECTED_RELEASE='aurora-2026-11-09-sheets-only-r7';
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers});
async function health(request,{scriptUrl=process.env.AURORA_SCRIPT_POST_URL,fetcher=globalThis.fetch}={}){
 if(request.method!=='GET')return json(405,{ok:false,code:'get_only'});
 let endpoint;
 try{endpoint=new URL(scriptUrl||'');}catch{return json(503,{ok:false,code:'backend_not_configured'});}
 if(endpoint.protocol!=='https:'||endpoint.hostname!=='script.google.com'||!SCRIPT_RE.test(endpoint.pathname)||
   endpoint.username||endpoint.password||endpoint.search||endpoint.hash)return json(503,{ok:false,code:'backend_invalid'});
 endpoint.searchParams.set('action','health');
 try{
   const res=await fetcher(endpoint.href,{method:'GET',redirect:'follow',credentials:'omit',
     cache:'no-store',signal:AbortSignal.timeout(12000)});
   if(!res.ok||!['script.google.com','script.googleusercontent.com'].includes(new URL(res.url).hostname))
     return json(502,{ok:false,code:'backend_unavailable'});
   const state=await res.json();
   if(state?.ok!==true||state.service!=='aurora_public_content')return json(502,{ok:false,code:'backend_invalid_response'});
   const version=typeof state.release==='string'?state.release:'unknown';
   if(state.database_backend!=='google_sheets')return json(503,{ok:false,code:'unexpected_database_backend'});
   if(version!==EXPECTED_RELEASE)return json(503,{ok:false,code:'outdated_apps_script',
     expected_release:EXPECTED_RELEASE,installed_release:version,database_backend:'google_sheets'});
   if(typeof state.writes_frozen!=='boolean')return json(503,{ok:false,code:'unknown_write_state'});
   return json(200,{ok:true,provider:'google_sheets',expected_release:EXPECTED_RELEASE,
     installed_release:version,up_to_date:true,
     database_backend:'google_sheets',writes_frozen:state.writes_frozen});
 }catch{return json(504,{ok:false,code:'backend_timeout'});}
}
// API routing is configured centrally in netlify.toml; Netlify's default
// /.netlify/functions/<name> path remains available for internal rewrites.

export default function handler(request, context={}) {
  return withBakeryCors(request, incoming=>health(incoming,context), ['GET']);
}
