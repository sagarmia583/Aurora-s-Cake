import fs from 'node:fs';
import vm from 'node:vm';
/** Development server only. Renders the actual Apps Script receipt template with sample data. */
export function orderReceiptPreview(){return {name:'aurora-order-receipt-preview',configureServer(server){server.middlewares.use((req,res,next)=>{
  const url=new URL(req.url||'/','http://localhost');if(url.searchParams.get('order-preview')!=='1')return next();
  const context={HtmlService:{createHtmlOutput:html=>({html,setTitle(){return this}})}};vm.createContext(context);
  for(const file of ['ShareFonts.gs','OrderLinks.gs','OrderNumbers.gs'])vm.runInContext(fs.readFileSync(new URL('../apps-script/'+file,import.meta.url),'utf8'),context);
  let html=context.auroraReceiptHtml_({}).html;
  const sample={ok:true,shop:{shop_name:'Aurora’s Cake'},order:{order_number:'2603',customer_name:'Sample customer',customer_phone:'01XXX XXXXXX',delivery_address:'Sample address · Mirpur, Dhaka',delivery_zone:{name:'Mirpur'},delivery_date:'2026-11-03',delivery_slot:'4 PM – 6 PM',status:'out_for_delivery',items:[{product_name:'Celebration chocolate cake',variant_name:'1 kg',flavor_name:'Chocolate',quantity:1,unit_price:1200,subtotal:1250,writing_message:'Happy Birthday, Ma!',addons:[{addon_name:'Birthday candle',quantity:1,subtotal:50}]}],subtotal:1250,discount_amount:100,delivery_fee:80,total_amount:1230,coupon_code:'SWEET100',payment_method:'cod',payment_status:'unpaid',order_note:'পৌঁছানোর আগে ফোন করবেন',history:[{status:'pending',created_at:'2026-11-01T10:00:00Z'},{status:'confirmed',created_at:'2026-11-01T10:05:00Z'},{status:'preparing',created_at:'2026-11-01T10:30:00Z'},{status:'out_for_delivery',created_at:'2026-11-01T12:00:00Z'}]}};
  html=html.replace(/google\.script\.run\.withSuccessHandler\(d=>\{busy=false;render\(d\)\}\)\.withFailureHandler\(\(\)=>\{[\s\S]*?\}\)\.customerSharedOrder\(proof\)/, 'render('+JSON.stringify(sample)+');busy=false');
  html=html.replace('<body>','<body><div style="background:#f8dfca;padding:12px;text-align:center;font-weight:700">LOCAL DESIGN PREVIEW · Sample data · No live order</div>');
  res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(html);
});}};}
