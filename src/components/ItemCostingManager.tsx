import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calculator, 
  TrendingUp, 
  DollarSign, 
  Package, 
  Truck, 
  Flame, 
  Search, 
  Edit3, 
  Save, 
  X, 
  CheckCircle2, 
  AlertCircle,
  ArrowUpDown,
  ShoppingBag,
  Sparkles,
  PieChart,
  RefreshCw,
  Cloud
} from 'lucide-react';
import type { Product, Order } from '../types';
import { 
  getAllItemCostings, 
  getCostingSummary, 
  saveItemCosting, 
  calculateItemCosting,
  syncItemCostingsToSheet,
  fetchItemCostingsFromSheet,
  getLastCostingSyncTime,
  ItemCostingRecord,
  MinimalOrderRecord 
} from '../services/productCosting';

interface Props {
  products: Product[];
  orders?: MinimalOrderRecord[] | Order[] | any[];
  currency?: string;
  onProductCostingUpdated?: () => void;
  endpoint?: string;
  token?: string;
}

export const ItemCostingManager: React.FC<Props> = ({
  products,
  orders = [],
  currency = '৳',
  onProductCostingUpdated,
  endpoint,
  token,
}) => {
  const [costings, setCostings] = useState<ItemCostingRecord[]>(() => getAllItemCostings(products));
  const [searchQuery, setSearchQuery] = useState('');
  const [marginFilter, setMarginFilter] = useState<'all' | 'high' | 'moderate' | 'low'>('all');
  const [sortBy, setSortBy] = useState<'profit_desc' | 'margin_desc' | 'cost_desc' | 'name'>('profit_desc');

  // Sync with Google Sheets State
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(() => {
    const raw = getLastCostingSyncTime();
    return raw ? new Date(raw).toLocaleTimeString('bn-BD') : null;
  });

  // Edit Modal State
  const [editingItem, setEditingItem] = useState<ItemCostingRecord | null>(null);
  const [editIngredients, setEditIngredients] = useState<number>(0);
  const [editPackaging, setEditPackaging] = useState<number>(0);
  const [editDelivery, setEditDelivery] = useState<number>(0);
  const [editOther, setEditOther] = useState<number>(0);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Sync state when products change
  useEffect(() => {
    setCostings(getAllItemCostings(products));
  }, [products]);

  // Initial fetch from Google Sheet
  useEffect(() => {
    let isMounted = true;
    fetchItemCostingsFromSheet(endpoint, token).then((res) => {
      if (isMounted && res.success && res.costings && res.costings.length > 0) {
        setCostings(getAllItemCostings(products));
        onProductCostingUpdated?.();
        setLastSyncedTime(new Date().toLocaleTimeString('bn-BD'));
      }
    }).catch(() => {});
    return () => { isMounted = false; };
  }, [endpoint, token, products]);

  const summary = useMemo(() => {
    return getCostingSummary(products, orders);
  }, [products, orders, costings]);

  const handleSyncAllToSheet = async () => {
    setSyncStatus('syncing');
    setSyncFeedback(null);
    try {
      const allCostings = getAllItemCostings(products);
      const res = await syncItemCostingsToSheet(allCostings, endpoint, token);
      if (res.success) {
        setSyncStatus('synced');
        setSyncFeedback(`গুগল শিটের 'item_costings' ট্যাবে সফলভাবে ${res.count ?? allCostings.length}টি কেকের কস্টিং ও প্রফিট সিঙ্ক হয়েছে!`);
        setLastSyncedTime(new Date().toLocaleTimeString('bn-BD'));
        setTimeout(() => setSyncFeedback(null), 5000);
      } else {
        setSyncStatus('error');
        setSyncFeedback(`গুগল শিট সিঙ্ক ব্যর্থ হয়েছে: ${res.error || 'অজানা সমস্যা'}`);
      }
    } catch (err) {
      setSyncStatus('error');
      setSyncFeedback(err instanceof Error ? err.message : 'সিঙ্ক করার সময় সমস্যা দেখা দিয়েছে');
    }
  };

  const handleStartEdit = (item: ItemCostingRecord) => {
    setEditingItem(item);
    setEditIngredients(item.cost_ingredients);
    setEditPackaging(item.cost_packaging);
    setEditDelivery(item.cost_delivery);
    setEditOther(item.cost_other);
    setSaveSuccessMsg(null);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    const targetProduct = products.find(p => p.id === editingItem.product_id) || {
      id: editingItem.product_id,
      name: editingItem.product_name,
      base_price: editingItem.base_price,
      category_id: '',
      slug: '',
      description: '',
      image_url: editingItem.image_url,
      gallery_images: [],
      is_featured: false,
      is_active: true,
      rating: 5,
      review_count: 0,
      variants: [],
      allowed_flavor_ids: [],
      allowed_addon_ids: [],
    };

    const fullRecord = calculateItemCosting(targetProduct, {
      cost_ingredients: Number(editIngredients) || 0,
      cost_packaging: Number(editPackaging) || 0,
      cost_delivery: Number(editDelivery) || 0,
      cost_other: Number(editOther) || 0,
    });

    saveItemCosting({
      product_id: editingItem.product_id,
      cost_ingredients: Number(editIngredients) || 0,
      cost_packaging: Number(editPackaging) || 0,
      cost_delivery: Number(editDelivery) || 0,
      cost_other: Number(editOther) || 0,
    }, {
      endpoint,
      token,
      fullRecord,
    });

    // Update in-memory state
    const updatedList = getAllItemCostings(products);
    setCostings(updatedList);

    setSaveSuccessMsg(`"${editingItem.product_name}" এর কস্টিং ও প্রফিট গুগল শিটে সংরক্ষিত হয়েছে!`);
    setLastSyncedTime(new Date().toLocaleTimeString('bn-BD'));
    if (onProductCostingUpdated) {
      onProductCostingUpdated();
    }

    setTimeout(() => {
      setEditingItem(null);
      setSaveSuccessMsg(null);
    }, 1200);
  };

  // Live calculation for the edit modal
  const liveEditCalculations = useMemo(() => {
    if (!editingItem) return null;
    const totalCost = (Number(editIngredients) || 0) + (Number(editPackaging) || 0) + (Number(editDelivery) || 0) + (Number(editOther) || 0);
    const netProfit = editingItem.selling_price - totalCost;
    const margin = editingItem.selling_price > 0 ? Math.round(((netProfit / editingItem.selling_price) * 100) * 10) / 10 : 0;
    return { totalCost, netProfit, margin };
  }, [editingItem, editIngredients, editPackaging, editDelivery, editOther]);

  // Filter & Sort
  const filteredCostings = useMemo(() => {
    return costings
      .filter((item) => {
        const matchesSearch = item.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (item.category_name && item.category_name.toLowerCase().includes(searchQuery.toLowerCase()));

        if (!matchesSearch) return false;

        if (marginFilter === 'high') return item.profit_margin >= 40;
        if (marginFilter === 'moderate') return item.profit_margin >= 25 && item.profit_margin < 40;
        if (marginFilter === 'low') return item.profit_margin < 25;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'profit_desc') return b.net_profit - a.net_profit;
        if (sortBy === 'margin_desc') return b.profit_margin - a.profit_margin;
        if (sortBy === 'cost_desc') return b.total_cost - a.total_cost;
        if (sortBy === 'name') return a.product_name.localeCompare(b.product_name);
        return 0;
      });
  }, [costings, searchQuery, marginFilter, sortBy]);

  const getMarginBadge = (margin: number) => {
    if (margin >= 40) {
      return {
        bg: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        label: 'উচ্চ লাভ (High Margin)',
      };
    }
    if (margin >= 25) {
      return {
        bg: 'bg-sky-100 text-sky-800 border-sky-200',
        label: 'সুস্থ লাভ (Healthy Margin)',
      };
    }
    if (margin > 0) {
      return {
        bg: 'bg-amber-100 text-amber-800 border-amber-200',
        label: 'কম লাভ (Low Margin)',
      };
    }
    return {
      bg: 'bg-red-100 text-red-800 border-red-200',
      label: 'লোকসান (Loss)',
    };
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Title & Overview Banner */}
      <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-teal-950 text-white p-3.5 sm:p-6 rounded-2xl sm:rounded-3xl shadow-lg border border-emerald-800/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
              Bakery Costing &amp; Profit Engine
            </span>
            <h3 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <Calculator className="w-6 h-6 text-emerald-400" />
              <span>প্রতিটি আইটেমের সম্পূর্ণ কস্টিং ও প্রফিট হিসাব</span>
            </h3>
            <p className="text-xs text-emerald-100/80 max-w-xl">
              প্রতিটি কেকের বেকিং কাঁচামাল, প্যাকেজিং (বক্স ও বোর্ড), ডেলিভারি এবং ওভারহেড খরচ নির্ভুলভাবে ট্র্যাক করুন।
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/15 text-right shrink-0">
            <span className="text-[10px] font-bold text-emerald-200 uppercase tracking-wider block">
              অর্ডার থেকে মোট বিক্রয় লাভ
            </span>
            <span className="text-2xl font-black text-emerald-400">
              {currency}{summary.total_order_profit.toLocaleString()}
            </span>
            <span className="text-[11px] text-slate-300 block mt-0.5">
              মোট বিক্রয়: {currency}{summary.total_order_revenue.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Google Sheets Live Sync Bar */}
      <div className="bg-emerald-50/90 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Cloud className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-bold text-slate-800">গুগল শিট কস্টিং ও প্রফিট সিঙ্ক (Google Sheet Sync)</h4>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                syncStatus === 'synced' 
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
                  : syncStatus === 'syncing'
                  ? 'bg-blue-100 text-blue-800 border-blue-300 animate-pulse'
                  : syncStatus === 'error'
                  ? 'bg-red-100 text-red-800 border-red-300'
                  : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}>
                {syncStatus === 'synced' && 'গুগল শিটে সংরক্ষিত (Synced)'}
                {syncStatus === 'syncing' && 'সিঙ্ক হচ্ছে... (Syncing)'}
                {syncStatus === 'error' && 'সিঙ্ক ত্রুটি (Sync Error)'}
                {syncStatus === 'idle' && 'কানেক্টেড (Ready)'}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              সব কেকের উপকরণ খরচ, প্যাকেজিং, ডেলিভারি ও প্রফিট মার্জিন গুগল শিটের <span className="font-semibold text-emerald-800 underline decoration-dotted">item_costings</span> ট্যাবে সরাসরি সেভ থাকে।
              {lastSyncedTime && <span className="ml-2 text-slate-500 font-mono text-[11px]">• সর্বশেষ সিঙ্ক: {lastSyncedTime}</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          <button
            type="button"
            onClick={handleSyncAllToSheet}
            disabled={syncStatus === 'syncing'}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-xs cursor-pointer ${
              syncStatus === 'syncing'
                ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
            <span>{syncStatus === 'syncing' ? 'শিটে সেভ হচ্ছে...' : '📊 গুগল শিটে সেভ/সিঙ্ক করুন'}</span>
          </button>
        </div>
      </div>

      {syncFeedback && (
        <div className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 border ${
          syncStatus === 'error'
            ? 'bg-red-50 text-red-700 border-red-200'
            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
        }`}>
          {syncStatus === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />}
          <span>{syncFeedback}</span>
        </div>
      )}

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>ট্র্যাক করা কেক</span>
            <Package className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-xl font-black text-slate-800">{summary.total_items} টি</p>
          <span className="text-[10px] text-slate-400 block">মেনুর সব কেক সক্রিয়</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>গড় মোট খরচ</span>
            <Flame className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-xl font-black text-amber-700">{currency}{summary.avg_total_cost}</p>
          <span className="text-[10px] text-slate-400 block">উপকরণ + প্যাকিং + ডেলিভারি</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>কেক প্রতি গড় লাভ</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-xl font-black text-emerald-700">{currency}{summary.avg_net_profit}</p>
          <span className="text-[10px] text-emerald-600 font-bold block">প্রতি কেকের নিট লাভ</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>গড় প্রফিট মার্জিন</span>
            <TrendingUp className="w-4 h-4 text-teal-600" />
          </div>
          <p className="text-xl font-black text-teal-700">{summary.avg_profit_margin}%</p>
          <span className="text-[10px] text-teal-600 font-bold block">লাভের শতকরা হার</span>
        </div>
      </div>

      {/* Filter, Search & Sort Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="কেকের নাম দিয়ে খুঁজুন (Search by cake name)..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-emerald-500 text-slate-800"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Margin Filter */}
          <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200 text-xs">
            {(['all', 'high', 'moderate', 'low'] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setMarginFilter(filter)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold capitalize transition-colors cursor-pointer ${
                  marginFilter === filter
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {filter === 'all' && 'সব মার্জিন'}
                {filter === 'high' && 'উচ্চ লাভ (>40%)'}
                {filter === 'moderate' && 'মধ্যম (25-40%)'}
                {filter === 'low' && 'কম (<25%)'}
              </button>
            ))}
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-emerald-500 cursor-pointer"
            >
              <option value="profit_desc">সর্বোচ্চ লাভ (Profit: High to Low)</option>
              <option value="margin_desc">সর্বোচ্চ মার্জিন % (Margin: High to Low)</option>
              <option value="cost_desc">বেশি খরচ (Cost: High to Low)</option>
              <option value="name">কেকের নাম (A to Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Costing Cards List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCostings.map((item) => {
          const badge = getMarginBadge(item.profit_margin);
          const hasDiscount = item.sale_price !== undefined && item.sale_price > 0 && item.sale_price < item.base_price;

          return (
            <div
              key={item.product_id}
              className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 hover:border-emerald-300 shadow-xs hover:shadow-md transition-all p-3.5 sm:p-5 space-y-4 flex flex-col justify-between"
            >
              {/* Card Header: Image, Title, Category, Selling Price */}
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <img
                    src={item.image_url}
                    alt={item.product_name}
                    className="w-16 h-16 rounded-2xl object-cover border border-slate-100 shadow-xs shrink-0"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/images/vanilla-cake.jpg'; }}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">
                      {item.category_name || 'Cake Collection'}
                    </span>
                    <h4 className="font-bold text-slate-900 text-sm truncate" title={item.product_name}>
                      {item.product_name}
                    </h4>

                    {/* Price and Margin Badge */}
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <div className="flex items-baseline gap-1">
                        <span className="text-base font-black text-slate-900">
                          {currency}{item.selling_price}
                        </span>
                        {hasDiscount && (
                          <span className="text-[11px] text-slate-400 line-through">
                            {currency}{item.base_price}
                          </span>
                        )}
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.bg}`}>
                        {item.profit_margin}% মার্জিন
                      </span>
                    </div>
                  </div>
                </div>

                {/* Cost Breakdown Grid */}
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80 space-y-2 text-xs">
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="flex items-center gap-1">
                        <span>🥣</span> উপকরণ খরচ:
                      </span>
                      <span className="font-bold text-slate-800">{currency}{item.cost_ingredients}</span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600">
                      <span className="flex items-center gap-1">
                        <span>📦</span> প্যাকেজিং:
                      </span>
                      <span className="font-bold text-slate-800">{currency}{item.cost_packaging}</span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600">
                      <span className="flex items-center gap-1">
                        <span>🚚</span> ডেলিভারি:
                      </span>
                      <span className="font-bold text-slate-800">{currency}{item.cost_delivery}</span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600">
                      <span className="flex items-center gap-1">
                        <span>⚡</span> ওভারহেড:
                      </span>
                      <span className="font-bold text-slate-800">{currency}{item.cost_other}</span>
                    </div>
                  </div>

                  {/* Summary Line: Total Cost vs Net Profit */}
                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between font-bold">
                    <div className="text-slate-500">
                      মোট খরচ: <span className="text-slate-900">{currency}{item.total_cost}</span>
                    </div>
                    <div className="text-emerald-700 flex items-center gap-1">
                      নিট লাভ: <span className="text-sm font-black">{currency}{item.net_profit}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Button: Edit Costing */}
              <button
                type="button"
                onClick={() => handleStartEdit(item)}
                className="w-full py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs rounded-xl border border-emerald-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>খরচের হিসাব পরিবর্তন করুন (Edit Costing)</span>
              </button>
            </div>
          );
        })}
      </div>

      {filteredCostings.length === 0 && (
        <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center space-y-2">
          <p className="text-slate-700 font-bold text-sm">কোনো কেক পাওয়া যায়নি</p>
          <p className="text-slate-400 text-xs">আপনার ফিল্টার বা সার্চ পরিবর্তন করে দেখুন।</p>
        </div>
      )}

      {/* EDIT COSTING MODAL */}
      {editingItem && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
          <div
            className="bg-white rounded-2xl sm:rounded-3xl max-w-lg w-full shadow-2xl border border-emerald-100 overflow-hidden space-y-4 sm:space-y-5 p-4 sm:p-6 animate-scale-in my-4 sm:my-8 max-h-[94vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 uppercase">
                  কেক কস্টিং ক্যালকুলেটর
                </span>
                <h4 className="text-lg font-black text-slate-900 mt-1">
                  {editingItem.product_name}
                </h4>
                <p className="text-xs text-slate-500">
                  বিক্রয় মূল্য: <strong>{currency}{editingItem.selling_price}</strong>
                </p>
              </div>

              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {saveSuccessMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{saveSuccessMsg}</span>
              </div>
            )}

            {/* Costing Form */}
            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Ingredients */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">
                    🥣 বেকিং উপকরণ খরচ ({currency})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={editIngredients}
                    onChange={(e) => setEditIngredients(Math.max(0, Number(e.target.value)))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-emerald-500 font-bold text-slate-900"
                    placeholder="ময়দা, ডিম, মাখন, চকলেট"
                  />
                  <span className="text-[10px] text-slate-400 block">ময়দা, ডিম, বাটার, চকলেট ও ক্রিম</span>
                </div>

                {/* 2. Packaging */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">
                    📦 প্যাকেজিং খরচ ({currency})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={editPackaging}
                    onChange={(e) => setEditPackaging(Math.max(0, Number(e.target.value)))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-emerald-500 font-bold text-slate-900"
                    placeholder="বক্স, বোর্ড, ছুরি, ক্যান্ডেল"
                  />
                  <span className="text-[10px] text-slate-400 block">বক্স, কেক বোর্ড, নাইফ ও ক্যান্ডেল</span>
                </div>

                {/* 3. Delivery */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">
                    🚚 ডেলিভারি / রাইডার ({currency})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={editDelivery}
                    onChange={(e) => setEditDelivery(Math.max(0, Number(e.target.value)))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-emerald-500 font-bold text-slate-900"
                    placeholder="ডেলিভারি হ্যান্ডলিং চার্জ"
                  />
                  <span className="text-[10px] text-slate-400 block">রাইডার ও পরিবহন হ্যান্ডলিং খরচ</span>
                </div>

                {/* 4. Overhead */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">
                    ⚡ অন্যান্য ওভারহেড ({currency})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={editOther}
                    onChange={(e) => setEditOther(Math.max(0, Number(e.target.value)))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-emerald-500 font-bold text-slate-900"
                    placeholder="গ্যাস, বিদ্যুৎ ও শ্রম"
                  />
                  <span className="text-[10px] text-slate-400 block">ওভেন গ্যাস, বিদ্যুৎ ও মেকিং খরচ</span>
                </div>
              </div>

              {/* Live Preview Calculation Box */}
              {liveEditCalculations && (
                <div className="bg-emerald-50/80 p-4 rounded-2xl border border-emerald-200 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 font-medium">মোট খরচের যোগফল (Total Cost):</span>
                    <span className="font-bold text-slate-900">{currency}{liveEditCalculations.totalCost}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 font-medium">নিট লাভ (Net Profit):</span>
                    <span className={`font-black text-sm ${liveEditCalculations.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {currency}{liveEditCalculations.netProfit}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-emerald-200">
                    <span className="text-slate-600 font-medium">প্রফিট মার্জিন (Profit Margin %):</span>
                    <span className="font-black text-emerald-800 bg-emerald-200/70 px-2 py-0.5 rounded-md">
                      {liveEditCalculations.margin}%
                    </span>
                  </div>
                </div>
              )}

              {/* Modal Buttons */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingItem(null)}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
                  >
                    বাতিল করুন (Cancel)
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Save className="w-4 h-4" />
                    <span>কস্টিং সংরক্ষণ করুন (Save Costing)</span>
                  </button>
                </div>
                <p className="text-[11px] text-center text-slate-500">
                  ⚡ সেভ করার সাথে সাথে লোকাল ডেটাবেস ও গুগল শিটের <span className="font-semibold text-emerald-700">item_costings</span> ট্যাবে স্বয়ংক্রিয়ভাবে সংরক্ষিত হবে।
                </p>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
