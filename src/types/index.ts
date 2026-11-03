export type StaffRole = 
  | 'super_admin' 
  | 'admin' 
  | 'order_manager' 
  | 'kitchen_manager' 
  | 'delivery_manager' 
  | 'accountant' 
  | 'delivery_man';

export type OrderStatus = 
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'assigned'
  | 'picked_up'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export type PaymentMethod = 'cod' | 'bkash' | 'nagad' | 'card';
export type PaymentStatus = 'pending' | 'paid' | 'failed';

export interface ShopSettings {
  id: string;
  shop_name: string;
  logo_url: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  opening_time: string;
  closing_time: string;
  currency: string;
  accepting_orders: boolean;
  delivery_enabled: boolean;
  website_title: string;
  website_description: string;
  bkash_merchant_number?: string;
  nagad_merchant_number?: string;
  // Dynamic Web Texts (Zero Hardcoding - All from Database)
  top_announcement_text?: string;
  hero_tagline?: string;
  hero_title?: string;
  hero_subtitle?: string;
  hero_cta_text?: string;
  trust_badge_1_title?: string;
  trust_badge_1_desc?: string;
  trust_badge_2_title?: string;
  trust_badge_2_desc?: string;
  trust_badge_3_title?: string;
  trust_badge_3_desc?: string;
  trust_badge_4_title?: string;
  trust_badge_4_desc?: string;
  custom_cake_promo_tag?: string;
  custom_cake_promo_title?: string;
  custom_cake_promo_desc?: string;
  custom_cake_promo_btn?: string;
  footer_about_text?: string;
  facebook_url?: string;
  instagram_url?: string;
  youtube_url?: string;
  tiktok_url?: string;
  website_url?: string;
  profile_image_url?: string;
  brand_tagline?: string;
  facebook_handle?: string;
  mobile_subtitle?: string;
  complimentary_kit_title?: string;
  complimentary_kit_items?: string[];
  is_locally_modified?: boolean;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  image_url: string;
  sort_order: number;
  is_active: boolean;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  name: string; // '500g', '1kg', '1.5kg', '2kg'
  weight_grams: number;
  price: number;
  sale_price?: number;
  is_active: boolean;
}

export interface Flavor {
  id: string;
  name: string;
  color_hex: string;
  is_active: boolean;
}

export interface ProductAddon {
  id: string;
  name: string;
  price: number;
  image_url?: string;
  is_active: boolean;
}

export interface Product {
  id: string;
  category_id: string;
  category_name?: string;
  name: string;
  slug: string;
  description: string;
  base_price: number;
  sale_price?: number;
  image_url: string;
  gallery_images: string[];
  is_featured: boolean;
  is_active: boolean;
  rating: number;
  review_count: number;
  sold_count?: number;
  variants: ProductVariant[];
  allowed_flavor_ids: string[];
  allowed_addon_ids: string[];
  cost_ingredients?: number;
  cost_packaging?: number;
  cost_delivery?: number;
  cost_other?: number;
  dietary_tags?: ('eggless' | 'sugar_free' | 'nut_free' | 'halal')[];
  is_eggless?: boolean;
  is_sugar_free?: boolean;
  created_at?: string;
  is_new?: boolean;
}

export interface Banner {
  id: string;
  title: string;
  subtitle: string;
  image_url: string;
  button_text: string;
  button_link: string;
  is_active: boolean;
}

export interface DeliveryZone {
  id: string;
  name: string;
  delivery_fee: number;
  estimated_time: string;
  is_active: boolean;
}

export interface DeliverySlot {
  id: string;
  slot_label: string;
  is_active: boolean;
  is_midnight?: boolean;
  surcharge?: number;
}

export interface CartItem {
  cart_item_id: string;
  product: Product;
  selected_variant: ProductVariant;
  selected_flavor?: Flavor;
  selected_addons: ProductAddon[];
  writing_message: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  variant_name: string;
  flavor_name?: string;
  writing_message?: string;
  unit_price: number;
  base_price?: number;
  sale_price?: number;
  quantity: number;
  subtotal: number;
  addons: {
    addon_id: string;
    addon_name: string;
    unit_price: number;
    quantity: number;
    subtotal: number;
  }[];
}

export interface OrderStatusHistoryItem {
  id: string;
  status: OrderStatus;
  notes: string;
  created_at: string;
  actor_name?: string;
}

export interface Order {
  persistence?: 'google_sheets' | 'local_demo';
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  delivery_zone: DeliveryZone;
  delivery_slot: string;
  delivery_date: string;
  status: OrderStatus;
  subtotal: number;
  delivery_fee: number;
  discount_amount: number;
  total_amount: number;
  coupon_code?: string;
  order_note?: string;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  delivery_otp: string;
  /** Kept only on the original receipt and in the private sheet; never shown to staff. */
  customer_access_token?: string;
  customer_share_url?: string;
  rider_id?: string;
  rider_name?: string;
  cod_amount: number;
  cod_collected: boolean;
  // Gift & Surprise delivery options
  is_gift?: boolean;
  recipient_name?: string;
  recipient_phone?: string;
  sender_name?: string;
  sender_phone?: string;
  hide_price_on_box?: boolean;
  gift_card_message?: string;
  // Advance payment & due amount
  advance_paid_amount?: number;
  due_amount?: number;
  bkash_number?: string;
  bkash_trx_id?: string;
  created_at: string;
  updated_at: string;
  items: OrderItem[];
  history: OrderStatusHistoryItem[];
}

export interface RiderDeposit {
  id: string;
  rider_id: string;
  rider_name: string;
  amount: number;
  deposited_at: string;
  note?: string;
  actor_name?: string;
  status: 'confirmed' | 'pending';
}

export interface Coupon {
  id: string;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_order_amount: number;
  max_discount_amount?: number;
  is_active: boolean;
  usage_count?: number;
  usage_limit?: number;
  valid_from?: string;
  valid_until?: string;
  created_at?: string;
}

export interface Review {
  id: string;
  product_id: string;
  product_name: string;
  customer_name: string;
  rating: number;
  comment: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  image_url?: string;
  verified_purchase?: boolean;
  source?: 'web' | 'facebook';
  facebook_url?: string;
}

export interface CustomCakeRequest {
  id: string;
  customer_name: string;
  customer_phone: string;
  cake_type: string;
  approx_size: string;
  flavor: string;
  color_theme: string;
  writing_text: string;
  reference_image_url?: string;
  instructions: string;
  estimated_price?: number;
  status: 'pending' | 'quoted' | 'approved' | 'preparing' | 'completed' | 'rejected';
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  staff_role?: string;
  details: string;
  created_at: string;
}

export type StaffPermissionCode =
  // Order Management
  | 'orders.view'
  | 'orders.confirm'
  | 'orders.cancel'
  | 'orders.status'
  // Kitchen & Baking
  | 'kitchen.view'
  | 'kitchen.bake'
  | 'kitchen.ready'
  // Delivery & Riders
  | 'delivery.assign'
  | 'delivery.dispatch'
  | 'delivery.complete'
  | 'delivery.cash_settle'
  // Product & Menu Catalog
  | 'products.view'
  | 'products.create'
  | 'products.edit'
  | 'products.delete'
  // Costing & Profit
  | 'costing.view'
  | 'costing.edit'
  // Coupons & Discounts
  | 'coupons.manage'
  // Custom Bakes
  | 'custom_cakes.manage'
  // Shop Settings & CMS
  | 'settings.manage'
  // Analytics & Reports
  | 'analytics.view'
  // Audit Logs
  | 'audit.view'
  // Staff & Permissions Management
  | 'staff.manage';

export type PermissionCategory = 
  | 'orders' 
  | 'kitchen' 
  | 'delivery' 
  | 'products' 
  | 'costing' 
  | 'coupons' 
  | 'custom_cakes' 
  | 'settings' 
  | 'analytics' 
  | 'audit' 
  | 'staff';

export interface StaffPermissionDefinition {
  code: StaffPermissionCode;
  label: string;
  englishLabel: string;
  category: PermissionCategory;
  categoryLabel: string;
  description: string;
}

export interface StaffMember {
  id: string;
  name: string;
  username: string;
  role: StaffRole;
  password?: string; // Minimum 4 digit/char login password or PIN
  phone?: string;
  email?: string;
  permissions: StaffPermissionCode[];
  is_active: boolean;
  created_at: string;
  last_login?: string;
}

// ===== FINANCE & ACCOUNTING TYPES =====
export type AccountType = 'cash' | 'bank' | 'bkash' | 'nagad' | 'rocket';
export type LedgerEntryType = 'income' | 'expense' | 'transfer' | 'refund' | 'adjustment';

export interface CashAccount {
  id: string;
  name: string;
  account_type: AccountType;
  balance: number;
  is_active: boolean;
  created_at: string;
}

export interface FinanceLedgerEntry {
  id: string;
  entry_type: LedgerEntryType;
  account_id: string;
  account_name: string;
  amount: number;
  reference_id?: string; // order_id, purchase_id etc.
  reference_type?: string;
  description: string;
  created_by: string;
  created_at: string;
}

export interface Expense {
  id: string;
  category: string; // 'rent', 'salary', 'utilities', 'ingredients', 'packaging', 'marketing', 'other'
  description: string;
  amount: number;
  account_id: string;
  account_name: string;
  expense_date: string;
  receipt_url?: string;
  approved_by?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_by: string;
  created_at: string;
}

export interface ApprovalRequest {
  id: string;
  request_type: 'rider_deposit' | 'refund' | 'stock_adjustment' | 'cash_transfer' | 'expense';
  reference_id: string;
  amount?: number;
  description: string;
  requested_by: string;
  requested_by_name: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by?: string;
  reviewed_at?: string;
  review_note?: string;
  created_at: string;
}

// ===== INVENTORY & STOCK TYPES =====
export type UnitType = 'kg' | 'g' | 'liter' | 'ml' | 'pcs' | 'dozen' | 'pack' | 'box';

export interface Ingredient {
  id: string;
  name: string;
  category: string; // 'flour', 'sugar', 'dairy', 'eggs', 'flavoring', 'packaging', 'other'
  unit: UnitType;
  current_stock: number;
  minimum_stock: number; // Low stock threshold
  cost_per_unit: number;
  supplier_id?: string;
  supplier_name?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StockMovement {
  id: string;
  ingredient_id: string;
  ingredient_name: string;
  movement_type: 'purchase' | 'usage' | 'adjustment' | 'damage' | 'return';
  quantity: number; // positive = in, negative = out
  unit: UnitType;
  unit_cost?: number;
  total_cost?: number;
  reference_id?: string;
  reference_type?: string;
  notes?: string;
  created_by: string;
  created_at: string;
}

export interface StockBatch {
  id: string;
  ingredient_id: string;
  ingredient_name: string;
  quantity: number;
  unit: UnitType;
  cost_per_unit: number;
  total_cost: number;
  purchase_date: string;
  expiry_date?: string;
  supplier_id?: string;
  supplier_name?: string;
  status: 'active' | 'depleted' | 'expired' | 'damaged';
}

// ===== PURCHASES & SUPPLIERS TYPES =====
export interface Supplier {
  id: string;
  name: string;
  contact_person?: string;
  phone: string;
  email?: string;
  address?: string;
  due_amount: number;
  total_purchases: number;
  is_active: boolean;
  created_at: string;
}

export interface Purchase {
  id: string;
  supplier_id: string;
  supplier_name: string;
  total_amount: number;
  paid_amount: number;
  due_amount: number;
  payment_method: AccountType;
  account_id: string;
  purchase_date: string;
  received_by: string;
  notes?: string;
  status: 'pending' | 'received' | 'partial' | 'returned';
  created_at: string;
}

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  ingredient_id: string;
  ingredient_name: string;
  quantity: number;
  unit: UnitType;
  cost_per_unit: number;
  total_cost: number;
}

// ===== POS / SALES TYPES =====
export interface PosCartItem {
  product_id: string;
  product_name: string;
  variant_id?: string;
  variant_name?: string;
  unit_price: number;
  quantity: number;
  discount_amount: number;
  subtotal: number;
}

export interface CashSession {
  id: string;
  opened_by: string;
  opened_by_name: string;
  opening_balance: number;
  closing_balance?: number;
  expected_balance?: number;
  discrepancy?: number;
  status: 'open' | 'closed';
  opened_at: string;
  closed_at?: string;
  closed_by?: string;
  notes?: string;
}

export interface Sale {
  id: string;
  sale_number: string;
  session_id?: string;
  items: PosCartItem[];
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  payment_method: AccountType | 'split';
  payment_split?: { method: AccountType; amount: number }[];
  account_id?: string;
  served_by: string;
  customer_id?: string;
  customer_name?: string;
  customer_phone?: string;
  notes?: string;
  is_return?: boolean;
  original_sale_id?: string;
  created_at: string;
}

// ===== CUSTOMER CRM TYPES =====
export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  area?: string;
  birthday?: string;
  anniversary?: string;
  notes?: string;
  total_orders: number;
  total_spending: number;
  last_order_date?: string;
  is_vip?: boolean;
  created_at: string;
  updated_at: string;
}

// ===== PRODUCTION TYPES =====
export interface ProductionJob {
  id: string;
  order_id?: string;
  order_number?: string;
  product_id: string;
  product_name: string;
  quantity: number;
  recipe_id?: string;
  assigned_baker?: string;
  assigned_baker_name?: string;
  scheduled_for?: string;
  started_at?: string;
  completed_at?: string;
  estimated_minutes?: number;
  actual_minutes?: number;
  status: 'queued' | 'in_progress' | 'ready' | 'delivered' | 'cancelled';
  notes?: string;
  total_cost?: number;
  created_at: string;
}

export interface Recipe {
  id: string;
  product_id: string;
  product_name: string;
  serves?: number;
  prep_time_minutes?: number;
  bake_time_minutes?: number;
  instructions?: string;
  is_active: boolean;
  created_at: string;
}

export interface RecipeItem {
  id: string;
  recipe_id: string;
  ingredient_id: string;
  ingredient_name: string;
  quantity: number;
  unit: UnitType;
}

// ===== REPORTS TYPES =====
export interface DailySalesReport {
  date: string;
  total_orders: number;
  total_revenue: number;
  total_cost: number;
  gross_profit: number;
  expenses: number;
  net_profit: number;
  cash_sales: number;
  bkash_sales: number;
  nagad_sales: number;
  cod_collected: number;
  refunds: number;
}

export interface RiderCashEntry {
  id: string;
  rider_id: string;
  rider_name: string;
  order_id: string;
  order_number: string;
  cod_amount: number;
  collected_at?: string;
  deposited: boolean;
  deposit_id?: string;
  created_at: string;
}

