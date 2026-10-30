/** Explicit product-email subscriptions, separate from phone/password account identity. */
var AURORA_SUBSCRIPTION_HEADERS = ['id','customer_id','email','marketing_consent','email_verified','status','consent_requested_at','confirmed_at','updated_at','confirmation_nonce_hash','confirmation_expires_at','confirmation_version','unsubscribed_at','last_confirmation_at'];
function auroraSetupSubscriptions_(book) {
  var sheet=book.getSheetByName('customer_subscriptions')||book.insertSheet('customer_subscriptions');
  var headers=sheet.getLastRow()?sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(String):[];
  if(headers.some(function(key,index){return key&&headers.indexOf(key)!==index;}))throw new Error('Duplicate subscription headers.');
  var missing=AURORA_SUBSCRIPTION_HEADERS.filter(function(key){return headers.indexOf(key)<0;});
  if(missing.length)sheet.getRange(1,headers.length+1,1,missing.length).setValues([missing]);
  sheet.setFrozenRows(1);sheet.setColumnWidths(1,Math.max(headers.length,AURORA_SUBSCRIPTION_HEADERS.length),185);
  sheet.getRange(1,1,1,Math.max(headers.length,AURORA_SUBSCRIPTION_HEADERS.length)).setFontWeight('bold').setBackground('#eef2f1').setFontColor('#173c30').setWrap(true);
}
function auroraSubscriptionTable_(book) {
  var sheet=book.getSheetByName('customer_subscriptions');
  if(!sheet||!sheet.getLastRow())auroraReject_('setup_required','Product email preferences are not ready. Please try again later.');
  if(sheet.getLastRow()>50001||sheet.getLastColumn()>50)throw new Error('Subscription table exceeds supported size.');
  var values=sheet.getRange(1,1,sheet.getLastRow(),sheet.getLastColumn()).getValues(),headers=values.shift().map(String);
  if(AURORA_SUBSCRIPTION_HEADERS.some(function(key){return headers.indexOf(key)<0||headers.indexOf(key)!==headers.lastIndexOf(key);}))throw new Error('Invalid subscription headers.');
  var rows=values.map(function(values,index){var row={};headers.forEach(function(key,col){row[key]=values[col];});Object.defineProperty(row,'_rowNumber',{value:index+2});return row;}).filter(function(row){return !!row.id;});
  var ids=Object.create(null),customers=Object.create(null);
  rows.forEach(function(row){if(!row.customer_id||ids[String(row.id)]||customers[String(row.customer_id)])throw new Error('Duplicate or incomplete subscription identity.');ids[String(row.id)]=true;customers[String(row.customer_id)]=true;});
  return {sheet:sheet,headers:headers,rows:rows};
}
function auroraSubscriptionSave_(table,row,patch) {
  Object.keys(patch).forEach(function(key){var col=table.headers.indexOf(key);if(col<0)throw new Error('Missing subscription column.');table.sheet.getRange(row._rowNumber,col+1,1,1).setValues([[auroraSheetCell_(patch[key])]]);row[key]=patch[key];});
}
function auroraSubscriptionRow_(table,id) {
  var found=table.rows.filter(function(row){return String(row.customer_id)===String(id);});
  if(found.length>1)throw new Error('Duplicate customer subscriptions.');return found[0]||null;
}
function auroraSubscriptionTrue_(value) {return value===true||(typeof value==='string'&&value.trim().toLowerCase()==='true');}
function auroraSubscriptionSafe_(row) {
  if(!row)return {email:'',marketing_consent:false,email_verified:false,status:'not_subscribed'};
  return {email:String(row.email||''),marketing_consent:auroraSubscriptionTrue_(row.marketing_consent),email_verified:auroraSubscriptionTrue_(row.email_verified),status:String(row.status||'not_subscribed')};
}
function auroraSubscriptionEmail_(value) {
  if(typeof value!=='string')auroraReject_('invalid_email','Enter a valid email address.');
  var email=value.trim().toLowerCase();
  if(email.length>150||!/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(email)||/\s/.test(email))auroraReject_('invalid_email','Enter a valid email address.');
  return email;
}
function auroraSubscriptionSecret_(create) {
  var props=PropertiesService.getScriptProperties(),secret=props.getProperty('AURORA_SUBSCRIPTION_SECRET');
  if(!secret && create){secret=auroraAccountToken_()+auroraAccountToken_();props.setProperty('AURORA_SUBSCRIPTION_SECRET',secret);}
  if(!secret)throw new Error('Email link signing is not configured.');return secret;
}
function auroraSubscriptionMac_(value) {
  return Utilities.computeHmacSha256Signature(String(value),auroraSubscriptionSecret_(),Utilities.Charset.UTF_8).map(function(byte){return ('0'+((byte+256)%256).toString(16)).slice(-2);}).join('');
}
function auroraSubscriptionEqual_(left,right) {
  if(typeof left!=='string'||typeof right!=='string'||left.length!==right.length)return false;
  var difference=0;for(var i=0;i<left.length;i++)difference|=left.charCodeAt(i)^right.charCodeAt(i);return difference===0;
}
function auroraSubscriptionToken_(parts) {auroraSubscriptionSecret_(true);var value=parts.join('.');return value+'.'+auroraSubscriptionMac_(value);}
function auroraSubscriptionParseToken_(token,kind) {
  if(typeof token!=='string'||token.length>500||!/^[a-z0-9_.-]+$/i.test(token))auroraReject_('invalid_link','This email link is invalid or expired.');
  var parts=token.split('.'),signature=parts.pop();
  if(parts[0]!==kind||!signature||!auroraSubscriptionEqual_(signature,auroraSubscriptionMac_(parts.join('.'))))auroraReject_('invalid_link','This email link is invalid or expired.');
  if((kind==='confirm'&&(parts.length!==5||!/^\d+$/.test(parts[2])||!/^\d+$/.test(parts[4])||Number(parts[4])<Date.now()))||(kind==='unsubscribe'&&parts.length!==3))auroraReject_('invalid_link','This email link is invalid or expired.');
  return parts;
}
function auroraSubscriptionRate_(accountId,email) {
  var props=PropertiesService.getScriptProperties(),key='AURORA_SUBSCRIPTION_DAILY_LIMITS';
  var today=Utilities.formatDate(new Date(),'Asia/Dhaka','yyyy-MM-dd'),state;
  try{state=JSON.parse(props.getProperty(key)||'null');}catch(_){state=null;}
  if(!state||state.day!==today)state={day:today,total:0,emails:{},accounts:{}};
  var emailKey=auroraAccountDigest_(email).slice(0,24),accountKey=auroraAccountDigest_(accountId).slice(0,24),now=Date.now();
  var mail=state.emails[emailKey]||{count:0,last:0},account=state.accounts[accountKey]||{count:0,last:0};
  if(state.total>=50||mail.count>=3||account.count>=3||now-mail.last<60000||now-account.last<60000)auroraReject_('rate_limited','Please wait before requesting another confirmation email. Daily limits apply.');
  if(MailApp.getRemainingDailyQuota()<1)auroraReject_('mail_quota','Email confirmation is temporarily unavailable. Try again later.');
  mail.count++;mail.last=now;account.count++;account.last=now;state.total++;state.emails[emailKey]=mail;state.accounts[accountKey]=account;
  var json=JSON.stringify(state);if(json.length>8500)auroraReject_('rate_limited','Email confirmation is temporarily unavailable. Try again later.');
  // Count before sending, including interrupted mail calls, so retries cannot bypass the limit.
  props.setProperty(key,json);
}
function auroraSubscriptionPost_(input) {
  var person=auroraAccountAuthenticate_('customer',input.auth_token),book=auroraSpreadsheet_();
  if(input.action==='customer_email_status')return {ok:true,subscription:auroraSubscriptionSafe_(auroraSubscriptionRow_(auroraSubscriptionTable_(book),person.id))};
  var lock=LockService.getScriptLock();if(!lock.tryLock(10000))auroraReject_('busy','Please retry your email preference shortly.');
  var locked=true,message,row;
  try{
    if(typeof auroraSupabaseRefresh_==='function')auroraSupabaseRefresh_();
    person=auroraAccountAuthenticate_('customer',input.auth_token);
    var table=auroraSubscriptionTable_(book);row=auroraSubscriptionRow_(table,person.id);
    if(input.action==='customer_email_unsubscribe'){
      if(row)auroraSubscriptionOptOutEmail_(table,String(row.email));
      return {ok:true,subscription:auroraSubscriptionSafe_(row)};
    }
    if(input.action!=='customer_email_subscribe')auroraReject_('invalid_action','Unknown email preference action.');
    if(input.marketing_consent!==true)auroraReject_('consent_required','Choose product email updates before requesting confirmation.');
    var email=auroraSubscriptionEmail_(input.email);
    if(row&&row.email===email&&row.status==='subscribed'&&auroraSubscriptionTrue_(row.email_verified)&&auroraSubscriptionTrue_(row.marketing_consent))return {ok:true,subscription:auroraSubscriptionSafe_(row),already_subscribed:true};
    var base=String(ScriptApp.getService().getUrl()||'');
    if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(base))auroraReject_('setup_required','Email confirmation is not configured yet.');
    auroraSubscriptionRate_(String(person.id),email);
    if(!row){
      var created={id:'subscription_'+Utilities.getUuid(),customer_id:String(person.id)};
      var rowNumber=table.sheet.getLastRow()+1;
      if(rowNumber>table.sheet.getMaxRows())table.sheet.insertRowsAfter(table.sheet.getMaxRows(),rowNumber-table.sheet.getMaxRows());
      table.sheet.getRange(rowNumber,1,1,table.headers.length).setValues([table.headers.map(function(key){return auroraSheetCell_(created[key]===undefined?'':created[key]);})]);
      row=created;Object.defineProperty(row,'_rowNumber',{value:rowNumber});table.rows.push(row);
    }
    var now=new Date().toISOString(),nonce=auroraAccountToken_().replace(/-/g,''),expires=Date.now()+24*3600000,version=Number(row.confirmation_version||0)+1;
    auroraSubscriptionSave_(table,row,{marketing_consent:false,email_verified:false,status:'pending_confirmation',email:email,consent_requested_at:now,confirmed_at:'',updated_at:now,confirmation_nonce_hash:auroraAccountDigest_(nonce),confirmation_expires_at:new Date(expires).toISOString(),confirmation_version:version,unsubscribed_at:'',last_confirmation_at:now});
    var token=auroraSubscriptionToken_(['confirm',row.id,version,nonce,expires]),link=base+'?action=email_confirm&token='+encodeURIComponent(token);
    message={to:email,subject:'Confirm Aurora’s Cake product updates',body:'You asked to receive new cake and product announcements from Aurora’s Cake.\n\nConfirm your email preference: '+link+'\n\nThis link expires in 24 hours. If you did not request this, ignore the message; you will not be subscribed.',name:'Aurora’s Cake'};
    if(typeof auroraPersistenceFlush_==='function')auroraPersistenceFlush_();else SpreadsheetApp.flush();lock.releaseLock();locked=false;
    try{MailApp.sendEmail(message);}catch(_){auroraReject_('email_unconfirmed','We could not confirm delivery of the verification email. Check your inbox before requesting another.');}
    return {ok:true,subscription:auroraSubscriptionSafe_(row),confirmation_sent:true};
  }finally{if(locked)lock.releaseLock();}
}
function auroraSubscriptionOptOutEmail_(table,email) {
  var now=new Date().toISOString(),normalized=String(email).trim().toLowerCase();
  table.rows.forEach(function(row){if(String(row.email).trim().toLowerCase()===normalized)auroraSubscriptionSave_(table,row,{marketing_consent:false,status:'unsubscribed',unsubscribed_at:now,updated_at:now,confirmation_nonce_hash:'',confirmation_version:Number(row.confirmation_version||0)+1});});
}
function auroraSubscriptionLinkPage_(title,text,action,token) {
  var safe=function(value){return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');};
  var form='';
  if(action){var base=String(ScriptApp.getService().getUrl()||'');if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(base))throw new Error('Web app URL unavailable.');form='<form method="post" action="'+safe(base)+'" target="_top"><input type="hidden" name="action" value="'+safe(action)+'"><input type="hidden" name="token" value="'+safe(token)+'"><button type="submit">'+(action==='email_confirm'?'Confirm email updates':'Unsubscribe')+'</button></form>';}
  return HtmlService.createHtmlOutput('<!doctype html><html><head><base target="_top"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><style>body{font:16px Arial,sans-serif;line-height:1.6;color:#173c30;max-width:520px;margin:48px auto;padding:20px}button{padding:14px 20px;border:0;border-radius:12px;color:white;background:#174b3b;font-weight:bold;cursor:pointer}</style></head><body><h1>'+safe(title)+'</h1><p>'+safe(text)+'</p>'+form+'</body></html>');
}
function auroraSubscriptionLinkGet_(action,token) {
  try{auroraSubscriptionParseToken_(token,action==='email_confirm'?'confirm':'unsubscribe');return auroraSubscriptionLinkPage_(action==='email_confirm'?'Confirm product updates':'Stop product updates',action==='email_confirm'?'Choose Confirm email updates to receive Aurora’s Cake product announcements.':'Choose Unsubscribe to stop product announcements sent to this email address.',action,token);}
  catch(_){return auroraSubscriptionLinkPage_('This link is unavailable','The link is invalid or expired. Open your bakery account to manage email preferences.');}
}
function auroraSubscriptionLinkPost_(action,token) {
  var lock=LockService.getScriptLock(),locked=false;
  try{
    var parts=auroraSubscriptionParseToken_(token,action==='email_confirm'?'confirm':'unsubscribe');
    if(!lock.tryLock(10000))return auroraSubscriptionLinkPage_('Please try again','Another update is in progress. Press the button again.',action,token);locked=true;
    if(typeof auroraSupabaseRefresh_==='function')auroraSupabaseRefresh_();
    var book=auroraSpreadsheet_(),table=auroraSubscriptionTable_(book),matches=table.rows.filter(function(row){return String(row.id)===parts[1];});
    if(matches.length!==1)throw new Error('Unknown link');var row=matches[0];
    if(action==='email_unsubscribe'){
      if(parts[2]!==auroraAccountDigest_(String(row.email).trim().toLowerCase()))throw new Error('Email changed');
      auroraSubscriptionOptOutEmail_(table,String(row.email));if(typeof auroraSupabaseFlush_==='function')auroraSupabaseFlush_();return auroraSubscriptionLinkPage_('You are unsubscribed','Product announcements to this email address have been stopped. Order messages and account access are unchanged.');
    }
    if(Number(row.confirmation_version)!==Number(parts[2])||!auroraSubscriptionEqual_(String(row.confirmation_nonce_hash),auroraAccountDigest_(parts[3]))||Date.parse(String(row.confirmation_expires_at))<Date.now())throw new Error('Expired confirmation');
    var account=auroraAccountValue_(auroraPrivateTable_(book,'customer_accounts'),row.customer_id);if(!account||!auroraSubscriptionTrue_(account.active))throw new Error('Closed account');
    if(row.status==='subscribed')return auroraSubscriptionLinkPage_('Email already confirmed','Your product email preference is active. You can change it in your bakery account.');
    var now=new Date().toISOString();auroraSubscriptionSave_(table,row,{marketing_consent:true,email_verified:true,status:'subscribed',confirmed_at:now,updated_at:now});
    if(typeof auroraSupabaseFlush_==='function')auroraSupabaseFlush_();
    return auroraSubscriptionLinkPage_('Email confirmed','You can now receive Aurora’s Cake product announcements. Every announcement includes an unsubscribe link.');
  }catch(_){return auroraSubscriptionLinkPage_('This link is unavailable','The link is invalid or expired. Open your bakery account to manage email preferences.');}
  finally{if(locked)lock.releaseLock();}
}
function auroraCustomerUnsubscribeToken_(customerId) {
  var row=auroraSubscriptionRow_(auroraSubscriptionTable_(auroraSpreadsheet_()),customerId);
  if(!row)throw new Error('Subscription was removed.');
  return auroraSubscriptionToken_(['unsubscribe',row.id,auroraAccountDigest_(String(row.email).trim().toLowerCase())]);
}
function auroraSubscriptionCampaignRecipients_(book) {
  var accounts=auroraPrivateTable_(book,'customer_accounts').rows,active=Object.create(null);
  accounts.forEach(function(account){if(auroraSubscriptionTrue_(account.active))active[String(account.id)]=true;});
  return auroraSubscriptionTable_(book).rows.filter(function(row){return active[String(row.customer_id)]&&row.status==='subscribed'&&auroraSubscriptionTrue_(row.email_verified)&&auroraSubscriptionTrue_(row.marketing_consent);}).map(function(row){return {customer_id:String(row.customer_id),email:String(row.email).trim().toLowerCase()};});
}
