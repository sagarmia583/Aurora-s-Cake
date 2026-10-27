import React, {useEffect, useMemo, useRef, useState} from 'react';
import {ShoppingCart, Search, Plus, Minus, Trash2, Printer, History, RefreshCw, CheckCircle2, AlertCircle} from 'lucide-react';
import {createPosSale, getPosCatalog, getPosHistory} from '../services/posApi';
import type {PosCreateInput,PosProduct,PosSale,PosShop} from '../services/posApi';

type Payment='cash'|'bkash'|'nagad';
type Line={variant_id:string;quantity:number};
const currency=(n:number)=>'৳'+n.toLocaleString('en-BD',{minimumFractionDigits:2,maximumFractionDigits:2});
const round=(n:number)=>Math.round(n*100)/100;
const createId=()=>crypto.randomUUID();
const stamp=(s:string)=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dhaka',dateStyle:'medium',timeStyle:'short'}).format(new Date(s));
export default function SalesPOS({endpoint,token,canSell,canDiscount,canHistory}:{
  endpoint:string;token:string;canSell:boolean;canDiscount:boolean;canHistory:boolean;
}){
  const [shop,setShop]=useState<PosShop>({name:"Aurora's Cake",address:'',phone:''});
  const [products,setProducts]=useState<PosProduct[]>([]);
  const [search,setSearch]=useState('');
  const [cart,setCart]=useState<Line[]>([]);
  const [name,setName]=useState('Walk-in');
  const [phone,setPhone]=useState('');
  const [payment,setPayment]=useState<Payment>('cash');
  const [reference,setReference]=useState('');
  const [tendered,setTendered]=useState('');
  const [discount,setDiscount]=useState('');
  const [receipt,setReceipt]=useState<PosSale|null>(null);
  const [history,setHistory]=useState<PosSale[]>([]);
  const [historyOpen,setHistoryOpen]=useState(false);
  const [paper,setPaper]=useState<58|80>(80);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [historyBusy,setHistoryBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  // A failed/uncertain network response must retry the EXACT same payload and UUID.
  const pending=useRef<PosCreateInput|null>(null);
  const prices=useMemo(()=>new Map(products.map(p=>[p.variant_id,p])),[products]);
  const lines=cart.map(l=>({product:prices.get(l.variant_id),quantity:l.quantity}))
    .filter((l):l is {product:PosProduct,quantity:number}=>Boolean(l.product));
  const subtotal=round(lines.reduce((s,l)=>s+l.product.price*l.quantity,0));
  const off=Math.max(0,Number(discount)||0);
  const total=round(Math.max(0,subtotal-off));
  const change=round(Math.max(0,(Number(tendered)||0)-total));
  useEffect(()=>{
    let alive=true;setLoading(true);setError('');
    getPosCatalog(endpoint,token).then(data=>{
      if(!alive)return;setShop(data.shop);setProducts(data.products);
    }).catch(e=>{if(alive)setError(e instanceof Error?e.message:'POS catalogue could not load.');})
      .finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[endpoint,token]);
  const changeQty=(id:string,delta:number)=>{
    if(pending.current||busy)return;
    setCart(current=>{
      const found=current.find(l=>l.variant_id===id);
      const qty=(found?.quantity||0)+delta;
      if(qty<1)return current.filter(l=>l.variant_id!==id);
      if(qty>50)return current;
      return found?current.map(l=>l.variant_id===id?{...l,quantity:qty}:l):[...current,{variant_id:id,quantity:1}];
    });
  };
  const refreshCatalog=async()=>{
    if(pending.current)return;
    setLoading(true);setError('');
    try{
      const data=await getPosCatalog(endpoint,token);
      setShop(data.shop);setProducts(data.products);
      setCart(c=>c.filter(l=>data.products.some(p=>p.variant_id===l.variant_id)));
    }catch(e){setError(e instanceof Error?e.message:'Catalogue refresh failed.');}
    finally{setLoading(false);}
  };
  const loadHistory=async()=>{
    if(!canHistory)return;
    setHistoryBusy(true);setError('');
    try{const data=await getPosHistory(endpoint,token);setHistory(data.sales||[]);setHistoryOpen(true);}
    catch(e){setError(e instanceof Error?e.message:'History unavailable.');}
    finally{setHistoryBusy(false);}
  };
  const saveSale=async(event:React.FormEvent)=>{
    event.preventDefault();if(busy||!canSell)return;
    if(!pending.current){
      if(lines.length!==cart.length||cart.length===0){setError('Add at least one available cake.');return;}
      if(off>subtotal||off<0||!Number.isFinite(off)){setError('Check discount amount.');return;}
      if(!canDiscount&&off>0){setError('You cannot apply discounts.');return;}
      if(payment==='cash'&&Number(tendered||total)<total){setError('Cash received is less than total.');return;}
      pending.current={request_id:createId(),items:cart.map(x=>({...x})),
        discount_amount:round(off),customer_name:name,customer_phone:phone,
        payment_method:payment,payment_reference:payment==='cash'?'':reference.trim(),
        amount_received:payment==='cash'?round(tendered===''?total:Number(tendered)):0};
    }
    setBusy(true);setError('');setNotice('');
    try{
      const sale=await createPosSale(endpoint,token,pending.current);
      setReceipt(sale);setHistory(h=>[sale,...h.filter(x=>x.id!==sale.id)].slice(0,100));
      setCart([]);setDiscount('');setTendered('');setReference('');setName('Walk-in');setPhone('');
      pending.current=null;
      setNotice('Sale saved in the private counter-sales register. You can print the confirmed receipt.');
    }catch(e){
      setError((e instanceof Error?e.message:'Unable to save sale.')+
        ' The same sale reference will be reused on retry to prevent duplicate billing.');
    }finally{setBusy(false);}
  };
  const print=()=>{
    if(!receipt)return;
    setTimeout(()=>window.print(),0);
  };
  const filtered=products.filter(p=>(p.product_name+' '+p.variant_name).toLowerCase().includes(search.trim().toLowerCase())).slice(0,100);
  return <div className="space-y-5" data-testid="staff-sales-pos">
    <div className="flex flex-wrap gap-3 justify-between items-start">
      <div><h3 className="text-xl sm:text-2xl font-black text-[#173b32]">Counter Sales & POS</h3>
        <p className="text-sm text-slate-500">Instant walk-in billing · private sales register · 58/80mm receipt</p></div>
      <div className="flex gap-2 flex-wrap">
        <button type="button" onClick={()=>void refreshCatalog()} disabled={loading||busy||Boolean(pending.current)} className="rounded-xl border bg-white px-3 py-2 text-sm font-bold inline-flex gap-2 items-center disabled:opacity-50"><RefreshCw size={16}/> Refresh cakes</button>
        {canHistory&&<button type="button" onClick={()=>void loadHistory()} disabled={historyBusy} className="rounded-xl border bg-white px-3 py-2 text-sm font-bold inline-flex gap-2 items-center"><History size={16}/> Sales history</button>}
      </div>
    </div>
    {error&&<div role="alert" className="p-4 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 flex items-start gap-2"><AlertCircle size={17}/><span>{error}</span></div>}
    {notice&&<div role="status" className="p-4 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200 flex items-start gap-2"><CheckCircle2 size={17}/><span>{notice}</span></div>}
    <div className="grid lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,1fr)] gap-4 items-start">
      <section className="rounded-3xl bg-white border p-4 sm:p-5 space-y-4">
        <label className="flex gap-2 items-center rounded-xl border bg-slate-50 px-3 py-3">
          <Search size={18} className="text-slate-500"/>
          <input className="w-full outline-none bg-transparent text-sm" placeholder="Search cake or size…" value={search} onChange={e=>setSearch(e.target.value)}/>
        </label>
        {loading?<p className="text-slate-500 text-center py-12" role="status">Loading cakes…</p>:
         filtered.length===0?<p className="text-slate-500 text-center py-12">No available cakes found.</p>:
         <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
           {filtered.map(p=><button key={p.variant_id} type="button" disabled={!canSell||busy||Boolean(pending.current)}
             onClick={()=>changeQty(p.variant_id,1)} className="text-left rounded-2xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 p-3 min-h-28 disabled:opacity-50">
             <div className="flex justify-between gap-2"><span className="font-bold text-sm text-[#173b32]">{p.product_name}</span><Plus size={18}/></div>
             <p className="text-xs text-slate-500 mt-1">{p.variant_name}</p>
             <p className="font-black mt-2 text-emerald-800">{currency(p.price)}</p>
           </button>)}
         </div>}
      </section>
      <form onSubmit={e=>void saveSale(e)} className="rounded-3xl bg-white border p-4 sm:p-5 space-y-4">
        <div className="flex justify-between items-center"><h4 className="text-lg font-black text-[#173b32] flex gap-2 items-center"><ShoppingCart size={20}/> Current bill</h4><span className="text-xs text-slate-500">{cart.reduce((s,l)=>s+l.quantity,0)} pcs</span></div>
        {lines.length===0?<p className="text-center rounded-xl bg-slate-50 text-slate-500 p-6 text-sm">Tap a cake to add it to this bill.</p>:<div className="space-y-2">
          {lines.map(({product,quantity})=><div key={product.variant_id} className="flex justify-between gap-2 items-center border-b pb-2">
            <div className="min-w-0"><p className="text-sm font-semibold truncate">{product.product_name}</p><p className="text-xs text-slate-500">{product.variant_name} · {currency(product.price)}</p></div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={()=>changeQty(product.variant_id,-1)} disabled={busy||Boolean(pending.current)} className="p-2 rounded-lg border" aria-label="Decrease"><Minus size={14}/></button>
              <span className="w-7 text-center text-sm font-bold">{quantity}</span>
              <button type="button" onClick={()=>changeQty(product.variant_id,1)} disabled={busy||Boolean(pending.current)} className="p-2 rounded-lg border" aria-label="Increase"><Plus size={14}/></button>
            </div>
            <span className="text-sm font-bold tabular-nums">{currency(round(product.price*quantity))}</span>
          </div>)}
        </div>}
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-semibold text-slate-600">Customer name (optional)<input disabled={Boolean(pending.current)} value={name} onChange={e=>setName(e.target.value)} maxLength={100} className="w-full mt-1 border rounded-lg p-2.5 text-sm" placeholder="Walk-in"/></label>
          <label className="text-xs font-semibold text-slate-600">Phone (optional)<input disabled={Boolean(pending.current)} inputMode="tel" value={phone} onChange={e=>setPhone(e.target.value)} className="w-full mt-1 border rounded-lg p-2.5 text-sm" placeholder="01…"/></label>
        </div>
        <div className="space-y-2 bg-slate-50 rounded-xl p-3">
          <div className="flex justify-between text-sm"><span>Subtotal</span><strong>{currency(subtotal)}</strong></div>
          {canDiscount&&<label className="flex justify-between items-center text-sm gap-2">Discount (৳)<input disabled={Boolean(pending.current)} type="number" min="0" max={subtotal} step="0.01" value={discount} onChange={e=>setDiscount(e.target.value)} className="border rounded-lg p-2 w-28 text-right"/></label>}
          <div className="flex justify-between text-lg font-black text-[#173b32] border-t pt-2"><span>Total</span><span>{currency(total)}</span></div>
        </div>
        <fieldset disabled={Boolean(pending.current)}><legend className="font-bold text-sm mb-2">Payment collected by staff</legend>
          <div className="grid grid-cols-3 gap-2">{(['cash','bkash','nagad'] as const).map(m=>
            <button type="button" key={m} onClick={()=>setPayment(m)} className={'p-3 rounded-xl border font-bold text-sm '+(payment===m?'bg-[#173b32] text-white border-[#173b32]':'bg-white')}>{m==='cash'?'Cash':m==='bkash'?'bKash':'Nagad'}</button>)}</div>
          {payment==='cash'?<div className="mt-3"><label className="text-xs font-semibold">Cash received (blank means exact amount)<input type="number" min={total} step="0.01" value={tendered} onChange={e=>setTendered(e.target.value)} placeholder={String(total)} className="mt-1 w-full border rounded-lg p-2.5"/></label><p className="text-sm mt-2">Change due: <strong>{currency(tendered===''?0:change)}</strong></p></div>:
          <label className="block mt-3 text-xs font-semibold">Transaction reference (manual confirmation)<input required value={reference} onChange={e=>setReference(e.target.value)} placeholder="bKash / Nagad TXID" className="mt-1 w-full border rounded-lg p-2.5" minLength={6} maxLength={50}/></label>}
        </fieldset>
        <button type="submit" disabled={!canSell||loading||busy||(!pending.current&&lines.length===0)} className="w-full min-h-14 bg-[#173b32] text-white rounded-xl font-black text-base disabled:opacity-50">
          {busy?'Saving sale…':pending.current?'Retry exact same sale':'Confirm payment & save sale'}
        </button>
        <p className="text-[11px] text-slate-500">bKash/Nagad amounts are staff-attested, not automatically verified by a gateway. Receipt printing is available only after the sale is saved.</p>
      </form>
    </div>
    {receipt&&<section className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-wrap gap-3 justify-between items-center">
      <div><p className="font-black text-emerald-900">Saved: {receipt.sale_number}</p><p className="text-sm text-emerald-800">{currency(receipt.total_amount)} · {stamp(receipt.sold_at)}</p></div>
      <div className="flex gap-2 items-center">
        <label className="text-sm">Paper <select value={paper} onChange={e=>setPaper(Number(e.target.value) as 58|80)} className="bg-white border rounded-lg p-2"><option value="80">80mm</option><option value="58">58mm</option></select></label>
        <button type="button" onClick={print} className="inline-flex gap-2 items-center bg-[#173b32] text-white px-4 py-3 rounded-xl font-bold"><Printer size={18}/> Print / Save PDF</button>
      </div>
    </section>}
    {historyOpen&&<section className="bg-white rounded-2xl border p-4 space-y-3">
      <div className="flex items-center justify-between"><h4 className="font-black">Last {history.length} counter sales</h4><button type="button" onClick={()=>setHistoryOpen(false)} className="text-sm underline">Close</button></div>
      {history.length===0?<p className="text-sm text-slate-500">No counter sales recorded yet.</p>:
      <div className="max-h-80 overflow-auto divide-y">{history.map(s=><div key={s.id} className="flex gap-2 justify-between py-3 items-center text-sm">
        <div><strong>{s.sale_number}</strong><p className="text-xs text-slate-500">{stamp(s.sold_at)} · {s.staff_name} · {s.payment_method}</p></div>
        <div className="flex items-center gap-2"><strong>{currency(s.total_amount)}</strong><button type="button" onClick={()=>setReceipt(s)} className="rounded-lg border px-3 py-2 text-xs">Select to print</button></div>
      </div>)}</div>}
    </section>}
    {receipt&&<div id="aurora-pos-paper" className="aurora-pos-paper" aria-hidden="true">
      <header><div className="pos-shop">{shop.name}</div>{shop.address&&<div>{shop.address}</div>}{shop.phone&&<div>Tel: {shop.phone}</div>}
        <div className="pos-line"/><strong>SALES RECEIPT</strong></header>
      <div>Bill: {receipt.sale_number}</div><div>Date: {stamp(receipt.sold_at)}</div>
      <div>Cashier: {receipt.staff_name}</div><div>Customer: {receipt.customer_name}</div>
      {receipt.customer_phone&&<div>Phone: {receipt.customer_phone}</div>}
      <div className="pos-line"/>
      <div className="pos-row"><strong>Item</strong><strong>Amount</strong></div>
      {receipt.items.map((l,i)=><div key={i} className="pos-item">
        <div>{l.product_name} ({l.variant_name})</div>
        <div className="pos-row"><span>{l.quantity} × {currency(l.unit_price)}</span><strong>{currency(l.subtotal)}</strong></div>
      </div>)}
      <div className="pos-line"/><div className="pos-row"><span>Subtotal</span><span>{currency(receipt.subtotal)}</span></div>
      {receipt.discount_amount>0&&<div className="pos-row"><span>Discount</span><span>-{currency(receipt.discount_amount)}</span></div>}
      <div className="pos-row pos-total"><strong>TOTAL</strong><strong>{currency(receipt.total_amount)}</strong></div>
      <div className="pos-row"><span>Paid by</span><strong>{receipt.payment_method.toUpperCase()}</strong></div>
      {receipt.payment_reference&&<div>TXID: {receipt.payment_reference}</div>}
      {receipt.payment_method==='cash'&&<><div className="pos-row"><span>Received</span><span>{currency(receipt.amount_received)}</span></div>
      <div className="pos-row"><span>Change</span><span>{currency(receipt.change_amount)}</span></div></>}
      <div className="pos-line"/><footer>Thank you for choosing {shop.name}!<p>Keep this receipt for reference.</p></footer>
    </div>}
    <style>{`@media screen { .aurora-pos-paper { display:none; } }
      @media print {
        @page { size:auto; margin:0; }
        body * { visibility:hidden !important; }
        #aurora-pos-paper, #aurora-pos-paper * { visibility:visible !important; }
        #aurora-pos-paper { display:block !important; position:absolute !important;top:0;left:0;
          width:${paper-5}mm;max-width:${paper-5}mm;box-sizing:border-box;padding:2mm;
          color:#000!important;background:#fff!important;font:10px/1.45 Arial,sans-serif;overflow:visible !important; }
        #aurora-pos-paper header,#aurora-pos-paper footer { text-align:center; }
        #aurora-pos-paper .pos-shop { font-weight:900;font-size:16px; }
        #aurora-pos-paper .pos-line { border-top:1px dashed #111;margin:5px 0; }
        #aurora-pos-paper .pos-row { display:flex;justify-content:space-between;gap:3mm; }
        #aurora-pos-paper .pos-item { margin:4px 0;overflow-wrap:anywhere; }
        #aurora-pos-paper .pos-total { font-size:13px;border-top:1px solid #111;border-bottom:1px solid #111;padding:4px 0;margin:5px 0; }
        #aurora-pos-paper footer { margin-top:8px;font-size:10px; }
      }`}</style>
  </div>;
}
