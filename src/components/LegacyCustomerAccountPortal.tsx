import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, ShieldCheck, RefreshCw, Link2, LogOut } from 'lucide-react';
import type { Order } from '../types';
import { verifyCustomerGoogle, linkCustomerReceipt, recoverCustomerReceipts } from '../services/sheetCustomerApi';
import { getAuroraGoogleClientId } from '../config/googleOAuth';
import { getPhoneCustomerProfile, signupPhoneCustomer, loginPhoneCustomer, updatePhoneCustomerProfile, phoneCustomerOrders, linkPhoneCustomerReceipt, logoutPhoneCustomer, changePhoneCustomerPassword, closePhoneCustomerAccount } from '../services/phoneCustomerApi';
import type { PhoneCustomerProfile } from '../services/phoneCustomerApi';
import { EmailSubscriptionPanel } from './EmailSubscriptionPanel';
import { normalizeCheckoutPhone } from '../services/customerPhoneLookup';

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
  onTrackOrder?:(orderId:string)=>void;
  onSwitchToGuest?:()=>void;
}
export const CustomerAccountPortal:React.FC<Props>=({open,onClose,endpoint,localReceipts,onRecover,onIdentityToken,onSignOut,onTrackOrder,onSwitchToGuest})=>{
  const clientId=getAuroraGoogleClientId();
  const loginRef=useRef<HTMLDivElement>(null);
  const [account,setAccount]=useState<{email:string;name:string;token:string}|null>(null);
  const [fedcmButton,setFedcmButton]=useState(true);
  const [googleUiError,setGoogleUiError]=useState('');
  const [linked,setLinked]=useState<Order[]>([]);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [phoneAccount,setPhoneAccount]=useState<{profile:PhoneCustomerProfile;token:string}|null>(null);
  const [phoneMode,setPhoneMode]=useState<'login'|'signup'>('login');
  const [phoneForm,setPhoneForm]=useState({name:'',phone:'',password:''});
  const [phoneHistory,setPhoneHistory]=useState<Order[]>([]);
  const [passwords,setPasswords]=useState({current:'',next:''});
  const [closingPassword,setClosingPassword]=useState('');
  const [phoneProfileDraft,setPhoneProfileDraft]=useState({name:'',email:'',address:''});
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

  useEffect(()=>{
    if(!open)return;
    let token='';try{token=sessionStorage.getItem('aurora_customer_phone_session_v1')||'';}catch{}
    if(!token)return;
    let active=true;
    (async()=>{
      try{
        const [profile,history]=await Promise.all([getPhoneCustomerProfile(endpoint,token),phoneCustomerOrders(endpoint,token)]);
        if(!active)return;
        setPhoneAccount({profile,token});
        setPhoneProfileDraft({name:profile.name,email:profile.email,address:profile.address});
        setPhoneHistory(history);
        onRecover(history);
      }catch{if(active)try{sessionStorage.removeItem('aurora_customer_phone_session_v1');}catch{}}
    })();
    return()=>{active=false;};
  },[open,endpoint]);
  const submitPhone=async(event:React.FormEvent)=>{
    event.preventDefault();if(busy)return;setBusy(true);setError('');
    try{
      const info=phoneMode==='signup'
        ? await signupPhoneCustomer(endpoint,phoneForm.name,phoneForm.phone,phoneForm.password)
        : await loginPhoneCustomer(endpoint,phoneForm.phone,phoneForm.password);
      // Link confirmed original receipts from this device after proving account
      // credentials. Never attach a guessed order by phone number alone.
      let history=await phoneCustomerOrders(endpoint,info.token);
      let linkedCount=0;
      const ownPhone=normalizeCheckoutPhone(info.profile.phone);
      const candidates=localReceipts.filter(order=>order.persistence==='google_sheets'
        && !!order.customer_access_token
        && normalizeCheckoutPhone(order.customer_phone)===ownPhone
        && !history.some(item=>item.id===order.id)).slice(0,8);
      for(const receipt of candidates){
        try{await linkPhoneCustomerReceipt(endpoint,info.token,receipt);linkedCount++;}
        catch{ /* Keep the original receipt on device; retry with its private key. */ }
      }
      if(linkedCount)history=await phoneCustomerOrders(endpoint,info.token);
      try{sessionStorage.setItem('aurora_customer_phone_session_v1',info.token);}catch{}
      setPhoneAccount(info);
      setPhoneHistory(history);
      setPhoneProfileDraft({name:info.profile.name,email:info.profile.email,address:info.profile.address});
      setPhoneForm({name:'',phone:'',password:''});
      onRecover(history);
      if(candidates.length>linkedCount)setError('Signed in. Some older receipts could not be linked automatically; check the original receipt key.');
    }catch(e){setError(e instanceof Error?e.message:'Phone account sign-in failed.');}
    finally{setBusy(false);}
  };
  const refreshPhone=async()=>{
    if(!phoneAccount||busy)return;setBusy(true);setError('');
    try{const history=await phoneCustomerOrders(endpoint,phoneAccount.token);setPhoneHistory(history);onRecover(history);}
    catch(e){setError(e instanceof Error?e.message:'Could not recover your orders.');}
    finally{setBusy(false);}
  };
  // Keep the phone customer's order history (and dispatch OTP) fresh while
  // this authenticated account page is open. Never poll hidden tabs.
  useEffect(()=>{
    if(!open||!phoneAccount?.token)return;
    let stopped=false,inFlight=false;
    const update=async()=>{
      if(stopped||inFlight||document.visibilityState==='hidden')return;
      inFlight=true;
      try{
        const history=await phoneCustomerOrders(endpoint,phoneAccount.token);
        if(stopped)return;
        setPhoneHistory(history);
        onRecover(history);
      }catch{
        // Keep previously confirmed history; manual Refresh will show errors.
      }finally{inFlight=false;}
    };
    const timer=window.setInterval(()=>{void update();},12000);
    const focus=()=>{void update();};
    window.addEventListener('focus',focus);
    return()=>{stopped=true;window.clearInterval(timer);window.removeEventListener('focus',focus);};
  },[open,phoneAccount?.token,endpoint]);

  const savePhoneProfile=async(event:React.FormEvent)=>{
    event.preventDefault();if(!phoneAccount||busy)return;setBusy(true);setError('');
    try{
      const profile=await updatePhoneCustomerProfile(endpoint,phoneAccount.token,phoneProfileDraft);
      setPhoneAccount(previous=>previous?{...previous,profile}:previous);
    }catch(e){setError(e instanceof Error?e.message:'Could not save profile to Google Sheets.');}
    finally{setBusy(false);}
  };
  const linkPhone=async(order:Order)=>{
    if(!phoneAccount||busy)return;setBusy(true);setError('');
    try{
      await linkPhoneCustomerReceipt(endpoint,phoneAccount.token,order);
      const history=await phoneCustomerOrders(endpoint,phoneAccount.token);
      setPhoneHistory(history);onRecover(history);
    }catch(e){setError(e instanceof Error?e.message:'Original receipt could not be linked.');}
    finally{setBusy(false);}
  };
  const signOutPhone=async()=>{
    const token=phoneAccount?.token;
    try{sessionStorage.removeItem('aurora_customer_phone_session_v1');}catch{}
    setPhoneAccount(null);setPhoneHistory([]);onSignOut?.();setError('');
    if(token)try{await logoutPhoneCustomer(endpoint,token);}catch{}
  };
  const changeMyPassword=async(event:React.FormEvent)=>{
    event.preventDefault();if(!phoneAccount||busy)return;
    setBusy(true);setError('');
    try{
      const newToken=await changePhoneCustomerPassword(endpoint,phoneAccount.token,passwords.current,passwords.next);
      try{sessionStorage.setItem('aurora_customer_phone_session_v1',newToken);}catch{}
      setPhoneAccount(current=>current?{...current,token:newToken}:current);
      setPasswords({current:'',next:''});
    }catch(e){setError(e instanceof Error?e.message:'Password update failed.');}
    finally{setBusy(false);}
  };
  const closeMyAccount=async(event:React.FormEvent)=>{
    event.preventDefault();if(!phoneAccount||busy)return;
    if(!window.confirm('Close your phone account and sign out all devices? Your previous COD order ledger must be kept for bookkeeping.'))return;
    setBusy(true);setError('');
    try{
      await closePhoneCustomerAccount(endpoint,phoneAccount.token,closingPassword);
      try{sessionStorage.removeItem('aurora_customer_phone_session_v1');}catch{}
      setPhoneAccount(null);setPhoneHistory([]);setClosingPassword('');onSignOut?.();
    }catch(e){setError(e instanceof Error?e.message:'Account could not be closed.');}
    finally{setBusy(false);}
  };
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
          <p className="text-sm text-emerald-100">Phone + password account · Private order history saved in Google Sheets</p></div>
        <button type="button" aria-label="Close customer account" onClick={onClose} className="p-2 rounded-full hover:bg-emerald-800"><X/></button>
      </header>
      <section className="space-y-5 p-5">
        {!phoneAccount ? (
          <section className="rounded-2xl border border-emerald-200 p-4 space-y-4">
            <h3 className="font-bold text-lg text-emerald-950">{phoneMode==='signup'?'Create an account with your phone':'Phone number login'}</h3>
            <form onSubmit={submitPhone} className="space-y-3">
              {phoneMode==='signup'&&<input required aria-label="Your name" autoComplete="name" placeholder="Your name"
                value={phoneForm.name} onChange={e=>setPhoneForm(f=>({...f,name:e.target.value}))} className="w-full border rounded-xl p-3"/>}
              <input required aria-label="Bangladesh mobile number" type="tel" autoComplete="tel" placeholder="01XXXXXXXXX"
                value={phoneForm.phone} onChange={e=>setPhoneForm(f=>({...f,phone:e.target.value}))} className="w-full border rounded-xl p-3"/>
              <input required aria-label="Account password" type="password" minLength={10}
                autoComplete={phoneMode==='signup'?'new-password':'current-password'} placeholder="Password (at least 10 characters)"
                value={phoneForm.password} onChange={e=>setPhoneForm(f=>({...f,password:e.target.value}))} className="w-full border rounded-xl p-3"/>
              <button disabled={busy} type="submit" className="w-full bg-emerald-800 text-white rounded-xl p-3 font-bold disabled:opacity-50">
                {busy?'Checking…':phoneMode==='signup'?'Sign up with phone':'Sign in'}
              </button>
            </form>
            <button type="button" onClick={()=>{setPhoneMode(m=>m==='signup'?'login':'signup');setError('');}}
              className="text-sm underline text-emerald-900">
              {phoneMode==='signup'?'Already registered? Sign in':'New customer? Create an account'}
            </button>
            <p className="text-xs text-amber-800 bg-amber-50 p-3 rounded-lg">
              Your mobile number is your login ID. Enter your account password to view saved delivery details and order history on any device.
              Phone ownership is not SMS verified, so a phone number alone cannot unlock private orders. Contact the shop if you forget your password.
            </p>
            {onSwitchToGuest && <button type="button" onClick={onSwitchToGuest}
              className="w-full rounded-xl border border-slate-200 p-3 text-sm font-medium text-slate-700">
              Continue as guest / Recover original receipt
            </button>}
          </section>
        ):(
          <section className="rounded-2xl bg-emerald-50 p-4 space-y-4">
            <div className="flex justify-between items-center gap-3">
              <div><h3 className="font-bold text-emerald-950">{phoneAccount.profile.name}</h3>
                <p className="text-sm text-slate-600">{phoneAccount.profile.phone} · Phone account</p></div>
              <button type="button" onClick={()=>void signOutPhone()} className="text-sm bg-white border rounded-xl p-2">Sign out</button>
            </div>
            <form onSubmit={savePhoneProfile} className="grid gap-3">
              <h4 className="font-bold">Profile saved in Google Sheets</h4>
              <input aria-label="Profile name" required value={phoneProfileDraft.name} onChange={e=>setPhoneProfileDraft(p=>({...p,name:e.target.value}))} className="border rounded-xl p-2"/>
              <input aria-label="Profile email optional" type="email" placeholder="Email (optional)" value={phoneProfileDraft.email} onChange={e=>setPhoneProfileDraft(p=>({...p,email:e.target.value}))} className="border rounded-xl p-2"/>
              <textarea aria-label="Delivery address" placeholder="Saved delivery address" value={phoneProfileDraft.address} onChange={e=>setPhoneProfileDraft(p=>({...p,address:e.target.value}))} className="border rounded-xl p-2"/>
              <button disabled={busy} type="submit" className="bg-emerald-800 text-white rounded-xl p-2 disabled:opacity-50">Save profile to Sheets</button>
            </form>
            <EmailSubscriptionPanel key={endpoint+phoneAccount.profile.id} endpoint={endpoint} authToken={phoneAccount.token} initialEmail={phoneAccount.profile.email}/>
            <details className="rounded-xl border border-emerald-200 bg-white p-3">
              <summary className="text-sm font-semibold cursor-pointer">Account security & password</summary>
              <form onSubmit={changeMyPassword} className="mt-3 space-y-2">
                <input type="password" required minLength={10} autoComplete="current-password"
                  aria-label="Current customer password" placeholder="Current password" className="w-full border rounded-lg p-2"
                  value={passwords.current} onChange={e=>setPasswords(p=>({...p,current:e.target.value}))}/>
                <input type="password" required minLength={10} autoComplete="new-password"
                  aria-label="New customer password" placeholder="New password (10+ characters)" className="w-full border rounded-lg p-2"
                  value={passwords.next} onChange={e=>setPasswords(p=>({...p,next:e.target.value}))}/>
                <button type="submit" disabled={busy} className="bg-emerald-800 text-white text-sm rounded-lg px-3 py-2">Change password and sign out other devices</button>
              </form>
            </details>
            <details className="rounded-xl border border-red-200 bg-white p-3">
              <summary className="text-sm font-semibold text-red-700 cursor-pointer">Close my phone account</summary>
              <form onSubmit={closeMyAccount} className="mt-3 space-y-2">
                <p className="text-xs text-slate-700">This disables account access, clears editable profile details and revokes sessions. Financial order and payment records are retained securely for COD reconciliation.</p>
                <input type="password" required minLength={10} autoComplete="current-password" placeholder="Confirm current password"
                  aria-label="Password to close customer account" className="w-full border rounded-lg p-2"
                  value={closingPassword} onChange={e=>setClosingPassword(e.target.value)}/>
                <button type="submit" disabled={busy} className="border border-red-500 text-red-700 text-sm rounded-lg px-3 py-2">Close account</button>
              </form>
            </details>
            <div className="space-y-2">
              <div className="flex justify-between items-center"><h4 className="font-bold">My order history ({phoneHistory.length})</h4>
                <button onClick={()=>void refreshPhone()} disabled={busy} type="button" className="text-sm underline">Refresh</button></div>
              {phoneHistory.length===0&&<p className="text-sm text-slate-600">No linked orders yet. Link an original receipt below or place a new order while signed in.</p>}
              {phoneHistory.map(order=><div key={order.id} className="text-sm p-3 bg-white rounded-xl break-all space-y-2">
                <div className="flex items-center gap-2 justify-between flex-wrap">
                  <p><strong>{order.order_number}</strong> · {order.status.replaceAll('_',' ')} · ৳{order.total_amount}</p>
                  {onTrackOrder&&<button type="button" onClick={()=>onTrackOrder(order.id)}
                    className="bg-emerald-800 text-white font-semibold rounded-xl px-3 py-2 text-xs">
                    Track live order
                  </button>}
                </div>
                {order.status==='out_for_delivery'&&
                  <p className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                    <strong className="block text-amber-900">Delivery Verification OTP</strong>
                    <span className="font-mono text-2xl font-bold tracking-widest text-amber-950">
                      {/^\d{4}$/.test(order.delivery_otp)?order.delivery_otp:'Checking with bakery…'}
                    </span>
                    <span className="block text-xs text-amber-900 mt-1">Tell your rider only after receiving your cake.</span>
                  </p>}
              </div>)}
            </div>
            {localReceipts.filter(order=>order.persistence==='google_sheets'&&
              !!order.customer_access_token&&!phoneHistory.some(saved=>saved.id===order.id)).map(order=>(
              <div key={order.id} className="flex flex-wrap gap-2 justify-between items-center text-sm bg-white p-2 rounded-xl">
                <span className="break-all">{order.order_number} · ৳{order.total_amount}</span>
                <button type="button" disabled={busy} onClick={()=>void linkPhone(order)}
                  className="rounded-xl bg-emerald-900 text-white p-2 disabled:opacity-50">Link original receipt</button>
              </div>
            ))}
          </section>
        )}
        {!phoneAccount && (!clientId?<p role="alert" className="p-4 bg-amber-50 rounded-xl text-amber-900">Customer account recovery needs the free Google OAuth Web Client ID configured by the shop owner. Guest COD orders are still available without sign-in.</p>
        :!account?<div className="space-y-4 text-center">
          <p className="text-sm text-slate-700">Previously linked orders? You can still use your Google account below. New customers can use phone + password above.</p>
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
            {linked.map(o=><div key={o.id} className="text-xs break-all space-y-1">
              <p>{o.order_number} · {o.status.replaceAll('_',' ')} · ৳{o.total_amount}</p>
              {o.status==='out_for_delivery' && <p className="bg-amber-50 rounded-lg p-2 text-amber-950">
                Delivery OTP: <strong className="font-mono text-xl tracking-widest">{/^\d{4}$/.test(o.delivery_otp)?o.delivery_otp:'Refresh to check'}</strong>
              </p>}
            </div>)}
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
        </>)}
        {busy&&<p role="status" className="text-sm">Checking your account…</p>}
        {error&&<p role="alert" className="text-sm p-4 bg-red-50 border rounded-xl text-red-800">{error}</p>}
      </section>
    </div>
  </div>;
};