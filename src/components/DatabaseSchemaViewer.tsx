import React, { useState } from 'react';
import { X, Copy, Check, Database, Shield, Lock, FileCode } from 'lucide-react';

interface DatabaseSchemaViewerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DatabaseSchemaViewer: React.FC<DatabaseSchemaViewerProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<'schema' | 'rls' | 'rpc'>('schema');
  const [copied, setCopied] = useState(false);

  const sqlFiles = {
    schema: `-- 001_initial_schema.sql
-- Contains 28 core tables:
-- shop_settings, categories, products, product_images, product_variants,
-- flavors, product_flavors, product_addons, product_addon_map, banners,
-- customers, customer_addresses, delivery_zones, delivery_slots, staff,
-- roles, permissions, role_permissions, orders, order_items,
-- order_status_history, payments, deliveries, custom_cake_requests,
-- reviews, coupons, audit_logs.

CREATE TABLE IF NOT EXISTS shop_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_name VARCHAR(150) NOT NULL,
    logo_url TEXT,
    phone VARCHAR(30) NOT NULL,
    whatsapp VARCHAR(30) NOT NULL,
    opening_time VARCHAR(20) NOT NULL,
    closing_time VARCHAR(20) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT '৳',
    accepting_orders BOOLEAN NOT NULL DEFAULT true,
    delivery_enabled BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID REFERENCES categories(id),
    name VARCHAR(150) NOT NULL,
    slug VARCHAR(180) UNIQUE NOT NULL,
    base_price NUMERIC(10, 2) NOT NULL,
    is_featured BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS product_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    name VARCHAR(80) NOT NULL, -- '500g', '1kg', '1.5kg', '2kg'
    price NUMERIC(10, 2) NOT NULL,
    sale_price NUMERIC(10, 2)
);

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(60) UNIQUE NOT NULL,
    customer_name VARCHAR(120) NOT NULL,
    delivery_address TEXT NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'pending',
    subtotal NUMERIC(10, 2) NOT NULL,
    delivery_fee NUMERIC(10, 2) NOT NULL,
    total_amount NUMERIC(10, 2) NOT NULL
);`,
    rls: `-- 002_rls_policies.sql
-- Enables strict Row-Level Security on all tables.
-- Public can only SELECT active storefront data.
-- Customers only read own orders & profile.
-- Delivery riders only view assigned rows.

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

-- Public read policies
CREATE POLICY "Public view active products" ON products
  FOR SELECT USING (is_active = true);

-- Customer isolation
CREATE POLICY "Customers view own orders" ON orders
  FOR SELECT USING (customer_id IN (SELECT id FROM customers WHERE auth_id = auth.uid()));

-- Delivery Rider isolation
CREATE POLICY "Riders view assigned deliveries" ON deliveries
  FOR SELECT USING (
    rider_id IN (SELECT id FROM staff WHERE auth_id = auth.uid())
    OR has_permission(auth.uid(), 'delivery.view')
  );`,
    rpc: `-- 003_secure_order_rpc.sql
-- Atomic server-side order calculation preventing client-side price tampering.
CREATE OR REPLACE FUNCTION create_secure_order(
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_delivery_address TEXT,
    p_delivery_zone_id UUID,
    p_delivery_slot TEXT,
    p_delivery_date DATE,
    p_items JSONB,
    p_coupon_code TEXT DEFAULT NULL,
    p_order_note TEXT DEFAULT NULL,
    p_payment_method TEXT DEFAULT 'cod'
)
RETURNS JSONB AS $$
DECLARE
    v_order_id UUID;
    v_order_number TEXT;
    v_calculated_subtotal NUMERIC(10, 2) := 0;
    v_delivery_otp VARCHAR(6);
BEGIN
    -- Recalculates authoritatively using product_variants and product_addons tables
    -- Generates 4-digit OTP for delivery verification
    -- Inserts into orders, order_items, order_status_history, payments, and deliveries
    RETURN jsonb_build_object('success', true, 'order_id', v_order_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;`,
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(sqlFiles[activeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div 
        className="bg-slate-900 text-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-700 overflow-hidden my-6 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Supabase PostgreSQL Architecture</h3>
              <p className="text-xs text-slate-400">Production migrations, RLS policies, and RPC functions</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex gap-2">
            {[
              { id: 'schema', label: '001 Schema SQL', icon: FileCode },
              { id: 'rls', label: '002 RLS Policies', icon: Shield },
              { id: 'rpc', label: '003 Secure RPC', icon: Lock },
            ].map((t) => {
              const Icon = t.icon;
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id as any)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                    isActive
                      ? 'border-sky-400 text-sky-400'
                      : 'border-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1 rounded-lg transition-colors cursor-pointer mb-2"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied SQL!' : 'Copy SQL'}</span>
          </button>
        </div>

        {/* Code Content */}
        <div className="p-6 overflow-y-auto flex-1 font-mono text-xs bg-slate-950 text-slate-300 leading-relaxed">
          <pre>{sqlFiles[activeTab]}</pre>
        </div>
      </div>
    </div>
  );
};
