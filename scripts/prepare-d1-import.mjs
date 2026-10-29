#!/usr/bin/env node
/**
 * LOCAL-ONLY, non-destructive migration staging generator.
 * Reads a reviewed export JSON, strips all unapproved/private fields,
 * verifies its numeric totals, and outputs SQL that writes ONLY to
 * migration_runs + migration_staging. No live orders/tables changed.
 *
 * node scripts/prepare-d1-import.mjs --input ./aurora-export.json
 * node scripts/prepare-d1-import.mjs --input ./aurora-export.json --out ./aurora-stage.sql
 * npx wrangler d1 execute aurora-cake-db --remote --file=./aurora-stage.sql
 *
 * Keep the source export and original Google Sheets backup safe. Never commit
 * customer data, generated SQL, bank records or keys to GitHub.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const arg=(flag)=>{const i=process.argv.indexOf(flag);return i<0?null:process.argv[i+1];};
const collections={
  categories:['id','name','slug','sort_order','is_active'],
  products:['id','category_id','name','description','image_url','image_key','sort_order','is_active','variants','allowed_flavor_ids','allowed_addon_ids'],
  variants:['id','product_id','label','name','price','sale_price','price_paisa','cost_snapshot_paisa','is_active'],
  customers:['id','display_name','name','phone','created_at'],
  inventory:['id','name','unit','on_hand_milli','reorder_at_milli'],
  orders:['id','order_number','customer_name','customer_phone','delivery_address',
    'delivery_date','delivery_slot','status','payment_method','payment_status',
    'subtotal','delivery_fee','discount_amount','total_amount','created_at',
    'updated_at','items','history','source','source_record_id'],
};
const H=(s)=>createHash('sha256').update(s).digest('hex');
const q=(s)=>"CAST(X'"+Buffer.from(s,'utf8').toString('hex')+"' AS TEXT)";
const isObject=(x)=>!!x&&typeof x==='object'&&!Array.isArray(x);
const numeric=(value)=>{
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1e7||
     Math.round(value*100)!==Number((value*100).toFixed(0)))
    throw Error('Order total must be a valid nonnegative two-decimal BDT number');
  return Math.round(value*100);
};
const normalize=(record,collection)=>{
  if(!isObject(record)||typeof record.id!=='string'||!record.id.trim()||record.id.length>200)
    throw Error('Record missing a stable legacy id in '+collection);
  const safe={};
  for(const k of collections[collection]){
    if(Object.hasOwn(record,k))safe[k]=record[k];
  }
  // Nested order items often have receipt/OTP/access data. Import only known
  // line snapshots; never copy an unrestricted nested object into staging.
  if(collection==='orders'){
    if(!Array.isArray(record.items))throw Error('Order '+record.id+' missing items');
    safe.items=record.items.map(x=>{
      if(!isObject(x))throw Error('Invalid order line');
      return Object.fromEntries(['id','order_id','product_id','variant_id','product_name',
        'variant_name','flavor_name','quantity','unit_price','subtotal','writing_message']
        .filter(k=>Object.hasOwn(x,k)).map(k=>[k,x[k]]));
    });
    safe.history=Array.isArray(record.history)?record.history.map(x=>{
      if(!isObject(x))throw Error('Invalid order status history');
      return Object.fromEntries(['id','status','notes','created_at']
        .filter(k=>Object.hasOwn(x,k)).map(k=>[k,x[k]]));
    }):[];
    numeric(record.total_amount);
  }
  return safe;
};
async function main(){
  const input=arg('--input'),out=arg('--out');
  if(!input||out===undefined&&process.argv.includes('--out'))
    throw Error('Usage: --input review-export.json [--out private-staging.sql]');
  const source=JSON.parse(await readFile(input,'utf8'));
  if(!isObject(source))throw Error('Expected export JSON object');
  const tables=isObject(source.data)?source.data:source;
  const records=[];
  let total=0;
  for(const table of Object.keys(collections)){
    const rows=tables[table]||[];
    if(!Array.isArray(rows))throw Error('Expected array: '+table);
    const ids=new Set();
    for(const record of rows){
      const safe=normalize(record,table);
      if(ids.has(safe.id))throw Error('Duplicate legacy record '+table+':'+safe.id);
      ids.add(safe.id);
      const serialized=JSON.stringify(safe);
      if(Buffer.byteLength(serialized)>200000)throw Error('Record too large: '+table);
      records.push({table,id:safe.id,json:serialized,hash:H(serialized)});
      if(table==='orders')total+=numeric(record.total_amount);
    }
  }
  if(!records.length)throw Error('No importable data; refusing to generate empty import');
  if(!Number.isSafeInteger(total)||total<0)throw Error('Order total exceeded safe range');
  const manifest=JSON.stringify(records.map(x=>[x.table,x.id,x.hash]));
  const digest=H(manifest),run='legacy_'+digest.slice(0,20);
  const counts=Object.fromEntries(Object.keys(collections).map(t=>
    [t,records.filter(r=>r.table===t).length]));
  console.log(JSON.stringify({dry_run:!out,run_id:run,source:'reviewed_legacy_export',
    row_count:records.length,counts,order_total_paisa:total,
    manifest_sha256:digest},null,2));
  if(!out)return;
  const stmts=[
    '-- D1 migration staging ONLY, generated locally; contains private customer data.',
    '-- DO NOT commit, email or post this file.',
    `INSERT OR IGNORE INTO migration_runs
      (id,source,manifest_sha256,expected_rows,expected_order_paisa)
      VALUES (${q(run)},'reviewed_legacy_export',${q(digest)},${records.length},${total});`,
  ];
  for(const r of records){
    stmts.push(`INSERT OR IGNORE INTO migration_staging
      (run_id,source_table,legacy_id,content_sha256,source_json)
      VALUES (${q(run)},${q(r.table)},${q(r.id)},${q(r.hash)},${q(r.json)});`);
  }
  stmts.push('-- Reconciliation (run separately with wrangler d1 execute --command):');
  stmts.push(`-- SELECT source_table,COUNT(*) FROM migration_staging WHERE run_id='${run}' GROUP BY source_table;`);
  stmts.push('-- Source export is not deleted and live tables are not modified.');
  await writeFile(out,stmts.join('\n')+'\n',{flag:'wx',mode:0o600});
  console.log('Created private staging SQL: '+out);
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Invalid import');process.exitCode=1;});
