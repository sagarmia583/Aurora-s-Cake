import test from 'node:test';
import assert from 'node:assert/strict';
import { clearStaffOrdersSnapshot, loadStaffOrdersSnapshot, reconcileStaffOrders, saveStaffOrdersSnapshot, validateStaffOrderList } from '../src/services/staffOrderSnapshot';
import { getStaffOrders } from '../src/services/sheetStaffApi';
import type { StaffOrder } from '../src/services/sheetStaffApi';
import type { WorkspaceStorage } from '../src/services/staffWorkspaceSession';

class TabMemory implements WorkspaceStorage {
  state = new Map<string,string>();
  getItem(key:string){return this.state.get(key)??null;}
  setItem(key:string,value:string){this.state.set(key,value);}
  removeItem(key:string){this.state.delete(key);}
}
const sample=(id:string,status:'pending'|'confirmed'|'out_for_delivery',time='2026-10-26T08:00:00.000Z'):StaffOrder=>({
  id,order_number:'AUR-'+id,status,updated_at:time,created_at:'2026-10-26T07:30:00.000Z',
  order_total:500,payment_method:'cod',payment_status:'pending',cod_collected:false,
} as unknown as StaffOrder);
const person=(token:string,email='owner@example.com')=>({token,email,role:'super_admin' as const});
const fakeToken='01234567-89ab-4cde-9123-abcabcdef12389abcdef-1234-4567-9876-abcdef123456';
const remoteEndpoint='https://script.google.com/macros/s/AKfycbTest/exec';
test('refresh keeps array reference when new data is unchanged and advances stages when new data arrives',()=>{
  const prior=[sample('order-1','pending')];
  const same=[{...prior[0]}];
  assert.equal(reconcileStaffOrders(prior,same),prior,'no re-render for identical response');
  const next=[sample('order-1','confirmed','2026-10-26T08:10:00.000Z')];
  assert.equal(reconcileStaffOrders(prior,next)[0].status,'confirmed');
  const outdated=[sample('order-1','pending','2026-10-26T07:59:00.000Z')];
  assert.equal(reconcileStaffOrders(prior,outdated),prior,'slow poll cannot undo a local order update');
});
test('rejects malformed, partly missing and sensitive records instead of wiping valid data',()=>{
  const prior=[sample('order-1','pending')];
  assert.throws(()=>reconcileStaffOrders(prior,[{id:'x',order_number:'x'}] as StaffOrder[]),/incomplete/);
  assert.equal(validateStaffOrderList([prior[0],prior[0]]),false);
  assert.equal(validateStaffOrderList([{...prior[0],delivery_otp:'1234'}]),false);
  assert.equal(validateStaffOrderList([{...prior[0],customer_access_token:'private'}]),false);
  assert.deepEqual(reconcileStaffOrders(prior,[]),[],'explicit confirmed empty list is a legitimate server update');
});
test('session-scoped staff orders survive reload but not account switching, expiry, corruption or sign out',()=>{
  const tab=new TabMemory(),orders=[sample('order-1','pending')],user=person(fakeToken);
  assert.equal(saveStaffOrdersSnapshot(tab,user,orders,1000),true);
  assert.deepEqual(loadStaffOrdersSnapshot(tab,user,2000),orders);
  assert.deepEqual(loadStaffOrdersSnapshot(tab,person(fakeToken,'other@example.com'),2000),[]);
  assert.equal(saveStaffOrdersSnapshot(tab,user,orders,1000),true);
  assert.deepEqual(loadStaffOrdersSnapshot(tab,user,1000+31*60000),[]);
  assert.equal(saveStaffOrdersSnapshot(tab,user,orders,1000),true);
  clearStaffOrdersSnapshot(tab);
  assert.deepEqual(loadStaffOrdersSnapshot(tab,user,2000),[]);
  assert.equal(saveStaffOrdersSnapshot(tab,user,[{...orders[0],delivery_otp:'0456'}],1000),false);
});
test('staff API refuses an incomplete server response even if one valid order is present',async()=>{
  const original=globalThis.fetch;
  const input=[sample('order-1','pending')];
  try{
    globalThis.fetch=(async()=>new Response(JSON.stringify({ok:true,orders:input,snapshot_complete:false}),{status:200})) as typeof fetch;
    await assert.rejects(()=>getStaffOrders(remoteEndpoint,fakeToken),/Incomplete/);
    globalThis.fetch=(async()=>new Response(JSON.stringify({ok:true,orders:[],snapshot_complete:false}),{status:200})) as typeof fetch;
    await assert.rejects(()=>getStaffOrders(remoteEndpoint,fakeToken),/Incomplete/);
    globalThis.fetch=(async()=>new Response(JSON.stringify({ok:true,orders:input,snapshot_complete:true}),{status:200})) as typeof fetch;
    assert.equal((await getStaffOrders(remoteEndpoint,fakeToken)).length,1);
    globalThis.fetch=(async()=>new Response(JSON.stringify({ok:true,orders:[],snapshot_complete:true}),{status:200})) as typeof fetch;
    assert.deepEqual(await getStaffOrders(remoteEndpoint,fakeToken),[]);
  }finally{globalThis.fetch=original;}
});
