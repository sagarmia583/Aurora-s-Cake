import React, { useEffect, useRef, useState } from 'react';
import { Mail, RefreshCw } from 'lucide-react';
import { getEmailSubscription, isEmailSetupUnavailable, requestEmailSubscription, unsubscribeEmail } from '../services/emailSubscriptions';
import type { EmailSubscription } from '../services/emailSubscriptions';

interface Props {endpoint:string;authToken?:string;initialEmail?:string;onSignIn?:()=>void;}
export function EmailSubscriptionPanel({endpoint,authToken,initialEmail='',onSignIn}:Props){
  const [subscription,setSubscription]=useState<EmailSubscription|null>(null);
  const [email,setEmail]=useState(initialEmail);
  const [consent,setConsent]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [setupUnavailable,setSetupUnavailable]=useState(false);
  const [message,setMessage]=useState('');
  const identity=useRef({endpoint,authToken});
  identity.current={endpoint,authToken};
  useEffect(()=>{
    setSubscription(null);setConsent(false);setError('');setMessage('');setEmail(initialEmail);setSetupUnavailable(false);
    if(!authToken)return;
    let active=true;setBusy(true);
    getEmailSubscription(endpoint,authToken).then(value=>{if(active){setSubscription(value);if(value.email)setEmail(value.email);}})
      .catch(e=>{if(active){setSetupUnavailable(isEmailSetupUnavailable(e));setError(isEmailSetupUnavailable(e)?'Product email preferences need the latest bakery backend setup. Your account and orders still work.':e instanceof Error?e.message:'Email preferences are unavailable.');}})
      .finally(()=>{if(active)setBusy(false);});
    return()=>{active=false;};
  },[endpoint,authToken]);
  const act=async(kind:'subscribe'|'unsubscribe'|'refresh')=>{
    if(!authToken||busy)return;
    const source={endpoint,authToken};setBusy(true);setError('');setMessage('');
    try{
      const next=kind==='subscribe'?await requestEmailSubscription(endpoint,authToken,email,consent)
        :kind==='unsubscribe'?await unsubscribeEmail(endpoint,authToken):await getEmailSubscription(endpoint,authToken);
      if(identity.current.endpoint!==source.endpoint||identity.current.authToken!==source.authToken)return;
      setSetupUnavailable(false);setSubscription(next);if(next.email)setEmail(next.email);setConsent(false);
      setMessage(kind==='unsubscribe'?'Product emails are turned off.':next.status==='subscribed'?'Your email is confirmed for product announcements.':next.status==='pending_confirmation'?'Check your inbox, open the confirmation link, then press Confirm email updates. You are not subscribed until you confirm.':'Email preference refreshed.');
    }catch(e){if(identity.current.endpoint===source.endpoint&&identity.current.authToken===source.authToken){setSetupUnavailable(isEmailSetupUnavailable(e));setError(isEmailSetupUnavailable(e)?'Product email preferences need the latest bakery backend setup. Your account and orders still work.':e instanceof Error?e.message:'Email preference could not be updated.');}}
    finally{if(identity.current.endpoint===source.endpoint&&identity.current.authToken===source.authToken)setBusy(false);}
  };
  return <section className="rounded-2xl border border-emerald-200 bg-white p-4 space-y-3" aria-label="Product email preferences">
    <h4 className="font-bold text-emerald-950 flex items-center gap-2"><Mail size={18}/> New cakes in your inbox</h4>
    <p className="text-sm text-slate-600">Choose whether to receive product launches from Aurora’s Cake. Every announcement includes an unsubscribe link.</p>
    {!authToken?<>
      <p className="text-xs text-slate-600">Sign in to your mobile account to save your email preference on every device.</p>
      {onSignIn&&<button type="button" onClick={onSignIn} className="rounded-lg bg-emerald-800 text-white px-3 py-2 text-sm">Sign in to manage emails</button>}
    </>:<>
      {subscription?.status==='subscribed'&&<div className="rounded-lg bg-emerald-50 p-3 text-sm"><strong>Subscribed:</strong> {subscription.email}<p className="text-xs mt-1">Email ownership confirmed.</p></div>}
      {subscription?.status==='pending_confirmation'&&<p className="text-sm rounded-lg bg-amber-50 p-3 text-amber-900">Confirmation pending for {subscription.email}. No product announcements will be sent until you confirm.</p>}
      {!setupUnavailable&&<form onSubmit={event=>{event.preventDefault();void act('subscribe');}} className="space-y-3">
        <label className="block text-sm font-medium text-slate-700">Email for product updates
          <input type="email" required maxLength={150} autoComplete="email" aria-label="Product update email" value={email}
            onChange={event=>{setEmail(event.target.value);setConsent(false);}} disabled={busy} placeholder="you@example.com" className="mt-1 w-full rounded-xl border border-slate-300 p-2.5"/>
        </label>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)} disabled={busy} className="mt-1"/>
          <span>I want new product announcements by email. I can unsubscribe at any time.</span>
        </label>
        <button type="submit" disabled={busy||!consent} className="rounded-xl bg-emerald-800 text-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50">{busy?'Please wait…':'Send confirmation email'}</button>
      </form>}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={()=>void act('refresh')} disabled={busy} className="inline-flex items-center gap-1 text-sm text-emerald-800 underline disabled:opacity-50"><RefreshCw size={14}/> Check confirmation status</button>
        {subscription&&subscription.status!=='not_subscribed'&&subscription.status!=='unsubscribed'&&<button type="button" onClick={()=>void act('unsubscribe')} disabled={busy} className="text-sm text-slate-600 underline disabled:opacity-50">Stop product emails</button>}
      </div>
    </>}
    {error&&<p role="alert" className="text-sm rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
    {message&&<p role="status" className="text-sm rounded-lg bg-emerald-50 p-3 text-emerald-900">{message}</p>}
  </section>;
}
