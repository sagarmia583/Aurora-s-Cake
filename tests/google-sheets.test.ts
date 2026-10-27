import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { DEFAULT_PUBLIC_SITE_DATA } from '../src/content/defaultSiteData';
import { GoogleSheetsError, normalizePublicSiteData, normalizePublicUrl, validateGoogleSheetsEndpoint, sheetsPostCredentials } from '../src/services/googleSheets';

const clone = () => structuredClone(DEFAULT_PUBLIC_SITE_DATA);

test('key/value Sheet settings preserve blank, false and zero values', () => {
  const result=normalizePublicSiteData({settings:[{key:'shop_name',value:'Sheet Bakery'},{key:'phone',value:''},{key:'accepting_orders',value:'FALSE'},{key:'delivery_enabled',value:0}],content:[{key:'hero_title',value:''}],products:[]});
  assert.equal(result.settings.shop_name,'Sheet Bakery');
  assert.equal(result.settings.phone,'');
  assert.equal(result.settings.accepting_orders,false);
  assert.equal(result.settings.delivery_enabled,false);
  assert.equal(result.content.hero_title,'');
  assert.deepEqual(result.products,[]);
});

test('flat variant rows join products and keep zero sale price and active flags',()=>{
  const fixture=clone();
  const product=fixture.products[0];
  const raw={...fixture,products:[{...product,variants:undefined,allowed_flavor_ids:product.allowed_flavor_ids.join(','),allowed_addon_ids:JSON.stringify(product.allowed_addon_ids)}],product_variants:[{...product.variants[0],sale_price:0,is_active:'TRUE'},{...product.variants[1],is_active:'FALSE'}],product_addons:fixture.addons,addons:undefined};
  const result=normalizePublicSiteData({ok:true,schema_version:1,data:raw});
  assert.equal(result.products[0].variants.length,1);
  assert.equal(result.products[0].variants[0].sale_price,0);
  assert.deepEqual(result.products[0].allowed_flavor_ids,product.allowed_flavor_ids);
});

test('unsafe URL schemes are rejected and public Drive images are normalized',()=>{
  assert.throws(()=>normalizePublicUrl('javascript:alert(1)'),GoogleSheetsError);
  assert.throws(()=>normalizePublicUrl('data:image/svg+xml,anything','logo',true),GoogleSheetsError);
  assert.equal(normalizePublicUrl('https://drive.google.com/file/d/abc_123/view?usp=sharing','image',true),'https://drive.google.com/thumbnail?id=abc_123&sz=w1600');
  assert.equal(normalizePublicUrl('/images/cake.webp','image',true),'/images/cake.webp');
});

test('duplicate IDs, unsupported schema and invalid prices fail validation',()=>{
  const fixture=clone();
  assert.throws(()=>normalizePublicSiteData({...fixture,categories:[fixture.categories[0],fixture.categories[0]]}),/duplicate id/);
  assert.throws(()=>normalizePublicSiteData({ok:true,schema_version:2,data:fixture}),/schema version 1/);
  assert.throws(()=>normalizePublicSiteData({...fixture,products:[{...fixture.products[0],variants:[{...fixture.products[0].variants[0],price:'free'}]}]}),/non-negative number/);
});

test('private and unknown fields are stripped and only approved reviews survive',()=>{
  const fixture=clone();
  const result=normalizePublicSiteData({...fixture,orders:[{customer_phone:'private'}],staff:[{password:'private'}],settings:{...fixture.settings,password:'private',customer_email:'private'},content:{...fixture.content,customer_phone:'private',api_token:'private'},products:[{...fixture.products[0],customer_address:'private'}],reviews:[{id:'review-1',product_id:'cake',rating:5,comment:'Not approved',status:'pending'}]});
  const serialized=JSON.stringify(result);
  assert.equal(serialized.includes('private'),false);
  assert.equal('orders' in result,false);
  assert.equal('customer_address' in result.products[0],false);
  assert.deepEqual(result.reviews,[]);
});

test('Google login HTML is a permission error, not a successful data response',()=>{
  assert.throws(()=>normalizePublicSiteData('<html>Google Accounts sign in accounts.google.com</html>'),(error:unknown)=>error instanceof GoogleSheetsError&&error.code==='permission_required');
  assert.throws(()=>normalizePublicSiteData('<html>Not a JSON API</html>'),(error:unknown)=>error instanceof GoogleSheetsError&&error.code==='invalid_response');
});

test('endpoint validation restricts executable JSONP to Apps Script web app URLs',()=>{
  assert.equal(validateGoogleSheetsEndpoint('https://script.google.com/macros/s/abc_123/exec?ignored=1').href,'https://script.google.com/macros/s/abc_123/exec');
  assert.throws(()=>validateGoogleSheetsEndpoint('https://example.com/api'),GoogleSheetsError);
  assert.throws(()=>validateGoogleSheetsEndpoint('http://script.google.com/macros/s/abc/exec'),GoogleSheetsError);
});

test('Apps Script GET exposes only allowlisted public data and POST rejects missing orders',()=>{
  const reads:string[]=[];
  const tables:Record<string,unknown[][]>={
    settings:[['key','value'],['shop_name','Live Bakery'],['password','do-not-expose']],
    content:[['key','value'],['hero_title','From Sheet'],['customer_phone','do-not-expose']],
    products:[['id','category_id','name','base_price','image_url','is_active','customer_phone'],['p1','c1','Cake',700,'/images/cake.webp',true,'do-not-expose']],
    product_variants:[['id','product_id','name','weight_grams','price','is_active'],['v1','p1','500g',500,700,true]],
    categories:[['id','name','is_active'],['c1','Birthday',true]],
    orders:[['id','phone'],['private','do-not-expose']],
  };
  const getSheet=(name:string)=>{
    reads.push(name);
    const values=tables[name];if(!values)return null;
    return {getLastRow:()=>values.length,getLastColumn:()=>values[0].length,getRange:()=>({getValues:()=>structuredClone(values)})};
  };
  const context:Record<string,any>={
    console,Date,JSON,Object,Array,String,
    SpreadsheetApp:{openById:()=>({getSheetByName:getSheet}),getActiveSpreadsheet:()=>({getSheetByName:getSheet})},
    PropertiesService:{getScriptProperties:()=>({getProperty:()=>null})},
    CacheService:{getScriptCache:()=>({get:()=>null,put:()=>{},remove:()=>{}})},
    ContentService:{MimeType:{JSON:'json',JAVASCRIPT:'js'},createTextOutput:(content:string)=>({content,setMimeType(){return this;}})},
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8'),context);
  const response=JSON.parse(context.doGet({parameter:{action:'public'}}).content);
  assert.equal(response.ok,true);
  assert.equal(response.data.settings.shop_name,'Live Bakery');
  assert.equal(response.data.products[0].variants[0].id,'v1');
  assert.equal(JSON.stringify(response).includes('do-not-expose'),false);
  assert.equal(reads.includes('orders'),false);
  const invalidPost=JSON.parse(context.doPost().content);
  assert.equal(invalidPost.success,false);
  assert.equal(invalidPost.persisted,false);
  assert.equal(response.data.order_submission_enabled,true);
  assert.equal(JSON.parse(context.doGet({parameter:{action:'setup'}}).content).ok,false);
  assert.equal(JSON.parse(context.doGet({parameter:{action:'public',callback:'alert(1)'}}).content).ok,false);
});


test('protected Vercel Preview relay keeps only same-origin cookies, never sends cookies to Google',()=>{
  assert.equal(sheetsPostCredentials('/api/operations'),'same-origin');
  assert.equal(sheetsPostCredentials('https://script.google.com/macros/s/test/exec'),'omit');
  assert.equal(sheetsPostCredentials('https://example.com/api/operations'),'omit');
  assert.equal(sheetsPostCredentials('//attacker.example/api/operations'),'omit');
});
