/** Private inventory and return journal. All writes use the shop ScriptLock. */
function auroraInventoryState_(book){
  var items=auroraPrivateTable_(book,'inventory_items').rows;
  var moves=auroraPrivateTable_(book,'inventory_movements').rows;
  var stock=items.map(function(i){return {id:String(i.id),name:String(i.name),unit:String(i.unit),
    reorder_level:Number(i.reorder_level)||0,balance:0};});
  moves.forEach(function(m){var a=stock.filter(function(x){return x.id===String(m.item_id);})[0];
    if(a)a.balance=Math.round((a.balance+Number(m.delta||0))*1000)/1000;});
  var refunds=auroraPrivateTable_(book,'refund_returns').rows;
  var costs=auroraPrivateTable_(book,'order_cost_snapshots').rows;
  return {ok:true,stock:stock,refunds:refunds.slice(-100).reverse(),
    cost_snapshots:costs.slice(-100).reverse(),movements:moves.slice(-100).reverse()};
}
function auroraInventoryRequest_(x){
  var id=String(x||'').trim();
  if(!/^[a-f0-9-]{36}$/i.test(id))auroraReject_('invalid_request','Use a stable request ID.');
  return id;
}
function auroraInventoryPost_(input){
  var actor=auroraStaffAuthenticate_(input),action=String(input.action||'');
  auroraStaffRequire_(actor,'finance_view');
  if(action==='staff_inventory_summary')return auroraInventoryState_(auroraSpreadsheet_());
  auroraStaffRequire_(actor,'finance_edit');
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))auroraReject_('busy','Another stock entry is being saved.');
  try{
    var book=auroraSpreadsheet_(),who=String(actor.username||actor.email||actor.name);
    if(action==='staff_stock_item_create'){
      var name=String(input.name||'').trim(),unit=String(input.unit||'').trim().toLowerCase();
      if(name.length<2||name.length>100||['g','kg','ml','l','pcs'].indexOf(unit)<0)
        auroraReject_('invalid_item','Enter item name and a valid stock unit.');
      var table=auroraPrivateTable_(book,'inventory_items');
      if(table.rows.some(function(i){return String(i.name).toLowerCase()===name.toLowerCase()&&i.unit===unit;}))
        auroraReject_('duplicate_item','Stock item already exists.');
      auroraAppendPrivate_(table,{id:'stock_'+Utilities.getUuid(),name:name,unit:unit,
        reorder_level:Number(input.reorder_level)||0,created_at:new Date().toISOString()});
      return auroraInventoryState_(book);
    }
    if(action==='staff_stock_adjust'){
      var key=auroraInventoryRequest_(input.request_id),table=auroraPrivateTable_(book,'inventory_movements');
      var prior=table.rows.filter(function(m){return m.request_id===key;})[0];
      if(prior)return {ok:true,already_saved:true,state:auroraInventoryState_(book)};
      var stock=auroraInventoryState_(book).stock.filter(function(i){return i.id===input.item_id;})[0];
      var delta=Number(input.delta),reason=String(input.reason||'').trim();
      if(!stock||!isFinite(delta)||delta===0||Math.abs(delta)>1000000||reason.length<5||
        stock.balance+delta < -0.000001)auroraReject_('invalid_stock','Check stock quantity, balance and reason.');
      auroraAppendPrivate_(table,{id:'move_'+Utilities.getUuid(),request_id:key,item_id:stock.id,
        delta:delta,unit_cost:Math.max(0,Number(input.unit_cost)||0),reason:reason,
        order_id:'',actor:who,created_at:new Date().toISOString()});
      return auroraInventoryState_(book);
    }
    if(action==='staff_refund_request'){
      var key=auroraInventoryRequest_(input.request_id),table=auroraPrivateTable_(book,'refund_returns');
      var prior=table.rows.filter(function(r){return r.request_id===key;})[0];
      if(prior)return {ok:true,already_saved:true,state:auroraInventoryState_(book)};
      var orders=auroraPrivateTable_(book,'orders').rows;
      var receiptRow=orders.filter(function(o){return o.id===input.order_id;})[0];
      if(!receiptRow)auroraReject_('not_found','Order not found.');
      var original=JSON.parse(String(receiptRow.receipt_json||'{}'));
      var amount=Number(input.amount),reason=String(input.reason||'').trim();
      if(original.payment_status!=='paid'||original.status!=='delivered'||!isFinite(amount)||
         amount<=0||reason.length<8)auroraReject_('invalid_refund','Refund requires a paid order, amount and reason.');
      var outstanding=table.rows.filter(function(r){return r.order_id===input.order_id&&r.status!=='rejected';})
        .reduce(function(n,r){return n+Number(r.amount||0);},0);
      if(amount+outstanding>Number(original.total_amount)+0.001)
        auroraReject_('refund_exceeded','Refund exceeds the order payment.');
      auroraAppendPrivate_(table,{id:'refund_'+Utilities.getUuid(),request_id:key,
        order_id:String(input.order_id),kind:input.kind==='return'?'return':'refund',
        amount:amount,reason:reason,status:'requested',created_by:who,
        created_at:new Date().toISOString(),approved_by:'',approved_at:'',settled_at:''});
      return auroraInventoryState_(book);
    }
    if(action==='staff_refund_approve'){
      var table=auroraPrivateTable_(book,'refund_returns');
      var idx=table.rows.findIndex(function(r){return r.id===input.refund_id;});
      if(idx<0)auroraReject_('not_found','Refund not found.');
      var r=table.rows[idx];
      if(r.status==='approved')return {ok:true,already_approved:true,state:auroraInventoryState_(book)};
      if(r.status!=='requested'||r.created_by===who)
        auroraReject_('independent_approval_required','A different staff member must approve an open refund.');
      [['status','approved'],['approved_by',who],['approved_at',new Date().toISOString()]].forEach(function(v){
        table.sheet.getRange(idx+2,table.headers.indexOf(v[0])+1,1,1).setValues([[v[1]]]);
      });
      return auroraInventoryState_(book);
    }
    auroraReject_('invalid_action','Unknown inventory/refund action.');
  }finally{lock.releaseLock();}
}
