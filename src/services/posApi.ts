import {privatePost} from './sheetStaffApi';

export interface PosProduct {
  product_id:string;
  product_name:string;
  variant_id:string;
  variant_name:string;
  price:number;
}
export interface PosShop {name:string;phone:string;address:string;}
export interface PosItem extends PosProduct {quantity:number;subtotal:number;unit_price:number;}
export interface PosSale {
  id:string;sale_number:string;sold_at:string;staff_id:string;staff_name:string;
  customer_name:string;customer_phone:string;items:PosItem[];
  subtotal:number;discount_amount:number;total_amount:number;
  payment_method:'cash'|'bkash'|'nagad';payment_reference:string;
  amount_received:number;change_amount:number;payment_confirmation:'staff_attested';
}
export interface PosSnapshot {shop:PosShop;products:PosProduct[];sales?:PosSale[];}
export type PosCartLine={variant_id:string;quantity:number};
export interface PosCreateInput {
  request_id:string;items:PosCartLine[];discount_amount:number;
  customer_name:string;customer_phone:string;payment_method:PosSale['payment_method'];
  payment_reference:string;amount_received:number;
}
const auth=(token:string)=>/^[a-f0-9-]{72}$/i.test(token)?{auth_token:token}:{id_token:token};
export async function getPosCatalog(endpoint:string,token:string):Promise<PosSnapshot>{
  const data=await privatePost(endpoint,{action:'staff_pos_catalog',...auth(token)});
  if(!data.shop||!Array.isArray(data.products))throw new Error('Invalid POS catalogue response.');
  return {shop:data.shop as unknown as PosShop,products:data.products as PosProduct[]};
}
export async function getPosHistory(endpoint:string,token:string):Promise<PosSnapshot>{
  const data=await privatePost(endpoint,{action:'staff_pos_history',...auth(token)});
  if(!Array.isArray(data.sales))throw new Error('Invalid POS history response.');
  return {shop:data.shop as unknown as PosShop,products:[],sales:data.sales as PosSale[]};
}
export async function createPosSale(endpoint:string,token:string,payload:PosCreateInput):Promise<PosSale>{
  const data=await privatePost(endpoint,{action:'staff_pos_create',...auth(token),...payload});
  if(!data.sale||typeof (data.sale as PosSale).sale_number!=='string')
    throw new Error('The sale response did not include a saved receipt.');
  return data.sale as unknown as PosSale;
}
