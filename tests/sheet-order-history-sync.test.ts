import test from 'node:test';
import assert from 'node:assert/strict';
import type { Order } from '../src/types';
import { BakeryOperationsError } from '../src/services/sheetStaffApi';
import { isConfirmedDeletedSheetOrder, verifyStoredOrderHistory } from '../src/services/sheetOrderHistorySync';

const receipt = (id:string):Order => ({
  id, order_number:id, persistence:'google_sheets', status:'pending',
  history:[], updated_at:'2026-10-25T10:00:00.000Z',
  rider_name:'',payment_status:'pending',cod_collected:false,delivery_otp:''
} as unknown as Order);
const snapshot=(id:string)=>({
  order_id:id,status:'confirmed' as const,history:[],updated_at:'2026-10-26T10:00:00.000Z',
  rider_name:'Rider',payment_status:'pending' as const,cod_collected:false,delivery_otp:undefined,
});

test('authoritative deleted Sheet receipt is removed; surviving receipts update statuses in original order',async()=>{
  const rs=[receipt('exists-a'),receipt('deleted-b'),receipt('exists-c')];
  const result=await verifyStoredOrderHistory('https://script.google.com/macros/s/test/exec',rs,undefined,undefined,
    async(_url,item)=>{
      if(item.id==='deleted-b')throw new BakeryOperationsError('Order reference not found.','not_found');
      return snapshot(item.id);
    });
  assert.deepEqual(result.deletedIds,['deleted-b']);
  assert.deepEqual(result.failedIds,[]);
  assert.deepEqual(result.current.map(x=>x.id),['exists-a','exists-c']);
  assert.deepEqual(result.current.map(x=>x.status),['confirmed','confirmed']);
  assert.ok(result.current.every(x=>x.delivery_otp===''));
});
test('network failure, unauthorized request and mismatched phone NEVER clear cached receipt',async()=>{
  const rs=[receipt('network'),receipt('unauthorized'),receipt('wrong-phone')];
  const result=await verifyStoredOrderHistory('endpoint',rs,undefined,undefined,async(_url,item)=>{
    if(item.id==='network')throw new Error('Connection timed out.');
    if(item.id==='unauthorized')throw new BakeryOperationsError('Valid receipt required.','forbidden');
    throw new BakeryOperationsError('Order reference and phone do not match.','not_found');
  });
  assert.equal(result.deletedIds.length,0);
  assert.deepEqual(result.current.map(x=>x.id),rs.map(x=>x.id));
  assert.equal(result.failedIds.length,3);
  assert.equal(isConfirmedDeletedSheetOrder(new BakeryOperationsError('Order reference is invalid.','not_found')),false);
});
test('history read limits concurrent Google Apps Script calls to three',async()=>{
  let active=0,peak=0;
  const rs=Array.from({length:13},(_,n)=>receipt(String(n)));
  const result=await verifyStoredOrderHistory('endpoint',rs,undefined,undefined,async(_url,item)=>{
    active++;peak=Math.max(peak,active);
    await new Promise(resolve=>setTimeout(resolve,2));
    active--;
    return snapshot(item.id);
  });
  assert.equal(peak,3);
  assert.equal(result.current.length,13);
  assert.equal(result.deletedIds.length,0);
});
