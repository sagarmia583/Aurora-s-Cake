import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
  Alert,
  Linking,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { money, validateBangladeshiPhone } from '../domain';
import { INITIAL_SUPPLIERS, type SupplierItem, type PurchaseRecord } from '../bmsData';

interface PurchasesModuleProps {
  onClose?: () => void;
  staffName?: string;
}

const SUPPLIERS_KEY = 'aurora_bms_suppliers_v1';
const PURCHASES_KEY = 'aurora_bms_purchases_v1';

export const PurchasesModule: React.FC<PurchasesModuleProps> = ({
  onClose,
  staffName = 'Admin',
}) => {
  const [suppliers, setSuppliers] = useState<SupplierItem[]>(INITIAL_SUPPLIERS);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([
    {
      id: 'pur-1',
      invoice_number: 'INV-2026-081',
      supplier_id: 'sup-1',
      supplier_name: 'ফ্রেশ মিলস লিমিটেড',
      total_amount: 7500,
      paid_amount: 4000,
      due_amount: 3500,
      items_summary: '৫০ কেজি ময়দা ও ৫ কেজি কর্নফ্লাওয়ার',
      purchase_date: '2026-10-28',
      status: 'partial',
    },
    {
      id: 'pur-2',
      invoice_number: 'INV-2026-082',
      supplier_id: 'sup-3',
      supplier_name: 'গাজী অ্যান্ড ব্রাদার্স',
      total_amount: 12500,
      paid_amount: 4000,
      due_amount: 8500,
      items_summary: '২০ লিটার এভারহুইপ ক্রিম',
      purchase_date: '2026-10-30',
      status: 'partial',
    },
  ]);

  const [activeTab, setActiveTab] = useState<'purchases' | 'suppliers'>('purchases');
  const [newPurchaseModalOpen, setNewPurchaseModalOpen] = useState(false);
  const [newSupplierModalOpen, setNewSupplierModalOpen] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState(INITIAL_SUPPLIERS[0]?.id || '');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [itemsSummary, setItemsSummary] = useState('');

  // New Supplier Form State
  const [supName, setSupName] = useState('');
  const [supContact, setSupContact] = useState('');
  const [supCategory, setSupCategory] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supError, setSupError] = useState('');

  const handleAddSupplier = async () => {
    setSupError('');
    if (!supName.trim()) {
      setSupError('সাপ্লায়ার প্রতিষ্ঠানের নাম লিখুন।');
      return;
    }
    const phoneCheck = validateBangladeshiPhone(supPhone);
    if (!phoneCheck.isValid) {
      setSupError(phoneCheck.error || 'সাপ্লায়ারের মোবাইল নম্বর ১১ ডিজিটের হতে হবে (যেমন: 017XXXXXXXX)');
      return;
    }
    const newSup: SupplierItem = {
      id: `sup-${Date.now()}`,
      name: supName.trim(),
      contact_person: supContact.trim() || 'প্রতিনিধি',
      category: supCategory.trim() || 'বেকিং উপকরণ',
      phone: phoneCheck.phone,
      due_amount: 0,
      total_purchases: 0,
    };
    const updated = [...suppliers, newSup];
    setSuppliers(updated);
    await SecureStore.setItemAsync(SUPPLIERS_KEY, JSON.stringify(updated)).catch(() => {});
    setNewSupplierModalOpen(false);
    setSupName('');
    setSupContact('');
    setSupCategory('');
    setSupPhone('');
    Alert.alert('সফল!', `সাপ্লায়ার ${newSup.name} যুক্ত হয়েছে।`);
  };

  // Load from SecureStore
  useEffect(() => {
    SecureStore.getItemAsync(SUPPLIERS_KEY).then(raw => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) setSuppliers(parsed);
        } catch {}
      }
    }).catch(() => {});

    SecureStore.getItemAsync(PURCHASES_KEY).then(raw => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) setPurchases(parsed);
        } catch {}
      }
    }).catch(() => {});
  }, []);

  const totalPayableDues = useMemo(() => {
    return suppliers.reduce((sum, s) => sum + s.due_amount, 0);
  }, [suppliers]);

  const totalPurchasesAmount = useMemo(() => {
    return purchases.reduce((sum, p) => sum + p.total_amount, 0);
  }, [purchases]);

  const handleCreatePurchase = async () => {
    const totalNum = Number(totalAmount.replace(/[^\d.]/g, '') || 0);
    const paidNum = Number(paidAmount.replace(/[^\d.]/g, '') || 0);
    if (totalNum <= 0) {
      Alert.alert('অবৈধ টাকা', 'অনুগ্রহ করে মোট ক্রয়ের সঠিক টাকার অঙ্ক লিখুন।');
      return;
    }

    const sup = suppliers.find(s => s.id === selectedSupplierId) || suppliers[0];
    const dueNum = Math.max(0, totalNum - paidNum);
    const invNum = invoiceNumber.trim() || `PUR-${Date.now().toString().slice(-4)}`;

    const newPurchase: PurchaseRecord = {
      id: `pur-${Date.now()}`,
      invoice_number: invNum,
      supplier_id: sup.id,
      supplier_name: sup.name,
      total_amount: totalNum,
      paid_amount: paidNum,
      due_amount: dueNum,
      items_summary: itemsSummary.trim() || 'বেকারি কাঁচামাল ক্রয়',
      purchase_date: new Date().toISOString().slice(0, 10),
      status: dueNum === 0 ? 'paid' : (paidNum > 0 ? 'partial' : 'due'),
    };

    // Update supplier due amount
    const updatedSuppliers = suppliers.map(s => {
      if (s.id === sup.id) {
        return {
          ...s,
          due_amount: s.due_amount + dueNum,
          total_purchases: s.total_purchases + totalNum,
        };
      }
      return s;
    });

    const updatedPurchases = [newPurchase, ...purchases];

    setPurchases(updatedPurchases);
    setSuppliers(updatedSuppliers);
    setNewPurchaseModalOpen(false);
    setTotalAmount('');
    setPaidAmount('');
    setInvoiceNumber('');
    setItemsSummary('');

    await SecureStore.setItemAsync(PURCHASES_KEY, JSON.stringify(updatedPurchases)).catch(() => {});
    await SecureStore.setItemAsync(SUPPLIERS_KEY, JSON.stringify(updatedSuppliers)).catch(() => {});

    Alert.alert('ক্রয় সফলভাবে সংরক্ষিত', `ইনভয়েস #${invNum} যুক্ত হয়েছে। বকেয়া: ${money(dueNum)}`);
  };

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>🚚 ক্রয় ও সরবরাহকারী (Purchases)</Text>
          <Text style={s.subtitle}>কাঁচামাল কেনাকাটা, ভাউচার ও সাপ্লায়ার বকেয়া হিসাব</Text>
        </View>
        {onClose ? (
          <Pressable onPress={onClose} style={s.closeBtn}>
            <Text style={{ fontSize: 18, color: '#64748B', fontWeight: '800' }}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {/* KPI Cards */}
      <View style={{ flexDirection: 'row', gap: 10, padding: 14, paddingBottom: 6 }}>
        <View style={s.kpiCard}>
          <Text style={s.kpiLabel}>মোট কেনাকাটা</Text>
          <Text style={s.kpiVal}>{money(totalPurchasesAmount)}</Text>
          <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{purchases.length} টি ভাউচার</Text>
        </View>
        <View style={[s.kpiCard, { borderColor: '#FCA5A5', backgroundColor: '#FFFDFD' }]}>
          <Text style={s.kpiLabel}>সাপ্লায়ারদের মোট বকেয়া</Text>
          <Text style={[s.kpiVal, { color: '#DC2626' }]}>{money(totalPayableDues)}</Text>
          <Text style={{ fontSize: 11, color: '#DC2626', marginTop: 2 }}>পরিশোধযোগ্য দায়</Text>
        </View>
      </View>

      {/* Action / Add Purchase Button */}
      <View style={{ paddingHorizontal: 14, paddingBottom: 4 }}>
        {activeTab === 'purchases' ? (
          <Pressable onPress={() => setNewPurchaseModalOpen(true)} style={s.addBtn}>
            <Text style={s.addBtnText}>+ নতুন ক্রয় এন্ট্রি (Purchase Voucher)</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => { setSupError(''); setNewSupplierModalOpen(true); }} style={[s.addBtn, { backgroundColor: '#0284C7' }]}>
            <Text style={s.addBtnText}>+ নতুন সাপ্লায়ার যোগ করুন</Text>
          </Pressable>
        )}
      </View>

      {/* Tabs */}
      <View style={s.tabBar}>
        <Pressable onPress={() => setActiveTab('purchases')} style={[s.tabBtn, activeTab === 'purchases' && s.tabBtnActive]}>
          <Text style={[s.tabText, activeTab === 'purchases' && s.tabTextActive]}>ক্রয় ইনভয়েস ({purchases.length})</Text>
        </Pressable>
        <Pressable onPress={() => setActiveTab('suppliers')} style={[s.tabBtn, activeTab === 'suppliers' && s.tabBtnActive]}>
          <Text style={[s.tabText, activeTab === 'suppliers' && s.tabTextActive]}>সাপ্লায়ার ডিরেক্টরি ({suppliers.length})</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }}>
        {activeTab === 'purchases' ? (
          purchases.map(p => (
            <View key={p.id} style={s.card}>
              <View style={s.inlineBetween}>
                <View>
                  <Text style={{ fontWeight: '900', color: '#0F172A', fontSize: 15 }}>#{p.invoice_number}</Text>
                  <Text style={{ fontSize: 12, color: '#1D5845', fontWeight: '800' }}>{p.supplier_name}</Text>
                </View>
                <View style={[s.badge, p.status === 'paid' ? s.badgePaid : s.badgeDue]}>
                  <Text style={[s.badgeText, p.status === 'paid' ? { color: '#166534' } : { color: '#991B1B' }]}>
                    {p.status === 'paid' ? 'পরিশোধিত ✓' : p.status === 'partial' ? 'আংশিক বকেয়া' : 'সম্পূর্ণ বকেয়া'}
                  </Text>
                </View>
              </View>

              <Text style={{ fontSize: 13, color: '#334155', marginVertical: 6, fontWeight: '700' }}>
                📦 বিবরণ: {p.items_summary}
              </Text>

              <View style={[s.inlineBetween, { borderTopWidth: 1, borderColor: '#F1F5F9', paddingTop: 6 }]}>
                <Text style={{ fontSize: 12, color: '#64748B' }}>তারিখ: {p.purchase_date}</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontWeight: '900', color: '#0F172A', fontSize: 15 }}>{money(p.total_amount)}</Text>
                  {p.due_amount > 0 ? (
                    <Text style={{ fontSize: 11, color: '#DC2626', fontWeight: '800' }}>বকেয়া: {money(p.due_amount)}</Text>
                  ) : null}
                </View>
              </View>
            </View>
          ))
        ) : (
          suppliers.map(sItem => (
            <View key={sItem.id} style={s.card}>
              <View style={s.inlineBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '900', color: '#0F172A', fontSize: 16 }}>{sItem.name}</Text>
                  <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    যোগাযোগ: {sItem.contact_person} • {sItem.category}
                  </Text>
                </View>
                <Pressable
                  onPress={() => void Linking.openURL(`tel:${sItem.phone.replace(/[^\d+]/g, '')}`)}
                  style={s.callBtn}
                >
                  <Text style={s.callBtnText}>📞 কল</Text>
                </Pressable>
              </View>

              <View style={[s.inlineBetween, { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderColor: '#F1F5F9' }]}>
                <Text style={{ fontSize: 12, color: '#64748B' }}>ফোন: {sItem.phone}</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: sItem.due_amount > 0 ? '#DC2626' : '#166534' }}>
                    {sItem.due_amount > 0 ? `বকেয়া পাওনা: ${money(sItem.due_amount)}` : 'কোনো বকেয়া নেই ✓'}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#64748B' }}>মোট ব্যবসা: {money(sItem.total_purchases)}</Text>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* New Purchase Modal */}
      {newPurchaseModalOpen ? (
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.inlineBetween}>
              <Text style={{ fontSize: 17, fontWeight: '900', color: '#0F172A' }}>+ নতুন ক্রয় ভাউচার এন্ট্রি</Text>
              <Pressable onPress={() => setNewPurchaseModalOpen(false)}>
                <Text style={{ fontSize: 18, color: '#64748B', fontWeight: '800' }}>✕</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ gap: 8, paddingVertical: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#334155' }}>সরবরাহকারী নির্বাচন করুন:</Text>
              <View style={{ gap: 4 }}>
                {suppliers.map(sup => (
                  <Pressable
                    key={sup.id}
                    onPress={() => setSelectedSupplierId(sup.id)}
                    style={[s.choicePill, selectedSupplierId === sup.id && s.choicePillActive]}
                  >
                    <Text style={[s.choicePillText, selectedSupplierId === sup.id && s.choicePillTextActive]}>
                      {sup.name} ({sup.category})
                    </Text>
                  </Pressable>
                ))}
              </View>

              <TextInput
                style={s.input}
                value={invoiceNumber}
                onChangeText={setInvoiceNumber}
                placeholder="ইনভয়েস নম্বর (ঐচ্ছিক)"
                placeholderTextColor="#94A3B8"
              />

              <TextInput
                style={s.input}
                value={totalAmount}
                onChangeText={setTotalAmount}
                placeholder="মোট ক্রয়ের পরিমাণ (৳)"
                keyboardType="numeric"
                placeholderTextColor="#94A3B8"
              />

              <TextInput
                style={s.input}
                value={paidAmount}
                onChangeText={setPaidAmount}
                placeholder="পরিশোধিত টাকা (৳)"
                keyboardType="numeric"
                placeholderTextColor="#94A3B8"
              />

              <TextInput
                style={s.input}
                value={itemsSummary}
                onChangeText={setItemsSummary}
                placeholder="পণ্যের সংক্ষিপ্ত বিবরণ (যেমন: ২০ লিটার ক্রিম)"
                placeholderTextColor="#94A3B8"
              />

              <Pressable onPress={handleCreatePurchase} style={s.saveBtn}>
                <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 14 }}>✓ ক্রয় ভাউচার নিশ্চিত করুন</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      ) : null}

      {/* New Supplier Modal */}
      {newSupplierModalOpen ? (
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.inlineBetween}>
              <Text style={{ fontSize: 16, fontWeight: '900', color: '#0F172A' }}>👥 নতুন সাপ্লায়ার যুক্ত করুন</Text>
              <Pressable onPress={() => setNewSupplierModalOpen(false)}>
                <Text style={{ fontSize: 18, color: '#94A3B8', fontWeight: 'bold' }}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={{ marginTop: 12 }}>
              {supError ? (
                <Text style={{ color: '#DC2626', backgroundColor: '#FEE2E2', padding: 8, borderRadius: 8, fontSize: 12, fontWeight: '700', marginBottom: 8 }}>
                  ⚠️ {supError}
                </Text>
              ) : null}

              <Text style={{ fontSize: 12, fontWeight: '700', color: '#334155', marginTop: 4 }}>প্রতিষ্ঠানের নাম*</Text>
              <TextInput
                style={s.input}
                value={supName}
                onChangeText={setSupName}
                placeholder="যেমন: ফ্রেশ মিলস লিমিটেড"
                placeholderTextColor="#94A3B8"
              />

              <Text style={{ fontSize: 12, fontWeight: '700', color: '#334155', marginTop: 8 }}>যোগাযোগকারী ব্যক্তি</Text>
              <TextInput
                style={s.input}
                value={supContact}
                onChangeText={setContact => setSupContact(setContact)}
                placeholder="যেমন: কামাল উদ্দিন"
                placeholderTextColor="#94A3B8"
              />

              <Text style={{ fontSize: 12, fontWeight: '700', color: '#334155', marginTop: 8 }}>পণ্য ক্যাটাগরি</Text>
              <TextInput
                style={s.input}
                value={supCategory}
                onChangeText={setSupCategory}
                placeholder="যেমন: ময়দা ও বেকিং উপকরণ"
                placeholderTextColor="#94A3B8"
              />

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#334155' }}>মোবাইল নম্বর (১১ ডিজিট)*</Text>
                {supPhone.trim() ? (
                  <Text style={{ fontSize: 10.5, fontWeight: '700', color: validateBangladeshiPhone(supPhone).isValid ? '#16A34A' : '#DC2626' }}>
                    {validateBangladeshiPhone(supPhone).isValid ? '✓ সঠিক ১১ ডিজিট' : `(${supPhone.replace(/\D/g, '').length}/11)`}
                  </Text>
                ) : null}
              </View>
              <TextInput
                style={[s.input, supPhone.trim() && !validateBangladeshiPhone(supPhone).isValid && { borderColor: '#DC2626' }]}
                value={supPhone}
                onChangeText={(t) => setSupPhone(t.replace(/[^\d+]/g, ''))}
                keyboardType="phone-pad"
                maxLength={14}
                placeholder="যেমন: 017XXXXXXXX"
                placeholderTextColor="#94A3B8"
              />

              <Pressable onPress={handleAddSupplier} style={[s.saveBtn, { backgroundColor: '#0284C7' }]}>
                <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 14 }}>✓ সাপ্লায়ার সংরক্ষণ করুন</Text>
              </Pressable>
            </ScrollView>
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
  kpiCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  kpiLabel: { fontSize: 11, color: '#64748B', fontWeight: '700' },
  kpiVal: { fontSize: 20, fontWeight: '900', color: '#0F172A', marginTop: 2 },
  addBtn: { backgroundColor: '#1D5845', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  addBtnText: { color: '#FFF', fontWeight: '900', fontSize: 13 },
  tabBar: { flexDirection: 'row', backgroundColor: '#FFF', paddingHorizontal: 12, borderBottomWidth: 1, borderColor: '#E2E8F0', marginTop: 6 },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderColor: 'transparent' },
  tabBtnActive: { borderColor: '#1D5845' },
  tabText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  tabTextActive: { color: '#1D5845', fontWeight: '900' },
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  inlineBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgePaid: { backgroundColor: '#DCFCE7' },
  badgeDue: { backgroundColor: '#FEE2E2' },
  badgeText: { fontSize: 11, fontWeight: '800' },
  callBtn: { backgroundColor: '#ECFDF5', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#A7F3D0' },
  callBtnText: { color: '#065F46', fontWeight: '800', fontSize: 12 },
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  modalSheet: { backgroundColor: '#FFF', borderRadius: 16, padding: 18, maxHeight: '90%' },
  choicePill: { padding: 8, backgroundColor: '#F8FAFC', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  choicePillActive: { backgroundColor: '#1D5845', borderColor: '#1D5845' },
  choicePillText: { fontSize: 12, color: '#334155', fontWeight: '700' },
  choicePillTextActive: { color: '#FFF', fontWeight: '800' },
  input: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: '#0F172A', marginTop: 6 },
  saveBtn: { backgroundColor: '#1D5845', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 12 },
});
