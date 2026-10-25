import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Database, RefreshCw, Plus, Save, Archive, Search } from 'lucide-react';
import { CMS_TABLE_OPTIONS, fetchCmsTable, mutateCmsTable } from '../services/sheetStaffApi';
import type { CmsSnapshot, CmsTable } from '../services/sheetStaffApi';

interface Props {endpoint:string;token:string;role:'super_admin'|'admin';onUpdated:()=>void}
type Cell = string|number|boolean;
const numberFields=new Set(['sort_order','base_price','sale_price','price','weight_grams','rating','review_count','delivery_fee','discount_value','min_order_amount','max_discount_amount','usage_count']);
const boolFields=new Set(['is_active','is_featured','accepting_orders','delivery_enabled']);
const emptyOptionalNumbers=new Set(['sale_price','max_discount_amount','rating']);
const display=(row:Record<string,Cell>,table:CmsTable)=>table==='settings'||table==='content'
  ? String(row.key||''):String(row.name||row.title||row.question||row.code||row.slot_label||row.label||row.id||'');
const convert=(key:string,value:Cell):Cell=>{
  if(boolFields.has(key))return value===true||value==='true';
  if(numberFields.has(key)){
    if(value===''&&emptyOptionalNumbers.has(key))return '';
    return Number(value);
  }
  return String(value??'');
};
const isLocked=(name:string)=>name==='id'||name==='key'||name==='created_at';
const columnsFor=(data:CmsSnapshot)=>data.columns.filter(col=>!isLocked(col));
export const WebsiteManager:React.FC<Props>=({endpoint,token,role,onUpdated})=>{
  const [table,setTable]=useState<CmsTable>('products');
  const [data,setData]=useState<CmsSnapshot|null>(null);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [search,setSearch]=useState('');
  const [selected,setSelected]=useState('');
  const [creating,setCreating]=useState(false);
  const [newKey,setNewKey]=useState('');
  const [draft,setDraft]=useState<Record<string,Cell>>({});
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{setData(await fetchCmsTable(endpoint,token,table));}
    catch(e){setError(e instanceof Error?e.message:'Unable to load website records.');}
    finally{setLoading(false);}
  },[endpoint,token,table]);
  useEffect(()=>{setSelected('');setCreating(false);setDraft({});setSearch('');void load();},[load]);
  const filtered=useMemo(()=>data?.rows.filter(row=>
    Object.values(row).slice(0,8).some(value=>String(value).toLowerCase().includes(search.toLowerCase()))
  )||[],[data,search]);
  const keyField=table==='settings'||table==='content'?'key':'id';
  const choose=(row:Record<string,Cell>)=>{
    setCreating(false);setSelected(String(row[keyField]));setNewKey('');
    setDraft(Object.fromEntries(columnsFor(data!).map(field=>[field,row[field]??''])));
    setNotice('');setError('');
  };
  const create=()=>{
    if(!data)return;
    setCreating(true);setSelected('');setNewKey('');
    setDraft(Object.fromEntries(columnsFor(data).map(field=>
      [field,boolFields.has(field)?field==='is_active':numberFields.has(field)?0:field==='discount_type'?'percentage':field==='status'?'pending':''])));
    setNotice('');setError('');
  };
  const save=async()=>{
    if(!data||saving)return;
    setSaving(true);setError('');setNotice('');
    try{
      const values:Record<string,Cell>={};
      for(const field of columnsFor(data))values[field]=convert(field,draft[field]??'');
      const settingsKey=creating?newKey:selected;
      if(table==='settings'&&['accepting_orders','delivery_enabled'].includes(settingsKey)) {
        values.value=draft.value===true||draft.value==='true';
      }
      await mutateCmsTable(endpoint,token,table,creating?'create':'update',values,creating?undefined:selected,
        creating&&(table==='settings'||table==='content')?newKey:undefined);
      await load();setSelected('');setCreating(false);setDraft({});
      setNotice('Saved to the live Google Sheet. Website public cache invalidated.');
      onUpdated();
    }catch(e){setError(e instanceof Error?e.message:'Save failed.');}
    finally{setSaving(false);}
  };
  const archive=async()=>{
    if(!data||!selected||role!=='super_admin'||saving)return;
    if(!window.confirm('Archive this public record? Historical orders stay intact. This cannot be used for private orders.'))return;
    setSaving(true);setError('');setNotice('');
    try{
      await mutateCmsTable(endpoint,token,table,'delete',{},selected);
      await load();setSelected('');setDraft({});setNotice('Archived in Google Sheets without deleting historical orders.');
      onUpdated();
    }catch(e){setError(e instanceof Error?e.message:'Archive failed.');}
    finally{setSaving(false);}
  };
  return <section className="rounded-2xl border border-emerald-200 bg-white p-4 md:p-5 space-y-4" aria-label="Live Website Manager">
    <div className="flex justify-between gap-3 items-start flex-wrap">
      <div>
        <h3 className="text-xl font-black flex items-center gap-2"><Database size={20}/> Live Website Manager</h3>
        <p className="text-sm text-slate-600">Create, edit and archive real Google Sheets website content. No demo/local-only saves.</p>
      </div>
      <button type="button" disabled={loading||saving} onClick={()=>void load()} className="rounded-xl border px-3 py-2 flex items-center gap-2 text-sm">
        <RefreshCw size={15}/> Refresh
      </button>
    </div>
    {error&&<p role="alert" className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">{error}</p>}
    {notice&&<p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    <div className="grid gap-3 sm:grid-cols-[minmax(0,240px)_1fr_auto] items-end">
      <label className="text-sm font-semibold">Website Section
        <select value={table} onChange={e=>setTable(e.target.value as CmsTable)} className="block w-full mt-1 border rounded-xl p-2">
          {CMS_TABLE_OPTIONS.map(o=><option key={o.table} value={o.table}>{o.label}</option>)}
        </select>
      </label>
      <label className="text-sm font-semibold flex-1">Find a record
        <span className="flex items-center gap-1 mt-1 rounded-xl border px-2"><Search size={14}/>
          <input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search this section"
            className="p-2 flex-1 min-w-0 outline-none"/>
        </span>
      </label>
      <button disabled={!data||loading} type="button" onClick={create} className="rounded-xl bg-emerald-800 px-4 py-3 text-white text-sm font-semibold flex items-center gap-2">
        <Plus size={15}/> Create
      </button>
    </div>
    <p className="text-xs text-slate-500">{data?.total??0} records {data?.truncated?'(showing first 500; edit the Sheet directly for larger collections)':''}. Select a record to edit.</p>
    {loading&&<p role="status" className="text-sm">Loading live Google Sheet…</p>}
    <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_minmax(0,2fr)]">
      <div className="rounded-xl border max-h-96 overflow-auto">
        {filtered.slice(0,500).map(row=>{
          const id=String(row[keyField]);
          return <button type="button" key={id} onClick={()=>choose(row)}
            className={'block text-left w-full p-3 border-b text-sm hover:bg-emerald-50 '+(selected===id?'bg-emerald-100':'')}>
            <strong className="block break-words">{display(row,table)}</strong>
            <span className="text-xs text-slate-500 break-all">{id}</span>
            {row.is_active===false&&<span className="text-xs text-red-700 ml-2">Archived</span>}
          </button>;
        })}
        {!filtered.length&&<p className="p-4 text-sm text-slate-500">No matching records.</p>}
      </div>
      {data&&(creating||selected) ? (
        <div className="rounded-xl border p-4 space-y-4">
          <h4 className="font-bold">{creating?'Create new record':'Edit '+selected}</h4>
          {creating&&(table==='settings'||table==='content')&&<label className="block text-xs font-semibold">Approved website key
            <input className="block w-full border rounded-lg p-2 mt-1" required value={newKey}
              placeholder="e.g. footer_about" onChange={e=>setNewKey(e.target.value)}/>
          </label>}
          <div className="grid sm:grid-cols-2 gap-3 max-h-[450px] overflow-y-auto pr-1">
            {columnsFor(data).map(field=><label key={field} className="block text-xs font-semibold text-slate-700">
              {field.replaceAll('_',' ')}
              {boolFields.has(field) || (table==='settings'&&field==='value'&&(typeof draft[field]==='boolean'||['accepting_orders','delivery_enabled'].includes(creating?newKey:selected))) ?
                <select aria-label={field} value={String(draft[field]??false)} onChange={e=>setDraft(prev=>({...prev,[field]:e.target.value==='true'}))}
                  className="block w-full border rounded-lg p-2 mt-1"><option value="true">Yes / ON</option><option value="false">No / OFF</option></select>
               :field==='discount_type'?
                <select value={String(draft[field]??'percentage')} onChange={e=>setDraft(prev=>({...prev,[field]:e.target.value}))}
                  className="block w-full border rounded-lg p-2 mt-1"><option value="percentage">Percentage</option><option value="fixed">Fixed</option></select>
               :field==='status'&&table==='reviews'?
                <select value={String(draft[field]??'pending')} onChange={e=>setDraft(prev=>({...prev,[field]:e.target.value}))}
                  className="block w-full border rounded-lg p-2 mt-1">{['pending','approved','rejected','hidden'].map(o=><option key={o}>{o}</option>)}</select>
               :<textarea value={String(draft[field]??'')} rows={/description|body|content|note|address|value|_ids|gallery_images/.test(field)?3:1}
                  onChange={e=>setDraft(prev=>({...prev,[field]:e.target.value}))}
                  className="block w-full border rounded-lg p-2 mt-1 resize-y"/>}
            </label>)}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button type="button" disabled={saving||loading} onClick={()=>void save()} className="rounded-xl bg-emerald-800 text-white px-4 py-2 font-semibold text-sm flex gap-2 items-center">
              <Save size={15}/>{saving?'Saving…':creating?'Create in Sheet':'Save to Sheet'}
            </button>
            {!creating&&role==='super_admin'&&table!=='settings'&&table!=='content'&&
              <button type="button" disabled={saving} onClick={()=>void archive()}
                className="rounded-xl border border-red-300 text-red-700 px-3 py-2 text-sm flex items-center gap-2">
                <Archive size={15}/> Archive / hide
              </button>}
            <button type="button" onClick={()=>{setCreating(false);setSelected('');setDraft({});}} className="rounded-xl border px-3 py-2 text-sm">Cancel</button>
          </div>
          <p className="text-xs text-slate-500">Archive/hide is the safe alternative to permanent deletion, especially for products or coupons referenced by existing orders. Changes here affect only approved public tables.</p>
        </div>
      ) : <p className="text-sm text-slate-500 rounded-xl bg-slate-50 p-5">Choose a record or create a new item.</p>}
    </div>
  </section>;
};