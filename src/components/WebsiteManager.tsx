import { shopErrorMessage } from '../utils/shopErrorMessage';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Store, CakeSlice, Gift, SlidersHorizontal, Pencil, RefreshCw, Plus, Save, Archive, Search } from 'lucide-react';
import { CMS_TABLE_OPTIONS, fetchCmsTable, mutateCmsTable, uploadCmsImage } from '../services/sheetStaffApi';
import { ProductGiftAssignmentManager } from './ProductGiftAssignmentManager';
import { CakeQuickEditor } from './CakeQuickEditor';
import type { CmsSnapshot, CmsTable } from '../services/sheetStaffApi';

interface Props {endpoint:string;token:string;role:'super_admin'|'admin';onUpdated:()=>void}
type Cell = string|number|boolean;
const workspaces = [
  {id:'cakes',title:'কেক, সাইজ ও দাম',description:'মেনুতে কেক যোগ করুন বা দাম ও অফার বদলান।',icon:CakeSlice},
  {id:'gifts',title:'ফ্রি উপহার',description:'কোন কেকের সঙ্গে কোন উপহার থাকবে সেটি বাছুন।',icon:Gift},
  {id:'records',title:'ওয়েবসাইট সেটিংস',description:'দোকানের তথ্য, ছবি, কুপন ও ডেলিভারি সামলান।',icon:SlidersHorizontal},
] as const;
const recordGroups: {label:string;tables:CmsTable[]}[] = [
  {label:'দোকান ও ওয়েবসাইট',tables:['settings','content','hero_slides','highlights','banners','links','faqs']},
  {label:'মেনু',tables:['categories','products','product_variants','flavors','product_addons']},
  {label:'ডেলিভারি ও অফার',tables:['delivery_zones','delivery_slots','coupons','reviews']},
];
const quickSections = [
  {table:'settings',label:'দোকানের তথ্য ও লোগো'},
  {table:'hero_slides',label:'হোমপেজের ছবি'},
  {table:'delivery_zones',label:'ডেলিভারি এলাকা'},
  {table:'coupons',label:'কুপন'},
] satisfies {table:CmsTable;label:string}[];
const fieldLabels: Record<string,string> = {
  name:'নাম', title:'শিরোনাম', description:'বিবরণ', value:'তথ্য বা লেখা',
  is_active:'ওয়েবসাইটে দেখাবেন?', image_url:'ছবির লিংক', gallery_images:'গ্যালারির ছবি',
  base_price:'মূল দাম', price:'মূল দাম', sale_price:'অফার মূল্য', delivery_fee:'ডেলিভারি চার্জ',
  slot_label:'ডেলিভারি সময়', sort_order:'দেখানোর ক্রম', product_id:'কেকের আইডি',
  code:'কুপন কোড', question:'প্রশ্ন', answer:'উত্তর',
};
const recordNames: Record<string,string> = {
  shop_name:'দোকানের নাম', logo_url:'দোকানের লোগো', profile_image_url:'দোকানের ছবি',
  facebook_url:'ফেসবুক পেজ', phone:'ফোন নম্বর', address:'ঠিকানা', email:'ইমেইল',
  accepting_orders:'অর্ডার নেওয়া', delivery_enabled:'ডেলিভারি চালু',
  hero_title:'হোমপেজের শিরোনাম',
};
const numberFields=new Set(['sort_order','base_price','sale_price','price','weight_grams','rating','review_count','delivery_fee','discount_value','min_order_amount','max_discount_amount','max_orders_per_day','usage_count','cost_ingredients','cost_packaging','cost_delivery','cost_other','sold_count']);
const boolFields=new Set(['is_active','is_featured','accepting_orders','delivery_enabled']);
const emptyOptionalNumbers=new Set(['sale_price','max_discount_amount','max_orders_per_day','rating','cost_ingredients','cost_packaging','cost_delivery','cost_other','sold_count']);
const display=(row:Record<string,Cell>,table:CmsTable)=>table==='settings'||table==='content'
  ? (recordNames[String(row.key)] || String(row.key||'').replaceAll('_',' ')):String(row.name||row.title||row.question||row.code||row.slot_label||row.label||row.id||'');
const jsonArrayFields=new Set(['gallery_images','allowed_flavor_ids','allowed_addon_ids']);
const normalizeStringArrayJson=(raw:unknown):string=>{
  if(raw===undefined||raw===null)return '[]';
  const str=String(raw).trim();
  if(!str)return '[]';
  try{
    const parsed=JSON.parse(str);
    if(Array.isArray(parsed)){
      const items=parsed.map(x=>String(x||'').trim()).filter(Boolean);
      return JSON.stringify(items);
    }
    if(typeof parsed==='string'&&parsed.trim()){
      return JSON.stringify([parsed.trim()]);
    }
  }catch{}
  const items=str.split(/[\n,]+/).map(s=>s.trim()).filter(Boolean);
  return JSON.stringify(items);
};
const convert=(key:string,value:Cell):Cell=>{
  if(boolFields.has(key))return value===true||value==='true';
  if(numberFields.has(key)){
    if(value===''&&emptyOptionalNumbers.has(key))return '';
    return Number(value);
  }
  if(jsonArrayFields.has(key)){
    return normalizeStringArrayJson(value);
  }
  return String(value??'');
};
const isLocked=(name:string)=>name==='id'||name==='key'||name==='created_at';
const columnsFor=(data:CmsSnapshot)=>data.columns.filter(col=>!isLocked(col)&&
  !(data.table==='products'&&['sold_count','rating','review_count'].includes(col)));
export const WebsiteManager:React.FC<Props>=({endpoint,token,role,onUpdated})=>{
  const [table,setTable]=useState<CmsTable>('products');
  const [workspace,setWorkspace]=useState<(typeof workspaces)[number]['id']>('cakes');
  const [giftsOpened,setGiftsOpened]=useState(false);
  const [data,setData]=useState<CmsSnapshot|null>(null);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [search,setSearch]=useState('');
  const [selected,setSelected]=useState('');
  const [creating,setCreating]=useState(false);
  const [newKey,setNewKey]=useState('');
  const [draft,setDraft]=useState<Record<string,Cell>>({});
  const mounted=useRef(true);
  const requestVersion=useRef(0);
  const editorVersion=useRef(0);
  const loadingRef=useRef(false);
  const operation=useRef<object|null>(null);
  const source=useRef({endpoint,token,table});
  source.current={endpoint,token,table};
  const sameSource=(expected:typeof source.current)=>mounted.current&&
    source.current.endpoint===expected.endpoint&&source.current.token===expected.token&&source.current.table===expected.table;
  useEffect(()=>{
    mounted.current=true;
    return ()=>{mounted.current=false;requestVersion.current++;editorVersion.current++;};
  },[]);
  const load=useCallback(async()=>{
    const expected={endpoint,token,table};
    if(!sameSource(expected))return false;
    const version=++requestVersion.current;
    loadingRef.current=true;
    setLoading(true);setError('');
    try{
      const snapshot=await fetchCmsTable(endpoint,token,table);
      if(!sameSource(expected)||version!==requestVersion.current)return false;
      setData(snapshot);return true;
    }
    catch(e){if(sameSource(expected)&&version===requestVersion.current)setError(shopErrorMessage(e, 'Unable to load website records.'));return false;}
    finally{if(sameSource(expected)&&version===requestVersion.current){loadingRef.current=false;setLoading(false);}}
  },[endpoint,token,table]);
  useEffect(()=>{
    editorVersion.current++;setData(null);setSelected('');setCreating(false);setDraft({});setSearch('');setNotice('');
    void load();
    return ()=>{requestVersion.current++;editorVersion.current++;};
  },[load]);
  const changeTable=(next:CmsTable)=>{
    if(operation.current)return;
    // Invalidate immediately, before React commits the next section render.
    requestVersion.current++;editorVersion.current++;
    source.current={endpoint,token,table:next};
    setData(null);setSelected('');setCreating(false);setDraft({});setNewKey('');setError('');setNotice('');
    setTable(next);
  };
  const filtered=useMemo(()=>{
    const query=search.trim().toLowerCase();
    return data?.rows.filter(row=>display(row,table).toLowerCase().includes(query)||
      Object.values(row).slice(0,8).some(value=>String(value).toLowerCase().includes(query)))||[];
  },[data,search,table]);
  const keyField=table==='settings'||table==='content'?'key':'id';
  const choose=(row:Record<string,Cell>)=>{
    if(operation.current||loadingRef.current||!data||data.table!==table)return;
    editorVersion.current++;
    setCreating(false);setSelected(String(row[keyField]));setNewKey('');
    setDraft(Object.fromEntries(columnsFor(data!).map(field=>{
      let val=row[field]??'';
      if(jsonArrayFields.has(field)&&val){
        val=normalizeStringArrayJson(val);
      }
      return [field,val];
    })));
    setNotice('');setError('');
  };
  const create=()=>{
    if(operation.current||loadingRef.current||!data||data.table!==table)return;
    editorVersion.current++;
    setCreating(true);setSelected('');setNewKey('');
    setDraft(Object.fromEntries(columnsFor(data).map(field=>
      [field,boolFields.has(field)?field==='is_active':jsonArrayFields.has(field)?'[]':emptyOptionalNumbers.has(field)?'':numberFields.has(field)?0:field==='discount_type'?'percentage':field==='status'?'pending':''])));
    setNotice('');setError('');
  };
  const save=async()=>{
    if(operation.current||loadingRef.current||!data||data.table!==table||(!creating&&!selected))return;
    const current={source:{endpoint,token,table},editor:editorVersion.current};
    const isCurrent=()=>sameSource(current.source)&&editorVersion.current===current.editor;
    operation.current=current;
    setSaving(true);setError('');setNotice('');
    try{
      const values:Record<string,Cell>={};
      for(const field of columnsFor(data)){
        if(table==='product_variants'&&!creating&&field==='product_id')continue;
        values[field]=convert(field,draft[field]??'');
      }
      const settingsKey=creating?newKey:selected;
      if(table==='settings'&&['accepting_orders','delivery_enabled'].includes(settingsKey)) {
        values.value=draft.value===true||draft.value==='true';
      }
      await mutateCmsTable(endpoint,token,table,creating?'create':'update',values,creating?undefined:selected,
        creating&&(table==='settings'||table==='content')?newKey:undefined);
      if(!isCurrent())return;
      // The write is acknowledged even if its following list refresh fails.
      setSelected('');setCreating(false);setDraft({});
      const refreshed=await load();if(!isCurrent())return;
      setNotice(refreshed?'Saved to the live website. Public content cache cleared.':'Saved to the live website. Refresh to load the latest records.');
      onUpdated();
    }catch(e){if(isCurrent())setError(shopErrorMessage(e, 'Save failed.'));}
    finally{if(operation.current===current){operation.current=null;if(mounted.current)setSaving(false);}}
  };
  const uploadImage=async(file:File,field:string)=>{
    if(operation.current||loadingRef.current||!data||data.table!==table||(!creating&&!selected))return;
    const current={source:{endpoint,token,table},editor:editorVersion.current};
    const isCurrent=()=>sameSource(current.source)&&editorVersion.current===current.editor;
    operation.current=current;
    setUploading(true);setError('');setNotice('');
    try{
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12000000)
        throw new Error('Select a JPG, PNG or WebP image up to 12 MB. It will be compressed for free hosting.');
      const photo=await createImageBitmap(file);
      const canvas=document.createElement('canvas');
      const max=1400,scale=Math.min(1,max/Math.max(photo.width,photo.height));
      canvas.width=Math.max(1,Math.round(photo.width*scale));
      canvas.height=Math.max(1,Math.round(photo.height*scale));
      const ctx=canvas.getContext('2d');
      if(!ctx)throw new Error('Image compression is unsupported in this browser.');
      ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(photo,0,0,canvas.width,canvas.height);
      photo.close();
      let data:Blob|null=null;
      for(let q=.85;q>=.5;q-=.1){
        data=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',q));
        if(data&&data.size<=640000)break;
      }
      if(!data||data.size>640000)throw new Error('This image is too large after compression. Choose a smaller photo.');
      const bytes=new Uint8Array(await data.arrayBuffer());
      if(!isCurrent())return;
      let binary='';
      for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
      const url=await uploadCmsImage(endpoint,token,btoa(binary));
      if(!isCurrent())return;
      setDraft(before=>{
        if(!isCurrent())return before;
        const oldValue=before[field]??'';
        if(field==='gallery_images'){
          let links:string[]=[];
          try{
            const candidate=JSON.parse(String(oldValue||'[]'));
            if(Array.isArray(candidate))links=candidate.filter((x):x is string=>typeof x==='string');
            else if(typeof candidate==='string'&&candidate.trim())links=[candidate.trim()];
          }catch{
            if(typeof oldValue==='string'&&oldValue.trim()){
              links=oldValue.split(/[\n,]+/).map(s=>s.trim()).filter(Boolean);
            }
          }
          if(!links.includes(url))links.push(url);
          return {...before,[field]:JSON.stringify(links)};
        }
        return {...before,[field]:url};
      });
      setNotice('Image uploaded. Save this record to publish it on the website.');
    }catch(e){if(isCurrent())setError(shopErrorMessage(e, 'Image upload failed.'));}
    finally{if(operation.current===current){operation.current=null;if(mounted.current)setUploading(false);}}
  };
  const isUploadField=(field:string):boolean=>{
    if(field==='gallery_images'||field==='image_url'||field==='logo_url'||field==='profile_image_url')return true;
    if((table==='content'||table==='settings')&&field==='value'){
      const key=creating?newKey:selected;
      return /image|logo|profile/i.test(key);
    }
    return false;
  };
  const archive=async()=>{
    if(operation.current||loadingRef.current||!data||data.table!==table||!selected||(role!=='super_admin'&&role!=='admin'))return;
    if(!window.confirm('Archive this public record? Historical orders stay intact. This cannot be used for private orders.'))return;
    const current={source:{endpoint,token,table},editor:editorVersion.current};
    const isCurrent=()=>sameSource(current.source)&&editorVersion.current===current.editor;
    operation.current=current;
    setSaving(true);setError('');setNotice('');
    try{
      await mutateCmsTable(endpoint,token,table,'delete',{},selected);
      if(!isCurrent())return;
      setSelected('');setDraft({});await load();if(!isCurrent())return;
      setNotice('Archived.');
      onUpdated();
    }catch(e){if(isCurrent())setError(shopErrorMessage(e, 'Archive failed.'));}
    finally{if(operation.current===current){operation.current=null;if(mounted.current)setSaving(false);}}
  };
  const cancel=()=>{
    if(operation.current)return;
    editorVersion.current++;setCreating(false);setSelected('');setDraft({});
  };
  const busy = loading || saving || uploading;
  const selectedRecord = data?.rows.find(row => String(row[keyField]) === selected);
  return <section className="rounded-2xl border border-emerald-200 bg-slate-50 p-3 sm:p-5 space-y-5" aria-label="Live Website Manager">
    <header className="rounded-2xl bg-[#143c32] px-4 py-5 text-white sm:p-6">
      <p className="text-xs font-semibold text-emerald-200">স্টাফ প্যানেল</p>
      <h3 className="mt-1 flex items-center gap-2 text-xl font-black sm:text-2xl"><Store size={23} aria-hidden="true"/> Website Manager</h3>
      <p className="mt-2 max-w-xl text-sm text-emerald-50">মেনু ও দোকানের তথ্য এক জায়গা থেকে আপডেট করুন।</p>
    </header>
    <nav aria-label="Website Manager বিভাগ" className="grid gap-2 sm:grid-cols-3">
      {workspaces.map(({id,title,description,icon:Icon})=>(
        <button key={id} type="button" aria-pressed={workspace===id} aria-controls={'website-manager-'+id}
          disabled={saving||uploading} onClick={()=>{setWorkspace(id);if(id==='gifts')setGiftsOpened(true);}}
          className={'flex min-w-0 items-start gap-3 rounded-xl border p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-60 '+(workspace===id?'border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600':'border-slate-200 bg-white hover:border-emerald-400')}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-950"><Icon size={18} aria-hidden="true"/></span>
          <span><span className="block text-sm font-bold text-slate-900">{title}</span><span className="mt-1 block text-xs text-slate-600">{description}</span></span>
        </button>
      ))}
    </nav>
    <div id="website-manager-cakes" hidden={workspace!=='cakes'}>
      <CakeQuickEditor endpoint={endpoint} token={token} onUpdated={onUpdated}/>
    </div>
    <div id="website-manager-gifts" hidden={workspace!=='gifts'}>
      {giftsOpened&&<ProductGiftAssignmentManager endpoint={endpoint} token={token} onUpdated={onUpdated}/>}
    </div>
    <div id="website-manager-records" hidden={workspace!=='records'}>
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-base font-bold text-slate-900">ওয়েবসাইটের তথ্য সম্পাদনা</h4>
        <button type="button" disabled={busy} onClick={()=>void load()} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw size={14} aria-hidden="true"/> Refresh
        </button>
      </div>
      <div aria-label="প্রয়োজনীয় সেটিংস" className="flex flex-wrap gap-2">
        {quickSections.map(item=><button type="button" key={item.table} aria-pressed={table===item.table}
          disabled={saving||uploading} onClick={()=>changeTable(item.table)}
          className="min-h-10 rounded-full border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 aria-pressed:border-emerald-300 aria-pressed:bg-emerald-50 aria-pressed:text-emerald-950 disabled:opacity-50">{item.label}</button>)}
      </div>
    {error&&<p role="alert" className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">{error}</p>}
    {notice&&<p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    <div className="grid gap-3 sm:grid-cols-[minmax(0,240px)_1fr_auto] items-end">
      <label className="text-sm font-semibold">Website Section
        <select value={table} disabled={saving||uploading} onChange={e=>changeTable(e.target.value as CmsTable)} className="block w-full mt-1 border rounded-xl p-2 disabled:opacity-60">
          {recordGroups.map(group=><optgroup key={group.label} label={group.label}>
            {CMS_TABLE_OPTIONS.filter(option=>group.tables.includes(option.table)).map(option=><option key={option.table} value={option.table}>{option.label}</option>)}
          </optgroup>)}
        </select>
      </label>
      <label className="text-sm font-semibold flex-1">Find a record
        <span className="flex items-center gap-1 mt-1 rounded-xl border px-2"><Search size={14}/>
          <input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search this section"
            className="p-2 flex-1 min-w-0 outline-none"/>
        </span>
      </label>
      <button disabled={!data||loading||saving||uploading} type="button" onClick={create} className="rounded-xl bg-emerald-800 px-4 py-3 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-60">
        <Plus size={15}/> Create
      </button>
    </div>
    <p className="text-xs text-slate-500">{data?.total??0} records {data?.truncated?'(showing the first 500)':''}. Select a record to edit.</p>
    {loading&&<p role="status" className="text-sm">Loading live website records…</p>}
    <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_minmax(0,2fr)]">
      <div className="rounded-xl border max-h-96 overflow-auto">
        {filtered.slice(0,500).map(row=>{
          const id=String(row[keyField]);
          return <button type="button" key={id} disabled={loading||saving||uploading} onClick={()=>choose(row)}
            aria-pressed={selected===id}
            className={'flex w-full items-center justify-between gap-2 border-b border-slate-100 p-3 text-left text-sm hover:bg-emerald-50 disabled:opacity-60 '+(selected===id?'bg-emerald-100':'')}>
            <span className="min-w-0">
              <strong className="block break-words">{display(row,table)}</strong>
              {row.is_active===false&&<span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">লুকানো</span>}
            </span>
            <Pencil size={14} className="shrink-0 text-emerald-700" aria-hidden="true"/>
          </button>;
        })}
        {!loading&&!filtered.length&&<p className="p-4 text-sm text-slate-500">{search?'খোঁজার সঙ্গে মেলে এমন তথ্য পাওয়া যায়নি।':'এই বিভাগে এখনো কোনো তথ্য নেই।'}</p>}
      </div>
      {data&&(creating||selected) ? (
        <div className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
          <h4 className="font-bold">{creating?'নতুন তথ্য যোগ করুন':selectedRecord?display(selectedRecord,table):selected}</h4>
          {creating&&(table==='settings'||table==='content')&&<label className="block text-xs font-semibold">Approved website key
            <input className="block w-full border rounded-lg p-2 mt-1" required disabled={loading||saving||uploading} value={newKey}
              placeholder="e.g. footer_about" onChange={e=>setNewKey(e.target.value)}/>
          </label>}
          <div className="grid gap-3 sm:grid-cols-2">
            {columnsFor(data).map(field=><label key={field} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 text-xs font-semibold text-slate-700">
              {fieldLabels[field] || field.replaceAll('_',' ')}
              {boolFields.has(field) || (table==='settings'&&field==='value'&&(typeof draft[field]==='boolean'||['accepting_orders','delivery_enabled'].includes(creating?newKey:selected))) ?
                <select aria-label={field} disabled={loading||saving||uploading} value={String(draft[field]??false)} onChange={e=>setDraft(prev=>({...prev,[field]:e.target.value==='true'}))}
                  className="block w-full border rounded-lg p-2 mt-1"><option value="true">Yes / ON</option><option value="false">No / OFF</option></select>
               :field==='discount_type'?
                <select disabled={loading||saving||uploading} value={String(draft[field]??'percentage')} onChange={e=>setDraft(prev=>({...prev,[field]:e.target.value}))}
                  className="block w-full border rounded-lg p-2 mt-1"><option value="percentage">Percentage</option><option value="fixed">Fixed</option></select>
               :field==='status'&&table==='reviews'?
                <select disabled={loading||saving||uploading} value={String(draft[field]??'pending')} onChange={e=>setDraft(prev=>({...prev,[field]:e.target.value}))}
                  className="block w-full border rounded-lg p-2 mt-1">{['pending','approved','rejected','hidden'].map(o=><option key={o}>{o}</option>)}</select>
               :<textarea disabled={loading||saving||uploading} readOnly={table==='product_variants'&&!creating&&field==='product_id'} value={String(draft[field]??'')} rows={/description|body|content|note|address|value|_ids|gallery_images/.test(field)?3:1}
                  onChange={e=>setDraft(prev=>({...prev,[field]:e.target.value}))}
                  className="block w-full border rounded-lg p-2 mt-1 resize-y"/>}
              {isUploadField(field)&&<span className="block mt-2 text-xs font-normal text-emerald-900">
                <span className="font-semibold">{uploading?'Uploading image…':'Upload image from device'}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" disabled={loading||uploading||saving}
                  aria-label={'Upload image for '+field} className="block mt-1 text-xs max-w-full"
                  onChange={event=>{const file=event.target.files?.[0];if(file)void uploadImage(file,field);event.target.value='';}}/>
                <span className="text-slate-500">Images are compressed to a maximum of 650 KB and stored in the private bakery Drive folder.</span>
                {table==='settings'&&/logo|profile/.test(String(draft.key))&&<span className="block text-amber-800 mt-1">স্থায়ী logo-এর জন্য ছবি upload করে Save করুন। Facebook image link মেয়াদ শেষ হলে ছবি আর দেখা যায় না।</span>}
              </span>}
            </label>)}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
            <button type="button" disabled={saving||loading||uploading} onClick={()=>void save()} className="rounded-xl bg-emerald-800 text-white px-4 py-2 font-semibold text-sm flex gap-2 items-center">
              <Save size={15}/>{saving?'Saving…':creating?'Create record':'Save changes'}
            </button>
            {!creating&&data.can_delete&&(role==='super_admin'||role==='admin')&&table!=='settings'&&table!=='content'&&
              <button type="button" disabled={saving||loading||uploading} onClick={()=>void archive()}
                className="rounded-xl border border-red-300 text-red-700 px-3 py-2 text-sm flex items-center gap-2">
                <Archive size={15}/> Archive / hide
              </button>}
            <button type="button" disabled={saving||uploading} onClick={cancel} className="rounded-xl border px-3 py-2 text-sm">Cancel</button>
          </div>
          <p className="text-xs text-slate-500">Archive/hide is the safe alternative to permanent deletion, especially for products or coupons referenced by existing orders. Changes here affect only approved public tables.</p>
        </div>
      ) : <p className="text-sm text-slate-500 rounded-xl bg-slate-50 p-5">Choose a record or create a new item.</p>}
    </div>
    </div>
    </div>
  </section>;
};
