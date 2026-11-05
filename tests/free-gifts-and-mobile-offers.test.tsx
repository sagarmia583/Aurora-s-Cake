import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { normalizePublicSiteData } from '../src/services/googleSheets';
import { DEFAULT_PUBLIC_SITE_DATA } from '../src/content/defaultSiteData';
import { CustomerStorefront } from '../src/components/CustomerStorefront';
import {cleanFreeGiftItems,formatFreeGiftBadge,formatFreeGiftList} from '../src/utils/freeGifts';

test('Google Sheet comma list is normalized into editable free items',()=>{
  const parsed = normalizePublicSiteData({ok:true,schema_version:1,data:{
    settings:[{key:'complimentary_kit_items',value:'ছুরি, মোমবাতি'},
      {key:'complimentary_kit_title',value:'ফ্রি উপহার'}]
  }});
  assert.deepEqual(parsed.settings.complimentary_kit_items,['ছুরি','মোমবাতি']);
  assert.equal(parsed.settings.complimentary_kit_title,'ফ্রি উপহার');
  assert.equal(formatFreeGiftBadge(cleanFreeGiftItems(parsed.settings.complimentary_kit_items)),
    '✓ ফ্রি: ছুরি ও মোমবাতি');
});
test('Google Sheet JSON-list, missing items, and empty settings are supported',()=>{
  const json=normalizePublicSiteData({ok:true,schema_version:1,data:{settings:[
    {key:'complimentary_kit_items',value:'["ছুরি","মোমবাতি","কার্ড"]'}
  ]}});
  assert.deepEqual(json.settings.complimentary_kit_items,['ছুরি','মোমবাতি','কার্ড']);
  assert.equal(formatFreeGiftBadge(json.settings.complimentary_kit_items||[]),
    '✓ ফ্রি: ছুরি ও মোমবাতি + আরও 1টি');
  const empty=normalizePublicSiteData({ok:true,schema_version:1,data:{settings:[
    {key:'complimentary_kit_items',value:''}
  ]}});
  assert.deepEqual(empty.settings.complimentary_kit_items,[]);
  assert.equal(formatFreeGiftBadge(empty.settings.complimentary_kit_items||[]),'');
  assert.equal(formatFreeGiftList([]),'');
});
function renderWith(items:string[]){
  const data={...DEFAULT_PUBLIC_SITE_DATA,settings:{...DEFAULT_PUBLIC_SITE_DATA.settings,
    complimentary_kit_items:items,complimentary_kit_title:'ফ্রি উপহার'}};
  return renderToStaticMarkup(React.createElement(CustomerStorefront,{
    settings:data.settings,products:data.products,categories:data.categories,
    flavors:data.flavors,banners:data.banners,reviews:data.reviews,
    coupons:data.coupons,currency:'৳',searchQuery:'',publicData:data,
    onSelectProduct:()=>{},onOpenTrackOrder:()=>{},onOpenCustomCake:()=>{}
  }));
}
test('storefront reads badges and cake-care promise from Sheet-controlled gifts',()=>{
  const html=renderWith(['ছুরি','মোমবাতি']);
  assert.match(html,/✓ ফ্রি: ছুরি ও মোমবাতি/);
  assert.match(html,/বিনামূল্যে ছুরি ও মোমবাতি দেওয়া হয়/);
  assert.doesNotMatch(html,/রিবন হ্যান্ডেল বক্স দেওয়া হয়/);
  const noGifts=renderWith([]);
  assert.doesNotMatch(noGifts,/✓ ফ্রি:/);
  assert.doesNotMatch(noGifts,/প্রতিটি কেকের সঙ্গে বিনামূল্যে/);
});
test('touchscreen offer ticker is never paused by sticky mobile hover/focus',()=>{
  const css=fs.readFileSync(new URL('../src/index.css',import.meta.url),'utf8');
  const source=fs.readFileSync(new URL('../src/components/CustomerStorefront.tsx',import.meta.url),'utf8');
  assert.match(css,/@media \(hover: none\), \(pointer: coarse\)/);
  assert.match(css,/animation-play-state: running;/);
  assert.match(css,/@media \(hover: hover\) and \(pointer: fine\)/);
  assert.doesNotMatch(source,/group-hover\/ticker:\[animation-play-state:paused\]/);
});
