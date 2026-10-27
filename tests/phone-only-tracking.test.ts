import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { normalizeTrackingPhone } from '../src/services/phoneOrderTracking';

test('phone-only tracking normalizes Bangladeshi local and international formatting', () => {
  assert.equal(normalizeTrackingPhone('01700 000000'), '01700000000');
  assert.equal(normalizeTrackingPhone('+8801700000000'), '01700000000');
  assert.equal(normalizeTrackingPhone('01811111111'), '01811111111');
});

function trackingEnvironment(extraOrders=0) {
  const source = readFileSync(new URL('../apps-script/StaffOperations.gs', import.meta.url), 'utf8');
  const marker = '/**\n * Passwordless, phone-only tracking.';
  const start = source.indexOf(marker);
  assert.ok(start > 0, 'tracking function must be deployed in StaffOperations.gs');
  const calls: Record<string, string> = {};
  const headers = ['customer_phone','order_number','status','created_at','updated_at'];
  const rows = [
    ['01700000000','AURORA-1001','pending','2026-10-26T10:00:00.000Z','2026-10-26T10:02:00.000Z'],
    ['01811111111','AURORA-1002','delivered','2026-10-26T10:00:00.000Z','2026-10-26T11:00:00.000Z'],
    ['+8801700000000','AURORA-1003','out_for_delivery','2026-10-27T10:00:00.000Z','2026-10-27T10:06:00.000Z'],
  ];
  for(let i=0;i<extraOrders;i++) rows.push([
    '01700000000','AURORA-EXTRA-'+String(i).padStart(4,'0'),
    'confirmed','2026-10-27T10:00:00.000Z','2026-10-27T10:01:00.000Z'
  ]);
  const context = vm.createContext({
    Utilities: {DigestAlgorithm:{SHA_256:1},Charset:{UTF_8:1},
      computeDigest:() => [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]},
    CacheService: {getScriptCache:()=>({
      get:(key:string)=>calls[key] || null,
      put:(key:string,value:string)=>{calls[key]=value;}
    })},
    auroraReject_: (code:string,message:string) => {throw new Error(code+': '+message);},
    auroraSpreadsheet_: () => ({}),
    auroraFastReceipt_: (_table:unknown,row:number) => ({
      customer_phone:rows[row-2][0],
      delivery_date:'2026-10-28',
      delivery_slot:'10:00 AM - 11:00 AM',
      payment_method:'cod',
      payment_status:'pending',
      subtotal:800,
      delivery_fee:50,
      discount_amount:0,
      total_amount:850,
      items:[{product_name:'Chocolate Cake',variant_name:'1 pound',flavor_name:'Chocolate',quantity:1,unit_price:800,subtotal:800,writing_message:'PRIVATE NAME'}],
      history:[{status:'pending',created_at:'2026-10-27T10:00:00.000Z',notes:'PRIVATE STAFF NOTE'}],
      delivery_address:'PRIVATE STREET',customer_name:'PRIVATE CUSTOMER',delivery_otp:'1234',
      customer_access_token:'PRIVATE TOKEN',
    }),
    auroraFastOrderTable_: () => ({
      headers, sheet:{
        getLastRow:()=>rows.length+1,
        getRange:(startRow:number,column:number,rowCount:number) => ({
          getValues:()=>rows.slice(startRow-2,startRow-2+rowCount)
            .map(row=>[row[column-1]])
        })
      }
    })
  });
  vm.runInContext(source.slice(start),context);
  return (phone:string,cursor?:number):unknown => vm.runInContext(
    'auroraPhoneOnlyTracking_('+JSON.stringify({phone,...(cursor!==undefined?{cursor}:{})})+')', context
  );
}

test('phone-only lookup lists only matching orders with masked reference and status', () => {
  const track=trackingEnvironment();
  const result=track('01700000000') as {ok:boolean;orders:Record<string,unknown>[]};
  assert.equal(result.ok,true);
  assert.equal(result.orders.length,2);
  assert.equal(result.orders[0].reference,'••••1003');
  assert.equal(result.orders[0].status,'out_for_delivery');
  assert.equal(result.orders[1].status,'pending');
  assert.deepEqual(Object.keys(result.orders[0]).sort(),
    ['created_at','delivery_date','delivery_fee','delivery_slot','discount_amount',
      'items','payment_method','payment_status','reference','status','subtotal',
      'timeline','total_amount','updated_at']);
  assert.equal((result.orders[0].items as Record<string,unknown>[])[0].product_name,'Chocolate Cake');
  assert.equal(result.orders[0].total_amount,850);
  assert.ok(!JSON.stringify(result).includes('01700000000'));
  assert.ok(!JSON.stringify(result).includes('AURORA-1003'));
  for(const privateValue of ['PRIVATE STREET','PRIVATE CUSTOMER','PRIVATE NAME','PRIVATE STAFF NOTE','PRIVATE TOKEN','1234'])
    assert.ok(!JSON.stringify(result).includes(privateValue));
  assert.equal((track('01811111111') as {orders:unknown[]}).orders.length,1);
  assert.deepEqual((track('01922222222') as {orders:unknown[]}).orders.length,0);
});

test('phone-only tracking validates phone and throttles repeated anonymous lookups', () => {
  const track=trackingEnvironment();
  assert.throws(()=>track('123'),/invalid_phone/);
  for (let index=0;index<15;index++) track('01700000000');
  assert.throws(()=>track('01700000000'),/rate_limited/);
});

test('single-file Apps Script deployment includes the phone tracking route and implementation',()=>{
  const combined=readFileSync(new URL('../apps-script/Code.AllInOne.gs',import.meta.url),'utf8');
  assert.match(combined,/customer_phone_tracking'\) return auroraResponse_\(auroraPhoneOnlyTracking_\(input\)\)/);
  assert.match(combined,/function auroraPhoneOnlyTracking_\(input\)/);
});

test('older phone orders paginate with non-overlapping pages and no private receipt data',()=>{
 const track=trackingEnvironment(12);
 const first=track('01700000000') as {orders:{reference:string}[];next_cursor:number};
 assert.equal(first.orders.length,10);
 assert.equal(typeof first.next_cursor,'number');
 const later=track('01700000000',first.next_cursor) as {orders:{reference:string}[];next_cursor:null};
 assert.equal(later.orders.length,4);
 const keys=[...first.orders,...later.orders].map(o=>o.reference);
 assert.equal(new Set(keys).size,keys.length);
 assert.equal(later.next_cursor,null);
 assert.throws(()=>track('01700000000',-1),/invalid_cursor/);
});
