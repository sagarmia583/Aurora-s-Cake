import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePagesApi} from '../cloudflare/pages-api/src/index.mjs';

const origin='https://sagarmia583.github.io';
const service='https://aurora-gh-pages-api.test-subdomain.workers.dev';
const script='https://script.google.com/macros/s/AKfycbw38J4AzlYkAhNtyDAp_CP34fUk9Epae6xz46AQFbF9ye1VsZjxTXmzbJgs52WEoWETMw/exec';
const env={AURORA_ALLOWED_ORIGIN:origin,AURORA_SCRIPT_POST_URL:script};
const request=(path,method='GET',body,from=origin,headers={})=>new Request(service+path,{
  method,headers:{Origin:from,...(body?{'Content-Type':'text/plain;charset=utf-8'}:{}),...headers},
  ...(body?{body:JSON.stringify(body)}:{})
});
const json=(x,status=200,location)=>new Response(JSON.stringify(x),{status,
  headers:{'Content-Type':'application/json',...(location?{Location:location}:{})}});
test('CORS is restricted to the one published GitHub Pages origin',async()=>{
  let calls=0;
  const fetcher=async()=>{calls++;return json({ok:true})};
  const denied=await handlePagesApi(request('/api/operations','POST',{action:'staff_cms_update'},'https://evil.example'),env,fetcher);
  assert.equal(denied.status,403);assert.equal(denied.headers.get('Access-Control-Allow-Origin'),null);
  const preflight=await handlePagesApi(request('/api/operations','OPTIONS'),env,fetcher);
  assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);
  assert.equal(calls,0,'No Google Sheets request for preflight or hostile origin');
});
test('staff login/order/CMS actions forward only allowlisted JSON through Apps Script R5',async()=>{
  for(const action of ['create_order','staff_password_login','staff_mutate','staff_cms_update']){
    const body={action,auth_token:'not-a-real-secret',order_id:'test-reference'};
    const calls=[];
    const fetcher=async(url,init)=>{
      calls.push({url,init});
      if(calls.length===1)return new Response(null,{status:302,
        headers:{Location:'https://script.googleusercontent.com/macros/echo?user_content_key=abc'}});
      return json({ok:true,ack:action});
    };
    const result=await handlePagesApi(request('/api/operations','POST',body),env,fetcher);
    assert.equal(result.status,200,action);assert.equal((await result.json()).ack,action);
    assert.equal(calls.length,2);
    assert.equal(calls[0].init.method,'POST');
    assert.equal(calls[0].init.body,JSON.stringify(body));
    assert.equal(calls[1].init.method,'GET');
    assert.equal(calls[1].init.body,undefined,'Credentials must never follow the redirect');
    assert.equal(result.headers.get('Access-Control-Allow-Origin'),origin);
  }
});
test('private actions cannot bypass authorization through the API proxy',async()=>{
  const payload={action:'staff_cms_update',table:'products',values:{base_price:1}};
  const r=await handlePagesApi(request('/api/operations','POST',payload),env,
    async()=>json({ok:false,code:'auth_required',error:'Staff login required.'}));
  assert.equal(r.status,200);
  const j=await r.json();
  assert.equal(j.ok,false);assert.equal(j.code,'auth_required');
});
test('invalid HTTP methods, action names, redirects and backend configuration fail closed',async()=>{
  assert.equal((await handlePagesApi(request('/api/operations','GET'),env,async()=>json({}))).status,405);
  assert.equal((await handlePagesApi(request('/api/operations','POST',{action:'drop_all_tables'}),env,async()=>json({}))).status,400);
  assert.equal((await handlePagesApi(request('/api/operations','POST',{action:'create_order'}),{
    ...env,AURORA_SCRIPT_POST_URL:'https://evil.example/exec'},async()=>json({}))).status,503);
  let redirected=0;
  const bad=await handlePagesApi(request('/api/operations','POST',{action:'create_order'}),env,async()=>{
    redirected++;
    return new Response(null,{status:302,headers:{Location:'https://evil.example/steal'}});
  });
  assert.equal(bad.status,502);assert.equal(redirected,1);
});
test('public GET validates allowlisted Google Sheet content without leaking private tables',async()=>{
  const payload={ok:true,schema_version:1,data:{products:[],settings:{shop_name:'Aurora’s Cake'}}};
  const good=await handlePagesApi(request('/api/public'),env,async()=>json(payload));
  assert.equal(good.status,200);
  assert.deepEqual(await good.json(),payload);
  const secret={...payload,data:{...payload.data,orders:[{customer_phone:'01700000000'}]}};
  const bad=await handlePagesApi(request('/api/public'),env,async()=>json(secret));
  assert.equal(bad.status,502);
});
test('health checks authoritative Google Sheets release and rejects stale code',async()=>{
  const healthy={ok:true,service:'aurora_public_content',database_backend:'google_sheets',
    release:'aurora-2026-11-03-staff-order-alerts-r5',writes_frozen:false};
  const res=await handlePagesApi(request('/api/backend-health'),env,async()=>json(healthy));
  assert.equal(res.status,200);assert.equal((await res.json()).up_to_date,true);
  const stale=await handlePagesApi(request('/api/backend-health'),env,async()=>json({...healthy,release:'old'}));
  assert.equal(stale.status,503);
});
