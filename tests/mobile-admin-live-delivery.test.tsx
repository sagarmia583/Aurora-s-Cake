import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { actionForStatus } from '../src/components/StaffPortal';

const read=(path:string)=>fs.readFileSync(new URL('../src/'+path,import.meta.url),'utf8');

test('Ready orders assign a registered rider before any delivery transition',()=>{
  assert.equal(actionForStatus.ready?.operation,'assign');
  assert.equal(actionForStatus.assigned?.operation,'pick_up');
  assert.equal(actionForStatus.picked_up?.operation,'start_delivery');
  assert.equal(actionForStatus.out_for_delivery?.operation,'deliver');
  assert.equal(actionForStatus.delivered,null);
  const staff=read('components/StaffPortal.tsx');
  assert.doesNotMatch(staff,/order.status==='ready'\?\{operation:'start_delivery'/);
  assert.match(staff,/identity\.riders\.map\(rider/);
  assert.match(staff,/identity\.riders\.some\(r=>r\.email===riderEmail\)/);
  assert.match(staff,/cash_collected: cashCollected, admin_override: isManager/);
});

test('mobile admin viewport contains panels and preserves table-local horizontal scrolling',()=>{
  const css=fs.readFileSync(new URL('../src/index.css',import.meta.url),'utf8');
  const staff=read('components/StaffPortal.tsx');
  assert.match(css,/\.ac-main--portal[\s\S]*?overflow-x: clip/);
  assert.match(css,/\.ac-main--portal \.overflow-x-auto[\s\S]*?overscroll-behavior-x: contain/);
  assert.match(staff,/w-full max-w-\[100vw\]/);
  assert.match(staff,/lg:grid-cols-\[238px_minmax\(0,1fr\)\]/);
});

test('rider assignment cannot silently complete before backend acknowledges it',()=>{
  const staff=read('components/StaffPortal.tsx');
  assert.match(staff,/const confirmed = await mutateStaffOrder\(/);
  assert.match(staff,/setOrders\(previous=>reconcileStaffOrders\(/);
  assert.match(staff,/catch \(caught\) \{ setError\(shopErrorMessage\(caught, 'Unable to update order\.'\)\); \}/);
  const backend=fs.readFileSync(new URL('../apps-script/StaffOperations.gs',import.meta.url),'utf8');
  assert.match(backend,/Assign an active registered rider before dispatching this order/);
  assert.match(backend,/input\.cash_collected !== true/);
});
