import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  ChefHat, 
  Clock, 
  CheckCircle2, 
  Flame, 
  PackageCheck, 
  Sparkles,
  AlertCircle,
  Printer,
  Layers,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Order, OrderStatus } from '../types';
import { mockDb } from '../services/mockDatabase';
import { ThermalBoxStickerModal } from './ThermalBoxStickerModal';
import { formatShortOrderNumber } from '../utils/orderUtils';
import { 
  isOrderBeepEnabled, 
  setOrderBeepEnabled, 
  playOrderAlertSound, 
  testOrderAlertSound, 
  getOrCreateAudioContext,
  startOrderAlertLoop,
  acknowledgeOrderAlert,
  stopOrderAlertLoop,
  subscribeOrderAlertLoop,
} from '../services/orderSound';

interface KitchenDisplayProps {
  orders: Order[];
  currency: string;
}

export const KitchenDisplay: React.FC<KitchenDisplayProps> = ({ orders, currency }) => {
  const [filter, setFilter] = useState<'all' | 'pending_or_confirmed' | 'preparing' | 'ready'>('all');
  const [selectedOrderForSticker, setSelectedOrderForSticker] = useState<Order | null>(null);
  const [showBatchPlanner, setShowBatchPlanner] = useState(true);
  const [beepEnabled, setBeepEnabled] = useState(() => isOrderBeepEnabled());
  const [unacknowledgedAlertIds, setUnacknowledgedAlertIds] = useState<string[]>([]);
  const [isAlarmRinging, setIsAlarmRinging] = useState(false);

  useEffect(() => {
    return subscribeOrderAlertLoop((isLooping, ids) => {
      setIsAlarmRinging(isLooping);
      setUnacknowledgedAlertIds(ids);
    });
  }, []);

  const isInitialHydrationRef = useRef(true);
  const knownConfirmedIdsRef = useRef<Set<string>>(new Set(orders.filter((o) => o.status === 'confirmed').map((o) => o.id)));

  useEffect(() => {
    if (beepEnabled) {
      getOrCreateAudioContext();
    }
  }, [beepEnabled]);

  const confirmedOrders = orders.filter((o) => o.status === 'confirmed');
  const preparingOrders = orders.filter((o) => o.status === 'preparing');
  const readyOrders = orders.filter((o) => o.status === 'ready');

  useEffect(() => {
    if (isInitialHydrationRef.current) {
      isInitialHydrationRef.current = false;
      knownConfirmedIdsRef.current = new Set(confirmedOrders.map((o) => o.id));
      return;
    }

    const newConfirmed = confirmedOrders.filter((o) => !knownConfirmedIdsRef.current.has(o.id));
    if (newConfirmed.length > 0) {
      newConfirmed.forEach((o) => knownConfirmedIdsRef.current.add(o.id));
      if (beepEnabled) {
        newConfirmed.forEach((o) => {
          startOrderAlertLoop(o.id);
        });
      }
    }
  }, [confirmedOrders, beepEnabled]);

  // Daily Baking Batch Planner Summary
  const batchSummary = useMemo(() => {
    const activeOrders = orders.filter((o) => ['confirmed', 'preparing'].includes(o.status));
    const flavorsMap: Record<string, { count: number; variants: Record<string, number> }> = {};
    const writings: { orderNumber: string; customer: string; message: string; cake: string }[] = [];
    let totalCakes = 0;

    activeOrders.forEach((ord) => {
      ord.items.forEach((it) => {
        totalCakes += it.quantity;
        const flavor = it.flavor_name || 'Standard Vanilla/Chocolate';
        const variant = it.variant_name || 'Standard (1kg)';

        if (!flavorsMap[flavor]) {
          flavorsMap[flavor] = { count: 0, variants: {} };
        }
        flavorsMap[flavor].count += it.quantity;
        flavorsMap[flavor].variants[variant] = (flavorsMap[flavor].variants[variant] || 0) + it.quantity;

        if (it.writing_message) {
          writings.push({
            orderNumber: ord.order_number,
            customer: ord.customer_name,
            message: it.writing_message,
            cake: `${it.product_name} (${variant})`,
          });
        }
      });
    });

    return {
      activeOrdersCount: activeOrders.length,
      totalCakes,
      flavorsMap,
      writings,
    };
  }, [orders]);

  const handleStartBaking = (orderId: string) => {
    acknowledgeOrderAlert(orderId);
    mockDb.updateOrderStatus(orderId, 'preparing', 'Kitchen started baking and decoration', 'Kitchen Chef');
  };

  const handleMarkReady = (orderId: string) => {
    acknowledgeOrderAlert(orderId);
    mockDb.updateOrderStatus(orderId, 'ready', 'Cake baked, cooled, decorated, and boxed in dispatch fridge', 'Kitchen Chef');
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center text-white shadow-lg text-2xl">
            👨‍🍳
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-amber-500/20 text-amber-300 font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                Kitchen Display System (KDS)
              </span>
              <span className="text-xs text-slate-400">Live Production Queue</span>
            </div>
            <h2 className="text-2xl font-black text-white mt-1">Bakery Production Floor</h2>
          </div>
        </div>

        {/* Live Counters & High Sound Controls */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const next = !beepEnabled;
                setOrderBeepEnabled(next);
                setBeepEnabled(next);
                if (next) void playOrderAlertSound(true);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                beepEnabled
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              <span>{beepEnabled ? '🔔 হাই সাউন্ড চালু (Auto ON)' : '🔕 সাউন্ড বন্ধ'}</span>
            </button>
            <button
              type="button"
              onClick={() => void testOrderAlertSound()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold cursor-pointer"
              title="অর্ডার সাউন্ড টেস্ট করুন"
            >
              <span>🔊 টেস্ট সাউন্ড</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-slate-800/80 px-4 py-2 rounded-2xl border border-slate-700 text-center">
              <span className="text-[11px] text-slate-400 block font-semibold">New Queue</span>
              <span className="text-xl font-black text-amber-400">{confirmedOrders.length}</span>
            </div>
            <div className="bg-slate-800/80 px-4 py-2 rounded-2xl border border-slate-700 text-center">
              <span className="text-[11px] text-slate-400 block font-semibold">Baking Now</span>
              <span className="text-xl font-black text-rose-400">{preparingOrders.length}</span>
            </div>
            <div className="bg-slate-800/80 px-4 py-2 rounded-2xl border border-slate-700 text-center">
              <span className="text-[11px] text-slate-400 block font-semibold">Ready Boxed</span>
              <span className="text-xl font-black text-emerald-400">{readyOrders.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Continuous Kitchen Alert Banner */}
      {isAlarmRinging && (
        <div
          role="alert"
          className="bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 text-white p-4 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-3 animate-pulse border-2 border-white/40"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 text-2xl animate-bounce">
              🔔
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-white text-rose-900 font-black text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">
                  কিচেন অ্যালার্ট
                </span>
                <span className="text-xs text-rose-100 font-semibold">
                  {unacknowledgedAlertIds.length > 0 ? `${unacknowledgedAlertIds.length} টি নতুন বেকিং অর্ডার!` : 'নতুন অর্ডার এসেছে!'}
                </span>
              </div>
              <h4 className="text-sm font-black text-white mt-0.5">
                অর্ডারে অথবা নিচে ক্লিক না করা পর্যন্ত সাউন্ড বাজতে থাকবে।
              </h4>
            </div>
          </div>
          <button
            type="button"
            onClick={() => stopOrderAlertLoop()}
            className="px-4 py-2 rounded-xl bg-white text-rose-700 hover:bg-rose-50 font-black text-xs shadow-md cursor-pointer transition-transform active:scale-95 flex items-center gap-1.5"
          >
            <span>🔕 সাউন্ড বন্ধ করুন</span>
          </button>
        </div>
      )}

      {/* Daily Baking Batch Planner (দৈনিক বেকিং প্ল্যানার ও স্পঞ্জ ব্যাচ শিট) */}
      <div className="bg-gradient-to-r from-amber-900/90 via-slate-900 to-rose-950 text-white rounded-3xl p-5 shadow-xl border border-amber-500/30 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center font-bold text-lg border border-amber-500/40">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-amber-400 text-slate-950 font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Kitchen Production Sheet
                </span>
                <span className="text-xs text-amber-200">
                  মোট {batchSummary.totalCakes} টি কেক ওভেন ব্যাচ
                </span>
              </div>
              <h3 className="text-lg font-black text-white mt-0.5">
                দৈনিক বেকিং ব্যাচ প্ল্যানার (Batch Baking Summary)
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowBatchPlanner(!showBatchPlanner)}
            className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-amber-100 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <span>{showBatchPlanner ? 'সংক্ষেপ করুন' : 'বিস্তারিত দেখুন'}</span>
            {showBatchPlanner ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {showBatchPlanner && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 border-t border-white/10 text-xs animate-fade-in">
            {/* Flavor & Size Grouping */}
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10 space-y-2.5">
              <h4 className="font-bold text-amber-300 text-xs flex items-center gap-1.5">
                <span>🎂</span>
                <span>ফ্লেভার ও ওজন অনুযায়ী স্পঞ্জ বেকিং তালিকা ({Object.keys(batchSummary.flavorsMap).length})</span>
              </h4>
              {Object.keys(batchSummary.flavorsMap).length === 0 ? (
                <p className="text-slate-400 text-xs py-2">বর্তমানে কোনো সক্রিয় বেকিং অর্ডার নেই।</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(batchSummary.flavorsMap).map(([flavor, data]) => (
                    <div key={flavor} className="bg-black/30 p-2.5 rounded-xl border border-white/5 flex items-start justify-between">
                      <div>
                        <span className="font-bold text-white text-xs block">{flavor}</span>
                        <div className="flex flex-wrap gap-1.5 mt-1 text-[11px] text-amber-200/80">
                          {Object.entries(data.variants).map(([vName, count]) => (
                            <span key={vName} className="bg-white/10 px-2 py-0.5 rounded-md">
                              {vName}: <strong>{count} টি</strong>
                            </span>
                          ))}
                        </div>
                      </div>
                      <span className="text-xs bg-amber-500/20 text-amber-300 font-mono font-black px-2.5 py-1 rounded-lg border border-amber-500/30">
                        {data.count} Sponge
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cake Dedication Writings */}
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10 space-y-2.5">
              <h4 className="font-bold text-rose-300 text-xs flex items-center gap-1.5">
                <span>✍️</span>
                <span>কেকের লেখার তালিকা (Piping Messages - {batchSummary.writings.length})</span>
              </h4>
              {batchSummary.writings.length === 0 ? (
                <p className="text-slate-400 text-xs py-2">কোনো লেখার মেসেজ নেই।</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {batchSummary.writings.map((w, idx) => (
                    <div key={idx} className="bg-black/30 p-2.5 rounded-xl border border-white/5 space-y-0.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-mono text-slate-400">#{w.orderNumber.slice(-6)} • {w.customer}</span>
                        <span className="text-slate-300 text-[10px]">{w.cake}</span>
                      </div>
                      <div className="font-bold text-amber-200 font-serif text-xs">
                        "{w.message}"
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3-Column Live Board */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: New Confirmed Orders */}
        <div className="bg-amber-50/50 border border-amber-200 rounded-3xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-600" />
              <h3 className="font-black text-amber-950 text-base">New Bakes ({confirmedOrders.length})</h3>
            </div>
            <span className="text-xs bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded-full">
              Incoming
            </span>
          </div>

          <div className="space-y-4">
            {confirmedOrders.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs font-medium">
                No orders waiting to bake
              </div>
            ) : (
              confirmedOrders.map((ord) => {
                const isRinging = unacknowledgedAlertIds.includes(ord.id);
                return (
                  <div
                    key={ord.id}
                    onClick={() => acknowledgeOrderAlert(ord.id)}
                    className={`bg-white rounded-2xl p-4.5 border transition-all cursor-pointer ${
                      isRinging
                        ? 'border-rose-500 bg-rose-50/70 ring-4 ring-rose-400/50 shadow-xl animate-pulse'
                        : 'border-amber-200 shadow-md hover:shadow-lg'
                    } space-y-3.5`}
                  >
                    {isRinging && (
                      <div className="bg-gradient-to-r from-rose-600 to-red-600 text-white px-3 py-1.5 rounded-xl text-xs font-black flex items-center justify-between shadow-sm">
                        <span className="flex items-center gap-1.5">
                          <span className="animate-bounce">🔔</span>
                          <span>নতুন অর্ডার! সাউন্ড থামাতে ক্লিক করুন</span>
                        </span>
                        <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded font-bold">ক্লিক করুন ✕</span>
                      </div>
                    )}
                    <div className="flex justify-between items-start">
                    <div>
                      <span className="font-mono text-xs font-black px-2 py-0.5 rounded-lg bg-slate-900 text-amber-300 shadow-2xs tracking-wider" title={`পুরো অর্ডার নম্বর: #${formatShortOrderNumber(ord.order_number)}`}>
                        #{formatShortOrderNumber(ord.order_number)}
                      </span>
                      <h4 className="font-bold text-slate-900 text-sm mt-0.5">
                        {ord.customer_name}
                      </h4>
                    </div>
                    <span className="text-[11px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-md">
                      Slot: {ord.delivery_slot.split(' ')[0]}
                    </span>
                  </div>

                  {/* Items list */}
                  <div className="space-y-2">
                    {ord.items.map((it) => (
                      <div key={it.id} className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 space-y-1">
                        <div className="flex justify-between items-center text-xs font-bold text-slate-900">
                          <span>{it.product_name}</span>
                          <span className="text-rose-600">{it.variant_name}</span>
                        </div>
                        {it.flavor_name && (
                          <div className="text-[11px] text-slate-600 font-medium">
                            Flavor: <strong className="text-slate-800">{it.flavor_name}</strong>
                          </div>
                        )}
                        {it.writing_message && (
                          <div className="bg-amber-100 text-amber-900 p-2 rounded-lg text-xs font-bold border border-amber-300">
                            ✍️ Cake Writing: "{it.writing_message}"
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {ord.order_note && (
                    <div className="text-[11px] text-slate-500 italic bg-white p-2 rounded-md border border-slate-200">
                      Note: {ord.order_note}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedOrderForSticker(ord)}
                      className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer"
                      title="কেক বক্সের থার্মাল লেবেল প্রিন্ট করুন"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-600" />
                      <span>স্টিকার</span>
                    </button>
                    <button
                      onClick={() => handleStartBaking(ord.id)}
                      className="flex-1 bg-amber-500 hover:bg-amber-600 active:scale-98 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-200 transition-all cursor-pointer"
                    >
                      <Flame className="w-4 h-4" />
                      <span>Commence Baking</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
          </div>
        </div>

        {/* Column 2: Currently Baking / Preparing */}
        <div className="bg-rose-50/50 border border-rose-200 rounded-3xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-rose-600 animate-pulse" />
              <h3 className="font-black text-rose-950 text-base">In the Oven / Frosting ({preparingOrders.length})</h3>
            </div>
            <span className="text-xs bg-rose-200 text-rose-900 font-bold px-2 py-0.5 rounded-full">
              Active
            </span>
          </div>

          <div className="space-y-4">
            {preparingOrders.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs font-medium">
                No orders currently in the oven
              </div>
            ) : (
              preparingOrders.map((ord) => (
                <div
                  key={ord.id}
                  className="bg-white rounded-2xl p-4.5 border-2 border-rose-400 shadow-md space-y-3.5 hover:shadow-lg transition-shadow ring-4 ring-rose-50"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-mono text-xs font-black px-2 py-0.5 rounded-lg bg-rose-900 text-amber-300 shadow-2xs tracking-wider" title={`পুরো অর্ডার নম্বর: #${formatShortOrderNumber(ord.order_number)}`}>
                        #{formatShortOrderNumber(ord.order_number)}
                      </span>
                      <h4 className="font-bold text-slate-900 text-sm mt-0.5">
                        {ord.customer_name}
                      </h4>
                    </div>
                    <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                      <Flame className="w-3 h-3 text-rose-600" /> Baking
                    </span>
                  </div>

                  {/* Items list */}
                  <div className="space-y-2">
                    {ord.items.map((it) => (
                      <div key={it.id} className="bg-rose-50/40 p-2.5 rounded-xl border border-rose-100 space-y-1">
                        <div className="flex justify-between items-center text-xs font-bold text-slate-900">
                          <span>{it.product_name}</span>
                          <span className="text-rose-600">{it.variant_name}</span>
                        </div>
                        {it.flavor_name && (
                          <div className="text-[11px] text-slate-600 font-medium">
                            Flavor: <strong className="text-slate-800">{it.flavor_name}</strong>
                          </div>
                        )}
                        {it.writing_message && (
                          <div className="bg-amber-100 text-amber-900 p-2 rounded-lg text-xs font-black border border-amber-300">
                            ✍️ Cake Writing: "{it.writing_message}"
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedOrderForSticker(ord)}
                      className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer"
                      title="কেক বক্সের থার্মাল লেবেল প্রিন্ট করুন"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-600" />
                      <span>স্টিকার</span>
                    </button>
                    <button
                      onClick={() => handleMarkReady(ord.id)}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-200 transition-all cursor-pointer"
                    >
                      <PackageCheck className="w-4 h-4" />
                      <span>Boxed & Ready</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Column 3: Ready for Dispatch */}
        <div className="bg-emerald-50/50 border border-emerald-200 rounded-3xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PackageCheck className="w-5 h-5 text-emerald-600" />
              <h3 className="font-black text-emerald-950 text-base">Boxed & Chilled ({readyOrders.length})</h3>
            </div>
            <span className="text-xs bg-emerald-200 text-emerald-900 font-bold px-2 py-0.5 rounded-full">
              Ready
            </span>
          </div>

          <div className="space-y-4">
            {readyOrders.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs font-medium">
                No orders waiting for rider pickup
              </div>
            ) : (
              readyOrders.map((ord) => (
                <div
                  key={ord.id}
                  className="bg-white rounded-2xl p-4.5 border border-emerald-200 shadow-md space-y-3 hover:shadow-lg transition-shadow"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-mono text-xs font-black px-2 py-0.5 rounded-lg bg-slate-900 text-amber-300 shadow-2xs tracking-wider" title={`পুরো অর্ডার নম্বর: #${formatShortOrderNumber(ord.order_number)}`}>
                        #{formatShortOrderNumber(ord.order_number)}
                      </span>
                      <h4 className="font-bold text-slate-900 text-sm mt-0.5">
                        {ord.customer_name}
                      </h4>
                    </div>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Inspected
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 bg-emerald-50/60 p-2.5 rounded-xl border border-emerald-100">
                    <div>Address: <strong>{ord.delivery_address}</strong></div>
                    <div>Destination Zone: <strong>{ord.delivery_zone.name}</strong></div>
                  </div>

                  <div className="text-[11px] text-slate-500 italic">
                    Awaiting Delivery Manager or designated Rider to pick up for delivery dispatch.
                  </div>

                  {/* Print Sticker Button */}
                  <button
                    type="button"
                    onClick={() => setSelectedOrderForSticker(ord)}
                    className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-600" />
                    <span>প্রিন্ট বক্স স্টিকার (Print Sticker)</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

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
