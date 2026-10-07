import React, { useState } from 'react';
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
  Package
} from 'lucide-react';
import { Order } from '../types';
import { mockDb } from '../services/mockDatabase';

interface DeliveryRiderPortalProps {
  orders: Order[];
  currency: string;
}

export const DeliveryRiderPortal: React.FC<DeliveryRiderPortalProps> = ({ orders, currency }) => {
  // Active Rider deliveries: orders that are ready, assigned, picked up, or out_for_delivery
  const riderDeliveries = orders.filter(
    (o) =>
      o.status === 'ready' ||
      o.status === 'assigned' ||
      o.status === 'picked_up' ||
      o.status === 'out_for_delivery' ||
      (o.status === 'delivered' && o.rider_id === 'rider-1')
  );

  // OTP Modal State
  const [activeOtpOrder, setActiveOtpOrder] = useState<Order | null>(null);
  const [enteredOtp, setEnteredOtp] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSuccessMessage, setOtpSuccessMessage] = useState<string | null>(null);

  const handlePickUp = (orderId: string) => {
    mockDb.updateOrderStatus(orderId, 'picked_up', 'Picked up by rider from bakery counter', 'Rahim Mia (Rider)');
  };

  const handleStartDelivery = (orderId: string) => {
    mockDb.updateOrderStatus(orderId, 'out_for_delivery', 'Rider is out for express delivery to customer doorstep', 'Rahim Mia (Rider)');
  };

  const handleOpenOtpModal = (order: Order) => {
    setActiveOtpOrder(order);
    setEnteredOtp('');
    setOtpError(null);
    setOtpSuccessMessage(null);
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOtpOrder) return;

    const result = mockDb.verifyDeliveryOTP(activeOtpOrder.id, enteredOtp, 'Rahim Mia (Rider #1)');
    if (result.success) {
      setOtpSuccessMessage(result.message);
      setTimeout(() => {
        setActiveOtpOrder(null);
        setOtpSuccessMessage(null);
      }, 1500);
    } else {
      setOtpError(result.message);
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
                    <span className="font-mono text-xs font-bold text-slate-400">
                      #{order.order_number}
                    </span>
                    <h3 className="font-bold text-slate-900 text-base mt-0.5">
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
                    <span className="text-slate-600 text-[11px]">
                      {order.payment_method === 'cod' ? 'Cash Collection on Doorstep' : 'Pre-paid Online'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-base font-black text-amber-900">
                      {currency}{order.total_amount}
                    </span>
                    {order.cod_collected && (
                      <span className="text-[10px] text-emerald-600 font-bold block flex items-center justify-end gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Cash Collected
                      </span>
                    )}
                  </div>
                </div>

                {/* Quick Action Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <a
                    href={`tel:${order.customer_phone}`}
                    className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2.5 rounded-xl text-xs transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Call Customer</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => alert(`Opening GPS navigation route for ${order.delivery_address}...`)}
                    className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-sky-600" />
                    <span>Open Maps</span>
                  </button>
                </div>

                {/* Status Transitions */}
                <div className="pt-1">
                  {order.status === 'ready' || order.status === 'assigned' ? (
                    <button
                      onClick={() => handlePickUp(order.id)}
                      className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
                    >
                      <Package className="w-4 h-4" />
                      <span>Pick Up Cake from Bakery</span>
                    </button>
                  ) : isPickedUp ? (
                    <button
                      onClick={() => handleStartDelivery(order.id)}
                      className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-md shadow-sky-200 transition-all cursor-pointer"
                    >
                      <Bike className="w-4 h-4" />
                      <span>Start Delivery (Out for Delivery)</span>
                    </button>
                  ) : isOutForDelivery ? (
                    <button
                      onClick={() => handleOpenOtpModal(order)}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold py-3.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-200 transition-all cursor-pointer"
                    >
                      <Key className="w-4 h-4" />
                      <span>Verify Customer OTP & Mark Delivered</span>
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

      {/* Delivery OTP Verification Modal */}
      {activeOtpOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 p-6 space-y-5">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center mx-auto text-2xl font-bold shadow-xs">
                <Key className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Enter Customer Delivery OTP</h3>
              <p className="text-xs text-slate-500">
                Ask <strong>{activeOtpOrder.customer_name}</strong> for their 4-digit security code from their order tracking screen.
              </p>
            </div>

            <form onSubmit={handleVerifyOtp} className="space-y-4">
              {otpError && (
                <div className="bg-red-50 text-red-700 p-3 rounded-xl text-xs flex items-center gap-2 border border-red-200">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{otpError}</span>
                </div>
              )}

              {otpSuccessMessage && (
                <div className="bg-emerald-50 text-emerald-700 p-3 rounded-xl text-xs flex items-center gap-2 border border-emerald-200 font-bold">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{otpSuccessMessage}</span>
                </div>
              )}

              <div>
                <input
                  type="text"
                  maxLength={4}
                  autoFocus
                  placeholder="• • • •"
                  value={enteredOtp}
                  onChange={(e) => setEnteredOtp(e.target.value.replace(/\D/g, ''))}
                  className="w-full text-center tracking-[1em] font-mono text-3xl font-black py-3 rounded-2xl border-2 border-slate-300 focus:border-emerald-500 focus:outline-hidden text-slate-900"
                />
              </div>

              {activeOtpOrder.payment_method === 'cod' && (
                <div className="bg-amber-50 p-3.5 rounded-xl border border-amber-200 text-xs space-y-1">
                  <div className="font-bold text-amber-900 flex items-center gap-1">
                    <DollarSign className="w-4 h-4 text-amber-700" />
                    <span>Cash on Delivery Collection</span>
                  </div>
                  <p className="text-amber-800 text-[11px]">
                    Collect exactly <strong>{currency}{activeOtpOrder.total_amount}</strong> before completing OTP confirmation.
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveOtpOrder(null)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={enteredOtp.length < 4}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-200 transition-all cursor-pointer"
                >
                  Confirm Delivery
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
