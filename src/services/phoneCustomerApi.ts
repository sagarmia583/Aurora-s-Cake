import type { Order } from '../types';
import { privatePost } from './sheetStaffApi';
import { isValidSheetOrderReceipt } from './googleSheetOrders';

export interface PhoneCustomerProfile {
  id:string; phone:string; name:string; address:string; email:string; phone_verified:false;
}
export interface PhoneCustomerAuth {profile:PhoneCustomerProfile; token:string;}
const checkProfile=(value:unknown):PhoneCustomerProfile=>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid customer profile response.');
  const p=value as Record<string,unknown>;
  if(typeof p.id!=='string'||typeof p.phone!=='string'||typeof p.name!=='string'||typeof p.address!=='string'||typeof p.email!=='string')
    throw new Error('Invalid customer profile response.');
  return {id:p.id,phone:p.phone,name:p.name,address:p.address,email:p.email,phone_verified:false};
};
const checkAuth=(data:Record<string,unknown>):PhoneCustomerAuth=>{
  if(typeof data.auth_token!=='string'||! /^[a-f0-9-]{72}$/i.test(data.auth_token))
    throw new Error('Customer account did not return a valid session.');
  return {token:data.auth_token,profile:checkProfile(data.profile)};
};
export async function signupPhoneCustomer(endpoint:string,name:string,phone:string,password:string):Promise<PhoneCustomerAuth>{
  return checkAuth(await privatePost(endpoint,{action:'customer_phone_signup',name,phone,password}));
}
export async function loginPhoneCustomer(endpoint:string,phone:string,password:string):Promise<PhoneCustomerAuth>{
  return checkAuth(await privatePost(endpoint,{action:'customer_phone_login',phone,password}));
}
export async function getPhoneCustomerProfile(endpoint:string,token:string):Promise<PhoneCustomerProfile>{
  const data=await privatePost(endpoint,{action:'customer_phone_session',auth_token:token});
  return checkProfile(data.profile);
}
export async function updatePhoneCustomerProfile(endpoint:string,token:string,profile:Pick<PhoneCustomerProfile,'name'|'email'|'address'>):Promise<PhoneCustomerProfile>{
  const result=await privatePost(endpoint,{action:'customer_phone_profile',auth_token:token,...profile});
  return checkProfile(result.profile);
}
export async function phoneCustomerOrders(endpoint:string,token:string):Promise<Order[]>{
  const result=await privatePost(endpoint,{action:'customer_phone_orders',auth_token:token});
  if(!Array.isArray(result.orders)||result.orders.length>100||
      !result.orders.every(order=>isValidSheetOrderReceipt(order)&&order.persistence==='google_sheets'))
    throw new Error('Customer order history is invalid.');
  return result.orders as Order[];
}
export async function linkPhoneCustomerReceipt(endpoint:string,token:string,order:Order):Promise<void>{
  if(order.persistence!=='google_sheets'||!isValidSheetOrderReceipt(order)||!order.customer_access_token)
    throw new Error('An original confirmed receipt is required to link this order.');
  await privatePost(endpoint,{action:'customer_phone_claim',auth_token:token,order_id:order.id,customer_access_token:order.customer_access_token});
}
export async function logoutPhoneCustomer(endpoint:string,token:string):Promise<void>{
  await privatePost(endpoint,{action:'customer_phone_logout',auth_token:token});
}

export async function changePhoneCustomerPassword(endpoint:string,token:string,currentPassword:string,newPassword:string):Promise<string>{
  const result=await privatePost(endpoint,{action:'customer_phone_password',auth_token:token,current_password:currentPassword,new_password:newPassword});
  if(typeof result.auth_token!=='string'||! /^[a-f0-9-]{72}$/i.test(result.auth_token))
    throw new Error('Customer password was changed but new session was not returned. Sign in again.');
  return result.auth_token;
}
export async function closePhoneCustomerAccount(endpoint:string,token:string,currentPassword:string):Promise<void>{
  const result=await privatePost(endpoint,{action:'customer_phone_close',auth_token:token,current_password:currentPassword});
  if(result.closed!==true)throw new Error('The account could not be closed.');
}
