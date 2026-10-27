import { firebaseMirrorConfiguration } from './lib/firestoreOrderMirror.js';

// Public, read-only readiness endpoint. It exposes no service account material,
// tokens, order content, or private customer details.
export default function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET') {
    res.statusCode=405;
    return res.end(JSON.stringify({ok:false,error:'GET is required'}));
  }
  const status=firebaseMirrorConfiguration();
  res.statusCode=200;
  res.end(JSON.stringify({
    ok:true,provider:'firestore',project_id:'aurorascake-213a0',
    enabled:status.enabled,configured:status.configured,
    mode:'one_way_server_verified_order_mirror',
    legacy_primary:'google_sheets',
    // "configured" does not guarantee token exchange or successful writes.
    live_write_tested:false,
  }));
}
