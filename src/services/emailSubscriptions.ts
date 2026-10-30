import { BakeryOperationsError, privatePost } from './sheetStaffApi';

export function isEmailSetupUnavailable(error:unknown):boolean {
  return error instanceof BakeryOperationsError&&['invalid_action','setup_required'].includes(error.code);
}

export interface EmailSubscription {
  email:string;
  marketing_consent:boolean;
  email_verified:boolean;
  status:'not_subscribed'|'pending_confirmation'|'subscribed'|'unsubscribed';
}
export function validateEmailSubscription(value:unknown):EmailSubscription {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Email preference could not be verified.');
  const row=value as Record<string,unknown>;
  if(typeof row.email!=='string'||row.email.length>150||typeof row.marketing_consent!=='boolean'||typeof row.email_verified!=='boolean'||!['not_subscribed','pending_confirmation','subscribed','unsubscribed'].includes(String(row.status)))throw new Error('Email preference could not be verified.');
  if(row.status==='subscribed'&&(!row.marketing_consent||!row.email_verified))throw new Error('Email preference could not be verified.');
  return {email:row.email,marketing_consent:row.marketing_consent,email_verified:row.email_verified,status:row.status as EmailSubscription['status']};
}
export async function getEmailSubscription(endpoint:string,authToken:string):Promise<EmailSubscription> {
  const result=await privatePost(endpoint,{action:'customer_email_status',auth_token:authToken});
  return validateEmailSubscription(result.subscription);
}
export async function requestEmailSubscription(endpoint:string,authToken:string,email:string,consent:boolean):Promise<EmailSubscription> {
  if(!consent)throw new Error('Choose product email updates before requesting confirmation.');
  const result=await privatePost(endpoint,{action:'customer_email_subscribe',auth_token:authToken,email:email.trim(),marketing_consent:true});
  return validateEmailSubscription(result.subscription);
}
export async function unsubscribeEmail(endpoint:string,authToken:string):Promise<EmailSubscription> {
  const result=await privatePost(endpoint,{action:'customer_email_unsubscribe',auth_token:authToken});
  return validateEmailSubscription(result.subscription);
}
