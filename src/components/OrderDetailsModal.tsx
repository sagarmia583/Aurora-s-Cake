import type { Product } from '../types';
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Printer,
  FileText,
  Tag,
  ChefHat,
  Gift,
  CheckCircle,
  Clock,
  Phone,
  MapPin,
  User,
  AlertCircle,
  Copy,
  Check,
  ArrowRight,
  Settings2,
  Calendar,
  Layers,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Edit2,
  Save,
} from 'lucide-react';
import type { Order, OrderStatus } from '../types';
import { formatShortOrderNumber } from '../utils/orderUtils';
import {
  PosReceiptType,
  PosPaperSize,
  PosPrinterSettings,
  getPosPrinterSettings,
} from '../services/posPrinterService';
import { PosReceiptSlip,PosPaperStyle } from './PosPrintModal';
import { PosPrinterSettingsModal } from './PosPrinterSettingsModal';
import { resolvePublicWebUrl } from './PosQrCodes';

export interface OrderDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  currency?: string;
  shopName?: string;
  shopPhone?: string;
  shopLogoUrl?: string;
  products?: Product[];
  shopAddress?: string;
  websiteUrl?: string;
  facebookUrl?: string;
  onManageOrder?: () => void;
  onTriggerPosPrint?: (order: Order, type: PosReceiptType) => void;
  endpoint?: string;
}

type ModalTab = 'details' | 'customer_memo' | 'box_sticker' | 'kitchen_ticket';

export const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({
  isOpen,
  onClose,
  order,
  currency = '৳',
  shopName = "Aurora's Cake Artisan Bakery",
  shopPhone = '',
  shopLogoUrl,
  products = [],
  shopAddress = 'Tangail, Bangladesh',
  websiteUrl,
  facebookUrl,
  onManageOrder,
  onTriggerPosPrint,
  endpoint,
}) => {
  const [activeTab, setActiveTab] = useState<ModalTab>('details');
  const [settings, setSettings] = useState<PosPrinterSettings>(() => getPosPrinterSettings());
  const [activePaper, setActivePaper] = useState<PosPaperSize>(() => settings.paperSize || '80mm');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setActiveTab('details');
      setSettings(getPosPrinterSettings());
    }
  }, [isOpen, order?.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSettingsOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSettingsOpen, onClose]);

  if (!isOpen || !order) return null;

  const displayOrder = order;

  const resolvedWebUrl = resolvePublicWebUrl(websiteUrl || settings.websiteUrl);
  const resolvedFacebookUrl =
    facebookUrl || settings.facebookUrl || 'https://www.facebook.com/aurorascake26';

  const customerName = displayOrder.customer_name || (displayOrder as any).name || 'Customer';
  const customerPhone = displayOrder.customer_phone || (displayOrder as any).phone || '';
  const deliveryAddress = displayOrder.delivery_address || (displayOrder as any).address || 'Address not provided';
  const zoneName = displayOrder.delivery_zone?.name || (typeof displayOrder.delivery_zone === 'string' ? displayOrder.delivery_zone : '') || (displayOrder as any).zone || 'Tangail Delivery';
  const deliverySlot = displayOrder.delivery_slot || (displayOrder as any).slot || 'Standard Slot';
  const deliveryDate = displayOrder.delivery_date || (displayOrder as any).date || '';
  const orderNum = formatShortOrderNumber(displayOrder.order_number || displayOrder.id || '0000');
  const shortOrderNum = formatShortOrderNumber(orderNum);

  const rawItems: any[] = Array.isArray(displayOrder.items)
    ? displayOrder.items
    : Array.isArray((displayOrder as any).cart_items)
    ? (displayOrder as any).cart_items
    : Array.isArray((displayOrder as any).order_items)
    ? (displayOrder as any).order_items
    : [];

  const items = rawItems.map((it) => {
    const quantity = Number(it.quantity || 1);
    const productName = it.product_name || it.name || it.product?.name || it.title || 'Cake';
    const variantName = it.variant_name || it.selected_variant?.name || it.variant || 'Regular';
    const flavorName = it.flavor_name || it.selected_flavor?.name || it.flavor || '';
    const writingMessage = it.writing_message || it.cake_message || it.message || '';
    const unitPrice = Number(it.unit_price ?? it.product?.price ?? it.price ?? 0);
    const subtotal = Number(it.subtotal ?? (unitPrice * quantity));
    const addons = Array.isArray(it.addons)
      ? it.addons
      : Array.isArray(it.selected_addons)
      ? it.selected_addons.map((a: any) => ({
          addon_name: a.addon_name || a.name || 'Addon',
          quantity: Number(a.quantity || 1),
          subtotal: Number(a.subtotal || a.price || 0),
        }))
      : [];

    let basePrice: number | undefined =
      it.base_price ?? it.regular_price ?? it.original_price ?? it.product?.base_price ?? it.selected_variant?.price;
    let salePrice: number | undefined =
      it.sale_price ?? it.product?.sale_price ?? it.selected_variant?.sale_price;

    if (basePrice === undefined || salePrice === undefined) {
      try {
        const prods = products;
        const prod = prods.find((p) =>
          (it.product_id && p.id === it.product_id) ||
          (p.name && productName && p.name.trim().toLowerCase() === String(productName).trim().toLowerCase())
        );
        if (prod) {
          const variant = prod.variants?.find((v) =>
            (it.variant_id && v.id === it.variant_id) ||
            (v.name && variantName && v.name.trim().toLowerCase() === String(variantName).trim().toLowerCase())
          );
          if (variant) {
            if (basePrice === undefined) basePrice = variant.price;
            if (salePrice === undefined) salePrice = variant.sale_price;
          }
          if (basePrice === undefined) basePrice = prod.base_price;
          if (salePrice === undefined) salePrice = prod.sale_price;
        }
      } catch {}
    }

    const finalBasePrice = Number(basePrice ?? unitPrice);
    const finalSalePrice = typeof salePrice === 'number' && !isNaN(salePrice) ? Number(salePrice) : undefined;

    return {
      ...it,
      id: it.id || String(Math.random()),
      quantity,
      product_name: productName,
      variant_name: variantName,
      flavor_name: flavorName,
      writing_message: writingMessage,
      unit_price: unitPrice,
      base_price: finalBasePrice,
      sale_price: finalSalePrice,
      subtotal,
      addons,
    };
  });

  const dueCOD =
    displayOrder.due_amount !== undefined
      ? Number(displayOrder.due_amount)
      : displayOrder.payment_method === 'cod'
      ? Number(displayOrder.total_amount || 0) - Number(displayOrder.advance_paid_amount || 0)
      : 0;

  const handleCopyPhone = (phoneNum: string) => {
    try {
      navigator.clipboard.writeText(phoneNum);
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleQuickPrint = (type: PosReceiptType) => {
    setActiveTab(type);
    setTimeout(() => {
      window.print();
    }, 200);
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'pending':
        return {
          label: 'পেন্ডিং (অপেক্ষমান)',
          bg: 'bg-amber-100 text-amber-900 border-amber-300',
          dot: 'bg-amber-500',
        };
      case 'confirmed':
        return {
          label: 'কনফার্মড (গৃহীত)',
          bg: 'bg-blue-100 text-blue-900 border-blue-300',
          dot: 'bg-blue-500',
        };
      case 'preparing':
        return {
          label: 'বেকিং চলছে (কিচেন)',
          bg: 'bg-orange-100 text-orange-950 border-orange-300',
          dot: 'bg-orange-500 animate-pulse',
        };
      case 'ready':
        return {
          label: 'রেডি ও প্যাকেজড',
          bg: 'bg-purple-100 text-purple-900 border-purple-300',
          dot: 'bg-purple-500',
        };
      case 'out_for_delivery':
        return {
          label: 'ডেলিভারিতে আছে (রাইডার)',
          bg: 'bg-indigo-100 text-indigo-900 border-indigo-300',
          dot: 'bg-indigo-500 animate-bounce',
        };
      case 'delivered':
        return {
          label: 'ডেলিভারি সম্পন্ন ✓',
          bg: 'bg-emerald-100 text-emerald-950 border-emerald-300',
          dot: 'bg-emerald-600',
        };
      case 'cancelled':
        return {
          label: 'বাতিল (Cancelled)',
          bg: 'bg-rose-100 text-rose-900 border-rose-300',
          dot: 'bg-rose-500',
        };
      default:
        return {
          label: status,
          bg: 'bg-slate-100 text-slate-800 border-slate-300',
          dot: 'bg-slate-400',
        };
    }
  };

  const statusBadge = getStatusBadge(displayOrder.status);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-4xl w-full p-3.5 sm:p-6 shadow-2xl border border-slate-200 space-y-3 sm:space-y-4 max-h-[94vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-tr from-rose-600 to-amber-500 text-white flex items-center justify-center shadow-md shrink-0">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span
                  className="font-mono text-sm sm:text-base font-black px-2 py-0.5 sm:px-2.5 rounded-xl bg-slate-900 text-amber-300 shadow-2xs tracking-wider shrink-0"
                  title={`পুরো অর্ডার নম্বর: #${orderNum}`}
                >
                  #{shortOrderNum}
                </span>
                <span
                  className={`text-[10px] sm:text-[11px] font-bold px-2 sm:px-2.5 py-0.5 rounded-full border flex items-center gap-1 sm:gap-1.5 shrink-0 ${statusBadge.bg}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${statusBadge.dot}`}></span>
                  <span>{statusBadge.label}</span>
                </span>
                
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 line-clamp-1">
                অর্ডার: <strong>{new Date(displayOrder.created_at).toLocaleDateString('en-GB')} {new Date(displayOrder.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="p-1.5 sm:p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
              title="POS প্রিন্টার সাইজ ও লেআউট সেটিংস"
            >
              <Settings2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              title="বন্ধ করুন (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center justify-between gap-1.5 border-b border-slate-200 pb-2 shrink-0 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1.5 text-xs font-bold shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('details')}
              className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                activeTab === 'details'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>📋 <span className="hidden sm:inline">অর্ডার </span>বিস্তারিত</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('customer_memo')}
              className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                activeTab === 'customer_memo'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <Printer className="w-3.5 h-3.5" />
              <span>🖨️ <span className="hidden sm:inline">POS </span>ক্যাশ মেমো</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('box_sticker')}
              className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                activeTab === 'box_sticker'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <Tag className="w-3.5 h-3.5" />
              <span>📦 <span className="hidden sm:inline">কেক </span>বক্স স্টিকার</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('kitchen_ticket')}
              className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                activeTab === 'kitchen_ticket'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <ChefHat className="w-3.5 h-3.5" />
              <span>👨‍🍳 কিচেন স্লিপ</span>
            </button>
          </div>

          {/* Quick Paper Size Selector if on print tab */}
          {activeTab !== 'details' && (
            <div className="flex items-center gap-1 shrink-0 ml-auto pl-2">
              <span className="text-[10px] text-slate-500 font-medium mr-0.5 hidden sm:inline">কাগজ:</span>
              {(['80mm', '58mm', 'sticker_3x4'] as PosPaperSize[]).map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setActivePaper(size)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                    activePaper === size
                      ? 'bg-slate-800 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  {size === '80mm' ? '80mm' : size === '58mm' ? '58mm' : '3"x4"'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Modal Body Container */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-4">
          {/* TAB 1: ORDER DETAILS */}
          {activeTab === 'details' && (
            <div className="space-y-4">
              {/* Highlighted POS Print Toolbar / Action Card */}
              <div className="bg-gradient-to-r from-rose-50 via-amber-50 to-emerald-50 p-3 sm:p-4 rounded-2xl border border-rose-200 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-xs shrink-0">
                    <Printer className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-black text-xs text-slate-900 flex items-center gap-1.5">
                      <span>🖨️ POS থার্মাল প্রিন্ট অপশনসমূহ</span>
                      <span className="text-[9px] bg-rose-600 text-white font-bold px-1.5 py-0.2 rounded uppercase shrink-0">
                        1-Click
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 line-clamp-1">
                      কাস্টমার ক্যাশ মেমো, বক্স স্টিকার বা কিচেন স্লিপ প্রিন্ট করুন
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5 w-full sm:w-auto sm:flex sm:items-center">
                  <button
                    type="button"
                    onClick={() => handleQuickPrint('customer_memo')}
                    className="px-2 sm:px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 shadow-xs cursor-pointer active:scale-95 transition-all text-center"
                    title="কাস্টমার ক্যাশ মেমো প্রিন্ট করুন"
                  >
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    <span className="whitespace-nowrap">ক্যাশ মেমো</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleQuickPrint('box_sticker')}
                    className="px-2 sm:px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 shadow-xs cursor-pointer active:scale-95 transition-all text-center"
                    title="কেক বক্স স্টিকার প্রিন্ট করুন (ওয়েব ও ফেসবুক কিউআর সহ)"
                  >
                    <Tag className="w-3.5 h-3.5 shrink-0" />
                    <span className="whitespace-nowrap">বক্স স্টিকার</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleQuickPrint('kitchen_ticket')}
                    className="px-2 sm:px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 shadow-xs cursor-pointer active:scale-95 transition-all text-center"
                    title="শেফদের জন্য কিচেন স্লিপ প্রিন্ট করুন"
                  >
                    <ChefHat className="w-3.5 h-3.5 shrink-0" />
                    <span className="whitespace-nowrap">কিচেন স্লিপ</span>
                  </button>
                </div>
              </div>

              {/* Edit Mode Alert & Save Controls */}

              {/* Customer & Delivery Information Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {/* Customer Info Card */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-600" />
                      <span>গ্রাহকের তথ্য (Customer)</span>
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      #{shortOrderNum}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">নাম:</span>
                      <strong className="text-slate-900 text-sm">{customerName}</strong>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">ফোন নম্বর:</span>
                      <div className="flex items-center gap-2">
                        <a
                          href={`tel:${customerPhone}`}
                          className="font-mono font-bold text-emerald-700 hover:underline flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200"
                          title="সরাসরি কল করতে ক্লিক করুন"
                        >
                          <Phone className="w-3 h-3 text-emerald-600" />
                          <span>{customerPhone}</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => handleCopyPhone(customerPhone)}
                          className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-200 transition-colors cursor-pointer"
                          title="নম্বর কপি করুন"
                        >
                          {copiedPhone ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="flex justify-between items-start pt-1">
                      <span className="text-slate-500 shrink-0 mr-2">ঠিকানা:</span>
                      <span className="text-right text-slate-800 font-medium">
                        {deliveryAddress}
                      </span>
                    </div>

                    <div className="flex justify-between items-center pt-1 border-t border-slate-200/60">
                      <span className="text-slate-500">ডেলিভারি এরিয়া / জোন:</span>
                      <span className="bg-slate-200/80 text-slate-800 font-bold px-2 py-0.5 rounded text-[11px]">
                        {zoneName}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Delivery & Rider Card */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-rose-600" />
                      <span>ডেলিভারি শিডিউল ও রাইডার</span>
                    </span>
                    
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">ডেলিভারির তারিখ:</span>
                      <strong className="text-slate-900">{deliveryDate}</strong>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">ডেলিভারি টাইম স্লট:</span>
                      <span className="bg-amber-100 text-amber-950 font-bold px-2.5 py-0.5 rounded border border-amber-300">
                        {deliverySlot}
                      </span>
                    </div>

                    <div className="flex justify-between items-center pt-1">
                      <span className="text-slate-500">নিযুক্ত রাইডার:</span>
                      <strong className="text-slate-900 font-semibold">
                        {displayOrder.rider_name || 'নিয়োগ করা হয়নি (Unassigned)'}
                      </strong>
                    </div>

                    <div className="flex justify-between items-center pt-1 border-t border-slate-200/60">
                      <span className="text-slate-500">ক্যাশ কালেকশন স্ট্যাটাস:</span>
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                          displayOrder.cod_collected
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {displayOrder.cod_collected ? '✓ ক্যাশ রিসিভ হয়েছে' : 'বাকি আছে (Not Collected)'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Surprise Gift Order Banner */}
              {displayOrder.is_gift && (
                <div className="bg-purple-50 text-purple-950 p-4 rounded-2xl border border-purple-200 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-black text-xs text-purple-900">
                      <Gift className="w-4 h-4 text-purple-700" />
                      <span>🎁 সারপ্রাইজ গিফট ডেলিভারি অর্ডার</span>
                    </div>
                    {displayOrder.hide_price_on_box && (
                      <span className="text-[10px] bg-purple-200 font-bold text-purple-900 px-2 py-0.5 rounded">
                        🚫 বক্সে দাম গোপন রাখার নির্দেশ (Do not mention price on box)
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                    <div>
                      প্রাপক (Recipient):{' '}
                      <strong>{displayOrder.recipient_name || displayOrder.customer_name}</strong>
                    </div>
                    <div>
                      প্রাপকের ফোন:{' '}
                      <a
                        href={`tel:${displayOrder.recipient_phone || displayOrder.customer_phone}`}
                        className="font-mono font-bold text-purple-900 hover:underline"
                      >
                        {displayOrder.recipient_phone || displayOrder.customer_phone}
                      </a>
                    </div>
                  </div>

                  {displayOrder.gift_card_message && (
                    <div className="bg-white/80 p-2.5 rounded-xl border border-purple-200 text-xs italic font-serif text-purple-950">
                      💌 গিফট কার্ডের বার্তা: "{displayOrder.gift_card_message}"
                    </div>
                  )}
                </div>
              )}

              {/* Ordered Items Table */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-rose-600" />
                    <span>অর্ডারকৃত পণ্য ও কেকের বিবরণ (Ordered Items)</span>
                  </span>
                  <span className="text-xs font-bold text-slate-600">
                    {items.length} টি আইটেম
                  </span>
                </div>

                <div className="divide-y divide-slate-100 p-3 space-y-3">
                  {items.map((it, idx) => (
                    <div key={it.id || idx} className="pt-2 first:pt-0 space-y-2">
                      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-1">
                        <div>
                          <div className="font-bold text-slate-900 text-sm">
                            {it.quantity}x {it.product_name}
                          </div>
                          <div className="text-xs text-slate-600 flex flex-wrap items-center gap-2 mt-0.5">
                            <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-medium">
                              সাইজ / ভ্যারিয়েন্ট: {it.variant_name}
                            </span>
                            {it.flavor_name && (
                              <span className="bg-rose-50 text-rose-800 px-2 py-0.5 rounded font-medium border border-rose-100">
                                ফ্লেভার: {it.flavor_name}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-right sm:text-right font-mono font-bold text-slate-900 text-sm">
                          {currency}
                          {it.subtotal}
                          <span className="text-[10px] text-slate-500 font-sans font-normal block">
                            Base: {currency}{it.base_price} | Sale: {currency}{it.sale_price ?? it.base_price}
                            {it.quantity > 1 ? ` (${it.quantity}টি)` : ''}
                          </span>
                        </div>
                      </div>

                      {/* Cake Writing Message - Eye Catching Amber Banner / Editable in Edit Mode */}
                      it.writing_message && (
                        <div className="bg-amber-100/90 text-amber-950 p-2.5 rounded-xl border border-amber-300 shadow-2xs space-y-0.5">
                          <div className="flex items-center gap-1.5 font-bold text-[11px] text-amber-900 uppercase">
                            <span>✍️ কেকের উপর লেখার বার্তা (Writing on Cake):</span>
                          </div>
                          <div className="text-sm font-black font-serif tracking-wide pl-1 break-words">
                            "{it.writing_message}"
                          </div>
                        </div>
                      )

                      {/* Add-ons */}
                      {it.addons && it.addons.length > 0 && (
                        <div className="text-xs text-slate-600 pl-3 border-l-2 border-slate-300 space-y-0.5">
                          <span className="text-[10px] uppercase font-bold text-slate-500">
                            যুক্ত অতিরিক্ত আইটেম (Add-ons):
                          </span>
                          {it.addons.map((add: any, aIdx: number) => (
                            <div key={aIdx} className="flex justify-between">
                              <span>
                                + {add.quantity}x {add.addon_name}
                              </span>
                              <span className="font-mono">
                                {currency}
                                {add.subtotal}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Calculation & Payment Card */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    হিসাব ও পেমেন্ট বিবরণী (Financial Summary)
                  </span>
                  <span className="text-xs uppercase font-mono font-bold text-slate-600">
                    {displayOrder.payment_method} ({displayOrder.payment_status})
                  </span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-600">আইটেম সাবটোটাল:</span>
                    <span className="font-mono font-bold text-slate-800">
                      {currency}
                      {displayOrder.subtotal}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-600">ডেলিভারি চার্জ:</span>
                    <span className="font-mono font-bold text-slate-800">
                      +{currency}
                      {displayOrder.delivery_fee}
                    </span>
                  </div>

                  {displayOrder.discount_amount > 0 && (
                    <div className="flex justify-between text-rose-700 font-bold">
                      <span>ডিসকাউন্ট {displayOrder.coupon_code ? `(${displayOrder.coupon_code})` : ''}:</span>
                      <span className="font-mono">
                        -{currency}
                        {displayOrder.discount_amount}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-2 border-t border-slate-300 font-black text-sm">
                    <span className="text-slate-900">সর্বমোট বিল (Grand Total):</span>
                    <span className="text-rose-600 font-mono text-base">
                      {currency}
                      {displayOrder.total_amount}
                    </span>
                  </div>

                  {/* Advance payment info if any */}
                  {displayOrder.advance_paid_amount && displayOrder.advance_paid_amount > 0 ? (
                    <div className="bg-emerald-50 text-emerald-950 p-2.5 rounded-xl border border-emerald-200 space-y-1 text-xs">
                      <div className="flex justify-between items-center font-bold">
                        <span>অগ্রিম পরিশোধ (Advance Paid):</span>
                        <span className="font-mono text-emerald-800">
                          {currency}
                          {displayOrder.advance_paid_amount}
                        </span>
                      </div>
                      {(displayOrder.bkash_trx_id || displayOrder.bkash_number) && (
                        <div className="text-[11px] text-emerald-800">
                          {displayOrder.bkash_trx_id ? `TrxID: ${displayOrder.bkash_trx_id}` : ''}{' '}
                          {displayOrder.bkash_number ? `• বিকাশ নম্বর: ${displayOrder.bkash_number}` : ''}
                        </div>
                      )}
                    </div>
                  ) : null}

                  {/* Highlighted Due Amount */}
                  <div className="flex justify-between items-center bg-rose-50 p-3 rounded-xl border border-rose-200">
                    <div>
                      <span className="text-xs font-black text-rose-900 block">
                        বাকি ক্যাশ কালেকশন (Due COD to Collect):
                      </span>
                      <span className="text-[10px] text-rose-700">
                        {dueCOD > 0
                          ? 'ডেলিভারির সময় গ্রাহকের কাছ থেকে সংগ্রহ করুন'
                          : 'কোন বাকি নেই, সম্পূর্ণ পরিশোধিত'}
                      </span>
                    </div>
                    <span className="font-mono text-lg font-black text-rose-700">
                      {currency}
                      {dueCOD}
                    </span>
                  </div>
                </div>
              </div>

              {/* Special Instructions Note */}
              {displayOrder.order_note && (
                  <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs space-y-1">
                    <span className="font-bold text-slate-700 uppercase text-[10px] block">
                      📝 গ্রাহকের বিশেষ নোট / স্পেশাল নির্দেশ:
                    </span>
                    <p className="text-slate-800 italic">"{displayOrder.order_note}"</p>
                  </div>
                )}

              {/* Bottom Save bar if in edit mode */}
            </div>
          )}

          {/* TAB 2, 3, 4: POS THERMAL PRINT PREVIEWS */}
          {activeTab !== 'details' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-2xl border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab('details')}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  ← অর্ডারের বিস্তারিত তথ্যে ফিরে যান
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md shadow-rose-200 transition-all cursor-pointer active:scale-95"
                  >
                    <Printer className="w-4 h-4" />
                    <span>🖨️ প্রিন্ট করুন (Print Now)</span>
                  </button>
                </div>
              </div>

              {/* Printable Slip Container */}
              <div className="bg-slate-100 p-3 sm:p-5 rounded-2xl border border-slate-200 flex justify-center">
                <div id="printable-pos-slip" className="w-full">
                  <PosReceiptSlip
                    order={displayOrder}
                    activeType={activeTab}
                    activePaper={activePaper}
                    settings={settings}
                    currency={currency}
                    shopName={shopName}
                  shopLogoUrl={shopLogoUrl}
                  products={products}
                    shopPhone={shopPhone}
                    shopAddress={shopAddress}
                    resolvedWebUrl={resolvedWebUrl}
                    resolvedFacebookUrl={resolvedFacebookUrl}
                    copyTitle={
                      settings.copiesCount === 2 && activeTab === 'customer_memo'
                        ? 'Customer Copy'
                        : undefined
                    }
                  />
                  {settings.copiesCount === 2 && activeTab === 'customer_memo' && (
                    <>
                      <div className="my-3 text-center text-xs font-mono text-slate-400">
                        - - - - - - - - - - - [ TEAR HERE ] - - - - - - - - - - -
                      </div>
                      <PosReceiptSlip
                        order={displayOrder}
                        activeType={activeTab}
                        activePaper={activePaper}
                        settings={settings}
                        currency={currency}
                        shopName={shopName}
                  shopLogoUrl={shopLogoUrl}
                  products={products}
                        shopPhone={shopPhone}
                        shopAddress={shopAddress}
                        resolvedWebUrl={resolvedWebUrl}
                        resolvedFacebookUrl={resolvedFacebookUrl}
                        copyTitle="Shop Copy"
                      />
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer with Status Progression Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 pt-3 border-t border-slate-100 shrink-0">
          <div className="text-[11px] text-slate-500 items-center gap-1.5 hidden sm:flex">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
            <span>অর্ডারের তথ্য ও প্রিন্ট অপশন</span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            {onManageOrder && (
              <button type="button" onClick={onManageOrder}
                className="rounded-xl bg-emerald-800 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-900">
                অর্ডার ম্যানেজ করুন
              </button>
            )}

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer border border-slate-200 text-center"
            >
              বন্ধ করুন (Close)
            </button>
          </div>
        </div>
      </div>

      {/* POS Printer Settings Nested Modal */}
      {isSettingsOpen && (
        <PosPrinterSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => {
            setIsSettingsOpen(false);
            setSettings(getPosPrinterSettings());
          }}
          onTestPrint={(newSettings) => {
            setSettings(newSettings);
            setActivePaper(newSettings.paperSize);
            setIsSettingsOpen(false);
            setTimeout(() => window.print(), 300);
          }}
        />
      )}

      {/* POS Print Portal for flawless physical printing directly to document.body */}
      {typeof document !== 'undefined' &&
        createPortal(
          <div className="ac-print-portal">
            <PosPaperStyle paper={activePaper}/>
            <div id="printable-pos-slip" className="w-full">
              <PosReceiptSlip
                order={displayOrder}
                activeType={activeTab === 'details' ? 'customer_memo' : activeTab}
                activePaper={activePaper}
                settings={settings}
                currency={currency}
                shopName={shopName}
                shopPhone={shopPhone}
                shopAddress={shopAddress}
                resolvedWebUrl={resolvedWebUrl}
                resolvedFacebookUrl={resolvedFacebookUrl}
                copyTitle={
                  settings.copiesCount === 2 && (activeTab === 'customer_memo' || activeTab === 'details')
                    ? 'Customer Copy'
                    : undefined
                }
              />
              {settings.copiesCount === 2 && (activeTab === 'customer_memo' || activeTab === 'details') && (
                <>
                  <div className="my-3 text-center text-xs font-mono text-slate-400">
                    - - - - - - - - - - - [ TEAR HERE ] - - - - - - - - - - -
                  </div>
                  <PosReceiptSlip
                    order={displayOrder}
                    activeType={activeTab === 'details' ? 'customer_memo' : activeTab}
                    activePaper={activePaper}
                    settings={settings}
                    currency={currency}
                    shopName={shopName}
                  shopLogoUrl={shopLogoUrl}
                  products={products}
                    shopPhone={shopPhone}
                    shopAddress={shopAddress}
                    resolvedWebUrl={resolvedWebUrl}
                    resolvedFacebookUrl={resolvedFacebookUrl}
                    copyTitle="Shop Copy"
                  />
                </>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
