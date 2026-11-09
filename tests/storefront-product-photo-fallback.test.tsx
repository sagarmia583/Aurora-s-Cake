import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {create,type ReactTestRenderer} from 'react-test-renderer';
import {StorefrontProductPhoto} from '../src/components/CustomerStorefront';
import {DEFAULT_PUBLIC_SITE_DATA} from './catalog-fixture';

Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
const product={
  ...DEFAULT_PUBLIC_SITE_DATA.products[0],
  id:'test-vanilla',name:'ভ্যানিলা কেক',
  image_url:'https://third-party.invalid/hotlink-denied.jpg',
  gallery_images:['/images/vanilla-cake.jpg','/images/aurora-menu-card.jpg']
};
test('storefront card falls back to the existing local photo when remote CDN fails',async()=>{
  let renderer!:ReactTestRenderer;
  await act(async()=>{renderer=create(React.createElement(StorefrontProductPhoto,{product}));});
  let img=renderer.root.findByType('img');
  assert.equal(img.props.src,product.image_url);
  await act(async()=>img.props.onError());
  img=renderer.root.findByType('img');
  assert.equal(img.props.src,'/images/vanilla-cake.jpg');
  await act(async()=>img.props.onError());
  img=renderer.root.findByType('img');
  assert.equal(img.props.src,'/images/aurora-menu-card.jpg');
  await act(async()=>img.props.onError());
  assert.equal(renderer.root.findAllByType('img').length,0);
  assert.match(JSON.stringify(renderer.toJSON()),/ভ্যানিলা কেক/);
  await act(async()=>renderer.unmount());
});
test('storefront card supports a missing primary URL using existing gallery immediately',async()=>{
  let renderer!:ReactTestRenderer;
  await act(async()=>{renderer=create(React.createElement(StorefrontProductPhoto,
    {product:{...product,image_url:''}}));});
  assert.equal(renderer.root.findByType('img').props.src,'/images/vanilla-cake.jpg');
  await act(async()=>renderer.unmount());
});

test('tiny external Google thumbnail defers to the existing full-size local cake image',async()=>{
  let renderer!:ReactTestRenderer;
  await act(async()=>{renderer=create(React.createElement(StorefrontProductPhoto,{
    product:{...product,image_url:'https://encrypted-tbn0.gstatic.com/images?q=fixture&s=10'}
  }));});
  assert.equal(renderer.root.findByType('img').props.src,'/images/vanilla-cake.jpg');
  await act(async()=>renderer.unmount());
});
