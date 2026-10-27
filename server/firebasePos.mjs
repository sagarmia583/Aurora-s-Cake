import {createHash} from 'node:crypto';
import {has,requirePermission,numberMoney} from './firebaseAccess.mjs';
const bad=(code,message)=>{throw Object.assign(new Error(message),{code,httpStatus:400});};
const str=(value,max=100)=>String(value??'').trim().slice(0,max);
const enabled=(value)=>value===true||value==='true';
export async function posCatalog(db,actor,{history=false}={}){
  requirePermission(actor,history?'sales_history':'sales_view');
  const [products,variants,settings]=await Promise.all([
    db.collection('products').limit(400).get(),
    db.collection('product_variants').limit(1000).get(),
    db.collection('settings').doc('shop').get()
  ]);
  const productMap=new Map(products.docs.filter(x=>enabled(x.data().is_active)).map(x=>[x.id,x.data()]));
  const rows=variants.docs.flatMap(doc=>{
    const v=doc.data(),p=productMap.get(String(v.product_id));
    if(!p||!enabled(v.is_active))return [];
    const price=(v.sale_price!==undefined&&v.sale_price!==null&&v.sale_price!=='')?Number(v.sale_price):Number(v.price);
    if(!Number.isFinite(price)||price<0)return [];
    return [{product_id:String(v.product_id),variant_id:doc.id,
      product_name:String(p.name||''),variant_name:String(v.name||''),price}];
  });
  const shopData=settings.data()||{};
  const shop={name:str(shopData.shop_name||"Aurora's Cake",120),phone:str(shopData.phone||'',80),
    address:str(shopData.address||'',180)};
  const response={ok:true,shop,products:rows};
  if(history){
    const sales=await db.collection('pos_sales').orderBy('sold_at','desc').limit(100).get();
    response.sales=sales.docs.map(x=>x.data());
  }
  return response;
}
export async function createPosSale(db,actor,input){
  requirePermission(actor,'sales_create');
  const id=str(input.request_id,80).toLowerCase();
  if(!/^[a-f0-9]{8}-[a-f0-9-]{27,}$/.test(id)||id.length!==36)bad('invalid_request','Use a stable UUID for checkout.');
  const lines=input.items;
  if(!Array.isArray(lines)||lines.length<1||lines.length>25)bad('invalid_cart','Select 1–25 variants.');
  const items=lines.map(row=>{
    const variant_id=str(row?.variant_id,140),quantity=Number(row?.quantity);
    if(!variant_id||!Number.isInteger(quantity)||quantity<1||quantity>50)bad('invalid_cart','Invalid item quantity.');
    return {variant_id,quantity};
  });
  if(new Set(items.map(x=>x.variant_id)).size!==items.length)bad('invalid_cart','Duplicate variants.');
  const payment_method=str(input.payment_method).toLowerCase();
  if(!['cash','bkash','nagad'].includes(payment_method))bad('invalid_payment','Choose a payment method.');
  const discount=numberMoney(input.discount_amount||0);
  if(discount>0)requirePermission(actor,'sales_discount');
  const reference=str(input.payment_reference).toLowerCase();
  if(payment_method!=='cash'&&!/^[a-z0-9-]{6,50}$/.test(reference))
    bad('reference_required','Enter a valid bKash/Nagad reference.');
  const amount_received=payment_method==='cash'?numberMoney(input.amount_received):0;
  const customer_name=str(input.customer_name||'Walk-in')||'Walk-in';
  const customer_phone=str(input.customer_phone).replace(/[\s-]/g,'');
  if(customer_phone&&!/^\+?[0-9]{7,15}$/.test(customer_phone))bad('invalid_phone','Invalid phone.');
  const hash=createHash('sha256').update(JSON.stringify({items,discount,payment_method,reference,
    amount_received,customer_name,customer_phone})).digest('hex');
  const saleId='pos_'+id;
  const requestRef=db.collection('pos_request_ids').doc(id);
  const saleRef=db.collection('pos_sales').doc(saleId);
  const refDoc=payment_method!=='cash'?db.collection('pos_payment_references').doc(payment_method+'_'+reference):null;
  return db.runTransaction(async tx=>{
    const prior=await tx.get(requestRef);
    if(prior.exists){
      if(prior.data().hash!==hash)bad('idempotency_conflict','Request ID already used with different items.');
      const receipt=await tx.get(saleRef);
      if(!receipt.exists)throw new Error('Committed sale receipt is missing.');
      return {ok:true,already_saved:true,sale:receipt.data()};
    }
    if(refDoc){
      const ref=await tx.get(refDoc);
      if(ref.exists)bad('reference_duplicate','This mobile-money reference was already used.');
    }
    const variantDocs=await Promise.all(items.map(x=>tx.get(db.collection('product_variants').doc(x.variant_id))));
    const productIds=[...new Set(variantDocs.map(x=>String(x.data()?.product_id||'')))];
    const productDocs=await Promise.all(productIds.map(x=>tx.get(db.collection('products').doc(x))));
    const products=new Map(productDocs.map(x=>[x.id,x.data()]));
    let subtotal=0;
    const receiptItems=items.map((line,index)=>{
      const variant=variantDocs[index].data();
      if(!variant||!enabled(variant.is_active))bad('unavailable_selection','A cake variant is unavailable.');
      const product=products.get(String(variant.product_id));
      if(!product||!enabled(product.is_active))bad('unavailable_selection','A cake is unavailable.');
      const source=variant.sale_price!==''&&variant.sale_price!==undefined&&variant.sale_price!==null?
        Number(variant.sale_price):Number(variant.price);
      const cents=numberMoney(source);
      subtotal+=cents*line.quantity;
      if(subtotal>1e9)bad('invalid_total','Cart is too large.');
      return {variant_id:line.variant_id,product_id:String(variant.product_id),product_name:str(product.name),
        variant_name:str(variant.name),quantity:line.quantity,unit_price:cents/100,subtotal:cents*line.quantity/100};
    });
    if(discount>subtotal)bad('invalid_discount','Discount exceeds subtotal.');
    const total=subtotal-discount;
    if(payment_method==='cash'&&amount_received<total)bad('insufficient_cash','Cash received is less than total.');
    const now=new Date();
    const sale={
      id:saleId,sale_number:'POS-'+now.toISOString().slice(2,10).replaceAll('-','')+'-'+id.slice(0,6).toUpperCase(),
      request_id:id,sold_at:now.toISOString(),staff_id:actor.uid,staff_name:actor.name,
      customer_name,customer_phone,items:receiptItems,subtotal:subtotal/100,
      discount_amount:discount/100,total_amount:total/100,payment_method,
      payment_reference:reference,amount_received:payment_method==='cash'?amount_received/100:total/100,
      change_amount:payment_method==='cash'?(amount_received-total)/100:0,
      payment_confirmation:'staff_attested'
    };
    tx.create(saleRef,sale);
    tx.create(requestRef,{sale_id:saleId,hash,created_at:sale.sold_at});
    if(refDoc)tx.create(refDoc,{sale_id:saleId,created_at:sale.sold_at});
    return {ok:true,already_saved:false,sale};
  });
}
