import test from 'node:test';
import assert from 'node:assert/strict';
import imageHandler from '../api/image.js';

type TestResponse={statusCode:number;headers:Record<string,string>;body:any;setHeader:(name:string,value:string)=>void;end:(body?:any)=>void};
const request=(id:string,method='GET')=>({method,query:{id}});
const invoke=async(id:string,method='GET')=>{
  const response:TestResponse={
    statusCode:200,headers:{},body:null,
    setHeader(name,value){this.headers[name.toLowerCase()]=String(value)},
    end(value){this.body=value}
  };
  await imageHandler(request(id,method) as never,response as never);
  return response;
};
test('free public photo endpoint refuses arbitrary file IDs and methods',async()=>{
  assert.equal((await invoke('../secret')).statusCode,404);
  assert.equal((await invoke('invalid-id','POST')).statusCode,405);
});
test('bakery photo endpoint pins Google Script host and validates image headers',async()=>{
  const old=process.env.AURORA_SCRIPT_POST_URL,prior=globalThis.fetch;
  const id='test_file_123456789abcdef',body=Buffer.from([255,216,255,0,12,45,255,217]);
  try{
    process.env.AURORA_SCRIPT_POST_URL='https://malicious.test/macros/s/abc/exec';
    assert.equal((await invoke(id)).statusCode,503);
    process.env.AURORA_SCRIPT_POST_URL='https://script.google.com/macros/s/ABCDE12345/exec';
    let requested='';
    globalThis.fetch=(async(url:RequestInfo|URL)=>{
      requested=String(url);
      return {ok:true,url:'https://script.googleusercontent.com/macros/echo?user_content_key=test',
        json:async()=>({ok:true,mime_type:'image/jpeg',base64:body.toString('base64')})} as Response;
    }) as typeof fetch;
    const result=await invoke(id);
    assert.equal(result.statusCode,200);
    assert.equal(result.headers['content-type'],'image/jpeg');
    assert.deepEqual(result.body,body);
    assert.match(requested,/action=public_image/);
    assert.match(requested,/id=test_file_123456789abcdef/);
    globalThis.fetch=(async()=>({ok:true,url:'https://script.googleusercontent.com/macros/echo',
      json:async()=>({ok:true,mime_type:'image/jpeg',base64:Buffer.from('not-jpeg').toString('base64')})} as Response)) as typeof fetch;
    assert.equal((await invoke(id)).statusCode,502);
  }finally{
    globalThis.fetch=prior;
    if(old===undefined)delete process.env.AURORA_SCRIPT_POST_URL;
    else process.env.AURORA_SCRIPT_POST_URL=old;
  }
});
