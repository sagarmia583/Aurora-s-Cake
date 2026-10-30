/**
 * Phone-as-unique-key customer register. No public phone lookup.
 * Not a verified identity: customers can only read their own proven account
 * or locally held receipt; authenticated staff can look up the private register.
 */
function auroraCustomerPhoneKey_(value) {
  var digits=String(value||'').replace(/\D/g,'');
  if(/^8801[3-9]\d{8}$/.test(digits))return '0'+digits.slice(3);
  if(/^01[3-9]\d{8}$/.test(digits))return digits;
  // Preserve international guest phone numbers in a stable, bounded form.
  if(digits.length>=7&&digits.length<=15)return 'intl_'+digits;
  auroraReject_('invalid_phone','Enter a valid phone number.');
}
function auroraCustomerMasterRow_(table,phone){
  var matches=table.rows.filter(function(row){return String(row.phone_key||'')===phone;});
  if(matches.length>1)auroraReject_('duplicate_customer','Duplicate customer master records require owner reconciliation.');
  return matches[0]||null;
}
function auroraCustomerMasterUpsert_(book,orders,order){
  var phone=auroraCustomerPhoneKey_(order.customer_phone);
  var table=auroraPrivateTable_(book,'customer_master');
  var previous=auroraCustomerMasterRow_(table,phone);
  var all=orders.rows.filter(function(item){
    try{return auroraCustomerPhoneKey_(item.customer_phone)===phone;}catch(_){return false;}
  });
  // Count each original COD order ID once. Idempotent retries cannot inflate.
  var unique=Object.create(null),count=0;
  all.forEach(function(item){var id=String(item.id||'');if(id&&!unique[id]){unique[id]=true;count++;}});
  var latest=all.reduce(function(prev,item){
    return !prev||String(item.created_at||'')>=String(prev.created_at||'')?item:prev;
  },null);
  var row=previous?Object.assign({},previous):{
    id:'customer_'+Utilities.getUuid(),phone_key:phone,
    name:String(order.customer_name||'').slice(0,100),
    delivery_address:String(order.delivery_address||'').slice(0,1000),
    created_at:String(order.created_at||new Date().toISOString())
  };
  // Never overwrite a saved customer's name/address from an unverified
  // guest checkout. Each order stores its own actual delivery address.
  row.order_count=count;
  row.last_order_id=latest?String(latest.id):String(order.id);
  row.last_order_at=latest?String(latest.created_at):String(order.created_at);
  row.updated_at=new Date().toISOString();
  if(previous){
    var ids=table.sheet.getRange(2,table.headers.indexOf('id')+1,table.sheet.getLastRow()-1,1).getValues();
    var at=ids.findIndex(function(r){return String(r[0])===String(previous.id);});
    if(at<0)auroraReject_('not_found','Customer master row could not be updated.');
    table.sheet.getRange(at+2,1,1,table.headers.length).setValues([table.headers.map(function(key){return auroraSheetCell_(row[key]);})]);
  }else auroraAppendPrivate_(table,row);
  return {id:row.id,created:!previous};
}
/**
 * Passwordless contact form: write-only. Phone numbers are unverified.
 * Never overwrite an order-confirmed customer profile with unverified input.
 * Contact records are private and never returned to anonymous callers.
 */
function auroraGuestContactSubmit_(input){
  var phone=auroraCustomerPhoneKey_(input.phone);
  if(!/^01[3-9]\d{8}$/.test(phone))auroraReject_('invalid_phone','Enter a valid Bangladeshi phone number.');
  var name=auroraOrderText_(input.name,'Customer name',2,100);
  var address=auroraOrderText_(input.address,'Address',6,300);
  var cache=CacheService.getScriptCache();
  var key='aurora_contact_'+auroraAccountDigest_(phone).slice(0,24);
  var last=Number(cache.get(key)||0);
  if(last>=3)auroraReject_('rate_limited','Too many saves for this number. Try again later.');
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))auroraReject_('busy','Customer details could not be saved. Retry.');
  try{
    var sheet=auroraPrivateTable_(auroraSpreadsheet_(),'customer_contact_requests');
    auroraAppendPrivate_(sheet,{id:'contact_'+Utilities.getUuid(),phone_key:phone,
      name:name,delivery_address:address,created_at:new Date().toISOString(),
      status:'unverified'});
    cache.put(key,String(last+1),3600);
    return {ok:true,saved:true,phone_verified:false};
  }finally{lock.releaseLock();}
}

/** Only authentic staff roles can retrieve contact details using phone VLOOKUP. */
function auroraStaffCustomerLookup_(input){
  var actor=auroraStaffAuthenticate_(input);
  if(['super_admin','admin','order_manager','delivery_manager'].indexOf(actor.role)===-1)
    auroraReject_('forbidden','Customer lookup is restricted to authorized sales staff.');
  var phone=auroraCustomerPhoneKey_(input.phone),table=auroraPrivateTable_(auroraSpreadsheet_(),'customer_master');
  var row=auroraCustomerMasterRow_(table,phone);
  if(!row){
    // Unverified contact requests are visible only to authorized staff and
    // explicitly labeled, so a phone-only submission cannot impersonate a
    // customer who has placed a confirmed COD order.
    var pending=auroraPrivateTable_(auroraSpreadsheet_(),'customer_contact_requests').rows
      .filter(function(item){return String(item.phone_key)===phone;})
      .sort(function(a,b){return String(b.created_at).localeCompare(String(a.created_at));})[0];
    if(!pending)return {ok:true,found:false};
    return {ok:true,found:true,customer:{
      phone:phone,name:String(pending.name),delivery_address:String(pending.delivery_address),
      order_count:0,last_order_at:'',unverified:true
    }};
  }
  return {ok:true,found:true,customer:{
    phone:row.phone_key,name:row.name,delivery_address:row.delivery_address,
    order_count:Number(row.order_count||0),last_order_at:String(row.last_order_at||''),unverified:false
  }};
}
/** Manual one-time import of orders placed before the Customer Master feature.
 * Run in the Apps Script EDITOR only after backing up the existing spreadsheet.
 * Does not call external endpoints, send any SMS or alter saved COD orders.
 */
function backfillCustomerMasterOnce(){
  auroraRequireInteractiveSetup_();
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))throw new Error('Other bakery updates are running. Retry.');
  try{
    var book=auroraSpreadsheet_(),orders=auroraPrivateTable_(book,'orders');
    var table=auroraPrivateTable_(book,'customer_master');
    var known=Object.create(null),newCount=0,updatedCount=0,skipped=0;
    orders.rows.forEach(function(row){
      var key;try{key=auroraCustomerPhoneKey_(row.customer_phone);}catch(_){skipped++;return;}
      if(!known[key]||String(row.created_at||'')>String(known[key].created_at||''))known[key]=row;
    });
    Object.keys(known).forEach(function(phone){
      // Reuse upsert's existing duplicate detection; backfill doesn't
      // issue receipts or change financial ledger rows.
      var order=known[phone];
      var existed=!!auroraCustomerMasterRow_(table,phone);
      auroraCustomerMasterUpsert_(book,orders,{
        id:String(order.id),created_at:String(order.created_at),
        customer_phone:String(order.customer_phone),
        customer_name:String(order.customer_name||''),
        delivery_address:String(order.delivery_address||'')
      });
      if(existed)updatedCount++;else newCount++;
      // Keep the in-memory copy current to avoid duplicates within the same run.
      table=auroraPrivateTable_(book,'customer_master');
    });
    return {created:newCount,updated:updatedCount,skipped:skipped,total_customers:Object.keys(known).length};
  }finally{lock.releaseLock();}
}
