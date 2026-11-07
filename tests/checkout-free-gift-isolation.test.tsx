import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {Product} from '../src/types';
import {CheckoutProductGiftNote} from '../src/components/CheckoutProductGiftNote';
import {getProductFreeGifts,parseFreeGiftSettings} from '../src/utils/freeGifts';

const makeProduct=(id:string,name:string,gifts:string[]|undefined):Product=>({
  id,name,category_id:'cakes',slug:id,description:'',
  base_price:350,image_url:'/images/cake.jpg',gallery_images:[],
  is_active:true,is_featured:false,rating:0,review_count:0,
  variants:[],allowed_flavor_ids:[],allowed_addon_ids:[],
  free_gift_items:gifts
});
test('checkout gift note displays only the matching product assigned gifts',()=>{
  const config=parseFreeGiftSettings(JSON.stringify({
    version:2,items:['ছুরি','মোমবাতি','কার্ড'],products:{
      'prod-vanilla':['ছুরি','মোমবাতি'],'prod-chocolate':['কার্ড']
    }
  }));
  const vanilla=makeProduct('prod-vanilla','ভ্যানিলা কেক',getProductFreeGifts(config,'prod-vanilla'));
  const chocolate=makeProduct('prod-chocolate','চকলেট কেক',getProductFreeGifts(config,'prod-chocolate'));
  const orange=makeProduct('prod-orange','অরেঞ্জ কেক',getProductFreeGifts(config,'prod-orange'));
  const chocolateHtml=renderToStaticMarkup(React.createElement(CheckoutProductGiftNote,{product:chocolate}));
  assert.match(chocolateHtml,/কার্ড/);
  assert.doesNotMatch(chocolateHtml,/ছুরি|মোমবাতি/);
  const vanillaHtml=renderToStaticMarkup(React.createElement(CheckoutProductGiftNote,{product:vanilla}));
  assert.match(vanillaHtml,/ছুরি ও মোমবাতি/);
  assert.doesNotMatch(vanillaHtml,/কার্ড/);
  assert.equal(renderToStaticMarkup(React.createElement(CheckoutProductGiftNote,{product:orange})),'');
});
test('checkout never displays a default free kit when product gifts are absent',()=>{
  const unassigned=makeProduct('prod-chocolate','চকলেট',undefined);
  assert.equal(renderToStaticMarkup(React.createElement(CheckoutProductGiftNote,{product:unassigned})),'');
  assert.equal(renderToStaticMarkup(React.createElement(CheckoutProductGiftNote,{product:{...unassigned,free_gift_items:[]}})),'');
  const source=fs.readFileSync(new URL('../src/components/CheckoutModal.tsx',import.meta.url),'utf8');
  assert.match(source,/<CheckoutProductGiftNote product=\{it\.product\}/);
  assert.doesNotMatch(source,/shopSettings\?\.complimentary_kit_items/);
  assert.doesNotMatch(source,/\['ফ্রি কেক কাটার ছুরি', 'ফ্রি মোমবাতি'/);
  assert.doesNotMatch(source,/প্রতিটি কেকের সাথে পাচ্ছেন/);
});
test('checkout gift label cannot use untrusted HTML',()=>{
  const product=makeProduct('p','Cake',['<script>alert(1)</script>']);
  const html=renderToStaticMarkup(React.createElement(CheckoutProductGiftNote,{product}));
  assert.doesNotMatch(html,/<script>/);
  assert.match(html,/&lt;script&gt;/);
});
