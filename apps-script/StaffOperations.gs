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
  var config=auroraStaffConfig_();
  var decoded=auroraVerifiedGoogleClaims_(input && input.id_token,config.clientId);
  var email=String(decoded.email).trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(config.people,email)) {
    auroraReject_('forbidden','This Google account is not authorized to access bakery operations.');
  }
  var person=config.people[email];
  if (!person || AURORA_STAFF_ROLES_.indexOf(person.role)===-1) auroraReject_('forbidden','Staff role is not authorized.');
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
  var data = table.sheet.getRange(2,index+1,lastRow-1,1).getValues();
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
function auroraOperationsOrders_(actor, table) {
  var list = [];
  table.rows.forEach(function(row) {
    var order;
    try { order = JSON.parse(String(row.receipt_json || '')); } catch (_) { return; }
    if (!order || !order.id) return;
    if (actor.role === 'delivery_man' && String(order.rider_id || '').toLowerCase() !== actor.email) return;
    if (actor.role === 'kitchen_manager' && ['pending','cancelled','delivered'].indexOf(order.status) !== -1) return;
    // Staff never receives the delivery OTP or the customer's bearer capability.
    delete order.customer_access_token;
    delete order.customer_google_sub;
    if (actor.role === 'kitchen_manager') {
      delete order.customer_phone;
      delete order.delivery_address;
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
  return list.slice(0,100);
}
function auroraOperationsPost_(input) {
  var actor = auroraStaffAuthenticate_(input);
  if (input.action === 'staff_session') {
    var summary={ok:true,role:actor.role,name:actor.name,email:actor.email,
      riders:['super_admin','admin','delivery_manager'].indexOf(actor.role)===-1?[]:
        Object.keys(actor.people).filter(function(email){
          return actor.people[email] && actor.people[email].role==='delivery_man';
        }).map(function(email){return {email:email,name:String(actor.people[email].name||email).slice(0,100)};})};
    // Directory is private; expose only to the verified super_admin, never via GET.
    if(actor.role==='super_admin'){
      summary.staff_profiles=Object.keys(actor.people).filter(function(email){
        var person=actor.people[email];
        return person && AURORA_STAFF_ROLES_.indexOf(person.role)!==-1 &&
          /^[^\s@]+@[^\s@]+\\.[^\s@]+$/.test(email);
      }).map(function(email){return {email:email,name:String(actor.people[email].name||email).slice(0,100),role:actor.people[email].role};})
        .sort(function(a,b){return a.role==='super_admin'?-1:b.role==='super_admin'?1:a.name.localeCompare(b.name);}).slice(0,200);
    }
    return summary;
  }
  var book = auroraSpreadsheet_(), table = auroraPrivateTable_(book,'orders');
  if (input.action === 'staff_orders') return {ok:true,orders:auroraOperationsOrders_(actor,table),role:actor.role};
  if (input.action !== 'staff_mutate') auroraReject_('invalid_action','Unknown staff action.');
  var action = String(input.operation || '');
  if (!auroraStaffCan_(actor,action)) auroraReject_('forbidden','Your role cannot perform this operation.');
  var orderId = auroraOrderText_(input.order_id,'Order ID',10,150);
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) auroraReject_('busy','Another order update is in progress. Retry.');
  try {
    table = auroraPrivateTable_(book,'orders');
    var rowNumber = auroraPrivateFindRow_(table,orderId);
    if (!rowNumber) auroraReject_('not_found','Order not found.');
    var record = table.rows.filter(function(row){return String(row.id) === orderId;})[0];
    var order = JSON.parse(String(record.receipt_json));
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
      var riderEmail = auroraOrderText_(input.rider_email,'Rider email',5,200).toLowerCase();
      var rider = actor.people[riderEmail];
      if (!rider || rider.role !== 'delivery_man') auroraReject_('invalid_rider','Select a registered delivery rider.');
      order.rider_id = riderEmail;
      order.rider_name = String(rider.name||riderEmail).slice(0,100);
    }
    if (action === 'start_delivery' && !order.delivery_otp) {
      // No code is issued at checkout; generate it just before delivery.
      // Use Apps Script's platform UUID source rather than Math.random().
      order.delivery_otp = String(1000 + (parseInt(String(Utilities.getUuid()).replace(/-/g,'').slice(0,8),16) % 9000));
    }
    if (action === 'deliver') {
      var nowMillis = Date.now();
      if (Number(order.otp_locked_until || 0) > nowMillis) auroraReject_('otp_locked','Too many incorrect OTP entries. Try again later.');
      var code = String(input.delivery_otp || '');
      if (!/^\d{4}$/.test(code) || code !== String(order.delivery_otp)) {
        order.otp_failed_attempts = Number(order.otp_failed_attempts || 0)+1;
        if (order.otp_failed_attempts >= 5) {
          order.otp_locked_until = nowMillis+15*60*1000;
          order.otp_failed_attempts = 0;
        }
        auroraPrivateSaveReceipt_(table,rowNumber,order);
        auroraReject_('invalid_otp','Delivery code is incorrect or temporarily locked.');
      }
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
    order.status = transitions[action][1];
    order.updated_at = new Date().toISOString();
    if (!Array.isArray(order.history)) order.history = [];
    order.history.push({id:'staff_'+Utilities.getUuid(),status:order.status,
      notes:'Updated by authorized staff',actor_name:actor.name,created_at:order.updated_at});
    auroraPrivateSaveReceipt_(table,rowNumber,order);
    var safeOrder = JSON.parse(JSON.stringify(order));
    delete safeOrder.customer_access_token;
    delete safeOrder.customer_google_sub;
    delete safeOrder.delivery_otp;
    delete safeOrder.otp_failed_attempts;
    delete safeOrder.otp_locked_until;
    return {ok:true,order:safeOrder};
  } finally {lock.releaseLock();}
}
/** Non-enumerating lookup only for a customer holding their own saved receipt. */
function auroraCustomerOrderStatus_(input) {
  var orderId = auroraOrderText_(input.order_id,'Order reference',10,150);
  if (!/^ord_[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(orderId)) auroraReject_('not_found','Order reference is invalid.');
  var digits = auroraOrderText_(input.customer_phone,'Phone',7,30).replace(/\D/g,'');
  var table = auroraPrivateTable_(auroraSpreadsheet_(),'orders');
  var record = table.rows.filter(function(row){return String(row.id)===orderId;})[0];
  if (!record || String(record.customer_phone||'').replace(/\D/g,'')!==digits) auroraReject_('not_found','Order reference and phone do not match.');
  var order = JSON.parse(String(record.receipt_json));
  var hasCapability = typeof input.customer_access_token === 'string' &&
    order.customer_access_token &&
    input.customer_access_token === order.customer_access_token;
  var hasGoogleOwner = false;
  if (!hasCapability && input.id_token && order.customer_google_sub) {
    hasGoogleOwner = auroraCustomerIdentity_(input).sub === order.customer_google_sub;
  }
  // Legacy orders predate customer capabilities and may still support
  // limited phone/reference lookup, but NEVER return an OTP on that basis.
  if (!hasCapability && !hasGoogleOwner && order.customer_access_token) {
    auroraReject_('forbidden','A valid receipt access key or linked Google login is required.');
  }
  var result={ok:true,order_id:order.id,status:order.status,updated_at:order.updated_at,
    history:Array.isArray(order.history) ? order.history.slice(-20) : [],rider_name:order.rider_name||'',
    payment_status:order.payment_status,cod_collected:order.cod_collected};
  if ((hasCapability || hasGoogleOwner) && order.status==='out_for_delivery') {
    result.delivery_otp=order.delivery_otp;
  }
  return result;
}
