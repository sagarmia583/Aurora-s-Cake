import assert from 'node:assert/strict';
import test from 'node:test';
import {canOperate,isOrder,validateStaffOperationsUrl,STAFF_PRODUCTION_OPERATIONS_URL,nextOperation,visibleOrders,type StaffOrder,type StaffSession} from '../apps/staff-mobile/src/domain';

const owner:StaffSession={role:'admin',email:'manager@example.com',name:'Manager',riders:[]};
const rider:StaffSession={role:'delivery_man',email:'rider01',username:'rider01',name:'Rider One',riders:[]};
const otherRider:StaffSession={role:'delivery_man',email:'rider02',username:'rider02',name:'Rider Two',riders:[]};
const sample=(status:StaffOrder['status'], rider_id='rider01'):StaffOrder=>({
  id:'ord_123456789',order_number:'AC-301',status,created_at:'2026-10-25T10:00:00Z',
  updated_at:'2026-10-25T10:00:00Z',total_amount:1000,payment_method:'cod',rider_id
});
test('mobile COD stage transitions require correct staff role and assigned rider',()=>{
  assert.equal(canOperate('kitchen_manager','start_baking'),true);
  assert.equal(canOperate('kitchen_manager','deliver'),false);
  assert.equal(canOperate('admin','deliver'),false);
  assert.equal(canOperate('delivery_man','deliver'),true);
  assert.equal(nextOperation(sample('assigned'),rider),'pick_up');
  assert.equal(nextOperation(sample('picked_up'),rider),'start_delivery');
  assert.equal(nextOperation(sample('out_for_delivery'),rider),'deliver');
  assert.equal(nextOperation(sample('out_for_delivery'),otherRider),null);
  assert.equal(nextOperation(sample('delivered'),rider),null);
  assert.equal(nextOperation(sample('ready'),owner),'assign');
});
test('mobile list isolates rider assignments and displays their actionable steps',()=>{
  const orders=[sample('assigned'),sample('out_for_delivery','rider02'),sample('picked_up')];
  assert.equal(visibleOrders(orders,rider,'orders').length,2);
  assert.equal(visibleOrders(orders,rider,'tasks').length,2);
  assert.equal(visibleOrders(orders,otherRider,'tasks').length,1);
  assert.equal(visibleOrders(orders,owner,'orders').length,3);
});
test('mobile order validation rejects bearer secrets and malformed data',()=>{
  const safe=sample('out_for_delivery');
  assert.equal(isOrder(safe),true);
  assert.equal(isOrder({...safe,delivery_otp:'1234'}),false);
  assert.equal(isOrder({...safe,customer_access_token:'private'}),false);
  assert.equal(isOrder({...safe,total_amount:-10}),false);
  assert.equal(isOrder({...safe,status:'unknown'}),false);
});

test('native staff endpoint accepts the exact Cloudflare production origin and retained legacy shop only',()=>{
  assert.equal(validateStaffOperationsUrl(STAFF_PRODUCTION_OPERATIONS_URL),STAFF_PRODUCTION_OPERATIONS_URL);
  assert.equal(validateStaffOperationsUrl('https://aurora-s-cake.vercel.app/api/operations'),'https://aurora-s-cake.vercel.app/api/operations');
  assert.equal(validateStaffOperationsUrl('https://AURORA-S-CAKE.SAGARMIA583.WORKERS.DEV:443/api/operations'),STAFF_PRODUCTION_OPERATIONS_URL);
});
test('native staff credentials cannot be sent to lookalike hosts, other tenants, or altered API targets',()=>{
  for(const endpoint of [
    '', 'not a URL',
    'http://aurora-s-cake.sagarmia583.workers.dev/api/operations',
    'https://other.sagarmia583.workers.dev/api/operations',
    'https://aurora-s-cake.other.workers.dev/api/operations',
    'https://aurora-s-cake.sagarmia583.workers.dev.evil.example/api/operations',
    'https://aurora-s-cake.vercel.app.evil.example/api/operations',
    'https://other-shop.vercel.app/api/operations',
    'https://aurora-s-cake.vercel.app:444/api/operations',
    'https://user:password@aurora-s-cake.sagarmia583.workers.dev/api/operations',
    'https://@aurora-s-cake.sagarmia583.workers.dev/api/operations',
    STAFF_PRODUCTION_OPERATIONS_URL+'?token=private',
    STAFF_PRODUCTION_OPERATIONS_URL+'#private',
    STAFF_PRODUCTION_OPERATIONS_URL+'?',
    STAFF_PRODUCTION_OPERATIONS_URL+'#',
    STAFF_PRODUCTION_OPERATIONS_URL+'/',
    'https://aurora-s-cake.sagarmia583.workers.dev/api/public',
  ]) assert.throws(()=>validateStaffOperationsUrl(endpoint),Error,endpoint);
});
