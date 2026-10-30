import test from 'node:test';
import assert from 'node:assert/strict';
import {roleDefaults,has,authenticateStaff} from '../server/firebaseAccess.mjs';
import {createPosSale} from '../server/firebasePos.mjs';
import {firebaseConfigured} from '../server/firebaseAdmin.mjs';

class MemoryDb{
 rows=new Map<string,Record<string,unknown>>();
 collection(name:string){
  const db=this;
  return {doc(id:string){const key=name+'/'+id;return {id,
   async get(){const data=db.rows.get(key);return {id,exists:!!data,data:()=>data};},
   key
  };}};
 }
 async runTransaction(callback:(tx:any)=>Promise<unknown>){
  const writes:{key:string;data:Record<string,unknown>}[]=[];
  const value=await callback({
   get:async(ref:any)=>{const d=this.rows.get(ref.key);return {id:ref.id,exists:!!d,data:()=>d};},
   create:(ref:any,data:Record<string,unknown>)=>{if(this.rows.has(ref.key)||writes.some(x=>x.key===ref.key))throw new Error('Already exists.');
    writes.push({key:ref.key,data});}
  });
  for(const {key,data} of writes)this.rows.set(key,data);
  return value;
 }
}
const actor={uid:'uid001',name:'Cashier',email:'cashier@example.com',role:'order_manager',permissions:['sales_create','sales_view','sales_history']};
const id='e1b6bb3d-662b-4423-b0d0-9b52a52b208d';
const payload={request_id:id,items:[{variant_id:'v1',quantity:1}],discount_amount:0,
  payment_method:'cash',amount_received:1000,payment_reference:'',customer_name:'Walk-in',customer_phone:''};
function seeded(){
 const db=new MemoryDb();
 db.rows.set('products/p1',{name:'Chocolate Cake',is_active:true});
 db.rows.set('product_variants/v1',{product_id:'p1',name:'1kg',price:500,is_active:true});
 return db;
}
test('firebase never reports configured without server private credentials',()=>{
 assert.equal(firebaseConfigured({}),false);
 assert.equal(firebaseConfigured({FIREBASE_PROJECT_ID:'x'}),false);
});
test('default permissions cannot grant ordinary staff full cash access',()=>{
 assert.equal(has({role:'order_manager'},'sales_create'),true);
 assert.equal(has({role:'order_manager'},'finance_edit'),false);
 assert.equal(has({role:'manager'},'finance_edit'),true);
 assert.equal(has({role:'delivery_man'},'sales_create'),false);
 assert.ok(roleDefaults.super_admin.includes('sales_create'));
});
test('Firebase staff access requires verified email and active matching user',async()=>{
 const db=seeded();
 db.rows.set('staff_accounts/uid001',{email:'cashier@example.com',name:'Cashier',active:true,role:'order_manager'});
 const auth={verifyIdToken:async()=>({uid:'uid001',email:'cashier@example.com',email_verified:true})};
 const active=await authenticateStaff(auth,db,'x'.repeat(140));
 assert.equal(active.role,'order_manager');
 db.rows.set('staff_accounts/uid001',{email:'cashier@example.com',active:false,role:'order_manager'});
 await assert.rejects(()=>authenticateStaff(auth,db,'x'.repeat(140)),/disabled/);
});
test('Firestore POS re-prices from server data and idempotently saves immutable receipt',async()=>{
 const db=seeded();
 const first=await createPosSale(db,actor,payload);
 assert.equal(first.sale.total_amount,500);
 assert.equal(first.sale.change_amount,500);
 assert.equal(first.sale.unit_price,undefined);
 assert.equal(first.sale.items[0].unit_price,500);
 const second=await createPosSale(db,actor,payload);
 assert.equal(second.already_saved,true);
 assert.equal(second.sale.id,first.sale.id);
 assert.equal([...db.rows.keys()].filter(k=>k.startsWith('pos_sales/')).length,1);
 await assert.rejects(()=>createPosSale(db,actor,{...payload,items:[{variant_id:'v1',quantity:2}]}),/Request ID/);
});
test('discount needs explicit permission; reference reuse is blocked',async()=>{
 const db=seeded();
 await assert.rejects(()=>createPosSale(db,actor,{...payload,discount_amount:20}),/Access denied/);
 const a={...payload,request_id:'b1b6bb3d-662b-4423-b0d0-9b52a52b208d',payment_method:'bkash',payment_reference:'ABC123',amount_received:0};
 const saved=await createPosSale(db,actor,a);
 assert.equal(saved.sale.payment_confirmation,'staff_attested');
 await assert.rejects(()=>createPosSale(db,actor,{...a,request_id:'c1b6bb3d-662b-4423-b0d0-9b52a52b208d'}),/reference was already used/);
});
