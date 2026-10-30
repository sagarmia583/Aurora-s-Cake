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
  const text=(value:unknown)=>typeof value==='string'?value.trim():'';
  const owned=localReceipts
    .filter(order=>order.persistence==='google_sheets'&&normalizeCheckoutPhone(order.customer_phone)===target
      && typeof order.customer_access_token==='string'&&/^[a-f0-9-]{72}$/i.test(order.customer_access_token))
    .sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
  const candidates:CheckoutCustomerInfo[]=[];
  if(account&&normalizeCheckoutPhone(account.phone)===target)
    candidates.push({name:text(account.name),phone:account.phone,address:text(account.address),source:'account'});
  if(device&&normalizeCheckoutPhone(device.phone||'')===target)
    candidates.push({name:text(device.name),phone:device.phone||phone,address:text(device.address),source:'device'});
  for(const receipt of owned)candidates.push({name:text(receipt.customer_name),phone:receipt.customer_phone,
    address:text(receipt.delivery_address),source:'receipt'});
  // An incomplete authenticated profile must not mask an already-owned address.
  // Pick each field separately, while matching every source to the same phone.
  const first=candidates.find(candidate=>candidate.name||candidate.address);
  if(!first)return null;
  return {name:candidates.find(candidate=>candidate.name)?.name||'',phone:first.phone,
    address:candidates.find(candidate=>candidate.address)?.address||'',source:first.source};
}
