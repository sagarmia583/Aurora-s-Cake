import { shopErrorMessage } from '../utils/shopErrorMessage';
import {formatShortOrderNumber} from '../utils/orderUtils';
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
  Bike,
  Truck,
  Star,
  Camera
} from 'lucide-react';
import { Order, OrderStatus, Review } from '../types';
import { mockDb } from '../services/mockDatabase';

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
  onAddReview?: (review: Omit<Review, 'id' | 'status' | 'created_at'>) => void;
}

const STAGES: { status: OrderStatus; label: string; icon: string; desc: string }[] = [
  { status: 'pending', label: 'Order Placed', icon: '📝', desc: 'Received & awaiting kitchen confirmation' },
  { status: 'confirmed', label: 'Confirmed', icon: '✅', desc: 'Bake schedule locked into production queue' },
  { status: 'preparing', label: 'Baking & Decorating', icon: '👨‍🍳', desc: 'Fresh sponge baking, buttercream whipping' },
  { status: 'ready', label: 'Boxed & Ready', icon: '🎂', desc: 'Inspected, chilled, sealed with quality tag' },
  { status: 'assigned', label: 'Rider Assigned', icon: '🛵', desc: 'Designated express delivery rider' },
  { status: 'picked_up', label: 'Picked Up', icon: '📦', desc: 'Rider dispatched from bakery dispatch' },
  { status: 'out_for_delivery', label: 'Out for Delivery', icon: '🚀', desc: 'Rider on route to your location' },
  { status: 'delivered', label: 'Delivered & Celebrated', icon: '🎉', desc: 'Successfully delivered. Enjoy your cake!' },
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
  onAddReview,
}) => {
  const [recoveryKey,setRecoveryKey]=useState('');
  const [recoveryError,setRecoveryError]=useState('');
  const [restoring,setRestoring]=useState(false);
  const restoreLegacy=async(order:Order)=>{
    if(!onRestoreLegacyAccess||restoring)return;
    setRestoring(true);setRecoveryError('');
    try{await onRestoreLegacyAccess(order,recoveryKey.trim());setRecoveryKey('');}
    catch(error){setRecoveryError(shopErrorMessage(error,'The receipt key could not be verified.'));}
    finally{setRestoring(false);}
  };
  const [selectedOrderId, setSelectedOrderId] = useState(currentOrderId || orders[0]?.id);
  useEffect(() => {
    if (currentOrderId) setSelectedOrderId(currentOrderId);
  }, [currentOrderId]);
  const selectedOrder = orders.find((order) => order.id === selectedOrderId) || orders[0];

  // Review modal state
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewImage, setReviewImage] = useState('');
  const [reviewSuccess, setReviewSuccess] = useState(false);

  const handleReviewImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const dataUrl = uploadEvent.target?.result as string;
      if (dataUrl) setReviewImage(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleTrackReviewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || !reviewComment.trim()) return;
    const firstItem = selectedOrder.items[0];
    const reviewData = {
      product_id: firstItem?.product_id || 'prod-custom',
      product_name: firstItem?.product_name || 'Cake Order',
      customer_name: selectedOrder.customer_name || 'Verified Customer',
      rating: reviewRating,
      comment: reviewComment.trim(),
      image_url: reviewImage.trim() || undefined,
      verified_purchase: true,
    };
    if (onAddReview) {
      onAddReview(reviewData);
    } else {
      mockDb.addReview(reviewData);
    }
    setReviewSuccess(true);
    setTimeout(() => {
      setShowReviewModal(false);
      setReviewSuccess(false);
      setReviewComment('');
      setReviewImage('');
    }, 1500);
  };
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
                #{formatShortOrderNumber(selectedOrder.order_number)}
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
            : null}
          
          {!!syncError && selectedOrder.persistence==='google_sheets'&&
            <p role="alert" className="text-xs rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950">
              {syncError}
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
                  #{formatShortOrderNumber(o.order_number)} ({o.status})
                </button>
              ))}
            </div>
          )}

          {selectedOrder.status === 'out_for_delivery' && (
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-xl shadow-md shrink-0">
                  <Truck className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                    রাইডার আপনার কেক নিয়ে ডেলিভারির পথে!
                  </span>
                  <p className="text-xs text-emerald-900/80 mt-0.5">
                    কেক বুঝে নিয়ে ক্যাশ টাকা প্রদান করুন। 
                  </p>
                </div>
              </div>
              {selectedOrder.payment_method === 'cod' && (
                <div className="bg-white px-4 py-2.5 rounded-xl border border-emerald-300 text-center shrink-0">
                  <span className="text-[10px] text-slate-500 uppercase block font-semibold">ক্যাশ প্রদেয় (Cash)</span>
                  <span className="font-mono text-lg font-black text-rose-600">{currency}{selectedOrder.total_amount}</span>
                </div>
              )}
            </div>
          )}
          {/* Delivered Celebration & Review Prompt */}
          {selectedOrder.status === 'delivered' && (
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-lg shadow-sm shrink-0">
                  <Star className="w-5 h-5 fill-amber-300 text-amber-300" />
                </div>
                <div>
                  <span className="font-bold text-emerald-950 text-sm">কেক ডেলিভারি সফলভাবে সম্পন্ন হয়েছে!</span>
                  <p className="text-xs text-emerald-800">কেমন ছিল আমাদের কেক? আপনার কেকের ছবি ও মূল্যবান মতামত শেয়ার করুন।</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowReviewModal(true)}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-sm transition-all shrink-0 flex items-center gap-1.5 cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>রিভিউ ও ছবি দিন</span>
              </button>
            </div>
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

          {/* Surprise Gift Delivery Banner */}
          {selectedOrder.is_gift && (
            <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-black text-purple-900 flex items-center gap-1.5">
                  <span>🎁</span>
                  <span>সারপ্রাইজ গিফট অর্ডার (Gift Delivery)</span>
                </span>
                {selectedOrder.hide_price_on_box && (
                  <span className="text-[10px] bg-purple-200 text-purple-900 font-bold px-2 py-0.5 rounded-md">
                    ✓ বক্সে দাম গোপন রাখার নির্দেশ
                  </span>
                )}
              </div>
              <p className="text-purple-900 font-medium">
                প্রাপক (Recipient): <strong>{selectedOrder.recipient_name || selectedOrder.customer_name}</strong> ({selectedOrder.recipient_phone || selectedOrder.customer_phone})
              </p>
              {selectedOrder.sender_name && (
                <p className="text-purple-800">
                  উপহার পাঠিয়েছেন: <strong>{selectedOrder.sender_name}</strong> ({selectedOrder.sender_phone || 'গোপন'})
                </p>
              )}
              {selectedOrder.gift_card_message && (
                <div className="bg-white/80 p-2.5 rounded-xl border border-purple-200 italic text-purple-950 font-serif">
                  💌 গ্রিটিং কার্ড বার্তা: "{selectedOrder.gift_card_message}"
                </div>
              )}
            </div>
          )}

          {/* Complimentary Kit Guarantee */}
          {(() => {
            const compSettings = mockDb.getShopSettingsSync();
            const compItems = compSettings?.complimentary_kit_items;
            const itemsText = compItems && compItems.length > 0
              ? compItems.join(' + ')
              : 'কেক কাটার ছুরি + রঙিন মোমবাতি + প্রিমিয়াম বক্স';
            return (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 text-xs flex items-center justify-between text-emerald-950 font-semibold">
                <span className="flex items-center gap-1.5">
                  <span>🎂</span>
                  <span>
                    {compSettings?.complimentary_kit_title || 'ফ্রি কমপ্লিমেন্টারি কিট:'} {itemsText}
                  </span>
                </span>
                <span className="text-emerald-800 text-[10px] bg-emerald-200/80 px-2 py-0.5 rounded-full font-bold">
                  ইনক্লুডেড ✓
                </span>
              </div>
            );
          })()}

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
              {selectedOrder.advance_paid_amount && selectedOrder.advance_paid_amount > 0 ? (
                <div className="text-[11px] text-emerald-700 font-semibold bg-emerald-50 p-1.5 rounded-lg border border-emerald-200">
                  অগ্রিম পেইড: ৳{selectedOrder.advance_paid_amount} {selectedOrder.bkash_trx_id ? `(TrxID: ${selectedOrder.bkash_trx_id})` : ''}
                </div>
              ) : null}
              {(() => {
                const due = selectedOrder.due_amount !== undefined 
                  ? selectedOrder.due_amount 
                  : (selectedOrder.payment_method === 'cod' ? (selectedOrder.total_amount - (selectedOrder.advance_paid_amount || 0)) : 0);
                if (due > 0) {
                  return (
                    <div className="text-xs text-rose-700 font-black">
                      {selectedOrder.cod_collected ? 'ক্যাশ সংগৃহীত' : 'ডেলিভারির সময় প্রদেয় ক্যাশ'}: {currency}{due}
                    </div>
                  );
                } else {
                  return (
                    <div className="text-xs text-emerald-700 font-bold">
                      পেমেন্ট স্ট্যাটাস: সম্পূর্ণ পেইড (৳0 Due)
                    </div>
                  );
                }
              })()}
            </div>
          </div>

          {/* Cake Care Tips */}
          <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-3.5 text-xs text-amber-950 space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-amber-900">
              <span>❄️</span>
              <span>কেক সংরক্ষণ ও পরিবেশন টিপস (Cake Care & Storage)</span>
            </div>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              • ডেলিভারি পাওয়ার পর কেকটি কাটার আগ পর্যন্ত বক্সসহ ফ্রিজে (৪°-৮° সে.) রাখুন।<br/>
              • কাটার ১৫-২০ মিনিট আগে ফ্রিজ থেকে বের করে রাখলে ক্রিম ও স্পঞ্জের সেরা টেক্সচার ও টেস্ট পাওয়া যায়।
            </p>
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

        {/* Delivered Order Review Modal */}
        {showReviewModal && selectedOrder && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-base">আপনার কেকের রিভিউ দিন</h4>
                  <p className="text-xs text-slate-500">অর্ডার #{formatShortOrderNumber(selectedOrder.order_number)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowReviewModal(false)}
                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {reviewSuccess ? (
                <div className="py-6 text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto text-xl font-bold">
                    ✓
                  </div>
                  <h5 className="font-bold text-slate-900 text-sm">ধন্যবাদ!</h5>
                  <p className="text-xs text-slate-500">আপনার রিভিউ এবং কেকের ছবি সফলভাবে জমা হয়েছে।</p>
                </div>
              ) : (
                <form onSubmit={handleTrackReviewSubmit} className="space-y-3.5 text-xs">
                  <div>
                    <span className="text-slate-500 block mb-0.5">কেক আইটেম:</span>
                    <span className="font-bold text-slate-800 text-sm">
                      {selectedOrder.items.map(it => it.product_name).join(', ')}
                    </span>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">রেটিং (Rating)</label>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setReviewRating(star)}
                          className="p-1 hover:scale-110 transition-transform cursor-pointer"
                        >
                          <Star
                            className={`w-6 h-6 ${
                              reviewRating >= star ? 'text-amber-400 fill-amber-400' : 'text-slate-200'
                            }`}
                          />
                        </button>
                      ))}
                      <span className="ml-2 font-bold text-slate-700">{reviewRating} / 5</span>
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">রিভিউ মন্তব্য (Comment)</label>
                    <textarea
                      rows={3}
                      required
                      placeholder="কেকের স্বাদ, ক্রিম, ডেলিভারি ও প্যাকেজিং কেমন ছিল লিখুন..."
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-slate-800 focus:outline-rose-500"
                    />
                  </div>

                  {/* Sold Cake Image Upload */}
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-700 block">
                      কেকের ছবি যোগ করুন (Upload Delivered Cake Photo)
                    </label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl cursor-pointer font-bold flex items-center gap-1.5 transition-colors">
                        <Camera className="w-4 h-4 text-rose-600" />
                        <span>Choose Photo</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleReviewImageUpload}
                          className="hidden"
                        />
                      </label>
                      <span className="text-[11px] text-slate-400">or enter image URL</span>
                    </div>

                    <input
                      type="text"
                      placeholder="https://example.com/cake-photo.jpg"
                      value={reviewImage}
                      onChange={(e) => setReviewImage(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs"
                    />

                    {reviewImage && (
                      <div className="relative inline-block mt-1">
                        <img
                          src={reviewImage}
                          alt="Delivered cake preview"
                          className="w-20 h-20 object-cover rounded-xl border-2 border-rose-300 shadow-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setReviewImage('')}
                          className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowReviewModal(false)}
                      className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
                    >
                      বাতিল
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-md cursor-pointer"
                    >
                      রিভিউ ও ছবি জমা দিন
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

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
