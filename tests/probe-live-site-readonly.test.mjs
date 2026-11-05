import test from 'node:test';
import assert from 'node:assert/strict';
import {probeLiveSite} from '../scripts/probe-live-site-readonly.mjs';

function reply(url,json,opts={}){
  const body=typeof json==='string'?json:JSON.stringify(json);
  const res=new Response(body,{status:opts.status||200,
    headers:{'Content-Type':opts.html?'text/html':'application/json'}});
  Object.defineProperty(res,'url',{value:String(url)});
  return res;
}
const valid={ok:true,schema_version:1,data:{products:[{id:'p1',name:'Cake'}],
  settings:{shop_name:'Aurora'},order_submission_enabled:true}};
test('only GETs are used, and private response payloads are never printed',async()=>{
  const calls=[];
  const fetcher=async(url,init)=>{
    calls.push({url:String(url),method:init.method,credentials:init.credentials,body:init.body});
    if(String(url).endsWith('/api/backend-health'))
      return reply(url,{ok:true,database_backend:'google_sheets',up_to_date:true,writes_frozen:false});
    if(String(url).endsWith('/api/public')||String(url).includes('action=public'))
      return reply(url,valid);
    if(String(url).includes('action=health'))
      return reply(url,{ok:true,database_backend:'google_sheets'});
    return reply(url,'<html>Shop</html>',{html:true});
  };
  const p=await probeLiveSite({fetcher,
    scriptUrl:new URL('https://script.google.com/macros/s/abc/exec')});
  assert.equal(p.pass,true);
  assert.equal(p.result.netlifyCatalog.products,1);
  assert.equal(calls.length,5);
  for(const call of calls){
    assert.equal(call.method,'GET');assert.equal(call.body,undefined);
    assert.equal(call.credentials,'omit');
  }
});
test('private records cause diagnostic failure without showing the private content',async()=>{
  const fetcher=async(url)=>{
    if(String(url).endsWith('/api/backend-health'))
      return reply(url,{ok:true,database_backend:'google_sheets'});
    if(String(url).endsWith('/api/public')||String(url).includes('action=public'))
      return reply(url,{...valid,data:{...valid.data,orders:[{customer_phone:'01700000000'}]}});
    if(String(url).includes('action=health'))return reply(url,{ok:true});
    return reply(url,'<html>Shop</html>',{html:true});
  };
  const r=await probeLiveSite({fetcher,scriptUrl:new URL('https://script.google.com/macros/s/abc/exec')});
  assert.equal(r.result.netlifyCatalog.reason,'private_field_detected');
  assert.equal(r.result.directScriptCatalog.reason,'private_field_detected');
  assert.equal(r.pass,false);
  assert.doesNotMatch(JSON.stringify(r.result),/01700000000/);
});
test('login redirect or HTML SPA fallback are never accepted as public API',async()=>{
  const fetcher=async(url)=>{
    const res=reply(url,'<html>SPA</html>',{html:true});
    Object.defineProperty(res,'url',{value:'https://accounts.google.com/login'});
    return res;
  };
  const r=await probeLiveSite({fetcher,scriptUrl:null});
  assert.equal(r.pass,false);
  assert.equal(r.result.netlifyCatalog.ok,false);
});
