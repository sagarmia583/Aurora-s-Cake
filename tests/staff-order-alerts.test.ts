import test from 'node:test';
import assert from 'node:assert/strict';
import { activeStaffOrderAlertIds, detectNewStaffOrderAlerts, staffAlertStage } from '../src/services/staffOrderAlerts';
import type { StaffOrder } from '../src/services/sheetStaffApi';

const order=(id:string,status:StaffOrder['status'],rider_id=''):StaffOrder=>
  ({id,order_number:'AUR-'+id,status,rider_id,created_at:'2026-10-26T12:00:00Z',
    updated_at:'2026-10-26T12:00:00Z'} as StaffOrder);

test('owner beep identifies only newly arrived pending orders, not unchanged or completed orders',()=>{
  const old=[order('1','pending'),order('2','confirmed')];
  const next=[...old,order('3','pending'),order('4','delivered')];
  assert.deepEqual(detectNewStaffOrderAlerts(old,next,'super_admin','owner@example.com'),['3']);
  assert.deepEqual(detectNewStaffOrderAlerts(next,[...next],'admin','owner@example.com'),[]);
  assert.deepEqual(detectNewStaffOrderAlerts(old,[order('1','confirmed'),order('2','confirmed')],'order_manager','owner@example.com'),[]);
});
test('new stages beep only for the staff who must act next and never for other riders',()=>{
  const previous=[order('a','pending'),order('b','ready'),order('c','ready')];
  const next=[order('a','confirmed'),order('b','assigned','rider01'),order('c','assigned','rider02')];
  assert.deepEqual(detectNewStaffOrderAlerts(previous,next,'kitchen_manager','chef01'),['a']);
  assert.deepEqual(detectNewStaffOrderAlerts(previous,next,'delivery_man','rider01'),['b']);
  assert.deepEqual(detectNewStaffOrderAlerts(previous,next,'delivery_man','rider02'),['c']);
  assert.deepEqual(detectNewStaffOrderAlerts(previous,next,'delivery_manager','dispatch'),[]);
  assert.equal(staffAlertStage(order('e','pending'),'accountant','accounts'),null);
});
test('unread alerts disappear once processed or moved to another delivery stage',()=>{
  const current=[order('a','pending'),order('b','assigned','rider01')];
  assert.deepEqual(activeStaffOrderAlertIds(current,['a','b','gone'],'super_admin','owner'),['a']);
  assert.deepEqual(activeStaffOrderAlertIds(current,['b'],'delivery_man','rider01'),['b']);
  assert.deepEqual(activeStaffOrderAlertIds([order('b','picked_up','rider01')],['b'],'delivery_man','rider01'),[]);
});
