import React, { useState, useEffect, useMemo, useRef } from 'react';
import {createLiveStaffOrder,savedStaffOrder,clearCompletedStaffOrder} from '../services/staffOrderCreation';
import { CustomerOrderLink } from './CustomerOrderLink';
import {mutateCmsTable,fetchCmsTable} from '../services/sheetStaffApi';
import { 
  X, 
  Plus, 
  Minus,
  Trash2, 
  CheckCircle, 
  AlertCircle, 
  ShoppingBag, 
  MapPin, 
  Phone, 
  User, 
  Calendar, 
  Clock, 
  CreditCard, 
  Tag, 
  Sparkles, 
  Cake, 
  Printer, 
  Gift, 
  Check, 
  FileText,
  Search,
  Edit2 
} from 'lucide-react';
import { 
  Product, 
  DeliveryZone, 
  DeliverySlot, 
  Flavor, 
  ProductAddon, 
  Coupon, 
  StaffRole, 
  Order, 
  CartItem 
} from '../types';
import { validateCoupon } from '../services/couponValidation';
import { lookupStaffCustomer } from '../services/sheetStaffApi';
import type { ShopSettings } from '../types';
import { saveCustomerInfo } from '../services/customerDirectory';
import { formatShortOrderNumber } from '../utils/orderUtils';
import { normalizeBangladeshiPhoneInput, validateBangladeshiPhone } from '../utils/phoneValidation';
import { loadStaffCredential, getBrowserWorkspaceStorage } from '../services/staffWorkspaceSession';
import { PosPrintModal } from './PosPrintModal';

/** Compact image component with graceful fallback to cake icon */
const ProductImageThumbnail: React.FC<{
  src?: string;
  alt: string;
  className?: string;
}> = ({ src, alt, className = '' }) => {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return (
      <div className={`flex items-center justify-center bg-amber-50/90 text-amber-600 ${className}`}>
        <Cake className="w-1/2 h-1/2 opacity-70" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setHasError(true)}
      className={`object-cover ${className}`}
      loading="lazy"
    />
  );
};

interface AdminCreateOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  zones: DeliveryZone[];
  slots: DeliverySlot[];
  flavors: Flavor[];
  addons: ProductAddon[];
  coupons: Coupon[];
  currency: string;
  role: StaffRole;
  endpoint?: string;
  shopSettings?: ShopSettings;
  staffIdentity?: string;
  onCatalogUpdated?: () => void;
  initialCartItems?: CartItem[];
  onOrderCreated?: (order: Order) => void;
}

export const AdminCreateOrderModal: React.FC<AdminCreateOrderModalProps> = ({
  isOpen,
  onClose,
  products,
  zones: suppliedZones,
  slots,
  flavors,
  addons,
  coupons,
  currency,
  role,
  endpoint,
  shopSettings,
  staffIdentity,
  onCatalogUpdated,
  initialCartItems,
  onOrderCreated,
}) => {
  // Today's date string YYYY-MM-DD
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [zones,setZones]=useState(suppliedZones);
  useEffect(()=>setZones(suppliedZones),[suppliedZones]);
  const submitBusy=useRef(false);
  const [zoneEditor,setZoneEditor]=useState(false),[zoneName,setZoneName]=useState(''),[zoneFee,setZoneFee]=useState('0');
  const [zoneBusy,setZoneBusy]=useState(false),[zoneError,setZoneError]=useState('');
  const [creationWarning,setCreationWarning]=useState('');
  const [pendingRecord,setPendingRecord]=useState(()=>endpoint&&staffIdentity?savedStaffOrder(endpoint,staffIdentity):null);
  const addDeliveryZone=async()=>{
    if(zoneBusy||!endpoint||!staffIdentity)return;
    const fee=Number(zoneFee);
    if(!zoneName.trim()||!Number.isFinite(fee)||fee<0){setZoneError('জোনের নাম এবং সঠিক delivery fee দিন।');return;}
    setZoneBusy(true);setZoneError('');
    try {
      const token=loadStaffCredential(getBrowserWorkspaceStorage());
      await mutateCmsTable(endpoint,token,'delivery_zones','create',{name:zoneName.trim(),delivery_fee:fee,estimated_time:'',is_active:true});
      const snapshot=await fetchCmsTable(endpoint,token,'delivery_zones');
      const next=snapshot.rows.map(r=>({id:String(r.id),name:String(r.name),delivery_fee:Number(r.delivery_fee),estimated_time:String(r.estimated_time||''),is_active:r.is_active!==false&&String(r.is_active).toLowerCase()!=='false'}));
      const added=next.find(r=>r.name===zoneName.trim()&&!zones.some(z=>z.id===r.id));
      setZones(next);if(added)setSelectedZoneId(added.id);
      setZoneEditor(false);setZoneName('');onCatalogUpdated?.();
    } catch(error){setZoneError(error instanceof Error?error.message:'জোন সংরক্ষণ হয়নি।');}
    finally{setZoneBusy(false);}
  };

  // Customer Information
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [selectedZoneId, setSelectedZoneId] = useState(zones[0]?.id || '');
  const [deliveryDate, setDeliveryDate] = useState(todayStr);
  const [selectedSlot, setSelectedSlot] = useState(slots[0]?.slot_label || '');

  // Matched previous customer suggestion
  const [matchedCustomer, setMatchedCustomer] = useState<{ name: string; address: string; zone_id?: string } | null>(null);

  // Active products & Product Search
  const activeProducts = useMemo(() => products.filter((p) => p.is_active), [products]);
  const [productSearch, setProductSearch] = useState('');
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return activeProducts;
    const q = productSearch.toLowerCase();
    return activeProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.category_name && p.category_name.toLowerCase().includes(q))
    );
  }, [activeProducts, productSearch]);

  // Current Item Configuration
  const [selectedProductId, setSelectedProductId] = useState(activeProducts[0]?.id || '');
  const selectedProduct = useMemo(
    () => activeProducts.find((p) => p.id === selectedProductId) || activeProducts[0],
    [activeProducts, selectedProductId]
  );

  const productVariants = useMemo(
    () => (selectedProduct?.variants || []).filter((v) => v.is_active),
    [selectedProduct]
  );
  const [selectedVariantId, setSelectedVariantId] = useState(productVariants[0]?.id || '');

  // Update variant when product changes
  useEffect(() => {
    if (productVariants.length > 0 && !productVariants.some((v) => v.id === selectedVariantId)) {
      setSelectedVariantId(productVariants[0].id);
    }
  }, [productVariants, selectedVariantId]);

  const selectedVariant = useMemo(
    () => productVariants.find((v) => v.id === selectedVariantId) || productVariants[0],
    [productVariants, selectedVariantId]
  );

  // Allowed flavors for selected product
  const productFlavors = useMemo(() => {
    if (!selectedProduct) return [];
    const allowAll = selectedProduct.allowed_flavor_ids?.some((x) => x.toLowerCase() === 'all' || x === '*');
    if (!allowAll && !selectedProduct.allowed_flavor_ids?.length) return [];
    return flavors.filter((f) => f.is_active && (allowAll || selectedProduct.allowed_flavor_ids?.includes(f.id)));
  }, [selectedProduct, flavors]);
  const [selectedFlavorId, setSelectedFlavorId] = useState('');

  // Allowed addons for selected product
  const productAddons = useMemo(() => {
    if (!selectedProduct) return [];
    const allowAll = selectedProduct.allowed_addon_ids?.some((x) => x.toLowerCase() === 'all' || x === '*');
    if (!allowAll && !selectedProduct.allowed_addon_ids?.length) return [];
    return addons.filter((a) => a.is_active && (allowAll || selectedProduct.allowed_addon_ids?.includes(a.id)));
  }, [selectedProduct, addons]);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);

  const [writingMessage, setWritingMessage] = useState('');
  const [itemQuantity, setItemQuantity] = useState(1);
  const [editingCartItemId, setEditingCartItemId] = useState<string | null>(null);

  // Added Order Items List
  const [cartItems, setCartItems] = useState<CartItem[]>(initialCartItems || []);

  // Payment & Billing Settings
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState('');
  const [orderNote, setOrderNote] = useState('');

  // Surprise / Gift Delivery
  const [isGift, setIsGift] = useState(false);
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [hidePriceOnBox, setHidePriceOnBox] = useState(false);
  const [giftCardMessage, setGiftCardMessage] = useState('');

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [createdOrder, setCreatedOrder] = useState<Order | null>(pendingRecord?.receipt||null);
  const [posPrintOrder, setPosPrintOrder] = useState<Order | null>(null);

  useEffect(() => {
    setMatchedCustomer(null);
    const phone = normalizeBangladeshiPhoneInput(customerPhone);
    if (!endpoint || !staffIdentity || !validateBangladeshiPhone(phone).isValid) return;
    let active = true;
    const timer = window.setTimeout(() => {
      const token = loadStaffCredential(getBrowserWorkspaceStorage());
      if (!token) return;
      void lookupStaffCustomer(endpoint, token, phone).then(match => {
        if (active && match) setMatchedCustomer({ name: match.name, address: match.delivery_address });
      }).catch(() => {});
    }, 350);
    return () => { active = false; window.clearTimeout(timer); };
  }, [customerPhone, endpoint, staffIdentity]);

  const handleApplyMatchedCustomer = () => {
    if (!matchedCustomer) return;
    if (matchedCustomer.name) setCustomerName(matchedCustomer.name);
    if (matchedCustomer.address) setDeliveryAddress(matchedCustomer.address);
    if (matchedCustomer.zone_id && zones.some((z) => z.id === matchedCustomer.zone_id)) {
      setSelectedZoneId(matchedCustomer.zone_id);
    }
    setMatchedCustomer(null);
  };

  // Edit existing item from cart
  const handleStartEditItem = (item: CartItem) => {
    setEditingCartItemId(item.cart_item_id);
    setSelectedProductId(item.product.id);
    setSelectedVariantId(item.selected_variant.id);
    setSelectedFlavorId(item.selected_flavor?.id || '');
    setSelectedAddonIds(item.selected_addons.map((a) => a.id));
    setWritingMessage(item.writing_message || '');
    setItemQuantity(item.quantity);
  };

  const handleCancelEditItem = () => {
    setEditingCartItemId(null);
    setWritingMessage('');
    setItemQuantity(1);
    setSelectedAddonIds([]);
    setSelectedFlavorId('');
  };

  // Add or Update Item in Order List
  const handleAddItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedProduct || !selectedVariant) return;

    const chosenFlavor = productFlavors.find((f) => f.id === selectedFlavorId);
    const chosenAddons = productAddons.filter((a) => selectedAddonIds.includes(a.id));
    const addonsTotal = chosenAddons.reduce((sum, a) => sum + a.price, 0);
    const unitPrice = selectedVariant.price + addonsTotal;
    const itemTotalPrice = unitPrice * Math.max(1, itemQuantity);

    if (editingCartItemId) {
      setCartItems((prev) =>
        prev.map((item) =>
          item.cart_item_id === editingCartItemId
            ? {
                ...item,
                product: selectedProduct,
                selected_variant: selectedVariant,
                selected_flavor: chosenFlavor,
                selected_addons: chosenAddons,
                writing_message: writingMessage.trim(),
                quantity: Math.max(1, itemQuantity),
                unit_price: unitPrice,
                total_price: itemTotalPrice,
              }
            : item
        )
      );
      setEditingCartItemId(null);
    } else {
      const newItem: CartItem = {
        cart_item_id: `admin-item-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        product: selectedProduct,
        selected_variant: selectedVariant,
        selected_flavor: chosenFlavor,
        selected_addons: chosenAddons,
        writing_message: writingMessage.trim(),
        quantity: Math.max(1, itemQuantity),
        unit_price: unitPrice,
        total_price: itemTotalPrice,
      };

      setCartItems((prev) => [...prev, newItem]);
    }

    // Reset item custom inputs for next entry
    setWritingMessage('');
    setItemQuantity(1);
    setSelectedAddonIds([]);
    setSelectedFlavorId('');
  };

  const handleRemoveItem = (cartItemId: string) => {
    if (editingCartItemId === cartItemId) {
      handleCancelEditItem();
    }
    setCartItems((prev) => prev.filter((item) => item.cart_item_id !== cartItemId));
  };

  // Active selected item calculations for real-time preview
  const currentChosenAddons = useMemo(() => {
    return productAddons.filter((a) => selectedAddonIds.includes(a.id));
  }, [productAddons, selectedAddonIds]);

  const currentAddonsTotal = useMemo(() => {
    return currentChosenAddons.reduce((sum, a) => sum + a.price, 0);
  }, [currentChosenAddons]);

  const currentUnitPrice = useMemo(() => {
    return (selectedVariant?.price || selectedProduct?.base_price || 0) + currentAddonsTotal;
  }, [selectedVariant, selectedProduct, currentAddonsTotal]);

  const currentItemTotal = useMemo(() => {
    return currentUnitPrice * Math.max(1, itemQuantity);
  }, [currentUnitPrice, itemQuantity]);

  // Current calculations
  const itemsSubtotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.total_price, 0),
    [cartItems]
  );

  const selectedZone = useMemo(
    () => zones.find((z) => z.id === selectedZoneId) || zones[0],
    [zones, selectedZoneId]
  );

  const deliveryFee = selectedZone?.delivery_fee || 0;

  // Coupon application
  const handleApplyCoupon = () => {
    setCouponError('');
    if (!couponInput.trim()) {
      setAppliedCoupon(null);
      return;
    }
    const match = coupons.find(
      (c) => c.code.toUpperCase() === couponInput.trim().toUpperCase() && c.is_active
    );
    if (!match) {
      setCouponError('কুপন কোডটি সঠিক নয় বা মেয়াদোত্তীর্ণ।');
      setAppliedCoupon(null);
      return;
    }
    const val = validateCoupon(match, itemsSubtotal);
    if (!val.isValid) {
      setCouponError(val.reason || 'কুপনটি এই অর্ডারে প্রযোজ্য নয়।');
      setAppliedCoupon(null);
      return;
    }
    setAppliedCoupon(match);
  };

  const couponDiscount = useMemo(() => {
    if (!appliedCoupon) return 0;
    const val = validateCoupon(appliedCoupon, itemsSubtotal);
    return val.isValid ? val.discount : 0;
  }, [appliedCoupon, itemsSubtotal]);

  const grandTotal = Math.max(0, itemsSubtotal - couponDiscount + deliveryFee);
  const remainingDue = grandTotal;

  const handleResetForm = () => {
    if(endpoint&&staffIdentity){clearCompletedStaffOrder(endpoint,staffIdentity);setPendingRecord(null);}
    setCreationWarning('');
    setCustomerName('');
    setCustomerPhone('');
    setDeliveryAddress('');
    setSelectedZoneId(zones[0]?.id || '');
    setDeliveryDate(todayStr);
    setSelectedSlot(slots[0]?.slot_label || '');
    setEditingCartItemId(null);
    setCartItems([]);
    setCouponInput('');
    setAppliedCoupon(null);
    setCouponError('');
    setOrderNote('');
    setIsGift(false);
    setRecipientName('');
    setRecipientPhone('');
    setHidePriceOnBox(false);
    setGiftCardMessage('');
    setCreatedOrder(null);
    setSubmitError('');
  };

  // Submit and Auto-Confirm Order
  const handleCreateOrder = async (e: React.FormEvent) => {
    if(submitBusy.current)return;
    e.preventDefault();
    if (cartItems.length === 0) {
      setSubmitError('দয়া করে অন্তত একটি কেক বা আইটেম অর্ডারে যোগ করুন।');
      return;
    }
    if (!customerName.trim() || !customerPhone.trim() || !deliveryAddress.trim()) {
      setSubmitError('দয়া করে গ্রাহকের নাম, মোবাইল নম্বর ও ডেলিভারি ঠিকানা পূরণ করুন।');
      return;
    }

    const phoneCheck = validateBangladeshiPhone(customerPhone);
    if (!phoneCheck.isValid) {
      setSubmitError(phoneCheck.error || 'গ্রাহকের মোবাইল নম্বরটি অবশ্যই ১১ ডিজিটের হতে হবে (যেমন: 017XXXXXXXX)।');
      return;
    }
    if (isGift && recipientPhone.trim()) {
      const recPhoneCheck = validateBangladeshiPhone(recipientPhone);
      if (!recPhoneCheck.isValid) {
        setSubmitError(`প্রাপকের ${recPhoneCheck.error || 'মোবাইল নম্বরটি ১১ ডিজিটের হতে হবে'}।`);
        return;
      }
    }

    submitBusy.current=true;
    setIsSubmitting(true);
    setSubmitError('');

    try {
      if (!endpoint || !staffIdentity) throw new Error('Sign in before creating an order.');
      const result=await createLiveStaffOrder(endpoint,loadStaffCredential(getBrowserWorkspaceStorage()),staffIdentity,{
        customer_name:customerName.trim(),customer_phone:customerPhone.trim(),delivery_address:deliveryAddress.trim(),
        delivery_zone_id:selectedZoneId,delivery_slot:selectedSlot,delivery_date:deliveryDate,payment_method:'cod',
        coupon_code:appliedCoupon?.code, order_note:orderNote.trim() || undefined, expected_total:grandTotal,
        ...(isGift ? { is_gift:true, recipient_name:recipientName.trim(), recipient_phone:recipientPhone.trim(),
          sender_name:customerName.trim(), sender_phone:customerPhone.trim(),
          hide_price_on_box:hidePriceOnBox, gift_card_message:giftCardMessage.trim() } : {}),
        cart_items:cartItems.map(item=>({product_id:item.product.id,variant_id:item.selected_variant.id,
          flavor_id:item.selected_flavor?.id,addon_ids:item.selected_addons.map(a=>a.id),writing_message:item.writing_message,quantity:item.quantity})),
      });
      setCreationWarning(result.warning);setPendingRecord(savedStaffOrder(endpoint,staffIdentity));
      // Save customer info locally for future auto-fill
      saveCustomerInfo({
        name: customerName.trim(),
        phone: customerPhone.trim(),
        address: deliveryAddress.trim(),
        zone_id: selectedZoneId,
        last_order_id: result.order.id,
      });

      setCreatedOrder(result.order);
      onOrderCreated?.(result.order);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'অর্ডার তৈরিতে সমস্যা হয়েছে।');
    } finally {
      if(endpoint&&staffIdentity)setPendingRecord(savedStaffOrder(endpoint,staffIdentity));
      submitBusy.current=false;
      setIsSubmitting(false);
    }
  };
  const retrySavedOrder=async()=>{
    if(submitBusy.current||!endpoint||!staffIdentity)return;
    submitBusy.current=true;setIsSubmitting(true);setSubmitError('');
    try {
      const result=await createLiveStaffOrder(endpoint,loadStaffCredential(getBrowserWorkspaceStorage()),staffIdentity);
      setCreatedOrder(result.order);setCreationWarning(result.warning);onOrderCreated?.(result.order);
    } catch(error){setSubmitError(error instanceof Error?error.message:'আগের অর্ডারের ফলাফল যাচাই হয়নি।');}
    finally{setPendingRecord(savedStaffOrder(endpoint,staffIdentity));submitBusy.current=false;setIsSubmitting(false);}
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[90] flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-create-order-title"
    >
      <div className="bg-[#f8faf9] rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[94vh]">
        {/* Modal Header */}
        <div className="bg-[#15342e] text-white px-4 sm:px-7 py-3.5 sm:py-4 flex items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-white/10 flex items-center justify-center text-[#f0dbb3] shrink-0">
              <Cake size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h3 id="admin-create-order-title" className="text-sm sm:text-lg font-black tracking-tight text-white line-clamp-1">
                  + নতুন অর্ডার তৈরি
                </h3>
                <span className="px-1.5 sm:px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[9px] sm:text-[10px] font-bold border border-emerald-500/40">
                  AUTO-CONFIRM
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-white/60 line-clamp-1">
                অ্যাডমিন প্যানেল থেকে ফোন/কাউন্টার অর্ডার সরাসরি তৈরি করুন।
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        {createdOrder ? (
          /* SUCCESS VIEW */
          <div className="p-6 sm:p-8 space-y-6 text-center max-w-xl mx-auto my-auto">
            <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle size={36} />
            </div>
            <div className="space-y-1.5">
              <span className="inline-block font-mono text-sm font-black px-3 py-1 rounded-xl bg-slate-900 text-amber-300 tracking-wider">
                #{formatShortOrderNumber(createdOrder.order_number)}
              </span>
              <h4 className="text-xl sm:text-2xl font-black text-slate-900">
                {createdOrder.status==='pending'?'অর্ডার Sheet-এ সংরক্ষিত হয়েছে':'অর্ডার সফলভাবে তৈরি ও কনফার্ম হয়েছে!'}
              </h4>
              <p className="text-xs sm:text-sm text-slate-500">
                গ্রাহক: <strong>{createdOrder.customer_name}</strong> ({createdOrder.customer_phone}) • মোট মূল্য: <strong>৳{createdOrder.total_amount}</strong>
              </p>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold mt-2">
                <Check size={14} />
                <span>স্ট্যাটাস: {createdOrder.status}</span>
              </div>
            </div>
            {creationWarning&&<p role="status" className="rounded-xl bg-amber-50 p-3 text-amber-900 text-sm">{creationWarning}</p>}
            {endpoint&&staffIdentity&&<CustomerOrderLink endpoint={endpoint} token={loadStaffCredential(getBrowserWorkspaceStorage())} orderId={createdOrder.id} initialUrl={createdOrder.customer_share_url} autoCreate/>}

            <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
              <button
                type="button"
                onClick={() => setPosPrintOrder(createdOrder)}
                className="px-5 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-md transition-colors"
              >
                <Printer size={16} className="text-rose-400" />
                <span>🖨️ POS রসিদ / কিচেন স্লিপ প্রিন্ট করুন</span>
              </button>
              <button
                type="button"
                onClick={handleResetForm}
                className="px-5 py-3 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-xs transition-colors"
              >
                <Plus size={16} />
                <span>+ আরেকটি নতুন অর্ডার তৈরি করুন</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-3 rounded-2xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer transition-colors"
              >
                বন্ধ করুন (Close)
              </button>
            </div>
          </div>
        ) : (
          /* ORDER FORM */
          <form onSubmit={handleCreateOrder} className="overflow-y-auto p-4 sm:p-6 space-y-6 flex-1">
            {pendingRecord&&!pendingRecord.receipt&&<div role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950">
              আগের staff order-এর ফলাফল অনিশ্চিত। নতুন অর্ডার না বানিয়ে একই reference দিয়ে retry করুন।
              <button type="button" disabled={isSubmitting} onClick={()=>void retrySavedOrder()} className="block mt-2 underline">Retry saved order</button>
            </div>}
            {submitError && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            {/* SECTION 1: CUSTOMER DETAILS */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                <User size={16} className="text-emerald-700" />
                <h4 className="text-sm font-bold text-slate-900">১. গ্রাহকের তথ্য ও ডেলিভারি লোকেশন</h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Phone */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    মোবাইল নম্বর (১১ ডিজিট) *
                    {customerPhone.trim() && (
                      <span className={`ml-2 text-[10px] ${validateBangladeshiPhone(customerPhone).isValid ? 'text-emerald-600 font-bold' : 'text-rose-600 font-semibold'}`}>
                        {validateBangladeshiPhone(customerPhone).isValid ? '✓ সঠিক ১১ ডিজিট' : `⚠️ ১১ ডিজিট আবশ্যক (${customerPhone.replace(/\D/g, '').length}/11)`}
                      </span>
                    )}
                  </label>
                  <input
                    type="tel"
                    required
                    maxLength={14}
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value.replace(/[^\d+]/g, ''))}
                    placeholder="01XXXXXXXXX"
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-emerald-600 focus:ring-1 focus:ring-emerald-600"
                  />
                  {matchedCustomer && (
                    <button
                      type="button"
                      onClick={handleApplyMatchedCustomer}
                      className="mt-1.5 text-[11px] text-emerald-800 bg-emerald-50 hover:bg-emerald-100 p-2 rounded-xl border border-emerald-200 flex items-center gap-1.5 w-full text-left transition-colors cursor-pointer"
                    >
                      <Sparkles size={13} className="text-emerald-600 shrink-0" />
                      <span>পূর্ববর্তী গ্রাহক: <strong>{matchedCustomer.name}</strong> • তথ্য অটোফিল করতে ক্লিক করুন</span>
                    </button>
                  )}
                </div>

                {/* Name */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    গ্রাহকের পুরো নাম *
                  </label>
                  <input
                    type="text"
                    required
                    aria-label="Customer name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="যেমন: তানভীর আহমেদ"
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-emerald-600 focus:ring-1 focus:ring-emerald-600"
                  />
                </div>

                {/* Address */}
                <div className="sm:col-span-2">
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    ডেলিভারির সম্পূর্ণ ঠিকানা *
                  </label>
                  <input
                    type="text"
                    required
                    value={deliveryAddress}
                    aria-label="Delivery address"
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="বাড়ি নং, রোড নং, এলাকা / ল্যান্ডমার্ক"
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-emerald-600 focus:ring-1 focus:ring-emerald-600"
                  />
                </div>

                {/* Zone */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    ডেলিভারি এরিয়া / জোন *
                  </label>
                  <select
                    value={selectedZoneId}
                    aria-label="Delivery zone"
                    onChange={(e) => setSelectedZoneId(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-emerald-600 cursor-pointer"
                  >
                    {zones.filter((z) => z.is_active).map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name} (ফি: ৳{z.delivery_fee})
                      </option>
                    ))}
                  </select>
                  {endpoint&&['super_admin','admin'].includes(role)&&<button type="button" className="mt-2 text-xs font-bold underline text-emerald-800" onClick={()=>setZoneEditor(v=>!v)}>+ নতুন delivery zone</button>}
                  {zoneEditor&&<div className="mt-2 space-y-2 rounded-xl border p-3">
                    <input aria-label="New delivery zone name" value={zoneName} onChange={e=>setZoneName(e.target.value)} placeholder="জোনের নাম" className="w-full border rounded p-2"/>
                    <input aria-label="New delivery zone fee" type="number" min="0" value={zoneFee} onChange={e=>setZoneFee(e.target.value)} className="w-full border rounded p-2"/>
                    <button type="button" disabled={zoneBusy} onClick={()=>void addDeliveryZone()} className="rounded bg-emerald-800 text-white p-2 text-xs">{zoneBusy?'সংরক্ষণ হচ্ছে…':'Sheet-এ zone সংরক্ষণ'}</button>
                  </div>}
                  {zoneError&&<p role="alert" className="text-xs text-red-700">{zoneError}</p>}
                </div>

                {/* Date */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    ডেলিভারি তারিখ *
                  </label>
                  <input
                    type="date"
                    required
                    min={todayStr}
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-emerald-600 cursor-pointer"
                  />
                </div>

                {/* Slot */}
                <div className="sm:col-span-2">
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    ডেলিভারি সময় / টাইম স্লট *
                  </label>
                  <select
                    value={selectedSlot}
                    onChange={(e) => setSelectedSlot(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-emerald-600 cursor-pointer"
                  >
                    {slots.filter((s) => s.is_active).map((s) => (
                      <option key={s.id} value={s.slot_label}>
                        {s.slot_label} {s.surcharge ? `(+৳${s.surcharge})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Surprise Gift Checkbox */}
              <div className="pt-2 border-t border-slate-100">
                <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold text-purple-900">
                  <input
                    type="checkbox"
                    checked={isGift}
                    onChange={(e) => setIsGift(e.target.checked)}
                    className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
                  />
                  <span>🎁 এটি সারপ্রাইজ উপহার ডেলিভারি (Sender ও Receiver আলাদা)</span>
                </label>

                {isGift && (
                  <div className="mt-3 p-3.5 bg-purple-50/70 border border-purple-200 rounded-2xl space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-purple-950 block mb-1">রিসিভারের নাম *</label>
                        <input
                          type="text"
                          required={isGift}
                          value={recipientName}
                          onChange={(e) => setRecipientName(e.target.value)}
                          placeholder="যিনি কেক রিসিভ করবেন"
                          className="w-full px-3 py-1.5 text-xs rounded-xl border border-purple-200 bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-purple-950 block mb-1">রিসিভারের ফোন *</label>
                        <input
                          type="tel"
                          required={isGift}
                          value={recipientPhone}
                          onChange={(e) => setRecipientPhone(e.target.value)}
                          placeholder="রিসিভারের মোবাইল নম্বর"
                          className="w-full px-3 py-1.5 text-xs rounded-xl border border-purple-200 bg-white"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-purple-950 block mb-1">গিফট কার্ড মেসেজ (ঐচ্ছিক)</label>
                      <input
                        type="text"
                        value={giftCardMessage}
                        onChange={(e) => setGiftCardMessage(e.target.value)}
                        placeholder="যেমন: শুভ জন্মদিন প্রিয় বন্ধু!"
                        className="w-full px-3 py-1.5 text-xs rounded-xl border border-purple-200 bg-white"
                      />
                    </div>
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-purple-900 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hidePriceOnBox}
                        onChange={(e) => setHidePriceOnBox(e.target.checked)}
                        className="w-4 h-4 rounded text-purple-600"
                      />
                      <span>বক্সের স্টিকারে দাম গোপন রাখুন (ইনভয়েস হাইড)</span>
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* SECTION 2: ITEM SELECTION & LIST */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <ShoppingBag size={16} className="text-emerald-700" />
                  <h4 className="text-sm font-bold text-slate-900">২. কেক ও আইটেম নির্বাচন</h4>
                </div>
                <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  যুক্ত হয়েছে: {cartItems.length} টি
                </span>
              </div>

              {/* Item Adder Box */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-3.5">
                {/* Product Search & Card Picker */}
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="text-[11px] font-bold text-slate-700 block">
                      কেক বা পণ্য বাছাই করুন (ছোট কার্ডে ক্লিক করুন অথবা সার্চ করুন):
                    </label>
                    <div className="relative w-full sm:w-60">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        placeholder="কেকের নাম দিয়ে খুঁজুন..."
                        className="w-full pl-7 pr-6 py-1.5 text-xs rounded-xl border border-slate-300 bg-white placeholder:text-slate-400 focus:outline-emerald-600"
                      />
                      {productSearch && (
                        <button
                          type="button"
                          onClick={() => setProductSearch('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Compact Product Cards Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 max-h-48 overflow-y-auto p-2 bg-slate-100/70 rounded-2xl border border-slate-200">
                    {filteredProducts.map((p) => {
                      const isSelected = p.id === selectedProductId;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelectedProductId(p.id)}
                          className={`group flex flex-col text-left rounded-xl p-1.5 border transition-all cursor-pointer relative ${
                            isSelected
                              ? 'bg-emerald-50/90 border-emerald-500 ring-2 ring-emerald-600 shadow-xs'
                              : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-2xs'
                          }`}
                        >
                          <div className="w-full h-16 sm:h-18 rounded-lg overflow-hidden relative bg-slate-100 border border-slate-100">
                            <ProductImageThumbnail
                              src={p.image_url}
                              alt={p.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            />
                            {isSelected && (
                              <span className="absolute top-1 right-1 bg-emerald-600 text-white rounded-full p-0.5 shadow-xs">
                                <Check size={10} strokeWidth={3} />
                              </span>
                            )}
                          </div>
                          <div className="mt-1.5 px-0.5 space-y-0.5">
                            <span className="text-[11px] font-bold text-slate-800 line-clamp-1 block leading-tight">
                              {p.name}
                            </span>
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="font-black text-emerald-800">৳{p.base_price}</span>
                              {p.category_name && (
                                <span className="text-[9px] text-slate-400 truncate max-w-[55px]">
                                  {p.category_name}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                    {filteredProducts.length === 0 && (
                      <div className="col-span-full py-6 text-center text-xs text-slate-500">
                        "{productSearch}" নামে কোনো কেক পাওয়া যায়নি।
                      </div>
                    )}
                  </div>
                </div>

                {/* Selected Product Customization Box */}
                {selectedProduct && (
                  <div
                    className={`p-3.5 sm:p-4 rounded-2xl bg-white border shadow-2xs space-y-3.5 transition-all ${
                      editingCartItemId
                        ? 'border-amber-400 ring-2 ring-amber-300'
                        : 'border-emerald-200/90'
                    }`}
                  >
                    {/* Active Edit Mode Banner */}
                    {editingCartItemId && (
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold">
                        <span className="flex items-center gap-1.5">
                          <Sparkles size={14} className="text-amber-600 shrink-0" />
                          <span>আইটেম এডিট মোড চালু আছে: পরিমার্জন শেষে 'আইটেম আপডেট করুন' চাপুন</span>
                        </span>
                        <button
                          type="button"
                          onClick={handleCancelEditItem}
                          className="text-xs text-amber-800 underline hover:text-amber-950 font-bold cursor-pointer shrink-0 ml-2"
                        >
                          এডিট বাতিল
                        </button>
                      </div>
                    )}

                    {/* Selected Cake Mini Header */}
                    <div className="flex items-center gap-3 pb-2.5 border-b border-slate-100">
                      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden border border-slate-200 shrink-0 bg-slate-50 shadow-2xs">
                        <ProductImageThumbnail
                          src={selectedProduct.image_url}
                          alt={selectedProduct.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                            নির্বাচিত কেক
                          </span>
                          {selectedProduct.category_name && (
                            <span className="text-[10px] text-slate-500 font-medium">
                              {selectedProduct.category_name}
                            </span>
                          )}
                        </div>
                        <h5 className="text-xs sm:text-sm font-black text-slate-900 line-clamp-1 mt-0.5">
                          {selectedProduct.name}
                        </h5>
                        <span className="text-[11px] font-bold text-slate-600">
                          বেস প্রাইস: ৳{selectedProduct.base_price}
                        </span>
                      </div>
                    </div>

                    {/* Variants & Flavors */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Select Variant / Weight */}
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">
                          সাইজ / ওজন (Variant) *
                        </label>
                        <select
                          value={selectedVariantId}
                          onChange={(e) => setSelectedVariantId(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-900 font-semibold cursor-pointer focus:outline-emerald-600"
                        >
                          {productVariants.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name} — ৳{v.price}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Select Flavor */}
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">
                          ফ্লেভার (ঐচ্ছিক)
                        </label>
                        <select
                          value={selectedFlavorId}
                          onChange={(e) => setSelectedFlavorId(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-900 cursor-pointer focus:outline-emerald-600"
                        >
                          <option value="">স্ট্যান্ডার্ড / ডিফোল্ট</option>
                          {productFlavors.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Cake Writing Message */}
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        ✍️ কেকের ওপর লেখার টেক্সট (Cake Writing Message)
                      </label>
                      <input
                        type="text"
                        value={writingMessage}
                        onChange={(e) => setWritingMessage(e.target.value)}
                        placeholder="যেমন: Happy 25th Anniversary Baba & Ma"
                        className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-emerald-600"
                      />
                    </div>

                    {/* Add-ons Checklist */}
                    {productAddons.length > 0 && (
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1.5">
                          অ্যাড-অন আইটেম (মোমবাতি, টপার ইত্যাদি)
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {productAddons.map((addon) => {
                            const isChecked = selectedAddonIds.includes(addon.id);
                            return (
                              <button
                                key={addon.id}
                                type="button"
                                onClick={() => {
                                  setSelectedAddonIds((prev) =>
                                    isChecked ? prev.filter((id) => id !== addon.id) : [...prev, addon.id]
                                  );
                                }}
                                className={`px-2.5 py-1 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-colors cursor-pointer ${
                                  isChecked
                                    ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                                    : 'bg-white border-slate-300 text-slate-700 hover:border-slate-400'
                                }`}
                              >
                                <span>{isChecked ? '✓' : '+'}</span>
                                <span>{addon.name}</span>
                                <span className="text-[10px] text-slate-500">(+৳{addon.price})</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Quantity & Add to Cart Button */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-3">
                        <label className="text-[11px] font-bold text-slate-700">পরিমাণ:</label>
                        <div className="flex items-center gap-1 border border-slate-300 rounded-xl bg-white p-0.5 shadow-2xs">
                          <button
                            type="button"
                            onClick={() => setItemQuantity((q) => Math.max(1, q - 1))}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="কমান"
                          >
                            <Minus size={13} />
                          </button>
                          <span className="w-8 text-center text-xs font-bold text-slate-900">
                            {itemQuantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => setItemQuantity((q) => Math.min(50, q + 1))}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="বাড়ান"
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                        <div className="text-xs text-slate-600 font-medium hidden sm:block">
                          সাবটোটাল: <strong className="text-emerald-800 font-bold">৳{currentItemTotal.toLocaleString()}</strong>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {editingCartItemId && (
                          <button
                            type="button"
                            onClick={handleCancelEditItem}
                            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                          >
                            বাতিল (Cancel)
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleAddItem}
                          className={`px-4 py-2 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer active:scale-98 ${
                            editingCartItemId
                              ? 'bg-amber-600 hover:bg-amber-700 ring-2 ring-amber-400'
                              : 'bg-emerald-800 hover:bg-emerald-900'
                          }`}
                        >
                          {editingCartItemId ? (
                            <>
                              <Check size={15} />
                              <span>✓ আইটেম আপডেট করুন (Save Changes)</span>
                            </>
                          ) : (
                            <>
                              <Plus size={15} />
                              <span>তালিকায় যোগ করুন (+ Add Item)</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Added Items: Small Card Style with Full Info + Image */}
              {cartItems.length > 0 ? (
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 block">
                      যোগ করা আইটেমসমূহ ({cartItems.length} টি):
                    </span>
                    <span className="text-[11px] text-slate-500">
                      মোট মূল্য: <strong className="text-emerald-800 font-black">৳{itemsSubtotal.toLocaleString()}</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {cartItems.map((item, index) => {
                      const isCurrentlyEditing = item.cart_item_id === editingCartItemId;
                      return (
                        <div
                          key={item.cart_item_id}
                          className={`rounded-2xl border p-3 sm:p-3.5 shadow-2xs transition-all flex flex-col justify-between gap-2.5 group ${
                            isCurrentlyEditing
                              ? 'bg-amber-50/70 border-amber-400 ring-2 ring-amber-400 shadow-sm'
                              : 'bg-white border-slate-200/90 hover:border-emerald-300 hover:shadow-xs'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            {/* Product Thumbnail with Badges */}
                            <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 shadow-2xs">
                              <ProductImageThumbnail
                                src={item.product.image_url}
                                alt={item.product.name}
                                className="w-full h-full object-cover"
                              />
                              <span className="absolute top-1 left-1 bg-slate-900/85 text-white text-[9px] font-black px-1.5 py-0.2 rounded-md font-mono">
                                #{index + 1}
                              </span>
                              <span className="absolute bottom-1 right-1 bg-emerald-800 text-white text-[10px] font-black px-1.5 py-0.2 rounded-md shadow-xs">
                                {item.quantity}x
                              </span>
                            </div>

                            {/* Item Details */}
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-start justify-between gap-1">
                                <div>
                                  <h5 className="text-xs font-black text-slate-900 line-clamp-1 leading-tight">
                                    {item.product.name}
                                  </h5>
                                  {isCurrentlyEditing && (
                                    <span className="inline-block mt-0.5 text-[9px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded-md">
                                      ✏️ এডিট করা হচ্ছে...
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0 -mt-0.5 -mr-0.5">
                                  <button
                                    type="button"
                                    onClick={() => handleStartEditItem(item)}
                                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                      isCurrentlyEditing
                                        ? 'bg-amber-200 text-amber-900'
                                        : 'text-emerald-700 hover:bg-emerald-50 hover:text-emerald-900'
                                    }`}
                                    title="এই আইটেমটি এডিট করুন"
                                    aria-label={`Edit ${item.product.name}`}
                                  >
                                    <Edit2 size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveItem(item.cart_item_id)}
                                    className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition-colors cursor-pointer"
                                    title="আইটেমটি মুছুন"
                                    aria-label={`Remove ${item.product.name}`}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                                  📏 {item.selected_variant.name}
                                </span>
                                {item.selected_flavor && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200">
                                    🍰 {item.selected_flavor.name}
                                  </span>
                                )}
                              </div>

                              {item.writing_message && (
                                <div className="bg-amber-50/90 border border-amber-200/90 text-amber-950 px-2.5 py-1 rounded-lg text-[11px] leading-tight">
                                  <span className="text-[10px] text-amber-800 font-bold block">✍️ কেকের ওপর লেখা:</span>
                                  <span className="font-serif italic font-semibold break-words">"{item.writing_message}"</span>
                                </div>
                              )}

                              {item.selected_addons.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-0.5">
                                  {item.selected_addons.map((a) => (
                                    <span
                                      key={a.id}
                                      className="text-[9.5px] font-medium bg-slate-50 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200"
                                    >
                                      +{a.name} (৳{a.price})
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Footer Pricing Row */}
                          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                            <div className="text-[11px] text-slate-500 font-medium">
                              পরিমাণ: <strong className="text-slate-800">{item.quantity} টি</strong>
                              <span className="text-[10px] text-slate-400 ml-1">
                                (@ ৳{item.unit_price.toLocaleString()})
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-black text-emerald-800 font-mono">
                                ৳{item.total_price.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-center py-7 text-slate-400 text-xs border border-dashed border-slate-200 rounded-2xl bg-white/50 space-y-1">
                  <Cake size={24} className="mx-auto text-slate-300 mb-1" />
                  <p className="font-medium text-slate-600">এখনো কোনো আইটেম যোগ করা হয়নি</p>
                  <p className="text-[11px] text-slate-400">
                    উপরের কার্ড থেকে কেক নির্বাচন করে সাইজ/ফ্লেভার ঠিক করে 'তালিকায় যোগ করুন' চাপুন।
                  </p>
                </div>
              )}
            </div>

            {/* SECTION 3: PAYMENT & BILLING */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                <CreditCard size={16} className="text-emerald-700" />
                <h4 className="text-sm font-bold text-slate-900">৩. পেমেন্ট ও বিলিং সেটিংস</h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <p className="text-sm font-semibold">Cash on delivery (COD)</p>

                {/* Coupon Code */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">কুপন কোড (ডিসকাউন্ট)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                      placeholder="Coupon code"
                      className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-white uppercase font-mono font-bold"
                    />
                    <button
                      type="button"
                      onClick={handleApplyCoupon}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl cursor-pointer"
                    >
                      Apply
                    </button>
                  </div>
                  {couponError && <p className="text-[10px] text-rose-600 mt-1">{couponError}</p>}
                  <div className="mt-2 flex flex-wrap gap-2" aria-label="Available offers">
                    {coupons.filter(c=>c.is_active).map(c=><button key={c.id} type="button" onClick={()=>{
                      setCouponInput(c.code);const result=validateCoupon(c,itemsSubtotal);
                      if(result.isValid){setAppliedCoupon(c);setCouponError('');}else{setAppliedCoupon(null);setCouponError(result.reason||'এই অর্ডারের জন্য প্রযোজ্য নয়।');}
                    }} className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-left text-xs text-emerald-900">
                      <strong>{c.code}</strong> · {c.discount_type==='percentage'?c.discount_value+'%':currency+c.discount_value} ছাড় · ন্যূনতম {currency}{c.min_order_amount}
                    </button>)}
                    {!coupons.some(c=>c.is_active)&&<p className="text-xs text-slate-500">বর্তমানে কোনো active offer নেই।</p>}
                  </div>
                  {appliedCoupon && (
                    <p className="text-[10px] text-emerald-700 font-bold mt-1">
                      ✓ কুপন {appliedCoupon.code} প্রযোজ্য হয়েছে (-৳{couponDiscount})
                    </p>
                  )}
                </div>

                {/* Order Note */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">অর্ডার নোট / বিশেষ নির্দেশনা</label>
                  <input
                    type="text"
                    value={orderNote}
                    onChange={(e) => setOrderNote(e.target.value)}
                    placeholder="যেমন: কল দিয়ে ডেলিভারি দিন, কম চিনি ইত্যাদি"
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-white"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 4: BILLING BREAKDOWN SUMMARY */}
            <div className="bg-[#15342e] text-white p-5 rounded-2xl shadow-lg space-y-3">
              <div className="flex items-center justify-between text-xs text-white/70">
                <span>আইটেম সাবটোটাল ({cartItems.length} টি)</span>
                <span className="font-mono font-bold text-white">৳{itemsSubtotal.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-white/70">
                <span>ডেলিভারি ফি ({selectedZone?.name})</span>
                <span className="font-mono font-bold text-white">+৳{deliveryFee.toLocaleString()}</span>
              </div>
              {couponDiscount > 0 && (
                <div className="flex items-center justify-between text-xs text-amber-300">
                  <span>কুপন ছাড়</span>
                  <span className="font-mono font-bold">-৳{couponDiscount.toLocaleString()}</span>
                </div>
              )}
              <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                <div>
                  <span className="text-xs text-white/60 block uppercase font-bold tracking-wider">সর্বমোট বিল (Total)</span>
                  <span className="text-xl sm:text-2xl font-black text-amber-300 font-mono">
                    ৳{grandTotal.toLocaleString()}
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-xs text-white/60 block uppercase font-bold tracking-wider">বকেয়া ক্যাশ (Due COD)</span>
                  <span className={`text-lg sm:text-xl font-black font-mono ${remainingDue > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                    {remainingDue > 0 ? `৳${remainingDue.toLocaleString()}` : '৳০ (PAID)'}
                  </span>
                </div>
              </div>

              {/* Auto Confirm Notice */}
              <div className="bg-emerald-950/70 border border-emerald-500/30 p-2.5 rounded-xl text-[11px] text-emerald-200 flex items-center gap-2">
                <CheckCircle size={15} className="text-emerald-400 shrink-0" />
                <span>অর্ডারটি তৈরির সাথে সাথে 'Confirmed' হয়ে যাবে এবং কিচেন টিম সরাসরি দেখতে পারবে।</span>
              </div>
            </div>

            {/* SECTION 5: MODAL SUBMIT ACTIONS */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 sm:gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="w-full sm:w-auto px-5 py-3 rounded-2xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-colors cursor-pointer text-center"
              >
                বাতিল (Cancel)
              </button>
              <button
                type="submit"
                disabled={isSubmitting || cartItems.length === 0}
                className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-black shadow-lg shadow-rose-200 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98 text-center"
              >
                <CheckCircle size={16} />
                <span>
                  {isSubmitting ? 'অর্ডার তৈরি হচ্ছে...' : `✓ অর্ডার তৈরি ও কনফার্ম করুন — ৳${grandTotal.toLocaleString()}`}
                </span>
              </button>
            </div>
          </form>
        )}
      </div>

      {/* POS Print Modal if triggered directly from created order */}
      {posPrintOrder && (
        <PosPrintModal
          onClose={() => setPosPrintOrder(null)}
          order={posPrintOrder}
          currency={currency}
          shopName={shopSettings?.shop_name}
          shopPhone={shopSettings?.phone}
          shopAddress={shopSettings?.address}
          shopLogoUrl={shopSettings?.logo_url}
          products={products}
          websiteUrl={shopSettings?.website_url}
          facebookUrl={shopSettings?.facebook_url}
        />
      )}
    </div>
  );
};
