import { privatePost } from './sheetStaffApi';
export type FinanceRider = {rider_id:string;rider_name:string;collected:number;deposited:number;remaining:number;delivered_count:number};
export type CakeCost = {id:string;product_id:string;variant_id:string;component:string;unit_label:string;quantity:number;unit_cost:number;total:number};
export type FinanceSnapshot = {
  riders:FinanceRider[];
  deposits:{id:string;rider_id:string;amount:number;date:string;actor_name:string;created_at:string;notes:string;voided_at:string;voided_by:string;void_reason:string;status:string;initiated_by_id:string;approved_by_id:string}[];
  costs:CakeCost[];
  cost_totals:Record<string,number>;
  products:{id:string;name:string;base_price:number;sale_price:number|''}[];
  variants:{id:string;product_id:string;name:string;price:number;sale_price:number|''}[];
};
const cred=(token:string):Record<string,string>=>/^[a-f0-9-]{72}$/i.test(token)?{auth_token:token}:{id_token:token};
const money=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100000000;
function checkSnapshot(snapshot:unknown):FinanceSnapshot{
  if(!snapshot||typeof snapshot!=='object')throw new Error('Invalid finance snapshot');
  const data=snapshot as Record<string,unknown>;
  if(!Array.isArray(data.riders)||!Array.isArray(data.deposits)||!Array.isArray(data.costs)||
     !Array.isArray(data.products)||!Array.isArray(data.variants)||
     typeof data.cost_totals!=='object'||data.cost_totals===null)throw new Error('Incomplete finance snapshot');
  if(data.riders.length>5000||data.deposits.length>100||data.costs.length>10000)throw new Error('Finance snapshot too large');
  for(const r of data.riders as FinanceRider[]){
    if(!r||typeof r.rider_id!=='string'||typeof r.rider_name!=='string'||
      !money(r.collected)||!money(r.deposited)||
      typeof r.remaining!=='number'||!Number.isFinite(r.remaining))
      throw new Error('Invalid rider balance');
  }
  return data as FinanceSnapshot;
}
export async function financeSummary(endpoint:string,token:string):Promise<FinanceSnapshot>{
  const data=await privatePost(endpoint,{action:'staff_finance_summary',...cred(token)});
  return checkSnapshot(data);
}
export async function recordCashDeposit(endpoint:string,token:string,input:{request_id:string;rider_id:string;amount:number;date:string;notes:string}):Promise<FinanceSnapshot>{
  const data=await privatePost(endpoint,{action:'staff_cash_deposit',...cred(token),...input});
  return checkSnapshot(data.snapshot);
}
/** Never delete financial rows; void a mistaken deposit with an audit reason. */
export async function approveCashDeposit(endpoint:string,token:string,depositId:string):Promise<FinanceSnapshot>{
  const data=await privatePost(endpoint,{action:'staff_cash_deposit_approve',...cred(token),deposit_id:depositId});
  return checkSnapshot(data.snapshot);
}
export async function voidCashDeposit(endpoint:string,token:string,depositId:string,reason:string):Promise<FinanceSnapshot>{
  const data=await privatePost(endpoint,{action:'staff_cash_deposit_void',...cred(token),
    deposit_id:depositId,reason});
  return checkSnapshot(data.snapshot);
}
export async function saveCakeCost(endpoint:string,token:string,input:{request_id:string;product_id:string;variant_id:string;component:string;unit_label:string;quantity:number;unit_cost:number}):Promise<FinanceSnapshot>{
  const data=await privatePost(endpoint,{action:'staff_cake_cost_save',...cred(token),...input});
  return checkSnapshot(data.snapshot);
}
export async function archiveCakeCost(endpoint:string,token:string,entryId:string):Promise<FinanceSnapshot>{
  const data=await privatePost(endpoint,{action:'staff_cake_cost_archive',...cred(token),entry_id:entryId});
  return checkSnapshot(data.snapshot);
}
