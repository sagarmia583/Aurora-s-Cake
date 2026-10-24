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
    var records=auroraRows_(book,tableName);
    var key=tableName==='settings'?'key':'id';
    var rows=records.map(function(row,index){return {value:String(row[key]||''),row:index+2};})
      .filter(function(row){return row.value===recordId;});
    if (rows.length!==1 || (tableName==='settings'&&recordId!==field)) {
      auroraReject_('not_found','Shop field or catalogue item was not found.');
    }
    var sheet=book.getSheetByName(tableName);
    var headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0]
      .map(function(value){return String(value).trim().toLowerCase();});
    var index=headers.indexOf(field);
    if (index<0||headers.lastIndexOf(field)!==index) auroraReject_('invalid_sheet','Missing or duplicate expected field.');
    sheet.getRange(rows[0].row,index+1,1,1).setValues([[auroraSheetCell_(value)]]);
    CacheService.getScriptCache().remove(auroraCacheKey_());
    return {ok:true,updated:true};
  } finally {lock.releaseLock();}
}