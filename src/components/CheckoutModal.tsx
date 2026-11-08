import { shopErrorMessage } from '../utils/shopErrorMessage';
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Sparkles,
  ShoppingBag,
  Gift,
  Copy,
  Check
} from 'lucide-react';
import { CartItem, DeliveryZone, DeliverySlot, Order, PaymentMethod } from '../types';
import { mockDb, validateCoupon } from '../services/mockDatabase';
import { CheckoutProductGiftNote } from './CheckoutProductGiftNote';
import { calculateSheetOrderEstimate, createSheetOrderAttempt, submitSheetOrder, SheetOrderSubmissionError, loadConfirmedSheetOrders } from '../services/googleSheetOrders';
import { getPhoneCustomerProfile } from '../services/phoneCustomerApi';
import { matchCheckoutCustomer, normalizeCheckoutPhone } from '../services/customerPhoneLookup';
import type { CheckoutCustomerInfo } from '../services/customerPhoneLookup';
import { getSavedCustomer, saveCustomerInfo } from '../services/customerDirectory';
import type { SheetOrderAttempt, SheetOrderDraft } from '../services/googleSheetOrders';
import { captureCheckoutCart, inspectPendingCheckout, preservePendingCheckout, releasePendingCheckout, PendingCheckoutConflict } from '../services/checkoutRecovery';
import type { CheckoutCompletion, CheckoutRecovery, PendingCheckout } from '../services/checkoutRecovery';
import { limitBangladeshiPhoneInput, validateBangladeshiPhone } from '../utils/phoneValidation';
import { deliverySlotOpen, deliveryToday as localDate } from '../../apps/staff-mobile/src/deliverySlot';


interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  currency: string;
  zones: DeliveryZone[];
  slots: DeliverySlot[];
  onOrderSuccess: (order: Order, completion?: CheckoutCompletion) => void;
  sheetOrderEndpoint?: string;
  orderingPaused?: boolean;
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
  orderingPaused = false,
}) => {
  const [initialRecovery] = useState<CheckoutRecovery>(() => sheetOrderEndpoint ? inspectPendingCheckout(sheetOrderEndpoint) : { status: 'empty' });
  const recovered = initialRecovery.status === 'ready' ? initialRecovery.pending : null;
  const recoveredDraft = recovered ? JSON.parse(recovered.attempt.body) as SheetOrderDraft : null;
  // Capture the intent on first opening. Losing the public enabled flag must never
  // turn an existing real order into a successful device-only demo.
  const checkoutTargetRef = useRef<{ endpoint?: string } | null>(null);
  if (isOpen && !checkoutTargetRef.current) checkoutTargetRef.current = { endpoint: sheetOrderEndpoint };
  const liveOrderEndpoint = checkoutTargetRef.current?.endpoint;
  const isLiveOrder = !!liveOrderEndpoint;
  const liveOrderingPaused = isLiveOrder && (orderingPaused || !sheetOrderEndpoint);

  // Form State
  const [customerName, setCustomerName] = useState(recoveredDraft?.customer_name || '');
  const [customerPhone, setCustomerPhone] = useState(limitBangladeshiPhoneInput(recoveredDraft?.customer_phone || ''));
  const currentPhoneRef = useRef(customerPhone);
  currentPhoneRef.current=customerPhone;
  const [autofillNotice, setAutofillNotice] = useState('');
  const ownedCustomerRef = useRef<CheckoutCustomerInfo | null>(null);
  const [deliveryAddress, setDeliveryAddress] = useState(recoveredDraft?.delivery_address || '');
  const [selectedZoneId, setSelectedZoneId] = useState(recoveredDraft?.delivery_zone_id || zones[0]?.id || '');
  const [selectedSlot, setSelectedSlot] = useState(recoveredDraft?.delivery_slot || '');
  const [deliveryDate, setDeliveryDate] = useState(() => recoveredDraft?.delivery_date || localDate());
  const [orderNote, setOrderNote] = useState(recoveredDraft?.order_note || '');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cod');

  // Gift & Surprise Delivery State
  const [isGift, setIsGift] = useState(recoveredDraft?.is_gift === true);
  const [recipientName, setRecipientName] = useState(recoveredDraft?.recipient_name || '');
  const [recipientPhone, setRecipientPhone] = useState(limitBangladeshiPhoneInput(recoveredDraft?.recipient_phone || ''));
  const [senderName, setSenderName] = useState(recoveredDraft?.sender_name || '');
  const [senderPhone, setSenderPhone] = useState(limitBangladeshiPhoneInput(recoveredDraft?.sender_phone || ''));
  const [hidePriceOnBox, setHidePriceOnBox] = useState(recoveredDraft?.hide_price_on_box !== false);
  const [giftCardMessage, setGiftCardMessage] = useState(recoveredDraft?.gift_card_message || '');

  // bKash / Nagad Advance Payment State
  const [paymentMode, setPaymentMode] = useState<'full' | 'advance'>('advance');
  const [paymentSenderPhone, setPaymentSenderPhone] = useState('');
  const [paymentTrxId, setPaymentTrxId] = useState('');
  const [copiedNumber, setCopiedNumber] = useState(false);

  // Coupon
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(recoveredDraft?.coupon_code || null);
  const [couponError, setCouponError] = useState<string | null>(null);

  // Submitting
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(recovered ? 'An earlier order is still unconfirmed. Check the original order with its saved reference below.' : null);
  const [unconfirmed, setUnconfirmed] = useState(!!recovered);
  const orderAttemptRef = useRef<SheetOrderAttempt | null>(recovered?.attempt || null);
  const pendingCheckoutRef = useRef<PendingCheckout | null>(recovered);
  const submissionInFlight = useRef(false);
  const currentPrefillRef = useRef<{name:string;address:string}|null>(null);
  const adoptPending = (pending: PendingCheckout) => {
    const original = JSON.parse(pending.attempt.body) as SheetOrderDraft;
    pendingCheckoutRef.current = pending; orderAttemptRef.current = pending.attempt;
    setCustomerName(original.customer_name); setCustomerPhone(limitBangladeshiPhoneInput(original.customer_phone));
    currentPhoneRef.current = limitBangladeshiPhoneInput(original.customer_phone);
    setDeliveryAddress(original.delivery_address); setSelectedZoneId(original.delivery_zone_id);
    setSelectedSlot(original.delivery_slot); setDeliveryDate(original.delivery_date);
    setOrderNote(original.order_note || ''); setAppliedCoupon(original.coupon_code || null);
    currentPrefillRef.current = null; setAutofillNotice(''); setUnconfirmed(true);
  };
  useEffect(() => {
    if (!isOpen || !liveOrderEndpoint || pendingCheckoutRef.current) return;
    const recovery = inspectPendingCheckout(liveOrderEndpoint);
    if (recovery.status === 'ready') {
      adoptPending(recovery.pending);
      setErrorMessage('An earlier order is still unconfirmed. Retry the original order with its saved reference below.');
    } else if (recovery.status === 'blocked') setErrorMessage(recovery.message);
  }, [isOpen, liveOrderEndpoint]);
  const loadLocalProfile = () => {
    try { const value=JSON.parse(localStorage.getItem('aurora_customer_profile_v1')||'{}');
      if(!value||typeof value!=='object'||Array.isArray(value))return null;
      return {name:typeof value.name==='string'?value.name:'',phone:typeof value.phone==='string'?value.phone:'',
        address:typeof value.address==='string'?value.address:''};
    } catch {return null;}
  };
  const fillFromPhone = (phone:string, verified?:CheckoutCustomerInfo|null) => {
    const saved = getSavedCustomer(phone, loadConfirmedSheetOrders());
    const customer = saved
      ? { name: saved.name, phone: saved.phone, address: saved.address, source: 'device' as const, zone_id: saved.zone_id }
      : matchCheckoutCustomer(
          phone,
          verified ? { name: verified.name, phone: verified.phone, address: verified.address } : null,
          loadLocalProfile(),
          loadConfirmedSheetOrders()
        );

    if (!customer || (!customer.name && !customer.address)) {
      const digits = normalizeCheckoutPhone(phone);
      if (digits.length >= 11) {
        setAutofillNotice('নতুন ফোন নম্বর: নাম ও ডেলিভারি ঠিকানা লিখুন, এই অর্ডারের সাথে তা স্বয়ংক্রিয়ভাবে সংরক্ষিত হবে।');
      } else {
        setAutofillNotice('');
      }
      return;
    }

    const previousFill = currentPrefillRef.current;
    if (customer.name) {
      setCustomerName((previous) => (!previous || previous === previousFill?.name ? customer.name : previous));
    }
    if (customer.address) {
      setDeliveryAddress((previous) => (!previous || previous === previousFill?.address ? customer.address : previous));
    }
    if ('zone_id' in customer && customer.zone_id) {
      if (zones.some((z) => z.id === customer.zone_id && z.is_active)) {
        setSelectedZoneId(customer.zone_id);
      }
    }
    currentPrefillRef.current = { name: customer.name, address: customer.address };
    setAutofillNotice('স্বাগতম! আপনার ফোন নম্বরের বিপরীতে সংরক্ষিত তথ্য অটোফিল করা হয়েছে। প্রয়োজনে যেকোনো তথ্য পরিবর্তন করতে পারেন।');
  };
  const onPhoneChanged = (raw:string) => {
    const value = limitBangladeshiPhoneInput(raw);
    const previous=normalizeCheckoutPhone(customerPhone), next=normalizeCheckoutPhone(value);
    if(previous!==next){
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
    currentPhoneRef.current=value;
    fillFromPhone(value,ownedCustomerRef.current);
  };
  useEffect(()=>{
    if(!isOpen||!liveOrderEndpoint||submissionInFlight.current||unconfirmed)return;
    const device=loadLocalProfile();
    const receipts=loadConfirmedSheetOrders();
    const recent=receipts.filter(order=>!!order.customer_access_token)
      .sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))[0];
    let token='';try{token=sessionStorage.getItem('aurora_customer_phone_session_v1')||'';}catch{}
    ownedCustomerRef.current=null;
    const fillLocal=()=>{
      const phone=currentPhoneRef.current||device?.phone||recent?.customer_phone||'';
      if(phone){const limited=limitBangladeshiPhoneInput(phone);setCustomerPhone(previous=>previous||limited);fillFromPhone(limited);}
    };
    if(!token){fillLocal();return;}
    let active=true;
    getPhoneCustomerProfile(liveOrderEndpoint,token).then(profile=>{
      if(!active||submissionInFlight.current)return;
      const verified={name:profile.name,phone:profile.phone,address:profile.address,source:'account' as const};
      ownedCustomerRef.current=verified;
      const phone=limitBangladeshiPhoneInput(currentPhoneRef.current||profile.phone);
      setCustomerPhone(previous=>previous||limitBangladeshiPhoneInput(profile.phone));
      fillFromPhone(phone,verified);
    }).catch(()=>{if(active&&!submissionInFlight.current)fillLocal();});
    return()=>{active=false;};
  },[isOpen,liveOrderEndpoint,unconfirmed]);
  const closeCheckout = () => { if (!submissionInFlight.current) onClose(); };
  const dialogRef = useCakeDialog(closeCheckout, isOpen);

  const selectedZone = zones.find((zone) => zone.id === selectedZoneId && zone.is_active) || zones.find((zone) => zone.is_active);
  const availableSlots = slots.filter(slot => slot.is_active && deliverySlotOpen(slot.slot_label, deliveryDate));
  const selectedDeliverySlot = selectedSlot
    ? availableSlots.find(slot => slot.slot_label === selectedSlot)?.slot_label || ''
    : availableSlots[0]?.slot_label || '';
  const itemsSubtotal = items.reduce((sum, item) => sum + item.total_price, 0);
  const originalSubtotal = items.reduce((sum, item) => {
    const addonsTotal = item.selected_addons.reduce((s, a) => s + a.price, 0);
    return sum + (item.selected_variant.price + addonsTotal) * item.quantity;
  }, 0);
  const cakeDiscountTotal = Math.max(0, originalSubtotal - itemsSubtotal);

  const coupon = mockDb.getCoupons().find((item) => item.code.toUpperCase() === appliedCoupon && item.is_active);
  const liveEstimate = isLiveOrder ? calculateSheetOrderEstimate(itemsSubtotal, selectedZone?.delivery_fee ?? 0, coupon) : undefined;
  let estimatedDiscount = liveEstimate?.discount ?? 0;
  if (!isLiveOrder && coupon) {
    const val = validateCoupon(coupon, itemsSubtotal);
    if (val.isValid) {
      estimatedDiscount = val.discount;
    }
  }
  const estimatedTotal = liveEstimate?.total ?? Math.max(0, itemsSubtotal - estimatedDiscount + (selectedZone?.delivery_fee || 0));

  const availableCoupons = useMemo(() => {
    const list = mockDb.getCoupons();
    const now = new Date();
    return list.filter((c) => {
      if (!c.is_active) return false;
      if (c.valid_from) {
        const fromTime = new Date(c.valid_from.includes('T') ? c.valid_from : `${c.valid_from}T00:00:00`).getTime();
        if (!isNaN(fromTime) && now.getTime() < fromTime) return false;
      }
      if (c.valid_until) {
        const untilTime = new Date(c.valid_until.includes('T') ? c.valid_until : `${c.valid_until}T23:59:59.999`).getTime();
        if (!isNaN(untilTime) && now.getTime() > untilTime) return false;
      }
      if (c.usage_limit && c.usage_limit > 0 && (c.usage_count || 0) >= c.usage_limit) return false;
      return true;
    });
  }, [itemsSubtotal]);

  const handleApplyCoupon = (targetCode?: string) => {
    setCouponError(null);
    const code = (targetCode ?? couponInput).trim().toUpperCase();
    if (!code) return;
    const match = mockDb.getCoupons().find((item) => item.code.toUpperCase() === code && item.is_active);
    if (!match) {
      setCouponError('This coupon is not available.');
      return;
    }
    const val = validateCoupon(match, itemsSubtotal);
    if (!val.isValid) {
      setCouponError(val.reason || 'This coupon is not valid for this order.');
      return;
    }
    setAppliedCoupon(code);
    setCouponInput(code);
  };

  const finishLiveOrder = async (order: Order, pending: PendingCheckout) => {
    saveCustomerInfo({
      phone: customerPhone,
      name: customerName,
      address: deliveryAddress,
      zone_id: selectedZone?.id,
      last_order_id: order.id,
    });
    try {
      onOrderSuccess(order, { request_id: pending.attempt.request_id, cart_lines: pending.cart_lines });
    } catch (error) {
      throw new SheetOrderSubmissionError(error instanceof Error ? error.message : 'Your order is saved, but this browser could not finish confirmation. Retry the original reference.', true, pending.attempt.request_id);
    }
    await releasePendingCheckout(pending);
    pendingCheckoutRef.current = null;
    orderAttemptRef.current = null;
    setUnconfirmed(false);
    onClose();
  };
  const handleSubmissionFailure = async (error: unknown) => {
    if (error instanceof PendingCheckoutConflict) {
      adoptPending(error.pending);
    } else if (error instanceof SheetOrderSubmissionError && !error.ambiguous && pendingCheckoutRef.current) {
      const released = await releasePendingCheckout(pendingCheckoutRef.current);
      if (released) { pendingCheckoutRef.current = null; orderAttemptRef.current = null; }
      setUnconfirmed(!released);
    } else setUnconfirmed(error instanceof SheetOrderSubmissionError && error.ambiguous);
    setErrorMessage(shopErrorMessage(error, 'The order could not be confirmed. Your bag has been kept.'));
  };
  const handleDiscardPending = async () => {
    if (pendingCheckoutRef.current) {
      await releasePendingCheckout(pendingCheckoutRef.current);
      pendingCheckoutRef.current = null;
      orderAttemptRef.current = null;
    }
    setUnconfirmed(false);
    setErrorMessage(null);
  };
  const retryOriginalOrder = async () => {
    const originalAttempt = orderAttemptRef.current;
    const pending = pendingCheckoutRef.current;
    if (!originalAttempt || !pending || submissionInFlight.current) return;
    if (isGift && senderPhone.trim() && !validateBangladeshiPhone(senderPhone).isValid) {
      setErrorMessage('প্রেরকের মোবাইল নম্বরটি সঠিক ১১ ডিজিটের হতে হবে।');
      return;
    }
    if (paymentMethod !== 'cod' && !validateBangladeshiPhone(paymentSenderPhone).isValid) {
      setErrorMessage('পেমেন্ট প্রেরকের মোবাইল নম্বরটি সঠিক ১১ ডিজিটের হতে হবে।');
      return;
    }
    submissionInFlight.current = true;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const confirmedOrder = await submitSheetOrder(originalAttempt, { recoverOriginal: true });
      await finishLiveOrder(confirmedOrder, pending);
    } catch (error: unknown) {
      await handleSubmissionFailure(error);
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
    if (liveOrderingPaused) {
      setErrorMessage('Online ordering is temporarily paused. Your bag and checkout details have been kept.');
      return;
    }
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
    const phoneCheck = validateBangladeshiPhone(customerPhone);
    if (!phoneCheck.isValid) {
      setErrorMessage(phoneCheck.error || 'একটি সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX)।');
      return;
    }
    if (isGift && recipientPhone.trim()) {
      const recPhoneCheck = validateBangladeshiPhone(recipientPhone);
      if (!recPhoneCheck.isValid) {
        setErrorMessage(`প্রাপকের ${recPhoneCheck.error || 'মোবাইল নম্বরটি ১১ ডিজিটের হতে হবে'}।`);
        return;
      }
    }
    submissionInFlight.current = true;
    setIsSubmitting(true);
    try {
      if (liveOrderEndpoint) {
        orderAttemptRef.current = createSheetOrderAttempt(liveOrderEndpoint, {
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
          ...(isGift ? {
            is_gift: true, recipient_name: recipientName.trim(), recipient_phone: recipientPhone.trim(),
            sender_name: senderName.trim() || customerName.trim(), sender_phone: senderPhone.trim(),
            hide_price_on_box: hidePriceOnBox, gift_card_message: giftCardMessage.trim(),
          } : {}),
          expected_total: estimatedTotal,
        }, orderAttemptRef.current);
        const pending = await preservePendingCheckout(orderAttemptRef.current, captureCheckoutCart(items));
        pendingCheckoutRef.current = pending;
        const confirmedOrder = await submitSheetOrder(pending.attempt);
        await finishLiveOrder(confirmedOrder, pending);
      } else {
        const advanceAmount = paymentMethod !== 'cod' ? (paymentMode === 'full' ? estimatedTotal : Math.min(estimatedTotal, 500)) : 0;
        const result = await mockDb.createSecureOrder({
          customer_name: (isGift && recipientName.trim() ? recipientName.trim() : customerName.trim()),
          customer_phone: (isGift && recipientPhone.trim() ? recipientPhone.trim() : customerPhone.trim()),
          delivery_address: deliveryAddress.trim(),
          delivery_zone_id: selectedZone.id,
          delivery_slot: selectedDeliverySlot,
          delivery_date: deliveryDate,
          cart_items: items,
          coupon_code: appliedCoupon || undefined,
          order_note: orderNote || undefined,
          payment_method: paymentMethod,
          is_gift: isGift,
          recipient_name: isGift ? recipientName.trim() : undefined,
          recipient_phone: isGift ? recipientPhone.trim() : undefined,
          sender_name: isGift ? (senderName.trim() || customerName.trim()) : undefined,
          sender_phone: isGift ? (senderPhone.trim() || customerPhone.trim()) : undefined,
          hide_price_on_box: isGift ? hidePriceOnBox : false,
          gift_card_message: isGift ? giftCardMessage.trim() : undefined,
          advance_paid_amount: advanceAmount,
          bkash_number: paymentMethod !== 'cod' ? paymentSenderPhone.trim() : undefined,
          bkash_trx_id: paymentMethod !== 'cod' ? paymentTrxId.trim() : undefined,
        });
        if (!result.success) throw new Error(result.error || 'The demo order could not be saved on this device.');
        saveCustomerInfo({
          phone: customerPhone,
          name: customerName,
          address: deliveryAddress,
          zone_id: selectedZone?.id,
          last_order_id: result.order.id,
        });
        onOrderSuccess({ ...result.order, persistence: 'local_demo' }, { request_id: 'demo-' + result.order.id, cart_lines: captureCheckoutCart(items) });
        onClose();
      }
    } catch (error: unknown) {
      await handleSubmissionFailure(error);
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
          {liveOrderingPaused && <p role="status" className="text-xs text-amber-950 bg-amber-50 p-3 rounded-xl">Online ordering is temporarily paused. To check an earlier attempt, use “Retry original order” below.</p>}
          <fieldset disabled={isSubmitting || unconfirmed} className="min-w-0 space-y-6 border-0 p-0 m-0">
          <p className="text-xs text-slate-600 bg-rose-50 p-3 rounded-xl">{isLiveOrder ? 'Pay cash when your order arrives. Your receipt appears after the bakery confirms your order was saved.' : 'Live ordering is not activated yet. This demo checkout stays on this device; it is not sent to the bakery and no payment is collected.'}</p>
          {errorMessage && (
            <div role="alert" className="bg-red-50 text-red-700 p-3.5 rounded-xl border border-red-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <div><span>{errorMessage}</span>{unconfirmed && orderAttemptRef.current && <p className="mt-2 text-[11px]">Order reference: <span className="font-mono">{orderAttemptRef.current.request_id}</span>. Use “Retry original order” below to send the exact original cakes, delivery details, quote and reference. Editing is paused until the bakery confirms the order or explicitly rejects it.</p>}</div>
            </div>
          )}

          {/* Order Items Review */}
          <div className="bg-slate-50/90 rounded-2xl border border-slate-200/90 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <ShoppingBag className="w-4 h-4 text-rose-600" />
                <span>Selected Cakes ({items.length})</span>
              </h4>
              {cakeDiscountTotal > 0 && (
                <span className="text-xs font-bold text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded-full border border-rose-200">
                  {currency}{cakeDiscountTotal} ছাড় প্রযোজ্য
                </span>
              )}
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {items.map((it) => {
                const hasLineDiscount = it.selected_variant.sale_price !== undefined && it.selected_variant.sale_price < it.selected_variant.price;
                const addonsTotal = it.selected_addons.reduce((s, a) => s + a.price, 0);
                const lineOriginalTotal = (it.selected_variant.price + addonsTotal) * it.quantity;
                const lineSavings = hasLineDiscount ? (it.selected_variant.price - it.selected_variant.sale_price!) * it.quantity : 0;
                return (
                  <div key={it.cart_item_id} className="p-2.5 bg-white rounded-xl border border-slate-200/70 flex items-center justify-between text-xs gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img src={it.product.image_url} alt={it.product.name} className="w-11 h-11 object-cover rounded-lg border border-slate-200 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 truncate">{it.product.name}</div>
                        <div className="text-[11px] text-slate-500">
                          {it.selected_variant.name} {it.selected_flavor ? `• ${it.selected_flavor.name}` : ''} × {it.quantity}
                        </div>
                        {it.writing_message && (
                          <div className="text-[10px] text-rose-600 italic truncate">
                            "{it.writing_message}"
                          </div>
                        )}
                        <CheckoutProductGiftNote product={it.product} />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {hasLineDiscount && (
                        <div className="flex items-center gap-1 justify-end">
                          <span className="text-[10px] text-slate-400 line-through">
                            {currency}{lineOriginalTotal}
                          </span>
                          <span className="text-[9px] bg-rose-100 text-rose-700 font-bold px-1 rounded">
                            {currency}{lineSavings} ছাড়
                          </span>
                        </div>
                      )}
                      <div className="font-bold text-rose-600 text-sm">
                        {currency}{it.total_price}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>


          </div>

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
                  Mobile number (১১ ডিজিট)
                  {customerPhone.trim() && (
                    <span className={`ml-2 text-[10px] ${validateBangladeshiPhone(customerPhone).isValid ? 'text-emerald-600 font-bold' : 'text-rose-600 font-semibold'}`}>
                      {validateBangladeshiPhone(customerPhone).isValid ? '✓ সঠিক ১১ ডিজিট' : `(${customerPhone.replace(/\D/g, '').length}/11)`}
                    </span>
                  )}
                </label>
                <input
                  type="tel"
                  required
                  maxLength={13} inputMode="numeric" pattern="01[3-9][0-9]{8}"
                  aria-label="Mobile number" autoComplete="tel" placeholder="017XXXXXXXX"
                  value={customerPhone}
                  onChange={(e) => onPhoneChanged(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 focus:outline-rose-500 text-slate-800"
                />
              </div>
            </div>

            {autofillNotice && <p role="status" className="text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 p-3 rounded-xl">
              {autofillNotice}
            </p>}
            {isLiveOrder&&<p className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-950">
              <ShieldCheck size={14} className="inline mr-1"/>
              No customer password needed. Your details from this device can autofill.
              After checkout, your name, number, address and COD order are saved to the bakery’s private order records.
              For privacy, entering someone else's phone number never loads their address.
            </p>}
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

            {/* Gift / Surprise Order Toggle & Form */}
            <div className="bg-gradient-to-r from-pink-50 via-rose-50 to-amber-50 border border-pink-200/80 rounded-2xl p-3.5 space-y-3">
              <label className="flex items-start sm:items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isGift}
                  onChange={(e) => setIsGift(e.target.checked)}
                  className="mt-0.5 sm:mt-0 w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500 cursor-pointer"
                />
                <div className="flex-1">
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Gift className="w-4 h-4 text-rose-600 inline shrink-0" />
                    <span>প্রিয়জনকে সারপ্রাইজ বা উপহার হিসেবে পাঠান (Send as a Gift)</span>
                  </span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    রিসিভার ও আপনার তথ্য আলাদা থাকবে, কেকের বক্সে ইনভয়েস/দাম গোপন থাকবে।
                  </p>
                </div>
              </label>

              {isGift && (
                <div className="space-y-3 pt-2.5 border-t border-pink-200/60 animate-in fade-in duration-200">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        রিসিভারের নাম (যিনি কেক গ্রহণ করবেন) *
                      </label>
                      <input
                        type="text"
                        required={isGift}
                        value={recipientName}
                        onChange={(e) => setRecipientName(e.target.value)}
                        placeholder="রিসিভারের পুরো নাম"
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-rose-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        রিসিভারের মোবাইল নম্বর *
                      </label>
                      <input
                        type="tel"
                        required={isGift}
                        maxLength={13} inputMode="numeric" pattern="01[3-9][0-9]{8}"
                        value={recipientPhone}
                        onChange={(e) => setRecipientPhone(limitBangladeshiPhoneInput(e.target.value))}
                        placeholder="01XXXXXXXXX"
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-rose-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        আপনার নাম (প্রেরক / সেন্ডার)
                      </label>
                      <input
                        type="text"
                        value={senderName}
                        onChange={(e) => setSenderName(e.target.value)}
                        placeholder="আপনার নাম (যেমন: শুভাকাঙ্ক্ষী বা নাম)"
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-rose-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        আপনার মোবাইল নম্বর
                      </label>
                      <input
                        type="tel"
                        maxLength={13} inputMode="numeric" pattern="01[3-9][0-9]{8}"
                        value={senderPhone}
                        onChange={(e) => setSenderPhone(limitBangladeshiPhoneInput(e.target.value))}
                        placeholder="01XXXXXXXXX"
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-rose-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      💌 আপনার শুভেচ্ছা বার্তা (Gift Message)
                    </label>
                    <textarea
                      rows={2}
                      maxLength={140}
                      value={giftCardMessage}
                      onChange={(e) => setGiftCardMessage(e.target.value)}
                      placeholder="যেমন: শুভ জন্মদিন মা! অনেক ভালোবাসা রইলো..."
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-rose-500"
                    />
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer bg-white/90 p-2.5 rounded-xl border border-pink-100">
                    <input
                      type="checkbox"
                      checked={hidePriceOnBox}
                      onChange={(e) => setHidePriceOnBox(e.target.checked)}
                      className="w-3.5 h-3.5 text-rose-600 rounded cursor-pointer"
                    />
                    <span className="text-[11px] font-bold text-slate-700">
                      ✓ কেকের বক্সে ইনভয়েস বা মূল্য গোপন রাখুন (সারপ্রাইজের জন্য প্রস্তাবিত)
                    </span>
                  </label>
                </div>
              )}
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
                  onChange={(e) => { setDeliveryDate(e.target.value); setSelectedSlot(''); }}
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
                  {!selectedDeliverySlot && <option value="" disabled>{availableSlots.length ? 'Choose a delivery time' : 'Choose another delivery date'}</option>}
                  {availableSlots.map((slot) => (
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

            {isLiveOrder ? (
              <div className="p-3 rounded-xl border border-rose-200 bg-rose-50/50 text-slate-800 text-xs">
                <span className="font-bold block">ক্যাশ অন ডেলিভারি (Cash on Delivery)</span>
                <span className="text-[11px] text-slate-500">
                  কেক হাতে পেয়ে ডেলিভারি রাইডারের কাছে সম্পূর্ণ মূল্য পরিশোধ করুন।
                </span>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'cod', label: 'ক্যাশ অন ডেলিভারি (COD)', sub: 'কেক হাতে পেয়ে সম্পূর্ণ মূল্য পরিশোধ' },
                    { id: 'bkash', label: 'বিকাশ (bKash)', sub: 'সম্পূর্ণ বা ৫০০ টাকা অগ্রিম বুকিং' },
                    { id: 'nagad', label: 'নগদ (Nagad)', sub: 'সম্পূর্ণ বা ৫০০ টাকা অগ্রিম বুকিং' },
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
                            : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                        }`}
                      >
                        <div className="text-xs font-bold">{method.label}</div>
                        <div className="text-[10px] text-slate-500 font-normal mt-0.5">{method.sub}</div>
                      </button>
                    );
                  })}
                </div>

                {/* bKash & Nagad Payment Verification Box */}
                {paymentMethod !== 'cod' && (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-3 text-xs animate-in fade-in duration-200">
                    <div className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                      <div>
                        <span className="text-[11px] text-slate-500 block">
                          {paymentMethod === 'bkash' ? 'Aurora’s Cake বিকাশ নম্বর:' : 'Aurora’s Cake নগদ নম্বর:'}
                        </span>
                        <strong className="text-sm font-mono text-slate-900 font-bold">01711-234567</strong>
                        <span className="text-[10px] text-slate-500 ml-1.5">(Personal / Send Money)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText('01711234567');
                          setCopiedNumber(true);
                          setTimeout(() => setCopiedNumber(false), 2000);
                        }}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        {copiedNumber ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedNumber ? 'কপি হয়েছে' : 'কপি করুন'}</span>
                      </button>
                    </div>

                    {/* Advance vs Full Option */}
                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-700 block">পেমেন্টের ধরণ নির্বাচন করুন:</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setPaymentMode('advance')}
                          className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                            paymentMode === 'advance'
                              ? 'border-rose-600 bg-rose-50 text-rose-950 font-bold ring-1 ring-rose-300'
                              : 'border-slate-200 bg-white text-slate-700'
                          }`}
                        >
                          <div className="font-bold text-xs">আংশিক অগ্রিম (Advance)</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            ৳{Math.min(estimatedTotal, 500)} অগ্রিম, বাকি ৳{Math.max(0, estimatedTotal - Math.min(estimatedTotal, 500))} ডেলিভারিতে ক্যাশ
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentMode('full')}
                          className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                            paymentMode === 'full'
                              ? 'border-rose-600 bg-rose-50 text-rose-950 font-bold ring-1 ring-rose-300'
                              : 'border-slate-200 bg-white text-slate-700'
                          }`}
                        >
                          <div className="font-bold text-xs">সম্পূর্ণ পেমেন্ট (Full)</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            সম্পূর্ণ ৳{estimatedTotal} এখনই বিকাশ/নগদে পরিশোধ
                          </div>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          যে নম্বর থেকে টাকা পাঠিয়েছেন *
                        </label>
                        <input
                          type="tel"
                          required
                          maxLength={13} inputMode="numeric" pattern="01[3-9][0-9]{8}"
                          value={paymentSenderPhone}
                          onChange={(e) => setPaymentSenderPhone(limitBangladeshiPhoneInput(e.target.value))}
                          placeholder="017XXXXXXXX"
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-rose-500 text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          ট্রানজেকশন আইডি (TrxID) *
                        </label>
                        <input
                          type="text"
                          required
                          value={paymentTrxId}
                          onChange={(e) => setPaymentTrxId(e.target.value.toUpperCase())}
                          placeholder="যেমন: BL89K7M2"
                          className="w-full px-3 py-2 text-xs font-mono uppercase rounded-xl border border-slate-200 bg-white focus:outline-rose-500 text-slate-800"
                        />
                      </div>
                    </div>

                    <p className="text-[10px] text-slate-500">
                      টাকা পাঠিয়ে TrxID ফর্মে লিখে অর্ডার সম্পন্ন করুন। আমাদের কিচেন টিম তাৎক্ষণিকভাবে ভেরিফাই করে কনফার্মেশন পাঠাবে।
                    </p>
                  </div>
                )}
              </>
            )}
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
                onClick={() => handleApplyCoupon()}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Apply
              </button>
            </div>
            {availableCoupons.length > 0 && (
              <div className="space-y-1 pt-1">
                <span className="text-[11px] text-slate-500 font-medium">Available Coupons (Click to apply):</span>
                <div className="flex flex-wrap gap-1.5">
                  {availableCoupons.map((c) => {
                    const isEligible = itemsSubtotal >= (c.min_order_amount || 0);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleApplyCoupon(c.code)}
                        className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium flex items-center gap-1 transition-all cursor-pointer ${
                          appliedCoupon === c.code
                            ? 'bg-rose-50 border-rose-300 text-rose-700 font-bold'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-rose-300 hover:bg-rose-50/50'
                        }`}
                      >
                        <span className="font-mono font-bold text-rose-600">{c.code}</span>
                        <span className="text-slate-500">
                          ({c.discount_type === 'percentage' ? `${c.discount_value}%` : `${currency}${c.discount_value}`} OFF)
                        </span>
                        {!isEligible && (
                          <span className="text-[9px] text-amber-600 font-normal">
                            (Min {currency}{c.min_order_amount})
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
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
            {cakeDiscountTotal > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>Regular Price (আসল মূল্য)</span>
                <span className="line-through font-semibold">{currency}{originalSubtotal}</span>
              </div>
            )}
            {cakeDiscountTotal > 0 && (
              <div className="flex justify-between text-rose-600 font-semibold">
                <span>Special Cake Discount (কেক ছাড়)</span>
                <span>-{currency}{cakeDiscountTotal}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-700 font-medium">
              <span>Items Subtotal (ছাড়ের পর মূল্য)</span>
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
              <div>
                <div>{isLiveOrder ? 'Estimated total' : 'Preview total'}</div>
                {(cakeDiscountTotal > 0 || estimatedDiscount > 0) && (
                  <div className="text-[11px] font-semibold text-emerald-700">
                    মোট সাশ্রয়: {currency}{cakeDiscountTotal + estimatedDiscount}
                  </div>
                )}
              </div>
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
            disabled={isSubmitting || unconfirmed || liveOrderingPaused || !items.length || !selectedZone || !selectedDeliverySlot}
            className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3.5 px-4 rounded-2xl shadow-lg shadow-rose-200 flex items-center justify-center gap-2 text-sm transition-all cursor-pointer active:scale-98 disabled:opacity-50"
          >
            {isSubmitting ? (
              <span>{isLiveOrder ? 'Sending your order and waiting for confirmation...' : 'Saving your demo order...'}</span>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>{liveOrderingPaused ? 'Ordering temporarily paused' : isLiveOrder ? 'Place cash-on-delivery order' : 'Save demo order'} — {currency}{estimatedTotal}</span>
              </>
            )}
          </button>
          </fieldset>
          {unconfirmed && orderAttemptRef.current && <div className="space-y-3">
            <p role="status" className="text-xs text-slate-600">The original order is still unconfirmed. This retry uses its saved details and reference even if the current cake collection or delivery options have changed. The reference is kept on this device across closing this window or reloading the page.</p>
            <button type="button" onClick={() => { void retryOriginalOrder(); }} disabled={isSubmitting} className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3.5 px-4 rounded-2xl disabled:opacity-50 cursor-pointer">{isSubmitting ? 'Checking the original order...' : 'Retry original order'}</button>
            <button type="button" onClick={() => { void handleDiscardPending(); }} disabled={isSubmitting} className="w-full text-center text-xs text-slate-500 hover:text-rose-600 py-1.5 cursor-pointer">Discard this attempt & edit details</button>
          </div>}
        </form>
      </div>
    </div>
  );
};
