/** Pure role and order helpers shared by both Android and iOS. */
export type Role = 'super_admin' | 'admin' | 'manager' | 'order_manager' | 'kitchen_manager' | 'delivery_manager' | 'delivery_man' | 'accountant';
export type Status = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'assigned' | 'picked_up' | 'out_for_delivery' | 'delivered' | 'cancelled';
export type Operation = 'confirm' | 'cancel' | 'start_baking' | 'mark_ready' | 'assign' | 'pick_up' | 'start_delivery' | 'deliver';
export type Tab = 'tasks' | 'orders' | 'account';
export interface StaffSession {
  name: string; email: string; username?: string; role: Role;
  riders: {email:string;name:string}[];
  permissions?: string[];
}
export interface OrderItem {product_name:string;variant_name?:string;quantity:number;subtotal:number}
export interface StaffOrder {
  id:string;order_number:string;status:Status;customer_name?:string;customer_phone?:string;
  delivery_address?:string;order_note?:string;created_at:string;updated_at:string;
  delivery_date?:string;delivery_slot?:string;rider_id?:string;rider_name?:string;
  payment_method?:string;payment_status?:string;total_amount:number;cod_amount?:number;
  cod_collected?:boolean;items?:OrderItem[];
}
export const roles:Role[] = ['super_admin','admin','manager','order_manager','kitchen_manager','delivery_manager','delivery_man','accountant'];
export const statuses:Status[]=['pending','confirmed','preparing','ready','assigned','picked_up','out_for_delivery','delivered','cancelled'];
const labelMap:Record<Status,string>={
  pending:'নতুন অর্ডার',confirmed:'Confirmed',preparing:'Baking চলছে',ready:'Ready',
  assigned:'Rider নির্ধারিত',picked_up:'Picked up',out_for_delivery:'ডেলিভারিতে',delivered:'Delivered',cancelled:'Cancelled'
};
export function statusLabel(status:Status):string{return labelMap[status]||status;}
export const roleLabel:Record<Role,string>={
  super_admin:'Super Admin',admin:'Admin',manager:'Manager',order_manager:'Order Manager',
  kitchen_manager:'Kitchen',delivery_manager:'Dispatch Manager',
  delivery_man:'Delivery Rider',accountant:'Accounts'
};
const opPermission:Record<Operation,string>={
  confirm:'order_confirm',cancel:'order_cancel',start_baking:'kitchen_start',
  mark_ready:'kitchen_ready',assign:'delivery_assign',pick_up:'delivery_pickup',
  start_delivery:'delivery_start',deliver:'delivery_complete'
};
export function canOperate(role:Role,op:Operation,permissions?:string[]):boolean{
  if(role==='super_admin'||role==='manager')return true;
  if(permissions)return permissions.includes(opPermission[op]);
  if(role==='admin')return !['pick_up','start_delivery','deliver'].includes(op);
  if(role==='order_manager')return ['confirm','cancel'].includes(op);
  if(role==='kitchen_manager')return ['start_baking','mark_ready'].includes(op);
  if(role==='delivery_manager')return op==='assign';
  if(role==='delivery_man')return ['pick_up','start_delivery','deliver'].includes(op);
  return false;
}
export const nextByStatus:Partial<Record<Status,Operation>>={
  pending:'confirm',confirmed:'start_baking',preparing:'mark_ready',ready:'assign',
  assigned:'pick_up',picked_up:'start_delivery',out_for_delivery:'deliver'
};
export const operationLabels:Record<Operation,string>={
  confirm:'Confirm order',cancel:'Cancel order',start_baking:'Start baking',
  mark_ready:'Mark ready',assign:'Assign rider',pick_up:'Pick up cake',
  start_delivery:'Start delivery',deliver:'Confirm delivery'
};
export function nextOperation(order:StaffOrder,session:StaffSession):Operation|null{
  const next=nextByStatus[order.status];
  if(!next||!canOperate(session.role,next,session.permissions))return null;
  if((next==='pick_up'||next==='start_delivery'||next==='deliver') &&
    String(order.rider_id||'').toLowerCase()!==session.email.toLowerCase())return null;
  return next;
}
export function visibleOrders(orders:StaffOrder[],session:StaffSession,tab:'tasks'|'orders'):StaffOrder[]{
  const source=orders.filter(o=>{
    if(session.role==='delivery_man' || (session.role!=='manager'&&
       canOperate(session.role,'pick_up',session.permissions)&&
       !canOperate(session.role,'assign',session.permissions)&&
       !canOperate(session.role,'confirm',session.permissions)))
      return String(o.rider_id||'').toLowerCase()===session.email.toLowerCase();
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
