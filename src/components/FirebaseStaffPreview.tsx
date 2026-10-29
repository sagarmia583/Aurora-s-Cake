import React, {useCallback,useState} from 'react';
import {ShieldCheck, LockKeyhole, RefreshCw, LogOut, MailCheck, ShoppingBag} from 'lucide-react';
import {
  type RestStaffAuthSession,
  signInFirebaseStaffRest,refreshFirebaseStaffRest,
  sendFirebaseStaffVerification,requestFirebaseStaffPasswordReset,
  describeFirebaseRestAuthError
} from '../services/firebaseStaffRestAuth';

/** Injected public Git revision; never a Firebase token. */
declare const __AURORA_BUILD_ID__: string;
type StaffSession={uid:string;email:string;name:string;role:string};
type StaffOrder={id:string;order_number:string;status:string;customer_name:string;customer_phone:string;total_amount:number;created_at:string;payment_status:string};
type StaffApi={ok:boolean;code?:string;session?:StaffSession;orders?:StaffOrder[];read_only?:boolean;has_more?:boolean};

const api=async(path:string,idToken:string):Promise<StaffApi>=>{
  // Firebase's signed ID token is sent only to our same-origin Worker.
  // No credentials or tokens are ever added to a URL.
  const response=await fetch('/api/firebase-primary/staff/'+path,{
    method:'GET',credentials:'same-origin',cache:'no-store',
    headers:{Authorization:'Bearer '+idToken}
  });
  const body=await response.json().catch(()=>null) as StaffApi|null;
  if(!body||body.ok!==true)throw new Error(body?.code||'firebase_staff_unavailable');
  return body;
};

/** Cloudflare-only, in-memory REST login. Never uses legacy Sheets login. */
export function FirebaseStaffPreview(){
  const [user,setUser]=useState<RestStaffAuthSession|null>(null);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [session,setSession]=useState<StaffSession|null>(null);
  const [orders,setOrders]=useState<StaffOrder[]>([]);
  const [hasMore,setHasMore]=useState(false);
  const verified=user?.emailVerified===true;

  const refresh=useCallback(async()=>{
    if(!user||!user.emailVerified)return;
    setBusy(true);setError('');
    try{
      const active=user.expiresAt<Date.now()+120000
        ?await refreshFirebaseStaffRest(user):user;
      if(active!==user)setUser(active);
      const identity=await api('session',active.idToken);
      if(!identity.session)throw new Error('firebase_staff_invalid_session');
      setSession(identity.session);
      const orderData=await api('orders',active.idToken);
      setOrders(Array.isArray(orderData.orders)?orderData.orders:[]);
      setHasMore(orderData.has_more===true);
    }catch(e){
      setOrders([]);
      setError(e instanceof Error?e.message:'Could not verify your Firebase staff role.');
    }finally{setBusy(false);}
  },[user]);
  const login=async(event:React.FormEvent)=>{
    event.preventDefault();
    if(busy)return;
    setBusy(true);setError('');setNotice('');
    try{
      const authenticated=await signInFirebaseStaffRest(email.trim(),password);
      setUser(authenticated);
      setPassword('');
      setSession(null);setOrders([]);
    }catch(error){
      setPassword('');
      setError(describeFirebaseRestAuthError(error));
    }finally{setBusy(false);}
  };
  const resetPassword=async()=>{
    if(busy)return;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())){
      setError('Enter a valid Firebase Authentication email to request password reset.');
      return;
    }
    setBusy(true);setError('');setNotice('');
    try{
      await requestFirebaseStaffPasswordReset(email.trim());
      setNotice('If a Firebase Email/Password account exists for this address, password-reset instructions have been requested. Check inbox and spam.');
    }catch(e){setError(describeFirebaseRestAuthError(e));}
    finally{setBusy(false);}
  };
  const logout=()=>{
    // No persistence: forget ID and refresh token as soon as user signs out.
    setUser(null);setPassword('');setSession(null);setOrders([]);
    setHasMore(false);setError('');setNotice('');
  };
  const verifyEmail=async()=>{
    if(!user)return;
    setBusy(true);setError('');setNotice('');
    try{
      await sendFirebaseStaffVerification(user);
      setNotice('Verification email requested. Follow the verification link, then return here and choose "I have verified".');
    }catch(e){setError(describeFirebaseRestAuthError(e));}
    finally{setBusy(false);}
  };
  const reloadVerified=async()=>{
    if(!user)return;
    setBusy(true);setError('');setNotice('');
    try{
      // Fetch a fresh, signed ID token so the Worker sees email_verified=true.
      const active=await refreshFirebaseStaffRest(user);
      setUser(active);
      if(!active.emailVerified)setNotice('Email is not verified yet. Use the verification link and retry.');
      else setNotice('Email verified. You can now load the protected staff session.');
    }catch(e){setError(describeFirebaseRestAuthError(e));}
    finally{setBusy(false);}
  };
  return <main className="min-h-screen bg-[#f4f5f0] p-4 sm:p-8 text-slate-900">
    <div className="max-w-5xl mx-auto space-y-5">
      <header className="rounded-3xl bg-[#173e31] text-white p-6 sm:p-8">
        <div className="flex gap-3 items-center"><ShieldCheck className="h-7 w-7"/><div><h1 className="text-2xl font-black">Aurora’s Cake · Firebase Staff Preview</h1><p className="text-white/70 text-sm">Cloudflare Worker + Firestore · Independent of Google Sheets</p></div></div>
        <p className="mt-3 text-sm text-white/80">Read-only test workspace. Authentication goes directly to Google Firebase; production checkout has not been migrated.</p>
      </header>
      {error&&<p role="alert" className="p-4 rounded-2xl border border-amber-300 bg-amber-50 text-sm break-words">{error}</p>}
      {notice&&<p role="status" className="p-4 rounded-2xl border border-emerald-300 bg-emerald-50 text-sm break-words">{notice}</p>}
      <p className="text-xs text-slate-600" data-testid="firebase-auth-sdk-status">Cloudflare Build: {__AURORA_BUILD_ID__} · Auth transport: Google Firebase REST · SDK-independent</p>
      {!user?<section className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-8 max-w-lg mx-auto">
        <div className="flex items-center gap-2 mb-5"><LockKeyhole className="w-5 h-5"/><h2 className="font-extrabold text-xl">Staff sign in</h2></div>
        <p className="text-sm text-slate-600 mb-5">Sign in with a Firebase Authentication staff account. Public signup is not available. A verified, approved Firestore staff role is required.</p>
        <form onSubmit={login} className="space-y-4">
          <label className="block text-sm font-medium">Email<input required type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} className="block w-full rounded-xl border border-slate-300 p-3 mt-1"/></label>
          <label className="block text-sm font-medium">Password<input required minLength={6} type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} className="block w-full rounded-xl border border-slate-300 p-3 mt-1"/></label>
          <button type="submit" disabled={busy} className="w-full rounded-xl p-3 bg-[#173e31] text-white font-bold disabled:opacity-60">Sign in securely</button>
          <button type="button" disabled={busy} onClick={()=>void resetPassword()} className="text-sm text-[#173e31] underline disabled:opacity-60">Forgot Firebase password? Request reset email</button>
        </form>
        <div className="text-xs text-slate-600 mt-5 space-y-2">
          <p>The password here must be for a <strong>Firebase Authentication → Users</strong> account, not the old bakery employee login. A Firestore staff_roles document alone is not a login.</p>
          <p>Owner setup: <a className="underline" href="https://console.firebase.google.com/project/aurorascake-213a0/authentication/providers" target="_blank" rel="noopener noreferrer">Enable Email/Password provider</a> · <a className="underline" href="https://console.firebase.google.com/project/aurorascake-213a0/authentication/users" target="_blank" rel="noopener noreferrer">Check Authentication Users</a>.</p>
        </div>
      </section>:<section className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-7 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap"><div><h2 className="font-bold text-lg">{user.email}</h2><p className="text-slate-500 text-xs">Firebase Auth UID: {user.uid}</p></div><button onClick={()=>void logout()} className="rounded-xl border border-slate-300 px-4 py-2 flex gap-2 items-center" disabled={busy}><LogOut className="h-4 w-4"/>Sign out</button></div>
        {!verified?<div className="space-y-3 rounded-xl bg-amber-50 border border-amber-200 p-4"><p className="text-sm">Email verification required before accessing private bakery records.</p><div className="flex flex-wrap gap-2"><button onClick={()=>void verifyEmail()} disabled={busy} className="rounded-lg bg-[#173e31] text-white px-3 py-2 flex items-center gap-2"><MailCheck className="w-4 h-4"/>Send verification email</button><button onClick={()=>void reloadVerified()} disabled={busy} className="rounded-lg border border-slate-300 px-3 py-2">I have verified</button></div></div>
        :<><div className="flex flex-wrap items-center gap-3">
          <button onClick={()=>void refresh()} disabled={busy} className="rounded-xl bg-[#173e31] text-white px-4 py-2 flex items-center gap-2 disabled:opacity-60"><RefreshCw className="w-4 h-4"/>Verify staff & load orders</button>
          {session&&<span className="text-sm">Verified role: <strong>{session.role.replaceAll('_',' ')}</strong></span>}
        </div>
        {!session&&<p className="text-xs text-slate-500">No automatic admin access: your UID must exist as an active private staff_roles document.</p>}
        {session&&<div className="space-y-3">
          <h3 className="font-extrabold flex items-center gap-2"><ShoppingBag className="h-5 w-5"/>Firestore orders ({orders.length})</h3>
          <p className="text-xs text-slate-500">Up to 25 orders shown · Read only · {hasMore?'More records exist':'No further page reported'}</p>
          {orders.length===0?<p className="text-sm p-4 rounded-xl bg-slate-50">No mirrored Firestore order documents found in this page. Historical Sheets orders are not migrated automatically.</p>:<div className="space-y-2">{orders.map(order=><article key={order.id} className="border rounded-xl p-3 flex flex-col sm:flex-row sm:justify-between gap-2">
            <div><strong>{order.order_number}</strong><p className="text-sm">{order.customer_name} · {order.customer_phone}</p><p className="text-xs text-slate-500">{order.created_at}</p></div><div className="text-sm sm:text-right"><strong>৳{order.total_amount}</strong><p>{order.status} · {order.payment_status}</p></div>
          </article>)}</div>}
        </div>}
        </>}
      </section>}
      <footer className="text-center text-xs text-slate-500">Migration preview only. Do not use this screen for real orders, payments, refunds or delivery updates.</footer>
    </div>
  </main>;
}
