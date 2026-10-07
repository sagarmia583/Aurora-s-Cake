-- ============================================================
-- 🍰 CAKE SHOP PRODUCTION DATABASE SCHEMA MIGRATION 001
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. SHOP SETTINGS
CREATE TABLE IF NOT EXISTS shop_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_name VARCHAR(150) NOT NULL DEFAULT 'SweetDelight Artisan Cake Boutique',
    logo_url TEXT DEFAULT 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=500&auto=format&fit=crop&q=80',
    favicon_url TEXT DEFAULT '',
    phone VARCHAR(30) NOT NULL DEFAULT '+880 1712-345678',
    whatsapp VARCHAR(30) NOT NULL DEFAULT '+880 1712-345678',
    email VARCHAR(100) NOT NULL DEFAULT 'orders@sweetdelightcakes.com',
    address TEXT NOT NULL DEFAULT 'Main Road, Tangail Town, Dhaka Division, Bangladesh',
    opening_time VARCHAR(20) NOT NULL DEFAULT '09:00 AM',
    closing_time VARCHAR(20) NOT NULL DEFAULT '10:00 PM',
    facebook_url TEXT DEFAULT 'https://facebook.com',
    instagram_url TEXT DEFAULT 'https://instagram.com',
    tiktok_url TEXT DEFAULT 'https://tiktok.com',
    website_title VARCHAR(200) NOT NULL DEFAULT 'SweetDelight - Handcrafted Fresh Cakes & Desserts',
    website_description TEXT DEFAULT 'Order fresh premium birthday, wedding, and celebration cakes with same-day express delivery.',
    currency VARCHAR(10) NOT NULL DEFAULT '৳',
    accepting_orders BOOLEAN NOT NULL DEFAULT true,
    delivery_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. CATEGORIES
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(120) UNIQUE NOT NULL,
    description TEXT,
    image_url TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. PRODUCTS
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    name VARCHAR(150) NOT NULL,
    slug VARCHAR(180) UNIQUE NOT NULL,
    description TEXT,
    base_price NUMERIC(10, 2) NOT NULL,
    sale_price NUMERIC(10, 2),
    is_featured BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. PRODUCT IMAGES
CREATE TABLE IF NOT EXISTS product_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. PRODUCT VARIANTS (Weights / Sizes)
CREATE TABLE IF NOT EXISTS product_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name VARCHAR(80) NOT NULL, -- e.g. '500g', '1kg', '1.5kg', '2kg'
    weight_grams INT NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    sale_price NUMERIC(10, 2),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. FLAVORS & MAP
CREATE TABLE IF NOT EXISTS flavors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(80) NOT NULL UNIQUE,
    color_hex VARCHAR(20) DEFAULT '#f43f5e',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_flavors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    flavor_id UUID NOT NULL REFERENCES flavors(id) ON DELETE CASCADE,
    UNIQUE(product_id, flavor_id)
);

-- 7. ADD-ONS & MAP
CREATE TABLE IF NOT EXISTS product_addons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_addon_map (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    addon_id UUID NOT NULL REFERENCES product_addons(id) ON DELETE CASCADE,
    UNIQUE(product_id, addon_id)
);

-- 8. BANNERS
CREATE TABLE IF NOT EXISTS banners (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(150) NOT NULL,
    subtitle TEXT,
    image_url TEXT NOT NULL,
    button_text VARCHAR(60) DEFAULT 'Order Now',
    button_link TEXT DEFAULT '/shop',
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. CUSTOMERS & ADDRESSES
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_id UUID UNIQUE,
    phone VARCHAR(30) UNIQUE NOT NULL,
    full_name VARCHAR(120),
    email VARCHAR(120),
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    label VARCHAR(50) DEFAULT 'Home',
    address_line TEXT NOT NULL,
    area VARCHAR(100) NOT NULL,
    landmark TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. DELIVERY ZONES & SLOTS
CREATE TABLE IF NOT EXISTS delivery_zones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    delivery_fee NUMERIC(10, 2) NOT NULL,
    estimated_time VARCHAR(60) DEFAULT '2-3 hours',
    is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS delivery_slots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slot_label VARCHAR(80) NOT NULL, -- '10:00 AM - 12:00 PM'
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true
);

-- 11. STAFF, ROLES & PERMISSIONS
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(80) UNIQUE NOT NULL,
    module VARCHAR(50) NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY(role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS staff (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_id UUID UNIQUE,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(120) UNIQUE NOT NULL,
    phone VARCHAR(30),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_roles (
    staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY(staff_id, role_id)
);

-- 12. COUPONS
CREATE TABLE IF NOT EXISTS coupons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(40) UNIQUE NOT NULL,
    discount_type VARCHAR(20) NOT NULL DEFAULT 'percentage', -- 'percentage' or 'fixed'
    discount_value NUMERIC(10, 2) NOT NULL,
    min_order_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    max_discount_amount NUMERIC(10, 2),
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    usage_limit INT,
    usage_count INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. ORDERS & ITEMS
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(60) UNIQUE NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    customer_name VARCHAR(120) NOT NULL,
    customer_phone VARCHAR(30) NOT NULL,
    delivery_address TEXT NOT NULL,
    delivery_zone_id UUID REFERENCES delivery_zones(id) ON DELETE SET NULL,
    delivery_slot VARCHAR(80) NOT NULL,
    delivery_date DATE NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'pending',
    subtotal NUMERIC(10, 2) NOT NULL,
    delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(10, 2) NOT NULL,
    coupon_id UUID REFERENCES coupons(id) ON DELETE SET NULL,
    order_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    product_name VARCHAR(150) NOT NULL,
    variant_name VARCHAR(80) NOT NULL,
    flavor_name VARCHAR(80),
    writing_message TEXT,
    unit_price NUMERIC(10, 2) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    subtotal NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_item_addons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    addon_id UUID REFERENCES product_addons(id) ON DELETE SET NULL,
    addon_name VARCHAR(100) NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    subtotal NUMERIC(10, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS order_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status VARCHAR(40) NOT NULL,
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. PAYMENTS
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    payment_method VARCHAR(30) NOT NULL, -- 'cod', 'bkash', 'nagad', 'card'
    amount NUMERIC(10, 2) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending', -- 'pending', 'paid', 'failed'
    transaction_id VARCHAR(100),
    provider VARCHAR(40),
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. DELIVERIES
CREATE TABLE IF NOT EXISTS deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    rider_id UUID REFERENCES staff(id) ON DELETE SET NULL,
    rider_name VARCHAR(100),
    rider_phone VARCHAR(30),
    status VARCHAR(40) NOT NULL DEFAULT 'unassigned',
    delivery_otp VARCHAR(6) NOT NULL,
    cod_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    cod_collected BOOLEAN NOT NULL DEFAULT false,
    proof_image_url TEXT,
    delivery_notes TEXT,
    assigned_at TIMESTAMPTZ,
    picked_up_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. CUSTOM CAKE REQUESTS
CREATE TABLE IF NOT EXISTS custom_cake_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    customer_name VARCHAR(100) NOT NULL,
    customer_phone VARCHAR(30) NOT NULL,
    cake_type VARCHAR(80),
    approx_size VARCHAR(50),
    flavor VARCHAR(80),
    color_theme VARCHAR(80),
    writing_text TEXT,
    reference_image_url TEXT,
    instructions TEXT,
    estimated_price NUMERIC(10, 2),
    status VARCHAR(40) NOT NULL DEFAULT 'pending', -- 'pending', 'quoted', 'approved', 'preparing', 'completed', 'rejected'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 17. REVIEWS
CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    customer_name VARCHAR(100) NOT NULL,
    rating INT NOT NULL CHECK(rating >= 1 AND rating <= 5),
    comment TEXT,
    image_url TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'approved', -- 'pending', 'approved', 'rejected'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 18. AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID,
    actor_name VARCHAR(100),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(60) NOT NULL,
    entity_id VARCHAR(60),
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
