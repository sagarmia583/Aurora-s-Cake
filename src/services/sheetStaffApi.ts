import type { Order, OrderStatus } from '../types';
import { resolveSheetsPostEndpoint, sheetsPostCredentials } from './googleSheets';

export type StaffRoleName = 'super_admin' | 'admin' | 'order_manager' | 'kitchen_manager' | 'delivery_manager' | 'delivery_man' | 'accountant';
export type StaffOperation = 'confirm' | 'cancel' | 'start_baking' | 'mark_ready' | 'assign' | 'pick_up' | 'start_delivery' | 'deliver';
export type StaffOrder = Omit<Order, 'delivery_otp'>;
export interface StaffProfile {
  email: string;
  username?: string;
  name: string;
  role: StaffRoleName;
  active?: boolean;
}
export interface StaffSession {
  role: StaffRoleName;
  name: string;
  email: string;
  username?: string;
  riders: { email: string; name: string }[];
  /** Only included after the backend verifies the signed-in super_admin. */
  staff_profiles?: StaffProfile[];
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
  const url = resolveSheetsPostEndpoint(endpoint);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), body.action==='staff_image_upload'?28000:20000);
  try {
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body), redirect: 'follow', credentials: sheetsPostCredentials(url),
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
const staffCredential = (token: string): Record<string,string> =>
  /^[a-f0-9-]{72}$/i.test(token) ? { auth_token: token } : { id_token: token };

export async function signInStaffPassword(endpoint:string,username:string,password:string):Promise<string> {
  const result=await privatePost(endpoint,{action:'staff_password_login',username,password});
  if(typeof result.auth_token!=='string'||! /^[a-f0-9-]{72}$/i.test(result.auth_token))
    throw new Error('Invalid staff login session.');
  return result.auth_token;
}
export async function createStaffAccount(endpoint:string,token:string,name:string,username:string,password:string,role:StaffRoleName):Promise<void>{
  await privatePost(endpoint,{action:'staff_account_create',...staffCredential(token),name,username,password,role});
}
export async function changeStaffStatus(endpoint:string,token:string,username:string,active:boolean):Promise<void>{
  await privatePost(endpoint,{action:'staff_account_set_active',...staffCredential(token),username,active});
}
export async function resetStaffPassword(endpoint:string,token:string,username:string,password:string):Promise<void>{
  await privatePost(endpoint,{action:'staff_account_reset_password',...staffCredential(token),username,password});
}
export async function checkStaffSession(endpoint: string, idToken: string): Promise<StaffSession> {
  const data = await privatePost(endpoint, { action: 'staff_session', ...staffCredential(idToken) });
  if (typeof data.role !== 'string' || typeof data.email !== 'string') throw new Error('Staff role was not returned.');
  const riders = Array.isArray(data.riders) ? data.riders.filter(item => objectValue(item) && typeof item.email === 'string' && typeof item.name === 'string') as StaffSession['riders'] : [];
  const allowedRoles: StaffRoleName[] = ['super_admin','admin','order_manager','kitchen_manager','delivery_manager','delivery_man','accountant'];
  const staff_profiles: StaffProfile[] | undefined = data.role === 'super_admin' && Array.isArray(data.staff_profiles)
    ? data.staff_profiles.filter(item => objectValue(item)
        && typeof item.email === 'string' && typeof item.name === 'string'
        && typeof item.role === 'string' && allowedRoles.includes(item.role as StaffRoleName))
      .map(item => ({ email: String(item.email), username: typeof item.username==='string'?item.username:undefined, name: String(item.name), role: item.role as StaffRoleName, active: typeof item.active==='boolean'?item.active:undefined }))
    : undefined;
  return { role: data.role as StaffRoleName, email: data.email, username: typeof data.username==='string'?data.username:undefined, name: String(data.name || data.email), riders, staff_profiles };
}
export async function getStaffOrders(endpoint: string, idToken: string): Promise<StaffOrder[]> {
  const data = await privatePost(endpoint, { action: 'staff_orders', ...staffCredential(idToken) });
  if (!Array.isArray(data.orders)) throw new Error('Invalid staff order list.');
  return data.orders.filter(item => objectValue(item) && typeof item.id === 'string' && typeof item.order_number === 'string') as StaffOrder[];
}
export async function mutateStaffOrder(endpoint: string, idToken: string, operation: StaffOperation, orderId: string, extra: Record<string, unknown> = {}): Promise<void> {
  await privatePost(endpoint, { action: 'staff_mutate', ...staffCredential(idToken), operation, order_id: orderId, ...extra });
}
export async function fetchCustomerOrderStatus(endpoint: string, order: Order, idToken?: string): Promise<StatusSnapshot> {
  if (order.persistence !== 'google_sheets') throw new Error('Only confirmed Sheet receipts support status updates.');
  const data = await privatePost(endpoint, { action: 'get_order_status', order_id: order.id, customer_phone: order.customer_phone,
    ...(order.customer_access_token ? {customer_access_token:order.customer_access_token} : {}),
    ...(idToken ? {id_token:idToken} : {}) });
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
  const response=await privatePost(endpoint,{action:'staff_catalog',...staffCredential(idToken)});
  if(!Array.isArray(response.products)||!Array.isArray(response.variants)||!objectValue(response.settings))
    throw new Error('The live catalogue response is invalid.');
  return {products:response.products as LiveCatalog['products'],
    variants:response.variants as LiveCatalog['variants'],
    settings:response.settings as LiveCatalog['settings']};
}
export async function updateLiveCatalog(endpoint:string,idToken:string,table:'products'|'product_variants'|'settings',
  recordId:string,field:string,value:string|number|boolean):Promise<void>{
  await privatePost(endpoint,{action:'staff_catalog_update',...staffCredential(idToken),
    table,record_id:recordId,field,value});
}

export type CmsTable =
  | 'settings' | 'content' | 'hero_slides' | 'highlights' | 'faqs' | 'links'
  | 'categories' | 'products' | 'product_variants' | 'flavors' | 'product_addons'
  | 'banners' | 'delivery_zones' | 'delivery_slots' | 'coupons' | 'reviews';
export interface CmsSnapshot {
  table: CmsTable;
  columns: string[];
  rows: Record<string, string | boolean | number>[];
  total:number;
  truncated:boolean;
  can_delete:boolean;
}
export const CMS_TABLE_OPTIONS: {table:CmsTable,label:string}[] = [
  {table:'settings',label:'Shop settings'},{table:'content',label:'Website text'},
  {table:'hero_slides',label:'Hero slides'},{table:'highlights',label:'Highlights'},
  {table:'faqs',label:'FAQs'},{table:'links',label:'Footer / social links'},
  {table:'categories',label:'Categories'},{table:'products',label:'Products'},
  {table:'product_variants',label:'Sizes / variants'},{table:'flavors',label:'Flavours'},
  {table:'product_addons',label:'Product add-ons'},{table:'banners',label:'Banners'},
  {table:'delivery_zones',label:'Delivery zones'},{table:'delivery_slots',label:'Delivery slots'},
  {table:'coupons',label:'Coupons'},{table:'reviews',label:'Reviews / moderation'},
];
export async function fetchCmsTable(endpoint:string,token:string,table:CmsTable):Promise<CmsSnapshot>{
  const response=await privatePost(endpoint,{action:'staff_cms_list',...staffCredential(token),table});
  if(response.table!==table||!Array.isArray(response.rows)||!Array.isArray(response.columns)||
     typeof response.total!=='number'||typeof response.can_delete!=='boolean')
    throw new Error('Invalid website manager response. Update your Apps Script deployment.');
  if(response.rows.length>500||response.columns.length>100||
      response.rows.some(row=>!objectValue(row)))
    throw new Error('Invalid website manager table.');
  return response as unknown as CmsSnapshot;
}
export async function mutateCmsTable(endpoint:string,token:string,table:CmsTable,action:'create'|'update'|'delete',
  values:Record<string,string|number|boolean>,recordId?:string,key?:string):Promise<void>{
  await privatePost(endpoint,{action:'staff_cms_'+action,...staffCredential(token),table,
    ...(recordId?{record_id:recordId}:{}),...(key?{key}:{}),values});
}

export async function uploadCmsImage(endpoint:string,token:string,base64:string):Promise<string> {
  const data=await privatePost(endpoint,{action:'staff_image_upload',...staffCredential(token),mime_type:'image/jpeg',base64});
  if(typeof data.url!=='string'||!/^\/api\/image\?id=[A-Za-z0-9_-]{12,150}$/.test(data.url))
    throw new Error('Image backend returned an invalid public URL.');
  return data.url;
}
