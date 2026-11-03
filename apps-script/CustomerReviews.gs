/** An original private receipt proves a delivered purchase; staff approves publication. */
function auroraCustomerReview_(input){
  var rating=Number(input.rating),comment=String(input.comment||'').trim(),productId=String(input.product_id||'');
  if(typeof input.rating!=='number'||typeof input.comment!=='string'||!isFinite(rating)||rating%1||rating<1||rating>5||comment.length<3||comment.length>2000)
    auroraReject_('invalid_review','Choose 1–5 stars and write a review of 3–2000 characters.');
  var image=String(input.image_url||'').trim();
  if(image&&!/^https:\/\/[^\s<>"']{1,2000}$/i.test(image))auroraReject_('invalid_image','Use a public HTTPS photo link.');
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))auroraReject_('busy','Another review is being saved. Retry shortly.');
  try{
    var order=auroraCustomerReceiptRecover_(input).order;
    if(order.status!=='delivered')auroraReject_('not_delivered','Reviews are available after delivery.');
    var item=order.items.filter(function(line){return String(line.product_id)===productId;})[0];
    if(!item)auroraReject_('not_purchased','This product is not on your receipt.');
    var table=auroraCmsRead_(auroraSpreadsheet_(),'reviews');
    var id='rev_'+auroraRequestHash_({order_id:order.id,product_id:productId});
    var previous=auroraCmsRow_(table,id);
    if(previous)return {ok:true,review_id:id,status:String(previous.status||'pending')};
    var row={id:id,product_id:productId,product_name:item.product_name,customer_name:order.customer_name,
      rating:rating,comment:comment,image_url:image,status:'pending',created_at:new Date().toISOString()};
    table.sheet.getRange(table.sheet.getLastRow()+1,1,1,table.headers.length).setValues([
      table.headers.map(function(field){return auroraSheetCell_(row[field]);})]);
    CacheService.getScriptCache().remove(auroraCacheKey_());
    return {ok:true,review_id:id,status:'pending'};
  }finally{lock.releaseLock();}
}
