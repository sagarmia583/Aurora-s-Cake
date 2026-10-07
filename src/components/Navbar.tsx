import React from 'react';
import { 
  ShoppingBag, 
  Phone, 
  Clock, 
  ShieldCheck, 
  Zap, 
  Database, 
  ChefHat, 
  Bike, 
  LayoutDashboard, 
  User, 
  Search,
  Sparkles
} from 'lucide-react';
import { ShopSettings, StaffRole } from '../types';

interface NavbarProps {
  settings: ShopSettings;
  activeRole: StaffRole | 'customer';
  onRoleChange: (role: StaffRole | 'customer') => void;
  cartCount: number;
  onOpenCart: () => void;
  onOpenProfile: () => void;
  onOpenCacheHub: () => void;
  onOpenDbViewer: () => void;
  onOpenTrackOrder: () => void;
  onOpenCustomCake: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  settings,
  activeRole,
  onRoleChange,
  cartCount,
  onOpenCart,
  onOpenProfile,
  onOpenCacheHub,
  onOpenDbViewer,
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
              🚀 3-Hour Express Delivery in Tangail
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onOpenCustomCake}
              className="flex items-center gap-1 font-semibold hover:underline bg-white/20 hover:bg-white/30 px-2.5 py-0.5 rounded-full transition-colors cursor-pointer"
            >
              <Sparkles className="w-3 h-3 text-amber-200" />
              Custom Cake Request
            </button>
            <button
              onClick={onOpenCacheHub}
              className="flex items-center gap-1 text-[11px] bg-emerald-700/70 hover:bg-emerald-700 text-white px-2 py-0.5 rounded-md transition-colors cursor-pointer"
              title="Inspect SWR Caching & Performance Metrics"
            >
              <Zap className="w-3 h-3 text-amber-300" />
              <span className="hidden sm:inline">Cache SWR:</span> Active
            </button>
            <button
              onClick={onOpenDbViewer}
              className="flex items-center gap-1 text-[11px] bg-slate-800 hover:bg-slate-900 text-white px-2 py-0.5 rounded-md transition-colors cursor-pointer"
              title="Inspect Supabase SQL Migrations & RLS"
            >
              <Database className="w-3 h-3 text-sky-400" />
              <span className="hidden sm:inline">Supabase</span> SQL
            </button>
          </div>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        {/* Brand Logo & Name */}
        <div 
          onClick={() => onRoleChange('customer')}
          className="flex items-center gap-3 cursor-pointer group"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-500 flex items-center justify-center text-white shadow-md shadow-rose-200 group-hover:scale-105 transition-transform overflow-hidden">
            <span className="text-xl">🍰</span>
          </div>
          <div>
            <h1 className="font-bold text-lg text-slate-800 leading-tight group-hover:text-rose-600 transition-colors">
              {settings.shop_name}
            </h1>
            <p className="text-[11px] text-slate-500 font-medium">
              Handcrafted Celebration Cakes & Patisserie
            </p>
          </div>
        </div>

        {/* Search Bar (Desktop) */}
        <div className="hidden lg:flex flex-1 max-w-md mx-4 relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search chocolate, red velvet, anniversary cake..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white text-sm rounded-full border border-slate-200 focus:outline-rose-500 focus:ring-2 focus:ring-rose-100 transition-all text-slate-700"
          />
        </div>

        {/* Persona / Role Switcher for Production Testing */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-medium border border-slate-200">
            <span className="px-2 text-slate-500 hidden sm:inline text-[11px] uppercase tracking-wider font-semibold">
              Role:
            </span>
            <select
              value={activeRole}
              onChange={(e) => onRoleChange(e.target.value as StaffRole | 'customer')}
              className="bg-white border-0 py-1 px-2.5 rounded-lg text-slate-800 font-semibold focus:ring-2 focus:ring-rose-400 cursor-pointer shadow-xs"
            >
              <option value="customer">🛍️ Customer View</option>
              <option value="super_admin">👑 Super Admin</option>
              <option value="kitchen_manager">👨‍🍳 Kitchen Manager (KDS)</option>
              <option value="delivery_man">🛵 Delivery Rider</option>
              <option value="order_manager">📋 Order Manager</option>
            </select>
          </div>

          {/* Customer Orders & Profile + Tracker */}
          {activeRole === 'customer' && (
            <>
              <button
                onClick={onOpenProfile}
                className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                title="Customer Profile & Order History"
              >
                <User className="w-3.5 h-3.5 text-rose-600" />
                <span>Orders &amp; Profile</span>
              </button>

              <button
                onClick={onOpenTrackOrder}
                className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5" />
                Track Order
              </button>
            </>
          )}

          {/* Cart Trigger */}
          <button
            onClick={onOpenCart}
            className="relative flex items-center gap-2 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white px-4 py-2 rounded-xl font-semibold text-sm shadow-md shadow-rose-200 transition-all cursor-pointer"
          >
            <ShoppingBag className="w-4 h-4" />
            <span className="hidden sm:inline">Cart</span>
            {cartCount > 0 && (
              <span className="bg-amber-400 text-slate-900 text-xs font-bold px-1.5 py-0.5 rounded-full min-w-5 text-center animate-pulse">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Role Notice Banner if in staff mode */}
      {activeRole !== 'customer' && (
        <div className="bg-amber-50 border-t border-amber-200 px-4 py-1.5 text-xs text-amber-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-600" />
            <span>
              Operating as <strong className="uppercase">{activeRole.replace('_', ' ')}</strong>. Access permissions enforced via Supabase RBAC schema.
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
