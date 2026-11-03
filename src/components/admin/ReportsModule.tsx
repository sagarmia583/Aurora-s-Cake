import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  TrendingUp,
  Download,
  Printer,
  Calendar,
  DollarSign,
  PieChart,
  ShoppingBag,
  Award,
  Bike,
} from 'lucide-react';
import type { Order, Product } from '../../types';

interface ReportsModuleProps {
  orders: Order[];
  products: Product[];
  currency: string;
}

export const ReportsModule: React.FC<ReportsModuleProps> = ({
  orders,
  products,
  currency,
}) => {
  const [period, setPeriod] = useState<'today' | '7days' | 'month' | 'year'>('month');

  // Filter valid orders
  const validOrders = useMemo(() => orders.filter(o => o.status !== 'cancelled'), [orders]);

  const totalSales = validOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
  const totalOrders = validOrders.length;
  const avgOrderValue = totalOrders > 0 ? Math.round(totalSales / totalOrders) : 0;

  // Best selling items
  const bestSellers = useMemo(() => {
    const itemMap = new Map<string, { name: string; count: number; revenue: number }>();
    validOrders.forEach(o => {
      o.items?.forEach(i => {
        const existing = itemMap.get(i.product_name);
        if (existing) {
          existing.count += i.quantity;
          existing.revenue += i.subtotal;
        } else {
          itemMap.set(i.product_name, { name: i.product_name, count: i.quantity, revenue: i.subtotal });
        }
      });
    });
    return Array.from(itemMap.values()).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [validOrders]);

  // Payment Breakdown
  const paymentBreakdown = useMemo(() => {
    let cod = 0, bkash = 0, nagad = 0, card = 0;
    validOrders.forEach(o => {
      if (o.payment_method === 'cod') cod += o.total_amount;
      else if (o.payment_method === 'bkash') bkash += o.total_amount;
      else if (o.payment_method === 'nagad') nagad += o.total_amount;
      else card += o.total_amount;
    });
    return { cod, bkash, nagad, card };
  }, [validOrders]);

  function exportCSV() {
    const rows = [
      ['Order ID', 'Order Number', 'Date', 'Customer', 'Phone', 'Total', 'Payment', 'Status'],
      ...validOrders.map(o => [
        o.id,
        o.order_number,
        o.created_at?.slice(0, 10),
        o.customer_name,
        o.customer_phone,
        o.total_amount,
        o.payment_method,
        o.status,
      ]),
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `aurora_sales_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-800 flex items-center gap-2">
            <BarChart3 size={26} style={{ color: '#B77D80' }} />
            রিপোর্ট ও অ্যানালিটিক্স (Reports & Business Intelligence)
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">বিক্রয় বিবরণী, সর্বোচ্চ বিক্রিত পণ্য ও পেমেন্ট পরিসংখ্যান</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-white rounded-xl border border-rose-100 p-1 gap-1 shadow-sm">
            {(['today', '7days', 'month', 'year'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  period === p ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
                style={period === p ? { background: '#B77D80' } : {}}
              >
                {p === 'today' ? 'আজ' : p === '7days' ? '৭ দিন' : p === 'month' ? 'চলতি মাস' : 'চলতি বছর'}
              </button>
            ))}
          </div>

          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
          >
            <Download size={14} />
            CSV এক্সপোর্ট
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
          >
            <Printer size={14} />
            প্রিন্ট
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-rose-50 shadow-sm">
          <span className="text-xs text-gray-500 font-medium">মোট বিক্রয় রেভিনিউ</span>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{currency}{totalSales.toLocaleString('en-BD')}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{totalOrders} টি সম্পন্ন অর্ডার</p>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-rose-50 shadow-sm">
          <span className="text-xs text-gray-500 font-medium">গড় অর্ডার মূল্য (AOV)</span>
          <p className="text-2xl font-bold text-gray-800 mt-1">{currency}{avgOrderValue.toLocaleString('en-BD')}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">প্রতি অর্ডারে গড় আয়</p>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-rose-50 shadow-sm">
          <span className="text-xs text-gray-500 font-medium">অনলাইন পেমেন্ট (bKash/Nagad)</span>
          <p className="text-2xl font-bold text-pink-600 mt-1">
            {currency}{(paymentBreakdown.bkash + paymentBreakdown.nagad).toLocaleString('en-BD')}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">ডিজিটাল পেমেন্ট</p>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-rose-50 shadow-sm">
          <span className="text-xs text-gray-500 font-medium">ক্যাশ অন ডেলিভারি (COD)</span>
          <p className="text-2xl font-bold text-blue-600 mt-1">{currency}{paymentBreakdown.cod.toLocaleString('en-BD')}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">নগদ সংগ্রহ</p>
        </div>
      </div>

      {/* Best Sellers & Payment Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Best Selling Products */}
        <div className="bg-white rounded-2xl p-5 border border-rose-50 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
              <Award size={18} className="text-amber-500" />
              সেরা বিক্রিত কেক (Best Selling Cakes)
            </h3>
            <span className="text-xs text-gray-400">টপ ৫ পণ্য</span>
          </div>

          <div className="space-y-3">
            {bestSellers.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl text-xs">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-lg bg-rose-100 text-rose-800 flex items-center justify-center font-bold text-xs">
                    #{idx + 1}
                  </span>
                  <div>
                    <span className="font-bold text-gray-800">{item.name}</span>
                    <span className="block text-[11px] text-gray-400">বিক্রিত পরিমাণ: {item.count} টি</span>
                  </div>
                </div>
                <div className="font-mono font-bold text-gray-800 text-right">
                  {currency}{item.revenue.toLocaleString('en-BD')}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Payment Channels Split */}
        <div className="bg-white rounded-2xl p-5 border border-rose-50 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
              <PieChart size={18} className="text-rose-500" />
              পেমেন্ট মাধ্যম বিভাজন (Payment Channels)
            </h3>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 bg-pink-50 rounded-xl flex justify-between items-center">
              <span className="font-bold text-pink-900">বিকাশ (bKash)</span>
              <span className="font-mono font-bold text-pink-900">{currency}{paymentBreakdown.bkash.toLocaleString('en-BD')}</span>
            </div>
            <div className="p-3 bg-orange-50 rounded-xl flex justify-between items-center">
              <span className="font-bold text-orange-900">নগদ (Nagad)</span>
              <span className="font-mono font-bold text-orange-900">{currency}{paymentBreakdown.nagad.toLocaleString('en-BD')}</span>
            </div>
            <div className="p-3 bg-blue-50 rounded-xl flex justify-between items-center">
              <span className="font-bold text-blue-900">ক্যাশ অন ডেলিভারি (COD)</span>
              <span className="font-mono font-bold text-blue-900">{currency}{paymentBreakdown.cod.toLocaleString('en-BD')}</span>
            </div>
            <div className="p-3 bg-purple-50 rounded-xl flex justify-between items-center">
              <span className="font-bold text-purple-900">অন্যান্য / কার্ড (Other)</span>
              <span className="font-mono font-bold text-purple-900">{currency}{paymentBreakdown.card.toLocaleString('en-BD')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
