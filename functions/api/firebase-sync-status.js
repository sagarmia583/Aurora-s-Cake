import { firebaseMirrorConfiguration } from '../../api/lib/firestoreOrderMirror.js';
import { json } from '../../cloudflare/shared.js';

export function onRequest({request,env}){
  if(request.method!=='GET')return json(405,{ok:false,error:'GET only'});
  const state=firebaseMirrorConfiguration(env);
  return json(200,{ok:true,provider:'firestore',project_id:'aurorascake-213a0',
    enabled:state.enabled,configured:state.configured,configuration_code:state.reason,
    deployment_platform:'cloudflare_pages',
    mode:'one_way_server_verified_order_mirror',legacy_primary:'google_sheets',
    live_write_tested:false});
}
