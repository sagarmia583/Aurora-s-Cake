import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePublicSiteData } from '../src/services/googleSheets';
import { DEFAULT_PUBLIC_SITE_DATA } from '../src/content/defaultSiteData';

test('only a literal code capability enables private Sheet checkout', () => {
  const data={settings:{},products:[]};
  assert.equal(normalizePublicSiteData({...data,order_submission_enabled:true}).order_submission_enabled,true);
  assert.equal(normalizePublicSiteData({...data,order_submission_enabled:'true'}).order_submission_enabled,false);
  assert.equal(normalizePublicSiteData({...data,settings:{order_submission_enabled:true}}).order_submission_enabled,false);
});
test('an older endpoint never inherits order capability from a cached/default snapshot', () => {
  assert.equal(normalizePublicSiteData({settings:{},products:[]},{...DEFAULT_PUBLIC_SITE_DATA,order_submission_enabled:true}).order_submission_enabled,false);
});

test('automatic customer profile saving requires a literal backend capability, never a setting or stale default',()=>{
  const data={settings:{},products:[]};
  assert.equal(normalizePublicSiteData({...data,customer_order_profile_sync_enabled:true}).customer_order_profile_sync_enabled,true);
  assert.equal(normalizePublicSiteData({...data,customer_order_profile_sync_enabled:'true'}).customer_order_profile_sync_enabled,false);
  assert.equal(normalizePublicSiteData({...data,settings:{customer_order_profile_sync_enabled:true}}).customer_order_profile_sync_enabled,false);
  assert.equal(normalizePublicSiteData(data,{...DEFAULT_PUBLIC_SITE_DATA,customer_order_profile_sync_enabled:true}).customer_order_profile_sync_enabled,false);
});
