import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Alert,
  Switch,
  Share,
  Platform,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { CouponItem, INITIAL_COUPONS } from '../bmsData';
import { money } from '../domain';

const COUPONS_STORAGE_KEY = 'aurora_bms_coupons_v1';

interface OffersModuleProps {
  onBack?: () => void;
}

export const OffersModule: React.FC<OffersModuleProps> = ({ onBack }) => {
  const [coupons, setCoupons] = useState<CouponItem[]>(INITIAL_COUPONS);
  const [search, setSearch] = useState('');
  const [filterActiveOnly, setFilterActiveOnly] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);

  // New Coupon Form State
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState('');
  const [minOrder, setMinOrder] = useState('');
  const [maxDiscount, setMaxDiscount] = useState('');
  const [formError, setFormError] = useState('');

  // Load saved coupons from SecureStore
  useEffect(() => {
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync(COUPONS_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setCoupons(parsed);
          }
        }
      } catch {
        // Fallback to initial
      }
    })();
  }, []);

  const saveCoupons = async (updated: CouponItem[]) => {
    setCoupons(updated);
    try {
      await SecureStore.setItemAsync(COUPONS_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignore
    }
  };

  const handleToggleActive = (id: string) => {
    const updated = coupons.map((c) => (c.id === id ? { ...c, is_active: !c.is_active } : c));
    void saveCoupons(updated);
  };

  const handleDelete = (id: string) => {
    Alert.alert('কুপন ডিলিট নিশ্চিতকরণ', 'আপনি কি এই কুপনটি ডিলিট করতে চান?', [
      { text: 'না', style: 'cancel' },
      {
        text: 'ডিলিট করুন',
        style: 'destructive',
        onPress: () => {
          const updated = coupons.filter((c) => c.id !== id);
          void saveCoupons(updated);
        },
      },
    ]);
  };

  const handleShareCoupon = async (c: CouponItem) => {
    const text = `🎉 Aurora's Cake স্পেশাল ডিসকাউন্ট অফার!\n\nকুপন কোড: *${c.code}*\nছাড়: ${
      c.discount_type === 'percentage' ? `${c.discount_value}%` : money(c.discount_value)
    }\nসর্বনিম্ন অর্ডার: ${money(c.min_order_amount)}${
      c.max_discount_amount ? ` (সর্বোচ্চ ছাড় ${money(c.max_discount_amount)})` : ''
    }\n\nএখনই অর্ডার করুন: https://aurora-s-cake.pages.dev`;

    try {
      await Share.share({ message: text });
    } catch {
      // Ignore
    }
  };

  const handleCreateCoupon = () => {
    setFormError('');
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      setFormError('কুপন কোড লিখুন (যেমন: SWEET20)');
      return;
    }
    if (coupons.some((c) => c.code === cleanCode)) {
      setFormError('এই কুপন কোডটি ইতিমধ্যে বিদ্যমান!');
      return;
    }
    const val = Number(discountValue);
    if (!val || val <= 0) {
      setFormError('সঠিক ডিসকাউন্টের পরিমাণ দিন');
      return;
    }
    if (discountType === 'percentage' && val > 100) {
      setFormError('শতকরা ছাড় ১০০% এর বেশি হতে পারে না');
      return;
    }

    const newCoupon: CouponItem = {
      id: 'coup-' + Date.now(),
      code: cleanCode,
      discount_type: discountType,
      discount_value: val,
      min_order_amount: Number(minOrder) || 0,
      max_discount_amount: Number(maxDiscount) || undefined,
      usage_count: 0,
      is_active: true,
    };

    const updated = [newCoupon, ...coupons];
    void saveCoupons(updated);
    setAddModalOpen(false);
    setCode('');
    setDiscountValue('');
    setMinOrder('');
    setMaxDiscount('');
    Alert.alert('সফল!', `কুপন কোড ${cleanCode} সফলভাবে তৈরি হয়েছে।`);
  };

  const filteredCoupons = coupons.filter((c) => {
    const q = search.trim().toUpperCase();
    const matchSearch = !q || c.code.includes(q);
    if (filterActiveOnly) return c.is_active && matchSearch;
    return matchSearch;
  });

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        {onBack && (
          <Pressable style={styles.backBtn} onPress={onBack}>
            <Text style={styles.backBtnText}>‹ ড্যাশবোর্ড</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>🏷️ অফার ও কুপন (Offers)</Text>
          <Text style={styles.subtitle}>প্রমো কোড তৈরি, ডিসকাউন্ট ও অফার পরিচালনা</Text>
        </View>
        <Pressable style={styles.addBtn} onPress={() => setAddModalOpen(true)}>
          <Text style={styles.addBtnText}>+ নতুন কুপন</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* KPI Cards */}
        <View style={styles.kpiRow}>
          <View style={[styles.kpiCard, { backgroundColor: '#FCE4EC', borderColor: '#F48FB1' }]}>
            <Text style={styles.kpiLabel}>মোট কুপন</Text>
            <Text style={[styles.kpiValue, { color: '#C2185B' }]}>{coupons.length} টি</Text>
            <Text style={styles.kpiSub}>তালিকায় সংরক্ষিত</Text>
          </View>
          <View style={[styles.kpiCard, { backgroundColor: '#E8F5E9', borderColor: '#A5D6A7' }]}>
            <Text style={styles.kpiLabel}>সক্রিয় অফার</Text>
            <Text style={[styles.kpiValue, { color: '#2E7D32' }]}>
              {coupons.filter((c) => c.is_active).length} টি
            </Text>
            <Text style={styles.kpiSub}>ওয়েবসাইটে প্রযোজ্য</Text>
          </View>
          <View style={[styles.kpiCard, { backgroundColor: '#FFF3E0', borderColor: '#FFCC80' }]}>
            <Text style={styles.kpiLabel}>মোট ব্যবহার</Text>
            <Text style={[styles.kpiValue, { color: '#E65100' }]}>
              {coupons.reduce((sum, c) => sum + (c.usage_count || 0), 0)} বার
            </Text>
            <Text style={styles.kpiSub}>অর্ডারে রিডিম হয়েছে</Text>
          </View>
        </View>

        {/* Search and Active toggle */}
        <View style={styles.filterRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="🔍 কুপন কোড খুঁজুন (যেমন: AURORA10)..."
            placeholderTextColor="#888"
            value={search}
            onChangeText={setSearch}
          />
          <Pressable
            style={[styles.activeFilterChip, filterActiveOnly && styles.activeFilterChipSelected]}
            onPress={() => setFilterActiveOnly(!filterActiveOnly)}
          >
            <Text
              style={[
                styles.activeFilterChipText,
                filterActiveOnly && styles.activeFilterChipTextSelected,
              ]}
            >
              {filterActiveOnly ? '✓ শুধু সক্রিয়' : 'সকল'}
            </Text>
          </Pressable>
        </View>

        {/* Coupons List */}
        {filteredCoupons.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>🏷️</Text>
            <Text style={styles.emptyText}>কোন কুপন পাওয়া যায়নি</Text>
            <Text style={styles.emptySub}>নতুন অফার চালু করতে উপরের '+ নতুন কুপন' বাটনে চাপুন।</Text>
          </View>
        ) : (
          filteredCoupons.map((c) => (
            <View key={c.id} style={[styles.couponCard, !c.is_active && styles.couponCardInactive]}>
              <View style={styles.couponTop}>
                <View style={styles.codeBadge}>
                  <Text style={styles.codeText}>{c.code}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[styles.statusText, c.is_active ? styles.statusActive : styles.statusInactive]}>
                    {c.is_active ? 'সক্রিয়' : 'নিষ্ক্রিয়'}
                  </Text>
                  <Switch
                    value={c.is_active}
                    onValueChange={() => handleToggleActive(c.id)}
                    trackColor={{ false: '#E2E8F0', true: '#C2185B' }}
                    thumbColor={c.is_active ? '#FFFFFF' : '#94A3B8'}
                  />
                </View>
              </View>

              <View style={styles.discountRow}>
                <Text style={styles.discountValueText}>
                  {c.discount_type === 'percentage'
                    ? `${c.discount_value}% ছাড়`
                    : `${money(c.discount_value)} ফ্ল্যাট ছাড়`}
                </Text>
                <Text style={styles.minOrderText}>
                  সর্বনিম্ন অর্ডার: {money(c.min_order_amount)}
                </Text>
              </View>

              {c.max_discount_amount ? (
                <Text style={styles.maxDiscountText}>
                  * সর্বোচ্চ ছাড় {money(c.max_discount_amount)} পর্যন্ত প্রযোজ্য
                </Text>
              ) : null}

              <View style={styles.usageRow}>
                <Text style={styles.usageCountText}>
                  👥 মোট ব্যবহার হয়েছে: <Text style={{ fontWeight: '800' }}>{c.usage_count} বার</Text>
                </Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Pressable
                    style={styles.shareBtn}
                    onPress={() => void handleShareCoupon(c)}
                  >
                    <Text style={styles.shareBtnText}>📢 শেয়ার</Text>
                  </Pressable>
                  <Pressable
                    style={styles.deleteBtn}
                    onPress={() => handleDelete(c.id)}
                  >
                    <Text style={styles.deleteBtnText}>🗑️</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Add Coupon Modal */}
      <Modal
        visible={addModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setAddModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🏷️ নতুন প্রমো কুপন তৈরি করুন</Text>
              <Pressable onPress={() => setAddModalOpen(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 420 }}>
              {formError ? <Text style={styles.errorText}>⚠️ {formError}</Text> : null}

              <Text style={styles.inputLabel}>কুপন কোড (বড় হাতের অক্ষরে)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="যেমন: EID2026, SWEET100"
                placeholderTextColor="#888"
                autoCapitalize="characters"
                value={code}
                onChangeText={(t) => setCode(t.toUpperCase())}
              />

              <Text style={styles.inputLabel}>ডিসকাউন্টের ধরন</Text>
              <View style={styles.typeSelectorRow}>
                <Pressable
                  style={[
                    styles.typeSelectorBtn,
                    discountType === 'percentage' && styles.typeSelectorBtnActive,
                  ]}
                  onPress={() => setDiscountType('percentage')}
                >
                  <Text
                    style={[
                      styles.typeSelectorText,
                      discountType === 'percentage' && styles.typeSelectorTextActive,
                    ]}
                  >
                    % শতকরা ছাড়
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.typeSelectorBtn,
                    discountType === 'fixed' && styles.typeSelectorBtnActive,
                  ]}
                  onPress={() => setDiscountType('fixed')}
                >
                  <Text
                    style={[
                      styles.typeSelectorText,
                      discountType === 'fixed' && styles.typeSelectorTextActive,
                    ]}
                  >
                    ৳ নির্দিষ্ট টাকা ছাড়
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.inputLabel}>
                {discountType === 'percentage' ? 'ডিসকাউন্ট (%)' : 'ডিসকাউন্ট (৳)'}
              </Text>
              <TextInput
                style={styles.modalInput}
                placeholder={discountType === 'percentage' ? 'যেমন: 10' : 'যেমন: 100'}
                placeholderTextColor="#888"
                keyboardType="numeric"
                value={discountValue}
                onChangeText={setDiscountValue}
              />

              <Text style={styles.inputLabel}>সর্বনিম্ন অর্ডার পরিমাণ (৳)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="যেমন: 1000 (খালি রাখলে 0)"
                placeholderTextColor="#888"
                keyboardType="numeric"
                value={minOrder}
                onChangeText={setMinOrder}
              />

              {discountType === 'percentage' && (
                <>
                  <Text style={styles.inputLabel}>সর্বোচ্চ ছাড়ের সীমা (৳, ঐচ্ছিক)</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="যেমন: 300"
                    placeholderTextColor="#888"
                    keyboardType="numeric"
                    value={maxDiscount}
                    onChangeText={setMaxDiscount}
                  />
                </>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => setAddModalOpen(false)}
              >
                <Text style={styles.cancelBtnText}>বাতিল</Text>
              </Pressable>
              <Pressable
                style={styles.confirmBtn}
                onPress={handleCreateCoupon}
              >
                <Text style={styles.confirmBtnText}>কুপন সংরক্ষণ করুন</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#FCE4EC',
    gap: 10,
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#FCE4EC',
  },
  backBtnText: {
    color: '#C2185B',
    fontWeight: '700',
    fontSize: 13,
  },
  title: {
    fontSize: 17,
    fontWeight: '900',
    color: '#880E4F',
  },
  subtitle: {
    fontSize: 11.5,
    color: '#666',
    marginTop: 2,
  },
  addBtn: {
    backgroundColor: '#C2185B',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 120,
    gap: 14,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 10,
  },
  kpiCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#555',
  },
  kpiValue: {
    fontSize: 16,
    fontWeight: '900',
    marginVertical: 4,
  },
  kpiSub: {
    fontSize: 9.5,
    color: '#777',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    fontSize: 12.5,
    color: '#1E293B',
  },
  activeFilterChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  activeFilterChipSelected: {
    backgroundColor: '#C2185B',
    borderColor: '#AD1457',
  },
  activeFilterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  activeFilterChipTextSelected: {
    color: '#FFFFFF',
  },
  couponCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#F8BBD0',
    borderStyle: 'dashed',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 3 },
      android: { elevation: 2 },
    }),
  },
  couponCardInactive: {
    opacity: 0.6,
    borderColor: '#CBD5E1',
  },
  couponTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  codeBadge: {
    backgroundColor: '#FCE4EC',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F48FB1',
  },
  codeText: {
    color: '#C2185B',
    fontWeight: '900',
    fontSize: 16,
    letterSpacing: 1,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusActive: {
    color: '#16A34A',
  },
  statusInactive: {
    color: '#94A3B8',
  },
  discountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  discountValueText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
  },
  minOrderText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  maxDiscountText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
    fontStyle: 'italic',
  },
  usageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  usageCountText: {
    fontSize: 11.5,
    color: '#475569',
  },
  shareBtn: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  shareBtnText: {
    color: '#047857',
    fontWeight: '800',
    fontSize: 11,
  },
  deleteBtn: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  deleteBtnText: {
    fontSize: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyEmoji: {
    fontSize: 44,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#475569',
  },
  emptySub: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#FCE4EC',
    paddingBottom: 10,
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#880E4F',
  },
  modalCloseText: {
    fontSize: 18,
    color: '#94A3B8',
    fontWeight: 'bold',
    padding: 4,
  },
  errorText: {
    color: '#DC2626',
    backgroundColor: '#FEE2E2',
    padding: 8,
    borderRadius: 6,
    marginBottom: 10,
    fontSize: 12,
    fontWeight: '600',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
    marginTop: 8,
  },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#0F172A',
  },
  typeSelectorRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 4,
  },
  typeSelectorBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  typeSelectorBtnActive: {
    backgroundColor: '#FCE4EC',
    borderColor: '#C2185B',
  },
  typeSelectorText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  typeSelectorTextActive: {
    color: '#C2185B',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  confirmBtn: {
    flex: 2,
    paddingVertical: 11,
    borderRadius: 8,
    backgroundColor: '#C2185B',
    alignItems: 'center',
  },
  confirmBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
