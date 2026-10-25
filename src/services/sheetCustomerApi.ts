import type { Order } from '../types';
import { privatePost } from './sheetStaffApi';
import { isValidSheetOrderReceipt } from './googleSheetOrders';

export interface CustomerGoogleSession { name: string; email: string }
export async function verifyCustomerGoogle(endpoint: string, idToken: string): Promise<CustomerGoogleSession> {
  const result = await privatePost(endpoint, { action: 'customer_session', id_token: idToken });
  if (typeof result.name !== 'string' || typeof result.email !== 'string') throw new Error('Invalid customer Google session.');
  return {name:result.name,email:result.email};
}
export async function linkCustomerReceipt(endpoint: string, idToken: string, order: Order): Promise<void> {
  if (order.persistence !== 'google_sheets' || !isValidSheetOrderReceipt(order)) {
    throw new Error('Only a confirmed original bakery receipt can be linked.');
  }
  await privatePost(endpoint,{
    action:'customer_claim_order', id_token:idToken, order_id:order.id,customer_phone:order.customer_phone,
    customer_access_token:order.customer_access_token
  });
}
export async function recoverCustomerReceipts(endpoint: string, idToken: string): Promise<Order[]> {
  const result = await privatePost(endpoint,{action:'customer_orders',id_token:idToken});
  if (!Array.isArray(result.orders) || result.orders.length > 50) throw new Error('Invalid recovered order list.');
  const receipts = result.orders.filter(order => isValidSheetOrderReceipt(order) &&
    order.persistence === 'google_sheets') as Order[];
  if (receipts.length !== result.orders.length) throw new Error('Some recovered receipts were invalid.');
  return receipts;
}