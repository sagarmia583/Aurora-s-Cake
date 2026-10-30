import assert from 'node:assert/strict';
import test,{type TestContext} from 'node:test';
import React,{act} from 'react';
import {create,type ReactTestRenderer} from 'react-test-renderer';
import {StaffPortal} from '../src/components/StaffPortal';
import {STAFF_SESSION_KEY} from '../src/services/staffWorkspaceSession';

Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
const employeeToken='12345678-1234-4234-8234-123456789abc'.repeat(2);
const endpoint='https://script.google.com/macros/s/FIXTURE/exec';
async function mount(t:TestContext,token=employeeToken){
  const storage=new Map<string,string>([[STAFF_SESSION_KEY,token]]),calls:Record<string,unknown>[]=[];
  const savedWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),savedDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
  const windowStub={location:{hostname:'localhost',origin:'http://localhost:3000'},sessionStorage:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)},
    setInterval:()=>0,clearInterval(){},setTimeout,addEventListener(){},removeEventListener(){}};
  Object.defineProperty(globalThis,'window',{configurable:true,writable:true,value:windowStub});
  Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:{visibilityState:'visible',addEventListener(){},removeEventListener(){},getElementById:()=>({addEventListener(){},removeEventListener(){}})}});
  let logout:(()=>Promise<Response>)=async()=>new Response(JSON.stringify({ok:true,revoked:true}));
  t.mock.method(globalThis,'fetch',async(_url:unknown,options:RequestInit)=>{
    const input=JSON.parse(String(options.body));calls.push(input);
    if(input.action==='staff_session')return new Response(JSON.stringify({ok:true,role:'kitchen_manager',name:'Fixture baker',email:'fixture_baker',riders:[]}));
    if(input.action==='staff_orders')return new Response(JSON.stringify({ok:true,snapshot_complete:true,orders:[]}));
    assert.equal(input.action,'staff_password_logout');assert.equal(input.auth_token,employeeToken);return logout();
  });
  let renderer!:ReactTestRenderer;
  await act(async()=>{renderer=create(React.createElement(StaffPortal,{isOpen:true,onClose(){},endpoint}));});
  t.after(async()=>{await act(async()=>renderer.unmount());if(savedWindow)Object.defineProperty(globalThis,'window',savedWindow);else Reflect.deleteProperty(globalThis,'window');if(savedDocument)Object.defineProperty(globalThis,'document',savedDocument);else Reflect.deleteProperty(globalThis,'document');});
  const signout=()=>renderer.root.findByProps({'aria-label':'Sign out'});
  assert.ok(signout(),'fixture must restore a real staff workspace before testing sign out');
  return {renderer,storage,calls,signout,setLogout:(handler:()=>Promise<Response>)=>{logout=handler;}};
}

test('password staff remain signed in until server revocation is acknowledged',async t=>{
  const h=await mount(t);let acknowledge!:((value:Response)=>void);
  h.setLogout(()=>new Promise(resolve=>{acknowledge=resolve;}));
  await act(async()=>{h.signout().props.onClick();});
  assert.equal(h.signout().props.disabled,true);assert.equal(h.storage.get(STAFF_SESSION_KEY),employeeToken);
  assert.equal(h.calls.filter(call=>call.action==='staff_password_logout').length,1);
  await act(async()=>{acknowledge(new Response(JSON.stringify({ok:true,revoked:true})));});
  assert.equal(h.storage.has(STAFF_SESSION_KEY),false);assert.equal(h.renderer.root.findAllByProps({'aria-label':'Sign out'}).length,0);
});
test('unconfirmed logout keeps the workspace and credential, reports failure, and permits a confirmed retry',async t=>{
  const h=await mount(t);h.setLogout(async()=>{throw new Error('Lost acknowledgement');});
  await act(async()=>{h.signout().props.onClick();});
  assert.equal(h.storage.get(STAFF_SESSION_KEY),employeeToken);assert.equal(h.signout().props.disabled,false);assert.match(JSON.stringify(h.renderer.toJSON()),/Sign out could not be confirmed/);
  h.setLogout(async()=>new Response(JSON.stringify({ok:true})));await act(async()=>{h.signout().props.onClick();});
  assert.equal(h.storage.has(STAFF_SESSION_KEY),true);assert.match(JSON.stringify(h.renderer.toJSON()),/Sign out could not be confirmed/);
  h.setLogout(async()=>new Response(JSON.stringify({ok:true,revoked:true})));await act(async()=>{h.signout().props.onClick();});
  assert.equal(h.storage.has(STAFF_SESSION_KEY),false);assert.equal(h.renderer.root.findAllByProps({'aria-label':'Sign out'}).length,0);
});
test('Google staff sign out locally without sending their external ID token to password-session revocation',async t=>{
  const h=await mount(t,'header.payload.signature');await act(async()=>{h.signout().props.onClick();});
  assert.equal(h.calls.filter(call=>call.action==='staff_password_logout').length,0);assert.equal(h.storage.has(STAFF_SESSION_KEY),false);assert.equal(h.renderer.root.findAllByProps({'aria-label':'Sign out'}).length,0);
});
