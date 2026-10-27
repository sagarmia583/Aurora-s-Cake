/**
 * Read-only check for whether the owner actually redeployed Apps Script.
 * Never accepts arbitrary target URLs, tokens or credentials.
 */
const EXPECTED_RELEASE='aurora-2026-10-27-phone-tracking-r3';
const JSON_HEADERS={'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export default async function handler(req,res){
  for(const [key,value] of Object.entries(JSON_HEADERS))res.setHeader(key,value);
  const respond=(status,body)=>{res.statusCode=status;res.end(JSON.stringify(body));};
  if(req.method!=='GET')return respond(405,{ok:false,error:'GET only'});
  let upstream;
  try{upstream=new URL(process.env.AURORA_SCRIPT_POST_URL||'');}catch{
    return respond(503,{ok:false,error:'Apps Script deployment URL is not configured'});
  }
  if(upstream.protocol!=='https:'||upstream.hostname!=='script.google.com'||
     !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(upstream.pathname)||
     upstream.search||upstream.hash||upstream.username||upstream.password)
    return respond(503,{ok:false,error:'Apps Script URL is invalid'});
  upstream.searchParams.set('action','health');
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(upstream.toString(),{method:'GET',redirect:'follow',
      signal:controller.signal,cache:'no-store'});
    if(!response.ok||!['script.google.com','script.googleusercontent.com'].includes(new URL(response.url).hostname))
      return respond(502,{ok:false,error:'Apps Script health request failed'});
    const json=await response.json();
    if(json?.ok!==true||json?.service!=='aurora_public_content')
      return respond(502,{ok:false,error:'Apps Script health response was invalid'});
    const installed=typeof json.release==='string'?json.release:'older-or-unknown';
    return respond(200,{ok:true,expected_release:EXPECTED_RELEASE,
      installed_release:installed,up_to_date:installed===EXPECTED_RELEASE});
  }catch{return respond(504,{ok:false,error:'Apps Script health request timed out or failed'});}
  finally{clearTimeout(timer);}
}
