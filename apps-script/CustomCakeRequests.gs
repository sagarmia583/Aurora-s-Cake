/**
 * Free custom-cake quote requests. Public create/status and authenticated
 * staff queue share a private Google Sheet tab, never included in public GET.
 */
function auroraCustomCakeDraft_(input) {
  if (!input || input.action!=='create_custom_cake') auroraReject_('invalid_action','Unknown custom request.');
  var id=auroraOrderText_(input.request_id,'Request ID',36,36).toLowerCase();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))
    auroraReject_('invalid_request','A valid request reference is required.');
  var phone=auroraOrderText_(input.customer_phone,'Phone',7,30);
  var digits=phone.replace(/\D/g,'');
  if(!/^\+?[0-9 ()-]+$/.test(phone)||digits.length<7||digits.length>15)
    auroraReject_('invalid_phone','Enter a valid phone number.');
  var image=auroraOptionalText_(input.reference_image_url,'Reference image URL',1500);
  if(image&&!/^https:\/\/[^ <>"']+$/i.test(image)) auroraReject_('invalid_url','Use a public HTTPS reference image URL.');
  return {
    request_id:id,customer_name:auroraOrderText_(input.customer_name,'Name',2,100),
    customer_phone:phone,cake_type:auroraOrderText_(input.cake_type,'Cake theme',2,120),
    approx_size:auroraOrderText_(input.approx_size,'Cake weight',1,100),
    flavor:auroraOrderText_(input.flavor,'Flavor',1,150),
    color_theme:auroraOptionalText_(input.color_theme,'Color theme',150),
    writing_text:auroraOptionalText_(input.writing_text,'Cake dedication',200),
    instructions:auroraOptionalText_(input.instructions,'Instructions',1000),
    reference_image_url:image
  };
}
function auroraCustomCakeThrottled_(draft) {
  var cache=CacheService.getScriptCache();
  var hash=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    draft.customer_phone.replace(/\D/g,''),Utilities.Charset.UTF_8)
    .map(function(byte){return ('0'+((byte+256)%256).toString(16)).slice(-2);}).join('').slice(0,24);
  var key='aurora_custom_phone_'+hash;
  var attempt='aurora_custom_attempt_'+draft.request_id;
  if(cache.get(attempt))return;
  var count=Number(cache.get(key)||0);
  if(count>=3)auroraReject_('rate_limited','Too many custom cake requests. Please contact the bakery.');
  cache.put(key,String(count+1),600);
  cache.put(attempt,'1',600);
}
function auroraCustomCakeRows_(table) {
  return table.rows.map(function(row) {
    var value;
    try{value=JSON.parse(String(row.receipt_json||''));}catch(_){return null;}
    return value && value.id ? value : null;
  }).filter(Boolean);
}
function auroraCustomCakePost_(input) {
  if (input.action==='create_custom_cake') {
    var draft=auroraCustomCakeDraft_(input),hash=auroraRequestHash_(draft);
    var lock=LockService.getScriptLock();
    if(!lock.tryLock(10000))auroraReject_('busy','Request confirmation is still pending. Retry with the same reference.');
    try{
      var table=auroraPrivateTable_(auroraSpreadsheet_(),'custom_cake_requests');
      var existing=table.rows.filter(function(row){return String(row.request_id)===draft.request_id;});
      if(existing.length>1)throw new Error('Duplicate custom cake request references.');
      if(existing.length){
        if(String(existing[0].request_hash)!==hash) auroraReject_('idempotency_conflict','Request ID belongs to a different custom cake.');
        return {ok:true,saved:true,request_id:draft.request_id};
      }
      auroraCustomCakeThrottled_(draft);
      var now=new Date().toISOString();
      var request={
        id:'custom_'+draft.request_id,request_id:draft.request_id,
        customer_name:draft.customer_name,customer_phone:draft.customer_phone,
        cake_type:draft.cake_type,approx_size:draft.approx_size,flavor:draft.flavor,
        color_theme:draft.color_theme,writing_text:draft.writing_text,
        instructions:draft.instructions,reference_image_url:draft.reference_image_url,
        status:'pending',estimated_price:0,quoted_price:0,created_at:now,updated_at:now
      };
      auroraAppendPrivate_(table,{
        id:request.id,request_id:draft.request_id,request_hash:hash,created_at:now,updated_at:now,
        customer_name:request.customer_name,customer_phone:request.customer_phone,
        cake_type:request.cake_type,approx_size:request.approx_size,
        flavor:request.flavor,color_theme:request.color_theme,writing_text:request.writing_text,
        instructions:request.instructions,reference_image_url:request.reference_image_url,
        status:'pending',estimated_price:0,quoted_price:0,receipt_json:JSON.stringify(request)
      });
      return {ok:true,saved:true,request_id:draft.request_id};
    }finally{lock.releaseLock();}
  }
  if(input.action==='get_custom_cake_status'){
    var id=auroraOrderText_(input.request_id,'Request ID',36,36).toLowerCase();
    var phone=auroraOrderText_(input.customer_phone,'Phone',7,30).replace(/\D/g,'');
    var found=auroraPrivateTable_(auroraSpreadsheet_(),'custom_cake_requests').rows
      .filter(function(row){return String(row.request_id)===id&&String(row.customer_phone).replace(/\D/g,'')===phone;});
    if(found.length!==1)auroraReject_('not_found','Request and phone do not match.');
    var current=JSON.parse(String(found[0].receipt_json));
    return {ok:true,request_id:id,status:current.status,quoted_price:current.quoted_price,updated_at:current.updated_at};
  }
  var actor=auroraStaffAuthenticate_(input);
  auroraStaffRequire_(actor,'custom_cakes_view');
  if(input.action==='staff_custom_cakes'){
    var table=auroraPrivateTable_(auroraSpreadsheet_(),'custom_cake_requests');
    var requests=auroraCustomCakeRows_(table);
    requests.sort(function(a,b){return String(b.created_at).localeCompare(String(a.created_at));});
    return {ok:true,requests:requests.slice(0,100)};
  }
  if(input.action==='staff_custom_quote'){
    auroraStaffRequire_(actor,'custom_cakes_quote');
    var id=auroraOrderText_(input.request_id,'Request ID',36,36).toLowerCase();
    var status=String(input.status||'');
    if(['quoted','declined'].indexOf(status)===-1)auroraReject_('invalid_status','Choose quoted or declined.');
    var price=Number(input.quoted_price||0);
    if(!Number.isFinite(price)||price<0||price>10000000||(status==='quoted'&&price<=0))
      auroraReject_('invalid_price','An accepted quote must have a positive price.');
    var lock=LockService.getScriptLock();
    if(!lock.tryLock(10000))auroraReject_('busy','Another custom quote update is pending.');
    try{
      var table=auroraPrivateTable_(auroraSpreadsheet_(),'custom_cake_requests');
      var row=table.rows.filter(function(row){return String(row.request_id)===id;})[0];
      if(!row)auroraReject_('not_found','Request was not found.');
      var old=JSON.parse(String(row.receipt_json));
      if(old.status!=='pending'&&old.status!=='quoted')auroraReject_('invalid_status','A declined request cannot be modified.');
      old.status=status;old.quoted_price=status==='quoted'?Math.round(price*100)/100:0;
      old.updated_at=new Date().toISOString();
      var sheet=table.sheet;
      var idIndex=table.headers.indexOf('request_id');
      var values=sheet.getRange(2,idIndex+1,sheet.getLastRow()-1,1).getValues();
      var rowNumbers=[];
      values.forEach(function(r,i){if(String(r[0])===id)rowNumbers.push(i+2);});
      if(rowNumbers.length!==1)auroraReject_('invalid_sheet','Duplicate request references.');
      var all=sheet.getRange(rowNumbers[0],1,1,table.headers.length).getValues()[0];
      [['receipt_json',JSON.stringify(old)],['status',old.status],
        ['quoted_price',old.quoted_price],['updated_at',old.updated_at]].forEach(function(pair){
        all[table.headers.indexOf(pair[0])]=auroraSheetCell_(pair[1]);
      });
      sheet.getRange(rowNumbers[0],1,1,all.length).setValues([all]);
      return {ok:true,updated:true};
    }finally{lock.releaseLock();}
  }
  auroraReject_('invalid_action','Invalid custom cake action.');
}