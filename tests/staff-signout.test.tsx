import assert from 'node:assert/strict';
import test,{type TestContext} from 'node:test';
import React,{act} from 'react';
import {create,type ReactTestRenderer} from 'react-test-renderer';
import {StaffPortal} from '../src/components/StaffPortal';
import {STAFF_SESSION_KEY} from '../src/services/staffWorkspaceSession';

Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
const employeeToken='12345678-1234-4234-8234-123456789abc'.repeat(2);
const endpoint='https://script.google.com/macros/s/FIXTURE/exec';
async function mount(t:TestContext,token=employeeToken,orders:Record<string,unknown>[]=[]){
  const storage=new Map<string,string>([[STAFF_SESSION_KEY,token]]),calls:Record<string,unknown>[]=[];
  const savedWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),savedDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
  const windowStub={location:{hostname:'localhost',origin:'http://localhost:3000'},sessionStorage:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)},
    setInterval:()=>0,clearInterval(){},setTimeout,addEventListener(){},removeEventListener(){}};
  Object.defineProperty(globalThis,'window',{configurable:true,writable:true,value:windowStub});
  Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:{visibilityState:'visible',addEventListener(){},removeEventListener(){},getElementById:()=>({addEventListener(){},removeEventListener(){}})}});
  let logout:(()=>Promise<Response>)=async()=>new Response(JSON.stringify({ok:true,revoked:true}));
  let health={body:{ok:true,up_to_date:true,writes_frozen:false} as Record<string, unknown>,status:200};
  t.mock.method(globalThis,'fetch',async(url:unknown,options:RequestInit)=>{
    if(url==='/api/backend-health')return Response.json(health.body,{status:health.status});
    const input=JSON.parse(String(options.body));calls.push(input);
    if(input.action==='staff_session')return new Response(JSON.stringify({ok:true,role:'kitchen_manager',name:'Fixture baker',email:'fixture_baker',riders:[]}));
    if(input.action==='staff_orders')return new Response(JSON.stringify({ok:true,snapshot_complete:true,orders}));
    assert.equal(input.action,'staff_password_logout');assert.equal(input.auth_token,employeeToken);return logout();
  });
  let renderer!:ReactTestRenderer;
  await act(async()=>{renderer=create(React.createElement(StaffPortal,{isOpen:true,onClose(){},endpoint}));});
  t.after(async()=>{await act(async()=>renderer.unmount());if(savedWindow)Object.defineProperty(globalThis,'window',savedWindow);else Reflect.deleteProperty(globalThis,'window');if(savedDocument)Object.defineProperty(globalThis,'document',savedDocument);else Reflect.deleteProperty(globalThis,'document');});
  const signout=()=>renderer.root.findByProps({'aria-label':'Sign out'});
  assert.ok(signout(),'fixture must restore a real staff workspace before testing sign out');
  return {renderer,storage,calls,signout,setLogout:(handler:()=>Promise<Response>)=>{logout=handler;},
    setHealth:(status:number,body:Record<string,unknown>)=>{health={status,body};}};
}

test('order summaries hide customer details until a single order is expanded',async t=>{
  const order=(id:string,order_number:string,customer_name:string)=>({
    id,order_number,customer_name,status:'confirmed',created_at:'2026-11-09T08:00:00Z',
    updated_at:'2026-11-09T08:00:00Z',total_amount:500,payment_method:'cod',payment_status:'pending',
    delivery_date:'2026-11-10',delivery_slot:'10 AM',items:[],
  });
  const {renderer}=await mount(t,employeeToken,[
    order('order-a','3117','Customer One'),order('order-b','3118','Customer Two'),
  ]);
  const summary=()=>JSON.stringify(renderer.toJSON());
  const details=(number:string)=>renderer.root.findAllByType('button').find(button=>
    button.props['aria-controls']&&button.props['aria-label'].includes(number))!;
  assert.equal(details('3117').props['aria-expanded'],false);
  assert.doesNotMatch(summary(),/Customer One|Customer Two/);
  await act(async()=>details('3117').props.onClick());
  assert.equal(details('3117').props['aria-expanded'],true);
  assert.match(summary(),/Customer One/);
  assert.doesNotMatch(summary(),/Customer Two/);
  await act(async()=>details('3118').props.onClick());
  assert.equal(details('3117').props['aria-expanded'],false);
  assert.doesNotMatch(summary(),/Customer One/);
  assert.match(summary(),/Customer Two/);
  await act(async()=>details('3118').props.onClick());
  assert.doesNotMatch(summary(),/Customer Two/);
});

test('staff health retry distinguishes a write freeze from a version mismatch and clears on recovery',async t=>{
  const h=await mount(t);
  const status=()=>JSON.stringify(h.renderer.toJSON());
  const retry=()=>h.renderer.root.findAllByType('button').find(button=>button.props.children==='আবার যাচাই করুন');
  await act(async()=>h.renderer.update(React.createElement(StaffPortal,{isOpen:false,onClose(){},endpoint})));
  h.setHealth(503,{code:'outdated_apps_script',installed_release:'store-r5',expected_release:'store-r7',writes_frozen:false});
  await act(async()=>h.renderer.update(React.createElement(StaffPortal,{isOpen:true,onClose(){},endpoint})));
  assert.match(status(),/বর্তমান r5, প্রয়োজন r7/);
  h.setHealth(200,{ok:true,up_to_date:true,writes_frozen:true});
  await act(async()=>retry()!.props.onClick());
  assert.match(status(),/অর্ডার আপডেট সাময়িকভাবে বন্ধ/);
  h.setHealth(200,{ok:true,up_to_date:true,writes_frozen:false});
  await act(async()=>retry()!.props.onClick());
  assert.equal(retry(),undefined);
});

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
