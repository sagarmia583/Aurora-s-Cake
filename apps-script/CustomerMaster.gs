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
  if(digits.length>=7&&digits.length<=15)return '+'+digits;
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
    return !prev||String(item.created_at||'')>String(prev.created_at||'')?item:prev;
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
/** Only authentic staff roles can retrieve contact details using phone VLOOKUP. */
function auroraStaffCustomerLookup_(input){
  var actor=auroraStaffAuthenticate_(input);
  if(['super_admin','admin','order_manager','delivery_manager'].indexOf(actor.role)===-1)
    auroraReject_('forbidden','Customer lookup is restricted to authorized sales staff.');
  var phone=auroraCustomerPhoneKey_(input.phone),table=auroraPrivateTable_(auroraSpreadsheet_(),'customer_master');
  var row=auroraCustomerMasterRow_(table,phone);
  if(!row)return {ok:true,found:false};
  return {ok:true,found:true,customer:{
    phone:row.phone_key,name:row.name,delivery_address:row.delivery_address,
    order_count:Number(row.order_count||0),last_order_at:String(row.last_order_at||'')
  }};
}
/** Manual one-time import of orders placed before the Customer Master feature.
 * Run in the Apps Script EDITOR only after backing up the existing spreadsheet.
 * Does not call external endpoints, send any SMS or alter saved COD orders.
 */
function backfillCustomerMasterOnce(){
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