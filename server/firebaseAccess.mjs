/**
 * All Firestore staff privileges are resolved from private staff_accounts/{uid}.
 * Client-provided role/permissions NEVER grant access. Revocation takes effect
 * on the next request (Firebase ID tokens are verified each time).
 */
export const capabilities=[
  'orders_view','order_confirm','order_cancel','kitchen_start','kitchen_ready',
  'delivery_assign','delivery_pickup','delivery_start','delivery_complete',
  'custom_cakes_view','custom_cakes_quote','customers_lookup',
  'catalog_view','catalog_edit','catalog_archive','finance_view','finance_edit',
  'sales_view','sales_create','sales_discount','sales_history'
];
export const roleDefaults={
  super_admin:capabilities,
  manager:capabilities,
  admin:capabilities.filter(x=>!['delivery_pickup','delivery_start','delivery_complete'].includes(x)),
  order_manager:['orders_view','order_confirm','order_cancel','customers_lookup','custom_cakes_view','custom_cakes_quote','sales_view','sales_create','sales_history'],
  kitchen_manager:['orders_view','kitchen_start','kitchen_ready'],
  delivery_manager:['orders_view','delivery_assign','customers_lookup'],
  delivery_man:['orders_view','delivery_pickup','delivery_start','delivery_complete'],
  accountant:['orders_view','finance_view','sales_view','sales_history']
};
export function has(actor,permission){
  if(!capabilities.includes(permission))return false;
  if(['super_admin','manager'].includes(actor.role))return true;
  return (Array.isArray(actor.permissions)?actor.permissions:roleDefaults[actor.role]||[]).includes(permission);
}
export function requirePermission(actor,permission){
  if(!has(actor,permission))throw Object.assign(new Error('Access denied.'),{code:'forbidden',httpStatus:403});
}
export function cleanUser(actor){
  return {name:actor.name,email:actor.email,username:actor.username||'',role:actor.role,
    permissions:actor.role==='super_admin'||actor.role==='manager'?capabilities:
      Array.isArray(actor.permissions)?actor.permissions:roleDefaults[actor.role]||[],
    riders:[]};
}
export async function authenticateStaff(auth,db,idToken){
  if(typeof idToken!=='string'||idToken.length<100||idToken.length>12000)
    throw Object.assign(new Error('Firebase ID token required.'),{code:'unauthorized',httpStatus:401});
  let identity;
  try{identity=await auth.verifyIdToken(idToken,true);}catch{
    throw Object.assign(new Error('Firebase login expired. Sign in again.'),{code:'unauthorized',httpStatus:401});
  }
  if(!identity.uid||!identity.email||identity.email_verified!==true)
    throw Object.assign(new Error('Verified email is required.'),{code:'unauthorized',httpStatus:401});
  const staff=await db.collection('staff_accounts').doc(identity.uid).get();
  if(!staff.exists)throw Object.assign(new Error('Staff access is not enabled.'),{code:'forbidden',httpStatus:403});
  const data=staff.data()||{};
  if(data.active!==true||String(data.email||'').toLowerCase()!==identity.email.toLowerCase()||
    !Object.hasOwn(roleDefaults,data.role))
    throw Object.assign(new Error('Staff access disabled or invalid.'),{code:'forbidden',httpStatus:403});
  return {uid:identity.uid,email:identity.email.toLowerCase(),name:String(data.name||identity.name||identity.email).slice(0,100),
    username:typeof data.username==='string'?data.username:'',role:data.role,
    permissions:Array.isArray(data.permissions)?data.permissions.filter(x=>capabilities.includes(x)):undefined};
}
export const numberMoney=(value)=>{
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1e7||
    Math.abs(value*100-Math.round(value*100))>0.00001)
    throw Object.assign(new Error('Invalid monetary amount.'),{code:'invalid_amount',httpStatus:400});
  return Math.round(value*100);
};
