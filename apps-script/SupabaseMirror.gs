/**
 * One-way, eventual-consistency Google Sheets -> private Supabase replica.
 *
 * Configure these PRIVATE Apps Script Properties (do not expose in frontend):
 * AURORA_MIRROR_ENDPOINT=https://YOUR-VERCEL-DOMAIN/api/mirror-ingest
 * AURORA_MIRROR_SHARED_SECRET=at-least-32-random-characters
 *
 * Vercel holds its own matching AURORA_MIRROR_SHARED_SECRET and separately the
 * SUPABASE_SERVICE_ROLE_KEY. Apps Script never receives the Supabase service key.
 *
 * Run setupAuroraMirrorTriggerOnce() manually as the Sheet owner.
 * Each 5min run scans 3 tables / up to 25 records each with durable cursors.
 * Rows are UPSERTED by table and ID; updates are eventually reflected.
 * No claims of atomic dual writes or instant replication.
 */
var AURORA_MIRROR_TABLES_=['orders','order_items','pos_sales','custom_cake_requests',
 'inventory_items','inventory_movements','cake_cost_items','order_cost_snapshots',
 'refund_returns','rider_cash_deposits','customer_master',
 'products','product_variants','categories','settings'];
function auroraMirrorSanitize_(source,depth){
  if(depth>8)return null;
  if(source===null||source===undefined)return null;
  if(source instanceof Date)return source.toISOString();
  if(Array.isArray(source))return source.slice(0,1000).map(function(x){return auroraMirrorSanitize_(x,depth+1);});
  if(typeof source==='object'){
    var obj={};
    Object.keys(source).forEach(function(k){
      if(/password|passcode|(^|_)token|(^|_)otp|secret|_salt|_hash|proof|authorization|keychain/i.test(k))return;
      obj[k]=auroraMirrorSanitize_(source[k],depth+1);
    });
    return obj;
  }
  if(typeof source==='string')return source.slice(0,40000);
  if(typeof source==='number')return isFinite(source)?source:null;
  return typeof source==='boolean'?source:null;
}
function auroraMirrorRow_(header,values){
  var row={},id='';
  header.forEach(function(key,i){
    if(!key||/password|passcode|(^|_)token|(^|_)otp|secret|_salt|_hash|proof|authorization/i.test(key))return;
    var value=values[i];
    if(key==='receipt_json'||key==='addons_json'||key==='lines_json'){
      try{value=auroraMirrorSanitize_(JSON.parse(String(value||'{}')),0);}
      catch(_){value=null;}
    } else value=auroraMirrorSanitize_(value,0);
    row[key]=value;
  });
  id=String(row.id||row.key||'').trim();
  if(!id||id.length>180)return null;
  return {source_id:id,data:row};
}
function setupAuroraMirrorTriggerOnce(){
  var props=PropertiesService.getScriptProperties();
  var endpoint=String(props.getProperty('AURORA_MIRROR_ENDPOINT')||'');
  var secret=String(props.getProperty('AURORA_MIRROR_SHARED_SECRET')||'');
  if(!/^https:\/\/[a-z0-9.-]+\/api\/mirror-ingest$/i.test(endpoint)||secret.length<32)
    throw new Error('Configure the private mirror endpoint and shared secret first.');
  var existing=ScriptApp.getProjectTriggers().some(function(t){
    return t.getHandlerFunction()==='auroraSyncSupabaseMirror';
  });
  if(!existing)ScriptApp.newTrigger('auroraSyncSupabaseMirror').timeBased().everyMinutes(5).create();
  return {configured:true,created:!existing,frequency_minutes:5};
}
function auroraMirrorSend_(endpoint,secret,records){
  if(!records.length)return;
  var raw=JSON.stringify({records:records});
  if(raw.length>170000)throw new Error('Mirror row batch exceeds the safe request limit.');
  var response=UrlFetchApp.fetch(endpoint,{method:'post',contentType:'application/json',
    headers:{'x-aurora-mirror-secret':secret},payload:raw,muteHttpExceptions:true,
    followRedirects:false});
  if(response.getResponseCode()!==200)throw new Error('Supabase mirror unavailable; cursor not advanced.');
  var parsed;
  try{parsed=JSON.parse(response.getContentText());}catch(_){throw new Error('Mirror acknowledgement missing.');}
  if(parsed.ok!==true||parsed.synced!==records.length)throw new Error('Mirror batch was not acknowledged.');
}
function auroraSyncSupabaseMirror(){
  var props=PropertiesService.getScriptProperties();
  var endpoint=String(props.getProperty('AURORA_MIRROR_ENDPOINT')||'');
  var secret=String(props.getProperty('AURORA_MIRROR_SHARED_SECRET')||'');
  if(!/^https:\/\/[a-z0-9.-]+\/api\/mirror-ingest$/i.test(endpoint)||secret.length<32)
    throw new Error('The mirror endpoint is not configured.');
  // Use a trigger-only user lock so scheduled sync does not block customer checkouts.
  var lock=LockService.getUserLock();
  if(!lock.tryLock(10000))return {ok:false,busy:true};
  try{
    var book=auroraSpreadsheet_(),idx=Number(props.getProperty('AURORA_MIRROR_TABLE_INDEX')||0);
    if(!isFinite(idx)||idx<0||idx>=AURORA_MIRROR_TABLES_.length)idx=0;
    var total=0,visited=[];
    for(var k=0;k<3;k++){
      var tableName=AURORA_MIRROR_TABLES_[(idx+k)%AURORA_MIRROR_TABLES_.length];
      var sheet=book.getSheetByName(tableName);
      if(!sheet||sheet.getLastRow()<2)continue;
      var cols=sheet.getLastColumn(),last=sheet.getLastRow();
      if(cols<1||cols>100)throw new Error('Invalid mirror table width: '+tableName);
      var headers=sheet.getRange(1,1,1,cols).getValues()[0].map(function(v){return String(v).trim().toLowerCase();});
      if(headers.indexOf(tableName==='settings'?'key':'id')<0)
        throw new Error('Table is missing its stable row key: '+tableName);
      var cursorKey='AURORA_MIRROR_CURSOR_'+tableName;
      var cursor=Number(props.getProperty(cursorKey)||1);
      if(!Number.isInteger(cursor)||cursor<1||cursor>=last)cursor=1;
      var start=cursor+1,count=Math.min(25,last-cursor);
      var vals=sheet.getRange(start,1,count,cols).getValues(),records=[];
      vals.forEach(function(v){
        var row=auroraMirrorRow_(headers,v);
        if(row)records.push({source_table:tableName,source_id:row.source_id,data:row.data});
      });
      // Record batches <=10 protect POST size and Apps Script UrlFetch payload quota.
      for(var offset=0;offset<records.length;offset+=10)
        auroraMirrorSend_(endpoint,secret,records.slice(offset,offset+10));
      props.setProperty(cursorKey,String(cursor+count));
      total+=records.length;visited.push(tableName);
    }
    props.setProperty('AURORA_MIRROR_TABLE_INDEX',String((idx+3)%AURORA_MIRROR_TABLES_.length));
    props.setProperty('AURORA_MIRROR_LAST_SUCCESS',new Date().toISOString());
    return {ok:true,submitted:total,tables:visited};
  }finally{lock.releaseLock();}
}
