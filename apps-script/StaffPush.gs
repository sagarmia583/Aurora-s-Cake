/** Private opt-in Expo tokens. Recipients must still hold an active staff session. */
var AURORA_PUSH_PREFIX_='aurora_staff_push_';
var AURORA_PUSH_TTL_MS_=30*24*60*60*1000;
function auroraReceivesNewOrders_(role){
  return ['super_admin','admin','order_manager'].indexOf(role)!==-1;
}
function auroraStaffPush_(input){
  var actor=auroraStaffAuthenticate_(input);
  var credential=String(input.auth_token||'');
  if(!/^[0-9a-f-]{72}$/i.test(credential))
    auroraReject_('forbidden','Order push is available for password staff accounts.');
  var token=String(input.push_token||'');
  if(!/^(ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]{8,150}\]$/.test(token)||typeof input.sound!=='boolean')
    auroraReject_('invalid_request','Invalid push registration.');
  var properties=PropertiesService.getScriptProperties();
  if(!properties.getProperty('AURORA_EXPO_PUSH_ACCESS_TOKEN'))
    auroraReject_('push_unavailable','Push delivery has not been configured.');
  var key=AURORA_PUSH_PREFIX_+auroraAccountDigest_(token);
  properties.setProperty(key,JSON.stringify({token:token,session:auroraAccountDigest_(credential),sound:input.sound,
    sound_version:input.sound_version===3?3:2,expires:Date.now()+AURORA_PUSH_TTL_MS_}));
  return {ok:true,registered:true,stage_notifications:true};
}
function auroraMayReceiveStage_(person,order){
  if(auroraReceivesNewOrders_(person.role))return true;
  var status=order.status;
  if(person.role==='kitchen_manager')return ['confirmed','preparing','ready','cancelled'].indexOf(status)!==-1;
  if(person.role==='delivery_manager')return ['ready','assigned','picked_up','out_for_delivery','delivered','cancelled'].indexOf(status)!==-1;
  if(person.role==='delivery_man')return String(order.rider_id||'').trim().toLowerCase()===person.username &&
    ['assigned','picked_up','out_for_delivery','delivered','cancelled'].indexOf(status)!==-1;
  return person.role==='accountant'&&status==='delivered';
}
function auroraNotifyOrderStage_(book,order){
  var properties=PropertiesService.getScriptProperties();
  var secret=properties.getProperty('AURORA_EXPO_PUSH_ACCESS_TOKEN');
  if(!secret)return;
  var registrations=properties.getProperties(),now=Date.now(),devices=[];
  var keys=Object.keys(registrations).filter(function(key){return key.indexOf(AURORA_PUSH_PREFIX_)===0;});
  if(!keys.length)return;
  var sessions=Object.create(null),people=Object.create(null);
  auroraPrivateTable_(book,'auth_sessions').rows.forEach(function(row){
    if(row.account_type==='staff'&&!auroraActive_(row.revoked)&&Date.parse(String(row.expires_at))>now)
      sessions[row.token_hash]=String(row.account_id);
  });
  auroraPrivateTable_(book,'staff_accounts').rows.forEach(function(row){
    if(String(row.active).toLowerCase()==='true')
      people[String(row.id)]={role:String(row.role),username:String(row.username||'').trim().toLowerCase()};
  });
  var labels={pending:'নতুন অর্ডার এসেছে',confirmed:'অর্ডার নিশ্চিত হয়েছে',preparing:'কেক তৈরি হচ্ছে',ready:'কেক প্রস্তুত',
    assigned:'রাইডার নির্ধারণ হয়েছে',picked_up:'রাইডার কেক বুঝে পেয়েছেন',out_for_delivery:'ডেলিভারির পথে',delivered:'ডেলিভারি সম্পন্ন',cancelled:'অর্ডার বাতিল'};
  if(!Object.prototype.hasOwnProperty.call(labels,order.status))return;
  keys.forEach(function(key){
    var entry;
    try{entry=JSON.parse(registrations[key]);}catch(_){return;}
    var person=entry&&people[sessions[entry.session]];
    if(!person||entry.expires<=now||!auroraMayReceiveStage_(person,order))return;
    var version=entry.sound_version===3?3:2;
    if(version===2&&order.status!=='pending')return;
    devices.push({to:entry.token,title:'Aurora’s Cake · #'+auroraFormatOrderNumber_(order.order_number),body:labels[order.status],priority:'high',
      sound:entry.sound?'aurora_chime_v'+version+'.wav':null,channelId:'aurora-orders-chime-v'+version+(entry.sound?'':'-silent'),
      data:{screen:'orders',kind:version===3?'order_stage_push':'new_order_push',orderId:order.id},ttl:1800});
  });
  for(var i=0;i<devices.length;i+=100){
    var response=UrlFetchApp.fetch('https://exp.host/--/api/v2/push/send',{method:'post',contentType:'application/json',
      headers:{Authorization:'Bearer '+secret,Accept:'application/json'},payload:JSON.stringify(devices.slice(i,i+100)),muteHttpExceptions:true});
    if(response.getResponseCode()>=400)console.warn('New order push request rejected with HTTP '+response.getResponseCode());
  }
}
