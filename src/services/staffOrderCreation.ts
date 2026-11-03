import type {Order} from '../types';
import {createSheetOrderAttempt,submitSheetOrder,SheetOrderSubmissionError,isValidSheetOrderReceipt,type SheetOrderAttempt,type SheetOrderDraft} from './googleSheetOrders';
import {checkStaffSession,mutateStaffOrder} from './sheetStaffApi';
import type {WorkspaceStorage} from './staffWorkspaceSession';
export interface StaffOrderRecord {endpoint:string;actor:string;attempt:SheetOrderAttempt;receipt?:Order}
const key=(actor:string)=>'aurora_staff_order_pending_v1:'+actor.toLowerCase();
function storage():WorkspaceStorage {try{if(globalThis.localStorage)return globalThis.localStorage;}catch{}throw new Error('অর্ডারের retry reference সংরক্ষণ করা যাচ্ছে না। Browser storage চালু করুন।');}
export function savedStaffOrder(endpoint:string,actor:string,store?:WorkspaceStorage):StaffOrderRecord|null {
  try {
    const record=JSON.parse((store||storage()).getItem(key(actor))||'null');
    if(record?.endpoint!==endpoint||record.actor!==actor.toLowerCase()||typeof record.attempt?.body!=='string')return null;
    const parsed=JSON.parse(record.attempt.body);
    const verified=createSheetOrderAttempt(endpoint,parsed,record.attempt);
    if(verified!==record.attempt||parsed.request_id!==record.attempt.request_id)return null;
    if(record.receipt&&!isValidSheetOrderReceipt(record.receipt))return null;
    return record;
  } catch {return null;}
}
function save(record:StaffOrderRecord,store:WorkspaceStorage) {
  const value=JSON.stringify(record);store.setItem(key(record.actor),value);
  if(store.getItem(key(record.actor))!==value)throw new Error('অর্ডারের reference সংরক্ষণ হয়নি। কোনো নতুন অর্ডার পাঠানো হয়নি।');
}
export function clearCompletedStaffOrder(endpoint:string,actor:string,store?:WorkspaceStorage) {
  const target=store||storage(),record=savedStaffOrder(endpoint,actor,target);
  if(record&&!record.receipt)throw new Error('আগের অর্ডারের ফলাফল অনিশ্চিত। আগে সেই অর্ডারটি retry করুন।');
  target.removeItem(key(actor));
}
export async function createLiveStaffOrder(endpoint:string,token:string,actor:string,draft?:SheetOrderDraft,
  options:{store?:WorkspaceStorage;submit?:typeof submitSheetOrder;session?:typeof checkStaffSession;confirm?:typeof mutateStaffOrder}={}) {
  const identity=await (options.session||checkStaffSession)(endpoint,token);
  if(identity.email.toLowerCase()!==actor.toLowerCase()||!['super_admin','admin','order_manager'].includes(identity.role))
    throw new Error('এই staff account থেকে অর্ডার তৈরি করা যাবে না।');
  const store=options.store||storage();
  const work=async()=>{
    let record=savedStaffOrder(endpoint,actor,store);
    if(store.getItem(key(actor))&&!record)throw new Error('আগের staff order reference যাচাই হয়নি। নতুন অর্ডার পাঠানো বন্ধ আছে।');
    if(!record) {
      if(!draft)throw new Error('কোনো pending staff order পাওয়া যায়নি।');
      record={endpoint,actor:actor.toLowerCase(),attempt:createSheetOrderAttempt(endpoint,draft)};
      save(record,store);
    } else if(draft&&!record.receipt&&createSheetOrderAttempt(endpoint,draft,record.attempt)!==record.attempt) {
      throw new Error('আগের অর্ডারের ফলাফল অনিশ্চিত। Retry saved order দিয়ে সেটি আগে যাচাই করুন।');
    }
    if(!record.receipt) {
      try {record.receipt=await (options.submit||submitSheetOrder)(record.attempt);save(record,store);}
      catch(error) {
        if(error instanceof SheetOrderSubmissionError&&!error.ambiguous)store.removeItem(key(actor));
        throw error;
      }
    }
    let warning='';
    if(record.receipt.status==='pending') {
      try {
        const confirmed=await (options.confirm||mutateStaffOrder)(endpoint,token,'confirm',record.receipt.id);
        record.receipt={...record.receipt,...confirmed,delivery_otp:''};save(record,store);
      } catch {warning='অর্ডারটি Sheet-এ সংরক্ষিত হয়েছে। Confirmation যাচাই হয়নি; live order queue থেকে দেখুন। নতুন অর্ডার তৈরি করবেন না।';}
    }
    return {order:record.receipt,warning};
  };
  return typeof navigator!=='undefined'&&navigator.locks?.request
    ? navigator.locks.request(key(actor),work):work();
}
