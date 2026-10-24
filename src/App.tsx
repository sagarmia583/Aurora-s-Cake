/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Navbar, ViewMode } from './components/Navbar';
import { CustomerStorefront } from './components/CustomerStorefront';
const MobileAppExperience = lazy(() => import('./components/MobileAppExperience').then(m => ({default: m.MobileAppExperience})));
import { ProductDetailModal } from './components/ProductDetailModal';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { OrderTrackingModal } from './components/OrderTrackingModal';
import { KitchenDisplay } from './components/KitchenDisplay';
import { DeliveryRiderPortal } from './components/DeliveryRiderPortal';
const AdminPanel = lazy(() => import('./components/AdminPanel').then(m => ({default: m.AdminPanel})));
const StaffPortal = lazy(() => import('./components/StaffPortal').then(m => ({default: m.StaffPortal})));
const CustomerAccountPortal = lazy(() => import('./components/CustomerAccountPortal').then(m => ({default: m.CustomerAccountPortal})));
import { CachePerformanceHub } from './components/CachePerformanceHub';
import { DatabaseSchemaViewer } from './components/DatabaseSchemaViewer';
import { SupabaseSyncModal } from './components/SupabaseSyncModal';
import { CustomCakeModal } from './components/CustomCakeModal';
import { CustomerProfileModal } from './components/CustomerProfileModal';
import { mockDb } from './services/mockDatabase';
import { supabaseDataService } from './services/supabaseDataService';
import { useGoogleSheetContent } from './hooks/useGoogleSheetContent';
import { SheetContentPanel } from './components/SheetContentPanel';
import { loadConfirmedSheetOrders, rememberConfirmedSheetOrder } from './services/googleSheetOrders';
import { fetchCustomerOrderStatus } from './services/sheetStaffApi';
import { reconcilePublicCart, reorderFromPublicOrder } from './services/reconcilePublicCart';
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
  const [isStaffPortalOpen, setIsStaffPortalOpen] = useState(false);
  const [isCustomerAccountOpen, setIsCustomerAccountOpen] = useState(false);
  // Dual Experience: Responsive Website vs Mobile App
  const [viewMode, setViewMode] = useState<ViewMode>('web');

  // Active Role / Persona (Web View)
  const [activeRole, setActiveRole] = useState<StaffRole | 'customer'>('customer');

  // Supabase Connection Status
  const [isSupabaseConnected, setIsSupabaseConnected] = useState<boolean>(false);

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
  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    try {
      const stored = localStorage.getItem('cake_cart_items_v1');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const cartRef = useRef(cartItems);
  const [cartNotice, setCartNotice] = useState('');
  useEffect(() => { cartRef.current = cartItems; }, [cartItems]);

  // Modals & Navigation
  const [selectedProductForDetail, setSelectedProductForDetail] = useState<Product | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isTrackOrderOpen, setIsTrackOrderOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isCustomCakeOpen, setIsCustomCakeOpen] = useState(false);
  const [isCacheHubOpen, setIsCacheHubOpen] = useState(false);
  const [isDbViewerOpen, setIsDbViewerOpen] = useState(false);
  const [isSupabaseSyncOpen, setIsSupabaseSyncOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [latestOrderId, setLatestOrderId] = useState<string | undefined>(undefined);

  // Sync cart to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('cake_cart_items_v1', JSON.stringify(cartItems));
    } catch {
      // Storage unavailable
    }
  }, [cartItems]);

  // Public reads never include orders. Confirmed private Sheet receipts are cached on this device.
  const refreshData = async () => {
    setOrders([...loadConfirmedSheetOrders(), ...mockDb.getOrders().filter(order => order.persistence !== 'google_sheets')]);
    setCustomCakes(mockDb.getCustomCakes());
    setAuditLogs(mockDb.getAuditLogs());
  };

  useEffect(() => {
    mockDb.applyPublicSnapshot(publicData);
    const reconciled = reconcilePublicCart(cartRef.current, publicData);
    cartRef.current = reconciled.items;
    setCartItems(reconciled.items);
    if (reconciled.changed) setCartNotice('Your cake bag was updated to match the latest prices and available options. Please review it before checkout.');
    setSelectedProductForDetail(previous => previous ? publicData.products.find(product => product.id === previous.id && product.is_active) ?? null : null);
    setSettings(publicData.settings);
    setProducts(publicData.products);
    setCategories(publicData.categories);
    setFlavors(publicData.flavors);
    setAddons(publicData.addons);
    setBanners(publicData.banners);
    setZones(publicData.zones);
    setSlots(publicData.slots);
    setCoupons(publicData.coupons);
    setReviews(publicData.reviews);
    document.title = publicData.settings.website_title || publicData.settings.shop_name;
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (icon) icon.href = publicData.settings.logo_url || '/favicon.svg';
    for (const [selector, value] of [
      ['meta[name="description"]', publicData.settings.website_description],
      ['meta[property="og:title"]', publicData.settings.website_title || publicData.settings.shop_name],
      ['meta[property="og:description"]', publicData.settings.website_description],
    ]) document.querySelector(selector)?.setAttribute('content', value);
  }, [publicData]);

  useEffect(() => {
    refreshData();

    // Listen to local mockDb changes
    const unsubDb = mockDb.subscribe(() => {
      refreshData();
    });

    // Listen to Supabase connection & live events
    const unsubSupabase = supabaseDataService.subscribe((status) => {
      setIsSupabaseConnected(status.isConnected);
      if (status.isConnected) {
        refreshData();
      }
    });

    return () => {
      unsubDb();
      unsubSupabase();
    };
  }, []);

  // Cart operations
  const handleAddToCart = (item: CartItem) => {
    setCartItems((prev) => [item, ...prev]);
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

  const handleOrderSuccess = (newOrder: Order) => {
    if (newOrder.persistence === 'google_sheets') rememberConfirmedSheetOrder(newOrder);
    setOrders(previous => [newOrder, ...previous.filter(order => order.id !== newOrder.id)]);
    setCartNotice('');
    setIsCartOpen(false);
    setIsCheckoutOpen(false);
    setCartItems([]);
    setLatestOrderId(newOrder.id);
    setIsTrackOrderOpen(true);
  };

  // A receipt is a capability held only on the ordering device. Poll only that
  // exact receipt while tracking is open; never expose the private order list.
  useEffect(() => {
    if (!isTrackOrderOpen || !publicData.order_submission_enabled) return;
    let stopped = false;
    const updateTrackedReceipt = async () => {
      const saved = loadConfirmedSheetOrders();
      const selected = saved.find(order => order.id === latestOrderId) || (!latestOrderId ? saved[0] : undefined);
      if (!selected) return;
      try {
        const next = await fetchCustomerOrderStatus(sheetContent.endpoint, selected);
        if (stopped) return;
        const updated: Order = {
          ...selected, status: next.status, history: next.history,
          updated_at: next.updated_at, rider_name: next.rider_name,
          payment_status: next.payment_status, cod_collected: next.cod_collected,
        };
        if (rememberConfirmedSheetOrder(updated)) {
          setOrders(previous => [updated, ...previous.filter(order => order.id !== updated.id)]);
        }
      } catch {
        // Old deployments do not have private status lookup. Retain the last
        // confirmed receipt rather than guessing an order transition.
      }
    };
    void updateTrackedReceipt();
    const timer = window.setInterval(() => { void updateTrackedReceipt(); }, 30000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [isTrackOrderOpen, latestOrderId, sheetContent.endpoint, publicData.order_submission_enabled]);

  // Reorders use the current Sheet catalogue; removed sizes/cakes are not recreated.
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
        onOpenStaffPortal={() => setIsStaffPortalOpen(true)}
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
        onOpenProfile={() => setIsProfileOpen(true)}
        onOpenCacheHub={() => setIsCacheHubOpen(true)}
        onOpenDbViewer={() => setIsDbViewerOpen(true)}
        onOpenSupabaseSync={() => setIsSupabaseSyncOpen(true)}
        isSupabaseConnected={isSupabaseConnected}
        onOpenTrackOrder={() => setIsTrackOrderOpen(true)}
        onOpenCustomCake={() => setIsCustomCakeOpen(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {cartNotice && <div role="status" className="mx-4 my-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 text-xs flex justify-between items-start gap-4"><span>{cartNotice}</span><button onClick={() => setCartNotice('')} className="font-semibold underline">Dismiss</button></div>}
      {/* Main Content Area: Responsive Website vs Mobile App */}
      <main id="main-content" className={viewMode === 'web' && activeRole === 'customer' ? 'ac-main' : 'ac-main ac-main--portal'}>
        <Suspense fallback={<div className="py-20 text-center text-rose-700" role="status">Opening the studio…</div>}>
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
            onOpenCheckout={() => setIsCheckoutOpen(true)}
            onSelectProductForDetail={(p) => setSelectedProductForDetail(p)}
            onOpenCustomCake={() => setIsCustomCakeOpen(true)}
            onOpenTrackOrder={() => setIsTrackOrderOpen(true)}
            onOpenSupabaseSync={() => setIsSupabaseSyncOpen(true)}
            isSupabaseConnected={isSupabaseConnected}
          />
        ) : (
          /* RESPONSIVE WEBSITE VIEW */
          <>
            {activeRole === 'customer' && (
              <CustomerStorefront
                settings={settings}
                publicData={publicData}
                products={products}
                categories={categories}
                flavors={flavors}
                banners={banners}
                reviews={reviews}
                currency={settings.currency}
                onSelectProduct={(p) => setSelectedProductForDetail(p)}
                onOpenTrackOrder={() => setIsTrackOrderOpen(true)}
                onOpenCustomCake={() => setIsCustomCakeOpen(true)}
                onOpenProfile={() => setIsProfileOpen(true)}
                searchQuery={searchQuery}
              />
            )}

            {activeRole === 'kitchen_manager' && (
              <KitchenDisplay orders={demoOrders} currency={settings.currency} />
            )}

            {activeRole === 'delivery_man' && (
              <DeliveryRiderPortal orders={demoOrders} currency={settings.currency} />
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
                orders={demoOrders}
                coupons={coupons}
                customCakes={customCakes}
                auditLogs={auditLogs}
                currency={settings.currency}
                role={activeRole}
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
            <span className="text-[10px] font-semibold">Orders</span>
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
        </nav>
      )}

      {activeRole !== 'customer' && <div className="mx-auto my-3 w-full max-w-6xl px-5 text-xs text-slate-500">Website content is managed in Google Sheets. These Studio tools are local demonstrations. Manage real orders in the private orders and order_items Sheet tabs. Content edits here are replaced on the next Sheet refresh.</div>}

      <Suspense fallback={null}><StaffPortal isOpen={isStaffPortalOpen} onClose={() => setIsStaffPortalOpen(false)} endpoint={sheetContent.endpoint} /></Suspense>
      <Suspense fallback={null}><CustomerAccountPortal open={isCustomerAccountOpen} onClose={() => setIsCustomerAccountOpen(false)} endpoint={sheetContent.endpoint} localReceipts={orders.filter(o => o.persistence === 'google_sheets')} onRecover={recovered => { recovered.forEach(rememberConfirmedSheetOrder); setOrders(previous => { const byId = new Map(previous.map(o => [o.id,o])); recovered.forEach(o => byId.set(o.id,o)); return Array.from(byId.values()); }); }} /></Suspense>
      <SheetContentPanel isOpen={isSheetContentOpen} onClose={() => setIsSheetContentOpen(false)} endpoint={sheetContent.endpoint} status={sheetContent.status} orderSubmissionEnabled={publicData.order_submission_enabled} onRefresh={sheetContent.refresh} onSaveEndpoint={sheetContent.updateEndpoint}/>
      {/* Modals & Slide-outs */}
      <ProductDetailModal
        acceptingOrders={settings.accepting_orders}
        product={selectedProductForDetail}
        allFlavors={flavors}
        allAddons={addons}
        currency={settings.currency}
        onClose={() => setSelectedProductForDetail(null)}
        onAddToCart={handleAddToCart}
      />

      <CustomerProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        orders={orders}
        products={products}
        currency={settings.currency}
        onReorder={handleReorder}
        onTrackOrder={(orderId) => {
          setLatestOrderId(orderId);
          setIsTrackOrderOpen(true);
        }}
      />

      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        currency={settings.currency}
        onUpdateQuantity={handleUpdateCartQuantity}
        onRemoveItem={handleRemoveCartItem}
        onProceedToCheckout={() => { setIsCartOpen(false); setIsCheckoutOpen(true); }}
      />

      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        items={cartItems}
        currency={settings.currency}
        zones={zones}
        slots={slots}
        sheetOrderEndpoint={publicData.order_submission_enabled ? sheetContent.endpoint : undefined}
        onOrderSuccess={handleOrderSuccess}
      />

      <OrderTrackingModal
        isOpen={isTrackOrderOpen}
        onClose={() => setIsTrackOrderOpen(false)}
        orders={orders}
        currentOrderId={latestOrderId}
        currency={settings.currency}
      />

      <CustomCakeModal
        isOpen={isCustomCakeOpen}
        onClose={() => setIsCustomCakeOpen(false)}
        currency={settings.currency}
      />

      <SupabaseSyncModal
        isOpen={isSupabaseSyncOpen}
        onClose={() => setIsSupabaseSyncOpen(false)}
        settings={settings}
        categories={categories}
        products={products}
        flavors={flavors}
        addons={addons}
        banners={banners}
        zones={zones}
        slots={slots}
        coupons={coupons}
        reviews={reviews}
        onDataRefreshed={refreshData}
      />

      <CachePerformanceHub
        isOpen={isCacheHubOpen}
        onClose={() => setIsCacheHubOpen(false)}
      />

      <DatabaseSchemaViewer
        isOpen={isDbViewerOpen}
        onClose={() => setIsDbViewerOpen(false)}
      />
    </div>
  );
}
