import { json, scriptUrl, expectedUpstream, migrationFreezeStatus } from '../../cloudflare/shared.js';
const EXPECTED_RELEASE='aurora-2026-10-30-supabase-store-r2';

export async function onRequest({ request, env }) {
  if(request.method!=='GET')return json(405,{ok:false,error:'GET only'});
  const endpoint=scriptUrl(env);
  if(!endpoint)return json(503,{ok:false,error:'Backend URL is not configured.'});
  endpoint.searchParams.set('action','health');
  try {
    const response=await fetch(endpoint.href,{
      method:'GET',redirect:'follow',cache:'no-store',signal:AbortSignal.timeout(12000)
    });
    if(!expectedUpstream(response))return json(502,{ok:false,error:'Backend health request failed.'});
    const record=await response.json();
    if(record?.ok!==true||record?.service!=='aurora_public_content')
      return json(502,{ok:false,error:'Backend health response invalid.'});
    const installed=typeof record.release==='string'?record.release:'older-or-unknown';
    const databaseBackend=['google_sheets','supabase'].includes(record.database_backend)
      ? record.database_backend : 'unknown';
    return json(200,{ok:true,expected_release:EXPECTED_RELEASE,
      installed_release:installed,up_to_date:installed===EXPECTED_RELEASE,
      database_backend:databaseBackend,...migrationFreezeStatus(record)});
  }catch{return json(504,{ok:false,error:'Backend health check failed.'});}
}
