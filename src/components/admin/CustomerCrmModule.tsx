import {formatShortOrderNumber} from '../../utils/orderUtils';
import React, { useState, useMemo } from 'react';
import {
  Users,
  Search,
  Phone,
  MapPin,
  Gift,
  Cake,
  Star,
  ShoppingBag,
  Calendar,
  MessageSquare,
  Clock,
  Sparkles,
} from 'lucide-react';
import type { Customer, Order } from '../../types';

interface CustomerCrmModuleProps {
  orders: Order[];
  currency: string;
}

export const CustomerCrmModule: React.FC<CustomerCrmModuleProps> = ({
  orders,
  currency,
}) => {
  const [search, setSearch] = useState('');
  const [filterVip, setFilterVip] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Group customer data automatically from orders
  const customers = useMemo(() => {
    const map = new Map<string, Customer>();

    orders.forEach(o => {
      const phone = o.customer_phone?.trim();
      if (!phone) return;

      const existing = map.get(phone);
      const orderTotal = o.status !== 'cancelled' ? (o.total_amount || 0) : 0;

      if (!existing) {
        map.set(phone, {
          id: 'cust-' + phone.slice(-6),
          name: o.customer_name || 'Customer',
          phone: phone,
          address: o.delivery_address || '',
          total_orders: 1,
          total_spending: orderTotal,
          last_order_date: o.created_at?.slice(0, 10),
          is_vip: orderTotal >= 3000,
          created_at: o.created_at || new Date().toISOString(),
          updated_at: o.created_at || new Date().toISOString(),
        });
      } else {
        existing.total_orders += 1;
        existing.total_spending += orderTotal;
        if (orderTotal >= 5000 || existing.total_orders >= 3) {
          existing.is_vip = true;
        }
        if (o.created_at && (!existing.last_order_date || o.created_at > existing.last_order_date)) {
          existing.last_order_date = o.created_at.slice(0, 10);
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => b.total_spending - a.total_spending);
  }, [orders]);

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const matchSearch =
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.phone.includes(search) ||
        c.address?.toLowerCase().includes(search.toLowerCase());
      if (filterVip) return c.is_vip && matchSearch;
      return matchSearch;
    });
  }, [customers, search, filterVip]);

  const totalCustomers = customers.length;
  const vipCount = customers.filter(c => c.is_vip).length;
  const totalCustomerLifetimeValue = customers.reduce((s, c) => s + c.total_spending, 0);

  const customerOrders = useMemo(() => {
    if (!selectedCustomer) return [];
    return orders.filter(o => o.customer_phone === selectedCustomer.phone);
  }, [orders, selectedCustomer]);

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Users size={26} style={{ color: '#B77D80' }} />
            কাস্টমার ও সিআরএম (Customer CRM)
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">নিয়মিত গ্রাহক তালিকা, অর্ডার হিস্ট্রি ও সম্পর্ক ব্যবস্থাপনা</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterVip(!filterVip)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
              filterVip
                ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            <Star size={14} className={filterVip ? 'text-amber-600 fill-amber-500' : 'text-gray-400'} />
            ভিআইপি কাস্টমার ফিল্টার ({vipCount})
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-rose-50 shadow-sm">
          <span className="text-xs text-gray-500 font-medium">মোট কাস্টমার সংখ্যা</span>
          <p className="text-2xl font-bold text-gray-800 mt-1">{totalCustomers} জন</p>
          <p className="text-[11px] text-gray-400 mt-0.5">স্বতন্ত্র মোবাইল নম্বর</p>
        </div>

        <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200">
          <span className="text-xs text-amber-800 font-bold flex items-center gap-1">
            <Star size={13} className="fill-amber-500 text-amber-600" />
            ভিআইপি ও নিয়মিত গ্রাহক
          </span>
          <p className="text-2xl font-black text-amber-900 mt-1">{vipCount} জন</p>
          <p className="text-[11px] text-amber-700 mt-0.5">সবচেয়ে বেশি অর্ডারকারী</p>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-rose-50 shadow-sm">
          <span className="text-xs text-gray-500 font-medium">কাস্টমার লাইফটাইম ভ্যালু</span>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{currency}{totalCustomerLifetimeValue.toLocaleString('en-BD')}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">মোট অর্ডারের মূল্য</p>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-rose-50 shadow-sm">
          <span className="text-xs text-gray-500 font-medium">গড় স্পেন্ডিং প্রতি কাস্টমার</span>
          <p className="text-2xl font-bold text-gray-800 mt-1">
            {currency}{totalCustomers > 0 ? Math.round(totalCustomerLifetimeValue / totalCustomers).toLocaleString('en-BD') : 0}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">গড় ব্যয়</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="কাস্টমারের নাম, ফোন নম্বর বা এলাকা দিয়ে খুঁজুন..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400"
          />
        </div>
      </div>

      {/* Main Customers List */}
      <div className="bg-white rounded-2xl shadow-sm border border-rose-50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50/70 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">কাস্টমার নাম</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">মোবাইল নম্বর</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">ডেলিভারি ঠিকানা</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">মোট অর্ডার</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">মোট খরচ (Spending)</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">সর্বশেষ অর্ডার</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">স্ট্যাটাস</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">অ্যাকশন</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map(c => (
                <tr key={c.phone} className="border-t border-gray-50 hover:bg-rose-50/20 transition-colors">
                  <td className="px-4 py-3 font-bold text-gray-800">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-full bg-rose-100 text-rose-800 flex items-center justify-center font-bold text-xs">
                        {c.name.charAt(0).toUpperCase()}
                      </span>
                      <span>{c.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-700">
                    <a href={`tel:${c.phone}`} className="text-blue-600 hover:underline">
                      {c.phone}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{c.address || '—'}</td>
                  <td className="px-4 py-3 font-bold text-gray-800">{c.total_orders} টি</td>
                  <td className="px-4 py-3 font-mono font-bold text-emerald-700 text-sm">
                    {currency}{c.total_spending.toLocaleString('en-BD')}
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-500">{c.last_order_date || '—'}</td>
                  <td className="px-4 py-3">
                    {c.is_vip ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full">
                        <Star size={10} className="fill-amber-500 text-amber-600" /> ভিআইপি
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                        সাধারণ
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setSelectedCustomer(c)}
                      className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold rounded-lg text-[11px] transition-colors"
                    >
                      অর্ডার হিস্ট্রি দেখুন
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer Profile / Order History Drawer */}
      {selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-5 space-y-4 shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-bold text-gray-800 text-base flex items-center gap-2">
                  {selectedCustomer.name}
                  {selectedCustomer.is_vip && (
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full flex items-center gap-1">
                      <Star size={10} className="fill-amber-500" /> VIP
                    </span>
                  )}
                </h3>
                <p className="text-xs text-gray-500 font-mono mt-0.5">{selectedCustomer.phone}</p>
                <p className="text-xs text-gray-500 mt-0.5">{selectedCustomer.address}</p>
              </div>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="text-gray-400 hover:text-gray-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-rose-50 p-3 rounded-xl">
                <span className="text-gray-500 block">মোট অর্ডার</span>
                <span className="text-xl font-bold text-gray-800">{selectedCustomer.total_orders} টি</span>
              </div>
              <div className="bg-emerald-50 p-3 rounded-xl">
                <span className="text-gray-500 block">মোট খরচ</span>
                <span className="text-xl font-bold text-emerald-700 font-mono">
                  {currency}{selectedCustomer.total_spending.toLocaleString('en-BD')}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2">
              <p className="text-xs font-bold text-gray-700">অর্ডারের তালিকা:</p>
              {customerOrders.map(o => (
                <div key={o.id} className="bg-gray-50 p-3 rounded-xl text-xs flex justify-between items-center">
                  <div>
                    <span className="font-mono font-bold text-gray-800">#{formatShortOrderNumber(o.order_number)}</span>
                    <span className="text-gray-400 block text-[11px]">{o.created_at?.slice(0, 10)}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-rose-700">{currency}{o.total_amount}</span>
                    <span className="block text-[10px] capitalize text-gray-500">{o.status}</span>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setSelectedCustomer(null)}
              className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition-colors"
            >
              বন্ধ করুন
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
