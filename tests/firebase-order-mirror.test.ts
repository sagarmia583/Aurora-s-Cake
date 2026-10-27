import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync } from 'node:crypto';
import {
  firebaseMirrorConfiguration,
  mirrorAuthoritativeReply,
  mirrorCommittedOrder,
  mirrorVerifiedAdminOrderPage,
  projectCommittedOrder,
} from '../api/lib/firestoreOrderMirror.js';

const sampleOrder = {
  id:'ord_12345678-1234-1234-1234-123456789abc',
  order_number:'AC-20261027-123',
  created_at:'2026-10-27T11:00:00.000Z',
  updated_at:'2026-10-27T11:01:00.000Z',
  status:'pending',
  payment_method:'cod',
  payment_status:'pending',
  total_amount:1600,
  subtotal:1500,
  delivery_fee:100,
  discount_amount:0,
  cod_amount:1600,
  customer_name:'Test Customer',
  customer_phone:'01700000000',
  delivery_address:'Private address',
  customer_access_token:'MUST_NEVER_PERSIST',
  delivery_otp:'1234',
  id_token:'do_not_mirror',
  auth_token:'do_not_mirror',
  items:[{product_id:'cake1',product_name:'Cake',variant_name:'1kg',
    quantity:1,unit_price:1500,subtotal:1500,writing_message:'private_message'}],
};
const restore={enabled:process.env.FIREBASE_MIRROR_ENABLED,creds:process.env.FIREBASE_SERVICE_ACCOUNT_JSON};
const credentials=(()=>{
  const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,
    privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
  return JSON.stringify({type:'service_account',project_id:'aurorascake-213a0',
    client_email:'aurora-tests@aurorascake-213a0.iam.gserviceaccount.com',private_key:privateKey});
})();
function setConfig(enabled=true) {
  process.env.FIREBASE_MIRROR_ENABLED=enabled?'true':'false';
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON=credentials;
}
function resetConfig(){
  if(restore.enabled===undefined)delete process.env.FIREBASE_MIRROR_ENABLED;
  else process.env.FIREBASE_MIRROR_ENABLED=restore.enabled;
  if(restore.creds===undefined)delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  else process.env.FIREBASE_SERVICE_ACCOUNT_JSON=restore.creds;
}
test('disabled mirror does not require credentials',()=>{
  process.env.FIREBASE_MIRROR_ENABLED='false';
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  assert.deepEqual(firebaseMirrorConfiguration(),{enabled:false,configured:false,reason:'disabled'});
  resetConfig();
});
test('Firestore projection allowlists fields and never stores OTP, receipt or staff secrets',()=>{
  const value=projectCommittedOrder(sampleOrder);
  assert.ok(value);
  assert.equal(value.total_amount,1600);
  const text=JSON.stringify(value);
  for(const secret of ['MUST_NEVER_PERSIST','delivery_otp','id_token','auth_token','writing_message'])
    assert.equal(text.includes(secret),false,secret);
  assert.equal(projectCommittedOrder({...sampleOrder,id:'bad'}),null);
  assert.equal(projectCommittedOrder({...sampleOrder,total_amount:-1}),null);
});
test('successful backend order uses OAuth and idempotent Firestore document PATCH',async()=>{
  setConfig();
  const calls:any[]=[];
  const fetcher=async (url:any, options:any={})=>{
    calls.push({url:String(url),options});
    if(String(url).includes('oauth2.googleapis.com')) return new Response(
      JSON.stringify({access_token:'fake_access',expires_in:3600}),{status:200});
    if(options.method==='PATCH')return new Response(JSON.stringify({updateTime:'2026-10-27T11:01:01Z'}),{status:200});
    return new Response('{}',{status:404});
  };
  try {
    const answer=await mirrorAuthoritativeReply({action:'create_order'},
      {success:true,persisted:true,order:sampleOrder},{fetcher});
    assert.equal(answer.status,'saved');
    const patch=calls.find(c=>c.options.method==='PATCH');
    assert.ok(patch);
    assert.match(patch.url,/documents\/orders\/ord_12345678/);
    assert.ok(patch.url.includes('currentDocument.exists=false'));
    const body=JSON.stringify(JSON.parse(patch.options.body));
    assert.ok(body.includes('Test Customer'));
    assert.ok(!body.includes('MUST_NEVER_PERSIST'));
    assert.ok(!body.includes('delivery_otp'));
    assert.ok(!body.includes('private_message'));
  } finally{resetConfig();}
});
test('replayed or older events do not overwrite a more recent confirmed order',async()=>{
  setConfig();
  const calls:any[]=[];
  const fetcher=async (url:any,options:any={})=>{
    calls.push(options.method||'GET');
    if(String(url).includes('oauth2.googleapis.com'))return new Response(JSON.stringify({access_token:'fake_access',expires_in:3600}),{status:200});
    if(options.method==='PATCH')throw new Error('Stale updates should never be patched');
    return new Response(JSON.stringify({fields:{updated_at:{stringValue:'2026-10-27T11:05:00.000Z'}},
      updateTime:'2026-10-27T11:05:01.000Z'}),{status:200});
  };
  try {
    const result=await mirrorCommittedOrder(sampleOrder,{fetcher});
    assert.equal(result.status,'unchanged');
    assert.ok(!calls.includes('PATCH'));
  } finally{resetConfig();}
});
test('never write for an Apps Script failed checkout or failed staff mutation',async()=>{
  setConfig();
  const fetcher=async()=>{throw new Error('should not call a network endpoint');};
  try {
    assert.equal((await mirrorAuthoritativeReply({action:'create_order'},
      {success:false,persisted:false,order:sampleOrder},{fetcher})).status,'not_applicable');
    assert.equal((await mirrorAuthoritativeReply({action:'staff_mutate'},
      {ok:false,order:sampleOrder},{fetcher})).status,'not_applicable');
  }finally{resetConfig();}
});
test('admin backfill requires verified super_admin, complete list and an explicit flag',async()=>{
  setConfig(false);
  try {
    const payload={action:'staff_orders',firebase_mirror_backfill:true,firebase_mirror_offset:0};
    assert.equal(await mirrorVerifiedAdminOrderPage(payload,
      {ok:true,role:'delivery_man',snapshot_complete:true,orders:[sampleOrder]}),null);
    assert.equal(await mirrorVerifiedAdminOrderPage(payload,
      {ok:true,role:'super_admin',snapshot_complete:false,orders:[sampleOrder]}),null);
    const response=await mirrorVerifiedAdminOrderPage(payload,
      {ok:true,role:'super_admin',snapshot_complete:true,orders:[sampleOrder]});
    assert.ok(response);
    assert.equal(response.total,1);
    assert.equal(response.configured,false);
  }finally{resetConfig();}
});
