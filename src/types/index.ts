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
  variants: ProductVariant[];
  allowed_flavor_ids: string[];
  allowed_addon_ids: string[];
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
  rider_id?: string;
  rider_name?: string;
  cod_amount: number;
  cod_collected: boolean;
  created_at: string;
  updated_at: string;
  items: OrderItem[];
  history: OrderStatusHistoryItem[];
}

export interface Coupon {
  id: string;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_order_amount: number;
  max_discount_amount?: number;
  is_active: boolean;
  usage_count: number;
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
  details: string;
  created_at: string;
}
