/**
 * Private finance operations. No public read route exposes these tables.
 * Credit = confirmed delivered COD receipts assigned to rider.
 * Debit = an explicitly recorded daily physical cash handover to the bakery.
 * Request IDs are idempotent and all debit writes are under one ScriptLock.
 */
function auroraFinanceSnapshot_(book) {
  var orders=auroraPrivateTable_(book,'orders').rows;
  var deposits=auroraPrivateTable_(book,'rider_cash_deposits').rows;
  var recipes=auroraPrivateTable_(book,'cake_cost_items').rows;
  var riders=Object.create(null);
  orders.forEach(function(row){
    var receipt;
    try{receipt=JSON.parse(String(row.receipt_json||''));}catch(_){return;}
    if(receipt.status!=='delivered'||receipt.payment_method!=='cod'||
       receipt.payment_status!=='paid'||receipt.cod_collected!==true||
       typeof receipt.rider_id!=='string'||!receipt.rider_id)return;
    var id=String(receipt.rider_id).trim().toLowerCase();
    if(!riders[id])riders[id]={rider_id:id,rider_name:String(receipt.rider_name||id).slice(0,100),
      collected:0,deposited:0,remaining:0,delivered_count:0};
    var amount=Number(receipt.cod_amount===undefined?receipt.total_amount:receipt.cod_amount);
    if(!isFinite(amount)||amount<0)return;
    riders[id].collected=Math.round((riders[id].collected+amount)*100)/100;
    riders[id].delivered_count++;
  });
  deposits.forEach(function(row){
    var id=String(row.rider_id||'').trim().toLowerCase(),amount=Number(row.amount);
    if(!id||!isFinite(amount)||amount<=0||row.voided_at||row.status==='pending')return;
    if(!riders[id])riders[id]={rider_id:id,rider_name:id,collected:0,deposited:0,remaining:0,delivered_count:0};
    riders[id].deposited=Math.round((riders[id].deposited+amount)*100)/100;
  });
  var balances=Object.keys(riders).map(function(id){
    var line=riders[id];
    line.remaining=Math.round((line.collected-line.deposited)*100)/100;
    return line;
  }).sort(function(a,b){return b.remaining-a.remaining;});
  var costs=recipes.filter(function(r){return r.active===true||String(r.active).toLowerCase()==='true';})
    .map(function(r){
      var quantity=Number(r.quantity),unitCost=Number(r.unit_cost);
      return {id:String(r.id),product_id:String(r.product_id),variant_id:String(r.variant_id),
        component:String(r.component),unit_label:String(r.unit_label||''),inventory_item_id:String(r.inventory_item_id||''),
        quantity:quantity,unit_cost:unitCost,total:Math.round(quantity*unitCost*100)/100};
    });
  var totals=Object.create(null);
  costs.forEach(function(r){var id=r.product_id+'::'+r.variant_id;
    totals[id]=Math.round(((totals[id]||0)+r.total)*100)/100;});
  var catalog=auroraRows_(book,'products').map(function(p){
    return {id:String(p.id),name:String(p.name||''),base_price:Number(p.base_price)||0,sale_price:p.sale_price===''?'':Number(p.sale_price)};
  });
  var variants=auroraRows_(book,'product_variants').map(function(v){
    return {id:String(v.id),product_id:String(v.product_id),name:String(v.name||''),
      price:Number(v.price)||0,sale_price:v.sale_price===''?'':Number(v.sale_price)};
  });
  return {ok:true,riders:balances,
    deposits:deposits.slice(-100).reverse().map(function(d){
      return {id:String(d.id),rider_id:String(d.rider_id),amount:Number(d.amount),
      date:String(d.date),actor_name:String(d.actor_name),created_at:String(d.created_at),notes:String(d.notes||''),
      voided_at:String(d.voided_at||''),voided_by:String(d.voided_by||''),void_reason:String(d.void_reason||''),status:String(d.status||'approved'),initiated_by_id:String(d.initiated_by_id||''),approved_by_id:String(d.approved_by_id||'')};
    }),costs:costs,cost_totals:totals,products:catalog,variants:variants};
}
function auroraFinancePost_(input){
  var actor=auroraStaffAuthenticate_(input);
  var action=String(input.action||'');
  auroraStaffRequire_(actor,'finance_view');
  if(action==='staff_finance_summary')return auroraFinanceSnapshot_(auroraSpreadsheet_());
  if(['staff_cash_deposit','staff_cash_deposit_approve','staff_cash_deposit_void','staff_cake_cost_save','staff_cake_cost_archive'].indexOf(action)<0)
    auroraReject_('invalid_action','Unknown finance operation.');
  auroraStaffRequire_(actor,'finance_edit');
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))auroraReject_('busy','Another financial update is being saved.');
  try{
    var book=auroraSpreadsheet_();
    if(action==='staff_cash_deposit_approve'){
      var pending=auroraPrivateTable_(book,'rider_cash_deposits');
      var idx=pending.rows.findIndex(function(d){return d.id===String(input.deposit_id);});
      if(idx<0)auroraReject_('not_found','Deposit not found.');
      var deposit=pending.rows[idx];
      var reviewer=String(actor.username||actor.email||'').toLowerCase();
      if(reviewer===String(deposit.initiated_by_id||'').toLowerCase())
        auroraReject_('independent_approval_required','A different staff member must approve cash settlement.');
      if(deposit.voided_at)auroraReject_('voided','Deposit was voided.');
      if(deposit.status==='approved')return {ok:true,already_approved:true,snapshot:auroraFinanceSnapshot_(book)};
      var balance=auroraFinanceSnapshot_(book).riders.filter(function(r){return r.rider_id===deposit.rider_id;})[0];
      if(!balance||Number(deposit.amount)>balance.remaining)
        auroraReject_('balance_exceeded','Rider has insufficient outstanding balance.');
      [['approved_by_id',reviewer],['approved_at',new Date().toISOString()],['status','approved']].forEach(function(kv){
        var col=pending.headers.indexOf(kv[0]);if(col<0)auroraReject_('upgrade_required','Run database setup.');
        pending.sheet.getRange(idx+2,col+1,1,1).setValues([[kv[1]]]);
      });
      return {ok:true,snapshot:auroraFinanceSnapshot_(book)};
    }
    if(action==='staff_cash_deposit_void'){
      var table=auroraPrivateTable_(book,'rider_cash_deposits');
      var depositId=String(input.deposit_id||'').trim(),reason=String(input.reason||'').trim();
      if(reason.length<8||reason.length>300)auroraReject_('invalid_reason','Enter a correction reason (8 to 300 characters).');
      var index=table.rows.findIndex(function(d){return String(d.id)===depositId;});
      if(index<0)auroraReject_('not_found','Cash deposit not found.');
      var deposit=table.rows[index];
      if(deposit.voided_at)
        return {ok:true,already_voided:true,snapshot:auroraFinanceSnapshot_(book)};
      ['voided_at','voided_by','void_reason'].forEach(function(field){
        if(table.headers.indexOf(field)<0)auroraReject_('upgrade_required','Run setupSheetDatabase() for cash adjustment columns.');
      });
      var updates={
        voided_at:new Date().toISOString(),voided_by:actor.name,void_reason:reason
      };
      Object.keys(updates).forEach(function(field){
        table.sheet.getRange(index+2,table.headers.indexOf(field)+1,1,1).setValues([[updates[field]]]);
      });
      return {ok:true,already_voided:false,snapshot:auroraFinanceSnapshot_(book)};
    }
    if(action==='staff_cash_deposit'){
      var requestId=String(input.request_id||'').trim().toLowerCase();
      if(!/^[a-f0-9-]{36}$/.test(requestId))auroraReject_('invalid_request','A stable deposit request ID is required.');
      var table=auroraPrivateTable_(book,'rider_cash_deposits');
      var duplicate=table.rows.filter(function(row){return String(row.request_id)===requestId;})[0];
      if(duplicate) {
        if(String(duplicate.rider_id)!==String(input.rider_id||'').trim().toLowerCase()||
           Number(duplicate.amount)!==Number(input.amount)||
           String(duplicate.date)!==String(input.date||'')||
           String(duplicate.notes||'')!==String(input.notes||'').trim())
          auroraReject_('idempotency_conflict','This deposit request ID was already used for different cash details.');
        return {ok:true,already_saved:true,deposit_id:String(duplicate.id),snapshot:auroraFinanceSnapshot_(book)};
      }
      var rider=String(input.rider_id||'').trim().toLowerCase();
      var amount=Number(input.amount);
      var date=String(input.date||'');
      var notes=String(input.notes||'').trim();
      if(!rider||rider.length>200||!/^\d{4}-\d{2}-\d{2}$/.test(date)||
         !isFinite(amount)||amount<=0||amount>10000000||Math.abs(Math.round(amount*100)-amount*100)>0.000001||
         notes.length>300)auroraReject_('invalid_deposit','Enter rider, deposit date and a valid cash amount.');
      var cash=auroraFinanceSnapshot_(book).riders.filter(function(x){return x.rider_id===rider;})[0];
      if(!cash||amount>cash.remaining+0.001)
        auroraReject_('balance_exceeded','Deposit cannot exceed the cash currently held by this rider.');
      var entry={id:'deposit_'+Utilities.getUuid(),request_id:requestId,rider_id:rider,
        amount:amount,date:date,actor_name:actor.name,created_at:new Date().toISOString(),notes:notes,status:'pending',initiated_by_id:String(actor.username||actor.email||'').toLowerCase()};
      auroraAppendPrivate_(table,entry);
      return {ok:true,already_saved:false,deposit_id:entry.id,snapshot:auroraFinanceSnapshot_(book)};
    }
    var costsTable=auroraPrivateTable_(book,'cake_cost_items');
    if(action==='staff_cake_cost_archive'){
      var archive=String(input.entry_id||'');
      var position=costsTable.rows.findIndex(function(x){return String(x.id)===archive;});
      if(position<0)auroraReject_('not_found','Cost item is not found.');
      var headerIndex=costsTable.headers.indexOf('active')+1;
      costsTable.sheet.getRange(position+2,headerIndex,1,1).setValues([[false]]);
      return {ok:true,snapshot:auroraFinanceSnapshot_(book)};
    }
    var costRequestId=String(input.request_id||'').trim().toLowerCase();
    if(!/^[a-f0-9-]{36}$/.test(costRequestId))
      auroraReject_('invalid_request','A stable recipe cost request ID is required.');
    var priorCost=costsTable.rows.filter(function(row){return String(row.request_id)===costRequestId;})[0];
    if(priorCost) {
      if(String(priorCost.product_id)!==String(input.product_id||'').trim()||
         String(priorCost.variant_id)!==String(input.variant_id||'').trim()||
         String(priorCost.component)!==String(input.component||'').trim()||
         Number(priorCost.quantity)!==Number(input.quantity)||
         Number(priorCost.unit_cost)!==Number(input.unit_cost)||
         String(priorCost.unit_label||'')!==String(input.unit_label||'').trim()||
         String(priorCost.inventory_item_id||'')!==String(input.inventory_item_id||'').trim())
        auroraReject_('idempotency_conflict','This recipe request ID belongs to different cost details.');
      return {ok:true,already_saved:true,snapshot:auroraFinanceSnapshot_(book)};
    }
    var productId=String(input.product_id||'').trim(),variantId=String(input.variant_id||'').trim();
    var component=String(input.component||'').trim(),unitLabel=String(input.unit_label||'').trim();
    var qty=Number(input.quantity),cost=Number(input.unit_cost);
    if(!productId||!variantId||!component||component.length>100||unitLabel.length>30||
       !isFinite(qty)||qty<=0||qty>100000||!isFinite(cost)||cost<0||cost>10000000)
      auroraReject_('invalid_cost','Select cake size, ingredient, quantity and unit cost.');
    var variants=auroraRows_(book,'product_variants');
    if(!variants.some(function(v){return String(v.id)===variantId&&String(v.product_id)===productId;}))
      auroraReject_('invalid_reference','Select a variant belonging to this product.');
    var stockItemId=String(input.inventory_item_id||'').trim();
    if(stockItemId){
      var item=auroraPrivateTable_(book,'inventory_items').rows.filter(function(r){return String(r.id)===stockItemId;})[0];
      if(!item||String(item.unit)!==unitLabel)auroraReject_('invalid_stock_mapping','Select a stock item with the same unit.');
    }
    var rec={id:'cost_'+Utilities.getUuid(),request_id:costRequestId,product_id:productId,variant_id:variantId,
      component:component,unit_label:unitLabel,quantity:qty,unit_cost:cost,inventory_item_id:stockItemId,active:true,
      updated_at:new Date().toISOString()};
    auroraAppendPrivate_(costsTable,rec);
    return {ok:true,snapshot:auroraFinanceSnapshot_(book)};
  }finally{lock.releaseLock();}
}
