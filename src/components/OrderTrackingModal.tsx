import React, { useState, useEffect } from 'react';
import { useCakeDialog } from './useCakeDialog';
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
  onSelectedOrderChange?: (orderId: string) => void;
  syncing?: boolean;
  syncError?: string;
  checkedAt?: string;
  onRefresh?: () => void;
  onRestoreLegacyAccess?: (order: Order, recoveryKey: string) => Promise<void>;
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

export const OrderTrackingModal: React.FC<OrderTrackingModalProps> = (props) =>
  props.isOpen ? <OrderTrackingModalDialog {...props} /> : null;

const OrderTrackingModalDialog: React.FC<OrderTrackingModalProps> = ({
  isOpen,
  onClose,
  orders,
  currentOrderId,
  currency,
  onReorder,
  onSelectedOrderChange,
  syncing=false,
  syncError='',
  checkedAt='',
  onRefresh,
  onRestoreLegacyAccess,
}) => {
  const [recoveryKey,setRecoveryKey]=useState('');
  const [recoveryError,setRecoveryError]=useState('');
  const [restoring,setRestoring]=useState(false);
  const [copiedReceipt,setCopiedReceipt]=useState(false);
  const restoreLegacy=async(order:Order)=>{
    if(!onRestoreLegacyAccess||restoring)return;
    setRestoring(true);setRecoveryError('');
    try{await onRestoreLegacyAccess(order,recoveryKey.trim());setRecoveryKey('');}
    catch(error){setRecoveryError(error instanceof Error?error.message:'The private receipt key could not be verified.');}
    finally{setRestoring(false);}
  };
  const [selectedOrderId, setSelectedOrderId] = useState(currentOrderId || orders[0]?.id);
  useEffect(() => {
    if (currentOrderId) setSelectedOrderId(currentOrderId);
  }, [currentOrderId]);
  const selectedOrder = orders.find((order) => order.id === selectedOrderId) || orders[0];
  const dialogRef = useCakeDialog(onClose, selectedOrder?.id);

  if (!selectedOrder) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="tracking-empty-title" data-cake-dialog tabIndex={-1} className="bg-white rounded-3xl p-8 max-w-md w-full text-center space-y-4">
          <div className="text-4xl">🎂</div>
          <h3 id="tracking-empty-title" className="text-lg font-bold text-slate-800">Your cake journey starts here</h3>
          <p className="text-xs text-slate-500">
            Choose a cake and open checkout. Order receipts from this device appear here.
          </p>
          <button
            onClick={onClose}
            aria-label="Close order tracking"
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
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="tracking-title" data-cake-dialog tabIndex={-1}
        className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-rose-100 overflow-hidden my-6 flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-rose-50 via-pink-50 to-amber-50 border-b border-rose-100 flex items-center justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-600 bg-rose-100 px-2.5 py-0.5 rounded-full">
                {selectedOrder.persistence === 'google_sheets' ? 'Order saved' : 'Demo order tracking'}
              </span>
              <span className="text-xs text-slate-400 font-medium break-all">
                #{selectedOrder.order_number}
              </span>
            </div>
            <h3 id="tracking-title" className="text-xl font-bold text-slate-900 mt-1">{selectedOrder.persistence === 'google_sheets' ? 'Your order receipt' : 'Your cake journey'}</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close order tracking"
            className="p-2 rounded-full hover:bg-white text-slate-500 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-6 space-y-6 flex-1">
          {selectedOrder.persistence==='google_sheets'?
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50 p-3 border border-emerald-100">
              <div>
                <p className="text-xs font-semibold text-emerald-900">Live delivery status {syncing?'· Checking…':'· '+(checkedAt?'Checked '+checkedAt:'Not checked yet')}</p>
                <p className="text-xs text-slate-600">Delivery progress refreshes automatically while this page is open.</p>
              </div>
              {onRefresh&&<button type="button" onClick={onRefresh} disabled={syncing}
                className="rounded-xl bg-white border border-emerald-200 px-3 py-2 text-xs font-semibold flex gap-2 items-center disabled:opacity-50">
                <RotateCcw size={14}/> {syncing?'Updating…':'Refresh now'}
              </button>}
            </div>
            :<p className="text-xs text-slate-600 bg-rose-50 p-3 rounded-xl">This is a demo order saved on this device, not a real bakery delivery.</p>}
          {selectedOrder.persistence==='google_sheets'&&!!selectedOrder.customer_access_token&&
            <div className="rounded-xl border border-slate-200 p-3 bg-slate-50 flex flex-wrap gap-3 items-center justify-between">
              <div>
                <strong className="block text-sm text-slate-900">Keep your private recovery receipt</strong>
                <p className="text-xs text-slate-600">Use this on another device without a password. Don't share it publicly.</p>
              </div>
              <button type="button" className="rounded-lg border bg-white px-3 py-2 text-xs font-semibold"
                onClick={()=>void navigator.clipboard.writeText(
                  'Order ID: '+selectedOrder.id+'\nPhone: '+selectedOrder.customer_phone+
                  '\nPrivate receipt key: '+selectedOrder.customer_access_token
                ).then(()=>setCopiedReceipt(true)).catch(()=>setCopiedReceipt(false))}>
                {copiedReceipt?'Copied recovery details':'Copy private receipt'}
              </button>
            </div>}
          {!!syncError && selectedOrder.persistence==='google_sheets'&&
            <p role="alert" className="text-xs rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950">
              Live delivery status could not be refreshed: {syncError}. Showing the last confirmed status.
            </p>}
          {selectedOrder.status === 'cancelled' && <p role="status" className="text-sm font-semibold text-red-700">This order was cancelled.</p>}
          {/* Order Selector Tab if multiple */}
          {orders.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2 border-b border-slate-100">
              {orders.map((o) => (
                <button
                  key={o.id}
                  onClick={() => { setSelectedOrderId(o.id); onSelectedOrderChange?.(o.id); }} aria-pressed={selectedOrder.id === o.id}
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

          {selectedOrder.persistence==='google_sheets'&&selectedOrder.status==='out_for_delivery'&&
            !selectedOrder.customer_access_token&&!selectedOrder.delivery_otp&&onRestoreLegacyAccess&&(
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-2">
              <p className="font-bold text-amber-950">Older receipt: verify access to display your delivery code</p>
              <p className="text-xs text-amber-900">
                This order was placed before secure receipt keys were introduced. Contact the shop using its published contact details.
                After the shop owner independently verifies you, paste the private recovery key they provide here.
                An order number and phone number alone cannot unlock an OTP.
              </p>
              <form onSubmit={e=>{e.preventDefault();void restoreLegacy(selectedOrder);}} className="flex flex-wrap gap-2">
                <input type="text" autoComplete="off" required value={recoveryKey} onChange={e=>setRecoveryKey(e.target.value)}
                  aria-label="Private legacy receipt recovery key" placeholder="Private receipt recovery key"
                  className="rounded-xl border bg-white p-2 text-xs flex-1 min-w-44" />
                <button type="submit" disabled={restoring} className="rounded-xl bg-amber-800 text-white p-2 text-sm disabled:opacity-50">
                  {restoring?'Verifying…':'Restore secure receipt'}
                </button>
              </form>
              {recoveryError&&<p role="alert" className="text-xs text-red-700">{recoveryError}</p>}
            </div>
          )}
          {/* Only the original receipt holder or linked account sees the code after dispatch. */}
          {selectedOrder.persistence==='google_sheets'&&selectedOrder.status!=='out_for_delivery'
            &&selectedOrder.status!=='delivered'&&selectedOrder.status!=='cancelled'&&
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              <Key size={16} className="inline mr-2"/>Your delivery code will appear here automatically when your rider starts delivery. Do not share it before receiving your order.
            </p>}
          {(selectedOrder.persistence !== 'google_sheets' || selectedOrder.status === 'out_for_delivery') && (
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
              {selectedOrder.delivery_otp || 'Code not loaded yet'}
            </div>
          </div>

          )}
          {selectedOrder.persistence==='google_sheets' && selectedOrder.status==='out_for_delivery' &&
            !selectedOrder.delivery_otp && !!selectedOrder.customer_access_token &&
            <p role="status" className="text-sm rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900">
              Your rider has started delivery, but this browser has not received the OTP yet.
              Tap <strong>Refresh now</strong>. If it remains unavailable, sign in under
              <strong> Sign up / My orders</strong> to recover your linked receipt, or contact the shop.
              Never share your password or private receipt key with the rider.
            </p>}
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
                Rider: <strong>{selectedOrder.rider_name || 'No rider assigned'}</strong>
              </p>
              <div className="text-[11px] text-slate-500">
                Payment: <strong className="uppercase">{selectedOrder.payment_method}</strong> ({selectedOrder.payment_status})
              </div>
              {selectedOrder.payment_method === 'cod' && (
                <div className="text-[11px] text-amber-700 font-bold">
                  {selectedOrder.cod_collected ? 'Cash collected' : 'Cash to collect'}: {currency}{selectedOrder.total_amount}
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
            {selectedOrder.persistence === 'google_sheets' ? 'Order total' : 'Demo order total'}: <strong className="text-slate-800 text-sm">{currency}{selectedOrder.total_amount}</strong>
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
