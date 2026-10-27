import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STAFF_SESSION_KEY, STAFF_WORKSPACE_KEY, STAFF_TAB_KEY,
  loadStaffCredential, saveStaffCredential, clearStaffCredential,
  isStaffWorkspaceOpen, setStaffWorkspaceOpen,
  loadStaffTab, saveStaffTab, isStaffSessionCredential,
} from '../src/services/staffWorkspaceSession';

class TabMemory {
  data=new Map<string,string>();
  getItem(key:string){return this.data.get(key)??null}
  setItem(key:string,val:string){this.data.set(key,val)}
  removeItem(key:string){this.data.delete(key)}
}
test('staff session survives a page refresh while browser tab remains open',()=>{
  const storage=new TabMemory();
  const employee='6b5c3da0-81b0-47bc-9684-71596d7bf33c'+'a68b920e-02b4-4f1a-aa74-3a7092cf8c4a';
  assert.equal(employee.length,72);
  setStaffWorkspaceOpen(storage,true);
  assert.equal(saveStaffCredential(storage,employee),true);
  saveStaffTab(storage,'orders');
  // Mimic a fresh page with the same browser-tab sessionStorage.
  assert.equal(isStaffWorkspaceOpen(storage),true);
  assert.equal(loadStaffCredential(storage),employee);
  assert.equal(loadStaffTab(storage),'orders');
  assert.equal(storage.getItem(STAFF_WORKSPACE_KEY),'1');
  assert.equal(storage.getItem(STAFF_SESSION_KEY),employee);
  assert.equal(storage.getItem(STAFF_TAB_KEY),'orders');
});
test('owner Google ID token can restore in same tab and is still verified by backend',()=>{
  const storage=new TabMemory();
  const jwt='eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjMifQ.fakesignature';
  assert.equal(isStaffSessionCredential(jwt),true);
  assert.equal(saveStaffCredential(storage,jwt),true);
  assert.equal(loadStaffCredential(storage),jwt);
  assert.equal(isStaffWorkspaceOpen(storage),false);
  setStaffWorkspaceOpen(storage,true);
  assert.equal(isStaffWorkspaceOpen(storage),true);
  clearStaffCredential(storage);
  assert.equal(loadStaffCredential(storage),'');
});
test('explicit close and sign out clear only their own state',()=>{
  const storage=new TabMemory();
  const jwt='header.payload.signature';
  saveStaffCredential(storage,jwt);
  setStaffWorkspaceOpen(storage,true);
  setStaffWorkspaceOpen(storage,false);
  assert.equal(loadStaffCredential(storage),jwt);
  assert.equal(isStaffWorkspaceOpen(storage),false);
  clearStaffCredential(storage);
  assert.equal(storage.getItem(STAFF_SESSION_KEY),null);
});
test('rejects malformed, oversized and absent staff tokens',()=>{
  const storage=new TabMemory();
  assert.equal(saveStaffCredential(storage,'phone-only'),false);
  assert.equal(saveStaffCredential(storage,'a'.repeat(20001)+'.x.x'),false);
  storage.setItem(STAFF_SESSION_KEY,'malformed');
  assert.equal(loadStaffCredential(storage),'');
  assert.equal(storage.getItem(STAFF_SESSION_KEY),null);
  assert.equal(loadStaffCredential(null),'');
  assert.equal(isStaffWorkspaceOpen(null),false);
});
