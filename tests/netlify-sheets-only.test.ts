import test from 'node:test';
import assert from 'node:assert/strict';
import publicCatalog from '../netlify/functions/public.mjs';
import health from '../netlify/functions/backend-health.mjs';
import {createSheetOrderAttempt,SheetOrderSubmissionError} from '../src/services/googleSheetOrders';

const scriptUrl='https://script.google.com/macros/s/fixture-123/exec';
const host='https://aurora-test.netlify.app';
const request=(path:string,method='GET')=>new Request(host+path,{method});

test('Netlify public catalog is read-only, validates source host and never returns private data',async()=>{
  const calls:string[]=[];
  const fetcher:typeof fetch=async (url,opts)=>{
    calls.push(String(url));
    assert.equal(opts?.method,'GET');
    assert.equal(opts?.credentials,'omit');
    return {ok:true,url:'https://script.googleusercontent.com/relay',text:async()=>JSON.stringify({
      ok:true,schema_version:1,data:{products:[{id:'cake-1',name:'Cake'}],settings:{shop_name:'Aurora'}}
    })} as Response;
  };
  const response=await publicCatalog(request('/api/public'),{scriptUrl,fetcher});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control')?.includes('s-maxage=20'),true);
  assert.equal(calls.length,1);
  assert.equal(new URL(calls[0]).searchParams.get('action'),'public');
  assert.equal((await response.json()).data.products[0].id,'cake-1');
  assert.equal((await publicCatalog(request('/api/public','POST'),{scriptUrl,fetcher})).status,405);
  assert.equal((await publicCatalog(request('/api/public'),{scriptUrl:'https://evil.example/x',fetcher})).status,503);
  assert.equal(calls.length,1);
});

test('Netlify health checks Google Sheets release without returning Script Properties',async()=>{
  const fetcher=async()=>({ok:true,url:'https://script.googleusercontent.com/relay',
    json:async()=>({ok:true,service:'aurora_public_content',release:'aurora-2026-11-03-staff-order-alerts-r5',
      database_backend:'google_sheets',SECRET:'must-not-leak'})} as Response);
  const response=await health(request('/api/backend-health'),{scriptUrl,fetcher});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.up_to_date,true);
  assert.equal(body.database_backend,'google_sheets');
  assert.equal('SECRET' in body,false);
});

test('live gift order payload preserves recipient, price privacy, idempotent retries',()=>{
  const endpoint=scriptUrl;
  const draft={customer_name:'Buyer',customer_phone:'01700000000',delivery_address:'Tangail Sadar',
    delivery_zone_id:'zone-1',delivery_slot:'10:00 AM - 12:00 PM',delivery_date:'2099-12-01',
    cart_items:[{product_id:'cake-1',variant_id:'half-1',addon_ids:[],writing_message:'Happy birthday',quantity:1}],
    payment_method:'cod' as const,is_gift:true,recipient_name:'Aurora',recipient_phone:'01712345678',
    sender_name:'Parent',sender_phone:'01723456789',hide_price_on_box:true,gift_card_message:'For you'};
  const first=createSheetOrderAttempt(endpoint,draft);
  assert.deepEqual(createSheetOrderAttempt(endpoint,draft,first),first);
  const saved=JSON.parse(first.body);
  assert.equal(saved.recipient_name,'Aurora');
  assert.equal(saved.hide_price_on_box,true);
  assert.equal(saved.gift_card_message,'For you');
  const changed=createSheetOrderAttempt(endpoint,{...draft,recipient_phone:'01734567890'},first);
  assert.notEqual(changed.request_id,first.request_id);
  assert.throws(()=>createSheetOrderAttempt(endpoint,{...draft,recipient_phone:'bad'}),SheetOrderSubmissionError);
});
