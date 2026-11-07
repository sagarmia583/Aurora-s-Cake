import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {Plus,RefreshCw,Save,SlidersHorizontal} from 'lucide-react';
import {fetchCmsTable,mutateCmsTable} from '../services/sheetStaffApi';
import type {CmsSnapshot} from '../services/sheetStaffApi';
import {normalizeCakeSlug,STANDARD_CAKE_SIZES,validateCakeEditor} from '../services/cakeQuickEditor';
import type {CakeFormDraft,CakeSizeDraft} from '../services/cakeQuickEditor';
import {shopErrorMessage} from '../utils/shopErrorMessage';

interface Props {endpoint:string;token:string;onUpdated:()=>void}
type Row=Record<string,string|boolean|number>;
const str=(value:unknown)=>String(value??'');
const list=(input:unknown):string[]=>{
  if(Array.isArray(input))return input.map(str).filter(Boolean);
  try{const parsed=JSON.parse(str(input)||'[]');return Array.isArray(parsed)?parsed.map(str).filter(Boolean):[];}
  catch{return [];}
};
const blankSize=():CakeSizeDraft=>({key:'new-'+Date.now()+'-'+Math.random().toString(36).slice(2,9),
  name:'½ পাউন্ড',grams:'',regular:'',discount:'',active:true});
const blankCake=():CakeFormDraft=>({name:'',slug:'cake-'+Date.now().toString(36),
  categoryId:'',description:'',imageUrl:'',active:true,featured:false,flavorIds:[],sizes:[blankSize()]});
const active=(value:unknown)=>value===true||str(value).toLowerCase()==='true';
const money=(value:unknown)=>str(value??'');
function readCake(product:Row,variants:Row[],flavors:Row[]):CakeFormDraft{
  const id=str(product.id);
  const selectedVariants=variants.filter(variant=>str(variant.product_id)===id);
  const originalFlavors=list(product.allowed_flavor_ids);
  const activeFlavorIds=flavors.filter(f=>active(f.is_active)).map(f=>str(f.id));
  return {
    id,name:str(product.name),slug:str(product.slug),categoryId:str(product.category_id),
    description:str(product.description),imageUrl:str(product.image_url),
    active:active(product.is_active),featured:active(product.is_featured),
    flavorIds:originalFlavors.includes('all')||originalFlavors.includes('*')?
      activeFlavorIds:originalFlavors.filter(fid=>activeFlavorIds.includes(fid)),
    sizes:selectedVariants.length?selectedVariants.map(variant=>({
      key:str(variant.id),id:str(variant.id),name:str(variant.name),
      grams:money(variant.weight_grams)=== '0'?'':money(variant.weight_grams),
      regular:money(variant.price),
      discount:variant.sale_price===''||variant.sale_price===undefined?'':money(variant.sale_price),
      active:active(variant.is_active)
    })):
    [{...blankSize(),regular:money(product.base_price),
      discount:product.sale_price===''?'':money(product.sale_price)}]
  };
}
/**
 * Cake / Flavour / Size / regular and offer prices in a single editor.
 * The existing Google Sheet tables stay unchanged: products, flavours,
 * product_variants. All writes use the existing authorized CMS actions.
 */
export const CakeQuickEditor:React.FC<Props>=({endpoint,token,onUpdated})=>{
  const [expanded,setExpanded]=useState(false);
  const [snapshots,setSnapshots]=useState<{
    categories:CmsSnapshot;products:CmsSnapshot;variants:CmsSnapshot;flavors:CmsSnapshot
  }|null>(null);
  const [selectedId,setSelectedId]=useState('new');
  const [draft,setDraft]=useState<CakeFormDraft>(blankCake);
  const [newFlavor,setNewFlavor]=useState('');
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const categories=useMemo(()=>snapshots?.categories.rows.filter(row=>active(row.is_active))||[],[snapshots]);
  const flavorRows=useMemo(()=>snapshots?.flavors.rows.filter(row=>active(row.is_active))||[],[snapshots]);
  const productRows=useMemo(()=>snapshots?.products.rows||[],[snapshots]);
  const change=(patch:Partial<CakeFormDraft>)=>setDraft(previous=>({...previous,...patch}));
  const reload=useCallback(async(preferred?:string)=>{
    setLoading(true);setError('');
    try{
      const [categories,products,variants,flavors]=await Promise.all([
        fetchCmsTable(endpoint,token,'categories'),fetchCmsTable(endpoint,token,'products'),
        fetchCmsTable(endpoint,token,'product_variants'),fetchCmsTable(endpoint,token,'flavors')
      ]);
      if([categories,products,variants,flavors].some(table=>table.truncated))
        throw new Error('Too many records to edit safely. Use the advanced CMS manager.');
      const data={categories,products,variants,flavors};
      setSnapshots(data);
      const target=preferred??selectedId;
      const product=products.rows.find(p=>str(p.id)===target);
      if(product){
        setSelectedId(target);
        setDraft(readCake(product,variants.rows,flavors.rows));
      }else{
        const fresh=blankCake();
        fresh.categoryId=categories.rows.find(r=>active(r.is_active)&&/cake|কেক/i.test(str(r.name)))?.id as string
          ||str(categories.rows.find(r=>active(r.is_active))?.id);
        setSelectedId('new');setDraft(fresh);
      }
    }catch(caught){setError(shopErrorMessage(caught,'Could not load cake, size and flavour lists.'));}
    finally{setLoading(false);}
  },[endpoint,token,selectedId]);
  useEffect(()=>{
    if(expanded)void reload();
  // Only refetch when the editor opens or the credentials change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[expanded,endpoint,token]);
  const choose=(value:string)=>{
    if(!snapshots||saving)return;
    setError('');setNotice('');setSelectedId(value);
    const product=snapshots.products.rows.find(row=>str(row.id)===value);
    if(product)setDraft(readCake(product,snapshots.variants.rows,snapshots.flavors.rows));
    else{
      const fresh=blankCake();
      fresh.categoryId=str(categories.find(r=>/cake|কেক/i.test(str(r.name)))?.id||categories[0]?.id);
      setDraft(fresh);
    }
  };
  const setSize=(key:string,patch:Partial<CakeSizeDraft>)=>change({sizes:draft.sizes.map(s=>
    s.key===key?{...s,...patch}:s)});
  const addSize=(preset='')=>{
    if(draft.sizes.length>=24)return setError('একটি কেকে সর্বোচ্চ ২৪টি Size রাখা যাবে।');
    if(preset&&draft.sizes.some(s=>s.name.trim()===preset))
      return setError('এই Size আগে থেকেই আছে। সেটির দাম পরিবর্তন করুন।');
    change({sizes:[...draft.sizes,{...blankSize(),name:preset||''}]});
    setError('');
  };
  const addFlavor=async()=>{
    const name=newFlavor.trim();
    if(!name||name.length>140)return setError('নতুন Flavour-এর নাম লিখুন।');
    if(!snapshots||saving)return;
    const same=flavorRows.find(row=>str(row.name).trim().toLowerCase()===name.toLowerCase());
    if(same){change({flavorIds:[...new Set([...draft.flavorIds,str(same.id)])]});setNewFlavor('');return;}
    setSaving(true);setError('');setNotice('');
    try{
      const oldIds=new Set(snapshots.flavors.rows.map(r=>str(r.id)));
      await mutateCmsTable(endpoint,token,'flavors','create',{name,color_hex:'#f1e8db',is_active:true});
      const flavors=await fetchCmsTable(endpoint,token,'flavors');
      const added=flavors.rows.find(row=>!oldIds.has(str(row.id))&&str(row.name).trim()===name);
      if(!added)throw new Error('Flavour was created, but its ID was not returned. Refresh before continuing.');
      setSnapshots(previous=>previous?{...previous,flavors}:previous);
      change({flavorIds:[...new Set([...draft.flavorIds,str(added.id)])]});
      setNewFlavor('');
      setNotice('Flavour যোগ হয়েছে এবং এই কেকে নির্বাচিত হয়েছে।');
    }catch(caught){setError(shopErrorMessage(caught,'Flavour could not be created.'));}
    finally{setSaving(false);}
  };
  const save=async()=>{
    if(!snapshots||saving||loading)return;
    let plan:ReturnType<typeof validateCakeEditor>;
    try{
      plan=validateCakeEditor(draft,categories.map(r=>str(r.id)),flavorRows.map(r=>str(r.id)));
    }catch(caught){setError(shopErrorMessage(caught,'Check the cake details and prices.'));return;}
    setSaving(true);setError('');setNotice('');
    let createdId='';let saved=0;
    try{
      let productId=draft.id;
      if(!productId){
        // An incomplete NEW cake must not appear on the public storefront.
        await mutateCmsTable(endpoint,token,'products','create',
          {...plan.productValues,is_active:false});
        const products=await fetchCmsTable(endpoint,token,'products');
        const created=products.rows.find(row=>str(row.slug)===draft.slug);
        if(!created)throw new Error('Cake was created but its identifier could not be found. Refresh before retrying.');
        productId=createdId=str(created.id);
      }
      if(!productId)throw new Error('Missing cake ID.');
      // Variant writes before product price flags: on a partial failure
      // the existing product can still be reviewed and resumed.
      for(const size of plan.sizes){
        const values={...size.values,...(!size.id?{product_id:productId}:{})};
        await mutateCmsTable(endpoint,token,'product_variants',
          size.id?'update':'create',values,size.id);
        saved++;
      }
      await mutateCmsTable(endpoint,token,'products','update',
        {...plan.productValues,is_active:draft.active},productId);
      const [products,variants]=await Promise.all([
        fetchCmsTable(endpoint,token,'products'),fetchCmsTable(endpoint,token,'product_variants')
      ]);
      setSnapshots(previous=>previous?{...previous,products,variants}:previous);
      const updated=products.rows.find(p=>str(p.id)===productId);
      if(updated){setDraft(readCake(updated,variants.rows,snapshots.flavors.rows));setSelectedId(productId);}
      setNotice('সেভ হয়েছে। কেক, Flavour এবং প্রতিটি Size-এর Regular/Discount Price আপডেট হয়েছে।');
      onUpdated();
    }catch(caught){
      const extra=createdId
        ?' নতুন কেকটি নিরাপদে Hidden আছে। Refresh করে সেটি খুলে বাকি Size সম্পন্ন করুন।'
        :saved?' '+saved+'টি Size আগে Save হয়েছে। Refresh করে অবশিষ্ট পরিবর্তন যাচাই করুন।':'';
      setError(shopErrorMessage(caught,'Cake save could not be completed.')+extra);
    }finally{setSaving(false);}
  };
  return <section aria-label="Easy Cake Editor" className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-3 sm:p-4 space-y-4" data-testid="easy-cake-editor">
    <div className="flex flex-wrap gap-3 items-start justify-between">
      <div>
        <h4 className="text-base sm:text-lg font-black flex gap-2 items-center text-emerald-950">
          <SlidersHorizontal size={18}/> সহজ Cake Editor
        </h4>
        <p className="text-xs text-slate-600">এক জায়গায় কেকের নাম, Flavour, Size, Regular Price এবং Discount Price সেভ করুন।</p>
      </div>
      <button type="button" onClick={()=>setExpanded(v=>!v)}
        className="min-h-11 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-bold text-emerald-950">
        {expanded?'বন্ধ করুন':'Cake যোগ / Edit করুন'}
      </button>
    </div>
    {expanded&&<>
      {error&&<p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice&&<p role="status" className="rounded-lg bg-emerald-100 p-3 text-sm text-emerald-900">{notice}</p>}
      {loading||!snapshots?<p className="text-sm text-slate-600">কেকের তথ্য লোড হচ্ছে…</p>:<>
        <div className="flex flex-wrap gap-2 items-end">
          <label className="flex-1 min-w-[170px] text-xs font-semibold">কোন কেক Edit করবেন?
            <select aria-label="Choose cake to edit" value={selectedId} disabled={saving}
              onChange={e=>choose(e.target.value)} className="mt-1 block w-full rounded-xl border bg-white p-3 text-sm">
              <option value="new">+ নতুন কেক যোগ করুন</option>
              {productRows.map(row=><option key={str(row.id)} value={str(row.id)}>
                {str(row.name)} {active(row.is_active)?'':'(Hidden)'}
              </option>)}
            </select>
          </label>
          <button type="button" disabled={saving} onClick={()=>void reload(selectedId)}
            className="min-h-11 rounded-xl border bg-white px-3 text-xs font-semibold inline-flex items-center gap-2">
            <RefreshCw size={14}/> Refresh
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold">কেকের নাম
            <input aria-label="Cake name" value={draft.name} disabled={saving}
              onChange={e=>{
                const name=e.target.value;
                change({name,...(!draft.id?{slug:normalizeCakeSlug(name)||draft.slug}:{})});
              }} className="block mt-1 w-full rounded-lg border bg-white p-3" placeholder="যেমন: ভ্যানিলা কেক"/>
          </label>
          <label className="text-xs font-semibold">ক্যাটাগরি
            <select aria-label="Cake category" value={draft.categoryId} disabled={saving}
              onChange={e=>change({categoryId:e.target.value})}
              className="block mt-1 w-full rounded-lg border bg-white p-3">
              <option value="">Category নির্বাচন করুন</option>
              {categories.map(row=><option key={str(row.id)} value={str(row.id)}>{str(row.name)}</option>)}
            </select>
          </label>
          {!draft.id&&<label className="text-xs font-semibold">Cake Link (Slug)
            <input aria-label="Cake slug" value={draft.slug} disabled={saving}
              onChange={e=>change({slug:e.target.value})}
              className="block mt-1 w-full rounded-lg border bg-white p-3"/>
          </label>}
          <label className="text-xs font-semibold">ছবির লিংক (ঐচ্ছিক)
            <input aria-label="Cake image" value={draft.imageUrl} disabled={saving}
              onChange={e=>change({imageUrl:e.target.value})}
              className="block mt-1 w-full rounded-lg border bg-white p-3" placeholder="https://..."/>
          </label>
          <label className="text-xs font-semibold sm:col-span-2">বিবরণ (ঐচ্ছিক)
            <textarea aria-label="Cake description" rows={2} value={draft.description} disabled={saving}
              onChange={e=>change({description:e.target.value})}
              className="block mt-1 w-full rounded-lg border bg-white p-3"/>
          </label>
        </div>
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
          <h5 className="font-bold text-sm text-emerald-950">Flavour নির্বাচন</h5>
          <div className="flex flex-wrap gap-3">
            {flavorRows.map(row=><label key={str(row.id)} className="text-xs flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={draft.flavorIds.includes(str(row.id))} disabled={saving}
                onChange={e=>change({flavorIds:e.target.checked?
                  [...draft.flavorIds,str(row.id)]:draft.flavorIds.filter(id=>id!==str(row.id))})}/>
              {str(row.name)}
            </label>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <input aria-label="New flavor name" value={newFlavor} disabled={saving} maxLength={140}
              onChange={e=>setNewFlavor(e.target.value)} placeholder="নতুন Flavour-এর নাম"
              className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-xs"/>
            <button type="button" disabled={saving||!newFlavor.trim()} onClick={()=>void addFlavor()}
              className="min-h-10 rounded-lg border px-3 text-xs font-semibold disabled:opacity-50">
              + Flavour যোগ করুন
            </button>
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h5 className="font-bold text-sm text-emerald-950">Size অনুযায়ী দাম</h5>
              <p className="text-xs text-slate-600">প্রতিটি সাইজের Regular ও Discount Price পাশাপাশি লিখুন। Discount না থাকলে ফাঁকা রাখুন।</p></div>
            <select value="" aria-label="Add standard cake size" disabled={saving}
              onChange={e=>{if(e.target.value)addSize(e.target.value);}}
              className="max-w-full min-h-11 rounded-lg border bg-white px-2 text-xs">
              <option value="">+ নতুন Size নির্বাচন করুন</option>
              {STANDARD_CAKE_SIZES.map(size=><option key={size} value={size}>{size}</option>)}
            </select>
          </div>
          {draft.sizes.map((size,index)=><div key={size.key} className="w-full min-w-0 rounded-xl border border-emerald-200 bg-white p-3 space-y-2">
            <div className="flex justify-between items-center gap-2">
              <strong className="text-sm text-emerald-950">Size {index+1}</strong>
              <label className="text-xs inline-flex gap-2 items-center">
                <input type="checkbox" checked={size.active} disabled={saving}
                  onChange={e=>setSize(size.key,{active:e.target.checked})}/> Available
              </label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <label className="col-span-2 sm:col-span-1 text-xs font-semibold">Size
                <input value={size.name} aria-label={'Cake size '+(index+1)} disabled={saving}
                  onChange={e=>setSize(size.key,{name:e.target.value})}
                  className="mt-1 w-full min-w-0 rounded-lg border p-2" placeholder="আধা পাউন্ড"/>
              </label>
              <label className="col-span-2 sm:col-span-1 text-xs font-semibold">ওজন / গ্রাম (ঐচ্ছিক)
                <input type="number" min="0" step="1" value={size.grams}
                  aria-label={'Weight grams '+(index+1)} disabled={saving}
                  onChange={e=>setSize(size.key,{grams:e.target.value})}
                  className="mt-1 w-full min-w-0 rounded-lg border p-2" placeholder="যেমন 500"/>
              </label>
              <label className="text-xs font-semibold">Regular ৳
                <input type="number" min="0" step=".01" value={size.regular}
                  aria-label={'Regular price '+(index+1)} disabled={saving}
                  onChange={e=>setSize(size.key,{regular:e.target.value})}
                  className="mt-1 w-full min-w-0 rounded-lg border p-2" placeholder="650"/>
              </label>
              <label className="text-xs font-semibold">Discount ৳
                <input type="number" min="0" step=".01" value={size.discount}
                  aria-label={'Discount price '+(index+1)} disabled={saving}
                  onChange={e=>setSize(size.key,{discount:e.target.value})}
                  className="mt-1 w-full min-w-0 rounded-lg border p-2" placeholder="600"/>
              </label>
            </div>
            {size.regular&&size.discount&&Number(size.discount)<Number(size.regular)&&
              <p className="text-xs text-emerald-800 font-semibold">Offer: ৳{size.discount} (৳{(Number(size.regular)-Number(size.discount)).toFixed(0)} ছাড়)</p>}
            {!size.id&&draft.sizes.length>1&&<button type="button" disabled={saving}
              onClick={()=>change({sizes:draft.sizes.filter(item=>item.key!==size.key)})}
              className="text-xs text-red-700 underline">নতুন Size সরান</button>}
            {size.id&&<p className="text-xs text-slate-500">আগের Size ID অপরিবর্তিত থাকবে। Available OFF করলে Size শুধু Hidden হবে।</p>}
          </div>)}
          <button type="button" onClick={()=>addSize()} disabled={saving}
            className="w-full sm:w-auto rounded-xl border border-dashed border-emerald-300 px-4 py-3 text-xs font-semibold">
            <Plus size={14} className="inline mr-1"/> Custom Size যোগ করুন
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <div className="flex flex-wrap gap-3">
            <label className="inline-flex gap-2 items-center text-xs font-semibold"><input type="checkbox" checked={draft.active} disabled={saving}
              onChange={e=>change({active:e.target.checked})}/> Website-এ দেখাবে</label>
            <label className="inline-flex gap-2 items-center text-xs font-semibold"><input type="checkbox" checked={draft.featured} disabled={saving}
              onChange={e=>change({featured:e.target.checked})}/> Featured</label>
          </div>
          <button type="button" disabled={saving||loading} onClick={()=>void save()}
            className="min-h-11 w-full sm:w-auto rounded-xl bg-emerald-800 px-5 py-3 text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50">
            <Save size={16}/>{saving?'Saving Cake & Sizes…':'সব একসাথে Save করুন'}
          </button>
        </div>
        <p className="text-xs text-slate-600">এই Editor আগের products / product_variants / flavors ট্যাবেই তথ্য রাখে। দাম ভিন্ন হলে প্রতিটি Size নিজস্ব Offer Price ব্যবহার করবে।</p>
      </>}
    </>}
  </section>;
};
