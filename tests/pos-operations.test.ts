import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import fs from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';

type SaleRow=Record<string,unknown>;
const id='11111111-2222-4333-8444-555555555555';
function harness(permissions=['sales_view','sales_create','sales_history','sales_discount']){
  const sales:SaleRow[]=[];
  const context:Record<string,any>={
    Date,Math,Number,JSON,Object,Array,String,
    auroraStaffAuthenticate_:()=>({role:'order_manager',name:'Counter Staff',username:'cashier01'}),
    auroraStaffRequire_:(_actor:unknown,cap:string)=>{
      if(!permissions.includes(cap))throw Object.assign(new Error('forbidden'),{code:'forbidden'});
    },
    auroraReject_:(code:string,message:string)=>{throw Object.assign(new Error(message),{code});},
    auroraSpreadsheet_:()=>({}),
    auroraPrivateTable_:(_book:unknown,name:string)=>{
      assert.equal(name,'pos_sales');return {rows:sales};
    },
    auroraRows_:(_book:unknown,name:string)=>name==='settings'
      ?[{key:'shop_name',value:'Aurora Test Bakery'}]
      :name==='products'
      ?[{id:'p1',name:'Cake',is_active:true}]
      :[{id:'v1',product_id:'p1',name:'500g',price:500,sale_price:450,is_active:true}],
    auroraActive_:(v:unknown)=>v!==false,
    auroraAccountDigest_:(s:string)=>createHash('sha256').update(s).digest('hex'),
    auroraAppendPrivate_:(_table:unknown,row:SaleRow)=>sales.push(row),
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
    Utilities:{getUuid:randomUUID,formatDate:()=> '261027'}
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../apps-script/POSOperations.gs',import.meta.url),'utf8'),context);
  const sale=(patch:Record<string,unknown>={})=>context.auroraPosPost_({
    action:'staff_pos_create',request_id:id,items:[{variant_id:'v1',quantity:2}],
    customer_name:'Walk-in',customer_phone:'',payment_method:'cash',
    amount_received:1000,discount_amount:0,...patch});
  return {sale,sales,context};
}
test('POS uses server price, saves only once and returns original receipt on replay',()=>{
  const h=harness();
  const result=h.sale();assert.equal(result.ok,true);
  assert.equal(result.sale.subtotal,900);
  assert.equal(result.sale.total_amount,900);
  assert.equal(result.sale.change_amount,100);
  assert.equal(h.sales.length,1);
  const repeat=h.sale();assert.equal(repeat.already_saved,true);
  assert.equal(repeat.sale.id,result.sale.id);assert.equal(h.sales.length,1);
});
test('same request UUID cannot silently write different sale',()=>{
  const h=harness();h.sale();
  assert.throws(()=>h.sale({discount_amount:50}),{code:'idempotency_conflict'});
  assert.equal(h.sales.length,1);
});
test('only staff with discount permission can give discounts',()=>{
  const h=harness(['sales_view','sales_create']);
  assert.throws(()=>h.sale({discount_amount:10}),{code:'forbidden'});
  assert.equal(h.sale().ok,true);
});
test('duplicate bKash transaction reference cannot pay for two receipts',()=>{
  const h=harness();
  const first=h.sale({payment_method:'bkash',payment_reference:'TXID123456'});
  assert.equal(first.sale.payment_confirmation,'staff_attested');
  assert.throws(()=>h.sale({request_id:'99999999-2222-4333-8444-555555555555',
    payment_method:'bkash',payment_reference:'txid123456'}),{code:'reference_duplicate'});
  assert.equal(h.sales.length,1);
});
test('backend rejects price manipulation, missing reference and insufficient cash',()=>{
  const h=harness();
  assert.throws(()=>h.sale({amount_received:1}),{code:'insufficient_cash'});
  assert.throws(()=>h.sale({payment_method:'nagad'}),{code:'reference_required'});
  assert.throws(()=>h.sale({discount_amount:901}),{code:'invalid_discount'});
  assert.equal(h.sales.length,0);
});
test('separate sales view/history permissions are checked server-side',()=>{
  const h=harness(['sales_view']);
  assert.equal(h.context.auroraPosPost_({action:'staff_pos_catalog'}).products.length,1);
  assert.throws(()=>h.context.auroraPosPost_({action:'staff_pos_history'}),{code:'forbidden'});
  assert.throws(()=>h.sale(),{code:'forbidden'});
});
