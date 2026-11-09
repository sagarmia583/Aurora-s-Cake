/** Public counters are Sheet formulas. Public GET never reads private order tables. */
function auroraColumnLetter_(index){var value='';while(index>0){index--;value=String.fromCharCode(65+index%26)+value;index=Math.floor(index/26);}return value;}
function auroraProductStatFormulas_(row,columns){
  var product='$'+columns.productId+row;
  return {
    rating:'=IFERROR(AVERAGEIFS(reviews!$'+columns.reviewRating+'$2:$'+columns.reviewRating+',reviews!$'+columns.reviewProduct+'$2:$'+columns.reviewProduct+','+product+',reviews!$'+columns.reviewStatus+'$2:$'+columns.reviewStatus+',"approved"),0)',
    review_count:'=COUNTIFS(reviews!$'+columns.reviewProduct+'$2:$'+columns.reviewProduct+','+product+',reviews!$'+columns.reviewStatus+'$2:$'+columns.reviewStatus+',"approved")',
    sold_count:'=IFERROR(SUM(ARRAYFORMULA(IF((order_items!$'+columns.itemProduct+'$2:$'+columns.itemProduct+'='+product+')*(IFNA(VLOOKUP(order_items!$'+columns.itemOrder+'$2:$'+columns.itemOrder+',orders!$'+columns.orderId+'$2:$'+columns.orderLast+','+columns.statusIndex+',FALSE),"")="delivered"),N(order_items!$'+columns.itemQuantity+'$2:$'+columns.itemQuantity+'),0))),0)'
  };
}
function auroraEnsureProductStats_(book){
  // Real Sheets expose getFormulas; legacy database adapters/test tables may not.
  var products=book.getSheetByName('products');
  if(!products||typeof products.getRange(1,1,1,1).getFormulas!=='function')return;
  function headers(name){var sheet=book.getSheetByName(name);if(!sheet)return [];return sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(function(v){return String(v).trim().toLowerCase();});}
  var p=headers('products'),o=headers('orders'),i=headers('order_items'),r=headers('reviews');
  function at(list,key){var n=list.indexOf(key);if(n<0)throw new Error('Product statistics need column: '+key);return auroraColumnLetter_(n+1);}
  var columns={productId:at(p,'id'),orderId:at(o,'id'),orderLast:auroraColumnLetter_(o.length),statusIndex:o.indexOf('status')-o.indexOf('id')+1,
    itemOrder:at(i,'order_id'),itemProduct:at(i,'product_id'),itemQuantity:at(i,'quantity'),
    reviewProduct:at(r,'product_id'),reviewRating:at(r,'rating'),reviewStatus:at(r,'status')};
  if(columns.statusIndex<1)throw new Error('Order status column must follow order ID.');
  ['rating','review_count','sold_count'].forEach(function(field){
    var col=p.indexOf(field)+1;
    if(!col){col=p.length+1;products.getRange(1,col,1,1).setValues([[field]]);p.push(field);}
    var values=[];
    for(var row=2;row<=products.getLastRow();row++)values.push([auroraProductStatFormulas_(row,columns)[field]]);
    if(values.length)products.getRange(2,col,values.length,1).setFormulas(values);
  });
}
/** Owner-only, non-destructive installation for an existing workbook. */
function setupProductStatistics(){
  auroraRequireInteractiveSetup_();
  if(typeof auroraMigrationAssertWritable_==='function')auroraMigrationAssertWritable_();
  auroraEnsureProductStats_(auroraSpreadsheet_());
  CacheService.getScriptCache().remove(auroraCacheKey_());
  return 'Product statistics installed: delivered quantities and approved reviews only.';
}
