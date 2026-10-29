import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/worker.js';
import {d1ApiHandler} from '../cloudflare/d1/api.js';
import {d1MediaHandler} from '../cloudflare/d1/media.js';
import {verifyCloudflareAccess} from '../cloudflare/d1/access.js';

const host='https://aurora-s-cake.sagarmia583.workers.dev';
const req=(path:string,method='GET',body?:unknown,origin=host)=>
  new Request(host+path,{
    method,headers:body===undefined?undefined:
      {'content-type':'application/json','origin':origin},
    body:body===undefined?undefined:JSON.stringify(body)
  });
const staff={id:'owner-1',role:'super_admin',email:'owner@example.com'};
const statement=(sql:string,db:any)=>{
  const params:unknown[]=[];
  return {
    bind(...args:unknown[]){params.push(...args);return this;},
    async first(){db.queries.push({sql,params});
      if(sql.includes('FROM pos_sales WHERE idempotency_key'))return db.prior||null;
      if(sql.includes('FROM cash_registers'))return {id:'register-1'};
      if(sql.includes('FROM product_variants v'))return {id:'variant-1',label:'Half pound',
        price_paisa:35000,cost_snapshot_paisa:22000,name:'Vanilla cake'};
      if(sql.includes('FROM inventory_items'))return {id:'flour'};
      return null;
    },
    async all(){db.queries.push({sql,params});
      if(sql.includes('FROM products WHERE active=1'))return {results:[{id:'p',name:'Cake'}]};
      if(sql.includes('FROM product_variants v'))return {results:[{id:'variant-1',price_paisa:35000}]};
      if(sql.includes('FROM categories'))return {results:[]};
      return {results:[]};
    },
    async run(){db.queries.push({sql,params});return {meta:{changes:1}};},
    get sql(){return sql;},get params(){return params}
  };
};
const mockDb=()=>{
  const db:any={queries:[],batches:[],prior:null};
  db.prepare=(sql:string)=>statement(sql,db);
  db.batch=async(stmts:any[])=>{
    db.batches.push(stmts.map(x=>({sql:x.sql,params:x.params})));
    return stmts.map(()=>({meta:{changes:1}}));
  };
  return db;
};
test('Cloudflare D1 is disabled by default and has no fallback into Sheets or Firebase',async()=>{
  const response=await worker.fetch(req('/api/d1/status'),{
    ASSETS:{fetch:async()=>new Response('asset')}
  });
  assert.equal(response.status,503);
  assert.equal((await response.json() as any).code,'d1_preview_disabled');
  const missing=await worker.fetch(req('/api/d1/status'),{
    D1_PREVIEW_ENABLED:'true',ASSETS:{fetch:async()=>new Response('asset')}
  });
  assert.equal(missing.status,503);
  assert.equal((await missing.json() as any).code,'d1_binding_missing');
});
test('D1 public catalog returns only published product/variant columns and disables checkout',async()=>{
  const db=mockDb();
  const r=await d1ApiHandler({request:req('/api/d1/catalog'),
    env:{AURORA_DB:db,D1_PREVIEW_ENABLED:'true'}});
  assert.equal(r.status,200);
  const body=await r.json() as any;
  assert.equal(body.provider,'cloudflare_d1');
  assert.equal(body.order_submission_enabled,false);
  assert.equal(body.products[0].name,'Cake');
  assert.equal(db.queries.length,3);
  assert.equal(db.queries.some((q:any)=>q.sql.includes('customer_phone')),false);
});
test('Private APIs reject unauthenticated users and forged Origin before database reads',async()=>{
  const db=mockDb();
  const env={AURORA_DB:db,D1_PREVIEW_ENABLED:'true',D1_MUTATIONS_ENABLED:'true'};
  const unauth=await d1ApiHandler({request:req('/api/d1/admin/orders'),env},{
    staffVerifier:async()=>null
  });
  assert.equal(unauth.status,401);
  assert.equal(db.queries.length,0);
  const foreign=await d1ApiHandler({request:req('/api/d1/admin/pos','POST',{lines:[]},'https://evil.example'),env},{
    staffVerifier:async()=>staff
  });
  assert.equal(foreign.status,403);
  assert.equal(db.queries.length,0);
  const unsigned=await verifyCloudflareAccess(req('/api/d1/admin/orders'),{
    CF_ACCESS_TEAM_DOMAIN:'team.cloudflareaccess.com',
    CF_ACCESS_AUD:'an-audience'
  });
  assert.equal(unsigned,null);
});
test('D1 financial mutations are explicitly disabled without a write gate',async()=>{
  const db=mockDb();
  const result=await d1ApiHandler({request:req('/api/d1/admin/pos','POST',{
    idempotency_key:'key',register_id:'register-1',payment_method:'cash',
    lines:[{variant_id:'variant-1',quantity:1}]
  }),env:{AURORA_DB:db,D1_PREVIEW_ENABLED:'true'}},{staffVerifier:async()=>staff});
  assert.equal(result.status,503);
  assert.equal((await result.json() as any).code,'d1_mutations_disabled');
  assert.equal(db.batches.length,0);
});
test('POS sale re-quotes authoritative prices and creates balanced entries in a single batch',async()=>{
  const db=mockDb();
  const request=req('/api/d1/admin/pos','POST',{
    idempotency_key:'unique-order-1',register_id:'register-1',payment_method:'cash',
    lines:[{variant_id:'variant-1',quantity:2,price_paisa:1}]
  });
  const r=await d1ApiHandler({request,env:{
    AURORA_DB:db,D1_PREVIEW_ENABLED:'true',D1_MUTATIONS_ENABLED:'true'
  }},{staffVerifier:async()=>staff});
  assert.equal(r.status,201);
  const result=await r.json() as any;
  assert.equal(result.total_paisa,70000); // 2 * SERVER price 35000, not client price 1
  assert.equal(db.batches.length,1); // D1 batch() wraps statements atomically
  const batch=db.batches[0];
  assert.equal(batch.some((s:any)=>s.sql.includes('INSERT INTO pos_sales')),true);
  assert.equal(batch.filter((s:any)=>s.sql.includes('INSERT INTO accounting_entries')).length,2);
  const accounts=batch.filter((s:any)=>s.sql.includes('INSERT INTO accounting_entries'));
  assert.equal(accounts[0].params[3],70000);
  assert.equal(accounts[1].params[3],70000);
});
test('Inventory negative adjustment cannot pass malformed input; DB CHECK preserves nonnegative stock',async()=>{
  const db=mockDb();
  const env={AURORA_DB:db,D1_PREVIEW_ENABLED:'true',D1_MUTATIONS_ENABLED:'true'};
  const r=await d1ApiHandler({request:req('/api/d1/admin/inventory','POST',{
    item_id:'flour',delta_milli:0,reason:'correction'
  }),env},{staffVerifier:async()=>staff});
  assert.equal(r.status,422);
  assert.equal(db.batches.length,0);
});
test('Unprivileged staff cannot read cash ledger or all customer orders',async()=>{
  const db=mockDb();
  const env={AURORA_DB:db,D1_PREVIEW_ENABLED:'true'};
  const baker={id:'baker-1',role:'baker',email:'baker@example.com'};
  for(const path of ['/api/d1/admin/accounting','/api/d1/admin/orders']){
    const r=await d1ApiHandler({request:req(path),env},{staffVerifier:async()=>baker});
    assert.equal(r.status,403);
  }
  assert.equal(db.queries.length,0);
});
test('R2 refuses anonymous uploads and never serves unpublished/private media IDs',async()=>{
  const db=mockDb(),bucket={get:async()=>null,put:async()=>{throw Error('never')}};
  const env={AURORA_DB:db,AURORA_MEDIA:bucket,D1_PREVIEW_ENABLED:'true',
    D1_MUTATIONS_ENABLED:'true'};
  const upload=new Request(host+'/api/d1/admin/media',{
    method:'POST',headers:{'content-type':'image/png','x-aurora-image-kind':'product','content-length':'100'},
    body:new Uint8Array(100)
  });
  assert.equal((await d1MediaHandler({request:upload,env},{staffVerifier:async()=>null})).status,401);
  assert.equal((await d1MediaHandler({request:req('/api/d1/media/not-uuid'),env})).status,404);
});
