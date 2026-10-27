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
export function prepareCustomCakeAttempt(draft:CustomCakeDraft,previous:CustomCakeAttempt|null=null):CustomCakeAttempt{
  const fingerprint=JSON.stringify(draft);
  if(previous?.fingerprint===fingerprint)return previous;
  if(typeof globalThis.crypto?.randomUUID!=='function') throw new Error('A secure modern browser is required.');
  return {fingerprint,request_id:globalThis.crypto.randomUUID()};
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