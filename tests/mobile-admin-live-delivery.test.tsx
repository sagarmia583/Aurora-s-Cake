import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { actionForStatus } from '../src/components/StaffPortal';
import { DeliveryRiderModule } from '../src/components/admin/DeliveryRiderModule';

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

test('Admin routes rider assignment and completion to authenticated live Staff Orders',()=>{
  const admin=read('components/AdminPanel.tsx');
  const app=read('App.tsx');
  const rider=read('components/admin/DeliveryRiderModule.tsx');
  assert.match(admin,/data-testid="admin-open-live-delivery"/);
  assert.match(admin,/onOpenLiveDelivery=\{onOpenLiveDelivery\}/);
  assert.match(app,/saveStaffTab\(getBrowserWorkspaceStorage\(\),'orders'\)/);
  assert.match(app,/onOpenLiveDelivery=\{openLiveDeliveryFromAdmin\}/);
  assert.doesNotMatch(admin,/rider@auroracake\.com/);
  assert.doesNotMatch(admin,/mockDb\.assignRider\(/);
  assert.doesNotMatch(rider,/onUpdateStatus\?\.\(/);
  assert.match(rider,/data-testid="open-live-delivery-order"/);
});

test('Delivery admin module exposes working live queue entry even when no local orders exist',()=>{
  const html=renderToStaticMarkup(React.createElement(DeliveryRiderModule,{
    orders:[],currency:'৳',staffName:'Admin',role:'admin',onOpenLiveDelivery:()=>{}
  }));
  assert.match(html,/Live Rider Assignment &amp; Delivery/);
  assert.match(html,/data-testid="open-live-rider-assignment"/);
  assert.match(html,/data-testid="mobile-delivery-module"/);
});

test('mobile admin viewport contains panels and preserves table-local horizontal scrolling',()=>{
  const css=fs.readFileSync(new URL('../src/index.css',import.meta.url),'utf8');
  const staff=read('components/StaffPortal.tsx');
  const admin=read('components/AdminPanel.tsx');
  assert.match(css,/\.ac-main--portal[\s\S]*?overflow-x: clip/);
  assert.match(css,/\.ac-main--portal \.overflow-x-auto[\s\S]*?overscroll-behavior-x: contain/);
  assert.match(staff,/w-full max-w-\[100vw\]/);
  assert.match(staff,/lg:grid-cols-\[238px_minmax\(0,1fr\)\]/);
  assert.match(admin,/data-testid="responsive-admin-panel"/);
  assert.match(admin,/overflow-x-auto no-scrollbar/);
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
