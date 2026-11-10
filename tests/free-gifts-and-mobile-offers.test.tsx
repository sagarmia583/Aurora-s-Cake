import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {normalizePublicSiteData} from '../src/services/googleSheets';
import {DEFAULT_PUBLIC_SITE_DATA} from './catalog-fixture';
import {CustomerStorefront} from '../src/components/CustomerStorefront';
import {
  cleanFreeGiftItems,formatFreeGiftBadge,formatFreeGiftList,
  parseFreeGiftSettings,serializeFreeGiftSettings,getProductFreeGifts
} from '../src/utils/freeGifts';

test('legacy Google Sheet gift list is only a catalogue, not free gifts for every cake',()=>{
  const legacy=normalizePublicSiteData({ok:true,schema_version:1,data:{
    settings:[{key:'complimentary_kit_items',value:'ছুরি, মোমবাতি'},
      {key:'complimentary_kit_title',value:'ফ্রি উপহার'}],
    products:[{id:'prod-vanilla',name:'ভ্যানিলা কেক',base_price:350,is_active:true}]
  }});
  assert.deepEqual(legacy.settings.complimentary_kit_items,['ছুরি','মোমবাতি']);
  assert.deepEqual(legacy.products[0].free_gift_items,[]);
  assert.equal(legacy.settings.complimentary_kit_title,'ফ্রি উপহার');
  assert.equal(formatFreeGiftBadge(cleanFreeGiftItems(legacy.products[0].free_gift_items)),'');
});

test('legacy JSON list, blank/malformed settings and bad values remain safe',()=>{
  const legacy=parseFreeGiftSettings('["ছুরি","মোমবাতি","কার্ড"]');
  assert.deepEqual(legacy.items,['ছুরি','মোমবাতি','কার্ড']);
  assert.equal(formatFreeGiftBadge(legacy.items),'✓ ফ্রি: ছুরি ও মোমবাতি + আরও 1টি');
  assert.deepEqual(parseFreeGiftSettings('{bad-json').items,[]);
  assert.deepEqual(parseFreeGiftSettings('').items,[]);
  assert.equal(formatFreeGiftList([]),'');
});

test('per-product gift mapping round trips through existing Sheet setting and normalized cache',()=>{
  const value=serializeFreeGiftSettings({
    items:['ছুরি','মোমবাতি','কার্ড'],
    products:{'prod-vanilla':['ছুরি','কার্ড'],'prod-chocolate':['মোমবাতি']}
  });
  assert.equal(JSON.parse(value).version,2);
  const data=normalizePublicSiteData({ok:true,schema_version:1,data:{
    settings:[{key:'complimentary_kit_items',value}],
    products:[
      {id:'prod-vanilla',name:'ভ্যানিলা',base_price:350,is_active:true},
      {id:'prod-chocolate',name:'চকলেট',base_price:380,is_active:true},
      {id:'prod-orange',name:'অরেঞ্জ',base_price:350,is_active:true},
    ]
  }});
  assert.deepEqual(data.products.map(p=>p.free_gift_items),[['ছুরি','কার্ড'],['মোমবাতি'],[]]);
  assert.deepEqual(data.settings.complimentary_kit_items,['ছুরি','মোমবাতি','কার্ড']);
  const reload=normalizePublicSiteData(data); // Browser rehydrates a saved normalized snapshot.
  assert.deepEqual(reload.products.map(p=>p.free_gift_items),[['ছুরি','কার্ড'],['মোমবাতি'],[]]);
});

test('each storefront card shows ONLY its own gifts and never a global cake promise',()=>{
  const gifts=parseFreeGiftSettings(serializeFreeGiftSettings({
    items:['ছুরি','মোমবাতি'],products:{'prod-vanilla':['ছুরি']}
  }));
  const products=DEFAULT_PUBLIC_SITE_DATA.products.map(product=>({
    ...product,free_gift_items:getProductFreeGifts(gifts,product.id)
  }));
  const data={...DEFAULT_PUBLIC_SITE_DATA,products,settings:{
    ...DEFAULT_PUBLIC_SITE_DATA.settings,
    complimentary_kit_items:gifts.items,product_free_gifts:gifts.products
  }};
  const html=renderToStaticMarkup(React.createElement(CustomerStorefront,{
    settings:data.settings,products:data.products,categories:data.categories,
    flavors:data.flavors,banners:data.banners,reviews:data.reviews,
    coupons:data.coupons,currency:'৳',searchQuery:'',publicData:data,
    onSelectProduct:()=>{},onOpenTrackOrder:()=>{},onOpenCustomCake:()=>{}
  }));
  const cards=html.match(/<article class="ac-product"[\s\S]*?<\/article>/g)||[];
  const vanilla=cards.find(card=>card.includes('ভ্যানিলা কেক'));
  const chocolate=cards.find(card=>card.includes('চকলেট কেক'));
  assert.ok(vanilla&&chocolate);
  assert.match(vanilla,/✓ ফ্রি: ছুরি/);
  assert.doesNotMatch(chocolate,/✓ ফ্রি:/);
  assert.equal((html.match(/✓ ফ্রি:/g)||[]).length,1,'No cross-product badge leakage');
  assert.doesNotMatch(html,/প্রতিটি কেকের সঙ্গে বিনামূল্যে/);
  assert.doesNotMatch(html,/রিবন হ্যান্ডেল বক্স দেওয়া হয়/);
});

test('legacy global list alone renders no gifts anywhere',()=>{
  const data={...DEFAULT_PUBLIC_SITE_DATA,settings:{
    ...DEFAULT_PUBLIC_SITE_DATA.settings,complimentary_kit_items:['ছুরি','মোমবাতি']
  }};
  const html=renderToStaticMarkup(React.createElement(CustomerStorefront,{
    settings:data.settings,products:data.products,categories:data.categories,
    flavors:data.flavors,banners:data.banners,reviews:data.reviews,
    coupons:data.coupons,currency:'৳',searchQuery:'',publicData:data,
    onSelectProduct:()=>{},onOpenTrackOrder:()=>{},onOpenCustomCake:()=>{}
  }));
  assert.doesNotMatch(html,/✓ ফ্রি:/);
  assert.doesNotMatch(html,/প্রতিটি কেকের সঙ্গে বিনামূল্যে/);
});

test('invalid product assignments and oversized settings cannot leak gifts or overwrite settings',()=>{
  const settings=parseFreeGiftSettings(JSON.stringify({
    version:2,items:['ছুরি','মোমবাতি'],
    products:{'prod-vanilla':['ছুরি','UNKNOWN'], '__proto__':['মোমবাতি'],
      'prod-chocolate':['মোমবাতি']}
  }));
  assert.deepEqual(getProductFreeGifts(settings,'prod-vanilla'),['ছুরি']);
  assert.deepEqual(getProductFreeGifts(settings,'prod-not-present'),[]);
  assert.deepEqual(getProductFreeGifts(settings,'__proto__'),[]);
  assert.throws(()=>serializeFreeGiftSettings({
    items:Array.from({length:21},(_,i)=>String(i)),products:{}
  }),/20 gift/);
  assert.throws(()=>serializeFreeGiftSettings({
    items:['উপহার'],products:Object.fromEntries(
      Array.from({length:350},(_,i)=>['product-'+i,['উপহার']]))
  }),/Too many product gift assignments/);
});

test('touchscreen offer ticker is never paused by sticky mobile hover/focus',()=>{
  const css=fs.readFileSync(new URL('../src/index.css',import.meta.url),'utf8');
  const source=fs.readFileSync(new URL('../src/components/CustomerStorefront.tsx',import.meta.url),'utf8');
  assert.match(css,/@media \(hover: none\), \(pointer: coarse\)/);
  assert.match(css,/animation-play-state: running;/);
  assert.match(css,/@media \(hover: hover\) and \(pointer: fine\)/);
  assert.doesNotMatch(source,/group-hover\/ticker:\[animation-play-state:paused\]/);
});
