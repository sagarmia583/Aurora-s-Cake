import {json} from '../shared.js';
import {authorizedD1Staff} from './access.js';

const ADMIN=new Set(['super_admin','admin']);
const INVENTORY=new Set(['super_admin','admin','manager','baker']);
const FINANCE=new Set(['super_admin','admin','accountant']);
const POS=new Set(['super_admin','admin','manager','order_manager']);
const ORDER_VIEW=new Set(['super_admin','admin','manager','order_manager','accountant']);
const readBody=async(request)=>{
  const length=Number(request.headers.get('content-length')||0);
  if(length>64000)throw Error('invalid_payload_size');
  const text=await request.text();
  if(text.length>64000)throw Error('invalid_payload_size');
  const body=JSON.parse(text);
  if(!body||typeof body!=='object'||Array.isArray(body))throw Error('invalid_payload');
  return body;
};
const txt=(value,max=180)=>typeof value==='string'?value.trim().slice(0,max):'';
const integer=(value,min=0,max=100000000)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const id=()=>crypto.randomUUID();
const originAllowed=(request)=>{
  const origin=request.headers.get('origin');
  return !origin||origin===new URL(request.url).origin;
};
const normalizeError=()=>json(422,{ok:false,code:'invalid_or_unavailable_record'});
const limited=(role,set)=>set.has(role);
const forbidden=()=>json(403,{ok:false,code:'not_authorized'});
const disabled=()=>json(503,{ok:false,code:'d1_preview_disabled'});
const fail=()=>json(503,{ok:false,code:'d1_database_unavailable'});
const readSql=async(db,sql,params=[])=>{
  const r=await db.prepare(sql).bind(...params).all();
  return r.results||[];
};
const priceLines=async(db,lines)=>{
  if(!Array.isArray(lines)||lines.length<1||lines.length>30)throw Error('invalid_lines');
  let total=0;
  const resolved=[];
  for(const raw of lines){
    const variantId=txt(raw?.variant_id,100),qty=raw?.quantity;
    if(!variantId||!integer(qty,1,50))throw Error('invalid_item');
    const product=await db.prepare(
      'SELECT v.id,v.label,v.price_paisa,v.cost_snapshot_paisa,p.name FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id=? AND v.active=1 AND p.active=1'
    ).bind(variantId).first();
    if(!product||!integer(product.price_paisa)||!integer(product.cost_snapshot_paisa??0))
      throw Error('unknown_product_variant');
    const subtotal=product.price_paisa*qty;
    if(!integer(subtotal))throw Error('invalid_total');
    total+=subtotal;if(!integer(total))throw Error('invalid_total');
    resolved.push({variantId,qty,productName:product.name,variantName:product.label,
      unit:product.price_paisa,total:subtotal,cost:product.cost_snapshot_paisa??0});
  }
  return {total,lines:resolved};
};

async function inventoryMovement(db,staff,body){
  if(!limited(staff.role,INVENTORY))return forbidden();
  const item=txt(body.item_id,120),delta=body.delta_milli,reason=txt(body.reason,40);
  if(!item||!integer(Math.abs(delta),1,100000000)||!Number.isSafeInteger(delta)||
    !new Set(['purchase','production','sale','waste','return','correction']).has(reason))
    return normalizeError();
  const exists=await db.prepare('SELECT id FROM inventory_items WHERE id=?').bind(item).first();
  if(!exists)return normalizeError();
  const movementId=id();
  try{
    await db.batch([
      db.prepare('UPDATE inventory_items SET on_hand_milli=on_hand_milli+? WHERE id=?')
        .bind(delta,item),
      db.prepare(`INSERT INTO inventory_movements
        (id,item_id,delta_milli,balance_after_milli,reason,related_id,unit_cost_paisa,created_by)
        SELECT ?,id,?,on_hand_milli,?,?,?,? FROM inventory_items WHERE id=?`)
        .bind(movementId,delta,reason,txt(body.related_id,120),
          integer(body.unit_cost_paisa??0)?body.unit_cost_paisa:0,staff.id,item),
      db.prepare(`INSERT INTO audit_events(id,actor_id,action,target_type,target_id)
        VALUES (?,?,'inventory.movement','inventory_item',?)`)
        .bind(id(),staff.id,item)
    ]);
    return json(201,{ok:true,id:movementId});
  }catch{return normalizeError();}
}

async function createProduct(db,staff,body){
  if(!limited(staff.role,ADMIN))return forbidden();
  const name=txt(body.name,180),categoryId=txt(body.category_id,120);
  const variants=body.variants;
  if(!name||!Array.isArray(variants)||variants.length<1||variants.length>30||
    variants.some(v=>!txt(v?.label,100)||!integer(v?.price_paisa,0,100000000)))
    return normalizeError();
  const productId=id(),stmts=[
    db.prepare(`INSERT INTO products(id,category_id,name,description,active)
      VALUES (?,?,?,?,0)`).bind(productId,categoryId||null,name,txt(body.description,1000)),
  ];
  for(const variant of variants){
    stmts.push(db.prepare(`INSERT INTO product_variants(id,product_id,label,price_paisa,active)
      VALUES (?,?,?,?,1)`).bind(id(),productId,txt(variant.label,100),variant.price_paisa));
  }
  stmts.push(db.prepare(`INSERT INTO audit_events(id,actor_id,action,target_type,target_id)
    VALUES (?,?,'product.create','product',?)`).bind(id(),staff.id,productId));
  try{await db.batch(stmts);return json(201,{ok:true,id:productId,published:false});}
  catch{return normalizeError();}
}

async function createPosSale(db,staff,body){
  if(!limited(staff.role,POS))return forbidden();
  const requestId=txt(body.idempotency_key,120),register=txt(body.register_id,120);
  const method=txt(body.payment_method,40);
  if(!requestId||!register||!new Set(['cash','bank','bkash','nagad']).has(method))
    return normalizeError();
  const previous=await db.prepare('SELECT id,total_paisa FROM pos_sales WHERE idempotency_key=?')
    .bind(requestId).first();
  if(previous)return json(200,{ok:true,id:previous.id,total_paisa:previous.total_paisa,replayed:true});
  const open=await db.prepare('SELECT id FROM cash_registers WHERE id=? AND closed_at IS NULL')
    .bind(register).first();
  if(!open)return normalizeError();
  let quote;
  try{quote=await priceLines(db,body.lines);}catch{return normalizeError();}
  const saleId=id(),journalId=id(),account=method==='cash'?'cash':'bank';
  const stmts=[
    db.prepare(`INSERT INTO pos_sales(id,idempotency_key,register_id,cashier_id,total_paisa,payment_method)
      VALUES (?,?,?,?,?,?)`).bind(saleId,requestId,register,staff.id,quote.total,method),
    db.prepare(`INSERT INTO accounting_journals(id,ref_type,ref_id,memo,created_by)
      VALUES (?,'pos_sale',?,'POS sale',?)`).bind(journalId,saleId,staff.id),
    db.prepare(`INSERT INTO accounting_entries(id,journal_id,account_id,debit_paisa,credit_paisa)
      VALUES (?,?,?,?,0)`).bind(id(),journalId,account,quote.total),
    db.prepare(`INSERT INTO accounting_entries(id,journal_id,account_id,debit_paisa,credit_paisa)
      VALUES (?,?,?,0,?)`).bind(id(),journalId,'sales',quote.total),
  ];
  for(const line of quote.lines){
    stmts.push(db.prepare(`INSERT INTO pos_lines
      (id,sale_id,product_variant_id,product_snapshot,variant_snapshot,qty,unit_price_paisa,total_paisa,cost_snapshot_paisa)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(id(),saleId,line.variantId,line.productName,line.variantName,
        line.qty,line.unit,line.total,line.cost));
  }
  try{
    await db.batch(stmts);
    return json(201,{ok:true,id:saleId,total_paisa:quote.total,payment_method:method});
  }catch{
    // Concurrent request with same key may have already committed.
    const saved=await db.prepare('SELECT id,total_paisa FROM pos_sales WHERE idempotency_key=?')
      .bind(requestId).first().catch(()=>null);
    if(saved)return json(200,{ok:true,id:saved.id,total_paisa:saved.total_paisa,replayed:true});
    return normalizeError();
  }
}

async function recordExpense(db,staff,body){
  if(!limited(staff.role,FINANCE))return forbidden();
  const requestId=txt(body.idempotency_key,120),memo=txt(body.memo,300),
    amount=body.amount_paisa,source=txt(body.from_account,24);
  if(!requestId||!memo||!integer(amount,1,100000000)||!['cash','bank'].includes(source))
    return normalizeError();
  const prior=await db.prepare(
    "SELECT id FROM accounting_journals WHERE ref_type='expense' AND ref_id=?"
  ).bind(requestId).first();
  if(prior)return json(200,{ok:true,id:prior.id,replayed:true});
  const journal=id();
  try{
    await db.batch([
      db.prepare(`INSERT INTO accounting_journals(id,ref_type,ref_id,memo,created_by)
        VALUES (?,'expense',?,?,?)`).bind(journal,requestId,memo,staff.id),
      db.prepare(`INSERT INTO accounting_entries
        (id,journal_id,account_id,debit_paisa,credit_paisa) VALUES (?,?,?, ?,0)`)
        .bind(id(),journal,'misc_expense',amount),
      db.prepare(`INSERT INTO accounting_entries
        (id,journal_id,account_id,debit_paisa,credit_paisa) VALUES (?,?,?,0,?)`)
        .bind(id(),journal,source,amount),
    ]);
    return json(201,{ok:true,id:journal});
  }catch{
    const prior=await db.prepare(
      "SELECT id FROM accounting_journals WHERE ref_type='expense' AND ref_id=?"
    ).bind(requestId).first().catch(()=>null);
    return prior?json(200,{ok:true,id:prior.id,replayed:true}):normalizeError();
  }
}

async function internalOrder(db,staff,body){
  if(!limited(staff.role,POS))return forbidden();
  const key=txt(body.idempotency_key,120);
  const name=txt(body.customer_name,120),phone=txt(body.customer_phone,30);
  if(!key||!name||!phone)return normalizeError();
  const old=await db.prepare('SELECT id,order_number,total_paisa FROM orders WHERE idempotency_key=?')
    .bind(key).first();
  if(old)return json(200,{ok:true,order:old,replayed:true});
  let quote;
  try{quote=await priceLines(db,body.lines);}catch{return normalizeError();}
  const deliveryFee=body.delivery_fee_paisa??0;
  if(!integer(deliveryFee,0,10000000)||!integer(quote.total+deliveryFee))return normalizeError();
  const orderId=id(),number='AC-'+Date.now().toString(36).toUpperCase()+'-'+orderId.slice(0,8);
  const stmts=[db.prepare(`INSERT INTO orders
    (id,source,idempotency_key,order_number,customer_name,customer_phone,
      delivery_address,delivery_date,delivery_slot,subtotal_paisa,delivery_fee_paisa,total_paisa)
    VALUES (?,'shop',?,?,?,?,?,?,?,?,?,?)`)
    .bind(orderId,key,number,name,phone,txt(body.delivery_address,1000),
      txt(body.delivery_date,10)||null,txt(body.delivery_slot,100)||null,
      quote.total,deliveryFee,quote.total+deliveryFee)
  ];
  for(const line of quote.lines)stmts.push(db.prepare(`INSERT INTO order_lines
    (id,order_id,product_variant_id,product_name_snapshot,variant_snapshot,qty,unit_price_paisa,line_total_paisa,recipe_cost_snapshot_paisa)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(id(),orderId,line.variantId,line.productName,line.variantName,line.qty,
      line.unit,line.total,line.cost));
  try{
    await db.batch(stmts);
    return json(201,{ok:true,order:{id:orderId,order_number:number,
      total_paisa:quote.total+deliveryFee},read_only_checkout:false});
  }catch{
    const saved=await db.prepare('SELECT id,order_number,total_paisa FROM orders WHERE idempotency_key=?')
      .bind(key).first().catch(()=>null);
    return saved?json(200,{ok:true,order:saved,replayed:true}):normalizeError();
  }
}

async function createCategory(db,staff,body){
  if(!limited(staff.role,ADMIN))return forbidden();
  const name=txt(body.name,120),slug=txt(body.slug,120).toLowerCase();
  if(!name||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))return normalizeError();
  const categoryId=id();
  try{
    await db.batch([
      db.prepare('INSERT INTO categories(id,name,slug,active) VALUES (?,?,?,0)')
        .bind(categoryId,name,slug),
      db.prepare(`INSERT INTO audit_events(id,actor_id,action,target_type,target_id)
        VALUES (?,?,'category.create','category',?)`).bind(id(),staff.id,categoryId)
    ]);
    return json(201,{ok:true,id:categoryId,published:false});
  }catch{return normalizeError();}
}

async function createInventoryItem(db,staff,body){
  if(!limited(staff.role,INVENTORY))return forbidden();
  const name=txt(body.name,150),unit=txt(body.unit,20);
  const reorder=body.reorder_at_milli??0;
  if(!name||!new Set(['g','kg','ml','l','pcs','box']).has(unit)||
     !integer(reorder,0,100000000))return normalizeError();
  const itemId=id();
  try{
    await db.batch([
      db.prepare(`INSERT INTO inventory_items(id,name,unit,reorder_at_milli)
        VALUES (?,?,?,?)`).bind(itemId,name,unit,reorder),
      db.prepare(`INSERT INTO audit_events(id,actor_id,action,target_type,target_id)
        VALUES (?,?,'inventory.item_create','inventory_item',?)`)
        .bind(id(),staff.id,itemId)
    ]);
    return json(201,{ok:true,id:itemId});
  }catch{return normalizeError();}
}

async function openPosRegister(db,staff,body){
  if(!limited(staff.role,POS))return forbidden();
  const opening=body.opening_paisa??0;
  if(!integer(opening,0,100000000))return normalizeError();
  const registerId=id();
  try{
    await db.prepare(`INSERT INTO cash_registers(id,opened_by,opening_paisa)
      VALUES (?,?,?)`).bind(registerId,staff.id,opening).run();
    return json(201,{ok:true,id:registerId});
  }catch{return normalizeError();}
}

async function setProductVisibility(db,staff,body){
  if(!limited(staff.role,ADMIN))return forbidden();
  const productId=txt(body.product_id,120);
  if(!productId||typeof body.active!=='boolean')return normalizeError();
  try{
    const batch=await db.batch([
      db.prepare('UPDATE products SET active=?,updated_at=datetime(\'now\') WHERE id=?')
        .bind(body.active?1:0,productId),
      db.prepare(`INSERT INTO audit_events(id,actor_id,action,target_type,target_id)
        VALUES (?,?,'product.visibility','product',?)`).bind(id(),staff.id,productId)
    ]);
    if(!batch[0]?.meta?.changes)return normalizeError();
    return json(200,{ok:true,id:productId,active:body.active});
  }catch{return normalizeError();}
}

export async function d1ApiHandler({request,env},{staffVerifier=authorizedD1Staff}={}){
  const path=new URL(request.url).pathname;
  if(request.method==='OPTIONS')return json(405,{ok:false,code:'method_not_allowed'});
  if(env?.D1_PREVIEW_ENABLED!=='true')return disabled();
  if(!env?.AURORA_DB)return json(503,{ok:false,code:'d1_binding_missing'});
  const db=env.AURORA_DB;
  if(path==='/api/d1/status'&&request.method==='GET'){
    try{
      const version=await db.prepare("SELECT value FROM schema_meta WHERE key='schema_version'").first();
      return json(200,{ok:true,provider:'cloudflare_d1',configured:true,
        schema_ready:version?.value==='1',r2_configured:Boolean(env.AURORA_MEDIA)});
    }catch{return fail();}
  }
  if(path==='/api/d1/catalog'&&request.method==='GET'){
    try{
      const products=await readSql(db,`SELECT id,category_id,name,description,image_key
        FROM products WHERE active=1 ORDER BY sort_order,name LIMIT 150`);
      const variants=await readSql(db,`SELECT v.id,v.product_id,v.label,v.price_paisa
        FROM product_variants v JOIN products p ON p.id=v.product_id
        WHERE p.active=1 AND v.active=1 ORDER BY v.label LIMIT 300`);
      const categories=await readSql(db,`SELECT id,name,slug FROM categories
        WHERE active=1 ORDER BY sort_order LIMIT 80`);
      return json(200,{ok:true,provider:'cloudflare_d1',order_submission_enabled:false,
        products,variants,categories});
    }catch{return fail();}
  }
  // No private D1 data is accessible without Access-signed and role-provisioned identity.
  if(!path.startsWith('/api/d1/admin/'))return json(404,{ok:false,code:'unknown_d1_route'});
  if(!originAllowed(request))return forbidden();
  const staff=await staffVerifier(request,env).catch(()=>null);
  if(!staff)return json(401,{ok:false,code:'cloudflare_access_required'});
  if(request.method==='GET'){
    try{
      if(path==='/api/d1/admin/products'&&limited(staff.role,ADMIN))
        return json(200,{ok:true,products:await readSql(db,
          'SELECT id,name,category_id,active,updated_at FROM products ORDER BY updated_at DESC LIMIT 200')});
      if(path==='/api/d1/admin/session')
        return json(200,{ok:true,staff:{id:staff.id,email:staff.email,role:staff.role}});
      if(path==='/api/d1/admin/orders'&&limited(staff.role,ORDER_VIEW))
        return json(200,{ok:true,orders:await readSql(db,
          'SELECT id,order_number,customer_name,customer_phone,status,total_paisa,created_at FROM orders ORDER BY created_at DESC LIMIT 50')});
      if(path==='/api/d1/admin/inventory'&&limited(staff.role,INVENTORY))
        return json(200,{ok:true,items:await readSql(db,
          'SELECT id,name,unit,on_hand_milli,reorder_at_milli FROM inventory_items ORDER BY name LIMIT 200')});
      if(path==='/api/d1/admin/pos'&&limited(staff.role,POS))
        return json(200,{ok:true,sales:await readSql(db,
          'SELECT id,total_paisa,payment_method,created_at FROM pos_sales ORDER BY created_at DESC LIMIT 100')});
      if(path==='/api/d1/admin/accounting'&&limited(staff.role,FINANCE))
        return json(200,{ok:true,journals:await readSql(db,
          `SELECT j.id,j.ref_type,j.ref_id,j.created_at,b.debits,b.credits
            FROM accounting_journals j JOIN journal_balance b ON b.journal_id=j.id
            ORDER BY j.created_at DESC LIMIT 100`)});
      return forbidden();
    }catch{return fail();}
  }
  if(request.method!=='POST')return json(405,{ok:false,code:'method_not_allowed'});
  if(env?.D1_MUTATIONS_ENABLED!=='true')return json(503,{ok:false,code:'d1_mutations_disabled'});
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json')
    return json(415,{ok:false,code:'json_required'});
  let body;
  try{body=await readBody(request);}catch{return normalizeError();}
  try{
    if(path==='/api/d1/admin/products')return await createProduct(db,staff,body);
    if(path==='/api/d1/admin/categories')return await createCategory(db,staff,body);
    if(path==='/api/d1/admin/inventory/items')return await createInventoryItem(db,staff,body);
    if(path==='/api/d1/admin/pos/register')return await openPosRegister(db,staff,body);
    if(path==='/api/d1/admin/products/visibility')return await setProductVisibility(db,staff,body);
    if(path==='/api/d1/admin/inventory')return await inventoryMovement(db,staff,body);
    if(path==='/api/d1/admin/pos')return await createPosSale(db,staff,body);
    if(path==='/api/d1/admin/accounting')return await recordExpense(db,staff,body);
    if(path==='/api/d1/admin/orders')return await internalOrder(db,staff,body);
    return json(404,{ok:false,code:'unknown_d1_route'});
  }catch{return fail();}
}
