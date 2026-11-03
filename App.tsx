/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Navbar, ViewMode } from './components/Navbar';
import { ArrowRight } from 'lucide-react';
import { CustomerStorefront } from './components/CustomerStorefront';
const MobileAppExperience = lazy(() => import('./components/MobileAppExperience').then(m => ({default: m.MobileAppExperience})));
const ProductDetailModal = lazy(() => import('./components/ProductDetailModal').then(m=>({default:m.ProductDetailModal})));
const CartDrawer = lazy(() => import('./components/CartDrawer').then(m=>({default:m.CartDrawer})));
const CheckoutModal = lazy(() => import('./components/CheckoutModal').then(m=>({default:m.CheckoutModal})));
const OrderTrackingModal = lazy(() => import('./components/OrderTrackingModal').then(m=>({default:m.OrderTrackingModal})));
import { KitchenDisplay } from './components/KitchenDisplay';
import { DeliveryRiderPortal } from './components/DeliveryRiderPortal';
const AdminPanel = lazy(() => import('./components/AdminPanel').then(m => ({default: m.AdminPanel})));
const StaffPortal = lazy(() => import('./components/StaffPortal').then(m => ({default: m.StaffPortal})));
const CustomerAccountPortal = lazy(() => import('./components/CustomerAccountPortal').then(m => ({default: m.CustomerAccountPortal})));
const CachePerformanceHub = lazy(() => import('./components/CachePerformanceHub').then(m=>({default:m.CachePerformanceHub})));
const DatabaseSchemaViewer = lazy(() => import('./components/DatabaseSchemaViewer').then(m=>({default:m.DatabaseSchemaViewer})));
const SupabaseSyncModal = lazy(() => import('./components/SupabaseSyncModal').then(m=>({default:m.SupabaseSyncModal})));
const CustomCakeModal = lazy(() => import('./components/CustomCakeModal').then(m=>({default:m.CustomCakeModal})));
const CustomerProfileModal = lazy(() => import('./components/CustomerProfileModal').then(m=>({default:m.CustomerProfileModal})));
import { mockDb } from './services/mockDatabase';
import { submitSheetReview } from './services/sheetReviews';
import { loadBackendDatabaseStatus, unknownBackendDatabaseStatus } from './services/backendDatabaseStatus';
import { useGoogleSheetContent } from './hooks/useGoogleSheetContent';
const SheetContentPanel = lazy(() => import('./components/SheetContentPanel').then(m=>({default:m.SheetContentPanel})));
import { loadConfirmedSheetOrders, rememberConfirmedSheetOrder, removeConfirmedSheetOrdersById } from './services/googleSheetOrders';
import { fetchCustomerOrderStatus, redeemLegacyReceiptAccess } from './services/sheetStaffApi';
import { isConfirmedDeletedSheetOrder, verifyStoredOrderHistory } from './services/sheetOrderHistorySync';
import { syncPhoneCustomerConfirmedOrder } from './services/phoneCustomerApi';
import { getBrowserWorkspaceStorage, isStaffWorkspaceOpen, setStaffWorkspaceOpen } from './services/staffWorkspaceSession';
import { reconcilePublicCart, reorderFromPublicOrder } from './services/reconcilePublicCart';
import { inspectPendingCheckout, loadCheckoutCart, saveCheckoutCart, settleCheckoutCart } from './services/checkoutRecovery';
import type { CheckoutCompletion } from './services/checkoutRecovery';
import { shopErrorMessage } from './utils/shopErrorMessage';
import { 
  ShopSettings, 
  Product, 
  Category, 
  Flavor, 
  ProductAddon, 
  Banner, 
  DeliveryZone, 
  DeliverySlot, 
  Order, 
  Coupon, 
  Review, 
  CustomCakeRequest, 
  AuditLog, 
  StaffRole, 
  CartItem 
} from './types';
import { Home, ShoppingBag, Clock, Sparkles, Cake, User } from 'lucide-react';

export default function App() {
  const sheetContent = useGoogleSheetContent();
  const publicData = sheetContent.data;
  const [isSheetContentOpen, setIsSheetContentOpen] = useState(false);
  const staffPage = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('staff') === '1';
  const [isStaffPortalOpen, setIsStaffPortalOpen] = useState(() => staffPage || isStaffWorkspaceOpen(getBrowserWorkspaceStorage()));
  const openStaffPortal = () => { setStaffWorkspaceOpen(getBrowserWorkspaceStorage(),true); setIsStaffPortalOpen(true); };
  const closeStaffPortal = () => { setStaffWorkspaceOpen(getBrowserWorkspaceStorage(),false); setIsStaffPortalOpen(false); };
  const [isCustomerAccountOpen, setIsCustomerAccountOpen] = useState(false);
  const [customerGoogleToken, setCustomerGoogleToken] = useState('');
  const [restoredSessionOrderIds, setRestoredSessionOrderIds] = useState<string[]>([]);
  const [historySyncVersion, setHistorySyncVersion] = useState(0);
  const [historySyncing, setHistorySyncing] = useState(false);
  // Dual Experience: Responsive Website vs Mobile App
  const [viewMode, setViewMode] = useState<ViewMode>('web');

  // Active Role / Persona (Web View)
  const [activeRole, setActiveRole] = useState<StaffRole | 'customer'>('customer');

  // Database mode is reported by the production backend, not browser credentials.
  const [databaseStatus, setDatabaseStatus] = useState(unknownBackendDatabaseStatus);
  const [databaseStatusLoading, setDatabaseStatusLoading] = useState(true);
  const [databaseStatusRefresh, setDatabaseStatusRefresh] = useState(0);
  const isSupabaseConnected = databaseStatus.available && databaseStatus.backend === 'supabase';

  // Public website content comes from the validated Sheet snapshot.
  const [settings, setSettings] = useState<ShopSettings>(publicData.settings);

  const [products, setProducts] = useState<Product[]>(publicData.products);
  const [categories, setCategories] = useState<Category[]>(publicData.categories);
  const [flavors, setFlavors] = useState<Flavor[]>(publicData.flavors);
  const [addons, setAddons] = useState<ProductAddon[]>(publicData.addons);
  const [banners, setBanners] = useState<Banner[]>(publicData.banners);
  const [zones, setZones] = useState<DeliveryZone[]>(publicData.zones);
  const [slots, setSlots] = useState<DeliverySlot[]>(publicData.slots);
  const [orders, setOrders] = useState<Order[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>(publicData.coupons);
  const [reviews, setReviews] = useState<Review[]>(publicData.reviews);
  const [customCakes, setCustomCakes] = useState<CustomCakeRequest[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Cart State
  const [cartItems, setCartItems] = useState<CartItem[]>(() => loadCheckoutCart());

  const cartRef = useRef(cartItems);
  const [cartNotice, setCartNotice] = useState('');
  const [profileSyncFailure,setProfileSyncFailure]=useState<{order:Order;endpoint:string;message:string;mode:'profile'|'link'}|null>(null);
  const [profileSyncHint,setProfileSyncHint]=useState(false);
  const [profileSyncBusy,setProfileSyncBusy]=useState(false);
  const profileSyncVersion=useRef(0);
  useEffect(() => { cartRef.current = cartItems; }, [cartItems]);

  // Modals & Navigation
  const [selectedProductForDetail, setSelectedProductForDetail] = useState<Product | null>(null);
  useEffect(()=>{
    const title = publicData.settings.website_title || publicData.settings.shop_name;
    document.title = selectedProductForDetail ? selectedProductForDetail.name+' · '+publicData.settings.shop_name : title;
    const canonical = document.querySelector<HTMLLinkElement>('link[rel=canonical]');
    if (canonical) {
      const url = new URL(canonical.href);
      const pathname = window.location.pathname || '/';
      url.pathname = /^\/cake\/[a-z0-9-]+\/?$/.test(pathname) ? pathname : '/';
      canonical.href = url.href;
    }
  },[publicData.settings,selectedProductForDetail]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  // A checkout keeps its original live target across catalog refreshes and close/reopen.
  // Only a confirmed receipt ends the session and releases an uncertain order reference.
  const [checkoutSession, setCheckoutSession] = useState<{ endpoint: string } | null>(() => {
    const recovery = inspectPendingCheckout(sheetContent.endpoint);
    return recovery.status === 'ready' ? { endpoint: recovery.pending.attempt.endpoint } : null;
  });
  const [isTrackOrderOpen, setIsTrackOrderOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isCustomCakeOpen, setIsCustomCakeOpen] = useState(false);
  const [isCacheHubOpen, setIsCacheHubOpen] = useState(false);
  const [isDbViewerOpen, setIsDbViewerOpen] = useState(false);
  const [isSupabaseSyncOpen, setIsSupabaseSyncOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [latestOrderId, setLatestOrderId] = useState<string | undefined>(undefined);
  const [trackingRefreshKey,setTrackingRefreshKey]=useState(0);
  const [trackingSyncing,setTrackingSyncing]=useState(false);
  const [trackingSyncError,setTrackingSyncError]=useState('');
  const [trackingCheckedAt,setTrackingCheckedAt]=useState('');

  // Sync cart to localStorage
  useEffect(() => {
    try {
      saveCheckoutCart(cartItems);
    } catch {
      // Storage unavailable
    }
  }, [cartItems]);

  useEffect(() => {
    const syncBag = (event: StorageEvent) => {
      if (event.key !== 'cake_cart_items_v1' && event.key !== null) return;
      const next = loadCheckoutCart(); cartRef.current = next; setCartItems(next);
      setCartNotice('Your bag was updated in another tab. Please review the remaining cakes.');
    };
    window.addEventListener('storage', syncBag);
    return () => window.removeEventListener('storage', syncBag);
  }, []);

  // Public reads never include orders. Confirmed private Sheet receipts are cached on this device.
  const refreshData = async () => {
    const sheetOrders = loadConfirmedSheetOrders();
    const orderMap = new Map<string, Order>();
    sheetOrders.forEach(o => orderMap.set(o.id, o));
    setOrders(Array.from(orderMap.values()));
    setCustomCakes(mockDb.getCustomCakes());
    setAuditLogs(mockDb.getAuditLogs());
  };

  useEffect(() => {
    mockDb.applyPublicSnapshot(publicData, { authoritative: true });
    const reconciled = reconcilePublicCart(cartRef.current, publicData);
    cartRef.current = reconciled.items;
    setCartItems(reconciled.items);
    if (reconciled.changed) setCartNotice('Your cake bag was updated to match the latest prices and available options. Please review it before checkout.');
    
    // Public business data is authoritative in Sheets, including empty tables.
    // Local Studio edits must never create products or prices on the live shop.
    const effectiveSettings = publicData.settings;
    const effectiveProducts = publicData.products;

    const cakeSlug = (window.location.pathname || '/').match(/^\/cake\/([a-z0-9-]+)\/?$/)?.[1];
    setSelectedProductForDetail(previous => effectiveProducts.find(product =>
      product.is_active && (previous ? product.id === previous.id : !!cakeSlug && product.slug === cakeSlug)) ?? null);
    setSettings(effectiveSettings);
    setProducts(effectiveProducts);
    setCategories(publicData.categories);
    setFlavors(publicData.flavors);
    setAddons(publicData.addons);
    setBanners(publicData.banners);
    setZones(publicData.zones);
    setSlots(publicData.slots);
    setCoupons(publicData.coupons);
    setReviews(publicData.reviews);
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (icon) icon.href = effectiveSettings.logo_url || '/favicon.svg';
    for (const [selector, value] of [
      ['meta[name="description"]', effectiveSettings.website_description],
      ['meta[property="og:title"]', effectiveSettings.website_title || effectiveSettings.shop_name],
      ['meta[property="og:description"]', effectiveSettings.website_description],
    ]) document.querySelector(selector)?.setAttribute('content', value || '');
  }, [publicData]);

  useEffect(() => {
    refreshData();

    // Listen to local mockDb changes
    const unsubDb = mockDb.subscribe(() => {
      refreshData();
    });

    return () => {
      unsubDb();
    };
  }, []);

  // StaffPortal owns its authenticated live queue. Never copy all staff orders
  // into the customer's receipt history or run a second competing poller.

  useEffect(() => {
    const controller = new AbortController();
    setDatabaseStatusLoading(true);
    void loadBackendDatabaseStatus({ signal: controller.signal }).then(status => {
      if (!controller.signal.aborted) {
        setDatabaseStatus(status);
        setDatabaseStatusLoading(false);
      }
    });
    return () => controller.abort();
  }, [databaseStatusRefresh]);

  // Cart operations
  const handleAddToCart = (item: CartItem) => {
    setCartItems((prev) => [item, ...prev]);
  };

  const handleAddReview = async (newReview: Omit<Review, 'id' | 'status' | 'created_at'>) => {
    await submitSheetReview(sheetContent.endpoint,newReview);
    await sheetContent.refresh(true);
  };

  const selectCake = (product: Product | null) => {
    if (product && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.slug)) {
      window.history?.replaceState(null, '', '/cake/'+product.slug);
    } else if (!product && window.location.pathname?.startsWith('/cake/')) {
      window.history?.replaceState(null, '', '/');
    }
    setSelectedProductForDetail(product);
  };

  const handleOrderNow = (item: CartItem) => {
    setCartItems((prev) => [item, ...prev]);
    selectCake(null);
    if (checkoutSession) {
      setIsCartOpen(false);
      setIsCheckoutOpen(true);
      return;
    }
    const recovery = inspectPendingCheckout(sheetContent.endpoint);
    if (recovery.status === 'blocked') {
      setCartNotice(recovery.message);
      setIsCartOpen(true);
      return;
    }
    const targetEndpoint = recovery.status === 'ready' ? recovery.pending.attempt.endpoint : sheetContent.endpoint;
    if (targetEndpoint) {
      setCheckoutSession({ endpoint: targetEndpoint });
      setCartNotice('');
      setIsCartOpen(false);
      setIsCheckoutOpen(true);
    } else {
      setIsCartOpen(true);
    }
  };

  const handleUpdateCartQuantity = (cartItemId: string, newQty: number) => {
    if (newQty <= 0) {
      setCartItems((prev) => prev.filter((i) => i.cart_item_id !== cartItemId));
    } else {
      setCartItems((prev) =>
        prev.map((i) =>
          i.cart_item_id === cartItemId
            ? { ...i, quantity: newQty, total_price: i.unit_price * newQty }
            : i
        )
      );
    }
  };

  const handleRemoveCartItem = (cartItemId: string) => {
    setCartItems((prev) => prev.filter((i) => i.cart_item_id !== cartItemId));
  };

  const syncCustomerDeliveryProfile = async (order:Order,endpoint:string,mode:'profile'|'link') => {
    const attempt=++profileSyncVersion.current;
    let token='';try{token=sessionStorage.getItem('aurora_customer_phone_session_v1')||'';}catch{}
    if(!token){
      setProfileSyncBusy(false);
      setProfileSyncFailure({order,endpoint,mode,message:'Sign in to the same customer account, then retry saving these delivery details.'});
      return;
    }
    setProfileSyncBusy(true);
    try{
      const result=await syncPhoneCustomerConfirmedOrder(endpoint,token,order,mode==='profile');
      if(attempt===profileSyncVersion.current){setProfileSyncFailure(null);setProfileSyncHint(result==='linked_only');}
    }catch(error){
      if(attempt===profileSyncVersion.current)setProfileSyncFailure({order,endpoint,mode,
        message:shopErrorMessage(error,'Your delivery details could not be saved to your account.')});
    }finally{if(attempt===profileSyncVersion.current)setProfileSyncBusy(false);}
  };
  const openCheckout = () => {
    if (checkoutSession) {
      setIsCartOpen(false);
      setIsCheckoutOpen(true);
      return;
    }
    const recovery = inspectPendingCheckout(sheetContent.endpoint);
    if (recovery.status === 'blocked') {
      setCartNotice(recovery.message);
      setIsCartOpen(true);
      return;
    }
    if (recovery.status === 'ready') {
      setCheckoutSession({ endpoint: recovery.pending.attempt.endpoint });
      setIsCartOpen(false);
      setIsCheckoutOpen(true);
      return;
    }
    if (!cartItems.length || !publicData.order_submission_enabled || !settings.accepting_orders || !sheetContent.endpoint) {
      setCartNotice(!cartItems.length ? 'Add a cake to your bag before placing an order.' : 'Online ordering is temporarily paused. Your bag has been kept.');
      setIsCartOpen(true);
      return;
    }
    setCheckoutSession({ endpoint: sheetContent.endpoint });
    setCartNotice('');
    setIsCartOpen(false);
    setIsCheckoutOpen(true);
  };
  const handleOrderSuccess = (newOrder: Order, completion?: CheckoutCompletion) => {
    if (!completion) throw new Error('The original bag reference is missing. Keep this order reference and retry confirmation.');
    // Atomically persist both the remaining bag and this request's completion
    // marker before releasing its durable pending order reference.
    const remaining = settleCheckoutCart(cartRef.current, completion);
    cartRef.current = remaining;
    setCartItems(remaining);
    if (newOrder.persistence === 'google_sheets') {
      rememberConfirmedSheetOrder(newOrder);
      // Profile saving uses this committed receipt and the authenticated account.
      // A failure is retried independently; the confirmed COD order is untouched.
      let token='';try{token=sessionStorage.getItem('aurora_customer_phone_session_v1')||'';}catch{}
      if(token)void syncCustomerDeliveryProfile(newOrder,sheetContent.endpoint,publicData.customer_order_profile_sync_enabled?'profile':'link');
    }
    setOrders(previous => [newOrder, ...previous.filter(order => order.id !== newOrder.id)]);
    setCartNotice(remaining.length ? 'Your order is confirmed. Cakes added after that checkout are still in your bag.' : '');
    setIsCartOpen(false);
    setIsCheckoutOpen(false);
    setCheckoutSession(null);
    setLatestOrderId(newOrder.id);
    setIsTrackOrderOpen(true);
  };

  const restoreLegacyReceipt=async(order:Order,key:string)=>{
    const result=await redeemLegacyReceiptAccess(sheetContent.endpoint,order,key);
    const updated:Order={...order,customer_access_token:key.trim(),status:result.status,
      updated_at:result.updated_at,history:result.history,rider_name:result.rider_name,
      payment_status:result.payment_status,cod_collected:result.cod_collected,
      delivery_otp:result.delivery_otp||''};
    if(!rememberConfirmedSheetOrder(updated))throw new Error('Could not securely store the updated receipt.');
    setOrders(previous=>[updated,...previous.filter(previousOrder=>previousOrder.id!==order.id)]);
    setTrackingSyncError('');setTrackingCheckedAt(new Date().toLocaleTimeString());
  };

  // Tracking must work even if the public catalog cache is temporarily offline.
  // Sheets is the source of truth; localStorage only holds customer receipts.
  // Check device history when the customer opens orders/profile, not at every
  // storefront render. Verify max three at a time to keep the site responsive.
  useEffect(() => {
    if (!isProfileOpen && !isCustomerAccountOpen) return;
    const stored = loadConfirmedSheetOrders();
    if (!stored.length) { setHistorySyncing(false); return; }
    setHistorySyncing(true);
    let stopped = false;
    let phoneToken = '';
    try { phoneToken = sessionStorage.getItem('aurora_customer_phone_session_v1') || ''; } catch {}
    void verifyStoredOrderHistory(sheetContent.endpoint, stored, customerGoogleToken || undefined, phoneToken || undefined)
      .then(result => {
        if (stopped) return;
        if (result.deletedIds.length) removeConfirmedSheetOrdersById(result.deletedIds);
        const currentIds = new Set(stored.map(order => order.id));
        const freshById = new Map(result.current.map(order => [order.id, order]));
        // Don't wipe orders added by checkout while verification was in flight.
        setOrders(previous => previous.filter(order => !result.deletedIds.includes(order.id))
          .map(order => freshById.get(order.id) ?? order));
        for (const order of result.current) if (currentIds.has(order.id)) rememberConfirmedSheetOrder(order);
        if (result.deletedIds.length) setCartNotice('Some orders are no longer available and were removed from your saved history.');
        else if (result.failedIds.length) setCartNotice('Some saved receipts could not be checked online. They were kept safely; retry when connected.');
      })
      .catch(() => {
        if (!stopped) setCartNotice('Order history could not be checked online. No saved receipts were removed.');
      })
      .finally(() => { if (!stopped) setHistorySyncing(false); });
    return () => { stopped = true; };
  }, [isProfileOpen, isCustomerAccountOpen, sheetContent.endpoint, customerGoogleToken, historySyncVersion]);

  // Only poll the selected private receipt: the public endpoint never lists orders.
  useEffect(() => {
    if(!isTrackOrderOpen)return;
    let stopped=false,inFlight=false;
    const updateTrackedReceipt=async()=>{
      if(stopped||inFlight||document.visibilityState==='hidden')return;
      const saved=loadConfirmedSheetOrders();
      const selected=saved.find(order=>order.id===latestOrderId)||(!latestOrderId?saved[0]:undefined);
      if(!selected){
        setTrackingSyncError('This order receipt is not available on this device. Sign in to My orders to recover your history.');
        return;
      }
      inFlight=true;
      setTrackingSyncing(true);
      try{
        let phoneToken='';
        try{phoneToken=sessionStorage.getItem('aurora_customer_phone_session_v1')||'';}catch{}
        const next=await fetchCustomerOrderStatus(sheetContent.endpoint,selected,customerGoogleToken||undefined,phoneToken||undefined);
        if(stopped)return;
        const updated:Order={...selected,status:next.status,history:next.history,
          updated_at:next.updated_at,rider_name:next.rider_name,
          payment_status:next.payment_status,cod_collected:next.cod_collected,
          delivery_otp:next.delivery_otp||''};
        // Always render the server-confirmed update. An unavailable/corrupted
        // localStorage must never freeze an otherwise valid delivery progress.
        const cached=rememberConfirmedSheetOrder(updated);
        setOrders(previous=>[updated,...previous.filter(order=>order.id!==updated.id)]);
        setTrackingCheckedAt(new Date().toLocaleTimeString());
        setTrackingSyncError(cached?'':'Keep your original receipt or sign in to My orders to find it again.');
      }catch(error){
        if(!stopped && isConfirmedDeletedSheetOrder(error)){
          removeConfirmedSheetOrdersById([selected.id]);
          setOrders(previous=>previous.filter(order=>order.id!==selected.id));
          setLatestOrderId(current=>current===selected.id?'':current);
          setTrackingSyncError('This order is no longer available.');
        }else if(!stopped){
          setTrackingSyncError(shopErrorMessage(error,'Could not load live delivery status.'));
        }
      }finally{
        inFlight=false;
        if(!stopped)setTrackingSyncing(false);
      }
    };
    setTrackingSyncError('');
    void updateTrackedReceipt();
    // Delivery is time-sensitive. Poll faster only for active tracking,
    // while preserving a lower request rate for earlier kitchen stages.
    const refreshEveryMs=()=>{
      const current=loadConfirmedSheetOrders().find(receipt=>receipt.id===latestOrderId);
      return current?.status==='out_for_delivery' || current?.status==='picked_up' || current?.status==='assigned' ? 5000 : 9000;
    };
    let timer=window.setTimeout(function tick(){
      if(stopped)return;
      void updateTrackedReceipt();
      if(!stopped)timer=window.setTimeout(tick,refreshEveryMs());
    },refreshEveryMs());
    const whenVisible=()=>{if(document.visibilityState==='visible')void updateTrackedReceipt();};
    document.addEventListener('visibilitychange',whenVisible);
    window.addEventListener('focus',whenVisible);
    return()=>{
      stopped=true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange',whenVisible);
      window.removeEventListener('focus',whenVisible);
    };
  },[isTrackOrderOpen,latestOrderId,sheetContent.endpoint,customerGoogleToken,trackingRefreshKey]);

  // Reorders use the current Sheet catalogue; removed sizes/cakes are not recreated.
  const handleRecoveredCustomerOrders = (recovered:Order[]) => {
    const existing = new Set(loadConfirmedSheetOrders().map(order=>order.id));
    setRestoredSessionOrderIds(previous => [...new Set([...previous,
      ...recovered.filter(order=>!existing.has(order.id)).map(order=>order.id)])]);
    recovered.forEach(rememberConfirmedSheetOrder);
    setOrders(previous => {
      const byId=new Map(previous.map(order=>[order.id,order]));
      recovered.forEach(order=>byId.set(order.id,order));
      return Array.from(byId.values());
    });
  };

  const handleReorder = (order: Order) => {
    const result = reorderFromPublicOrder(order, publicData);
    if (result.changed) setCartNotice('Your reorder uses the latest cake prices and available options. Unavailable selections were left out. Please review your bag.');
    setCartItems(previous => [...result.items, ...previous]);
    setIsCartOpen(true);
  };

  const demoOrders = orders.filter(order => order.persistence !== 'google_sheets');
  const cartTotalCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div id="top" className="ac-app flex flex-col">
      <a className="ac-skip-link" href="#main-content">Skip to content</a>
      {/* Top Navbar */}
      <Navbar
        onOpenStaffPortal={openStaffPortal}
        onOpenCustomerAccount={() => setIsCustomerAccountOpen(true)}
        settings={settings}
        publicData={publicData}
        isSheetConnected={sheetContent.status.state === 'connected'}
        onOpenSheetSettings={() => setIsSheetContentOpen(true)}
        activeRole={activeRole}
        onRoleChange={setActiveRole}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        cartCount={cartTotalCount}
        onOpenCart={() => setIsCartOpen(true)}
        onOrderNow={openCheckout}
        onOpenProfile={() => setIsProfileOpen(true)}
        onOpenCacheHub={() => setIsCacheHubOpen(true)}
        onOpenDbViewer={() => setIsDbViewerOpen(true)}
        onOpenSupabaseSync={() => setIsSupabaseSyncOpen(true)}
        isSupabaseConnected={isSupabaseConnected}
        databaseBackend={databaseStatus.backend}
        onOpenTrackOrder={() => setIsTrackOrderOpen(true)}
        onOpenCustomCake={() => setIsCustomCakeOpen(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {cartNotice && <div role="status" className="mx-4 my-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 text-xs flex justify-between items-start gap-4"><span>{cartNotice}</span><button onClick={() => setCartNotice('')} className="font-semibold underline">Dismiss</button></div>}
      {profileSyncFailure&&<div role="status" className="mx-4 my-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-semibold">Your order is saved. {profileSyncFailure.mode==='profile'?'Delivery details still need syncing to your account.':'Linking it to your account needs attention.'}</p>
        <p className="mt-1 text-xs">{profileSyncFailure.message} Retrying here only updates your account; it does not place another order.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="button" disabled={profileSyncBusy} onClick={()=>void syncCustomerDeliveryProfile(profileSyncFailure.order,profileSyncFailure.endpoint,profileSyncFailure.mode)}
            className="rounded-lg bg-emerald-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{profileSyncBusy?'Updating account…':profileSyncFailure.mode==='profile'?'Retry saving delivery details':'Retry account linking'}</button>
          <button type="button" onClick={()=>setIsCustomerAccountOpen(true)} className="text-xs font-semibold underline">My bakery account</button>
          <button type="button" disabled={profileSyncBusy} onClick={()=>setProfileSyncFailure(null)} className="text-xs underline disabled:opacity-50">Dismiss</button>
        </div>
      </div>}
      {/* Main Content Area: Responsive Website vs Mobile App */}
      <main id="main-content" className={viewMode === 'web' && activeRole === 'customer' ? 'ac-main' : 'ac-main ac-main--portal'}>
        <Suspense fallback={<div className="py-20 text-center text-rose-700" role="status">Loading cakes…</div>}>
        {viewMode === 'mobile_app' ? (
          /* DEDICATED MOBILE APP VIEW */
          <MobileAppExperience
            settings={settings}
            publicData={publicData}
            products={products}
            categories={categories}
            flavors={flavors}
            addons={addons}
            banners={banners}
            zones={zones}
            slots={slots}
            orders={demoOrders}
            currency={settings.currency}
            cartItems={cartItems}
            onAddToCart={handleAddToCart}
            onUpdateCartQuantity={handleUpdateCartQuantity}
            onRemoveCartItem={handleRemoveCartItem}
            onOpenCheckout={openCheckout}
            onSelectProductForDetail={selectCake}
            onOpenCustomCake={() => setIsCustomCakeOpen(true)}
            onOpenTrackOrder={() => setIsTrackOrderOpen(true)}
            onOpenSupabaseSync={() => setIsSupabaseSyncOpen(true)}
            isSupabaseConnected={isSupabaseConnected}
            databaseBackend={databaseStatus.backend}
          />
        ) : (
          /* RESPONSIVE WEBSITE VIEW */
          <>
            {activeRole === 'customer' && (
              <CustomerStorefront
                settings={settings}
                publicData={publicData}
                products={products}
                catalogState={sheetContent.status.lastSyncedAt || sheetContent.status.state === 'connected' ? 'ready' : sheetContent.status.state}
                categories={categories}
                flavors={flavors}
                banners={banners}
                reviews={reviews}
                coupons={coupons}
                currency={settings.currency}
                onSelectProduct={selectCake}
                onOpenTrackOrder={() => setIsTrackOrderOpen(true)}
                onOpenCustomCake={() => setIsCustomCakeOpen(true)}
                onOpenProfile={() => setIsProfileOpen(true)}
                searchQuery={searchQuery}
                onAddToCart={handleAddToCart}
                onOpenCart={() => setIsCartOpen(true)}
              />
            )}

            {activeRole === 'kitchen_manager' && (
              <KitchenDisplay orders={orders} currency={settings.currency} />
            )}

            {activeRole === 'delivery_man' && (
              <DeliveryRiderPortal orders={orders} currency={settings.currency} endpoint={sheetContent.endpoint} />
            )}

            {(activeRole === 'super_admin' ||
              activeRole === 'admin' ||
              activeRole === 'order_manager' ||
              activeRole === 'delivery_manager' ||
              activeRole === 'accountant') && (
              <AdminPanel
                settings={settings}
                products={products}
                categories={categories}
                orders={orders}
                coupons={coupons}
                customCakes={customCakes}
                auditLogs={auditLogs}
                currency={settings.currency}
                role={activeRole}
                endpoint={sheetContent.endpoint}
                addons={addons}
                flavors={flavors}
              />
            )}
          </>
        )}
      </Suspense>
      </main>

      {/* Customer Mobile Sticky Bottom Navigation (in Web Mode on small screens) */}
      {viewMode === 'web' && activeRole === 'customer' && (
        <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-rose-100 px-4 py-2 flex items-center justify-around shadow-lg">
          <button
            onClick={() => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="flex flex-col items-center gap-1 text-slate-600 hover:text-rose-600 cursor-pointer"
          >
            <Home className="w-5 h-5" />
            <span className="text-[10px] font-semibold">Home</span>
          </button>
          <a
            href="#catalog"
            className="flex flex-col items-center gap-1 text-slate-600 hover:text-rose-600 cursor-pointer"
          >
            <Cake className="w-5 h-5" />
            <span className="text-[10px] font-semibold">Cakes</span>
          </a>
          <button
            onClick={() => setIsCustomCakeOpen(true)}
            className="flex flex-col items-center gap-1 text-slate-600 hover:text-rose-600 cursor-pointer"
          >
            <Sparkles className="w-5 h-5 text-amber-500" />
            <span className="text-[10px] font-semibold">Custom</span>
          </button>
          <button
            onClick={() => setIsProfileOpen(true)}
            className="flex flex-col items-center gap-1 text-slate-600 hover:text-rose-600 cursor-pointer"
          >
            <User className="w-5 h-5 text-rose-600" />
            <span className="text-[10px] font-semibold">Profile</span>
          </button>
          <button
            onClick={() => setIsTrackOrderOpen(true)}
            className="flex flex-col items-center gap-1 text-slate-600 hover:text-rose-600 cursor-pointer"
          >
            <Clock className="w-5 h-5" />
            <span className="text-[10px] font-semibold">Track</span>
          </button>
          <button
            onClick={() => setIsCartOpen(true)}
            className="flex flex-col items-center gap-1 text-rose-600 cursor-pointer relative"
          >
            <ShoppingBag className="w-5 h-5" />
            <span className="text-[10px] font-bold">Cart</span>
            {cartTotalCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-amber-400 text-slate-900 text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center">
                {cartTotalCount}
              </span>
            )}
          </button>
          <button type="button" onClick={openCheckout} className="flex flex-col items-center gap-1 rounded-xl bg-[#174B3B] text-white px-2.5 py-1.5 cursor-pointer">
            <ArrowRight className="w-5 h-5" />
            <span className="text-[10px] font-bold">Order Now</span>
          </button>
        </nav>
      )}

      {isStaffPortalOpen && <Suspense fallback={null}><StaffPortal isOpen={isStaffPortalOpen} onClose={closeStaffPortal} endpoint={sheetContent.endpoint} onCatalogUpdated={() => { void sheetContent.refresh(); }} /></Suspense>}
      {isCustomerAccountOpen && <Suspense fallback={null}><CustomerAccountPortal open={isCustomerAccountOpen} onTrackOrder={id => { setLatestOrderId(id); setIsCustomerAccountOpen(false); setIsTrackOrderOpen(true); }} onClose={() => setIsCustomerAccountOpen(false)} endpoint={sheetContent.endpoint} localReceipts={orders.filter(o => o.persistence === 'google_sheets')} onIdentityToken={setCustomerGoogleToken} onSignOut={() => { removeConfirmedSheetOrdersById(restoredSessionOrderIds); setOrders(previous => previous.filter(order => !restoredSessionOrderIds.includes(order.id))); setRestoredSessionOrderIds([]); }} onRecover={handleRecoveredCustomerOrders} /></Suspense>}
      {isSheetContentOpen && <Suspense fallback={null}><SheetContentPanel isOpen={isSheetContentOpen} onClose={() => setIsSheetContentOpen(false)} endpoint={sheetContent.endpoint} status={sheetContent.status} orderSubmissionEnabled={publicData.order_submission_enabled} databaseBackend={databaseStatus.backend} onOpenStaffPortal={()=>{setIsSheetContentOpen(false);openStaffPortal();}} onRefresh={sheetContent.refresh} onSaveEndpoint={sheetContent.updateEndpoint}/></Suspense>}
      {/* Modals & Slide-outs */}
      <Suspense fallback={null}>
      {selectedProductForDetail && <ProductDetailModal
        acceptingOrders={settings.accepting_orders}
        product={selectedProductForDetail}
        allFlavors={flavors}
        allAddons={addons}
        currency={settings.currency}
        reviews={reviews}
        onAddReview={handleAddReview}
        onClose={() => selectCake(null)}
        onAddToCart={handleAddToCart}
        onOrderNow={handleOrderNow}
      />}

      {isProfileOpen && <CustomerProfileModal
        isOpen={isProfileOpen}
        accountEndpoint={sheetContent.endpoint}
        onRecover={handleRecoveredCustomerOrders}
        onOpenAccount={()=>setIsCustomerAccountOpen(true)}
        historySyncing={historySyncing}
        onSyncHistory={() => setHistorySyncVersion(previous => previous + 1)}
        onClose={() => setIsProfileOpen(false)}
        orders={orders}
        products={products}
        currency={settings.currency}
        onReorder={handleReorder}
        onTrackOrder={(orderId) => {
          setLatestOrderId(orderId);
          setIsTrackOrderOpen(true);
        }}
        onAddReview={handleAddReview}
      />}

      {isCartOpen && <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        currency={settings.currency}
        onUpdateQuantity={handleUpdateCartQuantity}
        onRemoveItem={handleRemoveCartItem}
        onProceedToCheckout={openCheckout}
      />}

      {checkoutSession && <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        items={cartItems}
        currency={settings.currency}
        zones={zones}
        slots={slots}
        sheetOrderEndpoint={checkoutSession.endpoint}
        orderingPaused={!publicData.order_submission_enabled || !settings.accepting_orders}
        onOrderSuccess={handleOrderSuccess}
      />}

      {isTrackOrderOpen && <OrderTrackingModal
        isOpen={isTrackOrderOpen}
        syncing={trackingSyncing}
        syncError={trackingSyncError}
        checkedAt={trackingCheckedAt}
        onRefresh={() => setTrackingRefreshKey(key=>key+1)}
        onRestoreLegacyAccess={restoreLegacyReceipt}
        onClose={() => setIsTrackOrderOpen(false)}
        orders={orders}
        currentOrderId={latestOrderId}
        onSelectedOrderChange={setLatestOrderId}
        currency={settings.currency}
        onAddReview={handleAddReview}
      />}

      {isCustomCakeOpen && <CustomCakeModal
        sheetOrderEndpoint={publicData.order_submission_enabled ? sheetContent.endpoint : undefined}
        isOpen={isCustomCakeOpen}
        onClose={() => setIsCustomCakeOpen(false)}
        currency={settings.currency}
      />}

      {isSupabaseSyncOpen && <SupabaseSyncModal
        isOpen={isSupabaseSyncOpen}
        onClose={() => setIsSupabaseSyncOpen(false)}
        status={databaseStatus}
        loading={databaseStatusLoading}
        onRefresh={() => setDatabaseStatusRefresh(version => version + 1)}
      />}

      {isCacheHubOpen && <CachePerformanceHub
        isOpen={isCacheHubOpen}
        onClose={() => setIsCacheHubOpen(false)}
      />}

      {isDbViewerOpen && <DatabaseSchemaViewer
        isOpen={isDbViewerOpen}
        onClose={() => setIsDbViewerOpen(false)}
      />}
      </Suspense>
    </div>
  );
}
