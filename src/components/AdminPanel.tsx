import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  PlusCircle,
  Edit2,
  Trash2,
  Save,
  RotateCw,
  Search,
  Check,
  Bike,
  TrendingUp,
  BarChart3,
  Calculator,
  ShieldCheck,
  Printer,
  Gift,
  X,
  ChefHat,
  PackageCheck,
  History,
  User,
  Calendar,
  DollarSign,
  Filter,
  Clock,
  Eye,
  ShoppingCart,
  Package,
  PackageOpen,
  Users
} from 'lucide-react';
import { 
  ShopSettings, 
  Product, 
  Category, 
  Order, 
  Coupon, 
  CustomCakeRequest, 
  AuditLog, 
  StaffRole,
  StaffPermissionCode,
  Flavor,
  ProductAddon
} from '../types';
import { mockDb } from '../services/mockDatabase';
const AnalyticsDashboard = React.lazy(() => import('./AnalyticsDashboard').then(module => ({ default: module.AnalyticsDashboard })));
const ItemCostingManager = React.lazy(() => import('./ItemCostingManager').then(module => ({ default: module.ItemCostingManager })));
const StaffPermissionManager = React.lazy(() => import('./StaffPermissionManager').then(module => ({ default: module.StaffPermissionManager })));
import { ThermalBoxStickerModal } from './ThermalBoxStickerModal';
import { PosPrintModal } from './PosPrintModal';
import { PosPrinterSettingsModal } from './PosPrinterSettingsModal';
import { CollectionStatementModal } from './CollectionStatementModal';
import { AdminCreateOrderModal } from './AdminCreateOrderModal';
import { OrderDetailsModal } from './OrderDetailsModal';
import { createDemoReceiptOrder } from '../services/posPrinterService';
import { formatShortOrderNumber } from '../utils/orderUtils';
const PosModule = React.lazy(() => import('./admin/PosModule').then(module => ({ default: module.PosModule })));
const KitchenProductionModule = React.lazy(() => import('./admin/KitchenProductionModule').then(module => ({ default: module.KitchenProductionModule })));
const InventoryModule = React.lazy(() => import('./admin/InventoryModule').then(module => ({ default: module.InventoryModule })));
const PurchasesModule = React.lazy(() => import('./admin/PurchasesModule').then(module => ({ default: module.PurchasesModule })));
const DeliveryRiderModule = React.lazy(() => import('./admin/DeliveryRiderModule').then(module => ({ default: module.DeliveryRiderModule })));
const FinanceModule = React.lazy(() => import('./admin/FinanceModule').then(module => ({ default: module.FinanceModule })));
const CustomerCrmModule = React.lazy(() => import('./admin/CustomerCrmModule').then(module => ({ default: module.CustomerCrmModule })));
const ReportsModule = React.lazy(() => import('./admin/ReportsModule').then(module => ({ default: module.ReportsModule })));
import { isProductNew, getProductDaysLeftAsNew } from '../services/productStats';
import { mutateStaffOrder, mutateCmsTable, type CmsTable } from '../services/sheetStaffApi';
import { loadStaffCredential, getBrowserWorkspaceStorage } from '../services/staffWorkspaceSession';
import { 
  isOrderBeepEnabled, 
  setOrderBeepEnabled, 
  playOrderAlertSound, 
  testOrderAlertSound, 
  getOrCreateAudioContext,
  startOrderAlertLoop,
  acknowledgeOrderAlert,
  stopOrderAlertLoop,
  subscribeOrderAlertLoop,
} from '../services/orderSound';

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
  endpoint?: string;
  addons?: ProductAddon[];
  flavors?: Flavor[];
}

type TabKey = 
  | 'overview' 
  | 'analytics'
  | 'orders' 
  | 'pos'
  | 'kitchen'
  | 'inventory'
  | 'purchases'
  | 'delivery'
  | 'finance'
  | 'customers'
  | 'products' 
  | 'costing'
  | 'categories' 
  | 'settings' 
  | 'coupons' 
  | 'custom_cakes' 
  | 'reports'
  | 'audit'
  | 'staff_management';

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
  endpoint,
  addons: propAddons,
  flavors: propFlavors,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [beepEnabled, setBeepEnabled] = useState(() => isOrderBeepEnabled());
  const [unacknowledgedAlertIds, setUnacknowledgedAlertIds] = useState<string[]>([]);
  const [isAlarmRinging, setIsAlarmRinging] = useState(false);

  useEffect(() => {
    return subscribeOrderAlertLoop((isLooping, ids) => {
      setIsAlarmRinging(isLooping);
      setUnacknowledgedAlertIds(ids);
    });
  }, []);

  const isInitialHydrationRef = useRef(true);
  const knownOrderIdsRef = useRef<Set<string>>(new Set(orders.map((o) => o.id)));

  const syncOrderToBackend = (orderId: string, operation: 'confirm' | 'cancel' | 'start_baking' | 'mark_ready' | 'assign' | 'pick_up' | 'start_delivery' | 'deliver', extra: Record<string, unknown> = {}) => {
    if (!endpoint) return;
    const token = loadStaffCredential(getBrowserWorkspaceStorage());
    if (!token) return;
    mutateStaffOrder(endpoint, token, operation, orderId, { ...extra, admin_override: true }).catch(() => {});
  };

  const syncCmsToBackend = (
    table: CmsTable,
    action: 'create' | 'update' | 'delete',
    values: Record<string, string | number | boolean>,
    recordId?: string,
    key?: string
  ) => {
    if (!endpoint) return;
    const token = loadStaffCredential(getBrowserWorkspaceStorage());
    if (!token) return;
    mutateCmsTable(endpoint, token, table, action, values, recordId, key).catch(() => {});
  };

  useEffect(() => {
    if (beepEnabled) {
      getOrCreateAudioContext();
    }
  }, [beepEnabled]);

  useEffect(() => {
    if (isInitialHydrationRef.current) {
      isInitialHydrationRef.current = false;
      knownOrderIdsRef.current = new Set(orders.map((o) => o.id));
      return;
    }

    // Identify newly added orders since panel load
    const newOrders = orders.filter((o) => !knownOrderIdsRef.current.has(o.id));
    if (newOrders.length > 0) {
      newOrders.forEach((o) => knownOrderIdsRef.current.add(o.id));
      const activeNewOrders = newOrders.filter((o) => o.status !== 'cancelled');
      if (activeNewOrders.length > 0 && beepEnabled) {
        // Start continuous alert loop for each incoming new order
        activeNewOrders.forEach((o) => {
          startOrderAlertLoop(o.id);
        });
      }
    }
  }, [orders, beepEnabled]);

  const handleOrderCardClick = (orderId: string) => {
    acknowledgeOrderAlert(orderId);
    const target = orders.find((o) => o.id === orderId);
    if (target) {
      setSelectedOrderForDetails(target);
    }
  };

  const handleDismissAllAlarms = () => {
    stopOrderAlertLoop();
  };

  const toggleBeep = () => {
    const next = !beepEnabled;
    setOrderBeepEnabled(next);
    setBeepEnabled(next);
    if (next) {
      void playOrderAlertSound(true);
    }
  };

  // Settings form state
  const [settingsForm, setSettingsForm] = useState<ShopSettings>({ ...settings });
  const [settingsSavedFeedback, setSettingsSavedFeedback] = useState(false);

  // Staff Work History & Audit filters
  const [auditStaffFilter, setAuditStaffFilter] = useState('all');
  const [auditCategoryFilter, setAuditCategoryFilter] = useState('all');
  const [auditSearchQuery, setAuditSearchQuery] = useState('');
  const [auditVisibleLimit, setAuditVisibleLimit] = useState(50);

  // New / Edit product form modal state
  interface CakeVariantFormItem {
    id: string;
    name: string;
    weight_grams: number;
    price: number;
    sale_price?: number | '';
  }

  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [newProductName, setNewProductName] = useState('');
  const [newProductCategoryId, setNewProductCategoryId] = useState(categories[0]?.id || '');
  const [newProductBasePrice, setNewProductBasePrice] = useState(1200);
  const [newProductDesc, setNewProductDesc] = useState('');
  const [newProductImg, setNewProductImg] = useState('https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=800&auto=format&fit=crop&q=80');
  const [selectedProductAddonIds, setSelectedProductAddonIds] = useState<string[]>([]);
  const [selectedProductFlavorIds, setSelectedProductFlavorIds] = useState<string[]>([]);
  const [productSubTab, setProductSubTab] = useState<'cakes' | 'addons'>('cakes');

  // Addon management state
  const [showAddonModal, setShowAddonModal] = useState(false);
  const [editingAddonId, setEditingAddonId] = useState<string | null>(null);
  const [newAddonName, setNewAddonName] = useState('');
  const [newAddonPrice, setNewAddonPrice] = useState(50);

  const [productVariantRows, setProductVariantRows] = useState<CakeVariantFormItem[]>([
    { id: 'v-1', name: '500g (Serves 4)', weight_grams: 500, price: 650, sale_price: '' },
    { id: 'v-2', name: '1kg (Serves 8-10)', weight_grams: 1000, price: 1200, sale_price: '' },
    { id: 'v-3', name: '2kg (Serves 16-20)', weight_grams: 2000, price: 2300, sale_price: '' },
  ]);

  const openAddProductModal = () => {
    setEditingProductId(null);
    setNewProductName('');
    setNewProductCategoryId(categories[0]?.id || '');
    setNewProductBasePrice(1200);
    setNewProductDesc('');
    setNewProductImg('https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=800&auto=format&fit=crop&q=80');
    setProductVariantRows([
      { id: `v-${Date.now()}-1`, name: '500g (Serves 4)', weight_grams: 500, price: 650, sale_price: '' },
      { id: `v-${Date.now()}-2`, name: '1kg (Serves 8-10)', weight_grams: 1000, price: 1200, sale_price: '' },
      { id: `v-${Date.now()}-3`, name: '2kg (Serves 16-20)', weight_grams: 2000, price: 2300, sale_price: '' },
    ]);
    setSelectedProductAddonIds(addons.filter(a => a.is_active).map(a => a.id));
    setSelectedProductFlavorIds(flavors.filter(f => f.is_active).map(f => f.id));
    setShowAddProductModal(true);
  };

  const openEditProductModal = (p: Product) => {
    setEditingProductId(p.id);
    setNewProductName(p.name);
    setNewProductCategoryId(p.category_id);
    setNewProductBasePrice(p.base_price);
    setNewProductDesc(p.description);
    setNewProductImg(p.image_url);
    if (p.variants && p.variants.length > 0) {
      setProductVariantRows(
        p.variants.map((v) => ({
          id: v.id,
          name: v.name,
          weight_grams: v.weight_grams,
          price: v.price,
          sale_price: v.sale_price ?? '',
        }))
      );
    } else {
      setProductVariantRows([
        { id: `v-${Date.now()}-1`, name: '1kg', weight_grams: 1000, price: p.base_price, sale_price: p.sale_price ?? '' },
      ]);
    }
    const isAllAddons = p.allowed_addon_ids?.some(x => x.toLowerCase() === 'all' || x === '*');
    setSelectedProductAddonIds(isAllAddons ? addons.map(a => a.id) : (p.allowed_addon_ids || []));
    const isAllFlavors = p.allowed_flavor_ids?.some(x => x.toLowerCase() === 'all' || x === '*');
    setSelectedProductFlavorIds(isAllFlavors ? flavors.map(f => f.id) : (p.allowed_flavor_ids || []));
    setShowAddProductModal(true);
  };

  const handleAddVariantRow = (presetWeight?: number, presetName?: string) => {
    const weight = presetWeight || 1000;
    const name = presetName || (weight >= 1000 ? `${weight / 1000}kg` : `${weight}g`);
    const ref1kg = productVariantRows.find((r) => r.weight_grams === 1000)?.price || 1200;
    const defaultPrice = Math.round((weight / 1000) * ref1kg);
    setProductVariantRows((prev) => [
      ...prev,
      {
        id: `v-${Date.now()}-${prev.length + 1}`,
        name,
        weight_grams: weight,
        price: defaultPrice,
        sale_price: '',
      },
    ]);
  };

  const handleRemoveVariantRow = (id: string) => {
    if (productVariantRows.length <= 1) {
      alert('কমপক্ষে একটি ওজনের অপশন থাকা আবশ্যক!');
      return;
    }
    setProductVariantRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleUpdateVariantRow = (id: string, field: keyof CakeVariantFormItem, value: any) => {
    setProductVariantRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  // Order Filter
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('all');
  const [orderSearch, setOrderSearch] = useState('');
  const [selectedOrderForSticker, setSelectedOrderForSticker] = useState<Order | null>(null);
  const [selectedOrderForPosPrint, setSelectedOrderForPosPrint] = useState<Order | null>(null);
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<Order | null>(null);
  const [isPosSettingsOpen, setIsPosSettingsOpen] = useState(false);
  const [isCollectionStatementOpen, setIsCollectionStatementOpen] = useState(false);
  const [isCreateOrderModalOpen, setIsCreateOrderModalOpen] = useState(false);

  const deliveryZones = useMemo(() => mockDb.getDeliveryZones(), []);
  const deliverySlots = useMemo(() => mockDb.getDeliverySlots(), []);

  const [dbFlavors, setDbFlavors] = useState<Flavor[]>(() => mockDb.getFlavors());
  const [dbAddons, setDbAddons] = useState<ProductAddon[]>(() => mockDb.getAddons());

  useEffect(() => {
    setDbAddons(mockDb.getAddons());
    setDbFlavors(mockDb.getFlavors());
  }, [propAddons, propFlavors]);

  useEffect(() => {
    const unsub = mockDb.subscribe(() => {
      setDbAddons(mockDb.getAddons());
      setDbFlavors(mockDb.getFlavors());
    });
    return unsub;
  }, []);

  const flavors = dbFlavors;
  const addons = dbAddons;

  // Save Settings
  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    mockDb.updateShopSettings(settingsForm, 'Super Admin');
    // Sync each updated setting key to Google Sheets backend if connected
    if (endpoint) {
      Object.entries(settingsForm).forEach(([k, v]) => {
        if (v !== undefined && v !== null) {
          syncCmsToBackend('settings', 'update', { value: String(v) }, undefined, k);
        }
      });
    }
    setSettingsSavedFeedback(true);
    setTimeout(() => setSettingsSavedFeedback(false), 2000);
  };

  // Add / Edit Product
  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductName.trim()) return;

    if (productVariantRows.length === 0) {
      alert('কমপক্ষে একটি ওজনের অপশন ও দাম যোগ করুন');
      return;
    }

    const cat = categories.find((c) => c.id === newProductCategoryId);
    const slug = newProductName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const mappedVariants = productVariantRows.map((v, i) => ({
      id: v.id || `v-${Date.now()}-${i}`,
      product_id: editingProductId || '',
      name: v.name.trim() || `${v.weight_grams}g`,
      weight_grams: Number(v.weight_grams) || 1000,
      price: Number(v.price) || 0,
      sale_price: v.sale_price !== '' && Number(v.sale_price) > 0 ? Number(v.sale_price) : undefined,
      is_active: true,
    }));

    const oneKg = mappedVariants.find((v) => v.weight_grams === 1000);
    const basePrice = oneKg ? oneKg.price : Math.min(...mappedVariants.map((v) => v.price));
    const salePrice = oneKg?.sale_price;

    if (editingProductId) {
      mockDb.updateProduct(editingProductId, {
        name: newProductName.trim(),
        category_id: newProductCategoryId,
        category_name: cat?.name || 'Cakes',
        description: newProductDesc.trim(),
        base_price: basePrice,
        sale_price: salePrice,
        image_url: newProductImg,
        variants: mappedVariants,
        allowed_flavor_ids: selectedProductFlavorIds,
        allowed_addon_ids: selectedProductAddonIds,
      }, 'Super Admin');
      syncCmsToBackend('products', 'update', {
        name: newProductName.trim(),
        category_id: newProductCategoryId,
        description: newProductDesc.trim(),
        base_price: basePrice,
        image_url: newProductImg,
      }, editingProductId);
    } else {
      const newP = mockDb.addProduct({
        name: newProductName.trim(),
        slug,
        category_id: newProductCategoryId,
        category_name: cat?.name || 'Cakes',
        description: newProductDesc.trim(),
        base_price: basePrice,
        sale_price: salePrice,
        image_url: newProductImg,
        gallery_images: [newProductImg],
        is_featured: true,
        is_active: true,
        rating: 0,
        review_count: 0,
        sold_count: 0,
        variants: mappedVariants,
        allowed_flavor_ids: selectedProductFlavorIds,
        allowed_addon_ids: selectedProductAddonIds,
      }, 'Super Admin');
      syncCmsToBackend('products', 'create', {
        id: newP.id,
        name: newP.name,
        category_id: newP.category_id,
        description: newP.description,
        base_price: newP.base_price,
        image_url: newP.image_url,
      });
    }

    setShowAddProductModal(false);
    setNewProductName('');
    setNewProductDesc('');
    setEditingProductId(null);
  };

  // Add / Edit Add-on Handler
  const handleStartEditAddon = (ad: ProductAddon) => {
    setEditingAddonId(ad.id);
    setNewAddonName(ad.name);
    setNewAddonPrice(ad.price);
    setShowAddonModal(true);
  };

  const handleSaveAddon = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAddonName.trim()) return;
    if (editingAddonId) {
      mockDb.updateAddon(editingAddonId, {
        name: newAddonName.trim(),
        price: Number(newAddonPrice) || 0,
      }, 'Super Admin');
      syncCmsToBackend('product_addons', 'update', {
        name: newAddonName.trim(),
        price: Number(newAddonPrice) || 0,
      }, editingAddonId);
    } else {
      const added = mockDb.addAddon({
        name: newAddonName.trim(),
        price: Number(newAddonPrice) || 0,
        is_active: true,
      }, 'Super Admin');
      syncCmsToBackend('product_addons', 'create', {
        id: added.id,
        name: added.name,
        price: added.price,
        is_active: true,
      });
    }
    setShowAddonModal(false);
    setEditingAddonId(null);
    setNewAddonName('');
    setNewAddonPrice(50);
  };

  // Coupon Management State
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [editingCouponId, setEditingCouponId] = useState<string | null>(null);
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [couponDiscountType, setCouponDiscountType] = useState<'fixed' | 'percentage'>('percentage');
  const [couponDiscountValue, setCouponDiscountValue] = useState<number>(10);
  const [couponMinOrder, setCouponMinOrder] = useState<number>(1000);
  const [couponMaxDiscount, setCouponMaxDiscount] = useState<number | ''>(300);
  const [couponUsageLimit, setCouponUsageLimit] = useState<number | ''>(100);
  const [couponValidFrom, setCouponValidFrom] = useState('');
  const [couponValidUntil, setCouponValidUntil] = useState('');
  const [couponIsActive, setCouponIsActive] = useState(true);

  const openAddCouponModal = () => {
    setEditingCouponId(null);
    setCouponCodeInput('');
    setCouponDiscountType('percentage');
    setCouponDiscountValue(10);
    setCouponMinOrder(800);
    setCouponMaxDiscount(300);
    setCouponUsageLimit(100);
    setCouponValidFrom(new Date().toISOString().split('T')[0]);
    setCouponValidUntil(new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]);
    setCouponIsActive(true);
    setShowCouponModal(true);
  };

  const openEditCouponModal = (c: Coupon) => {
    setEditingCouponId(c.id);
    setCouponCodeInput(c.code);
    setCouponDiscountType(c.discount_type);
    setCouponDiscountValue(c.discount_value);
    setCouponMinOrder(c.min_order_amount || 0);
    setCouponMaxDiscount(c.max_discount_amount ?? '');
    setCouponUsageLimit(c.usage_limit ?? '');
    setCouponValidFrom(c.valid_from ? c.valid_from.split('T')[0] : '');
    setCouponValidUntil(c.valid_until ? c.valid_until.split('T')[0] : '');
    setCouponIsActive(c.is_active);
    setShowCouponModal(true);
  };

  const handleSaveCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    const code = couponCodeInput.trim().toUpperCase();
    if (!code) return;

    const existing = editingCouponId ? coupons.find((c) => c.id === editingCouponId) : null;
    const payload = {
      code,
      discount_type: couponDiscountType,
      discount_value: Number(couponDiscountValue) || 0,
      min_order_amount: Number(couponMinOrder) || 0,
      max_discount_amount: couponDiscountType === 'percentage' && couponMaxDiscount !== '' ? Number(couponMaxDiscount) : undefined,
      usage_limit: couponUsageLimit !== '' ? Number(couponUsageLimit) : undefined,
      valid_from: couponValidFrom || undefined,
      valid_until: couponValidUntil || undefined,
      is_active: couponIsActive,
      usage_count: existing ? (existing.usage_count || 0) : 0,
    };

    if (editingCouponId) {
      mockDb.updateCoupon(editingCouponId, payload, 'Super Admin');
      syncCmsToBackend('coupons', 'update', payload as any, editingCouponId);
    } else {
      mockDb.addCoupon(payload, 'Super Admin');
      syncCmsToBackend('coupons', 'create', payload as any);
    }

    setShowCouponModal(false);
  };

  const handleDeleteCoupon = (c: Coupon) => {
    if (confirm(`আপনি কি নিশ্চিত যে কুপন "${c.code}" ডিলিট করতে চান?`)) {
      mockDb.deleteCoupon(c.id, 'Super Admin');
      syncCmsToBackend('coupons', 'delete', {}, c.id);
    }
  };

  // Filtered Orders
  const filteredOrders = orders.filter((o) => {
    const matchesStatus = orderStatusFilter === 'all' || o.status === orderStatusFilter;
    const query = orderSearch.trim().toLowerCase();
    const shortCode = formatShortOrderNumber(o.order_number).toLowerCase();
    const matchesSearch =
      query === '' ||
      o.order_number.toLowerCase().includes(query) ||
      shortCode.includes(query) ||
      o.customer_name.toLowerCase().includes(query) ||
      o.customer_phone.includes(query);
    return matchesStatus && matchesSearch;
  });

  // Check permission helper for current role
  const hasPerm = (code: StaffPermissionCode): boolean => {
    return role === 'super_admin' || role === 'admin' || mockDb.hasPermission(role, code);
  };

  const isTabPermitted = (tabKey: TabKey): boolean => {
    switch (tabKey) {
      case 'overview':
        return role === 'super_admin' || role === 'admin' || hasPerm('orders.view') || hasPerm('analytics.view');
      case 'analytics':
        return hasPerm('analytics.view');
      case 'orders':
        return hasPerm('orders.view');
      case 'pos':
        return role === 'super_admin' || role === 'admin' || hasPerm('orders.view');
      case 'kitchen':
        return role === 'super_admin' || role === 'admin' || hasPerm('kitchen.view');
      case 'inventory':
      case 'purchases':
        return role === 'super_admin' || role === 'admin' || hasPerm('products.view');
      case 'delivery':
        return role === 'super_admin' || role === 'admin' || hasPerm('delivery.assign');
      case 'finance':
        return role === 'super_admin' || role === 'admin' || role === 'accountant' || hasPerm('costing.view');
      case 'customers':
        return role === 'super_admin' || role === 'admin' || hasPerm('orders.view');
      case 'reports':
        return role === 'super_admin' || role === 'admin' || hasPerm('analytics.view');
      case 'products':
      case 'categories':
        return hasPerm('products.view');
      case 'costing':
        return hasPerm('costing.view');
      case 'settings':
        return hasPerm('settings.manage');
      case 'coupons':
        return hasPerm('coupons.manage');
      case 'custom_cakes':
        return hasPerm('custom_cakes.manage');
      case 'audit':
        return hasPerm('audit.view');
      case 'staff_management':
        return role === 'super_admin' || role === 'admin' || hasPerm('staff.manage');
      default:
        return true;
    }
  };

  // Calculate KPIs
  const totalSales = orders.reduce((sum, o) => sum + (o.status !== 'cancelled' ? o.total_amount : 0), 0);
  const totalOrdersCount = orders.length;
  const pendingCount = orders.filter((o) => o.status === 'pending' || o.status === 'confirmed').length;
  const inKitchenCount = orders.filter((o) => o.status === 'preparing').length;
  const outForDeliveryCount = orders.filter((o) => o.status === 'out_for_delivery').length;
  const deliveredCount = orders.filter((o) => o.status === 'delivered').length;

  const allNavTabs: { key: TabKey; label: string; count?: number; icon: any; isSuperAdminOnly?: boolean }[] = [
    { key: 'overview', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'orders', label: 'Orders', count: totalOrdersCount, icon: ShoppingBag },
    { key: 'pos', label: 'POS / Sales (বিক্রয়)', icon: ShoppingCart },
    { key: 'kitchen', label: 'Kitchen & Baking (কিচেন)', count: inKitchenCount, icon: ChefHat },
    { key: 'inventory', label: 'Inventory (স্টক)', icon: Package },
    { key: 'purchases', label: 'Purchases (ক্রয়)', icon: PackageOpen },
    { key: 'delivery', label: 'Delivery & Riders (ডেলিভারি)', count: outForDeliveryCount, icon: Bike },
    { key: 'finance', label: 'Finance (হিসাব)', icon: DollarSign },
    { key: 'customers', label: 'Customers CRM (কাস্টমার)', icon: Users },
    { key: 'products', label: 'Products', count: products.length, icon: Layers },
    { key: 'costing', label: 'Costing & Profit (কস্টিং)', icon: Calculator },
    { key: 'coupons', label: 'Offers & Coupons', icon: Tag },
    { key: 'custom_cakes', label: 'Custom Bakes', count: customCakes.length, icon: Sparkles },
    { key: 'reports', label: 'Reports & Analytics', icon: BarChart3 },
    { key: 'staff_management', label: 'Staff & Roles (স্টাফ)', icon: ShieldCheck },
    { key: 'audit', label: 'স্টাফ কাজের হিস্ট্রি (History)', count: auditLogs.length, icon: History },
    { key: 'settings', label: 'Shop Settings', icon: Settings },
  ];

  const visibleTabs = allNavTabs.filter((tab) => isTabPermitted(tab.key));

  // If active tab is not allowed for this role, auto-switch to first allowed tab
  React.useEffect(() => {
    if (!isTabPermitted(activeTab)) {
      const allowed = visibleTabs[0]?.key || 'overview';
      setActiveTab(allowed as TabKey);
    }
  }, [role, activeTab]);

  // Action-level permissions
  const canCancelOrder = hasPerm('orders.cancel');
  const canCreateProduct = hasPerm('products.create');
  const canDeleteProduct = hasPerm('products.delete');
  const canAssignRider = hasPerm('delivery.assign');

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 text-white p-3.5 sm:p-6 rounded-2xl sm:rounded-3xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 sm:gap-4 w-full md:w-auto">
          <div className="relative group shrink-0">
            <img
              src={settings.profile_image_url || settings.logo_url || '/images/aurora-logo.png'}
              alt={settings.shop_name || 'Profile'}
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover border-2 border-rose-500/40 shadow-lg bg-slate-800"
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.src.endsWith('/images/aurora-logo.png')) {
                  target.src = '/images/aurora-logo.png';
                }
              }}
            />
            <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-slate-900 rounded-full" title="অনলাইন" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] sm:text-xs bg-rose-500/20 text-rose-300 font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                Staff & Operations Suite
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white mt-1">Management Hub</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Role: <strong className="text-rose-400 uppercase">{role.replace('_', ' ')}</strong>
            </p>
          </div>
        </div>
        <div className="w-full md:w-auto">
          <div className="flex items-center gap-1.5 sm:gap-2 mt-1 md:mt-0 flex-wrap">
            <button
              type="button"
              onClick={toggleBeep}
              className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer min-h-[36px] ${
                beepEnabled
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              <span>{beepEnabled ? '🔔 সাউন্ড চালু (Auto ON)' : '🔕 সাউন্ড বন্ধ'}</span>
            </button>
            <button
              type="button"
              onClick={() => void testOrderAlertSound()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold cursor-pointer min-h-[36px]"
              title="হাই অর্ডার সাউন্ড শুনুন"
            >
              <span>🔊 টেস্ট সাউন্ড</span>
            </button>
            <button
              type="button"
              onClick={() => setIsCollectionStatementOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 text-xs font-bold cursor-pointer transition-colors shadow-2xs min-h-[36px]"
              title="তারিখ অনুযায়ী বিক্রয় ও ক্যাশ কালেকশন স্টেটমেন্ট এবং প্রিন্ট রিপোর্ট"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>📊 স্টেটমেন্ট (Print)</span>
            </button>
            <button
              type="button"
              onClick={() => setIsCreateOrderModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-white border border-rose-400/50 text-xs font-bold cursor-pointer transition-all shadow-md active:scale-95 min-h-[36px]"
              title="অ্যাডমিন প্যানেল থেকে সরাসরি নতুন অর্ডার তৈরি করুন (স্বয়ংক্রিয়ভাবে কনফার্ম হবে)"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>+ নতুন অর্ডার তৈরি</span>
            </button>
          </div>
        </div>

        {/* Continuous Order Alarm Banner (Plays in loop until clicked) */}
        {isAlarmRinging && (
          <div
            role="alert"
            className="w-full bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 text-white p-3.5 sm:p-4 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-3 animate-pulse border-2 border-white/40"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-white/20 text-xl sm:text-2xl animate-bounce shrink-0">
                🔔
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="bg-white text-rose-900 font-black text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">
                    সাউন্ড বাজছে...
                  </span>
                  <span className="text-xs text-rose-100 font-semibold">
                    {unacknowledgedAlertIds.length > 0 ? `${unacknowledgedAlertIds.length} টি নতুন অর্ডার অপেক্ষমাণ` : 'নতুন অর্ডার এসেছে!'}
                  </span>
                </div>
                <h4 className="text-xs sm:text-sm font-black text-white mt-0.5">
                  নতুন অর্ডারে ক্লিক না করা পর্যন্ত অ্যালার্ট বাজতে থাকবে।
                </h4>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={() => {
                  const ringingOrder =
                    orders.find((o) => unacknowledgedAlertIds.includes(o.id)) || orders[0];
                  handleDismissAllAlarms();
                  if (ringingOrder) {
                    setSelectedOrderForDetails(ringingOrder);
                  }
                  setActiveTab('orders');
                }}
                className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-white text-rose-700 hover:bg-rose-50 font-black text-xs shadow-md cursor-pointer transition-transform active:scale-95 flex items-center justify-center gap-1.5 min-h-[38px]"
                title="নতুন অর্ডারের সম্পূর্ণ বিবরণ ও POS প্রিন্ট পপআপ দেখুন"
              >
                <Eye className="w-4 h-4" />
                <span>অর্ডার দেখুন ও POS প্রিন্ট</span>
              </button>
              <button
                type="button"
                onClick={handleDismissAllAlarms}
                className="px-3 py-2 rounded-xl bg-slate-900/60 hover:bg-slate-900/80 text-white font-bold text-xs border border-white/30 cursor-pointer transition-colors min-h-[38px]"
                title="সাউন্ড থামান"
              >
                🔕 থামান
              </button>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="w-full max-w-full flex items-center gap-1.5 bg-slate-800 p-1.5 rounded-2xl border border-slate-700 overflow-x-auto no-scrollbar scroll-smooth flex-nowrap">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as TabKey)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 whitespace-nowrap min-h-[36px] ${
                  isActive
                    ? 'bg-rose-600 text-white shadow-md shadow-rose-900/40'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
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

      <React.Suspense fallback={<div role="status" className="bg-white rounded-2xl border border-slate-200 p-6 text-sm text-slate-600">Loading workspace...</div>}>
      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-4 sm:space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4">
            <div className="bg-white p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs space-y-1">
              <span className="text-[11px] sm:text-xs font-semibold text-slate-500 block">Total Sales</span>
              <div className="text-xl sm:text-2xl font-black text-slate-900 truncate">{currency}{totalSales.toLocaleString()}</div>
              <span className="text-[10px] sm:text-[11px] text-emerald-600 font-bold block truncate">100% verified orders</span>
            </div>
            <div className="bg-white p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs space-y-1">
              <span className="text-[11px] sm:text-xs font-semibold text-slate-500 block">Total Orders</span>
              <div className="text-xl sm:text-2xl font-black text-slate-900 truncate">{totalOrdersCount}</div>
              <span className="text-[10px] sm:text-[11px] text-sky-600 font-bold block truncate">{deliveredCount} delivered</span>
            </div>
            <div className="bg-white p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs space-y-1">
              <span className="text-[11px] sm:text-xs font-semibold text-slate-500 block">In Kitchen (Oven)</span>
              <div className="text-xl sm:text-2xl font-black text-rose-600 truncate">{inKitchenCount}</div>
              <span className="text-[10px] sm:text-[11px] text-rose-500 font-bold block truncate">Live baking</span>
            </div>
            <div className="bg-white p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs space-y-1">
              <span className="text-[11px] sm:text-xs font-semibold text-slate-500 block">Out for Delivery</span>
              <div className="text-xl sm:text-2xl font-black text-sky-600 truncate">{outForDeliveryCount}</div>
              <span className="text-[10px] sm:text-[11px] text-slate-400 font-bold block truncate">Rider on bike</span>
            </div>
          </div>

          {/* Interactive Recharts Data Visualization Section */}
          <AnalyticsDashboard
            orders={orders}
            products={products}
            categories={categories}
            currency={currency}
            isCompact={true}
          />

          {/* Recent Orders Overview */}
          <div className="bg-white p-3.5 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base">Recent Customer Orders</h3>
                <p className="text-[11px] sm:text-xs text-slate-500">সর্বশেষ কাস্টমার অর্ডার তালিকা</p>
              </div>
              <button
                onClick={() => setActiveTab('orders')}
                className="text-xs text-rose-600 font-bold hover:underline cursor-pointer min-h-[36px] flex items-center"
              >
                View All Orders ➔
              </button>
            </div>

            <div className="overflow-x-auto -mx-3.5 sm:mx-0 px-3.5 sm:px-0">
              <table className="min-w-[600px] w-full text-left text-xs">
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
                        {formatShortOrderNumber(o.order_number)}
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
                          className="text-[11px] font-bold text-rose-600 hover:text-rose-700 min-h-[32px] px-2 py-1"
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

          {/* Rider Cash Settlement & Balance Section */}
          <div className="bg-white p-3.5 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs space-y-3 sm:space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 sm:gap-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2 flex-wrap">
                  <span>Rider Cash Collection & Settlement (রাইডার ক্যাশ ডিপোজিট)</span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                    Live Cash Tracker
                  </span>
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-500">
                  রাইডার গ্রাহকের থেকে ক্যাশ বুঝে নিলে ব্যালেন্স বাড়ে, এবং কাউন্টারে জমা (ডিপোজিট) দিলে ব্যালেন্স সাথে সাথে মাইনাস হয়।
                </p>
              </div>
            </div>

            {(() => {
              const riderCash = mockDb.getRiderCashSummary('rider-1', 'Rahim Mia (Rider #1)');
              return (
                <div className="space-y-3 sm:space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
                    <div className="bg-slate-50 p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200/80 space-y-1">
                      <span className="text-xs text-slate-500 font-semibold block">মোট সংগৃহীত COD ক্যাশ</span>
                      <div className="text-lg sm:text-xl font-black text-slate-900 font-mono">
                        {currency}{riderCash.total_collected.toLocaleString()}
                      </div>
                      <span className="text-[11px] text-slate-400">রাইডার: রহিম মিয়া (Rider #1)</span>
                    </div>

                    <div className="bg-emerald-50 p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border border-emerald-200/80 space-y-1">
                      <span className="text-xs text-emerald-700 font-semibold block">কাউন্টারে মোট জমা (Deposited)</span>
                      <div className="text-lg sm:text-xl font-black text-emerald-800 font-mono">
                        {currency}{riderCash.total_deposited.toLocaleString()}
                      </div>
                      <span className="text-[11px] text-emerald-600 font-medium">{riderCash.deposits.length} টি ডিপোজিট এন্ট্রি</span>
                    </div>

                    <div className={`p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border space-y-1 ${
                      riderCash.cash_in_hand > 0 
                        ? 'bg-amber-50 border-amber-200 text-amber-900' 
                        : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold block">রাইডারের হাতে থাকা ব্যালেন্স</span>
                        {riderCash.cash_in_hand > 0 && (
                          <span className="text-[10px] bg-amber-500 text-white font-bold px-2 py-0.5 rounded-full">বকেয়া</span>
                        )}
                      </div>
                      <div className="text-lg sm:text-xl font-black font-mono text-amber-900">
                        {currency}{riderCash.cash_in_hand.toLocaleString()}
                      </div>
                      <span className="text-[11px] text-amber-700/80">
                        {riderCash.cash_in_hand > 0 ? 'জমা দিলে ব্যালেন্স মাইনাস হবে' : 'সম্পূর্ণ ক্যাশ জমা সম্পন্ন'}
                      </span>
                    </div>
                  </div>

                  {riderCash.deposits.length > 0 && (
                    <div className="border border-slate-100 rounded-2xl overflow-hidden text-xs">
                      <div className="bg-slate-50 px-4 py-2 font-bold text-slate-700 border-b border-slate-100 flex items-center justify-between">
                        <span>সর্বশেষ ডিপোজিট লগ (Deposit History)</span>
                        <span className="text-[11px] font-normal text-slate-400">অটোম্যাটিক ব্যালেন্স অ্যাডজাস্টেড</span>
                      </div>
                      <div className="divide-y divide-slate-100 max-h-40 overflow-y-auto">
                        {riderCash.deposits.slice(0, 5).map((d) => (
                          <div key={d.id} className="p-3 flex items-center justify-between hover:bg-slate-50/50">
                            <div>
                              <span className="font-bold text-slate-800">৳{d.amount.toLocaleString()} কাউন্টারে জমা গ্রহণ</span>
                              <p className="text-[11px] text-slate-400">{new Date(d.deposited_at).toLocaleString('bn-BD')} • {d.note}</p>
                            </div>
                            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                              Settled
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* TAB: DATA VISUALIZATION / SALES TRENDS */}
      {activeTab === 'analytics' && (
        <AnalyticsDashboard
          orders={orders}
          products={products}
          categories={categories}
          currency={currency}
        />
      )}

      {/* TAB 2: ORDERS MANAGEMENT */}
      {activeTab === 'orders' && (
        <div className="bg-white p-3.5 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3">
            <div>
              <h3 className="font-bold text-slate-900 text-base sm:text-lg">Order Management Pipeline</h3>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
              {/* Search */}
              <div className="relative flex-1 min-w-[140px] sm:w-56">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Order #, name, phone..."
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 min-h-[38px]"
                />
              </div>

              {/* Status filter */}
              <select
                value={orderStatusFilter}
                onChange={(e) => setOrderStatusFilter(e.target.value)}
                className="text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-white cursor-pointer min-h-[38px]"
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

              {/* POS Printer Setup Button */}
              <button
                type="button"
                onClick={() => setIsPosSettingsOpen(true)}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors min-h-[38px]"
                title="POS থার্মাল প্রিন্টার সাইজ ও সেটিংস পরিবর্তন করুন"
              >
                <Printer className="w-3.5 h-3.5 text-rose-600" />
                <span>⚙️ POS</span>
              </button>

              {/* Date-wise Collection Statement Button */}
              <button
                type="button"
                onClick={() => setIsCollectionStatementOpen(true)}
                className="px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs min-h-[38px]"
                title="তারিখ অনুযায়ী বিক্রয় ও ক্যাশ কালেকশন স্টেটমেন্ট এবং প্রিন্ট রিপোর্ট"
              >
                <FileText className="w-3.5 h-3.5 text-emerald-200" />
                <span>📊 স্টেটমেন্ট</span>
              </button>

              {/* Create New Order Button (Auto-Confirm) */}
              <button
                type="button"
                onClick={() => setIsCreateOrderModalOpen(true)}
                className="px-3.5 py-2 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-700 hover:to-amber-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer transition-all shadow-xs active:scale-95 min-h-[38px]"
                title="সরাসরি নতুন অর্ডার তৈরি করুন (স্বয়ংক্রিয়ভাবে কনফার্ম হবে)"
              >
                <PlusCircle className="w-3.5 h-3.5 text-white" />
                <span>+ নতুন অর্ডার</span>
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {filteredOrders.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">No matching orders found</div>
            ) : (
              filteredOrders.map((o) => {
                const isRinging = unacknowledgedAlertIds.includes(o.id);
                return (
                  <div
                    key={o.id}
                    onClick={() => handleOrderCardClick(o.id)}
                    className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer ${
                      isRinging
                        ? 'border-rose-500 bg-rose-50/80 ring-4 ring-rose-500/40 shadow-xl shadow-rose-200 animate-pulse'
                        : 'border-slate-200 bg-slate-50/50'
                    } space-y-3`}
                  >
                    {isRinging && (
                      <div className="bg-gradient-to-r from-rose-600 to-red-600 text-white px-3.5 py-2 rounded-xl text-xs font-black flex items-center justify-between shadow-md">
                        <span className="flex items-center gap-2">
                          <span className="text-base animate-bounce">🔔</span>
                          <span>নতুন অর্ডার! সাউন্ড বন্ধ করতে এই অর্ডারে ক্লিক করুন</span>
                        </span>
                        <span className="bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-lg text-[11px] font-bold">
                          ক্লিক করে থামান ✕
                        </span>
                      </div>
                    )}
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span 
                          className="font-mono text-base font-black px-2.5 py-1 rounded-xl bg-slate-900 text-amber-300 shadow-2xs tracking-wider" 
                          title={`পুরো অর্ডার নম্বর: #${formatShortOrderNumber(o.order_number)}`}
                        >
                          #{formatShortOrderNumber(o.order_number)}
                        </span>
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase bg-rose-100 text-rose-800">
                          {o.status.replace(/_/g, ' ')}
                        </span>
                        
                        <span className="text-[10px] text-slate-400 font-mono hidden sm:inline" title={formatShortOrderNumber(o.order_number)}>
                          
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 mt-1">
                        <strong>{o.customer_name}</strong> • <a href={`tel:${o.customer_phone}`} className="text-emerald-700 font-bold hover:underline">{o.customer_phone}</a> • {o.delivery_address}
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

                  {/* Surprise Gift Alert */}
                  {o.is_gift && (
                    <div className="bg-purple-100 text-purple-950 p-2.5 rounded-xl border border-purple-200 text-xs flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-bold">
                        <Gift className="w-4 h-4 text-purple-700" />
                        <span>🎁 সারপ্রাইজ গিফট (প্রাপক: {o.recipient_name || o.customer_name} • {o.recipient_phone || o.customer_phone})</span>
                      </div>
                      {o.hide_price_on_box && (
                        <span className="text-[10px] bg-purple-200 font-bold px-2 py-0.5 rounded text-purple-900">
                          🚫 বক্সে দাম গোপন রাখার নির্দেশ
                        </span>
                      )}
                      {o.gift_card_message && (
                        <div className="w-full text-[11px] italic text-purple-900 bg-white/70 p-1.5 rounded border border-purple-200 font-serif">
                          💌 কার্ড: "{o.gift_card_message}"
                        </div>
                      )}
                    </div>
                  )}

                  {/* Advance & Due COD Breakdown */}
                  {o.advance_paid_amount && o.advance_paid_amount > 0 ? (
                    <div className="bg-emerald-50 text-emerald-950 p-2.5 rounded-xl border border-emerald-200 text-xs flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-emerald-900">
                        অগ্রিম পেইড: <strong>{currency}{o.advance_paid_amount}</strong> {o.bkash_trx_id ? `(TrxID: ${o.bkash_trx_id})` : ''} {o.bkash_number ? `[${o.bkash_number}]` : ''}
                      </span>
                      <span className="font-black text-rose-700 font-mono">
                        বাকি ক্যাশ (Due COD): {currency}{o.due_amount ?? (o.total_amount - o.advance_paid_amount)}
                      </span>
                    </div>
                  ) : null}

                  {/* Items */}
                  <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs space-y-1">
                    {o.items.map((it) => (
                      <div key={it.id} className="flex justify-between">
                        <span>
                          <strong>{it.quantity}x {it.product_name}</strong> ({it.variant_name})
                          {it.flavor_name && <span className="text-slate-500"> - {it.flavor_name}</span>}
                          {it.writing_message && (
                            <span className="bg-amber-100 text-amber-950 font-bold px-2 py-0.5 rounded border border-amber-300 block text-[11px] mt-1 shadow-2xs">
                              ✍️ লেখার টেক্সট: "{it.writing_message}"
                            </span>
                          )}
                        </span>
                        <span className="font-bold text-slate-800">{currency}{it.subtotal}</span>
                      </div>
                    ))}
                  </div>

                  {/* Order Actions */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-100">
                    <div className="text-[11px] text-slate-500">
                      Rider: <strong>{o.rider_name || 'Unassigned'}</strong>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOrderCardClick(o.id);
                        }}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-xs active:scale-95 min-h-[36px]"
                        title="অর্ডারের সম্পূর্ণ বিবরণ দেখুন ও POS প্রিন্ট করুন"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>অর্ডার বিবরণ ও প্রিন্ট</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedOrderForPosPrint(o);
                        }}
                        className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-2xs min-h-[36px]"
                        title="পিওএস ক্যাশ মেমো, কিচেন স্লিপ বা বক্স স্টিকার প্রিন্ট করুন"
                      >
                        <Printer className="w-3.5 h-3.5 text-slate-600" />
                        <span>POS প্রিন্ট</span>
                      </button>
                      {/* 1. Pending: Confirm */}
                      {o.status === 'pending' && hasPerm('orders.confirm') && (
                        <button
                          onClick={() => {
                            mockDb.updateOrderStatus(o.id, 'confirmed', 'Confirmed by Admin', (role === 'super_admin' || role === 'admin') ? (role === 'super_admin' ? 'Super Admin' : 'Admin') : 'Order Manager');
                            syncOrderToBackend(o.id, 'confirm');
                          }}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center justify-center cursor-pointer min-h-[36px]"
                        >
                          Confirm Order
                        </button>
                      )}

                      {/* 2. Confirmed: Start Baking */}
                      {o.status === 'confirmed' && (hasPerm('kitchen.bake') || role === 'super_admin' || role === 'admin') && (
                        <button
                          onClick={() => {
                            mockDb.updateOrderStatus(o.id, 'preparing', 'Started baking in kitchen', (role === 'super_admin' || role === 'admin') ? (role === 'super_admin' ? 'Super Admin' : 'Admin') : 'Kitchen Chef');
                            syncOrderToBackend(o.id, 'start_baking');
                          }}
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1 cursor-pointer min-h-[36px]"
                          title="বেকিং ও ডেকোরেশন শুরু করুন"
                        >
                          <ChefHat className="w-3.5 h-3.5" />
                          <span>বেকিং শুরু (Bake)</span>
                        </button>
                      )}

                      {/* 3. Preparing: Mark Ready */}
                      {o.status === 'preparing' && (hasPerm('kitchen.ready') || role === 'super_admin' || role === 'admin') && (
                        <button
                          onClick={() => {
                            mockDb.updateOrderStatus(o.id, 'ready', 'Cake baked and decorated', (role === 'super_admin' || role === 'admin') ? (role === 'super_admin' ? 'Super Admin' : 'Admin') : 'Kitchen Chef');
                            syncOrderToBackend(o.id, 'mark_ready');
                          }}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1 cursor-pointer min-h-[36px]"
                          title="কেক রেডি ও ডিসপ্যাচে রাখুন"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>কেক রেডি (Ready)</span>
                        </button>
                      )}

                      {/* 4. Ready: Assign Rider */}
                      {o.status === 'ready' && !o.rider_name && canAssignRider && (
                        <button
                          onClick={() => {
                            mockDb.assignRider(o.id, 'Rahim Mia (Rider #1)', (role === 'super_admin' || role === 'admin') ? (role === 'super_admin' ? 'Super Admin' : 'Admin') : 'Delivery Manager');
                            syncOrderToBackend(o.id, 'assign', { rider_email: 'rider@auroracake.com' });
                          }}
                          className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1 cursor-pointer min-h-[36px]"
                        >
                          <Bike className="w-3.5 h-3.5" />
                          <span>Assign Rider (Rahim)</span>
                        </button>
                      )}

                      {/* 5. Assigned: Pick Up Cake */}
                      {o.status === 'assigned' && (hasPerm('delivery.dispatch') || role === 'super_admin' || role === 'admin') && (
                        <button
                          onClick={() => {
                            mockDb.updateOrderStatus(o.id, 'picked_up', 'Picked up from bakery counter', (role === 'super_admin' || role === 'admin') ? (role === 'super_admin' ? 'Super Admin' : 'Admin') : 'Rider');
                            syncOrderToBackend(o.id, 'pick_up');
                          }}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1 cursor-pointer min-h-[36px]"
                          title="কাউন্টার থেকে কেক গ্রহণ করুন"
                        >
                          <PackageCheck className="w-3.5 h-3.5" />
                          <span>পিক-আপ (Pick Up)</span>
                        </button>
                      )}

                      {/* 6. Picked Up: Start Delivery */}
                      {o.status === 'picked_up' && (hasPerm('delivery.dispatch') || role === 'super_admin' || role === 'admin') && (
                        <button
                          onClick={() => {
                            mockDb.updateOrderStatus(o.id, 'out_for_delivery', 'Rider is out for express delivery', (role === 'super_admin' || role === 'admin') ? (role === 'super_admin' ? 'Super Admin' : 'Admin') : 'Rider');
                            syncOrderToBackend(o.id, 'start_delivery');
                          }}
                          className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1 cursor-pointer min-h-[36px]"
                          title="ডেলিভারিতে বের হোন"
                        >
                          <Bike className="w-3.5 h-3.5" />
                          <span>ডেলিভারি শুরু</span>
                        </button>
                      )}

                      {/* 7. Assigned / Picked Up / Out for Delivery: Deliver */}
                      {['assigned', 'picked_up', 'out_for_delivery'].includes(o.status) && (
                        <button
                          onClick={() => {
                            const due = o.due_amount !== undefined 
                              ? o.due_amount 
                              : (o.payment_method === 'cod' ? (o.total_amount - (o.advance_paid_amount || 0)) : 0);
                            const confirmed = due > 0 
                              ? window.confirm(`গ্রাহকের কাছ থেকে নগদ ৳${due} ক্যাশ বুঝে পাওয়া হয়েছে কি? কনফার্ম করলে ডেলিভারি সফল হবে।`)
                              : true;
                            if (confirmed) {
                              mockDb.confirmDelivery(o.id, true, (role === 'super_admin' || role === 'admin') ? (role === 'super_admin' ? 'Super Admin' : 'Admin Delivery Manager') : 'Admin Delivery Manager');
                              syncOrderToBackend(o.id, 'deliver', { cash_collected: true });
                            }
                          }}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1 cursor-pointer transition-colors shadow-xs min-h-[36px]"
                          title="ডেলিভারি সম্পন্ন করুন ও ক্যাশ কালেকশন নিশ্চিত করুন"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>ডেলিভারি সম্পন্ন</span>
                        </button>
                      )}

                      {/* 8. Cancel Order */}
                      {o.status !== 'delivered' && o.status !== 'cancelled' && canCancelOrder && (
                        <button
                          onClick={() => {
                            mockDb.updateOrderStatus(o.id, 'cancelled', 'Cancelled by Admin', (role === 'super_admin' || role === 'admin') ? (role === 'super_admin' ? 'Super Admin' : 'Admin') : 'Admin');
                            syncOrderToBackend(o.id, 'cancel');
                          }}
                          className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold rounded-xl flex items-center justify-center cursor-pointer min-h-[36px]"
                        >
                          Cancel
                        </button>
                      )}

                      {/* 9. Reopen Cancelled Order (Super Admin and Admin) */}
                      {o.status === 'cancelled' && (role === 'super_admin' || role === 'admin') && (
                        <button
                          onClick={() => {
                            mockDb.updateOrderStatus(o.id, 'pending', `Reopened by ${role === 'super_admin' ? 'Super Admin' : 'Admin'}`, role === 'super_admin' ? 'Super Admin' : 'Admin');
                            syncOrderToBackend(o.id, 'confirm');
                          }}
                          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl flex items-center justify-center cursor-pointer min-h-[36px]"
                        >
                          পুনরায় চালু
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          </div>
        </div>
      )}

      {/* POS / SALES MODULE */}
      {activeTab === 'pos' && (
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs overflow-hidden h-[750px]">
          <PosModule
            products={products}
            currency={currency}
            staffName={role === 'super_admin' ? 'Super Admin' : 'Admin'}
          />
        </div>
      )}

      {/* KITCHEN & PRODUCTION MODULE */}
      {activeTab === 'kitchen' && (
        <KitchenProductionModule
          orders={orders}
          currency={currency}
          staffName={role === 'super_admin' ? 'Super Admin' : 'Admin'}
          onUpdateOrderStatus={(orderId, st) => {
            mockDb.updateOrderStatus(orderId, st, `Status updated to ${st}`, role === 'super_admin' ? 'Super Admin' : 'Admin');
            syncOrderToBackend(orderId, st === 'preparing' ? 'start_baking' : 'mark_ready');
          }}
        />
      )}

      {/* INVENTORY & STOCK MODULE */}
      {activeTab === 'inventory' && (
        <InventoryModule
          currency={currency}
          staffName={role === 'super_admin' ? 'Super Admin' : 'Admin'}
        />
      )}

      {/* PURCHASES & SUPPLIERS MODULE */}
      {activeTab === 'purchases' && (
        <PurchasesModule
          currency={currency}
          staffName={role === 'super_admin' ? 'Super Admin' : 'Admin'}
        />
      )}

      {/* DELIVERY & RIDERS MODULE */}
      {activeTab === 'delivery' && (
        <DeliveryRiderModule
          orders={orders}
          currency={currency}
          staffName={role === 'super_admin' ? 'Super Admin' : 'Admin'}
          role={role}
          onAssignRider={(orderId, email, name) => {
            mockDb.assignRider(orderId, name, role === 'super_admin' ? 'Super Admin' : 'Admin');
            syncOrderToBackend(orderId, 'assign', { rider_email: email, rider_name: name });
          }}
          onUpdateStatus={(orderId, st) => {
            mockDb.updateOrderStatus(orderId, st, `Status updated to ${st}`, role === 'super_admin' ? 'Super Admin' : 'Admin');
            syncOrderToBackend(orderId, st === 'out_for_delivery' ? 'start_delivery' : 'deliver');
          }}
        />
      )}

      {/* FINANCE & ACCOUNTING MODULE */}
      {activeTab === 'finance' && (
        <FinanceModule
          orders={orders}
          currency={currency}
          staffName={role === 'super_admin' ? 'Super Admin' : 'Admin'}
          role={role}
        />
      )}

      {/* CUSTOMER CRM MODULE */}
      {activeTab === 'customers' && (
        <CustomerCrmModule
          orders={orders}
          currency={currency}
        />
      )}

      {/* REPORTS & ANALYTICS MODULE */}
      {activeTab === 'reports' && (
        <ReportsModule
          orders={orders}
          products={products}
          currency={currency}
        />
      )}

      {/* TAB 3: PRODUCTS */}
      {activeTab === 'products' && (
        <div className="bg-white p-3.5 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2.5 sm:gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setProductSubTab('cakes')}
                className={`text-xs sm:text-sm font-bold pb-2 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 min-h-[36px] ${
                  productSubTab === 'cakes'
                    ? 'border-rose-600 text-rose-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>🎂 কেক তালিকা</span>
                <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-full font-bold text-slate-700">
                  {products.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setProductSubTab('addons')}
                className={`text-xs sm:text-sm font-bold pb-2 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 min-h-[36px] ${
                  productSubTab === 'addons'
                    ? 'border-rose-600 text-rose-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>✨ অ্যাড-অন (Add-ons)</span>
                <span className="text-[10px] bg-rose-100 px-2 py-0.5 rounded-full font-bold text-rose-700">
                  {addons.length}
                </span>
              </button>
            </div>
            {productSubTab === 'cakes' && canCreateProduct && (
              <button
                onClick={openAddProductModal}
                className="flex items-center gap-1.5 px-3.5 sm:px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer min-h-[36px]"
              >
                <Plus className="w-4 h-4" />
                <span>নতুন কেক যোগ করুন</span>
              </button>
            )}
            {productSubTab === 'addons' && hasPerm('products.edit') && (
              <button
                onClick={() => {
                  setEditingAddonId(null);
                  setNewAddonName('');
                  setNewAddonPrice(50);
                  setShowAddonModal(true);
                }}
                className="flex items-center gap-1.5 px-3.5 sm:px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer min-h-[36px]"
              >
                <Plus className="w-4 h-4" />
                <span>নতুন অ্যাড-অন তৈরি করুন</span>
              </button>
            )}
          </div>

          {productSubTab === 'cakes' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
              {products.map((p) => (
                <div
                  key={p.id}
                  className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200 bg-white hover:border-rose-200 shadow-xs space-y-3"
                >
                  <div className="h-40 rounded-xl overflow-hidden bg-slate-100 relative">
                    <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                    <span className="absolute top-2 left-2 bg-slate-900/80 text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
                      {p.category_name}
                    </span>
                    <span className="absolute top-2 right-2 bg-rose-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
                      {currency}{p.base_price}
                    </span>
                    {isProductNew(p) && (
                      <span className="absolute bottom-2 left-2 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-md shadow-xs flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> নতুন ({getProductDaysLeftAsNew(p)} দিন বাকি)
                      </span>
                    )}
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
                    {hasPerm('products.edit') && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditProductModal(p)}
                          className="text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1 cursor-pointer transition-all"
                          title="Edit Cake & Prices"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>এডিট ও দাম</span>
                        </button>
                        <button
                          onClick={() => {
                            const nextActive = !p.is_active;
                            mockDb.updateProduct(p.id, { is_active: nextActive });
                            syncCmsToBackend('products', 'update', { is_active: nextActive }, p.id);
                          }}
                          className={`text-xs font-bold px-3 py-1 rounded-lg cursor-pointer ${
                            p.is_active
                              ? 'bg-red-50 text-red-600 hover:bg-red-100'
                              : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                          }`}
                        >
                          {p.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {productSubTab === 'addons' && (
            <div className="space-y-4">
              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-700" />
                  <span>অ্যাড-অন (Add-on) কি এবং কিভাবে ওয়েবসাইটে দেখায়?</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  কাস্টমার যখন কেকের ওপর ক্লিক করে অর্ডার ডিটেইলস পপআপ দেখে, তখন নিচে "Party & Celebration Add-ons" হিসেবে এই অ্যাড-অনগুলো প্রদর্শিত হয় (যেমন: স্পার্কলার ক্যান্ডেল, হ্যাপি বার্থডে টপার, হ্যান্ডরিটেন কার্ড, রেড রোজ ইত্যাদি)।
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {addons.map((ad) => (
                  <div
                    key={ad.id}
                    className="p-3.5 rounded-xl sm:rounded-2xl border border-slate-200 bg-white hover:border-slate-300 shadow-xs flex flex-col justify-between space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="font-mono text-[10px] text-slate-400 font-bold">#{ad.id}</div>
                        <h4 className="font-bold text-slate-900 text-xs">{ad.name}</h4>
                      </div>
                      <span className="text-sm font-black text-rose-600 font-mono bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200">
                        {currency}{ad.price}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        ad.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {ad.is_active ? '● সক্রিয় (Active)' : '○ নিষ্ক্রিয় (Inactive)'}
                      </span>
                      {hasPerm('products.edit') && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleStartEditAddon(ad)}
                            className="p-1 rounded-lg text-emerald-700 hover:bg-emerald-50 hover:text-emerald-900 transition-colors cursor-pointer"
                            title="অ্যাড-অন এডিট করুন (Edit Addon)"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const nextActive = !ad.is_active;
                              mockDb.updateAddon(ad.id, { is_active: nextActive });
                              syncCmsToBackend('product_addons', 'update', { is_active: nextActive }, ad.id);
                            }}
                            className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                          >
                            {ad.is_active ? 'বন্ধ করুন' : 'সক্রিয় করুন'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`আপনি কি "${ad.name}" অ্যাড-অনটি মুছে ফেলতে চান?`)) {
                                mockDb.deleteAddon(ad.id);
                                syncCmsToBackend('product_addons', 'delete', {}, ad.id);
                              }
                            }}
                            className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-700 cursor-pointer"
                            title="Delete Addon"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: ITEM COSTING & PROFIT */}
      {activeTab === 'costing' && (
        <ItemCostingManager products={products} orders={orders} currency={currency} endpoint={endpoint} />
      )}

      {/* TAB 4: SHOP SETTINGS (DYNAMIC - NEVER HARDCODED) */}
      {activeTab === 'settings' && (
        <div className="bg-white p-3.5 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs space-y-4 sm:space-y-5 max-w-4xl">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-base sm:text-lg">Shop Brand & Operations Settings</h3>
            </div>
            {settingsSavedFeedback && (
              <div className="bg-emerald-50 text-emerald-700 text-xs font-bold px-3 py-1.5 rounded-xl border border-emerald-200 flex items-center gap-1.5 animate-pulse">
                <Check className="w-4 h-4" />
                <span>সেটিংস সংরক্ষিত হয়েছে!</span>
              </div>
            )}
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-4">
            {/* Profile Picture & Brand Logo URL Configuration with Live Preview */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/90 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200/70 pb-2">
                <span className="text-xs font-bold text-slate-800 uppercase flex items-center gap-1.5">
                  <span>🖼️ প্রোফাইল ও লোগো ইমেজ সেটিংস (Profile Picture & Logo)</span>
                </span>
                <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-2.5 py-0.5 rounded-full">
                  ওয়েব, অ্যাডমিন ও মোবাইল অ্যাপে সরাসরি সিঙ্ক হবে
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Profile Image URL Input & Preview */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 block">
                    প্রোফাইল ছবি লিংক (Profile Picture URL / Avatar)
                  </label>
                  <input
                    type="text"
                    placeholder="https://... বা /images/aurora-logo.png"
                    value={settingsForm.profile_image_url || ''}
                    onChange={(e) => setSettingsForm({ ...settingsForm, profile_image_url: e.target.value })}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-white"
                  />
                  <div className="flex items-center gap-3 p-2 bg-white rounded-xl border border-slate-100 shadow-2xs">
                    <div className="w-12 h-12 rounded-xl border border-slate-200 overflow-hidden bg-slate-100 shrink-0 flex items-center justify-center">
                      <img
                        src={settingsForm.profile_image_url || settingsForm.logo_url || '/images/aurora-logo.png'}
                        alt="Profile Avatar"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.currentTarget;
                          if (!target.src.endsWith('/images/aurora-logo.png')) {
                            target.src = '/images/aurora-logo.png';
                          }
                        }}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800">প্রোফাইল এভাটার প্রিভিউ</p>
                      <p className="text-[11px] text-emerald-600 font-semibold truncate">ওয়েব ও মোবাইল অ্যাপে প্রদর্শিত হবে</p>
                    </div>
                  </div>
                </div>

                {/* Shop Logo URL Input & Preview */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 block">
                    শপ লোগো লিংক (Logo URL)
                  </label>
                  <input
                    type="text"
                    placeholder="/images/aurora-logo.png"
                    value={settingsForm.logo_url || ''}
                    onChange={(e) => setSettingsForm({ ...settingsForm, logo_url: e.target.value })}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-white"
                  />
                  <div className="flex items-center gap-3 p-2 bg-white rounded-xl border border-slate-100 shadow-2xs">
                    <div className="w-12 h-12 rounded-xl border border-slate-200 overflow-hidden bg-slate-100 shrink-0 flex items-center justify-center">
                      <img
                        src={settingsForm.logo_url || '/images/aurora-logo.png'}
                        alt="Logo"
                        className="w-full h-full object-contain p-1"
                        onError={(e) => {
                          const target = e.currentTarget;
                          if (!target.src.endsWith('/images/aurora-logo.png')) {
                            target.src = '/images/aurora-logo.png';
                          }
                        }}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800">শপ লোগো প্রিভিউ</p>
                      <p className="text-[11px] text-emerald-600 font-semibold truncate">হেডার, রশিদ ও প্রিন্টে ব্যবহৃত হবে</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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

            {/* bKash & Nagad Merchant Numbers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  বিকাশ মার্চেন্ট / পার্সোনাল নম্বর (bKash Number)
                </label>
                <input
                  type="text"
                  placeholder="01711-234567"
                  value={settingsForm.bkash_merchant_number || ''}
                  onChange={(e) => setSettingsForm({ ...settingsForm, bkash_merchant_number: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  নগদ মার্চেন্ট / পার্সোনাল নম্বর (Nagad Number)
                </label>
                <input
                  type="text"
                  placeholder="01711-234567"
                  value={settingsForm.nagad_merchant_number || ''}
                  onChange={(e) => setSettingsForm({ ...settingsForm, nagad_merchant_number: e.target.value })}
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

            {/* Complimentary Free Bakery Kit Configuration */}
            <div className="bg-emerald-50/70 p-4 rounded-2xl border border-emerald-200/90 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200/80 pb-2">
                <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5 uppercase">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <span>🎁 কমপ্লিমেন্টারি ফ্রি কিট আইটেম সেটিংস (Complimentary Kit)</span>
                </span>
                <span className="text-[10px] bg-emerald-200 text-emerald-900 font-bold px-2.5 py-0.5 rounded-full">
                  চেকআউট, ট্র্যাকিং ও স্লিপে প্রদর্শিত হবে
                </span>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  কমপ্লিমেন্টারি হেডিং টাইটেল (Heading Title)
                </label>
                <input
                  type="text"
                  placeholder="প্রতিটি কেকের সাথে পাচ্ছেন:"
                  value={settingsForm.complimentary_kit_title || ''}
                  onChange={(e) => setSettingsForm({ ...settingsForm, complimentary_kit_title: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-white"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block">
                  ফ্রি আইটেমের তালিকা (Complimentary Items List)
                </label>
                {(settingsForm.complimentary_kit_items && settingsForm.complimentary_kit_items.length > 0
                  ? settingsForm.complimentary_kit_items
                  : [
                      'ফ্রি কেক কাটার ছুরি (Cake Knife)',
                      'ফ্রি মোমবাতি (Birthday Candles)',
                      'প্রিমিয়াম বক্স ও রিবন (Box & Ribbon)'
                    ]
                ).map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-xs font-bold text-emerald-700 w-5">✓</span>
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => {
                        const current = settingsForm.complimentary_kit_items && settingsForm.complimentary_kit_items.length > 0
                          ? [...settingsForm.complimentary_kit_items]
                          : [
                              'ফ্রি কেক কাটার ছুরি (Cake Knife)',
                              'ফ্রি মোমবাতি (Birthday Candles)',
                              'প্রিমিয়াম বক্স ও রিবন (Box & Ribbon)'
                            ];
                        current[idx] = e.target.value;
                        setSettingsForm({ ...settingsForm, complimentary_kit_items: current });
                      }}
                      className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white"
                      placeholder="যেমন: ফ্রি কেক কাটার ছুরি"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const current = settingsForm.complimentary_kit_items && settingsForm.complimentary_kit_items.length > 0
                          ? [...settingsForm.complimentary_kit_items]
                          : [
                              'ফ্রি কেক কাটার ছুরি (Cake Knife)',
                              'ফ্রি মোমবাতি (Birthday Candles)',
                              'প্রিমিয়াম বক্স ও রিবন (Box & Ribbon)'
                            ];
                        const next = current.filter((_, i) => i !== idx);
                        setSettingsForm({ ...settingsForm, complimentary_kit_items: next });
                      }}
                      className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer"
                      title="আইটেম মুছুন"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const current = settingsForm.complimentary_kit_items && settingsForm.complimentary_kit_items.length > 0
                        ? [...settingsForm.complimentary_kit_items]
                        : [
                            'ফ্রি কেক কাটার ছুরি (Cake Knife)',
                            'ফ্রি মোমবাতি (Birthday Candles)',
                            'প্রিমিয়াম বক্স ও রিবন (Box & Ribbon)'
                          ];
                      setSettingsForm({ ...settingsForm, complimentary_kit_items: [...current, ''] });
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center gap-1 shadow-2xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>নতুন আইটেম যোগ করুন</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSettingsForm({
                        ...settingsForm,
                        complimentary_kit_title: 'প্রতিটি কেকের সাথে পাচ্ছেন:',
                        complimentary_kit_items: [
                          'ফ্রি কেক কাটার ছুরি (Cake Knife)',
                          'ফ্রি মোমবাতি (Birthday Candles)',
                          'প্রিমিয়াম বক্স ও রিবন (Box & Ribbon)'
                        ],
                      });
                    }}
                    className="px-3 py-1.5 text-slate-600 hover:bg-slate-200 text-xs font-semibold rounded-xl border border-slate-300 cursor-pointer"
                  >
                    ডিফল্ট সেট করুন
                  </button>
                </div>
              </div>
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
        <div className="bg-white p-3.5 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900 text-base sm:text-lg flex items-center gap-2">
                <span>Promotional Coupons & Discounts</span>
                <span className="text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-bold">
                  {coupons.length}টি কুপন
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                কুপন কোড, ডিসকাউন্ট, ব্যবহারের সর্বোচ্চ সীমা (Usage Quota) ও সময়সীমা (Validity Dates) নির্ধারণ করুন।
              </p>
            </div>
            {hasPerm('coupons.manage') && (
              <button
                type="button"
                onClick={openAddCouponModal}
                className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer self-start sm:self-auto min-h-[36px]"
              >
                <Plus className="w-4 h-4" />
                <span>+ নতুন কুপন যোগ করুন</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
            {coupons.map((c) => {
              const now = new Date();
              const isExpired = Boolean(c.valid_until && now > new Date(c.valid_until + (c.valid_until.length <= 10 ? 'T23:59:59.999' : '')));
              const isUpcoming = Boolean(c.valid_from && now < new Date(c.valid_from + (c.valid_from.length <= 10 ? 'T00:00:00' : '')));
              const isLimitReached = Boolean(c.usage_limit && (c.usage_count || 0) >= c.usage_limit);
              const remaining = c.usage_limit ? Math.max(0, c.usage_limit - (c.usage_count || 0)) : null;
              const percentUsed = c.usage_limit ? Math.min(100, Math.round(((c.usage_count || 0) / c.usage_limit) * 100)) : 0;

              let statusBadge = (
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                  সক্রিয়
                </span>
              );
              if (!c.is_active) {
                statusBadge = (
                  <span className="text-[10px] bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded-full">
                    নিষ্ক্রিয়
                  </span>
                );
              } else if (isExpired) {
                statusBadge = (
                  <span className="text-[10px] bg-rose-100 text-rose-700 font-bold px-2 py-0.5 rounded-full">
                    মেয়াদোত্তীর্ণ
                  </span>
                );
              } else if (isLimitReached) {
                statusBadge = (
                  <span className="text-[10px] bg-purple-100 text-purple-700 font-bold px-2 py-0.5 rounded-full">
                    কোটা পূর্ণ
                  </span>
                );
              } else if (isUpcoming) {
                statusBadge = (
                  <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                    আসন্ন
                  </span>
                );
              }

              return (
                <div key={c.id} className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200 bg-white hover:border-rose-200 shadow-xs space-y-3 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-mono text-sm font-black text-rose-600 bg-rose-50 border border-rose-200/60 px-2.5 py-1 rounded-md">
                        {c.code}
                      </span>
                      {statusBadge}
                    </div>
                    <p className="text-sm text-slate-800 font-bold">
                      {c.discount_type === 'percentage'
                        ? `${c.discount_value}% OFF ${c.max_discount_amount ? `(সর্বোচ্চ ${currency}${c.max_discount_amount})` : ''}`
                        : `${currency}${c.discount_value} FLAT OFF`}
                    </p>
                    <div className="text-xs text-slate-500">
                      নূন্যতম অর্ডার: {currency}{c.min_order_amount || 0}
                    </div>
                  </div>

                  {/* Usage Counter & Quota Progress */}
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 space-y-1.5 text-xs text-slate-600">
                    <div className="flex justify-between items-center font-medium">
                      <span>ব্যবহৃত সংখ্যা:</span>
                      <strong className="text-slate-800">
                        {c.usage_count || 0} / {c.usage_limit ? c.usage_limit : 'সীমাহীন'}
                      </strong>
                    </div>
                    {c.usage_limit ? (
                      <>
                        <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              percentUsed >= 100 ? 'bg-purple-600' : percentUsed >= 80 ? 'bg-amber-500' : 'bg-rose-500'
                            }`}
                            style={{ width: `${percentUsed}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-400">
                          <span>{percentUsed}% ব্যবহৃত</span>
                          <span className="font-semibold text-rose-600">{remaining}টি অবশিষ্ট</span>
                        </div>
                      </>
                    ) : (
                      <div className="text-[10px] text-slate-400">কোনো কোটা সীমা নেই</div>
                    )}
                  </div>

                  {/* Validity Date Range */}
                  <div className="text-[11px] text-slate-500 space-y-0.5">
                    <div>
                      <span className="font-semibold">শুরু:</span> {c.valid_from || 'তাত্ক্ষণিক'}
                    </div>
                    <div>
                      <span className="font-semibold">মেয়াদ শেষ:</span> {c.valid_until || 'আজীবন'}
                    </div>
                  </div>

                  {/* Admin Actions */}
                  {hasPerm('coupons.manage') && (
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          const nextActive = !c.is_active;
                          mockDb.updateCoupon(c.id, { is_active: nextActive }, 'Super Admin');
                          syncCmsToBackend('coupons', 'update', { is_active: nextActive }, c.id);
                        }}
                        className={`text-xs font-bold px-2.5 py-1 rounded-lg cursor-pointer ${
                          c.is_active
                            ? 'bg-red-50 text-red-600 hover:bg-red-100'
                            : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                        }`}
                      >
                        {c.is_active ? 'নিষ্ক্রিয় করুন' : 'সক্রিয় করুন'}
                      </button>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditCouponModal(c)}
                          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg cursor-pointer"
                          title="Edit Coupon"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCoupon(c)}
                          className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer"
                          title="Delete Coupon"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 6: CUSTOM CAKES */}
      {activeTab === 'custom_cakes' && (
        <div className="bg-white p-3.5 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div>
            <h3 className="font-bold text-slate-900 text-base sm:text-lg">Custom Cake Design Inquiries</h3>
            <p className="text-xs text-slate-500">
              Quotes submitted by customers with custom photo inspiration and dedicated messages.
            </p>
          </div>

          <div className="space-y-3">
            {customCakes.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">No custom cake quote requests</div>
            ) : (
              customCakes.map((cc) => (
                <div key={cc.id} className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200 bg-slate-50/70 space-y-3">
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

      {/* TAB 7: STAFF WORK HISTORY & AUDIT LOGS */}
      {activeTab === 'audit' && (() => {
        // Extract distinct staff members
        const allDbStaff = mockDb.getStaffMembers();
        const distinctActors = Array.from(new Set([
          ...auditLogs.map(l => l.actor_name),
          ...allDbStaff.map(s => s.name)
        ])).filter(Boolean).sort();

        // Calculate summary metrics
        const totalLogs = auditLogs.length;
        const deliveryCount = auditLogs.filter(l => l.entity_type === 'delivery' || l.action.toLowerCase().includes('deliver')).length;
        const kitchenCount = auditLogs.filter(l => l.entity_type === 'kitchen' || l.action.toLowerCase().includes('bake') || l.action.toLowerCase().includes('ready')).length;

        const actorCounts: Record<string, number> = {};
        auditLogs.forEach(l => {
          if (l.actor_name) actorCounts[l.actor_name] = (actorCounts[l.actor_name] || 0) + 1;
        });
        let topActor = 'None';
        let topCount = 0;
        Object.entries(actorCounts).forEach(([act, cnt]) => {
          if (cnt > topCount) {
            topActor = act;
            topCount = cnt;
          }
        });

        // Filter logs
        const filteredLogs = auditLogs.filter(log => {
          // Staff filter
          if (auditStaffFilter !== 'all') {
            const matchesStaff = 
              log.actor_name.toLowerCase() === auditStaffFilter.toLowerCase() ||
              log.actor_name.toLowerCase().includes(auditStaffFilter.toLowerCase()) ||
              (log.staff_role && log.staff_role.toLowerCase() === auditStaffFilter.toLowerCase());
            if (!matchesStaff) return false;
          }

          // Category filter
          if (auditCategoryFilter !== 'all') {
            if (auditCategoryFilter === 'order' && log.entity_type !== 'order') return false;
            if (auditCategoryFilter === 'kitchen' && log.entity_type !== 'kitchen') return false;
            if (auditCategoryFilter === 'delivery' && log.entity_type !== 'delivery') return false;
            if (auditCategoryFilter === 'finance' && log.entity_type !== 'finance') return false;
            if (auditCategoryFilter === 'product' && !['product', 'category'].includes(log.entity_type)) return false;
            if (auditCategoryFilter === 'staff' && !['staff', 'role'].includes(log.entity_type)) return false;
            if (auditCategoryFilter === 'coupon' && log.entity_type !== 'coupon') return false;
            if (auditCategoryFilter === 'settings' && log.entity_type !== 'shop_settings') return false;
          }

          // Search query
          if (auditSearchQuery.trim()) {
            const q = auditSearchQuery.trim().toLowerCase();
            const textMatch = 
              log.actor_name.toLowerCase().includes(q) ||
              log.action.toLowerCase().includes(q) ||
              log.details.toLowerCase().includes(q) ||
              log.entity_type.toLowerCase().includes(q) ||
              (log.staff_role && log.staff_role.toLowerCase().includes(q));
            if (!textMatch) return false;
          }

          return true;
        });

        const displayedLogs = filteredLogs.slice(0, auditVisibleLimit);

        // Helper for category badge styling
        const getCategoryBadge = (entityType: string) => {
          switch (entityType) {
            case 'delivery':
              return { label: 'ডেলিভারি', bg: 'bg-sky-100 text-sky-800 border-sky-200', icon: Bike };
            case 'kitchen':
              return { label: 'কিচেন ও বেকিং', bg: 'bg-amber-100 text-amber-900 border-amber-300', icon: ChefHat };
            case 'order':
              return { label: 'অর্ডার', bg: 'bg-blue-100 text-blue-800 border-blue-200', icon: ShoppingBag };
            case 'finance':
              return { label: 'ক্যাশ ও ফাইন্যান্স', bg: 'bg-emerald-100 text-emerald-800 border-emerald-300', icon: DollarSign };
            case 'staff':
            case 'role':
              return { label: 'স্টাফ ও পারমিশন', bg: 'bg-rose-100 text-rose-800 border-rose-200', icon: ShieldCheck };
            case 'product':
            case 'category':
              return { label: 'প্রোডাক্ট ও দাম', bg: 'bg-purple-100 text-purple-800 border-purple-200', icon: Layers };
            case 'coupon':
              return { label: 'কুপন', bg: 'bg-teal-100 text-teal-800 border-teal-200', icon: Tag };
            default:
              return { label: 'সিস্টেম', bg: 'bg-slate-100 text-slate-800 border-slate-200', icon: Settings };
          }
        };

        return (
          <div className="bg-white p-3.5 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs space-y-4 sm:space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 border-b border-slate-100 pb-4 sm:pb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center text-lg sm:text-xl shadow-md shrink-0">
                  <History className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-base sm:text-xl flex items-center gap-2 flex-wrap">
                    <span>স্টাফ অ্যাক্টিভিটি ও কাজের হিস্ট্রি</span>
                    <span className="text-[10px] sm:text-xs font-bold px-2 sm:px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                      Staff Work Ledger
                    </span>
                  </h3>
                  <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                    কোন স্টাফ কখন কোন অর্ডারে কি কাজ করেছে, কিচেনে কে কেক বানিয়েছে, কে ক্যাশ বুঝে নিয়েছে বা দাম পরিবর্তন করেছে তার লাইভ খতিয়ান।
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs bg-slate-100 text-slate-700 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 border border-slate-200">
                  <FileText className="w-3.5 h-3.5 text-purple-600" />
                  <span>মোট রেকর্ড: {totalLogs} টি</span>
                </span>
              </div>
            </div>

            {/* 4 Summary Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
              <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-purple-50/70 border border-purple-200/80 space-y-1">
                <span className="text-[10px] sm:text-[11px] font-bold text-purple-900 block truncate">মোট স্টাফ অ্যাকশন</span>
                <div className="text-xl sm:text-2xl font-black text-purple-950 font-mono truncate">{totalLogs}</div>
                <span className="text-[10px] text-purple-700 block truncate">সম্পূর্ণ সিস্টেম রেকর্ড</span>
              </div>

              <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-sky-50/70 border border-sky-200/80 space-y-1">
                <span className="text-[10px] sm:text-[11px] font-bold text-sky-900 block truncate">ডেলিভারি ও ক্যাশ কালেকশন</span>
                <div className="text-xl sm:text-2xl font-black text-sky-950 font-mono truncate">{deliveryCount}</div>
                <span className="text-[10px] text-sky-700 block truncate">রাইডার অ্যাকশন সম্পন্ন</span>
              </div>

              <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-amber-50/70 border border-amber-200/80 space-y-1">
                <span className="text-[10px] sm:text-[11px] font-bold text-amber-900 block truncate">কিচেন ও বেকিং অ্যাকশন</span>
                <div className="text-xl sm:text-2xl font-black text-amber-950 font-mono truncate">{kitchenCount}</div>
                <span className="text-[10px] text-amber-700 block truncate">বেকিং ও রেডি স্ট্যাটাস</span>
              </div>

              <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-emerald-50/70 border border-emerald-200/80 space-y-1">
                <span className="text-[10px] sm:text-[11px] font-bold text-emerald-900 block truncate">সর্বাধিক সক্রিয় কর্মী</span>
                <div className="text-sm sm:text-base font-black text-emerald-950 truncate" title={topActor}>
                  {topActor.replace(/\s*\([^)]*\)/, '')}
                </div>
                <span className="text-[10px] text-emerald-700 font-semibold block truncate">{topCount} টি কাজ সম্পন্ন</span>
              </div>
            </div>

            {/* Filter Toolbar */}
            <div className="bg-slate-50 p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200/80 space-y-2.5 sm:space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <Filter className="w-4 h-4 text-purple-600" />
                  <span>ফিল্টার ও সার্চ কন্ট্রোল</span>
                </span>
                {(auditStaffFilter !== 'all' || auditCategoryFilter !== 'all' || auditSearchQuery.trim()) && (
                  <button
                    type="button"
                    onClick={() => {
                      setAuditStaffFilter('all');
                      setAuditCategoryFilter('all');
                      setAuditSearchQuery('');
                    }}
                    className="text-purple-700 hover:text-purple-900 text-xs font-bold underline cursor-pointer"
                  >
                    ফিল্টার রিসেট করুন
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* 1. Staff Dropdown */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">স্টাফ সদস্য (Staff Member):</label>
                  <select
                    value={auditStaffFilter}
                    onChange={(e) => setAuditStaffFilter(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 font-semibold bg-white text-slate-800 focus:outline-purple-500 cursor-pointer"
                  >
                    <option value="all">সকল স্টাফ সদস্য (All Staff)</option>
                    {distinctActors.map((actor) => (
                      <option key={actor} value={actor}>
                        👤 {actor}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Category Dropdown */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">কাজের ধরন (Action Type):</label>
                  <select
                    value={auditCategoryFilter}
                    onChange={(e) => setAuditCategoryFilter(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 font-semibold bg-white text-slate-800 focus:outline-purple-500 cursor-pointer"
                  >
                    <option value="all">সকল ক্যাটাগরি (All Actions)</option>
                    <option value="order">📦 অর্ডার কনফার্মেশন ও পরিবর্তন</option>
                    <option value="kitchen">👨‍🍳 কিচেন ও বেকিং কার্যক্রম</option>
                    <option value="delivery">🛵 ডেলিভারি ও রাইডার এসাইন</option>
                    <option value="finance">💵 ক্যাশ কালেকশন ও ডিপোজিট</option>
                    <option value="product">🎂 প্রোডাক্ট ও দামের পরিবর্তন</option>
                    <option value="staff">👥 স্টাফ অ্যাকাউন্ট ও পারমিশন</option>
                    <option value="coupon">🎟️ কুপন ও অফার</option>
                    <option value="settings">⚙️ শপ সেটিংস ও কনফিগ</option>
                  </select>
                </div>

                {/* 3. Search Box */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">সরাসরি খুঁজুন (Search):</label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="অর্ডার নং, নাম বা অ্যাকশন লিখুন..."
                      value={auditSearchQuery}
                      onChange={(e) => setAuditSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 font-semibold bg-white text-slate-800 focus:outline-purple-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* History Feed List */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <span>ফিল্টারকৃত রেকর্ড: <strong>{filteredLogs.length}</strong> টি</span>
                {auditStaffFilter !== 'all' && (
                  <span className="text-purple-700 font-bold bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-200">
                    নির্দিষ্ট কর্মী: {auditStaffFilter}
                  </span>
                )}
              </div>

              {filteredLogs.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-300 p-6 space-y-2">
                  <div className="text-3xl">📜</div>
                  <h4 className="font-bold text-slate-700 text-sm">কোনো কাজের হিস্ট্রি পাওয়া যায়নি</h4>
                  <p className="text-xs text-slate-500">
                    নির্বাচিত ফিল্টারের সাথে মিলে এমন কোনো অ্যাকশন পাওয়া যায়নি। অনুগ্রহ করে ফিল্টার পরিবর্তন বা রিসেট করুন।
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setAuditStaffFilter('all');
                      setAuditCategoryFilter('all');
                      setAuditSearchQuery('');
                    }}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl mt-2 cursor-pointer transition-colors"
                  >
                    সকল হিস্ট্রি দেখুন
                  </button>
                </div>
              ) : (
                displayedLogs.map((log) => {
                  const badge = getCategoryBadge(log.entity_type);
                  const IconComponent = badge.icon;
                  const logDate = new Date(log.created_at);
                  const formattedTime = logDate.toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' });
                  const formattedDate = logDate.toLocaleDateString('bn-BD', { day: 'numeric', month: 'short', year: 'numeric' });

                  return (
                    <div
                      key={log.id}
                      className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200 bg-white hover:border-purple-300 hover:shadow-xs transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 sm:gap-3 text-xs"
                    >
                      {/* Left: Avatar & Role */}
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 shrink-0 font-bold text-xs shadow-xs">
                          {log.actor_name.slice(0, 2).toUpperCase()}
                        </div>

                        <div className="space-y-1 min-w-0 flex-1">
                          {/* Top Row: Action Title & Pill */}
                          <div className="flex flex-wrap items-center gap-2">
                            <strong className="text-slate-900 font-bold text-sm">
                              {log.action}
                            </strong>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border flex items-center gap-1 ${badge.bg}`}>
                              <IconComponent className="w-3 h-3" />
                              <span>{badge.label}</span>
                            </span>
                          </div>

                          {/* Details */}
                          <p className="text-slate-700 text-xs leading-relaxed font-normal">
                            {log.details}
                          </p>

                          {/* Actor Info */}
                          <div className="flex items-center gap-3 pt-0.5 text-[11px] text-slate-500">
                            <span className="flex items-center gap-1 font-semibold text-purple-900">
                              <User className="w-3 h-3 text-purple-600" />
                              <span>কর্মী: {log.actor_name}</span>
                            </span>
                            {log.staff_role && (
                              <span className="bg-slate-100 text-slate-600 px-2 py-0.2 rounded-md font-mono text-[10px]">
                                {log.staff_role}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Timestamp */}
                      <div className="text-left sm:text-right shrink-0 bg-slate-50 sm:bg-transparent p-2 sm:p-0 rounded-xl w-full sm:w-auto border sm:border-0 border-slate-100">
                        <div className="text-slate-800 font-bold text-xs flex items-center sm:justify-end gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{formattedTime}</span>
                        </div>
                        <span className="text-[11px] text-slate-400 block font-medium">
                          {formattedDate}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}

              {/* Show More Button */}
              {filteredLogs.length > displayedLogs.length && (
                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => setAuditVisibleLimit(prev => prev + 40)}
                    className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    আরও ২০টি হিস্ট্রি লোড করুন (Load More)
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* TAB 8: STAFF & ROLES RBAC MANAGEMENT */}
      {activeTab === 'staff_management' && (
        <StaffPermissionManager
          currentRole={role}
          actorName={role === 'super_admin' ? 'Super Admin (Owner)' : role === 'admin' ? 'Admin' : 'Staff Admin'}
        />
      )}

      </React.Suspense>

      {/* MODAL: ADD / EDIT PRODUCT WITH CUSTOM WEIGHTS & PRICES */}
      {showAddProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 max-w-xl w-full shadow-2xl border border-slate-100 space-y-4 my-4 sm:my-8 max-h-[94vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">
                  {editingProductId ? 'কেক ও ওজনের দাম সম্পাদনা করুন (Edit Cake & Prices)' : 'নতুন কেক ও ওজনের দাম যোগ করুন (Add Cake & Weights)'}
                </h3>
                <p className="text-xs text-slate-500">
                  কেকের নাম, ক্যাটাগরি এবং প্রতিটি ওজনের জন্য আলাদা আলাদা দাম ও অফার মূল্য নির্ধারণ করুন।
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddProductModal(false);
                  setEditingProductId(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProduct} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">কেকের নাম (Cake Name) *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Belgian Triple Chocolate Fudge"
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 font-semibold focus:outline-rose-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">ক্যাটাগরি (Category) *</label>
                  <select
                    value={newProductCategoryId}
                    onChange={(e) => setNewProductCategoryId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 font-medium focus:outline-rose-500"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">ছবির লিংক (Image URL)</label>
                <input
                  type="text"
                  placeholder="https://... or /images/..."
                  value={newProductImg}
                  onChange={(e) => setNewProductImg(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 text-slate-600 focus:outline-rose-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">কেকের বিবরণ (Description)</label>
                <textarea
                  rows={2}
                  placeholder="কেকের উপাদান, ফ্লেভার ও বৈশিষ্ট্য লিখুন..."
                  value={newProductDesc}
                  onChange={(e) => setNewProductDesc(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-rose-500"
                />
              </div>

              {/* Dynamic Weights & Prices Section */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <span>⚖️ কেকের ওজন ও দাম নির্ধারণ (Weight & Price Options) *</span>
                    </label>
                    <p className="text-[11px] text-slate-500">
                      কোন ওজনের কেকের দাম কত হবে তা এখানে উল্লেখ করুন (যেমন: ৫০০ গ্রাম, ১ কেজি, ২ কেজি ইত্যাদি)।
                    </p>
                  </div>
                </div>

                {/* Quick Preset Buttons */}
                <div className="flex flex-wrap gap-1.5 py-1">
                  <span className="text-[10px] text-slate-400 font-semibold self-center mr-1">কুইক অ্যাড:</span>
                  <button
                    type="button"
                    onClick={() => handleAddVariantRow(500, '500g (Serves 4)')}
                    className="text-[10px] bg-slate-100 hover:bg-rose-50 hover:text-rose-600 px-2 py-1 rounded-md font-semibold border border-slate-200 transition-all cursor-pointer"
                  >
                    + ৫০০ গ্রাম
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddVariantRow(1000, '1kg (Serves 8-10)')}
                    className="text-[10px] bg-slate-100 hover:bg-rose-50 hover:text-rose-600 px-2 py-1 rounded-md font-semibold border border-slate-200 transition-all cursor-pointer"
                  >
                    + ১ কেজি
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddVariantRow(1500, '1.5kg (Serves 12-14)')}
                    className="text-[10px] bg-slate-100 hover:bg-rose-50 hover:text-rose-600 px-2 py-1 rounded-md font-semibold border border-slate-200 transition-all cursor-pointer"
                  >
                    + ১.৫ কেজি
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddVariantRow(2000, '2kg (Serves 16-20)')}
                    className="text-[10px] bg-slate-100 hover:bg-rose-50 hover:text-rose-600 px-2 py-1 rounded-md font-semibold border border-slate-200 transition-all cursor-pointer"
                  >
                    + ২ কেজি
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddVariantRow(2500, '2.5kg (Serves 20-25)')}
                    className="text-[10px] bg-slate-100 hover:bg-rose-50 hover:text-rose-600 px-2 py-1 rounded-md font-semibold border border-slate-200 transition-all cursor-pointer"
                  >
                    + ২.৫ কেজি
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddVariantRow(3000, '3kg (Serves 25-30)')}
                    className="text-[10px] bg-slate-100 hover:bg-rose-50 hover:text-rose-600 px-2 py-1 rounded-md font-semibold border border-slate-200 transition-all cursor-pointer"
                  >
                    + ৩ কেজি
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddVariantRow(1000, 'কাস্টম ওজন')}
                    className="text-[10px] bg-rose-50 text-rose-600 hover:bg-rose-100 px-2 py-1 rounded-md font-bold border border-rose-200 transition-all cursor-pointer"
                  >
                    + কাস্টম ওজন
                  </button>
                </div>

                {/* List of Variant Rows */}
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {productVariantRows.map((v, index) => (
                    <div
                      key={v.id}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 relative"
                    >
                      <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                        <span>ওজন অপশন #{index + 1}</span>
                        {productVariantRows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveVariantRow(v.id)}
                            className="text-red-500 hover:text-red-700 p-1 rounded-md hover:bg-red-50 cursor-pointer"
                            title="Remove weight option"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <div className="sm:col-span-2">
                          <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">
                            লেবেল / নাম (Label) *
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. 500g (Serves 4)"
                            value={v.name}
                            onChange={(e) => handleUpdateVariantRow(v.id, 'name', e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white font-medium focus:outline-rose-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">
                            ওজন (গ্রাম) *
                          </label>
                          <input
                            type="number"
                            required
                            min={50}
                            step={50}
                            placeholder="500, 1000"
                            value={v.weight_grams}
                            onChange={(e) => handleUpdateVariantRow(v.id, 'weight_grams', Number(e.target.value))}
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white font-semibold focus:outline-rose-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">
                            নিয়মিত দাম ({currency}) *
                          </label>
                          <input
                            type="number"
                            required
                            min={0}
                            placeholder="1200"
                            value={v.price}
                            onChange={(e) => handleUpdateVariantRow(v.id, 'price', Number(e.target.value))}
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white font-bold text-rose-600 focus:outline-rose-500"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1 border-t border-slate-200/60">
                        <label className="text-[10px] font-semibold text-slate-500 shrink-0">
                          অফার / ছাড়ের মূল্য ({currency}) (ঐচ্ছিক):
                        </label>
                        <input
                          type="number"
                          min={0}
                          placeholder="ছাড় না থাকলে খালি রাখুন"
                          value={v.sale_price}
                          onChange={(e) => handleUpdateVariantRow(v.id, 'sale_price', e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-48 px-2.5 py-1 text-xs rounded-lg border border-slate-200 bg-white text-slate-700"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Allowed Flavors Checklist */}
              {flavors.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800">
                      🎨 এই কেকের জন্য প্রযোজ্য ফ্লেভারসমূহ (Allowed Flavors)
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedProductFlavorIds(flavors.map(f => f.id))}
                        className="text-[10px] text-rose-600 font-bold hover:underline cursor-pointer"
                      >
                        সব সিলেক্ট
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedProductFlavorIds([])}
                        className="text-[10px] text-slate-500 font-bold hover:underline cursor-pointer"
                      >
                        খালি করুন
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {flavors.map((fl) => {
                      const isChecked = selectedProductFlavorIds.includes(fl.id);
                      return (
                        <button
                          key={fl.id}
                          type="button"
                          onClick={() => setSelectedProductFlavorIds(prev => isChecked ? prev.filter(id => id !== fl.id) : [...prev, fl.id])}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1 ${
                            isChecked
                              ? 'bg-rose-50 border-rose-300 text-rose-800'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          <span className="w-2.5 h-2.5 rounded-full border border-slate-300 inline-block" style={{ backgroundColor: fl.color_hex || '#f1e8db' }} />
                          <span>{fl.name}</span>
                          {isChecked && <Check className="w-3 h-3 text-rose-600" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Allowed Addons Checklist */}
              {addons.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs font-bold text-slate-800">
                        ✨ এই কেকের সাথে যে যে অ্যাড-অন দেওয়া যাবে (Allowed Add-ons)
                      </label>
                      <p className="text-[10px] text-slate-500">
                        কাস্টমার কেকটি অর্ডারের সময় নিচের যেসব অ্যাড-অনে টিক দেওয়া থাকবে কেবল সেগুলো সিলেক্ট করতে পারবে।
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedProductAddonIds(addons.map(a => a.id))}
                        className="text-[10px] text-emerald-700 font-bold hover:underline cursor-pointer"
                      >
                        সব সিলেক্ট
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedProductAddonIds([])}
                        className="text-[10px] text-slate-500 font-bold hover:underline cursor-pointer"
                      >
                        খালি করুন
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {addons.map((ad) => {
                      const isChecked = selectedProductAddonIds.includes(ad.id);
                      return (
                        <button
                          key={ad.id}
                          type="button"
                          onClick={() => setSelectedProductAddonIds(prev => isChecked ? prev.filter(id => id !== ad.id) : [...prev, ad.id])}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1 ${
                            isChecked
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-bold'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          <span>{ad.name}</span>
                          <span className="text-[10px] opacity-75">(+{currency}{ad.price})</span>
                          {isChecked && <Check className="w-3 h-3 text-emerald-600" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddProductModal(false);
                    setEditingProductId(null);
                  }}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>সংরক্ষণ ও পাবলিশ করুন (Save Cake)</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT ADDON */}
      {showAddonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 max-w-md w-full shadow-2xl border border-slate-100 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                {editingAddonId ? (
                  <>
                    <Edit2 className="w-4 h-4 text-emerald-600" />
                    <span>অ্যাড-অন সম্পাদনা করুন (Edit Add-on)</span>
                  </>
                ) : (
                  <>
                    <PlusCircle className="w-4 h-4 text-emerald-600" />
                    <span>নতুন অ্যাড-অন তৈরি করুন (New Product Add-on)</span>
                  </>
                )}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowAddonModal(false);
                  setEditingAddonId(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveAddon} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">অ্যাড-অন এর নাম (Name) *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Birthday Candle Set, Red Rose"
                  value={newAddonName}
                  onChange={(e) => setNewAddonName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-semibold focus:outline-rose-500"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">মূল্য / দাম ({currency}) *</label>
                <input
                  type="number"
                  required
                  min={0}
                  value={newAddonPrice}
                  onChange={(e) => setNewAddonPrice(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold text-rose-600 focus:outline-rose-500"
                />
              </div>
              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddonModal(false);
                    setEditingAddonId(null);
                  }}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl shadow cursor-pointer"
                >
                  {editingAddonId ? 'আপডেট সংরক্ষণ করুন' : 'সংরক্ষণ করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD / EDIT COUPON MODAL */}
      {showCouponModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-2.5 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl sm:rounded-3xl max-w-lg w-full p-4 sm:p-6 space-y-4 shadow-2xl my-4 sm:my-8 max-h-[94vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">
                  {editingCouponId ? 'কুপন সম্পাদনা করুন (Edit Coupon)' : 'নতুন কুপন যোগ করুন (Add New Coupon)'}
                </h3>
                <p className="text-xs text-slate-500">
                  কুপন কোড, ডিসকাউন্ট মূল্য, ব্যবহার সীমা ও মেয়াদকাল নির্ধারণ করুন
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCouponModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCoupon} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  কুপন কোড (Coupon Code) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. WELCOME100, EID20"
                  value={couponCodeInput}
                  onChange={(e) => setCouponCodeInput(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 font-mono font-bold uppercase tracking-wider focus:outline-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    ডিসকাউন্টের ধরন *
                  </label>
                  <select
                    value={couponDiscountType}
                    onChange={(e) => setCouponDiscountType(e.target.value as 'fixed' | 'percentage')}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 font-semibold focus:outline-rose-500"
                  >
                    <option value="percentage">শতাংশ (%) / Percentage</option>
                    <option value="fixed">নির্দিষ্ট টাকা (৳) / Fixed</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    ডিসকাউন্টের পরিমাণ ({couponDiscountType === 'percentage' ? '%' : currency}) *
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={couponDiscountValue}
                    onChange={(e) => setCouponDiscountValue(Number(e.target.value))}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 font-bold focus:outline-rose-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    নূন্যতম অর্ডার (Min Order) {currency}
                  </label>
                  <input
                    type="number"
                    min={0}
                    placeholder="e.g. 800"
                    value={couponMinOrder}
                    onChange={(e) => setCouponMinOrder(Number(e.target.value))}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-rose-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    সর্বোচ্চ ছাড়ের সীমা (Max Cap) {currency}
                  </label>
                  <input
                    type="number"
                    min={0}
                    placeholder={couponDiscountType === 'percentage' ? 'e.g. 300' : 'প্রযোজ্য নয়'}
                    disabled={couponDiscountType === 'fixed'}
                    value={couponMaxDiscount}
                    onChange={(e) => setCouponMaxDiscount(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-rose-500 disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </div>
              </div>

              {/* Total Quota / Usage Counter */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  মোট কয়টি কুপন পাওয়া যাবে / সর্বোচ্চ ব্যবহার সীমা (Total Usage Limit)
                </label>
                <input
                  type="number"
                  min={1}
                  placeholder="e.g. 100 (খালি রাখলে সীমাহীন ব্যবহার)"
                  value={couponUsageLimit}
                  onChange={(e) => setCouponUsageLimit(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-rose-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  যতজন কাস্টমার এই কুপন ব্যবহার করতে পারবে (যেমন: ১০০ টি)। কোটা শেষ হলে কুপনটি বন্ধ হয়ে যাবে।
                </span>
              </div>

              {/* Validity Dates: from & until */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    শুরুর তারিখ (Valid From)
                  </label>
                  <input
                    type="date"
                    value={couponValidFrom}
                    onChange={(e) => setCouponValidFrom(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-rose-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    মেয়াদ শেষের তারিখ (Valid Until)
                  </label>
                  <input
                    type="date"
                    value={couponValidUntil}
                    onChange={(e) => setCouponValidUntil(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-rose-500"
                  />
                </div>
              </div>

              {/* Active Toggle */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="coupon_is_active_toggle"
                  checked={couponIsActive}
                  onChange={(e) => setCouponIsActive(e.target.checked)}
                  className="w-4 h-4 text-rose-600 rounded cursor-pointer"
                />
                <label htmlFor="coupon_is_active_toggle" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  কুপনটি সক্রিয় রাখুন (Active on Storefront & Checkout)
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCouponModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>সংরক্ষণ করুন (Save Coupon)</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Order Details & POS Print Popup Modal */}
      {selectedOrderForDetails && (
        <OrderDetailsModal
          isOpen={!!selectedOrderForDetails}
          order={selectedOrderForDetails}
          onClose={() => setSelectedOrderForDetails(null)}
          currency={currency}
          shopName={settings.shop_name}
          shopPhone={settings.phone}
          shopAddress={settings.address}
          websiteUrl={settings.website_url}
          facebookUrl={settings.facebook_url}
          userRole={role}
          hasPerm={(perm) => hasPerm(perm as StaffPermissionCode)}
          endpoint={endpoint}
          onOrderUpdated={(updatedOrder) => {
            setSelectedOrderForDetails({ ...updatedOrder });
          }}
          onStatusChange={(orderId, newStatus, notes) => {
            mockDb.updateOrderStatus(
              orderId,
              newStatus,
              notes,
              (role === 'super_admin' || role === 'admin') ? (role === 'super_admin' ? 'Super Admin' : 'Admin') : 'Order Manager'
            );
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
            syncOrderToBackend(orderId, op);
            const updated = mockDb.getOrders().find((o) => o.id === orderId);
            if (updated) setSelectedOrderForDetails(updated);
          }}
          onTriggerPosPrint={(ord) => {
            setSelectedOrderForDetails(null);
            setSelectedOrderForPosPrint(ord);
          }}
        />
      )}

      {/* POS Print Modal */}
      {selectedOrderForPosPrint && (
        <PosPrintModal
          order={selectedOrderForPosPrint}
          onClose={() => setSelectedOrderForPosPrint(null)}
          currency={currency}
          shopName={settings.shop_name}
          shopPhone={settings.phone}
          shopAddress={settings.address}
          websiteUrl={settings.website_url}
          facebookUrl={settings.facebook_url}
        />
      )}

      {/* POS Printer Settings Modal */}
      {isPosSettingsOpen && (
        <PosPrinterSettingsModal
          isOpen={isPosSettingsOpen}
          onClose={() => setIsPosSettingsOpen(false)}
          onTestPrint={() => {
            setIsPosSettingsOpen(false);
            setSelectedOrderForPosPrint(createDemoReceiptOrder(currency));
          }}
        />
      )}

      {/* Date-wise Collection Statement Modal */}
      {isCollectionStatementOpen && (
        <CollectionStatementModal
          isOpen={isCollectionStatementOpen}
          onClose={() => setIsCollectionStatementOpen(false)}
          orders={orders}
          currency={currency}
          shopName={settings.shop_name}
          shopPhone={settings.phone}
          shopAddress={settings.address}
        />
      )}

      {/* Admin Direct Create Order Modal (Auto-Confirmed) */}
      {isCreateOrderModalOpen && (
        <AdminCreateOrderModal
          isOpen={isCreateOrderModalOpen}
          onClose={() => setIsCreateOrderModalOpen(false)}
          products={products}
          zones={deliveryZones}
          slots={deliverySlots}
          flavors={flavors}
          addons={addons}
          coupons={coupons}
          currency={currency}
          role={role}
          endpoint={endpoint}
          onOrderCreated={(order) => {
            acknowledgeOrderAlert(order.id);
          }}
        />
      )}

      {/* Printable Thermal Label Modal (Legacy Backwards-Compatible) */}
      {selectedOrderForSticker && (
        <ThermalBoxStickerModal
          order={selectedOrderForSticker}
          onClose={() => setSelectedOrderForSticker(null)}
          currency={currency}
        />
      )}
    </div>
  );
};
