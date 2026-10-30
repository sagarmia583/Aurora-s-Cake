/**
 * OFF by default. Private transitional persistence for existing business rules.
 * No browser/client key. No automatic promotion, deployment or activation.
 * Requires SQL 006 + 007 and explicit entry-point/flush integration documented
 * in docs/SUPABASE_RUNTIME.md. Physical Sheets remain the owner draft editor.
 */
var AURORA_SUPABASE_PROJECT_REF_ = 'dtvefwpaxwffxglqbfoo';
var AURORA_SUPABASE_ORIGIN_ = 'https://dtvefwpaxwffxglqbfoo.supabase.co';
var AURORA_SUPABASE_REQUEST_ = null;

function auroraSupabaseEnabled_() {
  var selected=PropertiesService.getScriptProperties().getProperty('AURORA_DATABASE_BACKEND');
  if(selected===null||selected===undefined||selected===''||selected==='google_sheets')return false;
  if(selected==='supabase')return true;
  throw auroraSupabaseError_('invalid_database_backend',false);
}
function auroraSupabaseError_(code, uncertain) {
  // Never include remote error bodies, secrets, row data or URLs in errors/logs.
  var error = new Error('Private database operation could not be confirmed. Retry the same request.');
  error.code = code; error.auroraStoreError = true; error.uncertain = uncertain === true;
  return error;
}
function auroraSupabaseClone_(value) { return JSON.parse(JSON.stringify(value)); }
function auroraSupabaseRpc_(name, payload) {
  if (['aurora_runtime_snapshot','aurora_runtime_commit','aurora_runtime_cutover_status'].indexOf(name) < 0) throw auroraSupabaseError_('invalid_database_operation', false);
  var key = PropertiesService.getScriptProperties().getProperty('AURORA_SUPABASE_SERVICE_KEY') || '';
  if (key.length < 32 || /^sb_publishable_/.test(key)) throw auroraSupabaseError_('database_not_configured', false);
  var headers = {apikey:key};
  // Legacy service-role JWTs need the matching Authorization header. New secret
  // API keys authenticate through apikey; they are not JWT bearer tokens.
  if (/^eyJ/.test(key)) headers.Authorization = 'Bearer ' + key;
  var response;
  try {
    response = UrlFetchApp.fetch(AURORA_SUPABASE_ORIGIN_ + '/rest/v1/rpc/' + name, {
      method:'post', contentType:'application/json', headers:headers,
      payload:JSON.stringify(payload), muteHttpExceptions:true, followRedirects:false,
      validateHttpsCertificates:true
    });
  } catch (_) { throw auroraSupabaseError_('database_unavailable', name === 'aurora_runtime_commit'); }
  var status = response.getResponseCode(), body = response.getContentText(), data;
  if (body.length > 8388608) throw auroraSupabaseError_('database_response_limit', name === 'aurora_runtime_commit');
  try { data = JSON.parse(body); } catch (_) { throw auroraSupabaseError_('database_invalid_response', name === 'aurora_runtime_commit'); }
  if (status < 200 || status >= 300) {
    if (data && (data.code === '40001' || data.message === 'revision_conflict')) throw auroraSupabaseError_('revision_conflict', false);
    throw auroraSupabaseError_('database_rejected', name === 'aurora_runtime_commit' && status >= 500);
  }
  return data;
}
function auroraSupabaseBegin_() {
  // Call once at EVERY web/owner/trigger entry point. It clears request globals
  // even when the feature is off, preventing accidental reuse in tests/runtime.
  AURORA_SUPABASE_REQUEST_ = null;
  if (!auroraSupabaseEnabled_()) return false;
  var snapshot = auroraSupabaseRpc_('aurora_runtime_snapshot', {p_project_ref:AURORA_SUPABASE_PROJECT_REF_});
  if (!snapshot || snapshot.project_ref !== AURORA_SUPABASE_PROJECT_REF_ || !/^[1-9][0-9]{0,17}$/.test(String(snapshot.revision)) ||
      !snapshot.tables || typeof snapshot.tables !== 'object' || Array.isArray(snapshot.tables)) throw auroraSupabaseError_('database_invalid_snapshot', false);
  var names = Object.keys(snapshot.tables), count = 0;
  if (names.length > 64) throw auroraSupabaseError_('database_snapshot_limit', false);
  names.forEach(function(name) {
    var table = snapshot.tables[name];
    if (!table || !Array.isArray(table.headers) || !table.headers.length || table.headers.length > 100 ||
        table.headers.some(function(h) { return typeof h !== 'string'; }) || !Array.isArray(table.rows)) throw auroraSupabaseError_('database_invalid_snapshot', false);
    var grid = Object.create(null), last = 1;
    table.rows.forEach(function(row) {
      if (!row || !Number.isInteger(row.sheet_row) || row.sheet_row < 2 || row.sheet_row > 50001 ||
          !Array.isArray(row.cells) || row.cells.length > table.headers.length || grid[row.sheet_row]) throw auroraSupabaseError_('database_invalid_snapshot', false);
      grid[row.sheet_row] = row.cells.slice(); last = Math.max(last, row.sheet_row); count++;
    });
    table.grid = grid; table.last = last; delete table.rows;
  });
  if (count > 50000) throw auroraSupabaseError_('database_snapshot_limit', false);
  AURORA_SUPABASE_REQUEST_ = {revision:String(snapshot.revision),tables:snapshot.tables,dirty:Object.create(null),commit:null,poisoned:false};
  return true;
}
function auroraSupabaseContext_() {
  if (!auroraSupabaseEnabled_()) throw auroraSupabaseError_('database_disabled', false);
  if (!AURORA_SUPABASE_REQUEST_) auroraSupabaseBegin_();
  if (AURORA_SUPABASE_REQUEST_.poisoned) throw auroraSupabaseError_('database_request_aborted', true);
  return AURORA_SUPABASE_REQUEST_;
}
function auroraSupabaseHasChanges_() {
  return !!(AURORA_SUPABASE_REQUEST_ && Object.keys(AURORA_SUPABASE_REQUEST_.dirty).length);
}
function auroraSupabaseFlush_() {
  if (!auroraSupabaseEnabled_()) return;
  var ctx = auroraSupabaseContext_(), keys = Object.keys(ctx.dirty);
  if (!keys.length) return;
  // Snapshot order is fixed; appends sort by row so the server can require
  // contiguous appends. Every operation is a changed row, never a table dump.
  var changes = keys.map(function(key) { return ctx.dirty[key]; }).sort(function(a,b) {
    return a.table < b.table ? -1 : a.table > b.table ? 1 : a.row-b.row;
  });
  if (changes.length > 1000 || JSON.stringify(changes).length > 2097152) throw auroraSupabaseError_('database_delta_limit', false);
  if (!ctx.commit) ctx.commit = {p_project_ref:AURORA_SUPABASE_PROJECT_REF_,p_expected_revision:ctx.revision,
    p_operation_id:Utilities.getUuid(),p_changes:auroraSupabaseClone_(changes)};
  var reply;
  try {
    try { reply = auroraSupabaseRpc_('aurora_runtime_commit',ctx.commit); }
    catch (first) {
      // Only a lost acknowledgement is retried automatically. Reuse the EXACT
      // operation id, expected revision and delta; never replay business logic.
      if (!first.uncertain) throw first;
      reply = auroraSupabaseRpc_('aurora_runtime_commit',ctx.commit);
    }
    if (!reply || reply.ok !== true || !/^[1-9][0-9]{0,17}$/.test(String(reply.revision))) throw auroraSupabaseError_('database_invalid_commit',true);
    ctx.revision = String(reply.revision); ctx.dirty = Object.create(null); ctx.commit = null;
  } catch (error) { ctx.poisoned = true; throw error; }
}
function auroraSupabaseRefresh_() {
  if (!auroraSupabaseEnabled_()) return;
  if (auroraSupabaseHasChanges_()) throw auroraSupabaseError_('database_refresh_has_pending_changes',false);
  // Use after acquiring/reacquiring ScriptLock, before reading/revalidating
  // identity/consent. Virtual sheet/range handles always resolve the new context.
  auroraSupabaseBegin_();
}
function auroraSupabaseDiscard_() { AURORA_SUPABASE_REQUEST_ = null; }
function auroraPersistenceFlush_() {
  if (auroraSupabaseEnabled_()) auroraSupabaseFlush_();
  else SpreadsheetApp.flush();
}
function auroraSupabaseCell_(value) {
  if (value === undefined || value === null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    if (value.indexOf('\u0000') >= 0) throw auroraSupabaseError_('database_invalid_cell',false);
    // setValues("'=...") is a literal in Sheets; getValues returns "=...".
    return /^'[=+\-@]/.test(value) ? value.slice(1) : value;
  }
  if (typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
  throw auroraSupabaseError_('database_invalid_cell',false);
}
function auroraSupabaseTable_(name) {
  var tables=auroraSupabaseContext_().tables;
  if (!Object.prototype.hasOwnProperty.call(tables,name)) throw auroraSupabaseError_('database_table_missing',false);
  return tables[name];
}
function auroraSupabaseBook_() {
  auroraSupabaseContext_();
  return {
    getId:function() { return auroraConfiguredId_(); },
    getSheetByName:function(name) { return Object.prototype.hasOwnProperty.call(auroraSupabaseContext_().tables,name) ? auroraSupabaseSheet_(name) : null; },
    insertSheet:function() { throw auroraSupabaseError_('database_schema_is_owner_managed',false); },
    // Owner UI selection remains a real Sheet. It is a draft editor only.
    getActiveSheet:function() { return auroraSupabasePhysicalBook_().getActiveSheet(); },
    getActiveRange:function() { return auroraSupabasePhysicalBook_().getActiveRange(); },
    setActiveSheet:function(sheet) { return auroraSupabasePhysicalBook_().setActiveSheet(auroraSupabasePhysicalBook_().getSheetByName(sheet.getName())); }
  };
}
function auroraSupabasePhysicalBook_() {
  var id=auroraConfiguredId_();
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}
function auroraSupabaseSheet_(name) {
  var sheet={
    getName:function(){return name;},getLastRow:function(){return auroraSupabaseTable_(name).last;},
    getLastColumn:function(){return auroraSupabaseTable_(name).headers.length;},getMaxRows:function(){return 50001;},
    getRange:function(r,c,h,w){return auroraSupabaseRange_(name,r,c,h===undefined?1:h,w===undefined?1:w);},
    insertRowsAfter:function(after,count){if(!Number.isInteger(after)||!Number.isInteger(count)||count<0||after+count>50001)throw auroraSupabaseError_('database_range_limit',false);return sheet;},
    setFrozenRows:function(){return sheet;},setColumnWidths:function(){return sheet;}
  };
  return sheet;
}
function auroraSupabaseRange_(name,r,c,h,w) {
  if (![r,c,h,w].every(function(n){return Number.isInteger(n)&&n>0;}) || r+h-1>50001 || c+w-1>100 || h*w>5000000) throw auroraSupabaseError_('database_range_limit',false);
  var range={
    getRow:function(){return r;},
    getValues:function(){
      var table=auroraSupabaseTable_(name),result=[];
      for(var y=0;y<h;y++){var source=r+y===1?table.headers:table.grid[r+y]||[],row=[];
        for(var x=0;x<w;x++)row.push(source[c+x-1]===null||source[c+x-1]===undefined?'':source[c+x-1]);result.push(row);}
      return result;
    },
    setValues:function(values){
      var ctx=auroraSupabaseContext_(),table=auroraSupabaseTable_(name);
      if(ctx.commit || !Array.isArray(values)||values.length!==h || values.some(function(row){return !Array.isArray(row)||row.length!==w;}))throw auroraSupabaseError_('database_invalid_range_write',false);
      if(c+w-1>table.headers.length)throw auroraSupabaseError_('database_schema_is_owner_managed',false);
      // Setup may write unchanged headers, but cannot add/rename columns.
      if(r===1){if(h!==1||JSON.stringify(values[0])!==JSON.stringify(table.headers.slice(c-1,c+w-1)))throw auroraSupabaseError_('database_schema_is_owner_managed',false);return range;}
      var normalized=values.map(function(row){return row.map(auroraSupabaseCell_);});
      for(var y=0;y<h;y++){
        var at=r+y;
        if(at>table.last+1)throw auroraSupabaseError_('database_append_must_be_contiguous',false);
        var row=(table.grid[at]||[]).slice();while(row.length<table.headers.length)row.push('');
        for(var x=0;x<w;x++)row[c+x-1]=normalized[y][x];
        table.grid[at]=row;table.last=Math.max(table.last,at);
        ctx.dirty[JSON.stringify([name,at])]={table:name,row:at,cells:row.slice()};
      }
      return range;
    },
    createTextFinder:function(text){
      var exact=false;
      var finder={matchEntireCell:function(value){exact=value===true;return finder;},findNext:function(){
        var values=range.getValues();for(var y=0;y<h;y++)for(var x=0;x<w;x++){
          var cell=String(values[y][x]);if(exact?cell===String(text):cell.indexOf(String(text))>=0)return auroraSupabaseRange_(name,r+y,c+x,1,1);
        }return null;}};return finder;
    },
    activate:function(){var physical=auroraSupabasePhysicalBook_().getSheetByName(name);if(physical)physical.getRange(r,c,h,w).activate();return range;}
  };
  ['setFontWeight','setBackground','setFontColor','setWrap','setNumberFormat'].forEach(function(method){range[method]=function(){return range;};});
  return range;
}
/** Project ONLY a draft row into the physical owner editor. Never private users. */
function auroraSupabaseProjectCampaignDraft_(id) {
  if(!auroraSupabaseEnabled_())return;
  auroraCampaignOwner_(true);auroraSupabaseFlush_();
  var source=auroraSupabaseSheet_('email_campaigns'),headers=source.getRange(1,1,1,source.getLastColumn()).getValues()[0];
  var rows=source.getRange(2,1,Math.max(1,source.getLastRow()-1),headers.length).getValues();
  var found=rows.filter(function(row){return String(row[headers.indexOf('id')])===String(id);});
  if(found.length!==1||found[0][headers.indexOf('status')]!=='draft')throw auroraSupabaseError_('campaign_not_draft',false);
  var book=auroraSupabasePhysicalBook_(),sheet=book.getSheetByName('email_campaigns');
  if(!sheet)throw auroraSupabaseError_('campaign_editor_missing',false);
  var physical=sheet.getRange(1,1,Math.max(1,sheet.getLastRow()),sheet.getLastColumn()).getValues(),ph=physical[0],idCol=ph.indexOf('id');
  if(idCol<0)throw auroraSupabaseError_('campaign_editor_headers',false);
  var target=[];for(var i=1;i<physical.length;i++)if(String(physical[i][idCol])===String(id))target.push(i+1);
  if(target.length>1)throw auroraSupabaseError_('campaign_editor_duplicate',false);
  var at=target.length?target[0]:sheet.getLastRow()+1;
  sheet.getRange(at,1,1,ph.length).setValues([ph.map(function(key){var col=headers.indexOf(key);return col<0?'':auroraSheetCell_(found[0][col]);})]);
  book.setActiveSheet(sheet);sheet.getRange(at,Math.max(1,ph.indexOf('subject')+1)).activate();
}
/** Copy three editable draft fields, never status/counts/recipients, into DB. */
function auroraSupabaseImportSelectedCampaignDraft_() {
  if(!auroraSupabaseEnabled_())return;
  auroraCampaignOwner_(true);auroraSupabaseRefresh_();
  var book=auroraSupabasePhysicalBook_(),sheet=book.getActiveSheet(),selected=book.getActiveRange();
  if(!sheet||sheet.getName()!=='email_campaigns'||!selected||selected.getRow()<2)throw auroraSupabaseError_('campaign_select_draft',false);
  var headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0],cells=sheet.getRange(selected.getRow(),1,1,headers.length).getValues()[0];
  if(['id','subject','body','product_url'].some(function(key){return headers.indexOf(key)<0||headers.indexOf(key)!==headers.lastIndexOf(key);}))throw auroraSupabaseError_('campaign_editor_headers',false);
  var id=String(cells[headers.indexOf('id')]),table=auroraSupabaseSheet_('email_campaigns'),th=table.getRange(1,1,1,table.getLastColumn()).getValues()[0];
  var matches=[];for(var r=2;r<=table.getLastRow();r++){var row=table.getRange(r,1,1,th.length).getValues()[0];if(String(row[th.indexOf('id')])===id)matches.push({at:r,cells:row});}
  if(matches.length!==1||matches[0].cells[th.indexOf('status')]!=='draft')throw auroraSupabaseError_('campaign_not_draft',false);
  ['subject','body','product_url'].forEach(function(key){table.getRange(matches[0].at,th.indexOf(key)+1).setValues([[auroraSheetCell_(cells[headers.indexOf(key)])]]);});
  auroraSupabaseFlush_();return {id:id,row:matches[0].at};
}
/** Best-effort owner display projection. Supabase remains authoritative. */
function auroraSupabaseProjectCampaignState_() {
  if(!auroraSupabaseEnabled_())return;
  try{
    auroraSupabaseFlush_();var table=auroraSupabaseTable_('email_campaigns'),sheet=auroraSupabasePhysicalBook_().getSheetByName('email_campaigns');
    if(!sheet)return;
    var physical=sheet.getRange(1,1,Math.max(1,sheet.getLastRow()),sheet.getLastColumn()).getValues(),headers=physical[0],idIndex=headers.indexOf('id');
    if(idIndex<0)return;
    var stateFields=['status','recipient_count','sent_count','skipped_count','unknown_count','started_at','finished_at','next_attempt_at','last_error'];
    Object.keys(table.grid).forEach(function(key){var cells=table.grid[key],id=cells[table.headers.indexOf('id')],matches=[];
      for(var i=1;i<physical.length;i++)if(String(physical[i][idIndex])===String(id))matches.push(i+1);
      if(matches.length!==1)return;
      stateFields.forEach(function(field){var from=table.headers.indexOf(field),to=headers.indexOf(field);if(from>=0&&to>=0)sheet.getRange(matches[0],to+1).setValues([[auroraSheetCell_(cells[from])]]);});
    });
  }catch(_){console.warn('Campaign editor display could not refresh. Private database state remains authoritative.');}
}
