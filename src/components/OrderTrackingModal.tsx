import React, { useState, useEffect } from 'react';
import { useCakeDialog } from './useCakeDialog';
import { PhoneOrderTracking } from './PhoneOrderTracking';
import { 
  X, 
  CheckCircle2, 
  Circle, 
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
  trackingEndpoint: string;
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
  { status: 'delivered', label: 'Delivered & Celebrated', icon: '🎉', desc: 'Your cake has arrived. Enjoy!' },
];

export const OrderTrackingModal: React.FC<OrderTrackingModalProps> = (props) =>
  props.isOpen ? <OrderTrackingModalDialog {...props} /> : null;

const OrderTrackingModalDialog: React.FC<OrderTrackingModalProps> = ({
  isOpen,
  onClose,
  orders,
  trackingEndpoint,
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
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="tracking-empty-title" data-cake-dialog tabIndex={-1} className="bg-white rounded-3xl p-5 sm:p-8 max-w-lg w-full space-y-4">
          <h3 id="tracking-empty-title" className="text-lg font-bold text-slate-800">Track your order by phone number</h3>
          <PhoneOrderTracking endpoint={trackingEndpoint}/>
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
          <details className="rounded-2xl border border-emerald-200 p-2"><summary className="cursor-pointer text-sm font-bold text-emerald-900 px-2 py-2">Track other orders using only a phone number</summary><PhoneOrderTracking endpoint={trackingEndpoint}/></details>
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

          {selectedOrder.status === 'out_for_delivery' && (
            <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
              Your cake is on the way. No delivery OTP is required. The assigned rider confirms handover and COD collection.
            </p>
          )}
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
