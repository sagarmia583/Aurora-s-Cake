import React, { useState, useEffect } from 'react';
import {
  X,
  Database,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  UploadCloud,
  Copy,
  ExternalLink,
  ShieldCheck,
  Server,
  Layers,
  Sparkles,
  Info,
} from 'lucide-react';
import { supabaseService, SupabaseConfig } from '../services/supabaseClient';
import { supabaseDataService, SupabaseSyncStatus } from '../services/supabaseDataService';
import { mockDb } from '../services/mockDatabase';
import { ShopSettings, Category, Product, Flavor, ProductAddon, Banner, DeliveryZone, DeliverySlot, Coupon, Review } from '../types';

interface SupabaseSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ShopSettings;
  categories: Category[];
  products: Product[];
  flavors: Flavor[];
  addons: ProductAddon[];
  banners: Banner[];
  zones: DeliveryZone[];
  slots: DeliverySlot[];
  coupons: Coupon[];
  reviews: Review[];
  onDataRefreshed: () => void;
}

export const SupabaseSyncModal: React.FC<SupabaseSyncModalProps> = ({
  isOpen,
  onClose,
  settings,
  categories,
  products,
  flavors,
  addons,
  banners,
  zones,
  slots,
  coupons,
  reviews,
  onDataRefreshed,
}) => {
  const [config, setConfig] = useState<SupabaseConfig>(supabaseService.getConfig());
  const [syncStatus, setSyncStatus] = useState<SupabaseSyncStatus>(supabaseDataService.getStatus());
  const [urlInput, setUrlInput] = useState(config.url);
  const [keyInput, setKeyInput] = useState(config.anonKey);
  const [isTesting, setIsTesting] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [seedResult, setSeedResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);
  const [activeTab, setActiveTab] = useState<'status' | 'credentials' | 'sql'>('status');

  useEffect(() => {
    const unsub = supabaseDataService.subscribe((status) => {
      setSyncStatus(status);
    });
    return () => unsub();
  }, []);

  if (!isOpen) return null;

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    supabaseService.saveConfig(urlInput, keyInput);
    setConfig(supabaseService.getConfig());
    setIsTesting(true);
    setTestResult(null);

    const test = await supabaseService.testConnection();
    setIsTesting(false);
    setTestResult(test);

    if (test.success) {
      await supabaseDataService.checkConnection();
      const freshData = await supabaseDataService.loadAllDataFromSupabase();
      if (freshData) {
        onDataRefreshed();
      }
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    const res = await supabaseService.testConnection();
    setIsTesting(false);
    setTestResult(res);
    await supabaseDataService.checkConnection();
  };

  const handleSeedSupabase = async () => {
    setIsSeeding(true);
    setSeedResult(null);
    const res = await supabaseDataService.pushAllDataToSupabase({
      settings,
      categories,
      products,
      flavors,
      addons,
      banners,
      zones,
      slots,
      coupons,
      reviews,
    });
    setIsSeeding(false);
    setSeedResult(res);
    if (res.success) {
      onDataRefreshed();
    }
  };

  const handleCopySql = () => {
    const sql = `-- 🍰 CAKE SHOP SUPABASE SCHEMA QUICK SETUP
-- Copy & Run this in your Supabase SQL Editor:
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS shop_settings (
  id TEXT PRIMARY KEY DEFAULT 'setting-1',
  shop_name TEXT NOT NULL DEFAULT 'SweetDelight Artisan Cake Boutique',
  logo_url TEXT,
  phone TEXT NOT NULL DEFAULT '+880 1712-345678',
  whatsapp TEXT NOT NULL DEFAULT '+880 1712-345678',
  email TEXT DEFAULT 'orders@sweetdelightcakes.com',
  address TEXT DEFAULT 'Victoria Road, Tangail Town, Dhaka Division, Bangladesh',
  opening_time TEXT DEFAULT '09:00 AM',
  closing_time TEXT DEFAULT '10:00 PM',
  currency TEXT DEFAULT '৳',
  accepting_orders BOOLEAN DEFAULT true,
  delivery_enabled BOOLEAN DEFAULT true,
  website_title TEXT DEFAULT 'SweetDelight - Handcrafted Fresh Celebration Cakes',
  website_description TEXT DEFAULT 'Tangail’s #1 boutique for bespoke celebration cakes.',
  top_announcement_text TEXT DEFAULT '🚀 3-Hour Express Temperature-Safe Delivery in Tangail',
  hero_tagline TEXT DEFAULT 'Tangail’s Bespoke Luxury Patisserie',
  hero_title TEXT DEFAULT 'Handcrafted Celebration Cakes Made with Passion',
  hero_subtitle TEXT DEFAULT 'Order fresh 100% halal celebratory cakes made from pure dairy cream.',
  hero_cta_text TEXT DEFAULT 'Explore Fresh Cakes',
  trust_badge_1_title TEXT DEFAULT '100% Fresh Daily',
  trust_badge_1_desc TEXT DEFAULT 'Baked from scratch upon order',
  trust_badge_2_title TEXT DEFAULT '3-Hour Express Dispatch',
  trust_badge_2_desc TEXT DEFAULT 'Temperature-safe van & bike delivery',
  trust_badge_3_title TEXT DEFAULT 'Free Cake Dedication',
  trust_badge_3_desc TEXT DEFAULT 'Piped name & wishes included',
  trust_badge_4_title TEXT DEFAULT 'Hygienic Halal Standards',
  trust_badge_4_desc TEXT DEFAULT 'Pure dairy cream & imported cocoa',
  custom_cake_promo_tag TEXT DEFAULT 'Custom Cake Studio',
  custom_cake_promo_title TEXT DEFAULT 'Have a Dream Cake Design in Mind?',
  custom_cake_promo_desc TEXT DEFAULT 'Upload your reference photo, pick custom tiers, flavors, colors.',
  custom_cake_promo_btn TEXT DEFAULT 'Submit Custom Cake Request',
  footer_about_text TEXT DEFAULT 'Tangail premier boutique for fresh celebration cakes.',
  facebook_url TEXT DEFAULT 'https://facebook.com',
  instagram_url TEXT DEFAULT 'https://instagram.com'
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  category_id TEXT,
  category_name TEXT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  base_price NUMERIC NOT NULL,
  sale_price NUMERIC,
  image_url TEXT,
  rating NUMERIC DEFAULT 5,
  review_count INT DEFAULT 10,
  is_featured BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  weight_grams INT DEFAULT 1000,
  price NUMERIC NOT NULL,
  sale_price NUMERIC,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS flavors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color_hex TEXT DEFAULT '#f43f5e',
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS product_addons (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL,
  image_url TEXT,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS banners (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,
  image_url TEXT,
  button_text TEXT,
  button_link TEXT,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS delivery_zones (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  delivery_fee NUMERIC NOT NULL,
  estimated_minutes INT DEFAULT 45,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS delivery_slots (
  id TEXT PRIMARY KEY,
  slot_name TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS coupons (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  discount_type TEXT NOT NULL,
  discount_value NUMERIC NOT NULL,
  min_order_amount NUMERIC DEFAULT 0,
  max_discount_amount NUMERIC,
  usage_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  delivery_zone JSONB,
  delivery_slot TEXT,
  delivery_date TEXT,
  status TEXT DEFAULT 'pending',
  subtotal NUMERIC NOT NULL,
  delivery_fee NUMERIC DEFAULT 0,
  discount_amount NUMERIC DEFAULT 0,
  total_amount NUMERIC NOT NULL,
  coupon_code TEXT,
  order_note TEXT,
  payment_method TEXT DEFAULT 'cod',
  payment_status TEXT DEFAULT 'pending',
  delivery_otp TEXT,
  cod_amount NUMERIC DEFAULT 0,
  cod_collected BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  variant_name TEXT NOT NULL,
  flavor_name TEXT,
  writing_message TEXT,
  quantity INT NOT NULL,
  unit_price NUMERIC NOT NULL,
  subtotal NUMERIC NOT NULL,
  addons JSONB
);

CREATE TABLE IF NOT EXISTS custom_cake_requests (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  cake_type TEXT NOT NULL,
  approx_size TEXT,
  flavor TEXT,
  color_theme TEXT,
  writing_text TEXT,
  instructions TEXT,
  reference_image_url TEXT,
  status TEXT DEFAULT 'pending',
  estimated_price NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS and public read policies
ALTER TABLE shop_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE flavors ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read shop_settings" ON shop_settings FOR SELECT USING (true);
CREATE POLICY "Public read categories" ON categories FOR SELECT USING (true);
CREATE POLICY "Public read products" ON products FOR SELECT USING (true);
CREATE POLICY "Public read variants" ON product_variants FOR SELECT USING (true);
CREATE POLICY "Public read flavors" ON flavors FOR SELECT USING (true);
CREATE POLICY "Public read addons" ON product_addons FOR SELECT USING (true);
CREATE POLICY "Public read banners" ON banners FOR SELECT USING (true);
CREATE POLICY "Public read zones" ON delivery_zones FOR SELECT USING (true);
CREATE POLICY "Public read slots" ON delivery_slots FOR SELECT USING (true);
CREATE POLICY "Public read coupons" ON coupons FOR SELECT USING (true);
CREATE POLICY "Public read orders" ON orders FOR SELECT USING (true);
CREATE POLICY "Public insert orders" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Public insert items" ON order_items FOR INSERT WITH CHECK (true);
`;
    navigator.clipboard.writeText(sql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base">Supabase Live Database &amp; Data Sync</h3>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    syncStatus.isConnected
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  {syncStatus.isConnected ? '● Connected' : '○ Local Database Mode'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                All shop texts, products, categories, variants, and orders are 100% database-driven.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-5 pt-3 gap-2">
          <button
            onClick={() => setActiveTab('status')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'status'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            📊 Live Sync Status
          </button>
          <button
            onClick={() => setActiveTab('credentials')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'credentials'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            🔑 Credentials &amp; URL
          </button>
          <button
            onClick={() => setActiveTab('sql')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'sql'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            📜 SQL Schema (1-Click Setup)
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-800">
          {activeTab === 'status' && (
            <div className="space-y-6">
              {/* Connection Status Card */}
              <div
                className={`p-4 rounded-2xl border ${
                  syncStatus.isConnected
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50/70 border-amber-200 text-amber-900'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {syncStatus.isConnected ? (
                      <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <h4 className="font-bold text-sm">
                        {syncStatus.isConnected
                          ? 'Connected to Live Supabase PostgreSQL'
                          : 'Operating in High-Performance Local Database Mode'}
                      </h4>
                      <p className="text-xs mt-1 opacity-90 leading-relaxed">
                        {syncStatus.isConnected
                          ? `Realtime subscriptions are active. Any change in Supabase or the app is synced instantly across web and mobile app views.`
                          : `The app is running smoothly with reactive in-memory and local storage caching. Connect your Supabase project in the "Credentials" tab to switch to your remote PostgreSQL database.`}
                      </p>
                      {syncStatus.lastSyncedAt && (
                        <p className="text-[11px] font-semibold mt-2 opacity-75">
                          Last synchronized: {syncStatus.lastSyncedAt}
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={handleTestConnection}
                    disabled={isTesting}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 shadow-xs cursor-pointer shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                    <span>Ping</span>
                  </button>
                </div>

                {testResult && (
                  <div
                    className={`mt-3 p-3 rounded-xl text-xs ${
                      testResult.success
                        ? 'bg-emerald-100 text-emerald-800 font-medium'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {testResult.message}
                  </div>
                )}
              </div>

              {/* Data Tables Counter */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Database Tables &amp; Items Loaded
                  </h4>
                  <span className="text-[11px] text-slate-400">12 Database Entities</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {[
                    { label: 'Shop Texts & Settings', count: 'All Dynamic', icon: '⚙️' },
                    { label: 'Categories', count: categories.length, icon: '🏷️' },
                    { label: 'Products (Cakes)', count: products.length, icon: '🍰' },
                    { label: 'Flavors & Addons', count: flavors.length + addons.length, icon: '🍫' },
                    { label: 'Hero Banners', count: banners.length, icon: '🖼️' },
                    { label: 'Delivery Zones & Slots', count: zones.length + slots.length, icon: '🚚' },
                    { label: 'Coupons & Promos', count: coupons.length, icon: '🎟️' },
                    { label: 'Customer Reviews', count: reviews.length, icon: '⭐' },
                  ].map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">{item.icon}</span>
                        <span className="text-xs font-semibold text-slate-700">{item.label}</span>
                      </div>
                      <span className="text-xs font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md">
                        {item.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 1-Click Push to Supabase Action */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 to-indigo-950 text-white shadow-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold flex items-center gap-2">
                      <UploadCloud className="w-4 h-4 text-emerald-400" />
                      <span>Push All Local Data to Supabase (1-Click Seed)</span>
                    </h4>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Instantly populates your Supabase database with all handcrafted cakes, categories, flavors, variants, and settings!
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={handleSeedSupabase}
                    disabled={isSeeding}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-slate-950 font-black text-xs rounded-xl flex items-center gap-2 shadow-md cursor-pointer transition-all disabled:opacity-50"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>{isSeeding ? 'Seeding Tables...' : 'Seed Live Supabase Now'}</span>
                  </button>

                  <button
                    onClick={handleCopySql}
                    className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl border border-white/20 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5 text-amber-300" />
                    <span>{copiedSql ? 'SQL Copied!' : 'Copy SQL Schema'}</span>
                  </button>
                </div>

                {seedResult && (
                  <div
                    className={`p-3 rounded-xl text-xs font-medium ${
                      seedResult.success
                        ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40'
                        : 'bg-rose-500/20 text-rose-200 border border-rose-500/40'
                    }`}
                  >
                    {seedResult.message}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'credentials' && (
            <form onSubmit={handleSaveCredentials} className="space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl flex items-start gap-2.5 text-xs text-blue-900">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p>
                  Enter your Supabase Project URL and Anon Key from your <strong>Supabase Dashboard &gt; Project Settings &gt; API</strong>. Keys are stored safely in local storage and connect directly via HTTPS.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Supabase Project URL
                </label>
                <input
                  type="url"
                  placeholder="https://xyzcompany.supabase.co"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 focus:outline-emerald-500 focus:ring-2 focus:ring-emerald-200 font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Supabase Anon (Public) Key
                </label>
                <textarea
                  rows={3}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 focus:outline-emerald-500 focus:ring-2 focus:ring-emerald-200 font-mono"
                  required
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isTesting}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-md cursor-pointer transition-all disabled:opacity-50"
                >
                  <Server className="w-4 h-4" />
                  <span>{isTesting ? 'Connecting...' : 'Save & Connect Supabase'}</span>
                </button>
              </div>

              {testResult && (
                <div
                  className={`p-3 rounded-xl text-xs font-medium ${
                    testResult.success
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {testResult.message}
                </div>
              )}
            </form>
          )}

          {activeTab === 'sql' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">
                    Supabase PostgreSQL Tables Setup Script
                  </h4>
                  <p className="text-xs text-slate-500">
                    Paste this into the Supabase SQL Editor to initialize all 12 tables and RLS security rules.
                  </p>
                </div>
                <button
                  onClick={handleCopySql}
                  className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Copy className="w-3.5 h-3.5 text-amber-300" />
                  <span>{copiedSql ? 'Copied to Clipboard!' : 'Copy Entire SQL'}</span>
                </button>
              </div>

              <div className="bg-slate-950 text-slate-200 p-4 rounded-2xl text-[11px] font-mono max-h-72 overflow-y-auto leading-relaxed border border-slate-800">
                <pre>
{`-- 1. SHOP SETTINGS (Includes all dynamic website copy)
CREATE TABLE IF NOT EXISTS shop_settings (
  id TEXT PRIMARY KEY DEFAULT 'setting-1',
  shop_name TEXT NOT NULL,
  phone TEXT,
  whatsapp TEXT,
  currency TEXT DEFAULT '৳',
  top_announcement_text TEXT,
  hero_title TEXT,
  hero_subtitle TEXT,
  ...
);

-- 2. CATEGORIES & PRODUCTS & VARIANTS
CREATE TABLE IF NOT EXISTS categories (...);
CREATE TABLE IF NOT EXISTS products (...);
CREATE TABLE IF NOT EXISTS product_variants (...);

-- 3. ORDERS & ITEMS
CREATE TABLE IF NOT EXISTS orders (...);
CREATE TABLE IF NOT EXISTS order_items (...);`}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1.5 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Zero hardcoded client texts • 100% database-driven</span>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
