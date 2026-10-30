/** Pure role and order helpers shared by both Android and iOS. */
export type Role = 'super_admin' | 'admin' | 'order_manager' | 'kitchen_manager' | 'delivery_manager' | 'delivery_man' | 'accountant';
export type Status = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'assigned' | 'picked_up' | 'out_for_delivery' | 'delivered' | 'cancelled';
export type Operation = 'confirm' | 'cancel' | 'start_baking' | 'mark_ready' | 'assign' | 'pick_up' | 'start_delivery' | 'deliver';
export type Tab = 'tasks' | 'orders' | 'account';
export interface StaffSession {
  name: string; email: string; username?: string; role: Role;
  riders: {email:string;name:string}[];
}
export interface OrderItem {product_name:string;variant_name?:string;quantity:number;subtotal:number}
export interface StaffOrder {
  id:string;order_number:string;status:Status;customer_name?:string;customer_phone?:string;
  delivery_address?:string;order_note?:string;created_at:string;updated_at:string;
  delivery_date?:string;delivery_slot?:string;rider_id?:string;rider_name?:string;
  payment_method?:string;payment_status?:string;total_amount:number;cod_amount?:number;
  cod_collected?:boolean;items?:OrderItem[];
}
export const roles:Role[] = ['super_admin','admin','order_manager','kitchen_manager','delivery_manager','delivery_man','accountant'];
export const statuses:Status[]=['pending','confirmed','preparing','ready','assigned','picked_up','out_for_delivery','delivered','cancelled'];
const labelMap:Record<Status,string>={
  pending:'নতুন অর্ডার',confirmed:'Confirmed',preparing:'Baking চলছে',ready:'Ready',
  assigned:'Rider নির্ধারিত',picked_up:'Picked up',out_for_delivery:'ডেলিভারিতে',delivered:'Delivered',cancelled:'Cancelled'
};
export function statusLabel(status:Status):string{return labelMap[status]||status;}
export const roleLabel:Record<Role,string>={
  super_admin:'Super Admin',admin:'Admin',order_manager:'Order Manager',
  kitchen_manager:'Kitchen',delivery_manager:'Dispatch Manager',
  delivery_man:'Delivery Rider',accountant:'Accounts'
};
export function canOperate(role:Role,op:Operation):boolean{
  // Preserve existing website rule: riders alone perform handover and OTP.
  if(op==='pick_up'||op==='start_delivery'||op==='deliver')return role==='delivery_man';
  if(role==='super_admin'||role==='admin')return true;
  if(role==='order_manager')return op==='confirm'||op==='cancel';
  if(role==='kitchen_manager')return op==='start_baking'||op==='mark_ready';
  if(role==='delivery_manager')return op==='assign';
  return false;
}
export const nextByStatus:Partial<Record<Status,Operation>>={
  pending:'confirm',confirmed:'start_baking',preparing:'mark_ready',ready:'assign',
  assigned:'pick_up',picked_up:'start_delivery',out_for_delivery:'deliver'
};
export const operationLabels:Record<Operation,string>={
  confirm:'Confirm order',cancel:'Cancel order',start_baking:'Start baking',
  mark_ready:'Mark ready',assign:'Assign rider',pick_up:'Pick up cake',
  start_delivery:'Start delivery',deliver:'Verify OTP & deliver'
};
export function nextOperation(order:StaffOrder,session:StaffSession):Operation|null{
  const next=nextByStatus[order.status];
  if(!next||!canOperate(session.role,next))return null;
  if((next==='pick_up'||next==='start_delivery'||next==='deliver') &&
    String(order.rider_id||'').toLowerCase()!==session.email.toLowerCase())return null;
  return next;
}
export function visibleOrders(orders:StaffOrder[],session:StaffSession,tab:'tasks'|'orders'):StaffOrder[]{
  const source=orders.filter(o=>{
    if(session.role==='delivery_man')return String(o.rider_id||'').toLowerCase()===session.email.toLowerCase();
    return true;
  });
  const filtered=tab==='tasks'?
    source.filter(o=>nextOperation(o,session)!==null):source;
  return filtered.slice().sort((a,b)=>{
    const priority=(x:StaffOrder)=>x.status==='pending'?2:nextOperation(x,session)?1:0;
    return priority(b)-priority(a)||Date.parse(b.updated_at)-Date.parse(a.updated_at);
  });
}
export function isOrder(value:unknown):value is StaffOrder{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const r=value as Record<string,unknown>;
  return typeof r.id==='string'&&r.id.length>5&&typeof r.order_number==='string'&&
    statuses.includes(r.status as Status)&&typeof r.updated_at==='string'&&
    typeof r.total_amount==='number'&&Number.isFinite(r.total_amount)&&r.total_amount>=0&&
    !Object.prototype.hasOwnProperty.call(r,'delivery_otp')&&
    !Object.prototype.hasOwnProperty.call(r,'customer_access_token');
}
export function money(value:number|undefined):string{
  return '৳'+Math.round(Math.max(0,Number(value)||0)).toLocaleString('en-BD');
}

/** The native app sends staff credentials only to these reviewed shop origins. */
export const STAFF_PRODUCTION_OPERATIONS_URL = 'https://aurora-s-cake.sagarmia583.workers.dev/api/operations';
const STAFF_API_ORIGINS = new Set([
  'https://aurora-s-cake.sagarmia583.workers.dev',
  // Retained for an existing owner-configured build; retired hosting is not re-enabled.
  'https://aurora-s-cake.vercel.app',
]);
export function validateStaffOperationsUrl(raw:string):string {
  if(!raw)throw new Error('App API URL is not configured. Set EXPO_PUBLIC_OPERATIONS_URL before building.');
  let url:URL;
  try{url=new URL(raw);}catch{throw new Error('Invalid staff API URL.');}
  if(url.protocol!=='https:'||url.username||url.password||raw.includes('@')||/[?#]/.test(raw)||
      url.pathname!=='/api/operations'||!STAFF_API_ORIGINS.has(url.origin))
    throw new Error('Use the approved Aurora’s Cake HTTPS /api/operations endpoint.');
  return url.href;
}
