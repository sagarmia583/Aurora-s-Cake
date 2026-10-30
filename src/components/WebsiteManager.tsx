import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Database, RefreshCw, Plus, Save, Archive, Search } from 'lucide-react';
import { CMS_TABLE_OPTIONS, fetchCmsTable, mutateCmsTable, uploadCmsImage } from '../services/sheetStaffApi';
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
    catch(e){if(sameSource(expected)&&version===requestVersion.current)setError(e instanceof Error?e.message:'Unable to load website records.');return false;}
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
  const filtered=useMemo(()=>data?.rows.filter(row=>
    Object.values(row).slice(0,8).some(value=>String(value).toLowerCase().includes(search.toLowerCase()))
  )||[],[data,search]);
  const keyField=table==='settings'||table==='content'?'key':'id';
  const choose=(row:Record<string,Cell>)=>{
    if(operation.current||loadingRef.current||!data||data.table!==table)return;
    editorVersion.current++;
    setCreating(false);setSelected(String(row[keyField]));setNewKey('');
    setDraft(Object.fromEntries(columnsFor(data!).map(field=>[field,row[field]??''])));
    setNotice('');setError('');
  };
  const create=()=>{
    if(operation.current||loadingRef.current||!data||data.table!==table)return;
    editorVersion.current++;
    setCreating(true);setSelected('');setNewKey('');
    setDraft(Object.fromEntries(columnsFor(data).map(field=>
      [field,boolFields.has(field)?field==='is_active':emptyOptionalNumbers.has(field)?'':numberFields.has(field)?0:field==='discount_type'?'percentage':field==='status'?'pending':''])));
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
      for(const field of columnsFor(data))values[field]=convert(field,draft[field]??'');
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
    }catch(e){if(isCurrent())setError(e instanceof Error?e.message:'Save failed.');}
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
          }catch{}
          return {...before,[field]:JSON.stringify([...links,url])};
        }
        return {...before,[field]:url};
      });
      setNotice('Image uploaded. Save this record to publish it on the website.');
    }catch(e){if(isCurrent())setError(e instanceof Error?e.message:'Image upload failed.');}
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
  /** Explicit owner-requested smoke test: creates one clearly marked hidden FAQ,
   *  updates it, then archives it; never touches existing public or private rows.
   */
  const runCmsSmoke=async()=>{
    if(role!=='super_admin'||operation.current||loadingRef.current)return;
    if(!window.confirm('Run a live website CRUD test? This adds one clearly labeled, hidden FAQ test row, retained for audit. Existing orders and products stay unchanged.'))return;
    const current={source:{endpoint,token,table},editor:editorVersion.current};
    const isCurrent=()=>sameSource(current.source)&&editorVersion.current===current.editor;
    operation.current=current;
    setSaving(true);setError('');setNotice('');
    const marker='AURORA_CMS_TEST_'+Date.now();
    try{
      await mutateCmsTable(endpoint,token,'faqs','create',{
        question:marker,answer:'Live CRUD creation test',sort_order:999999,is_active:false
      });
      if(!isCurrent())return;
      const found=await fetchCmsTable(endpoint,token,'faqs');
      if(!isCurrent())return;
      const saved=found.rows.find(row=>row.question===marker);
      if(!saved||typeof saved.id!=='string')throw new Error('Create completed, but the test row was not found in the first 500 FAQs. Ask the database owner to verify the test record.');
      await mutateCmsTable(endpoint,token,'faqs','update',{answer:'Live CRUD update verified'},saved.id);
      if(!isCurrent())return;
      await mutateCmsTable(endpoint,token,'faqs','delete',{},saved.id);
      if(!isCurrent())return;
      const confirmed=await fetchCmsTable(endpoint,token,'faqs');
      if(!isCurrent())return;
      const result=confirmed.rows.find(row=>row.id===saved.id);
      if(!result||result.is_active!==false||result.answer!=='Live CRUD update verified')
        throw new Error('The test was saved, but a final read did not confirm its archived state.');
      setNotice('Live create, update, archive and readback succeeded. An inactive test FAQ remains in the production database for audit.');
      if(table==='faqs')setData(confirmed);
      onUpdated();
    }catch(error){if(isCurrent())setError(error instanceof Error?error.message:'CMS test failed. Ask the database owner to inspect the hidden FAQ test record.');}
    finally{if(operation.current===current){operation.current=null;if(mounted.current)setSaving(false);}}
  };
  const archive=async()=>{
    if(operation.current||loadingRef.current||!data||data.table!==table||!selected||role!=='super_admin')return;
    if(!window.confirm('Archive this public record? Historical orders stay intact. This cannot be used for private orders.'))return;
    const current={source:{endpoint,token,table},editor:editorVersion.current};
    const isCurrent=()=>sameSource(current.source)&&editorVersion.current===current.editor;
    operation.current=current;
    setSaving(true);setError('');setNotice('');
    try{
      await mutateCmsTable(endpoint,token,table,'delete',{},selected);
      if(!isCurrent())return;
      setSelected('');setDraft({});await load();if(!isCurrent())return;
      setNotice('Archived in the production database. Historical orders are preserved.');
      onUpdated();
    }catch(e){if(isCurrent())setError(e instanceof Error?e.message:'Archive failed.');}
    finally{if(operation.current===current){operation.current=null;if(mounted.current)setSaving(false);}}
  };
  const cancel=()=>{
    if(operation.current)return;
    editorVersion.current++;setCreating(false);setSelected('');setDraft({});
  };
  return <section className="rounded-2xl border border-emerald-200 bg-white p-4 md:p-5 space-y-4" aria-label="Live Website Manager">
    <div className="flex justify-between gap-3 items-start flex-wrap">
      <div>
        <h3 className="text-xl font-black flex items-center gap-2"><Database size={20}/> Live Website Manager</h3>
        <p className="text-sm text-slate-600">Create, edit and archive live website content in the production database.</p>
      </div>
      <div className="flex gap-2 flex-wrap">
        {role==='super_admin'&&<button type="button" disabled={loading||saving||uploading} onClick={()=>void runCmsSmoke()}
          className="rounded-xl border border-amber-300 px-3 py-2 text-sm text-amber-900">
          Test live Create / Edit / Archive
        </button>}
        <button type="button" disabled={loading||saving||uploading} onClick={()=>void load()} className="rounded-xl border px-3 py-2 flex items-center gap-2 text-sm">
          <RefreshCw size={15}/> Refresh
        </button>
      </div>
    </div>
    {error&&<p role="alert" className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">{error}</p>}
    {notice&&<p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    <div className="grid gap-3 sm:grid-cols-[minmax(0,240px)_1fr_auto] items-end">
      <label className="text-sm font-semibold">Website Section
        <select value={table} disabled={saving||uploading} onChange={e=>changeTable(e.target.value as CmsTable)} className="block w-full mt-1 border rounded-xl p-2 disabled:opacity-60">
          {CMS_TABLE_OPTIONS.map(o=><option key={o.table} value={o.table}>{o.label}</option>)}
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
    <p className="text-xs text-slate-500">{data?.total??0} records {data?.truncated?'(showing the first 500; ask the database owner to manage records beyond this limit)':''}. Select a record to edit.</p>
    {loading&&<p role="status" className="text-sm">Loading live website records…</p>}
    <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_minmax(0,2fr)]">
      <div className="rounded-xl border max-h-96 overflow-auto">
        {filtered.slice(0,500).map(row=>{
          const id=String(row[keyField]);
          return <button type="button" key={id} disabled={loading||saving||uploading} onClick={()=>choose(row)}
            className={'block text-left w-full p-3 border-b text-sm hover:bg-emerald-50 disabled:opacity-60 '+(selected===id?'bg-emerald-100':'')}>
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
            <input className="block w-full border rounded-lg p-2 mt-1" required disabled={loading||saving||uploading} value={newKey}
              placeholder="e.g. footer_about" onChange={e=>setNewKey(e.target.value)}/>
          </label>}
          <div className="grid sm:grid-cols-2 gap-3 max-h-[450px] overflow-y-auto pr-1">
            {columnsFor(data).map(field=><label key={field} className="block text-xs font-semibold text-slate-700">
              {field.replaceAll('_',' ')}
              {boolFields.has(field) || (table==='settings'&&field==='value'&&(typeof draft[field]==='boolean'||['accepting_orders','delivery_enabled'].includes(creating?newKey:selected))) ?
                <select aria-label={field} disabled={loading||saving||uploading} value={String(draft[field]??false)} onChange={e=>setDraft(prev=>({...prev,[field]:e.target.value==='true'}))}
                  className="block w-full border rounded-lg p-2 mt-1"><option value="true">Yes / ON</option><option value="false">No / OFF</option></select>
               :field==='discount_type'?
                <select disabled={loading||saving||uploading} value={String(draft[field]??'percentage')} onChange={e=>setDraft(prev=>({...prev,[field]:e.target.value}))}
                  className="block w-full border rounded-lg p-2 mt-1"><option value="percentage">Percentage</option><option value="fixed">Fixed</option></select>
               :field==='status'&&table==='reviews'?
                <select disabled={loading||saving||uploading} value={String(draft[field]??'pending')} onChange={e=>setDraft(prev=>({...prev,[field]:e.target.value}))}
                  className="block w-full border rounded-lg p-2 mt-1">{['pending','approved','rejected','hidden'].map(o=><option key={o}>{o}</option>)}</select>
               :<textarea disabled={loading||saving||uploading} value={String(draft[field]??'')} rows={/description|body|content|note|address|value|_ids|gallery_images/.test(field)?3:1}
                  onChange={e=>setDraft(prev=>({...prev,[field]:e.target.value}))}
                  className="block w-full border rounded-lg p-2 mt-1 resize-y"/>}
              {isUploadField(field)&&<span className="block mt-2 text-xs font-normal text-emerald-900">
                <span className="font-semibold">{uploading?'Uploading image…':'Upload image from device'}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" disabled={loading||uploading||saving}
                  aria-label={'Upload image for '+field} className="block mt-1 text-xs max-w-full"
                  onChange={event=>{const file=event.target.files?.[0];if(file)void uploadImage(file,field);event.target.value='';}}/>
                <span className="text-slate-500">Images are compressed to a maximum of 650 KB and stored in the private bakery Drive folder.</span>
              </span>}
            </label>)}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button type="button" disabled={saving||loading||uploading} onClick={()=>void save()} className="rounded-xl bg-emerald-800 text-white px-4 py-2 font-semibold text-sm flex gap-2 items-center">
              <Save size={15}/>{saving?'Saving…':creating?'Create record':'Save changes'}
            </button>
            {!creating&&role==='super_admin'&&table!=='settings'&&table!=='content'&&
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
  </section>;
};
