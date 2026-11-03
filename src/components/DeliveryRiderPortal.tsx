import React, { useState, useEffect } from 'react';
import { 
  Bike, 
  Phone, 
  MapPin, 
  Key, 
  CheckCircle2, 
  DollarSign, 
  ShieldCheck, 
  AlertCircle,
  ExternalLink,
  Clock,
  Package,
  Wallet,
  Building2,
  History,
  X,
  Gift,
  Printer
} from 'lucide-react';
import { Order } from '../types';
import { mockDb } from '../services/mockDatabase';
import { ThermalBoxStickerModal } from './ThermalBoxStickerModal';
import { formatShortOrderNumber } from '../utils/orderUtils';
import { mutateStaffOrder } from '../services/sheetStaffApi';
import { loadStaffCredential, getBrowserWorkspaceStorage } from '../services/staffWorkspaceSession';

interface DeliveryRiderPortalProps {
  orders: Order[];
  currency: string;
  endpoint?: string;
}

export const DeliveryRiderPortal: React.FC<DeliveryRiderPortalProps> = ({ orders, currency, endpoint }) => {
  // Active Rider deliveries: orders in delivery stages
  const riderDeliveries = orders.filter(
    (o) =>
      ['ready', 'assigned', 'picked_up', 'out_for_delivery', 'delivered'].includes(o.status)
  );

  const [selectedOrderForSticker, setSelectedOrderForSticker] = useState<Order | null>(null);

  // Delivery Confirmation Modal State (Cash confirmation)
  const [activeDeliveryOrder, setActiveDeliveryOrder] = useState<Order | null>(null);
  const [cashCollectedCheck, setCashCollectedCheck] = useState(false);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [deliverySuccessMessage, setDeliverySuccessMessage] = useState<string | null>(null);

  // Rider Cash Settlement & Deposit State
  const [cashSummary, setCashSummary] = useState(() => mockDb.getRiderCashSummary('rider-1', 'Rahim Mia (Rider #1)'));
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState<number>(0);
  const [depositNote, setDepositNote] = useState('');
  const [depositSuccessMessage, setDepositSuccessMessage] = useState<string | null>(null);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [showDepositHistory, setShowDepositHistory] = useState(false);

  useEffect(() => {
    return mockDb.subscribe(() => {
      setCashSummary(mockDb.getRiderCashSummary('rider-1', 'Rahim Mia (Rider #1)'));
    });
  }, []);

  const handleOpenDepositModal = () => {
    const current = mockDb.getRiderCashSummary('rider-1', 'Rahim Mia (Rider #1)');
    setCashSummary(current);
    setDepositAmount(current.cash_in_hand);
    setDepositNote('');
    setDepositError(null);
    setDepositSuccessMessage(null);
    setIsDepositModalOpen(true);
  };

  const handleConfirmDeposit = (e: React.FormEvent) => {
    e.preventDefault();
    if (depositAmount <= 0) {
      setDepositError('দয়া করে সঠিক জমার পরিমাণ লিখুন (০ থেকে বেশি)।');
      return;
    }
    if (depositAmount > cashSummary.cash_in_hand) {
      setDepositError(`জমার পরিমাণ হাতে থাকা ব্যালেন্সের (৳${cashSummary.cash_in_hand.toLocaleString()}) চেয়ে বেশি হতে পারে না।`);
      return;
    }

    const res = mockDb.addRiderDeposit(
      {
        rider_id: 'rider-1',
        rider_name: 'Rahim Mia (Rider #1)',
        amount: depositAmount,
        note: depositNote.trim() || 'কাউন্টার ক্যাশ ডিপোজিট',
      },
      'Rahim Mia (Rider #1)'
    );

    if (res.success) {
      setCashSummary(mockDb.getRiderCashSummary('rider-1', 'Rahim Mia (Rider #1)'));
      setDepositSuccessMessage(res.message);
      setTimeout(() => {
        setIsDepositModalOpen(false);
        setDepositSuccessMessage(null);
      }, 1500);
    } else {
      setDepositError(res.message);
    }
  };

  const syncOrderToBackend = (orderId: string, operation: 'pick_up' | 'start_delivery' | 'deliver', extra: Record<string, unknown> = {}) => {
    if (!endpoint) return;
    const token = loadStaffCredential(getBrowserWorkspaceStorage());
    if (!token) return;
    mutateStaffOrder(endpoint, token, operation, orderId, extra).catch(() => {});
  };

  const handlePickUp = (orderId: string) => {
    mockDb.updateOrderStatus(orderId, 'picked_up', 'Picked up by rider from bakery counter', 'Rahim Mia (Rider)');
    syncOrderToBackend(orderId, 'pick_up');
  };

  const handleStartDelivery = (orderId: string) => {
    mockDb.updateOrderStatus(orderId, 'out_for_delivery', 'Rider is out for express delivery to customer doorstep', 'Rahim Mia (Rider)');
    syncOrderToBackend(orderId, 'start_delivery');
  };

  const handleOpenDeliveryModal = (order: Order) => {
    setActiveDeliveryOrder(order);
    const dueAmount = order.due_amount !== undefined 
      ? order.due_amount 
      : (order.payment_method === 'cod' ? (order.total_amount - (order.advance_paid_amount || 0)) : 0);
    setCashCollectedCheck(dueAmount <= 0);
    setDeliveryError(null);
    setDeliverySuccessMessage(null);
  };

  const handleConfirmDelivery = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDeliveryOrder) return;
    const dueAmount = activeDeliveryOrder.due_amount !== undefined 
      ? activeDeliveryOrder.due_amount 
      : (activeDeliveryOrder.payment_method === 'cod' ? (activeDeliveryOrder.total_amount - (activeDeliveryOrder.advance_paid_amount || 0)) : 0);

    if (dueAmount > 0 && !cashCollectedCheck) {
      setDeliveryError('দয়া করে বাকি ক্যাশ টাকা বুঝে পেয়ে টিক দিন।');
      return;
    }

    const result = mockDb.confirmDelivery(activeDeliveryOrder.id, cashCollectedCheck, 'Rahim Mia (Rider #1)');
    syncOrderToBackend(activeDeliveryOrder.id, 'deliver', { cash_collected: cashCollectedCheck });
    if (result.success) {
      setDeliverySuccessMessage(result.message || 'ক্যাশ চেক সম্পন্ন ও সফলভাবে ডেলিভারি নিশ্চিত হয়েছে!');
      setCashSummary(mockDb.getRiderCashSummary('rider-1', 'Rahim Mia (Rider #1)'));
      setTimeout(() => {
        setActiveDeliveryOrder(null);
        setDeliverySuccessMessage(null);
      }, 1000);
    } else {
      setDeliveryError(result.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Rider Header */}
      <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-lg text-2xl">
            🛵
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-sky-500/20 text-sky-300 font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                Rider Delivery Portal
              </span>
              <span className="text-xs text-slate-400">Assigned Deliveries</span>
            </div>
            <h2 className="text-2xl font-black text-white mt-1">Rahim Mia (Tangail Express #1)</h2>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-slate-800/80 px-4 py-2 rounded-2xl border border-slate-700 text-center">
            <span className="text-[11px] text-slate-400 block font-semibold">Active Runs</span>
            <span className="text-xl font-black text-sky-400">
              {riderDeliveries.filter((o) => o.status !== 'delivered').length}
            </span>
          </div>
          <div className="bg-slate-800/80 px-4 py-2 rounded-2xl border border-slate-700 text-center">
            <span className="text-[11px] text-slate-400 block font-semibold">Completed Today</span>
            <span className="text-xl font-black text-emerald-400">
              {riderDeliveries.filter((o) => o.status === 'delivered').length}
            </span>
          </div>
        </div>
      </div>

      {/* Cash Collection & Balance Settlement Banner */}
      <div className="bg-gradient-to-br from-emerald-950 via-teal-900 to-slate-900 text-white p-6 rounded-3xl shadow-xl border border-emerald-800/40 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xl border border-emerald-500/30">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
                Cash Management & Settlement
              </span>
              <h3 className="text-xl font-black text-white">রাইডার ক্যাশ কালেকশন ও ডিপোজিট</h3>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setShowDepositHistory(!showDepositHistory)}
              className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-emerald-100 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <History className="w-3.5 h-3.5" />
              <span>{showDepositHistory ? 'হিস্ট্রি লুকান' : 'জমার হিস্ট্রি'}</span>
            </button>
            <button
              type="button"
              onClick={handleOpenDepositModal}
              disabled={cashSummary.cash_in_hand <= 0}
              className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed text-emerald-950 text-xs font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 transition-all cursor-pointer"
            >
              <Building2 className="w-4 h-4" />
              <span>কাউন্টারে ক্যাশ জমা দিন</span>
            </button>
          </div>
        </div>

        {/* 3 Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {/* 1. Total COD Collected */}
          <div className="bg-white/10 backdrop-blur-xs p-4 rounded-2xl border border-white/10 space-y-1">
            <div className="flex items-center justify-between text-emerald-200 text-xs">
              <span>মোট সংগৃহীত ক্যাশ</span>
              <span className="text-[10px] bg-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
                {cashSummary.delivered_orders_count} ডেলিভারি
              </span>
            </div>
            <div className="text-2xl font-black text-white font-mono">
              {currency}{cashSummary.total_collected.toLocaleString()}
            </div>
            <p className="text-[11px] text-emerald-300/80">গ্রাহকদের থেকে সংগৃহীত মোট COD</p>
          </div>

          {/* 2. Total Deposited */}
          <div className="bg-white/10 backdrop-blur-xs p-4 rounded-2xl border border-white/10 space-y-1">
            <div className="flex items-center justify-between text-emerald-200 text-xs">
              <span>কাউন্টারে মোট জমা</span>
              <span className="text-[10px] bg-sky-500/20 text-sky-200 px-2 py-0.5 rounded-full font-bold">
                {cashSummary.deposits.length} বার জমা
              </span>
            </div>
            <div className="text-2xl font-black text-emerald-300 font-mono">
              {currency}{cashSummary.total_deposited.toLocaleString()}
            </div>
            <p className="text-[11px] text-emerald-300/80">বেকারির অফিসে জমা দেওয়া হয়েছে</p>
          </div>

          {/* 3. Cash in Hand / Pending Balance */}
          <div className={`p-4 rounded-2xl border space-y-1 transition-all ${
            cashSummary.cash_in_hand > 0
              ? 'bg-amber-500/20 border-amber-400/40 text-amber-100 ring-2 ring-amber-400/20'
              : 'bg-white/10 border-white/10 text-emerald-100'
          }`}>
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold">হাতে থাকা ক্যাশ ব্যালেন্স</span>
              {cashSummary.cash_in_hand > 0 ? (
                <span className="text-[10px] bg-amber-400 text-amber-950 px-2 py-0.5 rounded-full font-black animate-pulse">
                  জমা দিতে হবে
                </span>
              ) : (
                <span className="text-[10px] bg-emerald-400/30 text-emerald-200 px-2 py-0.5 rounded-full font-bold">
                  ক্লিয়ারড
                </span>
              )}
            </div>
            <div className="text-2xl font-black text-amber-300 font-mono">
              {currency}{cashSummary.cash_in_hand.toLocaleString()}
            </div>
            <p className="text-[11px] text-amber-200/90">
              {cashSummary.cash_in_hand > 0 
                ? 'ডিপোজিট করলে এই ব্যালেন্স মাইনাস হয়ে যাবে'
                : 'সব সংগৃহীত ক্যাশ কাউন্টারে জমা সম্পন্ন'}
            </p>
          </div>
        </div>

        {/* Deposit History Drawer */}
        {showDepositHistory && (
          <div className="bg-black/40 rounded-2xl p-4 border border-white/10 space-y-2.5 animate-fade-in">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-emerald-200 uppercase tracking-wider flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" />
                সাম্প্রতিক ক্যাশ জমা দেওয়ার রেকর্ড ({cashSummary.deposits.length})
              </h4>
            </div>
            {cashSummary.deposits.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-3">এখনও কোনো জমার রেকর্ড নেই।</p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {cashSummary.deposits.map((dep) => (
                  <div
                    key={dep.id}
                    className="flex items-center justify-between bg-white/5 hover:bg-white/10 p-2.5 rounded-xl text-xs transition-colors"
                  >
                    <div>
                      <span className="font-bold text-white block">
                        ৳{dep.amount.toLocaleString()} কাউন্টারে জমা
                      </span>
                      <span className="text-[10px] text-emerald-300/80">
                        {new Date(dep.deposited_at).toLocaleString('bn-BD')} • {dep.note || 'কাউন্টার ক্যাশ ডিপোজিট'}
                      </span>
                    </div>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-md border border-emerald-500/30">
                      Confirmed ✓
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cake Transit Safety Caution Banner */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-3xl p-5 shadow-xs flex flex-col md:flex-row items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center text-2xl shadow-md shrink-0">
          ⚠️
        </div>
        <div className="text-xs space-y-2 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-amber-500 text-white font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
              Transit Guidelines
            </span>
            <h4 className="font-black text-amber-950 text-sm">
              রাইডার কেক পরিবহন ও হ্যান্ডলিং সতর্কতা (Cake Safety Rules)
            </h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-0.5">
            <div className="bg-white/90 p-3 rounded-2xl border border-amber-200 shadow-2xs space-y-1">
              <span className="font-bold text-amber-950 block">১. সোজা ও লেভেল রাখুন</span>
              <p className="text-amber-900/90 text-[11px] leading-snug">
                কেকের বক্স কখনোই কাত (tilt) বা ঢালু করা যাবে না। বাইকের ফুটরেস্টে সমান্তরাল রাখুন।
              </p>
            </div>
            <div className="bg-white/90 p-3 rounded-2xl border border-amber-200 shadow-2xs space-y-1">
              <span className="font-bold text-amber-950 block">২. রোদ ও তাপ থেকে দূরে</span>
              <p className="text-amber-900/90 text-[11px] leading-snug">
                বাইকের সাইলেন্সার বা সরাসরি রোদের তাপে ক্রিম গলে যায়। সর্বদা ছায়ায় ও ডেলিভারি ব্যাগে রাখুন।
              </p>
            </div>
            <div className="bg-white/90 p-3 rounded-2xl border border-amber-200 shadow-2xs space-y-1">
              <span className="font-bold text-amber-950 block">৩. স্পিডব্রেকারে স্লো ড্রাইভ</span>
              <p className="text-amber-900/90 text-[11px] leading-snug">
                ঝাঁকুনিতে কেকের ডেকোরেশন নষ্ট হতে পারে। ভাঙা রাস্তায় গতি ১০-১৫ কিমি/ঘণ্টায় নামিয়ে আনুন।
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Deliveries Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {riderDeliveries.length === 0 ? (
          <div className="col-span-2 text-center py-16 bg-white rounded-3xl border border-slate-200 p-8 space-y-3">
            <div className="text-4xl">🛵</div>
            <h3 className="font-bold text-slate-800 text-base">No Assigned Deliveries</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              You are all caught up! New orders ready from the kitchen will appear here once assigned by the delivery manager.
            </p>
          </div>
        ) : (
          riderDeliveries.map((order) => {
            const isDelivered = order.status === 'delivered';
            const isOutForDelivery = order.status === 'out_for_delivery';
            const isPickedUp = order.status === 'picked_up';
            const dueAmount = order.due_amount !== undefined 
              ? order.due_amount 
              : (order.payment_method === 'cod' ? (order.total_amount - (order.advance_paid_amount || 0)) : 0);

            return (
              <div
                key={order.id}
                className={`bg-white rounded-3xl p-6 border shadow-md space-y-4 transition-all ${
                  isDelivered
                    ? 'border-emerald-200 bg-emerald-50/20 opacity-80'
                    : isOutForDelivery
                    ? 'border-sky-500 ring-2 ring-sky-100'
                    : 'border-slate-200'
                }`}
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <span 
                      className="font-mono text-xs font-black px-2 py-0.5 rounded-lg bg-slate-900 text-amber-300 shadow-2xs tracking-wider"
                      title={`পুরো অর্ডার নম্বর: #${formatShortOrderNumber(order.order_number)}`}
                    >
                      #{formatShortOrderNumber(order.order_number)}
                    </span>
                    <h3 className="font-bold text-slate-900 text-base mt-1">
                      {order.customer_name}
                    </h3>
                  </div>
                  <span
                    className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider ${
                      isDelivered
                        ? 'bg-emerald-100 text-emerald-800'
                        : isOutForDelivery
                        ? 'bg-sky-100 text-sky-800 animate-pulse'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {order.status.replace(/_/g, ' ')}
                  </span>
                </div>

                {/* Surprise / Gift Delivery Alert */}
                {order.is_gift && (
                  <div className="bg-purple-50 border border-purple-200 p-3.5 rounded-2xl text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-purple-900 flex items-center gap-1.5">
                        <Gift className="w-4 h-4 text-purple-700" />
                        <span>🎁 সারপ্রাইজ গিফট ডেলিভারি</span>
                      </span>
                      {order.hide_price_on_box && (
                        <span className="text-[10px] bg-purple-200 text-purple-900 font-bold px-2 py-0.5 rounded-md">
                          🚫 দাম গোপন রাখুন (ইনভয়েস নেই)
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-purple-950 font-medium">
                      প্রাপক (Receiver): <strong>{order.recipient_name || order.customer_name}</strong> ({order.recipient_phone || order.customer_phone})
                    </div>
                    {order.sender_name && (
                      <div className="text-[11px] text-purple-800">
                        পাঠিয়েছেন: <strong>{order.sender_name}</strong> ({order.sender_phone || 'গোপন'})
                      </div>
                    )}
                    {order.gift_card_message && (
                      <div className="text-[11px] italic bg-white/80 p-2 rounded-xl border border-purple-200 text-purple-900 font-serif">
                        💌 কার্ডে লেখা: "{order.gift_card_message}"
                      </div>
                    )}
                  </div>
                )}

                {/* Location & Slot */}
                <div className="space-y-2 bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs">
                  <div className="flex items-start gap-2 text-slate-700">
                    <MapPin className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-slate-900">{order.delivery_address}</p>
                      <span className="text-slate-500 text-[11px]">
                        Zone: {order.delivery_zone.name}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-slate-500 pt-1 border-t border-slate-200/60">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Slot: {order.delivery_slot}</span>
                  </div>
                </div>

                {/* COD & Payment Status */}
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200/80 text-xs">
                  <div>
                    <span className="text-[11px] text-amber-800 font-bold block uppercase tracking-wider">
                      Payment: {order.payment_method.toUpperCase()}
                    </span>
                    {order.advance_paid_amount && order.advance_paid_amount > 0 ? (
                      <div className="text-[11px] text-emerald-700 font-semibold">
                        অগ্রিম পেইড: ৳{order.advance_paid_amount} {order.bkash_trx_id ? `(TrxID: ${order.bkash_trx_id})` : ''}
                      </div>
                    ) : null}
                    <span className="text-slate-600 text-[11px]">
                      {dueAmount > 0 
                        ? `কাস্টমার থেকে ক্যাশ কালেকশন (Due COD)` 
                        : 'অনলাইনে সম্পূর্ণ পেইড (টাকা নেওয়া লাগবে না)'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-base font-black text-rose-700">
                      {dueAmount > 0 ? `${currency}${dueAmount}` : '৳0 (PAID)'}
                    </span>
                    {order.cod_collected && (
                      <span className="text-[10px] text-emerald-600 font-bold block flex items-center justify-end gap-1 mt-0.5">
                        <CheckCircle2 className="w-3 h-3" /> Cash Settled
                      </span>
                    )}
                  </div>
                </div>

                {/* Quick Action Buttons */}
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <a
                    href={`tel:${order.recipient_phone || order.customer_phone}`}
                    className="flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2.5 rounded-xl text-xs transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5 text-emerald-600" />
                    <span>কল দিন</span>
                  </a>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.delivery_address + ', ' + order.delivery_zone.name + ', Tangail')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 bg-sky-50 hover:bg-sky-100 text-sky-800 font-bold py-2.5 rounded-xl text-xs transition-colors border border-sky-200"
                    title="Google Maps এ নেভিগেশন চালু করুন"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-sky-600" />
                    <span>ম্যাপ GPS</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => setSelectedOrderForSticker(order)}
                    className="flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
                    title="কেক বক্সের থার্মাল লেবেল দেখুন"
                  >
                    <Printer className="w-3.5 h-3.5 text-purple-600" />
                    <span>স্টিকার</span>
                  </button>
                </div>

                {/* Status Transitions */}
                <div className="pt-1 space-y-2">
                  {order.status === 'ready' ? (
                    <button
                      onClick={() => {
                        mockDb.assignRider(order.id, 'Rahim Mia (Rider #1)', 'Rahim Mia (Rider)');
                        mockDb.updateOrderStatus(order.id, 'picked_up', 'Picked up by rider from counter', 'Rahim Mia (Rider)');
                        syncOrderToBackend(order.id, 'pick_up');
                      }}
                      className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
                    >
                      <Package className="w-4 h-4" />
                      <span>Take & Pick Up Cake (কাউন্টার থেকে গ্রহণ)</span>
                    </button>
                  ) : order.status === 'assigned' ? (
                    <div className="space-y-1.5">
                      <button
                        onClick={() => handlePickUp(order.id)}
                        className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
                      >
                        <Package className="w-4 h-4" />
                        <span>Pick Up Cake from Bakery</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenDeliveryModal(order)}
                        className="w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1 border border-emerald-300 transition-colors cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>সরাসরি ডেলিভারি কনফার্ম করুন</span>
                      </button>
                    </div>
                  ) : isPickedUp ? (
                    <div className="space-y-1.5">
                      <button
                        onClick={() => handleStartDelivery(order.id)}
                        className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-md shadow-sky-200 transition-all cursor-pointer"
                      >
                        <Bike className="w-4 h-4" />
                        <span>Start Delivery (Out for Delivery)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenDeliveryModal(order)}
                        className="w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1 border border-emerald-300 transition-colors cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>সরাসরি ডেলিভারি কনফার্ম করুন</span>
                      </button>
                    </div>
                  ) : isOutForDelivery ? (
                    <button
                      onClick={() => handleOpenDeliveryModal(order)}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold py-3.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-200 transition-all cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{dueAmount > 0 ? `ক্যাশ ৳${dueAmount} বুঝে নিয়ে ডেলিভারি করুন` : 'ডেলিভারি সম্পন্ন করুন'}</span>
                    </button>
                  ) : (
                    <div className="bg-emerald-100 text-emerald-800 p-2.5 rounded-xl text-center text-xs font-bold flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Delivered Successfully</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Delivery Confirmation Modal (Cash Confirmation) */}
      {activeDeliveryOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 p-6 space-y-5">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center mx-auto text-2xl font-bold shadow-xs">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">ডেলিভারি নিশ্চিতকরণ</h3>
              <p className="text-xs text-slate-500">
                গ্রাহক: <strong>{activeDeliveryOrder.customer_name}</strong> • অর্ডার #{formatShortOrderNumber(activeDeliveryOrder.order_number)}
              </p>
            </div>

            <form onSubmit={handleConfirmDelivery} className="space-y-4">
              {deliveryError && (
                <div className="bg-red-50 text-red-700 p-3 rounded-xl text-xs flex items-center gap-2 border border-red-200">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{deliveryError}</span>
                </div>
              )}

              {deliverySuccessMessage && (
                <div className="bg-emerald-50 text-emerald-700 p-3 rounded-xl text-xs flex items-center gap-2 border border-emerald-200 font-bold">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{deliverySuccessMessage}</span>
                </div>
              )}

              {(() => {
                const activeDueAmount = activeDeliveryOrder.due_amount !== undefined 
                  ? activeDeliveryOrder.due_amount 
                  : (activeDeliveryOrder.payment_method === 'cod' ? (activeDeliveryOrder.total_amount - (activeDeliveryOrder.advance_paid_amount || 0)) : 0);

                if (activeDueAmount > 0) {
                  return (
                    <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                          <DollarSign className="w-4 h-4 text-amber-700" />
                          ক্যাশ অন ডেলিভারি (Cash to Collect)
                        </span>
                        <span className="text-base font-black text-rose-600 font-mono">
                          {currency}{activeDueAmount}
                        </span>
                      </div>
                      {activeDeliveryOrder.advance_paid_amount && activeDeliveryOrder.advance_paid_amount > 0 ? (
                        <div className="text-[11px] text-emerald-800 bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                          ✓ অগ্রিম পেইড: ৳{activeDeliveryOrder.advance_paid_amount} • অবশিষ্ট ক্যাশ পাওনা: ৳{activeDueAmount}
                        </div>
                      ) : null}
                      <label className="flex items-start gap-2.5 p-3 bg-white rounded-xl border border-amber-300 cursor-pointer text-xs font-semibold text-slate-800 hover:bg-amber-50/50 transition-colors">
                        <input
                          type="checkbox"
                          checked={cashCollectedCheck}
                          onChange={(e) => setCashCollectedCheck(e.target.checked)}
                          className="mt-0.5 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                        <span>
                          আমি গ্রাহকের কাছ থেকে নগদ <strong>{currency}{activeDueAmount}</strong> বুঝে পেয়েছি
                        </span>
                      </label>
                    </div>
                  );
                } else {
                  return (
                    <div className="bg-emerald-50 p-3.5 rounded-xl border border-emerald-200 text-xs text-emerald-900 font-medium">
                      এই অর্ডারের সম্পূর্ণ পেমেন্ট অনলাইনে/বিকাশে আগেই পরিশোধিত। কোনো নগদ টাকা কালেকশন করা লাগবে না। কেক হ্যান্ডওভার করে সরাসরি কনফার্ম করুন।
                    </div>
                  );
                }
              })()}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveDeliveryOrder(null)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  বাতিল (Cancel)
                </button>
                <button
                  type="submit"
                  disabled={(() => {
                    const activeDueAmount = activeDeliveryOrder.due_amount !== undefined 
                      ? activeDeliveryOrder.due_amount 
                      : (activeDeliveryOrder.payment_method === 'cod' ? (activeDeliveryOrder.total_amount - (activeDeliveryOrder.advance_paid_amount || 0)) : 0);
                    return activeDueAmount > 0 && !cashCollectedCheck;
                  })()}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-200 transition-all cursor-pointer"
                >
                  ডেলিভারি সম্পন্ন করুন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cash Deposit Modal */}
      {isDepositModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 p-6 space-y-5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 bg-emerald-100 text-emerald-800 rounded-xl flex items-center justify-center">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">কাউন্টারে ক্যাশ ডিপোজিট</h3>
                  <p className="text-[11px] text-slate-500">রাইডার: রহিম মিয়া (Tangail Express #1)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDepositModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmDeposit} className="space-y-4">
              {depositError && (
                <div className="bg-red-50 text-red-700 p-3 rounded-xl text-xs flex items-center gap-2 border border-red-200">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{depositError}</span>
                </div>
              )}

              {depositSuccessMessage && (
                <div className="bg-emerald-50 text-emerald-800 p-3.5 rounded-xl text-xs flex items-center gap-2 border border-emerald-200 font-bold">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{depositSuccessMessage}</span>
                </div>
              )}

              {/* Current Balance Banner */}
              <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-amber-800 font-bold block">বর্তমানে হাতে থাকা ক্যাশ</span>
                  <span className="text-xs text-slate-600">গ্রাহকদের থেকে সংগৃহীত কিন্তু এখনও জমা হয়নি</span>
                </div>
                <span className="text-xl font-black text-amber-900 font-mono">
                  {currency}{cashSummary.cash_in_hand.toLocaleString()}
                </span>
              </div>

              {/* Deposit Amount Input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">জমার পরিমাণ (Deposit Amount)</label>
                  <button
                    type="button"
                    onClick={() => setDepositAmount(cashSummary.cash_in_hand)}
                    className="text-[11px] text-emerald-700 hover:text-emerald-800 font-bold underline cursor-pointer"
                  >
                    সম্পূর্ণ টাকা জমা দিন ({currency}{cashSummary.cash_in_hand.toLocaleString()})
                  </button>
                </div>

                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                    {currency}
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={cashSummary.cash_in_hand}
                    value={depositAmount || ''}
                    onChange={(e) => setDepositAmount(Math.max(0, Number(e.target.value)))}
                    placeholder="জমার পরিমাণ লিখুন"
                    required
                    className="w-full pl-9 pr-4 py-3 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none text-base font-bold font-mono"
                  />
                </div>
              </div>

              {/* Live Remaining Balance Calculation */}
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-xs space-y-1">
                <div className="flex items-center justify-between text-slate-600">
                  <span>জমার পর অবশিষ্ট ব্যালেন্স থাকবে:</span>
                  <span className={`font-mono font-black text-sm ${
                    Math.max(0, cashSummary.cash_in_hand - depositAmount) === 0 ? 'text-emerald-600' : 'text-slate-800'
                  }`}>
                    {currency}{Math.max(0, cashSummary.cash_in_hand - depositAmount).toLocaleString()}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">
                  {depositAmount >= cashSummary.cash_in_hand
                    ? '✓ সম্পূর্ণ ক্যাশ কাউন্টারে বুঝিয়ে দেওয়া হচ্ছে (ব্যালেন্স শূন্য হবে)'
                    : `✓ ডিপোজিট করার সাথে সাথে রাইডারের ব্যালেন্স থেকে ৳${depositAmount.toLocaleString()} মাইনাস হয়ে যাবে`}
                </p>
              </div>

              {/* Note / Memo */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">মন্তব্য বা নোট (ঐচ্ছিক)</label>
                <input
                  type="text"
                  value={depositNote}
                  onChange={(e) => setDepositNote(e.target.value)}
                  placeholder="যেমন: সন্ধ্যার শিফট ক্যাশ জমা, কাউন্টার ক্যাশিয়ারের কাছে হস্তান্তর"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs outline-none focus:border-emerald-500"
                />
              </div>

              {/* Modal Buttons */}
              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDepositModalOpen(false)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  বাতিল (Cancel)
                </button>
                <button
                  type="submit"
                  disabled={depositAmount <= 0 || depositAmount > cashSummary.cash_in_hand}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-200 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Building2 className="w-4 h-4" />
                  <span>ক্যাশ জমা নিশ্চিত করুন</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Thermal Label Modal */}
      {selectedOrderForSticker && (
        <ThermalBoxStickerModal
          order={selectedOrderForSticker}
          onClose={() => setSelectedOrderForSticker(null)}
          currency={currency}
        />
      )}
    </div>
  );
};
