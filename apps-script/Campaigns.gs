/** Owner-only product-launch email tools. Never call these functions from doGet/doPost. */
var AURORA_CAMPAIGN_SCHEMAS = {
  email_campaigns: ['id','subject','body','product_url','status','recipient_count','sent_count','skipped_count','unknown_count','created_at','started_at','finished_at','next_attempt_at','snapshot_json','last_error'],
  email_deliveries: ['id','campaign_id','customer_id','email','status','created_at','attempted_at','sent_at','last_error']
};
var AURORA_CAMPAIGN_BATCH_SIZE = 40;
var AURORA_CAMPAIGN_QUOTA_RESERVE = 10;

function auroraSetupCampaignTables_(book) {
  Object.keys(AURORA_CAMPAIGN_SCHEMAS).forEach(function(name) {
    var headers = AURORA_CAMPAIGN_SCHEMAS[name];
    var sheet = book.getSheetByName(name) || book.insertSheet(name);
    var existing = sheet.getLastRow() ? sheet.getRange(1,1,1,Math.max(1,sheet.getLastColumn())).getValues()[0].map(String) : [];
    if (existing.some(function(key,index) { return key && existing.indexOf(key) !== index; })) throw new Error('Duplicate campaign headers in ' + name);
    var missing = headers.filter(function(key) { return existing.indexOf(key) === -1; });
    if (missing.length) sheet.getRange(1,existing.length+1,1,missing.length).setValues([missing]);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,Math.max(headers.length,existing.length)).setFontWeight('bold').setBackground('#eef2f1').setFontColor('#172e29').setWrap(true);
    sheet.setColumnWidths(1,Math.max(headers.length,existing.length),180);
  });
}
function auroraCampaignTable_(book,name) {
  var schema=AURORA_CAMPAIGN_SCHEMAS[name], sheet=book.getSheetByName(name);
  if (!schema || !sheet || sheet.getLastRow()<1) throw new Error('Run setupSheetDatabase to create campaign tabs.');
  var values=sheet.getRange(1,1,sheet.getLastRow(),sheet.getLastColumn()).getValues();
  var headers=values.shift().map(String);
  if(schema.some(function(key){return headers.indexOf(key)<0 || headers.indexOf(key)!==headers.lastIndexOf(key);})) throw new Error('Invalid campaign headers.');
  var rows=values.map(function(values,index){var row={};headers.forEach(function(key,column){row[key]=values[column];});Object.defineProperty(row,'_rowNumber',{value:index+2});return row;}).filter(function(row){return headers.some(function(key){return row[key]!=='';});});
  return {sheet:sheet,headers:headers,rows:rows};
}
function auroraCampaignUpdate_(table,row,patch) {
  Object.keys(patch).forEach(function(key){var column=table.headers.indexOf(key);if(column<0)throw new Error('Missing campaign column.');table.sheet.getRange(row._rowNumber,column+1,1,1).setValues([[auroraSheetCell_(patch[key])]]);row[key]=patch[key];});
}
function auroraCampaignAppend_(table,records) {
  if(!records.length)return;
  var start=table.sheet.getLastRow()+1, end=start+records.length-1;
  if(typeof table.sheet.getMaxRows==='function' && end>table.sheet.getMaxRows())table.sheet.insertRowsAfter(table.sheet.getMaxRows(),end-table.sheet.getMaxRows());
  table.sheet.getRange(start,1,records.length,table.headers.length).setValues(records.map(function(row){return table.headers.map(function(key){return auroraSheetCell_(row[key]===undefined?'':row[key]);});}));
}
function auroraCampaignOwner_(interactive) {
  var owner=String(PropertiesService.getScriptProperties().getProperty('AURORA_CAMPAIGN_OWNER_EMAIL')||'').toLowerCase();
  var effective=String(Session.getEffectiveUser().getEmail()||'').toLowerCase();
  var active=String(Session.getActiveUser().getEmail()||'').toLowerCase();
  if(!owner || effective!==owner || (interactive && active!==owner))throw new Error('Only the configured campaign owner can use this action. Run setupCampaignTools from the owner’s Apps Script editor.');
  return owner;
}
function setupCampaignTools() {
  var props=PropertiesService.getScriptProperties();
  var effective=String(Session.getEffectiveUser().getEmail()||'').trim().toLowerCase();
  var active=String(Session.getActiveUser().getEmail()||'').trim().toLowerCase();
  if(!effective || active!==effective)throw new Error('Run setupCampaignTools directly in your Apps Script editor while signed in as the bakery owner.');
  var previous=String(props.getProperty('AURORA_CAMPAIGN_OWNER_EMAIL')||'').toLowerCase();
  if(previous && previous!==effective)throw new Error('Campaign tools already belong to another owner.');
  if(typeof auroraMigrationAssertWritable_==='function')auroraMigrationAssertWritable_();
  if(typeof auroraSupabaseBegin_==='function')auroraSupabaseBegin_();
  props.setProperty('AURORA_CAMPAIGN_OWNER_EMAIL',effective);
  var book=auroraSpreadsheet_();auroraSetupCampaignTables_(book);
  // Request the mail permission during explicit setup, without sending anything.
  MailApp.getRemainingDailyQuota();
  var existing=ScriptApp.getProjectTriggers().filter(function(trigger){return trigger.getHandlerFunction()==='auroraCampaignOnOpen';});
  if(!existing.length)ScriptApp.newTrigger('auroraCampaignOnOpen').forSpreadsheet(book.getId()).onOpen().create();
  try{auroraCampaignOnOpen();}catch(_){/* Standalone scripts: reopen the Sheet to display its menu. */}
  return 'Campaign tools are installed. Reopen the Sheet to see Aurora’s Cake. No emails have been sent.';
}
function auroraCampaignOnOpen() {
  var ui=SpreadsheetApp.getUi();
  ui.createMenu('Aurora’s Cake').addItem('New email campaign draft','auroraNewCampaignDraft').addItem('Review & send selected campaign','auroraPreviewCampaign').addItem('Resume queued campaigns','auroraResumeCampaigns').addToUi();
}
function auroraNewCampaignDraft() {
  auroraCampaignOwner_(true);
  if(typeof auroraMigrationAssertWritable_==='function')auroraMigrationAssertWritable_();
  if(typeof auroraSupabaseBegin_==='function')auroraSupabaseBegin_();
  var book=auroraSpreadsheet_(),table=auroraCampaignTable_(book,'email_campaigns');
  var id='campaign_'+Utilities.getUuid();
  auroraCampaignAppend_(table,[{id:id,status:'draft',created_at:new Date().toISOString(),recipient_count:0,sent_count:0,skipped_count:0,unknown_count:0}]);
  if(typeof auroraSupabaseEnabled_==='function'&&auroraSupabaseEnabled_())auroraSupabaseProjectCampaignDraft_(id);
  else{book.setActiveSheet(table.sheet);table.sheet.getRange(table.sheet.getLastRow(),2).activate();}
  SpreadsheetApp.getUi().alert('Add the subject, message body and optional HTTPS product link in this new row, then choose Aurora’s Cake → Review & send selected campaign.');
}
function auroraCampaignFind_(table,id) {
  var matches=table.rows.filter(function(row){return String(row.id)===id;});
  if(matches.length!==1)throw new Error('Select a campaign with a unique non-empty id.');
  return matches[0];
}
function auroraCampaignText_(value,label,max) {
  var text=String(value===undefined?'':value).trim();
  if(!text || text.length>max)throw new Error(label+' is required and must be at most '+max+' characters.');
  return text;
}
function auroraCampaignContent_(row) {
  var subject=auroraCampaignText_(row.subject,'Subject',150),body=auroraCampaignText_(row.body,'Message',5000),url=String(row.product_url||'').trim();
  if(/[\r\n]/.test(subject))throw new Error('Keep the subject on one line.');
  if(url && (!/^https:\/\/[^\s<>"'@]+(?:\/[^\s<>"']*)?$/.test(url) || url.length>1000))throw new Error('Use a valid HTTPS product link without embedded credentials.');
  return {subject:subject,body:body,product_url:url};
}
function auroraCampaignEligible_(book) {
  var seen=Object.create(null),result=[];
  auroraSubscriptionCampaignRecipients_(book).forEach(function(row){
    var email=String(row.email||'').trim().toLowerCase();
    if(!row.customer_id||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||seen[email])return;
    seen[email]=true;result.push({customer_id:String(row.customer_id),email:email});
  });
  return result.sort(function(a,b){return a.email.localeCompare(b.email);});
}
function auroraCampaignHash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(value),Utilities.Charset.UTF_8).map(function(byte){return ('0'+((byte+256)%256).toString(16)).slice(-2);}).join('');
}
function auroraCampaignDraft_(book,id) {
  var table=auroraCampaignTable_(book,'email_campaigns'),row=auroraCampaignFind_(table,id);
  if(row.status && row.status!=='draft')throw new Error('This campaign is already queued or finished. Create a new draft for a different announcement.');
  var content=auroraCampaignContent_(row),recipients=auroraCampaignEligible_(book);
  if(!recipients.length)throw new Error('There are no verified customers who agreed to product emails yet.');
  return {table:table,row:row,content:content,recipients:recipients,hash:auroraCampaignHash_({id:id,content:content,recipients:recipients})};
}
function auroraCampaignEscape_(text) {
  return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function auroraPreviewCampaign() {
  var owner=auroraCampaignOwner_(true);
  if(typeof auroraMigrationAssertWritable_==='function')auroraMigrationAssertWritable_();
  if(typeof auroraSupabaseBegin_==='function')auroraSupabaseBegin_();
  var bridge=typeof auroraSupabaseImportSelectedCampaignDraft_==='function'?auroraSupabaseImportSelectedCampaignDraft_():null;
  var book=auroraSpreadsheet_(),active=book.getActiveSheet(),range=book.getActiveRange();
  if(!active||active.getName()!=='email_campaigns'||!range||range.getRow()<2)throw new Error('Select a filled campaign row in email_campaigns first.');
  var table=auroraCampaignTable_(book,'email_campaigns'),row=table.rows.filter(function(row){return bridge?String(row.id)===bridge.id:row._rowNumber===range.getRow();})[0];
  if(!row)throw new Error('Select a filled campaign row.');
  var draft=auroraCampaignDraft_(book,String(row.id));
  var token=Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');
  var props=PropertiesService.getScriptProperties();
  props.setProperty('AURORA_CAMPAIGN_REVIEW',JSON.stringify({token:token,id:String(row.id),owner:owner,hash:draft.hash,expires_at:Date.now()+10*60000}));
  var safe=auroraCampaignEscape_,scriptToken=JSON.stringify(token).replace(/</g,'\\u003c');
  var html='<!doctype html><html><head><base target="_top"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:15px Arial,sans-serif;color:#173c30;padding:20px;line-height:1.55}pre{white-space:pre-wrap;font:inherit;background:#f4f7f1;padding:16px;border-radius:12px}button{background:#194c3b;color:#fff;border:0;border-radius:9px;padding:12px 18px;font-weight:700;cursor:pointer}button:disabled{opacity:.6}small{color:#555}</style></head><body><h2>'+safe(draft.content.subject)+'</h2><pre>'+safe(draft.content.body)+'</pre>'+(draft.content.product_url?'<p>Product link: '+safe(draft.content.product_url)+'</p>':'')+'<p><strong>'+draft.recipients.length+' verified, opted-in recipients.</strong> Each person receives an individual message with an unsubscribe link.</p><p><small>Sent from '+safe(owner)+'. Google’s daily sending allowance may split a large audience across days. The queued announcement will keep this exact content.</small></p><button id="send" onclick="sendCampaign()">Send campaign</button><p id="result" role="status"></p><script>function sendCampaign(){var b=document.getElementById("send"),r=document.getElementById("result");b.disabled=true;r.textContent="Queuing campaign…";google.script.run.withSuccessHandler(function(v){r.textContent=v.message;}).withFailureHandler(function(e){r.textContent=e.message||"Campaign could not be queued. Check its Sheet status before retrying.";}).auroraConfirmCampaign('+scriptToken+');}</script></body></html>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(590).setHeight(610),'Review product launch email');
}
function auroraConfirmCampaign(token) {
  var owner=auroraCampaignOwner_(true);
  if(typeof auroraMigrationAssertWritable_==='function')auroraMigrationAssertWritable_();
  if(typeof auroraSupabaseBegin_==='function')auroraSupabaseBegin_();
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))throw new Error('Another operation is running. Review the campaign again shortly.');
  try{
    if(typeof auroraMigrationAssertWritable_==='function')auroraMigrationAssertWritable_();
    var props=PropertiesService.getScriptProperties(),review;
    try{review=JSON.parse(props.getProperty('AURORA_CAMPAIGN_REVIEW')||'null');}catch(_){review=null;}
    if(!review||review.owner!==owner||review.token!==String(token)||review.expires_at<Date.now())throw new Error('This preview expired. Review the selected campaign again.');
    var bridge=typeof auroraSupabaseImportSelectedCampaignDraft_==='function'?auroraSupabaseImportSelectedCampaignDraft_():null;
    if(bridge&&bridge.id!==review.id)throw new Error('The selected draft changed. Review it again before sending.');
    var book=auroraSpreadsheet_(),draft=auroraCampaignDraft_(book,review.id);
    if(draft.hash!==review.hash)throw new Error('The message or subscriber list changed. Review the campaign again before sending.');
    var base=String(ScriptApp.getService().getUrl()||'');
    if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(base))throw new Error('Deploy this Apps Script as a web app before sending campaigns.');
    var now=new Date().toISOString(),settings=auroraPairs_(auroraRows_(book,'settings'),PUBLIC_SETTINGS_KEYS);
    var snapshot={subject:draft.content.subject,body:draft.content.body,product_url:draft.content.product_url,sender_name:String(settings.shop_name||'Aurora’s Cake').slice(0,100),unsubscribe_base_url:base,audience_hash:auroraCampaignHash_(draft.recipients)};
    props.deleteProperty('AURORA_CAMPAIGN_REVIEW');
    auroraCampaignUpdate_(draft.table,draft.row,{status:'preparing',snapshot_json:JSON.stringify(snapshot),recipient_count:draft.recipients.length,started_at:now,last_error:''});
    var deliveries=auroraCampaignTable_(book,'email_deliveries');
    if(deliveries.rows.some(function(row){return row.campaign_id===review.id;}))throw new Error('This draft already has delivery rows; inspect it before creating a new campaign.');
    auroraCampaignAppend_(deliveries,draft.recipients.map(function(customer){return {id:review.id+'_'+auroraCampaignHash_(customer.email),campaign_id:review.id,customer_id:customer.customer_id,email:customer.email,status:'queued',created_at:now};}));
    auroraCampaignUpdate_(draft.table,draft.row,{status:'queued'});
    if(typeof auroraSupabaseFlush_==='function')auroraSupabaseFlush_();
    auroraCampaignEnsureWorker_();
  }finally{lock.releaseLock();}
  // The explicit owner click starts the first batch. Later batches are automatic.
  auroraCampaignRun_();
  return {success:true,message:'Campaign queued. See email_campaigns for progress and email_deliveries for individual results. Remaining messages continue automatically within Google’s allowance.'};
}
function auroraCampaignEnsureWorker_() {
  var props=PropertiesService.getScriptProperties(),triggers=ScriptApp.getProjectTriggers().filter(function(trigger){return trigger.getHandlerFunction()==='auroraCampaignTick';});
  if(!triggers.length)triggers=[ScriptApp.newTrigger('auroraCampaignTick').timeBased().everyMinutes(5).create()];
  props.setProperty('AURORA_CAMPAIGN_WORKER_ID',triggers[0].getUniqueId());
}
function auroraResumeCampaigns() {auroraCampaignOwner_(true);if(typeof auroraMigrationAssertWritable_==='function')auroraMigrationAssertWritable_();auroraCampaignEnsureWorker_();return auroraCampaignRun_();}
function auroraCampaignTick(e) {
  auroraCampaignOwner_(false);
  var expected=PropertiesService.getScriptProperties().getProperty('AURORA_CAMPAIGN_WORKER_ID');
  if(!e||String(e.triggerUid)!==expected)throw new Error('Only the installed campaign worker can use this entry point.');
  if(typeof auroraMigrationFrozen_==='function'&&auroraMigrationFrozen_())return {processed:0,migration_frozen:true};
  return auroraCampaignRun_();
}
function auroraCampaignMessage_(snapshot,recipient) {
  var token=auroraCustomerUnsubscribeToken_(recipient.customer_id);
  var link=snapshot.unsubscribe_base_url+'?action=email_unsubscribe&token='+encodeURIComponent(token);
  var plain=snapshot.body+(snapshot.product_url?'\n\nView product: '+snapshot.product_url:'')+'\n\nYou receive this because you agreed to product updates from '+snapshot.sender_name+'.\nUnsubscribe: '+link;
  var safe=auroraCampaignEscape_;
  var html='<div style="font-family:Arial,sans-serif;line-height:1.65;color:#173c30;max-width:620px"><h2>'+safe(snapshot.subject)+'</h2><p>'+safe(snapshot.body).replace(/\n/g,'<br>')+'</p>'+(snapshot.product_url?'<p><a href="'+safe(snapshot.product_url)+'">View the product</a></p>':'')+'<hr><p style="font-size:12px;color:#555">You agreed to product updates from '+safe(snapshot.sender_name)+'. <a href="'+safe(link)+'">Unsubscribe</a></p></div>';
  return {to:recipient.email,subject:snapshot.subject,body:plain,htmlBody:html,name:snapshot.sender_name};
}
function auroraCampaignRun_() {
  auroraCampaignOwner_(false);
  if(typeof auroraMigrationFrozen_==='function'&&auroraMigrationFrozen_())return {processed:0,migration_frozen:true};
  if(typeof auroraSupabaseBegin_==='function')auroraSupabaseBegin_();
  var lock=LockService.getScriptLock();if(!lock.tryLock(1000))return {processed:0,busy:true};
  if(typeof auroraMigrationFrozen_==='function'&&auroraMigrationFrozen_()){lock.releaseLock();return {processed:0,migration_frozen:true};}
  var locked=true,props=PropertiesService.getScriptProperties(),lease;
  try{lease=JSON.parse(props.getProperty('AURORA_CAMPAIGN_WORKER_LEASE')||'null');}catch(_){lease=null;}
  if(lease && lease.expires_at>Date.now()){lock.releaseLock();return {processed:0,busy:true};}
  // Seven minutes exceeds the Apps Script six-minute execution ceiling. A slow
  // external send cannot let a second worker take over while this one is alive.
  var leaseId=Utilities.getUuid();props.setProperty('AURORA_CAMPAIGN_WORKER_LEASE',JSON.stringify({id:leaseId,expires_at:Date.now()+420000}));
  var started=Date.now(),processed=0;
  try{
    var book=auroraSpreadsheet_(),campaigns=auroraCampaignTable_(book,'email_campaigns'),deliveries=auroraCampaignTable_(book,'email_deliveries');
    var pending=campaigns.rows.filter(function(row){return ['queued','sending','waiting_quota'].indexOf(String(row.status))>=0;});
    for(var i=0;i<pending.length && processed<AURORA_CAMPAIGN_BATCH_SIZE && Date.now()-started<200000;i++){
      if(typeof auroraMigrationFrozen_==='function'&&auroraMigrationFrozen_()){if(typeof auroraSupabaseFlush_==='function')auroraSupabaseFlush_();return {processed:processed,migration_frozen:true};}
      var campaign=pending[i];
      if(campaign.next_attempt_at && new Date(campaign.next_attempt_at).getTime()>Date.now())continue;
      var snapshot;
      try{snapshot=JSON.parse(String(campaign.snapshot_json));if(!snapshot.subject||!snapshot.body||!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(snapshot.unsubscribe_base_url))throw new Error('Invalid snapshot');}catch(_){auroraCampaignUpdate_(campaigns,campaign,{status:'needs_review',last_error:'The immutable campaign snapshot is missing or invalid.'});continue;}
      var rows=deliveries.rows.filter(function(row){return row.campaign_id===campaign.id;});
      var audience=rows.map(function(row){return {customer_id:String(row.customer_id),email:String(row.email).trim().toLowerCase()};}).sort(function(a,b){return a.email.localeCompare(b.email);});
      var uniqueEmails=Object.create(null),duplicateEmail=audience.some(function(row){if(uniqueEmails[row.email])return true;uniqueEmails[row.email]=true;return false;});
      if(rows.length!==Number(campaign.recipient_count)||duplicateEmail||snapshot.audience_hash!==auroraCampaignHash_(audience)){auroraCampaignUpdate_(campaigns,campaign,{status:'needs_review',last_error:'Delivery count does not match the approved audience.'});continue;}
      // A previous execution may have sent before losing its acknowledgement. Never resend that claim.
      rows.filter(function(row){return row.status==='sending';}).forEach(function(row){auroraCampaignUpdate_(deliveries,row,{status:'unknown',last_error:'A previous send was interrupted. Delivery is uncertain; this recipient will not be retried automatically.'});});
      var next=rows.filter(function(row){return row.status==='queued';}),quotaWait=false;
      for(var j=0;j<next.length && processed<AURORA_CAMPAIGN_BATCH_SIZE && Date.now()-started<200000;j++){
        if(typeof auroraMigrationFrozen_==='function'&&auroraMigrationFrozen_()){if(typeof auroraSupabaseFlush_==='function')auroraSupabaseFlush_();return {processed:processed,migration_frozen:true};}
        var customers=auroraSubscriptionCampaignRecipients_(book);
        var delivery=next[j],matches=customers.filter(function(customer){return String(customer.customer_id)===String(delivery.customer_id);});
        var customer=matches.length===1?matches[0]:null;
        if(!customer || String(customer.email).trim().toLowerCase()!==String(delivery.email).toLowerCase()){
          auroraCampaignUpdate_(deliveries,delivery,{status:'skipped',last_error:'Customer is no longer eligible for product emails.'});processed++;continue;
        }
        if(MailApp.getRemainingDailyQuota()<=AURORA_CAMPAIGN_QUOTA_RESERVE){quotaWait=true;break;}
        var message=auroraCampaignMessage_(snapshot,delivery);
        if(typeof auroraMigrationFrozen_==='function'&&auroraMigrationFrozen_()){if(typeof auroraSupabaseFlush_==='function')auroraSupabaseFlush_();return {processed:processed,migration_frozen:true};}
        auroraCampaignUpdate_(deliveries,delivery,{status:'sending',attempted_at:new Date().toISOString(),last_error:''});
        // Flush the claim before the external send. If flushing fails, no mail is attempted.
        if(typeof auroraPersistenceFlush_==='function')auroraPersistenceFlush_();else SpreadsheetApp.flush();
        lock.releaseLock();locked=false;
        var sendSucceeded=false;
        try{MailApp.sendEmail(message);sendSucceeded=true;}catch(_){/* MailApp cannot prove whether an interrupted call delivered. */}
        // Checkout, OTP and unsubscribe requests may run while the mail service is sending.
        if(!lock.tryLock(10000))return {processed:processed+1,unconfirmed:true};
        locked=true;
        if(typeof auroraSupabaseRefresh_==='function')auroraSupabaseRefresh_();
        if(sendSucceeded)auroraCampaignUpdate_(deliveries,delivery,{status:'sent',sent_at:new Date().toISOString()});
        else auroraCampaignUpdate_(deliveries,delivery,{status:'unknown',last_error:'Send outcome is uncertain. Inspect the sending account before any manual follow-up; automatic resend is disabled.'});
        processed++;
      }
      var counts={sent:0,skipped:0,unknown:0,queued:0};rows.forEach(function(row){if(counts[row.status]!==undefined)counts[row.status]++;});
      var remaining=counts.queued>0;
      auroraCampaignUpdate_(campaigns,campaign,{sent_count:counts.sent,skipped_count:counts.skipped,unknown_count:counts.unknown,status:remaining?(quotaWait?'waiting_quota':'sending'):(counts.unknown?'completed_with_issues':'completed'),finished_at:remaining?'':new Date().toISOString(),next_attempt_at:quotaWait?new Date(Date.now()+3600000).toISOString():'',last_error:quotaWait?'Waiting for Google’s mail allowance; ten messages are reserved for customer verification.':(counts.unknown?'Some send outcomes are uncertain. See email_deliveries.':'')});
    }
    if(typeof auroraSupabaseFlush_==='function')auroraSupabaseFlush_();
    if(typeof auroraMigrationFrozen_==='function'&&auroraMigrationFrozen_())return {processed:processed,migration_frozen:true};
    if(typeof auroraSupabaseProjectCampaignState_==='function')auroraSupabaseProjectCampaignState_();
    // Another owner action may queue a campaign while MailApp releases our
    // lock. Check fresh authoritative state before deleting its shared trigger.
    if(typeof auroraSupabaseRefresh_==='function')auroraSupabaseRefresh_();
    var remainingCampaigns=auroraCampaignTable_(book,'email_campaigns').rows;
    if(!remainingCampaigns.some(function(row){return ['queued','sending','waiting_quota'].indexOf(String(row.status))>=0;})){
      ScriptApp.getProjectTriggers().filter(function(trigger){return trigger.getHandlerFunction()==='auroraCampaignTick';}).forEach(function(trigger){ScriptApp.deleteTrigger(trigger);});
      PropertiesService.getScriptProperties().deleteProperty('AURORA_CAMPAIGN_WORKER_ID');
    }
    return {processed:processed};
  }finally{
    var current;try{current=JSON.parse(props.getProperty('AURORA_CAMPAIGN_WORKER_LEASE')||'null');}catch(_){current=null;}
    if(current && current.id===leaseId)props.deleteProperty('AURORA_CAMPAIGN_WORKER_LEASE');
    if(locked)lock.releaseLock();
    if(typeof auroraSupabaseDiscard_==='function')auroraSupabaseDiscard_();
  }
}
