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
