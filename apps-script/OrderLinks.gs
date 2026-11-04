/** Customer view links use a separate, revocable bearer key, never a phone-only lookup. */
var AURORA_RECEIPT_VIEW_BASE_='https://script.google.com/macros/s/AKfycbw38J4AzlYkAhNtyDAp_CP34fUk9Epae6xz46AQFbF9ye1VsZjxTXmzbJgs52WEoWETMw/exec';
var AURORA_RECEIPT_LINK_LIFETIME_MS_=30*24*60*60*1000;
function auroraReceiptLinkActive_(order){
  var issued=Date.parse(String(order.customer_share_created_at||''));
  return !!order.customer_share_token&&Number.isFinite(issued)&&Date.now()-issued<AURORA_RECEIPT_LINK_LIFETIME_MS_;
}
function auroraReceiptViewUrl_(order){
  return AURORA_RECEIPT_VIEW_BASE_+'?action=receipt&ref='+encodeURIComponent(order.id)+'&access='+encodeURIComponent(order.customer_share_token);
}
function auroraStaffOrderLink_(input){
  var actor=auroraStaffAuthenticate_(input);
  if(['super_admin','admin','order_manager','delivery_manager'].indexOf(actor.role)===-1)auroraReject_('forbidden','This staff role cannot issue customer view links.');
  var id=auroraOrderText_(input.order_id,'Order reference',10,150),lock=LockService.getScriptLock();
  if(!/^ord_[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id))auroraReject_('not_found','Order not found.');
  if(!lock.tryLock(10000))auroraReject_('busy','Another order update is being saved.');
  try{
    var table=auroraFastOrderTable_(auroraSpreadsheet_()),row=auroraPrivateFindRow_(table,id);
    if(!row)auroraReject_('not_found','Order not found.');
    var order=auroraFastReceipt_(table,row);
    if(order.id!==id)auroraReject_('not_found','Order not found.');
    if(input.revoke===true){
      delete order.customer_share_token;
      delete order.customer_share_created_at;
      auroraPrivateSaveReceipt_(table,row,order);
      return {ok:true,order_id:order.id,revoked:true};
    }
    if(!auroraReceiptLinkActive_(order)||input.regenerate===true){
      order.customer_share_token=auroraNewCustomerCapability_();
      order.customer_share_created_at=new Date().toISOString();
      auroraPrivateSaveReceipt_(table,row,order);
    }
    return {ok:true,order_id:order.id,share_url:auroraReceiptViewUrl_(order)};
  }finally{lock.releaseLock();}
}
function auroraStaffShareSafe_(order,actor){
  if(auroraReceiptLinkActive_(order)&&['super_admin','admin','order_manager','delivery_manager'].indexOf(actor.role)!==-1)
    order.customer_share_url=auroraReceiptViewUrl_(order);
  else delete order.customer_share_url;
  delete order.customer_share_token;delete order.customer_share_created_at;
  return order;
}
function auroraCustomerSharedOrder_(input){
  var id=String(input.order_id||''),key=String(input.share_token||'');
  function invalid(){auroraReject_('forbidden','This private order link is invalid or unavailable.');}
  if(!/^ord_[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id)||!/^[0-9a-f-]{72}$/i.test(key))invalid();
  var book=auroraSpreadsheet_(),table=auroraFastOrderTable_(book),row=auroraPrivateFindRow_(table,id);
  if(!row)invalid();var order=auroraFastReceipt_(table,row);
  if(order.id!==id||!auroraReceiptLinkActive_(order)||String(order.customer_share_token)!==key)invalid();
  var safe={persistence:'google_sheets',delivery_otp:''};
  ['id','order_number','customer_name','customer_phone','is_gift','recipient_name','recipient_phone','sender_name','sender_phone','hide_price_on_box','gift_card_message','delivery_address','delivery_zone','delivery_date','delivery_slot','status','subtotal','discount_amount','delivery_fee','total_amount','coupon_code','order_note','payment_method','payment_status','cod_amount','cod_collected','rider_name','created_at','updated_at'].forEach(function(field){safe[field]=order[field];});
  safe.order_number=auroraFormatOrderNumber_(order.order_number);
  safe.items=(order.items||[]).map(function(item){var result={};['id','order_id','product_id','product_name','variant_name','flavor_id','flavor_name','writing_message','unit_price','quantity','subtotal'].forEach(function(field){result[field]=item[field];});
    result.addons=(item.addons||[]).map(function(addon){var value={};['addon_id','addon_name','unit_price','quantity','subtotal'].forEach(function(field){value[field]=addon[field];});return value;});return result;});
  safe.history=(order.history||[]).map(function(h){return {id:h.id,status:h.status,created_at:h.created_at,notes:''};});
  var settings=auroraPairs_(auroraRows_(book,'settings'),PUBLIC_SETTINGS_KEYS),shop={};
  ['shop_name','logo_url','phone','address','currency','facebook_url'].forEach(function(field){shop[field]=settings[field]||'';});
  return {ok:true,order:safe,shop:shop};
}
/** Public HtmlService RPC; the private bearer key is still checked before any order read. */
function customerSharedOrder(input){
  try{if(typeof auroraSupabaseBegin_==='function')auroraSupabaseBegin_();return auroraCustomerSharedOrder_(input||{});}
  catch(_){return {ok:false,error:'এই private order link পাওয়া যায়নি। দোকান থেকে নতুন link নিন।'};}
  finally{if(typeof auroraSupabaseDiscard_==='function')auroraSupabaseDiscard_();}
}
function auroraReceiptHtml_(params){
  var proof={order_id:String(params.ref||''),share_token:String(params.access||'')};
  if(!/^ord_[0-9a-f-]{36}$/i.test(proof.order_id)||!/^[0-9a-f-]{72}$/i.test(proof.share_token))proof={order_id:'',share_token:''};
  var fallbackLogo=typeof auroraSharedLogo_==='function'?auroraSharedLogo_():'';
  var css=typeof auroraSharedFontCss_==='function'?auroraSharedFontCss_():'';
  return HtmlService.createHtmlOutput('<!doctype html><html lang="bn"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow"><style>'+css+
    'body{margin:0;background:#fcf8f3;color:#292333;font-family:Roboto,"Noto Sans Bengali",sans-serif;font-size:15px;line-height:1.65}main{max-width:650px;margin:auto;padding:28px 18px}header{display:flex;align-items:center;gap:14px;margin-bottom:24px}.mark{background:#f8dfca;border-radius:17px;padding:8px 18px;color:#803c55;font-size:30px;font-weight:800}.card{background:white;border:1px solid #eae4e0;border-radius:22px;padding:22px;margin:16px 0}.hero{background:#35283e;color:white}.eyebrow{font-size:11px;letter-spacing:2px;font-weight:700;color:#d9bdca}h1{font-size:30px;line-height:1.4;margin:10px 0}h2{font-size:20px;margin:0 0 12px}.row{display:flex;justify-content:space-between;gap:16px;padding:7px 0}.muted{color:#716978;font-size:13px}.writing{background:#f8dfca;border-radius:12px;padding:12px;margin:12px 0}.divider{border-top:1px dashed #eae4e0;margin:14px 0}.button{display:inline-block;background:#803c55;color:white;text-decoration:none;border:0;border-radius:14px;padding:13px 20px;font:inherit;cursor:pointer}.notice{background:#e5efe5;padding:13px;border-radius:13px}.error{color:#a13541}.total{font-size:24px;font-weight:700}.step{display:inline-block;border-radius:9px;background:#f3e4ea;padding:5px 10px;margin:4px;font-size:12px}small{font-size:12px}</style></head><body><main><header><img id="brand-logo" alt="Aurora’s Cake logo" style="width:60px;height:60px;object-fit:contain;border-radius:14px" src="'+fallbackLogo+'"><div><strong id="shop">Aurora’s Cake</strong><div class="muted">আপনার private order details</div></div></header><div id="error" class="error"></div><div id="content"><div class="card">Order details লোড হচ্ছে…</div></div><button class="button" onclick="load()">Refresh details</button><p class="muted">এই link যাঁর কাছে থাকবে, তিনি order-এর তথ্য দেখতে পারবেন। শুধু customer-এর সঙ্গে share করুন।</p></main><script>'+

    '('+auroraReceiptClient_.toString()+')('+JSON.stringify(proof)+');</script></body></html>').setTitle('Your order · Aurora’s Cake');
}
function auroraReceiptClient_(proof){
  const labels={pending:'অর্ডার পেয়েছি',confirmed:'অর্ডার কনফার্ম হয়েছে',preparing:'আপনার কেক তৈরি হচ্ছে',ready:'কেক প্রস্তুত',assigned:'Rider নির্ধারিত',picked_up:'Rider কেক বুঝে পেয়েছেন',out_for_delivery:'কেক আপনার পথে',delivered:'যত্ন পৌঁছে গেছে',cancelled:'Order cancelled'};
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>'৳'+Number(v||0).toLocaleString('en-BD',{maximumFractionDigits:2});
  function render(d){
    if(!d||!d.ok){document.getElementById('error').textContent=d&&d.error||'Order details পাওয়া যায়নি।';document.getElementById('content').textContent='';return;}
    const o=d.order,s=d.shop||{};
    document.getElementById('shop').textContent=s.shop_name||'Aurora’s Cake';document.getElementById('error').textContent='';
    const mark=document.getElementById('brand-logo');let logo=s.logo_url||'';try{const u=new URL(logo);if(u.hostname==='drive.google.com'){const id=(u.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)/)||[])[1]||u.searchParams.get('id');if(id&&/^[A-Za-z0-9_-]+$/.test(id))logo='https://drive.google.com/thumbnail?id='+encodeURIComponent(id)+'&sz=w1600';}}catch(_){}
    if(mark&&/^https:\/\//.test(logo)&&mark.dataset.source!==logo){const fallback=mark.src;mark.dataset.source=logo;mark.onerror=()=>{mark.onerror=null;mark.src=fallback;};mark.src=logo;}
    let html=`<section class="card hero"><div class="eyebrow">${esc(o.order_number)}</div><h1>${esc(labels[o.status]||o.status)}</h1><div>${esc(o.delivery_date)} · ${esc(o.delivery_slot)}</div></section>`;
    html+='<section class="card"><h2>আপনার কেকের বাক্স</h2>'+(o.items||[]).map(i=>`<div class="row"><strong>${esc(i.quantity)} × ${esc(i.product_name)}</strong><b>${money(i.subtotal)}</b></div><div class="muted">${esc([i.variant_name,i.flavor_name].filter(Boolean).join(' · '))}</div>${i.writing_message?'<div class="writing">কেকের লেখা: <strong>'+esc(i.writing_message)+'</strong></div>':''}${(i.addons||[]).map(a=>'<small>+ '+esc(a.addon_name)+' × '+esc(a.quantity)+'</small><br>').join('')}<div class="divider"></div>`).join('')+'</section>';
    html+=`<section class="card"><h2>Delivery details</h2><strong>${esc(o.customer_name)}</strong><p>${esc(o.customer_phone)}<br>${esc(o.delivery_address)}</p><div class="muted">${esc(o.delivery_zone&&o.delivery_zone.name)} · ${esc(o.rider_name)}</div>${o.order_note?'<div class="writing">'+esc(o.order_note)+'</div>':''}</section>`;
    html+='<section class="card"><h2>আপনার হিসাব</h2>'+[['কেক',o.subtotal],['Discount',-o.discount_amount],['Delivery',o.delivery_fee]].map(a=>`<div class="row"><span>${a[0]}</span><b>${a[1]<0?'−':''}${money(Math.abs(a[1]))}</b></div>`).join('')+`<div class="divider"></div><div class="row"><strong>মোট</strong><span class="total">${money(o.total_amount)}</span></div><div class="muted">${esc(String(o.payment_method||'COD').toUpperCase())} · ${esc(o.payment_status)}</div>${o.coupon_code?'<p>Offer: '+esc(o.coupon_code)+'</p>':''}</section>`;
    html+='<section class="card"><h2>Order journey</h2>'+(o.history||[]).map(h=>`<div class="row"><span>${esc(labels[h.status]||h.status)}</span><small>${esc(new Date(h.created_at).toLocaleString('en-BD',{timeZone:'Asia/Dhaka'}))}</small></div>`).join('')+'</section><div class="notice">কেক বুঝে নিয়ে প্রযোজ্য COD পরিশোধ করুন।</div>';
    if(/^https:\/\/(www\.)?facebook\.com\//i.test(s.facebook_url||''))html+='<p><a class="button" href="'+esc(s.facebook_url)+'" target="_blank" rel="noopener noreferrer">Facebook page ↗</a></p>';
    document.getElementById('content').innerHTML=html;
  }
  let busy=false;
  function load(){if(busy)return;busy=true;google.script.run.withSuccessHandler(d=>{busy=false;render(d)}).withFailureHandler(()=>{busy=false;document.getElementById('error').textContent='সংযোগ হয়নি। Refresh করে আবার দেখুন।'}).customerSharedOrder(proof);}
  document.querySelector('button').onclick=load;
  load();setInterval(()=>{if(document.visibilityState==='visible')load()},20000);
}
