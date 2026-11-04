import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStagingCode,sheetFingerprint} from '../scripts/prepare-staging-apps-script.mjs';
import {runStagingCodAcceptance} from '../scripts/accept-staging-cod.mjs';

const bundle=readFileSync(new URL('../apps-script/Code.AllInOne.gs',import.meta.url),'utf8');
const id='1STAGING_TEST_ONLY_NOT_THE_PRODUCTION_SHEET_ID_A2';
test('builder replaces production Sheet binding and adds fail-closed isolation marker',()=>{
  const original=bundle.match(/var AURORA_SPREADSHEET_ID = '([^']+)'/)?.[1];
  assert.ok(original);
  assert.throws(()=>createStagingCode(bundle,original),/production/);
  const built=createStagingCode(bundle,id);
  assert.ok(built.includes(sheetFingerprint(id)));
  assert.ok(built.includes("environment:'staging'"));
  assert.ok(built.includes('return auroraStagingGuard_();'));
  assert.ok(built.includes("if(false && typeof auroraNotifyOrderStage_"));
  assert.ok(!built.includes(original));
  assert.ok(!built.includes("var AURORA_RECEIPT_VIEW_BASE_='https://script.google.com"));
});
const url='https://script.google.com/macros/s/AKfycbStagingFixture_222/exec';
const health={ok:true,database_backend:'google_sheets',environment:'staging',
  staging_sheet_fingerprint:sheetFingerprint(id),writes_frozen:false,release:'r5'};
const catalog={ok:true,schema_version:1,data:{
  products:[{id:'p1',name:'Fixture Cake',is_active:true,allowed_flavor_ids:'f1'}],
  product_variants:[{id:'v1',product_id:'p1',is_active:true,price:100}],
  flavors:[{id:'f1',name:'Vanilla',is_active:true}],
  delivery_zones:[{id:'z1',is_active:true,delivery_fee:0}],
  delivery_slots:[{id:'s1',slot_label:'10 AM - 12 PM',is_active:true}]
}};
function fixture({h=health,p=catalog}={}){
  const calls=[];let first=null;let order=null;
  const fetcher=async(url,opts)=>{
    calls.push({url,opts});
    let result;
    if(String(url).includes('action=health'))result=h;
    else if(String(url).includes('action=public'))result=p;
    else{
      const input=JSON.parse(opts.body);
      if(input.action==='create_order'){
        if(!first){
          first=input;
          order={id:'ord_'+input.request_id,order_number:'AUR-TEST-1',
            payment_method:'cod',payment_status:'pending',status:'pending',
            is_gift:true,recipient_name:input.recipient_name,
            hide_price_on_box:true,total_amount:100,customer_access_token:'a'.repeat(72)};
          result={success:true,persisted:true,order};
        }else if(JSON.stringify(input)===JSON.stringify(first))
          result={success:true,persisted:true,order};
        else result={success:false,persisted:false,code:'idempotency_conflict'};
      }else if(input.action==='get_order_status')
        result={ok:true,status:'pending',payment_status:'pending'};
      else throw Error('Unexpected fixture action '+input.action);
    }
    return new Response(JSON.stringify(result),{
      status:200,headers:{'Content-Type':'application/json'}
    });
  };
  return {fetcher,calls};
}
test('preflight is read-only and demands staging fingerprint',async()=>{
  const f=fixture();
  const r=await runStagingCodAcceptance({url,sheetId:id,fetcher:f.fetcher});
  assert.equal(r.isolated_staging,true);
  assert.deepEqual(f.calls.map(x=>x.opts.method),['GET','GET']);
  const denied=fixture({h:{...health,staging_sheet_fingerprint:'different'}});
  await assert.rejects(()=>runStagingCodAcceptance({
    url,sheetId:id,commit:true,fetcher:denied.fetcher
  }),/STAGING SAFETY BLOCK/);
  assert.equal(denied.calls.length,1);
});
test('one gift COD submission, exact retry, conflict and private tracking',async()=>{
  const f=fixture();
  const r=await runStagingCodAcceptance({url,sheetId:id,commit:true,fetcher:f.fetcher});
  assert.equal(r.saved,true);
  assert.equal(r.identical_retry,true);
  assert.equal(r.collision_rejected,true);
  assert.equal(r.private_tracking,true);
  assert.equal(f.calls.filter(x=>x.opts.method==='POST').length,4);
});
test('wrong host and protocol are blocked before fetching anything',async()=>{
  const f=fixture();
  for(const wrong of ['https://aurorascake.netlify.app/api/operations',
    'http://script.google.com/macros/s/invalid/exec',
    'https://script.google.com/macros/s/test/exec?key=leak']){
    await assert.rejects(()=>runStagingCodAcceptance({
      url:wrong,sheetId:id,commit:true,fetcher:f.fetcher
    }));
  }
  assert.equal(f.calls.length,0);
});
