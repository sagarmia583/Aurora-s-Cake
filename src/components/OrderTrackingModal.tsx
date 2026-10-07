import React, { useState } from 'react';
import { 
  X, 
  CheckCircle2, 
  Circle, 
  Key, 
  MapPin, 
  Clock, 
  Phone, 
  Receipt,
  RotateCcw,
  Bike
} from 'lucide-react';
import { Order, OrderStatus } from '../types';

interface OrderTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
  currentOrderId?: string;
  currency: string;
  onReorder?: (order: Order) => void;
}

const STAGES: { status: OrderStatus; label: string; icon: string; desc: string }[] = [
  { status: 'pending', label: 'Order Placed', icon: '📝', desc: 'Received & awaiting kitchen confirmation' },
  { status: 'confirmed', label: 'Confirmed', icon: '✅', desc: 'Bake schedule locked into production queue' },
  { status: 'preparing', label: 'Baking & Decorating', icon: '👨‍🍳', desc: 'Fresh sponge baking, buttercream whipping' },
  { status: 'ready', label: 'Boxed & Ready', icon: '🎂', desc: 'Inspected, chilled, sealed with quality tag' },
  { status: 'assigned', label: 'Rider Assigned', icon: '🛵', desc: 'Designated express delivery rider' },
  { status: 'picked_up', label: 'Picked Up', icon: '📦', desc: 'Rider dispatched from bakery dispatch' },
  { status: 'out_for_delivery', label: 'Out for Delivery', icon: '🚀', desc: 'Rider on route to your location' },
  { status: 'delivered', label: 'Delivered & Celebrated', icon: '🎉', desc: 'Verified via OTP. Enjoy your cake!' },
];

export const OrderTrackingModal: React.FC<OrderTrackingModalProps> = ({
  isOpen,
  onClose,
  orders,
  currentOrderId,
  currency,
  onReorder,
}) => {
  if (!isOpen) return null;

  const [selectedOrder, setSelectedOrder] = useState<Order>(() => {
    if (currentOrderId) {
      const match = orders.find((o) => o.id === currentOrderId);
      if (match) return match;
    }
    return orders[0];
  });

  if (!selectedOrder) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center space-y-4">
          <div className="text-4xl">🎂</div>
          <h3 className="text-lg font-bold text-slate-800">No Orders Found Yet</h3>
          <p className="text-xs text-slate-500">
            Browse our artisanal cakes, customize flavors, and place an order to track live baking and rider progress!
          </p>
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-rose-600 text-white font-bold rounded-xl text-sm"
          >
            Back to Cakes
          </button>
        </div>
      </div>
    );
  }

  // Calculate current stage index
  const stageOrder: OrderStatus[] = [
    'pending',
    'confirmed',
    'preparing',
    'ready',
    'assigned',
    'picked_up',
    'out_for_delivery',
    'delivered',
  ];

  const currentStageIndex = stageOrder.indexOf(selectedOrder.status);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div 
        className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-rose-100 overflow-hidden my-6 flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-rose-50 via-pink-50 to-amber-50 border-b border-rose-100 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-600 bg-rose-100 px-2.5 py-0.5 rounded-full">
                Real-Time Order Tracking
              </span>
              <span className="text-xs text-slate-400 font-medium">
                #{selectedOrder.order_number}
              </span>
            </div>
            <h3 className="text-xl font-bold text-slate-900 mt-1">Live Cake Journey</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white text-slate-500 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-6 space-y-6 flex-1">
          {/* Order Selector Tab if multiple */}
          {orders.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2 border-b border-slate-100">
              {orders.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setSelectedOrder(o)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    selectedOrder.id === o.id
                      ? 'bg-rose-600 text-white'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  #{o.order_number.slice(-5)} ({o.status})
                </button>
              ))}
            </div>
          )}

          {/* Delivery OTP Security Card */}
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-xl shadow-md">
                <Key className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
                  Your Delivery Verification OTP
                </span>
                <p className="text-xs text-amber-900/80">
                  Provide this 4-digit secret code to the delivery rider only after receiving your cake package.
                </p>
              </div>
            </div>
            <div className="bg-white px-5 py-2.5 rounded-xl border-2 border-amber-400 font-mono text-2xl font-black text-amber-900 tracking-widest shadow-sm">
              {selectedOrder.delivery_otp}
            </div>
          </div>

          {/* 8-Stage Visual Progress Timeline */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-slate-900">Cake Production & Delivery Pipeline</h4>
            <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {STAGES.map((st, idx) => {
                const isPassed = currentStageIndex >= idx;
                const isCurrent = currentStageIndex === idx;

                return (
                  <div key={st.status} className="relative flex items-start gap-4">
                    {/* Step Dot */}
                    <div
                      className={`absolute -left-6 top-0.5 w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all ${
                        isCurrent
                          ? 'bg-rose-600 border-rose-600 text-white ring-4 ring-rose-100 scale-110'
                          : isPassed
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'bg-white border-slate-300 text-slate-300'
                      }`}
                    >
                      {isPassed ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <Circle className="w-2.5 h-2.5 fill-current" />
                      )}
                    </div>

                    <div className="flex-1 bg-slate-50/70 p-3 rounded-xl border border-slate-100">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{st.icon}</span>
                          <span
                            className={`text-xs font-bold ${
                              isCurrent
                                ? 'text-rose-600'
                                : isPassed
                                ? 'text-slate-900'
                                : 'text-slate-400'
                            }`}
                          >
                            {st.label}
                          </span>
                        </div>
                        {isCurrent && (
                          <span className="text-[10px] bg-rose-100 text-rose-700 font-bold px-2 py-0.5 rounded-full animate-pulse">
                            Active Step
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">{st.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Delivery & Rider Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2 text-xs">
              <h5 className="font-bold text-slate-800 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-rose-600" /> Destination
              </h5>
              <p className="text-slate-600">{selectedOrder.delivery_address}</p>
              <div className="text-[11px] text-slate-500 font-medium">
                Zone: {selectedOrder.delivery_zone.name}
              </div>
              <div className="text-[11px] text-slate-500">
                Slot: {selectedOrder.delivery_slot}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2 text-xs">
              <h5 className="font-bold text-slate-800 flex items-center gap-1.5">
                <Bike className="w-3.5 h-3.5 text-rose-600" /> Rider & Payment
              </h5>
              <p className="text-slate-600">
                Rider: <strong>{selectedOrder.rider_name || 'Assigning nearest available courier...'}</strong>
              </p>
              <div className="text-[11px] text-slate-500">
                Payment: <strong className="uppercase">{selectedOrder.payment_method}</strong> ({selectedOrder.payment_status})
              </div>
              {selectedOrder.payment_method === 'cod' && (
                <div className="text-[11px] text-amber-700 font-bold">
                  Cash to Collect: {currency}{selectedOrder.total_amount}
                </div>
              )}
            </div>
          </div>

          {/* Items Summary */}
          <div className="space-y-2">
            <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Ordered Cakes & Add-ons
            </h5>
            <div className="space-y-2">
              {selectedOrder.items.map((it) => (
                <div
                  key={it.id}
                  className="p-3 rounded-xl border border-slate-100 bg-white flex items-center justify-between text-xs"
                >
                  <div>
                    <h6 className="font-bold text-slate-800">{it.product_name}</h6>
                    <span className="text-slate-500 font-medium">{it.variant_name}</span>
                    {it.flavor_name && <span className="text-slate-400"> • {it.flavor_name}</span>}
                    {it.writing_message && (
                      <div className="text-[11px] text-rose-600 font-medium mt-0.5">
                        Dedication: "{it.writing_message}"
                      </div>
                    )}
                  </div>
                  <div className="font-bold text-rose-600 text-sm">
                    {currency}{it.subtotal}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
          <div className="text-slate-500">
            Total Paid/Payable: <strong className="text-slate-800 text-sm">{currency}{selectedOrder.total_amount}</strong>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-colors cursor-pointer"
          >
            Close Tracker
          </button>
        </div>
      </div>
    </div>
  );
};
