import test from 'node:test';
import assert from 'node:assert/strict';
import {checkNetlifySheetsRelease,validateSiteOrigin}
 from '../scripts/check-netlify-sheets-release.mjs';
const site='https://aurora-check.netlify.app';
const release='aurora-2026-11-08-order-integrity-r6';
const health={ok:true,expected_release:release,installed_release:release,up_to_date:true,
 database_backend:'google_sheets',writes_frozen:false};
const catalog={ok:true,schema_version:1,data:{settings:{shop_name:'Aurora'},
 products:[{id:'cake-1',name:'Vanilla Cake'}],order_submission_enabled:true}};
const mock=(h=health,p=catalog,calls=[])=>async(url,options)=>{
 calls.push({url,options});
 const data=url.endsWith('/api/backend-health')?h:p;
 return new Response(JSON.stringify(data),{status:200,
  headers:{'Content-Type':'application/json; charset=utf-8'}});
};
test('read-only smoke never transmits credentials or changes data',async()=>{
 const calls=[],result=await checkNetlifySheetsRelease({
  siteUrl:site,expectedRelease:release,fetcher:mock(health,catalog,calls)});
 assert.equal(result.products,1);
 assert.equal(result.order_submission_enabled,true);
 assert.deepEqual(calls.map(x=>new URL(x.url).pathname),
  ['/api/backend-health','/api/public']);
 for(const c of calls){
  assert.equal(c.options.method,'GET');
  assert.equal(c.options.credentials,'omit');
  assert.equal(c.options.redirect,'error');
  assert.equal(c.options.body,undefined);
 }
});
test('rejects URLs outside the authorized Netlify host',()=>{
 for(const url of ['http://aurora-check.netlify.app','https://evil.example',
  'https://aurora-check.netlify.app/api/public','https://aurora-check.netlify.app?token=x',
  'https://u:p@aurora-check.netlify.app','https://localhost']){
  assert.throws(()=>validateSiteOrigin(url));
 }
 assert.equal(validateSiteOrigin('https://cakes.example',
  {approvedCustomOrigin:'https://cakes.example'}),'https://cakes.example');
});
test('rejects stale version, wrong database and frozen writes',async()=>{
 for(const h of [{...health,installed_release:'old',up_to_date:false},
  {...health,database_backend:'supabase'},{...health,writes_frozen:true},
  {...health,writes_frozen:null}]){
  await assert.rejects(()=>checkNetlifySheetsRelease({
   siteUrl:site,expectedRelease:release,fetcher:mock(h,catalog)}));
 }
});
test('rejects private fields, unsupported schema and empty catalog',async()=>{
 for(const p of [
  {...catalog,data:{...catalog.data,orders:[{id:'private'}]}},
  {...catalog,data:{...catalog.data,products:[{id:'p',customer_access_token:'secret'}]}},
  {...catalog,schema_version:2},
  {...catalog,data:{...catalog.data,products:[]}}
 ]){
  await assert.rejects(()=>checkNetlifySheetsRelease({
   siteUrl:site,expectedRelease:release,fetcher:mock(health,p)}));
 }
});
test('rejects HTML SPA fallback rather than claiming success',async()=>{
 const fetcher=async()=>new Response('<html>SPA</html>',{headers:{'Content-Type':'text/html'}});
 await assert.rejects(()=>checkNetlifySheetsRelease({
  siteUrl:site,expectedRelease:release,fetcher}),/non-JSON/);
});
