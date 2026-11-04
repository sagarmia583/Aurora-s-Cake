/**
 * Real HTTP COD acceptance against a NEW isolated Apps Script staging deployment.
 * Default is GET-only; --commit intentionally creates one synthetic gift COD order.
 * The staging health fingerprint must match before any POST is attempted.
 */
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {sheetFingerprint} from './prepare-staging-apps-script.mjs';

const ensure=(value,message)=>{if(!value)throw new Error(message);};
function endpoint(input){
  let url;
  try{url=new URL(input);}catch{throw new Error('Provide a deployed staging Apps Script /exec URL');}
  ensure(url.protocol==='https:'&&url.hostname==='script.google.com'&&
    /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname)&&
    !url.search&&!url.hash&&!url.username&&!url.password,
    'Only a clean https://script.google.com/macros/s/.../exec URL is allowed');
  return url;
}
const active=value=>value===true||value===1||['1','true','yes','on'].includes(String(value).toLowerCase());
const rows=value=>Array.isArray(value)?value:[];
function idList(value){
  if(Array.isArray(value))return value.map(String);
  if(!value)return [];
  const raw=String(value).trim();
  if(raw.startsWith('[')){try{return JSON.parse(raw).map(String);}catch{return [];}}
  return raw.split(/[,;\n]/).map(x=>x.trim()).filter(Boolean);
}
function futureDhakaDate(){
  const parts=new Intl.DateTimeFormat('en-US',{
    timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(Date.now()+3*24*3600000);
  const get=kind=>parts.find(x=>x.type===kind)?.value||'';
  return get('year')+'-'+get('month')+'-'+get('day');
}
function selection(data){
  const products=rows(data.products).filter(p=>active(p.is_active));
  const variants=rows(data.product_variants).filter(v=>active(v.is_active));
  const flavors=rows(data.flavors).filter(f=>active(f.is_active));
  const zone=rows(data.delivery_zones).find(v=>active(v.is_active));
  const slot=rows(data.delivery_slots).find(v=>active(v.is_active)&&String(v.slot_label||''));
  ensure(zone&&slot,'No active staging delivery zone/time slot');
  for(const product of products){
    const variant=variants.find(v=>String(v.product_id)===String(product.id));
    if(!variant)continue;
    const allowed=idList(product.allowed_flavor_ids);
    const optional=allowed.length===0||allowed.includes('*')||allowed.includes('all');
    const flavor=flavors.find(f=>allowed.includes(String(f.id)));
    if(!optional&&!flavor)continue;
    return {product_id:String(product.id),variant_id:String(variant.id),
      flavor_id:flavor?String(flavor.id):'',delivery_zone_id:String(zone.id),
      delivery_slot:String(slot.slot_label)};
  }
  throw new Error('No valid active cake/variant/flavor combination in staging catalogue');
}
async function jsonRequest(url,options,fetcher){
  const response=await fetcher(String(url),{
    redirect:'follow',credentials:'omit',cache:'no-store',
    ...options,signal:AbortSignal.timeout(20000)
  });
  ensure(response.ok,'Apps Script returned HTTP '+response.status);
  if(response.url){
    const host=new URL(response.url).hostname;
    ensure(host==='script.google.com'||host==='script.googleusercontent.com',
      'Unexpected Apps Script redirect; stopped');
  }
  const text=await response.text();
  ensure(text.length>0&&text.length<1000000,'Empty/oversized response');
  try{return JSON.parse(text);}catch{throw new Error('Apps Script did not return JSON');}
}
export async function runStagingCodAcceptance({
  url,sheetId,commit=false,fetcher=globalThis.fetch,
  requestId=randomUUID(),deliveryDate=futureDhakaDate()
}={}){
  const target=endpoint(url||'');
  ensure(/^[A-Za-z0-9_-]{25,150}$/.test(sheetId||''),'Provide the isolated staging Sheet ID');
  const get=action=>jsonRequest(new URL(target.href+'?action='+action),{method:'GET'},fetcher);
  const health=await get('health');
  ensure(health.ok===true&&health.database_backend==='google_sheets',
    'Backend must report healthy Google Sheets');
  ensure(health.environment==='staging'&&
    health.staging_sheet_fingerprint===sheetFingerprint(sheetId),
    'STAGING SAFETY BLOCK: this deployment is not bound to the specified test Sheet');
  ensure(health.writes_frozen===false,'Staging writes are frozen or not verified');
  const publicData=await get('public');
  ensure(publicData.ok===true&&publicData.schema_version===1&&publicData.data,
    'Staging public catalogue is unavailable');
  const cake=selection(publicData.data);
  const result={mode:commit?'commit':'preflight',isolated_staging:true,
    release:health.release,product_id:cake.product_id,variant_id:cake.variant_id,
    delivery_slot:cake.delivery_slot};
  if(!commit)return result;
  const body={
    action:'create_order',request_id:requestId,checkout_proof:randomUUID()+randomUUID(),
    customer_name:'STAGING TEST - NO DELIVERY',customer_phone:'01700000000',
    delivery_address:'STAGING ONLY - NO DELIVERY, Test Road, Tangail',
    delivery_zone_id:cake.delivery_zone_id,delivery_slot:cake.delivery_slot,
    delivery_date:deliveryDate,cart_items:[{
      product_id:cake.product_id,variant_id:cake.variant_id,
      ...(cake.flavor_id?{flavor_id:cake.flavor_id}:{}),
      addon_ids:[],writing_message:'STAGING TEST',quantity:1
    }],
    payment_method:'cod',coupon_code:'',
    order_note:'ISOLATED STAGING ONLY; do not bake, deliver or take payment.',
    is_gift:true,recipient_name:'STAGING RECIPIENT',recipient_phone:'01700000001',
    sender_name:'STAGING SENDER',sender_phone:'01700000002',
    hide_price_on_box:true,gift_card_message:'Automated test, no delivery.'
  };
  const post=value=>jsonRequest(target.href,{
    method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify(value)
  },fetcher);
  const saved=await post(body);
  ensure(saved.success===true&&saved.persisted===true&&saved.order,
    'No durable COD receipt acknowledged: inspect staging before retrying');
  const order=saved.order;
  ensure(order.id==='ord_'+requestId&&order.payment_method==='cod'&&
    order.payment_status==='pending'&&order.status==='pending'&&
    order.is_gift===true&&order.recipient_name===body.recipient_name&&
    order.hide_price_on_box===true&&Number(order.total_amount)>0,
    'Saved gift/COD receipt does not match submitted payload');
  const again=await post(body);
  ensure(again.success===true&&again.persisted===true&&again.order?.id===order.id&&
    again.order.order_number===order.order_number&&
    again.order.total_amount===order.total_amount,
    'Identical UUID retry did not return its original receipt');
  const collision=await post({...body,order_note:body.order_note+' changed'});
  ensure(collision.success!==true&&collision.code==='idempotency_conflict',
    'Conflicting replay with the same UUID was not rejected');
  ensure(typeof order.customer_access_token==='string'&&order.customer_access_token.length===72,
    'Private customer capability missing');
  const tracking=await post({action:'get_order_status',order_id:order.id,
    customer_phone:body.customer_phone,customer_access_token:order.customer_access_token});
  ensure(tracking.status==='pending'&&tracking.payment_status==='pending',
    'Private order tracking failed');
  return {...result,order_id:order.id,order_number:order.order_number,
    total_amount:order.total_amount,saved:true,identical_retry:true,
    collision_rejected:true,private_tracking:true,
    note:'Verify exactly one row for the order ID in sanitized staging orders sheet'};
}
const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
  const arg=name=>{const i=process.argv.indexOf(name);return i<0?'':process.argv[i+1]||'';};
  runStagingCodAcceptance({
    url:arg('--url')||process.env.AURORA_STAGING_EXEC_URL,
    sheetId:arg('--sheet-id')||process.env.AURORA_STAGING_SHEET_ID,
    commit:process.argv.includes('--commit')
  }).then(x=>console.log('STAGING COD ACCEPTANCE:',JSON.stringify(x)))
    .catch(e=>{console.error('STAGING COD FAILED:',e.message);process.exitCode=1;});
}
