import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Navbar } from '../src/components/Navbar';
import { CustomerProfileModal } from '../src/components/CustomerProfileModal';
import { CustomerStorefront } from '../src/components/CustomerStorefront';
import { DEFAULT_PUBLIC_SITE_DATA } from '../src/content/defaultSiteData';
import { normalizePublicSiteData } from '../src/services/googleSheets';
import type { PublicSiteData } from '../src/types/siteContent';

const noop = () => {};
function navigation(data: PublicSiteData) {
  return renderToStaticMarkup(<Navbar
    settings={data.settings} publicData={data} activeRole="customer" onRoleChange={noop}
    viewMode="web" onViewModeChange={noop} cartCount={0} onOpenCart={noop} onOrderNow={noop} onOpenProfile={noop}
    onOpenCacheHub={noop} onOpenDbViewer={noop} onOpenSupabaseSync={noop} isSupabaseConnected={false}
    onOpenTrackOrder={noop} onOpenCustomCake={noop} searchQuery="" onSearchChange={noop}
    onOpenSheetSettings={noop} onOpenCustomerAccount={noop} isSheetConnected
  />);
}
function storefront(data: PublicSiteData) {
  return renderToStaticMarkup(<CustomerStorefront
    settings={data.settings} products={data.products} categories={data.categories}
    flavors={data.flavors} banners={data.banners} reviews={data.reviews} currency={data.settings.currency}
    onSelectProduct={noop} onOpenTrackOrder={noop} onOpenCustomCake={noop} onOpenProfile={noop}
    searchQuery="" publicData={data}
  />);
}
function sheetFixture() {
  const data = structuredClone(DEFAULT_PUBLIC_SITE_DATA);
  Object.assign(data.settings,{
    shop_name:'Sheet Bakery',logo_url:'https://images.example.test/sheet-logo.png',
    profile_image_url:'https://images.example.test/sheet-profile.png',phone:'+880 1700 000123',
    whatsapp:'+880 1700 000124',email:'bakery@example.test',
    facebook_url:'https://www.facebook.com/sheet-bakery',instagram_url:'https://www.instagram.com/sheet-bakery',
    address:'Tangail, College Road 42, Unit 9, Bangladesh',top_announcement_text:'Announcement edited in Sheets',
  });
  Object.assign(data.content,{
    brand_tagline:'Brand line from Sheet',hero_title:'Hero heading from Sheet',hero_description:'Hero paragraph from Sheet',
    custom_title:'Custom heading from Sheet',custom_description:'Custom paragraph from Sheet',
    custom_image_url:'https://images.example.test/sheet-custom.png',custom_image_alt:'Custom image from Sheet',
    story_title:'Story heading from Sheet',story_description:'Story paragraph from Sheet',
    story_image_url:'https://images.example.test/sheet-story.png',story_image_alt:'Story image from Sheet',
    social_title:'Social heading from Sheet',footer_about:'Footer message from Sheet',
  });
  data.hero_slides=[{id:'slide-sheet',title:'Slide title from Sheet',image_url:'https://images.example.test/sheet-hero.png',image_alt:'Hero image from Sheet',sort_order:1,is_active:true}];
  data.highlights=[{id:'occasion-sheet',section:'occasion',title:'Occasion from Sheet',description:'Occasion description',image_url:'https://images.example.test/sheet-occasion.png',image_alt:'Occasion image',category_id:'sheet-category',sort_order:1,is_active:true}];
  data.categories=[{id:'sheet-category',name:'Category from Sheet',slug:'sheet-category',description:'Sheet category',image_url:'',sort_order:1,is_active:true}];
  const product=structuredClone(data.products[0]);
  product.id='sheet-product';product.name='Cake from Sheet';product.category_id='sheet-category';product.category_name='Category from Sheet';
  product.image_url='https://images.example.test/sheet-product.png';product.variants=[{id:'sheet-variant',product_id:'sheet-product',name:'750g',weight_grams:750,price:888,is_active:true}];
  data.products=[product];
  data.faqs=[{id:'faq-sheet',question:'Question from Sheet?',answer:'Answer maintained in Sheet.',sort_order:1,is_active:true}];
  data.links=[{id:'link-sheet',label:'Sheet bakery gallery',url:'https://gallery.example.test/',location:'footer',sort_order:1,is_active:true}];
  return normalizePublicSiteData({ok:true,schema_version:1,data});
}

test('Sheet business name, logo, announcement and contact links reach navigation/footer',()=>{
  const data=sheetFixture();
  const nav=navigation(data);
  const page=storefront(data);
  assert.ok(nav.includes('Sheet Bakery'));
  assert.ok(nav.includes('sheet-logo.png'));
  assert.ok(nav.includes('Announcement edited in Sheets'));
  assert.ok(nav.includes('Brand line from Sheet'));
  assert.ok(nav.includes('https://www.facebook.com/sheet-bakery'));
  assert.ok(!nav.includes('aurorascake26'));
  assert.ok(page.includes('href="tel:+8801700000123"'));
  assert.ok(page.includes('href="mailto:bakery@example.test"'));
  assert.ok(page.includes('https://wa.me/8801700000124'));
  assert.ok(page.includes('Tangail, College Road 42, Unit 9, Bangladesh'));
  assert.ok(page.includes('https://gallery.example.test/'));
});

test('Sheet hero, custom/story images, profile, catalogue and FAQs replace bundled content',()=>{
  const data=sheetFixture();
  const page=storefront(data);
  for(const expected of [
    'Hero heading from Sheet','Hero paragraph from Sheet','Slide title from Sheet','sheet-hero.png',
    'Custom heading from Sheet','Custom paragraph from Sheet','sheet-custom.png',
    'Story heading from Sheet','Story paragraph from Sheet','sheet-story.png','sheet-profile.png',
    'Occasion from Sheet','sheet-occasion.png','Cake from Sheet','Category from Sheet','sheet-product.png',
    'Question from Sheet?','Answer maintained in Sheet.','Footer message from Sheet',
  ]) assert.ok(page.includes(expected),expected+' should render from the Sheet fixture');
  assert.ok(page.includes('888'));
  assert.ok(!page.includes('Belgian Triple Chocolate Fudge'));
});

test('intentional empty public lists and blank photos do not restore demo catalogue or image cards',()=>{
  const data=structuredClone(DEFAULT_PUBLIC_SITE_DATA);
  data.products=[];data.categories=[];data.hero_slides=[];data.highlights=[];data.faqs=[];data.links=[];
  Object.assign(data.settings,{shop_name:'Empty Sheet shop',logo_url:'',profile_image_url:'',facebook_url:'',instagram_url:'',youtube_url:'',tiktok_url:'',website_url:'',phone:'',whatsapp:'',email:''});
  Object.assign(data.content,{custom_image_url:'',story_image_url:'',hero_title:'',hero_description:'',social_title:''});
  const normalized=normalizePublicSiteData(data);
  const page=storefront(normalized);
  assert.ok(page.includes('Empty Sheet shop'));
  assert.ok(!page.includes('<img'));
  assert.ok(!page.includes('<summary'));
  assert.ok(!page.includes('aurorascake26'));
  assert.ok(page.includes('ac-results-line" aria-live="polite">0 '));
  for(const product of DEFAULT_PUBLIC_SITE_DATA.products) assert.ok(!page.includes(product.name));
  assert.ok(!page.includes('Good days.'));
});

test('Sheet copy is rendered as plain text rather than HTML',()=>{
  const data=sheetFixture();
  data.content.hero_title='<script>window.bad=true</script>';
  const page=storefront(normalizePublicSiteData(data));
  assert.ok(page.includes('&lt;script&gt;window.bad=true&lt;/script&gt;'));
  assert.ok(!page.includes('<script>'));
});


test('checkout shortcut is directly beside bag and signup/my-orders navigation is hidden',()=>{
  const nav=navigation(sheetFixture());
  assert.match(nav,/aria-label="Open shopping bag[^"]*"[^>]*>/);
  assert.match(nav,/Order Now/);
  assert.ok(nav.indexOf('Order Now')>nav.indexOf('Open shopping bag'));
  assert.ok(!nav.includes('Customer details / My orders'));
  assert.ok(!nav.includes('Sign up / My orders'));
});

test('Customer Profile offers mobile account login and secure cross-device history tracking',()=>{
  const markup=renderToStaticMarkup(<CustomerProfileModal
    isOpen={true} onClose={noop} accountEndpoint="https://script.google.com/macros/s/test/exec"
    historySyncing={false} onSyncHistory={noop} orders={[]}
    products={[]} currency="৳" onReorder={noop} onTrackOrder={noop}
    onRecover={noop} onOpenAccount={noop}
  />);
  assert.ok(markup.includes('Mobile number'));
  assert.ok(markup.includes('Load my orders'));
  assert.ok(markup.includes('Mobile account password'));
  assert.ok(markup.includes('Create mobile account / recover original receipt'));
  assert.ok(markup.includes('phone number alone cannot unlock private addresses'));
});
