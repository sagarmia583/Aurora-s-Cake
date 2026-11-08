import { shopErrorMessage } from '../utils/shopErrorMessage';
import {formatShortOrderNumber} from '../utils/orderUtils';
import React, { useState, useEffect, useRef } from 'react';
import { useCakeDialog } from './useCakeDialog';
import { 
  X, 
  User, 
  RotateCcw, 
  Clock, 
  Calendar,
  MapPin, 
  Phone, 
  Mail, 
  CheckCircle2, 
  ShieldCheck, 
  ShoppingBag, 
  Sparkles, 
  Key, 
  Camera, 
  Star, 
  ChevronRight, 
  ExternalLink, 
  Edit2, 
  Save, 
  Receipt,
  ArrowRight,
  PackageCheck,
  RefreshCw,
  Truck
} from 'lucide-react';
import { Order, OrderStatus, Product, CartItem, Review } from '../types';
import { mockDb } from '../services/mockDatabase';
import { getPhoneCustomerProfile, updatePhoneCustomerProfile, loginPhoneCustomer, phoneCustomerOrders, linkPhoneCustomerReceipt } from '../services/phoneCustomerApi';
import { normalizeCheckoutPhone } from '../services/customerPhoneLookup';
import { limitBangladeshiPhoneInput, validateBangladeshiPhone } from '../utils/phoneValidation';
import { loadConfirmedSheetOrders } from '../services/googleSheetOrders';
import { getSavedCustomer, getSavedCustomerDirectory, saveCustomerInfo, findCustomerOrders, fetchCustomerOrdersFromEndpoint } from '../services/customerDirectory';
import { privatePost } from '../services/sheetStaffApi';

const readProfile = (): {name?: string; phone?: string; email?: string; address?: string} => {
  try {
    const value = JSON.parse(localStorage.getItem('aurora_customer_profile_v1') || '{}');
    const base: Record<string, string> = value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).filter(([, entry]) => typeof entry === 'string')) as Record<string, string>
      : {};

    let name = base.name?.trim() || '';
    let phone = base.phone?.trim() || '';
    let email = base.email?.trim() || '';
    let address = base.address?.trim() || '';

    // If missing phone or name, check saved customer directory
    if (!phone || !name || !address) {
      try {
        const dir = getSavedCustomerDirectory();
        const entries = Object.values(dir);
        if (entries.length > 0) {
          const sorted = entries.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
          const latest = sorted[0];
          if (latest) {
            if (!phone && latest.phone) phone = latest.phone;
            if (!name && latest.name) name = latest.name;
            if (!address && latest.address) address = latest.address;
            if (!email && latest.email) email = latest.email;
          }
        }
      } catch {}
    }

    // If still missing, check recent confirmed sheet orders on this device
    if (!phone || !name || !address) {
      try {
        const confirmed = loadConfirmedSheetOrders();
        if (confirmed.length > 0) {
          const sorted = confirmed.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
          const latest = sorted[0];
          if (latest) {
            if (!phone && latest.customer_phone) phone = latest.customer_phone;
            if (!name && latest.customer_name) name = latest.customer_name;
            if (!address && latest.delivery_address) address = latest.delivery_address;
          }
        }
      } catch {}
    }

    return { name, phone, email, address };
  } catch { return {}; }
};

interface CustomerProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountEndpoint: string;
  historySyncing: boolean;
  onSyncHistory: () => void;
  orders: Order[];
  products: Product[];
  currency: string;
  onReorder: (order: Order) => void;
  onTrackOrder: (orderId: string) => void;
  onRecover: (orders: Order[]) => void;
  onOpenAccount: () => void;
  onAddReview?: (review: Omit<Review, 'id' | 'status' | 'created_at'>) => void | Promise<void>;
}

export const CustomerProfileModal: React.FC<CustomerProfileModalProps> = (props) =>
  props.isOpen ? <CustomerProfileModalDialog {...props} /> : null;

const CustomerProfileModalDialog: React.FC<CustomerProfileModalProps> = ({
  isOpen,
  onClose,
  accountEndpoint,
  historySyncing,
  onSyncHistory,
  orders,
  products,
  currency,
  onReorder,
  onTrackOrder,
  onRecover,
  onOpenAccount,
  onAddReview,
}) => {

  // Active Tab: default to Recent Orders
  const [activeTab, setActiveTab] = useState<'orders' | 'profile'>('orders');

  // Asynchronous fetching state for user's past orders
  const [userOrders, setUserOrders] = useState<Order[]>(orders || []);
  const [isFetchingOrders, setIsFetchingOrders] = useState<boolean>(false);
  const [accountPhone, setAccountPhone] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [hasAccountSession, setHasAccountSession] = useState(false);
  const [activePhoneToken, setActivePhoneToken] = useState('');
  const historySignature = useRef('');
  const onRecoverRef = useRef(onRecover);
  onRecoverRef.current = onRecover;

  // Customer Profile State
  const [customerName, setCustomerName] = useState(() => readProfile().name || '');
  const [customerPhone, setCustomerPhone] = useState(() => readProfile().phone || '');
  const [customerEmail, setCustomerEmail] = useState(() => readProfile().email || '');
  const [savedAddress, setSavedAddress] = useState(() => readProfile().address || '');
  const [isEditingProfile, setIsEditingProfile] = useState(() => !readProfile().name);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState<string | null>(null);
  const [serverProfile, setServerProfile] = useState(false);

  // Fetch past orders from database / cache upon modal open
  useEffect(() => {
    if (isOpen) {
      setIsFetchingOrders(true);
      const prof = readProfile();
      const activePhone = customerPhone || prof.phone || accountPhone || '';
      if (!customerPhone && prof.phone) setCustomerPhone(prof.phone);
      if (!accountPhone && prof.phone) setAccountPhone(prof.phone);
      if (!customerName && prof.name) setCustomerName(prof.name);
      if (!savedAddress && prof.address) setSavedAddress(prof.address);
      if (!customerEmail && prof.email) setCustomerEmail(prof.email);

      try {
        const localConfirmed = loadConfirmedSheetOrders();
        const mockOrders = mockDb.getOrders();
        const pool = [...orders, ...localConfirmed, ...mockOrders];
        if (activePhone.trim()) {
          const matched = findCustomerOrders(activePhone, pool);
          setUserOrders(matched);
        } else {
          setUserOrders([]);
        }
      } catch {
        setUserOrders([]);
      } finally {
        setIsFetchingOrders(false);
      }

      if (validateBangladeshiPhone(activePhone).isValid && accountEndpoint) {
        fetchCustomerOrdersFromEndpoint(accountEndpoint, activePhone).then((remote) => {
          if (remote.orders && remote.orders.length > 0) {
            setUserOrders(remote.orders);
            onRecoverRef.current(remote.orders);
          }
          if (remote.profile) {
            if (remote.profile.name) setCustomerName(prev => prev || remote.profile!.name);
            if (remote.profile.address) setSavedAddress(prev => prev || remote.profile!.address);
          }
        }).catch(() => {});
      }
    }
  }, [isOpen, orders, customerPhone, accountPhone, accountEndpoint]);

  useEffect(()=>{
    if(!isOpen)return;
    let token=activePhoneToken;try{token=token||sessionStorage.getItem('aurora_customer_phone_session_v1')||'';}catch{}
    setHasAccountSession(!!token);
    setAccountPhone(readProfile().phone||'');
    setServerProfile(false);
    if(!token)return;
    let active=true,loading=false;
    const sync=async()=>{
      if(!active||loading||document.visibilityState==='hidden')return;
      loading=true;
      try{
        const [profile,history]=await Promise.all([
          getPhoneCustomerProfile(accountEndpoint,token),
          phoneCustomerOrders(accountEndpoint,token)
        ]);
        if(!active)return;
        setServerProfile(true);setHasAccountSession(true);
        setCustomerName(profile.name);setCustomerPhone(profile.phone);
        setCustomerEmail(profile.email);setSavedAddress(profile.address);
        const signature=JSON.stringify(history.map(order=>[order.id,order.status,order.updated_at,order.delivery_otp]));
        if(historySignature.current!==signature){
          historySignature.current=signature;
          onRecoverRef.current(history);
        }
      }catch{
        if(active)setProfileSuccessMsg('Mobile account could not refresh. Sign in again with your phone and password.');
      }finally{loading=false;}
    };
    void sync();
    const timer=window.setInterval(()=>{void sync();},20000);
    return()=>{active=false;window.clearInterval(timer);};
  },[isOpen,accountEndpoint,activePhoneToken]);

  const handleAccountSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (accountBusy) return;
    setAccountBusy(true);
    setAccountError('');

    const targetPhone = normalizeCheckoutPhone(accountPhone);
    if (!targetPhone) {
      setAccountError('একটি সঠিক ১১ ডিজিটের মোবাইল নম্বর লিখুন (যেমন: 017XXXXXXXX)।');
      setAccountBusy(false);
      return;
    }

    try {
      // 1. If password is provided and >= 4 chars, try server password account login
      if (accountPassword.trim().length >= 4) {
        try {
          const info = await loginPhoneCustomer(accountEndpoint, accountPhone, accountPassword);
          let history = await phoneCustomerOrders(accountEndpoint, info.token);
          let added = 0;
          const proven = orders.filter(
            (order) =>
              order.persistence === 'google_sheets' &&
              !!order.customer_access_token &&
              normalizeCheckoutPhone(order.customer_phone) === normalizeCheckoutPhone(info.profile.phone) &&
              !history.some((item) => item.id === order.id)
          ).slice(0, 8);
          for (const receipt of proven) {
            try {
              await linkPhoneCustomerReceipt(accountEndpoint, info.token, receipt);
              added++;
            } catch {
              // ignore
            }
          }
          if (added) history = await phoneCustomerOrders(accountEndpoint, info.token);
          try { sessionStorage.setItem('aurora_customer_phone_session_v1', info.token); } catch {}
          setActivePhoneToken(info.token);
          setHasAccountSession(true);
          setServerProfile(true);
          setCustomerName(info.profile.name);
          setCustomerPhone(info.profile.phone);
          setCustomerEmail(info.profile.email);
          setSavedAddress(info.profile.address);
          setAccountPassword('');
          historySignature.current = JSON.stringify(history.map((order) => [order.id, order.status, order.updated_at, order.delivery_otp]));
          onRecoverRef.current(history);
          setProfileSuccessMsg(added ? 'Signed in. Your original receipts were linked to this account.' : 'Signed in. Your order history is ready.');
          return;
        } catch (pwErr) {
          setAccountError(shopErrorMessage(pwErr, 'Phone sign-in failed.'));
          return;
        }
      }

      // 2. Passwordless phone lookup (no password needed)
      const localConfirmed = loadConfirmedSheetOrders();
      const mockOrders = mockDb.getOrders();
      let combinedPool = [...orders, ...localConfirmed, ...mockOrders];

      // Try fetching remote orders from endpoint if connected
      if (accountEndpoint) {
        try {
          const remote = await fetchCustomerOrdersFromEndpoint(accountEndpoint, accountPhone);
          if (remote.orders && remote.orders.length > 0) {
            combinedPool = [...remote.orders, ...combinedPool];
            onRecoverRef.current(remote.orders);
          }
          if (remote.profile) {
            if (!customerName && remote.profile.name) setCustomerName(remote.profile.name);
            if (!savedAddress && remote.profile.address) setSavedAddress(remote.profile.address);
          }
        } catch {
          // ignore endpoint network errors
        }
      }

      const matching = findCustomerOrders(accountPhone, combinedPool);
      setUserOrders(matching);
      setCustomerPhone(accountPhone);

      // Load saved customer profile if available
      const saved = getSavedCustomer(accountPhone, combinedPool);
      if (saved) {
        if (saved.name) setCustomerName(saved.name);
        if (saved.address) setSavedAddress(saved.address);
      }

      if (matching.length > 0) {
        setProfileSuccessMsg(`মোবাইল নম্বর ${accountPhone} এর বিপরীতে ${matching.length}টি অর্ডার পাওয়া গেছে!`);
      } else {
        setProfileSuccessMsg(`মোবাইল নম্বর ${accountPhone} এ পূর্বের কোনো অর্ডার নেই। এখনই কেক মেনু থেকে অর্ডার করতে পারেন!`);
      }
    } catch (error) {
      setAccountError(shopErrorMessage(error, 'অর্ডার লোড করতে সমস্যা হয়েছে।'));
    } finally {
      setAccountBusy(false);
    }
  };

  // Filter orders: all, active, delivered
  const [orderFilter, setOrderFilter] = useState<'all' | 'active' | 'delivered'>('all');

  // Review Form Modal inside Profile
  const [reviewOrder, setReviewOrder] = useState<Order | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewImage, setReviewImage] = useState('');
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState('');

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
  const dialogRef = useCakeDialog(reviewOrder ? () => setReviewOrder(null) : onClose, reviewOrder?.id);

  // Reorder notification toast
  const [reorderedOrderId, setReorderedOrderId] = useState<string | null>(null);
  const [reorderNotification, setReorderNotification] = useState<string | null>(null);

  // A customer sees their own phone's orders cleanly without password
  const visibleOrders = React.useMemo(() => {
    const activePhone = customerPhone || accountPhone;
    if (activePhone && activePhone.trim()) {
      const localConfirmed = loadConfirmedSheetOrders();
      const mockOrders = mockDb.getOrders();
      const pool = [...userOrders, ...orders, ...localConfirmed, ...mockOrders];
      const matched = findCustomerOrders(activePhone, pool);
      if (matched.length > 0) return matched;
    }
    return userOrders;
  }, [userOrders, orders, customerPhone, accountPhone]);
  const filteredOrders = visibleOrders.filter((o) => {
    if (orderFilter === 'active') {
      return o.status !== 'delivered' && o.status !== 'cancelled';
    }
    if (orderFilter === 'delivered') {
      return o.status === 'delivered';
    }
    return true;
  });

  // Calculate summary metrics
  const totalSpent = visibleOrders.reduce((sum, o) => sum + (o.status !== 'cancelled' ? o.total_amount : 0), 0);
  const activeOrdersCount = visibleOrders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled').length;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const phone = customerPhone.trim() || accountPhone.trim();
    if (phone) {
      saveCustomerInfo({
        phone,
        name: customerName.trim(),
        address: savedAddress.trim(),
        email: customerEmail.trim(),
      });
      try {
        localStorage.setItem('aurora_customer_profile_v1', JSON.stringify({
          phone: normalizeCheckoutPhone(phone) || phone,
          name: customerName.trim(),
          address: savedAddress.trim(),
          email: customerEmail.trim(),
        }));
      } catch {}

      if (accountEndpoint) {
        privatePost(accountEndpoint, {
          action: 'customer_contact_submit',
          name: customerName.trim(),
          phone,
          address: savedAddress.trim(),
        }).catch(() => {});
      }
    }

    let token = '';
    try { token = sessionStorage.getItem('aurora_customer_phone_session_v1') || ''; } catch {}
    if (token) {
      try {
        await updatePhoneCustomerProfile(accountEndpoint, token, {
          name: customerName.trim(),
          email: customerEmail.trim(),
          address: savedAddress.trim(),
        });
        setIsEditingProfile(false);
        setProfileSuccessMsg('Profile saved to your bakery account. (আপনার তথ্য সফলভাবে সংরক্ষিত হয়েছে)');
        return;
      } catch (error) {
        setProfileSuccessMsg(shopErrorMessage(error, 'Your account profile could not be saved.'));
        return;
      }
    }

    setIsEditingProfile(false);
    setProfileSuccessMsg('আপনার কাস্টমার তথ্য ও ঠিকানা সফলভাবে সংরক্ষণ করা হয়েছে! পরবর্তী অর্ডারে এগুলো স্বয়ংক্রিয়ভাবে ব্যবহৃত হবে।');
  };

  const handleReorderClick = (order: Order) => {
    onClose();
    onReorder(order);
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reviewBusy || !reviewOrder || !reviewComment.trim()) return;
    setReviewBusy(true);setReviewError('');
    try {

    const firstItem = reviewOrder.items[0];
    if (firstItem) {
      const reviewPayload = {
        product_id: firstItem.product_id,
        product_name: firstItem.product_name,
        customer_name: customerName.trim() || 'Guest',
        rating: reviewRating,
        comment: reviewComment.trim(),
        image_url: reviewImage.trim() || undefined,
        verified_purchase: true,
      };
      if (!onAddReview) throw new Error('Review service is unavailable.');
      await onAddReview(reviewPayload);
    }

    setReviewSubmitted(true);
    setTimeout(() => {
      setReviewSubmitted(false);
      setReviewOrder(null);
      setReviewComment('');
      setReviewImage('');
    }, 1500);
    } catch(error) {setReviewError(shopErrorMessage(error, 'Review could not be saved.'));}
    finally {setReviewBusy(false);}
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'delivered':
        return { 
          bg: 'bg-emerald-100 text-emerald-800 border-emerald-200', 
          dot: 'bg-emerald-500', 
          label: 'Delivered' 
        };
      case 'out_for_delivery':
        return { 
          bg: 'bg-sky-100 text-sky-800 border-sky-200 animate-pulse', 
          dot: 'bg-sky-500', 
          label: 'Out for Delivery' 
        };
      case 'preparing':
        return { 
          bg: 'bg-rose-100 text-rose-800 border-rose-200', 
          dot: 'bg-rose-500', 
          label: 'In the Oven (Baking)' 
        };
      case 'ready':
        return { 
          bg: 'bg-teal-100 text-teal-800 border-teal-200', 
          dot: 'bg-teal-500', 
          label: 'Boxed & Ready' 
        };
      case 'assigned':
        return { 
          bg: 'bg-indigo-100 text-indigo-800 border-indigo-200', 
          dot: 'bg-indigo-500', 
          label: 'Rider Assigned' 
        };
      case 'confirmed':
        return { 
          bg: 'bg-amber-100 text-amber-800 border-amber-200', 
          dot: 'bg-amber-500', 
          label: 'Confirmed' 
        };
      case 'cancelled':
        return { 
          bg: 'bg-red-100 text-red-800 border-red-200', 
          dot: 'bg-red-500', 
          label: 'Cancelled' 
        };
      default:
        return { 
          bg: 'bg-slate-100 text-slate-800 border-slate-200', 
          dot: 'bg-slate-400', 
          label: 'Pending' 
        };
    }
  };

  const formatOrderDate = (dateString: string) => {
    try {
      const d = new Date(dateString);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }) + ' at ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateString;
    }
  };

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="profile-title" data-cake-dialog tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div
        className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-rose-100 overflow-hidden my-6 flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Profile Header */}
        <div className="p-6 bg-gradient-to-r from-rose-950 via-slate-900 to-rose-900 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-rose-500 to-amber-500 flex items-center justify-center text-white text-2xl font-black shadow-lg border-2 border-white/20">
              {customerName ? customerName.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() : 'AC'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="profile-title" className="text-xl font-black text-white">{customerName || 'Your cake journal'}</h3>
                <span className="bg-amber-400 text-slate-900 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 shadow-xs">
                  <Sparkles className="w-2.5 h-2.5" /> {serverProfile?'Bakery account profile':'Guest device profile'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 flex items-center gap-2">
                <span>{customerPhone}</span>
                <span>•</span>
                <span className="text-emerald-400 font-semibold">{serverProfile?'Saved to your account':'Saved on this device'}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer self-end sm:self-center"
            title="Close" aria-label="Close your cake journal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-rose-50 px-6 py-4 border-b border-rose-100 space-y-3">
           <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
             <p className="text-sm font-bold text-rose-950 flex items-center gap-1.5">
               <Phone className="w-4 h-4 text-rose-600" />
               <span>Mobile number → Order history → Live tracking</span>
             </p>
             <span className="text-xs text-rose-800 font-semibold bg-rose-100 px-2.5 py-0.5 rounded-full">
               কোনো পাসওয়ার্ড ছাড়াই শুধু নম্বর দিয়েই দেখা যাবে
             </span>
           </div>
           <p className="text-xs text-slate-700">
             আপনার ফোন নম্বর (Mobile number) দিয়ে পূর্বের সকল অর্ডার দেখুন ও সরাসরি রি-অর্ডার করুন। (A phone number alone cannot unlock private addresses on other devices without local receipt or verified session. You can optionally use Mobile account password for full account sync).
           </p>
           {!serverProfile&&<form onSubmit={handleAccountSignIn} className="space-y-2">
             <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 items-center">
               <input aria-label="Mobile number" required type="tel" autoComplete="tel" inputMode="tel"
                 maxLength={13} pattern="01[3-9][0-9]{8}"
                 value={accountPhone} onChange={e=>setAccountPhone(limitBangladeshiPhoneInput(e.target.value))}
                 placeholder="01XXXXXXXXX (কাস্টমারের ফোন নম্বর)" className="rounded-xl border bg-white p-3 text-sm focus:outline-rose-500 font-medium text-slate-900"/>
               <input aria-label="Mobile account password" type="password" autoComplete="current-password"
                 value={accountPassword} onChange={e=>setAccountPassword(e.target.value)}
                 placeholder="Mobile account password (ঐচ্ছিক)" className="rounded-xl border bg-white p-3 text-sm focus:outline-rose-500 text-slate-900"/>
               <button type="submit" disabled={accountBusy || !accountPhone.trim()} className="rounded-xl bg-rose-700 hover:bg-rose-800 px-5 py-3 font-bold text-white text-sm disabled:opacity-50 transition-colors cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap">
                 {accountBusy ? <RefreshCw className="w-4 h-4 animate-spin"/> : <ShoppingBag className="w-4 h-4"/>}
                 <span>Load my orders</span>
               </button>
             </div>
             <p className="text-[11px] font-semibold text-emerald-800">
               ✨ কোনো পাসওয়ার্ড এর দরকার নেই; শুধু ফোন নম্বর দিয়ে &ldquo;Load my orders&rdquo; এ চাপলেই আগের সব অর্ডার দেখা যাবে ও ১-ক্লিকে রি-অর্ডার করা যাবে।
             </p>
           </form>}
           {serverProfile&&<p className="text-xs font-semibold text-emerald-800">Signed in · Your order history refreshes every 20 seconds while your profile is open.</p>}
           {accountError&&<p role="alert" className="text-xs bg-red-100 rounded-lg p-2 text-red-800">{accountError}</p>}
           <button type="button" onClick={()=>{onClose();onOpenAccount();}} className="text-xs font-semibold text-rose-900 underline block">
             {hasAccountSession?'Manage mobile account & link old receipts':'Create mobile account / recover original receipt'}
           </button>
         </div>
        {/* Quick Metrics Bar */}
        <div className="grid grid-cols-3 gap-2 px-6 py-3 bg-slate-50 border-b border-slate-200/80 text-xs">
          <div className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Total Orders</span>
            <span className="text-base font-black text-slate-800">{visibleOrders.length}</span>
          </div>
          <div className="space-y-0.5 border-l border-slate-200 pl-3">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Total Spent</span>
            <span className="text-base font-black text-rose-600">{currency}{totalSpent.toLocaleString()}</span>
          </div>
          <div className="space-y-0.5 border-l border-slate-200 pl-3">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Active Deliveries</span>
            <span className="text-base font-black text-sky-600">{activeOrdersCount} in progress</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('orders')}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                activeTab === 'orders'
                  ? 'border-rose-600 text-rose-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Recent Orders ({visibleOrders.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('profile')}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                activeTab === 'profile'
                  ? 'border-rose-600 text-rose-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <User className="w-4 h-4" />
              <span>Customer Details & Address</span>
            </button>
          </div>

          {activeTab === 'orders' && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs">
              <span className="text-slate-400 text-[11px] font-medium">Filter:</span>
              {(['all', 'active', 'delivered'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setOrderFilter(f)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold capitalize transition-colors cursor-pointer ${
                    orderFilter === f
                      ? 'bg-rose-100 text-rose-800'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="overflow-y-auto p-6 space-y-6 flex-1">
          {/* Reorder Toast Banner */}
          {reorderNotification && (
            <div className="bg-emerald-600 text-white p-3.5 rounded-2xl shadow-lg flex items-center justify-between text-xs font-bold animate-fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-200 shrink-0" />
                <span>{reorderNotification}</span>
              </div>
              <span className="text-[11px] underline">Opening bag...</span>
            </div>
          )}

          {/* TAB 1: RECENT ORDERS SECTION */}
          {activeTab === 'orders' && (
            <section aria-label="Recent Orders" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                    <span>Recent Orders</span>
                    <span className="text-xs bg-rose-100 text-rose-800 px-2.5 py-0.5 rounded-full font-bold">
                      {filteredOrders.length}
                    </span>
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    View your past order summaries, current status, total price, and order dates with 1-click reorder.
                  </p>
                </div>

                <button type="button" disabled={historySyncing} onClick={onSyncHistory}
                  className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 flex gap-1.5 items-center disabled:opacity-60">
                  <RefreshCw className={`w-3.5 h-3.5 ${historySyncing ? 'animate-spin' : ''}`} />
                  {historySyncing ? 'Checking order history…' : 'Sync history'}
                </button>
              </div>

              {filteredOrders.length === 0 ? (
                <div className="text-center py-16 bg-slate-50 rounded-3xl border border-slate-200/80 p-8 space-y-3">
                  <div className="w-16 h-16 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mx-auto text-2xl shadow-xs">
                    🎂
                  </div>
                  <h4 className="font-bold text-slate-800 text-base">No orders found</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    You haven't placed an order matching this filter yet. Explore our handcrafted celebration cakes!
                  </p>
                  <button
                    onClick={() => {
                      onClose();
                      window.scrollTo({ top: 300, behavior: 'smooth' });
                    }}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 px-4 py-2.5 rounded-xl transition-colors cursor-pointer"
                  >
                    <span>Browse Fresh Cakes</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredOrders.map((order) => {
                    const statusInfo = getStatusBadge(order.status);
                    const isDelivered = order.status === 'delivered';
                    const isReordered = reorderedOrderId === order.id;
                    const itemCount = order.items.reduce((sum, it) => sum + it.quantity, 0);

                    return (
                      <div
                        key={order.id}
                        className="bg-white rounded-3xl border border-slate-200 hover:border-rose-300 shadow-xs hover:shadow-md transition-all p-5 space-y-4 relative overflow-hidden"
                      >
                        {/* Header: Order Number, Date, Status Badge, Total Price */}
                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 pb-3.5">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-black text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded-md">
                                #{formatShortOrderNumber(order.order_number)}
                              </span>
                              
                              {/* Order Status */}
                              <span
                                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 ${statusInfo.bg}`}
                                title={`Status: ${statusInfo.label}`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                                <span>Status: {statusInfo.label}</span>
                              </span>
                            </div>

                            {/* Order Date */}
                            <div className="text-[11px] text-slate-600 flex items-center gap-2 pt-0.5">
                              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>Order Date: <strong className="text-slate-800">{formatOrderDate(order.created_at)}</strong></span>
                              <span>•</span>
                              <span className="text-slate-400">Slot: {order.delivery_slot.split(' ')[0]}</span>
                            </div>
                          </div>

                          {/* Total Price */}
                          <div className="text-left sm:text-right">
                            <span className="text-[10px] text-slate-400 uppercase font-semibold block">Total Price</span>
                            <span className="text-xl font-black text-rose-600 block leading-tight">
                              {currency}{order.total_amount.toLocaleString()}
                            </span>
                            <span className="text-[10px] text-slate-400 uppercase font-medium">
                              {order.payment_method} ({order.payment_status})
                            </span>
                          </div>
                        </div>

                        {/* Order Items Breakdown */}
                        <div className="space-y-2">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                            Order Summary ({itemCount} {itemCount === 1 ? 'item' : 'items'})
                          </span>

                          <div className="space-y-2">
                            {order.items.map((item) => (
                              <div
                                key={item.id}
                                className="bg-slate-50/80 p-3 rounded-2xl border border-slate-100 text-xs space-y-1.5"
                              >
                                <div className="flex justify-between items-start">
                                  <div>
                                    <h5 className="font-bold text-slate-900 leading-tight">
                                      {item.quantity}x {item.product_name}
                                    </h5>
                                    <div className="text-[11px] text-rose-600 font-semibold mt-0.5">
                                      Size: {item.variant_name}
                                      {item.flavor_name && (
                                        <span className="text-slate-600 font-normal"> • Flavor: {item.flavor_name}</span>
                                      )}
                                    </div>
                                  </div>
                                  <span className="font-bold text-slate-800">
                                    {currency}{item.subtotal}
                                  </span>
                                </div>

                                {/* Cake Dedication Message */}
                                {item.writing_message && (
                                  <div className="text-[11px] bg-amber-50 text-amber-900 px-2.5 py-1 rounded-lg border border-amber-200 font-medium">
                                    ✍️ Piped Dedication: "{item.writing_message}"
                                  </div>
                                )}

                                {/* Addons */}
                                {item.addons && item.addons.length > 0 && (
                                  <div className="text-[10px] text-slate-500 pl-2 border-l-2 border-rose-200">
                                    Add-ons: {item.addons.map((a) => `${a.addon_name} (+${currency}${a.unit_price})`).join(', ')}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Delivery Location */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-rose-50/40 p-3 rounded-2xl border border-rose-100 text-xs">
                          <div className="flex items-start gap-2 text-slate-600">
                            <MapPin className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-semibold text-slate-800">{order.delivery_address}</span>
                              <span className="text-[10px] text-slate-500 block">
                                Zone: {order.delivery_zone.name}
                              </span>
                            </div>
                          </div>

                          {order.status === 'out_for_delivery' && (
                            <div className="bg-white px-3 py-1.5 rounded-xl border border-emerald-300 flex items-center gap-2 shrink-0">
                              <Truck className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="text-[11px] font-bold text-emerald-800">রাইডার ডেলিভারির পথে</span>
                            </div>
                          )}
                        </div>

                        {/* Action Buttons: Reorder, Live Tracker, Review */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
                          <div className="flex items-center gap-2">
                            {/* Live Tracker Button */}
                            <button
                              onClick={() => {
                                onClose();
                                onTrackOrder(order.id);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                            >
                              <ExternalLink className="w-3.5 h-3.5 text-rose-600" />
                              <span>Live Tracker</span>
                            </button>

                            {/* Review Button if Delivered */}
                            {isDelivered && (
                              <button
                                onClick={() => setReviewOrder(order)}
                                className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                              >
                                <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
                                <span>Leave Review</span>
                              </button>
                            )}
                          </div>

                          {/* REORDER BUTTON */}
                          <button
                            onClick={() => handleReorderClick(order)}
                            disabled={isReordered}
                            aria-label="Reorder"
                            title="Reorder this past order"
                            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer active:scale-95 ${
                              isReordered
                                ? 'bg-emerald-600 text-white shadow-emerald-200 animate-pulse'
                                : 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-200'
                            }`}
                          >
                            <RotateCcw className={`w-3.5 h-3.5 ${isReordered ? 'animate-spin' : ''}`} />
                            <span>{isReordered ? 'Added to Cart!' : 'Reorder'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* TAB 2: PROFILE & SAVED ADDRESS */}
          {activeTab === 'profile' && (
            <div className="space-y-6 max-w-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-base">Your Customer Details</h4>
                  <p className="text-xs text-slate-500">
                    Save your preferred contact details on this device.
                  </p>
                </div>
                {!isEditingProfile && (
                  <button
                    onClick={() => setIsEditingProfile(true)}
                    className="flex items-center gap-1.5 text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 px-3 py-1.5 rounded-xl cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit Profile</span>
                  </button>
                )}
              </div>

              {profileSuccessMsg && (
                <div className="bg-emerald-50 text-emerald-700 p-3 rounded-xl border border-emerald-200 text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{profileSuccessMsg}</span>
                </div>
              )}

              <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Full Name</label>
                  <input
                    type="text"
                    disabled={!isEditingProfile}
                    aria-label="Full name" value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 disabled:bg-slate-50 disabled:text-slate-600 font-semibold text-slate-900"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Mobile phone</label>
                  <input
                    type="tel"
                    disabled={!isEditingProfile}
                    aria-label="Mobile phone" value={customerPhone}
                    maxLength={13} inputMode="numeric" pattern="01[3-9][0-9]{8}"
                    onChange={(e) => setCustomerPhone(limitBangladeshiPhoneInput(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 disabled:bg-slate-50 disabled:text-slate-600 font-semibold text-slate-900"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Email Address</label>
                  <input
                    type="email"
                    disabled={!isEditingProfile}
                    aria-label="Email address" value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 disabled:bg-slate-50 disabled:text-slate-600 font-semibold text-slate-900"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Default Delivery Address</label>
                  <textarea
                    rows={2}
                    disabled={!isEditingProfile}
                    aria-label="Delivery address" value={savedAddress}
                    onChange={(e) => setSavedAddress(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 disabled:bg-slate-50 disabled:text-slate-600 font-semibold text-slate-900"
                  />
                </div>

                {isEditingProfile && (
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingProfile(false)}
                      className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Save className="w-4 h-4" />
                      <span>Save Changes</span>
                    </button>
                  </div>
                )}
              </form>

              {/* VIP Club Perks */}
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-3xl p-5 space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  <h5 className="font-bold text-amber-950 text-sm">A little extra sweetness</h5>
                </div>
                <p className="text-xs text-amber-900/80 leading-relaxed">
                  Enjoy exclusive seasonal discounts and member rewards on all your celebration cake orders.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* REVIEW SUBMISSION MODAL */}
      {reviewOrder && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div role="dialog" aria-modal="true" aria-labelledby="review-title" data-cake-subdialog tabIndex={-1} className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <h4 id="review-title" className="font-bold text-slate-900 text-base">Write a Review</h4>
              <button
                onClick={() => setReviewOrder(null)}
                aria-label="Close review dialog"
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {reviewSubmitted ? (
              <div className="py-8 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto text-2xl font-bold">
                  ✓
                </div>
                <h5 className="font-bold text-slate-900 text-sm">Thank You for Your Review!</h5>
                <p className="text-xs text-slate-500">
                  Saved for staff approval. Your review will appear after approval.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitReview} className="space-y-4 text-xs">
                {reviewError && <p role="alert" className="text-red-700">{reviewError}</p>}
                <div>
                  <span className="text-slate-500 block mb-1">Item:</span>
                  <span className="font-bold text-slate-900 text-sm">
                    {reviewOrder.items[0]?.product_name}
                  </span>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Your Rating</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        aria-label={`Rate ${star} out of 5`} aria-pressed={reviewRating === star}
                        onClick={() => setReviewRating(star)}
                        className="p-1 hover:scale-110 transition-transform cursor-pointer"
                      >
                        <Star
                          className={`w-6 h-6 ${
                            reviewRating >= star
                              ? 'text-amber-400 fill-amber-400'
                              : 'text-slate-300'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Review Comment</label>
                  <textarea
                    rows={3}
                    required
                    placeholder="কেকের স্বাদ, ক্রিম ও সার্ভিসের অভিজ্ঞতা শেয়ার করুন..."
                    aria-label="Review comment" value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-slate-800"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">
                    Upload Cake Photo (ডেলিভারিকৃত কেকের ছবি যোগ করুন)
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl cursor-pointer font-bold flex items-center gap-1.5 transition-colors">
                      <Camera className="w-3.5 h-3.5 text-rose-600" />
                      <span>Choose Photo</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleReviewImageUpload}
                        className="hidden"
                      />
                    </label>
                    <span className="text-[11px] text-slate-400">or enter image link below</span>
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
                        alt="Cake preview"
                        className="w-16 h-16 object-cover rounded-xl border-2 border-rose-300 shadow-sm"
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

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setReviewOrder(null)}
                    className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-md cursor-pointer"
                    disabled={reviewBusy}
                  >
                    Submit Review
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
