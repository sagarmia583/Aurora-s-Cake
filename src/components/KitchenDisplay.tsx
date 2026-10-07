import React, { useState } from 'react';
import { 
  ChefHat, 
  Clock, 
  CheckCircle2, 
  Flame, 
  PackageCheck, 
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { Order, OrderStatus } from '../types';
import { mockDb } from '../services/mockDatabase';

interface KitchenDisplayProps {
  orders: Order[];
  currency: string;
}

export const KitchenDisplay: React.FC<KitchenDisplayProps> = ({ orders, currency }) => {
  const [filter, setFilter] = useState<'all' | 'pending_or_confirmed' | 'preparing' | 'ready'>('all');

  const confirmedOrders = orders.filter((o) => o.status === 'confirmed' || o.status === 'pending');
  const preparingOrders = orders.filter((o) => o.status === 'preparing');
  const readyOrders = orders.filter((o) => o.status === 'ready');

  const handleStartBaking = (orderId: string) => {
    mockDb.updateOrderStatus(orderId, 'preparing', 'Kitchen started baking and decoration', 'Kitchen Chef');
  };

  const handleMarkReady = (orderId: string) => {
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

        {/* Live Counters */}
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
              confirmedOrders.map((ord) => (
                <div
                  key={ord.id}
                  className="bg-white rounded-2xl p-4.5 border border-amber-200 shadow-md space-y-3.5 hover:shadow-lg transition-shadow"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-mono text-xs font-bold text-slate-500">
                        #{ord.order_number.slice(-8)}
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

                  {/* Action */}
                  <button
                    onClick={() => handleStartBaking(ord.id)}
                    className="w-full bg-amber-500 hover:bg-amber-600 active:scale-98 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-200 transition-all cursor-pointer"
                  >
                    <Flame className="w-4 h-4" />
                    <span>Commence Baking (Start Preparing)</span>
                  </button>
                </div>
              ))
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
                      <span className="font-mono text-xs font-bold text-rose-600">
                        #{ord.order_number.slice(-8)}
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

                  {/* Action */}
                  <button
                    onClick={() => handleMarkReady(ord.id)}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-200 transition-all cursor-pointer"
                  >
                    <PackageCheck className="w-4 h-4" />
                    <span>Done Baking & Boxed (Mark as Ready)</span>
                  </button>
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
                      <span className="font-mono text-xs font-bold text-slate-500">
                        #{ord.order_number.slice(-8)}
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
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
