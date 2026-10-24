import React, { useEffect, useState } from 'react';
import { MessageCircle, RefreshCw } from 'lucide-react';
import { fetchStaffCustomCakes, quoteStaffCustomCake } from '../services/sheetCustomCake';
import type { CustomCakeRequest } from '../services/sheetCustomCake';
interface Props {endpoint:string;token:string}
export const CustomCakeQueue:React.FC<Props>=({endpoint,token})=>{
  const [items,setItems]=useState<CustomCakeRequest[]>([]);
  const [prices,setPrices]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const refresh=async()=>{
    setBusy(true);setError('');
    try{setItems(await fetchStaffCustomCakes(endpoint,token));}
    catch(e){setError(e instanceof Error?e.message:'Could not fetch private custom cake requests.');}
    finally{setBusy(false);}
  };
  useEffect(()=>{void refresh();},[endpoint,token]);
  const update=async(item:CustomCakeRequest,status:'quoted'|'declined')=>{
    const price=Number(prices[item.request_id]??item.quoted_price??0);
    if(status==='quoted'&&(!Number.isFinite(price)||price<=0)){
      setError('Enter a valid quoted price before confirming.');return;
    }
    setBusy(true);setError('');setNotice('');
    try{
      await quoteStaffCustomCake(endpoint,token,item.request_id,status,price);
      setItems(await fetchStaffCustomCakes(endpoint,token));
      setNotice('Custom cake quotation saved in the private Sheet. Contact the customer to confirm.');
    }catch(e){setError(e instanceof Error?e.message:'Cannot save the quotation.');}
    finally{setBusy(false);}
  };
  return <section className="bg-white border rounded-2xl p-5 space-y-4">
    <header className="flex items-center justify-between gap-3"><div>
      <h3 className="text-xl font-bold">Custom Cake Requests ({items.length})</h3>
      <p className="text-xs text-slate-600">Private requests, not confirmed orders. No payment is collected here.</p>
    </div><button type="button" disabled={busy} onClick={()=>void refresh()} className="border rounded-lg px-3 py-2 text-sm flex gap-2 items-center"><RefreshCw size={14}/> Refresh</button></header>
    {error&&<p role="alert" className="text-sm rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}
    {notice&&<p role="status" className="text-sm rounded-xl bg-emerald-50 p-3 text-emerald-900">{notice}</p>}
    {items.length===0&&<p className="text-sm text-slate-500">No custom cake requests have been received.</p>}
    {items.map(item=><article className="p-4 rounded-xl border space-y-3" key={item.id}>
      <div className="flex gap-2 flex-wrap justify-between">
        <div><strong>{item.cake_type}</strong> · {item.approx_size}<p className="text-sm">{item.customer_name} · <a href={'tel:'+item.customer_phone} className="underline">{item.customer_phone}</a></p></div>
        <span className="text-xs font-bold text-emerald-800">{item.status}</span>
      </div>
      <p className="text-sm text-slate-700">Flavour: {item.flavor} · Theme: {item.color_theme}</p>
      {item.writing_text&&<p className="text-sm">Cake writing: {item.writing_text}</p>}
      {item.instructions&&<p className="text-sm text-slate-700">Notes: {item.instructions}</p>}
      {item.reference_image_url&&<a href={item.reference_image_url} target="_blank" rel="noopener noreferrer" className="underline text-sm">Open reference photo</a>}
      <p className="text-xs text-slate-500 break-all">Reference: {item.request_id}</p>
      <div className="flex gap-2 items-end flex-wrap">
        <label className="text-sm">Final quotation (৳)
          <input aria-label={'Quote for '+item.cake_type} type="number" min="1" step=".01" value={prices[item.request_id]??String(item.quoted_price||'')} onChange={e=>setPrices(p=>({...p,[item.request_id]:e.target.value}))}
            className="block w-36 border rounded-lg p-2"/></label>
        <button type="button" disabled={busy||item.status==='declined'} onClick={()=>void update(item,'quoted')}
          className="bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-40">Save quote</button>
        <button type="button" disabled={busy||item.status==='declined'} onClick={()=>void update(item,'declined')}
          className="border px-4 py-2 rounded-lg text-sm disabled:opacity-40">Decline</button>
        <a href={'tel:'+item.customer_phone} className="flex items-center gap-1 px-3 py-2 text-sm border rounded-lg"><MessageCircle size={14}/> Call customer</a>
      </div>
    </article>)}
  </section>;
};