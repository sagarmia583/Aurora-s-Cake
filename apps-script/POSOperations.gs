/**
 * Counter sales: private, append-only receipts. These are NOT delivery/COD orders.
 * Payments are staff-attested (no payment gateway / mobile-money verification).
 * Do not consume ingredients here: production inventory is consumed at Start Baking
 * and doing so again at POS checkout would double-count recipe stock.
 */
function auroraPosCash_(value, field) {
  var amount=Number(value);
  if(!isFinite(amount)||amount<0||amount>10000000||Math.round(amount*100)!==amount*100 && Math.abs(Math.round(amount*100)-amount*100)>0.00001)
    auroraReject_('invalid_amount','Invalid '+field+' amount. Use up to 2 decimal places.');
  return Math.round(amount*100);
}
function auroraPosItems_(book) {
  var products=auroraRows_(book,'products').filter(function(p){return auroraActive_(p.is_active);});
  var variants=auroraRows_(book,'product_variants').filter(function(v){return auroraActive_(v.is_active);});
  var names={};products.forEach(function(p){names[String(p.id)]=String(p.name||'');});
  return variants.filter(function(v){return names[String(v.product_id)];}).map(function(v){
    var base=v.sale_price!==''&&v.sale_price!==undefined&&v.sale_price!==null?Number(v.sale_price):Number(v.price);
    if(!isFinite(base)||base<0)return null;
    return {product_id:String(v.product_id),product_name:names[String(v.product_id)],
      variant_id:String(v.id),variant_name:String(v.name||''),price:Math.round(base*100)/100};
  }).filter(Boolean);
}
function auroraPosSnapshot_(book, withHistory) {
  var settings=auroraRows_(book,'settings'),shop={name:"Aurora's Cake",phone:'',address:''};
  settings.forEach(function(s){
    if(s.key==='shop_name'&&s.value)shop.name=String(s.value).slice(0,120);
    if(s.key==='phone'&&s.value)shop.phone=String(s.value).slice(0,80);
    if(s.key==='address'&&s.value)shop.address=String(s.value).slice(0,180);
  });
  var result={ok:true,shop:shop,products:auroraPosItems_(book)};
  if(withHistory) {
    var table=auroraPrivateTable_(book,'pos_sales');
    result.sales=table.rows.slice(-100).reverse().map(function(r){
      try{return JSON.parse(String(r.receipt_json||''));}catch(_){return null;}
    }).filter(Boolean);
  }
  return result;
}
function auroraPosPost_(input) {
  var actor=auroraStaffAuthenticate_(input),action=String(input.action||'');
  if(action==='staff_pos_catalog'){auroraStaffRequire_(actor,'sales_view');return auroraPosSnapshot_(auroraSpreadsheet_(),false);}
  if(action==='staff_pos_history'){auroraStaffRequire_(actor,'sales_history');return auroraPosSnapshot_(auroraSpreadsheet_(),true);}
  if(action!=='staff_pos_create')auroraReject_('invalid_action','Unsupported counter sale action.');
  auroraStaffRequire_(actor,'sales_create');
  var requestId=String(input.request_id||'').trim();
  if(!/^[a-f0-9-]{36}$/i.test(requestId))auroraReject_('invalid_request','A stable sale request ID is required.');
  var inputLines=input.items;
  if(!Array.isArray(inputLines)||inputLines.length<1||inputLines.length>25)
    auroraReject_('invalid_cart','Choose between 1 and 25 product variants.');
  var method=String(input.payment_method||'').trim().toLowerCase();
  if(['cash','bkash','nagad'].indexOf(method)<0)auroraReject_('invalid_payment','Choose Cash, bKash or Nagad.');
  var discount=auroraPosCash_(input.discount_amount||0,'discount');
  if(discount>0)auroraStaffRequire_(actor,'sales_discount');
  var phone=String(input.customer_phone||'').trim().replace(/[\\s-]/g,'');
  if(phone&&!/^\\+?[0-9]{7,15}$/.test(phone))auroraReject_('invalid_phone','Enter a valid customer phone or leave it blank.');
  var name=String(input.customer_name||'Walk-in').trim().slice(0,100)||'Walk-in';
  var reference=String(input.payment_reference||'').trim().slice(0,100);
  if(method!=='cash'&&(!/^[a-zA-Z0-9-]{6,50}$/.test(reference)))
    auroraReject_('reference_required','Enter the bKash/Nagad transaction reference (6–50 letters/numbers).');
  var received=method==='cash'?auroraPosCash_(input.amount_received,'cash received'):0;
  var normalized=inputLines.map(function(line){
    var variant=String(line&&line.variant_id||'').trim(),qty=Number(line&&line.quantity);
    if(!variant||!Number.isInteger(qty)||qty<1||qty>50)
      auroraReject_('invalid_cart','Check product variant and quantity (1–50).');
    return {variant_id:variant,quantity:qty};
  });
  var uniq={};
  normalized.forEach(function(l){if(uniq[l.variant_id])auroraReject_('invalid_cart','Duplicate product variant. Adjust quantity instead.');uniq[l.variant_id]=true;});
  var fingerprint=auroraAccountDigest_(JSON.stringify({items:normalized,discount:discount,method:method,
    amount_received:received,reference:reference,customer_name:name,customer_phone:phone}));
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))auroraReject_('busy','Another checkout is saving. Retry the same sale.');
  try {
    var book=auroraSpreadsheet_(),table=auroraPrivateTable_(book,'pos_sales');
    var duplicate=table.rows.filter(function(r){return String(r.request_id)===requestId;})[0];
    if(duplicate){
      if(String(duplicate.request_hash)!==fingerprint)
        auroraReject_('idempotency_conflict','This request ID already belongs to a different sale.');
      return {ok:true,already_saved:true,sale:JSON.parse(String(duplicate.receipt_json))};
    }
    if(method!=='cash'&&table.rows.some(function(r){return String(r.payment_method)===method&&
      String(r.payment_reference||'').toLowerCase()===reference.toLowerCase();}))
      auroraReject_('reference_duplicate','This mobile-money transaction reference was already recorded.');
    var catalog=auroraPosItems_(book),byVariant={};
    catalog.forEach(function(x){byVariant[x.variant_id]=x;});
    var subtotal=0,lines=normalized.map(function(l){
      var p=byVariant[l.variant_id];
      if(!p)auroraReject_('unavailable_selection','A product variant is no longer available. Refresh the POS.');
      var unit=Math.round(p.price*100),amount=unit*l.quantity;
      subtotal+=amount;
      return {product_id:p.product_id,product_name:p.product_name,variant_id:p.variant_id,variant_name:p.variant_name,
        quantity:l.quantity,unit_price:unit/100,subtotal:amount/100};
    });
    if(subtotal>1000000000||discount>subtotal)
      auroraReject_('invalid_discount','Discount cannot exceed sale subtotal.');
    var total=subtotal-discount;
    if(method==='cash'&&received<total)
      auroraReject_('insufficient_cash','Cash received is less than the bill.');
    var now=new Date(),saleId='pos_'+Utilities.getUuid();
    var sale={id:saleId,sale_number:'POS-'+Utilities.formatDate(now,'Asia/Dhaka','yyMMdd')+'-'+saleId.slice(-6).toUpperCase(),
      sold_at:now.toISOString(),staff_name:String(actor.name||'Staff').slice(0,100),
      staff_id:String(actor.username||actor.email||'').slice(0,120),customer_name:name,customer_phone:phone,
      items:lines,subtotal:subtotal/100,discount_amount:discount/100,total_amount:total/100,
      payment_method:method,payment_reference:reference,amount_received:method==='cash'?received/100:total/100,
      change_amount:method==='cash'?(received-total)/100:0,payment_confirmation:'staff_attested'};
    auroraAppendPrivate_(table,{id:sale.id,sale_number:sale.sale_number,request_id:requestId,
      request_hash:fingerprint,sold_at:sale.sold_at,staff_id:sale.staff_id,staff_name:sale.staff_name,
      customer_name:name,customer_phone:phone,subtotal:sale.subtotal,discount_amount:sale.discount_amount,
      total_amount:sale.total_amount,payment_method:method,payment_reference:reference,
      amount_received:sale.amount_received,change_amount:sale.change_amount,receipt_json:JSON.stringify(sale)});
    return {ok:true,already_saved:false,sale:sale};
  }finally {lock.releaseLock();}
}
