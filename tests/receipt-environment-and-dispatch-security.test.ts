import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const source=(name:string)=>fs.readFileSync(new URL('../apps-script/'+name,import.meta.url),'utf8');

test('receipt links use the current deployed Apps Script project instead of production',()=>{
  let url:any='https://script.google.com/macros/s/staging_Aa123/exec';
  const ctx:any={
    ScriptApp:{getService:()=>({getUrl:()=>url})},
    auroraReject_:(code:string)=>{throw Error(code);}
  };
  vm.runInNewContext(source('OrderLinks.gs'),ctx);
  const receipt={id:'ord_fixture',customer_share_token:'private_fixture'};
  const staging=ctx.auroraReceiptViewUrl_(receipt);
  assert.equal(staging,url+'?action=receipt&ref=ord_fixture&access=private_fixture');
  url='https://script.google.com/macros/s/production_Bb456/exec';
  const production=ctx.auroraReceiptViewUrl_(receipt);
  assert.equal(production,url+'?action=receipt&ref=ord_fixture&access=private_fixture');
  assert.notEqual(production,staging);
  for(const invalid of [null,'','https://evil.example/macros/s/production/exec',
    'https://script.google.com/macros/s/id/dev']){
    url=invalid;
    assert.throws(()=>ctx.auroraReceiptViewUrl_(receipt),/receipt_link_unavailable/);
  }
  const order={id:'ord_fixture',customer_share_token:'private_fixture',
    customer_share_created_at:new Date().toISOString()};
  const sanitized=ctx.auroraStaffShareSafe_(order,{role:'super_admin'});
  assert.equal(sanitized.customer_share_url,undefined);
  assert.equal(sanitized.customer_share_token,undefined);
});

test('admin cannot dispatch an unassigned order or silently impersonate a rider',()=>{
  const ctx:any={
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
    Utilities:{getUuid:()=> 'fixture-uuid'},
    auroraReject_:(code:string,message:string)=>{throw Error(code+': '+message);},
    console,Date,JSON
  };
  vm.runInNewContext(source('StaffOperations.gs'),ctx);
  let record:any={id:'ord_fixture',status:'ready',rider_id:'',payment_method:'cod',
    history:[],created_at:new Date().toISOString()};
  const saved:any[]=[];
  ctx.auroraStaffAuthenticate_=()=>({role:'admin',email:'admin@example.test',username:'admin',name:'Owner'});
  ctx.auroraOrderText_=(value:string)=>String(value);
  ctx.auroraSpreadsheet_=()=>({});
  ctx.auroraFastOrderTable_=()=>({});
  ctx.auroraPrivateFindRow_=()=>2;
  ctx.auroraFastReceipt_=()=>structuredClone(record);
  ctx.auroraPrivateSaveReceipt_=(_t:any,_r:number,order:any)=>saved.push(order);
  const input={action:'staff_mutate',operation:'start_delivery',order_id:'ord_fixture'};
  assert.throws(()=>ctx.auroraOperationsPost_(input),/rider_required/);
  assert.equal(saved.length,0);
  assert.equal(record.rider_id,'');
  record={...record,status:'assigned'};
  assert.throws(()=>ctx.auroraOperationsPost_(input),/rider_required/);
  assert.equal(saved.length,0);
  record={...record,status:'ready',rider_id:'rider@example.test'};
  const ok=ctx.auroraOperationsPost_(input);
  assert.equal(ok.ok,true);
  assert.equal(saved.length,1);
  assert.equal(saved[0].rider_id,'rider@example.test');
  assert.equal(saved[0].status,'out_for_delivery');
});
