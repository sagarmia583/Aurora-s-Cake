import React, { useState } from 'react';
import { useCakeDialog } from './useCakeDialog';
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

const localDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  currency: string;
  zones: DeliveryZone[];
  slots: DeliverySlot[];
  onOrderSuccess: (order: Order) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = (props) =>
  props.isOpen ? <CheckoutModalDialog {...props} /> : null;

const CheckoutModalDialog: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  items,
  currency,
  zones,
  slots,
  onOrderSuccess,
}) => {
  const dialogRef = useCakeDialog(onClose);

  // Form State
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [selectedZoneId, setSelectedZoneId] = useState(zones[0]?.id || '');
  const [selectedSlot, setSelectedSlot] = useState(slots.find((slot) => slot.is_active)?.slot_label || '');
  const [deliveryDate, setDeliveryDate] = useState(() => localDate());
  const [orderNote, setOrderNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cod');

  // Coupon
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  // Submitting
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedZone = zones.find((zone) => zone.id === selectedZoneId && zone.is_active) || zones.find((zone) => zone.is_active);
  const selectedDeliverySlot = slots.find((slot) => slot.slot_label === selectedSlot && slot.is_active)?.slot_label || slots.find((slot) => slot.is_active)?.slot_label || '';
  const itemsSubtotal = items.reduce((sum, item) => sum + item.total_price, 0);

  const coupon = mockDb.getCoupons().find((item) => item.code.toUpperCase() === appliedCoupon && item.is_active);
  let estimatedDiscount = 0;
  if (coupon && itemsSubtotal >= coupon.min_order_amount) {
    estimatedDiscount = coupon.discount_type === 'fixed' ? coupon.discount_value : Math.round(itemsSubtotal * coupon.discount_value / 100);
    if (coupon.max_discount_amount !== undefined) estimatedDiscount = Math.min(estimatedDiscount, coupon.max_discount_amount);
  }
  const estimatedTotal = Math.max(0, itemsSubtotal - estimatedDiscount + (selectedZone?.delivery_fee || 0));

  const handleApplyCoupon = () => {
    setCouponError(null);
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    const match = mockDb.getCoupons().find((item) => item.code.toUpperCase() === code && item.is_active);
    if (!match) {
      setCouponError('This coupon is not available.');
      return;
    }
    if (itemsSubtotal < match.min_order_amount) {
      setCouponError(`Requires a minimum cake subtotal of ${currency}${match.min_order_amount}.`);
      return;
    }
    setAppliedCoupon(code);
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!customerName.trim() || !customerPhone.trim() || !deliveryAddress.trim()) {
      setErrorMessage('Please fill in your name, contact phone, and delivery address.');
      return;
    }

    if (!items.length || !selectedZone || !selectedDeliverySlot) {
      setErrorMessage('Add a cake and choose an available delivery zone and time.');
      return;
    }
    if (!deliveryDate || deliveryDate < localDate()) {
      setErrorMessage('Please choose today or a future delivery date.');
      return;
    }
    const phoneDigits = customerPhone.replace(/\D/g, '');
    if (phoneDigits.length < 7 || phoneDigits.length > 15) {
      setErrorMessage('Please enter a valid contact phone number.');
      return;
    }
    setIsSubmitting(true);
    try {
      // Calls server-authoritative RPC simulation
      const result = await mockDb.createSecureOrder({
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        delivery_address: deliveryAddress.trim(),
        delivery_zone_id: selectedZone.id,
        delivery_slot: selectedDeliverySlot,
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
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="checkout-title" data-cake-dialog tabIndex={-1}
        className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-rose-100 overflow-hidden my-6 flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-rose-50 to-amber-50 border-b border-rose-100 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-rose-600 bg-rose-100/70 px-2.5 py-0.5 rounded-full">
              Preview checkout
            </span>
            <h3 id="checkout-title" className="text-xl font-bold text-slate-900 mt-1">A little closer to cake</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close checkout"
            className="p-2 rounded-full hover:bg-white text-slate-500 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handlePlaceOrder} className="overflow-y-auto p-6 space-y-6 flex-1">
          <p className="text-xs text-slate-600 bg-rose-50 p-3 rounded-xl">This is a demo checkout. Orders are saved on this device only. No payment is taken and no order is sent to the bakery.</p>
          {errorMessage && (
            <div role="alert" className="bg-red-50 text-red-700 p-3.5 rounded-xl border border-red-200 text-xs flex items-center gap-2">
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
                  aria-label="Full name" autoComplete="name" placeholder="Your name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 focus:outline-rose-500 text-slate-800"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">
                  Mobile number
                </label>
                <input
                  type="tel"
                  required
                  aria-label="Mobile number" autoComplete="tel" placeholder="Your contact number"
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
                aria-label="Street address" autoComplete="street-address"
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
              {zones.filter((zone) => zone.is_active).map((zone) => (
                <button type="button" aria-pressed={selectedZone?.id === zone.id}
                  key={zone.id}
                  onClick={() => setSelectedZoneId(zone.id)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all text-left ${
                    selectedZone?.id === zone.id
                      ? 'border-rose-600 bg-rose-50 text-rose-950 font-medium ring-1 ring-rose-400'
                      : 'border-slate-200 hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <div className="text-xs font-bold leading-tight">{zone.name}</div>
                  <div className="text-xs text-rose-600 font-bold mt-1">
                    Fee: {currency}{zone.delivery_fee}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{zone.estimated_time}</div>
                </button>
              ))}
            </div>

            {/* Slots and Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Delivery Date</label>
                <input
                  type="date" required min={localDate()} aria-label="Delivery date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 focus:outline-rose-500 text-slate-800"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Delivery Time Slot</label>
                <select aria-label="Delivery time slot" required
                  value={selectedDeliverySlot}
                  onChange={(e) => setSelectedSlot(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 focus:outline-rose-500 text-slate-800"
                >
                  {slots.filter((slot) => slot.is_active).map((slot) => (
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
                { id: 'cod', label: 'Cash on delivery', sub: 'Demo selection' },
                { id: 'bkash', label: 'bKash', sub: 'Preview only' },
                { id: 'nagad', label: 'Nagad', sub: 'Preview only' },
                { id: 'card', label: 'Card', sub: 'Preview only' },
              ].map((method) => {
                const isSelected = paymentMethod === method.id;
                return (
                  <button
                    key={method.id}
                    type="button"
                    aria-pressed={isSelected}
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
              <span>Demo offers: WELCOME100 or BIRTHDAY10</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                aria-label="Coupon code" placeholder="Enter coupon code"
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
              aria-label="Order note" placeholder="Anything we should know about delivery?"
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
              Your preview total includes the selected cake, add-ons, delivery, and any eligible demo discount.
            </span>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || !items.length || !selectedZone || !selectedDeliverySlot}
            className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3.5 px-4 rounded-2xl shadow-lg shadow-rose-200 flex items-center justify-center gap-2 text-sm transition-all cursor-pointer active:scale-98 disabled:opacity-50"
          >
            {isSubmitting ? (
              <span>Saving your demo order...</span>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Save demo order — {currency}{estimatedTotal}</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
