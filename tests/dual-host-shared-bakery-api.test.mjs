import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import operations from '../netlify/functions/operations.mjs';
import publicCatalog from '../netlify/functions/public.mjs';
import backendHealth from '../netlify/functions/backend-health.mjs';
import publicImage from '../netlify/functions/image.mjs';

const pages='https://sagarmia583.github.io';
const netlify='https://aurorascake.netlify.app';
const script='https://script.google.com/macros/s/AKfycbw38J4AzlYkAhNtyDAp_CP34fUk9Epae6xz46AQFbF9ye1VsZjxTXmzbJgs52WEoWETMw/exec';
const make=(route,method='GET',origin=pages,body,headers={})=>new Request(netlify+route,{
  method,headers:{...(origin?{Origin:origin}:{}),...headers,...(body?{'Content-Type':'text/plain;charset=utf-8'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
});
const asRemote=(body)=>{const response=new Response(JSON.stringify(body),{status:200});Object.defineProperty(response,'url',{value:'https://script.googleusercontent.com/macros/echo'});return response;};
const context=(fetcher)=>({scriptUrl:script,fetcher});
test('Pages origin preflight only approved on production Netlify Functions',async()=>{
  const f=async()=>{throw new Error('should not call upstream');};
  const allowed=await operations(make('/api/operations','OPTIONS',pages,undefined,{
    'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'
  }),context(f));
  assert.equal(allowed.status,204);
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'),pages);
  assert.equal(allowed.headers.get('Access-Control-Allow-Headers'),'Content-Type');
  assert.equal(allowed.headers.get('Access-Control-Allow-Credentials'),null);
  const evil=await operations(make('/api/operations','OPTIONS','https://evil.example',undefined,{
    'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'
  }),context(f));
  assert.equal(evil.status,403);
  assert.equal(evil.headers.get('Access-Control-Allow-Origin'),null);
  const unusual=await operations(make('/api/operations','OPTIONS',pages,undefined,{
    'Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'authorization'
  }),context(f));
  assert.equal(unusual.status,403);
  const preview=await operations(new Request('https://deploy-preview-45--aurorascake.netlify.app/api/operations',{
    method:'OPTIONS',headers:{Origin:pages,'Access-Control-Request-Method':'POST'}
  }),context(f));
  assert.equal(preview.status,403);
});
test('Customer checkout and staff requests share one Netlify-to-Apps-Script API',async()=>{
  for(const action of ['create_order','staff_password_login','staff_cms_update','staff_mutate']){
    const received=[];
    const payload={action,client_order_id:'original-test-id',id_token:'test-auth'};
    const fetcher=async(url,init)=>{received.push({url,init});return asRemote({ok:true,action});};
    const res=await operations(make('/api/operations','POST',pages,payload),context(fetcher));
    assert.equal(res.status,200);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'),pages);
    assert.equal((await res.json()).action,action);
    assert.equal(received.length,1);
    assert.equal(received[0].url,script);
    assert.equal(received[0].init.credentials,'omit');
    assert.equal(received[0].init.body,JSON.stringify(payload));
    assert.equal(received[0].init.headers['Content-Type'],'text/plain;charset=utf-8');
  }
});
test('Apps Script authorization errors are preserved and do not create fake success',async()=>{
  const res=await operations(make('/api/operations','POST',pages,{action:'staff_cms_update',table:'products'}),context(
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
    method:'POST',headers:{Origin:pages,'Content-Type':'text/plain'},body:JSON.stringify({action:'create_order'})
  });
  assert.equal((await operations(preview,context(f))).status,403);
  assert.equal((await operations(make('/api/operations','POST',pages,{action:'delete_all_orders'}),context(f))).status,400);
  assert.equal(calls,0);
});
test('Netlify public catalogue, health and image endpoints support Pages CORS',async()=>{
  const f=async()=>asRemote({ok:true,schema_version:1,data:{products:[],settings:{shop_name:'Aurora Cake'}}});
  const res=await publicCatalog(make('/api/public'),context(f));
  assert.equal(res.status,200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'),pages);
  const healthRes=await backendHealth(make('/api/backend-health'),context(async()=>asRemote({
    ok:true,service:'aurora_public_content',release:'aurora-2026-11-08-order-integrity-r6',
    database_backend:'google_sheets',writes_frozen:false
  })));
  assert.equal(healthRes.status,200);
  assert.equal(healthRes.headers.get('Access-Control-Allow-Origin'),pages);
  const imageBad=await publicImage(make('/api/image?id=bad'),context(f));
  assert.equal(imageBad.status,404);
  assert.equal(imageBad.headers.get('Access-Control-Allow-Origin'),pages);
});
test('Pages verification stays read-only and never enables the Netlify relay',()=>{
  const files=(path)=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
  const api=files('src/services/dualHosting.ts');
  const page=files('.github/workflows/github-pages.yml');
  const sheet=files('src/services/googleSheets.ts');
  const staff=files('src/services/sheetStaffApi.ts');
  assert.match(api,/VITE_SHARED_BAKERY_API_ORIGIN/);
  assert.match(api,/https:\/\/aurorascake\.netlify\.app/);
  assert.match(api,/isGitHubPagesReadOnly/);
  assert.match(page,/VITE_SHARED_BAKERY_API_ORIGIN: ""/);
  assert.doesNotMatch(page,/actions\/(?:deploy-pages|upload-pages-artifact)/);
  assert.match(sheet,/getSharedBakeryApiUrl\('\/api\/operations'\)/);
  assert.match(staff,/getSharedBakeryApiUrl\('\/api\/operations'\)/);
  assert.match(sheet,/if\(sharedPublic\)throw new GoogleSheetsError/);
});
