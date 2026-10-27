/**
 * Server-only ingestion route. The mobile app and public website MUST NOT use it.
 * Google Sheets stays the system of record. This is a private, one-way mirror.
 * Required server environment:
 * AURORA_MIRROR_SHARED_SECRET (same random 32+ char value as Apps Script)
 * AURORA_SUPABASE_URL, AURORA_SUPABASE_SERVICE_ROLE_KEY.
 */
import {timingSafeEqual} from 'node:crypto';
const allowed=new Set(['orders','order_items','pos_sales','custom_cake_requests',
  'inventory_items','inventory_movements','cake_cost_items','order_cost_snapshots',
  'refund_returns','rider_cash_deposits','customer_master',
  'products','product_variants','categories','settings']);
const maxBytes=195000;
const safeCompare=(a,b)=>{
  if(typeof a!=='string'||typeof b!=='string'||a.length<32||a.length!==b.length)return false;
  return timingSafeEqual(Buffer.from(a,'utf8'),Buffer.from(b,'utf8'));
};
const invalid=(res,status,error)=>{
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify({ok:false,error}));
};
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST')return invalid(res,405,'POST required');
  const configured=process.env.AURORA_MIRROR_SHARED_SECRET||'';
  if(!safeCompare(req.headers?.['x-aurora-mirror-secret'],configured))
    return invalid(res,403,'Not authorized');
  const supabaseUrl=process.env.AURORA_SUPABASE_URL||'';
  const serviceKey=process.env.AURORA_SUPABASE_SERVICE_ROLE_KEY||'';
  let origin;
  try{origin=new URL(supabaseUrl);}catch{return invalid(res,503,'Mirror is not configured');}
  if(origin.protocol!=='https:'||!/^([a-z0-9-]+)\.supabase\.co$/i.test(origin.hostname)||
    origin.pathname!=='/'||origin.search||origin.hash||serviceKey.length<60)
    return invalid(res,503,'Mirror endpoint not configured');
  let body='';
  if(req.body!==undefined&&req.body!==null)
    body=Buffer.isBuffer(req.body)?req.body.toString('utf8'):typeof req.body==='string'?req.body:JSON.stringify(req.body);
  else{
    const parts=[];let size=0;
    for await(const part of req){size+=part.length;if(size>maxBytes)return invalid(res,413,'Payload too large');parts.push(part);}
    body=Buffer.concat(parts).toString('utf8');
  }
  if(Buffer.byteLength(body,'utf8')>maxBytes)return invalid(res,413,'Payload too large');
  let data;
  try{data=JSON.parse(body);}catch{return invalid(res,400,'Invalid JSON');}
  if(!data||!Array.isArray(data.records)||data.records.length<1||data.records.length>50)
    return invalid(res,400,'Invalid mirror batch');
  const entries=[];
  const keys=new Set();
  for(const row of data.records){
    if(!row||!allowed.has(row.source_table)||typeof row.source_id!=='string'||
      row.source_id.length<1||row.source_id.length>180||
      !row.data||typeof row.data!=='object'||Array.isArray(row.data))
      return invalid(res,400,'Invalid mirror record');
    const key=row.source_table+':'+row.source_id;
    if(keys.has(key))return invalid(res,400,'Repeated record key');
    keys.add(key);
    entries.push({source_table:row.source_table,source_id:row.source_id,data:row.data,
      mirrored_at:new Date().toISOString()});
  }
  try{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),15000);
    let result;
    try{result=await fetch(origin.origin+'/rest/v1/aurora_mirror_records?on_conflict=source_table%2Csource_id',{
      method:'POST',redirect:'error',signal:controller.signal,
      headers:{'Content-Type':'application/json','apikey':serviceKey,
        'Authorization':'Bearer '+serviceKey,'Prefer':'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify(entries)
    });}finally{clearTimeout(timer);}
    if(!result.ok)return invalid(res,502,'Supabase mirror unavailable; retry same batch');
    res.statusCode=200;res.setHeader('Content-Type','application/json; charset=utf-8');
    return res.end(JSON.stringify({ok:true,synced:entries.length}));
  }catch{return invalid(res,504,'Mirror timed out; retry batch');}
}
