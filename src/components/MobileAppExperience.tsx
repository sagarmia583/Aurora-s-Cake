import React, { useState } from 'react';
import {
  Smartphone,
  Maximize2,
  Minimize2,
  ShoppingBag,
  Sparkles,
  Clock,
  User,
  Home,
  Cake,
  Bike,
  ChefHat,
  LayoutDashboard,
  Search,
  MapPin,
  Phone,
  CheckCircle2,
  Key,
  DollarSign,
  ArrowRight,
  Plus,
  Minus,
  Star,
  Database,
  Radio,
  Flame,
  PackageCheck,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';
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
  OrderStatus,
  CartItem,
  StaffRole,
} from '../types';
import { mockDb } from '../services/mockDatabase';

interface MobileAppExperienceProps {
  settings: ShopSettings;
  products: Product[];
  categories: Category[];
  flavors: Flavor[];
  addons: ProductAddon[];
  banners: Banner[];
  zones: DeliveryZone[];
  slots: DeliverySlot[];
  orders: Order[];
  currency: string;
  cartItems: CartItem[];
  onAddToCart: (item: CartItem) => void;
  onUpdateCartQuantity: (cartItemId: string, newQty: number) => void;
  onRemoveCartItem: (cartItemId: string) => void;
  onOpenCheckout: () => void;
  onSelectProductForDetail: (product: Product) => void;
  onOpenCustomCake: () => void;
  onOpenTrackOrder: () => void;
  onOpenSupabaseSync: () => void;
  isSupabaseConnected: boolean;
}

export const MobileAppExperience: React.FC<MobileAppExperienceProps> = ({
  settings,
  products,
  categories,
  flavors,
  addons,
  banners,
  zones,
  slots,
  orders,
  currency,
  cartItems,
  onAddToCart,
  onUpdateCartQuantity,
  onRemoveCartItem,
  onOpenCheckout,
  onSelectProductForDetail,
  onOpenCustomCake,
  onOpenTrackOrder,
  onOpenSupabaseSync,
  isSupabaseConnected,
}) => {
  // Mobile app sub-persona
  const [appRole, setAppRole] = useState<'customer' | 'rider' | 'kitchen' | 'admin'>('customer');
  // Customer App active tab
  const [customerTab, setCustomerTab] = useState<'home' | 'catalog' | 'custom' | 'orders' | 'profile'>('home');
  // Frame mode
  const [isFramed, setIsFramed] = useState<boolean>(true);
  // Mobile search
  const [appSearch, setAppSearch] = useState<string>('');
  // Selected category in catalog
  const [selectedCat, setSelectedCat] = useState<string>('all');
  // Rider OTP inputs
  const [riderOtpInputs, setRiderOtpInputs] = useState<Record<string, string>>({});
  const [riderOtpErrors, setRiderOtpErrors] = useState<Record<string, string>>({});

  const cartCount = cartItems.reduce((acc, it) => acc + it.quantity, 0);
  const cartSubtotal = cartItems.reduce((acc, it) => acc + it.total_price, 0);

  // Filter products for mobile
  const filteredProducts = products.filter((p) => {
    if (!p.is_active) return false;
    if (selectedCat !== 'all' && p.category_id !== selectedCat) return false;
    if (appSearch.trim() !== '') {
      const q = appSearch.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
    }
    return true;
  });

  // Rider actions
  const handleVerifyOtp = (order: Order) => {
    const entered = riderOtpInputs[order.id];
    if (!entered) {
      setRiderOtpErrors({ ...riderOtpErrors, [order.id]: 'Please enter the 4-digit OTP' });
      return;
    }
    const res = mockDb.verifyDeliveryOTP(order.id, entered, 'Rahim Mia');
    if (!res.success) {
      setRiderOtpErrors({ ...riderOtpErrors, [order.id]: res.message });
    } else {
      setRiderOtpErrors({ ...riderOtpErrors, [order.id]: '' });
      setRiderOtpInputs({ ...riderOtpInputs, [order.id]: '' });
    }
  };

  const handleQuickAdd = (product: Product) => {
    const defVariant = product.variants[0] || {
      id: `var-def-${product.id}`,
      product_id: product.id,
      name: '1kg',
      weight_grams: 1000,
      price: product.base_price,
      is_active: true,
    };
    const defFlavor = flavors[0];
    const price = defVariant.sale_price || defVariant.price;

    const newItem: CartItem = {
      cart_item_id: `cart-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      product,
      selected_variant: defVariant,
      selected_flavor: defFlavor,
      selected_addons: [],
      writing_message: 'Happy Celebration',
      quantity: 1,
      unit_price: price,
      total_price: price,
    };
    onAddToCart(newItem);
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-4">
      {/* Top Device & Role Controls Bar */}
      <div className="w-full max-w-4xl bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* App Persona Switcher */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
          {[
            { id: 'customer', label: 'Customer App', icon: '🛍️' },
            { id: 'rider', label: 'Delivery Rider', icon: '🛵' },
            { id: 'kitchen', label: 'Kitchen KDS', icon: '👨‍🍳' },
            { id: 'admin', label: 'Admin App', icon: '👑' },
          ].map((role) => (
            <button
              key={role.id}
              onClick={() => setAppRole(role.id as any)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                appRole === role.id
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              <span>{role.icon}</span>
              <span className="hidden sm:inline">{role.label}</span>
            </button>
          ))}
        </div>

        {/* Database & Frame controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenSupabaseSync}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl flex items-center gap-1.5 border cursor-pointer transition-colors ${
              isSupabaseConnected
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Supabase:</span>
            <span>{isSupabaseConnected ? 'Live' : 'Local DB'}</span>
          </button>

          <button
            onClick={() => setIsFramed(!isFramed)}
            className="p-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            title={isFramed ? 'Switch to Full Screen View' : 'Switch to Smartphone Frame'}
          >
            {isFramed ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Device Frame Container */}
      <div
        className={`transition-all duration-300 ${
          isFramed
            ? 'w-full max-w-[400px] h-[820px] bg-slate-900 rounded-[50px] p-3 shadow-2xl border-4 border-slate-700 relative ring-12 ring-slate-800/50'
            : 'w-full max-w-lg min-h-[750px] bg-slate-100 rounded-3xl p-1 shadow-lg border border-slate-300'
        }`}
      >
        {/* Phone Speaker & Dynamic Island (when framed) */}
        {isFramed && (
          <div className="absolute top-5 left-1/2 -translate-x-1/2 w-28 h-6 bg-black rounded-full z-50 flex items-center justify-between px-3">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-800 border border-slate-700" />
            <div className="w-3 h-3 rounded-full bg-indigo-950/70 border border-slate-700" />
          </div>
        )}

        {/* Screen Surface */}
        <div
          className={`w-full h-full bg-slate-50 overflow-hidden flex flex-col relative text-slate-800 font-sans ${
            isFramed ? 'rounded-[40px]' : 'rounded-2xl'
          }`}
        >
          {/* Status Bar */}
          <div className="bg-white/95 px-5 pt-3 pb-2 flex items-center justify-between text-[11px] font-bold text-slate-800 shrink-0 select-none border-b border-slate-100">
            <span>9:41</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-emerald-600">5G</span>
              <div className="w-4 h-2 border border-slate-800 rounded-xs p-0.5 flex items-center">
                <div className="h-full w-full bg-slate-800" />
              </div>
            </div>
          </div>

          {/* ========================================================
              PERSONA 1: CUSTOMER MOBILE APP
          ======================================================== */}
          {appRole === 'customer' && (
            <div className="flex-1 flex flex-col overflow-hidden relative">
              {/* App Header */}
              <div className="bg-white px-4 py-2.5 border-b border-slate-100 flex items-center justify-between shrink-0 shadow-xs">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-500 flex items-center justify-center text-white text-base shadow-xs">
                    🍰
                  </div>
                  <div>
                    <h3 className="font-black text-xs text-slate-900 leading-tight">
                      {settings.shop_name}
                    </h3>
                    <p className="text-[10px] text-slate-400 font-medium">Tangail Boutique</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={onOpenCustomCake}
                    className="p-1.5 bg-rose-50 text-rose-600 rounded-lg text-xs font-bold hover:bg-rose-100 transition-colors cursor-pointer"
                    title="Custom Design Cake"
                  >
                    <Sparkles className="w-4 h-4 text-amber-500" />
                  </button>

                  <button
                    onClick={onOpenCheckout}
                    className="relative p-1.5 bg-rose-600 text-white rounded-lg text-xs font-bold cursor-pointer hover:bg-rose-700 shadow-xs"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    {cartCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-amber-400 text-slate-900 text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center">
                        {cartCount}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Main Scrollable View */}
              <div className="flex-1 overflow-y-auto p-3 space-y-4 pb-20 scrollbar-none">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search chocolate, red velvet, vanilla..."
                    value={appSearch}
                    onChange={(e) => setAppSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-white rounded-xl text-xs border border-slate-200 focus:outline-rose-500"
                  />
                </div>

                {/* Categories Stories Bar */}
                <div>
                  <div className="flex items-center justify-between mb-1.5 px-0.5">
                    <span className="text-[11px] font-black uppercase text-slate-500 tracking-wider">
                      Categories
                    </span>
                    <button
                      onClick={() => setCustomerTab('catalog')}
                      className="text-[10px] text-rose-600 font-bold hover:underline cursor-pointer"
                    >
                      See All
                    </button>
                  </div>

                  <div className="flex items-center gap-2.5 overflow-x-auto pb-1 scrollbar-none">
                    <button
                      onClick={() => setSelectedCat('all')}
                      className={`flex flex-col items-center gap-1 shrink-0 cursor-pointer ${
                        selectedCat === 'all' ? 'text-rose-600' : 'text-slate-600'
                      }`}
                    >
                      <div
                        className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg transition-transform ${
                          selectedCat === 'all'
                            ? 'bg-rose-500 text-white shadow-md shadow-rose-200 scale-105'
                            : 'bg-white border border-slate-200 text-slate-700'
                        }`}
                      >
                        🎂
                      </div>
                      <span className="text-[10px] font-bold">All</span>
                    </button>

                    {categories.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setSelectedCat(c.id)}
                        className={`flex flex-col items-center gap-1 shrink-0 cursor-pointer ${
                          selectedCat === c.id ? 'text-rose-600' : 'text-slate-600'
                        }`}
                      >
                        <div
                          className={`w-12 h-12 rounded-2xl overflow-hidden border-2 transition-transform ${
                            selectedCat === c.id
                              ? 'border-rose-500 shadow-md shadow-rose-200 scale-105'
                              : 'border-slate-200 bg-white'
                          }`}
                        >
                          <img src={c.image_url} alt={c.name} className="w-full h-full object-cover" />
                        </div>
                        <span className="text-[10px] font-bold max-w-14 truncate text-center">
                          {c.name.split(' ')[0]}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Dynamic Hero Banner */}
                {banners[0] && (
                  <div className="relative rounded-2xl overflow-hidden bg-slate-900 text-white shadow-md">
                    <img
                      src={banners[0].image_url}
                      alt="Banner"
                      className="w-full h-32 object-cover opacity-60"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-3.5 flex flex-col justify-end">
                      <span className="text-[10px] bg-rose-500/80 text-white font-bold px-2 py-0.5 rounded-full w-max">
                        {settings.hero_tagline || 'Special Offer'}
                      </span>
                      <h4 className="font-black text-sm text-white mt-1 leading-snug">
                        {banners[0].title}
                      </h4>
                      <p className="text-[11px] text-slate-300 line-clamp-1">
                        {banners[0].subtitle}
                      </p>
                    </div>
                  </div>
                )}

                {/* Cake Cards Grid */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-0.5">
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                      Celebration Cakes ({filteredProducts.length})
                    </h4>
                    <span className="text-[10px] text-slate-400">Baked upon order</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    {filteredProducts.map((p) => {
                      const firstVar = p.variants[0];
                      const price = firstVar?.sale_price || firstVar?.price || p.base_price;
                      return (
                        <div
                          key={p.id}
                          className="bg-white rounded-2xl border border-slate-200/80 p-2 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
                        >
                          <div>
                            <div
                              onClick={() => onSelectProductForDetail(p)}
                              className="relative h-28 rounded-xl overflow-hidden cursor-pointer group"
                            >
                              <img
                                src={p.image_url}
                                alt={p.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              />
                              <div className="absolute top-1.5 right-1.5 bg-black/60 backdrop-blur-xs text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                                <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                                <span>{p.rating || 5}</span>
                              </div>
                            </div>

                            <h5
                              onClick={() => onSelectProductForDetail(p)}
                              className="text-xs font-bold text-slate-800 mt-2 line-clamp-1 cursor-pointer hover:text-rose-600"
                            >
                              {p.name}
                            </h5>
                            <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                              {firstVar?.name || '1kg'} • {p.category_name}
                            </p>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-2">
                            <span className="text-xs font-black text-rose-600">
                              {currency}{price}
                            </span>
                            <button
                              onClick={() => handleQuickAdd(p)}
                              className="bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white p-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                              title="Add to Cart"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Floating Bottom Cart Pill (if items exist) */}
              {cartCount > 0 && (
                <div className="absolute bottom-16 left-3 right-3 z-30 animate-in slide-in-from-bottom-2">
                  <div
                    onClick={onOpenCheckout}
                    className="bg-slate-900 text-white p-2.5 rounded-2xl shadow-xl flex items-center justify-between cursor-pointer hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-rose-600 flex items-center justify-center text-xs font-black">
                        {cartCount}
                      </div>
                      <div className="text-xs">
                        <span className="font-bold">View Cart &amp; Checkout</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-black text-amber-300">
                      <span>{currency}{cartSubtotal}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              )}

              {/* Bottom Navigation Bar */}
              <div className="bg-white border-t border-slate-200 px-4 py-2 flex items-center justify-around shrink-0 shadow-lg z-20">
                <button
                  onClick={() => setCustomerTab('home')}
                  className={`flex flex-col items-center gap-0.5 cursor-pointer ${
                    customerTab === 'home' ? 'text-rose-600 font-bold' : 'text-slate-400'
                  }`}
                >
                  <Home className="w-4 h-4" />
                  <span className="text-[9px]">Home</span>
                </button>

                <button
                  onClick={() => setCustomerTab('catalog')}
                  className={`flex flex-col items-center gap-0.5 cursor-pointer ${
                    customerTab === 'catalog' ? 'text-rose-600 font-bold' : 'text-slate-400'
                  }`}
                >
                  <Cake className="w-4 h-4" />
                  <span className="text-[9px]">Cakes</span>
                </button>

                <button
                  onClick={onOpenCustomCake}
                  className="flex flex-col items-center gap-0.5 text-amber-500 font-bold cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span className="text-[9px]">Custom</span>
                </button>

                <button
                  onClick={onOpenTrackOrder}
                  className={`flex flex-col items-center gap-0.5 cursor-pointer ${
                    customerTab === 'orders' ? 'text-rose-600 font-bold' : 'text-slate-400'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  <span className="text-[9px]">Track</span>
                </button>

                <button
                  onClick={onOpenCheckout}
                  className="flex flex-col items-center gap-0.5 text-slate-400 hover:text-rose-600 cursor-pointer relative"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span className="text-[9px]">Cart</span>
                  {cartCount > 0 && (
                    <span className="absolute -top-1 right-1 w-2 h-2 rounded-full bg-rose-600" />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ========================================================
              PERSONA 2: DELIVERY RIDER MOBILE APP
          ======================================================== */}
          {appRole === 'rider' && (
            <div className="flex-1 flex flex-col overflow-hidden bg-slate-100">
              {/* Rider Header */}
              <div className="bg-slate-900 text-white p-3.5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                    <Bike className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xs">Rider Rahim Mia #1</h3>
                    <p className="text-[10px] text-slate-400">Express Delivery Partner</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-full">
                    Active On Duty
                  </span>
                </div>
              </div>

              {/* Assigned Orders List */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                <div className="flex items-center justify-between px-0.5">
                  <h4 className="text-xs font-black uppercase text-slate-600">
                    My Assigned Deliveries ({orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled').length})
                  </h4>
                  <span className="text-[10px] text-slate-400">Tangail Town Zone</span>
                </div>

                {orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled').length === 0 ? (
                  <div className="bg-white p-8 rounded-2xl text-center text-xs text-slate-400 border border-slate-200">
                    No pending deliveries right now. You are all caught up!
                  </div>
                ) : (
                  orders
                    .filter((o) => o.status !== 'delivered' && o.status !== 'cancelled')
                    .map((order) => (
                      <div
                        key={order.id}
                        className="bg-white rounded-2xl p-3 border border-slate-200 shadow-xs space-y-3"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="font-mono text-xs font-bold text-rose-600">
                              {order.order_number}
                            </span>
                            <h5 className="font-black text-xs text-slate-900 mt-0.5">
                              {order.customer_name}
                            </h5>
                          </div>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                              order.status === 'out_for_delivery'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {order.status.replace('_', ' ')}
                          </span>
                        </div>

                        {/* Address & Call */}
                        <div className="text-xs text-slate-600 space-y-1 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                          <div className="flex items-start gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                            <p className="line-clamp-2">{order.delivery_address}</p>
                          </div>
                          <div className="flex items-center justify-between pt-1">
                            <a
                              href={`tel:${order.customer_phone}`}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg hover:bg-emerald-100"
                            >
                              <Phone className="w-3 h-3" />
                              <span>{order.customer_phone}</span>
                            </a>
                            <span className="text-[11px] font-bold text-slate-700">
                              Collect COD: {currency}{order.total_amount}
                            </span>
                          </div>
                        </div>

                        {/* Status Transition buttons */}
                        <div className="flex items-center gap-2 pt-1">
                          {order.status !== 'out_for_delivery' && (
                            <button
                              onClick={() =>
                                mockDb.updateOrderStatus(order.id, 'out_for_delivery', 'Rider on route with cake', 'Rahim Mia')
                              }
                              className="flex-1 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 cursor-pointer"
                            >
                              Start Route 🛵
                            </button>
                          )}

                          {/* OTP verification input */}
                          <div className="flex-1 flex items-center gap-1.5">
                            <input
                              type="text"
                              maxLength={4}
                              placeholder="4-digit OTP"
                              value={riderOtpInputs[order.id] || ''}
                              onChange={(e) =>
                                setRiderOtpInputs({ ...riderOtpInputs, [order.id]: e.target.value })
                              }
                              className="w-24 px-2 py-1.5 text-xs text-center font-mono rounded-xl border border-slate-300"
                            />
                            <button
                              onClick={() => handleVerifyOtp(order)}
                              className="flex-1 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 cursor-pointer"
                            >
                              Verify &amp; Done
                            </button>
                          </div>
                        </div>

                        {riderOtpErrors[order.id] && (
                          <p className="text-[10px] text-rose-600 font-semibold">
                            {riderOtpErrors[order.id]}
                          </p>
                        )}
                      </div>
                    ))
                )}
              </div>
            </div>
          )}

          {/* ========================================================
              PERSONA 3: KITCHEN DISPLAY APP (KDS)
          ======================================================== */}
          {appRole === 'kitchen' && (
            <div className="flex-1 flex flex-col overflow-hidden bg-slate-900 text-white">
              {/* KDS Header */}
              <div className="bg-slate-950 p-3 flex items-center justify-between border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-2">
                  <ChefHat className="w-5 h-5 text-rose-400" />
                  <div>
                    <h4 className="text-xs font-black">Bakery Kitchen Display</h4>
                    <p className="text-[10px] text-slate-400">Tangail Head Chef Screen</p>
                  </div>
                </div>
                <span className="text-[10px] bg-rose-500/20 text-rose-300 font-bold px-2 py-0.5 rounded-full">
                  Live Queue
                </span>
              </div>

              {/* Orders Queue */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {orders.filter((o) => o.status === 'pending' || o.status === 'confirmed' || o.status === 'preparing').length === 0 ? (
                  <div className="bg-slate-800/50 p-8 rounded-2xl text-center text-xs text-slate-400 border border-slate-800">
                    No tickets in kitchen queue right now.
                  </div>
                ) : (
                  orders
                    .filter((o) => o.status === 'pending' || o.status === 'confirmed' || o.status === 'preparing')
                    .map((ord) => (
                      <div
                        key={ord.id}
                        className="bg-slate-800 rounded-2xl p-3 border border-slate-700 space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono font-bold text-amber-400">
                            {ord.order_number}
                          </span>
                          <span className="text-[10px] uppercase font-bold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">
                            {ord.status}
                          </span>
                        </div>

                        {/* Items */}
                        <div className="space-y-1.5 text-xs">
                          {ord.items.map((it, idx) => (
                            <div key={idx} className="bg-slate-900/60 p-2 rounded-xl border border-slate-800">
                              <div className="flex justify-between font-bold text-slate-200">
                                <span>{it.quantity}x {it.product_name}</span>
                                <span className="text-rose-400">{it.variant_name}</span>
                              </div>
                              {it.writing_message && (
                                <p className="text-[11px] text-amber-300 italic mt-0.5">
                                  ✍️ Piped text: "{it.writing_message}"
                                </p>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Status progression */}
                        <div className="flex gap-2 pt-1">
                          {ord.status !== 'preparing' ? (
                            <button
                              onClick={() => mockDb.updateOrderStatus(ord.id, 'preparing', 'Baking started', 'Head Baker')}
                              className="flex-1 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                            >
                              Start Baking 🔥
                            </button>
                          ) : (
                            <button
                              onClick={() => mockDb.updateOrderStatus(ord.id, 'ready', 'Cake boxed and chilled', 'Head Baker')}
                              className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                            >
                              Mark Ready Boxed ✅
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          )}

          {/* ========================================================
              PERSONA 4: ADMIN MANAGER MOBILE APP
          ======================================================== */}
          {appRole === 'admin' && (
            <div className="flex-1 flex flex-col overflow-hidden bg-slate-100">
              {/* Header */}
              <div className="bg-slate-900 text-white p-3.5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <LayoutDashboard className="w-4 h-4 text-rose-400" />
                  <div>
                    <h4 className="text-xs font-black">Cake Shop Owner App</h4>
                    <p className="text-[10px] text-slate-400">Mobile Operations</p>
                  </div>
                </div>
                <button
                  onClick={onOpenSupabaseSync}
                  className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-full flex items-center gap-1 cursor-pointer"
                >
                  <Database className="w-3 h-3" />
                  <span>Sync DB</span>
                </button>
              </div>

              {/* KPIs & Controls */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white p-3 rounded-2xl border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Total Orders</span>
                    <h4 className="text-xl font-black text-slate-900 mt-0.5">{orders.length}</h4>
                  </div>
                  <div className="bg-white p-3 rounded-2xl border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Gross Revenue</span>
                    <h4 className="text-xl font-black text-rose-600 mt-0.5">
                      {currency}{orders.reduce((sum, o) => sum + (o.status !== 'cancelled' ? o.total_amount : 0), 0)}
                    </h4>
                  </div>
                </div>

                {/* Quick Toggle Store Accepting Orders */}
                <div className="bg-white p-3 rounded-2xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <h5 className="text-xs font-bold text-slate-900">Accepting Online Orders</h5>
                    <p className="text-[10px] text-slate-400">Live switch for customers</p>
                  </div>
                  <button
                    onClick={() =>
                      mockDb.updateShopSettings({ accepting_orders: !settings.accepting_orders })
                    }
                    className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                      settings.accepting_orders ? 'bg-emerald-500' : 'bg-slate-300'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white shadow-xs absolute top-0.5 transition-transform ${
                        settings.accepting_orders ? 'right-0.5' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>

                {/* Recent Orders List */}
                <div className="space-y-2">
                  <span className="text-xs font-black uppercase text-slate-600 px-0.5">
                    Recent Customer Orders
                  </span>

                  {orders.slice(0, 5).map((ord) => (
                    <div
                      key={ord.id}
                      className="bg-white p-3 rounded-2xl border border-slate-200 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-bold text-slate-900">{ord.customer_name}</span>
                        <p className="text-[10px] text-slate-400">{ord.order_number}</p>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-rose-600 block">{currency}{ord.total_amount}</span>
                        <span className="text-[9px] uppercase font-bold bg-slate-100 px-1.5 py-0.5 rounded-md">
                          {ord.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Phone Bottom Home Bar */}
          {isFramed && (
            <div className="h-4 bg-white flex items-center justify-center shrink-0">
              <div className="w-28 h-1 bg-slate-300 rounded-full" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
