import React, { useState, useMemo, useRef } from 'react';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Printer,
  CheckCircle,
  Tag,
  X,
  ShoppingCart,
  Banknote,
  Smartphone,
  CreditCard,
  RotateCcw,
  Calculator,
} from 'lucide-react';
import type { Product, Sale, PosCartItem, AccountType } from '../../types';

interface PosModuleProps {
  products: Product[];
  currency: string;
  staffName: string;
  onCompleteSale?: (sale: Omit<Sale, 'id' | 'sale_number' | 'created_at'>) => Promise<void>;
}

type PayMode = AccountType | 'split';

const PAYMENT_MODES: { key: PayMode; label: string; icon: React.ReactNode; color: string }[] = [
  { key: 'cash', label: 'ক্যাশ', icon: <Banknote size={18} />, color: 'text-green-600 bg-green-50 border-green-200' },
  { key: 'bkash', label: 'bKash', icon: <Smartphone size={18} />, color: 'text-pink-600 bg-pink-50 border-pink-200' },
  { key: 'nagad', label: 'Nagad', icon: <Smartphone size={18} />, color: 'text-orange-500 bg-orange-50 border-orange-200' },
  { key: 'bank', label: 'Bank', icon: <CreditCard size={18} />, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  { key: 'split', label: 'Split', icon: <Calculator size={18} />, color: 'text-purple-600 bg-purple-50 border-purple-200' },
];

export const PosModule: React.FC<PosModuleProps> = ({
  products,
  currency,
  staffName,
  onCompleteSale,
}) => {
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [payMode, setPayMode] = useState<PayMode>('cash');
  const [discountMode, setDiscountMode] = useState<'percent' | 'fixed'>('fixed');
  const [discountValue, setDiscountValue] = useState(0);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [splitAmounts, setSplitAmounts] = useState<{ cash: number; bkash: number; nagad: number }>({
    cash: 0, bkash: 0, nagad: 0
  });
  const [loading, setLoading] = useState(false);
  const [saleComplete, setSaleComplete] = useState(false);
  const [tenderAmount, setTenderAmount] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const activeProducts = useMemo(
    () => products.filter(p => p.is_active && p.name.toLowerCase().includes(search.toLowerCase())),
    [products, search]
  );

  const subtotal = cart.reduce((s, i) => s + i.subtotal, 0);
  const discountAmount = discountMode === 'percent'
    ? Math.round(subtotal * discountValue / 100)
    : discountValue;
  const total = Math.max(0, subtotal - discountAmount);
  const changeAmount = parseFloat(tenderAmount || '0') - total;

  function addToCart(product: Product) {
    const basePrice = product.sale_price || product.base_price;
    setCart(prev => {
      const existing = prev.find(i => i.product_id === product.id);
      if (existing) {
        return prev.map(i => i.product_id === product.id
          ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * i.unit_price }
          : i
        );
      }
      return [...prev, {
        product_id: product.id,
        product_name: product.name,
        unit_price: basePrice,
        quantity: 1,
        discount_amount: 0,
        subtotal: basePrice,
      }];
    });
  }

  function updateQty(productId: string, delta: number) {
    setCart(prev => prev
      .map(i => i.product_id === productId
        ? { ...i, quantity: i.quantity + delta, subtotal: (i.quantity + delta) * i.unit_price }
        : i
      )
      .filter(i => i.quantity > 0)
    );
  }

  function removeFromCart(productId: string) {
    setCart(prev => prev.filter(i => i.product_id !== productId));
  }

  function clearCart() {
    setCart([]);
    setDiscountValue(0);
    setCustomerName('');
    setCustomerPhone('');
    setNotes('');
    setTenderAmount('');
    setSaleComplete(false);
    setTimeout(() => searchRef.current?.focus(), 100);
  }

  async function completeSale() {
    if (cart.length === 0) return;
    setLoading(true);
    try {
      const saleData: Omit<Sale, 'id' | 'sale_number' | 'created_at'> = {
        items: cart,
        subtotal,
        discount_amount: discountAmount,
        total_amount: total,
        payment_method: payMode,
        payment_split: payMode === 'split' ? [
          { method: 'cash' as AccountType, amount: splitAmounts.cash },
          { method: 'bkash' as AccountType, amount: splitAmounts.bkash },
          { method: 'nagad' as AccountType, amount: splitAmounts.nagad },
        ].filter(s => s.amount > 0) : undefined,
        served_by: staffName,
        customer_name: customerName || undefined,
        customer_phone: customerPhone || undefined,
        notes: notes || undefined,
      };
      await onCompleteSale?.(saleData);
      setSaleComplete(true);
    } finally {
      setLoading(false);
    }
  }

  if (saleComplete) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-4">
          <CheckCircle size={40} className="text-green-500" />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">বিক্রয় সম্পন্ন! ✅</h2>
        <p className="text-gray-500 mb-1">মোট: <span className="font-bold text-gray-800">{currency}{total.toLocaleString('en-BD')}</span></p>
        {parseFloat(tenderAmount) > total && (
          <p className="text-gray-500 mb-4">ফেরত: <span className="font-bold text-green-600">{currency}{changeAmount.toFixed(0)}</span></p>
        )}
        <div className="flex gap-3 mt-4">
          <button
            onClick={clearCart}
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white shadow-md"
            style={{ background: '#B77D80' }}
          >
            <Plus size={18} />
            নতুন বিক্রয়
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
          >
            <Printer size={18} />
            রিসিট প্রিন্ট
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* LEFT: Product Search */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-100">
        <div className="p-4 border-b border-gray-100 bg-white">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={searchRef}
              type="text"
              placeholder="পণ্য খুঁজুন... (Search cake, cupcake...)"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
              autoFocus
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {activeProducts.map(product => {
              const price = product.sale_price || product.base_price;
              const inCart = cart.find(i => i.product_id === product.id);
              return (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className={`
                    bg-white rounded-xl p-3 text-left border-2 transition-all hover:shadow-md group
                    ${inCart ? 'border-rose-400 shadow-sm' : 'border-gray-100 hover:border-rose-200'}
                  `}
                >
                  {product.image_url && (
                    <div className="w-full aspect-square rounded-lg overflow-hidden mb-2 bg-gray-50">
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                  )}
                  <p className="text-xs font-semibold text-gray-800 leading-tight line-clamp-2">{product.name}</p>
                  <p className="text-sm font-bold mt-1" style={{ color: '#B77D80' }}>{currency}{price}</p>
                  {inCart && (
                    <span className="inline-flex items-center gap-1 text-[10px] bg-rose-50 text-rose-600 px-1.5 py-0.5 rounded-full mt-1 font-medium">
                      <CheckCircle size={10} /> ×{inCart.quantity}
                    </span>
                  )}
                </button>
              );
            })}
            {activeProducts.length === 0 && (
              <div className="col-span-full text-center py-12 text-gray-400 text-sm">
                কোনো পণ্য পাওয়া যায়নি
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT: Cart & Checkout */}
      <div className="w-80 xl:w-96 flex flex-col bg-gray-50/50 overflow-hidden">
        {/* Cart Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100">
          <div className="flex items-center gap-2">
            <ShoppingCart size={16} style={{ color: '#B77D80' }} />
            <span className="font-semibold text-gray-800 text-sm">কার্ট</span>
            {cart.length > 0 && (
              <span className="text-xs bg-rose-100 text-rose-600 font-bold px-2 py-0.5 rounded-full">
                {cart.length}
              </span>
            )}
          </div>
          {cart.length > 0 && (
            <button onClick={clearCart} className="text-gray-400 hover:text-red-500 transition-colors" title="Clear cart">
              <Trash2 size={15} />
            </button>
          )}
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-300 text-center gap-2">
              <ShoppingCart size={40} />
              <p className="text-sm">কার্ট খালি</p>
              <p className="text-xs">বাম দিক থেকে পণ্য যোগ করুন</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.product_id} className="bg-white rounded-xl px-3 py-2.5 shadow-sm flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800 truncate">{item.product_name}</p>
                  <p className="text-xs text-gray-400">{currency}{item.unit_price} × {item.quantity}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => updateQty(item.product_id, -1)} className="w-6 h-6 rounded-lg bg-gray-100 hover:bg-red-50 text-gray-500 hover:text-red-500 flex items-center justify-center transition-colors">
                    <Minus size={12} />
                  </button>
                  <span className="text-sm font-bold text-gray-700 w-5 text-center">{item.quantity}</span>
                  <button onClick={() => updateQty(item.product_id, 1)} className="w-6 h-6 rounded-lg bg-gray-100 hover:bg-green-50 text-gray-500 hover:text-green-600 flex items-center justify-center transition-colors">
                    <Plus size={12} />
                  </button>
                  <button onClick={() => removeFromCart(item.product_id)} className="w-6 h-6 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors ml-1">
                    <X size={12} />
                  </button>
                </div>
                <div className="text-sm font-bold text-gray-800 flex-shrink-0 w-16 text-right">
                  {currency}{item.subtotal.toLocaleString('en-BD')}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Checkout Panel */}
        {cart.length > 0 && (
          <div className="bg-white border-t border-gray-100 p-4 space-y-3">
            {/* Customer (optional) */}
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="কাস্টমার নাম"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-rose-300"
              />
              <input
                type="tel"
                placeholder="ফোন নম্বর"
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-rose-300"
              />
            </div>

            {/* Discount */}
            <div className="flex gap-2 items-center">
              <Tag size={14} className="text-gray-400 flex-shrink-0" />
              <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
                <button
                  onClick={() => setDiscountMode('fixed')}
                  className={`px-2 py-1 rounded-md font-medium transition-all ${discountMode === 'fixed' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-400'}`}
                >
                  {currency}
                </button>
                <button
                  onClick={() => setDiscountMode('percent')}
                  className={`px-2 py-1 rounded-md font-medium transition-all ${discountMode === 'percent' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-400'}`}
                >
                  %
                </button>
              </div>
              <input
                type="number"
                min={0}
                value={discountValue || ''}
                onChange={e => setDiscountValue(parseFloat(e.target.value) || 0)}
                placeholder="ছাড়"
                className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-rose-300"
              />
            </div>

            {/* Summary */}
            <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Subtotal</span>
                <span>{currency}{subtotal.toLocaleString('en-BD')}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-xs text-green-600">
                  <span>ছাড়</span>
                  <span>−{currency}{discountAmount.toLocaleString('en-BD')}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-gray-800 pt-1 border-t border-gray-200">
                <span>মোট</span>
                <span>{currency}{total.toLocaleString('en-BD')}</span>
              </div>
            </div>

            {/* Payment Mode */}
            <div className="grid grid-cols-5 gap-1">
              {PAYMENT_MODES.map(pm => (
                <button
                  key={pm.key}
                  onClick={() => setPayMode(pm.key)}
                  className={`flex flex-col items-center gap-1 py-2 rounded-xl border text-[10px] font-medium transition-all ${
                    payMode === pm.key ? pm.color + ' border-current shadow-sm' : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'
                  }`}
                >
                  {pm.icon}
                  {pm.label}
                </button>
              ))}
            </div>

            {/* Tender / Change (Cash only) */}
            {payMode === 'cash' && (
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  placeholder="নগদ গ্রহণ"
                  value={tenderAmount}
                  onChange={e => setTenderAmount(e.target.value)}
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-rose-300"
                />
                {changeAmount > 0 && (
                  <div className="text-xs font-bold text-green-600 bg-green-50 rounded-lg px-2 py-1.5 whitespace-nowrap">
                    ফেরত: {currency}{changeAmount.toFixed(0)}
                  </div>
                )}
              </div>
            )}

            {/* Quick tender */}
            {payMode === 'cash' && (
              <div className="flex gap-1.5 flex-wrap">
                {[total, Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500].filter((v, i, a) => a.indexOf(v) === i).map(v => (
                  <button
                    key={v}
                    onClick={() => setTenderAmount(String(v))}
                    className="text-xs px-2 py-1 bg-gray-100 hover:bg-rose-50 text-gray-600 hover:text-rose-600 rounded-lg transition-colors"
                  >
                    {currency}{v}
                  </button>
                ))}
              </div>
            )}

            {/* Notes */}
            <input
              type="text"
              placeholder="নোট (ঐচ্ছিক)"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-rose-300"
            />

            {/* Complete Sale Button */}
            <button
              onClick={completeSale}
              disabled={loading || cart.length === 0}
              className="w-full py-3 rounded-xl font-bold text-sm text-white shadow-md transition-all active:scale-95 disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #B77D80, #8B5254)' }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <RotateCcw size={16} className="animate-spin" />
                  প্রসেস হচ্ছে...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <CheckCircle size={16} />
                  বিক্রয় সম্পন্ন করুন — {currency}{total.toLocaleString('en-BD')}
                </span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
