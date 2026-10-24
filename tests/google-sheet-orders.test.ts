import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

type Row = unknown[];
const ORDER_HEADERS=['id','order_number','request_id','request_hash','created_at','updated_at','customer_name','customer_phone','delivery_address','delivery_zone_id','delivery_zone_name','delivery_fee','delivery_slot','delivery_date','status','subtotal','discount_amount','total_amount','coupon_code','order_note','payment_method','payment_status','receipt_json'];
const ITEM_HEADERS=['id','order_id','product_id','product_name','variant_id','variant_name','flavor_id','flavor_name','writing_message','unit_price','quantity','addons_json','subtotal'];
const futureDate=()=>new Date(Date.now()+2*86400000).toISOString().slice(0,10);
const request=(patch:Record<string,unknown>={})=>({action:'create_order',request_id:'a1111111-2222-4333-8444-555555555555',customer_name:'Test Customer',customer_phone:'+880 1700 000000',delivery_address:'Test delivery address',delivery_zone_id:'z1',delivery_slot:'10 AM - 12 PM',delivery_date:futureDate(),cart_items:[{product_id:'p1',variant_id:'v1',flavor_id:'f1',addon_ids:['a1'],writing_message:'Happy birthday',quantity:2}],coupon_code:'SAVE10',order_note:'Call before delivery',payment_method:'cod',...patch});
function harness(options:{withoutPrivate?:boolean}={}) {
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
  if(!options.withoutPrivate){tables.orders=[ORDER_HEADERS];tables.order_items=[ITEM_HEADERS];}
  const reads:string[]=[];const writes:string[]=[];
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
    PropertiesService:{getScriptProperties:()=>({getProperty:()=>null})},
    CacheService:{getScriptCache:()=>({get:()=>null,put:()=>{},remove:()=>{}})},
    LockService:{getScriptLock:()=>({tryLock:()=>{acquired++;return true;},releaseLock:()=>{acquired--;}})},
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_algorithm:string,value:string)=>Array.from(createHash('sha256').update(value).digest()),formatDate:(date:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(date)},
    ContentService:{MimeType:{JSON:'json',JAVASCRIPT:'js'},createTextOutput:(content:string)=>({content,setMimeType(){return this;}})},
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8'),context);
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
