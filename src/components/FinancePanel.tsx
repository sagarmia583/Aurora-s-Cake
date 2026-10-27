import {inventoryAction,type StockItem} from '../services/inventoryApi';
import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import { RefreshCw, WalletCards, Banknote, CakeSlice, Plus } from 'lucide-react';
import {financeSummary,recordCashDeposit,approveCashDeposit,voidCashDeposit,saveCakeCost,archiveCakeCost} from '../services/financeApi';
import type {FinanceSnapshot} from '../services/financeApi';

type Props={endpoint:string;token:string;canEdit:boolean};
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
const format=(value:number)=> (value<0?'-':'')+'৳'+Math.abs(value).toLocaleString('en-BD',{maximumFractionDigits:2});
const newRequestId=()=>crypto.randomUUID();
export default function FinancePanel({endpoint,token,canEdit}:Props){
  const [data,setData]=useState<FinanceSnapshot|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [selectedRider,setSelectedRider]=useState('');
  const [amount,setAmount]=useState('');
  const [date,setDate]=useState(today);
  const [note,setNote]=useState('');
  const requestId=useRef('');
  const recipeRequestId=useRef('');
  const [product,setProduct]=useState('');
  const [variant,setVariant]=useState('');
  const [component,setComponent]=useState('');
  const [unitLabel,setUnitLabel]=useState('g');
  const [inventoryItemId,setInventoryItemId]=useState('');
  const [stockOptions,setStockOptions]=useState<StockItem[]>([]);
  const [quantity,setQuantity]=useState('1');
  const [unitCost,setUnitCost]=useState('');
  const refresh=useCallback(async()=>{
    setBusy(true);setError('');
    try{setData(await financeSummary(endpoint,token));
      const inventory=await inventoryAction(endpoint,token,'staff_inventory_summary');
      setStockOptions(inventory.stock);}
    catch(err){setError(err instanceof Error?err.message:'Unable to load finance data');}
    finally{setBusy(false);}
  },[endpoint,token]);
  useEffect(()=>{void refresh();},[refresh]);
  const variants=useMemo(()=>data?.variants.filter(v=>v.product_id===product)||[],[data,product]);
  const deposit=async(e:React.FormEvent)=>{
    e.preventDefault();if(busy||!canEdit)return;
    const money=Number(amount);
    if(!Number.isFinite(money)||money<=0||!selectedRider){setError('Select a rider and valid amount.');return;}
    if(!requestId.current)requestId.current=newRequestId();
    setBusy(true);setError('');setNotice('');
    try{
      const result=await recordCashDeposit(endpoint,token,{request_id:requestId.current,rider_id:selectedRider,
        amount:money,date,notes:note.trim()});
      setData(result);setAmount('');setNote('');requestId.current='';
      setNotice('Cash submission saved as PENDING. A different authorized staff account must approve before the rider balance is debited.');
    }catch(err){setError(err instanceof Error?err.message:'Deposit not confirmed. Retry the same request.');}
    finally{setBusy(false);}
  };
  const approveDeposit=async(id:string)=>{
    if(!canEdit||busy)return;
    if(!window.confirm('Approve this cash handover? Your staff account must differ from the submitter.'))return;
    setBusy(true);setError('');setNotice('');
    try{setData(await approveCashDeposit(endpoint,token,id));
      setNotice('Approved by the second staff account. Rider outstanding balance has been reduced.');}
    catch(err){setError(err instanceof Error?err.message:'Second-person approval failed.');}
    finally{setBusy(false);}
  };
  const voidDeposit=async(id:string)=>{
    if(!canEdit||busy)return;
    const reason=window.prompt('Reason for reversing this cash deposit (minimum 8 characters):');
    if(reason===null)return;
    if(reason.trim().length<8){setError('A meaningful correction reason of at least 8 characters is required.');return;}
    if(!window.confirm('Void this cash deposit? Rider outstanding cash will increase by its amount; the original row remains in the audit trail.'))return;
    setBusy(true);setError('');setNotice('');
    try{setData(await voidCashDeposit(endpoint,token,id,reason.trim()));setNotice('Cash deposit voided and outstanding balance recalculated. Original ledger row preserved.');}
    catch(err){setError(err instanceof Error?err.message:'Cash correction failed. Refresh the ledger.');}
    finally{setBusy(false);}
  };
  const recordCost=async(e:React.FormEvent)=>{
    e.preventDefault();if(busy||!canEdit)return;
    if(!recipeRequestId.current)recipeRequestId.current=newRequestId();
    setBusy(true);setError('');setNotice('');
    try{
      const next=await saveCakeCost(endpoint,token,{request_id:recipeRequestId.current,product_id:product,variant_id:variant,
        component:component.trim(),unit_label:unitLabel.trim(),inventory_item_id:inventoryItemId,quantity:Number(quantity),unit_cost:Number(unitCost)});
      setData(next);setComponent('');setQuantity('1');setUnitCost('');setInventoryItemId('');recipeRequestId.current='';
      setNotice('Ingredient cost added to the private cake costing sheet.');
    }catch(err){setError(err instanceof Error?err.message:'Cost could not be saved.');}
    finally{setBusy(false);}
  };
  const removeCost=async(id:string)=>{
    if(!canEdit||busy||!confirm('Archive this recipe cost item?'))return;
    setBusy(true);setError('');
    try{setData(await archiveCakeCost(endpoint,token,id));setNotice('Cost entry archived.');}
    catch(err){setError(err instanceof Error?err.message:'Could not archive cost.');}
    finally{setBusy(false);}
  };
  const selectedBalance=data?.riders.find(r=>r.rider_id===selectedRider);
  const showCosts=data?.costs.filter(c=>!variant||c.variant_id===variant)||[];
  const recipeTotal=variant?data?.cost_totals[product+'::'+variant]||0:0;
  const selectedVariant=data?.variants.find(v=>v.id===variant);
  const selectedProduct=data?.products.find(p=>p.id===product);
  const baseMarkdown=selectedProduct?.sale_price!==''&&selectedProduct?.sale_price!==undefined
    ? Math.max(0,selectedProduct.base_price-Number(selectedProduct.sale_price)):0;
  const regular=selectedVariant?.sale_price!==''&&selectedVariant?.sale_price!==undefined
    ? Number(selectedVariant.sale_price) : Math.max(0,Number(selectedVariant?.price||0)-baseMarkdown);
  return <section className="space-y-5" aria-label="Bakery cash and cake costing">
    <div className="flex justify-between gap-3 flex-wrap items-center">
      <div><h3 className="font-black text-2xl text-emerald-950">Cash & Cake Costing</h3>
        <p className="text-sm text-slate-500">Private cash collection, rider deposits and ingredient expenses</p></div>
      <button type="button" disabled={busy} onClick={()=>void refresh()} className="inline-flex gap-2 items-center rounded-xl bg-white border p-3 text-sm font-bold disabled:opacity-50">
        <RefreshCw size={16}/> Refresh ledger</button>
    </div>
    {error&&<p role="alert" className="rounded-xl bg-red-50 text-red-800 p-3">{error}</p>}
    {notice&&<p role="status" className="rounded-xl bg-emerald-50 text-emerald-900 p-3">{notice}</p>}
    {!data?<p role="status" className="p-5 text-sm text-slate-600">{busy?'Loading the private Google Sheets ledger…':'No financial data loaded. Deploy the latest All-in-One GS and run setupSheetDatabase() for new tables.'}</p>:<>
      <section className="rounded-2xl bg-white border p-4 space-y-4">
        <h4 className="font-black text-lg flex items-center gap-2"><WalletCards size={20}/> Rider Cash Register</h4>
        <p className="text-xs text-slate-500">Credit is delivered COD collected by each rider. Debit is cash physically submitted and confirmed by a shop administrator. No bank transfer is made by this screen.</p>
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="bg-emerald-50 rounded-xl p-3"><small>COD received (credit)</small><strong className="block text-xl mt-1">{format(data.riders.reduce((n,r)=>n+r.collected,0))}</strong></div>
          <div className="bg-blue-50 rounded-xl p-3"><small>Cash submitted (debit)</small><strong className="block text-xl mt-1">{format(data.riders.reduce((n,r)=>n+r.deposited,0))}</strong></div>
          <div className="bg-amber-50 rounded-xl p-3"><small>Remaining with riders</small><strong className="block text-xl mt-1">{format(data.riders.reduce((n,r)=>n+r.remaining,0))}</strong></div>
        </div>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr className="text-slate-500 border-b"><th className="p-2">Rider</th><th className="p-2">Collected</th><th className="p-2">Deposited</th><th className="p-2">Outstanding</th></tr></thead>
          <tbody>{data.riders.map(r=><tr key={r.rider_id} className="border-b"><td className="p-2 font-semibold">{r.rider_name}<small className="block font-normal text-slate-500">{r.delivered_count} deliveries</small></td><td className="p-2">{format(r.collected)}</td><td className="p-2">{format(r.deposited)}</td><td className="p-2 font-black">{format(r.remaining)}</td></tr>)}</tbody>
        </table></div>
        {canEdit&&<form onSubmit={deposit} className="rounded-2xl border border-slate-200 p-4 grid sm:grid-cols-2 gap-3">
          <strong className="sm:col-span-2 flex items-center gap-2"><Banknote size={17}/> Record daily rider cash deposit</strong>
          <label className="text-xs font-semibold">Rider<select required value={selectedRider} onChange={e=>{setSelectedRider(e.target.value);requestId.current='';}} className="mt-1 block w-full rounded-xl border p-3"><option value="">Choose rider</option>{data.riders.filter(x=>x.remaining>0).map(r=><option key={r.rider_id} value={r.rider_id}>{r.rider_name} — {format(r.remaining)} due</option>)}</select></label>
          <label className="text-xs font-semibold">Deposit date<input required type="date" value={date} onChange={e=>{setDate(e.target.value);requestId.current='';}} className="mt-1 block w-full rounded-xl border p-3"/></label>
          <label className="text-xs font-semibold">Cash amount (BDT)<input required type="number" step="0.01" min="0.01" max={selectedBalance?.remaining||undefined} value={amount} onChange={e=>{setAmount(e.target.value);requestId.current='';}} className="mt-1 block w-full rounded-xl border p-3"/></label>
          <label className="text-xs font-semibold">Deposit reference / note<input maxLength={300} value={note} onChange={e=>{setNote(e.target.value);requestId.current='';}} className="mt-1 block w-full rounded-xl border p-3" placeholder="Daily settlement"/></label>
          <button disabled={busy} className="sm:col-span-2 rounded-xl bg-[#174b3b] p-3 font-bold text-white disabled:opacity-50">Submit cash for independent approval</button>
        </form>}
        <details><summary className="text-sm font-bold cursor-pointer">Recent rider deposits ({data.deposits.length})</summary>
          <div className="space-y-2 pt-3">{data.deposits.map(d=><div key={d.id} className="rounded-xl border p-3 text-xs">
            <strong>{d.rider_id}</strong> · {d.date} · <strong>{format(d.amount)}</strong>
            <div className="text-slate-500">{d.actor_name} {d.notes&&'· '+d.notes}</div>
            <p className={'text-xs mt-1 font-semibold '+(d.status==='pending'?'text-amber-800':'text-emerald-800')}>Status: {d.status||'approved (legacy)'} {d.approved_by_id&&'· approved by '+d.approved_by_id}</p>
            {canEdit && d.status==='pending' && !d.voided_at && <button type="button"
               disabled={busy} onClick={()=>void approveDeposit(d.id)}
               className="rounded-lg mt-2 mr-3 bg-emerald-800 px-3 py-2 text-white text-xs disabled:opacity-50">Approve cash handover (second staff)</button>}
            {d.voided_at ? <p className="mt-2 text-red-700 font-semibold">Voided {d.voided_at} by {d.voided_by} — {d.void_reason}</p> :
              canEdit && <button type="button" disabled={busy} onClick={()=>void voidDeposit(d.id)}
                className="mt-2 text-red-700 font-semibold underline disabled:opacity-50">Correct / Void deposit</button>}
          </div>)}</div>
        </details>
      </section>
      <section className="rounded-2xl bg-white border p-4 space-y-4">
        <h4 className="font-black text-lg flex items-center gap-2"><CakeSlice size={20}/> Per-Cake Production Cost</h4>
        <p className="text-xs text-slate-500">Build a cost recipe by size: ingredients, decorations, labour and packaging. Estimated profit = selling price − ingredient costs; delivery, marketing and overhead must be accounted for separately.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-xs font-semibold">Cake<select className="block w-full rounded-xl border p-3 mt-1" value={product} onChange={e=>{setProduct(e.target.value);setVariant('');}}><option value="">Choose product</option>{data.products.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
          <label className="text-xs font-semibold">Size / Variant<select className="block w-full rounded-xl border p-3 mt-1" value={variant} onChange={e=>setVariant(e.target.value)}><option value="">Choose size</option>{variants.map(v=><option value={v.id} key={v.id}>{v.name}</option>)}</select></label>
        </div>
        {variant && <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-amber-50 p-3"><small>Recipe cost</small><strong className="block text-lg">{format(recipeTotal)}</strong></div>
          <div className="rounded-xl bg-emerald-50 p-3"><small>Variant sale</small><strong className="block text-lg">{format(regular)}</strong></div>
          <div className="rounded-xl bg-blue-50 p-3"><small>Gross margin estimate</small><strong className="block text-lg">{format(regular-recipeTotal)}</strong></div>
        </div>}
        {canEdit&&variant&&<form onSubmit={recordCost} className="rounded-xl border p-3 grid sm:grid-cols-2 gap-3">
          <label className="text-xs font-semibold">Ingredient / expense<input required value={component} onChange={e=>setComponent(e.target.value)} maxLength={100} placeholder="Flour / cream / box / labour" className="block w-full rounded-xl border p-3 mt-1"/></label>
          <label className="text-xs font-semibold">Unit<input value={unitLabel} onChange={e=>setUnitLabel(e.target.value)} maxLength={30} placeholder="g / pcs / hour" className="block w-full rounded-xl border p-3 mt-1"/></label>
          <label className="text-xs font-semibold">Quantity<input required min="0.001" step="any" type="number" value={quantity} onChange={e=>setQuantity(e.target.value)} className="block w-full rounded-xl border p-3 mt-1"/></label>
          <label className="text-xs font-semibold">Cost per unit<input required min="0" step="0.01" type="number" value={unitCost} onChange={e=>setUnitCost(e.target.value)} className="block w-full rounded-xl border p-3 mt-1"/></label>
          <label className="sm:col-span-2 text-xs font-semibold">Linked ingredient stock (optional)
             <select value={inventoryItemId} onChange={e=>{const id=e.target.value;setInventoryItemId(id);
               const selected=stockOptions.find(i=>i.id===id);if(selected)setUnitLabel(selected.unit);
               recipeRequestId.current='';}}
               className="block w-full rounded-xl border p-3 mt-1">
               <option value="">Untracked expense (labour / packaging)</option>
               {stockOptions.map(i=><option key={i.id} value={i.id}>{i.name} — {i.unit} · balance {i.balance}</option>)}
             </select>
           </label>
           <button disabled={busy} className="sm:col-span-2 rounded-xl bg-[#174b3b] text-white font-bold p-3 flex items-center justify-center gap-2"><Plus size={16}/> Add recipe expense</button>
        </form>}
        {variant&&<div className="space-y-2">{showCosts.map(cost=><div key={cost.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 text-sm">
          <span><strong>{cost.component}</strong><small className="block text-slate-500">{cost.quantity} {cost.unit_label} × {format(cost.unit_cost)}</small></span>
          <span className="font-bold">{format(cost.total)}</span>
          {canEdit&&<button type="button" disabled={busy} onClick={()=>void removeCost(cost.id)} className="text-xs underline text-red-700">Archive</button>}
        </div>)}</div>}
      </section>
    </>}
  </section>;
}
