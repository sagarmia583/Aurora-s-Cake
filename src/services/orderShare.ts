import {privatePost} from './sheetStaffApi';
export const ORDER_RECEIPT_BASE='https://script.google.com/macros/s/AKfycbw38J4AzlYkAhNtyDAp_CP34fUk9Epae6xz46AQFbF9ye1VsZjxTXmzbJgs52WEoWETMw/exec';
export function isCustomerOrderUrl(value:unknown):value is string{
  if(typeof value!=='string')return false;
  try{const u=new URL(value);return u.origin+u.pathname===ORDER_RECEIPT_BASE&&u.searchParams.get('action')==='receipt'&&/^ord_[0-9a-f-]{36}$/i.test(u.searchParams.get('ref')||'')&&/^[0-9a-f-]{72}$/i.test(u.searchParams.get('access')||'')&&!u.username&&!u.password&&!u.hash;}catch{return false;}
}
export async function createCustomerOrderLink(endpoint:string,token:string,orderId:string){
  const credential=/^[0-9a-f-]{72}$/i.test(token)?{auth_token:token}:{id_token:token};
  const d=await privatePost(endpoint,{action:'staff_order_link',order_id:orderId,...credential});
  if(d.order_id!==orderId||!isCustomerOrderUrl(d.share_url))throw new Error('Customer link যাচাই হয়নি। আবার চেষ্টা করুন।');return d.share_url;
}
export async function revokeCustomerOrderLink(endpoint:string,token:string,orderId:string){
  const credential=/^[0-9a-f-]{72}$/i.test(token)?{auth_token:token}:{id_token:token};
  const result=await privatePost(endpoint,{action:'staff_order_link',order_id:orderId,revoke:true,...credential});
  if(result.order_id!==orderId||result.revoked!==true)throw new Error('Link বাতিল হয়েছে কি না যাচাই হয়নি।');
}
