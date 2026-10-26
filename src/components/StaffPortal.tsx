import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, RefreshCw, ShieldCheck, Truck, PackageCheck, LayoutDashboard, ShoppingBag, UsersRound, CakeSlice, Store, Search, ChevronDown, ChevronUp, LogOut, Clock3, BadgeCheck, ArrowRight, AlertCircle, CreditCard, MapPin } from 'lucide-react';
import { checkStaffSession, getStaffOrders, mutateStaffOrder, issueLegacyReceiptAccess, signInStaffPassword, createStaffAccount, changeStaffStatus, resetStaffPassword, lookupStaffCustomer } from '../services/sheetStaffApi';
import type { StaffCustomerMatch, StaffOperation, StaffOrder, StaffProfile, StaffRoleName, StaffSession } from '../services/sheetStaffApi';
import { getAuroraGoogleClientId } from '../config/googleOAuth';
import { getBrowserWorkspaceStorage, loadStaffCredential, saveStaffCredential, clearStaffCredential, loadStaffTab, saveStaffTab } from '../services/staffWorkspaceSession';
import { reconcileStaffOrders, loadStaffOrdersSnapshot, saveStaffOrdersSnapshot, clearStaffOrdersSnapshot } from '../services/staffOrderSnapshot';
// Download the larger forms only if the user opens those workspaces.
const WebsiteManager=React.lazy(()=>import('./WebsiteManager').then(m=>({default:m.WebsiteManager})));
const CustomCakeQueue=React.lazy(()=>import('./CustomCakeQueue').then(m=>({default:m.CustomCakeQueue})));

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
  const liveIdentityToken=useRef<string|undefined>(undefined);
  liveIdentityToken.current=identity?.token;
  const liveIsOpen=useRef(isOpen);
  liveIsOpen.current=isOpen;
  const [restoringSession, setRestoringSession] = useState(() => Boolean(loadStaffCredential(getBrowserWorkspaceStorage())));
  const [activeTab,setActiveTab]=useState<StaffTab>(() => {
    const saved=loadStaffTab(getBrowserWorkspaceStorage());
    return ['overview','orders','cakes','team','website'].includes(saved)?saved as StaffTab:'overview';
  });
  const [orderFilter,setOrderFilter]=useState<OrderFilter>('actionable');
  const [orderSearch,setOrderSearch]=useState('');
  const [customerLookupPhone,setCustomerLookupPhone]=useState('');
  const [customerLookupResult,setCustomerLookupResult]=useState<StaffCustomerMatch|null>(null);
  const [customerLookupMessage,setCustomerLookupMessage]=useState('');
  const [customerLookupBusy,setCustomerLookupBusy]=useState(false);
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
  const ordersRefreshInFlight=useRef<string|null>(null);
  const queuedOrderRefresh=useRef(false);
  const [loadingOrders,setLoadingOrders]=useState(false);
  const [viewingSavedOrders,setViewingSavedOrders]=useState(false);
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
  const lookupCustomer=async(event:React.FormEvent)=>{
    event.preventDefault();if(!identity||customerLookupBusy)return;
    setCustomerLookupBusy(true);setCustomerLookupMessage('');setCustomerLookupResult(null);
    try{
      const record=await lookupStaffCustomer(endpoint,identity.token,customerLookupPhone);
      setCustomerLookupResult(record);
      setCustomerLookupMessage(record?'Existing Customer Master record found.':'No customer yet; a first confirmed COD order creates one.');
    }catch(error){setCustomerLookupMessage(error instanceof Error?error.message:'Customer search failed.');}
    finally{setCustomerLookupBusy(false);}
  };
  const isActionable=(order:StaffOrder,role:StaffRoleName):boolean=>{
    const next=actionForStatus[order.status];
    return Boolean(next&&canOperate(role,next.operation));
  };
  useEffect(()=>{
    if(!identity)return;
    const operational=['kitchen_manager','delivery_manager','delivery_man','order_manager'].includes(identity.role);
    const stored=loadStaffTab(getBrowserWorkspaceStorage());
    const allowed=['orders','overview',...(['super_admin','admin','order_manager'].includes(identity.role)?['cakes']:[]),
      ...(identity.role==='super_admin'?['team']:[]),
      ...(['super_admin','admin'].includes(identity.role)?['website']:[])];
    const next=allowed.includes(stored)?stored as StaffTab:operational?'orders':'overview';
    setActiveTab(next);
    setOrderFilter(identity.role==='accountant'?'all':'actionable');
  },[identity?.role]);
  useEffect(()=>{if(identity)saveStaffTab(getBrowserWorkspaceStorage(),activeTab);},[activeTab,identity]);
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
  const pipeline=['pending','confirmed','preparing','ready','assigned','picked_up','out_for_delivery','delivered'];
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
      saveStaffCredential(getBrowserWorkspaceStorage(),idToken);
      setOrders(loadStaffOrdersSnapshot(getBrowserWorkspaceStorage(),{...profile,token:idToken}));
      setViewingSavedOrders(true);
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
  }, [isOpen, identity, oauthClientId, fedcmButton, loginChoice, signIn]);

  const passwordSignIn=async(e:React.FormEvent)=>{
    e.preventDefault();if(loading)return;setLoading(true);setError('');
    try{
      const token=await signInStaffPassword(endpoint,username,password);
      const profile=await checkStaffSession(endpoint,token);
      saveStaffCredential(getBrowserWorkspaceStorage(),token);
      setOrders(loadStaffOrdersSnapshot(getBrowserWorkspaceStorage(),{...profile,token}));
      setViewingSavedOrders(true);
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
  const restoreStaffSession=useCallback(async(token:string,isActive:()=>boolean)=>{
    try{
      const profile=await checkStaffSession(endpoint,token);
      if(!isActive())return;
      setOrders(loadStaffOrdersSnapshot(getBrowserWorkspaceStorage(),{...profile,token}));
      setViewingSavedOrders(true);
      setIdentity({...profile,token});
      setStaffProfiles(profile.staff_profiles??[]);
      setRiderEmail(profile.riders[0]?.email||'');
      setError('');
    }catch(caught){
      if(!isActive())return;
      const message=caught instanceof Error?caught.message:'Could not restore your staff session.';
      // Do not discard credentials during a temporary network failure.
      if(/sign in again|login expired|not authorized|not active|invalid google|token expired/i.test(message)) {
        clearStaffCredential(getBrowserWorkspaceStorage());
        clearStaffOrdersSnapshot(getBrowserWorkspaceStorage());
      }
      setError('Previous staff session could not be verified: '+message);
    }finally{if(isActive())setRestoringSession(false);}
  },[endpoint]);
  useEffect(()=>{
    if(!isOpen||identity){setRestoringSession(false);return;}
    const token=loadStaffCredential(getBrowserWorkspaceStorage());
    if(!token){setRestoringSession(false);return;}
    let active=true;
    setRestoringSession(true);
    void restoreStaffSession(token,()=>active);
    return()=>{active=false;};
  },[isOpen,endpoint,restoreStaffSession]);
  const retryStaffSession=()=>{
    if(restoringSession)return;
    const token=loadStaffCredential(getBrowserWorkspaceStorage());
    if(!token)return;
    setRestoringSession(true);setError('');
    void restoreStaffSession(token,()=>true);
  };

  useEffect(()=>{
    if(identity&&!viewingSavedOrders)
      saveStaffOrdersSnapshot(getBrowserWorkspaceStorage(),identity,orders);
  },[orders,identity?.token,identity?.role,identity?.email,viewingSavedOrders]);

  const refresh = useCallback(async () => {
    if (!identity || !isOpen) return;
    if (ordersRefreshInFlight.current===identity.token) {
      // An explicit mutation refresh must run after an older poll completes.
      queuedOrderRefresh.current=true;
      return;
    }
    // A new user/session can refresh immediately without waiting for an
    // old session's in-flight request to time out.
    ordersRefreshInFlight.current=identity.token;
    setLoadingOrders(true);
    try {
      const fresh = await getStaffOrders(endpoint, identity.token);
      // A response from an old identity/request must never overwrite the
      // currently signed-in employee's orders.
      if(liveIdentityToken.current!==identity.token||!liveIsOpen.current)return;
      setOrders(previous=>reconcileStaffOrders(previous,fresh));
      setUpdatedAt(new Date().toLocaleTimeString());
      setViewingSavedOrders(false);
    } catch (caught) {
      if(liveIdentityToken.current===identity.token&&liveIsOpen.current)
        setError((caught instanceof Error ? caught.message : 'Unable to load orders.')+' Your previous order list has been kept.');
    } finally {
      if(ordersRefreshInFlight.current===identity.token){
        ordersRefreshInFlight.current=null;
        setLoadingOrders(false);
        if (queuedOrderRefresh.current) {
          queuedOrderRefresh.current=false;
          // Avoid blocking the rendered confirmed action on another Sheet read.
          window.setTimeout(() => { void refresh(); }, 0);
        }
      }
    }
  }, [endpoint, identity?.token, isOpen]);

  useEffect(() => {
    if (!isOpen || !identity || !['overview','orders'].includes(activeTab)) return;
    void refresh();
    const refreshMs=identity.role==='delivery_man'?8000:12000;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, refreshMs);
    const visible=()=>{if(document.visibilityState==='visible')void refresh();};
    document.addEventListener('visibilitychange',visible);
    window.addEventListener('focus',visible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange',visible);
      window.removeEventListener('focus',visible);
    };
  }, [isOpen, identity, activeTab, refresh]);

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
      setOrders(previous=>reconcileStaffOrders(previous,previous.map(item=>item.id===confirmed.id?{...item,...confirmed}:item)));
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
    <div className="fixed inset-0 z-[80] bg-slate-950/75 overflow-y-auto p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="staff-portal-title">
      <section className="mx-auto max-w-[1480px] min-h-screen sm:min-h-[calc(100vh-2rem)] rounded-none sm:rounded-[28px] bg-[#f6f8f7] shadow-2xl overflow-hidden">
        <header className="bg-[#15342e] px-4 sm:px-7 py-4 text-white flex justify-between items-center gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-white/10 rounded-2xl p-3 shrink-0"><CakeSlice size={25} className="text-[#f0dbb3]"/></div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold tracking-[.18em] uppercase text-[#cbe3d5]">Aurora's Cake · Operations</p>
              <h2 id="staff-portal-title" className="text-lg sm:text-2xl font-black tracking-tight">Bakery Control Center</h2>
              <p className="text-xs text-white/65 hidden sm:block">Your orders, people and storefront in one place</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close staff operations"
            className="min-w-11 min-h-11 rounded-xl grid place-items-center bg-white/10 hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white"><X size={21}/></button>
        </header>
        <div className="space-y-4">
          {error&&<div role="alert" className="mx-4 sm:mx-6 mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 flex items-start gap-2">
            <AlertCircle size={18} className="shrink-0"/><p className="flex-1">{error}</p>
            {!identity&&Boolean(loadStaffCredential(getBrowserWorkspaceStorage()))&&
              <button type="button" onClick={retryStaffSession} disabled={restoringSession}
                className="rounded-lg bg-white border px-3 py-2 text-sm font-bold text-emerald-800 disabled:opacity-50">Retry session</button>}
            <button aria-label="Dismiss error" type="button" onClick={()=>setError('')} className="p-1 rounded-lg hover:bg-rose-100"><X size={16}/></button>
          </div>}
          {backendWarning&&<p role="alert" className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-sm font-medium text-amber-950">
            {backendWarning} <a className="underline font-bold" target="_blank" rel="noreferrer"
              href="https://github.com/sagarmia583/Aurora-s-Cake/blob/fix/secure-demo-roles-and-delivery-20261024/apps-script/Code.AllInOne.gs">
              Open complete backend code
            </a>
          </p>}
          {!oauthClientId ? (
            <div role="alert" className="m-6 rounded-2xl bg-amber-50 p-6 text-amber-900">Google OAuth is not configured for the bakery owner. Check project settings.</div>
          ) : restoringSession && !identity ? (
            <div className="max-w-lg mx-auto my-12 rounded-2xl bg-white shadow-sm border p-8 text-center" role="status">
              <RefreshCw className="animate-spin mx-auto mb-4 text-emerald-700" size={28}/>
              <h3 className="font-bold text-xl text-emerald-950">Restoring your secure staff session…</h3>
              <p className="text-sm text-slate-500 mt-2">Checking permissions before opening your workspace.</p>
            </div>
          ) : !identity ? (
            <div className="max-w-5xl mx-auto p-4 sm:p-8 lg:py-12">
              <div className="grid lg:grid-cols-2 gap-5">
                <div className="rounded-[26px] bg-[#1a453a] text-white p-6 sm:p-9 flex flex-col justify-between gap-10">
                  <div className="space-y-5">
                    <div className="w-14 h-14 grid place-items-center bg-white/10 rounded-2xl"><ShieldCheck size={29}/></div>
                    <p className="text-xs font-bold tracking-[.2em] uppercase text-[#d1e4d6]">The heart of your bakery</p>
                    <h3 className="text-3xl sm:text-4xl font-black leading-tight">Less clicking.<br/>More baking.</h3>
                    <p className="text-sm leading-relaxed text-[#deeee4]">Handle orders, dispatch cakes and keep customers updated. Each staff member sees only their permitted actions.</p>
                  </div>
                  <div className="flex gap-3 text-xs">
                    <span className="rounded-xl bg-white/10 p-3 flex-1 text-center">Orders</span>
                    <span className="rounded-xl bg-white/10 p-3 flex-1 text-center">Delivery</span>
                    <span className="rounded-xl bg-white/10 p-3 flex-1 text-center">Team</span>
                  </div>
                </div>
                <div className="rounded-[26px] bg-white border border-slate-200 shadow-sm p-5 sm:p-9">
                  <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1 mb-7">
                    <button type="button" aria-pressed={loginChoice==='employee'} onClick={()=>{setLoginChoice('employee');setError('');}}
                      className={'rounded-xl p-3 text-sm font-bold '+(loginChoice==='employee'?'bg-[#1a453a] text-white shadow':'text-slate-600')}>
                      Employee login
                    </button>
                    <button type="button" aria-pressed={loginChoice==='owner'} onClick={()=>{setLoginChoice('owner');setError('');}}
                      className={'rounded-xl p-3 text-sm font-bold '+(loginChoice==='owner'?'bg-[#1a453a] text-white shadow':'text-slate-600')}>
                      Shop owner
                    </button>
                  </div>
                  {loginChoice==='employee'?(
                    <div>
                      <h3 className="text-2xl font-black text-[#15342e]">Welcome back</h3>
                      <p className="text-sm text-slate-500 mt-1 mb-6">Your username and password were created by the owner.</p>
                      <form onSubmit={passwordSignIn} className="space-y-4">
                        <label className="block text-sm font-semibold text-slate-700">Username
                          <input value={username} onChange={e=>setUsername(e.target.value)} required autoComplete="username"
                            placeholder="e.g. kitchen01" aria-label="Employee username" className="mt-2 w-full rounded-xl border bg-slate-50 p-3.5 focus:ring-2 focus:ring-emerald-700 outline-none"/>
                        </label>
                        <label className="block text-sm font-semibold text-slate-700">Password
                          <input value={password} onChange={e=>setPassword(e.target.value)} required type="password"
                            autoComplete="current-password" placeholder="Your password" aria-label="Employee password"
                            className="mt-2 w-full rounded-xl border bg-slate-50 p-3.5 focus:ring-2 focus:ring-emerald-700 outline-none"/>
                        </label>
                        <button type="submit" disabled={loading} className="w-full rounded-xl bg-[#15342e] text-white font-bold p-3.5 disabled:opacity-60">
                          {loading?'Signing in…':'Open my workspace'}
                        </button>
                      </form>
                    </div>
                  ):(
                    <div className="space-y-4">
                      <h3 className="text-2xl font-black text-[#15342e]">Owner access</h3>
                      <p className="text-sm text-slate-500">Sign in using the approved Google account.</p>
                      <div ref={signinRef} className="min-h-12 flex justify-center"/>
                      <button type="button" onClick={()=>{setGoogleUiError('');setFedcmButton(x=>!x);}} className="text-sm underline text-emerald-800">
                        {fedcmButton?'Sign-in not opening? Use classic popup':'Try browser-managed Google login'}
                      </button>
                      {googleUiError&&<p role="alert" className="bg-rose-50 rounded-xl p-3 text-sm text-rose-800">{googleUiError}</p>}
                      <details className="text-xs text-slate-500 rounded-xl bg-slate-50 p-3">
                        <summary className="cursor-pointer font-bold">Trouble signing in?</summary>
                        <p className="mt-2">Authorize this exact origin in Google Cloud and allow popups:</p>
                        <code className="break-all">{typeof window!=='undefined'?window.location.origin:''}</code>
                      </details>
                    </div>
                  )}
                  {loading&&<p role="status" className="text-sm mt-4 text-emerald-900">Verifying your bakery account…</p>}
                </div>
              </div>
            </div>          ) : (
            <div className="grid lg:grid-cols-[238px_minmax(0,1fr)] min-h-[74vh]">
              <aside className="bg-white border-b lg:border-b-0 lg:border-r border-slate-200 p-3 sm:p-4 lg:p-5 space-y-5">
                <div className="flex items-center gap-3 rounded-2xl bg-[#eff5f0] p-3">
                  <div className="grid place-items-center h-11 w-11 rounded-xl bg-[#1c4e3b] text-white font-black">
                    {identity.name.slice(0,1).toUpperCase()}
                  </div>
                  <div className="min-w-0"><strong className="text-sm block truncate text-[#173b32]">{identity.name}</strong>
                    <p className="text-xs text-slate-500">{roleName(identity.role)}</p>
                  </div>
                </div>
                <nav aria-label="Staff workspace sections" className="flex lg:flex-col overflow-x-auto gap-2 pb-2 lg:pb-0">
                  {tabs.map(tab=>{
                    const Icon=tab.icon;
                    return <button key={tab.id} type="button" aria-current={activeTab===tab.id?'page':undefined}
                      onClick={()=>{setActiveTab(tab.id);setError('');}}
                      className={'flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 min-h-12 text-left transition-colors '+(activeTab===tab.id?
                        'bg-[#1a453a] text-white shadow-sm':'text-slate-600 hover:bg-slate-100')}>
                      <Icon size={18} className="shrink-0"/>
                      <span><span className="block text-sm font-bold whitespace-nowrap">{tab.label}</span>
                        <span className={'hidden lg:block text-[11px] '+(activeTab===tab.id?'text-white/65':'text-slate-400')}>{tab.hint}</span></span>
                      {tab.id==='orders'&&actionableCount>0&&<span className={'ml-auto rounded-full min-w-6 px-2 py-0.5 text-xs font-black '+(activeTab===tab.id?'bg-white/20':'bg-amber-100 text-amber-800')}>{actionableCount}</span>}
                    </button>;
                  })}
                </nav>
                <div className="hidden lg:block bg-[#f7f9f6] rounded-xl p-4 text-xs text-slate-600 space-y-2">
                  <BadgeCheck size={18} className="text-emerald-700"/>
                  <p className="font-bold text-[#183a32]">Connected to private Sheets</p>
                  <p>Only permitted actions are shown for your role. Changes are verified again by the backend.</p>
                </div>
              </aside>
              <div className="min-w-0 p-4 sm:p-6 lg:p-8 space-y-5">
                <div className="flex flex-wrap gap-3 items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-[11px] text-emerald-800 uppercase tracking-[.18em] font-bold">Operations workspace</p>
                    <h3 className="text-2xl sm:text-3xl font-black tracking-tight text-[#173b32]">{tabs.find(tab=>tab.id===activeTab)?.label||'Overview'}</h3>
                    <p className="text-sm text-slate-500 mt-1">Hello, {identity.name}. Here's what needs attention.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span aria-live="polite" className="hidden sm:block text-xs text-slate-500">{loadingOrders?'Syncing · keeping current data…':viewingSavedOrders?'Saved orders · updating…':'Updated '+(updatedAt||'—')}</span>
                    <button type="button" disabled={loadingOrders} onClick={()=>void refresh()}
                      className="min-h-11 flex items-center gap-2 rounded-xl bg-white border px-3 text-sm font-semibold text-slate-700 disabled:opacity-60">
                      <RefreshCw size={16} className={loadingOrders?'animate-spin':''}/> Refresh
                    </button>
                    <button type="button" onClick={()=>{setIdentity(null);setOrders([]);setStaffProfiles([]);setActiveTab('overview');setError('');clearStaffCredential(getBrowserWorkspaceStorage());clearStaffOrdersSnapshot(getBrowserWorkspaceStorage());}}
                      aria-label="Sign out" className="min-h-11 flex items-center gap-2 rounded-xl border bg-white px-3 text-sm text-slate-700">
                      <LogOut size={16}/><span className="hidden sm:inline">Sign out</span>
                    </button>
                  </div>
                </div>
                {(activeTab==='overview'||activeTab==='orders')&&(
                  <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                    {[
                      {label:'Needs action',value:actionableCount,icon:AlertCircle,tone:'bg-amber-50 text-amber-800'},
                      {label:'Active orders',value:activeCount,icon:ShoppingBag,tone:'bg-sky-50 text-sky-800'},
                      {label:'Delivery stages',value:deliveryCount,icon:Truck,tone:'bg-violet-50 text-violet-800'},
                      {label:'COD collected',value:'৳'+collectedCOD.toLocaleString(),icon:CreditCard,tone:'bg-emerald-50 text-emerald-800'},
                    ].map(stat=>{const Icon=stat.icon;return <div key={stat.label} className="rounded-2xl bg-white border border-slate-200 p-4">
                      <span className={'inline-flex p-2 rounded-xl '+stat.tone}><Icon size={19}/></span>
                      <strong className="block text-2xl font-black text-[#183a32] mt-3">{stat.value}</strong>
                      <p className="text-xs text-slate-500 mt-1">{stat.label}</p>
                    </div>;})}
                  </div>
                )}
              {identity.role === 'super_admin' && activeTab==='team' && (
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
              {(activeTab==='orders'||activeTab==='overview')&&(
                <section aria-label="Order queue" className="space-y-4">
                  {orderUpdateMessage&&<p role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 ring-1 ring-emerald-200 p-4 text-emerald-950 text-sm"><BadgeCheck size={17}/>{orderUpdateMessage}</p>}
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div><h4 className="text-lg font-black text-[#173b32]">{activeTab==='overview'?'Next actions':'Live order queue'}</h4>
                      <p className="text-sm text-slate-500">Showing your latest {orders.length} authorized orders.</p></div>
                    {activeTab==='overview'&&<button type="button" className="rounded-xl px-4 py-3 bg-[#1b493d] text-white text-sm font-bold flex items-center gap-2"
                      onClick={()=>{setActiveTab('orders');setOrderFilter('all');}}>View all orders <ArrowRight size={15}/></button>}
                  </div>
                  <div className="rounded-2xl bg-white border border-slate-200 p-3 sm:p-4 space-y-3">
                    <div className="flex flex-wrap gap-2" aria-label="Filter orders">
                      {([{value:'actionable',label:'Needs my action'},{value:'active',label:'In progress'},{value:'completed',label:'Finished'},{value:'all',label:'All orders'}] as const).map(option=>(
                        <button type="button" key={option.value} aria-pressed={orderFilter===option.value} onClick={()=>setOrderFilter(option.value)}
                          className={'rounded-lg px-3 py-2.5 text-xs sm:text-sm font-bold '+(orderFilter===option.value?'bg-[#1b493d] text-white':'bg-slate-100 text-slate-700 hover:bg-slate-200')}>{option.label}</button>
                      ))}
                    </div>
                    <label className="flex gap-2 items-center rounded-xl border bg-slate-50 px-3 py-2" aria-label="Search orders">
                      <Search size={18} className="text-slate-400"/>
                      <input type="search" value={orderSearch} onChange={e=>setOrderSearch(e.target.value)}
                        className="w-full bg-transparent py-1 outline-none text-sm" placeholder="Search order, customer, phone or rider"/>
                    </label>
                  </div>
                  {activeTab==='orders'&&['super_admin','admin','order_manager','delivery_manager'].includes(identity.role)&&(
                    <section className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3" aria-label="Customer Master Lookup">
                      <h4 className="font-bold text-emerald-950">Customer Master · Phone VLOOKUP</h4>
                      <form className="flex flex-wrap gap-2" onSubmit={lookupCustomer}>
                        <input type="tel" aria-label="Customer phone lookup" value={customerLookupPhone} required
                          onChange={e=>{setCustomerLookupPhone(e.target.value);setCustomerLookupResult(null);setCustomerLookupMessage('');}}
                          placeholder="01XXXXXXXXX / +8801…" className="rounded-xl border bg-white p-3 flex-1 min-w-40"/>
                        <button type="submit" disabled={customerLookupBusy} className="rounded-xl bg-emerald-800 text-white px-5 py-3 font-semibold disabled:opacity-50">
                          {customerLookupBusy?'Searching…':'Find customer'}
                        </button>
                      </form>
                      {customerLookupMessage&&<p role="status" className="text-sm text-slate-700">{customerLookupMessage}</p>}
                      {customerLookupResult&&<div className="grid gap-2 sm:grid-cols-2 text-sm bg-white p-4 rounded-xl">
                        <p><strong>Name:</strong> {customerLookupResult.name}</p>
                        <p><strong>Phone:</strong> {customerLookupResult.phone}</p>
                        <p className="sm:col-span-2"><strong>Saved first address:</strong> {customerLookupResult.delivery_address}</p>
                        <p><strong>Total orders:</strong> {customerLookupResult.order_count}</p>
                        <p><strong>Last order:</strong> {customerLookupResult.last_order_at||'—'}</p>
                      </div>}
                      <p className="text-xs text-slate-500">Private customer details are visible only to authorized staff. Public checkout does not reveal addresses by entering a phone number.</p>
                    </section>
                  )}
                  {loadingOrders&&!orders.length&&<div role="status" className="rounded-2xl bg-white p-8 text-center text-slate-500">Loading live orders…</div>}
                  {!loadingOrders&&matchingOrders.length===0&&
                    <div className="rounded-2xl border border-dashed border-emerald-200 bg-white px-5 py-10 text-center">
                      <PackageCheck size={34} className="mx-auto text-emerald-700 mb-3"/>
                      <h5 className="font-bold text-[#173b32]">{orders.length===0?'No orders assigned yet':'No orders match this view'}</h5>
                      <p className="text-sm text-slate-500 mt-1">Try another filter or refresh the Sheet.</p>
                      <button type="button" className="mt-3 font-semibold text-sm underline text-emerald-800"
                        onClick={()=>{setOrderFilter('all');setOrderSearch('');}}>Show all orders</button>
                    </div>}
                  <div className="grid gap-3">
                    {matchingOrders.slice(0,activeTab==='overview'?5:100).map(order => {
                  const next = actionForStatus[order.status] || null;
                  const canCancel = canOperate(identity.role, 'cancel') && ['pending','confirmed','preparing','ready','assigned'].includes(order.status);
                  const expanded=expandedOrders.includes(order.id);
                  return <article key={order.id} className={'bg-white rounded-[20px] border p-4 sm:p-5 space-y-4 transition-colors '+(next&&canOperate(identity.role,next.operation)?'border-emerald-300 shadow-[0_2px_18px_rgba(10,80,60,.07)]':'border-slate-200')}>
                    <div className="flex flex-wrap justify-between items-start gap-3">
                      <div className="flex gap-3 min-w-0">
                        <div className="shrink-0 h-11 w-11 rounded-2xl bg-[#eaf2eb] text-[#20533e] grid place-items-center"><PackageCheck size={21}/></div>
                        <div className="min-w-0">
                          <strong className="block text-base sm:text-lg text-[#173b32] break-all">#{order.order_number}</strong>
                          <p className="text-sm text-slate-600">{order.customer_name||'Customer'} {order.customer_phone&&<a className="text-emerald-700 underline underline-offset-2" href={`tel:${order.customer_phone}`}>{order.customer_phone}</a>}</p>
                          <p className="mt-1 text-xs text-slate-500 flex items-center gap-1"><Clock3 size={12}/>{order.delivery_date||'Date not specified'} · {order.delivery_slot||'Any slot'}</p>
                        </div>
                      </div>
                      <div className="flex sm:flex-col items-center sm:items-end gap-2">
                        <span className={'shrink-0 rounded-full px-3 py-1.5 text-xs font-extrabold ring-1 '+stageClass(order.status)}>{stageNames[order.status]||order.status.replaceAll('_',' ')}</span>
                        <span className="text-lg font-black text-[#173b32]">৳{Number(order.total_amount||0).toLocaleString()}</span>
                      </div>
                    </div>
                    {order.delivery_address&&
                      <div className="flex flex-wrap items-center gap-2 bg-[#f7f9f7] rounded-xl p-3 text-sm text-slate-700">
                        <MapPin size={16} className="text-emerald-700 shrink-0"/>
                        <span className="flex-1 min-w-0">{order.delivery_address}</span>
                        <a className="font-bold text-emerald-800 underline whitespace-nowrap" target="_blank" rel="noopener noreferrer"
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.delivery_address)}`}>Directions</a>
                      </div>}
                    {next&&canOperate(identity.role,next.operation)&&
                      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
                        Your next step: {next.label}. Customer progress updates after a successful save.
                      </p>}
                    {order.status!=='cancelled'&&
                      <div className="space-y-1.5" aria-label={`Delivery progress: ${stageNames[order.status]||order.status}`}>
                        <div className="flex gap-1.5">{pipeline.map((stage,index)=>(
                          <span key={stage} title={stageNames[stage]} aria-hidden="true"
                            className={'h-1.5 flex-1 rounded-full '+(index<=pipeline.indexOf(order.status)?'bg-emerald-700':'bg-slate-200')}/>
                        ))}</div>
                        <p className="text-[11px] text-slate-500">Order journey · {stageNames[order.status]||order.status}</p>
                      </div>}
                    <button type="button" aria-expanded={expanded} onClick={()=>setExpandedOrders(ids=>expanded?ids.filter(id=>id!==order.id):[...ids,order.id])}
                      className="w-full flex items-center justify-between border-t pt-3 text-sm font-bold text-slate-700 hover:text-emerald-800">
                      <span>{expanded?'Hide order details':'Show items and order details'}</span>
                      {expanded?<ChevronUp size={18}/>:<ChevronDown size={18}/>}
                    </button>
                    {expanded&&<div className="rounded-xl bg-slate-50 p-4 space-y-3 text-sm text-slate-700">
                      <div className="flex flex-wrap gap-3"><span>Payment: <strong>{order.payment_method?.toUpperCase()}</strong></span>
                        <span>Status: <strong>{order.payment_status}</strong></span>
                        {order.cod_collected&&<span className="text-emerald-800 font-bold">Cash collected</span>}
                      </div>
                      {(order.items||[]).length>0&&<div className="space-y-2">
                        {(order.items||[]).map(item=><p key={item.id}>{item.quantity} × {item.product_name} ({item.variant_name}) {item.flavor_name?' · '+item.flavor_name:''}{item.writing_message?' · '+item.writing_message:''}</p>)}
                      </div>}
                      {order.order_note&&<p className="border-t pt-2">Customer note: {order.order_note}</p>}
                      {order.rider_name&&<p className="flex items-center gap-2"><Truck size={15}/> Rider: {order.rider_name}</p>}
                    </div>}
                    <div className="flex flex-wrap gap-2 items-center">
                      {next && canOperate(identity.role, next.operation) && next.operation !== 'deliver' && (
                        <>
                          {next.operation === 'assign' && <select aria-label="Assign registered rider" value={riderEmail} onChange={e => setRiderEmail(e.target.value)} className="min-h-12 border rounded-xl px-3 py-3 text-sm bg-white">
                            {identity.riders.map(rider => <option key={rider.email} value={rider.email}>{rider.name} — {rider.email}</option>)}
                          </select>}
                          <button type="button" disabled={!!busyOrderId} onClick={() => void mutate(order,next.operation)}
                            className="min-h-12 rounded-xl bg-[#1a493b] hover:bg-[#27644e] text-white px-5 py-3 text-sm font-bold disabled:opacity-50 flex items-center gap-2"><PackageCheck size={18} /> {busyOrderId===order.id?'Saving to Sheets…':next.label}</button>
                        </>
                      )}
                      {next?.operation === 'deliver' && canOperate(identity.role,'deliver') && (
                        otpOrderId === order.id ? (
                          <div className="flex flex-wrap items-center gap-3">
                            <input type="text" inputMode="numeric" maxLength={4} aria-label="Customer delivery OTP" placeholder="4-digit OTP" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g,''))} className="w-32 border rounded-xl p-2" />
                            {order.payment_method === 'cod' && <label className="text-sm"><input type="checkbox" checked={cashCollected} onChange={e => setCashCollected(e.target.checked)} /> I collected the full cash amount</label>}
                            <button type="button" disabled={!!busyOrderId} onClick={() => void mutate(order,'deliver')} className="min-h-12 bg-[#1a493b] text-white font-bold rounded-xl px-5 py-3 text-sm">Verify & deliver</button>
                          </div>
                        ) : <button type="button" onClick={() => { setOtpOrderId(order.id); setOtp(''); setCashCollected(false); }} className="min-h-12 bg-[#1a493b] text-white font-bold rounded-xl px-5 py-3 text-sm">Verify customer OTP</button>
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
                </section>
              )}
              <React.Suspense fallback={<div className="rounded-2xl bg-white border p-8 text-center text-slate-500" role="status">Opening your workspace…</div>}>
                {activeTab==='cakes'&&(['super_admin','admin','order_manager'] as string[]).includes(identity.role) && <CustomCakeQueue endpoint={endpoint} token={identity.token} />}
                {activeTab==='website'&&(identity.role === 'super_admin' || identity.role === 'admin') && <WebsiteManager endpoint={endpoint} token={identity.token}
                  role={identity.role} onUpdated={() => onCatalogUpdated?.()} />}
              </React.Suspense>
              </div>
            </div>
          )}

        </div>
      </section>
    </div>
  );
};
