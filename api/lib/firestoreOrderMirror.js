/**
 * Server-only, one-way Firebase Firestore mirror for AUTHORITATIVE Apps Script
 * receipts. No Firebase key, staff token, OTP or receipt capability goes to
 * the client or Firestore. Private Firestore security rules stay deny-by-default.
 *
 * Primary system of record: Google Sheets / Apps Script.
 * Secondary best-effort projection: Firestore private orders collection.
 *
 * IMPORTANT: To enable, set FIREBASE_MIRROR_ENABLED=true and configure the
 * server-only FIREBASE_SERVICE_ACCOUNT_JSON in Vercel. Never use VITE_ here.
 */
import { createSign, createPrivateKey } from 'node:crypto';

const PROJECT_ID = 'aurorascake-213a0';
const TOKEN_URI = 'https://oauth2.googleapis.com/token';
const MAX_ITEMS = 80;
const statuses = new Set(['pending','confirmed','preparing','ready','assigned','picked_up','out_for_delivery','delivered','cancelled']);
const payments = new Set(['pending','paid','failed']);
let cachedToken = null;
let cachedExpiry = 0;
let cachedKey = null;

export function firebaseMirrorConfiguration(env = process.env) {
  // Return only a non-sensitive code. Never disclose the credential or
  // individual token material to API clients.
  if (env.FIREBASE_MIRROR_ENABLED !== 'true') {
    return { enabled: false, configured: false, reason: 'disabled' };
  }
  const raw = env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
  if (!raw) return { enabled: true, configured: false, reason: 'missing_service_account' };
  let credentials;
  try { credentials=JSON.parse(raw); }
  catch { return { enabled:true, configured:false, reason:'invalid_json' }; }
  if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials) ||
      credentials.type !== 'service_account')
    return { enabled:true, configured:false, reason:'not_service_account' };
  if (credentials.project_id !== PROJECT_ID)
    return { enabled:true, configured:false, reason:'wrong_project_id' };
  if (typeof credentials.client_email !== 'string' ||
      !credentials.client_email.endsWith('.iam.gserviceaccount.com'))
    return { enabled:true, configured:false, reason:'invalid_client_email' };
  if (typeof credentials.private_key !== 'string' ||
      !credentials.private_key.includes('-----BEGIN PRIVATE KEY-----'))
    return { enabled:true, configured:false, reason:'missing_private_key' };
  try { createPrivateKey(credentials.private_key); }
  catch { return { enabled:true, configured:false, reason:'invalid_private_key' }; }
  return { enabled: true, configured: true, reason: 'configured' };
}

const safeText = (value, max) => typeof value === 'string' ? value.slice(0,max) : '';
const money = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0
  ? Math.round(value*100)/100 : null;
const validTime = (value) => typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) &&
  Number.isFinite(Date.parse(value));

/** Deny-by-default data projection: explicitly pick only business fields. */
export function projectCommittedOrder(order) {
  if (!order || typeof order !== 'object' || Array.isArray(order) ||
      typeof order.id !== 'string' || !/^ord_[a-zA-Z0-9_-]{8,146}$/.test(order.id) ||
      typeof order.order_number !== 'string' || !order.order_number ||
      !statuses.has(order.status) || !validTime(order.updated_at) ||
      !validTime(order.created_at) || money(order.total_amount) === null) return null;
  if (order.payment_status !== undefined && !payments.has(order.payment_status)) return null;
  const items = Array.isArray(order.items) ? order.items : [];
  if (items.length > MAX_ITEMS) return null;
  const cleanItems = items.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    if (!Number.isInteger(item.quantity) || item.quantity < 1 ||
        money(item.subtotal) === null) return null;
    return {
      product_id: safeText(item.product_id,120),
      product_name: safeText(item.product_name,180),
      variant_name: safeText(item.variant_name,120),
      quantity: item.quantity,
      unit_price: money(item.unit_price) ?? 0,
      subtotal: money(item.subtotal),
    };
  });
  if (cleanItems.some(item=>item===null)) return null;
  return {
    id: order.id,
    order_number: safeText(order.order_number,100),
    created_at: order.created_at,
    updated_at: order.updated_at,
    status: order.status,
    customer_name: safeText(order.customer_name,100),
    customer_phone: safeText(order.customer_phone,30),
    delivery_address: safeText(order.delivery_address,1000),
    delivery_date: safeText(order.delivery_date,32),
    delivery_slot: safeText(order.delivery_slot,100),
    rider_name: safeText(order.rider_name,100),
    payment_method: safeText(order.payment_method,30),
    payment_status: safeText(order.payment_status || 'pending',20),
    cod_collected: order.cod_collected === true,
    subtotal: money(order.subtotal) ?? 0,
    delivery_fee: money(order.delivery_fee) ?? 0,
    discount_amount: money(order.discount_amount) ?? 0,
    total_amount: money(order.total_amount),
    cod_amount: money(order.cod_amount) ?? 0,
    items: cleanItems,
    source: 'google_sheets',
    schema_version: 1,
  };
}

function toFirestoreField(value) {
  if (value === null || value === undefined) return { nullValue: 'NULL_VALUE' };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return { doubleValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreField) } };
  const fields = Object.fromEntries(Object.entries(value).map(([k,v])=>[k,toFirestoreField(v)]));
  return { mapValue: { fields } };
}

export async function getGoogleAccessToken(fetcher, env = process.env) {
  const credentialKey = env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
  if (cachedToken && cachedKey === credentialKey && Date.now() < cachedExpiry) return cachedToken;
  const config = firebaseMirrorConfiguration(env);
  if (!config.configured) throw new Error('firebase_mirror_not_configured');
  const credentials = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const now = Math.floor(Date.now()/1000);
  const header = Buffer.from(JSON.stringify({ alg:'RS256',typ:'JWT' })).toString('base64url');
  const claim = Buffer.from(JSON.stringify({
    iss:credentials.client_email,sub:credentials.client_email,
    aud:TOKEN_URI,scope:'https://www.googleapis.com/auth/datastore',
    iat:now,exp:now+3600,
  })).toString('base64url');
  const signingInput=header+'.'+claim;
  const signer=createSign('RSA-SHA256'); signer.update(signingInput); signer.end();
  const assertion=signingInput+'.'+signer.sign(credentials.private_key).toString('base64url');
  const body=new URLSearchParams({
    grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion,
  });
  const response=await fetcher(TOKEN_URI,{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:body.toString(),signal:AbortSignal.timeout(6000),
  });
  if(!response.ok) throw new Error('firebase_oauth_failed_'+response.status);
  const data=await response.json();
  if(typeof data.access_token !== 'string' || !data.access_token ||
     typeof data.expires_in !== 'number') throw new Error('firebase_oauth_invalid_response');
  cachedToken=data.access_token;
  cachedKey=credentialKey;
  cachedExpiry=Date.now()+Math.max(0,data.expires_in-120)*1000;
  return cachedToken;
}

export async function mirrorCommittedOrder(order,{fetcher=globalThis.fetch,env=process.env}={}) {
  const projected=projectCommittedOrder(order);
  if (!projected) return { status:'skipped_invalid_receipt' };
  if (!firebaseMirrorConfiguration(env).configured) return { status:'not_configured' };
  const token=await getGoogleAccessToken(fetcher,env);
  const documentUrl='https://firestore.googleapis.com/v1/projects/'+PROJECT_ID+
    '/databases/(default)/documents/orders/'+encodeURIComponent(projected.id);
  const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
  for (let attempt=0; attempt<3; attempt++) {
    const current=await fetcher(documentUrl,{headers:{Authorization:'Bearer '+token},
      signal:AbortSignal.timeout(5500)});
    if(current.status!==404 && !current.ok) throw new Error('firestore_read_'+current.status);
    let condition='currentDocument.exists=false';
    if(current.ok) {
      const previous=await current.json();
      const last=previous?.fields?.updated_at?.stringValue;
      if(typeof last==='string' && Date.parse(last)>=Date.parse(projected.updated_at)) {
        return { status:'unchanged' };
      }
      if(typeof previous.updateTime!=='string')throw new Error('firestore_missing_update_time');
      condition='currentDocument.updateTime='+encodeURIComponent(previous.updateTime);
    }
    const fields=Object.fromEntries(Object.entries(projected).map(([k,v])=>[k,toFirestoreField(v)]));
    const reply=await fetcher(documentUrl+'?'+condition,{
      method:'PATCH',headers,body:JSON.stringify({fields}),
      signal:AbortSignal.timeout(6000),
    });
    if(reply.ok) return {status:'saved'};
    if(reply.status===409 || reply.status===412 || reply.status===400 && attempt<2) continue;
    throw new Error('firestore_write_'+reply.status);
  }
  throw new Error('firestore_concurrent_write_conflict');
}

/**
 * Mirror only a successful, backend-verified response. Never mirror raw
 * browser-submitted order, payment amount or status.
 */
export async function mirrorAuthoritativeReply(payload,reply,{fetcher=globalThis.fetch,env=process.env}={}) {
  const action=payload?.action;
  if(action!=='create_order' && action!=='staff_mutate') return {status:'not_applicable'};
  if(action==='create_order' && !(reply?.success===true && reply?.persisted===true)) {
    return {status:'not_applicable'};
  }
  if(action==='staff_mutate' && reply?.ok!==true) return {status:'not_applicable'};
  if (!firebaseMirrorConfiguration(env).configured) return {status:'not_configured'};
  try {
    return await mirrorCommittedOrder(reply.order,{fetcher,env});
  }catch(error) {
    // Do NOT fail a successfully committed customer order or staff transition
    // because a secondary Firebase mirror is unavailable.
    console.error('Firebase order mirror failed:',error instanceof Error?error.message:'unknown');
    return {status:'failed'};
  }
}

/**
 * An explicit ADMIN-ONLY paged backfill is eligible solely after the Apps
 * Script backend verifies staff_orders credentials and returns super_admin.
 * Avoid mirroring on routine polling / refreshing of the staff order list.
 */
export async function mirrorVerifiedAdminOrderPage(payload,reply,{fetcher=globalThis.fetch,env=process.env}={}) {
  if(payload?.action!=='staff_orders' || payload.firebase_mirror_backfill!==true ||
     reply?.ok!==true || reply.role!=='super_admin' || reply.snapshot_complete!==true ||
     !Array.isArray(reply.orders)) return null;
  const rawOffset=payload.firebase_mirror_offset;
  const offset=Number.isSafeInteger(rawOffset)&&rawOffset>=0&&rawOffset<=100000?rawOffset:0;
  const orders=reply.orders;
  const slice=orders.slice(offset,offset+5);
  const result={offset,total:orders.length,next_offset:Math.min(orders.length,offset+5),
    saved:0,unchanged:0,skipped:0,failed:0,configured:firebaseMirrorConfiguration(env).configured};
  if(!result.configured) return result;
  for (const order of slice) {
    try {
      const state=await mirrorCommittedOrder(order,{fetcher,env});
      if(state.status==='saved')result.saved++;
      else if(state.status==='unchanged')result.unchanged++;
      else result.skipped++;
    } catch(error) {
      result.failed++;
      console.error('Firebase backfill failed:',error instanceof Error?error.message:'unknown');
    }
  }
  return result;
}

/**
 * Benign Firestore write probe. Never call this directly from a public route:
 * the caller MUST first receive a verified super_admin role from Apps Script
 * through the existing authenticated staff_orders action.
 * Writes only non-personal readiness data in a fixed private document.
 */
export async function verifyFirebaseMirrorWrite({ env=process.env, fetcher=globalThis.fetch }={}) {
  const state=firebaseMirrorConfiguration(env);
  if (!state.configured) return { ok:false, code:state.reason };
  try {
    const token=await getGoogleAccessToken(fetcher,env);
    const url='https://firestore.googleapis.com/v1/projects/'+PROJECT_ID+
      '/databases/(default)/documents/integration_checks/cloudflare_pages';
    const response=await fetcher(url,{
      method:'PATCH',
      headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({fields:{
        last_checked_at:{timestampValue:new Date().toISOString()},
        application:{stringValue:'auroras_cake'},
        purpose:{stringValue:'server_side_mirror_permission_test'},
      }}),
      signal:AbortSignal.timeout(6000),
    });
    if(response.ok)return {ok:true,code:'write_verified'};
    // Expose status only; never echo arbitrary OAuth/Firestore error bodies.
    return {ok:false,code:'firestore_write_'+response.status};
  } catch(error) {
    const code=error instanceof Error ? error.message : '';
    if(/^firebase_oauth_failed_\d{3}$/.test(code)||code==='firebase_oauth_invalid_response')
      return {ok:false,code};
    return {ok:false,code:'firebase_server_connectivity_failed'};
  }
}
