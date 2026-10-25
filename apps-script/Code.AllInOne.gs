/**
 * AURORA'S CAKE — COMPLETE ONE-FILE GOOGLE APPS SCRIPT BACKEND
 * Public Store/COD, Staff/Delivery, Phone Customers, Google Account Recovery,
 * CMS, Private Images, Catalog, Custom Cakes and Seed setup.
 * PERFORMANCE: Customer/Rider live status uses narrow Sheet reads.
 * BACK UP live Sheet; replace existing Code.gs completely; run
 * setupSheetDatabase() and setupAuroraImagesOnce() if not already done.
 * Deploy → Manage deployments → Edit → New version → Deploy.
 */

/* ==== BEGIN apps-script/Code.gs ==== */
/**
 * Aurora public content and private cash-on-delivery order API.
 * Public GET reads only explicit public tables. Private POST accepts create_order only; no private list/read API.
 */
// Leave blank when this script is bound to the intended Sheet through Extensions > Apps Script.
var AURORA_SPREADSHEET_ID = '18B0chk742grOCG4Wdx3w8Cn_sZFBCxc3WHbCtZBshY4';
var AURORA_SCHEMA_VERSION = 1;
var PUBLIC_TABLE_SCHEMAS = {
  settings: ['key','value'],
  content: ['key','value'],
  hero_slides: ['id','product_id','title','subtitle','image_url','image_alt','sort_order','is_active'],
  highlights: ['id','section','title','description','image_url','image_alt','icon','category_id','sort_order','is_active'],
  faqs: ['id','question','answer','sort_order','is_active'],
  links: ['id','label','url','location','sort_order','is_active'],
  categories: ['id','name','slug','description','image_url','sort_order','is_active'],
  products: ['id','category_id','name','slug','description','base_price','sale_price','image_url','gallery_images','is_featured','is_active','rating','review_count','allowed_flavor_ids','allowed_addon_ids'],
  product_variants: ['id','product_id','name','weight_grams','price','sale_price','is_active'],
  flavors: ['id','name','color_hex','is_active'],
  product_addons: ['id','name','price','image_url','is_active'],
  banners: ['id','title','subtitle','image_url','button_text','button_link','is_active'],
  delivery_zones: ['id','name','delivery_fee','estimated_time','is_active'],
  delivery_slots: ['id','slot_label','is_active'],
  coupons: ['id','code','discount_type','discount_value','min_order_amount','max_discount_amount','is_active','usage_count'],
  reviews: ['id','product_id','product_name','customer_name','rating','comment','status','created_at']
};
var PUBLIC_SETTINGS_KEYS = ["id","shop_name","logo_url","phone","whatsapp","email","address","opening_time","closing_time","currency","accepting_orders","delivery_enabled","website_title","website_description","top_announcement_text","hero_tagline","hero_title","hero_subtitle","hero_cta_text","trust_badge_1_title","trust_badge_1_desc","trust_badge_2_title","trust_badge_2_desc","trust_badge_3_title","trust_badge_3_desc","trust_badge_4_title","trust_badge_4_desc","custom_cake_promo_tag","custom_cake_promo_title","custom_cake_promo_desc","custom_cake_promo_btn","footer_about_text","facebook_url","instagram_url","profile_image_url","brand_tagline","facebook_handle","mobile_subtitle","youtube_url","tiktok_url","website_url"];
var PUBLIC_CONTENT_KEYS = ["hero_eyebrow","hero_title","hero_description","hero_cta","hero_secondary_cta","hero_note","hero_image_label","hero_image_caption","hero_stamp_top","hero_stamp_bottom","hero_card_label","occasions_title","occasions_subtitle","catalog_eyebrow","catalog_title","catalog_description","catalog_sort_featured","catalog_note","catalog_from_label","catalog_customize_label","catalog_featured_badge","catalog_empty_title","catalog_empty_description","catalog_price_low","catalog_price_high","catalog_all_label","catalog_reset_label","catalog_results_label","custom_eyebrow","custom_title","custom_description","custom_cta","custom_image_url","custom_image_alt","custom_image_label","custom_image_caption","custom_chat_label","story_eyebrow","story_title","story_description","story_cta","story_signature","story_image_url","story_image_alt","story_image_note","social_eyebrow","social_title","social_description","social_cta","social_handle","social_image_note","faq_eyebrow","faq_title","faq_description","footer_tagline","footer_about","footer_copyright_note","footer_preview_note","footer_contact_label","nav_cakes","nav_custom","nav_story","nav_search_placeholder","nav_facebook","brand_tagline"];

function auroraConfiguredId_() {
  return PropertiesService.getScriptProperties().getProperty('AURORA_SPREADSHEET_ID') || AURORA_SPREADSHEET_ID || '';
}
function auroraSpreadsheet_() {
  var id = auroraConfiguredId_();
  var book = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw new Error('Bind the script to the intended Sheet or set AURORA_SPREADSHEET_ID in Script Properties.');
  return book;
}
function auroraCacheKey_() {
  return 'aurora_public_v1_orders_'  + (auroraConfiguredId_() || 'bound');
}

function doGet(e) {
  var params = e && e.parameter ? e.parameter : {};
  var callback = params.callback || '';
  if (callback && !/^auroraSheets_[a-zA-Z0-9_]+$/.test(callback)) {
    return auroraResponse_({ok:false,error:'Invalid callback.'});
  }
  var action = params.action || 'public';
  if(action==='public_image') {
    try {return auroraResponse_(auroraPublicImage_(params.id||''));}
    catch(error){return auroraResponse_({ok:false,error:'Image unavailable.'});}
  }
  if (action !== 'public' && action !== 'health') {
    return auroraResponse_({ok:false,error:'Only the public and health read actions are available.'}, callback);
  }
  try {
    if (action === 'health') {
      return auroraResponse_({ok:true,schema_version:AURORA_SCHEMA_VERSION,service:'aurora_public_content'}, callback);
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
  auth_sessions: ['token_hash','account_type','account_id','created_at','expires_at','revoked']
};

// This handler creates a private COD receipt. GET never calls these functions.
function doPost(e) {
  var lock;
  var locked = false;
  try {
    var raw = e && e.postData && e.postData.contents;
    if (typeof raw !== 'string' || !raw || raw.length > 950000) auroraReject_('invalid_request','Request is too large.');
    // Only the authenticated image-upload route can exceed normal 50 KB JSON.
    if(raw.length>50000&&!/"action"\s*:\s*"staff_image_upload"/.test(raw.slice(0,500)))
      auroraReject_('invalid_request','The order body must be under 50 KB.');
    var input;
    try { input = JSON.parse(raw); } catch (_) { auroraReject_('invalid_request','The order body must be valid JSON.'); }
    if(input&&input.action==='staff_image_upload')return auroraResponse_(auroraImageUpload_(input));
    // Private operations authenticate every POST; never expose these reads via GET.
    // All credential/private account routes use POST; never exposed via public GET.
    if(input && /^(staff_password_login|staff_password_logout|staff_account_create|staff_account_set_active|staff_account_reset_password)$/.test(String(input.action||'')))
      return auroraResponse_(auroraAccountStaffPost_(input));
    if(input && /^customer_phone_(signup|login|session|logout|orders|profile|claim|password|close)$/.test(String(input.action||'')))
      return auroraResponse_(auroraAccountCustomerPost_(input));
    if (input && (input.action === 'create_custom_cake' || input.action === 'get_custom_cake_status' || input.action === 'staff_custom_cakes' || input.action === 'staff_custom_quote')) return auroraResponse_(auroraCustomCakePost_(input));
    if (input && input.action === 'get_order_status') return auroraResponse_(auroraCustomerOrderStatus_(input));
    if (input && /^staff_cms_(list|create|update|delete)$/.test(String(input.action||''))) return auroraResponse_(auroraCmsPost_(input));
    if (input && (input.action==='staff_catalog'||input.action==='staff_catalog_update')) return auroraResponse_(auroraCatalogPost_(input));
    if (input && /^staff_/.test(String(input.action || ''))) return auroraResponse_(auroraOperationsPost_(input));
    if (input && /^customer_(session|orders|claim_order)$/.test(String(input.action || ''))) return auroraResponse_(auroraCustomerAccountsPost_(input));
    var request = auroraOrderRequest_(input);
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
      return auroraResponse_({success:true,persisted:true,order:auroraCheckoutReceiptSafe_(receipt)});
    }
    if (!request.checkout_proof) auroraReject_('upgrade_required','Refresh the website before placing a new order.');
    var order = auroraBuildOrder_(book,request);
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
    return auroraResponse_({success:true,persisted:true,order:auroraCheckoutReceiptSafe_(order)});
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
function auroraBuildOrder_(book,request) {
  var settings = auroraPairs_(auroraRows_(book,'settings'),PUBLIC_SETTINGS_KEYS);
  if (!auroraActive_(settings.accepting_orders)) auroraReject_('shop_closed','The shop is not accepting orders right now.');
  if (!auroraActive_(settings.delivery_enabled)) auroraReject_('delivery_unavailable','Delivery is currently unavailable.');
  var today = Utilities.formatDate(new Date(),'Asia/Dhaka','yyyy-MM-dd');
  if (request.delivery_date < today) auroraReject_('invalid_date','Delivery date cannot be in the past.');
  var products = auroraIndex_(auroraRows_(book,'products'),'products');
  var variants = auroraIndex_(auroraRows_(book,'product_variants'),'product_variants');
  var flavors = auroraIndex_(auroraRows_(book,'flavors'),'flavors');
  var addons = auroraIndex_(auroraRows_(book,'product_addons'),'product_addons');
  var zones = auroraIndex_(auroraRows_(book,'delivery_zones'),'delivery_zones');
  var slots = auroraRows_(book,'delivery_slots').filter(function(row) { return auroraActive_(row.is_active) && String(row.slot_label) === request.delivery_slot; });
  if (slots.length !== 1) auroraReject_('unavailable_selection','Choose a currently available delivery time.');
  var zone = auroraCurrent_(zones,request.delivery_zone_id,'Delivery area');
  var orderId = 'ord_' + request.request_id;
  var items = request.cart_items.map(function(line,index) {
    var product = auroraCurrent_(products,line.product_id,'Cake');
    var variant = auroraCurrent_(variants,line.variant_id,'Cake size');
    if (String(variant.product_id) !== line.product_id) auroraReject_('unavailable_selection','The selected size does not belong to this cake.');
    var allowedFlavors = auroraList_(product.allowed_flavor_ids,false).map(String);
    var allowedAddons = auroraList_(product.allowed_addon_ids,false).map(String);
    var flavor;
    if (line.flavor_id) {
      if (allowedFlavors.indexOf(line.flavor_id) === -1) auroraReject_('unavailable_selection','The selected flavour is not allowed for this cake.');
      flavor = auroraCurrent_(flavors,line.flavor_id,'Flavour');
    } else if (allowedFlavors.some(function(id) { return flavors[id] && auroraActive_(flavors[id].is_active); })) {
      auroraReject_('unavailable_selection','Choose an available flavour for this cake.');
    }
    var basePrice = auroraMoney_(variant.sale_price === '' || variant.sale_price === undefined || variant.sale_price === null ? variant.price : variant.sale_price,'variant price');
    var selectedAddons = line.addon_ids.map(function(id) {
      if (allowedAddons.indexOf(id) === -1) auroraReject_('unavailable_selection','The selected add-on is not allowed for this cake.');
      var addon = auroraCurrent_(addons,id,'Add-on');
      var price = auroraMoney_(addon.price,'add-on price');
      return {addon_id:id,addon_name:String(addon.name || ''),unit_price:price,quantity:line.quantity,subtotal:auroraMoneyRound_(price * line.quantity)};
    });
    var addonUnit = selectedAddons.reduce(function(sum,addon) { return sum + addon.unit_price; },0);
    return {
      id:'item_' + request.request_id + '_' + index,order_id:orderId,product_id:line.product_id,product_name:String(product.name || ''),
      variant_id:line.variant_id,variant_name:String(variant.name || ''),flavor_id:line.flavor_id,flavor_name:flavor ? String(flavor.name || '') : '',
      writing_message:line.writing_message,unit_price:basePrice,quantity:line.quantity,addons:selectedAddons,
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
  return {
    persistence:'google_sheets',id:orderId,order_number:'AC-' + today.replace(/-/g,'') + '-' + request.request_id.replace(/-/g,'').toUpperCase(),
    customer_name:request.customer_name,customer_phone:request.customer_phone,delivery_address:request.delivery_address,
    delivery_zone:{id:String(zone.id),name:String(zone.name || ''),delivery_fee:deliveryFee,estimated_time:String(zone.estimated_time || ''),is_active:true},
    delivery_slot:request.delivery_slot,delivery_date:request.delivery_date,status:'pending',subtotal:subtotal,delivery_fee:deliveryFee,
    discount_amount:discount,total_amount:total,coupon_code:request.coupon_code,order_note:request.order_note,payment_method:'cod',payment_status:'pending',
    delivery_otp:'',customer_access_token:auroraNewCustomerCapability_(),cod_amount:total,cod_collected:false,created_at:now,updated_at:now,items:items,
    history:[{id:'history_' + request.request_id,status:'pending',notes:'Order received in Google Sheets',created_at:now,actor_name:'Customer'}]
  };
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
  var json = JSON.stringify(payload).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
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

function auroraPublicData_() {
  var book = auroraSpreadsheet_();
  var settings = auroraPairs_(auroraRows_(book,'settings'),PUBLIC_SETTINGS_KEYS);
  ['accepting_orders','delivery_enabled'].forEach(function(key) { if (Object.prototype.hasOwnProperty.call(settings,key)) settings[key] = auroraActive_(settings[key]); });
  var content = auroraPairs_(auroraRows_(book,'content'),PUBLIC_CONTENT_KEYS);
  var active = function(name) { return auroraRows_(book,name).filter(function(row) { return auroraActive_(row.is_active); }); };
  var variants = active('product_variants');
  var categories = active('categories');
  var products = active('products').map(function(product) {
    product.variants = variants.filter(function(variant) { return String(variant.product_id) === String(product.id); });
    product.gallery_images = auroraList_(product.gallery_images,true);
    product.allowed_flavor_ids = auroraList_(product.allowed_flavor_ids,false);
    product.allowed_addon_ids = auroraList_(product.allowed_addon_ids,false);
    var category = categories.filter(function(item) { return String(item.id) === String(product.category_id); })[0];
    product.category_name = category ? category.name : '';
    return product;
  });
  return {
    schema_version: AURORA_SCHEMA_VERSION,
    order_submission_enabled: true,
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
function setupSheetDatabase() {
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
/* ==== END apps-script/Code.gs ==== */

/* ==== BEGIN apps-script/SeedData.gs ==== */
var AURORA_SEED_DATA = {
  "schema_version": 1,
  "settings": {
    "id": "setting-1",
    "shop_name": "Aurora’s Cake",
    "logo_url": "",
    "phone": "",
    "whatsapp": "",
    "email": "",
    "address": "Tangail, Bangladesh",
    "opening_time": "",
    "closing_time": "",
    "currency": "৳",
    "accepting_orders": true,
    "delivery_enabled": true,
    "website_title": "Aurora’s Cake — A Little Slice of Happiness",
    "website_description": "Discover celebration cakes and thoughtful details at Aurora’s Cake.",
    "top_announcement_text": "A little cake. A lot of happiness.",
    "facebook_url": "https://www.facebook.com/aurorascake26",
    "instagram_url": "",
    "profile_image_url": "",
    "mobile_subtitle": "A little slice of happiness",
    "youtube_url": "",
    "tiktok_url": "",
    "website_url": ""
  },
  "content": {
    "hero_eyebrow": "A little slice of happiness",
    "hero_title": "Good days.\nGreat cakes.\nMade for you.",
    "hero_description": "Big birthdays, little wins, and all the sweet moments in between. Find a cake that feels like you.",
    "hero_cta": "Explore our cakes",
    "hero_secondary_cta": "Make it your own",
    "hero_note": "Your flavour. Your message. Your moment.",
    "hero_image_label": "The celebration collection",
    "hero_image_caption": "A little slice of lovely.",
    "hero_stamp_top": "BAKED FOR",
    "hero_stamp_bottom": "HAPPY DAYS",
    "hero_card_label": "Make it a celebration",
    "occasions_title": "What are we celebrating?",
    "occasions_subtitle": "There’s a cake for that.",
    "catalog_eyebrow": "The cake collection",
    "catalog_title": "Meet your next\nfavourite cake.",
    "catalog_description": "Delicious reasons\nto celebrate today.",
    "catalog_sort_featured": "Our favourites",
    "catalog_note": "A little note: please share any allergies or dietary needs in your order notes.",
    "catalog_from_label": "From",
    "catalog_customize_label": "Customize",
    "catalog_featured_badge": "The signature collection",
    "catalog_empty_title": "No cakes found just yet.",
    "catalog_empty_description": "Try a different search or explore another collection.",
    "catalog_price_low": "Price: low to high",
    "catalog_price_high": "Price: high to low",
    "catalog_all_label": "All cakes",
    "catalog_reset_label": "Show all categories",
    "catalog_results_label": "cakes to discover",
    "custom_eyebrow": "The custom cake studio",
    "custom_title": "You dream it.\nWe’ll make it cake.",
    "custom_description": "A favourite colour. An inside joke. A wildly wonderful idea. Let’s turn the things that make you, you, into a cake worth celebrating.",
    "custom_cta": "Create your dream cake",
    "custom_image_url": "/images/floral-signature.webp",
    "custom_image_alt": "A celebration cake for a special occasion",
    "custom_image_label": "YOUR OCCASION.",
    "custom_image_caption": "Your kind of magic.",
    "custom_chat_label": "Prefer a chat? Find us on Facebook",
    "story_eyebrow": "A note from Aurora’s",
    "story_title": "More than a cake.\nA way to say you care.",
    "story_description": "“Happy birthday.” “I’m proud of you.” “Just because.”\nSometimes, the sweetest things are the ones we share.\n\nAurora’s Cake is a place for those moments — with a collection of celebration cakes and thoughtful details to make each one feel a little more like you.",
    "story_cta": "Find something to share",
    "story_signature": "With love, Aurora’s",
    "story_image_url": "/images/floral-cake.webp",
    "story_image_alt": "A selection of cupcakes to share",
    "story_image_note": "Little things.\nLovely memories.",
    "social_eyebrow": "A little more Aurora’s",
    "social_title": "Let’s talk\nall things cake.",
    "social_description": "Planning something special? Visit our Facebook page for cake ideas, questions, and a conversation about your next celebration.",
    "social_cta": "Visit Aurora’s Cake",
    "social_handle": "@aurorascake26",
    "social_image_note": "Life is sweeter together.",
    "faq_eyebrow": "The little details",
    "faq_title": "Good things\nto know.",
    "faq_description": "A few answers before\nyour first bite.",
    "footer_tagline": "A LITTLE SLICE OF HAPPINESS",
    "footer_about": "For moments worth\nmaking sweeter.",
    "footer_copyright_note": "Made for sweet moments ♡",
    "footer_preview_note": "Website preview · Orders stay on your device · No payment collected",
    "footer_contact_label": "Get in touch",
    "nav_cakes": "Our cakes",
    "nav_custom": "Custom cakes",
    "nav_story": "Our story",
    "nav_search_placeholder": "Find your next favourite cake…",
    "nav_facebook": "Facebook",
    "brand_tagline": "Little moments. Lovely cakes."
  },
  "hero_slides": [
    {
      "id": "slide-1",
      "product_id": "prod-5",
      "title": "Elysian Floral Pastels Anniversary Cake",
      "subtitle": "The celebration collection",
      "image_url": "/images/floral-signature.webp",
      "image_alt": "Elysian Floral Pastels Anniversary Cake",
      "sort_order": 1,
      "is_active": true
    },
    {
      "id": "slide-2",
      "product_id": "prod-2",
      "title": "Royale Red Velvet Cream Cheese",
      "subtitle": "The celebration collection",
      "image_url": "/images/red-velvet.webp",
      "image_alt": "Royale Red Velvet Cream Cheese",
      "sort_order": 2,
      "is_active": true
    },
    {
      "id": "slide-3",
      "product_id": "prod-1",
      "title": "Belgian Triple Chocolate Fudge",
      "subtitle": "The celebration collection",
      "image_url": "/images/chocolate-fudge.webp",
      "image_alt": "Belgian Triple Chocolate Fudge",
      "sort_order": 3,
      "is_active": true
    }
  ],
  "highlights": [
    {
      "id": "promise-1",
      "section": "promise",
      "title": "Thoughtfully crafted cakes",
      "description": "",
      "icon": "cake",
      "sort_order": 1,
      "is_active": true
    },
    {
      "id": "promise-2",
      "section": "promise",
      "title": "Made personal, by you",
      "description": "",
      "icon": "flower",
      "sort_order": 2,
      "is_active": true
    },
    {
      "id": "promise-3",
      "section": "promise",
      "title": "A sweet delivery to your door",
      "description": "",
      "icon": "truck",
      "sort_order": 3,
      "is_active": true
    },
    {
      "id": "occasion-1",
      "section": "occasion",
      "title": "Birthday wishes",
      "description": "Make a wish. Make it sweet.",
      "image_url": "/images/red-velvet.webp",
      "image_alt": "Birthday cake",
      "category_id": "cat-1",
      "sort_order": 1,
      "is_active": true
    },
    {
      "id": "occasion-2",
      "section": "occasion",
      "title": "Love & togetherness",
      "description": "For your favourite people.",
      "image_url": "/images/floral-signature.webp",
      "image_alt": "Anniversary cake",
      "category_id": "cat-3",
      "sort_order": 2,
      "is_active": true
    },
    {
      "id": "occasion-3",
      "section": "occasion",
      "title": "Chocolate cravings",
      "description": "A very good kind of extra.",
      "image_url": "/images/chocolate-fudge.webp",
      "image_alt": "Chocolate cake",
      "category_id": "cat-2",
      "sort_order": 3,
      "is_active": true
    },
    {
      "id": "occasion-4",
      "section": "occasion",
      "title": "Just because",
      "description": "Little treats. Big smiles.",
      "image_url": "/images/floral-cake.webp",
      "image_alt": "Cupcakes",
      "category_id": "all",
      "sort_order": 4,
      "is_active": true
    },
    {
      "id": "step-1",
      "section": "custom_step",
      "title": "Choose your flavours",
      "description": "",
      "icon": "check",
      "sort_order": 1,
      "is_active": true
    },
    {
      "id": "step-2",
      "section": "custom_step",
      "title": "Add your little details",
      "description": "",
      "icon": "check",
      "sort_order": 2,
      "is_active": true
    },
    {
      "id": "step-3",
      "section": "custom_step",
      "title": "Make it a moment",
      "description": "",
      "icon": "check",
      "sort_order": 3,
      "is_active": true
    },
    {
      "id": "social-1",
      "section": "social_gallery",
      "title": "Cake collection",
      "description": "",
      "image_url": "/images/chocolate-fudge.webp",
      "image_alt": "Cake from the preview collection",
      "sort_order": 1,
      "is_active": true
    },
    {
      "id": "social-2",
      "section": "social_gallery",
      "title": "Cake collection",
      "description": "",
      "image_url": "/images/floral-signature.webp",
      "image_alt": "Cake from the preview collection",
      "sort_order": 2,
      "is_active": true
    },
    {
      "id": "social-3",
      "section": "social_gallery",
      "title": "Cake collection",
      "description": "",
      "image_url": "/images/floral-cake.webp",
      "image_alt": "Cake from the preview collection",
      "sort_order": 3,
      "is_active": true
    }
  ],
  "faqs": [
    {
      "id": "faq-1",
      "question": "Can I make a cake my own?",
      "answer": "Choose your cake size and flavour, add a personal message, then finish with candles, a topper or a little extra. Each cake page shows the available options.",
      "sort_order": 1,
      "is_active": true
    },
    {
      "id": "faq-2",
      "question": "How do custom cakes work?",
      "answer": "Open our custom cake studio, tell us the occasion, flavours and colours you have in mind, and add a reference image link if you have one. You can review an estimate before saving your request.",
      "sort_order": 2,
      "is_active": true
    },
    {
      "id": "faq-3",
      "question": "Where can I see delivery options?",
      "answer": "The checkout shows the available delivery zones, delivery fees, dates and time slots. Select your zone to see the total before placing an order.",
      "sort_order": 3,
      "is_active": true
    },
    {
      "id": "faq-4",
      "question": "Can I place a real order on this website?",
      "answer": "When checkout offers cash on delivery to Aurora's Cake, a confirmed saved receipt means your order has reached our Google Sheet. Contact us to confirm availability and delivery. No online payment is collected. If checkout is labelled a demo, it stays on this device. Discuss custom cake requests with us on Facebook.",
      "sort_order": 4,
      "is_active": true
    }
  ],
  "links": [
    {
      "id": "facebook",
      "label": "Facebook",
      "url": "https://www.facebook.com/aurorascake26",
      "location": "social",
      "sort_order": 1,
      "is_active": true
    }
  ],
  "products": [
    {
      "id": "prod-1",
      "category_id": "cat-2",
      "category_name": "Chocolate Temptations",
      "name": "Belgian Triple Chocolate Fudge",
      "slug": "belgian-triple-chocolate-fudge",
      "description": "Layers of moist chocolate sponge smothered with velvety 70% dark Belgian ganache, chocolate crisps, and golden dusted cocoa nibs.",
      "base_price": 1250,
      "sale_price": 1150,
      "image_url": "/images/chocolate-fudge.webp",
      "gallery_images": [
        "/images/chocolate-fudge.webp",
        "/images/black-forest.webp"
      ],
      "is_featured": true,
      "is_active": true,
      "rating": 0,
      "review_count": 0,
      "variants": [
        {
          "id": "var-1-1",
          "product_id": "prod-1",
          "name": "500g (Serves 4)",
          "weight_grams": 500,
          "price": 680,
          "is_active": true
        },
        {
          "id": "var-1-2",
          "product_id": "prod-1",
          "name": "1kg (Serves 8-10)",
          "weight_grams": 1000,
          "price": 1250,
          "sale_price": 1150,
          "is_active": true
        },
        {
          "id": "var-1-3",
          "product_id": "prod-1",
          "name": "1.5kg (Serves 12-14)",
          "weight_grams": 1500,
          "price": 1750,
          "is_active": true
        },
        {
          "id": "var-1-4",
          "product_id": "prod-1",
          "name": "2kg (Serves 18-20)",
          "weight_grams": 2000,
          "price": 2300,
          "is_active": true
        }
      ],
      "allowed_flavor_ids": [
        "flav-1",
        "flav-5",
        "flav-6"
      ],
      "allowed_addon_ids": [
        "addon-1",
        "addon-2",
        "addon-3",
        "addon-4",
        "addon-5"
      ]
    },
    {
      "id": "prod-2",
      "category_id": "cat-1",
      "category_name": "Birthday Specials",
      "name": "Royale Red Velvet Cream Cheese",
      "slug": "royale-red-velvet-cream-cheese",
      "description": "Classic crimson cocoa crumb layered with authentic Philadelphia cream cheese frosting and white chocolate curls.",
      "base_price": 1350,
      "image_url": "/images/red-velvet.webp",
      "gallery_images": [
        "/images/red-velvet.webp"
      ],
      "is_featured": true,
      "is_active": true,
      "rating": 0,
      "review_count": 0,
      "variants": [
        {
          "id": "var-2-1",
          "product_id": "prod-2",
          "name": "500g (Serves 4)",
          "weight_grams": 500,
          "price": 720,
          "is_active": true
        },
        {
          "id": "var-2-2",
          "product_id": "prod-2",
          "name": "1kg (Serves 8-10)",
          "weight_grams": 1000,
          "price": 1350,
          "is_active": true
        },
        {
          "id": "var-2-3",
          "product_id": "prod-2",
          "name": "1.5kg (Serves 12-14)",
          "weight_grams": 1500,
          "price": 1950,
          "is_active": true
        },
        {
          "id": "var-2-4",
          "product_id": "prod-2",
          "name": "2kg (Serves 18-20)",
          "weight_grams": 2000,
          "price": 2500,
          "is_active": true
        }
      ],
      "allowed_flavor_ids": [
        "flav-3",
        "flav-2"
      ],
      "allowed_addon_ids": [
        "addon-1",
        "addon-2",
        "addon-3",
        "addon-4"
      ]
    },
    {
      "id": "prod-3",
      "category_id": "cat-2",
      "category_name": "Chocolate Temptations",
      "name": "Black Forest Royale Amarena",
      "slug": "black-forest-royale-amarena",
      "description": "Traditional German Black Forest loaded with Italian dark cherries, fresh whipped cream, and shaved chocolate shards.",
      "base_price": 1100,
      "image_url": "/images/black-forest.webp",
      "gallery_images": [
        "/images/black-forest.webp"
      ],
      "is_featured": false,
      "is_active": true,
      "rating": 0,
      "review_count": 0,
      "variants": [
        {
          "id": "var-3-1",
          "product_id": "prod-3",
          "name": "500g (Serves 4)",
          "weight_grams": 500,
          "price": 620,
          "is_active": true
        },
        {
          "id": "var-3-2",
          "product_id": "prod-3",
          "name": "1kg (Serves 8-10)",
          "weight_grams": 1000,
          "price": 1100,
          "is_active": true
        },
        {
          "id": "var-3-3",
          "product_id": "prod-3",
          "name": "2kg (Serves 18-20)",
          "weight_grams": 2000,
          "price": 2100,
          "is_active": true
        }
      ],
      "allowed_flavor_ids": [
        "flav-4",
        "flav-1"
      ],
      "allowed_addon_ids": [
        "addon-1",
        "addon-2",
        "addon-3"
      ]
    },
    {
      "id": "prod-4",
      "category_id": "cat-4",
      "category_name": "Cheesecakes & Berries",
      "name": "Lotus Biscoff Salted Caramel Cheesecake",
      "slug": "lotus-biscoff-cheesecake",
      "description": "Crushed Biscoff cookie crust, silky baked cheesecake filling infused with cookie butter swirl, topped with caramelized drizzle.",
      "base_price": 1450,
      "sale_price": 1350,
      "image_url": "/images/cheesecake.webp",
      "gallery_images": [
        "/images/cheesecake.webp"
      ],
      "is_featured": true,
      "is_active": true,
      "rating": 0,
      "review_count": 0,
      "variants": [
        {
          "id": "var-4-1",
          "product_id": "prod-4",
          "name": "500g (Serves 4)",
          "weight_grams": 500,
          "price": 780,
          "is_active": true
        },
        {
          "id": "var-4-2",
          "product_id": "prod-4",
          "name": "1kg (Serves 8-10)",
          "weight_grams": 1000,
          "price": 1450,
          "sale_price": 1350,
          "is_active": true
        },
        {
          "id": "var-4-3",
          "product_id": "prod-4",
          "name": "2kg (Serves 18-20)",
          "weight_grams": 2000,
          "price": 2700,
          "is_active": true
        }
      ],
      "allowed_flavor_ids": [
        "flav-5",
        "flav-6"
      ],
      "allowed_addon_ids": [
        "addon-1",
        "addon-2",
        "addon-3",
        "addon-5"
      ]
    },
    {
      "id": "prod-5",
      "category_id": "cat-3",
      "category_name": "Wedding & Anniversary",
      "name": "Elysian Floral Pastels Anniversary Cake",
      "slug": "elysian-floral-pastels",
      "description": "Two-tier ivory butter sponge with natural raspberry compote, handcrafted edible wafer florals, and 24K edible gold leaves.",
      "base_price": 2600,
      "image_url": "/images/floral-signature.webp",
      "gallery_images": [
        "/images/floral-signature.webp"
      ],
      "is_featured": true,
      "is_active": true,
      "rating": 0,
      "review_count": 0,
      "variants": [
        {
          "id": "var-5-1",
          "product_id": "prod-5",
          "name": "1.5kg Two-Tier (Serves 14)",
          "weight_grams": 1500,
          "price": 2600,
          "is_active": true
        },
        {
          "id": "var-5-2",
          "product_id": "prod-5",
          "name": "2.5kg Two-Tier (Serves 25)",
          "weight_grams": 2500,
          "price": 3950,
          "is_active": true
        }
      ],
      "allowed_flavor_ids": [
        "flav-2",
        "flav-3"
      ],
      "allowed_addon_ids": [
        "addon-1",
        "addon-2",
        "addon-3",
        "addon-4"
      ]
    },
    {
      "id": "prod-6",
      "category_id": "cat-5",
      "category_name": "Cupcakes & Pastries",
      "name": "Artisan Assorted Cupcake Box (6 Pcs)",
      "slug": "artisan-cupcake-box-6pcs",
      "description": "Six signature swirls: Red Velvet, Dark Cocoa, Pistachio Rose, Salted Caramel, Blueberry Cream, and Vanilla Gold.",
      "base_price": 650,
      "image_url": "/images/cupcakes.webp",
      "gallery_images": [
        "/images/cupcakes.webp"
      ],
      "is_featured": false,
      "is_active": true,
      "rating": 0,
      "review_count": 0,
      "variants": [
        {
          "id": "var-6-1",
          "product_id": "prod-6",
          "name": "Standard 6-Box",
          "weight_grams": 450,
          "price": 650,
          "is_active": true
        },
        {
          "id": "var-6-2",
          "product_id": "prod-6",
          "name": "Deluxe 12-Box",
          "weight_grams": 900,
          "price": 1200,
          "is_active": true
        }
      ],
      "allowed_flavor_ids": [
        "flav-1",
        "flav-2",
        "flav-3"
      ],
      "allowed_addon_ids": [
        "addon-1",
        "addon-3"
      ]
    }
  ],
  "categories": [
    {
      "id": "cat-1",
      "name": "Birthday cakes",
      "slug": "birthday-cakes",
      "description": "Festive handcrafted celebration cakes made with rich Bavarian cream",
      "image_url": "/images/floral-signature.webp",
      "sort_order": 1,
      "is_active": true
    },
    {
      "id": "cat-2",
      "name": "Chocolate",
      "slug": "chocolate-cakes",
      "description": "Decadent imported 70% Belgian dark chocolate truffles and ganache",
      "image_url": "https://images.unsplash.com/photo-1606890737304-57a1ca8a5b62?w=600&auto=format&fit=crop&q=80",
      "sort_order": 2,
      "is_active": true
    },
    {
      "id": "cat-3",
      "name": "Wedding & anniversary",
      "slug": "wedding-anniversary",
      "description": "Multi-tiered romantic masterpieces with sugar florals and gold leaf accents",
      "image_url": "/images/floral-signature.webp",
      "sort_order": 3,
      "is_active": true
    },
    {
      "id": "cat-4",
      "name": "Cheesecakes",
      "slug": "cheesecakes",
      "description": "Slow-baked New York style and fresh strawberry mousse cheesecakes",
      "image_url": "/images/cheesecake.webp",
      "sort_order": 4,
      "is_active": true
    },
    {
      "id": "cat-5",
      "name": "Cupcakes",
      "slug": "cupcakes-pastries",
      "description": "Bite-sized happiness boxes perfect for gifts and tea parties",
      "image_url": "/images/cupcakes.webp",
      "sort_order": 5,
      "is_active": true
    }
  ],
  "flavors": [
    {
      "id": "flav-1",
      "name": "Belgian Dark Truffle",
      "color_hex": "#3e2723",
      "is_active": true
    },
    {
      "id": "flav-2",
      "name": "Velvet Madagascar Vanilla",
      "color_hex": "#fff9c4",
      "is_active": true
    },
    {
      "id": "flav-3",
      "name": "Signature Red Velvet",
      "color_hex": "#b71c1c",
      "is_active": true
    },
    {
      "id": "flav-4",
      "name": "Black Forest Royale",
      "color_hex": "#880e4f",
      "is_active": true
    },
    {
      "id": "flav-5",
      "name": "Lotus Biscoff Crunch",
      "color_hex": "#d7ccc8",
      "is_active": true
    },
    {
      "id": "flav-6",
      "name": "Salted Caramel Praline",
      "color_hex": "#ffb74d",
      "is_active": true
    }
  ],
  "addons": [
    {
      "id": "addon-1",
      "name": "Sparkler Candle Set (Pack of 4)",
      "price": 120,
      "is_active": true
    },
    {
      "id": "addon-2",
      "name": "Golden Acrylic \"Happy Birthday\" Topper",
      "price": 180,
      "is_active": true
    },
    {
      "id": "addon-3",
      "name": "Handwritten Calligraphy Card",
      "price": 80,
      "is_active": true
    },
    {
      "id": "addon-4",
      "name": "Fresh Red Roses Mini Bouquet",
      "price": 350,
      "is_active": true
    },
    {
      "id": "addon-5",
      "name": "Ferrero Rocher Box (4 pcs)",
      "price": 420,
      "is_active": true
    }
  ],
  "banners": [
    {
      "id": "ban-1",
      "title": "Make every moment a little sweeter",
      "subtitle": "Explore celebration cakes and the little details that make them yours.",
      "image_url": "/images/floral-signature.webp",
      "button_text": "Explore cakes",
      "button_link": "#catalog",
      "is_active": true
    }
  ],
  "zones": [
    {
      "id": "zone-1",
      "name": "Tangail Town (Main City Area)",
      "delivery_fee": 60,
      "estimated_time": "1-2 Hours Express",
      "is_active": true
    },
    {
      "id": "zone-2",
      "name": "Nearby Suburbs & Akur Takur",
      "delivery_fee": 100,
      "estimated_time": "2-3 Hours",
      "is_active": true
    },
    {
      "id": "zone-3",
      "name": "Outside Town / Cantonment / Bypass",
      "delivery_fee": 150,
      "estimated_time": "3-4 Hours",
      "is_active": true
    }
  ],
  "slots": [
    {
      "id": "slot-1",
      "slot_label": "10:00 AM - 12:00 PM (Morning Slot)",
      "is_active": true
    },
    {
      "id": "slot-2",
      "slot_label": "12:00 PM - 02:00 PM (Lunch Slot)",
      "is_active": true
    },
    {
      "id": "slot-3",
      "slot_label": "02:00 PM - 04:00 PM (Afternoon Slot)",
      "is_active": true
    },
    {
      "id": "slot-4",
      "slot_label": "04:00 PM - 06:00 PM (Evening Teatime)",
      "is_active": true
    },
    {
      "id": "slot-5",
      "slot_label": "06:00 PM - 08:30 PM (Celebration Dinner)",
      "is_active": true
    }
  ],
  "coupons": [
    {
      "id": "coup-1",
      "code": "WELCOME100",
      "discount_type": "fixed",
      "discount_value": 100,
      "min_order_amount": 800,
      "is_active": true,
      "usage_count": 14
    },
    {
      "id": "coup-2",
      "code": "BIRTHDAY10",
      "discount_type": "percentage",
      "discount_value": 10,
      "min_order_amount": 1000,
      "max_discount_amount": 300,
      "is_active": true,
      "usage_count": 28
    },
    {
      "id": "coup-3",
      "code": "SWEETDELIGHT",
      "discount_type": "percentage",
      "discount_value": 15,
      "min_order_amount": 1500,
      "max_discount_amount": 500,
      "is_active": true,
      "usage_count": 9
    }
  ],
  "reviews": []
};
/* ==== END apps-script/SeedData.gs ==== */

/* ==== BEGIN apps-script/StaffOperations.gs ==== */
/**
 * Authenticated bakery operations for the existing private Google Sheet COD orders.
 * Install alongside Code.gs. All private operations use POST, and each staff
 * request verifies a Google ID token against a private email-role allowlist.
 *
 * Script Properties:
 * AURORA_GOOGLE_CLIENT_ID: Google OAuth Web Client ID (public)
 * AURORA_STAFF_USERS: JSON map, e.g.
 * {"owner@example.com":{"role":"super_admin","name":"Owner"},
 *  "rider@example.com":{"role":"delivery_man","name":"Rider"}}
 */
var AURORA_PUBLIC_GOOGLE_CLIENT_ID = "246617121730-fssfp59nlinltkfq0rccuud74rfpccum.apps.googleusercontent.com";
var AURORA_STAFF_ROLES_ = ['super_admin','admin','order_manager','kitchen_manager','delivery_manager','delivery_man','accountant'];
/**
 * OWNER-ONLY ONE-TIME SETUP.
 * Run manually from the Apps Script EDITOR while signed in as the intended
 * shop owner; this function is never exposed through doGet or doPost.
 * It refuses to replace an existing nonempty staff allowlist.
 */
function setupAuroraOwnerOnce() {
  var props = PropertiesService.getScriptProperties();
  var existing = String(props.getProperty('AURORA_STAFF_USERS') || '').trim();
  if (existing && existing !== '{}') {
    throw new Error('Staff allowlist already exists. Update it manually in Script Properties; setup will not overwrite it.');
  }
  var email = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Could not detect the script owner Google email. Configure AURORA_STAFF_USERS manually.');
  }
  var staff = {};
  staff[email] = {role:'super_admin',name:'Shop Owner'};
  props.setProperty('AURORA_GOOGLE_CLIENT_ID',AURORA_PUBLIC_GOOGLE_CLIENT_ID);
  props.setProperty('AURORA_STAFF_USERS',JSON.stringify(staff));
  return {configured:true,owner_email:email,role:'super_admin'};
}

function auroraStaffConfig_() {
  var props = PropertiesService.getScriptProperties();
  var clientId = String(props.getProperty('AURORA_GOOGLE_CLIENT_ID') || AURORA_PUBLIC_GOOGLE_CLIENT_ID).trim();
  var raw = String(props.getProperty('AURORA_STAFF_USERS') || '{}');
  var people = JSON.parse(raw);
  if (!clientId || !people || typeof people !== 'object' || Array.isArray(people)) {
    auroraReject_('staff_not_configured','Staff login is not configured.');
  }
  return {clientId:clientId,people:people};
}
/**
 * Server-side Google token verification with a short-lived ScriptCache to avoid
 * exceeding free URL Fetch quotas for active staff/rider polling.
 * Google's tokeninfo service validates the Google-issued token. This avoids
 * implementing homemade JWT cryptography inside Apps Script.
 * Permissions are NEVER cached; the staff allowlist is checked on each request.
 */
function auroraVerifiedGoogleClaims_(idToken,clientId) {
  if (typeof idToken !== 'string' || idToken.length < 100 || idToken.length > 6000 ||
      !/^[a-zA-Z0-9_.-]+$/.test(idToken)) auroraReject_('unauthorized','Sign in with your Google account.');
  if (!clientId) auroraReject_('account_not_configured','Google account verification is not configured.');
  var fingerprint = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,idToken,Utilities.Charset.UTF_8)
    .map(function(byte){return ('0'+((byte+256)%256).toString(16)).slice(-2);}).join('');
  var cache=CacheService.getScriptCache(), key='aurora_auth_'+fingerprint, claims;
  var previous=cache.get(key);
  if (previous) { try { claims=JSON.parse(previous); } catch (_) { claims=null; } }
  if (!claims) {
    try {
      var response=UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token='+encodeURIComponent(idToken),{
        method:'get',muteHttpExceptions:true,followRedirects:false
      });
      if(response.getResponseCode()!==200)auroraReject_('unauthorized','Your Google sign-in has expired or is invalid.');
      claims=JSON.parse(response.getContentText());
    } catch (error) {
      if(error&&error.auroraValidation)throw error;
      auroraReject_('unauthorized','Unable to verify Google sign-in.');
    }
  }
  var now=Math.floor(Date.now()/1000), expiry=Number(claims.exp);
  if(claims.aud!==clientId ||
     ['accounts.google.com','https://accounts.google.com'].indexOf(claims.iss)===-1 ||
     !(claims.email_verified===true||claims.email_verified==='true')||
     typeof claims.sub!=='string'||!claims.sub||
     typeof claims.email!=='string'||!claims.email||
     !Number.isFinite(expiry)||expiry<=now) {
    auroraReject_('unauthorized','Google sign-in did not pass identity validation.');
  }
  var ttl=Math.min(300,Math.floor(expiry-now)-30);
  if(!previous&&ttl>0){
    cache.put(key,JSON.stringify({aud:claims.aud,iss:claims.iss,
      email_verified:claims.email_verified,sub:claims.sub,email:claims.email,
      name:claims.name||'',exp:claims.exp}),ttl);
  }
  return claims;
}
function auroraStaffAuthenticate_(input) {
  if(input&&input.auth_token) {
    var person=auroraAccountAuthenticate_('staff',input.auth_token);
    if(AURORA_STAFF_ROLES_.indexOf(person.role)<0||person.role==='super_admin')
      auroraReject_('forbidden','This staff role is not authorized.');
    return {email:String(person.username),role:person.role,name:String(person.name||person.username).slice(0,100),
      people:auroraStaffConfig_().people,username:String(person.username),employee:true};
  }
  var config=auroraStaffConfig_();
  var decoded=auroraVerifiedGoogleClaims_(input&&input.id_token,config.clientId);
  var email=String(decoded.email).trim().toLowerCase();
  if(!Object.prototype.hasOwnProperty.call(config.people,email))
    auroraReject_('forbidden','This Google account is not authorized to access bakery operations.');
  var person=config.people[email];
  if(!person||AURORA_STAFF_ROLES_.indexOf(person.role)<0)
    auroraReject_('forbidden','Staff role is not authorized.');
  // Pre-existing Google staff accounts remain supported until the shop owner
  // removes them from the allowlist. New employees use username/password.
  return {email:email,role:person.role,name:String(person.name||email).slice(0,100),people:config.people};
}
function auroraStaffCan_(actor,action) {
  if (actor.role === 'super_admin' || actor.role === 'admin') return true;
  var permissions = {
    order_manager:['confirm','cancel'],
    kitchen_manager:['start_baking','mark_ready'],
    delivery_manager:['assign'],
    delivery_man:['pick_up','start_delivery','deliver'],
    accountant:[]
  };
  return (permissions[actor.role] || []).indexOf(action) !== -1;
}
function auroraPrivateFindRow_(table, orderId) {
  var index = table.headers.indexOf('id');
  if (index < 0) throw new Error('Private orders ID header missing.');
  var lastRow = table.sheet.getLastRow();
  if (lastRow < 2) return 0;
  var data = table.sheet.getRange(2,index+1,lastRow-1,1).getValues();
  for (var i=0;i<data.length;i++) if (String(data[i][0]) === orderId) return i+2;
  return 0;
}
function auroraPrivateSaveReceipt_(table,row,order) {
  // Single spreadsheet row write keeps status, payment and receipt JSON in sync.
  // Preserve any extra private columns added by the shop owner.
  var values = table.sheet.getRange(row,1,1,table.headers.length).getValues()[0];
  [['receipt_json',JSON.stringify(order)],['status',order.status],
   ['payment_status',order.payment_status],['updated_at',order.updated_at]].forEach(function(entry) {
    var col = table.headers.indexOf(entry[0]);
    if (col < 0) throw new Error('Missing private order column: '+entry[0]);
    values[col] = auroraSheetCell_(entry[1]);
  });
  table.sheet.getRange(row,1,1,values.length).setValues([values]);
}
/**
 * Fast read-only order lookup. Reading 20+ columns and JSON for every order on
 * each customer poll can delay OTP display significantly as Sheets grow.
 * These helpers read only the ID column and the selected receipt JSON cell.
 * Header validation remains mandatory; operations always use the owner Sheet.
 */
function auroraFastOrderTable_(book) {
  var sheet=book.getSheetByName('orders');
  if(!sheet||sheet.getLastRow()<1)auroraReject_('not_ready','The private orders Sheet is not initialized.');
  var width=sheet.getLastColumn(),last=sheet.getLastRow();
  if(width>100||last>50001)auroraReject_('limit','Private order Sheet exceeds supported size.');
  var headers=sheet.getRange(1,1,1,width).getValues()[0].map(function(value){return String(value).trim().toLowerCase();});
  ['id','receipt_json','status','payment_status','updated_at'].forEach(function(key){
    if(headers.indexOf(key)<0||headers.indexOf(key)!==headers.lastIndexOf(key))
      auroraReject_('invalid_sheet','Missing or duplicate orders column: '+key);
  });
  return {sheet:sheet,headers:headers,rows:[]};
}
function auroraFastReceipt_(table,rowNumber){
  var index=table.headers.indexOf('receipt_json')+1;
  var value=table.sheet.getRange(rowNumber,index,1,1).getValues()[0][0];
  var order;
  try{order=JSON.parse(String(value||''));}catch(_){auroraReject_('not_found','Order receipt not found.');}
  if(!order||typeof order.id!=='string')auroraReject_('not_found','Invalid order receipt.');
  return order;
}
function auroraFastOrderList_(table){
  var last=table.sheet.getLastRow();
  if(last<2)return [];
  var index=table.headers.indexOf('receipt_json')+1;
  return table.sheet.getRange(2,index,last-1,1).getValues().map(function(values){return {receipt_json:values[0]};});
}
function auroraOperationsOrders_(actor, table) {
  var list = [];
  table.rows.forEach(function(row) {
    var order;
    try { order = JSON.parse(String(row.receipt_json || '')); } catch (_) { return; }
    if (!order || !order.id) return;
    if (actor.role === 'delivery_man' && String(order.rider_id || '').toLowerCase() !== actor.email) return;
    if (actor.role === 'kitchen_manager' && ['pending','cancelled','delivered'].indexOf(order.status) !== -1) return;
    // Staff never receives the delivery OTP or the customer's bearer capability.
    delete order.customer_access_token;
    delete order.customer_google_sub;
    if (actor.role === 'kitchen_manager') {
      delete order.customer_phone;
      delete order.delivery_address;
    }
    if (actor.role === 'accountant') {
      delete order.customer_phone;
      delete order.delivery_address;
      delete order.items;
    }
    delete order.delivery_otp;
    delete order.otp_failed_attempts;
    delete order.otp_locked_until;
    list.push(order);
  });
  list.sort(function(a,b){return String(b.created_at||'').localeCompare(String(a.created_at||''));});
  return list.slice(0,100);
}
function auroraOperationsPost_(input) {
  var actor = auroraStaffAuthenticate_(input);
  if (input.action === 'staff_session') {
    var registered=auroraAccountProfiles_(),riders=registered.filter(function(p){return p.role==='delivery_man'&&p.active===true;})
      .map(function(p){return {email:p.username,name:p.name};});
    Object.keys(actor.people).filter(function(email){
      return actor.people[email]&&actor.people[email].role==='delivery_man';
    }).forEach(function(email){riders.push({email:email,name:String(actor.people[email].name||email).slice(0,100)});});
    var summary={ok:true,role:actor.role,name:actor.name,email:actor.email,username:actor.username||'',
      riders:['super_admin','admin','delivery_manager'].indexOf(actor.role)===-1?[]:riders};
    // Directory is private; expose only to the verified super_admin, never via GET.
    if(actor.role==='super_admin'){
      summary.staff_profiles=Object.keys(actor.people).filter(function(email){
        var person=actor.people[email];
        return person && AURORA_STAFF_ROLES_.indexOf(person.role)!==-1 &&
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      }).map(function(email){return {email:email,name:String(actor.people[email].name||email).slice(0,100),role:actor.people[email].role};})
        .sort(function(a,b){return a.role==='super_admin'?-1:b.role==='super_admin'?1:a.name.localeCompare(b.name);}).concat(registered.map(function(p){return {email:'',username:p.username,name:p.name,role:p.role,active:p.active};})).slice(0,200);
    }
    return summary;
  }
  var book = auroraSpreadsheet_(), table = auroraFastOrderTable_(book);
  if (input.action === 'staff_orders') return {ok:true,orders:auroraOperationsOrders_(actor,{rows:auroraFastOrderList_(table)}),role:actor.role};
  if (input.action !== 'staff_mutate') auroraReject_('invalid_action','Unknown staff action.');
  var action = String(input.operation || '');
  if (!auroraStaffCan_(actor,action)) auroraReject_('forbidden','Your role cannot perform this operation.');
  var orderId = auroraOrderText_(input.order_id,'Order ID',10,150);
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) auroraReject_('busy','Another order update is in progress. Retry.');
  try {
    table = auroraFastOrderTable_(book);
    var rowNumber = auroraPrivateFindRow_(table,orderId);
    if (!rowNumber) auroraReject_('not_found','Order not found.');
    var order = auroraFastReceipt_(table,rowNumber);
    if(String(order.id)!==orderId)auroraReject_('not_found','Order ID and receipt do not match.');
    var transitions = {
      confirm:['pending','confirmed'], cancel:['pending','cancelled'],
      start_baking:['confirmed','preparing'], mark_ready:['preparing','ready'],
      assign:['ready','assigned'], pick_up:['assigned','picked_up'],
      start_delivery:['picked_up','out_for_delivery'], deliver:['out_for_delivery','delivered']
    };
    if (!transitions[action] || (action==='cancel' ? ['pending','confirmed','preparing','ready','assigned'].indexOf(order.status)===-1 : order.status !== transitions[action][0])) {
      auroraReject_('invalid_transition','Order is not at the required stage.');
    }
    if (['pick_up','start_delivery','deliver'].indexOf(action) !== -1 &&
        String(order.rider_id||'').toLowerCase() !== actor.email) {
      auroraReject_('forbidden','This delivery is assigned to a different rider.');
    }
    if (action === 'assign') {
      var riderEmail = auroraOrderText_(input.rider_email,'Rider username or email',4,200).toLowerCase();
      var rider = actor.people[riderEmail];
      if(!rider){
        var allowed=auroraAccountProfiles_().filter(function(person){
          return person.username===riderEmail&&person.role==='delivery_man'&&person.active===true;
        })[0];
        if(allowed)rider={role:'delivery_man',name:allowed.name};
      }
      if (!rider || rider.role !== 'delivery_man') auroraReject_('invalid_rider','Select a registered delivery rider.');
      order.rider_id = riderEmail;
      order.rider_name = String(rider.name||riderEmail).slice(0,100);
    }
    if (action === 'start_delivery' && !order.delivery_otp) {
      // No code is issued at checkout; generate it just before delivery.
      // Use Apps Script's platform UUID source rather than Math.random().
      order.delivery_otp = String(1000 + (parseInt(String(Utilities.getUuid()).replace(/-/g,'').slice(0,8),16) % 9000));
    }
    if (action === 'deliver') {
      var nowMillis = Date.now();
      if (Number(order.otp_locked_until || 0) > nowMillis) auroraReject_('otp_locked','Too many incorrect OTP entries. Try again later.');
      var code = String(input.delivery_otp || '');
      if (!/^\d{4}$/.test(code) || code !== String(order.delivery_otp)) {
        order.otp_failed_attempts = Number(order.otp_failed_attempts || 0)+1;
        if (order.otp_failed_attempts >= 5) {
          order.otp_locked_until = nowMillis+15*60*1000;
          order.otp_failed_attempts = 0;
        }
        auroraPrivateSaveReceipt_(table,rowNumber,order);
        auroraReject_('invalid_otp','Delivery code is incorrect or temporarily locked.');
      }
      if (order.payment_method === 'cod' && input.cash_collected !== true) {
        auroraReject_('cash_unconfirmed','Confirm receiving the full cash payment before marking delivered.');
      }
      order.cod_collected = order.payment_method === 'cod';
      order.payment_status = order.payment_method === 'cod' ? 'paid' : order.payment_status;
      // Delivery codes are single-use; never persist a valid code after completion.
      order.delivery_otp = '';
      order.otp_failed_attempts = 0;
      order.otp_locked_until = 0;
    }
    if (action === 'cancel') order.delivery_otp = '';
    order.status = transitions[action][1];
    order.updated_at = new Date().toISOString();
    if (!Array.isArray(order.history)) order.history = [];
    order.history.push({id:'staff_'+Utilities.getUuid(),status:order.status,
      notes:'Updated by authorized staff',actor_name:actor.name,created_at:order.updated_at});
    auroraPrivateSaveReceipt_(table,rowNumber,order);
    var safeOrder = JSON.parse(JSON.stringify(order));
    delete safeOrder.customer_access_token;
    delete safeOrder.customer_google_sub;
    delete safeOrder.delivery_otp;
    delete safeOrder.otp_failed_attempts;
    delete safeOrder.otp_locked_until;
    return {ok:true,order:safeOrder};
  } finally {lock.releaseLock();}
}
/** Non-enumerating lookup only for a customer holding their own saved receipt. */
function auroraCustomerOrderStatus_(input) {
  var orderId = auroraOrderText_(input.order_id,'Order reference',10,150);
  if (!/^ord_[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(orderId)) auroraReject_('not_found','Order reference is invalid.');
  var digits = auroraOrderText_(input.customer_phone,'Phone',7,30).replace(/\D/g,'');
  var table = auroraFastOrderTable_(auroraSpreadsheet_());
  var rowNumber=auroraPrivateFindRow_(table,orderId);
  if (!rowNumber) auroraReject_('not_found','Order reference not found.');
  var order=auroraFastReceipt_(table,rowNumber);
  if (String(order.id)!==orderId || String(order.customer_phone||'').replace(/\D/g,'')!==digits)
    auroraReject_('not_found','Order reference and phone do not match.');
  var hasCapability = typeof input.customer_access_token === 'string' &&
    order.customer_access_token &&
    input.customer_access_token === order.customer_access_token;
  // A phone/password account proves ownership only if this exact order has
  // already been linked to that account using the original receipt capability.
  var hasPhoneOwner=false;
  if(!hasCapability && input.auth_token && order.customer_account_id){
    var customer=auroraAccountAuthenticate_('customer',input.auth_token);
    hasPhoneOwner=String(customer.id)===String(order.customer_account_id);
  }
  var hasGoogleOwner = false;
  if (!hasCapability && !hasPhoneOwner && input.id_token && order.customer_google_sub) {
    hasGoogleOwner = auroraCustomerIdentity_(input).sub === order.customer_google_sub;
  }
  // Legacy orders predate customer capabilities and may still support
  // limited phone/reference lookup, but NEVER return an OTP on that basis.
  if (!hasCapability && !hasPhoneOwner && !hasGoogleOwner && order.customer_access_token) {
    auroraReject_('forbidden','A valid receipt access key or linked Google login is required.');
  }
  var result={ok:true,order_id:order.id,status:order.status,updated_at:order.updated_at,
    history:Array.isArray(order.history) ? order.history.slice(-20) : [],rider_name:order.rider_name||'',
    payment_status:order.payment_status,cod_collected:order.cod_collected};
  if ((hasCapability || hasPhoneOwner || hasGoogleOwner) && order.status==='out_for_delivery') {
    result.delivery_otp=order.delivery_otp;
  }
  return result;
}
/* ==== END apps-script/StaffOperations.gs ==== */

/* ==== BEGIN apps-script/AccountAuth.gs ==== */
/**
 * Private, free Google-Sheets account system.
 * Staff: owner verifies with Google; employees use username + password.
 * Customers: phone + password; phone is NOT SMS verified.
 * The customer never gains access to older orders from phone number alone.
 * Passwords and session tokens are never stored or returned in plaintext.
 */
var AURORA_AUTH_KINDS_=['staff','customer'];
function auroraAccountDigest_(text) {
  var bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(text),Utilities.Charset.UTF_8);
  return bytes.map(function(byte){return ('0'+((byte+256)%256).toString(16)).slice(-2);}).join('');
}
function auroraAccountToken_(){return String(Utilities.getUuid())+String(Utilities.getUuid());}
function auroraAccountPassword_(password){
  if(typeof password!=='string'||password.length<10||password.length>128||password.trim()!==password)
    auroraReject_('invalid_password','Use a password of 10–128 characters, without leading or trailing spaces.');
  return password;
}
function auroraAccountHash_(password,salt) {
  // Iterated, per-user salted SHA-256 as supported by Apps Script (not Argon2).
  // Never log credentials; restricted Sheet editor access is essential.
  var hash=auroraAccountDigest_(salt+':'+password);
  for(var i=0;i<5000;i++)hash=auroraAccountDigest_(hash+':'+salt);
  return hash;
}
function auroraAccountValue_(table,id){
  var key=table.headers[0];
  return table.rows.filter(function(r){return String(r[key])===String(id);})[0]||null;
}
function auroraAccountSave_(table,record) {
  var key=table.headers[0],col=table.headers.indexOf(key)+1;
  var rows=table.sheet.getLastRow();
  if(rows<2)auroraReject_('not_found','Account record was not found.');
  var vals=table.sheet.getRange(2,col,rows-1,1).getValues();
  var i=vals.findIndex(function(row){return String(row[0])===String(record[key]);});
  if(i<0)auroraReject_('not_found','Account record was not found.');
  table.sheet.getRange(i+2,1,1,table.headers.length).setValues([table.headers.map(function(k){return auroraSheetCell_(record[k]);})]);
}
function auroraAccountProfiles_() {
  var table=auroraPrivateTable_(auroraSpreadsheet_(),'staff_accounts');
  return table.rows.map(function(person){return {name:String(person.name||person.username),username:String(person.username),
    role:String(person.role),active:person.active===true||String(person.active).toLowerCase()==='true'};});
}
function auroraAccountStart_(kind,id) {
  var t=auroraPrivateTable_(auroraSpreadsheet_(),'auth_sessions'),now=Date.now();
  var value=auroraAccountToken_(),row={
    token_hash:auroraAccountDigest_(value),account_type:kind,account_id:id,
    created_at:new Date(now).toISOString(),expires_at:new Date(now+(kind==='staff'?12:24*7)*3600000).toISOString(),revoked:false
  };
  auroraAppendPrivate_(t,row);
  return value;
}
function auroraAccountAuthenticate_(kind,value){
  if(typeof value!=='string'||! /^[0-9a-f-]{72}$/i.test(value))auroraReject_('unauthorized','Sign in again to access your account.');
  var h=auroraAccountDigest_(value),t=auroraPrivateTable_(auroraSpreadsheet_(),'auth_sessions');
  var session=t.rows.filter(function(row){return row.token_hash===h&&row.account_type===kind;})[0];
  if(!session||session.revoked===true||String(session.revoked).toLowerCase()==='true'||Date.parse(session.expires_at)<=Date.now())
    auroraReject_('unauthorized','Your login expired. Sign in again.');
  var accounts=auroraPrivateTable_(auroraSpreadsheet_(),kind==='staff'?'staff_accounts':'customer_accounts');
  var account=auroraAccountValue_(accounts,session.account_id);
  if(!account||!(account.active===true||String(account.active).toLowerCase()==='true'))
    auroraReject_('unauthorized','Your account is not active.');
  return account;
}
function auroraAccountSignOut_(kind,value){
  var h=auroraAccountDigest_(value),t=auroraPrivateTable_(auroraSpreadsheet_(),'auth_sessions');
  t.rows.forEach(function(row){if(row.token_hash===h&&row.account_type===kind){
    row.revoked=true;auroraAccountSave_(t,row);
  }});
}
function auroraAccountRevokeAll_(kind,id){
  var t=auroraPrivateTable_(auroraSpreadsheet_(),'auth_sessions');
  t.rows.forEach(function(row){if(row.account_type===kind&&row.account_id===id&&!row.revoked){
    row.revoked=true;auroraAccountSave_(t,row);
  }});
}
function auroraAccountLogin_(kind,identifier,password){
  var name=String(identifier||'').trim().toLowerCase();
  var isCustomer=kind==='customer';
  var key=isCustomer?'phone':'username';
  var accounts=auroraPrivateTable_(auroraSpreadsheet_(),isCustomer?'customer_accounts':'staff_accounts');
  var person=accounts.rows.filter(function(row){return String(row[key]).toLowerCase()===name;})[0];
  // Public users cannot enumerate accounts from different responses.
  if(!person||!(person.active===true||String(person.active).toLowerCase()==='true'))
    auroraReject_('invalid_credentials','Invalid login details.');
  if(Number(person.locked_until||0)>Date.now())
    auroraReject_('too_many_attempts','Too many attempts. Try again in 15 minutes.');
  if(typeof password!=='string'||password.length<10||password.length>128||
      auroraAccountHash_(password,String(person.password_salt))!==person.password_hash){
    person.failed_attempts=Number(person.failed_attempts||0)+1;
    if(person.failed_attempts>=5){person.locked_until=Date.now()+15*60000;person.failed_attempts=0;}
    auroraAccountSave_(accounts,person);
    auroraReject_('invalid_credentials','Invalid login details.');
  }
  person.failed_attempts=0;person.locked_until=0;
  auroraAccountSave_(accounts,person);
  return {person:person,token:auroraAccountStart_(kind,person.id)};
}
function auroraAccountPhone_(value){
  var phone=String(value||'').replace(/[\s()-]/g,'');
  if(!/^(?:\+?88)?01[3-9]\d{8}$/.test(phone))
    auroraReject_('invalid_phone','Enter a valid Bangladesh mobile number.');
  return '0'+phone.slice(-10);
}
function auroraAccountCreateStaff_(actor,input) {
  if(actor.role!=='super_admin')auroraReject_('forbidden','Only the Super Admin can manage staff.');
  var username=String(input.username||'').toLowerCase().trim();
  if(!/^[a-z][a-z0-9_]{3,30}$/.test(username))auroraReject_('invalid_username','Use 4–31 letters, numbers and underscores, starting with a letter.');
  var role=String(input.role||'');
  if(['admin','order_manager','kitchen_manager','delivery_manager','delivery_man','accountant'].indexOf(role)<0)
    auroraReject_('invalid_role','Choose an allowed employee role.');
  var name=auroraOrderText_(input.name,'Staff name',2,100),password=auroraAccountPassword_(input.password);
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))auroraReject_('busy','Please retry staff setup.');
  try {
    var table=auroraPrivateTable_(auroraSpreadsheet_(),'staff_accounts');
    if(table.rows.some(function(row){return String(row.username).toLowerCase()===username;}))
      auroraReject_('duplicate_account','That username is already in use.');
    var salt=auroraAccountToken_();
    auroraAppendPrivate_(table,{id:'staff_'+Utilities.getUuid(),username:username,name:name,role:role,password_salt:salt,
      password_hash:auroraAccountHash_(password,salt),failed_attempts:0,locked_until:0,active:true,
      created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
    return {ok:true,created:true,username:username};
  }finally{lock.releaseLock();}
}
function auroraAccountStaffPost_(input) {
  if(input.action==='staff_password_login'){
    var login=auroraAccountLogin_('staff',input.username,input.password);
    return {ok:true,auth_token:login.token,role:login.person.role,name:login.person.name,username:login.person.username};
  }
  var actor=auroraStaffAuthenticate_(input);
  if(input.action==='staff_account_create')return auroraAccountCreateStaff_(actor,input);
  if(input.action==='staff_password_logout'){if(input.auth_token)auroraAccountSignOut_('staff',input.auth_token);return {ok:true};}
  if(input.action==='staff_account_set_active'||input.action==='staff_account_reset_password'){
    if(actor.role!=='super_admin')auroraReject_('forbidden','Only Super Admin can update staff.');
    var username=String(input.username||'').toLowerCase().trim();
    var lock=LockService.getScriptLock();if(!lock.tryLock(10000))auroraReject_('busy','Retry staff update.');
    try{
      var t=auroraPrivateTable_(auroraSpreadsheet_(),'staff_accounts');
      var person=t.rows.filter(function(row){return String(row.username)===username;})[0];
      if(!person)auroraReject_('not_found','Staff user was not found.');
      if(input.action==='staff_account_set_active')person.active=input.active===true;
      else{
        var password=auroraAccountPassword_(input.password),salt=auroraAccountToken_();
        person.password_salt=salt;person.password_hash=auroraAccountHash_(password,salt);
        person.failed_attempts=0;person.locked_until=0;
      }
      person.updated_at=new Date().toISOString();auroraAccountSave_(t,person);
      auroraAccountRevokeAll_('staff',person.id);
      return {ok:true,updated:true};
    }finally{lock.releaseLock();}
  }
  auroraReject_('invalid_action','Unknown staff account action.');
}
function auroraAccountSafeCustomer_(p){
  return {id:String(p.id),phone:String(p.phone),name:String(p.name),email:String(p.email||''),address:String(p.address||''),phone_verified:false};
}
function auroraAccountCustomerPost_(input) {
  var action=String(input.action||'');
  if(action==='customer_phone_signup'){
    var phone=auroraAccountPhone_(input.phone),password=auroraAccountPassword_(input.password);
    var name=auroraOrderText_(input.name,'Name',2,100);
    var lock=LockService.getScriptLock();if(!lock.tryLock(10000))auroraReject_('busy','Try again.');
    try {
      // Google Apps Script has no trusted public client IP header. Limit the
      // free anonymous signup endpoint globally and per normalized phone.
      var cache=CacheService.getScriptCache(),key='aurora_phone_signup_'+auroraAccountDigest_(phone).slice(0,28);
      var prior=Number(cache.get(key)||0);
      if(prior>=3)auroraReject_('rate_limited','Too many registration attempts for this number. Retry later.');
      cache.put(key,String(prior+1),3600);
      var t=auroraPrivateTable_(auroraSpreadsheet_(),'customer_accounts');
      if(t.rows.some(function(row){return String(row.phone)===phone;}))
        auroraReject_('duplicate_account','This phone number already has an account. Sign in or contact the shop.');
      var id='customer_'+Utilities.getUuid(),salt=auroraAccountToken_();
      var person={id:id,phone:phone,name:name,address:'',email:'',password_salt:salt,
        password_hash:auroraAccountHash_(password,salt),failed_attempts:0,locked_until:0,active:true,
        created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
      auroraAppendPrivate_(t,person);
      return {ok:true,auth_token:auroraAccountStart_('customer',id),profile:auroraAccountSafeCustomer_(person)};
    }finally{lock.releaseLock();}
  }
  if(action==='customer_phone_login'){
    var login=auroraAccountLogin_('customer',auroraAccountPhone_(input.phone),input.password);
    return {ok:true,auth_token:login.token,profile:auroraAccountSafeCustomer_(login.person)};
  }
  var person=auroraAccountAuthenticate_('customer',input.auth_token);
  if(action==='customer_phone_session')return {ok:true,profile:auroraAccountSafeCustomer_(person)};
  if(action==='customer_phone_logout'){auroraAccountSignOut_('customer',input.auth_token);return {ok:true};}
  if(action==='customer_phone_password'||action==='customer_phone_close'){
    var oldPassword=String(input.current_password||'');
    if(oldPassword.length<10||auroraAccountHash_(oldPassword,String(person.password_salt))!==person.password_hash)
      auroraReject_('invalid_credentials','Current password was not accepted.');
    var accountLock=LockService.getScriptLock();
    if(!accountLock.tryLock(10000))auroraReject_('busy','Another account update is in progress.');
    try{
      var accounts=auroraPrivateTable_(auroraSpreadsheet_(),'customer_accounts');
      var current=auroraAccountValue_(accounts,person.id);
      if(!current||!(current.active===true||String(current.active).toLowerCase()==='true'))
        auroraReject_('unauthorized','Your account is no longer active.');
      if(auroraAccountHash_(oldPassword,String(current.password_salt))!==current.password_hash)
        auroraReject_('invalid_credentials','Current password was not accepted.');
      if(action==='customer_phone_close'){
        current.active=false;
        current.name='Closed account';current.email='';current.address='';
        current.updated_at=new Date().toISOString();
        auroraAccountSave_(accounts,current);
        auroraAccountRevokeAll_('customer',current.id);
        // Financial records/receipts remain unchanged for COD reconciliation.
        return {ok:true,closed:true};
      }
      var freshPassword=auroraAccountPassword_(input.new_password);
      if(freshPassword===oldPassword)auroraReject_('invalid_password','Choose a new password.');
      var salt=auroraAccountToken_();
      current.password_salt=salt;
      current.password_hash=auroraAccountHash_(freshPassword,salt);
      current.updated_at=new Date().toISOString();
      auroraAccountSave_(accounts,current);
      auroraAccountRevokeAll_('customer',current.id);
      return {ok:true,auth_token:auroraAccountStart_('customer',current.id)};
    }finally{accountLock.releaseLock();}
  }
  if(action==='customer_phone_profile'){
    var n=auroraOrderText_(input.name,'Name',2,100);
    var address=auroraOptionalText_(input.address,'Address',300);
    var email=String(input.email||'').trim();
    if(email&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>150))
      auroraReject_('invalid_email','Enter a valid contact email.');
    var t=auroraPrivateTable_(auroraSpreadsheet_(),'customer_accounts');
    person.name=n;person.address=address;person.email=email;person.updated_at=new Date().toISOString();
    auroraAccountSave_(t,person);
    return {ok:true,profile:auroraAccountSafeCustomer_(person)};
  }
  if(action==='customer_phone_orders') {
    var t=auroraPrivateTable_(auroraSpreadsheet_(),'orders'),results=[];
    t.rows.forEach(function(row){
      var order;try{order=JSON.parse(String(row.receipt_json||''));}catch(_){return;}
      if(order&&order.customer_account_id===person.id)results.push(auroraCustomerSafeReceipt_(order));
    });
    results.sort(function(a,b){return String(b.created_at).localeCompare(String(a.created_at));});
    return {ok:true,orders:results.slice(0,100)};
  }
  if(action==='customer_phone_claim'){
    // An unverified phone number can never claim an old order. Receipt token
    // issued at checkout is the sole ownership proof for manual linking.
    var id=auroraOrderText_(input.order_id,'Order ID',10,150);
    var proof=String(input.customer_access_token||'');
    if(!/^[0-9a-f-]{72}$/i.test(proof))auroraReject_('forbidden','Provide your original receipt.');
    var lock=LockService.getScriptLock();if(!lock.tryLock(10000))auroraReject_('busy','Retry linking.');
    try{
      var t=auroraPrivateTable_(auroraSpreadsheet_(),'orders');
      var item=t.rows.filter(function(row){return String(row.id)===id;})[0];
      if(!item)auroraReject_('not_found','Order not found.');
      var order=JSON.parse(String(item.receipt_json||'{}'));
      if(!order.customer_access_token||order.customer_access_token!==proof)
        auroraReject_('forbidden','The original confirmed receipt is required.');
      if(order.customer_account_id&&order.customer_account_id!==person.id)
        auroraReject_('already_linked','This order belongs to a different account.');
      if(order.customer_google_sub)auroraReject_('already_linked','This order is linked to a Google account.');
      if(!order.customer_account_id){
        order.customer_account_id=person.id;order.updated_at=new Date().toISOString();
        auroraPrivateSaveReceipt_(t,auroraPrivateFindRow_(t,id),order);
      }
      return {ok:true,linked:true,order_id:id};
    }finally{lock.releaseLock();}
  }
  auroraReject_('invalid_action','Unknown customer phone account action.');
}
/* ==== END apps-script/AccountAuth.gs ==== */

/* ==== BEGIN apps-script/CustomerAccounts.gs ==== */
/**
 * Optional FREE Google customer accounts; no SMS gateway and no email-sending API.
 * Guest COD remains possible. A customer holding an original confirmed receipt
 * can link it once to their verified Google identity and recover it later.
 *
 * Uses same AURORA_GOOGLE_CLIENT_ID Script Property as staff.
 * Requires Code.gs and StaffOperations.gs (private receipt save helper).
 */
function auroraCustomerIdentity_(input) {
  var clientId=String(PropertiesService.getScriptProperties().getProperty('AURORA_GOOGLE_CLIENT_ID')||AURORA_PUBLIC_GOOGLE_CLIENT_ID).trim();
  var claims=auroraVerifiedGoogleClaims_(input && input.id_token,clientId);
  return {sub:claims.sub,email:String(claims.email||'').toLowerCase(),
    name:String(claims.name||claims.email||'Customer').slice(0,100)};
}
function auroraCustomerSafeReceipt_(order) {
  var copy=JSON.parse(JSON.stringify(order));
  delete copy.customer_google_sub;
  delete copy.otp_failed_attempts;
  delete copy.otp_locked_until;
  // The rider OTP is only useful when the customer has received the cake.
  if (copy.status !== 'out_for_delivery') copy.delivery_otp='';
  return copy;
}
function auroraCustomerAccountsPost_(input) {
  var identity=auroraCustomerIdentity_(input);
  if (input.action === 'customer_session') {
    return {ok:true,email:identity.email,name:identity.name};
  }
  if (input.action === 'customer_orders') {
    var table=auroraPrivateTable_(auroraSpreadsheet_(),'orders');
    var results=[];
    table.rows.forEach(function(row) {
      var order;
      try {order=JSON.parse(String(row.receipt_json || ''));} catch (_) {return;}
      if (!order || String(order.customer_google_sub||'') !== identity.sub) return;
      results.push(auroraCustomerSafeReceipt_(order));
    });
    results.sort(function(a,b){return String(b.created_at||'').localeCompare(String(a.created_at||''));});
    return {ok:true,orders:results.slice(0,50)};
  }
  if (input.action === 'customer_claim_order') {
    var orderId=auroraOrderText_(input.order_id,'Order reference',10,150);
    if (!/^ord_[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(orderId)) auroraReject_('not_found','No matching order receipt.');
    var phone=auroraOrderText_(input.customer_phone,'Checkout phone number',7,30).replace(/\D/g,'');
    var lock=LockService.getScriptLock();
    if (!lock.tryLock(10000)) auroraReject_('busy','Please retry linking your receipt.');
    try {
      var table=auroraPrivateTable_(auroraSpreadsheet_(),'orders');
      var rowNumber=auroraPrivateFindRow_(table,orderId);
      var record=table.rows.filter(function(row){return String(row.id)===orderId;})[0];
      if (!rowNumber || !record ||
          String(record.customer_phone||'').replace(/\D/g,'')!==phone) {
        auroraReject_('not_found','No matching order receipt and checkout phone.');
      }
      var order=JSON.parse(String(record.receipt_json));
      // A public order reference plus a contact number does NOT prove
      // ownership. Only the original persisted receipt holds this key.
      if (!order.customer_access_token ||
          typeof input.customer_access_token !== 'string' ||
          input.customer_access_token !== order.customer_access_token) {
        auroraReject_('forbidden','Use the original confirmed order receipt to link this account.');
      }
      if (order.customer_google_sub && order.customer_google_sub!==identity.sub) {
        auroraReject_('already_linked','This order is linked to a different Google account. Contact the bakery with proof of purchase.');
      }
      if (!order.customer_google_sub) {
        order.customer_google_sub=identity.sub;
        order.updated_at=new Date().toISOString();
        auroraPrivateSaveReceipt_(table,rowNumber,order);
      }
      return {ok:true,linked:true,order_id:orderId};
    } finally {lock.releaseLock();}
  }
  auroraReject_('invalid_action','Unsupported customer account action.');
}
/* ==== END apps-script/CustomerAccounts.gs ==== */

/* ==== BEGIN apps-script/LiveCatalog.gs ==== */
/**
 * Free authenticated live catalogue operations for the original public Sheets.
 * Deliberately limited to allowlisted fields. Staff cannot edit arbitrary cells
 * or private orders through this route.
 */
function auroraCatalogSnapshot_(book) {
  var products=auroraRows_(book,'products').map(function(row) {
    return {id:String(row.id),name:String(row.name||''),is_active:auroraActive_(row.is_active)};
  });
  var variants=auroraRows_(book,'product_variants').map(function(row) {
    return {id:String(row.id),product_id:String(row.product_id),name:String(row.name||''),
      price:Number(row.price),sale_price:row.sale_price===''?'':Number(row.sale_price),
      is_active:auroraActive_(row.is_active)};
  });
  var settings=auroraPairs_(auroraRows_(book,'settings'),PUBLIC_SETTINGS_KEYS);
  return {ok:true,products:products,variants:variants,
    settings:{shop_name:String(settings.shop_name||''),
      accepting_orders:auroraActive_(settings.accepting_orders),
      delivery_enabled:auroraActive_(settings.delivery_enabled)}};
}
function auroraCatalogueValue_(table,field,value) {
  var allowed={
    products:['name','description','image_url','is_active'],
    product_variants:['price','sale_price','is_active'],
    settings:['shop_name','accepting_orders','delivery_enabled']
  };
  if (!allowed[table] || allowed[table].indexOf(field)===-1) {
    auroraReject_('forbidden','This field cannot be changed through the admin panel.');
  }
  if (field==='is_active'||field==='accepting_orders'||field==='delivery_enabled') {
    if (typeof value!=='boolean') auroraReject_('invalid_value','Set the switch to true or false.');
    return value;
  }
  if (field==='price'||field==='sale_price') {
    if (field==='sale_price'&&value==='') return '';
    if (typeof value!=='number'||!Number.isFinite(value)||value<0||value>10000000) {
      auroraReject_('invalid_price','Cake price must be a valid non-negative number.');
    }
    return Math.round(value*100)/100;
  }
  if (typeof value!=='string') auroraReject_('invalid_value','A text value is required.');
  var text=value.trim();
  if (field==='name'||field==='shop_name') {
    if (text.length<2||text.length>150) auroraReject_('invalid_value','Name must contain 2 to 150 characters.');
  } else if (field==='description') {
    if (text.length>2000) auroraReject_('invalid_value','Description must be under 2,000 characters.');
  } else if (field==='image_url') {
    if (text && !/^https:\/\/[^ <>"']+$/i.test(text) && !/^\/images\/[a-zA-Z0-9_.\-\/]+$/.test(text)) {
      auroraReject_('invalid_value','Use a public HTTPS image URL or existing /images/ path.');
    }
    if (text.length>1500) auroraReject_('invalid_value','Image URL is too long.');
  }
  return text;
}
function auroraCatalogPost_(input) {
  var actor=auroraStaffAuthenticate_(input);
  if (actor.role!=='super_admin'&&actor.role!=='admin') {
    auroraReject_('forbidden','Product and shop settings require an administrator account.');
  }
  if (input.action==='staff_catalog') return auroraCatalogSnapshot_(auroraSpreadsheet_());
  if (input.action!=='staff_catalog_update') auroraReject_('invalid_action','Unknown catalogue operation.');
  var tableName=String(input.table||''), field=String(input.field||'');
  var recordId=auroraOrderText_(input.record_id,'Record ID',1,150);
  var value=auroraCatalogueValue_(tableName,field,input.value);
  var lock=LockService.getScriptLock();
  if (!lock.tryLock(10000)) auroraReject_('busy','Another shop update is in progress.');
  try {
    var book=auroraSpreadsheet_();
    var sheet=book.getSheetByName(tableName);
    if (!sheet) auroraReject_('not_found','Catalogue table missing.');
    var headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0]
      .map(function(value){return String(value).trim().toLowerCase();});
    var key=tableName==='settings'?'key':'id';
    var targetColumn=tableName==='settings'?'value':field;
    var keyIndex=headers.indexOf(key), fieldIndex=headers.indexOf(targetColumn);
    if (keyIndex<0||fieldIndex<0||headers.lastIndexOf(key)!==keyIndex||
        headers.lastIndexOf(targetColumn)!==fieldIndex) auroraReject_('invalid_sheet','Missing or duplicate expected column.');
    var ids=sheet.getLastRow()>1 ?
      sheet.getRange(2,keyIndex+1,sheet.getLastRow()-1,1).getValues() : [];
    var rows=[];
    ids.forEach(function(cell,index){if (String(cell[0]||'').trim()===recordId) rows.push(index+2);});
    if (rows.length!==1 || (tableName==='settings'&&recordId!==field)) {
      auroraReject_('not_found','Shop field or catalogue item was not found.');
    }
    sheet.getRange(rows[0],fieldIndex+1,1,1).setValues([[auroraSheetCell_(value)]]);
    CacheService.getScriptCache().remove(auroraCacheKey_());
    return {ok:true,updated:true};
  } finally {lock.releaseLock();}
}
/* ==== END apps-script/LiveCatalog.gs ==== */

/* ==== BEGIN apps-script/PublicCms.gs ==== */
/**
 * Private website CMS. Never exposes private orders or account tables.
 * All changes are validated server-side against PUBLIC_TABLE_SCHEMAS.
 * 'Delete' archives a public row; historical references remain intact.
 */
var AURORA_CMS_TABLES_=['settings','content','hero_slides','highlights','faqs','links','categories','products','product_variants','flavors','product_addons','banners','delivery_zones','delivery_slots','coupons','reviews'];
var AURORA_CMS_BOOLEAN_FIELDS_=['is_active','is_featured','accepting_orders','delivery_enabled'];
var AURORA_CMS_NUMBER_FIELDS_=['sort_order','base_price','sale_price','price','weight_grams','rating','review_count','delivery_fee','discount_value','min_order_amount','max_discount_amount','usage_count'];
var AURORA_CMS_URL_FIELDS_=['image_url','logo_url','profile_image_url','facebook_url','instagram_url','youtube_url','tiktok_url','website_url','button_link','url','whatsapp_url','maps_url'];
function auroraCmsTable_(name) {
  if(AURORA_CMS_TABLES_.indexOf(name)===-1)auroraReject_('forbidden','This table is not editable through the website.');
  return name;
}
function auroraCmsRow_(table,id){
  return table.rows.filter(function(row){return String(row[table.key])===id;})[0]||null;
}
function auroraCmsRead_(book,name) {
  var columns=PUBLIC_TABLE_SCHEMAS[name],sheet=book.getSheetByName(name);
  if(!sheet||sheet.getLastRow()<1)auroraReject_('not_ready','Run setupSheetDatabase before editing website content.');
  var width=sheet.getLastColumn(),count=sheet.getLastRow();
  if(width>100||count>20001)auroraReject_('limit','This Sheet exceeds the current live editor limit.');
  var raw=sheet.getRange(1,1,count,width).getValues();
  var headers=raw.shift().map(function(cell){return String(cell).trim().toLowerCase();});
  columns.forEach(function(field){if(headers.indexOf(field)<0||headers.indexOf(field)!==headers.lastIndexOf(field))auroraReject_('invalid_sheet','Missing or duplicate column: '+field);});
  var key=(name==='settings'||name==='content')?'key':'id';
  var rows=raw.map(function(rawRow,index){
    var obj={_row:index+2};
    columns.forEach(function(field){obj[field]=rawRow[headers.indexOf(field)];});
    return obj;
  }).filter(function(row){return String(row[key]||'').trim()!=='';});
  return {sheet:sheet,headers:headers,columns:columns,key:key,rows:rows};
}
function auroraCmsValidate_(name,field,value){
  if(PUBLIC_TABLE_SCHEMAS[name].indexOf(field)===-1)auroraReject_('invalid_field','This field is not allowed.');
  if(name==='settings'&&field==='value') {
    return value===true||value===false||typeof value==='number'?value:auroraCmsString_(value,5000);
  }
  if(name==='content'&&field==='value')return auroraCmsString_(value,5000);
  if(AURORA_CMS_BOOLEAN_FIELDS_.indexOf(field)!==-1){
    if(typeof value!=='boolean')auroraReject_('invalid_value','A true/false value is required for '+field);
    return value;
  }
  if(AURORA_CMS_NUMBER_FIELDS_.indexOf(field)!==-1){
    if(value===''&&['sale_price','max_discount_amount','rating'].indexOf(field)!==-1)return '';
    if(typeof value!=='number'||!isFinite(value)||value<0||value>10000000)
      auroraReject_('invalid_value','Enter a valid non-negative number for '+field);
    return Math.round(value*100)/100;
  }
  var str=auroraCmsString_(value,5000);
  if(AURORA_CMS_URL_FIELDS_.indexOf(field)!==-1||/(_url|_image)$/.test(field)){
    if(str&&!/^https:\/\/[^\s<>"']+$/i.test(str)&&!/^\/images\/[a-zA-Z0-9_./-]+$/.test(str)&&!/^\/api\/image\?id=[A-Za-z0-9_-]{12,150}$/.test(str))
      auroraReject_('invalid_url','Images and links must be HTTPS or an existing /images/ path.');
  }
  if(field==='color_hex'&&str&&!/^#[0-9a-f]{6}$/i.test(str))auroraReject_('invalid_color','Use a six-digit hex color.');
  if(field==='discount_type'&&['fixed','percentage'].indexOf(str)===-1)auroraReject_('invalid_value','Choose fixed or percentage.');
  if(field==='status'&&name==='reviews'&&['pending','approved','rejected','hidden'].indexOf(str)===-1)
    auroraReject_('invalid_status','Invalid review status.');
  if(field==='sort_order'&&str.length>0)auroraReject_('invalid_value','Sort order must be numeric.');
  if(field==='slug'&&str&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(str))auroraReject_('invalid_slug','Slug must be lowercase letters, numbers and hyphens.');
  if(['allowed_flavor_ids','allowed_addon_ids','gallery_images'].indexOf(field)!==-1&&str){
    try{var parsed=JSON.parse(str);if(!Array.isArray(parsed)||parsed.length>60||parsed.some(function(item){return typeof item!=='string'||item.length>150;}))throw new Error('bad');}
    catch(_){auroraReject_('invalid_list','Provide a JSON array of strings for '+field);}
  }
  return str;
}
function auroraCmsString_(value,max){
  if(typeof value!=='string')auroraReject_('invalid_value','Enter text rather than an object.');
  if(value.length>max)auroraReject_('too_long','Text is too long.');
  return value.trim();
}
function auroraCmsKeyValue_(name,key,value){
  var permitted=name==='settings'?PUBLIC_SETTINGS_KEYS:PUBLIC_CONTENT_KEYS;
  if(permitted.indexOf(key)===-1)auroraReject_('forbidden','This website field is not in the allowed content list.');
  if(name==='settings'&&['accepting_orders','delivery_enabled'].indexOf(key)!==-1){
    if(typeof value!=='boolean')auroraReject_('invalid_value','Use a boolean for this switch.');
    return value;
  }
  if(name==='settings'&&AURORA_CMS_URL_FIELDS_.indexOf(key)!==-1)return auroraCmsValidate_('links','url',value);
  if(typeof value!=='string')auroraReject_('invalid_value','Enter a text value.');
  return auroraCmsString_(value,5000);
}
function auroraCmsRowsSafe_(table){
  return table.rows.slice(0,500).map(function(row){
    var result={};
    table.columns.forEach(function(field){result[field]=row[field];});
    return result;
  });
}
function auroraCmsValidateRefs_(book,name,row,oldId){
  if(name==='products'&&row.category_id){
    var categories=auroraCmsRead_(book,'categories');
    if(!auroraCmsRow_(categories,String(row.category_id)))auroraReject_('invalid_reference','Choose an existing category.');
  }
  if(name==='product_variants'){
    var products=auroraCmsRead_(book,'products');
    if(!auroraCmsRow_(products,String(row.product_id)))auroraReject_('invalid_reference','Choose an existing product.');
  }
  if(name==='products'){
    [['allowed_flavor_ids','flavors'],['allowed_addon_ids','product_addons']].forEach(function(pair){
      var ids=String(row[pair[0]]||'');
      if(!ids)return;
      var values=[];try{values=JSON.parse(ids);}catch(_){auroraReject_('invalid_list','Invalid selection IDs.');}
      if(!values.length)return;
      var linked=auroraCmsRead_(book,pair[1]).rows.map(function(item){return String(item.id);});
      if(values.some(function(id){return linked.indexOf(id)===-1;}))
        auroraReject_('invalid_reference','Selected '+pair[1]+' ID does not exist.');
    });
  }
  if(name==='highlights'&&row.category_id){
    var highlightCategories=auroraCmsRead_(book,'categories');
    if(!auroraCmsRow_(highlightCategories,String(row.category_id)))auroraReject_('invalid_reference','Highlight category does not exist.');
  }
  if(name==='hero_slides'&&row.product_id){
    var prods=auroraCmsRead_(book,'products');
    if(!auroraCmsRow_(prods,String(row.product_id)))auroraReject_('invalid_reference','Hero slide product does not exist.');
  }
  if(name==='categories'&&oldId&&row.is_active===false){
    var products2=auroraCmsRead_(book,'products').rows;
    if(products2.some(function(p){return String(p.category_id)===oldId&&auroraActive_(p.is_active);}))
      auroraReject_('in_use','Hide or move active products in this category before archiving it.');
  }
  if(name==='coupons'&&row.discount_type==='percentage'&&Number(row.discount_value)>100)
    auroraReject_('invalid_discount','Percentage discount cannot exceed 100.');
}
function auroraCmsPost_(input){
  var actor=auroraStaffAuthenticate_(input);
  if(actor.role!=='super_admin'&&actor.role!=='admin')auroraReject_('forbidden','Only authorized shop administrators can edit public content.');
  var name=auroraCmsTable_(String(input.table||'')),action=String(input.action||'');
  if(action==='staff_cms_list'){
    var snapshot=auroraCmsRead_(auroraSpreadsheet_(),name);
    return {ok:true,table:name,columns:snapshot.columns,rows:auroraCmsRowsSafe_(snapshot),
      total:snapshot.rows.length,truncated:snapshot.rows.length>500,can_delete:actor.role==='super_admin'};
  }
  if(['staff_cms_create','staff_cms_update','staff_cms_delete'].indexOf(action)===-1)
    auroraReject_('invalid_action','Unsupported website edit.');
  if(action==='staff_cms_delete'&&actor.role!=='super_admin')auroraReject_('forbidden','Only Super Admin can archive public records.');
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))auroraReject_('busy','Another website change is being saved.');
  try {
    var book=auroraSpreadsheet_(),table=auroraCmsRead_(book,name),isKeyValue=name==='settings'||name==='content';
    var recordId=String(input.record_id||'').trim();
    var draft=input.values;
    if(!draft||typeof draft!=='object'||Array.isArray(draft))auroraReject_('invalid_request','Send an object of editable values.');
    var fields=Object.keys(draft);
    if(action!=='staff_cms_delete'&&(fields.length===0||fields.length>table.columns.length))
      auroraReject_('invalid_request','Choose fields to save.');
    if(fields.some(function(k){return table.columns.indexOf(k)===-1||k===table.key||k==='created_at'}))
      auroraReject_('invalid_field','A protected key or column cannot be changed.');
    if(isKeyValue){
      if(action==='staff_cms_delete')auroraReject_('protected','Required shop text/settings keys cannot be deleted. Edit their values instead.');
      var key=action==='staff_cms_create'?String(input.key||'').trim():recordId;
      var allow=name==='settings'?PUBLIC_SETTINGS_KEYS:PUBLIC_CONTENT_KEYS;
      if(allow.indexOf(key)===-1)auroraReject_('forbidden','This website key is not editable.');
      var previous=auroraCmsRow_(table,key);
      if(action==='staff_cms_create'&&previous)auroraReject_('duplicate','That website key already exists.');
      if(action==='staff_cms_update'&&!previous)auroraReject_('not_found','Website key does not exist.');
      if(!Object.prototype.hasOwnProperty.call(draft,'value'))auroraReject_('invalid_field','Provide a value.');
      var val=auroraCmsKeyValue_(name,key,draft.value);
      if(action==='staff_cms_create')table.sheet.getRange(table.sheet.getLastRow()+1,1,1,2).setValues([[key,auroraSheetCell_(val)]]);
      else table.sheet.getRange(previous._row,table.headers.indexOf('value')+1,1,1).setValues([[auroraSheetCell_(val)]]);
    }else{
      if(action!=='staff_cms_create'&&!recordId)auroraReject_('invalid_request','Select a record.');
      var existing=action==='staff_cms_create'?null:auroraCmsRow_(table,recordId);
      if(action!=='staff_cms_create'&&!existing)auroraReject_('not_found','Record was not found.');
      var row={},nowId=action==='staff_cms_create'?'cms_'+Utilities.getUuid():recordId;
      table.columns.forEach(function(field){
        row[field]=existing?existing[field]:field===table.key?nowId:
          AURORA_CMS_BOOLEAN_FIELDS_.indexOf(field)!==-1?false:
          AURORA_CMS_NUMBER_FIELDS_.indexOf(field)!==-1?0:'';
      });
      if(action==='staff_cms_delete'){
        if(table.columns.indexOf('is_active')!==-1)row.is_active=false;
        else if(name==='reviews')row.status='hidden';
        else auroraReject_('protected','This record cannot be deleted from the website safely.');
      }else{
        fields.forEach(function(field){row[field]=auroraCmsValidate_(name,field,draft[field]);});
        if(action==='staff_cms_create'&&table.columns.indexOf('is_active')!==-1&&!Object.prototype.hasOwnProperty.call(draft,'is_active'))row.is_active=true;
        if(action==='staff_cms_create'&&name==='reviews'&&!Object.prototype.hasOwnProperty.call(draft,'status'))row.status='pending';
        if(action==='staff_cms_create'&&name==='reviews'&&!Object.prototype.hasOwnProperty.call(draft,'created_at'))row.created_at=new Date().toISOString();
      }
      if(name==='products'&&(!row.name||!row.category_id))auroraReject_('invalid_request','Product name and category are required.');
      if(name==='categories'&&!row.name)auroraReject_('invalid_request','Category name is required.');
      if(name==='product_variants'&&(!row.product_id||!row.name))auroraReject_('invalid_request','Product ID and variant name are required.');
      if(name==='delivery_zones'&&!row.name)auroraReject_('invalid_request','Delivery zone name is required.');
      if(name==='delivery_slots'&&!row.slot_label)auroraReject_('invalid_request','Delivery slot label is required.');
      if(name==='coupons'&&(!row.code||!row.discount_type))auroraReject_('invalid_request','Coupon code and discount type are required.');
      if(name==='products'&&Number(row.base_price)===0&&row.sale_price==='')row.base_price=0;
      if(name==='coupons'&&action==='staff_cms_create')row.usage_count=0;
      // Do not allow a client to manipulate existing order/payment totals.
      auroraCmsValidateRefs_(book,name,row,action==='staff_cms_create'?null:recordId);
      // Unique storefront identifiers are required for stable product pages and coupon use.
      var uniqueField=name==='products'||name==='categories'?'slug':name==='coupons'?'code':null;
      if(uniqueField&&row[uniqueField]){
        var candidate=String(row[uniqueField]).trim().toLowerCase();
        if(table.rows.some(function(other){
          return String(other.id)!==nowId&&String(other[uniqueField]||'').trim().toLowerCase()===candidate;
        }))auroraReject_('duplicate','Another record already uses this '+uniqueField+'.');
      }
      if(name==='product_variants'&&row.sale_price!==''&&Number(row.sale_price)>Number(row.price))
        auroraReject_('invalid_price','Sale price cannot exceed the regular price.');
      if(action==='staff_cms_create') {
        table.sheet.getRange(table.sheet.getLastRow()+1,1,1,table.headers.length).setValues([table.headers.map(function(field){return auroraSheetCell_(row[field]);})]);
      }else{
        var original=table.sheet.getRange(existing._row,1,1,table.headers.length).getValues()[0];
        table.columns.forEach(function(field){original[table.headers.indexOf(field)]=auroraSheetCell_(row[field]);});
        table.sheet.getRange(existing._row,1,1,original.length).setValues([original]);
      }
    }
    CacheService.getScriptCache().remove(auroraCacheKey_());
    return {ok:true,operation:action==='staff_cms_delete'?'archived':action==='staff_cms_create'?'created':'updated'};
  }finally{lock.releaseLock();}
}
/* ==== END apps-script/PublicCms.gs ==== */

/* ==== BEGIN apps-script/PublicImages.gs ==== */
/**
 * Free private Google Drive storage for small public bakery images.
 * The Web App runs as owner. Only authenticated Admin uploads.
 * Public GET is restricted to files in this dedicated generated folder.
 * Raw Google Drive file links and unrelated Drive files are never exposed.
 */
var AURORA_IMAGE_MAX_BYTES_=650000;
var AURORA_IMAGE_FOLDER_PROP_='AURORA_PUBLIC_IMAGE_FOLDER_ID';
function auroraImageFolder_(create){
  var props=PropertiesService.getScriptProperties(),id=props.getProperty(AURORA_IMAGE_FOLDER_PROP_);
  if(id){
    var existing=DriveApp.getFolderById(id);
    if(existing.isTrashed())auroraReject_('not_ready','Image folder has been deleted.');
    return existing;
  }
  if(!create)auroraReject_('not_found','Public bakery images have not been initialized.');
  var folder=DriveApp.createFolder('AurorasCake_Web_Images_'+Utilities.getUuid());
  props.setProperty(AURORA_IMAGE_FOLDER_PROP_,folder.getId());
  return folder;
}
/**
 * Run this ONCE from the Apps Script editor as the spreadsheet owner.
 * This authorizes DriveApp scope and creates a private image-only folder.
 * Existing folder is reused; the folder is never made public.
 */
function setupAuroraImagesOnce(){
  return auroraImageFolder_(true).getId();
}
function auroraImageMime_(bytes){
  if(bytes.length>3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if(bytes.length>8&&bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10')return 'image/png';
  if(bytes.length>12&&String.fromCharCode.apply(null,bytes.slice(0,4))==='RIFF'&&
    String.fromCharCode.apply(null,bytes.slice(8,12))==='WEBP')return 'image/webp';
  auroraReject_('invalid_image','Only genuine JPEG, PNG or WebP images are supported.');
}
function auroraImageUpload_(input){
  var actor=auroraStaffAuthenticate_(input);
  if(actor.role!=='super_admin'&&actor.role!=='admin')auroraReject_('forbidden','Only the shop administrator can upload public images.');
  if(typeof input.base64!=='string'||!/^([A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.base64)||
      input.base64.length>Math.ceil(AURORA_IMAGE_MAX_BYTES_*4/3)+8)
    auroraReject_('invalid_image','Please resize or compress the image (max 650 KB).');
  var bytes=Utilities.base64Decode(input.base64);
  if(bytes.length===0||bytes.length>AURORA_IMAGE_MAX_BYTES_)auroraReject_('invalid_image','Image is too large.');
  // Apps Script base64Decode returns signed bytes; normalize for magic detection.
  var positive=bytes.map(function(b){return (b+256)%256;});
  var mime=auroraImageMime_(positive);
  if(input.mime_type&&input.mime_type!==mime)auroraReject_('invalid_image','Image file content does not match its type.');
  var extension=mime==='image/jpeg'?'jpg':mime==='image/png'?'png':'webp';
  var cache=CacheService.getScriptCache(),key='aurora_image_hour_'+auroraAccountDigest_(actor.email).slice(0,20);
  var count=Number(cache.get(key)||0);
  if(count>=20)auroraReject_('rate_limited','Image upload limit reached. Try again later.');
  cache.put(key,String(count+1),3600);
  var folder=auroraImageFolder_(true);
  var file=folder.createFile(Utilities.newBlob(bytes,mime,'aurora_'+Utilities.getUuid()+'.'+extension));
  return {ok:true,url:'/api/image?id='+file.getId(),mime_type:mime,bytes:bytes.length};
}
function auroraPublicImage_(id){
  if(!/^[A-Za-z0-9_-]{12,150}$/.test(String(id||'')))auroraReject_('not_found','Unknown image.');
  var folder=auroraImageFolder_(false),file=DriveApp.getFileById(id);
  if(file.isTrashed()||!['image/jpeg','image/png','image/webp'].includes(file.getMimeType()))
    auroraReject_('not_found','Image not found.');
  var parents=file.getParents(),owned=false;
  while(parents.hasNext()){if(parents.next().getId()===folder.getId()){owned=true;break;}}
  if(!owned)auroraReject_('not_found','Image not found.');
  if(file.getSize()>AURORA_IMAGE_MAX_BYTES_)auroraReject_('too_large','Image exceeds the public delivery limit.');
  var raw=file.getBlob().getBytes();
  return {ok:true,mime_type:file.getMimeType(),base64:Utilities.base64Encode(raw)};
}
/* ==== END apps-script/PublicImages.gs ==== */

/* ==== BEGIN apps-script/CustomCakeRequests.gs ==== */
/**
 * Free custom-cake quote requests. Public create/status and authenticated
 * staff queue share a private Google Sheet tab, never included in public GET.
 */
function auroraCustomCakeDraft_(input) {
  if (!input || input.action!=='create_custom_cake') auroraReject_('invalid_action','Unknown custom request.');
  var id=auroraOrderText_(input.request_id,'Request ID',36,36).toLowerCase();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))
    auroraReject_('invalid_request','A valid request reference is required.');
  var phone=auroraOrderText_(input.customer_phone,'Phone',7,30);
  var digits=phone.replace(/\D/g,'');
  if(!/^\+?[0-9 ()-]+$/.test(phone)||digits.length<7||digits.length>15)
    auroraReject_('invalid_phone','Enter a valid phone number.');
  var image=auroraOptionalText_(input.reference_image_url,'Reference image URL',1500);
  if(image&&!/^https:\/\/[^ <>"']+$/i.test(image)) auroraReject_('invalid_url','Use a public HTTPS reference image URL.');
  return {
    request_id:id,customer_name:auroraOrderText_(input.customer_name,'Name',2,100),
    customer_phone:phone,cake_type:auroraOrderText_(input.cake_type,'Cake theme',2,120),
    approx_size:auroraOrderText_(input.approx_size,'Cake weight',1,100),
    flavor:auroraOrderText_(input.flavor,'Flavor',1,150),
    color_theme:auroraOptionalText_(input.color_theme,'Color theme',150),
    writing_text:auroraOptionalText_(input.writing_text,'Cake dedication',200),
    instructions:auroraOptionalText_(input.instructions,'Instructions',1000),
    reference_image_url:image
  };
}
function auroraCustomCakeThrottled_(draft) {
  var cache=CacheService.getScriptCache();
  var hash=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    draft.customer_phone.replace(/\D/g,''),Utilities.Charset.UTF_8)
    .map(function(byte){return ('0'+((byte+256)%256).toString(16)).slice(-2);}).join('').slice(0,24);
  var key='aurora_custom_phone_'+hash;
  var attempt='aurora_custom_attempt_'+draft.request_id;
  if(cache.get(attempt))return;
  var count=Number(cache.get(key)||0);
  if(count>=3)auroraReject_('rate_limited','Too many custom cake requests. Please contact the bakery.');
  cache.put(key,String(count+1),600);
  cache.put(attempt,'1',600);
}
function auroraCustomCakeRows_(table) {
  return table.rows.map(function(row) {
    var value;
    try{value=JSON.parse(String(row.receipt_json||''));}catch(_){return null;}
    return value && value.id ? value : null;
  }).filter(Boolean);
}
function auroraCustomCakePost_(input) {
  if (input.action==='create_custom_cake') {
    var draft=auroraCustomCakeDraft_(input),hash=auroraRequestHash_(draft);
    var lock=LockService.getScriptLock();
    if(!lock.tryLock(10000))auroraReject_('busy','Request confirmation is still pending. Retry with the same reference.');
    try{
      var table=auroraPrivateTable_(auroraSpreadsheet_(),'custom_cake_requests');
      var existing=table.rows.filter(function(row){return String(row.request_id)===draft.request_id;});
      if(existing.length>1)throw new Error('Duplicate custom cake request references.');
      if(existing.length){
        if(String(existing[0].request_hash)!==hash) auroraReject_('idempotency_conflict','Request ID belongs to a different custom cake.');
        return {ok:true,saved:true,request_id:draft.request_id};
      }
      auroraCustomCakeThrottled_(draft);
      var now=new Date().toISOString();
      var request={
        id:'custom_'+draft.request_id,request_id:draft.request_id,
        customer_name:draft.customer_name,customer_phone:draft.customer_phone,
        cake_type:draft.cake_type,approx_size:draft.approx_size,flavor:draft.flavor,
        color_theme:draft.color_theme,writing_text:draft.writing_text,
        instructions:draft.instructions,reference_image_url:draft.reference_image_url,
        status:'pending',estimated_price:0,quoted_price:0,created_at:now,updated_at:now
      };
      auroraAppendPrivate_(table,{
        id:request.id,request_id:draft.request_id,request_hash:hash,created_at:now,updated_at:now,
        customer_name:request.customer_name,customer_phone:request.customer_phone,
        cake_type:request.cake_type,approx_size:request.approx_size,
        flavor:request.flavor,color_theme:request.color_theme,writing_text:request.writing_text,
        instructions:request.instructions,reference_image_url:request.reference_image_url,
        status:'pending',estimated_price:0,quoted_price:0,receipt_json:JSON.stringify(request)
      });
      return {ok:true,saved:true,request_id:draft.request_id};
    }finally{lock.releaseLock();}
  }
  if(input.action==='get_custom_cake_status'){
    var id=auroraOrderText_(input.request_id,'Request ID',36,36).toLowerCase();
    var phone=auroraOrderText_(input.customer_phone,'Phone',7,30).replace(/\D/g,'');
    var found=auroraPrivateTable_(auroraSpreadsheet_(),'custom_cake_requests').rows
      .filter(function(row){return String(row.request_id)===id&&String(row.customer_phone).replace(/\D/g,'')===phone;});
    if(found.length!==1)auroraReject_('not_found','Request and phone do not match.');
    var current=JSON.parse(String(found[0].receipt_json));
    return {ok:true,request_id:id,status:current.status,quoted_price:current.quoted_price,updated_at:current.updated_at};
  }
  var actor=auroraStaffAuthenticate_(input);
  if(['super_admin','admin','order_manager'].indexOf(actor.role)===-1)
    auroraReject_('forbidden','Only authorized managers may read custom cake requests.');
  if(input.action==='staff_custom_cakes'){
    var table=auroraPrivateTable_(auroraSpreadsheet_(),'custom_cake_requests');
    var requests=auroraCustomCakeRows_(table);
    requests.sort(function(a,b){return String(b.created_at).localeCompare(String(a.created_at));});
    return {ok:true,requests:requests.slice(0,100)};
  }
  if(input.action==='staff_custom_quote'){
    var id=auroraOrderText_(input.request_id,'Request ID',36,36).toLowerCase();
    var status=String(input.status||'');
    if(['quoted','declined'].indexOf(status)===-1)auroraReject_('invalid_status','Choose quoted or declined.');
    var price=Number(input.quoted_price||0);
    if(!Number.isFinite(price)||price<0||price>10000000||(status==='quoted'&&price<=0))
      auroraReject_('invalid_price','An accepted quote must have a positive price.');
    var lock=LockService.getScriptLock();
    if(!lock.tryLock(10000))auroraReject_('busy','Another custom quote update is pending.');
    try{
      var table=auroraPrivateTable_(auroraSpreadsheet_(),'custom_cake_requests');
      var row=table.rows.filter(function(row){return String(row.request_id)===id;})[0];
      if(!row)auroraReject_('not_found','Request was not found.');
      var old=JSON.parse(String(row.receipt_json));
      if(old.status!=='pending'&&old.status!=='quoted')auroraReject_('invalid_status','A declined request cannot be modified.');
      old.status=status;old.quoted_price=status==='quoted'?Math.round(price*100)/100:0;
      old.updated_at=new Date().toISOString();
      var sheet=table.sheet;
      var idIndex=table.headers.indexOf('request_id');
      var values=sheet.getRange(2,idIndex+1,sheet.getLastRow()-1,1).getValues();
      var rowNumbers=[];
      values.forEach(function(r,i){if(String(r[0])===id)rowNumbers.push(i+2);});
      if(rowNumbers.length!==1)auroraReject_('invalid_sheet','Duplicate request references.');
      var all=sheet.getRange(rowNumbers[0],1,1,table.headers.length).getValues()[0];
      [['receipt_json',JSON.stringify(old)],['status',old.status],
        ['quoted_price',old.quoted_price],['updated_at',old.updated_at]].forEach(function(pair){
        all[table.headers.indexOf(pair[0])]=auroraSheetCell_(pair[1]);
      });
      sheet.getRange(rowNumbers[0],1,1,all.length).setValues([all]);
      return {ok:true,updated:true};
    }finally{lock.releaseLock();}
  }
  auroraReject_('invalid_action','Invalid custom cake action.');
}
/* ==== END apps-script/CustomCakeRequests.gs ==== */
