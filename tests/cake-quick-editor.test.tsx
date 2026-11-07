import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {CakeQuickEditor} from '../src/components/CakeQuickEditor';
import {normalizeCakeSlug,validateCakeEditor} from '../src/services/cakeQuickEditor';
import type {CakeFormDraft} from '../src/services/cakeQuickEditor';

const example:CakeFormDraft={
  name:'Vanilla Cake',slug:'vanilla-cake',categoryId:'cat-cakes',
  description:'Fresh vanilla',imageUrl:'https://example.com/cake.jpg',
  active:true,featured:false,flavorIds:['flav-vanilla'],
  sizes:[
    {key:'half',name:'½ পাউন্ড',grams:'',regular:'350',discount:'300',active:true},
    {key:'full',name:'১ পাউন্ড',grams:'',regular:'650',discount:'',active:true}
  ]
};
const validate=(cake:CakeFormDraft)=>validateCakeEditor(cake,['cat-cakes'],['flav-vanilla','flav-chocolate']);
test('one cake form validates flavour and independent size-wise regular and offer prices',()=>{
  const plan=validate(example);
  assert.equal(plan.productValues.base_price,350);
  assert.equal(plan.productValues.sale_price,'','Product-level sale cannot spill over to unrelated sizes');
  assert.equal(plan.productValues.allowed_flavor_ids,'["flav-vanilla"]');
  assert.equal(plan.productValues.slug,'vanilla-cake');
  assert.deepEqual(plan.sizes.map(s=>[s.values.name,s.values.price,s.values.sale_price]),
    [['½ পাউন্ড',350,300],['১ পাউন্ড',650,'']]);
  assert.equal(plan.sizes[0].values.weight_grams,0);
});
test('editing existing cake keeps slug and existing size IDs',()=>{
  const edited={...example,id:'product_42',slug:'legacy-old-link',sizes:[
    {...example.sizes[0],id:'variant-half',discount:'330'},
    {...example.sizes[1],id:'variant-full',regular:'700',discount:'660'},
  ]};
  const plan=validate(edited);
  assert.equal(plan.productValues.slug,undefined);
  assert.deepEqual(plan.sizes.map(x=>x.id),['variant-half','variant-full']);
  assert.equal(plan.sizes[1].values.sale_price,660);
});
test('bad prices, duplicate size, invalid references are blocked before any write',()=>{
  assert.throws(()=>validate({...example,sizes:[{...example.sizes[0],discount:'400'}]}),/Discount Price/);
  assert.throws(()=>validate({...example,sizes:[{...example.sizes[0],regular:'abc'}]}),/Regular Price/);
  assert.throws(()=>validate({...example,sizes:[example.sizes[0],{...example.sizes[0],key:'other'}]}),/একই কেকের/);
  assert.throws(()=>validate({...example,categoryId:'does-not-exist'}),/Category/);
  assert.throws(()=>validate({...example,flavorIds:['flav-other']}),/Flavour/);
  assert.throws(()=>validate({...example,sizes:example.sizes.map(s=>({...s,active:false}))}),/Active/);
  assert.throws(()=>validate({...example,slug:'Invalid Slug'}),/Slug/);
  assert.equal(normalizeCakeSlug('Vanilla Cream Cake'),'vanilla-cream-cake');
});
test('quick editor is embedded in both existing Admin management screens without replacing advanced CMS',()=>{
  const website=fs.readFileSync(new URL('../src/components/WebsiteManager.tsx',import.meta.url),'utf8');
  const shop=fs.readFileSync(new URL('../src/components/LiveShopEditor.tsx',import.meta.url),'utf8');
  assert.match(website,/<CakeQuickEditor endpoint=/);
  assert.match(website,/<ProductGiftAssignmentManager endpoint=/);
  assert.match(shop,/<CakeQuickEditor endpoint=/);
  const rendered=renderToStaticMarkup(React.createElement(CakeQuickEditor,{endpoint:'https://example.org',token:'fake',onUpdated:()=>{}}));
  assert.match(rendered,/সহজ Cake Editor/);
  assert.match(rendered,/Cake যোগ \/ Edit করুন/);
  const editor=fs.readFileSync(new URL('../src/components/CakeQuickEditor.tsx',import.meta.url),'utf8');
  for(const table of ['products','product_variants','flavors'])
    assert.match(editor,new RegExp("mutateCmsTable\\(endpoint,token,'"+table+"'"));
  assert.match(editor,/is_active:false/,'New product hidden until its variants are successfully created');
  assert.match(editor,/Product|Cake/);
});
