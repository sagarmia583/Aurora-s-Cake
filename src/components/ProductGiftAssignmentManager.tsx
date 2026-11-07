import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Gift, Plus, RefreshCw, Save, X} from 'lucide-react';
import {fetchCmsTable, mutateCmsTable} from '../services/sheetStaffApi';
import {parseFreeGiftSettings, serializeFreeGiftSettings} from '../utils/freeGifts';
import type {ProductGiftSettings} from '../utils/freeGifts';
import {shopErrorMessage} from '../utils/shopErrorMessage';

interface Props {endpoint:string;token:string;onUpdated:()=>void}
interface ProductOption {id:string;name:string;active:boolean}
const empty=():ProductGiftSettings=>({items:[],products:Object.create(null)});
const rawGiftRow=(rows:readonly Record<string,unknown>[]) =>
  rows.find(row=>String(row.key)==='complimentary_kit_items');

/** Assign individual complimentary gift options to individual products.
 * Uses the existing allowlisted settings row and authenticated CMS endpoints;
 * there are no new Sheet tabs, backend routes, or public write permissions.
 */
export const ProductGiftAssignmentManager: React.FC<Props>=({endpoint,token,onUpdated})=>{
  const [expanded,setExpanded]=useState(false);
  const [products,setProducts]=useState<ProductOption[]>([]);
  const [draft,setDraft]=useState<ProductGiftSettings>(empty);
  const [original,setOriginal]=useState('');
  const [hasSetting,setHasSetting]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [newGift,setNewGift]=useState('');
  const [refreshCounter,setRefreshCounter]=useState(0);

  useEffect(()=>{
    if(!expanded)return;
    let active=true;
    setLoaded(false);setError('');setNotice('');
    Promise.all([fetchCmsTable(endpoint,token,'settings'),fetchCmsTable(endpoint,token,'products')])
      .then(([settings,items])=>{
        if(!active)return;
        const row=rawGiftRow(settings.rows);
        const raw=String(row?.value??'');
        setOriginal(raw);setHasSetting(Boolean(row));
        setDraft(parseFreeGiftSettings(raw));
        setProducts(items.rows.map(item=>({
          id:String(item.id||''),name:String(item.name||''),
          active:item.is_active!==false && String(item.is_active).toLowerCase()!=='false'
        })).filter(item=>item.id&&item.name));
        setLoaded(true);
      })
      .catch(err=>{if(active)setError(shopErrorMessage(err,'Could not load product gift assignments.'));});
    return ()=>{active=false;};
  },[endpoint,token,expanded,refreshCounter]);

  const count=useMemo(()=>Object.values(draft.products).reduce((sum,list)=>sum+list.length,0),[draft]);
  const addGift=()=>{
    if(busy)return;
    const gift=newGift.trim();
    if(!gift || gift.length>80 || /[\u0000-\u001f\u007f]/.test(gift)){
      setError('একটি উপহারের নাম লিখুন (সর্বোচ্চ ৮০ অক্ষর)।');return;
    }
    if(draft.items.includes(gift)){setError('এই উপহারটি আগে থেকেই আছে।');return;}
    if(draft.items.length>=20){setError('সর্বোচ্চ ২০টি Gift Option রাখা যাবে।');return;}
    setDraft(previous=>({...previous,items:[...previous.items,gift]}));
    setNewGift('');setError('');setNotice('');
  };
  const removeGift=(gift:string)=>{
    if(busy||!window.confirm('এই উপহারটি সব কেকের নির্বাচন থেকেও সরানো হবে। চালিয়ে যাবেন?'))return;
    setDraft(previous=>{
      const products:Record<string,string[]>={};
      for(const [id,items] of Object.entries(previous.products)){
        const remaining=items.filter(item=>item!==gift);
        if(remaining.length)products[id]=remaining;
      }
      return {items:previous.items.filter(item=>item!==gift),products};
    });
    setNotice('');setError('');
  };
  const toggleGift=(productId:string,gift:string,checked:boolean)=>{
    if(busy)return;
    setDraft(previous=>{
      const products={...previous.products};
      const selected=new Set(products[productId]||[]);
      if(checked)selected.add(gift);else selected.delete(gift);
      if(selected.size)products[productId]=previous.items.filter(item=>selected.has(item));
      else delete products[productId];
      return {...previous,products};
    });
    setNotice('');setError('');
  };
  const save=useCallback(async()=>{
    if(busy||!loaded)return;
    let value:string;
    try{value=serializeFreeGiftSettings(draft);}
    catch(err){setError(shopErrorMessage(err,'Invalid gift mapping.'));return;}
    setBusy(true);setError('');setNotice('');
    try{
      // Prevent overwriting a newer owner edit made while this panel was open.
      const current=await fetchCmsTable(endpoint,token,'settings');
      const row=rawGiftRow(current.rows);
      if(String(row?.value??'')!==original||Boolean(row)!==hasSetting)
        throw new Error('Gift settings changed in another tab. Refresh before saving.');
      await mutateCmsTable(endpoint,token,'settings',hasSetting?'update':'create',
        {value},hasSetting?'complimentary_kit_items':undefined,
        hasSetting?undefined:'complimentary_kit_items');
      setOriginal(value);setHasSetting(true);
      setNotice('সংরক্ষিত হয়েছে। শুধু নির্বাচিত কেকগুলোতেই ফ্রি উপহার দেখাবে।');
      onUpdated();
    }catch(err){setError(shopErrorMessage(err,'Gift assignments could not be saved.'));}
    finally{setBusy(false);}
  },[busy,loaded,draft,endpoint,token,original,hasSetting,onUpdated]);

  return <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 sm:p-4 space-y-3" aria-label="Product-wise free gifts">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h4 className="font-bold text-emerald-950 flex items-center gap-2"><Gift size={17}/> কেকভিত্তিক ফ্রি উপহার</h4>
        <p className="text-xs text-slate-600">প্রতিটি কেকের জন্য আলাদা Gift নির্বাচন করুন। কোনো কেক নির্বাচন না করলে সেটিতে ফ্রি উপহার দেখাবে না।</p>
      </div>
      <button type="button" onClick={()=>setExpanded(v=>!v)}
        className="rounded-lg px-3 py-2 text-sm font-semibold bg-white border border-emerald-200 hover:bg-emerald-50">
        {expanded?'বন্ধ করুন':'উপহার নির্বাচন'}
      </button>
    </div>
    {expanded&&<>
      {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
      {notice&&<p role="status" className="text-sm text-emerald-900">{notice}</p>}
      {!loaded?<p className="text-sm text-slate-600">Gift options এবং কেকের তালিকা লোড হচ্ছে…</p>:<>
        <p className="text-xs text-slate-700">উপহারের তালিকাটি শুধু বেছে নেওয়ার অপশন। নিচে আলাদা কেকের ঘরে টিক দিলে উপহার প্রযোজ্য হবে।</p>
        <div className="flex flex-wrap gap-2">
          {draft.items.map(gift=><span key={gift} className="inline-flex gap-1 items-center rounded-lg border bg-white border-emerald-200 px-2 py-1 text-xs">
            {gift}<button type="button" aria-label={'Remove gift option '+gift} disabled={busy}
              className="p-1 text-red-700" onClick={()=>removeGift(gift)}><X size={13}/></button>
          </span>)}
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={newGift} onChange={event=>setNewGift(event.target.value)}
            onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();addGift();}}}
            disabled={busy} maxLength={80} placeholder="নতুন উপহারের নাম"
            className="min-w-0 flex-1 bg-white border rounded-lg px-3 py-2 text-sm" aria-label="New free gift name"/>
          <button type="button" disabled={busy} onClick={addGift}
            className="flex items-center gap-1 px-3 py-2 text-xs font-bold border rounded-lg bg-white">
            <Plus size={14}/> Gift যোগ করুন
          </button>
        </div>
        <div className="max-h-96 overflow-auto rounded-lg border border-emerald-100 divide-y bg-white">
          {products.map(product=><div key={product.id} className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <strong className="text-sm">{product.name}</strong>
              {!product.active&&<span className="text-xs text-slate-500">(নিষ্ক্রিয়)</span>}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {draft.items.map(gift=><label key={gift} className="text-xs text-slate-800 inline-flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="accent-emerald-700" checked={(draft.products[product.id]||[]).includes(gift)}
                  disabled={busy} onChange={event=>toggleGift(product.id,gift,event.target.checked)}
                  aria-label={product.name+' - '+gift}/>
                <span>{gift}</span>
              </label>)}
              {!draft.items.length&&<span className="text-xs text-slate-500">প্রথমে উপহারের অপশন যোগ করুন।</span>}
            </div>
          </div>)}
        </div>
        <div className="flex justify-between gap-2 items-center flex-wrap">
          <p className="text-xs text-slate-600">{products.length} টি কেক · {count} টি নির্দিষ্ট Gift নির্বাচন</p>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={()=>setRefreshCounter(value=>value+1)}
              className="rounded-lg border px-3 py-2 flex items-center gap-1 text-xs"><RefreshCw size={13}/> Refresh</button>
            <button type="button" disabled={busy} onClick={()=>void save()}
              className="rounded-lg bg-emerald-800 text-white px-4 py-2 flex items-center gap-1 text-xs font-bold disabled:opacity-60">
              <Save size={14}/>{busy?'Saving...':'Save Gift Assignments'}
            </button>
          </div>
        </div>
      </>}
    </>}
  </div>;
};
