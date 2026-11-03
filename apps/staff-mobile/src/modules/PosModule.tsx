import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  Share,
} from 'react-native';
import type { MobileProduct } from '../initialData';
import type { StaffOrder, StaffSession } from '../domain';
import { money, validateBangladeshiPhone } from '../domain';

interface PosModuleProps {
  products: MobileProduct[];
  session: StaffSession | null;
  onCompleteSale: (newOrder: StaffOrder) => Promise<void>;
  onClose?: () => void;
  shopName?: string;
  shopAddress?: string;
  shopPhone?: string;
}

interface CartItem {
  product: MobileProduct;
  quantity: number;
  subtotal: number;
}

type PayMethod = 'cash' | 'bkash' | 'nagad' | 'bank' | 'split';

export const PosModule: React.FC<PosModuleProps> = ({
  products,
  session,
  onCompleteSale,
  onClose,
  shopName = "Aurora's Cake",
  shopAddress = "Tangail, Bangladesh",
  shopPhone = '',
}) => {
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [payMethod, setPayMethod] = useState<PayMethod>('cash');
  const [discountType, setDiscountType] = useState<'fixed' | 'percent'>('fixed');
  const [discountValue, setDiscountValue] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [tenderAmount, setTenderAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<StaffOrder | null>(null);

  const availableProducts = useMemo(() => {
    return products.filter(p => {
      const q = search.trim().toLowerCase();
      if (!q) return p.is_active;
      return (p.name.toLowerCase().includes(q) || (p.category && p.category.toLowerCase().includes(q))) && p.is_active;
    });
  }, [products, search]);

  const subtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const discountNum = Number(discountValue.replace(/[^\d.]/g, '') || 0);
  const discountAmount = discountType === 'percent'
    ? Math.round((subtotal * Math.min(100, discountNum)) / 100)
    : Math.min(subtotal, discountNum);
  const total = Math.max(0, subtotal - discountAmount);
  const tenderNum = Number(tenderAmount.replace(/[^\d.]/g, '') || 0);
  const changeDue = payMethod === 'cash' && tenderNum > total ? tenderNum - total : 0;

  const addToCart = (product: MobileProduct) => {
    setCart(prev => {
      const exists = prev.find(i => i.product.id === product.id);
      if (exists) {
        return prev.map(i => i.product.id === product.id
          ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * i.product.price }
          : i
        );
      }
      return [...prev, { product, quantity: 1, subtotal: product.price }];
    });
  };

  const updateQty = (id: string, delta: number) => {
    setCart(prev => {
      return prev
        .map(i => {
          if (i.product.id === id) {
            const nextQty = i.quantity + delta;
            return { ...i, quantity: nextQty, subtotal: nextQty * i.product.price };
          }
          return i;
        })
        .filter(i => i.quantity > 0);
    });
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(i => i.product.id !== id));
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      Alert.alert('কার্ট খালি', 'অনুগ্রহ করে অন্তত একটি কেক কার্টে যুক্ত করুন।');
      return;
    }
    let validatedPhone: string | undefined = undefined;
    if (customerPhone.trim()) {
      const phoneCheck = validateBangladeshiPhone(customerPhone);
      if (!phoneCheck.isValid) {
        Alert.alert('ভুল মোবাইল নম্বর', phoneCheck.error || 'মোবাইল নম্বরটি অবশ্যই ১১ ডিজিটের হতে হবে (যেমন: 017XXXXXXXX)');
        return;
      }
      validatedPhone = phoneCheck.phone;
    }
    setBusy(true);
    try {
      const orderNumber = `POS-${Date.now().toString().slice(-4)}`;
      const orderId = `pos-ord-${Date.now()}`;
      const newOrder: StaffOrder = {
        id: orderId,
        order_number: orderNumber,
        status: 'delivered', // POS direct counter sale is completed immediately
        customer_name: customerName.trim() || 'Counter Walk-in',
        customer_phone: validatedPhone,
        delivery_address: 'দোকান সরাসরি বিক্রয় (Counter Pickup)',
        delivery_date: new Date().toISOString().slice(0, 10),
        delivery_slot: 'Instant POS',
        payment_method: payMethod,
        payment_status: 'paid',
        total_amount: total,
        due_amount: 0,
        cod_amount: 0,
        advance_paid_amount: total,
        delivery_fee: 0,
        order_note: notes.trim() ? `POS: ${notes.trim()}` : `POS কাউন্টার বিক্রয় (${session?.name || 'Staff'})`,
        items: cart.map(c => ({
          product_name: c.product.name,
          variant_name: c.product.weight_label,
          quantity: c.quantity,
          subtotal: c.subtotal,
        })),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await onCompleteSale(newOrder);
      setCompletedOrder(newOrder);
      setCart([]);
      setDiscountValue('');
      setCustomerName('');
      setCustomerPhone('');
      setNotes('');
      setTenderAmount('');
    } catch (err: any) {
      Alert.alert('বিক্রয় সম্পন্ন হতে ব্যর্থ', err?.message || 'অনুগ্রহ করে আবার চেষ্টা করুন।');
    } finally {
      setBusy(false);
    }
  };

  const generatePosReceipt = (o: StaffOrder): string => {
    const line = '------------------------------------------';
    const double = '==========================================';
    let slip = `${double}\n`;
    slip += `         ${shopName.toUpperCase()}        \n`;
    slip += `            কাউন্টার বিক্রয় স্লিপ (POS)         \n`;
    if (shopAddress) slip += `      ${shopAddress}\n`;
    if (shopPhone) slip += `         Hotline: ${shopPhone}\n`;
    slip += `${double}\n`;
    slip += `ইনভয়েস : #${o.order_number}\n`;
    slip += `তারিখ  : ${new Date(o.created_at).toLocaleString('en-BD')}\n`;
    slip += `গ্রাহক  : ${o.customer_name || 'Counter Customer'}\n`;
    if (o.customer_phone) slip += `মোবাইল : ${o.customer_phone}\n`;
    slip += `ক্যাশিয়ার: ${session?.name || 'Staff'}\n`;
    slip += `${line}\n`;
    slip += `আইটেম তালিকা:\n`;
    o.items?.forEach(i => {
      slip += `• ${i.quantity}x ${i.product_name} (${i.variant_name || '1 lb'})\n   ৳${i.subtotal.toLocaleString()}\n`;
    });
    slip += `${line}\n`;
    slip += `সর্বমোট বিল    : ৳${o.total_amount.toLocaleString()}\n`;
    slip += `পরিশোধের মাধ্যম: ${o.payment_method?.toUpperCase()}\n`;
    slip += `পরিশোধিত টাকা  : ৳${o.total_amount.toLocaleString()} (পরিশোধিত ✓)\n`;
    slip += `${double}\n`;
    slip += `     ধন্যবাদ! আবার আসবেন — Aurora's Cake    \n`;
    return slip;
  };

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>🛒 POS & কাউন্টার সেলস</Text>
          <Text style={s.subtitle}>দোকানে সরাসরি কেক বিক্রয় ও ইনস্ট্যান্ট ক্যাশ স্লিপ</Text>
        </View>
        {onClose ? (
          <Pressable onPress={onClose} style={s.closeBtn}>
            <Text style={{ fontSize: 18, color: '#64748B', fontWeight: '800' }}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, gap: 14 }}>
        {/* Search Products */}
        <TextInput
          style={s.search}
          value={search}
          onChangeText={setSearch}
          placeholder="🔍 কেকের নাম লিখে খুঁজুন…"
          placeholderTextColor="#94A3B8"
        />

        {/* Product Quick Selection Grid */}
        <View>
          <Text style={s.sectionHeader}>🎂 উপলব্ধ কেক ({availableProducts.length})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
            {availableProducts.slice(0, 15).map(p => (
              <Pressable key={p.id} onPress={() => addToCart(p)} style={s.productCard}>
                <Text style={{ fontSize: 24, textAlign: 'center', marginBottom: 4 }}>🍰</Text>
                <Text style={s.productName} numberOfLines={2}>{p.name}</Text>
                <Text style={s.productPrice}>{money(p.price)}</Text>
                <View style={s.addBadge}><Text style={s.addBadgeText}>+ যোগ করুন</Text></View>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Current Cart */}
        <View style={s.cartCard}>
          <View style={s.inlineBetween}>
            <Text style={s.cartTitle}>🛍️ কার্ট ({cart.reduce((s, i) => s + i.quantity, 0)} আইটেম)</Text>
            {cart.length > 0 ? (
              <Pressable onPress={() => setCart([])}>
                <Text style={{ fontSize: 12, color: '#DC2626', fontWeight: '800' }}>কার্ট খালি করুন</Text>
              </Pressable>
            ) : null}
          </View>

          {cart.length === 0 ? (
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Text style={{ fontSize: 32, marginBottom: 6 }}>🛒</Text>
              <Text style={{ color: '#64748B', fontWeight: '700' }}>কার্টে কোনো কেক যুক্ত করা হয়নি</Text>
              <Text style={{ color: '#94A3B8', fontSize: 12 }}>উপরের তালিকা থেকে ট্যাপ করে কেক যোগ করুন</Text>
            </View>
          ) : (
            cart.map(item => (
              <View key={item.product.id} style={s.cartItemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', color: '#1E293B', fontSize: 14 }}>{item.product.name}</Text>
                  <Text style={{ fontSize: 12, color: '#64748B' }}>{item.product.weight_label} • ৳{item.product.price} প্রতিটি</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Pressable onPress={() => updateQty(item.product.id, -1)} style={s.qtyBtn}>
                    <Text style={s.qtyText}>-</Text>
                  </Pressable>
                  <Text style={{ fontWeight: '900', color: '#0F172A', minWidth: 20, textAlign: 'center' }}>{item.quantity}</Text>
                  <Pressable onPress={() => updateQty(item.product.id, 1)} style={s.qtyBtn}>
                    <Text style={s.qtyText}>+</Text>
                  </Pressable>
                  <Text style={{ fontWeight: '900', color: '#1D5845', fontSize: 15, minWidth: 55, textAlign: 'right' }}>
                    {money(item.subtotal)}
                  </Text>
                  <Pressable onPress={() => removeFromCart(item.product.id)} style={{ padding: 4 }}>
                    <Text style={{ color: '#EF4444', fontWeight: '900' }}>✕</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}

          {/* Pricing Summary */}
          {cart.length > 0 ? (
            <View style={s.summaryBox}>
              <View style={s.inlineBetween}>
                <Text style={s.summaryLabel}>সাব-টোটাল:</Text>
                <Text style={s.summaryVal}>{money(subtotal)}</Text>
              </View>

              {/* Discount Selector */}
              <View style={[s.inlineBetween, { marginVertical: 6 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={s.summaryLabel}>ডিসকাউন্ট:</Text>
                  <Pressable onPress={() => setDiscountType(t => t === 'fixed' ? 'percent' : 'fixed')} style={s.modePill}>
                    <Text style={s.modePillText}>{discountType === 'fixed' ? '৳ ফিক্সড' : '% পার্সেন্ট'}</Text>
                  </Pressable>
                </View>
                <TextInput
                  style={s.discountInput}
                  value={discountValue}
                  onChangeText={setDiscountValue}
                  placeholder={discountType === 'fixed' ? '৳ 0' : '0 %'}
                  keyboardType="numeric"
                />
              </View>

              {discountAmount > 0 ? (
                <View style={s.inlineBetween}>
                  <Text style={{ color: '#16A34A', fontSize: 13, fontWeight: '700' }}>ছাড়ের পরিমাণ:</Text>
                  <Text style={{ color: '#16A34A', fontSize: 13, fontWeight: '900' }}>- {money(discountAmount)}</Text>
                </View>
              ) : null}

              <View style={[s.inlineBetween, { borderTopWidth: 1, borderColor: '#CBD5E1', paddingTop: 8, marginTop: 4 }]}>
                <Text style={{ fontWeight: '900', color: '#0F172A', fontSize: 17 }}>মোট প্রদেয় টাকা:</Text>
                <Text style={{ fontWeight: '900', color: '#1D5845', fontSize: 20 }}>{money(total)}</Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* Customer & Payment Mode */}
        {cart.length > 0 ? (
          <View style={s.cartCard}>
            <Text style={s.sectionHeader}>💳 পেমেন্ট ও গ্রাহকের তথ্য</Text>

            <View style={{ flexDirection: 'row', gap: 8, marginVertical: 6 }}>
              {(['cash', 'bkash', 'nagad', 'bank', 'split'] as PayMethod[]).map(pm => (
                <Pressable
                  key={pm}
                  onPress={() => setPayMethod(pm)}
                  style={[s.payModeBtn, payMethod === pm && s.payModeActive]}
                >
                  <Text style={[s.payModeText, payMethod === pm && s.payModeTextActive]}>
                    {pm === 'cash' ? '💵 ক্যাশ' : pm === 'bkash' ? '📱 bKash' : pm === 'nagad' ? '🟠 Nagad' : pm === 'bank' ? '🏦 Bank' : '⚖️ Split'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {payMethod === 'cash' ? (
              <View style={{ backgroundColor: '#F8FAFC', padding: 10, borderRadius: 10, marginVertical: 4 }}>
                <View style={s.inlineBetween}>
                  <Text style={{ fontSize: 13, color: '#475569', fontWeight: '700' }}>কাস্টমারের দেওয়া টাকা (Tender):</Text>
                  <TextInput
                    style={s.tenderInput}
                    value={tenderAmount}
                    onChangeText={setTenderAmount}
                    placeholder="যেমন: 500"
                    keyboardType="numeric"
                  />
                </View>
                {changeDue > 0 ? (
                  <View style={[s.inlineBetween, { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderColor: '#E2E8F0' }]}>
                    <Text style={{ fontSize: 14, color: '#B45309', fontWeight: '800' }}>ফেরত দিতে হবে (Change):</Text>
                    <Text style={{ fontSize: 16, color: '#B45309', fontWeight: '900' }}>{money(changeDue)}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            <TextInput
              style={s.formInput}
              value={customerName}
              onChangeText={setCustomerName}
              placeholder="গ্রাহকের নাম (ঐচ্ছিক)"
              placeholderTextColor="#94A3B8"
            />
            <View style={{ marginBottom: 2 }}>
              <TextInput
                style={[
                  s.formInput,
                  customerPhone.trim().length > 0 &&
                    !validateBangladeshiPhone(customerPhone).isValid && {
                      borderColor: '#DC2626',
                    },
                ]}
                value={customerPhone}
                onChangeText={(t) => setCustomerPhone(t.replace(/[^\d+]/g, ''))}
                placeholder="মোবাইল নম্বর (১১ ডিজিট, ঐচ্ছিক)"
                keyboardType="phone-pad"
                maxLength={14}
                placeholderTextColor="#94A3B8"
              />
              {customerPhone.trim() ? (
                <Text
                  style={{
                    fontSize: 10.5,
                    marginTop: 2,
                    marginBottom: 4,
                    fontWeight: '700',
                    color: validateBangladeshiPhone(customerPhone).isValid
                      ? '#16A34A'
                      : '#DC2626',
                  }}
                >
                  {validateBangladeshiPhone(customerPhone).isValid
                    ? '✓ সঠিক ১১ ডিজিট'
                    : `⚠️ ১১ ডিজিট আবশ্যক (${customerPhone.replace(/\D/g, '').length}/11)`}
                </Text>
              ) : null}
            </View>
            <TextInput
              style={s.formInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="নোট / বিক্রয় রেফারেন্স"
              placeholderTextColor="#94A3B8"
            />

            <Pressable disabled={busy} onPress={handleCheckout} style={[s.checkoutBtn, busy && { opacity: 0.6 }]}>
              <Text style={s.checkoutBtnText}>{busy ? 'বিক্রয় হচ্ছে…' : `✓ বিক্রয় সম্পন্ন করুন (${money(total)})`}</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      {/* Completed Sale Receipt Modal */}
      {completedOrder ? (
        <View style={s.modalOverlay}>
          <View style={s.receiptModal}>
            <View style={s.inlineBetween}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: '#166534' }}>✓ বিক্রয় সফল হয়েছে!</Text>
              <Pressable onPress={() => setCompletedOrder(null)}>
                <Text style={{ fontSize: 18, color: '#64748B', fontWeight: '800' }}>✕</Text>
              </Pressable>
            </View>
            <ScrollView style={s.receiptPaper}>
              <Text style={s.receiptMono}>{generatePosReceipt(completedOrder)}</Text>
            </ScrollView>
            <Pressable
              onPress={async () => {
                try {
                  await Share.share({ message: generatePosReceipt(completedOrder) });
                } catch {}
              }}
              style={s.shareBtn}
            >
              <Text style={s.shareBtnText}>📤 স্লিপ প্রিন্ট / শেয়ার করুন</Text>
            </Pressable>
            <Pressable onPress={() => setCompletedOrder(null)} style={s.doneBtn}>
              <Text style={s.doneBtnText}>নতুন বিক্রয় শুরু করুন</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAF9' },
  header: { padding: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderColor: '#E2E8F0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '900', color: '#15352C' },
  subtitle: { fontSize: 12, color: '#60746C', marginTop: 2 },
  closeBtn: { padding: 6, backgroundColor: '#F1F5F9', borderRadius: 8 },
  search: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#0F172A' },
  sectionHeader: { fontSize: 14, fontWeight: '800', color: '#1E293B', marginBottom: 8 },
  productCard: { width: 125, backgroundColor: '#FFF', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  productName: { fontSize: 12, fontWeight: '800', color: '#1E293B', textAlign: 'center', height: 32 },
  productPrice: { fontSize: 14, fontWeight: '900', color: '#1D5845', marginTop: 4 },
  addBadge: { backgroundColor: '#E4F2E8', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 6 },
  addBadgeText: { fontSize: 10, fontWeight: '800', color: '#1D5845' },
  cartCard: { backgroundColor: '#FFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  cartTitle: { fontSize: 16, fontWeight: '900', color: '#1E293B' },
  inlineBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cartItemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#F1F5F9' },
  qtyBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#CBD5E1' },
  qtyText: { fontSize: 16, fontWeight: '900', color: '#0F172A' },
  summaryBox: { marginTop: 10, backgroundColor: '#F8FAFC', padding: 12, borderRadius: 10, gap: 4 },
  summaryLabel: { fontSize: 13, color: '#64748B', fontWeight: '700' },
  summaryVal: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  modePill: { backgroundColor: '#E2E8F0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  modePillText: { fontSize: 11, fontWeight: '800', color: '#334155' },
  discountInput: { width: 70, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, textAlign: 'right', fontSize: 13, fontWeight: '800' },
  payModeBtn: { flex: 1, paddingVertical: 8, backgroundColor: '#F1F5F9', borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  payModeActive: { backgroundColor: '#1D5845', borderColor: '#1D5845' },
  payModeText: { fontSize: 11, fontWeight: '800', color: '#475569' },
  payModeTextActive: { color: '#FFF' },
  tenderInput: { width: 90, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, textAlign: 'right', fontSize: 14, fontWeight: '900', color: '#0F172A' },
  formInput: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: '#0F172A', marginTop: 8 },
  checkoutBtn: { backgroundColor: '#1D5845', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 12 },
  checkoutBtnText: { color: '#FFF', fontSize: 16, fontWeight: '900' },
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  receiptModal: { backgroundColor: '#FFF', borderRadius: 16, padding: 18, maxHeight: '90%' },
  receiptPaper: { backgroundColor: '#FAF9F6', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 12, marginVertical: 12, maxHeight: 320 },
  receiptMono: { fontFamily: 'monospace', fontSize: 11, color: '#1E293B', lineHeight: 16 },
  shareBtn: { backgroundColor: '#1D5845', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  shareBtnText: { color: '#FFF', fontWeight: '900', fontSize: 14 },
  doneBtn: { backgroundColor: '#F1F5F9', paddingVertical: 10, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  doneBtnText: { color: '#475569', fontWeight: '800', fontSize: 13 },
});
