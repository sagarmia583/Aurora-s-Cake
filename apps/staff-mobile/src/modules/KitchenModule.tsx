import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
  Alert,
} from 'react-native';
import type { StaffOrder, StaffSession, Operation } from '../domain';
import { humanTime, money } from '../domain';
import { INITIAL_RECIPES, type RecipeItem } from '../bmsData';

interface KitchenModuleProps {
  orders: StaffOrder[];
  session: StaffSession | null;
  onUpdateStatus: (order: StaffOrder, op: Operation) => Promise<void>;
  onClose?: () => void;
}

export const KitchenModule: React.FC<KitchenModuleProps> = ({
  orders,
  session,
  onUpdateStatus,
  onClose,
}) => {
  const [subTab, setSubTab] = useState<'queue' | 'recipes' | 'batch'>('queue');
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'preparing' | 'ready'>('all');
  const [search, setSearch] = useState('');
  const [recipes] = useState<RecipeItem[]>(INITIAL_RECIPES);
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeItem | null>(null);
  const [actionBusyId, setActionBusyId] = useState('');

  // Extract orders relevant for bakery kitchen
  const kitchenOrders = useMemo(() => {
    return orders.filter(o => {
      const isKitchenStatus = ['confirmed', 'preparing', 'ready'].includes(o.status);
      if (!isKitchenStatus) return false;
      if (filter !== 'all' && o.status !== filter) return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        o.order_number.toLowerCase().includes(q) ||
        (o.customer_name && o.customer_name.toLowerCase().includes(q)) ||
        (o.items && o.items.some(i => i.product_name.toLowerCase().includes(q)))
      );
    });
  }, [orders, filter, search]);

  const counts = useMemo(() => {
    const queue = orders.filter(o => o.status === 'confirmed').length;
    const preparing = orders.filter(o => o.status === 'preparing').length;
    const ready = orders.filter(o => o.status === 'ready').length;
    return { queue, preparing, ready };
  }, [orders]);

  // Batch production grouping: group items by product name
  const batchGroups = useMemo(() => {
    const map = new Map<string, { product_name: string; count: number; order_numbers: string[] }>();
    orders
      .filter(o => o.status === 'confirmed' || o.status === 'preparing')
      .forEach(o => {
        if (o.items && o.items.length > 0) {
          o.items.forEach(it => {
            const cur = map.get(it.product_name) || { product_name: it.product_name, count: 0, order_numbers: [] };
            cur.count += it.quantity;
            if (!cur.order_numbers.includes(o.order_number)) cur.order_numbers.push(o.order_number);
            map.set(it.product_name, cur);
          });
        } else {
          const key = 'Custom Cake';
          const cur = map.get(key) || { product_name: key, count: 0, order_numbers: [] };
          cur.count += 1;
          cur.order_numbers.push(o.order_number);
          map.set(key, cur);
        }
      });
    return Array.from(map.values());
  }, [orders]);

  const handleAction = async (order: StaffOrder, op: Operation) => {
    setActionBusyId(order.id);
    try {
      await onUpdateStatus(order, op);
    } catch (err: any) {
      Alert.alert('অপারেশন ব্যর্থ', err?.message || 'অনুগ্রহ করে আবার চেষ্টা করুন।');
    } finally {
      setActionBusyId('');
    }
  };

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>👨‍🍳 কিচেন ও প্রোডাকশন (Kitchen)</Text>
          <Text style={s.subtitle}>বেকিং কিউ, রেসিপি নির্দেশিকা ও ব্যাচ প্রোডাকশন</Text>
        </View>
        {onClose ? (
          <Pressable onPress={onClose} style={s.closeBtn}>
            <Text style={{ fontSize: 18, color: '#64748B', fontWeight: '800' }}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Sub Tabs */}
      <View style={s.tabBar}>
        <Pressable onPress={() => setSubTab('queue')} style={[s.tabBtn, subTab === 'queue' && s.tabBtnActive]}>
          <Text style={[s.tabText, subTab === 'queue' && s.tabTextActive]}>
            🔥 বেকিং কিউ ({kitchenOrders.length})
          </Text>
        </Pressable>
        <Pressable onPress={() => setSubTab('batch')} style={[s.tabBtn, subTab === 'batch' && s.tabBtnActive]}>
          <Text style={[s.tabText, subTab === 'batch' && s.tabTextActive]}>
            ⚡ ব্যাচ বেকিং ({batchGroups.length})
          </Text>
        </Pressable>
        <Pressable onPress={() => setSubTab('recipes')} style={[s.tabBtn, subTab === 'recipes' && s.tabBtnActive]}>
          <Text style={[s.tabText, subTab === 'recipes' && s.tabTextActive]}>
            📖 রেসিপি কার্ড ({recipes.length})
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }}>
        {subTab === 'queue' ? (
          <>
            {/* KPI metric cards */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => setFilter('confirmed')} style={[s.kpiCard, filter === 'confirmed' && s.kpiActive]}>
                <Text style={s.kpiLabel}>কিউতে অপেক্ষা</Text>
                <Text style={[s.kpiVal, { color: '#B45309' }]}>{counts.queue}</Text>
              </Pressable>
              <Pressable onPress={() => setFilter('preparing')} style={[s.kpiCard, filter === 'preparing' && s.kpiActive]}>
                <Text style={s.kpiLabel}>ওভেনে বেকিং চলছে</Text>
                <Text style={[s.kpiVal, { color: '#DC2626' }]}>{counts.preparing}</Text>
              </Pressable>
              <Pressable onPress={() => setFilter('ready')} style={[s.kpiCard, filter === 'ready' && s.kpiActive]}>
                <Text style={s.kpiLabel}>রেডি / প্রস্তুত</Text>
                <Text style={[s.kpiVal, { color: '#16A34A' }]}>{counts.ready}</Text>
              </Pressable>
            </View>

            {/* Search Filter */}
            <TextInput
              style={s.search}
              value={search}
              onChangeText={setSearch}
              placeholder="🔍 অর্ডার নম্বর বা কেকের নাম…"
              placeholderTextColor="#94A3B8"
            />

            {/* Filter pills */}
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {(['all', 'confirmed', 'preparing', 'ready'] as const).map(f => (
                <Pressable key={f} onPress={() => setFilter(f)} style={[s.filterPill, filter === f && s.filterPillActive]}>
                  <Text style={[s.filterPillText, filter === f && s.filterPillTextActive]}>
                    {f === 'all' ? 'সব' : f === 'confirmed' ? 'অপেক্ষা' : f === 'preparing' ? 'ওভেনে' : 'রেডি'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Order cards */}
            {kitchenOrders.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={{ fontSize: 36, marginBottom: 6 }}>🍰</Text>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#1E293B' }}>কোনো কিচেন টাস্ক নেই</Text>
                <Text style={{ fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 4 }}>
                  বর্তমানে ওভেনে দেওয়ার মতো কোনো কনফার্মড অর্ডার পেন্ডিং নেই।
                </Text>
              </View>
            ) : (
              kitchenOrders.map(o => (
                <View key={o.id} style={s.orderCard}>
                  <View style={s.inlineBetween}>
                    <View>
                      <Text style={{ fontWeight: '900', color: '#0F172A', fontSize: 16 }}>#{o.order_number}</Text>
                      <Text style={{ fontSize: 12, color: '#64748B' }}>{humanTime(o.created_at)}</Text>
                    </View>
                    <View style={[s.badge, o.status === 'confirmed' ? s.badgeWarn : o.status === 'preparing' ? s.badgeDanger : s.badgeSuccess]}>
                      <Text style={[s.badgeText, o.status === 'confirmed' ? { color: '#92400E' } : o.status === 'preparing' ? { color: '#991B1B' } : { color: '#166534' }]}>
                        {o.status === 'confirmed' ? 'বেকিং শুরু করুন' : o.status === 'preparing' ? 'ওভেনে চলছে 🔥' : 'প্রস্তুত ✓'}
                      </Text>
                    </View>
                  </View>

                  {/* Items to bake */}
                  <View style={s.itemsBox}>
                    {o.items && o.items.length > 0 ? (
                      o.items.map((it, idx) => (
                        <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
                          <Text style={{ fontWeight: '800', color: '#1E293B', fontSize: 14 }}>
                            🎂 {it.quantity}x {it.product_name}
                          </Text>
                          <Text style={{ fontSize: 12, color: '#64748B' }}>{it.variant_name || '1 lb'}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={{ fontWeight: '800', color: '#1E293B' }}>🎂 কাস্টম বেকারি কেক অর্ডার</Text>
                    )}
                    {o.message_on_cake ? (
                      <Text style={{ fontSize: 12, color: '#B45309', fontWeight: '700', marginTop: 4 }}>
                        ✍️ কেকের লেখা: "{o.message_on_cake}"
                      </Text>
                    ) : null}
                    {o.order_note ? (
                      <Text style={{ fontSize: 12, color: '#475569', fontStyle: 'italic', marginTop: 2 }}>
                        📝 নোট: {o.order_note}
                      </Text>
                    ) : null}
                  </View>

                  {/* Action buttons */}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    {o.status === 'confirmed' ? (
                      <Pressable
                        disabled={actionBusyId === o.id}
                        onPress={() => handleAction(o, 'start_baking')}
                        style={[s.actionBtn, { backgroundColor: '#B45309' }]}
                      >
                        <Text style={s.actionBtnText}>
                          {actionBusyId === o.id ? 'আপডেট হচ্ছে…' : '🔥 Start Baking (ওভেনে তুলুন)'}
                        </Text>
                      </Pressable>
                    ) : null}

                    {o.status === 'preparing' ? (
                      <Pressable
                        disabled={actionBusyId === o.id}
                        onPress={() => handleAction(o, 'mark_ready')}
                        style={[s.actionBtn, { backgroundColor: '#15803D' }]}
                      >
                        <Text style={s.actionBtnText}>
                          {actionBusyId === o.id ? 'আপডেট হচ্ছে…' : '✓ Mark Ready (কেক প্রস্তুত)'}
                        </Text>
                      </Pressable>
                    ) : null}

                    {o.status === 'ready' ? (
                      <View style={{ flex: 1, backgroundColor: '#ECFDF5', padding: 10, borderRadius: 8, alignItems: 'center' }}>
                        <Text style={{ color: '#065F46', fontWeight: '800', fontSize: 13 }}>
                          ✓ কেক রেডি — রাইডার বা কাস্টমার ডেলিভারির জন্য প্রস্তুত
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </>
        ) : subTab === 'batch' ? (
          <>
            <View style={{ backgroundColor: '#FFF', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' }}>
              <Text style={{ fontSize: 15, fontWeight: '900', color: '#0F172A' }}>⚡ ব্যাচ প্রোডাকশন শিডিউলার</Text>
              <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                চলমান অর্ডারগুলোকে পণ্য অনুযায়ী একত্রিত করে এক সাথে ওভেনে বেকিং করুন:
              </Text>
            </View>

            {batchGroups.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={{ fontSize: 32, marginBottom: 4 }}>🥣</Text>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#1E293B' }}>কোনো ব্যাচ টাস্ক নেই</Text>
              </View>
            ) : (
              batchGroups.map((bg, idx) => (
                <View key={idx} style={s.batchCard}>
                  <View style={s.inlineBetween}>
                    <Text style={{ fontSize: 16, fontWeight: '900', color: '#1E293B' }}>{bg.product_name}</Text>
                    <View style={s.batchBadge}>
                      <Text style={s.batchBadgeText}>মোট {bg.count} টি কেক</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 12, color: '#64748B', marginTop: 6 }}>
                    অর্ডার তালিকা: {bg.order_numbers.map(n => `#${n}`).join(', ')}
                  </Text>
                  <View style={s.batchTip}>
                    <Text style={{ fontSize: 12, color: '#92400E', fontWeight: '700' }}>
                      💡 পরামর্শ: {bg.count}টি কেকের জন্য একই ওভেন ট্রের মিক্সচার একবারে তৈরি করুন।
                    </Text>
                  </View>
                </View>
              ))
            )}
          </>
        ) : (
          /* Recipes Screen */
          <>
            <View style={{ backgroundColor: '#FFF', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' }}>
              <Text style={{ fontSize: 15, fontWeight: '900', color: '#0F172A' }}>📖 বেকারি রেসিপি ও মাপজোখ নির্দেশিকা</Text>
              <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                প্রতিটি ফ্লেভারের স্ট্যান্ডার্ড উপকরণ ও ওভেন প্রি-হিট তাপমাত্রা:
              </Text>
            </View>

            {recipes.map(rec => (
              <Pressable key={rec.id} onPress={() => setSelectedRecipe(rec)} style={s.recipeCard}>
                <View style={s.inlineBetween}>
                  <Text style={{ fontSize: 15, fontWeight: '900', color: '#1E293B' }}>{rec.product_name}</Text>
                  <Text style={{ fontSize: 12, color: '#1D5845', fontWeight: '800' }}>{rec.bake_time_minutes} মিনিট বেকিং</Text>
                </View>
                <Text style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>{rec.description}</Text>
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                  <Text style={{ fontSize: 11, color: '#475569', fontWeight: '700' }}>⏱️ প্রিপারেশন: {rec.prep_time_minutes} মি.</Text>
                  <Text style={{ fontSize: 11, color: '#475569', fontWeight: '700' }}>🔥 ওভেন: ১৭০° সে.</Text>
                  <Text style={{ fontSize: 11, color: '#475569', fontWeight: '700' }}>👥 পরিবেশন: {rec.serves} জন</Text>
                </View>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>

      {/* Recipe Detail Modal */}
      {selectedRecipe ? (
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.inlineBetween}>
              <Text style={{ fontSize: 17, fontWeight: '900', color: '#0F172A' }}>{selectedRecipe.product_name}</Text>
              <Pressable onPress={() => setSelectedRecipe(null)}>
                <Text style={{ fontSize: 18, color: '#64748B', fontWeight: '800' }}>✕</Text>
              </Pressable>
            </View>
            <Text style={{ fontSize: 13, color: '#64748B', marginVertical: 6 }}>{selectedRecipe.description}</Text>

            <Text style={{ fontWeight: '800', color: '#1E293B', fontSize: 14, marginTop: 10, marginBottom: 6 }}>
              🥣 প্রয়োজনীয় উপাদান ও পরিমাণ:
            </Text>
            <View style={{ backgroundColor: '#F8FAFC', padding: 12, borderRadius: 10, gap: 6 }}>
              {selectedRecipe.ingredients.map((ing, i) => (
                <View key={i} style={s.inlineBetween}>
                  <Text style={{ fontSize: 13, color: '#334155', fontWeight: '700' }}>• {ing.name}</Text>
                  <Text style={{ fontSize: 13, color: '#1D5845', fontWeight: '900' }}>{ing.quantity}</Text>
                </View>
              ))}
            </View>

            <Pressable onPress={() => setSelectedRecipe(null)} style={s.closeModalBtn}>
              <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 14 }}>বন্ধ করুন</Text>
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
  tabBar: { flexDirection: 'row', backgroundColor: '#FFF', paddingHorizontal: 12, borderBottomWidth: 1, borderColor: '#E2E8F0' },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderColor: 'transparent' },
  tabBtnActive: { borderColor: '#1D5845' },
  tabText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  tabTextActive: { color: '#1D5845', fontWeight: '900' },
  kpiCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  kpiActive: { borderColor: '#1D5845', backgroundColor: '#F0FDF4' },
  kpiLabel: { fontSize: 11, color: '#64748B', fontWeight: '700' },
  kpiVal: { fontSize: 20, fontWeight: '900', marginTop: 4 },
  search: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: '#0F172A' },
  filterPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F1F5F9' },
  filterPillActive: { backgroundColor: '#1D5845' },
  filterPillText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  filterPillTextActive: { color: '#FFF' },
  orderCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  inlineBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeWarn: { backgroundColor: '#FEF3C7' },
  badgeDanger: { backgroundColor: '#FEE2E2' },
  badgeSuccess: { backgroundColor: '#DCFCE7' },
  badgeText: { fontSize: 11, fontWeight: '800' },
  itemsBox: { backgroundColor: '#F8FAFC', padding: 10, borderRadius: 8, marginVertical: 8 },
  actionBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  actionBtnText: { color: '#FFF', fontWeight: '900', fontSize: 13 },
  batchCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  batchBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  batchBadgeText: { fontSize: 12, fontWeight: '900', color: '#92400E' },
  batchTip: { backgroundColor: '#FFFBEB', padding: 8, borderRadius: 6, marginTop: 8 },
  recipeCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  emptyCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  modalSheet: { backgroundColor: '#FFF', borderRadius: 16, padding: 18 },
  closeModalBtn: { backgroundColor: '#1D5845', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 14 },
});
