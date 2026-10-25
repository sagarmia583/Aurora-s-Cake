import assert from 'node:assert/strict';
import test from 'node:test';
import handler from '../api/public.js';

const SCRIPT='https://script.google.com/macros/s/AKfycbw38J4AzlYkAhNtyDAp_CP34fUk9Epae6xz46AQFbF9ye1VsZjxTXmzbJgs52WEoWETMw/exec';
async function request(method='GET') {
  const result:{status:number;headers:Record<string,string>;text:string}={status:200,headers:{},text:''};
  const response={
    statusCode:200,
    setHeader(name:string,value:string){result.headers[name.toLowerCase()]=String(value);},
    end(body?:string){result.status=this.statusCode;result.text=body||'';}
  };
  await handler({method} as never,response as never);
  return result;
}
test('public storefront Vercel proxy denies writes and non-Google upstream hosts',async()=>{
  const original=process.env.AURORA_SCRIPT_POST_URL;
  try {
    process.env.AURORA_SCRIPT_POST_URL=SCRIPT;
    assert.equal((await request('POST')).status,405);
    process.env.AURORA_SCRIPT_POST_URL='https://attacker.example/macros/s/fake/exec';
    assert.equal((await request()).status,503);
    process.env.AURORA_SCRIPT_POST_URL='https://script.google.com.evil.test/macros/s/fake/exec';
    assert.equal((await request()).status,503);
  }finally {
    if(original===undefined)delete process.env.AURORA_SCRIPT_POST_URL;
    else process.env.AURORA_SCRIPT_POST_URL=original;
  }
});
test('public storefront Vercel proxy serves only valid public JSON with short-lived edge cache',async()=>{
  const original=process.env.AURORA_SCRIPT_POST_URL,originalFetch=globalThis.fetch;
  process.env.AURORA_SCRIPT_POST_URL=SCRIPT;
  let url='';
  globalThis.fetch=(async(input:RequestInfo|URL)=>{
    url=String(input);
    return {ok:true,url:'https://script.googleusercontent.com/macros/echo?key=abc',
      text:async()=>JSON.stringify({ok:true,schema_version:1,data:{settings:{shop_name:'Cake Test'}}})} as Response;
  }) as typeof fetch;
  try {
    const result=await request();
    assert.equal(result.status,200);
    assert.deepEqual(JSON.parse(result.text).data.settings,{shop_name:'Cake Test'});
    assert.equal(result.headers['cache-control'],'public, s-maxage=20, stale-while-revalidate=30');
    assert.ok(url.startsWith(SCRIPT+'?action=public'));
  }finally {
    globalThis.fetch=originalFetch;
    if(original===undefined)delete process.env.AURORA_SCRIPT_POST_URL;
    else process.env.AURORA_SCRIPT_POST_URL=original;
  }
});
test('public storefront proxy rejects upstream missing public data and private-shaped results',async()=>{
  const original=process.env.AURORA_SCRIPT_POST_URL,originalFetch=globalThis.fetch;
  process.env.AURORA_SCRIPT_POST_URL=SCRIPT;
  globalThis.fetch=(async()=>({ok:true,url:'https://script.googleusercontent.com/macros/echo?key=a',
    text:async()=>JSON.stringify({ok:true,orders:[{customer_phone:'private'}]})}) as Response) as typeof fetch;
  try {assert.equal((await request()).status,502);}
  finally{
    globalThis.fetch=originalFetch;
    if(original===undefined)delete process.env.AURORA_SCRIPT_POST_URL;
    else process.env.AURORA_SCRIPT_POST_URL=original;
  }
});
