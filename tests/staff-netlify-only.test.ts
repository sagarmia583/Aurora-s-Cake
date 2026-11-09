import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {checkStaffSession} from '../src/services/sheetStaffApi';

const source=fs.readFileSync(new URL('../src/components/StaffPortal.tsx',import.meta.url),'utf8');
const url='https://script.google.com/macros/s/FIXTURE/exec';
const token='f'.repeat(72);

test('staff portal never offers retired external database backup writes',()=>{
  assert.doesNotMatch(source,/backfillFirebaseOrders|verifyFirebaseMirrorFromStaff|syncHistoricalFirebaseOrders|testFirestoreWrite/);
  assert.doesNotMatch(source,/Cloud order backup|Test cloud backup|Sync existing orders/);
  assert.match(source,/fetch\('\/api\/backend-health',/);
  assert.doesNotMatch(source,/\.vercel\.app/);
});

test('staff session rejects unsupported roles before rendering a workspace',async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({
    ok:true,role:'arbitrary_privileged_role',email:'fakeuser',name:'Fake user',riders:[]
  }),{status:200,headers:{'Content-Type':'application/json'}}));
  await assert.rejects(checkStaffSession(url,token),/invalid staff identity/);
});

test('staff session rejects blank principal and accepts supported roles',async t=>{
  let data:{ok:boolean;role:string;email:string;name:string;riders:unknown[]}={
    ok:true,role:'kitchen_manager',email:'  ',name:'Fixture',riders:[]
  };
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify(data),{
    status:200,headers:{'Content-Type':'application/json'}
  }));
  await assert.rejects(checkStaffSession(url,token),/invalid staff identity/);
  data={...data,email:'kitchen01'};
  const session=await checkStaffSession(url,token);
  assert.equal(session.role,'kitchen_manager');
  assert.equal(session.email,'kitchen01');
});
