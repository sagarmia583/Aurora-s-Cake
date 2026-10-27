import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash, randomUUID } from 'node:crypto';

type Row = unknown[];
const ORDER_HEADERS=['id','order_number','request_id','request_hash','created_at','updated_at','customer_name','customer_phone','delivery_address','delivery_zone_id','delivery_zone_name','delivery_fee','delivery_slot','delivery_date','status','subtotal','discount_amount','total_amount','coupon_code','order_note','payment_method','payment_status','receipt_json'];
const ITEM_HEADERS=['id','order_id','product_id','product_name','variant_id','variant_name','flavor_id','flavor_name','writing_message','unit_price','quantity','addons_json','subtotal'];
const CUSTOM_HEADERS=['id','request_id','request_hash','created_at','updated_at','customer_name','customer_phone','cake_type','approx_size','flavor','color_theme','writing_text','instructions','reference_image_url','status','estimated_price','quoted_price','receipt_json'];
const STAFF_HEADERS=['id','username','name','role','password_salt','password_hash','failed_attempts','locked_until','active','created_at','updated_at'];
const CUSTOMER_HEADERS=['id','phone','name','address','email','password_salt','password_hash','failed_attempts','locked_until','active','created_at','updated_at'];
const SESSION_HEADERS=['token_hash','account_type','account_id','created_at','expires_at','revoked'];
const MASTER_HEADERS=['id','phone_key','name','delivery_address','created_at','updated_at','order_count','last_order_id','last_order_at'];
const CONTACT_HEADERS=['id','phone_key','name','delivery_address','created_at','status'];
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
  if(!options.withoutPrivate){tables.orders=[ORDER_HEADERS];tables.order_items=[ITEM_HEADERS];tables.custom_cake_requests=[CUSTOM_HEADERS];tables.staff_accounts=[STAFF_HEADERS];tables.customer_accounts=[CUSTOMER_HEADERS];tables.auth_sessions=[SESSION_HEADERS];tables.customer_master=[MASTER_HEADERS];tables.customer_contact_requests=[CONTACT_HEADERS];}
  const reads:string[]=[];const writes:string[]=[];const rangeReads:{name:string,row:number,col:number,height:number,width:number}[]=[];
  const throttles=new Map<string,string>();
  let failNextItemWrite=false;let failAfterOrderWrite=false;let acquired=0;
  const sheet=(name:string):any=>({
    getLastRow:()=>tables[name].length,
    getLastColumn:()=>Math.max(0,...tables[name].map(row=>row.length)),
    getMaxRows:()=>1000,
    getRange:(row:number,col:number,height:number,width:number)=>{
      const range:any={
        getValues:()=>{rangeReads.push({name,row,col,height,width});return Array.from({length:height},(_,r)=>Array.from({length:width},(_,c)=>tables[name][row+r-1]?.[col+c-1]??''));},
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
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_algorithm:string,value:string)=>Array.from(createHash('sha256').update(value).digest()),formatDate:(date:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(date),getUuid:()=>randomUUID(),base64Decode:(str:string)=>Array.from(Buffer.from(str,'base64')).map(n=>n>127?n-256:n)},
    ContentService:{MimeType:{JSON:'json',JAVASCRIPT:'js'},createTextOutput:(content:string)=>({content,setMimeType(){return this;}})},
  };
  vm.createContext(context);
  if (options.singleFile) {
    vm.runInContext(fs.readFileSync(new URL('../apps-script/Code.AllInOne.gs',import.meta.url),'utf8'),context);
  } else {
  vm.runInContext(fs.readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8'),context);
  vm.runInContext(fs.readFileSync(new URL('../apps-script/StaffOperations.gs',import.meta.url),'utf8'),context);
  vm.runInContext(fs.readFileSync(new URL('../apps-script/AccountAuth.gs',import.meta.url),'utf8'),context);
  vm.runInContext(fs.readFileSync(new URL('../apps-script/CustomerMaster.gs',import.meta.url),'utf8'),context);
  vm.runInContext(fs.readFileSync(new URL('../apps-script/CustomerAccounts.gs',import.meta.url),'utf8'),context);
  vm.runInContext(fs.readFileSync(new URL('../apps-script/LiveCatalog.gs',import.meta.url),'utf8'),context);
  vm.runInContext(fs.readFileSync(new URL('../apps-script/CustomCakeRequests.gs',import.meta.url),'utf8'),context);
   vm.runInContext(fs.readFileSync(new URL('../apps-script/FinanceOperations.gs',import.meta.url),'utf8'),context);
  }
  const post=(payload:unknown)=>JSON.parse(context.doPost({postData:{type:'text/plain',contents:JSON.stringify(payload)}}).content);
  const get=(action:string)=>JSON.parse(context.doGet({parameter:{action}}).content);
  const records=(name:string)=>tables[name].slice(1).map(row=>Object.fromEntries(tables[name][0].map((key,index)=>[String(key),row[index]])));
  const change=(name:string,key:string,value:unknown)=>{const col=tables[name][0].indexOf(key);tables[name][1][col]=value;};
  return {tables,reads,writes,rangeReads,context,post,get,records,change,failItems:()=>{failNextItemWrite=true;},failOrderAck:()=>{failAfterOrderWrite=true;},lockCount:()=>acquired};
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
  assert.equal(update('deliver',RIDER_TOKEN,{package_handed_over:true,cash_collected:false}).code,'cash_unconfirmed');
  assert.equal(update('deliver',RIDER_TOKEN,{package_handed_over:true,cash_collected:true}).ok,true);
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
test('delivery handover confirmation and order transition checks are persisted server-side',()=>{
  const h=harness(),created=h.post(request());
  const orderId=created.order.id;
  const update=(operation:string,id_token:string,extra:Record<string,unknown>={})=>h.post({action:'staff_mutate',id_token,operation,order_id:orderId,...extra});
  assert.equal(update('assign',ADMIN_TOKEN,{rider_email:'rider@example.com'}).code,'invalid_transition');
  assert.equal(update('pick_up',RIDER_TOKEN).code,'invalid_transition');
  for(const operation of ['confirm','start_baking','mark_ready']) assert.equal(update(operation,ADMIN_TOKEN).ok,true);
  assert.equal(update('assign',ADMIN_TOKEN,{rider_email:'rider@example.com'}).ok,true);
  assert.equal(update('pick_up',RIDER_TOKEN).ok,true);
  assert.equal(update('start_delivery',RIDER_TOKEN).ok,true);
  assert.equal(update('deliver',RIDER_TOKEN,{cash_collected:true}).code,'handover_unconfirmed');
  assert.equal(update('deliver',RIDER_TOKEN,{package_handed_over:true,cash_collected:false}).code,'cash_unconfirmed');
  assert.equal(update('deliver',RIDER_TOKEN,{package_handed_over:true,cash_collected:true}).ok,true);
  assert.equal(h.post({action:'get_order_status',order_id:orderId,customer_phone:request().customer_phone,customer_access_token:created.order.customer_access_token}).status,'delivered');
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
  assert.equal(orders[0].delivery_otp,'');
  assert.equal(orders[0].status,'out_for_delivery');
});

test('linked customer sees live delivery stage without an OTP',()=>{
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
  assert.equal(status(ADMIN_TOKEN).delivery_otp,undefined);
  assert.equal(status(ADMIN_TOKEN).status,'out_for_delivery');
  assert.equal(h.post({action:'get_order_status',order_id:order.id,customer_phone:order.customer_phone,customer_access_token:order.customer_access_token}).delivery_otp,undefined);
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
test('no delivery OTP is issued; assigned rider completes COD with handover and cash confirmation',()=>{
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
  assert.equal(server().delivery_otp,'');
  assert.equal(change('deliver',RIDER_TOKEN,{package_handed_over:true,cash_collected:true}).ok,true);
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

test('single-file owner setup grants editor account admin access without a client secret',()=>{
  const h=harness({singleFile:true});
  const properties=new Map<string,string>();
  h.context.Session={getEffectiveUser:()=>({getEmail:()=> 'owner@example.com'})};
  h.context.PropertiesService={getScriptProperties:()=>({
    getProperty:(key:string)=>properties.get(key)||null,
    setProperty:(key:string,value:string)=>{properties.set(key,value);},
  })};
  const response=h.context.setupAuroraOwnerOnce();
  assert.equal(response.configured,true);
  assert.equal(response.owner_email,'owner@example.com');
  assert.equal(JSON.parse(properties.get('AURORA_STAFF_USERS')||'{}')['owner@example.com'].role,'super_admin');
  assert.match(properties.get('AURORA_GOOGLE_CLIENT_ID')||'',/\.apps\.googleusercontent\.com$/);
  assert.throws(()=>h.context.setupAuroraOwnerOnce(),/already exists/);
  assert.equal(h.post({action:'setupAuroraOwnerOnce'}).code,'invalid_action');
});

test('only authenticated super admin sees a private read-only directory of configured staff profiles',()=>{
  const h=harness({singleFile:true});
  const owner=h.post({action:'staff_session',id_token:ADMIN_TOKEN});
  assert.equal(owner.role,'super_admin');
  assert.deepEqual([...owner.staff_profiles].map((item:{email:string})=>item.email).sort(),['owner@example.com','rider@example.com']);
  assert.equal(owner.staff_profiles[0].role,'super_admin');
  const rider=h.post({action:'staff_session',id_token:RIDER_TOKEN});
  assert.equal(rider.role,'delivery_man');
  assert.equal('staff_profiles' in rider,false);
  assert.equal(h.post({action:'staff_session',id_token:INTRUDER_TOKEN}).code,'forbidden');
  assert.equal(h.get('public').staff_profiles,undefined);
});

test('phone signup persists profile in Sheets, prevents phone-only order access, and safely links original receipt',()=>{
  const h=harness({singleFile:true});
  const account=h.post({action:'customer_phone_signup',name:'Cake Customer',phone:'01700112233',password:'SecureCakePass2026!'});
  assert.equal(account.ok,true,JSON.stringify(account));
  assert.equal(account.profile.phone,'01700112233');
  assert.equal(account.profile.phone_verified,false);
  assert.equal('password_hash' in account,false);
  assert.equal(h.records('customer_accounts').length,1);
  assert.equal(h.records('auth_sessions').length,1);
  assert.equal(h.post({action:'customer_phone_orders',phone:'01700112233'}).code,'unauthorized');
  assert.equal(h.post({action:'customer_phone_signup',name:'Other',phone:'01700112233',password:'Password2026!'}).code,'duplicate_account');

  const order=h.post(request()).order;
  assert.equal(h.post({action:'customer_phone_orders',auth_token:account.auth_token}).orders.length,0);
  assert.equal(h.post({action:'customer_phone_claim',auth_token:account.auth_token,order_id:order.id,customer_access_token:'wrong'}).code,'forbidden');
  assert.equal(h.post({action:'customer_phone_claim',auth_token:account.auth_token,order_id:order.id,customer_access_token:order.customer_access_token}).ok,true);
  const recovered=h.post({action:'customer_phone_orders',auth_token:account.auth_token}).orders;
  assert.equal(recovered.length,1);
  assert.equal(recovered[0].id,order.id);
  const profile=h.post({action:'customer_phone_profile',auth_token:account.auth_token,name:'New Name',email:'new@example.com',address:'Tangail'});
  assert.equal(profile.profile.name,'New Name');
  assert.equal(h.records('customer_accounts')[0].address,'Tangail');
  const next=h.post({action:'customer_phone_login',phone:'01700112233',password:'SecureCakePass2026!'});
  assert.equal(next.ok,true);
  assert.equal(next.profile.name,'New Name');
  assert.equal(h.post({action:'customer_phone_orders',auth_token:next.auth_token}).orders.length,1);
  assert.equal(h.post({action:'customer_phone_logout',auth_token:account.auth_token}).ok,true);
  assert.equal(h.post({action:'customer_phone_orders',auth_token:account.auth_token}).code,'unauthorized');
});
test('verified super admin creates username/password rider; only the assigned rider can deliver',()=>{
  const h=harness({singleFile:true});
  const details={action:'staff_account_create',id_token:ADMIN_TOKEN,username:'rider02',name:'Rider Two',
    password:'RiderSecurePass2026!',role:'delivery_man'};
  assert.equal(h.post(details).created,true);
  assert.equal(h.post(details).code,'duplicate_account');
  assert.equal(h.post({...details,id_token:INTRUDER_TOKEN,username:'rider03'}).code,'forbidden');
  const signed=h.post({action:'staff_password_login',username:'rider02',password:'RiderSecurePass2026!'});
  assert.equal(signed.role,'delivery_man',JSON.stringify(signed));
  const session=h.post({action:'staff_session',auth_token:signed.auth_token});
  assert.equal(session.role,'delivery_man');
  assert.equal('staff_profiles' in session,false);
  const owner=h.post({action:'staff_session',id_token:ADMIN_TOKEN});
  assert.ok(owner.staff_profiles.some((p:{username?:string})=>p.username==='rider02'));
  assert.ok(owner.riders.some((p:{email:string})=>p.email==='rider02'));
  const first=h.post(request()).order;
  const change=(operation:string,auth_token:string,more:Record<string,unknown>={})=>
    h.post({action:'staff_mutate',auth_token,order_id:first.id,operation,...more});
  assert.equal(change('pick_up',signed.auth_token).code,'invalid_transition');
  const adminChange=(operation:string,more:Record<string,unknown>={})=>
    h.post({action:'staff_mutate',id_token:ADMIN_TOKEN,order_id:first.id,operation,...more});
  for(const op of ['confirm','start_baking','mark_ready'])assert.equal(adminChange(op).ok,true);
  assert.equal(adminChange('assign',{rider_email:'rider02'}).ok,true);
  assert.equal(change('pick_up',signed.auth_token).ok,true);
  assert.equal(change('start_delivery',signed.auth_token).ok,true);
  assert.equal(change('deliver',signed.auth_token,{cash_collected:true}).code,'handover_unconfirmed');
  assert.equal(change('deliver',signed.auth_token,{package_handed_over:true,cash_collected:true}).ok,true);
  assert.equal(h.post({action:'staff_password_logout',auth_token:signed.auth_token}).ok,true);
  assert.equal(h.post({action:'staff_orders',auth_token:signed.auth_token}).code,'unauthorized');
});

test('staff password reset and disable revoke sessions without leaking password hashes',()=>{
  const h=harness({singleFile:true});
  const create={action:'staff_account_create',id_token:ADMIN_TOKEN,username:'kitchen02',name:'Cake Chef',role:'kitchen_manager',password:'KitchenSecretPass20!'};
  assert.equal(h.post(create).created,true);
  assert.equal(h.records('staff_accounts').length,1);
  const saved=h.records('staff_accounts')[0];
  assert.equal(saved.password_hash===create.password,false);
  assert.equal(String(saved.password_hash).length,64);
  assert.equal(String(saved.password_salt).length,72);
  const bad=h.post({action:'staff_password_login',username:'kitchen02',password:'WrongPassword999'});
  assert.equal(bad.code,'invalid_credentials');
  const initial=h.post({action:'staff_password_login',username:'kitchen02',password:create.password});
  assert.equal(initial.role,'kitchen_manager');
  assert.equal(h.post({action:'staff_session',auth_token:initial.auth_token}).role,'kitchen_manager');
  assert.equal(h.post({action:'staff_account_create',auth_token:initial.auth_token,username:'rogue_staff',name:'Rogue',role:'admin',password:'SomePassword123!'}).code,'forbidden');
  assert.equal(h.post({action:'staff_account_reset_password',id_token:ADMIN_TOKEN,username:'kitchen02',password:'NewKitchenStrongPass20!'}).updated,true);
  assert.equal(h.post({action:'staff_session',auth_token:initial.auth_token}).code,'unauthorized');
  assert.equal(h.post({action:'staff_password_login',username:'kitchen02',password:create.password}).code,'invalid_credentials');
  const refreshed=h.post({action:'staff_password_login',username:'kitchen02',password:'NewKitchenStrongPass20!'});
  assert.equal(refreshed.ok,true);
  assert.equal(h.post({action:'staff_account_set_active',id_token:ADMIN_TOKEN,username:'kitchen02',active:false}).updated,true);
  assert.equal(h.post({action:'staff_session',auth_token:refreshed.auth_token}).code,'unauthorized');
  assert.equal(h.post({action:'staff_password_login',username:'kitchen02',password:'NewKitchenStrongPass20!'}).code,'invalid_credentials');
  const dir=h.post({action:'staff_session',id_token:ADMIN_TOKEN});
  assert.equal(dir.staff_profiles.find((x:{username?:string})=>x.username==='kitchen02').active,false);
  assert.equal(h.post({action:'staff_account_set_active',id_token:ADMIN_TOKEN,username:'kitchen02',active:true}).updated,true);
  assert.equal(h.post({action:'staff_password_login',username:'kitchen02',password:'NewKitchenStrongPass20!'}).ok,true);
});


test('website CMS manages FAQ rows in private Sheets with create/edit/archive and strict role checks',()=>{
  const h=harness({singleFile:true});
  h.tables.faqs=[['id','question','answer','sort_order','is_active']];
  assert.equal(h.post({action:'staff_cms_list',id_token:RIDER_TOKEN,table:'faqs'}).code,'forbidden');
  assert.equal(h.post({action:'staff_cms_list',id_token:INTRUDER_TOKEN,table:'faqs'}).code,'forbidden');
  assert.equal(h.post({action:'staff_cms_list',id_token:ADMIN_TOKEN,table:'orders'}).code,'forbidden');
  const bad=h.post({action:'staff_cms_create',id_token:ADMIN_TOKEN,table:'faqs',values:{question:'Q',answer:'A',is_active:true,unknown_field:'unsafe'}});
  assert.equal(bad.code,'invalid_field');
  const created=h.post({action:'staff_cms_create',id_token:ADMIN_TOKEN,table:'faqs',values:{question:'Do you deliver?',answer:'Yes, in Tangail.',sort_order:1,is_active:true}});
  assert.equal(created.operation,'created',JSON.stringify(created));
  assert.equal(h.records('faqs').length,1);
  const id=String(h.records('faqs')[0].id);
  assert.ok(id.startsWith('cms_'));
  const snap=h.post({action:'staff_cms_list',id_token:ADMIN_TOKEN,table:'faqs'});
  assert.equal(snap.rows[0].question,'Do you deliver?');
  assert.equal(snap.can_delete,true);
  assert.equal(h.post({action:'staff_cms_update',id_token:ADMIN_TOKEN,table:'faqs',record_id:id,values:{answer:'Free delivery may be available.'}}).operation,'updated');
  assert.equal(h.records('faqs')[0].answer,'Free delivery may be available.');
  assert.equal(h.post({action:'staff_cms_delete',id_token:RIDER_TOKEN,table:'faqs',record_id:id,values:{}}).code,'forbidden');
  assert.equal(h.post({action:'staff_cms_delete',id_token:ADMIN_TOKEN,table:'faqs',record_id:id,values:{}}).operation,'archived');
  assert.equal(h.records('faqs')[0].is_active,false);
  assert.equal(h.records('faqs').length,1);
  assert.equal(h.records('orders').length,0);
});
test('website CMS safely edits approved shop settings and refuses private tables and formulas',()=>{
  const h=harness({singleFile:true});
  assert.equal(h.post({action:'staff_cms_update',id_token:ADMIN_TOKEN,table:'settings',record_id:'shop_name',values:{value:'Aurora Cake House'}}).operation,'updated');
  const rows=h.records('settings');
  assert.equal(rows[0].value,'Aurora Cake House');
  assert.equal(h.post({action:'staff_cms_update',id_token:ADMIN_TOKEN,table:'settings',record_id:'secret_key',values:{value:'x'}}).code,'forbidden');
  assert.equal(h.post({action:'staff_cms_delete',id_token:ADMIN_TOKEN,table:'settings',record_id:'shop_name',values:{}}).code,'protected');
  assert.equal(h.post({action:'staff_cms_list',id_token:ADMIN_TOKEN,table:'customer_accounts'}).code,'forbidden');
  assert.equal(h.post({action:'staff_cms_list',id_token:ADMIN_TOKEN,table:'auth_sessions'}).code,'forbidden');
  assert.equal(h.post({action:'staff_cms_list',id_token:ADMIN_TOKEN,table:'orders'}).code,'forbidden');
  h.tables.faqs=[['id','question','answer','sort_order','is_active']];
  const saved=h.post({action:'staff_cms_create',id_token:ADMIN_TOKEN,table:'faqs',values:{
    question:'Can you customize cakes?',answer:'=IMPORTXML("https://bad.example","//")',sort_order:0,is_active:true,
  }});
  assert.equal(saved.operation,'created');
  assert.ok(String(h.records('faqs')[0].answer).startsWith("'="));
});


test('live website manager validates category/product references, archives safely and preserves historical COD orders',()=>{
  const h=harness({singleFile:true});
  const first=h.post(request());
  assert.equal(first.success,true);
  const originalReceipt=JSON.parse(String(h.records('orders')[0].receipt_json));
  const productCols=h.context.PUBLIC_TABLE_SCHEMAS.products as string[];
  const categoryCols=h.context.PUBLIC_TABLE_SCHEMAS.categories as string[];
  const variants=h.context.PUBLIC_TABLE_SCHEMAS.product_variants as string[];
  const existing:Record<string,unknown>={id:'p1',name:'Original cake',category_id:'c1',slug:'original-cake',base_price:800,sale_price:'',
    description:'Original',is_active:true,is_featured:true,price:800};
  h.tables.products=[productCols,productCols.map(k=>existing[k]??'')];
  h.tables.categories=[categoryCols,categoryCols.map(k=>({id:'c1',name:'Existing category',slug:'existing-category',sort_order:1,is_active:true} as Record<string,unknown>)[k]??'')];
  h.tables.product_variants=[variants,variants.map(k=>({id:'v1',product_id:'p1',name:'1kg',weight_grams:1000,price:800,is_active:true} as Record<string,unknown>)[k]??'')];
  const noCategory=h.post({action:'staff_cms_create',id_token:ADMIN_TOKEN,table:'products',
    values:{name:'Unknown cake',category_id:'fake-category',slug:'unknown-cake',base_price:1200,is_active:true}});
  assert.equal(noCategory.code,'invalid_reference');
  const category=h.post({action:'staff_cms_create',id_token:ADMIN_TOKEN,table:'categories',
    values:{name:'New Celebration Cakes',slug:'new-celebration-cakes',sort_order:5,is_active:true}});
  assert.equal(category.operation,'created');
  const createdCategory=h.records('categories').at(-1)!;
  const product=h.post({action:'staff_cms_create',id_token:ADMIN_TOKEN,table:'products',
    values:{name:'New Sheet Cake',category_id:String(createdCategory.id),slug:'new-sheet-cake',description:'Freshly baked',
      base_price:750,is_active:true,allowed_flavor_ids:'[]',allowed_addon_ids:'[]',gallery_images:'[]'}});
  assert.equal(product.operation,'created',JSON.stringify(product));
  const newProduct=h.records('products').at(-1)!;
  assert.equal(newProduct.name,'New Sheet Cake');
  const failedCategoryArchive=h.post({action:'staff_cms_delete',id_token:ADMIN_TOKEN,table:'categories',
    record_id:String(createdCategory.id),values:{}});
  assert.equal(failedCategoryArchive.code,'in_use');
  assert.equal(h.post({action:'staff_cms_delete',id_token:ADMIN_TOKEN,table:'products',
    record_id:String(newProduct.id),values:{}}).operation,'archived');
  assert.equal(h.post({action:'staff_cms_delete',id_token:ADMIN_TOKEN,table:'categories',
    record_id:String(createdCategory.id),values:{}}).operation,'archived');
  assert.equal(h.records('orders').length,1);
  assert.equal(h.records('order_items').length,1);
  assert.equal(JSON.parse(String(h.records('orders')[0].receipt_json)).total_amount,originalReceipt.total_amount);
  assert.equal(h.post({action:'staff_cms_list',id_token:ADMIN_TOKEN,table:'staff_accounts'}).code,'forbidden');
});


test('customer password can be changed and phone account closed while preserving the COD ledger',()=>{
 const h=harness({singleFile:true});
 const registered=h.post({action:'customer_phone_signup',name:'Safety Customer',phone:'01700112244',password:'OriginalCustomerPass20!'});
 assert.equal(registered.ok,true);
 const original=h.post(request()).order;
 assert.equal(h.post({action:'customer_phone_claim',auth_token:registered.auth_token,order_id:original.id,customer_access_token:original.customer_access_token}).ok,true);
 assert.equal(h.post({action:'customer_phone_password',auth_token:registered.auth_token,current_password:'wrong-password',new_password:'NewCustomerPass20!'}).code,'invalid_credentials');
 const changed=h.post({action:'customer_phone_password',auth_token:registered.auth_token,current_password:'OriginalCustomerPass20!',new_password:'NewCustomerPass20!'});
 assert.equal(changed.ok,true,JSON.stringify(changed));
 assert.notEqual(changed.auth_token,registered.auth_token);
 assert.equal(h.post({action:'customer_phone_session',auth_token:registered.auth_token}).code,'unauthorized');
 assert.equal(h.post({action:'customer_phone_login',phone:'01700112244',password:'OriginalCustomerPass20!'}).code,'invalid_credentials');
 assert.equal(h.post({action:'customer_phone_orders',auth_token:changed.auth_token}).orders.length,1);
 assert.equal(h.post({action:'customer_phone_close',auth_token:changed.auth_token,current_password:'NewCustomerPass20!'}).closed,true);
 assert.equal(h.post({action:'customer_phone_session',auth_token:changed.auth_token}).code,'unauthorized');
 assert.equal(h.post({action:'customer_phone_login',phone:'01700112244',password:'NewCustomerPass20!'}).code,'invalid_credentials');
 assert.equal(h.records('orders').length,1);
 assert.equal(h.records('order_items').length,1);
 assert.equal(h.records('customer_accounts')[0].address,'');
 assert.equal(h.records('customer_accounts')[0].active,false);
});
test('photo storage actions are rejected for untrusted visitors and image signatures are validated',()=>{
 const h=harness({singleFile:true});
 assert.equal(h.post({action:'staff_image_upload',id_token:INTRUDER_TOKEN,base64:'AAAA'}).code,'forbidden');
 assert.equal(h.post({action:'staff_image_upload',id_token:RIDER_TOKEN,base64:'AAAA'}).code,'forbidden');
 assert.equal(h.post({action:'staff_image_upload',id_token:ADMIN_TOKEN,base64:'AAAA'}).code,'invalid_image');
 assert.equal(h.post({action:'staff_image_upload',id_token:ADMIN_TOKEN,base64:'YXNkZmdoaWo=',mime_type:'image/jpeg'}).code,'invalid_image');
 assert.equal(h.get('public_image').ok,false);
 const context=h.context;
 assert.equal(context.auroraImageMime_([255,216,255,0,1]),'image/jpeg');
 assert.equal(context.auroraImageMime_([137,80,78,71,13,10,26,10,0]),'image/png');
 assert.throws(()=>context.auroraImageMime_([65,65,65,65]));
});


test('authenticated Admin uploads a picture to a dedicated private folder, and public GET serves only that folder',()=>{
 const h=harness({singleFile:true}),properties=new Map<string,string>(),files=new Map<string,any>();
 const originalProps=h.context.PropertiesService;
 h.context.PropertiesService={getScriptProperties:()=>({
   getProperty:(key:string)=>properties.get(key)??originalProps.getScriptProperties().getProperty(key),
   setProperty:(key:string,value:string)=>{properties.set(key,value);}
 })};
 const folderId='dedicated_aurora_folder_123456';
 const folder={
   getId:()=>folderId,isTrashed:()=>false,
   createFile:(blob:any)=>{
     const id='bakery_public_img_123456789abcdef';
     const file={
       getId:()=>id,isTrashed:()=>false,getMimeType:()=>blob.mime,
       getSize:()=>blob.bytes.length,getBlob:()=>({getBytes:()=>blob.bytes}),
       getParents:()=>{let seen=false;return {hasNext:()=>!seen,next:()=>{seen=true;return folder;}}}
     };
     files.set(id,file);
     return file;
   }
 };
 h.context.DriveApp={
   createFolder:()=>folder,getFolderById:(id:string)=>id===folderId?folder:undefined,
   getFileById:(id:string)=>{
     const match=files.get(id);
     if(!match)throw new Error('Google Drive file does not exist');
     return match;
   }
 };
 h.context.Utilities.newBlob=(bytes:number[],mime:string,name:string)=>({bytes,mime,name});
 h.context.Utilities.base64Encode=(bytes:number[])=>Buffer.from(bytes).toString('base64');
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5pvlkAAAAASUVORK5CYII=','base64');
 const upload=h.post({action:'staff_image_upload',id_token:ADMIN_TOKEN,base64:png.toString('base64'),mime_type:'image/png'});
 assert.equal(upload.ok,true,JSON.stringify(upload));
 assert.equal(upload.mime_type,'image/png');
 assert.match(upload.url,/^\/api\/image\?id=bakery_public_img_/);
 assert.equal(properties.get('AURORA_PUBLIC_IMAGE_FOLDER_ID'),folderId);
 const fileId=upload.url.slice('/api/image?id='.length);
 const response=JSON.parse(h.context.doGet({parameter:{action:'public_image',id:fileId}}).content);
 assert.equal(response.ok,true);
 assert.equal(response.base64,png.toString('base64'));
 assert.equal(response.mime_type,'image/png');
 const outside=JSON.parse(h.context.doGet({parameter:{action:'public_image',id:'not_from_aurora_folder_123'}}).content);
 assert.equal(outside.ok,false);
 assert.equal(h.post({action:'staff_image_upload',id_token:RIDER_TOKEN,base64:png.toString('base64'),mime_type:'image/png'}).code,'forbidden');
});


test('fast customer status reads only id/header/receipt columns, not the whole private Orders Sheet',()=>{
  const h=harness({singleFile:true});
  const placed=h.post(request()).order;
  h.rangeReads.length=0;
  const status=h.post({action:'get_order_status',order_id:placed.id,customer_phone:placed.customer_phone,
    customer_access_token:placed.customer_access_token});
  assert.equal(status.ok,true,JSON.stringify(status));
  assert.equal(status.status,'pending');
  const touched=h.rangeReads.filter(item=>item.name==='orders');
  assert.ok(touched.length>=3);
  assert.ok(touched.some(item=>item.row===1&&item.height===1));
  assert.equal(touched.filter(item=>item.height>1).every(item=>item.width===1),true,
    'Status polling should not read entire multi-column order sheets');
});
test('phone account linked to receipt sees dispatch status but not an OTP; an unlinked customer is denied',()=>{
  const h=harness({singleFile:true});
  const first=h.post(request()).order;
  const owner=h.post({action:'customer_phone_signup',name:'Recipient',phone:'01700112283',password:'TestSecretPassOne2026!'});
  const other=h.post({action:'customer_phone_signup',name:'Other',phone:'01700112284',password:'TestSecretPassTwo2026!'});
  const status=(auth_token:string)=>h.post({action:'get_order_status',order_id:first.id,
    customer_phone:first.customer_phone,auth_token});
  assert.equal(status(other.auth_token).code,'forbidden');
  assert.equal(h.post({action:'customer_phone_claim',auth_token:owner.auth_token,order_id:first.id,
    customer_access_token:first.customer_access_token}).ok,true);
  assert.equal(status(owner.auth_token).delivery_otp,undefined);
  const transition=(operation:string,token:string,more:Record<string,unknown>={})=>
    h.post({action:'staff_mutate',id_token:token,operation,order_id:first.id,...more});
  for(const step of ['confirm','start_baking','mark_ready'])assert.equal(transition(step,ADMIN_TOKEN).ok,true);
  assert.equal(transition('assign',ADMIN_TOKEN,{rider_email:'rider@example.com'}).ok,true);
  assert.equal(transition('pick_up',RIDER_TOKEN).ok,true);
  assert.equal(transition('start_delivery',RIDER_TOKEN).ok,true);
  assert.equal(JSON.parse(String(h.records('orders')[0].receipt_json)).delivery_otp,'');
  assert.equal(status(owner.auth_token).delivery_otp,undefined);
  assert.equal(status(other.auth_token).code,'forbidden');
  assert.equal(transition('deliver',RIDER_TOKEN,{package_handed_over:true,cash_collected:true}).ok,true);
  assert.equal(status(owner.auth_token).delivery_otp,undefined);
  assert.equal(status(owner.auth_token).status,'delivered');
});


test('customer phone account history only scans receipt JSON rather than the wide Orders Sheet',()=>{
  const h=harness({singleFile:true});
  const original=h.post(request()).order;
  const acct=h.post({action:'customer_phone_signup',name:'Faster Bakery Login',phone:'01700112278',password:'VerySafeHistoryPass2026!'});
  assert.equal(h.post({action:'customer_phone_claim',auth_token:acct.auth_token,order_id:original.id,
    customer_access_token:original.customer_access_token}).ok,true);
  h.rangeReads.length=0;
  const history=h.post({action:'customer_phone_orders',auth_token:acct.auth_token});
  assert.equal(history.orders.length,1);
  assert.equal(history.orders[0].id,original.id);
  const orderDataReads=h.rangeReads.filter(r=>r.name==='orders'&&r.row>1);
  assert.ok(orderDataReads.length>0);
  assert.ok(orderDataReads.every(r=>r.width===1),'Account refresh must read receipt JSON only');
});

test('legacy private receipt recovery remains owner-verified while delivery needs no OTP',()=>{
  const h=harness({singleFile:true}),order=h.post(request()).order;
  const staff=(action:string,id_token:string,other:Record<string,unknown>={})=>
    h.post({action:'staff_mutate',id_token,operation:action,order_id:order.id,...other});
  for(const action of ['confirm','start_baking','mark_ready'])assert.equal(staff(action,ADMIN_TOKEN).ok,true);
  assert.equal(staff('assign',ADMIN_TOKEN,{rider_email:'rider@example.com'}).ok,true);
  assert.equal(staff('pick_up',RIDER_TOKEN).ok,true);
  assert.equal(staff('start_delivery',RIDER_TOKEN).ok,true);
  const original=JSON.parse(String(h.records('orders')[0].receipt_json));
  assert.equal(original.delivery_otp,'');
  // Simulate an authentic order from the original, pre-capability checkout.
  delete original.customer_access_token;
  h.tables.orders[1][ORDER_HEADERS.indexOf('receipt_json')]=JSON.stringify(original);
  const customer={action:'get_order_status',order_id:order.id,customer_phone:order.customer_phone};
  assert.equal(h.post(customer).delivery_otp,undefined);
  assert.equal(h.post({action:'staff_session',id_token:RIDER_TOKEN}).staff_profiles,undefined);
  const orderList=h.post({action:'staff_orders',id_token:ADMIN_TOKEN}).orders;
  assert.equal(orderList[0].legacy_receipt_missing,true);
  assert.equal(h.post({action:'staff_orders',id_token:RIDER_TOKEN}).orders[0].legacy_receipt_missing,undefined);
  const cmd={action:'staff_legacy_receipt',order_id:order.id,manually_verified:true};
  assert.equal(h.post({...cmd,id_token:RIDER_TOKEN}).code,'forbidden');
  assert.equal(h.post({...cmd,id_token:INTRUDER_TOKEN}).code,'forbidden');
  assert.equal(h.post({...cmd,id_token:ADMIN_TOKEN,manually_verified:false}).code,'verification_required');
  const issued=h.post({...cmd,id_token:ADMIN_TOKEN});
  assert.equal(issued.ok,true,JSON.stringify(issued));
  assert.match(issued.customer_access_token,/^[a-f0-9-]{72}$/i);
  assert.equal(issued.delivery_otp,undefined);
  assert.equal(h.post({...cmd,id_token:ADMIN_TOKEN}).code,'already_secured');
  assert.equal(h.post({...customer,customer_access_token:'wrong'}).code,'forbidden');
  assert.equal(h.post({...customer,customer_access_token:issued.customer_access_token}).delivery_otp,undefined);
  assert.equal(h.records('orders').length,1);
  assert.equal(h.records('order_items').length,1);
});
test('private order lookup uses native exact-cell TextFinder when supported',()=>{
  const h=harness({singleFile:true});
  let textFinderUsed=false;
  const fakeSheet={
    getLastRow:()=>8000,
    getRange:(_r:number,_c:number,_n:number,_w:number)=>({
      createTextFinder:(value:string)=>{
        assert.equal(value,'ord_test');
        textFinderUsed=true;
        return {matchEntireCell:(v:boolean)=>{assert.equal(v,true);return {findNext:()=>({getRow:()=>340})}}};
      },
      getValues:()=>{throw new Error('Should not read 8,000 IDs into Apps Script');}
    })
  };
  assert.equal(h.context.auroraPrivateFindRow_({sheet:fakeSheet,headers:['id']},'ord_test'),340);
  assert.equal(textFinderUsed,true);
});


test('full COD acceptance: guest checkout, verified owner, password kitchen, assigned rider, handover and paid delivery',()=>{
  const h=harness({singleFile:true});
  const signedUp=h.post({action:'customer_phone_signup',name:'Test Customer',phone:'01700000000',password:'StrongPrivateCustomerPass!'});
  assert.equal(signedUp.ok,true,JSON.stringify(signedUp));
  const orderResponse=h.post(request());
  assert.equal(orderResponse.persisted,true,JSON.stringify(orderResponse));
  const receipt=orderResponse.order;
  assert.equal(receipt.status,'pending');
  assert.equal(receipt.payment_status,'pending');
  assert.equal(receipt.delivery_otp,'');
  assert.equal(h.records('orders').length,1);
  assert.equal(h.records('order_items').length,1);

  const getCustomer=(token:string=signedUp.auth_token)=>h.post({action:'get_order_status',
    order_id:receipt.id,customer_phone:receipt.customer_phone,auth_token:token});
  assert.equal(h.post({action:'customer_phone_claim',auth_token:signedUp.auth_token,order_id:receipt.id,
    customer_access_token:receipt.customer_access_token}).linked,true);
  assert.equal(getCustomer().status,'pending');
  assert.equal(Object.hasOwn(getCustomer(),'delivery_otp'),false);
  assert.equal(h.post({action:'get_order_status',order_id:receipt.id,customer_phone:receipt.customer_phone}).code,'forbidden');
  assert.equal(h.post({action:'get_order_status',order_id:receipt.id,customer_phone:receipt.customer_phone,
    customer_access_token:'not-a-key'}).code,'forbidden');

  assert.equal(h.post({action:'staff_account_create',id_token:ADMIN_TOKEN,username:'kitchen_worker',name:'Test Chef',
    password:'SafeKitchenPassword2026!',role:'kitchen_manager'}).created,true);
  const chefLogin=h.post({action:'staff_password_login',username:'kitchen_worker',password:'SafeKitchenPassword2026!'});
  assert.equal(chefLogin.role,'kitchen_manager',JSON.stringify(chefLogin));
  const employee=(operation:string, extra:Record<string,unknown>={})=>
    h.post({action:'staff_mutate',auth_token:chefLogin.auth_token,order_id:receipt.id,operation,...extra});
  const owner=(operation:string,extra:Record<string,unknown>={})=>
    h.post({action:'staff_mutate',id_token:ADMIN_TOKEN,order_id:receipt.id,operation,...extra});
  const rider=(operation:string,extra:Record<string,unknown>={})=>
    h.post({action:'staff_mutate',id_token:RIDER_TOKEN,order_id:receipt.id,operation,...extra});

  assert.equal(employee('confirm').code,'forbidden');
  assert.equal(owner('confirm').order.status,'confirmed');
  assert.equal(employee('start_baking').order.status,'preparing');
  assert.equal(employee('mark_ready').order.status,'ready');
  assert.equal(rider('pick_up').code,'invalid_transition');
  assert.equal(owner('assign',{rider_email:'rider@example.com'}).order.status,'assigned');
  assert.equal(rider('pick_up').order.status,'picked_up');
  assert.equal(getCustomer().status,'picked_up');
  assert.equal(Object.hasOwn(getCustomer(),'delivery_otp'),false);
  const dispatched=rider('start_delivery');
  assert.equal(dispatched.order.status,'out_for_delivery');
  assert.equal(Object.hasOwn(dispatched.order,'delivery_otp'),false);
  assert.equal(Object.hasOwn(dispatched.order,'customer_access_token'),false);
  const customerAtDispatch=getCustomer();
  assert.equal(customerAtDispatch.status,'out_for_delivery');
  assert.equal(customerAtDispatch.delivery_otp,undefined);
  assert.equal(h.post({action:'staff_orders',id_token:RIDER_TOKEN}).orders[0].delivery_otp,undefined);
  assert.equal(owner('deliver',{package_handed_over:true,cash_collected:true}).code,'forbidden');
  assert.equal(rider('deliver',{cash_collected:true}).code,'handover_unconfirmed');
  assert.equal(rider('deliver',{package_handed_over:true,cash_collected:false}).code,'cash_unconfirmed');
  assert.equal(rider('deliver',{package_handed_over:true,cash_collected:true}).order.status,'delivered');
  const finished=getCustomer();
  assert.equal(finished.status,'delivered');
  assert.equal(finished.payment_status,'paid');
  assert.equal(finished.cod_collected,true);
  assert.equal(Object.hasOwn(finished,'delivery_otp'),false);
  assert.equal(rider('deliver',{package_handed_over:true,cash_collected:true}).code,'invalid_transition');
  assert.equal(h.records('orders').length,1);
  assert.equal(h.records('order_items').length,1);
  const data=JSON.parse(String(h.records('orders')[0].receipt_json));
  assert.equal(data.delivery_otp,'');
  assert.equal(data.total_amount,receipt.total_amount);
  assert.equal(data.history.at(-1).status,'delivered');
  const newDevice=h.post({action:'customer_phone_login',phone:'01700000000',password:'StrongPrivateCustomerPass!'});
  assert.equal(newDevice.ok,true);
  const history=h.post({action:'customer_phone_orders',auth_token:newDevice.auth_token});
  assert.equal(history.orders.length,1);
  assert.equal(history.orders[0].status,'delivered');
  assert.equal(history.orders[0].cod_collected,true);

  // Dedicated customer order status uses TextFinder / one receipt cell and
  // must not fetch every order row and column on each delivery progress poll.
  const before=h.rangeReads.length;
  getCustomer(newDevice.auth_token);
  const reads=h.rangeReads.slice(before).filter((entry:{name:string})=>entry.name==='orders');
  assert.equal(reads.some((entry:{height:number;width:number})=>entry.height>1&&entry.width>1),false);
});

test('deleted Google Sheet order disappears from authoritative phone history and status endpoint',()=>{
  const h=harness({singleFile:true});
  const account=h.post({action:'customer_phone_signup',name:'History Customer',phone:'01700555000',password:'VerifiedByPassword2026!'});
  assert.equal(account.ok,true);
  const created=h.post(request()).order;
  assert.equal(h.post({action:'customer_phone_claim',auth_token:account.auth_token,order_id:created.id,
    customer_access_token:created.customer_access_token}).linked,true);
  assert.equal(h.post({action:'customer_phone_orders',auth_token:account.auth_token}).orders.length,1);
  const statusRequest={action:'get_order_status',order_id:created.id,customer_phone:created.customer_phone,
    customer_access_token:created.customer_access_token};
  assert.equal(h.post(statusRequest).status,'pending');
  // Simulate owner deleting a historical record from the authoritative orders Sheet.
  h.tables.orders.splice(1,1);
  assert.equal(h.post({action:'customer_phone_orders',auth_token:account.auth_token}).orders.length,0);
  const deleted=h.post(statusRequest);
  assert.equal(deleted.code,'not_found');
  assert.equal(deleted.error,'Order reference not found.');
});


test('Excel VLOOKUP-style customer master keeps one row per canonical phone and exact order counts',()=>{
  const h=harness({singleFile:true});
  const first=h.post(request({customer_phone:'+880 1700 000000'}));
  assert.equal(first.persisted,true);
  assert.equal(h.records('customer_master').length,1);
  assert.equal(h.records('customer_master')[0].phone_key,'01700000000');
  assert.equal(h.records('customer_master')[0].name,'Test Customer');
  assert.equal(h.records('customer_master')[0].order_count,1);
  const retry=h.post(request({customer_phone:'+880 1700 000000'}));
  assert.equal(retry.order.id,first.order.id);
  assert.equal(h.records('customer_master').length,1);
  assert.equal(h.records('customer_master')[0].order_count,1);
  const another=h.post(request({request_id:'b1111111-2222-4333-8444-555555555555',
    checkout_proof:'11111111-2222-4333-8444-55555555555522222222-3333-4444-8555-666666666666',
    customer_phone:'01700000000',customer_name:'Changed name',delivery_address:'Different new delivery'}));
  assert.equal(another.persisted,true);
  const entry=h.records('customer_master');
  assert.equal(entry.length,1);
  assert.equal(entry[0].name,'Test Customer','Guest orders must not rewrite saved customer identity');
  assert.equal(entry[0].delivery_address,'Test delivery address');
  assert.equal(entry[0].order_count,2);
  assert.equal(entry[0].last_order_id,another.order.id);
  assert.equal(h.records('orders').length,2);
  assert.equal(h.post({action:'staff_customer_lookup',phone:'+880 1700 000000'}).code,'unauthorized');
  assert.equal(h.post({action:'staff_customer_lookup',id_token:RIDER_TOKEN,phone:'01700000000'}).code,'forbidden');
  const staff=h.post({action:'staff_customer_lookup',id_token:ADMIN_TOKEN,phone:'01700000000'});
  assert.equal(staff.found,true);assert.equal(staff.customer.name,'Test Customer');
  assert.equal(staff.customer.order_count,2);
  assert.equal(h.post({action:'staff_customer_lookup',id_token:ADMIN_TOKEN,phone:'01800000000'}).found,false);
  assert.equal(h.get('public').customer_master,undefined);
});
test('Customer Master backfills historical orders once without duplicate customer profiles or touching ledger',()=>{
  const h=harness({singleFile:true});
  h.post(request());
  const before=JSON.stringify(h.records('orders'));
  h.tables.customer_master=[MASTER_HEADERS];
  const outcome=h.context.backfillCustomerMasterOnce();
  assert.equal(outcome.created,1);
  assert.equal(outcome.total_customers,1);
  assert.equal(h.records('customer_master').length,1);
  const second=h.context.backfillCustomerMasterOnce();
  assert.equal(second.created,0);assert.equal(second.updated,1);
  assert.equal(h.records('customer_master').length,1);
  assert.equal(JSON.stringify(h.records('orders')),before);
});


test('staff order refresh marks corrupt Sheet rows incomplete instead of replacing the last valid list',()=>{
  const h=harness({singleFile:true});
  const goodOrder=h.post(request());
  assert.equal(goodOrder.success,true,JSON.stringify(goodOrder));
  const good=h.post({action:'staff_orders',id_token:ADMIN_TOKEN});
  assert.equal(good.snapshot_complete,true);
  assert.equal(good.orders.length,1);
  const headers=h.tables.orders[0];
  h.tables.orders.push(headers.map((key:unknown)=>key==='id'?'damaged-order':key==='receipt_json'?'{malformed-json':''));
  const partial=h.post({action:'staff_orders',id_token:ADMIN_TOKEN});
  assert.equal(partial.ok,true);
  assert.equal(partial.snapshot_complete,false);
  assert.equal(partial.orders.length,1);
  assert.equal(partial.orders[0].id,good.orders[0].id);
});


test('password-free guest contact is stored privately; only authorized staff can find it by phone',()=>{
  const h=harness({singleFile:true});
  const payload={action:'customer_contact_submit',name:'Sample Customer',phone:'01700112233',address:'Tangail, Main Road'};
  const result=h.post(payload);
  assert.equal(result.saved,true,JSON.stringify(result));
  assert.equal(result.phone_verified,false);
  assert.equal(h.records('customer_contact_requests').length,1);
  const stored=h.records('customer_contact_requests')[0];
  assert.equal(stored.phone_key,'01700112233');
  assert.equal(stored.status,'unverified');
  assert.equal(h.post({action:'staff_customer_lookup',phone:payload.phone}).code,'unauthorized');
  assert.equal(h.post({action:'staff_customer_lookup',id_token:RIDER_TOKEN,phone:payload.phone}).code,'forbidden');
  const staff=h.post({action:'staff_customer_lookup',id_token:ADMIN_TOKEN,phone:payload.phone});
  assert.equal(staff.customer.name,'Sample Customer');
  assert.equal(staff.customer.unverified,true);
  assert.equal(h.get('public').customer_contact_requests,undefined);
});
test('password-free receipt recovery needs both original long key and phone; OTP only after dispatch',()=>{
  const h=harness({singleFile:true});
  const created=h.post(request()).order;
  const req={action:'customer_receipt_recover',order_id:created.id,customer_phone:created.customer_phone};
  assert.equal(h.post(req).code,'forbidden');
  assert.equal(h.post({...req,customer_access_token:'0'.repeat(72)}).code,'forbidden');
  assert.equal(h.post({...req,customer_phone:'01700555444',customer_access_token:created.customer_access_token}).code,'forbidden');
  const recovered=h.post({...req,customer_access_token:created.customer_access_token});
  assert.equal(recovered.ok,true,JSON.stringify(recovered));
  assert.equal(recovered.order.id,created.id);
  assert.equal(recovered.order.delivery_otp,'');
  assert.equal(recovered.order.customer_access_token,created.customer_access_token);
  assert.equal('password_hash' in recovered.order,false);
});


test('rider COD cash ledger applies daily deposit debit once and never overdraws',()=>{
 const h=harness({singleFile:true});h.context.setupSheetDatabase();
 const placed=h.post(request());assert.equal(placed.persisted,true);
 const id=placed.order.id;
 const update=(operation:string,id_token:string,extra:Record<string,unknown>={})=>
   h.post({action:'staff_mutate',id_token,operation,order_id:id,...extra});
 for(const op of ['confirm','start_baking','mark_ready'])assert.equal(update(op,ADMIN_TOKEN).ok,true);
 assert.equal(update('assign',ADMIN_TOKEN,{rider_email:'rider@example.com'}).ok,true);
 assert.equal(update('pick_up',RIDER_TOKEN).ok,true);
 assert.equal(update('start_delivery',RIDER_TOKEN).ok,true);
 assert.equal(update('deliver',RIDER_TOKEN,{package_handed_over:true,cash_collected:true}).ok,true);
 const read=()=>h.post({action:'staff_finance_summary',id_token:ADMIN_TOKEN});
 assert.equal(read().riders[0].collected,1680);
 const requestId='a3333333-2222-4333-8444-555555555555';
 const deposit={action:'staff_cash_deposit',id_token:ADMIN_TOKEN,request_id:requestId,
   rider_id:'rider@example.com',amount:500,date:'2026-10-27',notes:'Daily cash'};
 assert.equal(h.post({...deposit,id_token:RIDER_TOKEN}).code,'forbidden');
 assert.equal(h.post({...deposit,amount:2000}).code,'balance_exceeded');
 assert.equal(h.post(deposit).snapshot.riders[0].remaining,1180);
 assert.equal(h.post(deposit).already_saved,true);
 assert.equal(h.records('rider_cash_deposits').length,1);
 assert.equal(read().riders[0].deposited,500);
 assert.equal(h.post({...deposit,request_id:'b3333333-2222-4333-8444-555555555555',amount:1181}).code,'balance_exceeded');
 assert.equal(h.get('staff_finance_summary').ok,false);
});

test('per-cake recipe costs stay private and repeated writes cannot double count',()=>{
 const h=harness({singleFile:true});h.context.setupSheetDatabase();
 const input={action:'staff_cake_cost_save',id_token:ADMIN_TOKEN,request_id:'a4444444-2222-4333-8444-555555555555',
   product_id:'p1',variant_id:'v1',component:'Flour',unit_label:'g',quantity:300,unit_cost:0.2};
 assert.equal(h.post({...input,id_token:RIDER_TOKEN}).code,'forbidden');
 const saved=h.post(input);
 assert.equal(saved.ok,true,JSON.stringify(saved));
 assert.equal(saved.snapshot.cost_totals['p1::v1'],60);
 assert.equal(h.post(input).already_saved,true);
 assert.equal(h.records('cake_cost_items').length,1);
 const id=h.records('cake_cost_items')[0].id;
 assert.equal(h.post({action:'staff_cake_cost_archive',id_token:ADMIN_TOKEN,entry_id:id}).ok,true);
 assert.equal(h.post({action:'staff_finance_summary',id_token:ADMIN_TOKEN}).costs.length,0);
 assert.equal(h.get('staff_cake_cost_save').ok,false);
});
