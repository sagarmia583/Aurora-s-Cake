import type { Order, OrderStatus } from '../types';
import { validateGoogleSheetsEndpoint } from './googleSheets';

export type StaffRoleName = 'super_admin' | 'admin' | 'order_manager' | 'kitchen_manager' | 'delivery_manager' | 'delivery_man' | 'accountant';
export type StaffOperation = 'confirm' | 'cancel' | 'start_baking' | 'mark_ready' | 'assign' | 'pick_up' | 'start_delivery' | 'deliver';
export type StaffOrder = Omit<Order, 'delivery_otp'>;
export interface StaffSession {
  role: StaffRoleName;
  name: string;
  email: string;
  riders: { email: string; name: string }[];
}
export interface StatusSnapshot {
  order_id: string;
  status: OrderStatus;
  updated_at: string;
  history: Order['history'];
  rider_name: string;
  payment_status: Order['payment_status'];
  cod_collected: boolean;
  delivery_otp?: string;
}

function objectValue(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export async function privatePost(endpoint: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = validateGoogleSheetsEndpoint(endpoint).href;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body), redirect: 'follow', credentials: 'omit',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('The bakery operations endpoint is unavailable.');
    const data: unknown = await response.json().catch(() => null);
    if (!objectValue(data)) throw new Error('Invalid bakery operations response. Check the Apps Script deployment.');
    if (data.ok !== true) throw new Error(typeof data.error === 'string' ? data.error : 'Bakery operation was not accepted.');
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('Connection timed out. Refresh and retry.');
    throw error;
  } finally { clearTimeout(timeout); }
}
export async function checkStaffSession(endpoint: string, idToken: string): Promise<StaffSession> {
  const data = await privatePost(endpoint, { action: 'staff_session', id_token: idToken });
  if (typeof data.role !== 'string' || typeof data.email !== 'string') throw new Error('Staff role was not returned.');
  const riders = Array.isArray(data.riders) ? data.riders.filter(item => objectValue(item) && typeof item.email === 'string' && typeof item.name === 'string') as StaffSession['riders'] : [];
  return { role: data.role as StaffRoleName, email: data.email, name: String(data.name || data.email), riders };
}
export async function getStaffOrders(endpoint: string, idToken: string): Promise<StaffOrder[]> {
  const data = await privatePost(endpoint, { action: 'staff_orders', id_token: idToken });
  if (!Array.isArray(data.orders)) throw new Error('Invalid staff order list.');
  return data.orders.filter(item => objectValue(item) && typeof item.id === 'string' && typeof item.order_number === 'string') as StaffOrder[];
}
export async function mutateStaffOrder(endpoint: string, idToken: string, operation: StaffOperation, orderId: string, extra: Record<string, unknown> = {}): Promise<void> {
  await privatePost(endpoint, { action: 'staff_mutate', id_token: idToken, operation, order_id: orderId, ...extra });
}
export async function fetchCustomerOrderStatus(endpoint: string, order: Order, idToken?: string): Promise<StatusSnapshot> {
  if (order.persistence !== 'google_sheets') throw new Error('Only confirmed Sheet receipts support status updates.');
  const data = await privatePost(endpoint, { action: 'get_order_status', order_id: order.id, customer_phone: order.customer_phone, ...(idToken ? {id_token:idToken} : {}) });
  const validStatuses: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'assigned', 'picked_up', 'out_for_delivery', 'delivered', 'cancelled'];
  if (data.order_id !== order.id || !validStatuses.includes(data.status as OrderStatus) ||
      typeof data.updated_at !== 'string' || !Array.isArray(data.history) ||
      !['pending','paid','failed'].includes(String(data.payment_status)) || typeof data.cod_collected !== 'boolean' ||
      (data.delivery_otp !== undefined && !/^\d{4}$/.test(String(data.delivery_otp)))) {
    throw new Error('Invalid order status response.');
  }
  return data as unknown as StatusSnapshot;
}

export interface LiveCatalog {
  products: {id:string;name:string;is_active:boolean}[];
  variants: {id:string;product_id:string;name:string;price:number;sale_price:number|'';is_active:boolean}[];
  settings: {shop_name:string;accepting_orders:boolean;delivery_enabled:boolean};
}
export async function fetchLiveCatalog(endpoint:string,idToken:string):Promise<LiveCatalog>{
  const response=await privatePost(endpoint,{action:'staff_catalog',id_token:idToken});
  if(!Array.isArray(response.products)||!Array.isArray(response.variants)||!objectValue(response.settings))
    throw new Error('The live catalogue response is invalid.');
  return {products:response.products as LiveCatalog['products'],
    variants:response.variants as LiveCatalog['variants'],
    settings:response.settings as LiveCatalog['settings']};
}
export async function updateLiveCatalog(endpoint:string,idToken:string,table:'products'|'product_variants'|'settings',
  recordId:string,field:string,value:string|number|boolean):Promise<void>{
  await privatePost(endpoint,{action:'staff_catalog_update',id_token:idToken,
    table,record_id:recordId,field,value});
}
