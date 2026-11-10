import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import React,{act} from 'react';
import {create,type ReactTestRenderer} from 'react-test-renderer';
import {normalizeBangladeshiPhoneInput,validateBangladeshiPhone} from '../src/utils/phoneValidation';
import {CheckoutModal} from '../src/components/CheckoutModal';
import {CustomerStorefront} from '../src/components/CustomerStorefront';

Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
const valid='01712345678';

test('mobile input normalizes digits without silently accepting an overlong number',()=>{
  assert.equal(normalizeBangladeshiPhoneInput(valid+'99999'),valid+'99999');
  assert.equal(validateBangladeshiPhone(normalizeBangladeshiPhoneInput(valid+'99999')).isValid,false);
  assert.equal(normalizeBangladeshiPhoneInput('+880 1712 345678'),valid);
  assert.equal(normalizeBangladeshiPhoneInput('8801712345678'),valid);
  assert.equal(normalizeBangladeshiPhoneInput('০১৭১২৩৪৫৬৭৮'),valid);
  assert.equal(normalizeBangladeshiPhoneInput('017-1234 5678'),valid);
  assert.equal(normalizeBangladeshiPhoneInput('01712'), '01712');
  assert.equal(normalizeBangladeshiPhoneInput('01x7a'), '017');
  assert.equal(normalizeBangladeshiPhoneInput(''), '');
  assert.equal(validateBangladeshiPhone(valid).isValid,true);
  assert.equal(validateBangladeshiPhone('0171234567').isValid,false);
  assert.equal(validateBangladeshiPhone('017123456789').isValid,false);
  assert.equal(validateBangladeshiPhone('01212345678').isValid,false);
});

test('checkout keeps an invalid pasted phone visible for correction',async()=>{
  let renderer!:ReactTestRenderer;
  const props:React.ComponentProps<typeof CheckoutModal>={
    isOpen:true,onClose(){},onOrderSuccess(){},items:[],currency:'৳',zones:[],slots:[]
  };
  await act(async()=>{renderer=create(React.createElement(CheckoutModal,props));});
  const input=()=>renderer.root.findByProps({'aria-label':'Mobile number'});
  assert.equal(input().props.type,'tel');
  assert.equal(input().props.pattern,'01[3-9][0-9]{8}');
  await act(async()=>{input().props.onChange({target:{value:valid+'123456789'}});});
  assert.equal(input().props.value,valid+'123456789');
  assert.equal(validateBangladeshiPhone(input().props.value).isValid,false);
  await act(async()=>{input().props.onChange({target:{value:'+880 1712 345678'}});});
  assert.equal(input().props.value,valid);
  await act(async()=>renderer.unmount());
});

test('all customer phone editors use shared normalization and local validation',()=>{
  for(const path of [
    '../src/components/CheckoutModal.tsx',
    '../src/components/CustomCakeModal.tsx',
    '../src/components/CustomerProfileModal.tsx',
    '../src/components/LegacyCustomerAccountPortal.tsx',
    '../src/components/CustomerAccountPortal.tsx'
  ]){
    const source=fs.readFileSync(new URL(path,import.meta.url),'utf8');
    assert.match(source,/normalizeBangladeshiPhoneInput/,path);
  }
  const checkout=fs.readFileSync(new URL('../src/components/CheckoutModal.tsx',import.meta.url),'utf8');
  assert.match(checkout,/validateBangladeshiPhone\(customerPhone\)/);
  assert.match(checkout,/validateBangladeshiPhone\(recipientPhone\)/);
  assert.match(checkout,/validateBangladeshiPhone\(senderPhone\)/);
});

test('storefront uses memo to avoid unrelated cart/checkout re-rendering',()=>{
  assert.equal((CustomerStorefront as unknown as {$$typeof:symbol}).$$typeof,Symbol.for('react.memo'));
  const app=fs.readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
  assert.match(app,/onOpenCart=\{showStorefrontCart\}/);
  assert.match(app,/onAddToCart=\{handleAddToCart\}/);
  assert.match(app,/onSelectProduct=\{selectCake\}/);
  assert.match(app,/const reusable = !reconciled.changed/);
});

test('unchanged Sheet payload does not write synchronously to storage on every poll',()=>{
  const hook=fs.readFileSync(new URL('../src/hooks/useGoogleSheetContent.ts',import.meta.url),'utf8');
  assert.match(hook,/lastAppliedSnapshot\.current !== serialized/);
  assert.match(hook,/if \(lastAppliedSnapshot\.current !== serialized\) \{[\s\S]*?localStorage\.setItem\(CACHE_KEY/);
  assert.match(hook,/lastStatusPublishedAt\.current >= 60_000/);
  assert.match(hook,/window\.setInterval\(updateWhenVisible, 12000\)/,'Live refresh cadence is unchanged');
  assert.doesNotMatch(hook,/JSON\.stringify\(previous\)===JSON\.stringify\(next\)/);
});
