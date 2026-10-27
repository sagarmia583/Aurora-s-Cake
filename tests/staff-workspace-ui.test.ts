import {canStaffOperateAssignedOrder,defaultStaffPermissions} from '../src/services/staffPermissions';
import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaffPortal } from '../src/components/StaffPortal';

const props={isOpen:true,onClose:()=>{},endpoint:'https://script.google.com/macros/s/ABC123/exec'};

test('new staff control center offers employee password and owner Google access without exposing private data',()=>{
  const page=renderToStaticMarkup(React.createElement(StaffPortal,props));
  assert.match(page,/Bakery Control Center/);
  assert.match(page,/Employee login/);
  assert.match(page,/Shop owner/);
  assert.match(page,/Open my workspace/);
  assert.match(page,/aria-label="Employee username"/);
  assert.match(page,/aria-label="Employee password"/);
  assert.doesNotMatch(page,/customer_access_token|delivery_otp|client_secret/);
});

test('closed staff dialog does not mount login or expose staff data',()=>{
  const page=renderToStaticMarkup(React.createElement(StaffPortal,{...props,isOpen:false}));
  assert.equal(page,'');
});

test('manager sees delivery actions only on orders assigned to that manager',()=>{
  const perms=defaultStaffPermissions('manager');
  assert.equal(canStaffOperateAssignedOrder('manager',perms,'assign','manager01',undefined),true);
  assert.equal(canStaffOperateAssignedOrder('manager',perms,'pick_up','manager01','manager01'),true);
  assert.equal(canStaffOperateAssignedOrder('manager',perms,'deliver','manager01','rider02'),false);
  assert.equal(canStaffOperateAssignedOrder('manager',perms,'start_delivery','manager01',undefined),false);
  assert.equal(canStaffOperateAssignedOrder('kitchen_manager',defaultStaffPermissions('kitchen_manager'),
    'deliver','kitchen01','kitchen01'),false);
  assert.equal(canStaffOperateAssignedOrder('delivery_man',defaultStaffPermissions('delivery_man'),
    'deliver','rider01','rider01'),true);
});
