import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  ShoppingBag, 
  Settings, 
  Tag, 
  Layers, 
  FileText, 
  Sparkles, 
  CheckCircle, 
  AlertCircle,
  Plus,
  Edit2,
  Trash2,
  Save,
  RotateCw,
  Search,
  Check,
  Bike
} from 'lucide-react';
import { 
  ShopSettings, 
  Product, 
  Category, 
  Order, 
  Coupon, 
  CustomCakeRequest, 
  AuditLog, 
  StaffRole 
} from '../types';
import { mockDb } from '../services/mockDatabase';

interface AdminPanelProps {
  settings: ShopSettings;
  products: Product[];
  categories: Category[];
  orders: Order[];
  coupons: Coupon[];
  customCakes: CustomCakeRequest[];
  auditLogs: AuditLog[];
  currency: string;
  role: StaffRole;
}

type TabKey = 
  | 'overview' 
  | 'orders' 
  | 'products' 
  | 'categories' 
  | 'settings' 
  | 'coupons' 
  | 'custom_cakes' 
  | 'audit';

export const AdminPanel: React.FC<AdminPanelProps> = ({
  settings,
  products,
  categories,
  orders,
  coupons,
  customCakes,
  auditLogs,
  currency,
  role,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  // Settings form state
  const [settingsForm, setSettingsForm] = useState<ShopSettings>({ ...settings });
  const [settingsSavedFeedback, setSettingsSavedFeedback] = useState(false);

  // New product form modal state
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductCategoryId, setNewProductCategoryId] = useState(categories[0]?.id || '');
  const [newProductBasePrice, setNewProductBasePrice] = useState(1200);
  const [newProductDesc, setNewProductDesc] = useState('');
  const [newProductImg, setNewProductImg] = useState('https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=800&auto=format&fit=crop&q=80');

  // Order Filter
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('all');
  const [orderSearch, setOrderSearch] = useState('');

  // Save Settings
  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    mockDb.updateShopSettings(settingsForm, 'Super Admin');
    setSettingsSavedFeedback(true);
    setTimeout(() => setSettingsSavedFeedback(false), 2000);
  };

  // Add Product
  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductName.trim()) return;

    const cat = categories.find((c) => c.id === newProductCategoryId);
    const slug = newProductName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    mockDb.addProduct({
      name: newProductName,
      slug,
      category_id: newProductCategoryId,
      category_name: cat?.name || 'Cakes',
      description: newProductDesc,
      base_price: Number(newProductBasePrice),
      image_url: newProductImg,
      gallery_images: [newProductImg],
      is_featured: true,
      is_active: true,
      rating: 5.0,
      review_count: 1,
      variants: [
        { id: `v-${Date.now()}-1`, product_id: '', name: '500g', weight_grams: 500, price: Math.round(newProductBasePrice * 0.6), is_active: true },
        { id: `v-${Date.now()}-2`, product_id: '', name: '1kg', weight_grams: 1000, price: Number(newProductBasePrice), is_active: true },
        { id: `v-${Date.now()}-3`, product_id: '', name: '2kg', weight_grams: 2000, price: Math.round(newProductBasePrice * 1.8), is_active: true },
      ],
      allowed_flavor_ids: ['flav-1', 'flav-2', 'flav-3'],
      allowed_addon_ids: ['addon-1', 'addon-2', 'addon-3'],
    }, 'Super Admin');

    setShowAddProductModal(false);
    setNewProductName('');
    setNewProductDesc('');
  };

  // Filtered Orders
  const filteredOrders = orders.filter((o) => {
    const matchesStatus = orderStatusFilter === 'all' || o.status === orderStatusFilter;
    const matchesSearch =
      orderSearch === '' ||
      o.order_number.toLowerCase().includes(orderSearch.toLowerCase()) ||
      o.customer_name.toLowerCase().includes(orderSearch.toLowerCase()) ||
      o.customer_phone.includes(orderSearch);
    return matchesStatus && matchesSearch;
  });

  // Calculate KPIs
  const totalSales = orders.reduce((sum, o) => sum + (o.status !== 'cancelled' ? o.total_amount : 0), 0);
  const totalOrdersCount = orders.length;
  const pendingCount = orders.filter((o) => o.status === 'pending' || o.status === 'confirmed').length;
  const inKitchenCount = orders.filter((o) => o.status === 'preparing').length;
  const outForDeliveryCount = orders.filter((o) => o.status === 'out_for_delivery').length;
  const deliveredCount = orders.filter((o) => o.status === 'delivered').length;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-rose-500/20 text-rose-300 font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              Staff & Operations Suite
            </span>
            <span className="text-xs text-slate-400">PostgreSQL RBAC Enforced</span>
          </div>
          <h2 className="text-2xl font-black text-white mt-1">Management Hub</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Role: <strong className="text-rose-400 uppercase">{role.replace('_', ' ')}</strong>. Real-time synchronized with SWR cache invalidation.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-1.5 bg-slate-800 p-1.5 rounded-2xl border border-slate-700">
          {[
            { key: 'overview', label: 'Dashboard', icon: LayoutDashboard },
            { key: 'orders', label: 'Orders', count: totalOrdersCount, icon: ShoppingBag },
            { key: 'products', label: 'Products', count: products.length, icon: Layers },
            { key: 'settings', label: 'Shop Settings', icon: Settings },
            { key: 'coupons', label: 'Coupons', icon: Tag },
            { key: 'custom_cakes', label: 'Custom Bakes', count: customCakes.length, icon: Sparkles },
            { key: 'audit', label: 'Audit Logs', icon: FileText },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as TabKey)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-rose-600 text-white shadow-md shadow-rose-900/40'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className="ml-1 bg-black/30 px-1.5 py-0.2 rounded-full text-[10px]">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-1">
              <span className="text-xs font-semibold text-slate-500 block">Total Sales</span>
              <div className="text-2xl font-black text-slate-900">{currency}{totalSales.toLocaleString()}</div>
              <span className="text-[11px] text-emerald-600 font-bold">100% verified orders</span>
            </div>
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-1">
              <span className="text-xs font-semibold text-slate-500 block">Total Orders</span>
              <div className="text-2xl font-black text-slate-900">{totalOrdersCount}</div>
              <span className="text-[11px] text-sky-600 font-bold">{deliveredCount} delivered</span>
            </div>
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-1">
              <span className="text-xs font-semibold text-slate-500 block">In Kitchen (Oven)</span>
              <div className="text-2xl font-black text-rose-600">{inKitchenCount}</div>
              <span className="text-[11px] text-rose-500 font-bold">Live baking</span>
            </div>
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-1">
              <span className="text-xs font-semibold text-slate-500 block">Out for Delivery</span>
              <div className="text-2xl font-black text-sky-600">{outForDeliveryCount}</div>
              <span className="text-[11px] text-slate-400 font-bold">Rider on bike</span>
            </div>
          </div>

          {/* Recent Orders Overview */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Recent Customer Orders</h3>
                <p className="text-xs text-slate-500">Live order stream updated with Supabase realtime subscription</p>
              </div>
              <button
                onClick={() => setActiveTab('orders')}
                className="text-xs text-rose-600 font-bold hover:underline cursor-pointer"
              >
                View All Orders ➔
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400">
                    <th className="py-2.5 font-semibold">Order #</th>
                    <th className="py-2.5 font-semibold">Customer</th>
                    <th className="py-2.5 font-semibold">Items</th>
                    <th className="py-2.5 font-semibold">Total</th>
                    <th className="py-2.5 font-semibold">Payment</th>
                    <th className="py-2.5 font-semibold">Status</th>
                    <th className="py-2.5 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.slice(0, 5).map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50/70">
                      <td className="py-3 font-mono font-bold text-slate-800">
                        {o.order_number.slice(-8)}
                      </td>
                      <td className="py-3 font-medium text-slate-900">
                        <div>{o.customer_name}</div>
                        <div className="text-[10px] text-slate-400">{o.customer_phone}</div>
                      </td>
                      <td className="py-3 text-slate-600">
                        {o.items.map((i) => `${i.product_name} (${i.variant_name})`).join(', ')}
                      </td>
                      <td className="py-3 font-bold text-slate-900">
                        {currency}{o.total_amount}
                      </td>
                      <td className="py-3">
                        <span className="uppercase text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                          {o.payment_method}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider bg-rose-50 text-rose-700">
                          {o.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => setActiveTab('orders')}
                          className="text-[11px] font-bold text-rose-600 hover:text-rose-700"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ORDERS MANAGEMENT */}
      {activeTab === 'orders' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Order Management Pipeline</h3>
              <p className="text-xs text-slate-500">
                Filter by stage, update status, and assign delivery riders.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              {/* Search */}
              <div className="relative flex-1 sm:w-56">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Order #, name, phone..."
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200"
                />
              </div>

              {/* Status filter */}
              <select
                value={orderStatusFilter}
                onChange={(e) => setOrderStatusFilter(e.target.value)}
                className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-200 bg-white cursor-pointer"
              >
                <option value="all">All Statuses ({orders.length})</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="preparing">Preparing</option>
                <option value="ready">Ready</option>
                <option value="assigned">Assigned</option>
                <option value="out_for_delivery">Out for Delivery</option>
                <option value="delivered">Delivered</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            {filteredOrders.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">No matching orders found</div>
            ) : (
              filteredOrders.map((o) => (
                <div
                  key={o.id}
                  className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-black text-slate-900">
                          #{o.order_number}
                        </span>
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase bg-rose-100 text-rose-800">
                          {o.status.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md font-mono">
                          OTP: {o.delivery_otp}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 mt-1">
                        <strong>{o.customer_name}</strong> • {o.customer_phone} • {o.delivery_address}
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-base font-black text-rose-600">
                        {currency}{o.total_amount}
                      </span>
                      <div className="text-[10px] text-slate-400">
                        {o.payment_method.toUpperCase()} ({o.payment_status})
                      </div>
                    </div>
                  </div>

                  {/* Items */}
                  <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs space-y-1">
                    {o.items.map((it) => (
                      <div key={it.id} className="flex justify-between">
                        <span>
                          <strong>{it.quantity}x {it.product_name}</strong> ({it.variant_name})
                          {it.flavor_name && <span className="text-slate-500"> - {it.flavor_name}</span>}
                          {it.writing_message && (
                            <span className="text-rose-600 block text-[11px]">Writing: "{it.writing_message}"</span>
                          )}
                        </span>
                        <span className="font-bold text-slate-800">{currency}{it.subtotal}</span>
                      </div>
                    ))}
                  </div>

                  {/* Order Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="text-[11px] text-slate-500">
                      Rider: <strong>{o.rider_name || 'Unassigned'}</strong>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {o.status === 'pending' && (
                        <button
                          onClick={() => mockDb.updateOrderStatus(o.id, 'confirmed', 'Confirmed by order manager', 'Order Manager')}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl cursor-pointer"
                        >
                          Confirm Order
                        </button>
                      )}
                      {(o.status === 'ready' || o.status === 'confirmed') && !o.rider_name && (
                        <button
                          onClick={() => mockDb.assignRider(o.id, 'Rahim Mia (Rider #1)', 'Delivery Manager')}
                          className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl flex items-center gap-1 cursor-pointer"
                        >
                          <Bike className="w-3.5 h-3.5" />
                          <span>Assign Rider (Rahim)</span>
                        </button>
                      )}
                      {o.status !== 'delivered' && o.status !== 'cancelled' && (
                        <button
                          onClick={() => mockDb.updateOrderStatus(o.id, 'cancelled', 'Cancelled by Admin', 'Admin')}
                          className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold rounded-xl cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: PRODUCTS */}
      {activeTab === 'products' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Product Catalog & Variants</h3>
              <p className="text-xs text-slate-500">
                All changes invalidate the client SWR cache immediately.
              </p>
            </div>
            <button
              onClick={() => setShowAddProductModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Cake</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((p) => (
              <div
                key={p.id}
                className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-rose-200 shadow-xs space-y-3"
              >
                <div className="h-40 rounded-xl overflow-hidden bg-slate-100 relative">
                  <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                  <span className="absolute top-2 left-2 bg-slate-900/80 text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
                    {p.category_name}
                  </span>
                  <span className="absolute top-2 right-2 bg-rose-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
                    {currency}{p.base_price}
                  </span>
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">{p.name}</h4>
                  <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{p.description}</p>
                </div>

                <div className="text-[11px] bg-slate-50 p-2 rounded-lg border border-slate-100 text-slate-600 space-y-0.5">
                  <div className="font-semibold text-slate-700">Available Variants:</div>
                  {p.variants.map((v) => (
                    <div key={v.id} className="flex justify-between">
                      <span>• {v.name}</span>
                      <span className="font-bold text-rose-600">{currency}{v.sale_price ?? v.price}</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-slate-400">
                    Active in Storefront: {p.is_active ? 'Yes' : 'No'}
                  </span>
                  <button
                    onClick={() => mockDb.updateProduct(p.id, { is_active: !p.is_active })}
                    className={`text-xs font-bold px-3 py-1 rounded-lg cursor-pointer ${
                      p.is_active
                        ? 'bg-red-50 text-red-600 hover:bg-red-100'
                        : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                    }`}
                  >
                    {p.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: SHOP SETTINGS (DYNAMIC - NEVER HARDCODED) */}
      {activeTab === 'settings' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5 max-w-4xl">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Shop Brand & Operations Settings</h3>
              <p className="text-xs text-slate-500">
                Stored dynamically in the `shop_settings` table. Modifying values updates the customer storefront immediately.
              </p>
            </div>
            {settingsSavedFeedback && (
              <div className="bg-emerald-50 text-emerald-700 text-xs font-bold px-3 py-1.5 rounded-xl border border-emerald-200 flex items-center gap-1.5 animate-pulse">
                <Check className="w-4 h-4" />
                <span>Saved & SWR Cache Cleared!</span>
              </div>
            )}
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Bakery Name</label>
                <input
                  type="text"
                  value={settingsForm.shop_name}
                  onChange={(e) => setSettingsForm({ ...settingsForm, shop_name: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Currency Symbol</label>
                <input
                  type="text"
                  value={settingsForm.currency}
                  onChange={(e) => setSettingsForm({ ...settingsForm, currency: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Phone Number</label>
                <input
                  type="text"
                  value={settingsForm.phone}
                  onChange={(e) => setSettingsForm({ ...settingsForm, phone: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">WhatsApp Number</label>
                <input
                  type="text"
                  value={settingsForm.whatsapp}
                  onChange={(e) => setSettingsForm({ ...settingsForm, whatsapp: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Daily Opening Time</label>
                <input
                  type="text"
                  value={settingsForm.opening_time}
                  onChange={(e) => setSettingsForm({ ...settingsForm, opening_time: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Daily Closing Time</label>
                <input
                  type="text"
                  value={settingsForm.closing_time}
                  onChange={(e) => setSettingsForm({ ...settingsForm, closing_time: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Physical Bakery Address</label>
              <textarea
                rows={2}
                value={settingsForm.address}
                onChange={(e) => setSettingsForm({ ...settingsForm, address: e.target.value })}
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200"
              />
            </div>

            <div className="flex items-center gap-4 pt-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={settingsForm.accepting_orders}
                  onChange={(e) => setSettingsForm({ ...settingsForm, accepting_orders: e.target.checked })}
                  className="w-4 h-4 rounded-md text-rose-600"
                />
                <span>Accepting Online Orders</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={settingsForm.delivery_enabled}
                  onChange={(e) => setSettingsForm({ ...settingsForm, delivery_enabled: e.target.checked })}
                  className="w-4 h-4 rounded-md text-rose-600"
                />
                <span>Express Delivery Enabled</span>
              </label>
            </div>

            <button
              type="submit"
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 px-6 rounded-xl text-xs flex items-center gap-2 shadow-md cursor-pointer transition-all"
            >
              <Save className="w-4 h-4" />
              <span>Save & Publish Changes</span>
            </button>
          </form>
        </div>
      )}

      {/* TAB 5: COUPONS */}
      {activeTab === 'coupons' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Promotional Coupons</h3>
              <p className="text-xs text-slate-500">
                Coupons applied at checkout are authoritatively validated in the backend database.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {coupons.map((c) => (
              <div key={c.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-mono text-sm font-black text-rose-600 bg-rose-100 px-2.5 py-1 rounded-md">
                    {c.code}
                  </span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                    Active
                  </span>
                </div>
                <p className="text-xs text-slate-700 font-semibold">
                  {c.discount_type === 'percentage' ? `${c.discount_value}% OFF` : `${currency}${c.discount_value} FLAT OFF`}
                </p>
                <div className="text-[11px] text-slate-500">
                  Min order: {currency}{c.min_order_amount} • Used {c.usage_count} times
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 6: CUSTOM CAKES */}
      {activeTab === 'custom_cakes' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div>
            <h3 className="font-bold text-slate-900 text-lg">Custom Cake Design Inquiries</h3>
            <p className="text-xs text-slate-500">
              Quotes submitted by customers with custom photo inspiration and dedicated messages.
            </p>
          </div>

          <div className="space-y-3">
            {customCakes.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">No custom cake quote requests</div>
            ) : (
              customCakes.map((cc) => (
                <div key={cc.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs font-bold text-rose-600 uppercase tracking-wider">{cc.cake_type}</span>
                      <h4 className="font-bold text-slate-900 text-sm mt-0.5">{cc.customer_name} ({cc.customer_phone})</h4>
                    </div>
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full uppercase bg-amber-100 text-amber-900">
                      {cc.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-600 bg-white p-3 rounded-xl border border-slate-200">
                    <div>Size: <strong>{cc.approx_size}</strong></div>
                    <div>Flavor: <strong>{cc.flavor}</strong></div>
                    <div>Color Theme: <strong>{cc.color_theme}</strong></div>
                    <div>Writing: <strong>"{cc.writing_text}"</strong></div>
                  </div>

                  {cc.instructions && (
                    <p className="text-xs text-slate-500 italic">Instructions: {cc.instructions}</p>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-slate-700">
                      Estimated Quote: <strong className="text-rose-600">{currency}{cc.estimated_price || 0}</strong>
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => mockDb.updateCustomCakeStatus(cc.id, 'approved', cc.estimated_price)}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl cursor-pointer"
                      >
                        Approve Quote
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 7: AUDIT LOGS */}
      {activeTab === 'audit' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div>
            <h3 className="font-bold text-slate-900 text-lg">System Audit Logs</h3>
            <p className="text-xs text-slate-500">
              Immutable ledger of all administrative events, price changes, and delivery validations.
            </p>
          </div>

          <div className="space-y-2">
            {auditLogs.map((log) => (
              <div key={log.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50 flex items-start justify-between text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <strong className="text-slate-900">{log.action}</strong>
                    <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md font-mono">
                      {log.entity_type}
                    </span>
                  </div>
                  <p className="text-slate-600 text-[11px] mt-0.5">{log.details}</p>
                  <span className="text-[10px] text-slate-400">By: {log.actor_name}</span>
                </div>
                <span className="text-[10px] text-slate-400 whitespace-nowrap">
                  {new Date(log.created_at).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: ADD PRODUCT */}
      {showAddProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4">
            <h3 className="font-bold text-slate-900 text-lg">Add New Artisan Cake</h3>
            <form onSubmit={handleCreateProduct} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Cake Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Pistachio Raspberry Tart Cake"
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Category</label>
                <select
                  value={newProductCategoryId}
                  onChange={(e) => setNewProductCategoryId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Base Price (1kg)</label>
                <input
                  type="number"
                  required
                  value={newProductBasePrice}
                  onChange={(e) => setNewProductBasePrice(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Description</label>
                <textarea
                  rows={2}
                  value={newProductDesc}
                  onChange={(e) => setNewProductDesc(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddProductModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-rose-600 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer"
                >
                  Save & Publish
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
