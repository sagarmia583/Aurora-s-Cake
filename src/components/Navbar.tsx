import React from 'react';
import { 
  ShoppingBag, 
  Phone, 
  Clock, 
  ShieldCheck, 
  Zap, 
  Database, 
  User, 
  Search,
  Sparkles,
  Smartphone,
  Globe
} from 'lucide-react';
import { ShopSettings, StaffRole } from '../types';

export type ViewMode = 'web' | 'mobile_app';

interface NavbarProps {
  settings: ShopSettings;
  activeRole: StaffRole | 'customer';
  onRoleChange: (role: StaffRole | 'customer') => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  cartCount: number;
  onOpenCart: () => void;
  onOpenProfile: () => void;
  onOpenCacheHub: () => void;
  onOpenDbViewer: () => void;
  onOpenSupabaseSync: () => void;
  isSupabaseConnected: boolean;
  onOpenTrackOrder: () => void;
  onOpenCustomCake: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  settings,
  activeRole,
  onRoleChange,
  viewMode,
  onViewModeChange,
  cartCount,
  onOpenCart,
  onOpenProfile,
  onOpenCacheHub,
  onOpenDbViewer,
  onOpenSupabaseSync,
  isSupabaseConnected,
  onOpenTrackOrder,
  onOpenCustomCake,
  searchQuery,
  onSearchChange,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md shadow-xs border-b border-rose-100">
      {/* Top Announcement Bar */}
      <div className="bg-gradient-to-r from-rose-600 via-pink-600 to-amber-600 text-white text-xs py-1.5 px-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1 font-medium">
              <Phone className="w-3.5 h-3.5" />
              {settings.phone}
            </span>
            <span className="hidden sm:flex items-center gap-1 opacity-90">
              <Clock className="w-3.5 h-3.5" />
              Daily: {settings.opening_time} - {settings.closing_time}
            </span>
            <span className="hidden md:inline-block bg-white/20 px-2 py-0.5 rounded-full text-[11px] font-semibold">
              {settings.top_announcement_text || '🚀 3-Hour Express Delivery in Tangail'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenCustomCake}
              className="flex items-center gap-1 font-semibold hover:underline bg-white/20 hover:bg-white/30 px-2.5 py-0.5 rounded-full transition-colors cursor-pointer text-[11px]"
            >
              <Sparkles className="w-3 h-3 text-amber-200" />
              <span>Custom Cake Studio</span>
            </button>

            {/* Supabase Database Live Status Trigger */}
            <button
              onClick={onOpenSupabaseSync}
              className={`flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-md transition-colors cursor-pointer ${
                isSupabaseConnected
                  ? 'bg-emerald-700/80 hover:bg-emerald-800 text-emerald-100'
                  : 'bg-amber-600/80 hover:bg-amber-700 text-amber-100'
              }`}
              title="Manage Supabase PostgreSQL Connection & Live Sync"
            >
              <Database className="w-3 h-3" />
              <span>Supabase:</span>
              <span className="underline">{isSupabaseConnected ? 'Live Synced' : 'Connect'}</span>
            </button>

            <button
              onClick={onOpenCacheHub}
              className="hidden lg:flex items-center gap-1 text-[11px] bg-slate-800 hover:bg-slate-900 text-white px-2 py-0.5 rounded-md transition-colors cursor-pointer"
              title="Inspect SWR Caching & Performance Metrics"
            >
              <Zap className="w-3 h-3 text-amber-300" />
              <span>SWR Cache</span>
            </button>

            <button
              onClick={onOpenDbViewer}
              className="hidden lg:flex items-center gap-1 text-[11px] bg-slate-800 hover:bg-slate-900 text-white px-2 py-0.5 rounded-md transition-colors cursor-pointer"
              title="Inspect Supabase SQL Migrations & RLS"
            >
              <span>SQL</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
        {/* Brand Logo & Name */}
        <div 
          onClick={() => {
            onRoleChange('customer');
            onViewModeChange('web');
          }}
          className="flex items-center gap-3 cursor-pointer group shrink-0"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-500 flex items-center justify-center text-white shadow-md shadow-rose-200 group-hover:scale-105 transition-transform overflow-hidden">
            <span className="text-xl">🍰</span>
          </div>
          <div>
            <h1 className="font-bold text-base sm:text-lg text-slate-800 leading-tight group-hover:text-rose-600 transition-colors">
              {settings.shop_name}
            </h1>
            <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium">
              Handcrafted Celebration Cakes &amp; Patisserie
            </p>
          </div>
        </div>

        {/* View Mode Toggle: Website vs Mobile App */}
        <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200 shrink-0">
          <button
            onClick={() => onViewModeChange('web')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'web'
                ? 'bg-white text-rose-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Website</span>
          </button>
          <button
            onClick={() => onViewModeChange('mobile_app')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'mobile_app'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Mobile App</span>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          </button>
        </div>

        {/* Search Bar (Desktop Web Mode) */}
        {viewMode === 'web' && (
          <div className="hidden lg:flex flex-1 max-w-sm mx-2 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search chocolate, red velvet, anniversary cake..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white text-xs rounded-full border border-slate-200 focus:outline-rose-500 focus:ring-2 focus:ring-rose-100 transition-all text-slate-700"
            />
          </div>
        )}

        {/* Right Actions & Persona Switcher */}
        <div className="flex items-center gap-2">
          {/* Persona selector (Web view) */}
          {viewMode === 'web' && (
            <div className="hidden sm:flex items-center bg-slate-100 p-1 rounded-xl text-xs font-medium border border-slate-200">
              <span className="px-2 text-slate-500 text-[11px] uppercase tracking-wider font-semibold">
                Role:
              </span>
              <select
                value={activeRole}
                onChange={(e) => onRoleChange(e.target.value as StaffRole | 'customer')}
                className="bg-white border-0 py-1 px-2 rounded-lg text-slate-800 font-semibold focus:ring-2 focus:ring-rose-400 cursor-pointer shadow-xs text-xs"
              >
                <option value="customer">🛍️ Customer Web</option>
                <option value="super_admin">👑 Super Admin</option>
                <option value="kitchen_manager">👨‍🍳 Kitchen KDS</option>
                <option value="delivery_man">🛵 Delivery Rider</option>
                <option value="order_manager">📋 Order Manager</option>
              </select>
            </div>
          )}

          {/* Customer Orders & Profile + Tracker (Web view) */}
          {viewMode === 'web' && activeRole === 'customer' && (
            <>
              <button
                onClick={onOpenProfile}
                className="hidden md:flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                title="Customer Profile & Order History"
              >
                <User className="w-3.5 h-3.5 text-rose-600" />
                <span>Orders</span>
              </button>

              <button
                onClick={onOpenTrackOrder}
                className="hidden md:flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Track</span>
              </button>
            </>
          )}

          {/* Cart Trigger */}
          <button
            onClick={onOpenCart}
            className="relative flex items-center gap-2 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white px-3.5 py-2 rounded-xl font-semibold text-xs sm:text-sm shadow-md shadow-rose-200 transition-all cursor-pointer"
          >
            <ShoppingBag className="w-4 h-4" />
            <span className="hidden sm:inline">Cart</span>
            {cartCount > 0 && (
              <span className="bg-amber-400 text-slate-900 text-xs font-bold px-1.5 py-0.5 rounded-full min-w-5 text-center">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Role Notice Banner if in staff mode on web */}
      {viewMode === 'web' && activeRole !== 'customer' && (
        <div className="bg-amber-50 border-t border-amber-200 px-4 py-1.5 text-xs text-amber-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-600" />
            <span>
              Web View: Operating as <strong className="uppercase">{activeRole.replace('_', ' ')}</strong>.
            </span>
          </div>
          <button
            onClick={() => onRoleChange('customer')}
            className="text-xs text-amber-700 font-bold hover:underline cursor-pointer"
          >
            Switch to Customer Storefront ➔
          </button>
        </div>
      )}
    </header>
  );
};
