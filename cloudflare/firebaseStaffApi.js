/**
 * Firebase-primary STAFF API (independent of Apps Script / Google Sheets).
 * Read-only in Phase 2. All authorization happens server-side.
 *
 * Private staff_roles/{FirebaseAuth.uid} docs are provisioned offline only.
 * Public signup can NEVER create a staff role. No backend data is returned
 * until a signed Firebase Auth ID token and an active matching staff role pass.
 */
import {verifyFirebaseIdToken,bearerFromRequest} from './firebaseStaffAuth.js';
import {getGoogleAccessToken,firebaseMirrorConfiguration} from '../api/lib/firestoreOrderMirror.js';
const BASE='https://firestore.googleapis.com/v1/projects/aurorascake-213a0/databases/(default)/documents';
const ROLES=new Set(['super_admin','admin','order_manager','kitchen_manager','delivery_manager','delivery_man','accountant']);
const json=(status,value)=>new Response(JSON.stringify(value),{
  status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}
});
const str=(fields,key,limit=160)=>String(fields?.[key]?.stringValue||'').slice(0,limit);
const boolean=(fields,key)=>fields?.[key]?.booleanValue===true;
const money=(fields,key)=> {
  const f=fields?.[key],n=Number(f?.doubleValue??f?.integerValue);
  return Number.isFinite(n)&&n>=0&&n<=10000000?n:0;
};
const safeItem=(item)=>{
  const fields=item?.mapValue?.fields;
  if(!fields)return null;
  return {
    product_id:str(fields,'product_id',120),
    product_name:str(fields,'product_name',180),
    variant_name:str(fields,'variant_name',120),
    quantity:Math.max(0,Number(fields.quantity?.integerValue)||0),
    subtotal:money(fields,'subtotal')
  };
};
export function sanitizeFirestoreStaffOrder(doc){
  const fields=doc?.fields;
  if(!fields||typeof fields!=='object')return null;
  const id=str(fields,'id',180);
  if(!/^ord_[A-Za-z0-9_-]{8,146}$/.test(id))return null;
  const items=(fields.items?.arrayValue?.values||[]).slice(0,80).map(safeItem).filter(Boolean);
  return {
    id,order_number:str(fields,'order_number',100),
    created_at:str(fields,'created_at',50),
    updated_at:str(fields,'updated_at',50),
    status:str(fields,'status',32),
    customer_name:str(fields,'customer_name',100),
    customer_phone:str(fields,'customer_phone',30),
    delivery_address:str(fields,'delivery_address',1000),
    delivery_date:str(fields,'delivery_date',32),
    delivery_slot:str(fields,'delivery_slot',100),
    rider_name:str(fields,'rider_name',100),
    payment_status:str(fields,'payment_status',20),
    payment_method:str(fields,'payment_method',30),
    cod_collected:boolean(fields,'cod_collected'),
    total_amount:money(fields,'total_amount'),
    cod_amount:money(fields,'cod_amount'),
    items
  };
}
export function parseStaffRoleDocument(document,identity){
  const fields=document?.fields;
  if(!fields||!boolean(fields,'active'))return null;
  const role=str(fields,'role',60),email=str(fields,'email',300).toLowerCase();
  if(!ROLES.has(role)||email!==identity.email)return null;
  const uidFromName=String(document.name||'').split('/').pop();
  if(uidFromName!==identity.uid)return null;
  return {uid:identity.uid,role,email,name:str(fields,'name',120)||email};
}

export async function handleFirebaseStaffApi({request,env}, {
  fetcher=globalThis.fetch,verifier=verifyFirebaseIdToken
}={}){
  if(request.method!=='GET')return json(405,{ok:false,code:'method_not_allowed'});
  if(env?.FIREBASE_PRIMARY_STAFF_ENABLED!=='true')
    return json(503,{ok:false,code:'firebase_staff_not_enabled'});
  const state=firebaseMirrorConfiguration({...env,FIREBASE_MIRROR_ENABLED:'true'});
  if(!state.configured)return json(503,{ok:false,code:'firebase_credentials_unavailable'});
  const jwt=bearerFromRequest(request);
  if(!jwt)return json(401,{ok:false,code:'firebase_login_required'});
  let identity;
  try{identity=await verifier(jwt,{fetcher});}
  catch{return json(401,{ok:false,code:'firebase_token_invalid'});}
  let access;
  try{access=await getGoogleAccessToken(fetcher,{...env,FIREBASE_MIRROR_ENABLED:'true'});}
  catch{return json(503,{ok:false,code:'firebase_backend_unavailable'});}
  const headers={Authorization:'Bearer '+access};
  let roleResponse;
  try{roleResponse=await fetcher(BASE+'/staff_roles/'+encodeURIComponent(identity.uid),{
    method:'GET',headers,signal:AbortSignal.timeout(6000)
  });}catch{return json(503,{ok:false,code:'staff_role_lookup_unavailable'});}
  if(roleResponse.status===404)return json(403,{ok:false,code:'staff_role_not_provisioned'});
  if(!roleResponse.ok)return json(503,{ok:false,code:'staff_role_lookup_unavailable'});
  let role;
  try{role=parseStaffRoleDocument(await roleResponse.json(),identity);}
  catch{return json(503,{ok:false,code:'staff_role_invalid'});}
  if(!role)return json(403,{ok:false,code:'staff_access_denied'});

  const pathname=new URL(request.url).pathname;
  if(pathname==='/api/firebase-primary/staff/session')
    return json(200,{ok:true,provider:'firebase',session:role});
  if(pathname==='/api/firebase-primary/staff/orders'){
    // Staff with an active private Firestore role can read customer orders.
    // Only a limited read-only list in Phase 2; no status or payment writes.
    let response;
    try{response=await fetcher(BASE+'/orders?pageSize=25',{
      method:'GET',headers,signal:AbortSignal.timeout(6500)
    });}catch{return json(503,{ok:false,code:'orders_unavailable'});}
    if(!response.ok)return json(503,{ok:false,code:'orders_unavailable'});
    let body;
    try{body=await response.json();}catch{return json(503,{ok:false,code:'orders_invalid'});}
    if(!Array.isArray(body.documents)&&body.documents!==undefined)
      return json(503,{ok:false,code:'orders_invalid'});
    const orders=(body.documents||[]).slice(0,25).map(sanitizeFirestoreStaffOrder).filter(Boolean);
    return json(200,{ok:true,provider:'firebase',read_only:true,orders,
      has_more:typeof body.nextPageToken==='string'&&body.nextPageToken.length>0});
  }
  return json(404,{ok:false,code:'route_not_found'});
}
