import React, { useEffect, useRef, useState } from 'react';
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
import { calculateSheetOrderEstimate, createSheetOrderAttempt, submitSheetOrder, SheetOrderSubmissionError, loadConfirmedSheetOrders } from '../services/googleSheetOrders';
import { getPhoneCustomerProfile, loginPhoneCustomer } from '../services/phoneCustomerApi';
import { matchCheckoutCustomer, normalizeCheckoutPhone } from '../services/customerPhoneLookup';
import type { CheckoutCustomerInfo } from '../services/customerPhoneLookup';
import type { SheetOrderAttempt } from '../services/googleSheetOrders';

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
  sheetOrderEndpoint?: string;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = (props) =>
  <CheckoutModalDialog {...props} />;

const CheckoutModalDialog: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  items,
  currency,
  zones,
  slots,
  onOrderSuccess,
  sheetOrderEndpoint,
}) => {
  const isLiveOrder = !!sheetOrderEndpoint;

  // Form State
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [autofillNotice, setAutofillNotice] = useState('');
  const [savedDetailsOpen, setSavedDetailsOpen] = useState(false);
  const [savedDetailsPassword, setSavedDetailsPassword] = useState('');
  const [savedDetailsBusy, setSavedDetailsBusy] = useState(false);
  const [savedDetailsError, setSavedDetailsError] = useState('');
  const ownedCustomerRef = useRef<CheckoutCustomerInfo | null>(null);
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
  const [unconfirmed, setUnconfirmed] = useState(false);
  const orderAttemptRef = useRef<SheetOrderAttempt | null>(null);
  const submissionInFlight = useRef(false);
  const currentPrefillRef = useRef<{name:string;address:string}|null>(null);
  const loadLocalProfile = () => {
    try { const value=JSON.parse(localStorage.getItem('aurora_customer_profile_v1')||'{}');
      return value && typeof value==='object'?value as {name?:string;phone?:string;address?:string}:null;
    } catch {return null;}
  };
  const fillFromPhone = (phone:string, verified?:CheckoutCustomerInfo|null) => {
    const customer=matchCheckoutCustomer(phone,verified?{name:verified.name,phone:verified.phone,address:verified.address}:null,
      loadLocalProfile(),loadConfirmedSheetOrders());
    if(!customer){setAutofillNotice('');return;}
    setCustomerName(previous=>!previous||previous===currentPrefillRef.current?.name?customer.name:previous);
    setDeliveryAddress(previous=>!previous||previous===currentPrefillRef.current?.address?customer.address:previous);
    currentPrefillRef.current={name:customer.name,address:customer.address};
    setAutofillNotice(customer.source==='account'?'Saved phone-account details loaded from Google Sheets.':
      'Your previously saved contact details were found on this device.');
  };
  const onPhoneChanged = (value:string) => {
    const previous=normalizeCheckoutPhone(customerPhone), next=normalizeCheckoutPhone(value);
    if(previous!==next){
      setSavedDetailsError('');
      // An authenticated phone profile is only valid for the original number.
      if(ownedCustomerRef.current && normalizeCheckoutPhone(ownedCustomerRef.current.phone)!==next)
        ownedCustomerRef.current=null;
      // Never keep another phone number's autofilled details attached to a new number.
      if(currentPrefillRef.current){
        const previousFill=currentPrefillRef.current;
        setCustomerName(current=>current===previousFill.name?'':current);
        setDeliveryAddress(current=>current===previousFill.address?'':current);
        currentPrefillRef.current=null;
        setAutofillNotice('');
      }
    }
    setCustomerPhone(value);
    fillFromPhone(value,ownedCustomerRef.current);
  };
  const signInForSavedDetails = async () => {
    if(savedDetailsBusy || !sheetOrderEndpoint)return;
    if(!/^01[3-9]\d{8}$/.test(normalizeCheckoutPhone(customerPhone))){
      setSavedDetailsError('Enter a valid Bangladesh mobile number to access your saved profile.');
      return;
    }
    if(savedDetailsPassword.length<10){
      setSavedDetailsError('Enter the password for this phone account (at least 10 characters).');
      return;
    }
    setSavedDetailsBusy(true);setSavedDetailsError('');
    try{
      const account=await loginPhoneCustomer(sheetOrderEndpoint,customerPhone,savedDetailsPassword);
      if(normalizeCheckoutPhone(account.profile.phone)!==normalizeCheckoutPhone(customerPhone))
        throw new Error('The account phone does not match this checkout number.');
      ownedCustomerRef.current={name:account.profile.name,phone:account.profile.phone,
        address:account.profile.address,source:'account'};
      currentPrefillRef.current={name:account.profile.name,address:account.profile.address};
      setCustomerPhone(account.profile.phone);
      setCustomerName(account.profile.name);
      setDeliveryAddress(account.profile.address);
      setAutofillNotice('Verified! Your saved name and address were loaded from Google Sheets. You can edit them for this order.');
      try{sessionStorage.setItem('aurora_customer_phone_session_v1',account.token);}catch{}
      setSavedDetailsPassword('');setSavedDetailsOpen(false);
    }catch(e){
      setSavedDetailsError(e instanceof Error?e.message:'Could not load saved details. Please check your password.');
    }finally{setSavedDetailsBusy(false);}
  };
  useEffect(()=>{
    if(!isOpen||!sheetOrderEndpoint)return;
    let token='';try{token=sessionStorage.getItem('aurora_customer_phone_session_v1')||'';}catch{}
    if(!token)return;
    let active=true;
    getPhoneCustomerProfile(sheetOrderEndpoint,token).then(profile=>{
      if(!active)return;
      const verified={name:profile.name,phone:profile.phone,address:profile.address,source:'account' as const};
      ownedCustomerRef.current=verified;
      setCustomerPhone(previous=>{
        if(!previous){setCustomerName(n=>n||profile.name);setDeliveryAddress(a=>a||profile.address);
          setAutofillNotice('Your saved phone-account profile was loaded from Google Sheets.');return profile.phone;}
        return previous;
      });
    }).catch(()=>{/* An expired account session must not block guest checkout. */});
    return()=>{active=false;};
  },[isOpen,sheetOrderEndpoint]);
  const closeCheckout = () => { if (!submissionInFlight.current) onClose(); };
  const dialogRef = useCakeDialog(closeCheckout, isOpen);

  const selectedZone = zones.find((zone) => zone.id === selectedZoneId && zone.is_active) || zones.find((zone) => zone.is_active);
  const selectedDeliverySlot = slots.find((slot) => slot.slot_label === selectedSlot && slot.is_active)?.slot_label || slots.find((slot) => slot.is_active)?.slot_label || '';
  const itemsSubtotal = items.reduce((sum, item) => sum + item.total_price, 0);

  const coupon = mockDb.getCoupons().find((item) => item.code.toUpperCase() === appliedCoupon && item.is_active);
  const liveEstimate = isLiveOrder ? calculateSheetOrderEstimate(itemsSubtotal, selectedZone?.delivery_fee ?? 0, coupon) : undefined;
  let estimatedDiscount = liveEstimate?.discount ?? 0;
  if (!isLiveOrder && coupon && itemsSubtotal >= coupon.min_order_amount) {
    estimatedDiscount = coupon.discount_type === 'fixed' ? coupon.discount_value : Math.round(itemsSubtotal * coupon.discount_value / 100);
    if (coupon.max_discount_amount !== undefined) estimatedDiscount = Math.min(estimatedDiscount, coupon.max_discount_amount);
  }
  const estimatedTotal = liveEstimate?.total ?? Math.max(0, itemsSubtotal - estimatedDiscount + (selectedZone?.delivery_fee || 0));

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

  const retryOriginalOrder = async () => {
    const originalAttempt = orderAttemptRef.current;
    if (!originalAttempt || submissionInFlight.current) return;
    submissionInFlight.current = true;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const confirmedOrder = await submitSheetOrder(originalAttempt);
      orderAttemptRef.current = null;
      setUnconfirmed(false);
      onOrderSuccess(confirmedOrder);
      onClose();
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'The original order could not be confirmed.');
      setUnconfirmed(error instanceof SheetOrderSubmissionError && error.ambiguous);
    } finally {
      submissionInFlight.current = false;
      setIsSubmitting(false);
    }
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submissionInFlight.current) return;
    // An uncertain original write must be retried unchanged before consulting refreshed form or catalog data.
    if (unconfirmed && orderAttemptRef.current) { await retryOriginalOrder(); return; }
    setErrorMessage(null);
    setUnconfirmed(false);
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
    submissionInFlight.current = true;
    setIsSubmitting(true);
    try {
      if (sheetOrderEndpoint) {
        orderAttemptRef.current = createSheetOrderAttempt(sheetOrderEndpoint, {
          customer_name: customerName,
          customer_phone: customerPhone,
          delivery_address: deliveryAddress,
          delivery_zone_id: selectedZone.id,
          delivery_slot: selectedDeliverySlot,
          delivery_date: deliveryDate,
          cart_items: items.map(item => ({
            product_id: item.product.id,
            variant_id: item.selected_variant.id,
            ...(item.selected_flavor ? { flavor_id: item.selected_flavor.id } : {}),
            addon_ids: item.selected_addons.map(addon => addon.id),
            writing_message: item.writing_message,
            quantity: item.quantity,
          })),
          ...(appliedCoupon ? { coupon_code: appliedCoupon } : {}),
          ...(orderNote.trim() ? { order_note: orderNote } : {}),
          payment_method: 'cod',
          expected_total: estimatedTotal,
        }, orderAttemptRef.current);
        const confirmedOrder = await submitSheetOrder(orderAttemptRef.current);
        orderAttemptRef.current = null;
        onOrderSuccess(confirmedOrder);
        onClose();
      } else {
        const result = await mockDb.createSecureOrder({
          customer_name: customerName.trim(), customer_phone: customerPhone.trim(), delivery_address: deliveryAddress.trim(),
          delivery_zone_id: selectedZone.id, delivery_slot: selectedDeliverySlot, delivery_date: deliveryDate,
          cart_items: items, coupon_code: appliedCoupon || undefined, order_note: orderNote || undefined,
          payment_method: paymentMethod,
        });
        if (!result.success) throw new Error(result.error || 'The demo order could not be saved on this device.');
        onOrderSuccess({ ...result.order, persistence: 'local_demo' });
        onClose();
      }
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'The order could not be confirmed. Your bag has been kept.');
      setUnconfirmed(error instanceof SheetOrderSubmissionError && error.ambiguous);
    } finally {
      submissionInFlight.current = false;
      setIsSubmitting(false);
    }
  };
  if (!isOpen) return null;
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) closeCheckout(); }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="checkout-title" data-cake-dialog tabIndex={-1}
        className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-rose-100 overflow-hidden my-6 flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-rose-50 to-amber-50 border-b border-rose-100 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-rose-600 bg-rose-100/70 px-2.5 py-0.5 rounded-full">
              {isLiveOrder ? 'Cash-on-delivery checkout' : 'Demo checkout'}
            </span>
            <h3 id="checkout-title" className="text-xl font-bold text-slate-900 mt-1">A little closer to cake</h3>
          </div>
          <button
            onClick={closeCheckout}
            disabled={isSubmitting}
            aria-label="Close checkout"
            className="p-2 rounded-full hover:bg-white text-slate-500 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handlePlaceOrder} className="overflow-y-auto p-6 space-y-6 flex-1">
          <fieldset disabled={isSubmitting || unconfirmed} className="min-w-0 space-y-6 border-0 p-0 m-0">
          <p className="text-xs text-slate-600 bg-rose-50 p-3 rounded-xl">{isLiveOrder ? 'Place your order with the bakery and pay cash on delivery. No online payment is collected. Confirmation appears only after Google Sheets confirms your order was saved.' : 'Live Google Sheets ordering is not activated yet. This demo checkout stays on this device; it is not sent to the bakery and no payment is collected.'}</p>
          {errorMessage && (
            <div role="alert" className="bg-red-50 text-red-700 p-3.5 rounded-xl border border-red-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <div><span>{errorMessage}</span>{unconfirmed && orderAttemptRef.current && <p className="mt-2 text-[11px]">Order reference: <span className="font-mono">{orderAttemptRef.current.request_id}</span>. Use “Retry original order” below to send the exact original cakes, delivery details, quote and reference. Editing is paused until Google Sheets confirms the order or explicitly rejects it.</p>}</div>
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
                  onChange={(e) => onPhoneChanged(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 focus:outline-rose-500 text-slate-800"
                />
              </div>
            </div>

            {autofillNotice && <p role="status" className="text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 p-3 rounded-xl">
              {autofillNotice}
            </p>}
            {isLiveOrder && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-emerald-950 text-sm flex items-center gap-1.5">
                      <ShieldCheck size={16}/> Returning customer?
                    </p>
                    <p className="text-xs text-slate-600">Already have a phone account? Get your saved name and delivery address from Google Sheets.</p>
                  </div>
                  <button type="button" onClick={()=>{setSavedDetailsOpen(v=>!v);setSavedDetailsError('');}}
                    className="rounded-xl bg-emerald-800 px-3 py-2 text-xs font-bold text-white">
                    {savedDetailsOpen?'Hide sign-in':'Use my saved details'}
                  </button>
                </div>
                {savedDetailsOpen&&(
                  <div className="rounded-xl bg-white p-3 space-y-2">
                    <p className="text-xs text-slate-700">Phone number above + your account password are required. Another customer's number alone cannot reveal their address.</p>
                    <label className="block text-xs font-semibold text-slate-700">
                      Phone account password
                      <input type="password" value={savedDetailsPassword} minLength={10} autoComplete="current-password"
                        onChange={e=>setSavedDetailsPassword(e.target.value)}
                        onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void signInForSavedDetails();}}}
                        placeholder="Enter your saved account password" aria-label="Password to load saved customer details"
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"/>
                    </label>
                    <button type="button" disabled={savedDetailsBusy||isSubmitting} onClick={()=>void signInForSavedDetails()}
                      className="w-full rounded-xl bg-emerald-800 text-white font-semibold px-4 py-2 text-sm disabled:opacity-50">
                      {savedDetailsBusy?'Checking Google Sheets…':'Verify & autofill name and address'}
                    </button>
                    {savedDetailsError&&<p role="alert" className="text-xs rounded-lg bg-red-50 text-red-800 p-2">{savedDetailsError}</p>}
                  </div>
                )}
                <p className="text-[11px] text-slate-600">
                  Own-device saved details may autofill automatically. On another device, sign in with Phone + Password.
                  New customer? Create a phone account from <strong>Sign up / My orders</strong>. No SMS or paid service is required.
                </p>
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Detailed Street Address / Landmark</label>
              <textarea
                required
                rows={2}
                aria-label="Street address" autoComplete="street-address"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="House, road, flat number, or a nearby landmark..."
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
              {(isLiveOrder ? [
                { id: 'cod', label: 'Cash on delivery', sub: 'Pay when your order arrives' },
              ] : [
                { id: 'cod', label: 'Cash on delivery', sub: 'Demo selection' },
                { id: 'bkash', label: 'bKash', sub: 'Preview only' },
                { id: 'nagad', label: 'Nagad', sub: 'Preview only' },
                { id: 'card', label: 'Card', sub: 'Preview only' },
              ]).map((method) => {
                const isSelected = (isLiveOrder ? 'cod' : paymentMethod) === method.id;
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
              <span>{isLiveOrder ? 'Have a coupon?' : 'Demo offers: WELCOME100 or BIRTHDAY10'}</span>
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
                Coupon <strong>{appliedCoupon}</strong> {isLiveOrder ? 'included in the estimate; the bakery validates it before saving.' : 'applied to this demo.'}
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
              <span>{isLiveOrder ? 'Estimated total' : 'Preview total'}</span>
              <span className="text-rose-600 text-lg font-black">{currency}{estimatedTotal}</span>
            </div>
          </div>

          {/* Security Guarantee */}
          <div className="flex items-center gap-2 text-[11px] text-slate-500 bg-amber-50/70 p-2.5 rounded-xl border border-amber-200/60">
            <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              {isLiveOrder ? 'The bakery checks current prices and availability before saving. Your receipt shows the confirmed total. No online payment is collected.' : 'Your preview total includes the selected cake, add-ons, delivery, and any eligible demo discount.'}
            </span>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            hidden={unconfirmed}
            disabled={isSubmitting || unconfirmed || !items.length || !selectedZone || !selectedDeliverySlot}
            className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3.5 px-4 rounded-2xl shadow-lg shadow-rose-200 flex items-center justify-center gap-2 text-sm transition-all cursor-pointer active:scale-98 disabled:opacity-50"
          >
            {isSubmitting ? (
              <span>{isLiveOrder ? 'Sending your order and waiting for confirmation...' : 'Saving your demo order...'}</span>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>{isLiveOrder ? 'Place cash-on-delivery order' : 'Save demo order'} — {currency}{estimatedTotal}</span>
              </>
            )}
          </button>
          </fieldset>
          {unconfirmed && orderAttemptRef.current && <div className="space-y-3">
            <p role="status" className="text-xs text-slate-600">The original order is still unconfirmed. This retry uses its saved details and reference even if the current cake collection or delivery options have changed. You can close this window and return without losing that reference.</p>
            <button type="button" onClick={() => { void retryOriginalOrder(); }} disabled={isSubmitting} className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3.5 px-4 rounded-2xl disabled:opacity-50">{isSubmitting ? 'Checking the original order...' : 'Retry original order'}</button>
          </div>}
        </form>
      </div>
    </div>
  );
};
