import React,{useEffect,useRef,useState} from 'react';
import {inventoryAction,type InventoryState} from '../services/inventoryApi';
type Props={endpoint:string;token:string;canEdit:boolean};
const taka=(n:number)=>'৳'+Number(n||0).toLocaleString('en-BD');
export default function InventoryPanel({endpoint,token,canEdit}:Props){
 const [data,setData]=useState<InventoryState|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [stockName,setStockName]=useState(''),[unit,setUnit]=useState('g'),[level,setLevel]=useState('0');
 const [itemId,setItemId]=useState(''),[delta,setDelta]=useState(''),[reason,setReason]=useState(''),[unitCost,setUnitCost]=useState('0');
 const [orderId,setOrderId]=useState(''),[refundAmount,setRefundAmount]=useState(''),[refundReason,setRefundReason]=useState(''),[kind,setKind]=useState('refund');
 const stockKey=useRef(''),refundKey=useRef('');
 const load=async()=>{setBusy(true);setError('');try{setData(await inventoryAction(endpoint,token,'staff_inventory_summary'));}catch(e){setError(e instanceof Error?e.message:'Unable to load inventory');}finally{setBusy(false);}};
 useEffect(()=>{void load();},[endpoint,token]);
 const send=async(action:string,input:Record<string,unknown>,message:string)=>{
  if(busy||!canEdit)return false;
  setBusy(true);setError('');setNotice('');
  try{const next=await inventoryAction(endpoint,token,action,input);setData(next);setNotice(message);return true;}
  catch(e){setError(e instanceof Error?e.message:'Operation not saved. Retry with the same request ID.');return false;}
  finally{setBusy(false);}
 };
 const addStock=async(e:React.FormEvent)=>{e.preventDefault();if(await send('staff_stock_item_create',{name:stockName,unit,reorder_level:Number(level)},'Stock item added.'))setStockName('');};
 const adjust=async(e:React.FormEvent)=>{e.preventDefault();if(!stockKey.current)stockKey.current=crypto.randomUUID();const key=stockKey.current;
  if(await send('staff_stock_adjust',{request_id:key,item_id:itemId,delta:Number(delta),reason,unit_cost:Number(unitCost)},'Stock movement saved.')){stockKey.current='';setDelta('');setReason('');}
 };
 const requestRefund=async(e:React.FormEvent)=>{e.preventDefault();if(!refundKey.current)refundKey.current=crypto.randomUUID();const key=refundKey.current;
  if(await send('staff_refund_request',{request_id:key,order_id:orderId,kind,amount:Number(refundAmount),reason:refundReason},'Refund request recorded for independent review.')){refundKey.current='';setOrderId('');setRefundAmount('');setRefundReason('');}
 };
 const actionRefund=async(id:string,action:string)=>{const note=action==='staff_refund_settle'?window.prompt('Cash/transfer settlement evidence (8+ characters):'):'';
  if(note===null)return;
  await send(action,{refund_id:id,settlement_note:note},action==='staff_refund_approve'?'Refund independently approved.':'Refund payout recorded as settled.');
 };
 return <section className="space-y-4" aria-label="Inventory and refund accounting">
  <div className="flex justify-between gap-3"><div><h3 className="text-lg font-black">Inventory & Refund Accounting</h3><p className="text-xs text-slate-500">Private ledger · Production costs frozen when cake preparation begins</p></div>
    <button type="button" disabled={busy} onClick={()=>void load()} className="rounded-xl border px-3 py-2 text-xs font-bold">Refresh</button></div>
  {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  {notice&&<p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm">{notice}</p>}
  {!data?<p className="text-sm text-slate-500">Loading private Sheets data…</p>:<>
    <div className="rounded-xl border bg-white p-4 space-y-3"><h4 className="font-bold">Ingredient Stock</h4>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="text-left">Ingredient</th><th>Balance</th><th>Reorder</th></tr></thead><tbody>
      {data.stock.map(x=><tr key={x.id} className={'border-t '+(x.balance<=x.reorder_level?'bg-amber-50':'')}><td className="py-2">{x.name}</td><td className="text-center">{x.balance} {x.unit}</td><td className="text-center">{x.reorder_level}</td></tr>)}
      </tbody></table></div>
      {canEdit&&<form onSubmit={addStock} className="grid sm:grid-cols-4 gap-2">
        <input aria-label="Ingredient name" required value={stockName} onChange={e=>setStockName(e.target.value)} placeholder="Ingredient" className="border rounded-lg p-2"/>
        <select aria-label="Unit" value={unit} onChange={e=>setUnit(e.target.value)} className="border rounded-lg p-2">{['g','kg','ml','l','pcs'].map(x=><option key={x}>{x}</option>)}</select>
        <input aria-label="Reorder level" type="number" min="0" step=".001" value={level} onChange={e=>setLevel(e.target.value)} className="border rounded-lg p-2"/>
        <button disabled={busy} className="rounded-lg bg-emerald-900 text-white p-2">Add Stock Item</button>
      </form>}
      {canEdit&&<form onSubmit={adjust} className="grid sm:grid-cols-5 gap-2">
        <select aria-label="Stock item" required value={itemId} onChange={e=>{setItemId(e.target.value);stockKey.current='';}} className="border rounded-lg p-2"><option value="">Choose stock</option>{data.stock.map(x=><option key={x.id} value={x.id}>{x.name} · {x.unit}</option>)}</select>
        <input aria-label="Quantity change" required type="number" step=".001" value={delta} onChange={e=>{setDelta(e.target.value);stockKey.current='';}} placeholder="+ restock / - waste" className="border rounded-lg p-2"/>
        <input aria-label="Unit cost" type="number" min="0" step=".01" value={unitCost} onChange={e=>setUnitCost(e.target.value)} className="border rounded-lg p-2"/>
        <input aria-label="Adjustment reason" required minLength={5} value={reason} onChange={e=>{setReason(e.target.value);stockKey.current='';}} placeholder="Restock or wastage reason" className="border rounded-lg p-2"/>
        <button disabled={busy} className="rounded-lg bg-emerald-900 text-white p-2">Save Movement</button>
      </form>}
    </div>
    <div className="rounded-xl border bg-white p-4 space-y-3"><h4 className="font-bold">Refund / Return Ledger</h4>
      {canEdit&&<form onSubmit={requestRefund} className="grid sm:grid-cols-5 gap-2">
        <input required aria-label="Private Order ID" value={orderId} onChange={e=>{setOrderId(e.target.value);refundKey.current='';}} placeholder="Order ID" className="border rounded-lg p-2"/>
        <select aria-label="Refund type" value={kind} onChange={e=>setKind(e.target.value)} className="border rounded-lg p-2"><option value="refund">Refund</option><option value="return">Return</option></select>
        <input required aria-label="Refund amount" type="number" min=".01" step=".01" value={refundAmount} onChange={e=>{setRefundAmount(e.target.value);refundKey.current='';}} placeholder="Amount" className="border rounded-lg p-2"/>
        <input required aria-label="Reason" minLength={8} value={refundReason} onChange={e=>{setRefundReason(e.target.value);refundKey.current='';}} placeholder="Reason (8+ chars)" className="border rounded-lg p-2"/>
        <button disabled={busy} className="rounded-lg bg-emerald-900 text-white p-2">Request</button>
      </form>}
      <div className="space-y-2">{data.refunds.map(r=><div key={r.id} className="flex flex-wrap items-center justify-between border rounded-lg p-3 gap-3 text-sm">
        <span><strong>{r.kind} · {taka(r.amount)}</strong><small className="block text-slate-500">{r.order_id} · {r.reason}</small><small>Status: {r.status} · by {r.created_by}</small></span>
        {canEdit&&r.status==='requested'&&<button type="button" disabled={busy} onClick={()=>void actionRefund(r.id,'staff_refund_approve')} className="border rounded-lg p-2">Second staff approve</button>}
        {canEdit&&r.status==='approved'&&<button type="button" disabled={busy} onClick={()=>void actionRefund(r.id,'staff_refund_settle')} className="border rounded-lg p-2">Record payout</button>}
      </div>)}</div>
    </div>
    <div className="rounded-xl border bg-white p-4"><h4 className="font-bold mb-3">Historical Production Cost Snapshots</h4>
      <div className="space-y-2">{data.cost_snapshots.map(x=><details key={x.id} className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer font-semibold">{x.order_number} · {taka(x.total_cost)} {x.missing_recipe?'· Missing recipe':''}</summary>
        <p className="text-xs text-slate-500 mt-2">Frozen at {x.recorded_at} · Order {x.order_id}</p>
        <pre className="text-xs whitespace-pre-wrap overflow-x-auto">{x.lines_json}</pre>
      </details>)}</div>
    </div>
  </>}
 </section>;
}
