/**
 * Aurora public content and private cash-on-delivery order API.
 * Public GET reads only explicit public tables. Private POST accepts create_order only; no private list/read API.
 */
// Leave blank when this script is bound to the intended Sheet through Extensions > Apps Script.
var AURORA_SPREADSHEET_ID = '18B0chk742grOCG4Wdx3w8Cn_sZFBCxc3WHbCtZBshY4';
var AURORA_SCHEMA_VERSION = 1;
var AURORA_BACKEND_RELEASE = 'aurora-2026-11-08-order-integrity-r6';
var PUBLIC_TABLE_SCHEMAS = {
  settings: ['key','value'],
  content: ['key','value'],
  hero_slides: ['id','product_id','title','subtitle','image_url','image_alt','sort_order','is_active'],
  highlights: ['id','section','title','description','image_url','image_alt','icon','category_id','sort_order','is_active'],
  faqs: ['id','question','answer','sort_order','is_active'],
  links: ['id','label','url','location','sort_order','is_active'],
  categories: ['id','name','slug','description','image_url','sort_order','is_active'],
  products: ['id','category_id','name','slug','description','base_price','sale_price','image_url','gallery_images','is_featured','is_active','rating','review_count','allowed_flavor_ids','allowed_addon_ids','sold_count'],
  product_variants: ['id','product_id','name','weight_grams','price','sale_price','is_active'],
  flavors: ['id','name','color_hex','is_active'],
  product_addons: ['id','name','price','image_url','is_active'],
  banners: ['id','title','subtitle','image_url','button_text','button_link','is_active'],
  delivery_zones: ['id','name','delivery_fee','estimated_time','is_active'],
  delivery_slots: ['id','slot_label','is_active','max_orders_per_day'],
  coupons: ['id','code','discount_type','discount_value','min_order_amount','max_discount_amount','is_active','usage_count'],
  reviews: ['id','product_id','product_name','customer_name','rating','comment','image_url','status','created_at']
};
var PUBLIC_SETTINGS_KEYS = ["id","shop_name","logo_url","phone","whatsapp","email","address","opening_time","closing_time","currency","accepting_orders","delivery_enabled","website_title","website_description","top_announcement_text","hero_tagline","hero_title","hero_subtitle","hero_cta_text","trust_badge_1_title","trust_badge_1_desc","trust_badge_2_title","trust_badge_2_desc","trust_badge_3_title","trust_badge_3_desc","trust_badge_4_title","trust_badge_4_desc","custom_cake_promo_tag","custom_cake_promo_title","custom_cake_promo_desc","custom_cake_promo_btn","footer_about_text","facebook_url","instagram_url","profile_image_url","brand_tagline","facebook_handle","mobile_subtitle","youtube_url","tiktok_url","website_url","complimentary_kit_title","complimentary_kit_items"];
var PUBLIC_CONTENT_KEYS = ["hero_eyebrow","hero_title","hero_description","hero_cta","hero_secondary_cta","hero_note","hero_image_label","hero_image_caption","hero_stamp_top","hero_stamp_bottom","hero_card_label","occasions_title","occasions_subtitle","catalog_eyebrow","catalog_title","catalog_description","catalog_sort_featured","catalog_note","catalog_from_label","catalog_customize_label","catalog_featured_badge","catalog_empty_title","catalog_empty_description","catalog_price_low","catalog_price_high","catalog_all_label","catalog_reset_label","catalog_results_label","custom_eyebrow","custom_title","custom_description","custom_cta","custom_image_url","custom_image_alt","custom_image_label","custom_image_caption","custom_chat_label","story_eyebrow","story_title","story_description","story_cta","story_signature","story_image_url","story_image_alt","story_image_note","social_eyebrow","social_title","social_description","social_cta","social_handle","social_image_note","faq_eyebrow","faq_title","faq_description","footer_tagline","footer_about","footer_copyright_note","footer_preview_note","footer_contact_label","nav_cakes","nav_custom","nav_story","nav_search_placeholder","nav_facebook","brand_tagline"];

function auroraConfiguredId_() {
  return PropertiesService.getScriptProperties().getProperty('AURORA_SPREADSHEET_ID') || AURORA_SPREADSHEET_ID || '';
}
function auroraSpreadsheet_() {
  if (typeof auroraSupabaseEnabled_ === 'function' && auroraSupabaseEnabled_()) return auroraSupabaseBook_();
  var id = auroraConfiguredId_();
  var book = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw new Error('Bind the script to the intended Sheet or set AURORA_SPREADSHEET_ID in Script Properties.');
  return book;
}
function auroraCacheKey_() {
  return 'aurora_public_profiles_email_v1_' + (typeof auroraSupabaseEnabled_ === 'function' && auroraSupabaseEnabled_() ? 'supabase_' : 'sheets_') + (auroraConfiguredId_() || 'bound');
}

function doGet(e) {
  try {
    if (typeof auroraSupabaseBegin_ === 'function') auroraSupabaseBegin_();
    return auroraDoGet_(e);
  } catch (_) {
    var unavailable={ok:false,error:'The bakery database is temporarily unavailable.'};
    if(e&&e.parameter&&e.parameter.action==='health'){
      unavailable.release=AURORA_BACKEND_RELEASE;
      if(typeof auroraMigrationStatus_==='function'){var failedFreeze=auroraMigrationStatus_();unavailable.writes_frozen=failedFreeze.writes_frozen;unavailable.frozen_at=failedFreeze.frozen_at;}
    }
    return auroraResponse_(unavailable);
  }
  finally { if (typeof auroraSupabaseDiscard_ === 'function') auroraSupabaseDiscard_(); }
}
function auroraDoGet_(e) {
  var params = e && e.parameter ? e.parameter : {};
  var callback = params.callback || '';
  if (callback && !/^auroraSheets_[a-zA-Z0-9_]+$/.test(callback)) {
    return auroraResponse_({ok:false,error:'Invalid callback.'});
  }
  var action = params.action || 'public';
  if(action==='receipt')return auroraReceiptHtml_(params);
  if(action==='email_confirm'||action==='email_unsubscribe')return auroraSubscriptionLinkGet_(action,params.token||'');
  if(action==='public_image') {
    try {return auroraResponse_(auroraPublicImage_(params.id||''));}
    catch(error){return auroraResponse_({ok:false,error:'Image unavailable.'});}
  }
  if (action !== 'public' && action !== 'health') {
    return auroraResponse_({ok:false,error:'Only the public and health read actions are available.'}, callback);
  }
  try {
    if (action === 'health') {
      var freeze=typeof auroraMigrationStatus_==='function'?auroraMigrationStatus_():{writes_frozen:false,frozen_at:null};
      return auroraResponse_({ok:true,schema_version:AURORA_SCHEMA_VERSION,service:'aurora_public_content',release:AURORA_BACKEND_RELEASE,
        database_backend:typeof auroraSupabaseEnabled_ === 'function' && auroraSupabaseEnabled_()?'supabase':'google_sheets',
        writes_frozen:freeze.writes_frozen,frozen_at:freeze.frozen_at}, callback);
    }
    var cache = CacheService.getScriptCache();
    var cacheKey = auroraCacheKey_();
    var cached = cache.get(cacheKey);
    var payload;
    if (cached) {
      payload = JSON.parse(cached);
    } else {
      payload = {ok:true,schema_version:AURORA_SCHEMA_VERSION,generated_at:new Date().toISOString(),data:auroraPublicData_()};
      var serialized = JSON.stringify(payload);
      if (serialized.length < 90000) cache.put(cacheKey, serialized, 20);
    }
    if(typeof auroraMigrationFrozen_==='function'&&auroraMigrationFrozen_()&&payload.data)payload.data.order_submission_enabled=false;
    return auroraResponse_(payload, callback);
  } catch (error) {
    // Do not expose exception text, file metadata or stack traces to public visitors.
    console.error(error && error.stack ? error.stack : error);
    return auroraResponse_({ok:false,error:'Public content is not ready. Run setupSheetDatabase in the Apps Script editor and check the public table headers.'}, callback);
  }
}

var PRIVATE_ORDER_SCHEMAS = {
  orders: ['id','order_number','request_id','request_hash','created_at','updated_at','customer_name','customer_phone','delivery_address','delivery_zone_id','delivery_zone_name','delivery_fee','delivery_slot','delivery_date','status','subtotal','discount_amount','total_amount','coupon_code','order_note','payment_method','payment_status','receipt_json'],
  order_items: ['id','order_id','product_id','product_name','variant_id','variant_name','flavor_id','flavor_name','writing_message','unit_price','quantity','addons_json','subtotal'],
  custom_cake_requests: ['id','request_id','request_hash','created_at','updated_at','customer_name','customer_phone','cake_type','approx_size','flavor','color_theme','writing_text','instructions','reference_image_url','status','estimated_price','quoted_price','receipt_json'],
  staff_accounts: ['id','username','name','role','password_salt','password_hash','failed_attempts','locked_until','active','created_at','updated_at'],
  customer_accounts: ['id','phone','name','address','email','password_salt','password_hash','failed_attempts','locked_until','active','created_at','updated_at'],
  auth_sessions: ['token_hash','account_type','account_id','created_at','expires_at','revoked'],
  customer_master: ['id','phone_key','name','delivery_address','created_at','updated_at','order_count','last_order_id','last_order_at'],
  customer_contact_requests: ['id','phone_key','name','delivery_address','created_at','status'],
  item_costings: ['product_id','product_name','category_name','selling_price','cost_ingredients','cost_packaging','cost_delivery','cost_other','total_cost','net_profit','profit_margin','updated_at']
};

// This handler creates a private COD receipt. GET never calls these functions.
function doPost(e) {
  try {
    if(typeof auroraMigrationFrozen_==='function'&&auroraMigrationFrozen_())return auroraResponse_({ok:false,success:false,code:'migration_frozen',retryable:true,error:'Bakery updates are paused for database migration. Retry later with the same request ID; do not create a new request.'});
    if (typeof auroraSupabaseBegin_ === 'function') auroraSupabaseBegin_();
    return auroraDoPost_(e);
  } catch (_) { return auroraResponse_({ok:false,success:false,code:'submission_uncertain',error:'Order confirmation is unavailable. Retry with the same request ID; do not create a new request.'}); }
  finally { if (typeof auroraSupabaseDiscard_ === 'function') auroraSupabaseDiscard_(); }
}
function auroraDoPost_(e) {
  var lock;
  var locked = false;
  try {
    var form=e&&e.parameter?e.parameter:{};
    if((form.action==='email_confirm'||form.action==='email_unsubscribe')&&e.postData&&String(e.postData.type||'').indexOf('application/x-www-form-urlencoded')===0)return auroraSubscriptionLinkPost_(form.action,form.token||'');
    var raw = e && e.postData && e.postData.contents;
    if (typeof raw !== 'string' || !raw || raw.length > 950000) auroraReject_('invalid_request','Request is too large.');
    // Only the authenticated image-upload route and bulk costing sync can exceed normal 50 KB JSON.
    if(raw.length>50000&&!/"action"\s*:\s*"(staff_image_upload|sync_item_costings)"/.test(raw.slice(0,500)))
      auroraReject_('invalid_request','The order body must be under 50 KB.');
    var input;
    try { input = JSON.parse(raw); } catch (_) { auroraReject_('invalid_request','The order body must be valid JSON.'); }
    if(input&&/^customer_email_(status|subscribe|unsubscribe)$/.test(String(input.action||'')))return auroraResponse_(auroraSubscriptionPost_(input));
    if(input&&input.action==='staff_image_upload')return auroraResponse_(auroraImageUpload_(input));
    // Private operations authenticate every POST; never expose these reads via GET.
    // All credential/private account routes use POST; never exposed via public GET.
    if(input && /^(staff_password_login|staff_password_logout|staff_account_create|staff_account_set_active|staff_account_reset_password)$/.test(String(input.action||'')))
      return auroraResponse_(auroraAccountStaffPost_(input));
    if(input && /^customer_phone_(signup|login|session|logout|orders|profile|claim|password|close|save_order_profile)$/.test(String(input.action||'')))
      return auroraResponse_(auroraAccountCustomerPost_(input));
    if (input && (input.action === 'create_custom_cake' || input.action === 'get_custom_cake_status' || input.action === 'staff_custom_cakes' || input.action === 'staff_custom_quote')) return auroraResponse_(auroraCustomCakePost_(input));
    // Legacy costing routes were publicly callable; only the authenticated
    // staff operation may reach the private costing ledger.
    if (input && (input.action === 'sync_item_costings' || input.action === 'get_item_costings'))
      auroraReject_('forbidden','Use authenticated staff item costings to view or save costs.');
    if (input && input.action === 'staff_item_costings') return auroraResponse_(auroraCostingPost_(input));
    if (input && input.action === 'staff_customer_lookup') return auroraResponse_(auroraStaffCustomerLookup_(input));
    if (input && input.action === 'customer_contact_submit') return auroraResponse_(auroraGuestContactSubmit_(input));
    // Phone ownership is unverified; this legacy route must never enumerate
    // existing customers' receipts, names or delivery addresses.
    if (input && input.action === 'customer_phone_history')
      auroraReject_('forbidden','Phone-only order history is disabled. Use your linked account or original receipt.');
    if (input && input.action === 'customer_receipt_recover') return auroraResponse_(auroraCustomerReceiptRecover_(input));
    if (input && input.action === 'get_order_status') return auroraResponse_(auroraCustomerOrderStatus_(input));
    if (input && input.action === 'customer_review_submit') return auroraResponse_(auroraCustomerReview_(input));
    if (input && input.action === 'staff_order_link') return auroraResponse_(auroraStaffOrderLink_(input));
    if (input && input.action === 'staff_push_register') return auroraResponse_(auroraStaffPush_(input));
    if (input && input.action === 'customer_shared_order') return auroraResponse_(auroraCustomerSharedOrder_(input));
    if (input && /^staff_cms_(list|create|update|delete)$/.test(String(input.action||''))) return auroraResponse_(auroraCmsPost_(input));
    if (input && (input.action==='staff_catalog'||input.action==='staff_catalog_update')) return auroraResponse_(auroraCatalogPost_(input));
    if (input && input.action==='staff_mutate') {
      var change=auroraOperationsPost_(input), stageChanged=change.stage_changed;
      delete change.stage_changed;
      var savedChange=auroraResponse_(change);
      if(stageChanged&&typeof auroraNotifyOrderStage_==='function'){
        try{auroraNotifyOrderStage_(auroraSpreadsheet_(),change.order);}catch(_){console.warn('Order stage push could not be sent.');}
      }
      return savedChange;
    }
    if (input && /^staff_/.test(String(input.action || ''))) return auroraResponse_(auroraOperationsPost_(input));
    if (input && /^customer_(session|orders|claim_order)$/.test(String(input.action || ''))) return auroraResponse_(auroraCustomerAccountsPost_(input));
    var request = auroraOrderRequest_(input);
    if (request.cart_items.some(function(line) { return !!line.custom; })) {
      var staff = auroraStaffAuthenticate_(input);
      if (['super_admin','admin','order_manager'].indexOf(staff.role) === -1) {
        auroraReject_('forbidden','This staff role cannot create a custom order.');
      }
    }
    var hash = auroraRequestHash_(request);
    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) return auroraResponse_({ok:false,success:false,code:'busy',error:'Order confirmation is still pending. Retry with the same request ID.'});
    locked = true;
    var book = auroraSpreadsheet_();
    var orders = auroraPrivateTable_(book,'orders');
    var itemTable = auroraPrivateTable_(book,'order_items');
    var previous = orders.rows.filter(function(row) { return String(row.request_id) === request.request_id; });
    if (previous.length > 1) throw new Error('Duplicate private request IDs.');
    if (previous.length) {
      if (String(previous[0].request_hash) !== hash) auroraReject_('idempotency_conflict','This request ID already belongs to another order.');
      var receipt = JSON.parse(String(previous[0].receipt_json));
      if (!receipt || !receipt.id || !Array.isArray(receipt.items) || receipt.id !== String(previous[0].id)) throw new Error('Incomplete committed receipt.');
      auroraRepairOrderItems_(itemTable,receipt);
      auroraCustomerMasterUpsert_(book,orders,receipt);
      return auroraResponse_({success:true,persisted:true,order:auroraCheckoutReceiptSafe_(receipt)});
    }
    if (!request.checkout_proof) auroraReject_('upgrade_required','Refresh the website before placing a new order.');
    // Validate new orders without changing the fingerprint of historical retries.
    auroraAccountPhone_(request.customer_phone);
    var order = auroraBuildOrder_(book,request,orders.rows);
    order.order_number=auroraNextOrderNumber_(orders.rows);
    auroraCheckoutRateLimit_(request);
    var receiptJson = JSON.stringify(order);
    if (receiptJson.length > 45000) auroraReject_('order_too_large','This order is too large. Reduce the number of lines or options.');
    // The complete receipt is the commit record. A retry repairs any interrupted item index.
    auroraAppendPrivate_(orders,{
      id:order.id,order_number:order.order_number,request_id:request.request_id,request_hash:hash,
      created_at:order.created_at,updated_at:order.updated_at,customer_name:order.customer_name,
      customer_phone:order.customer_phone,delivery_address:order.delivery_address,
      delivery_zone_id:order.delivery_zone.id,delivery_zone_name:order.delivery_zone.name,
      delivery_fee:order.delivery_fee,delivery_slot:order.delivery_slot,delivery_date:order.delivery_date,
      status:order.status,subtotal:order.subtotal,discount_amount:order.discount_amount,total_amount:order.total_amount,
      coupon_code:order.coupon_code || '',order_note:order.order_note || '',payment_method:'cod',payment_status:'pending',receipt_json:receiptJson
    });
    auroraRepairOrderItems_(itemTable,order);
    auroraCustomerMasterUpsert_(book,orders,order);
    var confirmed = auroraResponse_({success:true,persisted:true,order:auroraCheckoutReceiptSafe_(order)});
    lock.releaseLock();
    locked = false;
    if(typeof auroraNotifyOrderStage_==='function'){
      try{auroraNotifyOrderStage_(book,order);}catch(_){console.warn('New order push could not be sent.');}
    }
    return confirmed;
  } catch (error) {
    if (error && error.auroraValidation) return auroraResponse_({ok:false,success:false,persisted:false,code:error.code,error:error.message});
    console.error(error && error.stack ? error.stack : error);
    // A write may already have committed. Never tell the client this outcome is definitely unpersisted.
    return auroraResponse_({ok:false,success:false,code:'submission_uncertain',error:'Order confirmation is unavailable. Retry with the same request ID; do not create a new request.'});
  } finally {
    if (locked) lock.releaseLock();
  }
}

/** Best-effort burst protection, inside the existing ScriptLock. Retries of a
 * committed request ID bypass this limiter, so ambiguous writes stay safe. */
/**
 * A private per-order bearer capability is supplied ONCE with the confirmed
 * checkout receipt. It is not derived from phone, order ID or customer name.
 * Two independently issued platform UUIDs form a 244-bit-string namespace.
 * Google Apps Script does not expose a documented CSPRNG API, so keep the
 * supported service and operational security limitations in documentation.
 */
function auroraNewCustomerCapability_() {
  return String(Utilities.getUuid()).toLowerCase() + String(Utilities.getUuid()).toLowerCase();
}
function auroraCheckoutReceiptSafe_(value) {
  var receipt = JSON.parse(JSON.stringify(value));
  receipt.delivery_otp = '';
  delete receipt.customer_share_token;delete receipt.customer_share_created_at;
  delete receipt.otp_failed_attempts;
  delete receipt.otp_locked_until;
  delete receipt.customer_google_sub;
  delete receipt.otp_failed_attempts;
  delete receipt.otp_locked_until;
  return receipt;
}
function auroraCheckoutRateLimit_(request) {
  var cache = CacheService.getScriptCache();
  var digits = request.customer_phone.replace(/\D/g,'');
  var hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,digits,Utilities.Charset.UTF_8)
    .map(function(byte){return ('0'+((byte+256)%256).toString(16)).slice(-2);}).join('').slice(0,24);
  var key = 'aurora_cod_phone_'+hash;
  var globalKey = 'aurora_cod_global_10m';
  var attemptKey = 'aurora_cod_attempt_'+request.request_id;
  // A network/Sheet failure before the receipt commit must not count the same
  // request ID again on a safety-preserving retry.
  if (cache.get(attemptKey)) return;
  var phoneCount = Number(cache.get(key)||0);
  var globalCount = Number(cache.get(globalKey)||0);
  if (phoneCount >= 5 || globalCount >= 120) {
    auroraReject_('order_rate_limited','Too many new orders in a short period. Please contact the bakery to arrange your order.');
  }
  cache.put(key,String(phoneCount+1),600);
  cache.put(globalKey,String(globalCount+1),600);
  cache.put(attemptKey,'1',600);
}
function auroraReject_(code,message) {
  var error = new Error(message); error.auroraValidation = true; error.code = code; throw error;
}
function auroraOrderText_(value,label,min,max) {
  if (typeof value !== 'string') auroraReject_('invalid_request',label + ' must be text.');
  var result = value.trim();
  if (result.length < min || result.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result)) auroraReject_('invalid_request',label + ' has an invalid length or characters.');
  return result;
}
function auroraOptionalText_(value,label,max) {
  return value === undefined || value === null ? '' : auroraOrderText_(value,label,0,max);
}
function auroraOrderRequest_(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.action !== 'create_order') auroraReject_('invalid_action','Only create_order is accepted by POST.');
  var requestId = auroraOrderText_(input.request_id,'Request ID',36,36).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(requestId)) auroraReject_('invalid_request','Request ID must be a UUID.');
  var phone = auroraOrderText_(input.customer_phone,'Phone',7,30);
  var digits = phone.replace(/\D/g,'');
  if (!/^\+?[0-9 ()-]+$/.test(phone) || digits.length < 7 || digits.length > 15) auroraReject_('invalid_phone','Enter a valid phone number as text.');
  if (input.payment_method !== 'cod') auroraReject_('unsupported_payment','Only cash on delivery is currently supported.');
  if (input.expected_total !== undefined && (typeof input.expected_total !== 'number' || !isFinite(input.expected_total) || input.expected_total < 0 || input.expected_total > 10000000)) auroraReject_('invalid_request','Expected total must be a non-negative number.');
  var date = auroraOrderText_(input.delivery_date,'Delivery date',10,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date + 'T00:00:00Z')) || new Date(date + 'T00:00:00Z').toISOString().slice(0,10) !== date) auroraReject_('invalid_date','Use a valid YYYY-MM-DD delivery date.');
  if (!Array.isArray(input.cart_items) || input.cart_items.length < 1 || input.cart_items.length > 25) auroraReject_('invalid_cart','An order must contain 1 to 25 cake lines.');
  var lines = input.cart_items.map(function(line) {
    if (!line || typeof line !== 'object' || Array.isArray(line)) auroraReject_('invalid_cart','Invalid cake line.');
    if (typeof line.quantity !== 'number' || !isFinite(line.quantity) || Math.floor(line.quantity) !== line.quantity || line.quantity < 1 || line.quantity > 50) auroraReject_('invalid_quantity','Cake quantity must be an integer from 1 to 50.');
    if (!Array.isArray(line.addon_ids) || line.addon_ids.length > 20) auroraReject_('invalid_cart','Add-on IDs must be a list of at most 20 options.');
    if (line.custom !== undefined) {
      var custom = line.custom;
      if (!custom || typeof custom !== 'object' || Array.isArray(custom) ||
          line.product_id !== '__custom_cake__' || line.variant_id !== '__custom_cake__' ||
          line.addon_ids.length || line.flavor_id || typeof custom.unit_price !== 'number' ||
          !isFinite(custom.unit_price) || custom.unit_price < 0.01 || custom.unit_price > 10000000) {
        auroraReject_('invalid_cart','Enter a valid custom cake and agreed unit price.');
      }
      return {
        product_id:'__custom_cake__',variant_id:'__custom_cake__',flavor_id:'',addon_ids:[],
        writing_message:auroraOptionalText_(line.writing_message,'Cake message',200),quantity:line.quantity,
        custom:{name:auroraOrderText_(custom.name,'Custom cake name',2,120),
          size:auroraOrderText_(custom.size,'Cake size',1,100),
          flavor:auroraOptionalText_(custom.flavor,'Cake flavour',150),unit_price:auroraMoneyRound_(custom.unit_price)}
      };
    }
    if (line.product_id === '__custom_cake__') auroraReject_('invalid_cart','Custom cake details are required.');
    var addonIds = line.addon_ids.map(function(id) { return auroraOrderText_(id,'Add-on ID',1,100); }).sort();
    if (addonIds.some(function(id,index) { return index > 0 && id === addonIds[index-1]; })) auroraReject_('invalid_cart','Duplicate add-on selections are not allowed.');
    return {
      product_id:auroraOrderText_(line.product_id,'Product ID',1,100),
      variant_id:auroraOrderText_(line.variant_id,'Variant ID',1,100),
      flavor_id:auroraOptionalText_(line.flavor_id,'Flavour ID',100),addon_ids:addonIds,
      writing_message:auroraOptionalText_(line.writing_message,'Cake message',200),quantity:line.quantity
    };
  });
  var normalized = {
    action:'create_order',request_id:requestId,customer_name:auroraOrderText_(input.customer_name,'Customer name',2,100),
    customer_phone:phone,delivery_address:auroraOrderText_(input.delivery_address,'Delivery address',5,1000),
    delivery_zone_id:auroraOrderText_(input.delivery_zone_id,'Delivery zone',1,100),
    delivery_slot:auroraOrderText_(input.delivery_slot,'Delivery slot',1,100),delivery_date:date,cart_items:lines,
    coupon_code:auroraOptionalText_(input.coupon_code,'Coupon code',60).toUpperCase(),
    order_note:auroraOptionalText_(input.order_note,'Order note',1000),payment_method:'cod',expected_total:input.expected_total
  };
  if(input.is_gift!==undefined && typeof input.is_gift!=='boolean')
    auroraReject_('invalid_request','Invalid gift selection.');
  if(input.is_gift===true){
    var recipient=auroraOrderText_(input.recipient_name,'Gift recipient name',2,100);
    var recipientPhone=auroraOrderText_(input.recipient_phone,'Gift recipient phone',11,30);
    if(!/^01[3-9]\d{8}$/.test(recipientPhone))
      auroraReject_('invalid_phone','Enter a valid recipient mobile number.');
    var senderPhone=auroraOptionalText_(input.sender_phone,'Gift sender phone',30);
    if(senderPhone && !/^01[3-9]\d{8}$/.test(senderPhone))
      auroraReject_('invalid_phone','Enter a valid gift sender mobile number.');
    if(input.hide_price_on_box!==undefined && typeof input.hide_price_on_box!=='boolean')
      auroraReject_('invalid_request','Invalid gift receipt option.');
    normalized.is_gift=true;
    normalized.recipient_name=recipient;
    normalized.recipient_phone=recipientPhone;
    normalized.sender_name=auroraOptionalText_(input.sender_name,'Gift sender name',100)||normalized.customer_name;
    normalized.sender_phone=senderPhone;
    normalized.hide_price_on_box=input.hide_price_on_box!==false;
    normalized.gift_card_message=auroraOptionalText_(input.gift_card_message,'Gift message',140);
  }
  if (input.checkout_proof !== undefined) {
    var proof=auroraOrderText_(input.checkout_proof,'Checkout security proof',72,72).toLowerCase();
    if(!/^(?:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}){2}$/.test(proof)) {
      auroraReject_('invalid_request','Refresh your checkout page and try again.');
    }
    normalized.checkout_proof=proof;
  }
  return normalized;
}
function auroraRequestHash_(request) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(request),Utilities.Charset.UTF_8).map(function(byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
}
function auroraMoney_(value,label) {
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '' || String(value).trim() === '' || !isFinite(Number(value)) || Number(value) < 0 || Number(value) > 10000000) throw new Error('Invalid current Sheet amount: ' + label);
  return Math.round(Number(value) * 100) / 100;
}
function auroraMoneyRound_(value) { return Math.round(value * 100) / 100; }
function auroraIndex_(rows,label) {
  var index = Object.create(null);
  rows.forEach(function(row) {
    var id = String(row.id || '').trim();
    if (!id || Object.prototype.hasOwnProperty.call(index,id)) throw new Error('Invalid or duplicate Sheet ID: ' + label);
    index[id] = row;
  });
  return index;
}
function auroraCurrent_(index,id,label) {
  var row = index[id];
  if (!row || !auroraActive_(row.is_active)) auroraReject_('unavailable_selection',label + ' is no longer available. Refresh the cake selection.');
  return row;
}
function auroraSlotStart_(label) {
  var time = /^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:[-–—]|to\b)/i.exec(label);
  if (!time) return null;
  var hour = Number(time[1]), minute = Number(time[2] || 0);
  if (minute > 59 || (time[3] ? hour < 1 || hour > 12 : hour > 23)) return null;
  if (time[3]) hour = hour % 12 + (time[3].toLowerCase() === 'pm' ? 12 : 0);
  return hour * 60 + minute;
}
function auroraCheckSlotCapacity_(slot,request,orders) {
  var limit = Number(slot.max_orders_per_day || 0);
  if (!Number.isInteger(limit) || limit < 0) auroraReject_('unavailable_selection','Delivery slot capacity is misconfigured. Choose another time.');
  if (!limit) return;
  var booked = orders.filter(function(row) {
    var day = row.delivery_date instanceof Date ? Utilities.formatDate(row.delivery_date,'Asia/Dhaka','yyyy-MM-dd') : String(row.delivery_date);
    return day === request.delivery_date && String(row.delivery_slot) === request.delivery_slot && String(row.status) !== 'cancelled';
  }).length;
  if (booked >= limit) auroraReject_('unavailable_selection','This delivery slot is full. Choose another time.');
}
function auroraBuildOrder_(book,request,orders) {
  var settings = auroraPairs_(auroraRows_(book,'settings'),PUBLIC_SETTINGS_KEYS);
  var freeGifts = auroraGiftAssignments_(settings.complimentary_kit_items);
  if (!auroraActive_(settings.accepting_orders)) auroraReject_('shop_closed','The shop is not accepting orders right now.');
  if (!auroraActive_(settings.delivery_enabled)) auroraReject_('delivery_unavailable','Delivery is currently unavailable.');
  var now = new Date();
  var today = Utilities.formatDate(now,'Asia/Dhaka','yyyy-MM-dd');
  if (request.delivery_date < today) auroraReject_('invalid_date','Delivery date cannot be in the past.');
  var products = auroraIndex_(auroraRows_(book,'products'),'products');
  var variants = auroraIndex_(auroraRows_(book,'product_variants'),'product_variants');
  var flavors = auroraIndex_(auroraRows_(book,'flavors'),'flavors');
  var addons = auroraIndex_(auroraRows_(book,'product_addons'),'product_addons');
  var zones = auroraIndex_(auroraRows_(book,'delivery_zones'),'delivery_zones');
  var slots = auroraRows_(book,'delivery_slots').filter(function(row) { return auroraActive_(row.is_active) && String(row.slot_label) === request.delivery_slot; });
  if (slots.length !== 1) auroraReject_('unavailable_selection','Choose a currently available delivery time.');
  var start = auroraSlotStart_(request.delivery_slot);
  if (request.delivery_date === today && (start === null || start <= ((now.getUTCHours()+6)%24)*60 + now.getUTCMinutes()))
    auroraReject_('unavailable_selection','This delivery slot has closed. Choose a later time or another date.');
  auroraCheckSlotCapacity_(slots[0],request,orders);
  var zone = auroraCurrent_(zones,request.delivery_zone_id,'Delivery area');
  var orderId = 'ord_' + request.request_id;
  var items = request.cart_items.map(function(line,index) {
    if (line.custom) {
      return {
        id:'item_' + request.request_id + '_' + index,order_id:orderId,product_id:line.product_id,
        product_name:line.custom.name,variant_id:line.variant_id,variant_name:line.custom.size,
        flavor_id:'',flavor_name:line.custom.flavor,writing_message:line.writing_message,
        unit_price:line.custom.unit_price,quantity:line.quantity,addons:[],
        subtotal:auroraMoneyRound_(line.custom.unit_price * line.quantity)
      };
    }
    var product = auroraCurrent_(products,line.product_id,'Cake');
    var variant = auroraCurrent_(variants,line.variant_id,'Cake size');
    if (String(variant.product_id) !== line.product_id) auroraReject_('unavailable_selection','The selected size does not belong to this cake.');
    var allowedFlavors = auroraList_(product.allowed_flavor_ids,false).map(String);
    var allowAllFlavors = allowedFlavors.some(function(item) {
      var s = String(item).toLowerCase().trim();
      return s === 'all' || s === '*';
    });
    var allowedAddons = auroraList_(product.allowed_addon_ids,false).map(String);
    var allowAllAddons = allowedAddons.some(function(item) {
      var s = String(item).toLowerCase().trim();
      return s === 'all' || s === '*';
    });
    var flavor;
    if (line.flavor_id) {
      if (!allowAllFlavors && allowedFlavors.indexOf(line.flavor_id) === -1) auroraReject_('unavailable_selection','The selected flavour is not allowed for this cake.');
      flavor = auroraCurrent_(flavors,line.flavor_id,'Flavour');
    } else if (allowedFlavors.some(function(id) { return flavors[id] && auroraActive_(flavors[id].is_active); })) {
      auroraReject_('unavailable_selection','Choose an available flavour for this cake.');
    }
    var salePrice = auroraVariantSalePrice_(product,variant);
    var basePrice = auroraMoney_(salePrice === '' ? variant.price : salePrice,'variant price');
    var selectedAddons = line.addon_ids.map(function(id) {
      if (!allowAllAddons && allowedAddons.indexOf(id) === -1) auroraReject_('unavailable_selection','The selected add-on is not allowed for this cake.');
      var addon = auroraCurrent_(addons,id,'Add-on');
      var price = auroraMoney_(addon.price,'add-on price');
      return {addon_id:id,addon_name:String(addon.name || ''),unit_price:price,quantity:line.quantity,subtotal:auroraMoneyRound_(price * line.quantity)};
    });
    var addonUnit = selectedAddons.reduce(function(sum,addon) { return sum + addon.unit_price; },0);
    return {
      id:'item_' + request.request_id + '_' + index,order_id:orderId,product_id:line.product_id,product_name:String(product.name || ''),
      variant_id:line.variant_id,variant_name:String(variant.name || ''),flavor_id:line.flavor_id,flavor_name:flavor ? String(flavor.name || '') : '',
      writing_message:line.writing_message,unit_price:basePrice,quantity:line.quantity,addons:selectedAddons,
      free_gift_items:freeGifts[line.product_id]||[],
      subtotal:auroraMoneyRound_((basePrice + addonUnit) * line.quantity)
    };
  });
  var subtotal = auroraMoneyRound_(items.reduce(function(sum,item) { return sum + item.subtotal; },0));
  var deliveryFee = auroraMoney_(zone.delivery_fee,'delivery fee');
  var discount = 0;
  if (request.coupon_code) {
    var coupons = auroraRows_(book,'coupons').filter(function(row) { return String(row.code).trim().toUpperCase() === request.coupon_code && auroraActive_(row.is_active); });
    if (coupons.length !== 1) auroraReject_('invalid_coupon','This coupon is not available.');
    var coupon = coupons[0];
    if (subtotal < auroraMoney_(coupon.min_order_amount,'coupon minimum')) auroraReject_('invalid_coupon','The order does not meet this coupon minimum.');
    var couponValue = auroraMoney_(coupon.discount_value,'coupon discount');
    if (coupon.discount_type === 'percentage' && couponValue <= 100) discount = subtotal * couponValue / 100;
    else if (coupon.discount_type === 'fixed') discount = couponValue;
    else throw new Error('Invalid current Sheet coupon type/value.');
    if (coupon.max_discount_amount !== '' && coupon.max_discount_amount !== null && coupon.max_discount_amount !== undefined) discount = Math.min(discount,auroraMoney_(coupon.max_discount_amount,'coupon maximum'));
    discount = auroraMoneyRound_(Math.min(subtotal,discount));
  }
  var total = auroraMoneyRound_(subtotal - discount + deliveryFee);
  if (subtotal > 10000000 || total > 10000000) auroraReject_('order_too_large','The order amount exceeds the supported limit.');
  if (request.expected_total !== undefined && Math.abs(request.expected_total - total) > 0.0100000001) auroraReject_('price_changed','Prices or delivery charges changed. Refresh your bag and review the total before placing the order.');
  var now = new Date().toISOString();
  var receipt = {
    persistence:'google_sheets',id:orderId,order_number:'AC-' + today.replace(/-/g,'') + '-' + request.request_id.replace(/-/g,'').toUpperCase(),
    customer_name:request.customer_name,customer_phone:request.customer_phone,delivery_address:request.delivery_address,
    delivery_zone:{id:String(zone.id),name:String(zone.name || ''),delivery_fee:deliveryFee,estimated_time:String(zone.estimated_time || ''),is_active:true},
    delivery_slot:request.delivery_slot,delivery_date:request.delivery_date,status:'pending',subtotal:subtotal,delivery_fee:deliveryFee,
    discount_amount:discount,total_amount:total,coupon_code:request.coupon_code,order_note:request.order_note,payment_method:'cod',payment_status:'pending',
    delivery_otp:'',customer_access_token:auroraNewCustomerCapability_(),cod_amount:total,cod_collected:false,created_at:now,updated_at:now,items:items,
    history:[{id:'history_' + request.request_id,status:'pending',notes:'Order received in Google Sheets',created_at:now,actor_name:'Customer'}]
  };
  // Keep gift preferences in the private canonical receipt_json, without
  // adding fragile columns to existing customer/order Sheets.
  if(request.is_gift===true){
    receipt.is_gift=true;
    receipt.recipient_name=request.recipient_name;
    receipt.recipient_phone=request.recipient_phone;
    receipt.sender_name=request.sender_name;
    receipt.sender_phone=request.sender_phone;
    receipt.hide_price_on_box=request.hide_price_on_box;
    receipt.gift_card_message=request.gift_card_message;
  }
  return receipt;
}
function auroraPrivateTable_(book,name) {
  var required = PRIVATE_ORDER_SCHEMAS[name];
  if (!required) throw new Error('Unknown private table.');
  var sheet = book.getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 1) throw new Error('Run setupSheetDatabase to create private order headers.');
  var count = sheet.getLastRow(); var width = sheet.getLastColumn();
  if (count > 50001 || width > 100) throw new Error('Private order table exceeds supported size.');
  var values = sheet.getRange(1,1,count,width).getValues();
  var headers = values.shift().map(function(value) { return String(value).trim().toLowerCase(); });
  if (required.some(function(key) { return headers.indexOf(key) === -1 || headers.indexOf(key) !== headers.lastIndexOf(key); })) throw new Error('Invalid private order headers.');
  var rows = values.filter(function(row) { return row.some(function(value) { return value !== '' && value !== null; }); }).map(function(row) {
    var result = Object.create(null); required.forEach(function(key) { result[key] = row[headers.indexOf(key)]; }); return result;
  });
  return {sheet:sheet,headers:headers,rows:rows};
}
function auroraSheetCell_(value) {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' && /^[=+\-@]/.test(value) ? "'" + value : value;
}
function auroraAppendPrivate_(table,record) {
  var values = table.headers.map(function(key) { return auroraSheetCell_(record[key]); });
  table.sheet.getRange(table.sheet.getLastRow()+1,1,1,values.length).setValues([values]);
  table.rows.push(record);
}
function auroraRepairOrderItems_(table,order) {
  var ids = Object.create(null);
  table.rows.forEach(function(row) { if (ids[String(row.id)]) throw new Error('Duplicate private item ID.'); ids[String(row.id)] = true; });
  order.items.forEach(function(item) {
    if (ids[item.id]) return;
    auroraAppendPrivate_(table,{
      id:item.id,order_id:order.id,product_id:item.product_id,product_name:item.product_name,variant_id:item.variant_id,variant_name:item.variant_name,
      flavor_id:item.flavor_id || '',flavor_name:item.flavor_name || '',writing_message:item.writing_message || '',unit_price:item.unit_price,
      quantity:item.quantity,addons_json:JSON.stringify(item.addons || []),subtotal:item.subtotal
    });
    ids[item.id] = true;
  });
}

function auroraResponse_(payload, callback) {
  // A successful API acknowledgement MUST follow the atomic persistence commit.
  // Validation errors discard uncommitted work at the outer request boundary;
  // security counters and external-send claims use explicit checkpoints.
  if (payload && (payload.ok === true || payload.success === true) && typeof auroraSupabaseFlush_ === 'function') auroraSupabaseFlush_();
  var json = JSON.stringify(payload,function(key,value){return key==='order_number'?auroraFormatOrderNumber_(value):value;}).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  if (callback) return ContentService.createTextOutput(callback + '(' + json + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function auroraActive_(value) {
  if (value === undefined || value === null || value === '') return true;
  var normalized = String(value).toLowerCase().trim();
  if (value === true || value === 1 || ['true','yes','1','on'].indexOf(normalized) !== -1) return true;
  if (value === false || value === 0 || ['false','no','0','off'].indexOf(normalized) !== -1) return false;
  throw new Error('Active flags must be TRUE or FALSE.');
}

function auroraRows_(book, name) {
  var columns = PUBLIC_TABLE_SCHEMAS[name];
  if (!columns) throw new Error('Table is not public.');
  var sheet = book.getSheetByName(name);
  if (!sheet) {
    if (name === 'settings' || name === 'products') throw new Error('Required public table missing: ' + name);
    return [];
  }
  var rowCount = sheet.getLastRow();
  var colCount = sheet.getLastColumn();
  if (rowCount < 2 || colCount < 1) return [];
  if (rowCount > 5001 || colCount > 100) throw new Error('Public table exceeds supported size.');
  var values = sheet.getRange(1,1,rowCount,colCount).getValues();
  var headers = values.shift().map(function(value) { return String(value).trim().toLowerCase(); });
  if (headers.indexOf(name === 'settings' || name === 'content' ? 'key' : 'id') === -1) throw new Error('Invalid table headers: ' + name);
  return values.filter(function(row) { return row.some(function(value) { return value !== '' && value !== null; }); }).map(function(row) {
    var record = Object.create(null);
    columns.forEach(function(column) {
      var index = headers.indexOf(column);
      if (index >= 0) {
        var value = row[index];
        record[column] = value instanceof Date ? value.toISOString() : value;
      }
    });
    return record;
  });
}

function auroraPairs_(rows, allowedKeys) {
  var result = Object.create(null);
  rows.forEach(function(row) {
    var key = String(row.key || '').trim();
    if (allowedKeys.indexOf(key) === -1) return;
    result[key] = row.value === null || row.value === undefined ? '' : row.value;
  });
  return result;
}

function auroraList_(value, isUrlList) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  var input = String(value).trim();
  if (input.charAt(0) === '[') {
    var parsed = JSON.parse(input);
    if (!Array.isArray(parsed)) throw new Error('Invalid list cell.');
    return parsed;
  }
  return input.split(isUrlList ? /\n/ : /[,\n]/).map(function(item) { return item.trim(); }).filter(Boolean);
}

function auroraGiftAssignments_(value) {
  var result=Object.create(null), data;
  try{data=JSON.parse(String(value||''));}catch(_){return result;}
  if(!data||data.version!==2||!Array.isArray(data.items)||!data.products||typeof data.products!=='object'||Array.isArray(data.products))return result;
  function names(values){
    if(!Array.isArray(values))return [];
    return Array.from(new Set(values.filter(function(item){return typeof item==='string';}).map(function(item){return item.trim();})
      .filter(function(item){return item&&item.length<=80&&!/[\x00-\x1f\x7f]/.test(item);}))).slice(0,20);
  }
  var catalog=names(data.items);
  Object.keys(data.products).slice(0,500).forEach(function(id){
    if(/^[A-Za-z0-9_-]{1,100}$/.test(id)&&['__proto__','constructor','prototype'].indexOf(id)<0)
      result[id]=names(data.products[id]).filter(function(item){return catalog.indexOf(item)>=0;});
  });
  return result;
}

function auroraVariantSalePrice_(product,variant) {
  var sale=variant.sale_price;
  if(sale!==''&&sale!==undefined&&sale!==null)return sale;
  var productSale=product.sale_price;
  if(productSale!==''&&productSale!==undefined&&productSale!==null&&
      Number(productSale)<Number(product.base_price)&&Number(productSale)<Number(variant.price)&&
      (String(variant.id).indexOf('-half')!==-1||Number(variant.price)<=Number(product.base_price)))return productSale;
  return '';
}

function auroraPublicData_() {
  var book = auroraSpreadsheet_();
  var settings = auroraPairs_(auroraRows_(book,'settings'),PUBLIC_SETTINGS_KEYS);
  ['accepting_orders','delivery_enabled'].forEach(function(key) { if (Object.prototype.hasOwnProperty.call(settings,key)) settings[key] = auroraActive_(settings[key]); });
  var content = auroraPairs_(auroraRows_(book,'content'),PUBLIC_CONTENT_KEYS);
  var active = function(name) { return auroraRows_(book,name).filter(function(row) { return auroraActive_(row.is_active); }); };
  var variants = active('product_variants');
  var categories = active('categories');
  var allProducts = auroraRows_(book, 'products');
  var products = (allProducts.length ? allProducts : active('products')).map(function(product) {
    product.is_active = auroraActive_(product.is_active);
    product.variants = variants.filter(function(variant) { return String(variant.product_id) === String(product.id); })
      .map(function(variant) { return Object.assign({},variant,{sale_price:auroraVariantSalePrice_(product,variant)}); });
    product.gallery_images = auroraList_(product.gallery_images,true);
    product.allowed_flavor_ids = auroraList_(product.allowed_flavor_ids,false);
    product.allowed_addon_ids = auroraList_(product.allowed_addon_ids,false);
    var category = categories.filter(function(item) { return String(item.id) === String(product.category_id); })[0];
    product.category_name = category ? category.name : '';
    return product;
  });
  return {
    schema_version: AURORA_SCHEMA_VERSION,
    order_submission_enabled: !(typeof auroraMigrationFrozen_==='function'&&auroraMigrationFrozen_()),
    customer_order_profile_sync_enabled: typeof auroraAccountSaveOrderProfile_ === 'function',
    settings: settings,
    content: content,
    hero_slides: active('hero_slides'),
    highlights: active('highlights'),
    faqs: active('faqs'),
    links: active('links'),
    categories: categories,
    products: products,
    flavors: active('flavors'),
    addons: active('product_addons'),
    banners: active('banners'),
    zones: active('delivery_zones'),
    slots: active('delivery_slots'),
    coupons: active('coupons'),
    reviews: auroraRows_(book,'reviews').filter(function(review) { return review.status === 'approved'; })
  };
}

/**
 * Run manually in the Apps Script editor as the Sheet owner.
 * Creates/initializes only missing or completely empty public tabs and private order headers.
 * Does not overwrite existing rows, clear sheets, change sharing or submit an order.
 */
function auroraRequireInteractiveSetup_() {
  var active='',effective='';
  try{
    active=String(Session.getActiveUser().getEmail()||'').trim().toLowerCase();
    effective=String(Session.getEffectiveUser().getEmail()||'').trim().toLowerCase();
  }catch(_){throw new Error('Run setup directly in the Apps Script editor while signed in as the intended owner.');}
  // An execute-as-owner web app still has the owner's effective identity.
  // Its anonymous visitor must never inherit permission to run editor setup.
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(active)||active!==effective)
    throw new Error('Run setup directly in the Apps Script editor while signed in as the intended owner.');
  return effective;
}
/**
 * Switch backend back to Google Sheets.
 * Run this function in the Google Apps Script editor to use Google Sheets as the live database.
 */
function switchToGoogleSheetsBackend() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('AURORA_DATABASE_BACKEND', 'google_sheets');
  props.deleteProperty('AURORA_MIGRATION_FROZEN_AT');
  props.deleteProperty('AURORA_MIGRATION_SOURCE_BACKEND');
  var cache = CacheService.getScriptCache();
  var id = props.getProperty('AURORA_SPREADSHEET_ID') || AURORA_SPREADSHEET_ID || '';
  ['aurora_public_profiles_email_v1_sheets_', 'aurora_public_profiles_email_v1_supabase_', 'aurora_public_profiles_email_v1_'].forEach(function(prefix) {
    cache.remove(prefix + (id || 'bound'));
  });
  console.log('ACTIVE DATABASE IS NOW GOOGLE SHEETS! Changes in your sheet will now appear on the website, and orders will be saved directly to your sheet.');
  return 'Switched to Google Sheets backend successfully.';
}


/**
 * Run this function in Apps Script editor to automatically populate
 * your Google Sheet with the 13 new cakes and mini items from your menu card!
 */
function syncNewCakeMenu() {
  switchToGoogleSheetsBackend();
  var book = auroraSpreadsheet_();
  var seed = typeof AURORA_SEED_DATA !== 'undefined' ? AURORA_SEED_DATA : {};
  
  // Update categories
  var catSheet = book.getSheetByName('categories');
  if (!catSheet) catSheet = book.insertSheet('categories');
  catSheet.clear();
  var catCols = PUBLIC_TABLE_SCHEMAS['categories'];
  var catRows = [catCols].concat((seed.categories || []).map(function(c) {
    return catCols.map(function(col) { return c[col] !== undefined ? c[col] : ''; });
  }));
  catSheet.getRange(1, 1, catRows.length, catCols.length).setValues(catRows);
  catSheet.setFrozenRows(1);
  catSheet.getRange(1, 1, 1, catCols.length).setBackground('#174B3B').setFontColor('#FFFFFF').setFontWeight('bold');
  
  // Update products
  var prodSheet = book.getSheetByName('products');
  if (!prodSheet) prodSheet = book.insertSheet('products');
  prodSheet.clear();
  var prodCols = PUBLIC_TABLE_SCHEMAS['products'];
  var prodRows = [prodCols].concat((seed.products || []).map(function(p) {
    return prodCols.map(function(col) {
      var val = p[col];
      if (Array.isArray(val) || typeof val === 'object') return JSON.stringify(val);
      return val !== undefined ? val : '';
    });
  }));
  prodSheet.getRange(1, 1, prodRows.length, prodCols.length).setValues(prodRows);
  prodSheet.setFrozenRows(1);
  prodSheet.getRange(1, 1, 1, prodCols.length).setBackground('#174B3B').setFontColor('#FFFFFF').setFontWeight('bold');
  
  // Update product_variants
  var varSheet = book.getSheetByName('product_variants');
  if (!varSheet) varSheet = book.insertSheet('product_variants');
  varSheet.clear();
  var varCols = PUBLIC_TABLE_SCHEMAS['product_variants'];
  var allVariants = (seed.products || []).reduce(function(all, p) { return all.concat(p.variants || []); }, []);
  var varRows = [varCols].concat(allVariants.map(function(v) {
    return varCols.map(function(col) { return v[col] !== undefined ? v[col] : ''; });
  }));
  varSheet.getRange(1, 1, varRows.length, varCols.length).setValues(varRows);
  varSheet.setFrozenRows(1);
  varSheet.getRange(1, 1, 1, varCols.length).setBackground('#174B3B').setFontColor('#FFFFFF').setFontWeight('bold');
  
  // Update hero_slides
  var heroSheet = book.getSheetByName('hero_slides');
  if (!heroSheet) heroSheet = book.insertSheet('hero_slides');
  heroSheet.clear();
  var heroCols = PUBLIC_TABLE_SCHEMAS['hero_slides'];
  var heroRows = [heroCols].concat((seed.hero_slides || []).map(function(h) {
    return heroCols.map(function(col) { return h[col] !== undefined ? h[col] : ''; });
  }));
  heroSheet.getRange(1, 1, heroRows.length, heroCols.length).setValues(heroRows);
  heroSheet.setFrozenRows(1);
  heroSheet.getRange(1, 1, 1, heroCols.length).setBackground('#174B3B').setFontColor('#FFFFFF').setFontWeight('bold');

  // Clear cache
  var cache = CacheService.getScriptCache();
  var id = PropertiesService.getScriptProperties().getProperty('AURORA_SPREADSHEET_ID') || AURORA_SPREADSHEET_ID || '';
  ['aurora_public_profiles_email_v1_sheets_', 'aurora_public_profiles_email_v1_supabase_', 'aurora_public_profiles_email_v1_'].forEach(function(prefix) {
    cache.remove(prefix + (id || 'bound'));
  });
  
  console.log('SUCCESS: Google Sheet updated with 13 cakes and mini items!');
  return 'SUCCESS: Google Sheet updated with 13 cakes and mini items!';
}

function setupSheetDatabase() {
  if(typeof auroraSupabaseEnabled_==='function'&&auroraSupabaseEnabled_())throw new Error('Supabase runtime schemas are owner-managed in SQL. Do not seed or rebuild the migrated database from Sheet setup.');
  auroraRequireInteractiveSetup_();
  if(typeof auroraMigrationAssertWritable_==='function')auroraMigrationAssertWritable_();
  var book = auroraSpreadsheet_();
  var seed = typeof AURORA_SEED_DATA !== 'undefined' ? AURORA_SEED_DATA : {};
  var report = [];
  Object.keys(PUBLIC_TABLE_SCHEMAS).forEach(function(name) {
    var columns = PUBLIC_TABLE_SCHEMAS[name];
    var sheet = book.getSheetByName(name);
    var created = !sheet;
    if (!sheet) sheet = book.insertSheet(name);
    if (sheet.getLastRow() !== 0) {
      report.push(name + ': existing data preserved');
      return;
    }
    var rows = auroraSeedRows_(name,seed);
    var values = [columns].concat(rows.map(function(row) {
      return columns.map(function(column) {
        var value = row[column];
        if (value === undefined || value === null) return '';
        if (Array.isArray(value) || typeof value === 'object') return JSON.stringify(value);
        // A value intended as text must never become a spreadsheet formula.
        if (typeof value === 'string' && /^[=+\-@]/.test(value)) return "'" + value;
        return value;
      });
    }));
    if (name === 'settings' || name === 'content') sheet.getRange(1,2,sheet.getMaxRows(),1).setNumberFormat('@');
    sheet.getRange(1,1,values.length,columns.length).setValues(values);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,columns.length).setBackground('#174B3B').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.setColumnWidths(1,columns.length,150);
    if (name === 'settings' || name === 'content') {
      sheet.setColumnWidth(1,260);
      sheet.setColumnWidth(2,620);
      if (values.length > 1) sheet.getRange(2,2,values.length-1,1).setWrap(true);
    }
    report.push(name + ': ' + (created ? 'created' : 'initialized') + ', ' + rows.length + ' starter rows');
  });
  Object.keys(PRIVATE_ORDER_SCHEMAS).forEach(function(name) {
    var sheet = book.getSheetByName(name);
    if (!sheet) sheet = book.insertSheet(name);
    if (sheet.getLastRow() !== 0) { report.push(name + ': existing private data preserved'); return; }
    var columns = PRIVATE_ORDER_SCHEMAS[name];
    sheet.getRange(1,1,1,columns.length).setValues([columns]);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,columns.length).setBackground('#174B3B').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.setColumnWidths(1,columns.length,160);
    report.push(name + ': private headers created; no customer starter rows');
  });
  if(typeof auroraSetupSubscriptions_==='function')auroraSetupSubscriptions_(book);
  if(typeof auroraSetupCampaignTables_==='function')auroraSetupCampaignTables_(book);
  CacheService.getScriptCache().remove(auroraCacheKey_());
  console.log(report.join('\n'));
  return report.join('\n');
}

function auroraSeedRows_(name,seed) {
  if (name === 'settings' || name === 'content') {
    var source = seed[name] || {};
    var allowed = name === 'settings' ? PUBLIC_SETTINGS_KEYS : PUBLIC_CONTENT_KEYS;
    return Object.keys(source).filter(function(key) { return allowed.indexOf(key) !== -1; }).map(function(key) { return {key:key,value:source[key]}; });
  }
  if (name === 'product_variants') return (seed.products || []).reduce(function(all,product) { return all.concat(product.variants || []); },[]);
  var alias = {product_addons:'addons',delivery_zones:'zones',delivery_slots:'slots'};
  return seed[alias[name] || name] || [];
}
