/**
 * Aurora public website content API.
 * Edit these public tables in Sheets. This API has no write route and never reads customer/order/staff tables.
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
  return 'aurora_public_v1_' + (auroraConfiguredId_() || 'bound');
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

function doPost() {
  return auroraResponse_({ok:false,error:'This public endpoint is read-only. Manage public website content in the Google Sheet.'});
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
 * Creates/initializes only missing or completely empty public tabs.
 * Does not overwrite existing rows, clear sheets, change sharing or expose a write API.
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
        if (typeof value === 'string' && /^[=+@]/.test(value)) return "'" + value;
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
