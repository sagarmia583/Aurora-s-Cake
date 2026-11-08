import type {StaffOrder} from '../domain';
import {formatOrderNumber} from '../orderNumber';
import {richItems,type Catalog} from './model';
import {PRINT_FONT_CSS,PRINT_LOGO} from './printAssets';
import {createQrSvgPath,resolveFacebookUrl,resolvePublicWebUrl} from '../receiptQr';
export type PosOptions={paper:'80mm'|'58mm';template:'customer'|'kitchen'|'box';copies:1|2;font:'normal'|'large'};
export const DEFAULT_POS:PosOptions={paper:'80mm',template:'customer',copies:1,font:'normal'};
/** Inline the public Sheet logo for native print engines; a failed URL keeps the web fallback. */
export async function loadPrintLogo(url:string){
  if(!/^https?:\/\//.test(url))return PRINT_LOGO;
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),10000);
  try{
    const r=await fetch(url,{signal:abort.signal,credentials:'omit'}),mime=(r.headers.get('content-type')||'').split(';')[0];
    if(!r.ok||!['image/png','image/jpeg','image/webp'].includes(mime)||Number(r.headers.get('content-length')||0)>2_000_000)return PRINT_LOGO;
    const bytes=new Uint8Array(await r.arrayBuffer());if(bytes.length>2_000_000)return PRINT_LOGO;
    let encoded='';const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    for(let i=0;i<bytes.length;i+=3){const a=bytes[i],b=bytes[i+1],c=bytes[i+2];encoded+=chars[a>>2]+chars[((a&3)<<4)|((b||0)>>4)]+(i+1<bytes.length?chars[((b&15)<<2)|((c||0)>>6)]:'=')+(i+2<bytes.length?chars[c&63]:'=');}
    return 'data:'+mime+';base64,'+encoded;
  }catch{return PRINT_LOGO;}finally{clearTimeout(timer);}
}
export function validPosOptions(value:unknown):value is PosOptions{const v=value as PosOptions;return !!v&&['80mm','58mm'].includes(v.paper)&&['customer','kitchen','box'].includes(v.template)&&[1,2].includes(v.copies)&&['normal','large'].includes(v.font);}
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const price=(v:unknown)=>'৳'+Number(v||0).toLocaleString('en-BD',{maximumFractionDigits:2});
function receiptQr(url:string,label:string) {
  const {size,path}=createQrSvgPath(url);
  return `<a class="contact-link" href="${esc(url)}" rel="noreferrer"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="${label} QR code"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg><b>${label}</b></a>`;
}
export function receiptHtml(order:StaffOrder,c:Catalog,options:PosOptions=DEFAULT_POS,logo=PRINT_LOGO,demo=false){
  const size=options.paper==='58mm'?58:80,kitchen=options.template==='kitchen';
  const data=order as StaffOrder&{subtotal?:number;discount_amount?:number;coupon_code?:string};
  const brand=/^(data:image\/(png|jpeg|webp);base64,|https:\/\/)/.test(logo)?logo:PRINT_LOGO;
  const title=kitchen?'KITCHEN TICKET':options.template==='box'?'BOX LABEL':'CASH MEMO';
  const links=kitchen?'':`<div class="contact-qr"><strong>SCAN TO CONNECT</strong><div>${receiptQr(resolvePublicWebUrl(String(c.settings.website_url||'')),'Website')}${receiptQr(resolveFacebookUrl(String(c.settings.facebook_url||'')),'Facebook')}</div></div>`;
  const lines=richItems(order).map(i=>`<section><div class="row"><strong>${esc(i.quantity)} × ${esc(i.product_name)}</strong>${kitchen?'':'<b class="amount">'+price(i.subtotal)+'</b>'}</div><div>${esc([i.variant_name,i.flavor_name].filter(Boolean).join(' · '))}</div>${(Array.isArray(i.addons)?i.addons:[]).map((a:any)=>'<div>+ '+esc(a.addon_name||a.name)+' × '+esc(a.quantity||1)+'</div>').join('')}${i.free_gift_items?.length?'<div>Complimentary: '+esc(i.free_gift_items.join(', '))+'</div>':''}${i.writing_message?'<p class="writing"><b>Cake message:</b><br>'+esc(i.writing_message)+'</p>':''}</section>`).join('');
  const one=(copy:number)=>`<article><header>${demo?'<b>DEMO · SAMPLE RECEIPT</b><br>':''}<img class="logo" src="${esc(brand)}" alt="Shop logo"><h1>${esc(c.settings.shop_name||'Aurora’s Cake')}</h1><div>${esc(c.settings.address)}</div><div>${esc(c.settings.phone)}</div><b>${title}</b></header><section><div class="row"><strong class="number">#${formatOrderNumber(order.order_number)}</strong><span>${esc(order.delivery_date)}</span></div><div>${esc(order.delivery_slot)}</div>${kitchen?'':'<p><b>'+esc(order.customer_name)+'</b><br>'+esc(order.customer_phone)+'<br>'+esc(order.delivery_address)+'</p>'}</section>${lines}${kitchen?'':`<section>${[['Subtotal',data.subtotal??(order.items?.length?richItems(order).reduce((sum,i)=>sum+Number(i.subtotal||0),0):undefined)],['Discount',data.discount_amount===undefined?undefined:-data.discount_amount],['Delivery',order.delivery_fee]].filter(([,v])=>v!==undefined).map(([label,v])=>'<div class="row"><span>'+label+'</span><span class="amount">'+(Number(v)<0?'−':'')+price(Math.abs(Number(v||0)))+'</span></div>').join('')}<div class="row total"><strong>Total</strong><strong class="amount">${price(order.total_amount)}</strong></div>${data.coupon_code?'<p>Offer: '+esc(data.coupon_code)+'</p>':''}<div>${esc(String(order.payment_method||'COD').toUpperCase())} · ${esc(order.payment_status||'pending')}</div></section>`}${order.order_note?'<section>'+esc(order.order_note)+'</section>':''}<footer>${options.copies===2?(copy===0?'Customer copy':'Shop copy'):'Thank you'}<br>${esc(new Date(order.created_at).toLocaleString('en-GB',{timeZone:'Asia/Dhaka'}))}${links}</footer></article>`;
  return `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><style>${PRINT_FONT_CSS}*{box-sizing:border-box}html,body{margin:0;padding:0;color:#000;background:white;font-family:Roboto,"Noto Sans Bengali",sans-serif;font-size:${options.font==='large'?15:12}px;line-height:1.55}main{width:calc(100% - 8mm);max-width:${size-4}mm;margin:0 auto;padding:3mm 0}article{width:100%;min-width:0;overflow-wrap:anywhere;word-break:normal}header,footer{text-align:center}h1{font-size:19px;line-height:1.3;margin:5px 0}.logo{width:64px;height:64px;object-fit:contain}.number{font-size:27px;letter-spacing:2px}section{padding:9px 0;border-bottom:1px dashed #555}.row{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}.row>*{min-width:0;overflow-wrap:anywhere}.row>:first-child{flex:1}.amount{flex-shrink:0;white-space:nowrap}.writing{white-space:pre-wrap;border:1px solid #aaa;padding:7px}.total{font-size:18px;border-top:1px solid #000;margin-top:8px;padding-top:8px}p{margin:7px 0;white-space:pre-wrap}footer{font-size:10px;padding:10px 0}.contact-qr{margin-top:2mm;padding-top:2mm;border-top:1px dashed #555;break-inside:avoid}.contact-qr>div{display:flex;justify-content:center;gap:3mm}.contact-link{display:block;width:24mm;min-width:0;color:#000;text-decoration:none}.contact-link svg{display:block;width:100%;height:auto;background:#fff}article+article{margin-top:10mm;border-top:1px dashed #000;padding-top:5mm}@media print{@page{size:auto;margin:0}html,body{width:${size}mm;max-width:${size}mm}main{width:${size-4}mm;max-width:${size-4}mm;margin:0 2mm;padding:2mm 0}section{break-inside:avoid}article+article{break-before:page}}</style></head><body><main>${Array.from({length:options.copies},(_,i)=>one(i)).join('')}</main></body></html>`;
}
