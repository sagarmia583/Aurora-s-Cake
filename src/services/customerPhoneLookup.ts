import type { Order } from '../types';

export interface CheckoutCustomerInfo { name:string; phone:string; address:string; source:'account'|'device'|'receipt' }
export const normalizeCheckoutPhone=(input:string):string=>{
  const digits=String(input||'').replace(/\D/g,'');
  if(/^8801[3-9]\d{8}$/.test(digits))return '0'+digits.slice(3);
  if(/^01[3-9]\d{8}$/.test(digits))return digits;
  return digits.length>=7&&digits.length<=15?'intl_'+digits:'';
};
/** No untrusted public phone lookup. Only account-verified or locally owned data. */
export function matchCheckoutCustomer(
  phone:string,
  account:{name:string;phone:string;address:string}|null,
  device:{name?:string;phone?:string;address?:string}|null,
  localReceipts:readonly Order[]
):CheckoutCustomerInfo|null{
  const target=normalizeCheckoutPhone(phone);
  if(!target)return null;
  if(account&&normalizeCheckoutPhone(account.phone)===target&&account.name.trim()){
    return {name:account.name,phone:account.phone,address:account.address||'',source:'account'};
  }
  if(device&&normalizeCheckoutPhone(device.phone||'')===target&&device.name?.trim()){
    return {name:device.name,phone:device.phone||phone,address:device.address||'',source:'device'};
  }
  const owned=localReceipts
    .filter(order=>order.persistence==='google_sheets'&&normalizeCheckoutPhone(order.customer_phone)===target
      && typeof order.customer_access_token==='string'&&order.customer_access_token.length>=72)
    .sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))[0];
  return owned?{name:owned.customer_name,phone:owned.customer_phone,address:owned.delivery_address,source:'receipt'}:null;
}
