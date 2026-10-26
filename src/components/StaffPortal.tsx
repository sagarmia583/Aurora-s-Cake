import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, RefreshCw, ShieldCheck, LockKeyhole, Truck, PackageCheck, LayoutDashboard, ShoppingBag, UsersRound, CakeSlice, Store, Search, ChevronDown, ChevronUp, LogOut, Clock3, BadgeCheck, ArrowRight, AlertCircle, CreditCard, MapPin, Filter } from 'lucide-react';
import { checkStaffSession, getStaffOrders, mutateStaffOrder, issueLegacyReceiptAccess, signInStaffPassword, createStaffAccount, changeStaffStatus, resetStaffPassword } from '../services/sheetStaffApi';
import type { StaffOperation, StaffOrder, StaffProfile, StaffRoleName, StaffSession } from '../services/sheetStaffApi';
import { getAuroraGoogleClientId } from '../config/googleOAuth';
import { WebsiteManager } from './WebsiteManager';
import { CustomCakeQueue } from './CustomCakeQueue';

type GoogleSdk = {
  initialize: (options: { client_id: string; callback: (response: { credential?: string }) => void; ux_mode?: 'popup'; use_fedcm_for_button?: boolean; auto_select?: boolean }) => void;
  renderButton: (element: HTMLElement, options: { theme: string; size: string; text: string }) => void;
};
const googleSdk = (): GoogleSdk | undefined =>
  (window as Window & { google?: { accounts?: { id?: GoogleSdk } } }).google?.accounts?.id;

function canOperate(role: StaffRoleName, operation: StaffOperation): boolean {
  // Rider actions require an actual rider session, even for admins.
  if (['pick_up', 'start_delivery', 'deliver'].includes(operation)) return role === 'delivery_man';
  if (role === 'super_admin' || role === 'admin') return true;
  const rules: Partial<Record<StaffRoleName, StaffOperation[]>> = {
    order_manager: ['confirm', 'cancel'],
    kitchen_manager: ['start_baking', 'mark_ready'],
    delivery_manager: ['assign'],
  };
  return (rules[role] || []).includes(operation);
}
const actionForStatus: Record<string, { operation: StaffOperation; label: string } | null> = {
  pending: { operation: 'confirm', label: 'Confirm order' },
  confirmed: { operation: 'start_baking', label: 'Start baking' },
  preparing: { operation: 'mark_ready', label: 'Mark ready' },
  ready: { operation: 'assign', label: 'Assign rider' },
  assigned: { operation: 'pick_up', label: 'Pick up cake' },
  picked_up: { operation: 'start_delivery', label: 'Start delivery' },
  out_for_delivery: { operation: 'deliver', label: 'Verify delivery OTP' },
  delivered: null, cancelled: null,
};

type StaffTab = 'overview' | 'orders' | 'cakes' | 'team' | 'website';
type OrderFilter = 'actionable' | 'active' | 'completed' | 'all';
const terminalStatuses = new Set(['delivered','cancelled']);
const stageNames:Record<string,string>={pending:'New order',confirmed:'Confirmed',preparing:'Baking',ready:'Ready for rider',assigned:'Rider assigned',picked_up:'Picked up',out_for_delivery:'On the way',delivered:'Delivered',cancelled:'Cancelled'};
const stageClass=(stage:string) => stage==='delivered'?'bg-emerald-100 text-emerald-900 ring-emerald-200':stage==='cancelled'?'bg-rose-100 text-rose-800 ring-rose-200':stage==='pending'?'bg-amber-100 text-amber-900 ring-amber-200':stage==='out_for_delivery'?'bg-sky-100 text-sky-900 ring-sky-200':'bg-violet-100 text-violet-900 ring-violet-200';
const roleName=(role:StaffRoleName) => role.replaceAll('_',' ').replace(/\b\w/g,char=>char.toUpperCase());
interface StaffPortalProps {
  isOpen: boolean;
  onClose: () => void;
  endpoint: string;
  onCatalogUpdated?: () => void;
}
export const StaffPortal: React.FC<StaffPortalProps> = ({ isOpen, onClose, endpoint, onCatalogUpdated }) => {
  const oauthClientId = getAuroraGoogleClientId();
  const signinRef = useRef<HTMLDivElement>(null);
  const [identity, setIdentity] = useState<(StaffSession & { token: string }) | null>(null);
  const [activeTab,setActiveTab]=useState<StaffTab>('overview');
  const [orderFilter,setOrderFilter]=useState<OrderFilter>('actionable');
  const [orderSearch,setOrderSearch]=useState('');
  const [expandedOrders,setExpandedOrders]=useState<string[]>([]);
  const [loginChoice,setLoginChoice]=useState<'employee'|'owner'>('employee');
  const [username,setUsername]=useState('');
  const [password,setPassword]=useState('');
  const [newStaff,setNewStaff]=useState({name:'',username:'',password:'',role:'kitchen_manager' as StaffRoleName});
  const [creatingStaff,setCreatingStaff]=useState(false);
  const [resetFor,setResetFor]=useState('');
  const [resetPassword,setResetPassword]=useState('');
  const [fedcmButton, setFedcmButton] = useState(true);
  const [googleUiError, setGoogleUiError] = useState('');
  const [orders, setOrders] = useState<StaffOrder[]>([]);
  const [staffProfiles, setStaffProfiles] = useState<StaffProfile[]>([]);
  const [refreshingStaff, setRefreshingStaff] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState('');
  const [riderEmail, setRiderEmail] = useState('');
  const [otpOrderId, setOtpOrderId] = useState('');
  const [otp, setOtp] = useState('');
  const [cashCollected, setCashCollected] = useState(false);
  const [updatedAt, setUpdatedAt] = useState('');
  const ordersRefreshInFlight=useRef(false);
  const queuedOrderRefresh=useRef(false);
  const [loadingOrders,setLoadingOrders]=useState(false);
  const [orderUpdateMessage,setOrderUpdateMessage]=useState('');
  const [backendWarning,setBackendWarning]=useState('');
  useEffect(()=>{
    if(!isOpen||typeof window==='undefined'||!window.location.hostname.endsWith('.vercel.app'))return;
    const controller=new AbortController();
    fetch('/api/backend-health',{credentials:'same-origin',cache:'no-store',signal:controller.signal})
      .then(async response=>response.ok?await response.json():null)
      .then(data=>{
        if(controller.signal.aborted)return;
        if(data?.ok===true&&data?.up_to_date===false)
          setBackendWarning('The Google Apps Script deployment is outdated. Delivery OTP, the Website Manager and faster order updates require the latest All-in-One Code.gs and a New version deployment.');
        else setBackendWarning('');
      })
      .catch(()=>{});
    return()=>controller.abort();
  },[isOpen,endpoint]);
  const [legacyKey,setLegacyKey]=useState<{orderId:string;key:string}|null>(null);
  const isActionable=(order:StaffOrder,role:StaffRoleName):boolean=>{
    const next=actionForStatus[order.status];
    return Boolean(next&&canOperate(role,next.operation));
  };
  const actionableCount=identity?orders.filter(order=>isActionable(order,identity.role)).length:0;
  const activeCount=orders.filter(order=>!terminalStatuses.has(order.status)).length;
  const deliveryCount=orders.filter(order=>['assigned','picked_up','out_for_delivery'].includes(order.status)).length;
  const collectedCOD=orders.filter(order=>order.payment_method==='cod'&&order.payment_status==='paid'&&order.cod_collected)
    .reduce((total,order)=>total+order.total_amount,0);
  const roleTabs:{id:StaffTab;label:string;hint:string;icon:typeof LayoutDashboard;show:boolean}[]=[
    {id:'overview',label:'Overview',hint:'Shop pulse',icon:LayoutDashboard,show:true},
    {id:'orders',label:'Orders & delivery',hint:'Live workflow',icon:ShoppingBag,show:true},
    {id:'cakes',label:'Custom cake requests',hint:'Quotes & approvals',icon:CakeSlice,show:['super_admin','admin','order_manager'].includes(identity?.role||'')},
    {id:'team',label:'Staff & access',hint:'People and roles',icon:UsersRound,show:identity?.role==='super_admin'},
    {id:'website',label:'Website manager',hint:'Shop content',icon:Store,show:identity?.role==='super_admin'||identity?.role==='admin'},
  ];
  const tabs=roleTabs.filter(tab=>tab.show);
  const matchingOrders=identity?orders.filter(order=>{
    const query=orderSearch.trim().toLowerCase();
    const matches=!query||[order.order_number,order.customer_name,order.customer_phone,order.delivery_address,order.rider_name]
      .some(value=>String(value||'').toLowerCase().includes(query));
    const filterMatch=orderFilter==='all'||(orderFilter==='actionable'&&isActionable(order,identity.role))||
      (orderFilter==='active'&&!terminalStatuses.has(order.status))||
      (orderFilter==='completed'&&terminalStatuses.has(order.status));
    return matches&&filterMatch;
  }).sort((a,b)=>Number(isActionable(b,identity.role))-Number(isActionable(a,identity.role))||
    Date.parse(b.updated_at||'')-Date.parse(a.updated_at||'')):[];

  const signIn = useCallback(async (idToken: string) => {
    setLoading(true); setError('');
    try {
      const profile = await checkStaffSession(endpoint, idToken);
      setIdentity({ ...profile, token: idToken });
      setStaffProfiles(profile.staff_profiles ?? []);
      setRiderEmail(profile.riders[0]?.email || '');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Staff login failed.'); }
    finally { setLoading(false); }
  }, [endpoint]);

  useEffect(() => {
    if (!isOpen || identity || !oauthClientId) return;
    let active = true;
    const render = () => {
      if (!active || !signinRef.current || !googleSdk()) return;
      signinRef.current.replaceChildren();
      const sdk = googleSdk()!;
      try {
        sdk.initialize({ client_id: oauthClientId, ux_mode: 'popup', use_fedcm_for_button: fedcmButton, auto_select: false,
          callback: response => {
            if (response.credential) void signIn(response.credential);
            else setGoogleUiError('Google did not return a login credential. Check the authorized origin and try again.');
          } });
        sdk.renderButton(signinRef.current, { theme: 'outline', size: 'large', text: 'signin_with' });
        setGoogleUiError('');
      } catch {
        setGoogleUiError('Google Sign-In could not initialize. Disable browser extensions for this page and reload.');
      }
    };
    let script = document.getElementById('aurora-google-identity') as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = 'aurora-google-identity';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      document.head.appendChild(script);
    }
    const scriptError = () => { if (active) setGoogleUiError('Google Sign-In script was blocked. Check your ad blocker, network, or browser security settings.'); };
    script.addEventListener('load', render);
    script.addEventListener('error', scriptError);
    render();
    return () => { active = false; script?.removeEventListener('load', render); script?.removeEventListener('error', scriptError); };
  }, [isOpen, identity, oauthClientId, fedcmButton, signIn]);

  const passwordSignIn=async(e:React.FormEvent)=>{
    e.preventDefault();if(loading)return;setLoading(true);setError('');
    try{
      const token=await signInStaffPassword(endpoint,username,password);
      const profile=await checkStaffSession(endpoint,token);
      setIdentity({...profile,token});
      setStaffProfiles(profile.staff_profiles??[]);
      setPassword('');
      setRiderEmail(profile.riders[0]?.email||'');
    }catch(caught){setError(caught instanceof Error?caught.message:'Staff sign-in failed.');}
    finally{setLoading(false);}
  };
  const createEmployee=async(e:React.FormEvent)=>{
    e.preventDefault();if(!identity||identity.role!=='super_admin')return;
    setCreatingStaff(true);setError('');
    try {
      await createStaffAccount(endpoint,identity.token,newStaff.name,newStaff.username,newStaff.password,newStaff.role);
      setNewStaff({name:'',username:'',password:'',role:'kitchen_manager'});
      const result=await checkStaffSession(endpoint,identity.token);
      setStaffProfiles(result.staff_profiles??[]);
    }catch(caught){setError(caught instanceof Error?caught.message:'Staff account could not be created.');}
    finally{setCreatingStaff(false);}
  };
  useEffect(()=>{
    if(!isOpen||identity)return;
    let token='';try{token=sessionStorage.getItem('aurora_staff_session_v1')||'';}catch{}
    if(!token)return;
    let active=true;
    checkStaffSession(endpoint,token).then(profile=>{
      if(!active)return;
      setIdentity({...profile,token});
      setStaffProfiles(profile.staff_profiles??[]);
      setRiderEmail(profile.riders[0]?.email||'');
    }).catch(()=>{try{sessionStorage.removeItem('aurora_staff_session_v1');}catch{}});
    return()=>{active=false;};
  },[isOpen,identity,endpoint]);
  useEffect(()=>{
    try{
      if(identity && /^[a-f0-9-]{72}$/i.test(identity.token))sessionStorage.setItem('aurora_staff_session_v1',identity.token);
    }catch{}
  },[identity]);
  
  const refresh = useCallback(async () => {
    if (!identity || !isOpen) return;
    if (ordersRefreshInFlight.current) {
      // A mutation may complete while an older poll is still reading Sheets.
      // Never drop that explicit post-mutation refresh.
      queuedOrderRefresh.current=true;
      return;
    }
    ordersRefreshInFlight.current=true;
    setLoadingOrders(true);
    try {
      const fresh = await getStaffOrders(endpoint, identity.token);
      setOrders(previous=>{
        // Avoid replacing a just-confirmed local status with an older in-flight
        // Sheet snapshot when a rider updates during this refresh.
        const latest=new Map(previous.map(order=>[order.id,order]));
        return fresh.map(order=>{
          const prior=latest.get(order.id);
          return prior && Date.parse(prior.updated_at)>Date.parse(order.updated_at) ? prior : order;
        });
      });
      setUpdatedAt(new Date().toLocaleTimeString());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load orders.');
    } finally {
      ordersRefreshInFlight.current=false;
      setLoadingOrders(false);
      if (queuedOrderRefresh.current) {
        queuedOrderRefresh.current=false;
        // Avoid blocking the rendered confirmed action on another Sheet read.
        window.setTimeout(() => { void refresh(); }, 0);
      }
    }
  }, [endpoint, identity, isOpen]);

  useEffect(() => {
    if (!isOpen || !identity) return;
    void refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 12000);
    const visible=()=>{if(document.visibilityState==='visible')void refresh();};
    document.addEventListener('visibilitychange',visible);
    window.addEventListener('focus',visible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange',visible);
      window.removeEventListener('focus',visible);
    };
  }, [isOpen, identity, refresh]);

  const toggleStaff=async(username:string,active:boolean)=>{
    if(!identity||identity.role!=='super_admin'||!window.confirm(active?'Enable this staff account?':'Disable this staff account and revoke its sessions?'))return;
    setRefreshingStaff(true);setError('');
    try{
      await changeStaffStatus(endpoint,identity.token,username,active);
      const profile=await checkStaffSession(endpoint,identity.token);
      setStaffProfiles(profile.staff_profiles??[]);
    }catch(caught){setError(caught instanceof Error?caught.message:'Staff status could not be updated.');}
    finally{setRefreshingStaff(false);}
  };
  const resetEmployeePassword=async(event:React.FormEvent)=>{
    event.preventDefault();
    if(!identity||identity.role!=='super_admin'||!resetFor)return;
    setRefreshingStaff(true);setError('');
    try{
      await resetStaffPassword(endpoint,identity.token,resetFor,resetPassword);
      setResetFor('');setResetPassword('');
    }catch(caught){setError(caught instanceof Error?caught.message:'Could not reset employee password.');}
    finally{setRefreshingStaff(false);}
  };

  const refreshStaffProfiles = useCallback(async () => {
    if (!identity || identity.role !== 'super_admin') return;
    setRefreshingStaff(true);
    try {
      const current = await checkStaffSession(endpoint, identity.token);
      if (current.role !== 'super_admin') throw new Error('Super admin access is no longer available. Sign in again.');
      setStaffProfiles(current.staff_profiles ?? []);
      setError('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to refresh staff profiles.'); }
    finally { setRefreshingStaff(false); }
  }, [endpoint, identity]);

  const recoverLegacy=async(order:StaffOrder)=>{
    if(!identity||identity.role!=='super_admin'||busyOrderId)return;
    if(!window.confirm('Only continue after independently verifying the original customer in person or through a trusted prior contact. This creates a private receipt key; send it ONLY to that customer. Continue?'))return;
    setBusyOrderId(order.id);setError('');setLegacyKey(null);
    try{
      const key=await issueLegacyReceiptAccess(endpoint,identity.token,order.id);
      setLegacyKey({orderId:order.id,key});
      setOrders(previous=>previous.map(item=>item.id===order.id?{...item,legacy_receipt_missing:false}:item));
    }catch(error){setError(error instanceof Error?error.message:'Could not restore this legacy order receipt.');}
    finally{setBusyOrderId('');}
  };

  const mutate = async (order: StaffOrder, operation: StaffOperation) => {
    if (!identity || busyOrderId) return;
    if (operation === 'cancel' && !window.confirm('Cancel this order? This cannot be undone.')) return;
    if (operation === 'assign' && !riderEmail) { setError('Select a registered rider.'); return; }
    if (operation === 'deliver' && (!/^\d{4}$/.test(otp) || (order.payment_method === 'cod' && !cashCollected))) {
      setError('Enter the 4-digit delivery OTP and confirm that the cash was received.'); return;
    }
    setBusyOrderId(order.id); setError('');
    try {
      const confirmed=await mutateStaffOrder(endpoint, identity.token, operation, order.id,
        operation === 'assign' ? { rider_email: riderEmail } :
        operation === 'deliver' ? { delivery_otp: otp, cash_collected: cashCollected } : {});
      // Display the server-confirmed stage immediately; don't block the rider
      // for another costly full Sheet list request.
      setOrders(previous=>previous.map(item=>item.id===confirmed.id?{...item,...confirmed}:item));
      setUpdatedAt(new Date().toLocaleTimeString());
      setOrderUpdateMessage('Order '+order.order_number+' updated to '+confirmed.status.replaceAll('_',' ')+'.');
      setOtp(''); setOtpOrderId(''); setCashCollected(false);
      // Refresh independently to reconcile staff roles/other active orders.
      void refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to update order.'); }
    finally { setBusyOrderId(''); }
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/70 p-3 sm:p-8 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="staff-portal-title">
      <section className="mx-auto max-w-6xl min-h-[70vh] rounded-3xl bg-slate-50 shadow-2xl overflow-hidden">
        <header className="bg-slate-900 p-5 text-white flex justify-between items-start gap-3">
          <div>
            <h2 id="staff-portal-title" className="text-2xl font-extrabold flex items-center gap-2"><ShieldCheck /> Aurora's Cake — Staff Operations</h2>
            <p className="text-sm text-slate-300">Authenticated live COD orders stored in private Google Sheets</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close staff operations" className="p-2 rounded-full hover:bg-slate-700"><X /></button>
        </header>
        <div className="p-5 space-y-5">
          {backendWarning&&<p role="alert" className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-sm font-medium text-amber-950">
            {backendWarning} <a className="underline font-bold" target="_blank" rel="noreferrer"
              href="https://github.com/sagarmia583/Aurora-s-Cake/blob/fix/secure-demo-roles-and-delivery-20261024/apps-script/Code.AllInOne.gs">
              Open complete backend code
            </a>
          </p>}
          {!oauthClientId ? (
            <div role="alert" className="rounded-xl bg-amber-50 p-5 text-amber-900">Staff portal is not configured. Set VITE_GOOGLE_OAUTH_CLIENT_ID, and configure the matching Google client ID and authorized staff users in Apps Script Properties.</div>
          ) : !identity ? (
            <div className="bg-white p-7 rounded-2xl border border-slate-200 max-w-xl mx-auto text-center space-y-5">
              <LockKeyhole className="mx-auto text-emerald-700" size={44} />
              <h3 className="text-xl font-bold">Verified staff sign-in</h3>
              <p className="text-sm text-slate-600">Use your approved Google account. Your access level and delivery assignments are checked on the server.</p>
              <p className="text-xs text-slate-500">Super Admin only: Google Sign-In</p>
                            <div ref={signinRef} className="flex justify-center min-h-12" />
              <button type="button" onClick={() => { setGoogleUiError(''); setFedcmButton(current => !current); }} className="text-sm underline text-emerald-800">
                {fedcmButton ? 'Google button not opening? Try classic popup mode' : 'Try browser-managed Google sign-in instead'}
              </button>
              {googleUiError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{googleUiError}</p>}
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-xs text-amber-950 space-y-2">
                <p><strong>Google button not responding?</strong> The site origin must be listed under the Google Web OAuth client's <strong>Authorized JavaScript origins</strong>. Each Vercel Preview hostname is different from Production.</p>
                <p>Current origin: <code className="break-all font-mono">{typeof window !== 'undefined' ? window.location.origin : ''}</code></p>
                <p>After adding it, reload this page. Also allow Google sign-in popups, and use an account listed as a Test User if OAuth is in Testing mode.</p>
              </div>
              <div className="border-t border-slate-200 pt-5 text-left">
                <h4 className="font-bold text-slate-800 text-center mb-3">Employee Login</h4>
                <p className="text-center text-xs text-slate-500 mb-3">Kitchen, Rider, Manager and Accountant use the username and password created by Super Admin.</p>
                <form onSubmit={passwordSignIn} className="space-y-3">
                  <input value={username} onChange={e=>setUsername(e.target.value)} required autoComplete="username"
                    placeholder="Employee username" aria-label="Employee username" className="w-full rounded-xl border p-3" />
                  <input value={password} onChange={e=>setPassword(e.target.value)} required type="password" autoComplete="current-password"
                    placeholder="Password" aria-label="Employee password" className="w-full rounded-xl border p-3" />
                  <button disabled={loading} className="w-full bg-emerald-800 text-white font-semibold rounded-xl p-3 disabled:opacity-50" type="submit">
                    {loading?'Signing in…':'Sign in as Staff'}
                  </button>
                </form>
              </div>
              {loading && <p role="status">Verifying your account…</p>}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap justify-between items-center gap-3">
                <div><strong>{identity.name}</strong> <span className="text-slate-500 text-sm">({identity.role.replaceAll('_', ' ')})</span><p className="text-xs text-slate-500">{identity.email}</p></div>
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-slate-500">{loadingOrders?'Syncing…':'Last synced '+(updatedAt || '—')}</span>
                  <button type="button" onClick={() => void refresh()} className="flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-3 py-2 text-sm"><RefreshCw size={15} /> Refresh</button>
                  <button type="button" onClick={() => { setIdentity(null); setOrders([]); setStaffProfiles([]); setError('');try{sessionStorage.removeItem('aurora_staff_session_v1');}catch{} }} className="rounded-xl px-3 py-2 border bg-white text-sm">Sign out</button>
                </div>
              </div>
              {identity.role === 'super_admin' && (
                <section className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3" aria-labelledby="staff-profiles-heading">
                  <div className="flex flex-wrap gap-3 items-center justify-between">
                    <div>
                      <h3 id="staff-profiles-heading" className="text-lg font-bold text-slate-900">Staff Profiles ({staffProfiles.length})</h3>
                      <p className="text-sm text-slate-600">Verified staff directory · Only the Super Admin can see this list</p>
                    </div>
                    <button type="button" disabled={refreshingStaff} onClick={() => void refreshStaffProfiles()}
                      className="rounded-xl border px-3 py-2 text-sm flex items-center gap-2 disabled:opacity-50">
                      <RefreshCw size={15} /> {refreshingStaff ? 'Checking…' : 'Refresh profiles'}
                    </button>
                  </div>
                  {staffProfiles.length ? (
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {staffProfiles.map(person => (
                        <article key={person.username||person.email} className="rounded-xl border border-slate-200 p-3 min-w-0">
                          <strong className="block break-words text-slate-900">{person.name}</strong>
                          <p className="text-sm break-all text-slate-600">{person.username ? '@'+person.username : person.email}</p>
                          <span className="inline-block mt-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900">
                            {person.role.replaceAll('_', ' ')}
                          </span>
                          {person.email === identity.email && <span className="ml-2 text-xs text-slate-500">You</span>}
                          {person.username && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button type="button" disabled={refreshingStaff} onClick={()=>void toggleStaff(person.username!,person.active===false)}
                                className="text-xs underline text-emerald-800 disabled:opacity-50">
                                {person.active===false?'Enable account':'Disable account'}
                              </button>
                              <button type="button" onClick={()=>{setResetFor(person.username!);setResetPassword('');}} className="text-xs underline text-slate-700">Reset password</button>
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  ) : <p className="text-sm text-amber-800">This Apps Script deployment has not returned the staff directory yet. Install the newest all-in-one Code.gs and deploy a new version.</p>}
                  <p className="text-xs text-slate-500">
                    New employees sign in with the username and initial password you create below.
                    Keep the owner Google account private. Passwords cannot be viewed again after creation.
                    Older Google-allowlisted staff can still sign in until removed from the Script Property.
                  </p>
                  {resetFor && (
                    <form onSubmit={resetEmployeePassword} className="border rounded-xl p-3 flex flex-wrap items-center gap-2">
                      <label className="text-sm font-medium">New password for @{resetFor}</label>
                      <input type="password" required minLength={10} autoComplete="new-password" value={resetPassword}
                        onChange={e=>setResetPassword(e.target.value)} placeholder="10+ characters" aria-label="New staff account password"
                        className="border rounded-lg p-2 flex-1 min-w-40"/>
                      <button disabled={refreshingStaff} type="submit" className="bg-emerald-800 text-white p-2 rounded-xl">Save & revoke sessions</button>
                      <button type="button" onClick={()=>{setResetFor('');setResetPassword('');}} className="border p-2 rounded-xl">Cancel</button>
                    </form>
                  )}
                  <form onSubmit={createEmployee} className="border-t pt-4 grid sm:grid-cols-2 gap-3 text-sm">
                    <h4 className="font-bold sm:col-span-2">Create new employee login</h4>
                    <input required aria-label="New staff name" placeholder="Staff full name" value={newStaff.name}
                      onChange={e=>setNewStaff(v=>({...v,name:e.target.value}))} className="border rounded-lg p-2"/>
                    <input required aria-label="New staff username" placeholder="Username, e.g. rider01" value={newStaff.username}
                      onChange={e=>setNewStaff(v=>({...v,username:e.target.value}))} className="border rounded-lg p-2"/>
                    <input required type="password" minLength={10} aria-label="New staff password" placeholder="Password (10+ characters)"
                      value={newStaff.password} onChange={e=>setNewStaff(v=>({...v,password:e.target.value}))} className="border rounded-lg p-2"/>
                    <select aria-label="New staff role" value={newStaff.role} onChange={e=>setNewStaff(v=>({...v,role:e.target.value as StaffRoleName}))} className="border rounded-lg p-2">
                      {(['admin','order_manager','kitchen_manager','delivery_manager','delivery_man','accountant'] as StaffRoleName[]).map(role=>(
                        <option key={role} value={role}>{role.replaceAll('_',' ')}</option>
                      ))}
                    </select>
                    <button type="submit" disabled={creatingStaff} className="sm:col-span-2 rounded-xl bg-emerald-800 text-white font-semibold p-3 disabled:opacity-50">
                      {creatingStaff?'Creating…':'Create staff account'}
                    </button>
                    <p className="text-xs sm:col-span-2 text-slate-500">Share the initial password privately with the employee. Staff credentials are never emailed automatically.</p>
                  </form>
                </section>
              )}
              {orderUpdateMessage && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-900 text-sm">{orderUpdateMessage}</p>}
              <p className="text-sm text-slate-600">Showing up to 100 recent authorized orders. Status updates are written to the same private Sheet used by Customer checkout.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div className="bg-white border rounded-xl p-3"><strong className="text-xl">{orders.length}</strong><p className="text-slate-500">Orders in visible queue</p></div>
                <div className="bg-white border rounded-xl p-3"><strong className="text-xl">{orders.filter(o=>o.status==='pending').length}</strong><p className="text-slate-500">Awaiting confirmation</p></div>
                <div className="bg-white border rounded-xl p-3"><strong className="text-xl">৳{orders.filter(o=>o.payment_method==='cod'&&o.payment_status==='paid'&&o.cod_collected).reduce((total,o)=>total+o.total_amount,0).toLocaleString()}</strong><p className="text-slate-500">Reported COD collected (visible orders only)</p></div>
              </div>
              {orders.length === 0 && <div className="bg-white rounded-xl p-8 text-center">No orders available for your role.</div>}
              <div className="grid gap-4">
                {orders.map(order => {
                  const next = actionForStatus[order.status] || null;
                  const canCancel = canOperate(identity.role, 'cancel') && ['pending','confirmed','preparing','ready','assigned'].includes(order.status);
                  return <article key={order.id} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                    <div className="flex flex-wrap justify-between gap-2">
                      <div><strong className="break-all">#{order.order_number}</strong><p className="text-sm">{order.customer_name} · {order.customer_phone && <a className="underline" href={`tel:${order.customer_phone}`}>{order.customer_phone}</a>}</p></div>
                      <span className="self-start rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-emerald-900 text-xs font-bold">{order.status.replaceAll('_',' ')}</span>
                    </div>
                    <div className="grid sm:grid-cols-3 gap-2 text-sm text-slate-700">
                      {order.delivery_address && <div><strong>Address:</strong> {order.delivery_address}<p className="mt-1"><a className="text-emerald-700 underline" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.delivery_address)}`} target="_blank" rel="noopener noreferrer">Open in Google Maps</a></p></div>}
                      <div><strong>Slot:</strong> {order.delivery_date} · {order.delivery_slot}</div>
                      <div><strong>COD:</strong> {order.total_amount} · {order.payment_status} {order.cod_collected ? '· collected' : ''}</div>
                    </div>
                    <div className="text-sm bg-slate-50 rounded-xl p-3">
                      {(order.items || []).map(item => <p key={item.id}>{item.quantity} × {item.product_name} ({item.variant_name}) {item.flavor_name ? '· '+item.flavor_name : ''}{item.writing_message ? ' · '+item.writing_message : ''}</p>)}
                      {order.order_note && <p className="text-slate-500 mt-2">Note: {order.order_note}</p>}
                      {order.rider_name && <p className="mt-2 flex items-center gap-1"><Truck size={14} /> Assigned rider: {order.rider_name}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                      {next && canOperate(identity.role, next.operation) && next.operation !== 'deliver' && (
                        <>
                          {next.operation === 'assign' && <select aria-label="Assign registered rider" value={riderEmail} onChange={e => setRiderEmail(e.target.value)} className="border rounded-lg px-2 py-2 text-sm">
                            {identity.riders.map(rider => <option key={rider.email} value={rider.email}>{rider.name} — {rider.email}</option>)}
                          </select>}
                          <button type="button" disabled={!!busyOrderId} onClick={() => void mutate(order,next.operation)}
                            className="rounded-xl bg-emerald-700 text-white px-4 py-2 text-sm font-bold disabled:opacity-50 flex items-center gap-2"><PackageCheck size={15} /> {next.label}</button>
                        </>
                      )}
                      {next?.operation === 'deliver' && canOperate(identity.role,'deliver') && (
                        otpOrderId === order.id ? (
                          <div className="flex flex-wrap items-center gap-3">
                            <input type="text" inputMode="numeric" maxLength={4} aria-label="Customer delivery OTP" placeholder="4-digit OTP" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g,''))} className="w-32 border rounded-xl p-2" />
                            {order.payment_method === 'cod' && <label className="text-sm"><input type="checkbox" checked={cashCollected} onChange={e => setCashCollected(e.target.checked)} /> I collected the full cash amount</label>}
                            <button type="button" disabled={!!busyOrderId} onClick={() => void mutate(order,'deliver')} className="bg-emerald-700 text-white rounded-xl px-4 py-2 text-sm">Verify & deliver</button>
                          </div>
                        ) : <button type="button" onClick={() => { setOtpOrderId(order.id); setOtp(''); setCashCollected(false); }} className="bg-emerald-700 text-white rounded-xl px-4 py-2 text-sm">Verify customer OTP</button>
                      )}
                      {identity.role==='super_admin'&&order.legacy_receipt_missing&&order.status==='out_for_delivery'&&(
                        <button type="button" disabled={!!busyOrderId} onClick={()=>void recoverLegacy(order)}
                          className="rounded-xl border border-amber-400 bg-amber-50 text-amber-900 px-4 py-2 text-sm font-bold disabled:opacity-50">
                          Recover old customer OTP access
                        </button>
                      )}
                      {legacyKey?.orderId===order.id&&(
                        <div className="w-full rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2" role="status">
                          <strong className="block text-sm">Private recovery key — show only to the verified customer</strong>
                          <p className="text-xs">Ask the customer to paste this under Track Order → Restore older receipt access. The key is shown here only once; it is NOT the 4-digit delivery OTP.</p>
                          <input readOnly aria-label="Customer receipt recovery key" value={legacyKey.key} onFocus={e=>e.currentTarget.select()}
                            className="w-full rounded-lg border p-2 text-xs font-mono bg-white" />
                          <button type="button" onClick={()=>{void navigator.clipboard?.writeText(legacyKey.key).catch(()=>setError('Select and copy the key manually.'));}}
                            className="rounded-lg border bg-white px-3 py-2 text-xs">Copy private key</button>
                          <button type="button" onClick={()=>setLegacyKey(null)} className="rounded-lg px-3 py-2 text-xs underline">Dismiss key</button>
                        </div>
                      )}
                      {canCancel && <button type="button" disabled={!!busyOrderId} onClick={() => void mutate(order,'cancel')} className="rounded-xl border border-red-200 text-red-700 px-4 py-2 text-sm">Cancel</button>}
                    </div>
                  </article>;
                })}
              </div>
              {(['super_admin','admin','order_manager'] as string[]).includes(identity.role) && <CustomCakeQueue endpoint={endpoint} token={identity.token} />}
              {(identity.role === 'super_admin' || identity.role === 'admin') && <WebsiteManager endpoint={endpoint} token={identity.token}
                role={identity.role} onUpdated={() => onCatalogUpdated?.()} />}
            </>
          )}
          {error && <p role="alert" className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-800 text-sm">{error}</p>}
        </div>
      </section>
    </div>
  );
};
