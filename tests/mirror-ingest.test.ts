import assert from 'node:assert/strict';
import test from 'node:test';
import handler from '../api/mirror-ingest.js';

const SECRET='super-secure-test-secret-not-for-production-1234567';
const origin='https://example.supabase.co';
function invoke(method:string,secret:string,body:unknown){
 const out={statusCode:200,headers:{} as Record<string,string>,text:''};
 const res={statusCode:200,setHeader(k:string,v:string){out.headers[k]=v;},
  end(x:string){out.statusCode=this.statusCode;out.text=x;}};
 const req={method,headers:{'x-aurora-mirror-secret':secret},body} as never;
 return handler(req,res as never).then(()=>({status:out.statusCode,body:JSON.parse(out.text),headers:out.headers}));
}
const data={records:[{source_table:'orders',source_id:'ord_1',data:{status:'pending',total_amount:300}}]};
test('mirror rejects unauthenticated and unapproved tables without calling Supabase',async()=>{
 const before=process.env.AURORA_MIRROR_SHARED_SECRET;
 process.env.AURORA_MIRROR_SHARED_SECRET=SECRET;
 const original=globalThis.fetch;let called=false;globalThis.fetch=(async()=>{called=true;throw new Error('not allowed')}) as typeof fetch;
 try{
  assert.equal((await invoke('GET',SECRET,data)).status,405);
  assert.equal((await invoke('POST','bad',data)).status,403);
  assert.equal((await invoke('POST',SECRET,{records:[{source_table:'staff_accounts',source_id:'x',data:{}}]})).status,400);
  assert.equal(called,false);
 }finally{globalThis.fetch=original;if(before===undefined)delete process.env.AURORA_MIRROR_SHARED_SECRET;
 else process.env.AURORA_MIRROR_SHARED_SECRET=before;}
});
test('valid private batch is idempotently upserted using server-only credentials',async()=>{
 const old=[process.env.AURORA_MIRROR_SHARED_SECRET,process.env.AURORA_SUPABASE_URL,process.env.AURORA_SUPABASE_SERVICE_ROLE_KEY];
 process.env.AURORA_MIRROR_SHARED_SECRET=SECRET;
 process.env.AURORA_SUPABASE_URL=origin;
 process.env.AURORA_SUPABASE_SERVICE_ROLE_KEY='a'.repeat(90);
 const before=globalThis.fetch;
 let count=0;
 globalThis.fetch=(async(url:string,init?:RequestInit)=>{
  count++;assert.match(String(url),/\/rest\/v1\/aurora_mirror_records\?on_conflict/);
  assert.equal(init?.method,'POST');
  assert.equal((init?.headers as Record<string,string>).apikey,'a'.repeat(90));
  assert.equal(JSON.parse(String(init?.body)).length,1);
  return {ok:true} as Response;
 }) as typeof fetch;
 try{
  const res=await invoke('POST',SECRET,data);
  assert.equal(res.status,200);assert.equal(res.body.synced,1);
  assert.equal(count,1);
 }finally{globalThis.fetch=before;
 ['AURORA_MIRROR_SHARED_SECRET','AURORA_SUPABASE_URL','AURORA_SUPABASE_SERVICE_ROLE_KEY'].forEach((k,i)=>{
   if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];
 });}
});
test('mirror never acknowledges upstream failures',async()=>{
 const old=[process.env.AURORA_MIRROR_SHARED_SECRET,process.env.AURORA_SUPABASE_URL,process.env.AURORA_SUPABASE_SERVICE_ROLE_KEY];
 process.env.AURORA_MIRROR_SHARED_SECRET=SECRET;process.env.AURORA_SUPABASE_URL=origin;
 process.env.AURORA_SUPABASE_SERVICE_ROLE_KEY='a'.repeat(90);
 const before=globalThis.fetch;globalThis.fetch=(async()=>({ok:false,status:503}) as Response) as typeof fetch;
 try{const r=await invoke('POST',SECRET,data);assert.equal(r.status,502);assert.equal(r.body.ok,false);}
 finally{globalThis.fetch=before;
 ['AURORA_MIRROR_SHARED_SECRET','AURORA_SUPABASE_URL','AURORA_SUPABASE_SERVICE_ROLE_KEY'].forEach((k,i)=>{
  if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];});}
});
