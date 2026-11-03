import {formatShortOrderNumber} from '../../utils/orderUtils';
import React, { useState, useMemo } from 'react';
import {
  ChefHat,
  Clock,
  CheckCircle,
  AlertCircle,
  Play,
  Check,
  Search,
  Plus,
  Flame,
  Scale,
  Sparkles,
  Timer,
  User,
  Layers,
} from 'lucide-react';
import type { Order, ProductionJob, Recipe } from '../../types';

interface KitchenProductionModuleProps {
  orders: Order[];
  currency: string;
  staffName: string;
  onUpdateOrderStatus?: (orderId: string, status: Order['status']) => void;
}

const INITIAL_RECIPES: Recipe[] = [
  { id: 'rec-1', product_id: 'prod-vanilla', product_name: 'Vanilla Blossom Cake (1kg)', serves: 8, prep_time_minutes: 25, bake_time_minutes: 40, is_active: true, created_at: new Date().toISOString() },
  { id: 'rec-2', product_id: 'prod-chocolate', product_name: 'Belgian Chocolate Fudge (1kg)', serves: 8, prep_time_minutes: 30, bake_time_minutes: 45, is_active: true, created_at: new Date().toISOString() },
  { id: 'rec-3', product_id: 'prod-red-velvet', product_name: 'Red Velvet Royale (1kg)', serves: 8, prep_time_minutes: 30, bake_time_minutes: 40, is_active: true, created_at: new Date().toISOString() },
  { id: 'rec-4', product_id: 'prod-black-forest', product_name: 'Black Forest Dream (1kg)', serves: 8, prep_time_minutes: 35, bake_time_minutes: 45, is_active: true, created_at: new Date().toISOString() },
];

export const KitchenProductionModule: React.FC<KitchenProductionModuleProps> = ({
  orders,
  currency,
  staffName,
  onUpdateOrderStatus,
}) => {
  const [activeTab, setActiveTab] = useState<'queue' | 'recipes' | 'batch'>('queue');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'preparing' | 'ready'>('all');
  const [search, setSearch] = useState('');

  // Extract orders relevant to kitchen
  const kitchenOrders = useMemo(() => {
    return orders.filter(o => {
      const matchStatus = ['confirmed', 'preparing', 'ready'].includes(o.status);
      const matchSearch =
        o.order_number?.toLowerCase().includes(search.toLowerCase()) ||
        o.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
        o.items?.some(i => i.product_name.toLowerCase().includes(search.toLowerCase()));
      if (filterStatus === 'pending') return o.status === 'confirmed' && matchSearch;
      if (filterStatus === 'preparing') return o.status === 'preparing' && matchSearch;
      if (filterStatus === 'ready') return o.status === 'ready' && matchSearch;
      return matchStatus && matchSearch;
    });
  }, [orders, filterStatus, search]);

  const queueCount = orders.filter(o => o.status === 'confirmed').length;
  const inOvenCount = orders.filter(o => o.status === 'preparing').length;
  const readyCount = orders.filter(o => o.status === 'ready').length;

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-800 flex items-center gap-2">
            <ChefHat size={26} style={{ color: '#B77D80' }} />
            কিচেন ও প্রোডাকশন (Kitchen & Production)
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">কেক বেকিং কিউ, রেসিপি ও প্রোডাকশন ট্র্যাকিং</p>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-white rounded-xl border border-rose-100 p-1 gap-1 shadow-sm">
          <button
            onClick={() => setActiveTab('queue')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'queue' ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
            style={activeTab === 'queue' ? { background: '#B77D80' } : {}}
          >
            বেকিং কিউ ({kitchenOrders.length})
          </button>
          <button
            onClick={() => setActiveTab('recipes')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'recipes' ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
            style={activeTab === 'recipes' ? { background: '#B77D80' } : {}}
          >
            রেসিপি কার্ডস
          </button>
          <button
            onClick={() => setActiveTab('batch')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'batch' ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
            style={activeTab === 'batch' ? { background: '#B77D80' } : {}}
          >
            ব্যাচ প্রোডাকশন
          </button>
        </div>
      </div>

      {/* KPI Counters */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-800">অপেক্ষমাণ (To Bake)</span>
            <Clock size={18} className="text-amber-600" />
          </div>
          <p className="text-3xl font-black text-amber-900 mt-2">{queueCount}</p>
          <p className="text-[11px] text-amber-700 mt-0.5">নতুন অর্ডার কিচেনে শুরু করুন</p>
        </div>

        <div className="bg-orange-50 rounded-2xl p-4 border border-orange-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-orange-800">ওভেনে বেকিং (In Oven)</span>
            <Flame size={18} className="text-orange-600" />
          </div>
          <p className="text-3xl font-black text-orange-900 mt-2">{inOvenCount}</p>
          <p className="text-[11px] text-orange-700 mt-0.5">বর্তমানে ওভেনে প্রস্তুত হচ্ছে</p>
        </div>

        <div className="bg-green-50 rounded-2xl p-4 border border-green-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-green-800">প্রস্তুত (Ready for Pickup)</span>
            <CheckCircle size={18} className="text-green-600" />
          </div>
          <p className="text-3xl font-black text-green-900 mt-2">{readyCount}</p>
          <p className="text-[11px] text-green-700 mt-0.5">ডেলিভারির জন্য সম্পূর্ণ প্রস্তুত</p>
        </div>
      </div>

      {activeTab === 'queue' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="অর্ডার বা কেকের নাম খুঁজুন..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400"
                />
              </div>
            </div>

            <div className="flex gap-1">
              {(['all', 'pending', 'preparing', 'ready'] as const).map(st => (
                <button
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    filterStatus === st ? 'bg-gray-800 text-white shadow-xs' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {st === 'all' ? 'সব' : st === 'pending' ? 'অপেক্ষমাণ' : st === 'preparing' ? 'ওভেনে' : 'প্রস্তুত'}
                </button>
              ))}
            </div>
          </div>

          {/* Kanban / Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {kitchenOrders.map(order => (
              <div
                key={order.id}
                className={`bg-white rounded-2xl p-4 border-2 shadow-sm space-y-3 transition-all ${
                  order.status === 'preparing'
                    ? 'border-orange-300 ring-2 ring-orange-100'
                    : order.status === 'ready'
                    ? 'border-green-300 bg-green-50/20'
                    : 'border-gray-100'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono text-xs font-bold text-gray-600">
                      #{formatShortOrderNumber(order.order_number)}
                    </span>
                    <h3 className="font-bold text-gray-800 text-sm mt-0.5">{order.customer_name}</h3>
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    order.status === 'preparing'
                      ? 'bg-orange-100 text-orange-800'
                      : order.status === 'ready'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    {order.status === 'preparing' ? '🔥 ওভেনে বেকিং' : order.status === 'ready' ? '✅ প্রস্তুত' : '⏳ নতুন অর্ডার'}
                  </span>
                </div>

                {/* Items */}
                <div className="space-y-2 bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                  {order.items?.map((item, idx) => (
                    <div key={idx} className="text-xs">
                      <div className="flex justify-between font-bold text-gray-800">
                        <span>{item.product_name}</span>
                        <span className="text-rose-600 font-extrabold">×{item.quantity}</span>
                      </div>
                      <div className="text-[11px] text-gray-500 flex gap-2 mt-0.5">
                        {item.variant_name && <span>ওজন: {item.variant_name}</span>}
                        {item.flavor_name && <span>• ফ্লেভার: {item.flavor_name}</span>}
                      </div>
                      {item.writing_message && (
                        <div className="mt-1 text-[11px] bg-amber-50 text-amber-900 border border-amber-200 px-2 py-1 rounded-lg">
                          ✍️ <span className="font-bold">কেকের লেখা:</span> "{item.writing_message}"
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Order Details */}
                <div className="flex items-center justify-between text-xs text-gray-500 pt-1 border-t border-gray-100">
                  <div className="flex items-center gap-1">
                    <Clock size={13} className="text-gray-400" />
                    <span>ডেলিভারি: {order.delivery_date} ({order.delivery_slot || 'Normal'})</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-2 flex gap-2">
                  {order.status === 'confirmed' && (
                    <button
                      onClick={() => onUpdateOrderStatus?.(order.id, 'preparing')}
                      className="flex-1 py-2 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
                      style={{ background: 'linear-gradient(135deg, #F97316, #EA580C)' }}
                    >
                      <Play size={14} />
                      বেকিং শুরু করুন (Start Baking)
                    </button>
                  )}
                  {order.status === 'preparing' && (
                    <button
                      onClick={() => onUpdateOrderStatus?.(order.id, 'ready')}
                      className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-green-600 hover:bg-green-700 flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
                    >
                      <Check size={14} />
                      প্রস্তুত মার্ক করুন (Mark Ready)
                    </button>
                  )}
                  {order.status === 'ready' && (
                    <div className="w-full py-2 rounded-xl text-xs font-bold text-green-700 bg-green-50 border border-green-200 text-center">
                      ✓ প্রস্তুত — ডেলিভারি বা পিকআপের অপেক্ষায়
                    </div>
                  )}
                </div>
              </div>
            ))}

            {kitchenOrders.length === 0 && (
              <div className="col-span-full bg-white rounded-2xl p-12 text-center text-gray-400 border border-gray-100">
                <ChefHat size={44} className="mx-auto mb-3 opacity-40" />
                <p className="text-base font-bold text-gray-600">বর্তমানে কোনো কিচেন অর্ডার নেই</p>
                <p className="text-xs text-gray-400 mt-1">নতুন অর্ডার কনফার্ম হলে এখানে স্বয়ংক্রিয়ভাবে প্রদর্শিত হবে</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'recipes' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {INITIAL_RECIPES.map(rec => (
            <div key={rec.id} className="bg-white rounded-2xl p-5 border border-rose-100 shadow-sm space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-gray-800 text-base">{rec.product_name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">সার্ভিং: {rec.serves} জন</p>
                </div>
                <span className="text-xs font-bold bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full">
                  রেসিপি # {rec.id}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 p-3 rounded-xl border border-gray-100">
                <div>
                  <span className="text-gray-400 block">প্রস্তুতির সময়</span>
                  <span className="font-bold text-gray-800">{rec.prep_time_minutes} মিনিট</span>
                </div>
                <div>
                  <span className="text-gray-400 block">বেকিং সময়</span>
                  <span className="font-bold text-gray-800">{rec.bake_time_minutes} মিনিট (১৭৫° সে.)</span>
                </div>
              </div>

              <div className="space-y-1.5 text-xs text-gray-600">
                <p className="font-bold text-gray-700">উপকরণ (১ কেজি ব্যাচ):</p>
                <ul className="list-disc pl-4 space-y-0.5 text-gray-500">
                  <li>ময়দা: ২৫০ গ্রাম</li>
                  <li>চিনি: ২০০ গ্রাম</li>
                  <li>ডিম: ৪ টি</li>
                  <li>বাটার / তেল: ১০০ গ্রাম</li>
                  <li>হুইপিং ক্রিম: ৩০০ গ্রাম</li>
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'batch' && (
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-gray-800">দৈনিক ব্যাচ প্রোডাকশন প্ল্যান (Batch Production)</h2>
          <p className="text-xs text-gray-500">
            একসাথে একাধিক কেক বেক করে সময় ও খরচ সাশ্রয় করুন।
          </p>

          <div className="border border-gray-200 rounded-xl overflow-hidden text-xs">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">ব্যাচ নাম</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">কেকের ধরন</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">পরিমাণ</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">ওভেনের স্লট</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">স্ট্যাটাস</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="px-4 py-3 font-bold text-gray-800">Batch-A1</td>
                  <td className="px-4 py-3">Vanilla Sponge (1kg × 4)</td>
                  <td className="px-4 py-3 font-bold text-rose-600">৪ টি</td>
                  <td className="px-4 py-3">সকাল ১০:০০ - ১০:৪৫</td>
                  <td className="px-4 py-3"><span className="bg-green-100 text-green-800 font-bold px-2 py-0.5 rounded-full text-[10px]">সম্পন্ন</span></td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="px-4 py-3 font-bold text-gray-800">Batch-B2</td>
                  <td className="px-4 py-3">Chocolate Fudge Base (1kg × 3)</td>
                  <td className="px-4 py-3 font-bold text-rose-600">৩ টি</td>
                  <td className="px-4 py-3">দুপুর ১২:০০ - ১২:৫০</td>
                  <td className="px-4 py-3"><span className="bg-orange-100 text-orange-800 font-bold px-2 py-0.5 rounded-full text-[10px]">ওভেনে বেকিং</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
