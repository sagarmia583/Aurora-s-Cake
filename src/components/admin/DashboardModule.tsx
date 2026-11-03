import {formatShortOrderNumber} from '../../utils/orderUtils';
import React, { useState, useEffect, useMemo } from 'react';
import {
  ShoppingBag,
  TrendingUp,
  DollarSign,
  Clock,
  AlertTriangle,
  CheckCircle,
  Truck,
  ChefHat,
  Users,
  Package,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Calendar,
} from 'lucide-react';
import type { Order, Product } from '../../types';

type DateFilter = 'today' | 'week' | 'month' | 'custom';

interface DashboardModuleProps {
  orders: Order[];
  products: Product[];
  currency: string;
  onRefresh?: () => void;
  isLoading?: boolean;
  role: string;
}

interface KpiCardProps {
  title: string;
  bangla: string;
  value: string;
  subValue?: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
}

const KpiCard: React.FC<KpiCardProps> = ({
  title, bangla, value, subValue, icon, color, bgColor, trend, trendValue
}) => (
  <div className="bg-white rounded-2xl p-5 shadow-sm border border-rose-50 hover:shadow-md transition-shadow">
    <div className="flex items-start justify-between mb-3">
      <div>
        <p className="text-xs text-gray-500 font-medium">{title}</p>
        <p className="text-[10px] text-gray-400">{bangla}</p>
      </div>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bgColor}`}>
        <span className={color}>{icon}</span>
      </div>
    </div>
    <div className="flex items-end justify-between">
      <div>
        <p className="text-2xl font-bold text-gray-800 leading-tight">{value}</p>
        {subValue && <p className="text-xs text-gray-500 mt-0.5">{subValue}</p>}
      </div>
      {trend && trendValue && (
        <div className={`flex items-center gap-1 text-xs font-medium ${trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-500' : 'text-gray-400'}`}>
          {trend === 'up' ? <ArrowUpRight size={14} /> : trend === 'down' ? <ArrowDownRight size={14} /> : null}
          {trendValue}
        </div>
      )}
    </div>
  </div>
);

function fmt(amount: number, currency = '৳') {
  if (amount >= 100000) return `${currency}${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `${currency}${(amount / 1000).toFixed(1)}K`;
  return `${currency}${amount.toLocaleString('en-BD')}`;
}

function filterOrdersByDate(orders: Order[], filter: DateFilter, customFrom?: string, customTo?: string): Order[] {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  return orders.filter(o => {
    const d = o.created_at?.slice(0, 10) || '';
    if (filter === 'today') return d === today;
    if (filter === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
      return d >= weekAgo && d <= today;
    }
    if (filter === 'month') {
      const monthAgo = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
      return d >= monthAgo && d <= today;
    }
    if (filter === 'custom' && customFrom && customTo) {
      return d >= customFrom && d <= customTo;
    }
    return true;
  });
}

export const DashboardModule: React.FC<DashboardModuleProps> = ({
  orders,
  products,
  currency,
  onRefresh,
  isLoading = false,
  role,
}) => {
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const filteredOrders = useMemo(
    () => filterOrdersByDate(orders, dateFilter, customFrom, customTo),
    [orders, dateFilter, customFrom, customTo]
  );

  // KPI calculations
  const totalRevenue = filteredOrders
    .filter(o => o.status !== 'cancelled')
    .reduce((s, o) => s + (o.total_amount || 0), 0);

  const totalOrders = filteredOrders.filter(o => o.status !== 'cancelled').length;
  const pendingOrders = filteredOrders.filter(o => o.status === 'pending').length;
  const confirmedOrders = filteredOrders.filter(o => ['confirmed', 'preparing', 'ready'].includes(o.status)).length;
  const deliveredOrders = filteredOrders.filter(o => o.status === 'delivered').length;
  const cancelledOrders = filteredOrders.filter(o => o.status === 'cancelled').length;

  const totalDue = filteredOrders
    .filter(o => o.status !== 'cancelled')
    .reduce((s, o) => s + (o.due_amount || 0), 0);

  const totalAdvancePaid = filteredOrders
    .filter(o => o.status !== 'cancelled')
    .reduce((s, o) => s + (o.advance_paid_amount || 0), 0);

  const codPending = filteredOrders
    .filter(o => o.payment_method === 'cod' && !o.cod_collected && o.status !== 'cancelled')
    .reduce((s, o) => s + o.cod_amount, 0);

  const activeProducts = products.filter(p => p.is_active).length;
  const inactiveProducts = products.filter(p => !p.is_active).length;

  // Order status breakdown
  const outForDelivery = filteredOrders.filter(o => o.status === 'out_for_delivery').length;
  const inKitchen = filteredOrders.filter(o => ['confirmed', 'preparing'].includes(o.status)).length;
  const readyForPickup = filteredOrders.filter(o => o.status === 'ready').length;

  const timeGreeting = (() => {
    const h = now.getHours();
    if (h < 12) return 'শুভ সকাল';
    if (h < 17) return 'শুভ দুপুর';
    if (h < 20) return 'শুভ বিকেল';
    return 'শুভ সন্ধ্যা';
  })();

  const dateStr = now.toLocaleDateString('bn-BD', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-800">{timeGreeting}! 👋</h1>
          <p className="text-sm text-gray-500 mt-0.5">{dateStr}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date Filter Pills */}
          <div className="flex bg-white rounded-xl border border-rose-100 p-1 gap-1 shadow-sm">
            {(['today', 'week', 'month', 'custom'] as DateFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setDateFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  dateFilter === f
                    ? 'text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                style={dateFilter === f ? { background: '#B77D80' } : {}}
              >
                {f === 'today' ? 'আজ' : f === 'week' ? 'সপ্তাহ' : f === 'month' ? 'মাস' : 'কাস্টম'}
              </button>
            ))}
          </div>
          {dateFilter === 'custom' && (
            <div className="flex gap-2 items-center">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="text-xs border border-rose-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-rose-400" />
              <span className="text-gray-400 text-xs">—</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="text-xs border border-rose-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-rose-400" />
            </div>
          )}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-rose-100 rounded-xl text-xs font-medium text-gray-600 hover:bg-rose-50 transition-colors shadow-sm"
            >
              <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
              রিফ্রেশ
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards Row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Revenue"
          bangla="মোট আয়"
          value={fmt(totalRevenue, currency)}
          subValue={`${totalOrders} অর্ডার`}
          icon={<DollarSign size={20} />}
          color="text-emerald-600"
          bgColor="bg-emerald-50"
          trend="up"
          trendValue={`${deliveredOrders} delivered`}
        />
        <KpiCard
          title="Pending Orders"
          bangla="অপেক্ষমাণ অর্ডার"
          value={String(pendingOrders)}
          subValue={`${confirmedOrders} confirmed`}
          icon={<Clock size={20} />}
          color="text-amber-600"
          bgColor="bg-amber-50"
          trend={pendingOrders > 0 ? 'up' : 'neutral'}
          trendValue={pendingOrders > 0 ? `${pendingOrders} new` : 'All clear'}
        />
        <KpiCard
          title="Due Amount"
          bangla="বকেয়া টাকা"
          value={fmt(totalDue, currency)}
          subValue={`COD pending: ${fmt(codPending, currency)}`}
          icon={<AlertTriangle size={20} />}
          color="text-red-500"
          bgColor="bg-red-50"
        />
        <KpiCard
          title="Advance Collected"
          bangla="অগ্রিম সংগৃহীত"
          value={fmt(totalAdvancePaid, currency)}
          subValue={`${deliveredOrders} delivered`}
          icon={<CheckCircle size={20} />}
          color="text-blue-600"
          bgColor="bg-blue-50"
          trend="up"
        />
      </div>

      {/* Live Status Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-rose-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
              <ChefHat size={20} className="text-orange-500" />
            </div>
            <div>
              <p className="text-xs text-gray-500">কিচেনে</p>
              <p className="text-2xl font-bold text-gray-800">{inKitchen}</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">In Kitchen / Preparing</p>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-rose-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
              <CheckCircle size={20} className="text-green-500" />
            </div>
            <div>
              <p className="text-xs text-gray-500">প্রস্তুত</p>
              <p className="text-2xl font-bold text-gray-800">{readyForPickup}</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">Ready for Delivery</p>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-rose-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <Truck size={20} className="text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-gray-500">ডেলিভারিতে</p>
              <p className="text-2xl font-bold text-gray-800">{outForDelivery}</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">Out for Delivery</p>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-rose-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center">
              <Package size={20} className="text-gray-500" />
            </div>
            <div>
              <p className="text-xs text-gray-500">পণ্য</p>
              <p className="text-2xl font-bold text-gray-800">{activeProducts}</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">{inactiveProducts} inactive</p>
        </div>
      </div>

      {/* Recent Orders Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-rose-50 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
          <h2 className="font-semibold text-gray-800 text-sm">সাম্প্রতিক অর্ডার</h2>
          <span className="text-xs text-gray-400">Recent Orders</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">অর্ডার #</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">কাস্টমার</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">পরিমাণ</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">স্ট্যাটাস</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">পেমেন্ট</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">তারিখ</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.slice(0, 10).map((order) => (
                <tr key={order.id} className="border-t border-gray-50 hover:bg-rose-50/30 transition-colors">
                  <td className="px-5 py-3 font-mono text-xs text-gray-600">
                    #{formatShortOrderNumber(order.order_number)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800 text-xs">{order.customer_name}</div>
                    <div className="text-gray-400 text-[11px]">{order.customer_phone}</div>
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-800 text-xs">
                    {currency}{order.total_amount?.toLocaleString('en-BD')}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      order.payment_status === 'paid'
                        ? 'bg-green-50 text-green-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}>
                      {order.payment_status === 'paid' ? 'পেইড' : 'বাকি'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-[11px]">
                    {order.created_at ? new Date(order.created_at).toLocaleDateString('en-BD') : '—'}
                  </td>
                </tr>
              ))}
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-400 text-sm">
                    এই সময়ে কোনো অর্ডার নেই
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Order Status Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <SummaryCard title="সম্পন্ন" subtitle="Delivered" count={deliveredOrders} color="text-green-600" bg="bg-green-50" />
        <SummaryCard title="বাতিল" subtitle="Cancelled" count={cancelledOrders} color="text-red-500" bg="bg-red-50" />
        <SummaryCard title="মোট" subtitle="All Orders" count={filteredOrders.length} color="text-blue-600" bg="bg-blue-50" />
      </div>
    </div>
  );
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: 'অপেক্ষমাণ', cls: 'bg-amber-50 text-amber-700' },
    confirmed: { label: 'নিশ্চিত', cls: 'bg-blue-50 text-blue-700' },
    preparing: { label: 'তৈরি হচ্ছে', cls: 'bg-orange-50 text-orange-700' },
    ready: { label: 'প্রস্তুত', cls: 'bg-green-50 text-green-700' },
    assigned: { label: 'অ্যাসাইন্ড', cls: 'bg-purple-50 text-purple-700' },
    picked_up: { label: 'পিকআপ', cls: 'bg-indigo-50 text-indigo-700' },
    out_for_delivery: { label: 'ডেলিভারিতে', cls: 'bg-cyan-50 text-cyan-700' },
    delivered: { label: 'ডেলিভারি দেওয়া', cls: 'bg-emerald-50 text-emerald-700' },
    cancelled: { label: 'বাতিল', cls: 'bg-red-50 text-red-600' },
  };
  const s = map[status] || { label: status, cls: 'bg-gray-50 text-gray-600' };
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
};

const SummaryCard: React.FC<{ title: string; subtitle: string; count: number; color: string; bg: string }> = ({
  title, subtitle, count, color, bg,
}) => (
  <div className={`${bg} rounded-2xl p-4 text-center`}>
    <p className={`text-3xl font-bold ${color}`}>{count}</p>
    <p className="text-sm font-medium text-gray-700 mt-1">{title}</p>
    <p className="text-xs text-gray-500">{subtitle}</p>
  </div>
);
