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
var AURORA_STAFF_ROLES_ = ['super_admin','admin','manager','order_manager','kitchen_manager','delivery_manager','delivery_man','accountant'];
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
      people:auroraStaffConfig_().people,username:String(person.username),employee:true,
      permissions:auroraStaffParsePermissions_(person.permissions,String(person.role))};
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
  return {email:email,role:person.role,name:String(person.name||email).slice(0,100),people:config.people,
    permissions:auroraStaffDefaultPermissions_(person.role)};
}
function auroraStaffCan_(actor,action) {
  var capability=AURORA_OPERATION_CAPABILITY_[action];
  return capability ? auroraStaffHas_(actor,capability) : false;
}
function auroraPrivateFindRow_(table, orderId) {
  var index = table.headers.indexOf('id');
  if (index < 0) throw new Error('Private orders ID header missing.');
  var lastRow = table.sheet.getLastRow();
  if (lastRow < 2) return 0;
  // Native TextFinder avoids transferring the whole ID column to Apps Script
  // on a single-order customer poll. Fallback supports older test/mocks.
  var idRange=table.sheet.getRange(2,index+1,lastRow-1,1);
  if (typeof idRange.createTextFinder === 'function') {
    var match=idRange.createTextFinder(String(orderId)).matchEntireCell(true).findNext();
    return match ? match.getRow() : 0;
  }
  var data = idRange.getValues();
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
  var list = [], complete = true;
  table.rows.forEach(function(row) {
    var order;
    try { order = JSON.parse(String(row.receipt_json || '')); }
    catch (_) { complete = false; return; }
    if (!order || !order.id) { complete = false; return; }
    // Delivery-only employees see just their own assigned orders.
    var assigned=String(order.rider_id||'').toLowerCase()===actor.email;
    var deliveryOnly=auroraStaffHas_(actor,'delivery_pickup')&&
      !auroraStaffHas_(actor,'order_confirm')&&!auroraStaffHas_(actor,'delivery_assign');
    if ((actor.role==='delivery_man'||deliveryOnly)&&!assigned)return;
    if (actor.role === 'kitchen_manager' && ['pending','cancelled','delivered'].indexOf(order.status) !== -1) return;
    // Staff never receives the delivery OTP or the customer's bearer capability.
    if(actor.role==='super_admin'&&!order.customer_access_token&&order.status==='out_for_delivery')
      order.legacy_receipt_missing=true;
    delete order.customer_access_token;
    delete order.customer_google_sub;
    if (!auroraStaffHas_(actor,'customers_lookup') && !assigned) {
      delete order.customer_phone;
      delete order.customer_name;
      delete order.delivery_address;
      delete order.order_note;
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
  return {orders:list.slice(0,100),complete:complete};
}
function auroraOperationsPost_(input) {
  var actor = auroraStaffAuthenticate_(input);
  if (input.action === 'staff_session') {
    var registered=auroraAccountProfiles_(),riders=registered.filter(function(p){return p.active===true&&auroraStaffCandidate_(p.role,JSON.stringify(p.permissions));})
      .map(function(p){return {email:p.username,name:p.name};});
    Object.keys(actor.people).filter(function(email){
      return actor.people[email]&&auroraStaffCandidate_(actor.people[email].role);
    }).forEach(function(email){riders.push({email:email,name:String(actor.people[email].name||email).slice(0,100)});});
    var summary={ok:true,role:actor.role,name:actor.name,email:actor.email,username:actor.username||'',permissions:actor.permissions||auroraStaffDefaultPermissions_(actor.role),
      riders:auroraStaffHas_(actor,'delivery_assign')?riders:[]};
    // Directory is private; expose only to the verified super_admin, never via GET.
    if(actor.role==='super_admin'){
      summary.staff_profiles=Object.keys(actor.people).filter(function(email){
        var person=actor.people[email];
        return person && AURORA_STAFF_ROLES_.indexOf(person.role)!==-1 &&
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      }).map(function(email){return {email:email,name:String(actor.people[email].name||email).slice(0,100),role:actor.people[email].role,active:true,
        permissions:auroraStaffDefaultPermissions_(actor.people[email].role)};})
        .sort(function(a,b){return a.role==='super_admin'?-1:b.role==='super_admin'?1:a.name.localeCompare(b.name);}).concat(registered.map(function(p){return {email:'',username:p.username,name:p.name,role:p.role,active:p.active,permissions:p.permissions};})).slice(0,200);
    }
    return summary;
  }
  if(input.action==='staff_legacy_receipt') {
    if(actor.role!=='super_admin')auroraReject_('forbidden','Only the shop owner can restore legacy customer receipt access.');
    if(input.manually_verified!==true)
      auroraReject_('verification_required','Confirm independent verification of the original customer.');
    var legacyOrderId=auroraOrderText_(input.order_id,'Order ID',10,150);
    var originalLock=LockService.getScriptLock();
    if(!originalLock.tryLock(10000))auroraReject_('busy','Another order update is in progress.');
    try{
      var legacyTable=auroraFastOrderTable_(auroraSpreadsheet_());
      var legacyRow=auroraPrivateFindRow_(legacyTable,legacyOrderId);
      if(!legacyRow)auroraReject_('not_found','Order does not exist.');
      var legacyOrder=auroraFastReceipt_(legacyTable,legacyRow);
      if(legacyOrder.id!==legacyOrderId||legacyOrder.customer_access_token)
        auroraReject_('already_secured','This order already has a private receipt key.');
      if(legacyOrder.customer_account_id||legacyOrder.customer_google_sub)
        auroraReject_('already_linked','An account already owns this order.');
      if(legacyOrder.status!=='out_for_delivery')
        auroraReject_('invalid_transition','Restore access only after delivery has started.');
      legacyOrder.customer_access_token=auroraNewCustomerCapability_();
      legacyOrder.updated_at=new Date().toISOString();
      if(!Array.isArray(legacyOrder.history))legacyOrder.history=[];
      legacyOrder.history.push({id:'recovery_'+Utilities.getUuid(),status:legacyOrder.status,
        notes:'Legacy receipt key issued by shop owner after independent customer verification',
        actor_name:actor.name,created_at:legacyOrder.updated_at});
      auroraPrivateSaveReceipt_(legacyTable,legacyRow,legacyOrder);
      // One-time bearer recovery key; never return the delivery OTP itself.
      return {ok:true,order_id:legacyOrderId,customer_access_token:legacyOrder.customer_access_token};
    }finally{originalLock.releaseLock();}
  }
  var book = auroraSpreadsheet_(), table = auroraFastOrderTable_(book);
  if (input.action === 'staff_orders') {
    auroraStaffRequire_(actor,'orders_view');
    var snapshot=auroraOperationsOrders_(actor,{rows:auroraFastOrderList_(table)});
    return {ok:true,snapshot_complete:snapshot.complete,snapshot_at:new Date().toISOString(),
      orders:snapshot.orders,role:actor.role};
  }
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
          return person.username===riderEmail&&person.active===true&&auroraStaffCandidate_(person.role,JSON.stringify(person.permissions));
        })[0];
        if(allowed)rider={role:allowed.role,name:allowed.name};
      }
      if (!rider || !auroraStaffCandidate_(rider.role)) auroraReject_('invalid_rider','Select a staff member permitted to deliver orders.');
      order.rider_id = riderEmail;
      order.rider_name = String(rider.name||riderEmail).slice(0,100);
    }
    if (action === 'deliver') {
      // Delivery OTP is intentionally disabled. Only the assigned, signed-in
      // rider can close an out_for_delivery order after explicit confirmation.
      if (input.package_handed_over !== true)
        auroraReject_('handover_unconfirmed','Confirm that the cake was handed to the customer.');
      if (order.payment_method === 'cod' && input.cash_collected !== true)
        auroraReject_('cash_unconfirmed','Confirm full COD cash collection before marking delivered.');
      order.cod_collected = order.payment_method === 'cod';
      order.payment_status = order.payment_method === 'cod' ? 'paid' : order.payment_status;
      order.delivery_otp = '';
      delete order.otp_failed_attempts;
      delete order.otp_locked_until;
    }
    if (action === 'start_delivery' || action === 'cancel') {
      // Clear codes from older receipts; never issue another delivery OTP.
      order.delivery_otp = '';
      delete order.otp_failed_attempts;
      delete order.otp_locked_until;
    }
    order.status = transitions[action][1];
    order.updated_at = new Date().toISOString();
    if (!Array.isArray(order.history)) order.history = [];
    order.history.push({id:'staff_'+Utilities.getUuid(),status:order.status,
      notes:'Updated by authorized staff',actor_name:actor.name,created_at:order.updated_at});
    auroraPrivateSaveReceipt_(table,rowNumber,order);
    if(action==='cancel' && order.coupon_code)auroraSyncCouponUsage_(book,order.coupon_code);
    var safeOrder = JSON.parse(JSON.stringify(order));
    delete safeOrder.customer_access_token;
    delete safeOrder.customer_google_sub;
    delete safeOrder.delivery_otp;
    delete safeOrder.otp_failed_attempts;
    delete safeOrder.otp_locked_until;
    // Match staff_orders response minimization: a successful mutation must
    // not silently disclose customer contact info denied on the order list.
    var isOwnDelivery=String(order.rider_id||'').toLowerCase()===actor.email;
    if(!auroraStaffHas_(actor,'customers_lookup')&&!isOwnDelivery){
      delete safeOrder.customer_phone;
      delete safeOrder.customer_name;
      delete safeOrder.delivery_address;
      delete safeOrder.order_note;
    }
    if(actor.role==='accountant'){
      delete safeOrder.customer_phone;
      delete safeOrder.delivery_address;
      delete safeOrder.items;
    }
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
  // No delivery OTP is returned to any customer device.
  return result;
}

/**
 * Password-free customer recovery. A phone number is NOT an authentication
 * credential. The original long random checkout receipt key is required.
 */
function auroraCustomerReceiptRecover_(input){
  var id=auroraOrderText_(input.order_id,'Order reference',10,150);
  var key=String(input.customer_access_token||'');
  if(!/^ord_[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id)||!/^[0-9a-f-]{72}$/i.test(key))
    auroraReject_('forbidden','Original order reference and private receipt key are required.');
  var digits=auroraCustomerPhoneKey_(input.customer_phone);
  var table=auroraFastOrderTable_(auroraSpreadsheet_());
  var row=auroraPrivateFindRow_(table,id);
  if(!row)auroraReject_('not_found','Receipt not found or access key incorrect.');
  var order=auroraFastReceipt_(table,row);
  if(order.id!==id||String(order.customer_access_token||'')!==key||
      auroraCustomerPhoneKey_(order.customer_phone)!==digits)
    auroraReject_('forbidden','Receipt not found or access key incorrect.');
  return {ok:true,order:auroraCustomerSafeReceipt_(order)};
}


/**
 * Passwordless, phone-only tracking. Public response is intentionally restricted
 * to a masked reference and coarse delivery status. No receipt, customer name,
 * address, amount, notes, order UUID, bearer key or delivery OTP is returned.
 * A phone number is NOT a proof of ownership.
 */
function auroraPhoneOnlyTracking_(input){
  var raw=String(input&&input.phone||'').replace(/\D/g,'');
  var phone=/^8801[3-9]\d{8}$/.test(raw)?'0'+raw.slice(3):raw;
  if(!/^01[3-9]\d{8}$/.test(phone))auroraReject_('invalid_phone','Enter a valid 11-digit Bangladesh mobile number.');
  var digest=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,phone,Utilities.Charset.UTF_8)
    .map(function(byte){return ('0'+((byte+256)%256).toString(16)).slice(-2);}).join('').slice(0,32);
  var cache=CacheService.getScriptCache(),rateKey='aurora_public_tracking_'+digest;
  var attempts=Number(cache.get(rateKey)||0);
  if(attempts>=15)auroraReject_('rate_limited','Too many lookups for this number. Try again later.');
  cache.put(rateKey,String(attempts+1),600);
  var table=auroraFastOrderTable_(auroraSpreadsheet_());
  var last=table.sheet.getLastRow();
  if(last<2)return {ok:true,orders:[]};
  var columns=['customer_phone','order_number','status','created_at','updated_at'];
  var indexes=columns.map(function(name){
    var idx=table.headers.indexOf(name);
    if(idx<0||idx!==table.headers.lastIndexOf(name))auroraReject_('invalid_sheet','Tracking column is missing or duplicated.');
    return idx+1;
  });
  var count=last-1;
  // Opaque-to-the-browser pagination cursor is a descending Sheet data-row
  // index. Historical records remain reachable without widening public PII.
  var cursor=input&&input.cursor;
  if(cursor!==undefined && (!Number.isSafeInteger(cursor)||cursor<0||cursor>=count))
    auroraReject_('invalid_cursor','Tracking page is invalid. Start from the first page.');
  var firstIndex=cursor===undefined?count-1:cursor;
  var nextCursor=null;
  // Reading only these five columns protects receipt JSON and personal details.
  var cells=indexes.map(function(col){
    return table.sheet.getRange(2,col,count,1).getValues();
  });
  var allowed=['pending','confirmed','preparing','ready','assigned','picked_up','out_for_delivery','delivered','cancelled'];
  var result=[];
  for(var i=firstIndex;i>=0;i--){
    var saved=String(cells[0][i][0]||'').replace(/\D/g,'');
    if(saved.length===13&&saved.slice(0,3)==='880')saved='0'+saved.slice(3);
    if(saved!==phone)continue;
    var status=String(cells[2][i][0]||'').trim();
    if(allowed.indexOf(status)<0)continue;
    var ref=String(cells[1][i][0]||'').trim();
    var when=String(cells[4][i][0]||'').trim();
    var created=String(cells[3][i][0]||'').trim();
    // Never serialize a raw receipt. These are explicitly approved,
    // non-address order fields for a phone-only public lookup.
    var entry={reference:ref?('••••'+ref.slice(-4)):'••••',
      status:status,updated_at:when,created_at:created};
    var receipt=auroraFastReceipt_(table,i+2);
    if(receipt && String(receipt.customer_phone||'').replace(/\D/g,'').replace(/^880(?=1[3-9]\d{8}$)/,'0')===phone){
      function safeMoney(value){var n=Number(value);return isFinite(n)&&n>=0?Math.round(n*100)/100:0;}
      entry.delivery_date=String(receipt.delivery_date||'').slice(0,30);
      entry.delivery_slot=String(receipt.delivery_slot||'').slice(0,100);
      entry.payment_method=receipt.payment_method==='cod'?'cod':'other';
      entry.payment_status=['pending','paid','failed'].indexOf(receipt.payment_status)>=0?receipt.payment_status:'pending';
      entry.subtotal=safeMoney(receipt.subtotal);
      entry.delivery_fee=safeMoney(receipt.delivery_fee);
      entry.discount_amount=safeMoney(receipt.discount_amount);
      entry.total_amount=safeMoney(receipt.total_amount);
      entry.items=(Array.isArray(receipt.items)?receipt.items:[]).slice(0,30).map(function(item){
        return {product_name:String(item.product_name||'Cake').slice(0,120),
          variant_name:String(item.variant_name||'').slice(0,100),
          flavor_name:String(item.flavor_name||'').slice(0,80),
          quantity:Math.max(1,Math.min(100,Math.round(Number(item.quantity)||1))),
          unit_price:safeMoney(item.unit_price),subtotal:safeMoney(item.subtotal)};
      });
      entry.timeline=(Array.isArray(receipt.history)?receipt.history:[]).slice(-16).filter(function(item){
        return item&&allowed.indexOf(String(item.status))>=0;
      }).map(function(item){return {status:String(item.status),
        at:String(item.created_at||'').slice(0,35)};});
    }
    result.push(entry);
    if(result.length===10) {
      // Resume from the next lower row on explicit Load More, never duplicate
      // this page's final record.
      if(i>0)nextCursor=i-1;
      break;
    }
  }
  return {ok:true,orders:result,next_cursor:nextCursor};
}
