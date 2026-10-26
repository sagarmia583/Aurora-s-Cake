import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/backend-health.js';
const SCRIPT='https://script.google.com/macros/s/AKfycbw38J4AzlYkAhNtyDAp_CP34fUk9Epae6xz46AQFbF9ye1VsZjxTXmzbJgs52WEoWETMw/exec';
async function check(method='GET'){
  const answer={status:0,body:null as any,headers:{} as Record<string,string>};
  const response={statusCode:200,setHeader(k:string,v:string){answer.headers[k]=v;},
    end(raw:string){answer.status=this.statusCode;answer.body=JSON.parse(raw);}};
  await handler({method} as never,response as never);
  return answer;
}
test('new backend health check confirms exact Apps Script version without private fields',async()=>{
  const old=process.env.AURORA_SCRIPT_POST_URL,fetchBefore=globalThis.fetch;
  process.env.AURORA_SCRIPT_POST_URL=SCRIPT;
  globalThis.fetch=(async()=>({ok:true,url:'https://script.googleusercontent.com/macros/echo',
    json:async()=>({ok:true,service:'aurora_public_content',schema_version:1,
      release:'aurora-2026-10-26-cms-otp-speed-r1',private_key:'never-output'})})) as unknown as typeof fetch;
  try{
    const result=await check();
    assert.equal(result.status,200);
    assert.equal(result.body.up_to_date,true);
    assert.equal(result.body.installed_release,'aurora-2026-10-26-cms-otp-speed-r1');
    assert.equal('private_key' in result.body,false);
    assert.equal(result.headers['Cache-Control'],'no-store');
    assert.equal((await check('POST')).status,405);
  }finally{
    globalThis.fetch=fetchBefore;
    if(old===undefined)delete process.env.AURORA_SCRIPT_POST_URL;
    else process.env.AURORA_SCRIPT_POST_URL=old;
  }
});
test('old Apps Script deployment is reported as outdated, not mistakenly marked live',async()=>{
  const old=process.env.AURORA_SCRIPT_POST_URL,fetchBefore=globalThis.fetch;
  process.env.AURORA_SCRIPT_POST_URL=SCRIPT;
  globalThis.fetch=(async()=>({ok:true,url:'https://script.googleusercontent.com/macros/echo',
    json:async()=>({ok:true,service:'aurora_public_content',schema_version:1})})) as unknown as typeof fetch;
  try{
    const status=await check();
    assert.equal(status.status,200);
    assert.equal(status.body.up_to_date,false);
    assert.equal(status.body.installed_release,'older-or-unknown');
  }finally{
    globalThis.fetch=fetchBefore;
    if(old===undefined)delete process.env.AURORA_SCRIPT_POST_URL;
    else process.env.AURORA_SCRIPT_POST_URL=old;
  }
});
