import test from 'node:test';
import assert from 'node:assert/strict';
import operations from '../netlify/functions/operations.mjs';
import publicCatalog from '../netlify/functions/public.mjs';
import backendHealth from '../netlify/functions/backend-health.mjs';
import publicImage from '../netlify/functions/image.mjs';

const netlify='https://aurorascake.netlify.app';
const script='https://script.google.com/macros/s/AKfycbw38J4AzlYkAhNtyDAp_CP34fUk9Epae6xz46AQFbF9ye1VsZjxTXmzbJgs52WEoWETMw/exec';
const make=(route,method='GET',origin=netlify,body,headers={})=>new Request(netlify+route,{
  method,headers:{...(origin?{Origin:origin}:{}),...headers,...(body?{'Content-Type':'text/plain;charset=utf-8'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
});
const asRemote=(body)=>{const response=new Response(JSON.stringify(body),{status:200});Object.defineProperty(response,'url',{value:'https://script.googleusercontent.com/macros/echo'});return response;};
const context=(fetcher)=>({scriptUrl:script,fetcher});
test('Retired and third-party browser origins cannot call Netlify Functions', async () => {
  let calls=0;
  const fetcher=async()=>{calls++;return asRemote({ok:true});};
  for(const origin of ['https://sagarmia583.github.io','https://evil.example']){
    assert.equal((await operations(make('/api/operations','POST',origin,{action:'create_order'}),context(fetcher))).status,403);
    assert.equal((await publicCatalog(make('/api/public','GET',origin),context(fetcher))).status,403);
  }
  assert.equal(calls,0);
});
test('Customer checkout and staff requests share one Netlify-to-Apps-Script API',async()=>{
  for(const action of ['create_order','staff_password_login','staff_cms_update','staff_mutate']){
    const received=[];
    const payload={action,client_order_id:'original-test-id',id_token:'test-auth'};
    const fetcher=async(url,init)=>{received.push({url,init});return asRemote({ok:true,action});};
    const res=await operations(make('/api/operations','POST',netlify,payload),context(fetcher));
    assert.equal(res.status,200);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'),null);
    assert.equal((await res.json()).action,action);
    assert.equal(received.length,1);
    assert.equal(received[0].url,script);
    assert.equal(received[0].init.credentials,'omit');
    assert.equal(received[0].init.body,JSON.stringify(payload));
    assert.equal(received[0].init.headers['Content-Type'],'text/plain;charset=utf-8');
  }
});
test('Apps Script authorization errors are preserved and do not create fake success',async()=>{
  const res=await operations(make('/api/operations','POST',netlify,{action:'staff_cms_update',table:'products'}),context(
    async()=>asRemote({ok:false,code:'forbidden',error:'Staff role required.'})
  ));
  assert.equal(res.status,200);
  assert.deepEqual(await res.json(),{ok:false,code:'forbidden',error:'Staff role required.'});
});
test('Untrusted pages, preview and invalid actions are blocked before upstream writes',async()=>{
  let calls=0;
  const f=async()=>{calls++;return asRemote({ok:true});};
  const fake=make('/api/operations','POST','https://example.net',{action:'create_order'});
  assert.equal((await operations(fake,context(f))).status,403);
  const preview=new Request('https://deploy-preview-1--aurorascake.netlify.app/api/operations',{
    method:'POST',headers:{Origin:'https://deploy-preview-1--aurorascake.netlify.app','Content-Type':'text/plain'},body:JSON.stringify({action:'create_order'})
  });
  assert.equal((await operations(preview,context(f))).status,403);
  assert.equal((await operations(make('/api/operations','POST',netlify,{action:'delete_all_orders'}),context(f))).status,400);
  assert.equal(calls,0);
});
test('Netlify public catalogue, health and image endpoints support same-origin requests',async()=>{
  const f=async()=>asRemote({ok:true,schema_version:1,data:{products:[],settings:{shop_name:'Aurora Cake'}}});
  const res=await publicCatalog(make('/api/public'),context(f));
  assert.equal(res.status,200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'),null);
  const healthRes=await backendHealth(make('/api/backend-health'),context(async()=>asRemote({
    ok:true,service:'aurora_public_content',release:'aurora-2026-11-09-sheets-only-r7',
    database_backend:'google_sheets',writes_frozen:false
  })));
  assert.equal(healthRes.status,200);
  assert.equal(healthRes.headers.get('Access-Control-Allow-Origin'),null);
  const imageBad=await publicImage(make('/api/image?id=bad'),context(f));
  assert.equal(imageBad.status,404);
  assert.equal(imageBad.headers.get('Access-Control-Allow-Origin'),null);
});
