import type {Review,Order} from '../types';
import {loadConfirmedSheetOrders} from './googleSheetOrders';
import {privatePost} from './sheetStaffApi';

export async function submitSheetReview(endpoint:string,review:Omit<Review,'id'|'status'|'created_at'>,
  receipts:Order[]=loadConfirmedSheetOrders(),post=privatePost){
  const receipt=receipts.find(order=>order.persistence==='google_sheets'&&order.status==='delivered'&&
    order.customer_access_token&&order.items.some(item=>item.product_id===review.product_id));
  if(!receipt)throw new Error('রিভিউ দিতে delivered অর্ডারের আসল receipt এই ডিভাইসে খুলুন বা My orders থেকে restore করুন।');
  if(review.image_url&&!/^https:\/\//i.test(review.image_url))throw new Error('ছবির public HTTPS link দিন।');
  const result=await post(endpoint,{action:'customer_review_submit',order_id:receipt.id,customer_phone:receipt.customer_phone,
    customer_access_token:receipt.customer_access_token,product_id:review.product_id,rating:review.rating,
    comment:review.comment,image_url:review.image_url||''});
  if(typeof result.review_id!=='string'||!['pending','approved','hidden','rejected'].includes(String(result.status)))
    throw new Error('রিভিউ সংরক্ষণ যাচাই হয়নি। একই রিভিউ আবার চেষ্টা করুন।');
  return result;
}
