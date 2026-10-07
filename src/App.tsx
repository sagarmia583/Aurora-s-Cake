/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Navbar, ViewMode } from './components/Navbar';
import { CustomerStorefront } from './components/CustomerStorefront';
import { MobileAppExperience } from './components/MobileAppExperience';
import { ProductDetailModal } from './components/ProductDetailModal';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { OrderTrackingModal } from './components/OrderTrackingModal';
import { KitchenDisplay } from './components/KitchenDisplay';
import { DeliveryRiderPortal } from './components/DeliveryRiderPortal';
import { AdminPanel } from './components/AdminPanel';
import { CachePerformanceHub } from './components/CachePerformanceHub';
import { DatabaseSchemaViewer } from './components/DatabaseSchemaViewer';
import { SupabaseSyncModal } from './components/SupabaseSyncModal';
import { CustomCakeModal } from './components/CustomCakeModal';
import { CustomerProfileModal } from './components/CustomerProfileModal';
import { mockDb } from './services/mockDatabase';
import { supabaseDataService } from './services/supabaseDataService';
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
  // Dual Experience: Responsive Website vs Mobile App
  const [viewMode, setViewMode] = useState<ViewMode>('web');

  // Active Role / Persona (Web View)
  const [activeRole, setActiveRole] = useState<StaffRole | 'customer'>('customer');

  // Supabase Connection Status
  const [isSupabaseConnected, setIsSupabaseConnected] = useState<boolean>(false);

  // Core Data (100% Database-Driven)
  const [settings, setSettings] = useState<ShopSettings>({
    id: 'setting-1',
    shop_name: 'SweetDelight Artisan Cake Boutique',
    logo_url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=500&auto=format&fit=crop&q=80',
    phone: '+880 1712-345678',
    whatsapp: '+880 1712-345678',
    email: 'orders@sweetdelightcakes.com',
    address: 'Victoria Road, Tangail Town, Dhaka Division, Bangladesh',
    opening_time: '09:00 AM',
    closing_time: '10:00 PM',
    currency: '৳',
    accepting_orders: true,
    delivery_enabled: true,
    website_title: 'SweetDelight - Handcrafted Fresh Celebration Cakes',
    website_description: 'Tangail’s #1 boutique for bespoke celebration cakes, designer wedding cakes, and sweet delicacies with express temperature-controlled delivery.',
    top_announcement_text: '🚀 3-Hour Express Temperature-Safe Delivery in Tangail',
    hero_tagline: 'Tangail’s Bespoke Luxury Patisserie',
    hero_title: 'Handcrafted Celebration Cakes Made with Passion',
    hero_subtitle: 'Order fresh 100% halal celebratory cakes made from pure dairy cream and imported Belgian cocoa with guaranteed express delivery.',
    hero_cta_text: 'Explore Fresh Cakes',
    trust_badge_1_title: '100% Fresh Daily',
    trust_badge_1_desc: 'Baked from scratch upon order',
    trust_badge_2_title: '3-Hour Express Dispatch',
    trust_badge_2_desc: 'Temperature-safe van & bike delivery',
    trust_badge_3_title: 'Free Cake Dedication',
    trust_badge_3_desc: 'Piped name & wishes included',
    trust_badge_4_title: 'Hygienic Halal Standards',
    trust_badge_4_desc: 'Pure dairy cream & imported cocoa',
    custom_cake_promo_tag: 'Custom Cake Studio',
    custom_cake_promo_title: 'Have a Dream Cake Design in Mind?',
    custom_cake_promo_desc: 'Upload your reference photo, pick custom tiers, flavors, colors, and dedicated text. Our pastry chef team will provide an instant custom quote!',
    custom_cake_promo_btn: 'Submit Custom Cake Request',
    footer_about_text: 'Tangail premier boutique for fresh birthday cakes, wedding tiers, cheesecakes, and custom pastries. Baked fresh with love and 100% natural ingredients.',
  });

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [flavors, setFlavors] = useState<Flavor[]>([]);
  const [addons, setAddons] = useState<ProductAddon[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [slots, setSlots] = useState<DeliverySlot[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
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

  // Load and synchronize data from Supabase / Reactive Database
  const refreshData = async () => {
    if (supabaseDataService.getStatus().isConnected) {
      const supabaseData = await supabaseDataService.loadAllDataFromSupabase();
      if (supabaseData && supabaseData.settings) {
        setSettings(supabaseData.settings);
        if (supabaseData.products) setProducts(supabaseData.products);
        if (supabaseData.categories) setCategories(supabaseData.categories);
        if (supabaseData.flavors) setFlavors(supabaseData.flavors);
        if (supabaseData.addons) setAddons(supabaseData.addons);
        if (supabaseData.banners) setBanners(supabaseData.banners);
        if (supabaseData.zones) setZones(supabaseData.zones);
        if (supabaseData.slots) setSlots(supabaseData.slots);
        if (supabaseData.orders) setOrders(supabaseData.orders);
        if (supabaseData.coupons) setCoupons(supabaseData.coupons);
        if (supabaseData.reviews) setReviews(supabaseData.reviews);
        if (supabaseData.customCakes) setCustomCakes(supabaseData.customCakes);
        setAuditLogs(mockDb.getAuditLogs());
        return;
      }
    }

    // Reactive local database fallback
    const [fetchedSettings, fetchedProducts, fetchedCategories] = await Promise.all([
      mockDb.getShopSettings(),
      mockDb.getProducts(),
      mockDb.getCategories(),
    ]);

    setSettings(fetchedSettings);
    setProducts(fetchedProducts);
    setCategories(fetchedCategories);
    setFlavors(mockDb.getFlavors());
    setAddons(mockDb.getAddons());
    setBanners(mockDb.getBanners());
    setZones(mockDb.getDeliveryZones());
    setSlots(mockDb.getDeliverySlots());
    setOrders(mockDb.getOrders());
    setCoupons(mockDb.getCoupons());
    setReviews(mockDb.getReviews());
    setCustomCakes(mockDb.getCustomCakes());
    setAuditLogs(mockDb.getAuditLogs());
  };

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
    setCartItems([]);
    setLatestOrderId(newOrder.id);
    setIsTrackOrderOpen(true);
  };

  // Reorder past order
  const handleReorder = (order: Order) => {
    const reorderedCartItems: CartItem[] = order.items.map((it) => {
      const matchedProduct = products.find((p) => p.id === it.product_id) || {
        id: it.product_id || `prod-${Date.now()}`,
        category_id: 'cat-1',
        category_name: 'Celebration Cakes',
        name: it.product_name,
        slug: it.product_name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        description: 'Handcrafted fresh artisan celebration cake',
        base_price: it.unit_price,
        image_url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=800&auto=format&fit=crop&q=80',
        gallery_images: [],
        is_featured: false,
        is_active: true,
        rating: 5,
        review_count: 10,
        variants: [],
        allowed_flavor_ids: [],
        allowed_addon_ids: [],
      };

      const matchedVariant = matchedProduct.variants.find((v) => v.name === it.variant_name) || {
        id: `var-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        product_id: matchedProduct.id,
        name: it.variant_name,
        weight_grams: 1000,
        price: it.unit_price,
        is_active: true,
      };

      const matchedFlavor = flavors.find((f) => f.name === it.flavor_name);

      const matchedAddons = (it.addons || []).map((a) => {
        const existing = addons.find((ea) => ea.id === a.addon_id || ea.name === a.addon_name);
        return (
          existing || {
            id: a.addon_id,
            name: a.addon_name,
            price: a.unit_price,
            is_active: true,
          }
        );
      });

      return {
        cart_item_id: `cart-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        product: matchedProduct,
        selected_variant: matchedVariant,
        selected_flavor: matchedFlavor,
        selected_addons: matchedAddons,
        writing_message: it.writing_message || '',
        quantity: it.quantity,
        unit_price: it.unit_price,
        total_price: it.subtotal,
      };
    });

    setCartItems((prev) => [...reorderedCartItems, ...prev]);
    setIsCartOpen(true);
  };

  const cartTotalCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans selection:bg-rose-500 selection:text-white">
      {/* Top Navbar */}
      <Navbar
        settings={settings}
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

      {/* Main Content Area: Responsive Website vs Mobile App */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        {viewMode === 'mobile_app' ? (
          /* DEDICATED MOBILE APP VIEW */
          <MobileAppExperience
            settings={settings}
            products={products}
            categories={categories}
            flavors={flavors}
            addons={addons}
            banners={banners}
            zones={zones}
            slots={slots}
            orders={orders}
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
              <KitchenDisplay orders={orders} currency={settings.currency} />
            )}

            {activeRole === 'delivery_man' && (
              <DeliveryRiderPortal orders={orders} currency={settings.currency} />
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
              />
            )}
          </>
        )}
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

      {/* Modals & Slide-outs */}
      <ProductDetailModal
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
        onProceedToCheckout={() => setIsCheckoutOpen(true)}
      />

      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        items={cartItems}
        currency={settings.currency}
        zones={zones}
        slots={slots}
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
