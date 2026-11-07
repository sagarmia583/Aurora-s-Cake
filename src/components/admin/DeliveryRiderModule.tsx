import {formatShortOrderNumber} from '../../utils/orderUtils';
import React, { useState, useMemo } from 'react';
import {
  Bike,
  CheckCircle,
  Clock,
  AlertCircle,
  Phone,
  MapPin,
  DollarSign,
  UserCheck,
  Search,
  ArrowRight,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';
import type { Order, RiderDeposit } from '../../types';
import { mockDb } from '../../services/mockDatabase';

interface DeliveryRiderModuleProps {
  orders: Order[];
  currency: string;
  staffName: string;
  role: string;
  /** Opens the authenticated live queue; never dispatch local demo orders. */
  onOpenLiveDelivery?: () => void;
}

export const DeliveryRiderModule: React.FC<DeliveryRiderModuleProps> = ({
  orders,
  currency,
  staffName,
  role,
  onOpenLiveDelivery,
}) => {
  const [activeTab, setActiveTab] = useState<'deliveries' | 'riders_cash' | 'deposits'>('deliveries');
  const [search, setSearch] = useState('');
  const [selectedRider, setSelectedRider] = useState('all');

  const [deposits, setDeposits] = useState<RiderDeposit[]>(() => mockDb.getRiderDeposits());

  // Extract registered riders dynamically from actual staff & active orders
  const riders = useMemo(() => {
    const list: Array<{ id: string; username: string; name: string; phone?: string; active: boolean }> = [];
    const seen = new Set<string>();

    mockDb.getStaffMembers()
      .filter(s => s.role === 'delivery_man' || s.role === 'delivery_manager')
      .forEach(s => {
        seen.add(s.name);
        seen.add(s.username);
        list.push({ id: s.id, username: s.username, name: s.name, phone: s.phone, active: s.is_active });
      });

    orders.forEach(o => {
      if (o.rider_name && !seen.has(o.rider_name)) {
        seen.add(o.rider_name);
        list.push({
          id: o.rider_id || `rider-${o.rider_name}`,
          username: o.rider_name.toLowerCase().replace(/\s+/g, '_'),
          name: o.rider_name,
          active: true,
        });
      }
    });

    return list;
  }, [orders]);

  // Delivery orders (assigned, out_for_delivery, delivered)
  const deliveryOrders = useMemo(() => {
    return orders.filter(o => {
      const isDelivery = ['ready', 'assigned', 'picked_up', 'out_for_delivery', 'delivered'].includes(o.status);
      const matchSearch =
        o.order_number?.toLowerCase().includes(search.toLowerCase()) ||
        o.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
        o.customer_phone?.includes(search) ||
        o.delivery_address?.toLowerCase().includes(search.toLowerCase());
      const matchRider = selectedRider === 'all' || o.rider_name?.includes(selectedRider) || o.rider_id === selectedRider;
      return isDelivery && matchSearch && matchRider;
    });
  }, [orders, search, selectedRider]);

  // Compute rider balances
  const riderCashStats = useMemo(() => {
    return riders.map(rider => {
      const riderOrders = orders.filter(
        o => (o.rider_id === rider.id || o.rider_name?.includes(rider.name) || o.rider_name?.includes(rider.username)) &&
             o.payment_method === 'cod' &&
             o.status === 'delivered'
      );
      const totalCollected = riderOrders.reduce((s, o) => s + (o.cod_collected ? o.cod_amount : o.total_amount), 0);
      const totalDeposited = deposits
        .filter(d => (d.rider_id === rider.id || d.rider_name === rider.name) && d.status === 'confirmed')
        .reduce((s, d) => s + d.amount, 0);
      const pendingDeposits = deposits
        .filter(d => (d.rider_id === rider.id || d.rider_name === rider.name) && d.status === 'pending')
        .reduce((s, d) => s + d.amount, 0);
      const cashInHand = Math.max(0, totalCollected - totalDeposited);

      return {
        ...rider,
        deliveredCount: riderOrders.length,
        totalCollected,
        totalDeposited,
        pendingDeposits,
        cashInHand,
      };
    });
  }, [orders, deposits, riders]);

  const totalCodCollected = riderCashStats.reduce((s, r) => s + r.totalCollected, 0);
  const totalDepositedAll = riderCashStats.reduce((s, r) => s + r.totalDeposited, 0);
  const totalRiderCashInHand = riderCashStats.reduce((s, r) => s + r.cashInHand, 0);

  function handleApproveDeposit(depId: string) {
    setDeposits(prev => prev.map(d => d.id === depId ? { ...d, status: 'confirmed', actor_name: staffName } : d));
  }

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-clip p-3 sm:p-4 lg:p-6 space-y-6" data-testid="mobile-delivery-module">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 min-w-0">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Bike size={26} style={{ color: '#B77D80' }} />
            ডেলিভারি ও রাইডার ব্যবস্থাপনা (Delivery & Riders)
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">রাইডার অ্যাসাইনমেন্ট, COD কালেকশন ও ক্যাশ ডিপোজিট মিলানো</p>
        </div>

        {/* Tab Pills */}
        <div className="flex w-full sm:w-auto min-w-0 max-w-full overflow-x-auto bg-white rounded-xl border border-rose-100 p-1 gap-1 shadow-sm">
          <button
            onClick={() => setActiveTab('deliveries')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'deliveries' ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
            style={activeTab === 'deliveries' ? { background: '#B77D80' } : {}}
          >
            চলমান ডেলিভারি ({deliveryOrders.length})
          </button>
          <button
            onClick={() => setActiveTab('riders_cash')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'riders_cash' ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
            style={activeTab === 'riders_cash' ? { background: '#B77D80' } : {}}
          >
            রাইডার ক্যাশ ব্যালেন্স
          </button>
          <button
            onClick={() => setActiveTab('deposits')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'deposits' ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
            style={activeTab === 'deposits' ? { background: '#B77D80' } : {}}
          >
            ডিপোজিট রিকোয়েস্ট ({deposits.filter(d => d.status === 'pending').length})
          </button>
        </div>
      </div>

      <div className="w-full min-w-0 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <p className="text-xs sm:text-sm text-emerald-950 break-words">
          রাইডার অ্যাসাইন ও ডেলিভারি সম্পন্ন করতে Live Staff Orders খুলুন। সেখানে আসল Google Sheet-এর অর্ডার ও নিবন্ধিত রাইডার দেখাবে।
        </p>
        <button type="button" onClick={onOpenLiveDelivery} disabled={!onOpenLiveDelivery}
          className="w-full sm:w-auto shrink-0 rounded-xl bg-emerald-800 px-4 py-3 text-white text-xs font-bold disabled:opacity-50 min-h-11"
          data-testid="open-live-rider-assignment">
          Live Rider Assignment & Delivery
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-rose-50 shadow-sm">
          <span className="text-xs text-gray-500 font-medium">মোট COD সংগৃহীত</span>
          <p className="text-2xl font-bold text-gray-800 mt-1">{currency}{totalCodCollected.toLocaleString('en-BD')}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">ডেলিভারির ক্যাশ কালেকশন</p>
        </div>

        <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200">
          <span className="text-xs text-amber-800 font-bold flex items-center gap-1">
            <DollarSign size={13} />
            রাইডারদের হাতে ক্যাশ (Cash in Hand)
          </span>
          <p className="text-2xl font-black text-amber-900 mt-1">{currency}{totalRiderCashInHand.toLocaleString('en-BD')}</p>
          <p className="text-[11px] text-amber-700 mt-0.5">কাউন্টারে জমা হওয়া বাকি</p>
        </div>

        <div className="bg-green-50 rounded-2xl p-4 border border-green-200">
          <span className="text-xs text-green-800 font-bold flex items-center gap-1">
            <CheckCircle size={13} />
            কাউন্টারে মোট জমা (Deposited)
          </span>
          <p className="text-2xl font-black text-green-900 mt-1">{currency}{totalDepositedAll.toLocaleString('en-BD')}</p>
          <p className="text-[11px] text-green-700 mt-0.5">যাচাইকৃত ক্যাশ জমা</p>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-rose-50 shadow-sm">
          <span className="text-xs text-gray-500 font-medium">সক্রিয় ডেলিভারি রাইডার</span>
          <p className="text-2xl font-bold text-gray-800 mt-1">{riders.length} জন</p>
          <p className="text-[11px] text-gray-400 mt-0.5">অন-ডিউটি রাইডার</p>
        </div>
      </div>

      {activeTab === 'deliveries' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
            <div className="relative flex-1 sm:w-72">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="অর্ডার, কাস্টমার বা ঠিকানা খুঁজুন..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400"
              />
            </div>

            <div className="flex gap-2">
              <select
                value={selectedRider}
                onChange={e => setSelectedRider(e.target.value)}
                className="text-xs border border-gray-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-rose-400"
              >
                <option value="all">সব রাইডার</option>
                {riders.map(r => (
                  <option key={r.id} value={r.name}>{r.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Deliveries Grid */}
          <div className="grid min-w-0 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {deliveryOrders.map(order => (
              <div key={order.id} className="min-w-0 max-w-full bg-white rounded-2xl p-3 sm:p-4 border border-gray-100 shadow-sm space-y-3 break-words">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono text-xs font-bold text-gray-600">
                      #{formatShortOrderNumber(order.order_number)}
                    </span>
                    <h3 className="font-bold text-gray-800 text-sm mt-0.5">{order.customer_name}</h3>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    order.status === 'out_for_delivery'
                      ? 'bg-blue-100 text-blue-800'
                      : order.status === 'delivered'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    {order.status === 'out_for_delivery' ? '🚴 বাইকে ডেলিভারিতে' : order.status === 'delivered' ? '✅ ডেলিভার্ড' : '⏳ রাইডার অপেক্ষমাণ'}
                  </span>
                </div>

                <div className="space-y-1 text-xs text-gray-600">
                  <div className="flex items-center gap-1.5">
                    <Phone size={13} className="text-gray-400" />
                    <a href={`tel:${order.customer_phone}`} className="font-mono text-blue-600 hover:underline">
                      {order.customer_phone}
                    </a>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <MapPin size={13} className="text-gray-400 shrink-0 mt-0.5" />
                    <span className="text-gray-500 line-clamp-2">{order.delivery_address || 'ঠিকানা দেওয়া হয়নি'}</span>
                  </div>
                </div>

                {/* Amount & Rider */}
                <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-gray-400 block text-[10px]">সংগ্রহযোগ্য COD</span>
                    <span className="font-bold text-gray-800">{currency}{order.total_amount?.toLocaleString('en-BD')}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-gray-400 block text-[10px]">অ্যাসাইন্ড রাইডার</span>
                    <span className="font-bold text-rose-700">{order.rider_name || 'কেউ নেই'}</span>
                  </div>
                </div>

                {/* Delivery mutations must use a verified staff session and server-confirmed order. */}
                <div className="flex gap-2 pt-1">
                  {['ready','assigned','picked_up','out_for_delivery'].includes(order.status) && (
                    <button type="button" onClick={onOpenLiveDelivery} disabled={!onOpenLiveDelivery}
                      className="w-full min-h-11 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white px-3 py-2 text-xs font-bold disabled:opacity-50"
                      data-testid="open-live-delivery-order">
                      {order.status === 'ready' ? 'Assign Rider in Live Orders' : 'Manage Delivery in Live Orders'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'riders_cash' && (
        <div className="bg-white rounded-2xl shadow-sm border border-rose-50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50/70 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">রাইডার নাম</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">ফোন নম্বর</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">ডেলিভার্ড অর্ডার</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">মোট সংগৃহীত COD</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">কাউন্টারে জমা</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">হাতে ক্যাশ (In Hand)</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">অপেক্ষমাণ জমা</th>
                </tr>
              </thead>
              <tbody>
                {riderCashStats.map(r => (
                  <tr key={r.id} className="border-t border-gray-50 hover:bg-rose-50/20 transition-colors">
                    <td className="px-4 py-3 font-bold text-gray-800">{r.name}</td>
                    <td className="px-4 py-3 font-mono text-gray-600">{r.phone}</td>
                    <td className="px-4 py-3 font-bold text-gray-800">{r.deliveredCount} টি</td>
                    <td className="px-4 py-3 font-mono font-bold text-gray-800">{currency}{r.totalCollected.toLocaleString('en-BD')}</td>
                    <td className="px-4 py-3 font-mono font-bold text-green-700">{currency}{r.totalDeposited.toLocaleString('en-BD')}</td>
                    <td className="px-4 py-3 font-mono font-black text-amber-700 bg-amber-50/50">
                      {currency}{r.cashInHand.toLocaleString('en-BD')}
                    </td>
                    <td className="px-4 py-3 font-mono text-blue-600 font-semibold">
                      {r.pendingDeposits > 0 ? `${currency}${r.pendingDeposits.toLocaleString('en-BD')} (যাচাই প্রয়োজন)` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'deposits' && (
        <div className="bg-white rounded-2xl shadow-sm border border-rose-50 overflow-hidden space-y-3">
          <div className="p-4 border-b border-gray-100 font-bold text-gray-800 text-sm">
            রাইডার ক্যাশ ডিপোজিট রিকোয়েস্ট ও অনুমোদন হিস্ট্রি
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">তারিখ ও সময়</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">রাইডারের নাম</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">জমার পরিমাণ</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">মন্তব্য / বিবরণ</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">স্ট্যাটাস</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">অ্যাকশন</th>
                </tr>
              </thead>
              <tbody>
                {deposits.map(d => (
                  <tr key={d.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-mono text-gray-500">
                      {new Date(d.deposited_at).toLocaleString('en-BD')}
                    </td>
                    <td className="px-4 py-3 font-bold text-gray-800">{d.rider_name}</td>
                    <td className="px-4 py-3 font-mono font-black text-green-700 text-sm">
                      {currency}{d.amount.toLocaleString('en-BD')}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{d.note || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                        d.status === 'confirmed' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {d.status === 'confirmed' ? '✓ অনুমোদিত (Approved)' : '⏳ অনুমোদনের অপেক্ষায়'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {d.status === 'pending' ? (
                        <button
                          onClick={() => handleApproveDeposit(d.id)}
                          className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg text-xs shadow-xs"
                        >
                          অ্যাপ্রুভ করুন
                        </button>
                      ) : (
                        <span className="text-[11px] text-gray-400">অনুমোদনদাতা: {d.actor_name}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
