import type { OrderStatus } from '../types';
import { privatePost } from './sheetStaffApi';

export interface PhoneTrackingStatus {
  reference: string;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
  delivery_date?: string;
  delivery_slot?: string;
  payment_method?: 'cod' | 'other';
  payment_status?: 'pending' | 'paid' | 'failed';
  subtotal?: number;
  delivery_fee?: number;
  discount_amount?: number;
  total_amount?: number;
  items?: {
    product_name: string;
    variant_name: string;
    flavor_name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }[];
  timeline?: {status: OrderStatus; at: string}[];
}

export function normalizeTrackingPhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  return /^8801[3-9]\d{8}$/.test(digits) ? '0' + digits.slice(3) : digits;
}

const allowedStatuses = new Set<OrderStatus>([
  'pending', 'confirmed', 'preparing', 'ready', 'assigned', 'picked_up',
  'out_for_delivery', 'delivered', 'cancelled'
]);

/**
 * Phone lookup is NOT customer authentication. The server must only return
 * redacted order status summaries, never a private order receipt or OTP.
 */
export interface PhoneTrackingPage { orders: PhoneTrackingStatus[]; nextCursor: number | null }

export async function getPhoneOrderPage(
  endpoint: string, phone: string, cursor?: number
): Promise<PhoneTrackingPage> {
  const normalized = normalizeTrackingPhone(phone);
  if (!/^01[3-9]\d{8}$/.test(normalized)) {
    throw new Error('Enter a valid 11-digit Bangladesh mobile number.');
  }
  const data = await privatePost(endpoint, {action:'customer_phone_tracking',phone:normalized,
    ...(cursor!==undefined ? {cursor} : {})});
  if (!Array.isArray(data.orders) || data.orders.length > 10) {
    throw new Error('The phone tracking response is invalid. Update the bakery Apps Script deployment.');
  }
  if(data.next_cursor!==null&&data.next_cursor!==undefined&&
     (!Number.isSafeInteger(data.next_cursor)||(data.next_cursor as number)<0))
     throw new Error('Invalid tracking pagination cursor.');
  const orders = data.orders.map((item: unknown): PhoneTrackingStatus => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('Invalid tracking response.');
    }
    const row = item as Record<string, unknown>;
    const allowed = ['reference','status','created_at','updated_at','delivery_date','delivery_slot',
      'payment_method','payment_status','subtotal','delivery_fee','discount_amount',
      'total_amount','items','timeline'];
    if (typeof row.reference !== 'string' || !/^••••.{0,4}$/u.test(row.reference) ||
        !allowedStatuses.has(row.status as OrderStatus) ||
        typeof row.updated_at !== 'string' || typeof row.created_at !== 'string' ||
        Object.keys(row).some(key => !allowed.includes(key))) {
      throw new Error('The server returned unsafe order details. Tracking was not displayed.');
    }
    const amounts=['subtotal','delivery_fee','discount_amount','total_amount'];
    if(amounts.some(key => row[key]!==undefined &&
       (typeof row[key]!=='number'||!Number.isFinite(row[key])||(row[key] as number)<0)))
      throw new Error('Invalid order amount in tracking response.');
    if((row.delivery_date!==undefined && (typeof row.delivery_date!=='string'||row.delivery_date.length>30)) ||
       (row.delivery_slot!==undefined && (typeof row.delivery_slot!=='string'||row.delivery_slot.length>100)) ||
       (row.payment_method!==undefined && !['cod','other'].includes(String(row.payment_method))) ||
       (row.payment_status!==undefined && !['pending','paid','failed'].includes(String(row.payment_status))))
      throw new Error('Invalid order details from the bakery.');
    const items: PhoneTrackingStatus['items']=[];
    if(row.items!==undefined) {
      if(!Array.isArray(row.items)||row.items.length>30)throw new Error('Invalid order items.');
      for(const value of row.items){
        if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid order item.');
        const item=value as Record<string, unknown>;
        if(Object.keys(item).some(key=>!['product_name','variant_name','flavor_name','quantity','unit_price','subtotal'].includes(key)) ||
          typeof item.product_name!=='string'||item.product_name.length>120||
          typeof item.variant_name!=='string'||item.variant_name.length>100||
          typeof item.flavor_name!=='string'||item.flavor_name.length>80||
          typeof item.quantity!=='number'||item.quantity<1||item.quantity>100||
          typeof item.unit_price!=='number'||!Number.isFinite(item.unit_price)||item.unit_price<0||
          typeof item.subtotal!=='number'||!Number.isFinite(item.subtotal)||item.subtotal<0)
          throw new Error('Invalid order item detail.');
        items.push(item as unknown as NonNullable<PhoneTrackingStatus['items']>[number]);
      }
    }
    const timeline: NonNullable<PhoneTrackingStatus['timeline']>=[];
    if(row.timeline!==undefined) {
      if(!Array.isArray(row.timeline)||row.timeline.length>16)throw new Error('Invalid tracking timeline.');
      for(const value of row.timeline){
        if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid status history.');
        const step=value as Record<string,unknown>;
        if(Object.keys(step).some(key=>!['status','at'].includes(key))||
          !allowedStatuses.has(step.status as OrderStatus)||typeof step.at!=='string'||step.at.length>35)
          throw new Error('Invalid timeline entry.');
        timeline.push({status:step.status as OrderStatus,at:step.at});
      }
    }
    return {
      reference: row.reference, status:row.status as OrderStatus,
      created_at: row.created_at, updated_at: row.updated_at,
      ...(typeof row.delivery_date==='string'?{delivery_date:row.delivery_date}:{}),
      ...(typeof row.delivery_slot==='string'?{delivery_slot:row.delivery_slot}:{}),
      ...(row.payment_method==='cod'||row.payment_method==='other'?{payment_method:row.payment_method}:{}),
      ...(row.payment_status==='pending'||row.payment_status==='paid'||row.payment_status==='failed'?{payment_status:row.payment_status}:{}),
      ...(typeof row.subtotal==='number'?{subtotal:row.subtotal}:{}),
      ...(typeof row.delivery_fee==='number'?{delivery_fee:row.delivery_fee}:{}),
      ...(typeof row.discount_amount==='number'?{discount_amount:row.discount_amount}:{}),
      ...(typeof row.total_amount==='number'?{total_amount:row.total_amount}:{}),
      ...(row.items!==undefined?{items}:{}),
      ...(row.timeline!==undefined?{timeline}:{})
    };
  });
  return {orders,nextCursor:typeof data.next_cursor==='number'?data.next_cursor:null};
}

/** Retained for callers only needing the newest page. */
export async function getPhoneOrderStatuses(endpoint:string,phone:string):Promise<PhoneTrackingStatus[]>{
  return (await getPhoneOrderPage(endpoint,phone)).orders;
}
