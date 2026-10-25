import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, ShieldCheck, RefreshCw, Link2, LogOut } from 'lucide-react';
import type { Order } from '../types';
import { verifyCustomerGoogle, linkCustomerReceipt, recoverCustomerReceipts } from '../services/sheetCustomerApi';
import { getAuroraGoogleClientId } from '../config/googleOAuth';

type GoogleSdk = {
  initialize: (options: { client_id: string; callback: (result:{credential?:string})=>void; ux_mode?:'popup'; use_fedcm_for_button?:boolean;auto_select?:boolean }) => void;
  renderButton: (element:HTMLElement, options:{theme:string;size:string;text:string}) => void;
};
const sdk=():GoogleSdk|undefined=>
  (window as Window & {google?:{accounts?:{id?:GoogleSdk}}}).google?.accounts?.id;

interface Props {
  open:boolean;
  onClose:()=>void;
  endpoint:string;
  localReceipts:Order[];
  onRecover:(orders:Order[])=>void;
  onIdentityToken:(token:string)=>void;
  onSignOut?:()=>void;
}
export const CustomerAccountPortal:React.FC<Props>=({open,onClose,endpoint,localReceipts,onRecover,onIdentityToken,onSignOut})=>{
  const clientId=getAuroraGoogleClientId();
  const loginRef=useRef<HTMLDivElement>(null);
  const [account,setAccount]=useState<{email:string;name:string;token:string}|null>(null);
  const [fedcmButton,setFedcmButton]=useState(true);
  const [googleUiError,setGoogleUiError]=useState('');
  const [linked,setLinked]=useState<Order[]>([]);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const signIn=useCallback(async(token:string)=>{
    setBusy(true);setError('');
    try {
      const profile=await verifyCustomerGoogle(endpoint,token);
      const orders=await recoverCustomerReceipts(endpoint,token);
      setAccount({...profile,token});
      onIdentityToken(token);
      setLinked(orders);
    } catch(e){setError(e instanceof Error?e.message:'Google login could not be confirmed.');}
    finally{setBusy(false);}
  },[endpoint,onIdentityToken]);

  useEffect(()=>{
    if(!open||account||!clientId)return;
    let active=true;
    const render=()=>{
      if(!active||!loginRef.current||!sdk())return;
      loginRef.current.replaceChildren();
      const id=sdk()!;
      try{
        id.initialize({client_id:clientId,ux_mode:'popup',use_fedcm_for_button:fedcmButton,auto_select:false,
          callback:r=>{if(r.credential)void signIn(r.credential);else setGoogleUiError('Google did not return a login credential. Check the authorized origin.');}});
        id.renderButton(loginRef.current,{theme:'outline',size:'large',text:'signin_with'});
        setGoogleUiError('');
      }catch{setGoogleUiError('Google Sign-In could not initialize. Disable browser extensions and reload.');}
    };
    let script=document.getElementById('aurora-google-identity') as HTMLScriptElement|null;
    if(!script){
      script=document.createElement('script');
      script.id='aurora-google-identity';
      script.src='https://accounts.google.com/gsi/client';
      script.async=true;document.head.appendChild(script);
    }
    const scriptError=()=>{if(active)setGoogleUiError('Google Sign-In script was blocked. Check browser privacy settings and reload.');};
    script.addEventListener('load',render);
    script.addEventListener('error',scriptError);
    render();
    return ()=>{active=false;script?.removeEventListener('load',render);script?.removeEventListener('error',scriptError);};
  },[open,account,clientId,fedcmButton,signIn]);

  const refresh=async()=>{
    if(!account)return;
    setBusy(true);setError('');
    try{setLinked(await recoverCustomerReceipts(endpoint,account.token));}
    catch(e){setError(e instanceof Error?e.message:'Could not recover orders. Sign in again if your session expired.');}
    finally{setBusy(false);}
  };
  const link=async(order:Order)=>{
    if(!account||busy)return;
    setBusy(true);setError('');
    try{
      await linkCustomerReceipt(endpoint,account.token,order);
      setLinked(await recoverCustomerReceipts(endpoint,account.token));
    }catch(e){setError(e instanceof Error?e.message:'This receipt could not be linked.');}
    finally{setBusy(false);}
  };
  const restore=()=>{
    if(!linked.length)return;
    onRecover(linked);
    setError('');
  };
  if(!open)return null;
  const unlinked=localReceipts.filter(o=>o.persistence==='google_sheets'&&!linked.some(linkedOrder=>linkedOrder.id===o.id));
  return <div role="dialog" aria-modal="true" aria-labelledby="customer-google-title"
    className="fixed inset-0 z-[85] bg-slate-950/75 p-3 sm:p-7 overflow-y-auto">
    <div className="mx-auto max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden">
      <header className="flex items-start justify-between gap-3 bg-emerald-950 text-white p-5">
        <div><h2 id="customer-google-title" className="flex items-center gap-2 text-xl font-black"><ShieldCheck/> My bakery orders</h2>
          <p className="text-sm text-emerald-100">Free Google sign-in · No paid SMS or payment gateway</p></div>
        <button type="button" aria-label="Close customer account" onClick={onClose} className="p-2 rounded-full hover:bg-emerald-800"><X/></button>
      </header>
      <section className="space-y-5 p-5">
        {!clientId?<p role="alert" className="p-4 bg-amber-50 rounded-xl text-amber-900">Customer account recovery needs the free Google OAuth Web Client ID configured by the shop owner. Guest COD orders are still available without sign-in.</p>
        :!account?<div className="space-y-4 text-center">
          <p className="text-sm text-slate-700">Sign in to recover receipts that you previously linked to this Google account. A phone number alone does not prove ownership without SMS verification.</p>
          <div ref={loginRef} className="min-h-12 flex justify-center"/>
          <button type="button" className="text-xs underline text-emerald-800" onClick={()=>{setGoogleUiError('');setFedcmButton(v=>!v);}}>
            {fedcmButton?'Google button not working? Try classic popup mode':'Try browser-managed Google sign-in instead'}
          </button>
          <p className="text-xs text-slate-500 break-all">Google OAuth origin: {typeof window !== 'undefined'?window.location.origin:''}</p>
          {googleUiError&&<p role="alert" className="rounded-lg p-3 bg-red-50 text-sm text-red-800">{googleUiError}</p>}
        </div>:<>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div><p className="font-bold">{account.name}</p><p className="text-sm text-slate-500">{account.email}</p></div>
            <button type="button" onClick={()=>{setAccount(null);setLinked([]);onIdentityToken('');onSignOut?.();}} className="flex items-center gap-1 text-sm border px-3 py-2 rounded-lg"><LogOut size={15}/> Sign out</button>
          </div>
          <div className="rounded-xl bg-emerald-50 p-4 space-y-2">
            <h3 className="font-bold text-emerald-950">Linked orders ({linked.length})</h3>
            <p className="text-sm text-slate-700">Orders linked to your verified Google account. Restore saves them to this device. Signing out clears only orders restored in this session; original guest receipts on this device remain.</p>
            {linked.map(o=><p key={o.id} className="text-xs break-all">{o.order_number} · {o.status} · ৳{o.total_amount}</p>)}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={()=>void refresh()} className="flex gap-1 items-center border rounded-lg px-3 py-2 bg-white text-sm"><RefreshCw size={14}/> Refresh</button>
              <button type="button" disabled={busy||!linked.length} onClick={restore} className="rounded-lg bg-emerald-800 disabled:opacity-40 text-white font-semibold px-3 py-2 text-sm">Restore linked orders to this device</button>
            </div>
          </div>
          {!!unlinked.length&&<div className="rounded-xl border p-4 space-y-3">
            <h3 className="font-bold">Unlinked receipts on this device ({unlinked.length})</h3>
            <p className="text-sm text-slate-600">Link only receipts belonging to you. This permanently associates each order with the signed-in Google account. Do not link receipts on a shared device without checking ownership.</p>
            {unlinked.map(o=><div key={o.id} className="border-t py-2 flex justify-between items-center gap-2">
              <p className="text-xs break-all">{o.order_number} · ৳{o.total_amount}</p>
              <button type="button" disabled={busy} onClick={()=>void link(o)} className="shrink-0 flex gap-1 items-center bg-slate-900 text-white px-3 py-2 rounded-lg text-xs disabled:opacity-40"><Link2 size={13}/> Link</button>
            </div>)}
          </div>}
        </>}
        {busy&&<p role="status" className="text-sm">Checking your account…</p>}
        {error&&<p role="alert" className="text-sm p-4 bg-red-50 border rounded-xl text-red-800">{error}</p>}
      </section>
    </div>
  </div>;
};