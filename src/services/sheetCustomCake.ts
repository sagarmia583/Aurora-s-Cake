import { privatePost } from './sheetStaffApi';

export interface CustomCakeDraft {
  customer_name:string;
  customer_phone:string;
  cake_type:string;
  approx_size:string;
  flavor:string;
  color_theme:string;
  writing_text:string;
  instructions:string;
  reference_image_url:string;
}
export interface CustomCakeAttempt {request_id:string;fingerprint:string}
export interface CustomCakeRequest extends CustomCakeDraft {
  id:string;request_id:string;status:'pending'|'quoted'|'declined';
  estimated_price:number;quoted_price:number;created_at:string;updated_at:string;
}
function safeUUID(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  if (globalThis.crypto?.getRandomValues) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function prepareCustomCakeAttempt(draft:CustomCakeDraft,previous:CustomCakeAttempt|null=null):CustomCakeAttempt{
  const fingerprint=JSON.stringify(draft);
  if(previous?.fingerprint===fingerprint)return previous;
  return {fingerprint,request_id:safeUUID()};
}
export async function submitCustomCake(endpoint:string,draft:CustomCakeDraft,attempt:CustomCakeAttempt):Promise<string>{
  if(JSON.stringify(draft)!==attempt.fingerprint)throw new Error('The custom cake form changed. Review and retry.');
  const result=await privatePost(endpoint,{action:'create_custom_cake',request_id:attempt.request_id,...draft});
  if(result.saved!==true||result.request_id!==attempt.request_id)throw new Error('Unable to confirm saving the custom cake request.');
  return attempt.request_id;
}
export async function getCustomCakeRequestStatus(endpoint:string,reference:string,phone:string):Promise<{status:string;quoted_price:number}>{
  const value=await privatePost(endpoint,{action:'get_custom_cake_status',request_id:reference,customer_phone:phone});
  return {status:String(value.status),quoted_price:Number(value.quoted_price)};
}
export async function fetchStaffCustomCakes(endpoint:string,token:string):Promise<CustomCakeRequest[]>{
  const result=await privatePost(endpoint,{action:'staff_custom_cakes',id_token:token});
  if(!Array.isArray(result.requests))throw new Error('Invalid custom cake queue.');
  return result.requests as CustomCakeRequest[];
}
export async function quoteStaffCustomCake(endpoint:string,token:string,reference:string,status:'quoted'|'declined',amount:number):Promise<void>{
  await privatePost(endpoint,{action:'staff_custom_quote',id_token:token,request_id:reference,status,quoted_price:amount});
}