import React, { useEffect, useState } from 'react';
import { RefreshCw, Save, Settings2 } from 'lucide-react';
import { fetchLiveCatalog, updateLiveCatalog } from '../services/sheetStaffApi';
import type { LiveCatalog } from '../services/sheetStaffApi';

interface Props {endpoint:string;token:string;onUpdated:()=>void}
export const LiveShopEditor:React.FC<Props>=({endpoint,token,onUpdated})=>{
  const [catalog,setCatalog]=useState<LiveCatalog|null>(null);
  const [drafts,setDrafts]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const load=async()=>{
    setBusy(true);setError('');
    try{setCatalog(await fetchLiveCatalog(endpoint,token));setDrafts({});}
    catch(e){setError(e instanceof Error?e.message:'Unable to load shop settings.');}
    finally{setBusy(false);}
  };
  useEffect(()=>{void load();},[endpoint,token]);
  const save=async(table:'products'|'product_variants'|'settings',id:string,field:string,value:string|number|boolean)=>{
    if(busy)return;
    setBusy(true);setError('');setNotice('');
    try{
      await updateLiveCatalog(endpoint,token,table,id,field,value);
      setCatalog(await fetchLiveCatalog(endpoint,token));
      setDrafts({});
      setNotice('Saved to the live Google Sheet. Public content cache has been cleared.');
      onUpdated();
    }catch(e){setError(e instanceof Error?e.message:'Unable to save your changes.');}
    finally{setBusy(false);}
  };
  const savePrices=async(variant:LiveCatalog['variants'][number])=>{
    if(busy)return;
    const regular=drafts[variant.id+':price']??String(variant.price);
    const sale=drafts[variant.id+':sale_price']??String(variant.sale_price);
    if(regular.trim()===''||!Number.isFinite(Number(regular))||Number(regular)<0 ||
       (sale!==''&&(!Number.isFinite(Number(sale))||Number(sale)<0))){
      setError('Enter valid non-negative cake prices.');return;
    }
    const regularChanged=Number(regular)!==variant.price;
    const saleChanged=(sale===''?'':Number(sale))!==variant.sale_price;
    if(!regularChanged&&!saleChanged){setNotice('No price changes to save.');return;}
    setBusy(true);setError('');setNotice('');
    try{
      if(regularChanged)await updateLiveCatalog(endpoint,token,'product_variants',variant.id,'price',Number(regular));
      if(saleChanged)await updateLiveCatalog(endpoint,token,'product_variants',variant.id,'sale_price',sale===''?'':Number(sale));
      setCatalog(await fetchLiveCatalog(endpoint,token));setDrafts({});
      setNotice('Updated cake prices in Google Sheets.');onUpdated();
    }catch(e){setError(e instanceof Error?e.message:'Unable to save prices. Refresh and inspect saved values.');}
    finally{setBusy(false);}
  };
  return <section className="rounded-2xl border border-emerald-200 bg-white p-5 space-y-4">
    <header className="flex items-center justify-between gap-2">
      <div><h3 className="text-lg font-black flex items-center gap-2"><Settings2 size={19}/> Live shop management</h3>
        <p className="text-xs text-slate-600">Changes update the real Google Sheet, not the local demo.</p></div>
      <button type="button" onClick={()=>void load()} disabled={busy} className="flex gap-2 items-center text-sm border rounded-lg px-3 py-2"><RefreshCw size={15}/> Refresh</button>
    </header>
    {error&&<p role="alert" className="bg-red-50 p-3 text-red-800 rounded-xl text-sm">{error}</p>}
    {notice&&<p role="status" className="bg-emerald-50 p-3 text-emerald-900 rounded-xl text-sm">{notice}</p>}
    {!catalog?<p className="text-sm text-slate-500">Loading shop information…</p>:<>
      <div className="rounded-xl bg-emerald-50 p-4 space-y-2">
        <strong>{catalog.settings.shop_name}</strong>
        <div className="flex gap-2 flex-wrap">
          {(['accepting_orders','delivery_enabled'] as const).map(field=><button key={field} type="button" disabled={busy}
            onClick={()=>void save('settings',field,field,!catalog.settings[field])}
            className={'border rounded-lg px-3 py-2 text-sm font-semibold '+(catalog.settings[field]?'bg-emerald-700 text-white':'bg-white text-red-800')}>
              {field==='accepting_orders'?'Accepting orders':'Delivery available'}: {catalog.settings[field]?'ON':'OFF'}
          </button>)}
        </div>
      </div>
      <div className="space-y-3">
        <h4 className="font-bold">Products and sizes ({catalog.products.length})</h4>
        {catalog.products.map(product=><div key={product.id} className="rounded-xl border p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong>{product.name}</strong>
            <button type="button" disabled={busy}
              onClick={()=>void save('products',product.id,'is_active',!product.is_active)}
              className={'rounded-lg border px-3 py-1.5 text-sm '+(product.is_active?'bg-emerald-50 text-emerald-900':'bg-red-50 text-red-800')}>
              {product.is_active?'Published':'Hidden'} · Toggle
            </button>
          </div>
          <div className="grid gap-2">
            {catalog.variants.filter(variant=>variant.product_id===product.id).map(variant=><div key={variant.id}
              className="grid grid-cols-1 sm:grid-cols-[1fr_105px_105px_auto_auto] gap-2 items-center bg-slate-50 rounded-lg p-2 text-sm">
              <span className="font-medium">{variant.name}</span>
              <label className="text-xs text-slate-600">Price
                <input type="number" min="0" step=".01" aria-label={variant.name+' regular price'} value={drafts[variant.id+':price']??String(variant.price)}
                  onChange={e=>setDrafts(prev=>({...prev,[variant.id+':price']:e.target.value}))}
                  className="w-full border rounded-md p-1.5 text-sm bg-white"/></label>
              <label className="text-xs text-slate-600">Sale price
                <input type="number" min="0" step=".01" placeholder="none" aria-label={variant.name+' sale price'} value={drafts[variant.id+':sale_price']??String(variant.sale_price)}
                  onChange={e=>setDrafts(prev=>({...prev,[variant.id+':sale_price']:e.target.value}))}
                  className="w-full border rounded-md p-1.5 text-sm bg-white"/></label>
              <button type="button" disabled={busy} onClick={()=>void savePrices(variant)} className="flex gap-1 items-center justify-center px-3 py-2 text-white bg-slate-900 rounded-lg text-xs disabled:opacity-40"><Save size={13}/> Save price</button>
              <button type="button" disabled={busy} onClick={()=>void save('product_variants',variant.id,'is_active',!variant.is_active)}
                className={'rounded-lg border px-2 py-2 text-xs '+(variant.is_active?'bg-green-50':'bg-red-50')}>
                {variant.is_active?'Active':'Hidden'}
              </button>
            </div>)}
          </div>
        </div>)}
      </div>
    </>}
  </section>;
};