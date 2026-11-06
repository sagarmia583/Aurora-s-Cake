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
var AURORA_STAFF_ROLES_ = ['super_admin','admin','order_manager','kitchen_manager','delivery_manager','delivery_man','accountant'];
/**
 * OWNER-ONLY ONE-TIME SETUP.
 * Run manually from the Apps Script EDITOR while signed in as the intended
 * shop owner; this function is never exposed through doGet or doPost.
 * It refuses to replace an existing nonempty staff allowlist.
 */
function setupAuroraOwnerOnce() {
  var email = auroraRequireInteractiveSetup_();
  if(typeof auroraMigrationAssertWritable_==='function')auroraMigrationAssertWritable_();
  var props = PropertiesService.getScriptProperties();
  var existing = String(props.getProperty('AURORA_STAFF_USERS') || '').trim();
  if (existing && existing !== '{}') {
    throw new Error('Staff allowlist already exists. Update it manually in Script Properties; setup will not overwrite it.');
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
    if(AURORA_STAFF_ROLES_.indexOf(person.role)<0)
      auroraReject_('forbidden','This staff role is not authorized.');
    var staffCfg = {};
    try { staffCfg = auroraStaffConfig_(); } catch(_) {}
    return {email:String(person.username),role:person.role,name:String(person.name||person.username).slice(0,100),
      people:staffCfg.people || {},username:String(person.username),employee:true};
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
  return {email:email,role:person.role,name:String(person.name||email).slice(0,100),people:config.people};
}
function auroraStaffCan_(actor,action) {
  if (actor.role === 'super_admin' || actor.role === 'admin') return true;
  var permissions = {
    order_manager:['confirm','cancel'],
    kitchen_manager:['start_baking','mark_ready'],
    delivery_manager:['assign'],
    delivery_man:['pick_up','start_delivery','deliver'],
    accountant:[]
  };
  return (permissions[actor.role] || []).indexOf(action) !== -1;
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
function auroraStaffSafeOrder_(order,actor){
  // Apply the SAME data-minimization policy to queue results and mutation
  // responses; otherwise a kitchen stage write reveals private contacts.
  if(actor.role==='super_admin'&&!order.customer_access_token&&order.status==='out_for_delivery')
    order.legacy_receipt_missing=true;
  delete order.customer_access_token;
  if(typeof auroraStaffShareSafe_==='function')auroraStaffShareSafe_(order,actor);
  delete order.customer_google_sub;
  delete order.customer_account_id;
  if(actor.role==='kitchen_manager'||actor.role==='accountant'){
    delete order.customer_phone;
    delete order.delivery_address;
    delete order.recipient_phone;
    delete order.sender_phone;
    delete order.customer_email;
    delete order.recipient_email;
    delete order.sender_email;
  }
  if(actor.role==='accountant')delete order.items;
  delete order.delivery_otp;
  delete order.otp_failed_attempts;
  delete order.otp_locked_until;
  return order;
}
function auroraOperationsOrders_(actor, table) {
  var list = [], complete = true, invalidReceipts = 0;
  table.rows.forEach(function(row) {
    var order;
    try { order = JSON.parse(String(row.receipt_json || '')); }
    catch (_) { complete = false; invalidReceipts++; return; }
    if (!order || !order.id) { complete = false; invalidReceipts++; return; }
    if (actor.role === 'delivery_man' && String(order.rider_id || '').toLowerCase() !== actor.email) return;
    if (actor.role === 'kitchen_manager' && ['pending','cancelled','delivered'].indexOf(order.status) !== -1) return;
    list.push(auroraStaffSafeOrder_(order,actor));
  });
  list.sort(function(a,b){return String(b.created_at||'').localeCompare(String(a.created_at||''));});
  var recentHistory = 0;
  return {orders:list.filter(function(order) {
    if (order.status !== 'delivered' && order.status !== 'cancelled') return true;
    return recentHistory++ < 100;
  }),complete:complete,invalid_receipts:invalidReceipts};
}
function auroraOperationsPost_(input) {
  var actor = auroraStaffAuthenticate_(input);
  if (input.action === 'staff_session') {
    var registered=auroraAccountProfiles_(),riders=registered.filter(function(p){return p.role==='delivery_man'&&p.active===true;})
      .map(function(p){return {email:p.username,name:p.name};});
    Object.keys(actor.people).filter(function(email){
      return actor.people[email]&&actor.people[email].role==='delivery_man';
    }).forEach(function(email){riders.push({email:email,name:String(actor.people[email].name||email).slice(0,100)});});
    var profile_image_url='';
    var logo_url='';
    try {
      var opBook=auroraSpreadsheet_();
      var opSettings=auroraPairs_(auroraRows_(opBook,'settings'),PUBLIC_SETTINGS_KEYS);
      profile_image_url=String(opSettings.profile_image_url||opSettings.logo_url||'').trim();
      logo_url=String(opSettings.logo_url||'').trim();
    } catch (_) {}
    var summary={ok:true,role:actor.role,name:actor.name,email:actor.email,username:actor.username||'',
      profile_image_url:profile_image_url,logo_url:logo_url,
      riders:['super_admin','admin','delivery_manager'].indexOf(actor.role)===-1?[]:riders};
    // Directory is private; expose to verified super_admin and admin from sheet and Google config
    if(actor.role==='super_admin'||actor.role==='admin'){
      var googleStaff = [];
      if (actor.people) {
        googleStaff = Object.keys(actor.people).filter(function(email){
          var person=actor.people[email];
          return person && AURORA_STAFF_ROLES_.indexOf(person.role)!==-1 &&
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        }).map(function(email){return {email:email,username:email.split('@')[0],name:String(actor.people[email].name||email).slice(0,100),role:actor.people[email].role,active:true};});
      }
      var sheetStaff = registered.map(function(p){
        return {email:p.username + '@auroracake.com',username:p.username,name:p.name,role:p.role,active:p.active};
      });
      summary.staff_profiles = googleStaff.concat(sheetStaff).slice(0,200);
    }
    return summary;
  }
  if(input.action==='staff_legacy_receipt') {
    if(actor.role!=='super_admin'&&actor.role!=='admin')auroraReject_('forbidden','Only the shop owner or admin can restore legacy customer receipt access.');
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
    var snapshot=auroraOperationsOrders_(actor,{rows:auroraFastOrderList_(table)});
    return {ok:true,snapshot_complete:snapshot.complete,invalid_receipts:snapshot.invalid_receipts,snapshot_at:new Date().toISOString(),
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
    var priorStage=order.status,priorRider=String(order.rider_id||'').trim().toLowerCase();
    var targetStatus = {
      confirm: 'confirmed', cancel: 'cancelled',
      start_baking: 'preparing', mark_ready: 'ready',
      assign: 'assigned', pick_up: 'picked_up',
      start_delivery: 'out_for_delivery', deliver: 'delivered'
    };
    var allowedSourceStatuses = {
      confirm: ['pending'],
      cancel: ['pending','confirmed','preparing','ready','assigned','picked_up','out_for_delivery'],
      start_baking: ['confirmed','pending'],
      mark_ready: ['preparing'],
      assign: ['ready','confirmed','preparing','assigned'],
      pick_up: ['assigned'],
      start_delivery: ['picked_up','assigned'],
      deliver: ['out_for_delivery','picked_up','assigned']
    };
    if((actor.role==='super_admin'||actor.role==='admin')&&action==='start_delivery'){
      allowedSourceStatuses.start_delivery.push('ready');
      if(order.status==='ready'&&!order.rider_id){order.rider_id=actor.username||actor.email;order.rider_name=actor.name;}
    }
    if (!targetStatus[action] || !allowedSourceStatuses[action] || allowedSourceStatuses[action].indexOf(order.status) === -1) {
      auroraReject_('invalid_transition','Order is not at the required stage.');
    }
    if (['pick_up','start_delivery','deliver'].indexOf(action) !== -1) {
      var isManagerOrAdmin = actor.role === 'super_admin' || actor.role === 'admin' || actor.role === 'delivery_manager';
      var hasAdminOverride = isManagerOrAdmin && (actor.role==='super_admin'||actor.role==='admin'||input.admin_override === true || input.admin_override === 'true');
      var assignedRider = String(order.rider_id || '').toLowerCase().trim();
      var actorEmail = String(actor.email || '').toLowerCase().trim();
      var actorUser = String(actor.username || '').toLowerCase().trim();

      if (!hasAdminOverride && (!assignedRider ||
          (assignedRider !== actorEmail && assignedRider !== actorUser))) {
        auroraReject_('forbidden','This delivery must be assigned to your rider account.');
      }
    }
    if (action === 'assign') {
      var riderEmail = String(input.rider_email || input.rider_id || input.rider_username || '').trim().toLowerCase();
      if(!riderEmail || riderEmail.length>200)auroraReject_('invalid_rider','Select a registered delivery rider.');
      var registered = actor.people && Object.prototype.hasOwnProperty.call(actor.people,riderEmail)
        ? actor.people[riderEmail] : null;
      var rider = registered && registered.role==='delivery_man'
        ? {name:String(registered.name||riderEmail).slice(0,100)} : null;
      if(!rider){
        var allowed = auroraAccountProfiles_().filter(function(person){
          return person.active===true && person.role==='delivery_man' &&
            String(person.username||'').toLowerCase()===riderEmail;
        })[0];
        if(allowed)rider={name:allowed.name};
      }
      if(!rider)auroraReject_('invalid_rider','Select an active, registered delivery rider.');
      // Canonical roster identity, not a request-supplied rider label or ID.
      order.rider_id=riderEmail;
      order.rider_name=rider.name;
    }
    // Delivery OTP is disabled. Clear legacy codes and lockouts on every transition.
    order.delivery_otp='';order.otp_failed_attempts=0;order.otp_locked_until=0;
    if (action === 'deliver') {
      if (order.payment_method === 'cod' && input.cash_collected !== true) {
        auroraReject_('cash_unconfirmed','Confirm receiving the full cash payment before marking delivered.');
      }
      order.cod_collected = order.payment_method === 'cod';
      order.payment_status = order.payment_method === 'cod' ? 'paid' : order.payment_status;
      // Delivery codes are single-use; never persist a valid code after completion.
      order.delivery_otp = '';
      order.otp_failed_attempts = 0;
      order.otp_locked_until = 0;
    }
    if (action === 'cancel') order.delivery_otp = '';
    order.status = targetStatus[action];
    order.updated_at = new Date().toISOString();
    if (!Array.isArray(order.history)) order.history = [];
    order.history.push({id:'staff_'+Utilities.getUuid(),status:order.status,
      notes:action==='cancel'&&input.reason?'Cancelled: '+auroraOrderText_(input.reason,'Cancellation reason',1,500):'Updated by authorized staff',actor_name:actor.name,created_at:order.updated_at});
    auroraPrivateSaveReceipt_(table,rowNumber,order);
    var safeOrder=auroraStaffSafeOrder_(JSON.parse(JSON.stringify(order)),actor);
    return {ok:true,order:safeOrder,stage_changed:priorStage!==order.status||priorRider!==String(order.rider_id||'').trim().toLowerCase()};
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
  // Even legacy order IDs and customer phone numbers are not ownership
  // proof. The shop can issue a new receipt capability after independent
  // verification through staff_legacy_receipt.
  if (!hasCapability && !hasPhoneOwner && !hasGoogleOwner) {
    auroraReject_('forbidden','A valid receipt access key or linked login is required.');
  }
  var result={ok:true,order_id:order.id,status:order.status,updated_at:order.updated_at,
    history:Array.isArray(order.history) ? order.history.slice(-20) : [],rider_name:order.rider_name||'',
    payment_status:order.payment_status,cod_collected:order.cod_collected};
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
