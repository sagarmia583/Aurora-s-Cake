import test from 'node:test';
import assert from 'node:assert/strict';
import publicImage from '../netlify/functions/image.mjs';
const site='https://aurora-test.netlify.app/api/image';
const script='https://script.google.com/macros/s/fixture-123/exec';
const probe=(method='GET',id='ABCDEFGHIJKL')=>new Request(site+'?id='+id,{method});
test('Netlify image gateway refuses unsupported methods and invalid private image ids',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw new Error('Must not reach Apps Script');};
 assert.equal((await publicImage(probe('POST'),{scriptUrl:script,fetcher})).status,405);
 assert.equal((await publicImage(probe('GET','bad'),{scriptUrl:script,fetcher})).status,404);
 assert.equal((await publicImage(probe(),{scriptUrl:'https://invalid.example/',fetcher})).status,503);
 assert.equal(calls,0);
});
test('Netlify image gateway only serves validated script images',async()=>{
 const bytes=Uint8Array.from([137,80,78,71,13,10,26,10,1,2]);
 const fetcher:typeof fetch=async(url,opts)=>{
  assert.equal(opts.method,'GET');assert.equal(opts.credentials,'omit');
  assert.equal(new URL(url).searchParams.get('action'),'public_image');
  return {ok:true,url:'https://script.googleusercontent.com/exec',json:async()=>({ok:true,mime_type:'image/png',base64:Buffer.from(bytes).toString('base64')})} as Response;
 };
 const response=await publicImage(probe(),{scriptUrl:script,fetcher});
 assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'image/png');
 assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);
});
