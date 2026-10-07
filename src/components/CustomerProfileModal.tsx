import React, { useState, useEffect } from 'react';
import { 
  X, 
  User, 
  RotateCcw, 
  Clock, 
  Calendar,
  MapPin, 
  Phone, 
  Mail, 
  CheckCircle2, 
  ShieldCheck, 
  ShoppingBag, 
  Sparkles, 
  Key, 
  Star, 
  ChevronRight, 
  ExternalLink, 
  Edit2, 
  Save, 
  Receipt,
  ArrowRight,
  PackageCheck,
  RefreshCw
} from 'lucide-react';
import { Order, OrderStatus, Product, CartItem } from '../types';
import { mockDb } from '../services/mockDatabase';

interface CustomerProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
  products: Product[];
  currency: string;
  onReorder: (order: Order) => void;
  onTrackOrder: (orderId: string) => void;
}

export const CustomerProfileModal: React.FC<CustomerProfileModalProps> = ({
  isOpen,
  onClose,
  orders,
  products,
  currency,
  onReorder,
  onTrackOrder,
}) => {
  if (!isOpen) return null;

  // Active Tab: default to Recent Orders
  const [activeTab, setActiveTab] = useState<'orders' | 'profile'>('orders');

  // Asynchronous fetching state for user's past orders
  const [userOrders, setUserOrders] = useState<Order[]>(orders || []);
  const [isFetchingOrders, setIsFetchingOrders] = useState<boolean>(false);

  // Fetch past orders from database / cache upon modal open
  useEffect(() => {
    if (isOpen) {
      setIsFetchingOrders(true);
      try {
        const fetched = mockDb.getOrders();
        setUserOrders(fetched && fetched.length > 0 ? fetched : orders);
      } catch {
        setUserOrders(orders);
      } finally {
        setIsFetchingOrders(false);
      }
    }
  }, [isOpen, orders]);

  // Customer Profile State
  const [customerName, setCustomerName] = useState('Tanvir Rahman');
  const [customerPhone, setCustomerPhone] = useState('+880 1712-345678');
  const [customerEmail, setCustomerEmail] = useState('tanvir.tangail@gmail.com');
  const [savedAddress, setSavedAddress] = useState('House #24, Road #3, Akur Takur Para, Tangail');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState<string | null>(null);

  // Filter orders: all, active, delivered
  const [orderFilter, setOrderFilter] = useState<'all' | 'active' | 'delivered'>('all');

  // Review Form Modal inside Profile
  const [reviewOrder, setReviewOrder] = useState<Order | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  // Reorder notification toast
  const [reorderedOrderId, setReorderedOrderId] = useState<string | null>(null);
  const [reorderNotification, setReorderNotification] = useState<string | null>(null);

  const filteredOrders = userOrders.filter((o) => {
    if (orderFilter === 'active') {
      return o.status !== 'delivered' && o.status !== 'cancelled';
    }
    if (orderFilter === 'delivered') {
      return o.status === 'delivered';
    }
    return true;
  });

  // Calculate summary metrics
  const totalSpent = userOrders.reduce((sum, o) => sum + (o.status !== 'cancelled' ? o.total_amount : 0), 0);
  const activeOrdersCount = userOrders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled').length;

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setIsEditingProfile(false);
    setProfileSuccessMsg('Profile information updated successfully!');
    setTimeout(() => setProfileSuccessMsg(null), 2500);
  };

  const handleReorderClick = (order: Order) => {
    setReorderedOrderId(order.id);
    const itemCount = order.items.reduce((sum, it) => sum + it.quantity, 0);
    setReorderNotification(`Reordered: ${itemCount} ${itemCount === 1 ? 'item' : 'items'} added to your cart!`);

    // Automatically adds the items to cart via onReorder
    onReorder(order);

    setTimeout(() => {
      setReorderedOrderId(null);
      setReorderNotification(null);
      onClose();
    }, 600);
  };

  const handleSubmitReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewOrder) return;

    const firstItem = reviewOrder.items[0];
    if (firstItem) {
      mockDb.addReview({
        product_id: firstItem.product_id,
        product_name: firstItem.product_name,
        customer_name: customerName,
        rating: reviewRating,
        comment: reviewComment || 'Exquisite taste and timely delivery in Tangail!',
      });
    }

    setReviewSubmitted(true);
    setTimeout(() => {
      setReviewSubmitted(false);
      setReviewOrder(null);
      setReviewComment('');
    }, 1500);
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'delivered':
        return { 
          bg: 'bg-emerald-100 text-emerald-800 border-emerald-200', 
          dot: 'bg-emerald-500', 
          label: 'Delivered' 
        };
      case 'out_for_delivery':
        return { 
          bg: 'bg-sky-100 text-sky-800 border-sky-200 animate-pulse', 
          dot: 'bg-sky-500', 
          label: 'Out for Delivery' 
        };
      case 'preparing':
        return { 
          bg: 'bg-rose-100 text-rose-800 border-rose-200', 
          dot: 'bg-rose-500', 
          label: 'In the Oven (Baking)' 
        };
      case 'ready':
        return { 
          bg: 'bg-teal-100 text-teal-800 border-teal-200', 
          dot: 'bg-teal-500', 
          label: 'Boxed & Ready' 
        };
      case 'assigned':
        return { 
          bg: 'bg-indigo-100 text-indigo-800 border-indigo-200', 
          dot: 'bg-indigo-500', 
          label: 'Rider Assigned' 
        };
      case 'confirmed':
        return { 
          bg: 'bg-amber-100 text-amber-800 border-amber-200', 
          dot: 'bg-amber-500', 
          label: 'Confirmed' 
        };
      case 'cancelled':
        return { 
          bg: 'bg-red-100 text-red-800 border-red-200', 
          dot: 'bg-red-500', 
          label: 'Cancelled' 
        };
      default:
        return { 
          bg: 'bg-slate-100 text-slate-800 border-slate-200', 
          dot: 'bg-slate-400', 
          label: 'Pending' 
        };
    }
  };

  const formatOrderDate = (dateString: string) => {
    try {
      const d = new Date(dateString);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }) + ' at ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div 
        className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-rose-100 overflow-hidden my-6 flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Profile Header */}
        <div className="p-6 bg-gradient-to-r from-rose-950 via-slate-900 to-rose-900 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-rose-500 to-amber-500 flex items-center justify-center text-white text-2xl font-black shadow-lg border-2 border-white/20">
              TR
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-black text-white">{customerName}</h3>
                <span className="bg-amber-400 text-slate-900 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 shadow-xs">
                  <Sparkles className="w-2.5 h-2.5" /> VIP Member
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 flex items-center gap-2">
                <span>{customerPhone}</span>
                <span>•</span>
                <span className="text-emerald-400 font-semibold">Phone Verified (OTP)</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer self-end sm:self-center"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Metrics Bar */}
        <div className="grid grid-cols-3 gap-2 px-6 py-3 bg-slate-50 border-b border-slate-200/80 text-xs">
          <div className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Total Orders</span>
            <span className="text-base font-black text-slate-800">{userOrders.length}</span>
          </div>
          <div className="space-y-0.5 border-l border-slate-200 pl-3">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Total Spent</span>
            <span className="text-base font-black text-rose-600">{currency}{totalSpent.toLocaleString()}</span>
          </div>
          <div className="space-y-0.5 border-l border-slate-200 pl-3">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Active Deliveries</span>
            <span className="text-base font-black text-sky-600">{activeOrdersCount} in progress</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('orders')}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                activeTab === 'orders'
                  ? 'border-rose-600 text-rose-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Recent Orders ({userOrders.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('profile')}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                activeTab === 'profile'
                  ? 'border-rose-600 text-rose-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <User className="w-4 h-4" />
              <span>Customer Details & Address</span>
            </button>
          </div>

          {activeTab === 'orders' && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs">
              <span className="text-slate-400 text-[11px] font-medium">Filter:</span>
              {(['all', 'active', 'delivered'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setOrderFilter(f)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold capitalize transition-colors cursor-pointer ${
                    orderFilter === f
                      ? 'bg-rose-100 text-rose-800'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="overflow-y-auto p-6 space-y-6 flex-1">
          {/* Reorder Toast Banner */}
          {reorderNotification && (
            <div className="bg-emerald-600 text-white p-3.5 rounded-2xl shadow-lg flex items-center justify-between text-xs font-bold animate-fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-200 shrink-0" />
                <span>{reorderNotification}</span>
              </div>
              <span className="text-[11px] underline">Opening bag...</span>
            </div>
          )}

          {/* TAB 1: RECENT ORDERS SECTION */}
          {activeTab === 'orders' && (
            <section aria-label="Recent Orders" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                    <span>Recent Orders</span>
                    <span className="text-xs bg-rose-100 text-rose-800 px-2.5 py-0.5 rounded-full font-bold">
                      {filteredOrders.length}
                    </span>
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    View your past order summaries, current status, total price, and order dates with 1-click reorder.
                  </p>
                </div>

                {isFetchingOrders && (
                  <div className="flex items-center gap-1.5 text-xs text-rose-600 font-semibold animate-pulse">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Fetching orders...</span>
                  </div>
                )}
              </div>

              {filteredOrders.length === 0 ? (
                <div className="text-center py-16 bg-slate-50 rounded-3xl border border-slate-200/80 p-8 space-y-3">
                  <div className="w-16 h-16 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mx-auto text-2xl shadow-xs">
                    🎂
                  </div>
                  <h4 className="font-bold text-slate-800 text-base">No orders found</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    You haven't placed an order matching this filter yet. Explore our handcrafted celebration cakes!
                  </p>
                  <button
                    onClick={() => {
                      onClose();
                      window.scrollTo({ top: 300, behavior: 'smooth' });
                    }}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 px-4 py-2.5 rounded-xl transition-colors cursor-pointer"
                  >
                    <span>Browse Fresh Cakes</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredOrders.map((order) => {
                    const statusInfo = getStatusBadge(order.status);
                    const isDelivered = order.status === 'delivered';
                    const isReordered = reorderedOrderId === order.id;
                    const itemCount = order.items.reduce((sum, it) => sum + it.quantity, 0);

                    return (
                      <div
                        key={order.id}
                        className="bg-white rounded-3xl border border-slate-200 hover:border-rose-300 shadow-xs hover:shadow-md transition-all p-5 space-y-4 relative overflow-hidden"
                      >
                        {/* Header: Order Number, Date, Status Badge, Total Price */}
                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 pb-3.5">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-black text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded-md">
                                #{order.order_number}
                              </span>
                              
                              {/* Order Status */}
                              <span
                                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 ${statusInfo.bg}`}
                                title={`Status: ${statusInfo.label}`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                                <span>Status: {statusInfo.label}</span>
                              </span>
                            </div>

                            {/* Order Date */}
                            <div className="text-[11px] text-slate-600 flex items-center gap-2 pt-0.5">
                              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>Order Date: <strong className="text-slate-800">{formatOrderDate(order.created_at)}</strong></span>
                              <span>•</span>
                              <span className="text-slate-400">Slot: {order.delivery_slot.split(' ')[0]}</span>
                            </div>
                          </div>

                          {/* Total Price */}
                          <div className="text-left sm:text-right">
                            <span className="text-[10px] text-slate-400 uppercase font-semibold block">Total Price</span>
                            <span className="text-xl font-black text-rose-600 block leading-tight">
                              {currency}{order.total_amount.toLocaleString()}
                            </span>
                            <span className="text-[10px] text-slate-400 uppercase font-medium">
                              {order.payment_method} ({order.payment_status})
                            </span>
                          </div>
                        </div>

                        {/* Order Items Breakdown */}
                        <div className="space-y-2">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                            Order Summary ({itemCount} {itemCount === 1 ? 'item' : 'items'})
                          </span>

                          <div className="space-y-2">
                            {order.items.map((item) => (
                              <div
                                key={item.id}
                                className="bg-slate-50/80 p-3 rounded-2xl border border-slate-100 text-xs space-y-1.5"
                              >
                                <div className="flex justify-between items-start">
                                  <div>
                                    <h5 className="font-bold text-slate-900 leading-tight">
                                      {item.quantity}x {item.product_name}
                                    </h5>
                                    <div className="text-[11px] text-rose-600 font-semibold mt-0.5">
                                      Size: {item.variant_name}
                                      {item.flavor_name && (
                                        <span className="text-slate-600 font-normal"> • Flavor: {item.flavor_name}</span>
                                      )}
                                    </div>
                                  </div>
                                  <span className="font-bold text-slate-800">
                                    {currency}{item.subtotal}
                                  </span>
                                </div>

                                {/* Cake Dedication Message */}
                                {item.writing_message && (
                                  <div className="text-[11px] bg-amber-50 text-amber-900 px-2.5 py-1 rounded-lg border border-amber-200 font-medium">
                                    ✍️ Piped Dedication: "{item.writing_message}"
                                  </div>
                                )}

                                {/* Addons */}
                                {item.addons && item.addons.length > 0 && (
                                  <div className="text-[10px] text-slate-500 pl-2 border-l-2 border-rose-200">
                                    Add-ons: {item.addons.map((a) => `${a.addon_name} (+${currency}${a.unit_price})`).join(', ')}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Delivery Location & Secret OTP */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-rose-50/40 p-3 rounded-2xl border border-rose-100 text-xs">
                          <div className="flex items-start gap-2 text-slate-600">
                            <MapPin className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-semibold text-slate-800">{order.delivery_address}</span>
                              <span className="text-[10px] text-slate-500 block">
                                Zone: {order.delivery_zone.name}
                              </span>
                            </div>
                          </div>

                          <div className="bg-white px-3 py-1.5 rounded-xl border border-amber-300 flex items-center gap-2 shrink-0">
                            <Key className="w-3.5 h-3.5 text-amber-600" />
                            <span className="text-[11px] font-bold text-slate-700">Delivery OTP:</span>
                            <span className="font-mono text-sm font-black text-amber-900 tracking-wider">
                              {order.delivery_otp}
                            </span>
                          </div>
                        </div>

                        {/* Action Buttons: Reorder, Live Tracker, Review */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
                          <div className="flex items-center gap-2">
                            {/* Live Tracker Button */}
                            <button
                              onClick={() => {
                                onClose();
                                onTrackOrder(order.id);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                            >
                              <ExternalLink className="w-3.5 h-3.5 text-rose-600" />
                              <span>Live Tracker</span>
                            </button>

                            {/* Review Button if Delivered */}
                            {isDelivered && (
                              <button
                                onClick={() => setReviewOrder(order)}
                                className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                              >
                                <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
                                <span>Leave Review</span>
                              </button>
                            )}
                          </div>

                          {/* REORDER BUTTON */}
                          <button
                            onClick={() => handleReorderClick(order)}
                            disabled={isReordered}
                            aria-label="Reorder"
                            title="Reorder this past order"
                            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer active:scale-95 ${
                              isReordered
                                ? 'bg-emerald-600 text-white shadow-emerald-200 animate-pulse'
                                : 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-200'
                            }`}
                          >
                            <RotateCcw className={`w-3.5 h-3.5 ${isReordered ? 'animate-spin' : ''}`} />
                            <span>{isReordered ? 'Added to Cart!' : 'Reorder'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* TAB 2: PROFILE & SAVED ADDRESS */}
          {activeTab === 'profile' && (
            <div className="space-y-6 max-w-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-base">Your Customer Details</h4>
                  <p className="text-xs text-slate-500">
                    Used automatically for rapid one-click checkout and OTP delivery confirmation.
                  </p>
                </div>
                {!isEditingProfile && (
                  <button
                    onClick={() => setIsEditingProfile(true)}
                    className="flex items-center gap-1.5 text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 px-3 py-1.5 rounded-xl cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit Profile</span>
                  </button>
                )}
              </div>

              {profileSuccessMsg && (
                <div className="bg-emerald-50 text-emerald-700 p-3 rounded-xl border border-emerald-200 text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{profileSuccessMsg}</span>
                </div>
              )}

              <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Full Name</label>
                  <input
                    type="text"
                    disabled={!isEditingProfile}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 disabled:bg-slate-50 disabled:text-slate-600 font-semibold text-slate-900"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Mobile Phone (OTP Verification)</label>
                  <input
                    type="tel"
                    disabled={!isEditingProfile}
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 disabled:bg-slate-50 disabled:text-slate-600 font-semibold text-slate-900"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Email Address</label>
                  <input
                    type="email"
                    disabled={!isEditingProfile}
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 disabled:bg-slate-50 disabled:text-slate-600 font-semibold text-slate-900"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Default Delivery Address</label>
                  <textarea
                    rows={2}
                    disabled={!isEditingProfile}
                    value={savedAddress}
                    onChange={(e) => setSavedAddress(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 disabled:bg-slate-50 disabled:text-slate-600 font-semibold text-slate-900"
                  />
                </div>

                {isEditingProfile && (
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingProfile(false)}
                      className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Save className="w-4 h-4" />
                      <span>Save Changes</span>
                    </button>
                  </div>
                )}
              </form>

              {/* VIP Club Perks */}
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-3xl p-5 space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  <h5 className="font-bold text-amber-950 text-sm">SweetDelight VIP Perks</h5>
                </div>
                <p className="text-xs text-amber-900/80 leading-relaxed">
                  You earn <strong>5% SweetCash points</strong> on every completed delivery. Use coupon codes <strong>WELCOME100</strong> or <strong>BIRTHDAY10</strong> at checkout anytime!
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* REVIEW SUBMISSION MODAL */}
      {reviewOrder && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900 text-base">Rate Your Cake Experience</h4>
              <button
                onClick={() => setReviewOrder(null)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {reviewSubmitted ? (
              <div className="py-8 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto text-2xl font-bold">
                  ✓
                </div>
                <h5 className="font-bold text-slate-900 text-sm">Thank You for Your Review!</h5>
                <p className="text-xs text-slate-500">
                  Your feedback helps other celebration planners in Tangail find their perfect cake.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitReview} className="space-y-4 text-xs">
                <div>
                  <span className="text-slate-500 block mb-1">Item:</span>
                  <span className="font-bold text-slate-900 text-sm">
                    {reviewOrder.items[0]?.product_name}
                  </span>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Your Rating</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setReviewRating(star)}
                        className="p-1 hover:scale-110 transition-transform cursor-pointer"
                      >
                        <Star
                          className={`w-6 h-6 ${
                            reviewRating >= star
                              ? 'text-amber-400 fill-amber-400'
                              : 'text-slate-300'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Review Comment</label>
                  <textarea
                    rows={3}
                    required
                    placeholder="How was the flavor, sponge texture, delivery, and cake writing?"
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-slate-800"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setReviewOrder(null)}
                    className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-md cursor-pointer"
                  >
                    Submit Review
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
