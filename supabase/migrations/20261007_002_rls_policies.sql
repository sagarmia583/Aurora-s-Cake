-- ============================================================
-- 🍰 CAKE SHOP RLS & ACCESS CONTROL POLICIES MIGRATION 002
-- ============================================================

-- Enable Row Level Security on core tables
ALTER TABLE shop_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE flavors ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_flavors ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_addon_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_cake_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper functions
CREATE OR REPLACE FUNCTION is_staff(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM staff WHERE auth_id = user_id AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION has_permission(user_id UUID, perm_code TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM staff s
    JOIN staff_roles sr ON s.id = sr.staff_id
    JOIN role_permissions rp ON sr.role_id = rp.role_id
    JOIN permissions p ON rp.permission_id = p.id
    WHERE s.auth_id = user_id
      AND s.is_active = true
      AND (p.code = perm_code OR p.code = 'all.manage')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Public storefront read access
CREATE POLICY "Public can view active shop settings" ON shop_settings
  FOR SELECT USING (true);

CREATE POLICY "Public can view active categories" ON categories
  FOR SELECT USING (is_active = true);

CREATE POLICY "Public can view active products" ON products
  FOR SELECT USING (is_active = true);

CREATE POLICY "Public can view product images" ON product_images
  FOR SELECT USING (true);

CREATE POLICY "Public can view product variants" ON product_variants
  FOR SELECT USING (is_active = true);

CREATE POLICY "Public can view flavors" ON flavors
  FOR SELECT USING (is_active = true);

CREATE POLICY "Public can view product flavors" ON product_flavors
  FOR SELECT USING (true);

CREATE POLICY "Public can view add-ons" ON product_addons
  FOR SELECT USING (is_active = true);

CREATE POLICY "Public can view banners" ON banners
  FOR SELECT USING (is_active = true);

CREATE POLICY "Public can view approved reviews" ON reviews
  FOR SELECT USING (status = 'approved');

CREATE POLICY "Public can view delivery zones and slots" ON delivery_zones
  FOR SELECT USING (is_active = true);

CREATE POLICY "Public can view delivery slots" ON delivery_slots
  FOR SELECT USING (is_active = true);

-- Customer access (Own data only)
CREATE POLICY "Customers view own profile" ON customers
  FOR SELECT USING (auth_id = auth.uid());

CREATE POLICY "Customers update own profile" ON customers
  FOR UPDATE USING (auth_id = auth.uid());

CREATE POLICY "Customers view own addresses" ON customer_addresses
  FOR ALL USING (
    customer_id IN (SELECT id FROM customers WHERE auth_id = auth.uid())
  );

CREATE POLICY "Customers view own orders" ON orders
  FOR SELECT USING (
    customer_id IN (SELECT id FROM customers WHERE auth_id = auth.uid())
  );

CREATE POLICY "Customers view own order items" ON order_items
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM orders WHERE customer_id IN (SELECT id FROM customers WHERE auth_id = auth.uid())
    )
  );

-- Delivery rider restrictions: can only see assigned deliveries
CREATE POLICY "Riders view assigned deliveries" ON deliveries
  FOR SELECT USING (
    rider_id IN (SELECT id FROM staff WHERE auth_id = auth.uid())
    OR has_permission(auth.uid(), 'delivery.view')
  );

CREATE POLICY "Riders update assigned delivery state" ON deliveries
  FOR UPDATE USING (
    rider_id IN (SELECT id FROM staff WHERE auth_id = auth.uid())
    OR has_permission(auth.uid(), 'delivery.update')
  );

-- Staff administration policies
CREATE POLICY "Staff manage shop settings" ON shop_settings
  FOR ALL USING (has_permission(auth.uid(), 'settings.manage'));

CREATE POLICY "Staff manage products" ON products
  FOR ALL USING (has_permission(auth.uid(), 'products.update'));

CREATE POLICY "Staff manage categories" ON categories
  FOR ALL USING (has_permission(auth.uid(), 'categories.manage'));

CREATE POLICY "Staff view and update orders" ON orders
  FOR ALL USING (has_permission(auth.uid(), 'orders.view'));
