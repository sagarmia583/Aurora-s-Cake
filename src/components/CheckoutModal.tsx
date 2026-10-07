import React, { useState } from 'react';
import { 
  X, 
  MapPin, 
  Clock, 
  CreditCard, 
  ShieldCheck, 
  CheckCircle, 
  Tag, 
  AlertCircle,
  Truck,
  Sparkles
} from 'lucide-react';
import { CartItem, DeliveryZone, DeliverySlot, Order, PaymentMethod } from '../types';
import { mockDb } from '../services/mockDatabase';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  currency: string;
  zones: DeliveryZone[];
  slots: DeliverySlot[];
  onOrderSuccess: (order: Order) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  items,
  currency,
  zones,
  slots,
  onOrderSuccess,
}) => {
  if (!isOpen) return null;

  // Form State
  const [customerName, setCustomerName] = useState('Tanvir Rahman');
  const [customerPhone, setCustomerPhone] = useState('01712-345678');
  const [deliveryAddress, setDeliveryAddress] = useState('House #24, Road #3, Akur Takur Para, Tangail');
  const [selectedZoneId, setSelectedZoneId] = useState(zones[0]?.id || '');
  const [selectedSlot, setSelectedSlot] = useState(slots[0]?.slot_label || '04:00 PM - 06:00 PM (Evening Teatime)');
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split('T')[0]);
  const [orderNote, setOrderNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cod');

  // Coupon
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  // Submitting
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedZone = zones.find((z) => z.id === selectedZoneId) || zones[0];
  const itemsSubtotal = items.reduce((sum, item) => sum + item.total_price, 0);

  // Preliminary preview calculation
  let estimatedDiscount = 0;
  if (appliedCoupon === 'WELCOME100' && itemsSubtotal >= 800) estimatedDiscount = 100;
  if (appliedCoupon === 'BIRTHDAY10' && itemsSubtotal >= 1000) estimatedDiscount = Math.round(itemsSubtotal * 0.1);
  if (appliedCoupon === 'SWEETDELIGHT' && itemsSubtotal >= 1500) estimatedDiscount = Math.min(500, Math.round(itemsSubtotal * 0.15));

  const estimatedTotal = Math.max(0, itemsSubtotal - estimatedDiscount + (selectedZone?.delivery_fee || 0));

  const handleApplyCoupon = () => {
    setCouponError(null);
    const code = couponInput.trim().toUpperCase();
    if (!code) return;

    if (code === 'WELCOME100') {
      if (itemsSubtotal < 800) {
        setCouponError('Requires minimum order of ৳800');
        return;
      }
      setAppliedCoupon(code);
    } else if (code === 'BIRTHDAY10') {
      if (itemsSubtotal < 1000) {
        setCouponError('Requires minimum order of ৳1000');
        return;
      }
      setAppliedCoupon(code);
    } else if (code === 'SWEETDELIGHT') {
      if (itemsSubtotal < 1500) {
        setCouponError('Requires minimum order of ৳1500');
        return;
      }
      setAppliedCoupon(code);
    } else {
      setCouponError('Invalid or expired coupon code');
    }
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!customerName.trim() || !customerPhone.trim() || !deliveryAddress.trim()) {
      setErrorMessage('Please fill in your name, contact phone, and delivery address.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Calls server-authoritative RPC simulation
      const result = await mockDb.createSecureOrder({
        customer_name: customerName,
        customer_phone: customerPhone,
        delivery_address: deliveryAddress,
        delivery_zone_id: selectedZoneId || zones[0].id,
        delivery_slot: selectedSlot,
        delivery_date: deliveryDate,
        cart_items: items,
        coupon_code: appliedCoupon || undefined,
        order_note: orderNote || undefined,
        payment_method: paymentMethod,
      });

      if (result.success) {
        onOrderSuccess(result.order);
        onClose();
      } else {
        setErrorMessage(result.error || 'Failed to place order.');
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Order processing error.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div 
        className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-rose-100 overflow-hidden my-6 flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-rose-50 to-amber-50 border-b border-rose-100 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-rose-600 bg-rose-100/70 px-2.5 py-0.5 rounded-full">
              Safe & Tamper-Proof Checkout
            </span>
            <h3 className="text-xl font-bold text-slate-900 mt-1">Delivery & Payment Details</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white text-slate-500 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handlePlaceOrder} className="overflow-y-auto p-6 space-y-6 flex-1">
          {errorMessage && (
            <div className="bg-red-50 text-red-700 p-3.5 rounded-xl border border-red-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Customer Info */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-rose-600" />
              <span>1. Contact & Delivery Location</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 focus:outline-rose-500 text-slate-800"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">
                  Mobile Number (For Delivery OTP)
                </label>
                <input
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 focus:outline-rose-500 text-slate-800"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Detailed Street Address / Landmark</label>
              <textarea
                required
                rows={2}
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="House, road, flat number, nearby school or hospital in Tangail..."
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 focus:outline-rose-500 text-slate-800"
              />
            </div>
          </div>

          {/* Delivery Zone & Slot */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Truck className="w-4 h-4 text-rose-600" />
              <span>2. Delivery Zone & Timing</span>
            </h4>
            
            {/* Zones */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {zones.map((zone) => (
                <div
                  key={zone.id}
                  onClick={() => setSelectedZoneId(zone.id)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all text-left ${
                    selectedZoneId === zone.id
                      ? 'border-rose-600 bg-rose-50 text-rose-950 font-medium ring-1 ring-rose-400'
                      : 'border-slate-200 hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <div className="text-xs font-bold leading-tight">{zone.name}</div>
                  <div className="text-xs text-rose-600 font-bold mt-1">
                    Fee: {currency}{zone.delivery_fee}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{zone.estimated_time}</div>
                </div>
              ))}
            </div>

            {/* Slots and Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Delivery Date</label>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 focus:outline-rose-500 text-slate-800"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Delivery Time Slot</label>
                <select
                  value={selectedSlot}
                  onChange={(e) => setSelectedSlot(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 focus:outline-rose-500 text-slate-800"
                >
                  {slots.map((slot) => (
                    <option key={slot.id} value={slot.slot_label}>
                      {slot.slot_label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Payment Method */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-rose-600" />
              <span>3. Payment Method</span>
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'cod', label: 'Cash on Delivery', sub: 'Pay upon delivery OTP' },
                { id: 'bkash', label: 'bKash', sub: 'Instant mobile wallet' },
                { id: 'nagad', label: 'Nagad', sub: 'Postal digital bank' },
                { id: 'card', label: 'Debit / Card', sub: 'Visa & Mastercard' },
              ].map((method) => {
                const isSelected = paymentMethod === method.id;
                return (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => setPaymentMethod(method.id as PaymentMethod)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-rose-600 bg-rose-50 text-rose-900 ring-1 ring-rose-400 font-bold'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <div className="text-xs">{method.label}</div>
                    <div className="text-[10px] text-slate-500 font-normal mt-0.5">{method.sub}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Coupon Code */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-rose-600" />
              <span>Have a promo coupon? Try: WELCOME100, BIRTHDAY10, SWEETDELIGHT</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter coupon code"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value)}
                className="flex-1 px-3.5 py-2 text-xs rounded-xl border border-slate-200 uppercase tracking-wider font-semibold"
              />
              <button
                type="button"
                onClick={handleApplyCoupon}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Apply
              </button>
            </div>
            {appliedCoupon && (
              <div className="text-xs text-emerald-700 bg-emerald-50 p-2 rounded-lg flex items-center gap-1.5 font-medium">
                <CheckCircle className="w-3.5 h-3.5" />
                Coupon <strong>{appliedCoupon}</strong> successfully applied!
              </div>
            )}
            {couponError && (
              <div className="text-xs text-red-600 bg-red-50 p-2 rounded-lg flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                {couponError}
              </div>
            )}
          </div>

          {/* Special Order Note */}
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">
              Order Note / Special Delivery Instruction (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Please ring doorbell twice, leave with gate security"
              value={orderNote}
              onChange={(e) => setOrderNote(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-rose-500 text-slate-800"
            />
          </div>

          {/* Summary Breakdown */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Items Subtotal</span>
              <span className="font-semibold">{currency}{itemsSubtotal}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Delivery Fee ({selectedZone?.name})</span>
              <span className="font-semibold">{currency}{selectedZone?.delivery_fee}</span>
            </div>
            {estimatedDiscount > 0 && (
              <div className="flex justify-between text-emerald-600 font-semibold">
                <span>Coupon Discount</span>
                <span>-{currency}{estimatedDiscount}</span>
              </div>
            )}
            <hr className="border-slate-200" />
            <div className="flex justify-between text-base font-bold text-slate-900 pt-1">
              <span>Payable Total</span>
              <span className="text-rose-600 text-lg font-black">{currency}{estimatedTotal}</span>
            </div>
          </div>

          {/* Security Guarantee */}
          <div className="flex items-center gap-2 text-[11px] text-slate-500 bg-amber-50/70 p-2.5 rounded-xl border border-amber-200/60">
            <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              <strong>Zero-Trust Security:</strong> Final invoice amount is re-verified and computed directly by PostgreSQL RPC. Client modifications are rejected.
            </span>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3.5 px-4 rounded-2xl shadow-lg shadow-rose-200 flex items-center justify-center gap-2 text-sm transition-all cursor-pointer active:scale-98 disabled:opacity-50"
          >
            {isSubmitting ? (
              <span>Verifying and placing order...</span>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Confirm & Place Order — {currency}{estimatedTotal}</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
