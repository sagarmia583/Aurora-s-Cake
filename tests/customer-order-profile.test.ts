import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { savePhoneCustomerOrderProfile, syncPhoneCustomerConfirmedOrder } from '../src/services/phoneCustomerApi';
import type { Order } from '../src/types';

const id='ord_12345678-1234-4234-9234-123456789abc';
const proof='a'.repeat(72);
const endpoint='https://script.google.com/macros/s/test_deployment/exec';
const originalOrder=():Order=>({
  persistence:'google_sheets',id,order_number:'AC-123',customer_name:'Checkout buyer',
  customer_phone:'+8801700000000',delivery_address:'Confirmed new delivery address',
  customer_access_token:proof,created_at:'2026-10-30T10:00:00.000Z',updated_at:'2026-10-30T10:00:00.000Z',
  delivery_zone:{id:'zone-1',name:'Town',delivery_fee:60,is_active:true,estimated_time:'Today'},
  delivery_date:'2026-10-30',delivery_slot:'Morning',status:'pending',payment_method:'cod',payment_status:'pending',
  subtotal:600,delivery_fee:60,discount_amount:0,total_amount:660,cod_amount:660,cod_collected:false,delivery_otp:'',
  items:[{id:'line-1',order_id:id,product_id:'cake-1',product_name:'Cake',variant_name:'Small',unit_price:600,quantity:1,subtotal:600,addons:[]}],history:[],
});
function backend(options:{updated?:string;phone?:string;linked?:string;googleLinked?:boolean;active?:boolean}={}){
  const account={id:'customer-1',phone:options.phone||'01700000000',name:'Earlier name',address:'Earlier address',
    email:'kept@example.com',password_hash:'unchanged-hash',active:options.active!==false,
    created_at:'2026-10-29T00:00:00.000Z',updated_at:options.updated||'2026-10-29T00:00:00.000Z'};
  const order={...originalOrder(),...(options.linked?{customer_account_id:options.linked}:{}),
    ...(options.googleLinked?{customer_google_sub:'google-owner'}:{})};
  const orders={rows:[{id,receipt_json:JSON.stringify(order)}]};
  let profileWrites=0,receiptWrites=0,released=0;
  const reject=(code:string,message:string)=>{throw Object.assign(new Error(message),{code});};
  class FixedDate extends Date {constructor(value?:string|number){super(value??'2026-10-30T12:00:00.000Z');}}
  const context=vm.createContext({Date:FixedDate,JSON,String,Number,isFinite,
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{released++;}})},
    auroraReject_:reject,
    auroraOrderText_:(value:unknown,_label:string,min:number,max:number)=>{
      if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)reject('invalid_request','Invalid text');
      return (value as string).trim();
    },
    auroraSpreadsheet_:()=>({}),
    auroraPrivateTable_:(_book:unknown,name:string)=>name==='orders'?orders:{rows:[account]},
    auroraPrivateFindRow_:()=>2,
    auroraPrivateSaveReceipt_:(_table:unknown,_row:number,value:unknown)=>{orders.rows[0].receipt_json=JSON.stringify(value);receiptWrites++;},
  });
  vm.runInContext(fs.readFileSync(new URL('../apps-script/AccountAuth.gs',import.meta.url),'utf8'),context);
  context.auroraAccountAuthenticate_=(_kind:string,token:string)=>{
    if(!['valid-session','other-device-session'].includes(token)||!account.active)reject('unauthorized','Sign in again');
    return {...account};
  };
  context.auroraAccountSave_=(_table:unknown,value:typeof account)=>{Object.assign(account,value);profileWrites++;};
  return {account,orders,call:(changes:Record<string,unknown>={})=>context.auroraAccountCustomerPost_({
    action:'customer_phone_save_order_profile',auth_token:'valid-session',order_id:id,customer_access_token:proof,...changes}),
    readFromOtherDevice:()=>context.auroraAccountCustomerPost_({action:'customer_phone_session',auth_token:'other-device-session'}),
    writes:()=>({profileWrites,receiptWrites,released})};
}

test('a confirmed owned checkout updates the private profile for other devices and preserves email and financial records',()=>{
  const b=backend();const result=b.call({customer_name:'Untrusted override',address:'Untrusted address'});
  assert.equal(result.ok,true);assert.equal(result.saved,true);
  assert.equal(b.account.name,'Checkout buyer');assert.equal(b.account.address,'Confirmed new delivery address');
  assert.equal(b.account.email,'kept@example.com');assert.equal(b.account.password_hash,'unchanged-hash');
  assert.equal(b.readFromOtherDevice().profile.address,'Confirmed new delivery address');
  const linked=JSON.parse(b.orders.rows[0].receipt_json);
  assert.equal(linked.customer_account_id,'customer-1');assert.equal(linked.total_amount,660);assert.equal(linked.status,'pending');
  assert.equal(b.writes().profileWrites,1);assert.equal(b.writes().receiptWrites,1);
});

test('an old acknowledgement retry never overwrites a newer account profile edit',()=>{
  const b=backend({updated:'2026-10-30T11:00:00.000Z'});const result=b.call();
  assert.equal(result.saved,false);assert.equal(result.reason,'newer_profile');
  assert.equal(result.profile.address,'Earlier address');assert.equal(b.writes().profileWrites,0);
  assert.equal(JSON.parse(b.orders.rows[0].receipt_json).customer_account_id,'customer-1');
});

test('replaying profile synchronization is independent of order creation and idempotent',()=>{
  const b=backend();assert.equal(b.call().saved,true);assert.equal(b.call().saved,false);
  assert.equal(b.orders.rows.length,1);assert.equal(b.writes().receiptWrites,1);assert.equal(b.writes().profileWrites,1);
});

test('another phone, account owner, missing capability, or inactive session cannot save a customer profile',()=>{
  for(const options of [{phone:'01800000000'},{linked:'customer-other'},{googleLinked:true},{active:false}]){
    const b=backend(options);assert.throws(()=>b.call());
    assert.equal(b.writes().profileWrites,0);assert.equal(b.writes().receiptWrites,0);assert.equal(b.writes().released,1);
  }
  const b=backend();assert.throws(()=>b.call({customer_access_token:'b'.repeat(72)}));
  assert.throws(()=>b.call({order_id:'ord_00000000-0000-4000-9000-000000000000'}));
  assert.equal(b.writes().profileWrites,0);assert.equal(b.writes().receiptWrites,0);
});

test('profile transport posts only the committed receipt proof and accepts a newer-profile no-op',async()=>{
  const previousFetch=globalThis.fetch;const requests:Record<string,unknown>[]=[];
  globalThis.fetch=async(url,options)=>{
    assert.equal(url,endpoint);assert.equal(options?.method,'POST');
    requests.push(JSON.parse(String(options?.body)));
    return new Response(JSON.stringify({ok:true,saved:false,reason:'newer_profile',profile:{
      id:'customer-1',phone:'01700000000',name:'Saved name',address:'Saved address',email:'kept@example.com',phone_verified:false,
    }}),{status:200});
  };
  try{
    const result=await savePhoneCustomerOrderProfile(endpoint,'valid-session',originalOrder());
    assert.equal(result.saved,false);assert.equal(result.profile.address,'Saved address');
    assert.deepEqual(requests,[{action:'customer_phone_save_order_profile',auth_token:'valid-session',order_id:id,customer_access_token:proof}]);
    await assert.rejects(()=>savePhoneCustomerOrderProfile(endpoint,'valid-session',{...originalOrder(),persistence:'local_demo'}));
    assert.equal(requests.length,1);
  }finally{globalThis.fetch=previousFetch;}
});

test('an older deployment keeps receipt linking and an uncertain new profile write never falls back',async()=>{
  const previousFetch=globalThis.fetch;const actions:string[]=[];
  globalThis.fetch=async(_url,options)=>{
    const body=JSON.parse(String(options?.body));actions.push(body.action);
    if(body.action==='customer_phone_save_order_profile')throw new TypeError('Lost response');
    return new Response(JSON.stringify({ok:true,linked:true,order_id:id}),{status:200});
  };
  try{
    assert.equal(await syncPhoneCustomerConfirmedOrder(endpoint,'valid-session',originalOrder(),false),'linked_only');
    await assert.rejects(()=>syncPhoneCustomerConfirmedOrder(endpoint,'valid-session',originalOrder(),true),/Lost response/);
    assert.deepEqual(actions,['customer_phone_claim','customer_phone_save_order_profile']);
  }finally{globalThis.fetch=previousFetch;}
});
