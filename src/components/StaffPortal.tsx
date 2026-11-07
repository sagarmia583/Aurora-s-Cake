import { shopErrorMessage } from '../utils/shopErrorMessage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, RefreshCw, ShieldCheck, Truck, PackageCheck, LayoutDashboard, ShoppingBag, UsersRound, CakeSlice, Store, Search, ChevronDown, ChevronUp, LogOut, Clock3, BadgeCheck, ArrowRight, AlertCircle, CreditCard, MapPin, Calculator, Printer, Phone, User, FileText, CheckCircle, Eye } from 'lucide-react';
import { checkStaffSession, getStaffOrderSnapshot, mutateStaffOrder, issueLegacyReceiptAccess, signInStaffPassword, signOutStaffPassword, createStaffAccount, changeStaffStatus, resetStaffPassword, lookupStaffCustomer } from '../services/sheetStaffApi';
import type { StaffCustomerMatch, StaffOperation, StaffOrder, StaffProfile, StaffRoleName, StaffSession } from '../services/sheetStaffApi';
import { getAuroraGoogleClientId } from '../config/googleOAuth';
import { getBrowserWorkspaceStorage, loadStaffCredential, saveStaffCredential, clearStaffCredential, loadStaffTab, saveStaffTab } from '../services/staffWorkspaceSession';
import { reconcileStaffOrders, reconcileStaffOrderSnapshot, loadStaffOrdersSnapshot, saveStaffOrdersSnapshot, clearStaffOrdersSnapshot } from '../services/staffOrderSnapshot';
import { activeStaffOrderAlertIds, detectNewStaffOrderAlerts } from '../services/staffOrderAlerts';
import { 
  isOrderBeepEnabled, 
  setOrderBeepEnabled, 
  playOrderAlertSound, 
  testOrderAlertSound, 
  getOrCreateAudioContext,
  startOrderAlertLoop,
  acknowledgeOrderAlert,
  stopOrderAlertLoop,
} from '../services/orderSound';
import { mockDb } from '../services/mockDatabase';
import { StaffPermissionCode, OrderStatus, Order } from '../types';
import { PosPrintModal } from './PosPrintModal';
import { PosPrinterSettingsModal } from './PosPrinterSettingsModal';
import { CollectionStatementModal } from './CollectionStatementModal';
import { AdminCreateOrderModal } from './AdminCreateOrderModal';
import { CustomerOrderLink } from './CustomerOrderLink';
import { OrderDetailsModal } from './OrderDetailsModal';
import { createDemoReceiptOrder } from '../services/posPrinterService';
import { formatShortOrderNumber } from '../utils/orderUtils';
// Download the larger forms only if the user opens those workspaces.
const WebsiteManager=React.lazy(()=>import('./WebsiteManager').then(m=>({default:m.WebsiteManager})));
const CustomCakeQueue=React.lazy(()=>import('./CustomCakeQueue').then(m=>({default:m.CustomCakeQueue})));
const ItemCostingManager=React.lazy(()=>import('./ItemCostingManager').then(m=>({default:m.ItemCostingManager})));

type GoogleSdk = {
  initialize: (options: { client_id: string; callback: (response: { credential?: string }) => void; ux_mode?: 'popup'; use_fedcm_for_button?: boolean; auto_select?: boolean }) => void;
  renderButton: (element: HTMLElement, options: { theme: string; size: string; text: string }) => void;
};
const googleSdk = (): GoogleSdk | undefined =>
  (window as Window & { google?: { accounts?: { id?: GoogleSdk } } }).google?.accounts?.id;

function canOperate(role: StaffRoleName, operation: StaffOperation): boolean {
  // Super Admin and Admin can do ANY operation across the bakery without restriction
  if (role === 'super_admin' || role === 'admin') return true;

  // Rider actions
  if (['pick_up', 'start_delivery', 'deliver'].includes(operation)) {
    // Delivery managers dispatch; only assigned riders and administrators complete deliveries.
    return role === 'delivery_man' || (role !== 'delivery_manager' && (mockDb.hasPermission(role, 'delivery.complete') || mockDb.hasPermission(role, 'delivery.dispatch')));
  }

  const operationPermMap: Partial<Record<StaffOperation, StaffPermissionCode>> = {
    confirm: 'orders.confirm',
    cancel: 'orders.cancel',
    start_baking: 'kitchen.bake',
    mark_ready: 'kitchen.ready',
    assign: 'delivery.assign',
    pick_up: 'delivery.dispatch',
    start_delivery: 'delivery.dispatch',
    deliver: 'delivery.complete',
  };

  const neededPerm = operationPermMap[operation];
  if (neededPerm && mockDb.hasPermission(role, neededPerm)) {
    return true;
  }

  const rules: Partial<Record<StaffRoleName, StaffOperation[]>> = {
    order_manager: ['confirm', 'cancel'],
    kitchen_manager: ['start_baking', 'mark_ready'],
    delivery_manager: ['assign', 'pick_up', 'start_delivery', 'deliver'],
    delivery_man: ['pick_up', 'start_delivery', 'deliver'],
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
  out_for_delivery: { operation: 'deliver', label: 'Complete Delivery (ক্যাশ চেক ও ডেলিভারি)' },
  delivered: null, cancelled: null,
};

type StaffTab = 'overview' | 'orders' | 'cakes' | 'team' | 'website' | 'costing';
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
  const [signingOut,setSigningOut]=useState(false);
  const [activeTab,setActiveTab]=useState<StaffTab>(() => {
    const saved=loadStaffTab(getBrowserWorkspaceStorage());
    return ['overview','orders','cakes','team','website','costing'].includes(saved)?saved as StaffTab:'overview';
  });
  const [orderFilter,setOrderFilter]=useState<OrderFilter>('all');
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
  const [selectedOrderForPosPrint, setSelectedOrderForPosPrint] = useState<StaffOrder | Order | null>(null);
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<StaffOrder | Order | null>(null);
  const [isPosSettingsOpen, setIsPosSettingsOpen] = useState(false);
  const [isCollectionStatementOpen, setIsCollectionStatementOpen] = useState(false);
  const [isCreateOrderModalOpen, setIsCreateOrderModalOpen] = useState(false);
  const [beepEnabled,setBeepEnabled]=useState(()=>isOrderBeepEnabled());
  const [unreadOrderAlerts,setUnreadOrderAlerts]=useState<string[]>([]);
  const lastServerOrdersRef=useRef<StaffOrder[]|null>(null);
  const alertedIdentityRef=useRef('');
  const playOrderBeep=useCallback(()=>{
    if(!beepEnabled)return;
    void playOrderAlertSound();
  },[beepEnabled]);
  const enableOrderBeep=async()=>{
    try{
      getOrCreateAudioContext();
      setOrderBeepEnabled(true);
      setBeepEnabled(true);
      await playOrderAlertSound(true);
      // An explicit click can also request optional system notifications.
      if('Notification' in window && Notification.permission==='default') {
        void Notification.requestPermission().catch(()=>{});
      }
    }catch(e){setBeepEnabled(false);setError(shopErrorMessage(e, 'Cannot enable beep.'));}
  };
  const disableOrderBeep=()=>{
    setOrderBeepEnabled(false);
    setBeepEnabled(false);
  };
  const [staffProfiles, setStaffProfiles] = useState<StaffProfile[]>([]);
  const [refreshingStaff, setRefreshingStaff] = useState(false);
  const [error, setError] = useState('');
  const [snapshotWarning,setSnapshotWarning]=useState('');
  const [loading, setLoading] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState('');
  const [riderEmail, setRiderEmail] = useState('');
  const [deliveryConfirmOrderId, setDeliveryConfirmOrderId] = useState('');
  const [cashCollected, setCashCollected] = useState(false);
  const [updatedAt, setUpdatedAt] = useState('');
  const ordersRefreshInFlight=useRef<string|null>(null);
  const queuedOrderRefresh=useRef(false);
  const [loadingOrders,setLoadingOrders]=useState(false);
  const [viewingSavedOrders,setViewingSavedOrders]=useState(false);
  const [orderUpdateMessage,setOrderUpdateMessage]=useState('');
  const [backendWarning,setBackendWarning]=useState('');
  // Health is a read-only Netlify check, never an external database mirror.
  useEffect(()=>{
    if(!isOpen||typeof window==='undefined'||!window.location.hostname.endsWith('.netlify.app'))return;
    const controller=new AbortController();
    void fetch('/api/backend-health',{credentials:'same-origin',cache:'no-store',signal:controller.signal})
      .then(async response=>{
        const data=await response.json().catch(()=>null);
        if(controller.signal.aborted)return;
        if(!response.ok||data?.ok!==true||data?.up_to_date!==true){
          setBackendWarning('Netlify backend health is not ready. Order actions may be unavailable until the reviewed Apps Script release is deployed.');
        }else setBackendWarning('');
      })
      .catch(()=>{if(!controller.signal.aborted)setBackendWarning('Unable to check the Netlify backend. Confirm your connection before updating orders.');});
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
    }catch(error){setCustomerLookupMessage(shopErrorMessage(error, 'Customer search failed.'));}
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
      ...(['super_admin','admin'].includes(identity.role)?['team']:[]),
      ...(['super_admin','admin'].includes(identity.role)?['website']:[]),
      ...(['super_admin','admin','order_manager','accountant'].includes(identity.role)?['costing']:[])];
    const next=allowed.includes(stored)?stored as StaffTab:operational?'orders':'overview';
    setActiveTab(next);
    // Keep every authorized order visible as it moves between roles/stages.
    // The old default 'Needs my action' made successfully updated orders
    // disappear immediately, even when still present in state and Sheets.
    setOrderFilter('all');
  },[identity?.role]);
  useEffect(()=>{if(identity)saveStaffTab(getBrowserWorkspaceStorage(),activeTab);},[activeTab,identity]);
  const actionableCount=identity?orders.filter(order=>isActionable(order,identity.role)).length:0;
  const activeCount=orders.filter(order=>!terminalStatuses.has(order.status)).length;
  const deliveryCount=orders.filter(order=>['assigned','picked_up','out_for_delivery'].includes(order.status)).length;
  const collectedCOD=orders.filter(order=>order.payment_method==='cod'&&order.payment_status==='paid'&&order.cod_collected)
    .reduce((total,order)=>total+order.total_amount,0);
  const roleTabs:{id:StaffTab;label:string;icon:typeof LayoutDashboard;show:boolean}[]=[
    {id:'overview',label:'Overview',icon:LayoutDashboard,show:true},
    {id:'orders',label:'Orders & delivery',icon:ShoppingBag,show:true},
    {id:'cakes',label:'Custom cake requests',icon:CakeSlice,show:['super_admin','admin','order_manager'].includes(identity?.role||'') || Boolean(identity && mockDb.hasPermission(identity.role, 'custom_cakes.manage'))},
    {id:'costing',label:'Costing & Profit (কস্টিং ও লাভ)',icon:Calculator,show:['super_admin','admin','order_manager','accountant'].includes(identity?.role||'') || Boolean(identity && mockDb.hasPermission(identity.role, 'costing.view'))},
    {id:'team',label:'Staff & access',icon:UsersRound,show:['super_admin','admin'].includes(identity?.role||'') || Boolean(identity && mockDb.hasPermission(identity.role, 'staff.manage'))},
    {id:'website',label:'Website manager',icon:Store,show:identity?.role==='super_admin'||identity?.role==='admin' || Boolean(identity && mockDb.hasPermission(identity.role, 'settings.manage'))},
  ];
  const tabs=roleTabs.filter(tab=>tab.show);
  const pipeline=['pending','confirmed','preparing','ready','assigned','picked_up','out_for_delivery','delivered'];
  const matchingOrders=identity?orders.filter(order=>{
    const query=orderSearch.trim().toLowerCase();
    const shortNum=formatShortOrderNumber(order.order_number).toLowerCase();
    const matches=!query||[order.order_number,shortNum,order.customer_name,order.customer_phone,order.delivery_address,order.rider_name]
      .some(value=>String(value||'').toLowerCase().includes(query));
    const filterMatch=orderFilter==='all'||(orderFilter==='actionable'&&isActionable(order,identity.role))||
      (orderFilter==='active'&&!terminalStatuses.has(order.status))||
      (orderFilter==='completed'&&terminalStatuses.has(order.status));
    return matches&&filterMatch;
  }).sort((a,b)=>Number(isActionable(b,identity.role))-Number(isActionable(a,identity.role))||
    Date.parse(b.updated_at||'')-Date.parse(a.updated_at||'')):[];

  useEffect(()=>{
    const current=identity?identity.role+':'+identity.email:'';
    if(current!==alertedIdentityRef.current){
      alertedIdentityRef.current=current;
      lastServerOrdersRef.current=null;
      setUnreadOrderAlerts([]);
    }
  },[identity?.role,identity?.email]);
  useEffect(()=>{
    if(beepEnabled && unreadOrderAlerts.length > 0 && isOpen){
      startOrderAlertLoop('staff_unread_' + unreadOrderAlerts.join('_'));
    } else {
      stopOrderAlertLoop();
    }
    return () => {
      stopOrderAlertLoop();
    };
  },[beepEnabled, unreadOrderAlerts.length, isOpen]);
  useEffect(()=>{
    if(isOpen && beepEnabled){
      getOrCreateAudioContext();
    }
  },[isOpen, beepEnabled]);

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
    } catch (caught) { setError(shopErrorMessage(caught, 'Staff login failed.')); }
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
    }catch(caught){setError(shopErrorMessage(caught, 'Staff sign-in failed.'));}
    finally{setLoading(false);}
  };
  const signOut=async()=>{
    if(!identity||signingOut)return;
    const token=identity.token;setSigningOut(true);setError('');
    try{
      // Google credentials are verified externally; only password staff have
      // an application-owned bearer session that this backend can revoke.
      if(/^[a-f0-9-]{72}$/i.test(token))await signOutStaffPassword(endpoint,token);
      if(liveIdentityToken.current!==token)return;
      liveIdentityToken.current=undefined;
      clearStaffCredential(getBrowserWorkspaceStorage());clearStaffOrdersSnapshot(getBrowserWorkspaceStorage());
      setIdentity(null);setOrders([]);setStaffProfiles([]);setActiveTab('overview');setError('');setSnapshotWarning('');
    }catch{
      if(liveIdentityToken.current===token)setError('Sign out could not be confirmed. Retry before leaving this device.');
    }finally{setSigningOut(false);}
  };
  const createEmployee=async(e:React.FormEvent)=>{
    e.preventDefault();if(!identity||!['super_admin','admin'].includes(identity.role))return;
    setCreatingStaff(true);setError('');
    try {
      await createStaffAccount(endpoint,identity.token,newStaff.name,newStaff.username,newStaff.password,newStaff.role);
      setNewStaff({name:'',username:'',password:'',role:'kitchen_manager'});
      const result=await checkStaffSession(endpoint,identity.token);
      setStaffProfiles(result.staff_profiles??[]);
    }catch(caught){setError(shopErrorMessage(caught, 'Staff account could not be created.'));}
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
      const message=caught instanceof Error ? caught.message : '';
      // Do not discard credentials during a temporary network failure.
      if(/sign in again|login expired|not authorized|not active|invalid google|token expired/i.test(message)) {
        clearStaffCredential(getBrowserWorkspaceStorage());
        clearStaffOrdersSnapshot(getBrowserWorkspaceStorage());
      }
      setError(shopErrorMessage(caught, 'Could not restore your staff session.'));
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
      const snapshot=await getStaffOrderSnapshot(endpoint,identity.token);
      const fresh=snapshot.orders;
      // A response from an old identity/request must never overwrite the
      // currently signed-in employee's orders.
      if(liveIdentityToken.current!==identity.token||!liveIsOpen.current)return;
      const currentIdentity=identity.role+':'+identity.email;
      const prior=alertedIdentityRef.current===currentIdentity?lastServerOrdersRef.current:null;
      if(alertedIdentityRef.current!==currentIdentity){
        alertedIdentityRef.current=currentIdentity;
        lastServerOrdersRef.current=null;
        setUnreadOrderAlerts([]);
      }
      const verified=prior?reconcileStaffOrderSnapshot(prior,fresh,snapshot.complete):fresh;
      if(prior){
        const added=detectNewStaffOrderAlerts(prior,verified,identity.role,identity.email);
        if(added.length){
          setUnreadOrderAlerts(current=>[...new Set([...current,...added])]);
          if(beepEnabled) playOrderBeep();
          if('Notification' in window && Notification.permission==='granted' && beepEnabled){
            try{
              const notice=new Notification('🔔 Aurora’s Cake — new order!',{
                body:added.length+' order or delivery stage needs your attention.',
                tag:'aurora-new-order',
              });
              notice.onclick=()=>{
                window.focus();
                setActiveTab('orders');
                notice.close();
              };
            }catch{/* Not all browsers support system notifications. */}
          }
        }
        setUnreadOrderAlerts(current=>activeStaffOrderAlertIds(verified,current,identity.role,identity.email));
      }
      lastServerOrdersRef.current=verified;
      setOrders(previous=>reconcileStaffOrderSnapshot(previous,fresh,snapshot.complete));
      setUpdatedAt(new Date().toLocaleTimeString());
      if(snapshot.complete||fresh.length>0)setViewingSavedOrders(false);
      setSnapshotWarning(snapshot.complete?'':snapshot.invalidReceipts+
        ' unreadable Google Sheets receipt row(s). Valid new orders are shown; older orders have been preserved. Repair the affected Sheet rows before accepting financial totals as final.');
    } catch (caught) {
      if(liveIdentityToken.current===identity.token&&liveIsOpen.current)
        setError((shopErrorMessage(caught, 'Unable to load orders.'))+' Your previous order list has been kept.');
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
  }, [endpoint, identity?.token, isOpen,playOrderBeep,beepEnabled]);

  useEffect(() => {
    if (!isOpen || !identity) return;
    void refresh();
    // Continue watching new COD orders even while the owner edits website content.
    // The current tab stays responsive; hidden tabs poll less aggressively.
    const refreshMs=identity.role==='delivery_man'?8000:
      ['overview','orders'].includes(activeTab)?12000:20000;
    const interval = window.setInterval(() => {
      void refresh();
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
    if(!identity||!['super_admin','admin'].includes(identity.role)||!window.confirm(active?'Enable this staff account?':'Disable this staff account and revoke its sessions?'))return;
    setRefreshingStaff(true);setError('');
    try{
      await changeStaffStatus(endpoint,identity.token,username,active);
      const profile=await checkStaffSession(endpoint,identity.token);
      setStaffProfiles(profile.staff_profiles??[]);
    }catch(caught){setError(shopErrorMessage(caught, 'Staff status could not be updated.'));}
    finally{setRefreshingStaff(false);}
  };
  const resetEmployeePassword=async(event:React.FormEvent)=>{
    event.preventDefault();
    if(!identity||!['super_admin','admin'].includes(identity.role)||!resetFor)return;
    setRefreshingStaff(true);setError('');
    try{
      await resetStaffPassword(endpoint,identity.token,resetFor,resetPassword);
      setResetFor('');setResetPassword('');
    }catch(caught){setError(shopErrorMessage(caught, 'Could not reset employee password.'));}
    finally{setRefreshingStaff(false);}
  };

  const refreshStaffProfiles = useCallback(async () => {
    if (!identity || !['super_admin','admin'].includes(identity.role)) return;
    setRefreshingStaff(true);
    try {
      const current = await checkStaffSession(endpoint, identity.token);
      if (current.role !== 'super_admin' && current.role !== 'admin') throw new Error('Administrator access is no longer available. Sign in again.');
      setStaffProfiles(current.staff_profiles ?? []);
      setError('');
    } catch (caught) { setError(shopErrorMessage(caught, 'Unable to refresh staff profiles.')); }
    finally { setRefreshingStaff(false); }
  }, [endpoint, identity]);

  const recoverLegacy=async(order:StaffOrder)=>{
    if(!identity||!['super_admin','admin'].includes(identity.role)||busyOrderId)return;
    if(!window.confirm('Only continue after independently verifying the original customer in person or through a trusted prior contact. This creates a private receipt key; send it ONLY to that customer. Continue?'))return;
    setBusyOrderId(order.id);setError('');setLegacyKey(null);
    try{
      const key=await issueLegacyReceiptAccess(endpoint,identity.token,order.id);
      setLegacyKey({orderId:order.id,key});
      setOrders(previous=>previous.map(item=>item.id===order.id?{...item,legacy_receipt_missing:false}:item));
    }catch(error){setError(shopErrorMessage(error, 'Could not restore this legacy order receipt.'));}
    finally{setBusyOrderId('');}
  };

  const mutate = async (order: StaffOrder, operation: StaffOperation) => {
    if (!identity || busyOrderId) return;
    if (operation === 'cancel' && !window.confirm('Cancel this order? This cannot be undone.')) return;
    if (operation === 'assign' && !riderEmail) { setError('Select a registered rider.'); return; }
    if (operation === 'deliver' && order.payment_method === 'cod' && !cashCollected) {
      setError('Confirm that the cash was received before marking delivered.'); return;
    }
    setBusyOrderId(order.id); setError('');
    try {
      const isManager = identity.role === 'super_admin' || identity.role === 'admin' || identity.role === 'delivery_manager';
      const confirmed = await mutateStaffOrder(endpoint, identity.token, operation, order.id,
        operation === 'assign' ? { rider_email: riderEmail } :
        operation === 'deliver' ? { cash_collected: cashCollected, admin_override: isManager } :
        (operation === 'pick_up' || operation === 'start_delivery') ? { admin_override: isManager } : {});
      // Display the server-confirmed stage immediately; don't block the rider
      // for another costly full Sheet list request.
      setOrders(previous=>reconcileStaffOrders(previous,previous.map(item=>item.id===confirmed.id?{...item,...confirmed}:item)));
      setUpdatedAt(new Date().toLocaleTimeString());
      setOrderUpdateMessage('Order '+formatShortOrderNumber(order.order_number)+' updated to '+confirmed.status.replaceAll('_',' ')+'.');
       setDeliveryConfirmOrderId(''); setCashCollected(false);
      // Refresh independently to reconcile staff roles/other active orders.
      void refresh();
    } catch (caught) { setError(shopErrorMessage(caught, 'Unable to update order.')); }
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
          {backendWarning&&<p role="alert" className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-sm font-medium text-amber-950">{backendWarning}</p>}
          {identity&&snapshotWarning&&<p role="status" className="mx-4 sm:mx-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">{snapshotWarning}</p>}
          {!oauthClientId ? (
            <div role="alert" className="m-6 rounded-2xl bg-amber-50 p-6 text-amber-900">Google sign-in is temporarily unavailable.</div>
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
                          <input value={password} onChange={e=>setPassword(e.target.value)} required type="password" minLength={4}
                            autoComplete="current-password" placeholder="Your password (min 4 digits)" aria-label="Employee password"
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
                  <div className="relative shrink-0">
                    <img
                      src={mockDb.getShopSettingsSync().profile_image_url || mockDb.getShopSettingsSync().logo_url || '/images/aurora-logo.png'}
                      alt={identity.name}
                      className="h-11 w-11 rounded-xl object-cover border border-emerald-900/15 shadow-2xs bg-white"
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (!target.src.endsWith('/images/aurora-logo.png')) {
                          target.src = '/images/aurora-logo.png';
                        }
                      }}
                    />
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full" title="অনলাইন" />
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
                      <span className="block text-sm font-bold whitespace-nowrap">{tab.label}</span>
                      {tab.id==='orders'&&actionableCount>0&&<span className={'ml-auto rounded-full min-w-6 px-2 py-0.5 text-xs font-black '+(activeTab===tab.id?'bg-white/20':'bg-amber-100 text-amber-800')}>{actionableCount}</span>}
                    </button>;
                  })}
                </nav>
                <div className="hidden lg:block bg-[#f7f9f6] rounded-xl p-4 text-xs text-slate-600 space-y-2">
                  <BadgeCheck size={18} className="text-emerald-700"/>
                  <p className="font-bold text-[#183a32]">Connected to private Sheets</p>
                  <p>You’ll see the actions available to your role.</p>
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
                    <button type="button" onClick={()=>void (beepEnabled?disableOrderBeep():enableOrderBeep())}
                       className={'min-h-11 flex items-center gap-2 rounded-xl border px-3 text-sm font-bold '+(beepEnabled?'bg-emerald-50 text-emerald-800 border-emerald-200':'bg-amber-100 text-amber-950 border-amber-300')}>
                       {beepEnabled?'🔊 High Alert ON (Auto)':'🔇 Enable Beep'}
                     </button>
                     <button type="button" title="Test high order alert sound" onClick={()=>void testOrderAlertSound()}
                       className="min-h-11 flex items-center gap-1.5 rounded-xl border bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
                       🔔 Test Sound
                     </button>
                     <button type="button" disabled={loadingOrders} onClick={()=>void refresh()}
                      className="min-h-11 flex items-center gap-2 rounded-xl bg-white border px-3 text-sm font-semibold text-slate-700 disabled:opacity-60">
                      <RefreshCw size={16} className={loadingOrders?'animate-spin':''}/> Refresh
                    </button>
                    <button type="button" disabled={signingOut} onClick={()=>void signOut()}
                      aria-label="Sign out" className="min-h-11 flex items-center gap-2 rounded-xl border bg-white px-3 text-sm text-slate-700 disabled:opacity-60">
                      <LogOut size={16}/><span className="hidden sm:inline">{signingOut?'Signing out…':'Sign out'}</span>
                    </button>
                  </div>
                </div>
                {unreadOrderAlerts.length>0&&(
                   <div role="alert" aria-live="assertive" className="rounded-2xl border-2 border-red-400 bg-red-50 px-4 py-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
                     <div className="flex items-center gap-3">
                       <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-600 text-white text-2xl animate-pulse">🔔</span>
                       <div><strong className="block text-lg text-red-900">{unreadOrderAlerts.length} new order {unreadOrderAlerts.length===1?'alert':'alerts'}!</strong>
                         <p className="text-sm text-red-800">New orders or delivery steps need attention. {beepEnabled?'Beep reminders are active.':'Click Enable Beep for sound.'}</p></div>
                     </div>
                     <div className="flex gap-2">
                       <button
                         type="button"
                         onClick={() => {
                           setActiveTab('orders');
                           const target =
                             orders.find((o) => unreadOrderAlerts.includes(o.id)) || orders[0];
                           setUnreadOrderAlerts([]);
                           acknowledgeOrderAlert();
                           if (target) {
                             setSelectedOrderForDetails(target);
                           }
                         }}
                         className="rounded-xl bg-red-700 hover:bg-red-800 text-white px-4 py-2 font-bold text-sm cursor-pointer shadow-xs transition-colors flex items-center gap-1.5"
                       >
                         <Eye size={15} />
                         <span>View orders (অর্ডার দেখুন ও প্রিন্ট)</span>
                       </button>
                       <button
                         type="button"
                         onClick={() => {
                           setUnreadOrderAlerts([]);
                           acknowledgeOrderAlert();
                         }}
                         className="rounded-xl border border-red-300 px-4 py-2 font-bold text-sm text-red-800 hover:bg-red-100 cursor-pointer transition-colors"
                       >
                         Acknowledge
                       </button>
                     </div>
                   </div>
                 )}
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
              {['super_admin', 'admin'].includes(identity.role) && activeTab==='team' && (
                <section className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3" aria-labelledby="staff-profiles-heading">
                  <div className="flex flex-wrap gap-3 items-center justify-between">
                    <div>
                      <h3 id="staff-profiles-heading" className="text-lg font-bold text-slate-900">Staff Profiles ({staffProfiles.length})</h3>
                      <p className="text-sm text-slate-600">Verified staff directory · Administrator access</p>
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
                          {person.username && (identity.role==='super_admin' || !['super_admin','admin'].includes(person.role)) && (
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
                  ) : <p className="text-sm text-amber-800">The staff directory is temporarily unavailable.</p>}
                  <p className="text-xs text-slate-500">
                    New employees sign in with the username and initial password you create below.
                    Keep the owner Google account private. Passwords cannot be viewed again after creation.
                    Older Google-allowlisted staff can still sign in until removed from the Script Property.
                  </p>
                  {resetFor && (
                    <form onSubmit={resetEmployeePassword} className="border rounded-xl p-3 flex flex-wrap items-center gap-2">
                      <label className="text-sm font-medium">New password for @{resetFor}</label>
                      <input type="password" required minLength={8} autoComplete="new-password" value={resetPassword}
                        onChange={e=>setResetPassword(e.target.value)} placeholder="Minimum 8 characters" aria-label="New staff account password"
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
                    <input required type="password" minLength={8} aria-label="New staff password" placeholder="Password (min 8 characters)"
                      value={newStaff.password} onChange={e=>setNewStaff(v=>({...v,password:e.target.value}))} className="border rounded-lg p-2"/>
                    <select aria-label="New staff role" value={newStaff.role} onChange={e=>setNewStaff(v=>({...v,role:e.target.value as StaffRoleName}))} className="border rounded-lg p-2">
                      {(identity.role==='super_admin' ? ['admin','order_manager','kitchen_manager','delivery_manager','delivery_man','accountant'] : ['order_manager','kitchen_manager','delivery_manager','delivery_man','accountant'] as StaffRoleName[]).map(role=>(
                        <option key={role} value={role}>{role.replaceAll('_',' ')}</option>
                      ))}
                    </select>
                    <button type="submit" disabled={creatingStaff} className="sm:col-span-2 rounded-xl bg-emerald-800 text-white font-semibold p-3 disabled:opacity-50">
                      {creatingStaff?'Creating…':'Create staff account'}
                    </button>
                    <p className="text-xs sm:col-span-2 text-slate-500">Share the initial password (at least 8 characters) privately with the employee. Staff credentials are never emailed automatically.</p>
                  </form>
                </section>
              )}
              {(activeTab==='orders'||activeTab==='overview')&&(
                <section aria-label="Order queue" className="space-y-4">
                  {orderUpdateMessage&&<p role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 ring-1 ring-emerald-200 p-4 text-emerald-950 text-sm"><BadgeCheck size={17}/>{orderUpdateMessage}</p>}
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div><h4 className="text-lg font-black text-[#173b32]">{activeTab==='overview'?'Next actions':'Live order queue'}</h4>
                      <p className="text-sm text-slate-500">Showing your latest {orders.length} authorized orders. Updates stay visible in All orders.</p></div>
                    {activeTab==='overview'&&<button type="button" className="rounded-xl px-4 py-3 bg-[#1b493d] text-white text-sm font-bold flex items-center gap-2"
                      onClick={()=>{setActiveTab('orders');setOrderFilter('all');}}>View all orders <ArrowRight size={15}/></button>}
                  </div>
                  <div className="rounded-2xl bg-white border border-slate-200 p-3 sm:p-4 space-y-3">
                    <div className="flex flex-wrap gap-2 items-center justify-between" aria-label="Filter orders">
                      <div className="flex flex-wrap gap-2">
                        {([{value:'actionable',label:'Needs my action'},{value:'active',label:'In progress'},{value:'completed',label:'Finished'},{value:'all',label:'All orders'}] as const).map(option=>(
                          <button type="button" key={option.value} aria-pressed={orderFilter===option.value} onClick={()=>setOrderFilter(option.value)}
                            className={'rounded-lg px-3 py-2.5 text-xs sm:text-sm font-bold '+(orderFilter===option.value?'bg-[#1b493d] text-white':'bg-slate-100 text-slate-700 hover:bg-slate-200')}>{option.label}</button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsPosSettingsOpen(true)}
                        className="rounded-lg border border-slate-300 bg-slate-100 hover:bg-slate-200 px-3 py-2 text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1.5 cursor-pointer ml-auto"
                        title="POS থার্মাল প্রিন্টার সাইজ ও সেটিংস পরিবর্তন করুন"
                      >
                        <Printer size={15} className="text-rose-600" />
                        <span>⚙️ POS প্রিন্টার</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsCollectionStatementOpen(true)}
                        className="rounded-lg bg-emerald-800 hover:bg-emerald-900 px-3 py-2 text-xs sm:text-sm font-bold text-white flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                        title="তারিখ অনুযায়ী বিক্রয় ও কালেকশন স্টেটমেন্ট এবং প্রিন্ট রিপোর্ট দেখুন"
                      >
                        <FileText size={15} className="text-amber-300" />
                        <span>📊 কালেকশন স্টেটমেন্ট</span>
                      </button>

                      {identity && ['super_admin', 'admin', 'order_manager'].includes(identity.role) && (
                        <button
                          type="button"
                          onClick={() => setIsCreateOrderModalOpen(true)}
                          className="rounded-lg bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-700 hover:to-amber-700 px-3.5 py-2 text-xs sm:text-sm font-bold text-white flex items-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95"
                          title="সরাসরি নতুন অর্ডার তৈরি করুন (স্বয়ংক্রিয়ভাবে কনফার্ম হবে)"
                        >
                          <CheckCircle size={15} />
                          <span>+ নতুন অর্ডার তৈরি</span>
                        </button>
                      )}
                    </div>
                    <label className="flex gap-2 items-center rounded-xl border bg-slate-50 px-3 py-2" aria-label="Search orders">
                      <Search size={18} className="text-slate-400"/>
                      <input type="search" value={orderSearch} onChange={e=>setOrderSearch(e.target.value)}
                        className="w-full bg-transparent py-1 outline-none text-sm" placeholder="Search order, customer, phone or rider"/>
                    </label>
                  </div>
                  {activeTab==='orders'&&['super_admin','admin','order_manager','delivery_manager'].includes(identity.role)&&(
                    <section className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3" aria-label="Customer Master Lookup">
                      <h4 className="font-bold text-emerald-950">Customer Master · Phone Lookup</h4>
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
                        {customerLookupResult.unverified&&<p role="status" className="sm:col-span-2 rounded-lg bg-amber-50 border border-amber-200 p-2 text-amber-900 font-semibold">Unverified phone submission. Confirm customer details directly before acting.</p>}
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
                  const next = ['super_admin','admin'].includes(identity.role)&&order.status==='ready'?{operation:'start_delivery' as StaffOperation,label:'নিজেই delivery শুরু করুন'}:actionForStatus[order.status] || null;
                  const canCancel = canOperate(identity.role, 'cancel') && ['pending','confirmed','preparing','ready','assigned'].includes(order.status);
                  const shortNum = formatShortOrderNumber(order.order_number);
                  return <article key={order.id} onClick={()=>{setUnreadOrderAlerts([]);acknowledgeOrderAlert();}} className="bg-white rounded-3xl border border-slate-200 hover:border-slate-300 p-4 sm:p-5 space-y-4 transition-all shadow-xs hover:shadow-md">
                    {/* Top Header Bar: 4-digit order number, status, slot, and total price */}
                    <div className="flex flex-wrap justify-between items-start gap-3 border-b border-slate-100 pb-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="shrink-0 h-11 w-11 rounded-2xl bg-slate-100 text-slate-700 grid place-items-center shadow-2xs font-black">
                          <PackageCheck size={22} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1 bg-slate-900 text-white font-mono font-black text-base sm:text-lg px-3 py-1 rounded-xl shadow-xs tracking-wider border border-slate-800" title={`পুরো অর্ডার আইডি: #${formatShortOrderNumber(order.order_number)}`}>
                              <span className="text-amber-400">#</span>{shortNum}
                            </span>
                            <span className={'rounded-full px-3 py-1 text-xs font-black ring-1 uppercase tracking-wide '+stageClass(order.status)}>
                              {stageNames[order.status] || order.status.replaceAll('_', ' ')}
                            </span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs sm:text-sm font-semibold text-slate-700">
                            <span className="flex items-center gap-1.5 text-slate-700 font-semibold">
                              <Clock3 size={13} className="shrink-0 text-slate-500" />
                              <span>{order.delivery_date || 'তারিখ নির্ধারিত নেই'}</span>
                              <span>·</span>
                              <span className="text-slate-900 font-bold">{order.delivery_slot || 'যেকোনো সময়'}</span>
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono" title={formatShortOrderNumber(order.order_number)}>
                              
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-1">
                        <span className="text-xl sm:text-2xl font-black text-slate-900 font-mono">
                          ৳{Number(order.total_amount || 0).toLocaleString()}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                            {order.payment_method === 'cod' ? '💵 ক্যাশ অন ডেলিভারি (COD)' : `💳 ${order.payment_method?.toUpperCase() || 'অনলাইন'}`}
                          </span>
                          {order.payment_status === 'paid' ? (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
                              পরিশোধিত
                            </span>
                          ) : (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900">
                              বকেয়া
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Customer & Delivery Address Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50/90 p-4 rounded-2xl border border-slate-200">
                      {/* Customer Info */}
                      <div className="space-y-2">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                          <User size={13} className="text-slate-600" />
                          <span>গ্রাহকের তথ্য</span>
                        </div>
                        <div className="text-base font-black text-slate-900">
                          {order.customer_name || 'গ্রাহকের নাম নেই'}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                          {order.customer_phone ? (
                            <a 
                              href={`tel:${order.customer_phone}`}
                              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-900 border border-slate-300 text-xs font-bold transition-all shadow-2xs group cursor-pointer"
                              title="গ্রাহককে সরাসরি কল করুন"
                            >
                              <Phone size={13} className="text-emerald-700" />
                              <span className="font-mono font-bold text-slate-900 text-xs">{order.customer_phone}</span>
                              <span className="text-[10px] bg-emerald-700 text-white font-bold px-1.5 py-0.5 rounded-md">কল দিন</span>
                            </a>
                          ) : (
                            <span className="text-xs text-slate-400">ফোন নম্বর নেই</span>
                          )}
                        </div>
                        {order.rider_name && (
                          <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5 pt-1">
                            <Truck size={14} className="text-slate-600 shrink-0" />
                            <span>ডেলিভারি রাইডার: <strong className="text-slate-900">{order.rider_name}</strong></span>
                          </div>
                        )}
                      </div>

                      {/* Delivery Address Box */}
                      <div className="space-y-2 md:border-l md:border-slate-200 md:pl-4">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                          <MapPin size={13} className="text-rose-600" />
                          <span>ডেলিভারি ঠিকানা ও এলাকা</span>
                        </div>
                        <p className="text-xs font-semibold text-slate-800 leading-snug break-words">
                          {order.delivery_address || 'ঠিকানা দেওয়া নেই'}
                          {order.delivery_zone?.name && (
                            <span className="ml-1.5 inline-block text-[10px] font-bold text-slate-800 bg-white border border-slate-300 px-2 py-0.5 rounded-md">
                              {order.delivery_zone.name}
                            </span>
                          )}
                        </p>
                        {order.delivery_address && (
                          <div className="pt-0.5">
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.delivery_address)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 underline underline-offset-2"
                            >
                              <span>📍 গুগল ম্যাপে ঠিকানা দেখুন (Directions)</span>
                              <ArrowRight size={12} />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Advance & Due Breakdown (if partial advance paid) */}
                    {order.advance_paid_amount && order.advance_paid_amount > 0 ? (
                      <div className="bg-emerald-50 text-emerald-950 p-2.5 rounded-xl border border-emerald-200 text-xs flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-emerald-900">
                          অগ্রিম পেইড: <strong>৳{order.advance_paid_amount}</strong> {order.bkash_trx_id ? `(TrxID: ${order.bkash_trx_id})` : ''}
                        </span>
                        <span className="font-black text-rose-700 font-mono">
                          বাকি ক্যাশ (Due COD): ৳{order.due_amount ?? (order.total_amount - order.advance_paid_amount)}
                        </span>
                      </div>
                    ) : null}

                    {/* Ordered Cake & Kitchen Specs (Directly Visible!) */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2.5">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <div className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                          <CakeSlice size={15} className="text-rose-600" />
                          <span>কেক ও অর্ডারকৃত আইটেম ({(order.items || []).length} টি)</span>
                        </div>
                        <span className="text-xs font-bold text-slate-500">
                          সর্বমোট: <strong className="text-slate-900 font-black font-mono">৳{Number(order.total_amount || 0).toLocaleString()}</strong>
                        </span>
                      </div>

                      <div className="divide-y divide-slate-100">
                        {(order.items || []).map((item, idx) => (
                          <div key={item.id || idx} className="py-2.5 first:pt-1 last:pb-1 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-sm font-extrabold text-slate-900 flex flex-wrap items-center gap-1.5">
                                <span className="inline-flex items-center justify-center bg-slate-900 text-white font-black text-xs px-2 py-0.5 rounded-md">
                                  {item.quantity}×
                                </span>
                                <span className="text-slate-900 font-black">{item.product_name}</span>
                                <span className="text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                                  {item.variant_name}
                                </span>
                                {item.flavor_name && (
                                  <span className="text-xs font-bold text-amber-950 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                                    ফ্লেভার: {item.flavor_name}
                                  </span>
                                )}
                              </div>
                              <span className="text-xs font-black text-slate-900 shrink-0 font-mono">
                                ৳{item.subtotal || item.unit_price * item.quantity}
                              </span>
                            </div>

                            {/* Dedication Writing Message - Highlighted Amber Callout */}
                            {item.writing_message && (
                              <div className="bg-amber-50 border border-amber-300 rounded-xl px-3 py-2 text-xs text-amber-950 flex items-start gap-2 shadow-2xs">
                                <span className="text-base shrink-0">✍️</span>
                                <div>
                                  <span className="font-black text-amber-900">কেকের ওপর লেখার টেক্সট:</span>{' '}
                                  <span className="font-extrabold text-sm text-amber-950 bg-amber-100 px-2.5 py-0.5 rounded-md border border-amber-300 inline-block mt-0.5 font-serif italic">
                                    "{item.writing_message}"
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* Addons if any */}
                            {item.addons && item.addons.length > 0 && (
                              <div className="text-xs text-slate-600 pl-3 flex flex-wrap gap-1.5 items-center">
                                <span className="font-bold text-slate-500">যুক্ত করা আইটেম:</span>
                                {item.addons.map((ad, aIdx) => (
                                  <span key={aIdx} className="bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded text-[11px] font-medium">
                                    {ad.addon_name} (৳{ad.subtotal})
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Customer Note if present */}
                      {order.order_note && (
                        <div className="bg-sky-50 border border-sky-200 rounded-xl px-3 py-2 text-xs text-sky-950 flex items-start gap-2 mt-1">
                          <span className="text-sm shrink-0">📝</span>
                          <div>
                            <span className="font-black text-sky-900">কাস্টমার স্পেশাল নির্দেশ/নোট:</span>{' '}
                            <span className="font-semibold text-sky-950">"{order.order_note}"</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Order Journey Pipeline */}
                    {order.status !== 'cancelled' && (
                      <div className="space-y-1.5 pt-0.5" aria-label={`Delivery progress: ${stageNames[order.status] || order.status}`}>
                        <div className="flex gap-1.5">
                          {pipeline.map((stage, index) => (
                            <span
                              key={stage}
                              title={stageNames[stage]}
                              aria-hidden="true"
                              className={'h-2 flex-1 rounded-full transition-all ' + (index <= pipeline.indexOf(order.status) ? 'bg-emerald-600 shadow-2xs' : 'bg-slate-200')}
                            />
                          ))}
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-600 font-medium">
                          <span>অর্ডার অগ্রগতি: <strong className="text-slate-900 font-bold">{stageNames[order.status] || order.status}</strong></span>
                          {order.cod_collected && <span className="text-emerald-700 font-bold">✓ ক্যাশ টাকা রিসিভড</span>}
                        </div>
                      </div>
                    )}

                    {/* Action Buttons Toolbar */}
                    {['super_admin','admin','order_manager','delivery_manager'].includes(identity.role)&&<CustomerOrderLink endpoint={endpoint} token={identity.token} orderId={order.id} initialUrl={order.customer_share_url}/>}
                    <div className="flex flex-wrap gap-2.5 items-center pt-2 border-t border-slate-100">
                      {/* Workflow action button */}
                      {next && canOperate(identity.role, next.operation) && next.operation !== 'deliver' && (
                        <>
                          {next.operation === 'assign' && (
                            <select
                              aria-label="Assign registered rider"
                              value={riderEmail}
                              onChange={e => setRiderEmail(e.target.value)}
                              className="min-h-10 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold bg-white text-slate-800"
                            >
                              {identity.riders.map(rider => (
                                <option key={rider.email} value={rider.email}>{rider.name} — {rider.email}</option>
                              ))}
                            </select>
                          )}
                          <button
                            type="button"
                            disabled={!!busyOrderId}
                            onClick={() => void mutate(order, next.operation)}
                            className="min-h-10 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 text-xs font-bold disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                          >
                            <PackageCheck size={16} />
                            <span>{busyOrderId === order.id ? 'সেভ হচ্ছে...' : next.label}</span>
                          </button>
                        </>
                      )}

                      {/* Delivery Complete with Cash Verification (Direct delivery allowed from assigned, picked_up, or out_for_delivery) */}
                      {['assigned', 'picked_up', 'out_for_delivery'].includes(order.status) && canOperate(identity.role, 'deliver') && (
                        deliveryConfirmOrderId === order.id ? (
                          <div className="flex flex-wrap items-center gap-2.5 bg-emerald-50/80 p-2 rounded-xl border border-emerald-200">
                            {order.payment_method === 'cod' ? (
                              <label className="text-xs font-bold text-slate-800 flex items-center gap-2 cursor-pointer bg-white px-3 py-2 rounded-xl border border-amber-300">
                                <input
                                  type="checkbox"
                                  checked={cashCollected}
                                  onChange={e => setCashCollected(e.target.checked)}
                                  className="w-4 h-4 rounded text-emerald-600"
                                />
                                <span>ক্যাশ টাকা বুঝে পেয়েছি (৳{order.total_amount})</span>
                              </label>
                            ) : (
                              <span className="text-xs text-emerald-800 bg-white px-3 py-2 rounded-xl border border-emerald-200 font-bold">
                                ✓ অগ্রিম পরিশোধিত
                              </span>
                            )}
                            <button
                              type="button"
                              disabled={!!busyOrderId || (order.payment_method === 'cod' && !cashCollected)}
                              onClick={() => void mutate(order, 'deliver')}
                              className="min-h-10 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl px-4 py-2 text-xs disabled:opacity-50 cursor-pointer shadow-xs flex items-center gap-1.5"
                            >
                              <CheckCircle size={15} />
                              <span>{busyOrderId === order.id ? 'সেভ হচ্ছে...' : 'Confirm Delivery (ডেলিভারি সম্পন্ন)'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeliveryConfirmOrderId('')}
                              className="text-xs font-semibold text-slate-500 hover:text-slate-700 px-2 py-1"
                            >
                              বাতিল
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setDeliveryConfirmOrderId(order.id);  setCashCollected(order.payment_method !== 'cod'); }}
                            className="min-h-10 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl px-4 py-2 text-xs cursor-pointer shadow-xs flex items-center gap-1.5 transition-colors"
                            title="ক্যাশ বুঝে নিয়ে তাৎক্ষণিক ডেলিভারি সম্পন্ন করুন"
                          >
                            <CheckCircle size={15} />
                            <span>{order.status === 'out_for_delivery' ? 'Complete Delivery (ক্যাশ চেক ও ডেলিভারি)' : 'ডেলিভারি সম্পন্ন (Deliver)'}</span>
                          </button>
                        )
                      )}

                      {['super_admin', 'admin'].includes(identity.role) && order.legacy_receipt_missing && order.status === 'out_for_delivery' && (
                        <button
                          type="button"
                          disabled={!!busyOrderId}
                          onClick={() => void recoverLegacy(order)}
                          className="min-h-10 rounded-xl border border-amber-400 bg-amber-50 text-amber-900 px-3.5 py-2 text-xs font-bold disabled:opacity-50"
                        >
                          Recover old customer receipt access
                        </button>
                      )}

                      {/* View Order Details & POS Print Popup */}
                      <button
                        type="button"
                        onClick={() => setSelectedOrderForDetails(order)}
                        className="min-h-10 rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs active:scale-95"
                        title="অর্ডারের সম্পূর্ণ বিবরণ ও POS প্রিন্ট অপশন দেখুন"
                      >
                        <Eye size={15} />
                        <span>অর্ডার বিবরণ ও প্রিন্ট</span>
                      </button>

                      {/* POS Thermal Slip & Sticker Print */}
                      <button
                        type="button"
                        onClick={() => setSelectedOrderForPosPrint(order)}
                        className="min-h-10 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 px-4 py-2 text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                        title="পিওএস ক্যাশ মেমো, কিচেন স্লিপ বা বক্স স্টিকার প্রিন্ট করুন"
                      >
                        <Printer size={15} className="text-slate-600" />
                        <span>POS প্রিন্ট</span>
                      </button>

                      {/* SINGLE Cancel Order Button (No duplicate!) */}
                      {canCancel && (
                        <button
                          type="button"
                          disabled={!!busyOrderId}
                          onClick={() => void mutate(order, 'cancel')}
                          className="min-h-10 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-700 px-3.5 py-2 text-xs font-bold disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          Cancel Order (বাতিল)
                        </button>
                      )}

                      {/* Reopen Order Button for Super Admin & Admin */}
                      {['super_admin', 'admin'].includes(identity.role) && order.status === 'cancelled' && (
                        <button
                          type="button"
                          disabled={!!busyOrderId}
                          onClick={() => void mutate(order, 'confirm')}
                          className="min-h-10 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 px-4 py-2 text-xs font-bold disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          Reopen Order (পুনরায় চালু)
                        </button>
                      )}

                      {legacyKey?.orderId === order.id && (
                        <div className="w-full rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2 mt-2" role="status">
                          <strong className="block text-xs font-bold text-amber-950">Private recovery key — show only to the verified customer</strong>
                          <p className="text-[11px] text-amber-900">Ask the customer to paste this under Track Order → Restore older receipt access.</p>
                          <input
                            readOnly
                            aria-label="Customer receipt recovery key"
                            value={legacyKey.key}
                            onFocus={e => e.currentTarget.select()}
                            className="w-full rounded-lg border p-2 text-xs font-mono bg-white"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => { void navigator.clipboard?.writeText(legacyKey.key).catch(() => setError('Select and copy the key manually.')); }}
                              className="rounded-lg border bg-white px-3 py-1.5 text-xs font-bold"
                            >
                              Copy private key
                            </button>
                            <button
                              type="button"
                              onClick={() => setLegacyKey(null)}
                              className="rounded-lg px-3 py-1.5 text-xs underline text-slate-600"
                            >
                              Dismiss key
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </article>;
                })}
                  </div>
                </section>
              )}
              <React.Suspense fallback={<div className="rounded-2xl bg-white border p-8 text-center text-slate-500" role="status">Opening your workspace…</div>}>
                {activeTab==='cakes'&&(['super_admin','admin','order_manager'] as string[]).includes(identity.role) && <CustomCakeQueue endpoint={endpoint} token={identity.token} />}
                {activeTab==='costing'&&(['super_admin','admin','order_manager','accountant'] as string[]).includes(identity.role) && <ItemCostingManager products={mockDb.getProductsSync()} orders={orders} endpoint={endpoint} token={identity.token} onProductCostingUpdated={() => onCatalogUpdated?.()} />}
                {activeTab==='website'&&(identity.role === 'super_admin' || identity.role === 'admin') && <WebsiteManager endpoint={endpoint} token={identity.token}
                  role={identity.role} onUpdated={() => onCatalogUpdated?.()} />}
              </React.Suspense>
              </div>
            </div>
          )}

        </div>
      </section>
      {/* Order Details & POS Print Popup Modal */}
      {selectedOrderForDetails && (
        <OrderDetailsModal
          isOpen={!!selectedOrderForDetails}
          order={selectedOrderForDetails as Order}
          onClose={() => setSelectedOrderForDetails(null)}
          currency={mockDb.getShopSettingsSync().currency}
          shopName={mockDb.getShopSettingsSync().shop_name}
          shopPhone={mockDb.getShopSettingsSync().phone}
          shopAddress={mockDb.getShopSettingsSync().address}
          websiteUrl={mockDb.getShopSettingsSync().website_url}
          facebookUrl={mockDb.getShopSettingsSync().facebook_url}
          userRole={identity?.role || 'staff'}
          endpoint={endpoint}
          onOrderUpdated={(updatedOrder) => {
            setSelectedOrderForDetails({ ...updatedOrder });
          }}
          onStatusChange={(orderId, newStatus) => {
            const op =
              newStatus === 'confirmed'
                ? 'confirm'
                : newStatus === 'preparing'
                ? 'start_baking'
                : newStatus === 'ready'
                ? 'mark_ready'
                : newStatus === 'out_for_delivery'
                ? 'start_delivery'
                : newStatus === 'delivered'
                ? 'deliver'
                : 'cancel';
            const ord = orders.find((o) => o.id === orderId);
            if (ord) void mutate(ord, op);
          }}
          onTriggerPosPrint={(ord) => {
            setSelectedOrderForDetails(null);
            setSelectedOrderForPosPrint(ord);
          }}
        />
      )}

      {/* POS Thermal Slip & Sticker Print Modal */}
      {selectedOrderForPosPrint && (
        <PosPrintModal
          order={selectedOrderForPosPrint as Order}
          onClose={() => setSelectedOrderForPosPrint(null)}
          currency={mockDb.getShopSettingsSync().currency}
          shopName={mockDb.getShopSettingsSync().shop_name}
          shopPhone={mockDb.getShopSettingsSync().phone}
          shopAddress={mockDb.getShopSettingsSync().address}
          websiteUrl={mockDb.getShopSettingsSync().website_url}
          facebookUrl={mockDb.getShopSettingsSync().facebook_url}
        />
      )}

      {/* POS Printer Hardware Settings Modal */}
      {isPosSettingsOpen && (
        <PosPrinterSettingsModal
          isOpen={isPosSettingsOpen}
          onClose={() => setIsPosSettingsOpen(false)}
          onTestPrint={() => {
            setIsPosSettingsOpen(false);
            setSelectedOrderForPosPrint(createDemoReceiptOrder('৳'));
          }}
        />
      )}

      {/* Date-wise Collection Statement Modal */}
      {isCollectionStatementOpen && (
        <CollectionStatementModal
          isOpen={isCollectionStatementOpen}
          onClose={() => setIsCollectionStatementOpen(false)}
          orders={orders}
        />
      )}

      {/* Admin / Staff Direct Create Order Modal (Auto-Confirmed) */}
      {isCreateOrderModalOpen && identity && (
        <AdminCreateOrderModal
          isOpen={isCreateOrderModalOpen}
          onClose={() => setIsCreateOrderModalOpen(false)}
          products={mockDb.getProductsSync()}
          zones={mockDb.getDeliveryZones()}
          slots={mockDb.getDeliverySlots()}
          flavors={mockDb.getFlavors()}
          addons={mockDb.getAddons()}
          coupons={mockDb.getCoupons()}
          currency={mockDb.getShopSettingsSync().currency}
          role={identity.role as any}
          endpoint={endpoint}
          staffIdentity={identity.email}
          onCatalogUpdated={onCatalogUpdated}
          onOrderCreated={(order) => {
            acknowledgeOrderAlert(order.id);
            void refresh();
          }}
        />
      )}
    </div>
  );
};
