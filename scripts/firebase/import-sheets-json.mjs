/**
 * Explicit import of a locally reviewed Google Sheets JSON export.
 * No data leaves your computer until --commit is passed.
 *
 * Input: {"tables":{"orders":[...],"products":[...], ...}}
 * Never commit exports with customer PII or receipts to git.
 */
import {readFile} from 'node:fs/promises';
import {firebaseServices} from '../../server/firebaseAdmin.mjs';
const args=process.argv.slice(2);
const inputPath=args.find(x=>!x.startsWith('--'));
const commit=args.includes('--commit');
const ack=args.includes('--ack-reviewed-export');
const tables=['categories','products','product_variants','orders','order_items','pos_sales',
  'custom_cake_requests','inventory_items','inventory_movements','cake_cost_items',
  'order_cost_snapshots','refund_returns','rider_cash_deposits'];
const blocked=/password|passwd|(^|_)token|(^|_)otp|secret|salt|hash|proof|credential|auth_session|customer_access_key/i;
function cleaned(value,level=0){
 if(level>9)return null;
 if(value===null||value===undefined)return null;
 if(Array.isArray(value))return value.slice(0,1000).map(x=>cleaned(x,level+1));
 if(typeof value==='object'){
  const dest={};
  for(const [k,v] of Object.entries(value))if(!blocked.test(k))dest[k]=cleaned(v,level+1);
  return dest;
 }
 return typeof value==='string'?value.slice(0,45000):value;
}
function parseReceipt(record){
 if(typeof record.receipt_json!=='string')return record;
 try{
  const receipt=JSON.parse(record.receipt_json);
  // Canonical receipt status and amount live inside this serialized record.
  if(receipt&&typeof receipt==='object'&&!Array.isArray(receipt))return {...record,...receipt};
 }catch{throw Error('Invalid receipt_json: '+String(record.id||'unknown'));}
 return record;
}
function sourceId(table,row){
 const id=String(row.id||row.request_id||'').trim();
 if(!id||id.length>180||id.includes('/'))throw Error('Missing/invalid stable '+table+' ID.');
 return id;
}
if(!inputPath|| (commit&&!ack)){
 console.error('Usage: node scripts/firebase/import-sheets-json.mjs FILE.json [--commit --ack-reviewed-export]');
 process.exitCode=2;
}else{
 try{
  const document=JSON.parse(await readFile(inputPath,'utf8'));
  if(!document||!document.tables||typeof document.tables!=='object')throw Error('Input must contain tables object.');
  const all=[];
  for(const [table,rows] of Object.entries(document.tables)){
   if(!tables.includes(table))throw Error('Unapproved import table: '+table);
   if(!Array.isArray(rows))throw Error('Input table must be an array: '+table);
   for(const value of rows){
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid row: '+table);
    const id=sourceId(table,value);
    const sanitized=cleaned(parseReceipt(value));
    // Import does not replace existing Firestore documents: repeatable only for empty target.
    all.push({table,id,data:sanitized});
   }
  }
  const keys=new Set(all.map(x=>x.table+':'+x.id));
  if(keys.size!==all.length)throw Error('Duplicate document ID within import.');
  console.log('Import review:',JSON.stringify(Object.fromEntries(tables.map(t=>[t,all.filter(x=>x.table===t).length]).filter(x=>x[1]>0)),null,2));
  console.log('DRY RUN?',!commit,'Total records:',all.length);
  if(commit){
   const {db}=await firebaseServices();
   // BulkWriter.create() is insert-only; existing docs are never overwritten.
   // If a partial import fails, inspect the created IDs before a retry.
   const writer=db.bulkWriter();
   let written=0;
   for(const row of all){
    const doc=db.collection(row.table).doc(row.id);
    writer.create(doc,row.data).then(()=>{written++}).catch(e=>{
      console.error('Failed '+row.table+'/'+row.id+': '+String(e.message).slice(0,200));});
   }
   await writer.close();
   if(written!==all.length)throw Error('Partial import. Inspect Firestore and reconcile before retry.');
   console.log('Imported',written,'documents successfully.');
  }
 }catch(e){console.error('IMPORT ABORTED:',e.message);process.exitCode=1;}
}
