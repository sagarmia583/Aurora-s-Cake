import {
  ShopSettings,
  Category,
  Product,
  Flavor,
  ProductAddon,
  Banner,
  DeliveryZone,
  DeliverySlot,
  Order,
  OrderStatus,
  Coupon,
  Review,
  CustomCakeRequest,
  AuditLog,
  CartItem,
} from '../types';
import { cacheEngine } from './cacheEngine';

// Initial dynamic shop settings
const INITIAL_SHOP_SETTINGS: ShopSettings = {
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
  facebook_url: 'https://facebook.com',
  instagram_url: 'https://instagram.com',
};

const INITIAL_CATEGORIES: Category[] = [
  {
    id: 'cat-1',
    name: 'Birthday Specials',
    slug: 'birthday-cakes',
    description: 'Festive handcrafted celebration cakes made with rich Bavarian cream',
    image_url: 'https://images.unsplash.com/photo-1535141192574-5d4897c13136?w=600&auto=format&fit=crop&q=80',
    sort_order: 1,
    is_active: true,
  },
  {
    id: 'cat-2',
    name: 'Chocolate Temptations',
    slug: 'chocolate-cakes',
    description: 'Decadent imported 70% Belgian dark chocolate truffles and ganache',
    image_url: 'https://images.unsplash.com/photo-1606890737304-57a1ca8a5b62?w=600&auto=format&fit=crop&q=80',
    sort_order: 2,
    is_active: true,
  },
  {
    id: 'cat-3',
    name: 'Wedding & Anniversary',
    slug: 'wedding-anniversary',
    description: 'Multi-tiered romantic masterpieces with sugar florals and gold leaf accents',
    image_url: 'https://images.unsplash.com/photo-1519869325930-281384150729?w=600&auto=format&fit=crop&q=80',
    sort_order: 3,
    is_active: true,
  },
  {
    id: 'cat-4',
    name: 'Cheesecakes & Berries',
    slug: 'cheesecakes',
    description: 'Slow-baked New York style and fresh strawberry mousse cheesecakes',
    image_url: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=600&auto=format&fit=crop&q=80',
    sort_order: 4,
    is_active: true,
  },
  {
    id: 'cat-5',
    name: 'Cupcakes & Pastries',
    slug: 'cupcakes-pastries',
    description: 'Bite-sized happiness boxes perfect for gifts and tea parties',
    image_url: 'https://images.unsplash.com/photo-1576618148400-f54bed99fcfd?w=600&auto=format&fit=crop&q=80',
    sort_order: 5,
    is_active: true,
  },
];

const INITIAL_FLAVORS: Flavor[] = [
  { id: 'flav-1', name: 'Belgian Dark Truffle', color_hex: '#3e2723', is_active: true },
  { id: 'flav-2', name: 'Velvet Madagascar Vanilla', color_hex: '#fff9c4', is_active: true },
  { id: 'flav-3', name: 'Signature Red Velvet', color_hex: '#b71c1c', is_active: true },
  { id: 'flav-4', name: 'Black Forest Royale', color_hex: '#880e4f', is_active: true },
  { id: 'flav-5', name: 'Lotus Biscoff Crunch', color_hex: '#d7ccc8', is_active: true },
  { id: 'flav-6', name: 'Salted Caramel Praline', color_hex: '#ffb74d', is_active: true },
];

const INITIAL_ADDONS: ProductAddon[] = [
  { id: 'addon-1', name: 'Sparkler Candle Set (Pack of 4)', price: 120, is_active: true },
  { id: 'addon-2', name: 'Golden Acrylic "Happy Birthday" Topper', price: 180, is_active: true },
  { id: 'addon-3', name: 'Handwritten Calligraphy Card', price: 80, is_active: true },
  { id: 'addon-4', name: 'Fresh Red Roses Mini Bouquet', price: 350, is_active: true },
  { id: 'addon-5', name: 'Ferrero Rocher Box (4 pcs)', price: 420, is_active: true },
];

const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'prod-1',
    category_id: 'cat-2',
    category_name: 'Chocolate Temptations',
    name: 'Belgian Triple Chocolate Fudge',
    slug: 'belgian-triple-chocolate-fudge',
    description: 'Layers of moist chocolate sponge smothered with velvety 70% dark Belgian ganache, chocolate crisps, and golden dusted cocoa nibs.',
    base_price: 1250,
    sale_price: 1150,
    image_url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=800&auto=format&fit=crop&q=80',
    gallery_images: [
      'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1606890737304-57a1ca8a5b62?w=800&auto=format&fit=crop&q=80',
    ],
    is_featured: true,
    is_active: true,
    rating: 4.9,
    review_count: 84,
    variants: [
      { id: 'var-1-1', product_id: 'prod-1', name: '500g (Serves 4)', weight_grams: 500, price: 680, is_active: true },
      { id: 'var-1-2', product_id: 'prod-1', name: '1kg (Serves 8-10)', weight_grams: 1000, price: 1250, sale_price: 1150, is_active: true },
      { id: 'var-1-3', product_id: 'prod-1', name: '1.5kg (Serves 12-14)', weight_grams: 1500, price: 1750, is_active: true },
      { id: 'var-1-4', product_id: 'prod-1', name: '2kg (Serves 18-20)', weight_grams: 2000, price: 2300, is_active: true },
    ],
    allowed_flavor_ids: ['flav-1', 'flav-5', 'flav-6'],
    allowed_addon_ids: ['addon-1', 'addon-2', 'addon-3', 'addon-4', 'addon-5'],
  },
  {
    id: 'prod-2',
    category_id: 'cat-1',
    category_name: 'Birthday Specials',
    name: 'Royale Red Velvet Cream Cheese',
    slug: 'royale-red-velvet-cream-cheese',
    description: 'Classic crimson cocoa crumb layered with authentic Philadelphia cream cheese frosting and white chocolate curls.',
    base_price: 1350,
    image_url: 'https://images.unsplash.com/photo-1586788680434-30d324b2d46f?w=800&auto=format&fit=crop&q=80',
    gallery_images: [
      'https://images.unsplash.com/photo-1586788680434-30d324b2d46f?w=800&auto=format&fit=crop&q=80',
    ],
    is_featured: true,
    is_active: true,
    rating: 4.8,
    review_count: 59,
    variants: [
      { id: 'var-2-1', product_id: 'prod-2', name: '500g (Serves 4)', weight_grams: 500, price: 720, is_active: true },
      { id: 'var-2-2', product_id: 'prod-2', name: '1kg (Serves 8-10)', weight_grams: 1000, price: 1350, is_active: true },
      { id: 'var-2-3', product_id: 'prod-2', name: '1.5kg (Serves 12-14)', weight_grams: 1500, price: 1950, is_active: true },
      { id: 'var-2-4', product_id: 'prod-2', name: '2kg (Serves 18-20)', weight_grams: 2000, price: 2500, is_active: true },
    ],
    allowed_flavor_ids: ['flav-3', 'flav-2'],
    allowed_addon_ids: ['addon-1', 'addon-2', 'addon-3', 'addon-4'],
  },
  {
    id: 'prod-3',
    category_id: 'cat-2',
    category_name: 'Chocolate Temptations',
    name: 'Black Forest Royale Amarena',
    slug: 'black-forest-royale-amarena',
    description: 'Traditional German Black Forest loaded with Italian dark cherries, fresh whipped cream, and shaved chocolate shards.',
    base_price: 1100,
    image_url: 'https://images.unsplash.com/photo-1606890737304-57a1ca8a5b62?w=800&auto=format&fit=crop&q=80',
    gallery_images: [
      'https://images.unsplash.com/photo-1606890737304-57a1ca8a5b62?w=800&auto=format&fit=crop&q=80',
    ],
    is_featured: false,
    is_active: true,
    rating: 4.7,
    review_count: 42,
    variants: [
      { id: 'var-3-1', product_id: 'prod-3', name: '500g (Serves 4)', weight_grams: 500, price: 620, is_active: true },
      { id: 'var-3-2', product_id: 'prod-3', name: '1kg (Serves 8-10)', weight_grams: 1000, price: 1100, is_active: true },
      { id: 'var-3-3', product_id: 'prod-3', name: '2kg (Serves 18-20)', weight_grams: 2000, price: 2100, is_active: true },
    ],
    allowed_flavor_ids: ['flav-4', 'flav-1'],
    allowed_addon_ids: ['addon-1', 'addon-2', 'addon-3'],
  },
  {
    id: 'prod-4',
    category_id: 'cat-4',
    category_name: 'Cheesecakes & Berries',
    name: 'Lotus Biscoff Salted Caramel Cheesecake',
    slug: 'lotus-biscoff-cheesecake',
    description: 'Crushed Biscoff cookie crust, silky baked cheesecake filling infused with cookie butter swirl, topped with caramelized drizzle.',
    base_price: 1450,
    sale_price: 1350,
    image_url: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=800&auto=format&fit=crop&q=80',
    gallery_images: [
      'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=800&auto=format&fit=crop&q=80',
    ],
    is_featured: true,
    is_active: true,
    rating: 5.0,
    review_count: 91,
    variants: [
      { id: 'var-4-1', product_id: 'prod-4', name: '500g (Serves 4)', weight_grams: 500, price: 780, is_active: true },
      { id: 'var-4-2', product_id: 'prod-4', name: '1kg (Serves 8-10)', weight_grams: 1000, price: 1450, sale_price: 1350, is_active: true },
      { id: 'var-4-3', product_id: 'prod-4', name: '2kg (Serves 18-20)', weight_grams: 2000, price: 2700, is_active: true },
    ],
    allowed_flavor_ids: ['flav-5', 'flav-6'],
    allowed_addon_ids: ['addon-1', 'addon-2', 'addon-3', 'addon-5'],
  },
  {
    id: 'prod-5',
    category_id: 'cat-3',
    category_name: 'Wedding & Anniversary',
    name: 'Elysian Floral Pastels Anniversary Cake',
    slug: 'elysian-floral-pastels',
    description: 'Two-tier ivory butter sponge with natural raspberry compote, handcrafted edible wafer florals, and 24K edible gold leaves.',
    base_price: 2600,
    image_url: 'https://images.unsplash.com/photo-1519869325930-281384150729?w=800&auto=format&fit=crop&q=80',
    gallery_images: [
      'https://images.unsplash.com/photo-1519869325930-281384150729?w=800&auto=format&fit=crop&q=80',
    ],
    is_featured: true,
    is_active: true,
    rating: 4.9,
    review_count: 36,
    variants: [
      { id: 'var-5-1', product_id: 'prod-5', name: '1.5kg Two-Tier (Serves 14)', weight_grams: 1500, price: 2600, is_active: true },
      { id: 'var-5-2', product_id: 'prod-5', name: '2.5kg Two-Tier (Serves 25)', weight_grams: 2500, price: 3950, is_active: true },
    ],
    allowed_flavor_ids: ['flav-2', 'flav-3'],
    allowed_addon_ids: ['addon-1', 'addon-2', 'addon-3', 'addon-4'],
  },
  {
    id: 'prod-6',
    category_id: 'cat-5',
    category_name: 'Cupcakes & Pastries',
    name: 'Artisan Assorted Cupcake Box (6 Pcs)',
    slug: 'artisan-cupcake-box-6pcs',
    description: 'Six signature swirls: Red Velvet, Dark Cocoa, Pistachio Rose, Salted Caramel, Blueberry Cream, and Vanilla Gold.',
    base_price: 650,
    image_url: 'https://images.unsplash.com/photo-1576618148400-f54bed99fcfd?w=800&auto=format&fit=crop&q=80',
    gallery_images: [
      'https://images.unsplash.com/photo-1576618148400-f54bed99fcfd?w=800&auto=format&fit=crop&q=80',
    ],
    is_featured: false,
    is_active: true,
    rating: 4.8,
    review_count: 53,
    variants: [
      { id: 'var-6-1', product_id: 'prod-6', name: 'Standard 6-Box', weight_grams: 450, price: 650, is_active: true },
      { id: 'var-6-2', product_id: 'prod-6', name: 'Deluxe 12-Box', weight_grams: 900, price: 1200, is_active: true },
    ],
    allowed_flavor_ids: ['flav-1', 'flav-2', 'flav-3'],
    allowed_addon_ids: ['addon-1', 'addon-3'],
  },
];

const INITIAL_BANNERS: Banner[] = [
  {
    id: 'ban-1',
    title: 'Celebrate Joy with Tangail’s Finest Artisan Bakery',
    subtitle: 'Order fresh 100% halal celebratory cakes with guaranteed 3-hour temperature-safe delivery.',
    image_url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=1200&auto=format&fit=crop&q=80',
    button_text: 'Explore Fresh Cakes',
    button_link: '#shop',
    is_active: true,
  },
];

const INITIAL_DELIVERY_ZONES: DeliveryZone[] = [
  { id: 'zone-1', name: 'Tangail Town (Main City Area)', delivery_fee: 60, estimated_time: '1-2 Hours Express', is_active: true },
  { id: 'zone-2', name: 'Nearby Suburbs & Akur Takur', delivery_fee: 100, estimated_time: '2-3 Hours', is_active: true },
  { id: 'zone-3', name: 'Outside Town / Cantonment / Bypass', delivery_fee: 150, estimated_time: '3-4 Hours', is_active: true },
];

const INITIAL_DELIVERY_SLOTS: DeliverySlot[] = [
  { id: 'slot-1', slot_label: '10:00 AM - 12:00 PM (Morning Slot)', is_active: true },
  { id: 'slot-2', slot_label: '12:00 PM - 02:00 PM (Lunch Slot)', is_active: true },
  { id: 'slot-3', slot_label: '02:00 PM - 04:00 PM (Afternoon Slot)', is_active: true },
  { id: 'slot-4', slot_label: '04:00 PM - 06:00 PM (Evening Teatime)', is_active: true },
  { id: 'slot-5', slot_label: '06:00 PM - 08:30 PM (Celebration Dinner)', is_active: true },
];

const INITIAL_COUPONS: Coupon[] = [
  { id: 'coup-1', code: 'WELCOME100', discount_type: 'fixed', discount_value: 100, min_order_amount: 800, is_active: true, usage_count: 14 },
  { id: 'coup-2', code: 'BIRTHDAY10', discount_type: 'percentage', discount_value: 10, min_order_amount: 1000, max_discount_amount: 300, is_active: true, usage_count: 28 },
  { id: 'coup-3', code: 'SWEETDELIGHT', discount_type: 'percentage', discount_value: 15, min_order_amount: 1500, max_discount_amount: 500, is_active: true, usage_count: 9 },
];

const INITIAL_ORDERS: Order[] = [
  {
    id: 'ord-101',
    order_number: 'CAKE-261007-00142',
    customer_name: 'Tanvir Hossain',
    customer_phone: '01712-998877',
    delivery_address: 'House 42, Road 3, Akur Takur Para, Tangail',
    delivery_zone: INITIAL_DELIVERY_ZONES[0],
    delivery_slot: '04:00 PM - 06:00 PM (Evening Teatime)',
    delivery_date: '2026-10-07',
    status: 'preparing',
    subtotal: 1150,
    delivery_fee: 60,
    discount_amount: 100,
    total_amount: 1110,
    coupon_code: 'WELCOME100',
    order_note: 'Please pack in golden gift box.',
    payment_method: 'cod',
    payment_status: 'pending',
    delivery_otp: '4829',
    cod_amount: 1110,
    cod_collected: false,
    created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    items: [
      {
        id: 'item-101-1',
        order_id: 'ord-101',
        product_id: 'prod-1',
        product_name: 'Belgian Triple Chocolate Fudge',
        variant_name: '1kg (Serves 8-10)',
        flavor_name: 'Belgian Dark Truffle',
        writing_message: 'Happy 25th Birthday Tanvir!',
        unit_price: 1150,
        quantity: 1,
        subtotal: 1150,
        addons: [],
      },
    ],
    history: [
      { id: 'h-1', status: 'pending', notes: 'Order placed by customer via web storefront', created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString() },
      { id: 'h-2', status: 'confirmed', notes: 'Confirmed by Order Manager', created_at: new Date(Date.now() - 35 * 60 * 1000).toISOString() },
      { id: 'h-3', status: 'preparing', notes: 'Baking sponge & frosting commenced in kitchen', created_at: new Date(Date.now() - 20 * 60 * 1000).toISOString() },
    ],
  },
  {
    id: 'ord-102',
    order_number: 'CAKE-261007-00143',
    customer_name: 'Farhana Sultana',
    customer_phone: '01844-332211',
    delivery_address: 'Flat 4B, Green View Villa, Victoria Road, Tangail',
    delivery_zone: INITIAL_DELIVERY_ZONES[0],
    delivery_slot: '06:00 PM - 08:30 PM (Celebration Dinner)',
    delivery_date: '2026-10-07',
    status: 'assigned',
    subtotal: 1350,
    delivery_fee: 60,
    discount_amount: 0,
    total_amount: 1410,
    order_note: 'Call before arriving',
    payment_method: 'bkash',
    payment_status: 'paid',
    delivery_otp: '7391',
    rider_id: 'rider-1',
    rider_name: 'Rahim Mia (Rider #1)',
    cod_amount: 0,
    cod_collected: true,
    created_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    items: [
      {
        id: 'item-102-1',
        order_id: 'ord-102',
        product_id: 'prod-2',
        product_name: 'Royale Red Velvet Cream Cheese',
        variant_name: '1kg (Serves 8-10)',
        flavor_name: 'Signature Red Velvet',
        writing_message: 'Happy Anniversary Mom & Dad',
        unit_price: 1350,
        quantity: 1,
        subtotal: 1350,
        addons: [],
      },
    ],
    history: [
      { id: 'h-102-1', status: 'pending', notes: 'Order placed by customer via web', created_at: new Date(Date.now() - 90 * 60 * 1000).toISOString() },
      { id: 'h-102-2', status: 'confirmed', notes: 'Payment verified via bKash TrxID #8X938472', created_at: new Date(Date.now() - 85 * 60 * 1000).toISOString() },
      { id: 'h-102-3', status: 'preparing', notes: 'Baking completed', created_at: new Date(Date.now() - 50 * 60 * 1000).toISOString() },
      { id: 'h-102-4', status: 'ready', notes: 'Packed in insulated delivery case', created_at: new Date(Date.now() - 25 * 60 * 1000).toISOString() },
      { id: 'h-102-5', status: 'assigned', notes: 'Assigned to delivery rider Rahim Mia', created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString() },
    ],
  },
];

const INITIAL_REVIEWS: Review[] = [
  {
    id: 'rev-1',
    product_id: 'prod-1',
    product_name: 'Belgian Triple Chocolate Fudge',
    customer_name: 'Sadia Jahan',
    rating: 5,
    comment: 'The chocolate quality was pure heaven! Delivered right on time in Tangail town with the dedication written perfectly.',
    status: 'approved',
    created_at: '2026-10-05',
  },
  {
    id: 'rev-2',
    product_id: 'prod-2',
    product_name: 'Royale Red Velvet Cream Cheese',
    customer_name: 'Mahbub Alam',
    rating: 5,
    comment: 'Real Philadelphia cream cheese taste. Not overly sweet. Everyone at the party asked where we ordered this from.',
    status: 'approved',
    created_at: '2026-10-06',
  },
];

const INITIAL_CUSTOM_CAKES: CustomCakeRequest[] = [
  {
    id: 'cc-1',
    customer_name: 'Nusrat Anam',
    customer_phone: '01711-223344',
    cake_type: '2-Tier Barbie Theme Birthday Cake',
    approx_size: '2kg',
    flavor: 'Vanilla & Belgian Chocolate Duo',
    color_theme: 'Pastel Pink & Baby Blue',
    writing_text: 'Princess Ayra is Turning 3!',
    reference_image_url: 'https://images.unsplash.com/photo-1535141192574-5d4897c13136?w=600&auto=format&fit=crop&q=80',
    instructions: 'Please use natural butter frosting instead of heavy fondant.',
    estimated_price: 3200,
    status: 'quoted',
    created_at: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
  },
];

const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'log-1',
    actor_name: 'System Bootstrapper',
    action: 'Database Initialized',
    entity_type: 'database',
    details: 'Initial schemas, products, and default delivery zones seeded.',
    created_at: new Date().toISOString(),
  },
];

// In-Memory & LocalStorage backed Reactive Database
class MockDatabase {
  private settings: ShopSettings;
  private categories: Category[];
  private products: Product[];
  private flavors: Flavor[];
  private addons: ProductAddon[];
  private banners: Banner[];
  private deliveryZones: DeliveryZone[];
  private deliverySlots: DeliverySlot[];
  private orders: Order[];
  private coupons: Coupon[];
  private reviews: Review[];
  private customCakes: CustomCakeRequest[];
  private auditLogs: AuditLog[];
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.settings = this.load('cake_db_settings', INITIAL_SHOP_SETTINGS);
    this.categories = this.load('cake_db_categories', INITIAL_CATEGORIES);
    this.products = this.load('cake_db_products', INITIAL_PRODUCTS);
    this.flavors = this.load('cake_db_flavors', INITIAL_FLAVORS);
    this.addons = this.load('cake_db_addons', INITIAL_ADDONS);
    this.banners = this.load('cake_db_banners', INITIAL_BANNERS);
    this.deliveryZones = this.load('cake_db_zones', INITIAL_DELIVERY_ZONES);
    this.deliverySlots = this.load('cake_db_slots', INITIAL_DELIVERY_SLOTS);
    this.orders = this.load('cake_db_orders', INITIAL_ORDERS);
    this.coupons = this.load('cake_db_coupons', INITIAL_COUPONS);
    this.reviews = this.load('cake_db_reviews', INITIAL_REVIEWS);
    this.customCakes = this.load('cake_db_custom_cakes', INITIAL_CUSTOM_CAKES);
    this.auditLogs = this.load('cake_db_audit_logs', INITIAL_AUDIT_LOGS);
  }

  private load<T>(key: string, fallback: T): T {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : fallback;
    } catch {
      return fallback;
    }
  }

  private save<T>(key: string, data: T) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch {
      // Storage full or unavailable
    }
  }

  private notify() {
    this.listeners.forEach((cb) => cb());
  }

  public subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  public logAudit(actor_name: string, action: string, entity_type: string, details: string) {
    const log: AuditLog = {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      actor_name,
      action,
      entity_type,
      details,
      created_at: new Date().toISOString(),
    };
    this.auditLogs.unshift(log);
    this.save('cake_db_audit_logs', this.auditLogs);
    this.notify();
  }

  // --- SHOP SETTINGS ---
  async getShopSettings(): Promise<ShopSettings> {
    return cacheEngine.getOrFetch(
      'shop_settings',
      async () => ({ ...this.settings }),
      { ttlMs: 300_000, tags: ['shop_settings'] }
    );
  }

  updateShopSettings(newSettings: Partial<ShopSettings>, actor = 'Admin') {
    this.settings = { ...this.settings, ...newSettings };
    this.save('cake_db_settings', this.settings);
    cacheEngine.invalidateByTag('shop_settings');
    this.logAudit(actor, 'Updated Shop Settings', 'shop_settings', `Updated shop settings: ${this.settings.shop_name}`);
    this.notify();
  }

  // --- CATEGORIES ---
  async getCategories(): Promise<Category[]> {
    return cacheEngine.getOrFetch(
      'categories_list',
      async () => [...this.categories],
      { ttlMs: 180_000, tags: ['categories'] }
    );
  }

  addCategory(category: Omit<Category, 'id'>, actor = 'Admin') {
    const newCat: Category = {
      id: `cat-${Date.now()}`,
      ...category,
    };
    this.categories.push(newCat);
    this.save('cake_db_categories', this.categories);
    cacheEngine.invalidateByTag('categories');
    this.logAudit(actor, 'Created Category', 'category', `Added category: ${category.name}`);
    this.notify();
  }

  // --- PRODUCTS ---
  async getProducts(): Promise<Product[]> {
    return cacheEngine.getOrFetch(
      'products_catalog',
      async () => [...this.products],
      { ttlMs: 120_000, tags: ['products'] }
    );
  }

  addProduct(product: Omit<Product, 'id'>, actor = 'Admin') {
    const newProd: Product = {
      id: `prod-${Date.now()}`,
      ...product,
    };
    this.products.unshift(newProd);
    this.save('cake_db_products', this.products);
    cacheEngine.invalidateByTag('products');
    this.logAudit(actor, 'Created Product', 'product', `Added product: ${product.name}`);
    this.notify();
  }

  updateProduct(productId: string, updates: Partial<Product>, actor = 'Admin') {
    const idx = this.products.findIndex((p) => p.id === productId);
    if (idx !== -1) {
      this.products[idx] = { ...this.products[idx], ...updates };
      this.save('cake_db_products', this.products);
      cacheEngine.invalidateByTag('products');
      this.logAudit(actor, 'Updated Product', 'product', `Updated product: ${this.products[idx].name}`);
      this.notify();
    }
  }

  // --- FLAVORS & ADDONS ---
  getFlavors(): Flavor[] {
    return this.flavors;
  }

  getAddons(): ProductAddon[] {
    return this.addons;
  }

  getBanners(): Banner[] {
    return this.banners;
  }

  getDeliveryZones(): DeliveryZone[] {
    return this.deliveryZones;
  }

  getDeliverySlots(): DeliverySlot[] {
    return this.deliverySlots;
  }

  getCoupons(): Coupon[] {
    return this.coupons;
  }

  getReviews(): Review[] {
    return this.reviews;
  }

  getAuditLogs(): AuditLog[] {
    return this.auditLogs;
  }

  getCustomCakes(): CustomCakeRequest[] {
    return this.customCakes;
  }

  addCustomCakeRequest(req: Omit<CustomCakeRequest, 'id' | 'status' | 'created_at'>) {
    const newReq: CustomCakeRequest = {
      id: `cc-${Date.now()}`,
      ...req,
      status: 'pending',
      created_at: new Date().toISOString(),
    };
    this.customCakes.unshift(newReq);
    this.save('cake_db_custom_cakes', this.customCakes);
    this.logAudit('Customer', 'Requested Custom Cake', 'custom_cake', `Submitted quote for ${req.cake_type}`);
    this.notify();
    return newReq;
  }

  updateCustomCakeStatus(id: string, status: CustomCakeRequest['status'], estimated_price?: number, actor = 'Admin') {
    const req = this.customCakes.find((c) => c.id === id);
    if (req) {
      req.status = status;
      if (estimated_price !== undefined) req.estimated_price = estimated_price;
      this.save('cake_db_custom_cakes', this.customCakes);
      this.logAudit(actor, 'Updated Custom Cake Status', 'custom_cake', `Quote ${id} status set to ${status}`);
      this.notify();
    }
  }

  addReview(review: Omit<Review, 'id' | 'status' | 'created_at'>) {
    const newRev: Review = {
      id: `rev-${Date.now()}`,
      ...review,
      status: 'approved', // Auto approved for demo
      created_at: new Date().toISOString().split('T')[0],
    };
    this.reviews.unshift(newRev);
    this.save('cake_db_reviews', this.reviews);
    this.notify();
  }

  // --- ORDERS & SECURE TRANSACTION RPC ---
  getOrders(): Order[] {
    return this.orders;
  }

  /**
   * Secure Order Creation simulating PostgreSQL RPC create_secure_order:
   * Recalculates authoritatively from catalog database variants & addons.
   * Client-sent prices are strictly discarded.
   */
  async createSecureOrder(payload: {
    customer_name: string;
    customer_phone: string;
    delivery_address: string;
    delivery_zone_id: string;
    delivery_slot: string;
    delivery_date: string;
    cart_items: CartItem[];
    coupon_code?: string;
    order_note?: string;
    payment_method: Order['payment_method'];
  }): Promise<{ success: boolean; order: Order; error?: string }> {
    const {
      customer_name,
      customer_phone,
      delivery_address,
      delivery_zone_id,
      delivery_slot,
      delivery_date,
      cart_items,
      coupon_code,
      order_note,
      payment_method,
    } = payload;

    if (!cart_items || cart_items.length === 0) {
      return { success: false, order: {} as Order, error: 'Cart is empty' };
    }

    const zone = this.deliveryZones.find((z) => z.id === delivery_zone_id) || this.deliveryZones[0];
    const delivery_fee = zone.delivery_fee;

    // Server-side authoritative price recalculation
    let computedSubtotal = 0;
    const processedItems: Order['items'] = [];

    for (const cartItem of cart_items) {
      const dbProduct = this.products.find((p) => p.id === cartItem.product.id);
      if (!dbProduct || !dbProduct.is_active) {
        throw new Error(`Product ${cartItem.product.name} is no longer available.`);
      }

      const dbVariant = dbProduct.variants.find((v) => v.id === cartItem.selected_variant.id);
      if (!dbVariant || !dbVariant.is_active) {
        throw new Error(`Variant ${cartItem.selected_variant.name} is inactive.`);
      }

      const variantPrice = dbVariant.sale_price ?? dbVariant.price;
      let itemTotal = variantPrice * cartItem.quantity;

      // Addons
      const itemAddons: Order['items'][0]['addons'] = [];
      for (const addonReq of cartItem.selected_addons) {
        const dbAddon = this.addons.find((a) => a.id === addonReq.id && a.is_active);
        if (dbAddon) {
          itemTotal += dbAddon.price;
          itemAddons.push({
            addon_id: dbAddon.id,
            addon_name: dbAddon.name,
            unit_price: dbAddon.price,
            quantity: 1,
            subtotal: dbAddon.price,
          });
        }
      }

      computedSubtotal += itemTotal;

      processedItems.push({
        id: `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        order_id: '',
        product_id: dbProduct.id,
        product_name: dbProduct.name,
        variant_name: dbVariant.name,
        flavor_name: cartItem.selected_flavor?.name,
        writing_message: cartItem.writing_message,
        unit_price: variantPrice,
        quantity: cartItem.quantity,
        subtotal: itemTotal,
        addons: itemAddons,
      });
    }

    // Coupon calculation
    let discount = 0;
    if (coupon_code) {
      const matchCoupon = this.coupons.find(
        (c) => c.code.toUpperCase() === coupon_code.toUpperCase() && c.is_active
      );
      if (matchCoupon && computedSubtotal >= matchCoupon.min_order_amount) {
        if (matchCoupon.discount_type === 'percentage') {
          discount = Math.round((computedSubtotal * matchCoupon.discount_value) / 100);
          if (matchCoupon.max_discount_amount && discount > matchCoupon.max_discount_amount) {
            discount = matchCoupon.max_discount_amount;
          }
        } else {
          discount = matchCoupon.discount_value;
        }
        matchCoupon.usage_count++;
        this.save('cake_db_coupons', this.coupons);
      }
    }

    const finalTotal = Math.max(0, computedSubtotal - discount + delivery_fee);

    // Generate random 4-digit verification OTP
    const delivery_otp = String(Math.floor(1000 + Math.random() * 9000));
    const order_number = `CAKE-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(10000 + Math.random() * 90000)}`;

    const newOrder: Order = {
      id: `ord-${Date.now()}`,
      order_number,
      customer_name,
      customer_phone,
      delivery_address,
      delivery_zone: zone,
      delivery_slot,
      delivery_date: delivery_date || new Date().toISOString().split('T')[0],
      status: 'pending',
      subtotal: computedSubtotal,
      delivery_fee,
      discount_amount: discount,
      total_amount: finalTotal,
      coupon_code,
      order_note,
      payment_method,
      payment_status: payment_method === 'cod' ? 'pending' : 'paid',
      delivery_otp,
      cod_amount: payment_method === 'cod' ? finalTotal : 0,
      cod_collected: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items: processedItems,
      history: [
        {
          id: `h-${Date.now()}`,
          status: 'pending',
          notes: 'Order securely placed via Customer Web storefront',
          created_at: new Date().toISOString(),
        },
      ],
    };

    // Link item order_id
    newOrder.items.forEach((item) => {
      item.order_id = newOrder.id;
    });

    this.orders.unshift(newOrder);
    this.save('cake_db_orders', this.orders);
    this.logAudit(customer_name, 'Placed Order', 'order', `Order #${order_number} created with total ${this.settings.currency}${finalTotal}`);
    this.notify();

    return { success: true, order: newOrder };
  }

  // --- ORDER LIFECYCLE ACTIONS ---
  updateOrderStatus(orderId: string, newStatus: OrderStatus, notes?: string, actor = 'Staff') {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) return;

    order.status = newStatus;
    order.updated_at = new Date().toISOString();
    order.history.push({
      id: `h-${Date.now()}`,
      status: newStatus,
      notes: notes || `Status changed to ${newStatus} by ${actor}`,
      created_at: new Date().toISOString(),
      actor_name: actor,
    });

    this.save('cake_db_orders', this.orders);
    this.logAudit(actor, 'Updated Order Status', 'order', `Order ${order.order_number} transitioned to ${newStatus}`);
    this.notify();
  }

  assignRider(orderId: string, riderName = 'Rahim Mia (Rider #1)', actor = 'Delivery Manager') {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) return;

    order.rider_id = 'rider-1';
    order.rider_name = riderName;
    order.status = 'assigned';
    order.updated_at = new Date().toISOString();
    order.history.push({
      id: `h-${Date.now()}`,
      status: 'assigned',
      notes: `Assigned to delivery rider: ${riderName}`,
      created_at: new Date().toISOString(),
      actor_name: actor,
    });

    this.save('cake_db_orders', this.orders);
    this.logAudit(actor, 'Assigned Rider', 'delivery', `Assigned ${riderName} to order ${order.order_number}`);
    this.notify();
  }

  verifyDeliveryOTP(orderId: string, enteredOtp: string, actor = 'Delivery Rider'): { success: boolean; message: string } {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) return { success: false, message: 'Order not found' };

    if (order.delivery_otp !== enteredOtp.trim()) {
      return { success: false, message: 'Invalid 4-digit OTP. Please ask the customer for the correct code.' };
    }

    order.status = 'delivered';
    order.cod_collected = true;
    order.payment_status = 'paid';
    order.updated_at = new Date().toISOString();
    order.history.push({
      id: `h-${Date.now()}`,
      status: 'delivered',
      notes: `Successfully delivered by ${actor}. Customer OTP verified. COD Cash Collected: ${order.cod_amount > 0 ? 'Yes' : 'N/A'}.`,
      created_at: new Date().toISOString(),
      actor_name: actor,
    });

    this.save('cake_db_orders', this.orders);
    this.logAudit(actor, 'Verified Delivery with OTP', 'delivery', `Order ${order.order_number} marked as Delivered`);
    this.notify();

    return { success: true, message: 'OTP verified! Order successfully marked as Delivered.' };
  }
}

export const mockDb = new MockDatabase();
