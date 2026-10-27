import assert from 'node:assert/strict';
import test from 'node:test';
import handler from '../api/operations.js';

const appOrigin='https://auroras-cake-test.vercel.app';
const deployedScript='https://script.google.com/macros/s/AKfycbw38J4AzlYkAhNtyDAp_CP34fUk9Epae6xz46AQFbF9ye1VsZjxTXmzbJgs52WEoWETMw/exec';
type MockResult={status:number;body:any;headers:Record<string,string>};
async function invoke(method:string,action:string,origin=appOrigin,overrides:Record<string,unknown>={}):Promise<MockResult>{
  const data=JSON.stringify({action,id_token:'not-a-real-token'});
  const headers:Record<string,string>={host:'auroras-cake-test.vercel.app','content-type':'text/plain;charset=utf-8',
    'content-length':String(Buffer.byteLength(data)),'origin':origin};
  const request={method,headers,body:data,...overrides};
  const result:MockResult={status:200,body:null,headers:{}};
  const response={
    statusCode:200,
    setHeader(name:string,value:string){result.headers[name.toLowerCase()]=String(value)},
    end(text:string){result.status=this.statusCode;result.body=JSON.parse(text)},
  };
  await handler(request as never,response as never);
  return result;
}
test('Vercel free relay refuses non-POST, hostile origins and unexpected API actions',async()=>{
  assert.equal((await invoke('GET','staff_orders')).status,405);
  assert.equal((await invoke('POST','staff_orders','https://attacker.example')).status,403);
  assert.equal((await invoke('POST','get_full_database')).status,400);
});
test('Vercel relay rejects dangerous upstream URLs and never forwards arbitrary targets',async()=>{
  const original=process.env.AURORA_SCRIPT_POST_URL;
  try{
    process.env.AURORA_SCRIPT_POST_URL='https://evil.example/malicious';
    assert.equal((await invoke('POST','staff_orders')).status,503);
    process.env.AURORA_SCRIPT_POST_URL='https://script.google.com.evil.example/macros/s/test/exec';
    assert.equal((await invoke('POST','staff_orders')).status,503);
  }finally{
    if(original===undefined)delete process.env.AURORA_SCRIPT_POST_URL;
    else process.env.AURORA_SCRIPT_POST_URL=original;
  }
});
test('Vercel relay reaches the pinned Google script and avoids browser CORS redirects',async()=>{
  const original=process.env.AURORA_SCRIPT_POST_URL;
  const originalFetch=globalThis.fetch;
  process.env.AURORA_SCRIPT_POST_URL=deployedScript;
  let receivedUrl='',body='';
  globalThis.fetch=(async(input:RequestInfo|URL,options?:RequestInit)=>{
    receivedUrl=String(input);body=String(options?.body);
    return {ok:true,url:'https://script.googleusercontent.com/macros/echo?key=x',
      text:async()=>JSON.stringify({ok:true,role:'admin'})} as Response;
  }) as typeof fetch;
  try{
    const outcome=await invoke('POST','staff_session');
    assert.equal(outcome.status,200);
    assert.equal(outcome.body.ok,true);
    assert.equal(outcome.headers['cache-control'],'no-store');
    assert.equal(receivedUrl,deployedScript);
    assert.match(body,/"staff_session"/);
  }finally{
    globalThis.fetch=originalFetch;
    if(original===undefined)delete process.env.AURORA_SCRIPT_POST_URL;
    else process.env.AURORA_SCRIPT_POST_URL=original;
  }
});
