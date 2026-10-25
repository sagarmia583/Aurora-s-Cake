/**
 * Private, free Google-Sheets account system.
 * Staff: owner verifies with Google; employees use username + password.
 * Customers: phone + password; phone is NOT SMS verified.
 * The customer never gains access to older orders from phone number alone.
 * Passwords and session tokens are never stored or returned in plaintext.
 */
var AURORA_AUTH_KINDS_=['staff','customer'];
function auroraAccountDigest_(text) {
  var bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(text),Utilities.Charset.UTF_8);
  return bytes.map(function(byte){return ('0'+((byte+256)%256).toString(16)).slice(-2);}).join('');
}
function auroraAccountToken_(){return String(Utilities.getUuid())+String(Utilities.getUuid());}
function auroraAccountPassword_(password){
  if(typeof password!=='string'||password.length<10||password.length>128||password.trim()!==password)
    auroraReject_('invalid_password','Use a password of 10–128 characters, without leading or trailing spaces.');
  return password;
}
function auroraAccountHash_(password,salt) {
  // Iterated, per-user salted SHA-256 as supported by Apps Script (not Argon2).
  // Never log credentials; restricted Sheet editor access is essential.
  var hash=auroraAccountDigest_(salt+':'+password);
  for(var i=0;i<5000;i++)hash=auroraAccountDigest_(hash+':'+salt);
  return hash;
}
function auroraAccountValue_(table,id){
  var key=table.headers[0];
  return table.rows.filter(function(r){return String(r[key])===String(id);})[0]||null;
}
function auroraAccountSave_(table,record) {
  var key=table.headers[0],col=table.headers.indexOf(key)+1;
  var rows=table.sheet.getLastRow();
  if(rows<2)auroraReject_('not_found','Account record was not found.');
  var vals=table.sheet.getRange(2,col,rows-1,1).getValues();
  var i=vals.findIndex(function(row){return String(row[0])===String(record[key]);});
  if(i<0)auroraReject_('not_found','Account record was not found.');
  table.sheet.getRange(i+2,1,1,table.headers.length).setValues([table.headers.map(function(k){return auroraSheetCell_(record[k]);})]);
}
function auroraAccountProfiles_() {
  var table=auroraPrivateTable_(auroraSpreadsheet_(),'staff_accounts');
  return table.rows.filter(function(person){return person.active===true||String(person.active).toLowerCase()==='true';})
    .map(function(person){return {name:String(person.name||person.username),username:String(person.username),role:String(person.role),active:true};});
}
function auroraAccountStart_(kind,id) {
  var t=auroraPrivateTable_(auroraSpreadsheet_(),'auth_sessions'),now=Date.now();
  var value=auroraAccountToken_(),row={
    token_hash:auroraAccountDigest_(value),account_type:kind,account_id:id,
    created_at:new Date(now).toISOString(),expires_at:new Date(now+(kind==='staff'?12:24*7)*3600000).toISOString(),revoked:false
  };
  auroraAppendPrivate_(t,row);
  return value;
}
function auroraAccountAuthenticate_(kind,value){
  if(typeof value!=='string'||! /^[0-9a-f-]{72}$/i.test(value))auroraReject_('unauthorized','Sign in again to access your account.');
  var h=auroraAccountDigest_(value),t=auroraPrivateTable_(auroraSpreadsheet_(),'auth_sessions');
  var session=t.rows.filter(function(row){return row.token_hash===h&&row.account_type===kind;})[0];
  if(!session||session.revoked===true||String(session.revoked).toLowerCase()==='true'||Date.parse(session.expires_at)<=Date.now())
    auroraReject_('unauthorized','Your login expired. Sign in again.');
  var accounts=auroraPrivateTable_(auroraSpreadsheet_(),kind==='staff'?'staff_accounts':'customer_accounts');
  var account=auroraAccountValue_(accounts,session.account_id);
  if(!account||!(account.active===true||String(account.active).toLowerCase()==='true'))
    auroraReject_('unauthorized','Your account is not active.');
  return account;
}
function auroraAccountSignOut_(kind,value){
  var h=auroraAccountDigest_(value),t=auroraPrivateTable_(auroraSpreadsheet_(),'auth_sessions');
  t.rows.forEach(function(row){if(row.token_hash===h&&row.account_type===kind){
    row.revoked=true;auroraAccountSave_(t,row);
  }});
}
function auroraAccountRevokeAll_(kind,id){
  var t=auroraPrivateTable_(auroraSpreadsheet_(),'auth_sessions');
  t.rows.forEach(function(row){if(row.account_type===kind&&row.account_id===id&&!row.revoked){
    row.revoked=true;auroraAccountSave_(t,row);
  }});
}
function auroraAccountLogin_(kind,identifier,password){
  var name=String(identifier||'').trim().toLowerCase();
  var isCustomer=kind==='customer';
  var key=isCustomer?'phone':'username';
  var accounts=auroraPrivateTable_(auroraSpreadsheet_(),isCustomer?'customer_accounts':'staff_accounts');
  var person=accounts.rows.filter(function(row){return String(row[key]).toLowerCase()===name;})[0];
  // Public users cannot enumerate accounts from different responses.
  if(!person||!(person.active===true||String(person.active).toLowerCase()==='true'))
    auroraReject_('invalid_credentials','Invalid login details.');
  if(Number(person.locked_until||0)>Date.now())
    auroraReject_('too_many_attempts','Too many attempts. Try again in 15 minutes.');
  if(typeof password!=='string'||password.length<10||password.length>128||
      auroraAccountHash_(password,String(person.password_salt))!==person.password_hash){
    person.failed_attempts=Number(person.failed_attempts||0)+1;
    if(person.failed_attempts>=5){person.locked_until=Date.now()+15*60000;person.failed_attempts=0;}
    auroraAccountSave_(accounts,person);
    auroraReject_('invalid_credentials','Invalid login details.');
  }
  person.failed_attempts=0;person.locked_until=0;
  auroraAccountSave_(accounts,person);
  return {person:person,token:auroraAccountStart_(kind,person.id)};
}
function auroraAccountPhone_(value){
  var phone=String(value||'').replace(/[\s()-]/g,'');
  if(!/^(?:\+?88)?01[3-9]\d{8}$/.test(phone))
    auroraReject_('invalid_phone','Enter a valid Bangladesh mobile number.');
  return '0'+phone.slice(-10);
}
function auroraAccountCreateStaff_(actor,input) {
  if(actor.role!=='super_admin')auroraReject_('forbidden','Only the Super Admin can manage staff.');
  var username=String(input.username||'').toLowerCase().trim();
  if(!/^[a-z][a-z0-9_]{3,30}$/.test(username))auroraReject_('invalid_username','Use 4–31 letters, numbers and underscores, starting with a letter.');
  var role=String(input.role||'');
  if(['admin','order_manager','kitchen_manager','delivery_manager','delivery_man','accountant'].indexOf(role)<0)
    auroraReject_('invalid_role','Choose an allowed employee role.');
  var name=auroraOrderText_(input.name,'Staff name',2,100),password=auroraAccountPassword_(input.password);
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))auroraReject_('busy','Please retry staff setup.');
  try {
    var table=auroraPrivateTable_(auroraSpreadsheet_(),'staff_accounts');
    if(table.rows.some(function(row){return String(row.username).toLowerCase()===username;}))
      auroraReject_('duplicate_account','That username is already in use.');
    var salt=auroraAccountToken_();
    auroraAppendPrivate_(table,{id:'staff_'+Utilities.getUuid(),username:username,name:name,role:role,password_salt:salt,
      password_hash:auroraAccountHash_(password,salt),failed_attempts:0,locked_until:0,active:true,
      created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
    return {ok:true,created:true,username:username};
  }finally{lock.releaseLock();}
}
function auroraAccountStaffPost_(input) {
  if(input.action==='staff_password_login'){
    var login=auroraAccountLogin_('staff',input.username,input.password);
    return {ok:true,auth_token:login.token,role:login.person.role,name:login.person.name,username:login.person.username};
  }
  var actor=auroraStaffAuthenticate_(input);
  if(input.action==='staff_account_create')return auroraAccountCreateStaff_(actor,input);
  if(input.action==='staff_password_logout'){if(input.auth_token)auroraAccountSignOut_('staff',input.auth_token);return {ok:true};}
  if(input.action==='staff_account_set_active'||input.action==='staff_account_reset_password'){
    if(actor.role!=='super_admin')auroraReject_('forbidden','Only Super Admin can update staff.');
    var username=String(input.username||'').toLowerCase().trim();
    var lock=LockService.getScriptLock();if(!lock.tryLock(10000))auroraReject_('busy','Retry staff update.');
    try{
      var t=auroraPrivateTable_(auroraSpreadsheet_(),'staff_accounts');
      var person=t.rows.filter(function(row){return String(row.username)===username;})[0];
      if(!person)auroraReject_('not_found','Staff user was not found.');
      if(input.action==='staff_account_set_active')person.active=input.active===true;
      else{
        var password=auroraAccountPassword_(input.password),salt=auroraAccountToken_();
        person.password_salt=salt;person.password_hash=auroraAccountHash_(password,salt);
        person.failed_attempts=0;person.locked_until=0;
      }
      person.updated_at=new Date().toISOString();auroraAccountSave_(t,person);
      auroraAccountRevokeAll_('staff',person.id);
      return {ok:true,updated:true};
    }finally{lock.releaseLock();}
  }
  auroraReject_('invalid_action','Unknown staff account action.');
}
function auroraAccountSafeCustomer_(p){
  return {id:String(p.id),phone:String(p.phone),name:String(p.name),email:String(p.email||''),address:String(p.address||''),phone_verified:false};
}
function auroraAccountCustomerPost_(input) {
  var action=String(input.action||'');
  if(action==='customer_phone_signup'){
    var phone=auroraAccountPhone_(input.phone),password=auroraAccountPassword_(input.password);
    var name=auroraOrderText_(input.name,'Name',2,100);
    var lock=LockService.getScriptLock();if(!lock.tryLock(10000))auroraReject_('busy','Try again.');
    try {
      var t=auroraPrivateTable_(auroraSpreadsheet_(),'customer_accounts');
      if(t.rows.some(function(row){return String(row.phone)===phone;}))
        auroraReject_('duplicate_account','This phone number already has an account. Sign in or contact the shop.');
      var id='customer_'+Utilities.getUuid(),salt=auroraAccountToken_();
      var person={id:id,phone:phone,name:name,address:'',email:'',password_salt:salt,
        password_hash:auroraAccountHash_(password,salt),failed_attempts:0,locked_until:0,active:true,
        created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
      auroraAppendPrivate_(t,person);
      return {ok:true,auth_token:auroraAccountStart_('customer',id),profile:auroraAccountSafeCustomer_(person)};
    }finally{lock.releaseLock();}
  }
  if(action==='customer_phone_login'){
    var login=auroraAccountLogin_('customer',auroraAccountPhone_(input.phone),input.password);
    return {ok:true,auth_token:login.token,profile:auroraAccountSafeCustomer_(login.person)};
  }
  var person=auroraAccountAuthenticate_('customer',input.auth_token);
  if(action==='customer_phone_session')return {ok:true,profile:auroraAccountSafeCustomer_(person)};
  if(action==='customer_phone_logout'){auroraAccountSignOut_('customer',input.auth_token);return {ok:true};}
  if(action==='customer_phone_profile'){
    var n=auroraOrderText_(input.name,'Name',2,100);
    var address=auroraOptionalText_(input.address,'Address',300);
    var email=String(input.email||'').trim();
    if(email&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>150))
      auroraReject_('invalid_email','Enter a valid contact email.');
    var t=auroraPrivateTable_(auroraSpreadsheet_(),'customer_accounts');
    person.name=n;person.address=address;person.email=email;person.updated_at=new Date().toISOString();
    auroraAccountSave_(t,person);
    return {ok:true,profile:auroraAccountSafeCustomer_(person)};
  }
  if(action==='customer_phone_orders') {
    var t=auroraPrivateTable_(auroraSpreadsheet_(),'orders'),results=[];
    t.rows.forEach(function(row){
      var order;try{order=JSON.parse(String(row.receipt_json||''));}catch(_){return;}
      if(order&&order.customer_account_id===person.id)results.push(auroraCustomerSafeReceipt_(order));
    });
    results.sort(function(a,b){return String(b.created_at).localeCompare(String(a.created_at));});
    return {ok:true,orders:results.slice(0,100)};
  }
  if(action==='customer_phone_claim'){
    // An unverified phone number can never claim an old order. Receipt token
    // issued at checkout is the sole ownership proof for manual linking.
    var id=auroraOrderText_(input.order_id,'Order ID',10,150);
    var proof=String(input.customer_access_token||'');
    if(!/^[0-9a-f-]{72}$/i.test(proof))auroraReject_('forbidden','Provide your original receipt.');
    var lock=LockService.getScriptLock();if(!lock.tryLock(10000))auroraReject_('busy','Retry linking.');
    try{
      var t=auroraPrivateTable_(auroraSpreadsheet_(),'orders');
      var item=t.rows.filter(function(row){return String(row.id)===id;})[0];
      if(!item)auroraReject_('not_found','Order not found.');
      var order=JSON.parse(String(item.receipt_json||'{}'));
      if(!order.customer_access_token||order.customer_access_token!==proof)
        auroraReject_('forbidden','The original confirmed receipt is required.');
      if(order.customer_account_id&&order.customer_account_id!==person.id)
        auroraReject_('already_linked','This order belongs to a different account.');
      if(order.customer_google_sub)auroraReject_('already_linked','This order is linked to a Google account.');
      if(!order.customer_account_id){
        order.customer_account_id=person.id;order.updated_at=new Date().toISOString();
        auroraPrivateSaveReceipt_(t,auroraPrivateFindRow_(t,id),order);
      }
      return {ok:true,linked:true,order_id:id};
    }finally{lock.releaseLock();}
  }
  auroraReject_('invalid_action','Unknown customer phone account action.');
}