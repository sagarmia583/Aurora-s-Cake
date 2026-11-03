import {nextOrderNumber} from '../utils/orderUtils';
import type { PublicSiteData } from '../types/siteContent';
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
  RiderDeposit,
  StaffRole,
  StaffPermissionCode,
  StaffMember,
} from '../types';
import { DEFAULT_ROLE_PERMISSIONS } from './staffPermissions';
import { cacheEngine } from './cacheEngine';

// Initial dynamic shop settings (100% database driven - zero hardcoded text)
const INITIAL_SHOP_SETTINGS: ShopSettings = {
  id: 'setting-1',
  shop_name: "Aurora's Cake",
  logo_url: '/images/aurora-logo.png',
  profile_image_url: '/images/aurora-logo.png',
  phone: '01711-234567',
  whatsapp: '01711-234567',
  email: 'info@aurorascake.com',
  bkash_merchant_number: '01711-234567',
  nagad_merchant_number: '01711-234567',
  address: 'Tangail, Bangladesh',
  opening_time: '09:00 AM',
  closing_time: '10:00 PM',
  currency: '৳',
  accepting_orders: true,
  delivery_enabled: true,
  website_title: "Aurora's Cake — A Little Slice of Happiness",
  website_description: "Discover celebration cakes, thoughtful details, and a little everyday happiness at Aurora's Cake.",
  // Dynamic Web Texts
  top_announcement_text: 'Made for moments worth celebrating',
  hero_tagline: "Tangail's Bespoke Luxury Patisserie",
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
  footer_about_text: 'Tangail\'s premier boutique for fresh birthday cakes, wedding tiers, cheesecakes, and custom pastries. Baked fresh with love and 100% natural ingredients.',
  facebook_url: 'https://www.facebook.com/aurorascake26',
  instagram_url: '',
  complimentary_kit_title: 'প্রতিটি কেকের সাথে পাচ্ছেন:',
  complimentary_kit_items: [
    'ফ্রি কেক কাটার ছুরি (Cake Knife)',
    'ফ্রি মোমবাতি (Birthday Candles)',
    'প্রিমিয়াম বক্স ও রিবন (Box & Ribbon)'
  ],
};

const INITIAL_CATEGORIES: Category[] = [
  {
    id: 'cat-1',
    name: 'Birthday Specials',
    slug: 'birthday-cakes',
    description: 'Festive handcrafted celebration cakes made with rich Bavarian cream',
    image_url: '/images/floral-signature.webp',
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
    image_url: '/images/floral-signature.webp',
    sort_order: 3,
    is_active: true,
  },
  {
    id: 'cat-4',
    name: 'Cheesecakes & Berries',
    slug: 'cheesecakes',
    description: 'Slow-baked New York style and fresh strawberry mousse cheesecakes',
    image_url: '/images/cheesecake.webp',
    sort_order: 4,
    is_active: true,
  },
  {
    id: 'cat-5',
    name: 'Cupcakes & Pastries',
    slug: 'cupcakes-pastries',
    description: 'Bite-sized happiness boxes perfect for gifts and tea parties',
    image_url: '/images/cupcakes.webp',
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
    image_url: '/images/chocolate-fudge.webp',
    gallery_images: [
      '/images/chocolate-fudge.webp',
      '/images/black-forest.webp',
    ],
    is_featured: true,
    is_active: true,
    created_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    rating: 0,
    review_count: 0,
    sold_count: 0,
    variants: [
      { id: 'var-1-1', product_id: 'prod-1', name: '500g (Serves 4)', weight_grams: 500, price: 680, is_active: true },
      { id: 'var-1-2', product_id: 'prod-1', name: '1kg (Serves 8-10)', weight_grams: 1000, price: 1250, sale_price: 1150, is_active: true },
      { id: 'var-1-3', product_id: 'prod-1', name: '1.5kg (Serves 12-14)', weight_grams: 1500, price: 1750, is_active: true },
      { id: 'var-1-4', product_id: 'prod-1', name: '2kg (Serves 18-20)', weight_grams: 2000, price: 2300, is_active: true },
    ],
    allowed_flavor_ids: ['flav-1', 'flav-5', 'flav-6'],
    allowed_addon_ids: ['addon-1', 'addon-2', 'addon-3', 'addon-4', 'addon-5'],
    dietary_tags: ['halal', 'eggless'],
    is_eggless: true,
  },
  {
    id: 'prod-2',
    category_id: 'cat-1',
    category_name: 'Birthday Specials',
    name: 'Royale Red Velvet Cream Cheese',
    slug: 'royale-red-velvet-cream-cheese',
    description: 'Classic crimson cocoa crumb layered with authentic Philadelphia cream cheese frosting and white chocolate curls.',
    base_price: 1350,
    image_url: '/images/red-velvet.webp',
    gallery_images: [
      '/images/red-velvet.webp',
    ],
    is_featured: true,
    is_active: true,
    created_at: new Date(Date.now() - 45 * 86400000).toISOString(),
    rating: 0,
    review_count: 0,
    sold_count: 0,
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
    image_url: '/images/black-forest.webp',
    gallery_images: [
      '/images/black-forest.webp',
    ],
    is_featured: false,
    is_active: true,
    created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
    rating: 0,
    review_count: 0,
    sold_count: 0,
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
    image_url: '/images/cheesecake.webp',
    gallery_images: [
      '/images/cheesecake.webp',
    ],
    is_featured: true,
    is_active: true,
    created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    rating: 0,
    review_count: 0,
    sold_count: 0,
    variants: [
      { id: 'var-4-1', product_id: 'prod-4', name: '500g (Serves 4)', weight_grams: 500, price: 780, is_active: true },
      { id: 'var-4-2', product_id: 'prod-4', name: '1kg (Serves 8-10)', weight_grams: 1000, price: 1450, sale_price: 1350, is_active: true },
      { id: 'var-4-3', product_id: 'prod-4', name: '2kg (Serves 18-20)', weight_grams: 2000, price: 2700, is_active: true },
    ],
    allowed_flavor_ids: ['flav-5', 'flav-6'],
    allowed_addon_ids: ['addon-1', 'addon-2', 'addon-3', 'addon-5'],
    dietary_tags: ['halal', 'nut_free'],
  },
  {
    id: 'prod-5',
    category_id: 'cat-3',
    category_name: 'Wedding & Anniversary',
    name: 'Elysian Floral Pastels Anniversary Cake',
    slug: 'elysian-floral-pastels',
    description: 'Two-tier ivory butter sponge with natural raspberry compote, handcrafted edible wafer florals, and 24K edible gold leaves.',
    base_price: 2600,
    image_url: '/images/floral-signature.webp',
    gallery_images: [
      '/images/floral-signature.webp',
    ],
    is_featured: true,
    is_active: true,
    created_at: new Date(Date.now() - 90 * 86400000).toISOString(),
    rating: 0,
    review_count: 0,
    sold_count: 0,
    variants: [
      { id: 'var-5-1', product_id: 'prod-5', name: '1.5kg Two-Tier (Serves 14)', weight_grams: 1500, price: 2600, is_active: true },
      { id: 'var-5-2', product_id: 'prod-5', name: '2.5kg Two-Tier (Serves 25)', weight_grams: 2500, price: 3950, is_active: true },
    ],
    allowed_flavor_ids: ['flav-2', 'flav-3'],
    allowed_addon_ids: ['addon-1', 'addon-2', 'addon-3', 'addon-4'],
    dietary_tags: ['halal', 'sugar_free'],
    is_sugar_free: true,
  },
  {
    id: 'prod-6',
    category_id: 'cat-5',
    category_name: 'Cupcakes & Pastries',
    name: 'Artisan Assorted Cupcake Box (6 Pcs)',
    slug: 'artisan-cupcake-box-6pcs',
    description: 'Six signature swirls: Red Velvet, Dark Cocoa, Pistachio Rose, Salted Caramel, Blueberry Cream, and Vanilla Gold.',
    base_price: 650,
    image_url: '/images/cupcakes.webp',
    gallery_images: [
      '/images/cupcakes.webp',
    ],
    is_featured: false,
    is_active: true,
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    rating: 0,
    review_count: 0,
    sold_count: 0,
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
    title: "Celebrate Joy with Tangail's Finest Artisan Bakery",
    subtitle: 'Order fresh 100% halal celebratory cakes with guaranteed 3-hour temperature-safe delivery.',
    image_url: '/images/chocolate-fudge.webp',
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
  { id: 'slot-6', slot_label: '11:00 PM - 12:00 AM (মাঝরাত সারপ্রাইজ / Midnight Surprise 🎂)', is_active: true, is_midnight: true, surcharge: 150 },
];

const INITIAL_COUPONS: Coupon[] = [
  {
    id: 'coup-1',
    code: 'WELCOME100',
    discount_type: 'fixed',
    discount_value: 100,
    min_order_amount: 800,
    is_active: true,
    usage_count: 14,
    usage_limit: 100,
    valid_from: '2026-01-01',
    valid_until: '2027-12-31',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'coup-2',
    code: 'BIRTHDAY10',
    discount_type: 'percentage',
    discount_value: 10,
    min_order_amount: 1000,
    max_discount_amount: 300,
    is_active: true,
    usage_count: 28,
    usage_limit: 150,
    valid_from: '2026-01-01',
    valid_until: '2027-12-31',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'coup-3',
    code: 'SWEETDELIGHT',
    discount_type: 'percentage',
    discount_value: 15,
    min_order_amount: 1500,
    max_discount_amount: 500,
    is_active: true,
    usage_count: 9,
    usage_limit: 50,
    valid_from: '2026-01-01',
    valid_until: '2027-12-31',
    created_at: '2026-01-01T00:00:00.000Z',
  },
];

const INITIAL_ORDERS: Order[] = [];

const INITIAL_REVIEWS: Review[] = [];

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
    reference_image_url: '/images/floral-signature.webp',
    instructions: 'Please use natural butter frosting instead of heavy fondant.',
    estimated_price: 3200,
    status: 'quoted',
    created_at: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
  },
];

const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'log-10',
    actor_name: 'Farhana Akter (Accounts)',
    action: 'Cash Reconciliation Verified',
    entity_type: 'finance',
    staff_role: 'accountant',
    details: 'Verified daily cash settlement and counter deposit ৳1,000 from rider Rahim Mia.',
    created_at: new Date(Date.now() - 15 * 60000).toISOString(),
  },
  {
    id: 'log-9',
    actor_name: 'Rahim Mia (Rider #1)',
    action: 'Rider Cash Deposit',
    entity_type: 'finance',
    staff_role: 'delivery_man',
    details: 'Rider Rahim Mia deposited ৳1,000 at bakery cash counter. Remaining in hand: ৳260.',
    created_at: new Date(Date.now() - 35 * 60000).toISOString(),
  },
  {
    id: 'log-8',
    actor_name: 'Rahim Mia (Rider #1)',
    action: 'Confirmed Delivery',
    entity_type: 'delivery',
    staff_role: 'delivery_man',
    details: 'Order #CAKE-2026-101 delivered safely to customer doorstep. Cash collected: ৳1,260.',
    created_at: new Date(Date.now() - 55 * 60000).toISOString(),
  },
  {
    id: 'log-7',
    actor_name: 'Rahim Mia (Rider #1)',
    action: 'Picked Up Order',
    entity_type: 'delivery',
    staff_role: 'delivery_man',
    details: 'Picked up Order #CAKE-2026-101 from bakery dispatch counter with thermal box sticker.',
    created_at: new Date(Date.now() - 90 * 60000).toISOString(),
  },
  {
    id: 'log-6',
    actor_name: 'Kabir Hossain (Dispatch Mgr)',
    action: 'Assigned Rider',
    entity_type: 'delivery',
    staff_role: 'delivery_manager',
    details: 'Assigned Order #CAKE-2026-101 to Express Rider Rahim Mia (Tangail Express #1).',
    created_at: new Date(Date.now() - 110 * 60000).toISOString(),
  },
  {
    id: 'log-5',
    actor_name: 'Chef Karim (Master Baker)',
    action: 'Marked Cake Ready',
    entity_type: 'kitchen',
    staff_role: 'kitchen_manager',
    details: 'Order #CAKE-2026-101: 1kg Chocolate Truffle cake baked, decorated and boxed in dispatch fridge.',
    created_at: new Date(Date.now() - 130 * 60000).toISOString(),
  },
  {
    id: 'log-4',
    actor_name: 'Chef Karim (Master Baker)',
    action: 'Started Baking Cake',
    entity_type: 'kitchen',
    staff_role: 'kitchen_manager',
    details: 'Kitchen started baking sponge and preparing Belgian dark truffle frosting for Order #CAKE-2026-101.',
    created_at: new Date(Date.now() - 180 * 60000).toISOString(),
  },
  {
    id: 'log-3',
    actor_name: 'Sumon Ahmed (Order Mgr)',
    action: 'Confirmed Order',
    entity_type: 'order',
    staff_role: 'order_manager',
    details: 'Validated delivery slot and phone number for Order #CAKE-2026-101. Sent to kitchen queue.',
    created_at: new Date(Date.now() - 210 * 60000).toISOString(),
  },
  {
    id: 'log-2',
    actor_name: 'Sadia Rahman (Owner)',
    action: 'Created Coupon',
    entity_type: 'coupon',
    staff_role: 'super_admin',
    details: 'Added coupon code WELCOME100 with ৳100 flat discount and 100 usage limit.',
    created_at: new Date(Date.now() - 360 * 60000).toISOString(),
  },
  {
    id: 'log-1',
    actor_name: 'Sadia Rahman (Owner)',
    action: 'Created Staff Accounts',
    entity_type: 'staff',
    staff_role: 'super_admin',
    details: 'Created operational accounts for kitchen, order management, rider team and accounts.',
    created_at: new Date(Date.now() - 720 * 60000).toISOString(),
  },
];

const INITIAL_STAFF_MEMBERS: StaffMember[] = [
  {
    id: 'staff-1',
    name: 'Sadia Rahman (Owner)',
    username: 'sadia_owner',
    password: '1234',
    role: 'super_admin',
    email: 'owner@auroracake.com',
    phone: '01711-000001',
    permissions: [...DEFAULT_ROLE_PERMISSIONS.super_admin],
    is_active: true,
    created_at: '2026-10-01T00:00:00.000Z',
    last_login: new Date().toISOString(),
  },
  {
    id: 'staff-2',
    name: 'Tanvir Hasan',
    username: 'tanvir_admin',
    password: '1234',
    role: 'admin',
    email: 'tanvir@auroracake.com',
    phone: '01711-000002',
    permissions: [...DEFAULT_ROLE_PERMISSIONS.admin],
    is_active: true,
    created_at: '2026-10-05T00:00:00.000Z',
    last_login: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'staff-3',
    name: 'Fatima Begum',
    username: 'fatima_orders',
    password: '1234',
    role: 'order_manager',
    email: 'fatima@auroracake.com',
    phone: '01711-000003',
    permissions: [...DEFAULT_ROLE_PERMISSIONS.order_manager],
    is_active: true,
    created_at: '2026-10-10T00:00:00.000Z',
    last_login: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: 'staff-4',
    name: 'Chef Jahangir Alam',
    username: 'chef_jahangir',
    password: '1234',
    role: 'kitchen_manager',
    email: 'chef@auroracake.com',
    phone: '01711-000004',
    permissions: [...DEFAULT_ROLE_PERMISSIONS.kitchen_manager],
    is_active: true,
    created_at: '2026-10-10T00:00:00.000Z',
    last_login: new Date(Date.now() - 1800000).toISOString(),
  },
  {
    id: 'staff-5',
    name: 'Kamrul Islam',
    username: 'kamrul_dispatch',
    password: '1234',
    role: 'delivery_manager',
    email: 'kamrul@auroracake.com',
    phone: '01711-000005',
    permissions: [...DEFAULT_ROLE_PERMISSIONS.delivery_manager],
    is_active: true,
    created_at: '2026-10-12T00:00:00.000Z',
    last_login: new Date(Date.now() - 5400000).toISOString(),
  },
  {
    id: 'staff-6',
    name: 'Sohail Mahmud',
    username: 'sohail_accounts',
    password: '1234',
    role: 'accountant',
    email: 'accounts@auroracake.com',
    phone: '01711-000006',
    permissions: [...DEFAULT_ROLE_PERMISSIONS.accountant],
    is_active: true,
    created_at: '2026-10-15T00:00:00.000Z',
    last_login: new Date(Date.now() - 10800000).toISOString(),
  },
  {
    id: 'staff-7',
    name: 'Rakib Hossain (Rider)',
    username: 'rider_rakib',
    password: '1234',
    role: 'delivery_man',
    email: 'rakib@auroracake.com',
    phone: '01812-345678',
    permissions: [...DEFAULT_ROLE_PERMISSIONS.delivery_man],
    is_active: true,
    created_at: '2026-10-18T00:00:00.000Z',
    last_login: new Date(Date.now() - 900000).toISOString(),
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
  private deposits: RiderDeposit[];
  private staffMembers: StaffMember[];
  private rolePermissions: Record<StaffRole, StaffPermissionCode[]>;
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.settings = this.load('cake_db_settings', INITIAL_SHOP_SETTINGS);
    if (!this.settings.logo_url || this.settings.logo_url === '/images/chocolate-fudge.webp') {
      this.settings.logo_url = '/images/aurora-logo.png';
      this.save('cake_db_settings', this.settings);
    }
    if (!this.settings.profile_image_url) {
      this.settings.profile_image_url = this.settings.logo_url || '/images/aurora-logo.png';
      this.save('cake_db_settings', this.settings);
    }
    this.categories = this.load('cake_db_categories', INITIAL_CATEGORIES);

    // Purge any outdated fake stats / cached fake reviews from previous sessions
    const statsVersion = this.load('cake_db_real_stats_version', 0);
    if (statsVersion < 2) {
      this.products = INITIAL_PRODUCTS.map((p) => ({
        ...p,
        rating: 0,
        review_count: 0,
        sold_count: 0,
      }));
      this.save('cake_db_products', this.products);
      this.reviews = [];
      this.save('cake_db_reviews', this.reviews);
      this.save('cake_db_real_stats_version', 2);
    } else {
      this.products = this.load('cake_db_products', INITIAL_PRODUCTS).map((p, idx) => ({
        ...p,
        created_at: p.created_at || INITIAL_PRODUCTS[idx]?.created_at || new Date().toISOString(),
      }));
      this.reviews = this.load('cake_db_reviews', INITIAL_REVIEWS);
    }

    this.flavors = this.load('cake_db_flavors', INITIAL_FLAVORS);
    this.addons = this.load('cake_db_addons', INITIAL_ADDONS);
    this.banners = this.load('cake_db_banners', INITIAL_BANNERS);
    this.deliveryZones = this.load('cake_db_zones', INITIAL_DELIVERY_ZONES);
    this.deliverySlots = this.load('cake_db_slots', INITIAL_DELIVERY_SLOTS);
    this.orders = this.load('cake_db_orders', INITIAL_ORDERS);
    this.coupons = this.load('cake_db_coupons', INITIAL_COUPONS).map((c, idx) => ({
      ...c,
      usage_limit: c.usage_limit ?? INITIAL_COUPONS[idx]?.usage_limit ?? 100,
      valid_from: c.valid_from ?? INITIAL_COUPONS[idx]?.valid_from ?? '2026-01-01',
      valid_until: c.valid_until ?? INITIAL_COUPONS[idx]?.valid_until ?? '2027-12-31',
    }));
    this.customCakes = this.load('cake_db_custom_cakes', [] as CustomCakeRequest[]);
    const loadedAuditLogs = this.load('cake_db_audit_logs', INITIAL_AUDIT_LOGS);
    this.auditLogs = loadedAuditLogs && loadedAuditLogs.length > 0 ? loadedAuditLogs : INITIAL_AUDIT_LOGS;
    this.deposits = this.load('cake_db_deposits', [] as RiderDeposit[]);
    this.staffMembers = this.load('cake_db_staff_members', INITIAL_STAFF_MEMBERS);
    this.rolePermissions = this.load('cake_db_role_permissions', DEFAULT_ROLE_PERMISSIONS);

    this.recalculateAllStats(false);
  }

  /**
   * Recalculates sold_count strictly from non-cancelled orders,
   * and rating & review_count strictly from approved reviews.
   */
  public recalculateAllStats(shouldNotify = true) {
    const salesMap: Record<string, number> = {};
    for (const order of this.orders) {
      if (order.status !== 'cancelled' && Array.isArray(order.items)) {
        for (const item of order.items) {
          if (item.product_id) {
            salesMap[item.product_id] = (salesMap[item.product_id] || 0) + (item.quantity || 1);
          }
        }
      }
    }

    const reviewsMap: Record<string, { count: number; sum: number }> = {};
    for (const rev of this.reviews) {
      if (rev.status === 'approved' && rev.product_id) {
        if (!reviewsMap[rev.product_id]) {
          reviewsMap[rev.product_id] = { count: 0, sum: 0 };
        }
        reviewsMap[rev.product_id].count += 1;
        reviewsMap[rev.product_id].sum += Number(rev.rating) || 5;
      }
    }

    for (const prod of this.products) {
      prod.sold_count = salesMap[prod.id] || 0;
      const revInfo = reviewsMap[prod.id];
      if (revInfo && revInfo.count > 0) {
        prod.review_count = revInfo.count;
        prod.rating = Number((revInfo.sum / revInfo.count).toFixed(1));
      } else {
        prod.review_count = 0;
        prod.rating = 0;
      }
    }
    this.save('cake_db_products', this.products);
    cacheEngine.invalidateByTag('products');
    if (shouldNotify) {
      this.notify();
    }
  }

  /** Apply only validated public catalogue/content data. Private local records are preserved. */
  public applyPublicSnapshot(snapshot: PublicSiteData, options: { authoritative?: boolean } = {}) {
    const data = JSON.parse(JSON.stringify(snapshot)) as PublicSiteData;

    if (options.authoritative) {
      this.settings = data.settings;
      this.categories = data.categories;
      this.products = data.products;
      this.flavors = data.flavors;
      this.addons = data.addons;
      this.coupons = data.coupons;
      this.deliveryZones = data.zones;
      this.deliverySlots = data.slots;
      this.banners = data.banners;
      this.reviews = data.reviews;
      for (const [key, value] of Object.entries({settings:this.settings,categories:this.categories,
        products:this.products,flavors:this.flavors,addons:this.addons,coupons:this.coupons,
        zones:this.deliveryZones,slots:this.deliverySlots,banners:this.banners,reviews:this.reviews})) {
        this.save('cake_db_' + key, value);
      }
      cacheEngine.invalidateByTag('products');
      this.notify();
      return;
    }

    // 1. Settings: preserve local modifications
    if (this.settings && (this.settings as any).is_locally_modified) {
      this.settings = {
        ...data.settings,
        ...this.settings,
        is_locally_modified: true,
      };
    } else {
      this.settings = data.settings;
    }
    this.save('cake_db_settings', this.settings);

    // 2. Categories: preserve local modifications and locally-added categories
    const sheetCategoryIds = new Set(data.categories.map((c) => c.id));
    const localOnlyCategories = this.categories.filter((c) => !sheetCategoryIds.has(c.id));
    this.categories = [
      ...data.categories.map((c) => {
        const existing = this.categories.find((ec) => ec.id === c.id);
        if (existing && (existing as any).is_locally_modified) {
          return existing;
        }
        return c;
      }),
      ...localOnlyCategories,
    ];
    this.save('cake_db_categories', this.categories);

    // 3. Products: merge while preserving local modifications and locally-added products
    const sheetProductIds = new Set(data.products.map((p) => p.id));
    const localOnlyProducts = this.products.filter((p) => !sheetProductIds.has(p.id));
    this.products = [
      ...data.products.map((p) => {
        const existing = this.products.find((ep) => ep.id === p.id);
        if (existing && (existing as any).is_locally_modified) {
          return {
            ...existing,
            is_active: p.is_active,
            rating: existing.rating ?? 0,
            review_count: existing.review_count ?? 0,
            sold_count: existing.sold_count ?? 0,
          };
        }
        return {
          ...p,
          rating: existing?.rating ?? 0,
          review_count: existing?.review_count ?? 0,
          sold_count: existing?.sold_count ?? 0,
        };
      }),
      ...localOnlyProducts,
    ];
    this.save('cake_db_products', this.products);

    // 4. Flavors: preserve local modifications and locally-added flavors
    const sheetFlavorIds = new Set(data.flavors.map((f) => f.id));
    const localOnlyFlavors = this.flavors.filter((f) => !sheetFlavorIds.has(f.id));
    this.flavors = [
      ...data.flavors.map((f) => {
        const existing = this.flavors.find((ef) => ef.id === f.id);
        if (existing && (existing as any).is_locally_modified) {
          return existing;
        }
        return f;
      }),
      ...localOnlyFlavors,
    ];
    this.save('cake_db_flavors', this.flavors);

    // 5. Addons: merge while preserving local modifications and locally-added addons
    const sheetAddonIds = new Set(data.addons.map((a) => a.id));
    const localOnlyAddons = this.addons.filter((a) => !sheetAddonIds.has(a.id));
    this.addons = [
      ...data.addons.map((a) => {
        const existing = this.addons.find((ea) => ea.id === a.id);
        if (existing && (existing as any).is_locally_modified) {
          return existing;
        }
        return a;
      }),
      ...localOnlyAddons,
    ];
    this.save('cake_db_addons', this.addons);

    // 6. Coupons: preserve local modifications and locally-added coupons
    const sheetCouponIds = new Set(data.coupons.map((cp) => cp.id));
    const localOnlyCoupons = this.coupons.filter((cp) => !sheetCouponIds.has(cp.id));
    this.coupons = [
      ...data.coupons.map((cp) => {
        const existing = this.coupons.find((ecp) => ecp.id === cp.id);
        if (existing && (existing as any).is_locally_modified) {
          return existing;
        }
        return cp;
      }),
      ...localOnlyCoupons,
    ];
    this.save('cake_db_coupons', this.coupons);

    // 7. Zones: preserve local modifications and locally-added delivery zones
    const sheetZoneIds = new Set(data.zones.map((z) => z.id));
    const localOnlyZones = this.deliveryZones.filter((z) => !sheetZoneIds.has(z.id));
    this.deliveryZones = [
      ...data.zones.map((z) => {
        const existing = this.deliveryZones.find((ez) => ez.id === z.id);
        if (existing && (existing as any).is_locally_modified) {
          return existing;
        }
        return z;
      }),
      ...localOnlyZones,
    ];
    this.save('cake_db_zones', this.deliveryZones);

    // 8. Slots: preserve local modifications and locally-added delivery slots
    const sheetSlotIds = new Set(data.slots.map((s) => s.id));
    const localOnlySlots = this.deliverySlots.filter((s) => !sheetSlotIds.has(s.id));
    this.deliverySlots = [
      ...data.slots.map((s) => {
        const existing = this.deliverySlots.find((es) => es.id === s.id);
        if (existing && (existing as any).is_locally_modified) {
          return existing;
        }
        return s;
      }),
      ...localOnlySlots,
    ];
    this.save('cake_db_slots', this.deliverySlots);

    // 9. Banners: preserve local modifications and locally-added banners
    const sheetBannerIds = new Set(data.banners.map((b) => b.id));
    const localOnlyBanners = this.banners.filter((b) => !sheetBannerIds.has(b.id));
    this.banners = [
      ...data.banners.map((b) => {
        const existing = this.banners.find((eb) => eb.id === b.id);
        if (existing && (existing as any).is_locally_modified) {
          return existing;
        }
        return b;
      }),
      ...localOnlyBanners,
    ];
    this.save('cake_db_banners', this.banners);

    if (Array.isArray(data.reviews) && data.reviews.length > 0) {
      this.reviews = data.reviews;
    }
    this.recalculateAllStats(false);
    cacheEngine.clearAll();
    this.notify();
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

  public logAudit(actor_name: string, action: string, entity_type: string, details: string, entity_id?: string, staff_role?: string) {
    let inferredRole = staff_role;
    if (!inferredRole) {
      const actorLower = (actor_name || '').toLowerCase();
      const match = this.staffMembers.find(s => 
        s.name.toLowerCase() === actorLower || 
        `@${s.username.toLowerCase()}` === actorLower ||
        actorLower.includes(s.name.toLowerCase())
      );
      if (match) {
        inferredRole = match.role;
      } else if (actorLower.includes('super admin') || actorLower.includes('owner') || actorLower.includes('sadia')) {
        inferredRole = 'super_admin';
      } else if (actorLower.includes('rider') || actorLower.includes('rahim') || actorLower.includes('delivery man')) {
        inferredRole = 'delivery_man';
      } else if (actorLower.includes('chef') || actorLower.includes('karim') || actorLower.includes('kitchen') || actorLower.includes('baker')) {
        inferredRole = 'kitchen_manager';
      } else if (actorLower.includes('order') || actorLower.includes('sumon')) {
        inferredRole = 'order_manager';
      } else if (actorLower.includes('dispatch') || actorLower.includes('kabir')) {
        inferredRole = 'delivery_manager';
      } else if (actorLower.includes('accounts') || actorLower.includes('farhana') || actorLower.includes('accountant')) {
        inferredRole = 'accountant';
      } else if (actorLower.includes('admin') || actorLower.includes('tanvir')) {
        inferredRole = 'admin';
      }
    }

    const log: AuditLog = {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      actor_name,
      action,
      entity_type,
      entity_id,
      staff_role: inferredRole,
      details,
      created_at: new Date().toISOString(),
    };
    this.auditLogs.unshift(log);
    this.save('cake_db_audit_logs', this.auditLogs);
    this.notify();
  }

  getStaffAuditLogs(staffNameOrUsername?: string): AuditLog[] {
    if (!staffNameOrUsername) return [...this.auditLogs];
    const q = staffNameOrUsername.toLowerCase().trim();
    const matchedStaff = this.staffMembers.find(
      s => s.id.toLowerCase() === q || s.username.toLowerCase() === q || s.name.toLowerCase() === q
    );
    return this.auditLogs.filter(log => {
      const actor = log.actor_name.toLowerCase();
      if (actor.includes(q)) return true;
      if (log.staff_role && log.staff_role.toLowerCase() === q) return true;
      if (matchedStaff) {
        if (actor.includes(matchedStaff.name.toLowerCase())) return true;
        if (actor.includes(matchedStaff.username.toLowerCase())) return true;
      }
      return false;
    });
  }

  // --- SHOP SETTINGS ---
  getShopSettingsSync(): ShopSettings {
    return { ...this.settings };
  }

  async getShopSettings(): Promise<ShopSettings> {
    return cacheEngine.getOrFetch(
      'shop_settings',
      async () => ({ ...this.settings }),
      { ttlMs: 300_000, tags: ['shop_settings'] }
    );
  }

  updateShopSettings(newSettings: Partial<ShopSettings>, actor = 'Admin') {
    this.settings = { ...this.settings, ...newSettings, is_locally_modified: true } as any;
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

  getCategoriesSync(): Category[] {
    return [...this.categories];
  }

  addCategory(category: Omit<Category, 'id'>, actor = 'Admin') {
    const newCat: Category = {
      id: `cat-${Date.now()}`,
      ...category,
      is_active: category.is_active ?? true,
      ...( { is_locally_modified: true } as any ),
    };
    this.categories.push(newCat);
    this.save('cake_db_categories', this.categories);
    cacheEngine.invalidateByTag('categories');
    this.logAudit(actor, 'Created Category', 'category', `Added category: ${category.name}`);
    this.notify();
    return newCat;
  }

  updateCategory(categoryId: string, updates: Partial<Category>, actor = 'Admin') {
    const idx = this.categories.findIndex((c) => c.id === categoryId);
    if (idx !== -1) {
      this.categories[idx] = {
        ...this.categories[idx],
        ...updates,
        ...( { is_locally_modified: true } as any ),
      };
      this.save('cake_db_categories', this.categories);
      cacheEngine.invalidateByTag('categories');
      this.logAudit(actor, 'Updated Category', 'category', `Updated category: ${this.categories[idx].name}`);
      this.notify();
    }
  }

  deleteCategory(categoryId: string, actor = 'Admin') {
    const cat = this.categories.find((c) => c.id === categoryId);
    if (!cat) return;
    this.categories = this.categories.filter((c) => c.id !== categoryId);
    this.save('cake_db_categories', this.categories);
    cacheEngine.invalidateByTag('categories');
    this.logAudit(actor, 'Deleted Category', 'category', `Deleted category: ${cat.name}`);
    this.notify();
  }

  // --- PRODUCTS ---
  getProductsSync(): Product[] {
    return [...this.products];
  }

  async getProducts(): Promise<Product[]> {
    return cacheEngine.getOrFetch(
      'products_catalog',
      async () => [...this.products],
      { ttlMs: 120_000, tags: ['products'] }
    );
  }

  addProduct(product: Omit<Product, 'id'>, actor = 'Admin'): Product {
    const newProd: Product = {
      ...product,
      id: `prod-${Date.now()}`,
      created_at: product.created_at || new Date().toISOString(),
      rating: product.rating ?? 0,
      review_count: product.review_count ?? 0,
      sold_count: product.sold_count ?? 0,
      ...( { is_locally_modified: true } as any ),
    };
    this.products.unshift(newProd);
    this.save('cake_db_products', this.products);
    this.recalculateAllStats(false);
    cacheEngine.invalidateByTag('products');
    this.logAudit(actor, 'Created Product', 'product', `Added product: ${product.name}`);
    this.notify();
    return newProd;
  }

  updateProduct(productId: string, updates: Partial<Product>, actor = 'Admin') {
    const idx = this.products.findIndex((p) => p.id === productId);
    if (idx !== -1) {
      this.products[idx] = {
        ...this.products[idx],
        ...updates,
        ...( { is_locally_modified: true } as any ),
      };
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

  addFlavor(flavor: Omit<Flavor, 'id'>, actor = 'Admin'): Flavor {
    const newFlavor: Flavor = {
      ...flavor,
      id: `flv-${Date.now()}`,
      is_active: flavor.is_active !== undefined ? flavor.is_active : true,
      ...( { is_locally_modified: true } as any ),
    };
    this.flavors.push(newFlavor);
    this.save('cake_db_flavors', this.flavors);
    this.logAudit(actor, 'Added Flavor', 'product', `Added flavor: ${newFlavor.name}`);
    this.notify();
    return newFlavor;
  }

  updateFlavor(flavorId: string, updates: Partial<Flavor>, actor = 'Admin') {
    const idx = this.flavors.findIndex((f) => f.id === flavorId);
    if (idx !== -1) {
      this.flavors[idx] = {
        ...this.flavors[idx],
        ...updates,
        ...( { is_locally_modified: true } as any ),
      };
      this.save('cake_db_flavors', this.flavors);
      this.logAudit(actor, 'Updated Flavor', 'product', `Updated flavor: ${this.flavors[idx].name}`);
      this.notify();
    }
  }

  deleteFlavor(flavorId: string, actor = 'Admin') {
    const f = this.flavors.find((fl) => fl.id === flavorId);
    if (!f) return;
    this.flavors = this.flavors.filter((fl) => fl.id !== flavorId);
    this.save('cake_db_flavors', this.flavors);
    this.logAudit(actor, 'Deleted Flavor', 'product', `Deleted flavor: ${f.name}`);
    this.notify();
  }

  getAddons(): ProductAddon[] {
    return this.addons;
  }

  addAddon(addon: Omit<ProductAddon, 'id'>, actor = 'Super Admin'): ProductAddon {
    const newAddon: ProductAddon = {
      id: `addon-${Date.now()}`,
      ...addon,
      is_active: addon.is_active !== undefined ? addon.is_active : true,
      ...( { is_locally_modified: true } as any ),
    };
    this.addons.push(newAddon);
    this.save('cake_db_addons', this.addons);
    this.logAudit(actor, 'Added Product Addon', 'product', `Added addon: ${newAddon.name} (৳${newAddon.price})`);
    this.notify();
    return newAddon;
  }

  updateAddon(id: string, updates: Partial<ProductAddon>, actor = 'Super Admin') {
    const idx = this.addons.findIndex((a) => a.id === id);
    if (idx !== -1) {
      this.addons[idx] = {
        ...this.addons[idx],
        ...updates,
        ...( { is_locally_modified: true } as any ),
      };
      this.save('cake_db_addons', this.addons);
      this.logAudit(actor, 'Updated Product Addon', 'product', `Updated addon: ${this.addons[idx].name}`);
      this.notify();
    }
  }

  deleteAddon(id: string, actor = 'Super Admin') {
    const addon = this.addons.find((a) => a.id === id);
    if (addon) {
      this.addons = this.addons.filter((a) => a.id !== id);
      this.save('cake_db_addons', this.addons);
      this.logAudit(actor, 'Deleted Product Addon', 'product', `Deleted addon: ${addon.name}`);
      this.notify();
    }
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

  addDeliveryZone(zone: Omit<DeliveryZone, 'id'>, actor = 'Admin'): DeliveryZone {
    const newZone: DeliveryZone = {
      ...zone,
      id: `zone-${Date.now()}`,
    };
    (newZone as any).is_locally_modified = true;
    this.deliveryZones.push(newZone);
    this.save('cake_db_zones', this.deliveryZones);
    this.logAudit(actor, 'Added Delivery Zone', 'settings', `Added zone: ${newZone.name}`);
    this.notify();
    return newZone;
  }

  updateDeliveryZone(zoneId: string, updates: Partial<DeliveryZone>, actor = 'Admin') {
    const idx = this.deliveryZones.findIndex(z => z.id === zoneId);
    if (idx !== -1) {
      this.deliveryZones[idx] = {
        ...this.deliveryZones[idx],
        ...updates,
        is_locally_modified: true,
      } as any;
      this.save('cake_db_zones', this.deliveryZones);
      this.logAudit(actor, 'Updated Delivery Zone', 'settings', `Updated zone: ${this.deliveryZones[idx].name}`);
      this.notify();
      return true;
    }
    return false;
  }

  deleteDeliveryZone(zoneId: string, actor = 'Admin') {
    this.deliveryZones = this.deliveryZones.filter(z => z.id !== zoneId);
    this.save('cake_db_zones', this.deliveryZones);
    this.logAudit(actor, 'Deleted Delivery Zone', 'settings', `Deleted zone: ${zoneId}`);
    this.notify();
    return true;
  }

  addDeliverySlot(slot: Omit<DeliverySlot, 'id'>, actor = 'Admin'): DeliverySlot {
    const newSlot: DeliverySlot = {
      ...slot,
      id: `slot-${Date.now()}`,
    };
    (newSlot as any).is_locally_modified = true;
    this.deliverySlots.push(newSlot);
    this.save('cake_db_slots', this.deliverySlots);
    this.logAudit(actor, 'Added Delivery Slot', 'settings', `Added slot: ${newSlot.slot_label}`);
    this.notify();
    return newSlot;
  }

  updateDeliverySlot(slotId: string, updates: Partial<DeliverySlot>, actor = 'Admin') {
    const idx = this.deliverySlots.findIndex(s => s.id === slotId);
    if (idx !== -1) {
      this.deliverySlots[idx] = {
        ...this.deliverySlots[idx],
        ...updates,
        is_locally_modified: true,
      } as any;
      this.save('cake_db_slots', this.deliverySlots);
      this.logAudit(actor, 'Updated Delivery Slot', 'settings', `Updated slot: ${this.deliverySlots[idx].slot_label}`);
      this.notify();
      return true;
    }
    return false;
  }

  deleteDeliverySlot(slotId: string, actor = 'Admin') {
    this.deliverySlots = this.deliverySlots.filter(s => s.id !== slotId);
    this.save('cake_db_slots', this.deliverySlots);
    this.logAudit(actor, 'Deleted Delivery Slot', 'settings', `Deleted slot: ${slotId}`);
    this.notify();
    return true;
  }

  getCoupons(): Coupon[] {
    const valid = this.coupons.filter((c) => !c.usage_limit || (c.usage_count || 0) < c.usage_limit);
    if (valid.length !== this.coupons.length) {
      this.coupons = valid;
      this.save('cake_db_coupons', this.coupons);
    }
    return [...this.coupons];
  }

  consumeCoupon(couponCode: string): boolean {
    const coup = this.coupons.find(c => c.code.toUpperCase() === couponCode.toUpperCase().trim());
    if (!coup) return false;
    coup.usage_count = (coup.usage_count || 0) + 1;
    if (coup.usage_limit && coup.usage_limit > 0 && coup.usage_count >= coup.usage_limit) {
      this.coupons = this.coupons.filter(c => c.id !== coup.id);
      this.save('cake_db_coupons', this.coupons);
      this.logAudit('System', 'Deleted Coupon', 'coupon', `Coupon ${coup.code} automatically deleted after completing usage limit (${coup.usage_limit}/${coup.usage_limit}).`);
    } else {
      this.save('cake_db_coupons', this.coupons);
    }
    this.notify();
    return true;
  }

  addCoupon(coupon: Omit<Coupon, 'id'>, actor = 'Super Admin'): Coupon {
    const newCoupon: Coupon = {
      id: `coup-${Date.now()}`,
      ...coupon,
      code: coupon.code.toUpperCase().trim(),
      usage_count: coupon.usage_count || 0,
      created_at: coupon.created_at || new Date().toISOString(),
      ...( { is_locally_modified: true } as any ),
    };
    this.coupons.unshift(newCoupon);
    this.save('cake_db_coupons', this.coupons);
    this.logAudit(actor, 'Created Coupon', 'coupon', `Added coupon: ${newCoupon.code}`);
    this.notify();
    return newCoupon;
  }

  updateCoupon(id: string, updates: Partial<Coupon>, actor = 'Super Admin'): Coupon | null {
    const coup = this.coupons.find((c) => c.id === id);
    if (!coup) return null;
    if (updates.code) updates.code = updates.code.toUpperCase().trim();
    Object.assign(coup, updates, { is_locally_modified: true });
    this.save('cake_db_coupons', this.coupons);
    this.logAudit(actor, 'Updated Coupon', 'coupon', `Updated coupon: ${coup.code}`);
    this.notify();
    return coup;
  }

  deleteCoupon(id: string, actor = 'Super Admin'): boolean {
    const index = this.coupons.findIndex((c) => c.id === id);
    if (index === -1) return false;
    const removed = this.coupons.splice(index, 1)[0];
    this.save('cake_db_coupons', this.coupons);
    this.logAudit(actor, 'Deleted Coupon', 'coupon', `Deleted coupon: ${removed.code}`);
    this.notify();
    return true;
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
    this.recalculateAllStats();
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
    is_gift?: boolean;
    recipient_name?: string;
    recipient_phone?: string;
    sender_name?: string;
    sender_phone?: string;
    hide_price_on_box?: boolean;
    gift_card_message?: string;
    advance_paid_amount?: number;
    bkash_number?: string;
    bkash_trx_id?: string;
    initial_status?: OrderStatus;
    created_by?: string;
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
          itemTotal += dbAddon.price * cartItem.quantity;
          itemAddons.push({
            addon_id: dbAddon.id,
            addon_name: dbAddon.name,
            unit_price: dbAddon.price,
            quantity: cartItem.quantity,
            subtotal: dbAddon.price * cartItem.quantity,
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
      if (matchCoupon) {
        const val = validateCoupon(matchCoupon, computedSubtotal);
        if (val.isValid) {
          discount = val.discount;
          matchCoupon.usage_count = (matchCoupon.usage_count || 0) + 1;
          // Auto-delete coupon when usage limit is reached
          if (matchCoupon.usage_limit && matchCoupon.usage_count >= matchCoupon.usage_limit) {
            this.coupons = this.coupons.filter(c => c.id !== matchCoupon.id);
            this.save('cake_db_coupons', this.coupons);
            this.logAudit('System', 'Deleted Coupon', 'coupon', `Coupon ${matchCoupon.code} auto-deleted: reached usage limit of ${matchCoupon.usage_limit} uses.`);
          } else {
            this.save('cake_db_coupons', this.coupons);
          }
        }
      }
    }

    const finalTotal = Math.max(0, computedSubtotal - discount + delivery_fee);

    // Generate random 4-digit verification OTP
    const delivery_otp = '';
    const order_number = nextOrderNumber(this.orders);

    const advancePaid = payload.advance_paid_amount || 0;
    const dueAmount = payload.payment_method === 'cod' ? finalTotal : Math.max(0, finalTotal - advancePaid);
    const initialStatus = payload.initial_status || 'pending';
    const isAutoConfirmed = initialStatus === 'confirmed';

    const newOrder: Order = {
      id: `ord-${Date.now()}`,
      order_number,
      customer_name: payload.customer_name,
      customer_phone: payload.customer_phone,
      delivery_address: payload.delivery_address,
      delivery_zone: zone,
      delivery_slot,
      delivery_date: delivery_date || new Date().toISOString().split('T')[0],
      status: initialStatus,
      subtotal: computedSubtotal,
      delivery_fee,
      discount_amount: discount,
      total_amount: finalTotal,
      coupon_code,
      order_note,
      payment_method,
      payment_status: advancePaid >= finalTotal ? 'paid' : 'pending',
      delivery_otp,
      cod_amount: dueAmount,
      due_amount: dueAmount,
      advance_paid_amount: advancePaid,
      cod_collected: advancePaid >= finalTotal,
      is_gift: payload.is_gift,
      recipient_name: payload.recipient_name,
      recipient_phone: payload.recipient_phone,
      sender_name: payload.sender_name,
      sender_phone: payload.sender_phone,
      hide_price_on_box: payload.hide_price_on_box,
      gift_card_message: payload.gift_card_message,
      bkash_number: payload.bkash_number,
      bkash_trx_id: payload.bkash_trx_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items: processedItems,
      history: [
        {
          id: `h-${Date.now()}`,
          status: initialStatus,
          notes: isAutoConfirmed 
            ? `অর্ডারটি অ্যাডমিন প্যানেল থেকে সরাসরি তৈরি ও অটো-কনফার্ম করা হয়েছে (${payload.created_by || 'Admin'})`
            : (payload.is_gift ? 'সারপ্রাইজ উপহার অর্ডার গ্রহণ করা হয়েছে' : 'অর্ডার সফলভাবে গ্রহণ করা হয়েছে'),
          created_at: new Date().toISOString(),
          actor_name: payload.created_by || customer_name,
        },
      ],
    };

    // Link item order_id
    newOrder.items.forEach((item) => {
      item.order_id = newOrder.id;
    });

    this.orders.unshift(newOrder);
    this.save('cake_db_orders', this.orders);

    // Sync to sheet receipts cache if auto-confirmed so all views see it immediately
    try {
      const raw = globalThis.localStorage?.getItem('aurora_confirmed_orders_cache_v1');
      const parsed: any[] = raw ? JSON.parse(raw) : [];
      parsed.unshift(newOrder);
      globalThis.localStorage?.setItem('aurora_confirmed_orders_cache_v1', JSON.stringify(parsed));
    } catch {}

    this.recalculateAllStats(false);
    this.logAudit(
      payload.created_by || customer_name,
      isAutoConfirmed ? 'Created & Confirmed Order' : 'Placed Order',
      'order',
      `Order #${order_number} created with total ${this.settings.currency}${finalTotal} (Status: ${initialStatus})`
    );
    this.notify();

    return { success: true, order: newOrder };
  }

  // --- ORDER LIFECYCLE ACTIONS ---
  updateOrderStatus(orderId: string, newStatus: OrderStatus, notes?: string, actor = 'Staff') {
    let order = this.orders.find((o) => o.id === orderId);
    if (!order) {
      try {
        const raw = globalThis.localStorage?.getItem('aurora_confirmed_orders_cache_v1');
        const parsed: any[] = raw ? JSON.parse(raw) : [];
        const found = parsed.find(p => p && p.id === orderId);
        if (found) {
          order = found;
          this.orders.unshift(order as Order);
        }
      } catch {}
    }
    const allowed: Record<OrderStatus, OrderStatus[]> = { 
      pending: ['confirmed', 'cancelled'], 
      confirmed: ['preparing', 'cancelled'], 
      preparing: ['ready', 'cancelled'], 
      ready: ['assigned', 'out_for_delivery', 'delivered', 'cancelled'], 
      assigned: ['picked_up', 'out_for_delivery', 'delivered', 'cancelled'], 
      picked_up: ['out_for_delivery', 'delivered', 'cancelled'], 
      out_for_delivery: ['delivered', 'cancelled'], 
      delivered: ['pending'], 
      cancelled: ['pending', 'confirmed'] 
    };
    if (!order) return;
    const isSuperAdmin = 
      actor === 'Super Admin' || 
      actor === 'Admin' || 
      actor.includes('Super Admin') || 
      actor.includes('Admin') || 
      actor.toLowerCase().includes('owner');
    if (!isSuperAdmin && !allowed[order.status]?.includes(newStatus)) return;

    order.status = newStatus;
    (order as any).is_locally_modified = true;
    if (newStatus === 'delivered') {
      order.cod_collected = true;
      order.payment_status = 'paid';
    }
    order.updated_at = new Date().toISOString();
    order.history.push({
      id: `h-${Date.now()}`,
      status: newStatus,
      notes: notes || `Status changed to ${newStatus} by ${actor}`,
      created_at: new Date().toISOString(),
      actor_name: actor,
    });

    this.save('cake_db_orders', this.orders);

    // Sync back to sheet receipts cache if present
    try {
      const raw = globalThis.localStorage?.getItem('aurora_confirmed_orders_cache_v1');
      if (raw) {
        const parsed: any[] = JSON.parse(raw);
        const idx = parsed.findIndex(p => p && p.id === orderId);
        if (idx !== -1) {
          parsed[idx] = { ...parsed[idx], ...order, is_locally_modified: true };
          globalThis.localStorage?.setItem('aurora_confirmed_orders_cache_v1', JSON.stringify(parsed));
        }
      }
    } catch {}

    this.recalculateAllStats(false);
    this.logAudit(actor, 'Updated Order Status', 'order', `Order ${order.order_number} transitioned to ${newStatus}`);
    this.notify();
  }

  updateOrder(orderId: string, updates: Partial<Order>, actor = 'Staff'): { success: boolean; order?: Order; message?: string } {
    let order = this.orders.find((o) => o.id === orderId);
    if (!order) {
      try {
        const raw = globalThis.localStorage?.getItem('aurora_confirmed_orders_cache_v1');
        const parsed: any[] = raw ? JSON.parse(raw) : [];
        const found = parsed.find(p => p && p.id === orderId);
        if (found) {
          order = found;
          this.orders.unshift(order as Order);
        }
      } catch {}
    }
    if (!order) return { success: false, message: 'Order not found' };

    Object.assign(order, updates);
    (order as any).is_locally_modified = true;
    order.updated_at = new Date().toISOString();
    if (!order.history) order.history = [];
    order.history.push({
      id: `h-${Date.now()}`,
      status: order.status,
      notes: `অর্ডার তথ্য আপডেট করেছেন ${actor}`,
      created_at: new Date().toISOString(),
      actor_name: actor,
    });

    this.save('cake_db_orders', this.orders);

    // Sync back to sheet receipts cache if present
    try {
      const raw = globalThis.localStorage?.getItem('aurora_confirmed_orders_cache_v1');
      if (raw) {
        const parsed: any[] = JSON.parse(raw);
        const idx = parsed.findIndex((p) => p && p.id === orderId);
        if (idx !== -1) {
          parsed[idx] = { ...parsed[idx], ...order, is_locally_modified: true };
          globalThis.localStorage?.setItem('aurora_confirmed_orders_cache_v1', JSON.stringify(parsed));
        } else {
          parsed.unshift({ ...order, is_locally_modified: true });
          globalThis.localStorage?.setItem('aurora_confirmed_orders_cache_v1', JSON.stringify(parsed));
        }
      } else {
        globalThis.localStorage?.setItem('aurora_confirmed_orders_cache_v1', JSON.stringify([{ ...order, is_locally_modified: true }]));
      }
    } catch {}

    this.recalculateAllStats(false);
    this.logAudit(actor, 'Updated Order Info', 'order', `Order #${order.order_number} details updated`);
    this.notify();
    return { success: true, order };
  }

  assignRider(orderId: string, riderName = 'Rahim Mia (Rider #1)', actor = 'Delivery Manager') {
    let order = this.orders.find((o) => o.id === orderId);
    if (!order) {
      try {
        const raw = globalThis.localStorage?.getItem('aurora_confirmed_orders_cache_v1');
        const parsed: any[] = raw ? JSON.parse(raw) : [];
        const found = parsed.find(p => p && p.id === orderId);
        if (found) {
          order = found;
          this.orders.unshift(order as Order);
        }
      } catch {}
    }
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

  confirmDelivery(orderId: string, cashCollected = true, actor = 'Delivery Rider'): { success: boolean; message: string } {
    let order = this.orders.find((o) => o.id === orderId);
    
    // Also look up in confirmed sheet receipts cache if not found in this.orders
    if (!order) {
      try {
        const raw = globalThis.localStorage?.getItem('aurora_confirmed_orders_cache_v1');
        const parsed: any[] = raw ? JSON.parse(raw) : [];
        const found = parsed.find(p => p && p.id === orderId);
        if (found) {
          order = found;
          this.orders.unshift(order as Order);
        }
      } catch {
        // storage fallback
      }
    }

    if (!order) return { success: false, message: 'Order not found' };

    if (order.status === 'delivered') {
      return { success: true, message: 'এই অর্ডারটি ইতিমধ্যে সফলভাবে ডেলিভারি করা হয়েছে।' };
    }

    // Auto-assign default rider if missing
    if (!order.rider_id) {
      order.rider_id = 'rider-1';
      order.rider_name = order.rider_name || actor || 'Rahim Mia (Rider #1)';
    }

    const dueAmount = order.due_amount !== undefined 
      ? order.due_amount 
      : (order.payment_method === 'cod' ? (order.total_amount - (order.advance_paid_amount || 0)) : 0);
    const requiresCash = dueAmount > 0;

    if (requiresCash && !cashCollected) {
      return { success: false, message: 'দয়া করে কাস্টমারের কাছ থেকে বাকি ক্যাশ বুঝে নিয়ে কনফার্ম করুন।' };
    }

    order.status = 'delivered';
    order.cod_collected = Boolean(requiresCash ? cashCollected : true);
    order.payment_status = 'paid';
    order.updated_at = new Date().toISOString();
    order.history.push({
      id: `h-${Date.now()}`,
      status: 'delivered',
      notes: `Successfully delivered by ${actor}. Cash checked and confirmed: ${order.cod_collected ? 'YES' : 'N/A'}.`,
      created_at: new Date().toISOString(),
      actor_name: actor,
    });

    this.save('cake_db_orders', this.orders);

    // Also sync back to aurora_confirmed_orders_cache_v1 if present
    try {
      const raw = globalThis.localStorage?.getItem('aurora_confirmed_orders_cache_v1');
      if (raw) {
        const parsed: any[] = JSON.parse(raw);
        const idx = parsed.findIndex(p => p && p.id === orderId);
        if (idx !== -1) {
          parsed[idx] = { ...parsed[idx], ...order };
          globalThis.localStorage?.setItem('aurora_confirmed_orders_cache_v1', JSON.stringify(parsed));
        }
      }
    } catch {}

    this.recalculateAllStats(false);
    this.logAudit(actor, 'Confirmed Delivery', 'delivery', `Order ${order.order_number} marked as Delivered with cash: ${order.cod_collected ? 'Yes' : 'No'}`);
    this.notify();

    return { success: true, message: 'অর্ডার সফলভাবে ডেলিভারি সম্পন্ন হয়েছে এবং ক্যাশ কালেকশন রেকর্ড হয়েছে!' };
  }

  verifyDeliveryOTP(orderId: string, enteredOtp?: string, actor = 'Delivery Rider'): { success: boolean; message: string } {
    if (!enteredOtp) {
      return this.confirmDelivery(orderId, true, actor);
    }
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) return { success: false, message: 'Order not found' };

    if (order.delivery_otp && order.delivery_otp !== enteredOtp.trim()) {
      return { success: false, message: 'Delivery verification failed.' };
    }

    return this.confirmDelivery(orderId, true, actor);
  }

  // --- RIDER CASH DEPOSITS & BALANCE SETTLEMENT ---
  getRiderDeposits(riderId?: string): RiderDeposit[] {
    if (riderId) return this.deposits.filter((d) => d.rider_id === riderId);
    return [...this.deposits];
  }

  getRiderCashSummary(riderId = 'rider-1', riderName = 'Rahim Mia (Rider #1)'): {
    total_collected: number;
    total_deposited: number;
    cash_in_hand: number;
    delivered_orders_count: number;
    deposits: RiderDeposit[];
  } {
    const riderOrders = this.orders.filter(
      (o) =>
        (o.rider_id === riderId || (!o.rider_id && riderId === 'rider-1')) &&
        o.status === 'delivered' &&
        (o.payment_method === 'cod' || (o.due_amount !== undefined && o.due_amount > 0)) &&
        o.cod_collected
    );

    const total_collected = riderOrders.reduce((sum, o) => {
      const cashAmount = o.due_amount !== undefined 
        ? o.due_amount 
        : (o.payment_method === 'cod' ? (o.total_amount - (o.advance_paid_amount || 0)) : 0);
      return sum + Number(cashAmount || 0);
    }, 0);
    const deposits = this.deposits.filter((d) => d.rider_id === riderId);
    const total_deposited = deposits.reduce((sum, d) => sum + Number(d.amount || 0), 0);
    const cash_in_hand = Math.max(0, total_collected - total_deposited);

    return {
      total_collected,
      total_deposited,
      cash_in_hand,
      delivered_orders_count: riderOrders.length,
      deposits,
    };
  }

  addRiderDeposit(
    deposit: { rider_id: string; rider_name: string; amount: number; note?: string },
    actor = 'Delivery Rider'
  ): { success: boolean; deposit: RiderDeposit; remaining_balance: number; message: string } {
    const amount = Math.round(Number(deposit.amount || 0));
    if (isNaN(amount) || amount <= 0) {
      return {
        success: false,
        deposit: null as any,
        remaining_balance: 0,
        message: 'দয়া করে সঠিক জমার পরিমাণ উল্লেখ করুন (০ থেকে বেশি হতে হবে)।',
      };
    }

    const currentSummary = this.getRiderCashSummary(deposit.rider_id, deposit.rider_name);
    const newDeposit: RiderDeposit = {
      id: `dep-${Date.now()}`,
      rider_id: deposit.rider_id,
      rider_name: deposit.rider_name,
      amount,
      deposited_at: new Date().toISOString(),
      note: deposit.note || 'Cash deposit to bakery counter',
      actor_name: actor,
      status: 'confirmed',
    };

    this.deposits.unshift(newDeposit);
    this.save('cake_db_deposits', this.deposits);
    const remaining = Math.max(0, currentSummary.cash_in_hand - amount);

    this.logAudit(
      actor,
      'Rider Cash Deposit',
      'finance',
      `Rider ${deposit.rider_name} deposited ৳${amount}. Previous balance: ৳${currentSummary.cash_in_hand}, New balance: ৳${remaining}`
    );
    this.notify();

    return {
      success: true,
      deposit: newDeposit,
      remaining_balance: remaining,
      message: `৳${amount.toLocaleString()} সফলভাবে কাউন্টারে জমা (ডিপোজিট) হয়েছে। রাইডারের বর্তমান ব্যালেন্স: ৳${remaining.toLocaleString()}`,
    };
  }

  // --- STAFF & ROLE PERMISSIONS (RBAC) ---
  getStaffMembers(): StaffMember[] {
    return [...this.staffMembers];
  }

  getStaffMember(idOrUsername: string): StaffMember | undefined {
    return this.staffMembers.find((s) => s.id === idOrUsername || s.username === idOrUsername);
  }

  getRolePermissions(role: StaffRole): StaffPermissionCode[] {
    if (role === 'super_admin' || role === 'admin') {
      return [...DEFAULT_ROLE_PERMISSIONS.super_admin];
    }
    return this.rolePermissions[role] ? [...this.rolePermissions[role]] : [];
  }

  getStaffEffectivePermissions(staffOrRoleId: string): StaffPermissionCode[] {
    // If it's a direct role name
    if (['super_admin', 'admin', 'order_manager', 'kitchen_manager', 'delivery_manager', 'accountant', 'delivery_man'].includes(staffOrRoleId)) {
      if (staffOrRoleId === 'super_admin' || staffOrRoleId === 'admin') {
        return [...DEFAULT_ROLE_PERMISSIONS.super_admin];
      }
      return this.getRolePermissions(staffOrRoleId as StaffRole);
    }
    // If it's a staff member ID or username
    const staff = this.getStaffMember(staffOrRoleId);
    if (staff) {
      if (staff.role === 'super_admin' || staff.role === 'admin') {
        return [...DEFAULT_ROLE_PERMISSIONS.super_admin];
      }
      if (staff.permissions && staff.permissions.length > 0) {
        return [...staff.permissions];
      }
      return this.getRolePermissions(staff.role);
    }
    return [];
  }

  hasPermission(roleOrStaffId: string, permissionCode: StaffPermissionCode): boolean {
    if (
      roleOrStaffId === 'super_admin' ||
      roleOrStaffId === 'admin' ||
      roleOrStaffId?.toLowerCase().includes('super_admin') ||
      roleOrStaffId?.toLowerCase().includes('admin') ||
      roleOrStaffId?.toLowerCase().includes('owner')
    ) return true;
    const staff = this.getStaffMember(roleOrStaffId);
    if (staff && (staff.role === 'super_admin' || staff.role === 'admin')) return true;
    const permissions = this.getStaffEffectivePermissions(roleOrStaffId);
    return permissions.includes(permissionCode);
  }

  addStaffMember(staff: Omit<StaffMember, 'id' | 'created_at' | 'permissions'> & { permissions?: StaffPermissionCode[] }, actor = 'Super Admin'): StaffMember {
    const id = `staff-${Date.now()}`;
    const cleanPassword = staff.password?.trim() || '1234';
    if (cleanPassword.length < 4) {
      throw new Error('Staff password must be at least 4 digits / characters.');
    }
    const permissions = staff.permissions && Array.isArray(staff.permissions)
      ? staff.permissions
      : (DEFAULT_ROLE_PERMISSIONS[staff.role] ? [...DEFAULT_ROLE_PERMISSIONS[staff.role]] : []);
    const newStaff: StaffMember = {
      ...staff,
      permissions,
      password: cleanPassword,
      id,
      created_at: new Date().toISOString(),
    };
    this.staffMembers.push(newStaff);
    this.save('cake_db_staff_members', this.staffMembers);
    this.logAudit(
      actor,
      'Created Staff Account',
      'staff',
      `Added staff ${newStaff.name} (@${newStaff.username}) with role ${newStaff.role} and ${newStaff.permissions.length} permissions.`
    );
    this.notify();
    return newStaff;
  }

  resetStaffPassword(id: string, newPassword: string, actor = 'Super Admin'): boolean {
    const staff = this.staffMembers.find((s) => s.id === id);
    if (!staff) return false;
    const cleanPassword = newPassword.trim();
    if (cleanPassword.length < 4) {
      throw new Error('Staff password must be at least 4 digits / characters.');
    }
    staff.password = cleanPassword;
    this.save('cake_db_staff_members', this.staffMembers);
    this.logAudit(
      actor,
      'Reset Staff Password',
      'staff',
      `Updated login password for ${staff.name} (@${staff.username}) with minimum 4-digit requirement.`
    );
    this.notify();
    return true;
  }

  updateStaffMember(id: string, updates: Partial<StaffMember>, actor = 'Super Admin'): boolean {
    const index = this.staffMembers.findIndex((s) => s.id === id);
    if (index === -1) return false;
    this.staffMembers[index] = {
      ...this.staffMembers[index],
      ...updates,
    };
    this.save('cake_db_staff_members', this.staffMembers);
    this.logAudit(
      actor,
      'Updated Staff Info',
      'staff',
      `Updated staff profile for ${this.staffMembers[index].name} (@${this.staffMembers[index].username}).`
    );
    this.notify();
    return true;
  }

  updateStaffPermissions(id: string, permissions: StaffPermissionCode[], actor = 'Super Admin'): boolean {
    const staff = this.staffMembers.find((s) => s.id === id);
    if (!staff) return false;
    staff.permissions = [...permissions];
    this.save('cake_db_staff_members', this.staffMembers);
    this.logAudit(
      actor,
      'Assigned Staff Permissions',
      'staff',
      `Assigned ${permissions.length} permissions to ${staff.name} (@${staff.username}).`
    );
    this.notify();
    return true;
  }

  updateRolePermissions(role: StaffRole, permissions: StaffPermissionCode[], actor = 'Super Admin'): boolean {
    if (role === 'super_admin') return false; // Super admin always retains all permissions
    this.rolePermissions[role] = [...permissions];
    this.save('cake_db_role_permissions', this.rolePermissions);
    // Also update any staff members who have this role and do not have an explicit custom override
    for (const member of this.staffMembers) {
      if (member.role === role) {
        member.permissions = [...permissions];
      }
    }
    this.save('cake_db_staff_members', this.staffMembers);
    this.logAudit(
      actor,
      'Updated Role Permissions',
      'role',
      `Updated default permissions for role ${role} to ${permissions.length} actions.`
    );
    this.notify();
    return true;
  }

  deleteStaffMember(id: string, actor = 'Super Admin'): boolean {
    const staff = this.staffMembers.find((s) => s.id === id);
    if (!staff) return false;
    if (staff.role === 'super_admin') return false; // Super Admin cannot be deleted
    this.staffMembers = this.staffMembers.filter((s) => s.id !== id);
    this.save('cake_db_staff_members', this.staffMembers);
    this.logAudit(
      actor,
      'Deleted Staff Account',
      'staff',
      `Removed staff account ${staff.name} (@${staff.username}).`
    );
    this.notify();
    return true;
  }

  resetStaffToDefaults(actor = 'Super Admin'): void {
    this.staffMembers = JSON.parse(JSON.stringify(INITIAL_STAFF_MEMBERS));
    this.rolePermissions = JSON.parse(JSON.stringify(DEFAULT_ROLE_PERMISSIONS));
    this.save('cake_db_staff_members', this.staffMembers);
    this.save('cake_db_role_permissions', this.rolePermissions);
    this.logAudit(
      actor,
      'Reset Staff Permissions',
      'staff',
      'Reset all staff members and role permissions to initial factory defaults.'
    );
    this.notify();
  }
}

export const mockDb = new MockDatabase();

export interface CouponValidationResult {
  isValid: boolean;
  coupon?: Coupon;
  discount: number;
  reason?: string;
}

export function validateCoupon(
  coupon: Coupon | null | undefined,
  subtotal: number,
  now: Date = new Date()
): CouponValidationResult {
  if (!coupon) {
    return { isValid: false, discount: 0, reason: 'This coupon is not available.' };
  }
  if (!coupon.is_active) {
    return { isValid: false, discount: 0, reason: 'This coupon is currently inactive.' };
  }
  if (coupon.valid_from) {
    const fromTime = new Date(coupon.valid_from.includes('T') ? coupon.valid_from : `${coupon.valid_from}T00:00:00`).getTime();
    if (!isNaN(fromTime) && now.getTime() < fromTime) {
      return { isValid: false, discount: 0, reason: `This coupon starts on ${coupon.valid_from}.` };
    }
  }
  if (coupon.valid_until) {
    const untilTime = new Date(coupon.valid_until.includes('T') ? coupon.valid_until : `${coupon.valid_until}T23:59:59.999`).getTime();
    if (!isNaN(untilTime) && now.getTime() > untilTime) {
      return { isValid: false, discount: 0, reason: 'This coupon has expired.' };
    }
  }
  if (coupon.usage_limit && coupon.usage_limit > 0) {
    if ((coupon.usage_count || 0) >= coupon.usage_limit) {
      return { isValid: false, discount: 0, reason: 'This coupon has reached its maximum usage limit.' };
    }
  }
  if (coupon.min_order_amount && subtotal < coupon.min_order_amount) {
    return {
      isValid: false,
      discount: 0,
      reason: `Requires a minimum cake subtotal of ৳${coupon.min_order_amount}.`,
    };
  }

  let discount = 0;
  if (coupon.discount_type === 'percentage') {
    discount = Math.round((subtotal * coupon.discount_value) / 100);
    if (coupon.max_discount_amount && discount > coupon.max_discount_amount) {
      discount = coupon.max_discount_amount;
    }
  } else {
    discount = Math.min(coupon.discount_value, subtotal);
  }

  return {
    isValid: true,
    coupon,
    discount,
  };
}

