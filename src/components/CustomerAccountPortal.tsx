import React, { Suspense, useMemo, useState } from 'react';
import { ClipboardCopy, KeyRound, MapPin, PackageCheck, Phone, ShieldCheck, X } from 'lucide-react';
import type { Order } from '../types';
import { EmailSubscriptionPanel } from './EmailSubscriptionPanel';
import { privatePost } from '../services/sheetStaffApi';
import { recoverOrderWithReceiptKey } from '../services/receiptRecovery';

const LegacyAccounts=React.lazy(()=>import('./LegacyCustomerAccountPortal')
  .then(module=>({default:module.CustomerAccountPortal})));
type Contact={name:string;phone:string;address:string;email:string};
const digits=(phone:string)=>phone.replace(/\D/g,'').replace(/^88(?=01[3-9]\d{8}$)/,'');
function previousContact():Contact{
  try{
    const obj=JSON.parse(localStorage.getItem('aurora_customer_profile_v1')||'{}');
    if(!obj||typeof obj!=='object')return {name:'',phone:'',address:'',email:''};
    return {name:String(obj.name||''),phone:String(obj.phone||''),address:String(obj.address||''),
      email:String(obj.email||'')};
  }catch{return {name:'',phone:'',address:'',email:''};}
}
interface Props {
  open:boolean;
  onClose:()=>void;
  endpoint:string;
  localReceipts:Order[];
  onRecover:(orders:Order[])=>void;
  onIdentityToken:(token:string)=>void;
  onSignOut?:()=>void;
  onTrackOrder?:(orderId:string)=>void;
}
export const CustomerAccountPortal:React.FC<Props>=(props)=>{
  const {open,onClose,endpoint,localReceipts,onRecover,onTrackOrder}=props;
  const [contact,setContact]=useState<Contact>(previousContact);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [recovery,setRecovery]=useState({orderId:'',phone:'',key:''});
  const [showGuest,setShowGuest]=useState(false);
  const ownReceipts=useMemo(()=>localReceipts
    .filter(order=>!!order.customer_access_token&&digits(order.customer_phone)===digits(contact.phone))
    .sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))),
    [localReceipts,contact.phone]);
  const saveContact=async(event:React.FormEvent)=>{
    event.preventDefault();if(busy)return;
    const name=contact.name.trim(),phone=digits(contact.phone),address=contact.address.trim();
    if(name.length<2||!/^(01[3-9]\d{8})$/.test(phone)||address.length<6){
      setError('Name, an 11-digit Bangladesh mobile number and complete address are required.');return;
    }
    setBusy(true);setError('');setMessage('');
    try{
      const saved=await privatePost(endpoint,{action:'customer_contact_submit',name,phone,address});
      if(saved.saved!==true)throw new Error('Customer details were not confirmed.');
      localStorage.setItem('aurora_customer_profile_v1',JSON.stringify({...contact,name,phone,address}));
      setContact(previous=>({...previous,name,phone,address}));
      setMessage('Contact details saved in the private bakery Google Sheet. Phone ownership is not verified.');
    }catch(e){setError(e instanceof Error?e.message:'Saving your contact details failed.');}
    finally{setBusy(false);}
  };
  const recover=async(event:React.FormEvent)=>{
    event.preventDefault();if(busy)return;
    setBusy(true);setError('');setMessage('');
    try{
      const order=await recoverOrderWithReceiptKey(endpoint,recovery.orderId.trim(),recovery.phone.trim(),recovery.key.trim());
      onRecover([order]);
      setContact(previous=>({
        ...previous,phone:order.customer_phone,
        name:previous.name||order.customer_name,address:previous.address||order.delivery_address
      }));
      setRecovery({orderId:'',phone:'',key:''});
      setMessage('Your private receipt was verified and restored on this device.');
    }catch(e){setError(e instanceof Error?e.message:'Receipt recovery failed.');}
    finally{setBusy(false);}
  };
  const copyReceipt=async(order:Order)=>{
    if(!order.customer_access_token)return;
    try{
      await navigator.clipboard.writeText(
        'Order ID: '+order.id+'\nPhone: '+order.customer_phone+'\nPrivate receipt key: '+order.customer_access_token
      );
      setMessage('Private recovery details copied. Store securely and never share them publicly.');
    }catch{setError('Clipboard access unavailable. Save your original receipt safely.');}
  };
  if(!open)return null;
  if(!showGuest)return <Suspense fallback={<div role="status" className="fixed inset-0 z-[85] bg-slate-950/70 flex items-center justify-center text-white">Loading your secure mobile account…</div>}>
    <LegacyAccounts {...props} open={true} onTrackOrder={onTrackOrder} onSwitchToGuest={()=>setShowGuest(true)}/>
  </Suspense>;
  return <div role="dialog" aria-modal="true" aria-labelledby="customer-orders-title"
    className="fixed inset-0 z-[85] bg-slate-950/75 p-3 sm:p-7 overflow-y-auto">
    <div className="mx-auto max-w-3xl rounded-3xl overflow-hidden bg-white shadow-2xl">
      <header className="bg-gradient-to-r from-emerald-950 to-emerald-800 text-white p-5 flex gap-3 justify-between">
        <div>
          <h2 id="customer-orders-title" className="font-black text-2xl flex items-center gap-2">
            <PackageCheck size={24}/> Customer details & my orders
          </h2>
          <p className="text-sm text-emerald-100 mt-1">No password. Your name, mobile and address are all you need to order.</p>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} className="rounded-full hover:bg-emerald-700 p-2 self-start"><X/></button>
      </header>
      <div className="p-5 space-y-5">
        {error&&<p role="alert" className="rounded-xl bg-red-50 border border-red-200 p-3 text-red-800 text-sm">{error}</p>}
        {message&&<p role="status" className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-emerald-900 text-sm">{message}</p>}
        <section className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 space-y-3">
          <h3 className="font-bold text-emerald-950 flex items-center gap-2"><Phone size={17}/> Save customer details</h3>
          <form onSubmit={saveContact} className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm font-semibold">Your name
              <input value={contact.name} onChange={e=>setContact(p=>({...p,name:e.target.value}))}
                required autoComplete="name" placeholder="Full name" className="w-full mt-1 p-3 rounded-xl border bg-white"/>
            </label>
            <label className="text-sm font-semibold">Mobile number
              <input value={contact.phone} onChange={e=>setContact(p=>({...p,phone:e.target.value}))}
                required inputMode="tel" autoComplete="tel" placeholder="01XXXXXXXXX"
                className="w-full mt-1 p-3 rounded-xl border bg-white"/>
            </label>
            <label className="text-sm font-semibold sm:col-span-2">Delivery address
              <textarea value={contact.address} onChange={e=>setContact(p=>({...p,address:e.target.value}))}
                required autoComplete="street-address" placeholder="House, road, area and location" rows={2}
                className="w-full mt-1 p-3 rounded-xl border bg-white"/>
            </label>
            <button type="submit" disabled={busy} className="rounded-xl bg-emerald-800 text-white font-bold p-3 sm:col-span-2 disabled:opacity-50">
              {busy?'Saving…':'Save name, phone & address'}
            </button>
          </form>
          <p className="text-xs text-slate-600">
            Your submitted contact is saved privately as unverified until an order is confirmed.
            Staff may search your number; the website does not reveal anyone's saved address by phone number alone.
          </p>
        </section>
        <section className="rounded-2xl border p-4 space-y-3">
          <h3 className="font-bold text-lg flex items-center gap-2"><PackageCheck size={18}/> My confirmed orders ({ownReceipts.length})</h3>
          <p className="text-xs text-slate-600">Enter the same phone number used during checkout. Only private receipts saved on this device appear here.</p>
          {!ownReceipts.length&&<p className="text-sm text-slate-500 bg-slate-50 p-3 rounded-xl">
            No saved receipts for this phone on this device. Placing a COD order saves the full order in Google Sheets.
            To recover an earlier order on another device, use its original private receipt key below.
          </p>}
          {ownReceipts.slice(0,60).map(order=><article key={order.id} className="rounded-xl border p-3 flex gap-3 flex-wrap items-center justify-between">
            <div className="min-w-0">
              <strong className="block">{order.order_number}</strong>
              <p className="text-sm text-slate-600">{order.status.replaceAll('_',' ')} · ৳{order.total_amount}</p>
              {order.status==='out_for_delivery'&&
                <p className="mt-1 text-amber-900 font-semibold">Delivery OTP: {/^\d{4}$/.test(order.delivery_otp)?order.delivery_otp:'Open tracking to refresh'}</p>}
            </div>
            <div className="flex gap-2 flex-wrap">
              {onTrackOrder&&<button type="button" onClick={()=>onTrackOrder(order.id)}
                className="rounded-lg bg-emerald-800 text-white px-3 py-2 text-sm">Track order</button>}
              <button type="button" onClick={()=>void copyReceipt(order)} className="rounded-lg border px-3 py-2 text-sm flex items-center gap-1">
                <ClipboardCopy size={14}/> Copy private receipt
              </button>
            </div>
          </article>)}
        </section>
        <section className="border rounded-2xl p-4 space-y-3">
          <h3 className="font-bold text-lg flex items-center gap-2"><KeyRound size={18}/> Recover an order on another device</h3>
          <p className="text-xs text-slate-600">No password or SMS needed. Use the Order ID, phone and private key from your original receipt. A phone number alone cannot unlock another person's order or OTP.</p>
          <form onSubmit={recover} className="grid sm:grid-cols-2 gap-3">
            <input required aria-label="Original Order ID" placeholder="Original Order ID (ord_...)" value={recovery.orderId}
              onChange={e=>setRecovery(p=>({...p,orderId:e.target.value}))} className="p-3 rounded-xl border"/>
            <input required aria-label="Receipt phone number" placeholder="Order phone number" value={recovery.phone}
              onChange={e=>setRecovery(p=>({...p,phone:e.target.value}))} className="p-3 rounded-xl border"/>
            <input required aria-label="Private Receipt Access Key" placeholder="Private receipt access key"
              value={recovery.key} onChange={e=>setRecovery(p=>({...p,key:e.target.value}))}
              className="p-3 rounded-xl border sm:col-span-2" autoComplete="off"/>
            <button disabled={busy} type="submit" className="rounded-xl bg-slate-900 text-white font-semibold p-3 sm:col-span-2 disabled:opacity-50">
              {busy?'Checking…':'Recover original receipt'}
            </button>
          </form>
        </section>
        <p className="text-xs text-slate-500 flex gap-2 items-start"><ShieldCheck size={16} className="shrink-0"/>
          We never disclose customer names, addresses, complete order history or rider OTP through an anonymous phone-only search.
        </p>
        <EmailSubscriptionPanel endpoint={endpoint} onSignIn={()=>setShowGuest(false)}/>
        <button type="button" onClick={()=>setShowGuest(false)} className="w-full bg-emerald-800 text-white font-semibold p-3 rounded-xl">
          Open mobile account & saved order history
        </button>
      </div>
    </div>

  </div>;
};
