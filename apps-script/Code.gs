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
  order_items: ['id','order_id','product_id','product_name','variant_id','variant_name','flavor_id','flavor_name','writing_message','unit_price','quantity','addons_json','subtotal']
};

// This handler creates a private COD receipt. GET never calls these functions.
function doPost(e) {
  var lock;
  var locked = false;
  try {
    var raw = e && e.postData && e.postData.contents;
    if (typeof raw !== 'string' || !raw || raw.length > 50000) auroraReject_('invalid_request','Send a JSON order body under 50 KB.');
    var input;
    try { input = JSON.parse(raw); } catch (_) { auroraReject_('invalid_request','The order body must be valid JSON.'); }
    // Private operations authenticate every POST; never expose these reads via GET.
    if (input && input.action === 'get_order_status') return auroraResponse_(auroraCustomerOrderStatus_(input));
    if (input && /^staff_/.test(String(input.action || ''))) return auroraResponse_(auroraOperationsPost_(input));
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
      return auroraResponse_({success:true,persisted:true,order:receipt});
    }
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
    return auroraResponse_({success:true,persisted:true,order:order});
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
  return {
    action:'create_order',request_id:requestId,customer_name:auroraOrderText_(input.customer_name,'Customer name',2,100),
    customer_phone:phone,delivery_address:auroraOrderText_(input.delivery_address,'Delivery address',5,1000),
    delivery_zone_id:auroraOrderText_(input.delivery_zone_id,'Delivery zone',1,100),
    delivery_slot:auroraOrderText_(input.delivery_slot,'Delivery slot',1,100),delivery_date:date,cart_items:lines,
    coupon_code:auroraOptionalText_(input.coupon_code,'Coupon code',60).toUpperCase(),
    order_note:auroraOptionalText_(input.order_note,'Order note',1000),payment_method:'cod',expected_total:input.expected_total
  };
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
    delivery_otp:String(1000 + Math.floor(Math.random() * 9000)),cod_amount:total,cod_collected:false,created_at:now,updated_at:now,items:items,
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
