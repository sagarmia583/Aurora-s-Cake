/**
 * Optional FREE Google customer accounts; no SMS gateway and no email-sending API.
 * Guest COD remains possible. A customer holding an original confirmed receipt
 * can link it once to their verified Google identity and recover it later.
 *
 * Uses same AURORA_GOOGLE_CLIENT_ID Script Property as staff.
 * Requires Code.gs and StaffOperations.gs (private receipt save helper).
 */
function auroraCustomerIdentity_(input) {
  var token = input && input.id_token;
  if (typeof token !== 'string' || token.length < 100 || token.length > 6000 ||
      !/^[a-zA-Z0-9_.-]+$/.test(token)) {
    auroraReject_('unauthorized','Sign in with your Google account to recover linked orders.');
  }
  var clientId = String(PropertiesService.getScriptProperties().getProperty('AURORA_GOOGLE_CLIENT_ID') || '').trim();
  if (!clientId) auroraReject_('account_not_configured','Customer Google sign-in is not configured.');
  var claims;
  try {
    var response = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), {
      method:'get', muteHttpExceptions:true, followRedirects:false
    });
    if (response.getResponseCode() !== 200) auroraReject_('unauthorized','Your Google sign-in is invalid or expired.');
    claims = JSON.parse(response.getContentText());
  } catch (error) {
    if (error && error.auroraValidation) throw error;
    auroraReject_('unauthorized','Unable to verify your Google sign-in.');
  }
  if (claims.aud !== clientId ||
      ['accounts.google.com','https://accounts.google.com'].indexOf(claims.iss) === -1 ||
      !(claims.email_verified === true || claims.email_verified === 'true') ||
      typeof claims.sub !== 'string' || !claims.sub ||
      !Number.isFinite(Number(claims.exp)) || Number(claims.exp)*1000 <= Date.now()) {
    auroraReject_('unauthorized','Your Google identity could not be verified.');
  }
  return {sub:claims.sub,email:String(claims.email || '').toLowerCase(),name:String(claims.name||claims.email||'Customer').slice(0,100)};
}
function auroraCustomerSafeReceipt_(order) {
  var copy=JSON.parse(JSON.stringify(order));
  delete copy.customer_google_sub;
  delete copy.otp_failed_attempts;
  delete copy.otp_locked_until;
  // The rider OTP is only useful when the customer has received the cake.
  if (copy.status !== 'out_for_delivery') copy.delivery_otp='';
  return copy;
}
function auroraCustomerAccountsPost_(input) {
  var identity=auroraCustomerIdentity_(input);
  if (input.action === 'customer_session') {
    return {ok:true,email:identity.email,name:identity.name};
  }
  if (input.action === 'customer_orders') {
    var table=auroraPrivateTable_(auroraSpreadsheet_(),'orders');
    var results=[];
    table.rows.forEach(function(row) {
      var order;
      try {order=JSON.parse(String(row.receipt_json || ''));} catch (_) {return;}
      if (!order || String(order.customer_google_sub||'') !== identity.sub) return;
      results.push(auroraCustomerSafeReceipt_(order));
    });
    results.sort(function(a,b){return String(b.created_at||'').localeCompare(String(a.created_at||''));});
    return {ok:true,orders:results.slice(0,50)};
  }
  if (input.action === 'customer_claim_order') {
    var orderId=auroraOrderText_(input.order_id,'Order reference',10,150);
    if (!/^ord_[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(orderId)) auroraReject_('not_found','No matching order receipt.');
    var phone=auroraOrderText_(input.customer_phone,'Checkout phone number',7,30).replace(/\D/g,'');
    var lock=LockService.getScriptLock();
    if (!lock.tryLock(10000)) auroraReject_('busy','Please retry linking your receipt.');
    try {
      var table=auroraPrivateTable_(auroraSpreadsheet_(),'orders');
      var rowNumber=auroraPrivateFindRow_(table,orderId);
      var record=table.rows.filter(function(row){return String(row.id)===orderId;})[0];
      if (!rowNumber || !record ||
          String(record.customer_phone||'').replace(/\D/g,'')!==phone) {
        auroraReject_('not_found','No matching order receipt and checkout phone.');
      }
      var order=JSON.parse(String(record.receipt_json));
      if (order.customer_google_sub && order.customer_google_sub!==identity.sub) {
        auroraReject_('already_linked','This order is linked to a different Google account. Contact the bakery with proof of purchase.');
      }
      if (!order.customer_google_sub) {
        order.customer_google_sub=identity.sub;
        order.updated_at=new Date().toISOString();
        auroraPrivateSaveReceipt_(table,rowNumber,order);
      }
      return {ok:true,linked:true,order_id:orderId};
    } finally {lock.releaseLock();}
  }
  auroraReject_('invalid_action','Unsupported customer account action.');
}