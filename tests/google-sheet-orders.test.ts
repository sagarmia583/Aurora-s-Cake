import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash, randomUUID } from 'node:crypto';

type Row = unknown[];
const ORDER_HEADERS=['id','order_number','request_id','request_hash','created_at','updated_at','customer_name','customer_phone','delivery_address','delivery_zone_id','delivery_zone_name','delivery_fee','delivery_slot','delivery_date','status','subtotal','discount_amount','total_amount','coupon_code','order_note','payment_method','payment_status','receipt_json'];
const ITEM_HEADERS=['id','order_id','product_id','product_name','variant_id','variant_name','flavor_id','flavor_name','writing_message','unit_price','quantity','addons_json','subtotal'];
const CUSTOM_HEADERS=['id','request_id','request_hash','created_at','updated_at','customer_name','customer_phone','cake_type','approx_size','flavor','color_theme','writing_text','instructions','reference_image_url','status','estimated_price','quoted_price','receipt_json'];
const futureDate=()=>new Date(Date.now()+2*86400000).toISOString().slice(0,10);
const ADMIN_TOKEN='admin_'+ 'a'.repeat(130);
const RIDER_TOKEN='rider_'+ 'b'.repeat(130);
const INTRUDER_TOKEN='intruder_'+ 'c'.repeat(130);
const STAFF_CONFIG=JSON.stringify({
  'owner@example.com':{role:'super_admin',name:'Owner'},
  'rider@example.com':{role:'delivery_man',name:'Rider'},
});
const request=(patch:Record<string,unknown>={})=>({action:'create_order',request_id:'a1111111-2222-4333-8444-555555555555',checkout_proof:'aaaaaaaa-1111-4111-8111-111111111111bbbbbbbb-2222-4222-8222-222222222222',customer_name:'Test Customer',customer_phone:'+880 1700 000000',delivery_address:'Test delivery address',delivery_zone_id:'z1',delivery_slot:'10 AM - 12 PM',delivery_date:futureDate(),cart_items:[{product_id:'p1',variant_id:'v1',flavor_id:'f1',addon_ids:['a1'],writing_message:'Happy birthday',quantity:2}],coupon_code:'SAVE10',order_note:'Call before delivery',payment_method:'cod',...patch});
function harness(options:{withoutPrivate?:boolean;singleFile?:boolean}={}) {
  const tables:Record<string,Row[]>={
    Sheet1:[['existing'],['preserve me']],
    settings:[['key','value'],['shop_name','Test Bakery'],['accepting_orders',true],['delivery_enabled',true]],
    content:[['key','value']],
    products:[['id','name','is_active','allowed_flavor_ids','allowed_addon_ids'],['p1','Sheet Cake',true,'f1','a1']],
    product_variants:[['id','product_id','name','price','sale_price','is_active'],['v1','p1','1kg',900,800,true]],
    flavors:[['id','name','is_active'],['f1','Chocolate',true]],
    product_addons:[['id','name','price','is_active'],['a1','Candle',50,true]],
    delivery_zones:[['id','name','delivery_fee','estimated_time','is_active'],['z1','Test Zone',100,'1 hour',true]],
    delivery_slots:[['id','slot_label','is_active'],['s1','10 AM - 12 PM',true]],
    coupons:[['id','code','discount_type','discount_value','min_order_amount','max_discount_amount','is_active'],['c1','SAVE10','percentage',10,100,120,true]],
  };
  if(!options.withoutPrivate){tables.orders=[ORDER_HEADERS];tables.order_items=[ITEM_HEADERS];tables.custom_cake_requests=[CUSTOM_HEADERS];}
  const reads:string[]=[];const writes:string[]=[];
  const throttles=new Map<string,string>();
  let failNextItemWrite=false;let failAfterOrderWrite=false;let acquired=0;
  const sheet=(name:string):any=>({
    getLastRow:()=>tables[name].length,
    getLastColumn:()=>Math.max(0,...tables[name].map(row=>row.length)),
    getMaxRows:()=>1000,
    getRange:(row:number,col:number,height:number,width:number)=>{
      const range:any={
        getValues:()=>Array.from({length:height},(_,r)=>Array.from({length:width},(_,c)=>tables[name][row+r-1]?.[col+c-1]??'')),
        setValues:(values:Row[])=>{
          writes.push(name);
          if(name==='order_items'&&failNextItemWrite){failNextItemWrite=false;throw new Error('simulated item write interruption');}
          for(let r=0;r<values.length;r++){
            tables[name][row+r-1]??=[];
            for(let c=0;c<values[r].length;c++)tables[name][row+r-1][col+c-1]=values[r][c];
          }
          if(name==='orders'&&failAfterOrderWrite){failAfterOrderWrite=false;throw new Error('simulated lost order write acknowledgement');}
          return range;
        },
      };
      for(const method of ['setNumberFormat','setBackground','setFontColor','setFontWeight','setWrap'])range[method]=()=>range;
      return range;
    },
    setFrozenRows:()=>{},setColumnWidths:()=>{},setColumnWidth:()=>{},
  });
  const book={getSheetByName:(name:string)=>{reads.push(name);return name in tables?sheet(name):null;},insertSheet:(name:string)=>{tables[name]=[];return sheet(name);}};
  const context:Record<string,any>={
    console:{log:()=>{},error:()=>{}},Date,JSON,Object,Array,String,Math,
    SpreadsheetApp:{openById:()=>book,getActiveSpreadsheet:()=>book},
    PropertiesService:{getScriptProperties:()=>({getProperty:(key:string)=>key==='AURORA_GOOGLE_CLIENT_ID'?'test-client.apps.googleusercontent.com':key==='AURORA_STAFF_USERS'?STAFF_CONFIG:null})},
    UrlFetchApp:{fetch:(url:string)=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify({aud:'test-client.apps.googleusercontent.com',iss:'https://accounts.google.com',sub:url.includes('intruder_')?'other-google-user':'verified-google-user',exp:Math.floor(Date.now()/1000)+3600,email_verified:'true',email:url.includes('rider_')?'rider@example.com':url.includes('intruder_')?'intruder@example.com':'owner@example.com'})})},
    CacheService:{getScriptCache:()=>({get:(key:string)=>(key.startsWith('aurora_cod_')||key.startsWith('aurora_custom_')||key.startsWith('aurora_auth_'))?throttles.get(key)||null:null,put:(key:string,value:string)=>{if((key.startsWith('aurora_cod_')||key.startsWith('aurora_custom_')||key.startsWith('aurora_auth_')))throttles.set(key,value);},remove:()=>{}})},
    LockService:{getScriptLock:()=>({tryLock:()=>{acquired++;return true;},releaseLock:()=>{acquired--;}})},
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_algorithm:string,value:string)=>Array.from(createHash('sha256').update(value).digest()),formatDate:(date:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(date),getUuid:()=>randomUUID()},
    ContentService:{MimeType:{JSON:'json',JAVASCRIPT:'js'},createTextOutput:(content:string)=>({content,setMimeType(){return this;}})},
  };
  vm.createContext(context);
  if (options.singleFile) {
    vm.runInContext(fs.readFileSync(new URL('../apps-script/Code.AllInOne.gs',import.meta.url),'utf8'),context);
  } else {
  vm.runInContext(fs.readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8'),context);
  vm.runInContext(fs.readFileSync(new URL('../apps-script/StaffOperations.gs',import.meta.url),'utf8'),context);
  vm.runInContext(fs.readFileSync(new URL('../apps-script/CustomerAccounts.gs',import.meta.url),'utf8'),context);
  vm.runInContext(fs.readFileSync(new URL('../apps-script/LiveCatalog.gs',import.meta.url),'utf8'),context);
  vm.runInContext(fs.readFileSync(new URL('../apps-script/CustomCakeRequests.gs',import.meta.url),'utf8'),context);
  }
  const post=(payload:unknown)=>JSON.parse(context.doPost({postData:{type:'text/plain',contents:JSON.stringify(payload)}}).content);
  const get=(action:string)=>JSON.parse(context.doGet({parameter:{action}}).content);
  const records=(name:string)=>tables[name].slice(1).map(row=>Object.fromEntries(tables[name][0].map((key,index)=>[String(key),row[index]])));
  const change=(name:string,key:string,value:unknown)=>{const col=tables[name][0].indexOf(key);tables[name][1][col]=value;};
  return {tables,reads,writes,context,post,get,records,change,failItems:()=>{failNextItemWrite=true;},failOrderAck:()=>{failAfterOrderWrite=true;},lockCount:()=>acquired};
}

test('private COD submission recomputes Sheet sale price, add-ons per quantity, fee and capped coupon',()=>{
  const h=harness();
  const input=request({subtotal:1,total_amount:1,payment_status:'paid',cart_items:[{...(request().cart_items[0]),unit_price:1,total_price:1}]});
  const response=h.post(input);
  assert.equal(response.success,true);assert.equal(response.persisted,true);
  const order=response.order;
  assert.equal(order.persistence,'google_sheets');assert.equal(order.subtotal,1700);assert.equal(order.discount_amount,120);assert.equal(order.total_amount,1680);
  assert.equal(order.items[0].unit_price,800);assert.equal(order.items[0].addons[0].subtotal,100);assert.equal(order.items[0].quantity,2);
  assert.equal(order.status,'pending');assert.equal(order.payment_method,'cod');assert.equal(order.payment_status,'pending');assert.equal(order.cod_amount,1680);assert.equal(order.cod_collected,false);
  assert.equal(h.records('orders').length,1);assert.equal(h.records('order_items').length,1);
  assert.equal(JSON.parse(String(h.records('orders')[0].receipt_json)).id,order.id);assert.equal(h.lockCount(),0);
});

test('same request returns its original receipt even after prices, availability and shop settings change',()=>{
  const h=harness();const input=request();const first=h.post(input);
  h.change('product_variants','sale_price',1000);h.change('products','is_active',false);h.tables.settings[2][1]=false;
  const replay=h.post({...input,total_amount:999999,payment_status:'paid'});
  assert.deepEqual(replay,first);assert.equal(h.records('orders').length,1);assert.equal(h.records('order_items').length,1);
});

test('same UUID with changed semantic payload is a definite conflict without another order',()=>{
  const h=harness();h.post(request());
  const response=h.post(request({delivery_address:'Another test address'}));
  assert.equal(response.success,false);assert.equal(response.persisted,false);assert.equal(response.code,'idempotency_conflict');assert.equal(h.records('orders').length,1);
});

test('a committed receipt survives an interrupted item index and retry repairs missing items',()=>{
  const h=harness();h.failItems();const input=request();const failed=h.post(input);
  assert.equal(failed.success,false);assert.equal(failed.code,'submission_uncertain');assert.equal('persisted' in failed,false);
  assert.equal(h.records('orders').length,1);assert.equal(h.records('order_items').length,0);
  h.change('product_variants','sale_price',2000);
  const retry=h.post(input);assert.equal(retry.success,true);assert.equal(retry.order.total_amount,1680);
  assert.equal(h.records('orders').length,1);assert.equal(h.records('order_items').length,1);
  h.post(input);assert.equal(h.records('order_items').length,1);
});

test('lost acknowledgement after the header commit remains uncertain and retries without duplication',()=>{
  const h=harness();h.failOrderAck();const failed=h.post(request());
  assert.equal(failed.success,false);assert.equal('persisted' in failed,false);assert.equal(h.records('orders').length,1);
  const retry=h.post(request());assert.equal(retry.persisted,true);assert.equal(h.records('orders').length,1);assert.equal(h.records('order_items').length,1);
});

test('zero Sheet prices and zero coupon maximum stay zero',()=>{
  const h=harness();h.change('product_variants','sale_price',0);h.change('product_addons','price',0);h.change('delivery_zones','delivery_fee',0);
  h.change('coupons','min_order_amount',0);h.change('coupons','max_discount_amount',0);
  const response=h.post(request());assert.equal(response.success,true);assert.equal(response.order.items[0].unit_price,0);assert.equal(response.order.subtotal,0);assert.equal(response.order.total_amount,0);
});

test('unavailable choices, invalid date/phone/quantity and online payment reject before writing',()=>{
  const cases=[
    request({payment_method:'card'}),request({customer_phone:1700000000}),request({customer_phone:'no phone'}),
    request({delivery_date:'2026-02-30'}),request({delivery_date:'2000-01-01'}),request({delivery_slot:'Unknown slot'}),request({coupon_code:'MISSING'}),
    request({cart_items:[{...request().cart_items[0],quantity:0}]}),request({cart_items:[{...request().cart_items[0],quantity:1.5}]}),
    request({cart_items:[{...request().cart_items[0],variant_id:'missing'}]}),request({cart_items:[{...request().cart_items[0],flavor_id:'missing'}]}),
    request({cart_items:[{...request().cart_items[0],addon_ids:['missing']}]}),request({cart_items:[{...request().cart_items[0],addon_ids:['a1','a1']}]}),
  ];
  for(const input of cases){const h=harness();const response=h.post(input);assert.equal(response.success,false);assert.equal(response.persisted,false,JSON.stringify(input));assert.equal(h.writes.length,0);assert.equal(h.lockCount(),0);}
  const h=harness();h.change('flavors','is_active',false);assert.equal(h.post(request()).persisted,false);assert.equal(h.writes.length,0);
});

test('invalid source money and duplicate source IDs never create a free or ambiguous order',()=>{
  for(const amount of ['',false,'free',-1]){const h=harness();h.change('product_variants','sale_price',amount);h.change('product_variants','price',amount);assert.equal(h.post(request()).success,false);assert.equal(h.writes.length,0);}
  const h=harness();h.tables.product_variants.push([...h.tables.product_variants[1]]);assert.equal(h.post(request()).success,false);assert.equal(h.writes.length,0);
});

test('all private string cells are formula-safe while returned receipt keeps original text',()=>{
  const h=harness();h.change('products','name','@Sheet Cake');h.change('product_variants','name','-1kg');h.change('product_addons','name','+Candle');
  const response=h.post(request({customer_name:'=SUM(1,2)',delivery_address:'-Some full address',order_note:'@note',cart_items:[{...request().cart_items[0],writing_message:'+message'}]}));
  assert.equal(response.success,true);assert.equal(response.order.customer_name,'=SUM(1,2)');
  const order=h.records('orders')[0],item=h.records('order_items')[0];
  assert.equal(order.customer_name,"'=SUM(1,2)");assert.equal(order.customer_phone,"'+880 1700 000000");assert.equal(order.delivery_address,"'-Some full address");assert.equal(order.order_note,"'@note");
  assert.equal(item.product_name,"'@Sheet Cake");assert.equal(item.variant_name,"'-1kg");assert.equal(item.writing_message,"'+message");
  assert.equal(JSON.parse(String(order.receipt_json)).customer_name,'=SUM(1,2)');
});

test('GET exposes capability but no private data and never writes or reads order tabs',()=>{
  const h=harness();h.post(request());h.reads.length=0;h.writes.length=0;
  const response=h.get('public');assert.equal(response.ok,true);assert.equal(response.data.order_submission_enabled,true);
  assert.equal(JSON.stringify(response).includes('Test Customer'),false);assert.equal('orders' in response.data,false);
  for(const action of ['create_order','orders','order_items','setup'])assert.equal(h.get(action).ok,false);
  assert.equal(h.reads.includes('orders'),false);assert.equal(h.reads.includes('order_items'),false);assert.equal(h.writes.length,0);
});

test('manual setup adds only private headers and preserves existing public rows and Sheet1',()=>{
  const h=harness({withoutPrivate:true});const before=structuredClone(h.tables.settings);
  h.context.AURORA_SEED_DATA={orders:[{customer_name:'never seed private customers'}],order_items:[{id:'private'}]};
  h.context.setupSheetDatabase();assert.deepEqual(h.tables.orders,[ORDER_HEADERS]);assert.deepEqual(h.tables.order_items,[ITEM_HEADERS]);
  assert.deepEqual(h.tables.settings,before);assert.deepEqual(h.tables.Sheet1,[['existing'],['preserve me']]);
  h.post(request());const count=h.tables.orders.length;h.context.setupSheetDatabase();assert.equal(h.tables.orders.length,count);
});

test('a changed expected total rejects before writes and a matching estimate accepts',()=>{
  const h=harness();const failed=h.post(request({expected_total:1600}));
  assert.equal(failed.success,false);assert.equal(failed.persisted,false);assert.equal(failed.code,'price_changed');assert.equal(h.writes.length,0);
  const accepted=h.post(request({expected_total:1680}));assert.equal(accepted.success,true);assert.equal(accepted.order.total_amount,1680);
  h.change('delivery_zones','delivery_fee',200);const retry=h.post(request({expected_total:1680}));assert.deepEqual(retry,accepted);
});


test('a busy lock is uncertain because an earlier same-ID request may still commit',()=>{
  const h=harness();
  h.context.LockService={getScriptLock:()=>({tryLock:()=>false,releaseLock:()=>{throw new Error('Unacquired lock must not release');}})};
  const response=h.post(request());
  assert.equal(response.success,false);assert.equal(response.code,'busy');assert.equal('persisted' in response,false);
  assert.equal(h.writes.length,0);
});

test('staff operations reject missing and unapproved Google tokens without reading private orders',()=>{
  const h=harness();
  assert.equal(h.post({action:'staff_orders'}).code,'unauthorized');
  assert.equal(h.post({action:'staff_orders',id_token:INTRUDER_TOKEN}).code,'forbidden');
  assert.equal(h.get('staff_orders').ok,false);
  assert.equal(h.reads.includes('orders'),false);
});
test('verified staff manage the same private receipt; riders see assigned orders without delivery OTP',()=>{
  const h=harness(),created=h.post(request());
  assert.equal(created.persisted,true);
  const orderId=created.order.id;
  const adminSession=h.post({action:'staff_session',id_token:ADMIN_TOKEN});
  assert.equal(adminSession.role,'super_admin');
  assert.equal(adminSession.riders[0].email,'rider@example.com');
  const riderBefore=h.post({action:'staff_orders',id_token:RIDER_TOKEN});
  assert.equal(riderBefore.orders.length,0);
  const update=(operation:string,id_token:string,extra:Record<string,unknown>={})=>h.post({action:'staff_mutate',id_token,operation,order_id:orderId,...extra});
  assert.equal(update('confirm',ADMIN_TOKEN).ok,true);
  assert.equal(update('start_baking',ADMIN_TOKEN).ok,true);
  assert.equal(update('mark_ready',ADMIN_TOKEN).ok,true);
  assert.equal(update('assign',ADMIN_TOKEN,{rider_email:'rider@example.com'}).ok,true);
  const riderQueue=h.post({action:'staff_orders',id_token:RIDER_TOKEN});
  assert.equal(riderQueue.orders.length,1);
  assert.equal(Object.prototype.hasOwnProperty.call(riderQueue.orders[0],'delivery_otp'),false);
  assert.equal(update('pick_up',RIDER_TOKEN).ok,true);
  assert.equal(update('start_delivery',RIDER_TOKEN).ok,true);
  assert.equal(update('deliver',RIDER_TOKEN,{delivery_otp:JSON.parse(String(h.records('orders')[0].receipt_json)).delivery_otp,cash_collected:false}).code,'cash_unconfirmed');
  assert.equal(update('deliver',RIDER_TOKEN,{delivery_otp:JSON.parse(String(h.records('orders')[0].receipt_json)).delivery_otp,cash_collected:true}).ok,true);
  const customer=h.post({action:'get_order_status',order_id:orderId,customer_phone:request().customer_phone,customer_access_token:created.order.customer_access_token});
  assert.equal(customer.status,'delivered');
  assert.equal(customer.payment_status,'paid');
  assert.equal(customer.cod_collected,true);
  assert.equal(Object.prototype.hasOwnProperty.call(customer,'delivery_otp'),false);
  const retry=h.post(request());
  assert.equal(retry.order.status,'delivered');
  assert.equal(h.records('orders').length,1);
  assert.equal(h.records('order_items').length,1);
});
test('delivery OTP rate limit and order transition checks are persisted server-side',()=>{
  const h=harness(),created=h.post(request());
  const orderId=created.order.id;
  const update=(operation:string,id_token:string,extra:Record<string,unknown>={})=>h.post({action:'staff_mutate',id_token,operation,order_id:orderId,...extra});
  assert.equal(update('assign',ADMIN_TOKEN,{rider_email:'rider@example.com'}).code,'invalid_transition');
  assert.equal(update('pick_up',RIDER_TOKEN).code,'invalid_transition');
  for(const operation of ['confirm','start_baking','mark_ready']) assert.equal(update(operation,ADMIN_TOKEN).ok,true);
  assert.equal(update('assign',ADMIN_TOKEN,{rider_email:'rider@example.com'}).ok,true);
  assert.equal(update('pick_up',RIDER_TOKEN).ok,true);
  assert.equal(update('start_delivery',RIDER_TOKEN).ok,true);
  for(let i=0;i<5;i++) assert.equal(update('deliver',RIDER_TOKEN,{delivery_otp:'0000',cash_collected:true}).code,'invalid_otp');
  assert.equal(update('deliver',RIDER_TOKEN,{delivery_otp:created.order.delivery_otp,cash_collected:true}).code,'otp_locked');
  assert.equal(h.post({action:'get_order_status',order_id:orderId,customer_phone:request().customer_phone,customer_access_token:created.order.customer_access_token}).status,'out_for_delivery');
});
test('customer status requires both unpredictable order reference and matching phone',()=>{
  const h=harness(),created=h.post(request());
  assert.equal(h.post({action:'get_order_status',order_id:created.order.id,customer_phone:'01700000000'}).code,'not_found');
  assert.equal(h.post({action:'get_order_status',order_id:'ord_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',customer_phone:request().customer_phone}).code,'not_found');
  assert.equal(h.get('get_order_status').ok,false);
});

test('COD burst protection prevents six new orders per phone but never blocks a committed retry',()=>{
  const h=harness();
  const uuid=(n:number)=>'aaaaaaaa-1111-4111-8111-'+String(n).padStart(12,'0');
  for(let n=1;n<=5;n++) assert.equal(h.post(request({request_id:uuid(n)})).persisted,true);
  const blocked=h.post(request({request_id:uuid(6)}));
  assert.equal(blocked.code,'order_rate_limited');
  assert.equal(h.records('orders').length,5);
  assert.equal(h.post(request({request_id:uuid(1)})).persisted,true);
  assert.equal(h.records('orders').length,5);
});

test('free Google accounts require a verified token and cannot list unlinked private orders',()=>{
  const h=harness();const order=h.post(request()).order;
  assert.equal(h.post({action:'customer_orders'}).code,'unauthorized');
  assert.equal(h.post({action:'customer_orders',id_token:ADMIN_TOKEN}).orders.length,0);
  assert.equal(h.post({action:'customer_session',id_token:INTRUDER_TOKEN}).email,'intruder@example.com');
  assert.equal(h.get('customer_orders').ok,false);
  assert.equal(h.records('orders').length,1);
  assert.equal(order.payment_status,'pending');
});
test('customer explicitly links original receipt and recovers order from the same verified Google identity',()=>{
  const h=harness();const original=h.post(request()).order;
  const claim={action:'customer_claim_order',id_token:ADMIN_TOKEN,order_id:original.id,customer_phone:original.customer_phone,customer_access_token:original.customer_access_token};
  assert.equal(h.post({...claim,customer_phone:'01700000000'}).code,'not_found');
  assert.equal(h.post(claim).linked,true);
  assert.equal(h.post(claim).linked,true);
  const saved=h.post({action:'customer_orders',id_token:ADMIN_TOKEN}).orders;
  assert.equal(saved.length,1);
  assert.equal(saved[0].id,original.id);
  assert.equal(saved[0].delivery_otp,'');
  assert.equal(saved[0].customer_google_sub,undefined);
  assert.equal(h.post({action:'customer_orders',id_token:INTRUDER_TOKEN}).orders.length,0);
  assert.equal(h.post({...claim,id_token:INTRUDER_TOKEN}).code,'already_linked');
  const retry=h.post(request());
  assert.equal(retry.persisted,true);
  assert.equal(retry.order.customer_google_sub,undefined);
  assert.equal(h.records('orders').length,1);
});
test('free Google recovery shows delivery OTP only after the linked order is out for delivery',()=>{
  const h=harness();const created=h.post(request()).order;
  assert.equal(h.post({action:'customer_claim_order',id_token:ADMIN_TOKEN,order_id:created.id,customer_phone:created.customer_phone,customer_access_token:created.customer_access_token}).ok,true);
  const update=(operation:string,id_token:string,extra:Record<string,unknown>={})=>h.post({action:'staff_mutate',id_token,operation,order_id:created.id,...extra});
  for(const op of ['confirm','start_baking','mark_ready']) assert.equal(update(op,ADMIN_TOKEN).ok,true);
  assert.equal(update('assign',ADMIN_TOKEN,{rider_email:'rider@example.com'}).ok,true);
  assert.equal(update('pick_up',RIDER_TOKEN).ok,true);
  assert.equal(update('start_delivery',RIDER_TOKEN).ok,true);
  const orders=h.post({action:'customer_orders',id_token:ADMIN_TOKEN}).orders;
  assert.equal(orders[0].delivery_otp,JSON.parse(String(h.records('orders')[0].receipt_json)).delivery_otp);
  assert.equal(orders[0].status,'out_for_delivery');
});

test('linked customer gets delivery OTP only after dispatch with their own valid Google token',()=>{
  const h=harness();const order=h.post(request()).order;
  const status=(token?:string)=>h.post({action:'get_order_status',order_id:order.id,customer_phone:order.customer_phone,...(token?{id_token:token}:{} )});
  assert.equal(h.post({action:'customer_claim_order',id_token:ADMIN_TOKEN,order_id:order.id,customer_phone:order.customer_phone,customer_access_token:order.customer_access_token}).ok,true);
  assert.equal(status(ADMIN_TOKEN).delivery_otp,undefined);
  const update=(operation:string,id_token:string,extra:Record<string,unknown>={})=>h.post({action:'staff_mutate',id_token,operation,order_id:order.id,...extra});
  for(const op of ['confirm','start_baking','mark_ready']) assert.equal(update(op,ADMIN_TOKEN).ok,true);
  assert.equal(update('assign',ADMIN_TOKEN,{rider_email:'rider@example.com'}).ok,true);
  assert.equal(update('pick_up',RIDER_TOKEN).ok,true);
  assert.equal(update('start_delivery',RIDER_TOKEN).ok,true);
  assert.equal(status().delivery_otp,undefined);
  assert.equal(status(INTRUDER_TOKEN).code,'forbidden');
  assert.equal(status(ADMIN_TOKEN).delivery_otp,JSON.parse(String(h.records('orders')[0].receipt_json)).delivery_otp);
  assert.equal(h.post({action:'get_order_status',order_id:order.id,customer_phone:order.customer_phone,customer_access_token:order.customer_access_token}).delivery_otp,JSON.parse(String(h.records('orders')[0].receipt_json)).delivery_otp);
});

test('only verified admins can edit live catalogue; arbitrary fields and other roles are rejected',()=>{
  const h=harness();
  const read=()=>h.post({action:'staff_catalog',id_token:ADMIN_TOKEN});
  const save=(table:string,record_id:string,field:string,value:unknown,id_token=ADMIN_TOKEN)=>
    h.post({action:'staff_catalog_update',id_token,table,record_id,field,value});
  assert.equal(read().products[0].name,'Sheet Cake');
  assert.equal(h.post({action:'staff_catalog',id_token:RIDER_TOKEN}).code,'forbidden');
  assert.equal(save('products','p1','is_active',false,RIDER_TOKEN).code,'forbidden');
  assert.equal(save('orders','p1','customer_phone','999').code,'forbidden');
  assert.equal(save('products','p1','image_url','javascript:alert(1)').code,'invalid_value');
  assert.equal(save('product_variants','v1','price',-2).code,'invalid_price');
  assert.equal(save('products','p1','is_active',false).updated,true);
  assert.equal(read().products[0].is_active,false);
  assert.equal(h.post(request()).code,'unavailable_selection');
});
test('free admin price updates change authoritative checkout amounts, not browser prices',()=>{
  const h=harness();
  const save=(table:string,record_id:string,field:string,value:unknown)=>
    h.post({action:'staff_catalog_update',id_token:ADMIN_TOKEN,table,record_id,field,value});
  assert.equal(save('product_variants','v1','sale_price','').updated,true);
  assert.equal(save('product_variants','v1','price',950.5).updated,true);
  const fresh=h.post(request());
  assert.equal(fresh.persisted,true,JSON.stringify(fresh));
  // Two 950.50 cakes and two 50 add-ons, capped at 120 off, plus 100 delivery.
  assert.equal(fresh.order.total_amount,1981);
  assert.equal(save('settings','accepting_orders','accepting_orders',false).updated,true);
  const blocked=h.post(request({request_id:'cccccccc-1111-4111-8111-222222222222'}));
  assert.equal(blocked.code,'shop_closed');
});

test('free custom cake quote submission is private, idempotent and managed by authorized staff',()=>{
  const h=harness();
  const draft={action:'create_custom_cake',request_id:'bbbbbbbb-2222-4222-8222-333333333333',
    customer_name:'Birthday Customer',customer_phone:'+880 1700 999999',
    cake_type:'Theme Birthday Cake',approx_size:'1.5kg',flavor:'Chocolate',color_theme:'Blue',
    writing_text:'Happy Birthday',instructions:'Please call first',reference_image_url:'https://example.com/cake.jpg'};
  assert.equal(h.post(draft).saved,true);
  assert.equal(h.post(draft).saved,true);
  assert.equal(h.records('custom_cake_requests').length,1);
  assert.equal(h.post({...draft,cake_type:'Different'}).code,'idempotency_conflict');
  assert.equal(h.post({...draft,request_id:'bbbbbbbb-2222-4222-8222-444444444444',reference_image_url:'javascript:alert(1)'}).code,'invalid_url');
  const publicData=h.get('public');assert.equal(JSON.stringify(publicData).includes('Birthday Customer'),false);
  const rider=h.post({action:'staff_custom_cakes',id_token:RIDER_TOKEN});assert.equal(rider.code,'forbidden');
  const manager=h.post({action:'staff_custom_cakes',id_token:ADMIN_TOKEN});
  assert.equal(manager.requests.length,1);assert.equal(manager.requests[0].customer_name,'Birthday Customer');
  assert.equal(h.post({action:'staff_custom_quote',id_token:ADMIN_TOKEN,request_id:draft.request_id,status:'quoted',quoted_price:2450}).updated,true);
  const status=h.post({action:'get_custom_cake_status',request_id:draft.request_id,customer_phone:draft.customer_phone});
  assert.equal(status.status,'quoted');assert.equal(status.quoted_price,2450);
  assert.equal(h.post({action:'get_custom_cake_status',request_id:draft.request_id,customer_phone:'01700000000'}).code,'not_found');
});
test('free custom cake requests are throttled per phone while saved retries stay possible',()=>{
  const h=harness();
  const draft={action:'create_custom_cake',customer_name:'Cake Buyer',customer_phone:'01700112233',
    cake_type:'Anniversary Cake',approx_size:'1kg',flavor:'Vanilla',color_theme:'',
    writing_text:'',instructions:'',reference_image_url:''};
  const id=(n:number)=>'cccccccc-2222-4222-8222-'+String(n).padStart(12,'0');
  for(let n=1;n<=3;n++)assert.equal(h.post({...draft,request_id:id(n)}).saved,true);
  assert.equal(h.post({...draft,request_id:id(4)}).code,'rate_limited');
  assert.equal(h.post({...draft,request_id:id(1)}).saved,true);
  assert.equal(h.records('custom_cake_requests').length,3);
});

test('checkout OTP remains server-only, receipt capability is stable and staff never sees it',()=>{
  const h=harness();const first=h.post(request());
  assert.equal(first.order.delivery_otp,'');
  assert.match(first.order.customer_access_token,/^[a-f0-9-]{72}$/);
  assert.equal(h.post(request()).order.customer_access_token,first.order.customer_access_token);
  const privateOrder=JSON.parse(String(h.records('orders')[0].receipt_json));
  assert.equal(privateOrder.delivery_otp,'');
  assert.equal(h.post({action:'staff_orders',id_token:ADMIN_TOKEN}).orders[0].customer_access_token,undefined);
  const unauthorized=h.post({action:'get_order_status',order_id:first.order.id,customer_phone:first.order.customer_phone});
  assert.equal(unauthorized.code,'forbidden');
  const valid=h.post({action:'get_order_status',order_id:first.order.id,customer_phone:first.order.customer_phone,customer_access_token:first.order.customer_access_token});
  assert.equal(valid.status,'pending');
  assert.equal(valid.delivery_otp,undefined);
});
test('public order ID and phone cannot hijack Google ownership or retrieve a new delivery OTP',()=>{
  const h=harness(),created=h.post(request());const o=created.order;
  const guess={action:'customer_claim_order',id_token:INTRUDER_TOKEN,order_id:o.id,customer_phone:o.customer_phone};
  assert.equal(h.post(guess).code,'forbidden');
  assert.equal(h.post({...guess,customer_access_token:'guessed-capability'}).code,'forbidden');
  assert.equal(h.post({...guess,id_token:ADMIN_TOKEN,customer_access_token:o.customer_access_token}).ok,true);
  assert.equal(h.post({...guess,customer_access_token:o.customer_access_token}).code,'already_linked');
  const status=h.post({action:'get_order_status',order_id:o.id,customer_phone:o.customer_phone,customer_access_token:'bad'});
  assert.equal(status.code,'forbidden');
});
test('kitchen/accountant private order views omit unnecessary customer contact and delivery secrets',()=>{
  const h=harness();h.post(request());
  h.context.PropertiesService={getScriptProperties:()=>({getProperty:(key:string)=>key==='AURORA_GOOGLE_CLIENT_ID'?'test-client.apps.googleusercontent.com':key==='AURORA_STAFF_USERS'?JSON.stringify({'owner@example.com':{role:'kitchen_manager'},'rider@example.com':{role:'accountant'}}):null})};
  const kitchen=h.post({action:'staff_orders',id_token:ADMIN_TOKEN});
  assert.equal(kitchen.orders.length,0); // Kitchen sees only confirmed orders.
  const finance=h.post({action:'staff_orders',id_token:RIDER_TOKEN});
  assert.equal(finance.orders.length,1);
  assert.equal(finance.orders[0].customer_phone,undefined);
  assert.equal(finance.orders[0].delivery_address,undefined);
  assert.equal(finance.orders[0].customer_access_token,undefined);
  assert.equal(finance.orders[0].items,undefined);
});

test('private checkout proof prevents someone replaying an exposed order number to steal its secret',()=>{
  const h=harness(),original=h.post(request());
  assert.equal(original.persisted,true);
  assert.equal(h.post(request({checkout_proof:undefined})).code,'idempotency_conflict');
  assert.equal(h.post(request({checkout_proof:'bbbbbbbb-2222-4222-8222-222222222222cccccccc-3333-4333-8333-333333333333'})).code,'idempotency_conflict');
  assert.equal(h.post(request({request_id:'dddddddd-4444-4444-8444-444444444444',checkout_proof:undefined})).code,'upgrade_required');
  assert.equal(h.post(request()).order.customer_access_token,original.order.customer_access_token);
  assert.equal(h.records('orders').length,1);
});

test('valid Google identity is briefly cached but changed staff allowlist is enforced on every request',()=>{
  const h=harness();let fetchCalls=0;
  h.context.UrlFetchApp={fetch:(_:string)=>{fetchCalls++;return {getResponseCode:()=>200,
    getContentText:()=>JSON.stringify({aud:'test-client.apps.googleusercontent.com',
      iss:'https://accounts.google.com',sub:'verified-google-user',
      exp:Math.floor(Date.now()/1000)+1800,email_verified:'true',email:'owner@example.com'})};}};
  assert.equal(h.post({action:'staff_session',id_token:ADMIN_TOKEN}).role,'super_admin');
  assert.equal(h.post({action:'staff_session',id_token:ADMIN_TOKEN}).role,'super_admin');
  assert.equal(h.post({action:'customer_session',id_token:ADMIN_TOKEN}).email,'owner@example.com');
  assert.equal(fetchCalls,1);
  h.context.PropertiesService={getScriptProperties:()=>({getProperty:(key:string)=>key==='AURORA_GOOGLE_CLIENT_ID'?'test-client.apps.googleusercontent.com':key==='AURORA_STAFF_USERS'?'{}':null})};
  assert.equal(h.post({action:'staff_session',id_token:ADMIN_TOKEN}).code,'forbidden');
  assert.equal(fetchCalls,1);
});
test('a delivery OTP is issued only at dispatch and destroyed after confirmed COD delivery',()=>{
  const h=harness(),created=h.post(request());
  const change=(operation:string,id_token:string,extra:Record<string,unknown>={})=>h.post({
    action:'staff_mutate',id_token,operation,order_id:created.order.id,...extra});
  const server=()=>JSON.parse(String(h.records('orders')[0].receipt_json));
  assert.equal(server().delivery_otp,'');
  for(const operation of ['confirm','start_baking','mark_ready'])assert.equal(change(operation,ADMIN_TOKEN).ok,true);
  assert.equal(change('assign',ADMIN_TOKEN,{rider_email:'rider@example.com'}).ok,true);
  assert.equal(change('pick_up',RIDER_TOKEN).ok,true);
  assert.equal(server().delivery_otp,'');
  assert.equal(change('start_delivery',RIDER_TOKEN).ok,true);
  const code=server().delivery_otp;
  assert.match(code,/^\d{4}$/);
  assert.equal(change('deliver',RIDER_TOKEN,{delivery_otp:code,cash_collected:true}).ok,true);
  assert.equal(server().delivery_otp,'');
  assert.equal(h.post({action:'get_order_status',order_id:created.order.id,customer_phone:created.order.customer_phone,
    customer_access_token:created.order.customer_access_token}).delivery_otp,undefined);
});

test('single Code.gs file runs full COD, staff role, customer account, live catalogue and custom quote workflows',()=>{
  const h=harness({singleFile:true});
  const result=h.post(request());
  assert.equal(result.persisted,true,JSON.stringify(result));
  assert.equal(result.order.delivery_otp,'');
  assert.match(result.order.customer_access_token,/^[a-f0-9-]{72}$/);
  assert.equal(h.post({action:'staff_session',id_token:ADMIN_TOKEN}).role,'super_admin');
  assert.equal(h.post({action:'staff_orders',id_token:RIDER_TOKEN}).orders.length,0);
  assert.equal(h.post({action:'staff_catalog',id_token:ADMIN_TOKEN}).ok,true);
  assert.equal(h.post({action:'customer_claim_order',id_token:ADMIN_TOKEN,
    order_id:result.order.id,customer_phone:result.order.customer_phone,
    customer_access_token:result.order.customer_access_token}).ok,true);
  assert.equal(h.post({action:'customer_orders',id_token:ADMIN_TOKEN}).orders.length,1);
  const draft={action:'create_custom_cake',request_id:'dddddddd-2222-4222-8222-444444444444',
    customer_name:'Customer',customer_phone:'01700112233',cake_type:'Wedding Cake',
    approx_size:'2 kg',flavor:'Vanilla',color_theme:'White',writing_text:'',
    instructions:'',reference_image_url:''};
  assert.equal(h.post(draft).saved,true);
  assert.equal(h.post({action:'staff_custom_cakes',id_token:ADMIN_TOKEN}).requests.length,1);
  const publicData=h.get('public');
  assert.equal(publicData.ok,true);
  assert.equal(JSON.stringify(publicData).includes('Customer'),false);
});
