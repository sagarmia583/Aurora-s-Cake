import { privatePost } from './sheetStaffApi';
import { DEFAULT_SHEETS_ENDPOINT } from './googleSheets';
import type { Order } from '../types';
import { readOrderTrackingKey, websiteOrderTrackingLink } from '../../apps/staff-mobile/src/orderTrackingLink';

export { websiteOrderTrackingLink };

export async function loadSharedOrder(key: NonNullable<ReturnType<typeof readOrderTrackingKey>>) {
  const result = await privatePost(DEFAULT_SHEETS_ENDPOINT, {
    action: 'customer_shared_order', order_id: key.orderId, share_token: key.accessKey,
  }, window.location.hostname.endsWith('.netlify.app'));
  const order = result.order as Order | undefined;
  if (!order || order.id !== key.orderId || !Array.isArray(order.items) || !Array.isArray(order.history)) {
    throw new Error('Invalid order details');
  }
  const shop = result.shop as Record<string, unknown> | undefined;
  return { order, shopName: typeof shop?.shop_name === 'string' ? shop.shop_name : 'Aurora’s Cake',
    currency: typeof shop?.currency === 'string' && shop.currency ? shop.currency : '৳' };
}
export async function createCustomerOrderLink(endpoint:string,token:string,orderId:string){
  const credential=/^[0-9a-f-]{72}$/i.test(token)?{auth_token:token}:{id_token:token};
  const d=await privatePost(endpoint,{action:'staff_order_link',order_id:orderId,...credential});
  const url = websiteOrderTrackingLink(d.share_url, orderId);
  if (d.order_id !== orderId || !url) throw new Error('Customer link যাচাই হয়নি। আবার চেষ্টা করুন।');
  return url;
}
export async function revokeCustomerOrderLink(endpoint:string,token:string,orderId:string){
  const credential=/^[0-9a-f-]{72}$/i.test(token)?{auth_token:token}:{id_token:token};
  const result=await privatePost(endpoint,{action:'staff_order_link',order_id:orderId,revoke:true,...credential});
  if(result.order_id!==orderId||result.revoked!==true)throw new Error('Link বাতিল হয়েছে কি না যাচাই হয়নি।');
}
