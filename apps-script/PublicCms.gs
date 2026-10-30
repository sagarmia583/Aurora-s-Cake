/**
 * Private website CMS. Never exposes private orders or account tables.
 * All changes are validated server-side against PUBLIC_TABLE_SCHEMAS.
 * 'Delete' archives a public row; historical references remain intact.
 */
var AURORA_CMS_TABLES_=['settings','content','hero_slides','highlights','faqs','links','categories','products','product_variants','flavors','product_addons','banners','delivery_zones','delivery_slots','coupons','reviews'];
var AURORA_CMS_BOOLEAN_FIELDS_=['is_active','is_featured','accepting_orders','delivery_enabled'];
var AURORA_CMS_NUMBER_FIELDS_=['sort_order','base_price','sale_price','price','weight_grams','rating','review_count','delivery_fee','discount_value','min_order_amount','max_discount_amount','usage_count'];
var AURORA_CMS_OPTIONAL_NUMBER_FIELDS_=['sale_price','max_discount_amount','rating'];
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
    if(value===''&&AURORA_CMS_OPTIONAL_NUMBER_FIELDS_.indexOf(field)!==-1)return '';
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
          AURORA_CMS_OPTIONAL_NUMBER_FIELDS_.indexOf(field)!==-1?'':
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
