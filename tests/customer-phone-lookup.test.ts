import assert from 'node:assert/strict';
import test from 'node:test';
import { matchCheckoutCustomer, normalizeCheckoutPhone } from '../src/services/customerPhoneLookup';
import type { Order } from '../src/types';

const oldOrder={persistence:'google_sheets',customer_phone:'+880 1700 000000',
  customer_name:'Old Owner',delivery_address:'Original Tangail address',
  customer_access_token:'a'.repeat(72),created_at:'2026-01-02T10:00:00.000Z'} as Order;

test('BD 01 and +880 phone formats map to the same customer key',()=>{
  assert.equal(normalizeCheckoutPhone('01700-000000'),'01700000000');
  assert.equal(normalizeCheckoutPhone('+880 1700 000000'),'01700000000');
  assert.equal(normalizeCheckoutPhone('123'), '');
});
test('phone lookup autofills only account-verified profile or locally held profile/receipt',()=>{
  const device={name:'Device Owner',phone:'01700000000',address:'Device address'};
  const account={name:'Verified Owner',phone:'+880 1700 000000',address:'Saved account address'};
  assert.equal(matchCheckoutCustomer('01700000000',account,device,[oldOrder])?.name,'Verified Owner');
  assert.equal(matchCheckoutCustomer('01700000000',null,device,[oldOrder])?.name,'Device Owner');
  assert.equal(matchCheckoutCustomer('01700000000',null,null,[oldOrder])?.name,'Old Owner');
  assert.equal(matchCheckoutCustomer('01800000000',null,device,[oldOrder]),null);
  const noProof={...oldOrder,customer_access_token:''};
  assert.equal(matchCheckoutCustomer('01700000000',null,null,[noProof]),null);
});

test('a typed phone number cannot autofill another account or unrelated local receipt',()=>{
  const savedAccount={name:'Account holder',phone:'01700998877',address:'Private Tangail home'};
  const localReceipt={...oldOrder,customer_phone:'01700998877',customer_name:'Owner',delivery_address:'Private Tangail home'};
  assert.equal(matchCheckoutCustomer('01888776655',savedAccount,null,[localReceipt]),null);
  assert.equal(matchCheckoutCustomer('01700998877',savedAccount,null,[])?.source,'account');
  assert.equal(matchCheckoutCustomer('+8801700998877',savedAccount,null,[])?.address,'Private Tangail home');
  assert.equal(matchCheckoutCustomer('01888776655',null,null,[]),null);
});
