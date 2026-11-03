import React,{useEffect,useState} from 'react';
import {Copy,Link as LinkIcon,ArrowUpRight,RefreshCw} from 'lucide-react';
import {createCustomerOrderLink,websiteOrderTrackingLink,revokeCustomerOrderLink} from '../services/orderShare';
export function CustomerOrderLink({endpoint,token,orderId,initialUrl,autoCreate=false}:{endpoint:string;token:string;orderId:string;initialUrl?:string;autoCreate?:boolean}){
  const [url,setUrl]=useState(()=>websiteOrderTrackingLink(initialUrl,orderId)),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const create=async()=>{setBusy(true);setMessage('');try{setUrl(await createCustomerOrderLink(endpoint,token,orderId));}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}};
  const revoke=async()=>{setBusy(true);setMessage('');try{await revokeCustomerOrderLink(endpoint,token,orderId);setUrl('');setMessage('পুরোনো link বাতিল হয়েছে।');}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}};
  useEffect(()=>{let alive=true;const existing=websiteOrderTrackingLink(initialUrl,orderId);setUrl(existing);setMessage('');setBusy(false);if(autoCreate&&!existing){setBusy(true);void createCustomerOrderLink(endpoint,token,orderId).then(value=>{if(alive)setUrl(value);}).catch(e=>{if(alive)setMessage(e.message);}).finally(()=>{if(alive)setBusy(false);});}return()=>{alive=false;};},[endpoint,token,orderId,initialUrl,autoCreate]);
  const viewUrl = url && import.meta.env.DEV ? new URL(url).pathname + new URL(url).hash : url;
  return <section className="w-full rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-left space-y-3"><div className="flex items-center gap-2 font-bold text-emerald-950"><LinkIcon size={16}/>Customer-এর private order link</div><p className="text-xs text-slate-600">কেক, delivery, offer, payment ও live status দেখা যাবে। শুধু সংশ্লিষ্ট customer-কে দিন।</p>
    {url?<><input aria-label="Customer private order link" value={url} readOnly onFocus={e=>e.target.select()} className="w-full rounded-xl border bg-white p-3 text-xs text-slate-700"/><div className="flex flex-wrap gap-2"><button type="button" onClick={()=>void (navigator.clipboard?.writeText(url)||Promise.reject(new Error("Clipboard unavailable"))).then(()=>setMessage('Link copy হয়েছে।')).catch(()=>setMessage('Link select করে copy করুন।'))} className="ac-small-button"><Copy size={14}/>Copy link</button><a href={viewUrl} target="_blank" rel="noopener noreferrer" className="ac-small-button ac-small-button--light">Customer view<ArrowUpRight size={14}/></a></div></>:<button type="button" disabled={busy} onClick={()=>void create()} className="ac-small-button"><RefreshCw size={14} className={busy?'animate-spin':''}/>{busy?'Link তৈরি হচ্ছে…':'Customer link তৈরি করুন'}</button>}
    {url&&<button type="button" disabled={busy} onClick={()=>void revoke()} className="ac-small-button ac-small-button--light">Link বাতিল করুন</button>}
    <p className="text-xs text-slate-600">Link তৈরির পর ৩০ দিন ব্যবহার করা যাবে।</p>
    {!!message&&<p role="status" className="text-xs text-slate-600">{message}</p>}
  </section>;
}
