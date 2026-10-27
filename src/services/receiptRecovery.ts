import type { Order } from '../types';
import { privatePost } from './sheetStaffApi';
import { isValidSheetOrderReceipt, rememberConfirmedSheetOrder } from './googleSheetOrders';

export async function recoverOrderWithReceiptKey(
  endpoint:string,orderId:string,phone:string,receiptKey:string
):Promise<Order>{
  if(!/^ord_[0-9a-f-]{36,}$/i.test(orderId.trim())||!/^[0-9a-f-]{72}$/i.test(receiptKey.trim()))
    throw new Error('Enter the private Order ID and Receipt Access Key from your original receipt.');
  if(!/^(?:\+?88)?01[3-9]\d{8}$/.test(phone.replace(/[\s()-]/g,'')))
    throw new Error('Enter a valid Bangladesh mobile number.');
  const result=await privatePost(endpoint,{
    action:'customer_receipt_recover',order_id:orderId.trim(),
    customer_phone:phone.trim(),customer_access_token:receiptKey.trim()
  });
  if(!isValidSheetOrderReceipt(result.order)||result.order.persistence!=='google_sheets'||
    result.order.id!==orderId.trim()||result.order.customer_access_token!==receiptKey.trim())
    throw new Error('The receipt recovery response was invalid.');
  rememberConfirmedSheetOrder(result.order);
  return result.order;
}
