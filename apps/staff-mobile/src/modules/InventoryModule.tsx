import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
  Alert,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { money } from '../domain';
import { INITIAL_INGREDIENTS, type Ingredient, type StockMovement } from '../bmsData';

interface InventoryModuleProps {
  onClose?: () => void;
  staffName?: string;
}

const INVENTORY_STORAGE_KEY = 'aurora_bms_inventory_v1';
const MOVEMENTS_STORAGE_KEY = 'aurora_bms_movements_v1';

export const InventoryModule: React.FC<InventoryModuleProps> = ({
  onClose,
  staffName = 'Admin',
}) => {
  const [ingredients, setIngredients] = useState<Ingredient[]>(INITIAL_INGREDIENTS);
  const [movements, setMovements] = useState<StockMovement[]>([
    {
      id: 'mov-1',
      ingredient_id: 'ing-1',
      ingredient_name: 'প্রিমিয়াম ময়দা',
      movement_type: 'purchase',
      quantity: 50,
      unit: 'kg',
      unit_cost: 75,
      total_cost: 3750,
      created_by: 'Admin',
      created_at: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 'mov-2',
      ingredient_id: 'ing-3',
      ingredient_name: 'হুইপিং ক্রিম',
      movement_type: 'usage',
      quantity: -4,
      unit: 'liter',
      unit_cost: 450,
      total_cost: 1800,
      notes: 'অর্ডার তৈরির জন্য ব্যবহৃত',
      created_by: 'Chef Baker',
      created_at: new Date(Date.now() - 7200000).toISOString(),
    },
  ]);

  const [activeTab, setActiveTab] = useState<'stock' | 'low_stock' | 'movements'>('stock');
  const [search, setSearch] = useState('');
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Ingredient | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustType, setAdjustType] = useState<'purchase' | 'usage' | 'damage' | 'adjustment'>('purchase');
  const [adjustNote, setAdjustNote] = useState('');

  // Load saved inventory from local storage
  useEffect(() => {
    SecureStore.getItemAsync(INVENTORY_STORAGE_KEY).then(raw => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) setIngredients(parsed);
        } catch {}
      }
    }).catch(() => {});

    SecureStore.getItemAsync(MOVEMENTS_STORAGE_KEY).then(raw => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) setMovements(parsed);
        } catch {}
      }
    }).catch(() => {});
  }, []);

  const lowStockCount = useMemo(() => {
    return ingredients.filter(i => i.current_stock <= i.minimum_stock).length;
  }, [ingredients]);

  const totalValuation = useMemo(() => {
    return ingredients.reduce((sum, i) => sum + i.current_stock * i.cost_per_unit, 0);
  }, [ingredients]);

  const filteredItems = useMemo(() => {
    return ingredients.filter(i => {
      const q = search.trim().toLowerCase();
      const matchSearch = !q || i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q);
      if (activeTab === 'low_stock') return i.current_stock <= i.minimum_stock && matchSearch;
      return matchSearch;
    });
  }, [ingredients, search, activeTab]);

  const handleSaveAdjustment = async () => {
    if (!selectedItem) return;
    const qty = Number(adjustQty.replace(/[^\d.]/g, '') || 0);
    if (qty <= 0) {
      Alert.alert('অবৈধ পরিমাণ', 'অনুগ্রহ করে সঠিক পরিমাণ লিখুন।');
      return;
    }

    const delta = (adjustType === 'purchase' || adjustType === 'adjustment') ? qty : -qty;
    const nextStock = Math.max(0, selectedItem.current_stock + delta);

    const updatedIngredients = ingredients.map(i => {
      if (i.id === selectedItem.id) {
        return { ...i, current_stock: nextStock };
      }
      return i;
    });

    const newMovement: StockMovement = {
      id: `mov-${Date.now()}`,
      ingredient_id: selectedItem.id,
      ingredient_name: selectedItem.name,
      movement_type: adjustType,
      quantity: delta,
      unit: selectedItem.unit,
      unit_cost: selectedItem.cost_per_unit,
      total_cost: Math.abs(delta) * selectedItem.cost_per_unit,
      notes: adjustNote.trim() || undefined,
      created_by: staffName,
      created_at: new Date().toISOString(),
    };

    const updatedMovements = [newMovement, ...movements];

    setIngredients(updatedIngredients);
    setMovements(updatedMovements);
    setAdjustModalOpen(false);
    setAdjustQty('');
    setAdjustNote('');

    await SecureStore.setItemAsync(INVENTORY_STORAGE_KEY, JSON.stringify(updatedIngredients)).catch(() => {});
    await SecureStore.setItemAsync(MOVEMENTS_STORAGE_KEY, JSON.stringify(updatedMovements)).catch(() => {});

    Alert.alert('স্টক আপডেট সফল', `${selectedItem.name} এর বর্তমান স্টক এখন ${nextStock} ${selectedItem.unit}`);
  };

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>🥫 কাঁচামাল ও ইনভেন্টরি (Stock)</Text>
          <Text style={s.subtitle}>ময়দা, চিনি, ক্রিম, ডিম ও প্যাকেজিং স্টক ট্র্যাকিং</Text>
        </View>
        {onClose ? (
          <Pressable onPress={onClose} style={s.closeBtn}>
            <Text style={{ fontSize: 18, color: '#64748B', fontWeight: '800' }}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Metric Cards */}
      <View style={{ flexDirection: 'row', gap: 10, padding: 14, paddingBottom: 6 }}>
        <View style={s.heroCard}>
          <Text style={s.heroLabel}>মোট কাঁচামাল স্টক মূল্য</Text>
          <Text style={s.heroVal}>{money(totalValuation)}</Text>
          <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{ingredients.length} ধরনের উপকরণ স্টকে আছে</Text>
        </View>
        <Pressable onPress={() => setActiveTab('low_stock')} style={[s.alertCard, lowStockCount > 0 && s.alertCardActive]}>
          <Text style={{ fontSize: 18 }}>⚠️</Text>
          <Text style={s.alertVal}>{lowStockCount}</Text>
          <Text style={s.alertLabel}>লো স্টক অ্যালার্ট</Text>
        </Pressable>
      </View>

      {/* Tabs */}
      <View style={s.tabBar}>
        <Pressable onPress={() => setActiveTab('stock')} style={[s.tabBtn, activeTab === 'stock' && s.tabBtnActive]}>
          <Text style={[s.tabText, activeTab === 'stock' && s.tabTextActive]}>উপকরণ ({ingredients.length})</Text>
        </Pressable>
        <Pressable onPress={() => setActiveTab('low_stock')} style={[s.tabBtn, activeTab === 'low_stock' && s.tabBtnActive]}>
          <Text style={[s.tabText, activeTab === 'low_stock' && s.tabTextActive]}>
            লো স্টক ({lowStockCount})
          </Text>
        </Pressable>
        <Pressable onPress={() => setActiveTab('movements')} style={[s.tabBtn, activeTab === 'movements' && s.tabBtnActive]}>
          <Text style={[s.tabText, activeTab === 'movements' && s.tabTextActive]}>স্টক মুভমেন্ট লগ</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }}>
        {activeTab === 'movements' ? (
          <>
            <Text style={{ fontWeight: '800', color: '#1E293B', fontSize: 14, marginBottom: 4 }}>
              📜 সাম্প্রতিক স্টক ইন / আউট ইতিহাস:
            </Text>
            {movements.map(m => (
              <View key={m.id} style={s.movCard}>
                <View style={s.inlineBetween}>
                  <Text style={{ fontWeight: '900', color: '#0F172A', fontSize: 15 }}>{m.ingredient_name}</Text>
                  <View style={[s.badge, m.quantity > 0 ? s.badgeIn : s.badgeOut]}>
                    <Text style={[s.badgeText, m.quantity > 0 ? { color: '#166534' } : { color: '#991B1B' }]}>
                      {m.quantity > 0 ? `+${m.quantity} ${m.unit} (ইন)` : `${m.quantity} ${m.unit} (আউট)`}
                    </Text>
                  </View>
                </View>
                <View style={[s.inlineBetween, { marginTop: 4 }]}>
                  <Text style={{ fontSize: 12, color: '#64748B' }}>
                    ধরন: {m.movement_type === 'purchase' ? 'কেনাকাটা' : m.movement_type === 'usage' ? 'ব্যবহার' : m.movement_type === 'damage' ? 'নষ্ট/ক্ষতি' : 'অ্যাডজাস্টমেন্ট'} • {m.created_by}
                  </Text>
                  {m.total_cost ? <Text style={{ fontSize: 13, fontWeight: '800', color: '#1D5845' }}>{money(m.total_cost)}</Text> : null}
                </View>
                {m.notes ? <Text style={{ fontSize: 11, color: '#B45309', marginTop: 2 }}>নোট: {m.notes}</Text> : null}
              </View>
            ))}
          </>
        ) : (
          <>
            <TextInput
              style={s.search}
              value={search}
              onChangeText={setSearch}
              placeholder="🔍 উপকরণের নাম লিখে ফিল্টার করুন…"
              placeholderTextColor="#94A3B8"
            />

            {filteredItems.map(item => {
              const isLow = item.current_stock <= item.minimum_stock;
              return (
                <View key={item.id} style={[s.itemCard, isLow && s.itemCardLow]}>
                  <View style={s.inlineBetween}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '900', color: '#0F172A', fontSize: 15 }}>{item.name}</Text>
                      <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                        সাপ্লায়ার: {item.supplier_name} • একক দর: ৳{item.cost_per_unit}/{item.unit}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 18, fontWeight: '900', color: isLow ? '#DC2626' : '#1D5845' }}>
                        {item.current_stock} {item.unit}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#64748B' }}>মিনিমাম: {item.minimum_stock} {item.unit}</Text>
                    </View>
                  </View>

                  <View style={[s.inlineBetween, { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderColor: '#F1F5F9' }]}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569' }}>
                      মোট মূল্য: {money(item.current_stock * item.cost_per_unit)}
                    </Text>
                    <Pressable
                      onPress={() => {
                        setSelectedItem(item);
                        setAdjustQty('');
                        setAdjustType('purchase');
                        setAdjustNote('');
                        setAdjustModalOpen(true);
                      }}
                      style={s.adjustBtn}
                    >
                      <Text style={s.adjustBtnText}>± স্টক এন্ট্রি</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* Stock Adjustment Modal */}
      {adjustModalOpen && selectedItem ? (
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.inlineBetween}>
              <Text style={{ fontSize: 17, fontWeight: '900', color: '#0F172A' }}>± স্টক পরিবর্তন এন্ট্রি</Text>
              <Pressable onPress={() => setAdjustModalOpen(false)}>
                <Text style={{ fontSize: 18, color: '#64748B', fontWeight: '800' }}>✕</Text>
              </Pressable>
            </View>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#1D5845', marginTop: 4 }}>{selectedItem.name}</Text>
            <Text style={{ fontSize: 12, color: '#64748B' }}>বর্তমান স্টক: {selectedItem.current_stock} {selectedItem.unit}</Text>

            <View style={{ flexDirection: 'row', gap: 6, marginVertical: 10 }}>
              {(['purchase', 'usage', 'damage', 'adjustment'] as const).map(t => (
                <Pressable
                  key={t}
                  onPress={() => setAdjustType(t)}
                  style={[s.typePill, adjustType === t && s.typePillActive]}
                >
                  <Text style={[s.typePillText, adjustType === t && s.typePillTextActive]}>
                    {t === 'purchase' ? '+ ক্রয় (ইন)' : t === 'usage' ? '- ব্যবহার' : t === 'damage' ? '✕ নষ্ট/ক্ষতি' : '± অ্যাডজাস্ট'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              style={s.input}
              value={adjustQty}
              onChangeText={setAdjustQty}
              placeholder={`পরিমাণ (${selectedItem.unit})`}
              keyboardType="numeric"
              placeholderTextColor="#94A3B8"
            />

            <TextInput
              style={s.input}
              value={adjustNote}
              onChangeText={setAdjustNote}
              placeholder="নোট বা কারণ (ঐচ্ছিক)"
              placeholderTextColor="#94A3B8"
            />

            <Pressable onPress={handleSaveAdjustment} style={s.saveBtn}>
              <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 14 }}>✓ স্টক সংরক্ষণ করুন</Text>
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
  heroCard: { flex: 2, backgroundColor: '#FFF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  heroLabel: { fontSize: 11, color: '#64748B', fontWeight: '700' },
  heroVal: { fontSize: 22, fontWeight: '900', color: '#1D5845', marginTop: 2 },
  alertCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  alertCardActive: { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' },
  alertVal: { fontSize: 18, fontWeight: '900', color: '#DC2626', marginTop: 2 },
  alertLabel: { fontSize: 10, color: '#64748B', fontWeight: '800' },
  tabBar: { flexDirection: 'row', backgroundColor: '#FFF', paddingHorizontal: 12, borderBottomWidth: 1, borderColor: '#E2E8F0' },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderColor: 'transparent' },
  tabBtnActive: { borderColor: '#1D5845' },
  tabText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  tabTextActive: { color: '#1D5845', fontWeight: '900' },
  search: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: '#0F172A' },
  itemCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  itemCardLow: { borderColor: '#FCA5A5', backgroundColor: '#FFFDFD' },
  inlineBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  adjustBtn: { backgroundColor: '#1D5845', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  adjustBtnText: { color: '#FFF', fontWeight: '800', fontSize: 12 },
  movCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeIn: { backgroundColor: '#DCFCE7' },
  badgeOut: { backgroundColor: '#FEE2E2' },
  badgeText: { fontSize: 11, fontWeight: '800' },
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  modalSheet: { backgroundColor: '#FFF', borderRadius: 16, padding: 18 },
  typePill: { flex: 1, paddingVertical: 6, alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 6 },
  typePillActive: { backgroundColor: '#1D5845' },
  typePillText: { fontSize: 11, fontWeight: '700', color: '#475569' },
  typePillTextActive: { color: '#FFF', fontWeight: '800' },
  input: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: '#0F172A', marginTop: 10 },
  saveBtn: { backgroundColor: '#1D5845', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 14 },
});
