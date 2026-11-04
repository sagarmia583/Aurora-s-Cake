import test from 'node:test';
import assert from 'node:assert/strict';
import publicCatalog from '../netlify/functions/public.mjs';
import backendHealth from '../netlify/functions/backend-health.mjs';
import {EXPECTED_RELEASE} from '../functions/api/backend-health.js';

const origin='https://aurorascake.netlify.app';
const script='https://script.google.com/macros/s/VALID_TEST_DEPLOYMENT/exec';
const mock=(data,finalUrl='https://script.googleusercontent.com/macros/echo')=>async()=>({
  ok:true,url:finalUrl,text:async()=>JSON.stringify(data),json:async()=>data
});
test('Netlify public catalog is read only, restricted to pinned Google Apps Script',async()=>{
  const req=new Request(origin+'/api/public');
  assert.equal((await publicCatalog(new Request(req.url,{method:'POST'}),{scriptUrl:script})).status,405);
  assert.equal((await publicCatalog(req,{scriptUrl:'https://evil.example/macros/s/x/exec'})).status,503);
  assert.equal((await publicCatalog(req,{scriptUrl:script,fetcher:mock({ok:true,data:{products:[]},schema_version:1})})).status,200);
  assert.equal((await publicCatalog(req,{scriptUrl:script,fetcher:mock({ok:true,data:{},schema_version:1},'https://evil.example')})).status,502);
});
test('Netlify health check rejects other databases and compares deployed release',async()=>{
  const req=new Request(origin+'/api/backend-health');
  const sheets={ok:true,service:'aurora_public_content',release:EXPECTED_RELEASE,database_backend:'google_sheets'};
  const ready=await backendHealth(req,{scriptUrl:script,fetcher:mock(sheets)});
  assert.equal(ready.status,200);
  assert.equal((await ready.json()).up_to_date,true);
  const foreign=await backendHealth(req,{scriptUrl:script,fetcher:mock({...sheets,database_backend:'supabase'})});
  assert.equal(foreign.status,503);
  assert.equal((await foreign.json()).code,'unexpected_database_backend');
});
