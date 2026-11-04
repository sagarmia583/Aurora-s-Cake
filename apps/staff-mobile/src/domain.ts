/** Pure role and order helpers shared by both Android and iOS. */
export type Role = 'super_admin' | 'admin' | 'order_manager' | 'kitchen_manager' | 'delivery_manager' | 'delivery_man' | 'accountant';
export type Status = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'assigned' | 'picked_up' | 'out_for_delivery' | 'delivered' | 'cancelled';
export type Operation = 'confirm' | 'cancel' | 'start_baking' | 'mark_ready' | 'assign' | 'pick_up' | 'start_delivery' | 'deliver';
export type Tab =
  | 'overview'
  | 'orders'
  | 'pos'
  | 'kitchen'
  | 'inventory'
  | 'purchases'
  | 'delivery'
  | 'finance'
  | 'customers'
  | 'products'
  | 'custom_cakes'
  | 'offers'
  | 'staff'
  | 'reports'
  | 'settings'
  | 'modules_hub'
  | 'tasks'
  | 'cash'
  | 'analytics'
  | 'account';
export interface StaffProfile {
  email: string;
  name: string;
  username?: string;
  role: Role;
  active?: boolean;
}
export interface CatalogProduct {
  id: string;
  name: string;
  is_active: boolean;
  category?: string;
  price?: number;
  description?: string;
}
export interface CatalogVariant {
  id: string;
  product_id: string;
  name: string;
  price: number;
  sale_price?: number | '';
  is_active: boolean;
}
export interface CustomCakeRequest {
  id: string;
  customer_name: string;
  customer_phone: string;
  flavor: string;
  weight_kg: number;
  delivery_date: string;
  message_on_cake?: string;
  reference_image_url?: string;
  status: 'pending' | 'quoted' | 'confirmed' | 'cancelled';
  quote_amount?: number;
  staff_notes?: string;
  created_at: string;
}
export interface StaffSession {
  name: string; email: string; username?: string; role: Role;
  profile_image_url?: string;
  logo_url?: string;
  riders: {email:string;name:string}[];
  staff_profiles?: StaffProfile[];
}
export interface OrderItem {product_name:string;variant_name?:string;quantity:number;subtotal:number}
export interface StaffOrder {
  id:string;order_number:string;status:Status;customer_name?:string;customer_phone?:string;
  delivery_address?:string;order_note?:string;created_at:string;updated_at:string;
  delivery_date?:string;delivery_slot?:string;rider_id?:string;rider_name?:string;
  payment_method?:string;payment_status?:string;total_amount:number;cod_amount?:number;
  due_amount?:number;advance_paid_amount?:number;delivery_zone_id?:string;delivery_zone?:string;
  delivery_fee?:number;message_on_cake?:string;
  subtotal?:number;discount_amount?:number;coupon_code?:string;
  cod_collected?:boolean;items?:OrderItem[];
  is_gift?:boolean;recipient_name?:string;recipient_phone?:string;
  sender_name?:string;sender_phone?:string;gift_card_message?:string;hide_price_on_box?:boolean;
  customer_share_url?:string;
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
  if(role==='super_admin'||role==='admin')return true;
  // Preserve existing website rule: riders handle handover; delivery OTP is intentionally disabled.
  if(op==='pick_up'||op==='start_delivery'||op==='deliver')return role==='delivery_man';
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
  start_delivery:'Start delivery',deliver:'Complete delivery'
};
export function nextOperation(order:StaffOrder,session:StaffSession):Operation|null{
  const admin=session.role==='super_admin'||session.role==='admin';
  const next=admin&&order.status==='ready'?'start_delivery':nextByStatus[order.status];
  if(!next||!canOperate(session.role,next))return null;
  if(!admin&&(next==='pick_up'||next==='start_delivery'||next==='deliver') &&
    String(order.rider_id||'').toLowerCase()!==session.email.toLowerCase())return null;
  return next;
}
export function visibleOrders(orders:StaffOrder[],session:StaffSession,tab:Tab|string):StaffOrder[]{
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
    !Object.prototype.hasOwnProperty.call(r,'customer_share_token')&&
    !Object.prototype.hasOwnProperty.call(r,'customer_access_token');
}
export function money(value:number|undefined):string{
  const amount=Number(value);
  return '৳'+(Number.isFinite(amount)?Math.max(0,amount):0).toLocaleString('en-BD',{maximumFractionDigits:2});
}

/** The native app sends staff credentials only to these reviewed shop origins. */
export function humanTime(value: string | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-BD', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export interface PhoneValidationResult {
  isValid: boolean;
  phone: string;
  digits: string;
  error?: string;
}

export function validateBangladeshiPhone(input: string | undefined | null): PhoneValidationResult {
  if (!input || !input.trim()) {
    return { isValid: false, phone: '', digits: '', error: 'মোবাইল নম্বর লিখুন' };
  }
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('8801') && digits.length === 13) {
    digits = digits.slice(2);
  }

  if (digits.length !== 11) {
    return {
      isValid: false,
      phone: digits,
      digits,
      error: `মোবাইল নম্বরটি অবশ্যই ১১ ডিজিটের হতে হবে (বর্তমানে ${digits.length} ডিজিট)`,
    };
  }

  if (!digits.startsWith('01')) {
    return {
      isValid: false,
      phone: digits,
      digits,
      error: 'মোবাইল নম্বরটি অবশ্যই ০১ দিয়ে শুরু হতে হবে (যেমন: 017XXXXXXXX)',
    };
  }

  if (!/^01[3-9]\d{8}$/.test(digits)) {
    return {
      isValid: false,
      phone: digits,
      digits,
      error: 'সঠিক বাংলাদেশি মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX)',
    };
  }

  return { isValid: true, phone: digits, digits };
}
export const STAFF_PRODUCTION_OPERATIONS_URL = 'https://aurora-s-cake.sagarmia583.workers.dev/api/operations';
const STAFF_API_ORIGINS = new Set([
  'https://aurora-s-cake.sagarmia583.workers.dev',
  'https://aurora-s-cake.pages.dev',
  // Retained for an existing owner-configured build; retired hosting is not re-enabled.
  'https://aurora-s-cake.vercel.app',
]);
// A Netlify origin is accepted only when it matches the build owner's explicit
// EXPO_PUBLIC_OPERATIONS_URL. Do not trust an arbitrary runtime-supplied hostname.
const configuredNetlifyApi = process.env.EXPO_PUBLIC_OPERATIONS_URL || '';
function configuredNetlifyOrigin():string|null {
  try {
    const u=new URL(configuredNetlifyApi);
    return u.protocol==='https:' && u.hostname.endsWith('.netlify.app') &&
      u.hostname.length>'.netlify.app'.length && u.pathname==='/api/operations' &&
      !u.username && !u.password && !u.search && !u.hash && !u.port ? u.origin:null;
  } catch {return null;}
}
export function validateStaffOperationsUrl(raw:string):string {
  if(!raw)throw new Error('App API URL is not configured. Set EXPO_PUBLIC_OPERATIONS_URL before building.');
  let url:URL;
  try{url=new URL(raw);}catch{throw new Error('Invalid staff API URL.');}
  if(url.protocol!=='https:'||url.username||url.password||raw.includes('@')||/[?#]/.test(raw)||
      url.pathname!=='/api/operations'||!(STAFF_API_ORIGINS.has(url.origin)||url.origin===configuredNetlifyOrigin()))
    throw new Error('Use the approved Aurora’s Cake HTTPS /api/operations endpoint.');
  return url.href;
}

export function buildSheetOrderPayload(order: {
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  delivery_zone_id?: string;
  delivery_slot?: string;
  delivery_date?: string;
  coupon_code?: string;
  order_note?: string;
  cart_items?: Array<{
    product_id: string;
    variant_id: string;
    quantity: number;
    flavor_id?: string;
    addon_ids?: string[];
    writing_message?: string;
  }>;
}) {
  const genUuid = () =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });

  const reqId = genUuid();
  const proof = genUuid() + genUuid();
  const today = new Date().toISOString().slice(0, 10);

  const cartLines = (order.cart_items && order.cart_items.length > 0)
    ? order.cart_items
    : [{
        product_id: 'prod-chocolate',
        variant_id: 'prod-chocolate-1lb',
        quantity: 1,
        addon_ids: [],
        writing_message: 'Counter Sale',
      }];

  return {
    action: 'create_order',
    request_id: reqId,
    checkout_proof: proof,
    customer_name: order.customer_name.trim() || 'Bakery Customer',
    customer_phone: order.customer_phone.trim() || '01712345678',
    delivery_address: order.delivery_address.trim() || 'Counter Pickup (দোকান থেকে নেওয়া)',
    delivery_zone_id: order.delivery_zone_id || 'zone-pickup',
    delivery_slot: order.delivery_slot || 'Counter Pickup',
    delivery_date: order.delivery_date || today,
    cart_items: cartLines,
    coupon_code: order.coupon_code || '',
    order_note: order.order_note || '',
    payment_method: 'cod',
  };
}
