import {post} from './api';
import type {Role, StaffSession} from './domain';

export type Workspace='tasks'|'orders'|'sales'|'more'|'finance'|'inventory'|'production'|'team'|'catalog'|'account';
export type Capability='orders_view'|'sales_view'|'sales_create'|'sales_discount'|'sales_history'|
  'finance_view'|'finance_edit'|'catalog_view'|'catalog_edit'|'custom_cakes_view';
const roleDefaults:Partial<Record<Role,Capability[]>>={
  order_manager:['orders_view','sales_view','sales_create','sales_history','custom_cakes_view'],
  kitchen_manager:['orders_view'],
  delivery_manager:['orders_view'],
  delivery_man:['orders_view'],
  accountant:['orders_view','finance_view','sales_view','sales_history']
};
export function hasPermission(session:StaffSession,permission:string):boolean{
  if(session.role==='super_admin'||session.role==='manager')return true;
  if(Array.isArray(session.permissions))return session.permissions.includes(permission);
  if(session.role==='admin')return true; // admin defaults are enforced by backend on each POST.
  return (roleDefaults[session.role]||[]).includes(permission as Capability);
}
export function allowedWorkspaces(session:StaffSession):Workspace[]{
  const list:Workspace[]=[];
  if(hasPermission(session,'orders_view'))list.push('tasks','orders');
  if(hasPermission(session,'sales_view'))list.push('sales');
  if(['finance_view','catalog_view','custom_cakes_view'].some(p=>hasPermission(session,p))||
    session.role==='super_admin')list.push('more');
  list.push('account');
  return list;
}
export const money=(value:number)=>'৳'+Number(value||0).toLocaleString('en-BD',{maximumFractionDigits:2,minimumFractionDigits:2});
export const uuid=()=> 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{
  const n=Math.floor(Math.random()*16);return(c==='x'?n:(n&3|8)).toString(16);
});
// This ID is a uniqueness key, NOT an authentication token.
export const secureRequestId=()=>typeof globalThis.crypto?.randomUUID==='function'?
  globalThis.crypto.randomUUID():uuid();

const auth=(token:string)=>/^[a-f0-9-]{72}$/i.test(token)?{auth_token:token}:{id_token:token};
// Uncertain writes reuse their original UUID when the cashier retries the same details.
const retryIds=new Map<string,string>();
const retryable=new Set(['staff_stock_adjust','staff_refund_request','staff_cash_deposit','staff_cake_cost_save']);
export async function staffPost(token:string,action:string,payload:Record<string,unknown>={}):Promise<Record<string,unknown>>{
  let request=payload,key='';
  if(retryable.has(action)&&typeof payload.request_id==='string'){
    key=action+':'+JSON.stringify({...payload,request_id:''});
    if(retryIds.has(key))request={...payload,request_id:retryIds.get(key)};
    else{retryIds.set(key,payload.request_id);if(retryIds.size>60)retryIds.delete(retryIds.keys().next().value!);}
  }
  try{const result=await post(action,{...auth(token),...request},35000);
    if(key)retryIds.delete(key);
    return result;
  }catch(error){
    // Retain the same request ID on transport/time-out errors. Definitive validation
    // errors never commit an order and may be corrected with a new request ID.
    if(key&&error instanceof Error&&
      /invalid_|forbidden|reference_|not_found|approval_required/.test(String((error as Error&{code?:string}).code||'')))
      retryIds.delete(key);
    throw error;
  }
}
export interface Item{variant_id:string;product_id:string;product_name:string;variant_name:string;price:number}
export interface PosSale{ id:string;sale_number:string;sold_at:string;staff_name:string;
  total_amount:number;subtotal:number;discount_amount:number;payment_method:string;payment_reference:string;
  amount_received:number;change_amount:number;customer_name:string;customer_phone:string;
  items:{product_name:string;variant_name:string;quantity:number;unit_price:number;subtotal:number}[];
}
export const posCatalog=async(token:string):Promise<{shop:{name:string;phone:string;address:string};products:Item[]}>=>{
  const r=await staffPost(token,'staff_pos_catalog');
  if(!Array.isArray(r.products)||!r.shop)throw new Error('POS catalogue incomplete.');
  return r as unknown as {shop:{name:string;phone:string;address:string};products:Item[]};
};
export const posSales=async(token:string):Promise<PosSale[]>=>{
  const r=await staffPost(token,'staff_pos_history');
  if(!Array.isArray(r.sales))throw new Error('Sales history incomplete.');
  return r.sales as PosSale[];
};
export const savePos=async(token:string,input:Record<string,unknown>):Promise<PosSale>=>{
  const r=await staffPost(token,'staff_pos_create',input);
  if(!r.sale||typeof (r.sale as PosSale).sale_number!=='string')throw new Error('Saved sale receipt unavailable.');
  return r.sale as PosSale;
};
export interface Stock{ id:string;name:string;unit:string;balance:number;reorder_level:number}
export interface InventorySnapshot{
 stock:Stock[];
 movements:{id:string;item_id:string;delta:number;reason:string;created_at:string}[];
 refunds:{id:string;order_id:string;status:string;amount:number;reason:string}[];
 cost_snapshots:{id:string;order_id:string;order_number:string;total_cost:number;missing_recipe:boolean}[];
}
export async function inventory(token:string,action='staff_inventory_summary',payload:Record<string,unknown>={}):Promise<InventorySnapshot>{
  const r=await staffPost(token,action,payload);
  const s=(r.state&&typeof r.state==='object'?r.state:r) as Record<string,unknown>;
  if(!Array.isArray(s.stock)||!Array.isArray(s.movements)||!Array.isArray(s.refunds)||!Array.isArray(s.cost_snapshots))
    throw new Error('Inventory data unavailable. Update backend.');
  return s as unknown as InventorySnapshot;
}
export interface FinanceSnapshot{
 riders:{rider_id:string;rider_name:string;remaining:number;collected:number;deposited:number}[];
 deposits:{id:string;rider_id:string;amount:number;status:string;initiated_by_id:string;actor_name:string}[];
 costs:{id:string;product_id:string;variant_id:string;component:string;unit_label:string;quantity:number;unit_cost:number;total:number;inventory_item_id?:string}[];
 products:{id:string;name:string}[];
 variants:{id:string;product_id:string;name:string}[];
 cost_totals:Record<string,number>;
}
export async function finance(token:string,action='staff_finance_summary',payload:Record<string,unknown>={}):Promise<FinanceSnapshot>{
  const r=await staffPost(token,action,payload);
  const s=(r.snapshot&&typeof r.snapshot==='object'?r.snapshot:r) as Record<string,unknown>;
  if(!Array.isArray(s.riders)||!Array.isArray(s.deposits)||!Array.isArray(s.costs)||!Array.isArray(s.products)||!Array.isArray(s.variants))
    throw new Error('Finance data unavailable. Update backend.');
  return s as unknown as FinanceSnapshot;
}
export interface StaffProfile{name:string;username?:string;email:string;role:Role;active:boolean;permissions:string[]}
export const createStaff=(token:string,details:Record<string,unknown>)=>staffPost(token,'staff_account_create',details);
export const updateStaff=(token:string,action:'staff_account_set_active'|'staff_account_update_permissions'|'staff_account_reset_password',
 details:Record<string,unknown>)=>staffPost(token,action,details);
export interface Catalogue{products:{id:string;name:string;is_active:boolean}[];variants:{
 id:string;product_id:string;name:string;price:number;sale_price:number|'';is_active:boolean}[];
 settings:{shop_name:string;accepting_orders:boolean;delivery_enabled:boolean};}
export async function catalogue(token:string):Promise<Catalogue>{
 const r=await staffPost(token,'staff_catalog');
 if(!Array.isArray(r.products)||!Array.isArray(r.variants)||!r.settings)throw new Error('Catalogue unavailable.');
 return r as unknown as Catalogue;
}
export const editCatalog=(token:string,table:'products'|'product_variants'|'settings',
  record_id:string,field:string,value:string|number|boolean)=>
 staffPost(token,'staff_catalog_update',{table,record_id,field,value});
