import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Linking,
  Alert,
  Platform,
} from 'react-native';
import { StaffOrder, money, statusLabel } from '../domain';

export interface CustomerProfile {
  id: string;
  name: string;
  phone: string;
  address: string;
  total_orders: number;
  total_spending: number;
  last_order_date: string;
  is_vip: boolean;
}

interface CustomersModuleProps {
  orders: StaffOrder[];
  onBack?: () => void;
  onSelectOrder?: (order: StaffOrder) => void;
}

export const CustomersModule: React.FC<CustomersModuleProps> = ({
  orders,
  onBack,
  onSelectOrder,
}) => {
  const [search, setSearch] = useState('');
  const [filterVipOnly, setFilterVipOnly] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  // Group customer data automatically from orders
  const customers = useMemo(() => {
    const map = new Map<string, CustomerProfile>();

    orders.forEach((o) => {
      const phone = o.customer_phone?.trim();
      if (!phone) return;

      const existing = map.get(phone);
      const orderTotal = o.status !== 'cancelled' ? (o.total_amount || 0) : 0;

      if (!existing) {
        map.set(phone, {
          id: 'cust-' + phone.replace(/\D/g, '').slice(-6),
          name: o.customer_name?.trim() || 'সম্মানিত কাস্টমার',
          phone: phone,
          address: o.delivery_address || '',
          total_orders: 1,
          total_spending: orderTotal,
          last_order_date: o.created_at || new Date().toISOString(),
          is_vip: orderTotal >= 3000,
        });
      } else {
        existing.total_orders += 1;
        existing.total_spending += orderTotal;
        if (existing.total_spending >= 3000 || existing.total_orders >= 3) {
          existing.is_vip = true;
        }
        if (o.created_at && (!existing.last_order_date || o.created_at > existing.last_order_date)) {
          existing.last_order_date = o.created_at;
        }
        if (!existing.address && o.delivery_address) {
          existing.address = o.delivery_address;
        }
        if ((!existing.name || existing.name === 'সম্মানিত কাস্টমার') && o.customer_name) {
          existing.name = o.customer_name.trim();
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => b.total_spending - a.total_spending);
  }, [orders]);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      const matchesSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.address.toLowerCase().includes(q);

      if (filterVipOnly) {
        return c.is_vip && matchesSearch;
      }
      return matchesSearch;
    });
  }, [customers, search, filterVipOnly]);

  const totalRevenue = useMemo(
    () => customers.reduce((sum, c) => sum + c.total_spending, 0),
    [customers]
  );
  const vipCount = useMemo(
    () => customers.filter((c) => c.is_vip).length,
    [customers]
  );

  const customerOrders = useMemo(() => {
    if (!selectedCustomer) return [];
    return orders.filter((o) => o.customer_phone?.trim() === selectedCustomer.phone);
  }, [orders, selectedCustomer]);

  const handleCall = (phone: string) => {
    const cleaned = phone.replace(/[^\d+]/g, '');
    Linking.openURL(`tel:${cleaned}`).catch(() => {
      Alert.alert('কল ব্যর্থ হয়েছে', `ফোন নম্বর: ${phone}`);
    });
  };

  const handleWhatsApp = (phone: string) => {
    let cleaned = phone.replace(/[^\d]/g, '');
    if (cleaned.startsWith('0')) cleaned = '88' + cleaned;
    Linking.openURL(`https://wa.me/${cleaned}`).catch(() => {
      Alert.alert('হোয়াটসঅ্যাপ খুলতে পারেনি', `নম্বর: ${phone}`);
    });
  };

  const openCustomerHistory = (c: CustomerProfile) => {
    setSelectedCustomer(c);
    setHistoryModalOpen(true);
  };

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
          <Text style={styles.title}>👥 কাস্টমার সিআরএম (CRM)</Text>
          <Text style={styles.subtitle}>গ্রাহক প্রোফাইল, অর্ডার হিস্ট্রি ও সম্পর্ক ব্যবস্থাপনা</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* KPI Cards */}
        <View style={styles.kpiRow}>
          <View style={[styles.kpiCard, { backgroundColor: '#F3E5F5', borderColor: '#CE93D8' }]}>
            <Text style={styles.kpiLabel}>মোট কাস্টমার</Text>
            <Text style={[styles.kpiValue, { color: '#6A1B9A' }]}>{customers.length}</Text>
            <Text style={styles.kpiSub}>ডাটাবেস থেকে লোডকৃত</Text>
          </View>
          <View style={[styles.kpiCard, { backgroundColor: '#FFF3E0', borderColor: '#FFCC80' }]}>
            <Text style={styles.kpiLabel}>⭐ VIP কাস্টমার</Text>
            <Text style={[styles.kpiValue, { color: '#E65100' }]}>{vipCount}</Text>
            <Text style={styles.kpiSub}>৳৩,০০০+ অথবা ৩+ অর্ডার</Text>
          </View>
          <View style={[styles.kpiCard, { backgroundColor: '#E8F5E9', borderColor: '#A5D6A7' }]}>
            <Text style={styles.kpiLabel}>লাইফটাইম সেলস</Text>
            <Text style={[styles.kpiValue, { color: '#2E7D32' }]}>{money(totalRevenue)}</Text>
            <Text style={styles.kpiSub}>গড় ৳{customers.length ? Math.round(totalRevenue / customers.length) : 0}</Text>
          </View>
        </View>

        {/* Search & Filter Bar */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="🔍 নাম, ফোন নম্বর বা ঠিকানা দিয়ে খুঁজুন..."
            placeholderTextColor="#888"
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <Pressable style={styles.clearSearchBtn} onPress={() => setSearch('')}>
              <Text style={styles.clearSearchText}>✕</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Tab Filter (All vs VIP) */}
        <View style={styles.tabFilterRow}>
          <Pressable
            style={[styles.filterChip, !filterVipOnly && styles.filterChipActive]}
            onPress={() => setFilterVipOnly(false)}
          >
            <Text style={[styles.filterChipText, !filterVipOnly && styles.filterChipTextActive]}>
              সকল কাস্টমার ({customers.length})
            </Text>
          </Pressable>
          <Pressable
            style={[styles.filterChip, filterVipOnly && styles.filterChipActive]}
            onPress={() => setFilterVipOnly(true)}
          >
            <Text style={[styles.filterChipText, filterVipOnly && styles.filterChipTextActive]}>
              ⭐ VIP স্পেশাল ({vipCount})
            </Text>
          </Pressable>
        </View>

        {/* Customers List */}
        {filteredCustomers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>👥</Text>
            <Text style={styles.emptyText}>কোন কাস্টমার পাওয়া যায়নি</Text>
            <Text style={styles.emptySub}>নতুন অর্ডার আসলে কাস্টমার প্রোফাইল স্বয়ংক্রিয়ভাবে তৈরি হয়।</Text>
          </View>
        ) : (
          <View style={styles.listContainer}>
            {filteredCustomers.map((cust) => {
              const initial = cust.name ? cust.name.charAt(0).toUpperCase() : 'C';
              return (
                <View key={cust.id} style={styles.customerCard}>
                  <View style={styles.cardHeader}>
                    <View style={styles.avatarCircle}>
                      <Text style={styles.avatarText}>{initial}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={styles.customerName}>{cust.name}</Text>
                        {cust.is_vip && (
                          <View style={styles.vipBadge}>
                            <Text style={styles.vipBadgeText}>⭐ VIP</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.customerPhone}>📞 {cust.phone}</Text>
                      {cust.address ? (
                        <Text style={styles.customerAddress} numberOfLines={1}>
                          📍 {cust.address}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  {/* Stats Bar */}
                  <View style={styles.customerStatsBar}>
                    <View style={styles.miniStat}>
                      <Text style={styles.miniStatLabel}>মোট অর্ডার</Text>
                      <Text style={styles.miniStatValue}>{cust.total_orders} টি</Text>
                    </View>
                    <View style={styles.miniStatDivider} />
                    <View style={styles.miniStat}>
                      <Text style={styles.miniStatLabel}>মোট কেনাকাটা</Text>
                      <Text style={[styles.miniStatValue, { color: '#6A1B9A' }]}>{money(cust.total_spending)}</Text>
                    </View>
                    <View style={styles.miniStatDivider} />
                    <View style={styles.miniStat}>
                      <Text style={styles.miniStatLabel}>সর্বশেষ অর্ডার</Text>
                      <Text style={styles.miniStatValue}>
                        {cust.last_order_date ? cust.last_order_date.slice(0, 10) : '—'}
                      </Text>
                    </View>
                  </View>

                  {/* Actions Row */}
                  <View style={styles.cardActionsRow}>
                    <Pressable
                      style={[styles.actionBtn, styles.callBtn]}
                      onPress={() => handleCall(cust.phone)}
                    >
                      <Text style={styles.callBtnText}>📞 কল করুন</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.actionBtn, styles.waBtn]}
                      onPress={() => handleWhatsApp(cust.phone)}
                    >
                      <Text style={styles.waBtnText}>💬 WhatsApp</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.actionBtn, styles.historyBtn]}
                      onPress={() => openCustomerHistory(cust)}
                    >
                      <Text style={styles.historyBtnText}>📜 হিস্ট্রি ({cust.total_orders})</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Customer Order History Modal */}
      <Modal
        visible={historyModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setHistoryModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>
                  {selectedCustomer?.name} — অর্ডার হিস্ট্রি
                </Text>
                <Text style={styles.modalSub}>
                  📞 {selectedCustomer?.phone} • মোট {customerOrders.length} টি অর্ডার
                </Text>
              </View>
              <Pressable style={styles.modalCloseBtn} onPress={() => setHistoryModalOpen(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 420 }}>
              {customerOrders.length === 0 ? (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Text style={{ color: '#888' }}>কোন অর্ডার হিস্ট্রি নেই</Text>
                </View>
              ) : (
                customerOrders.map((ord) => (
                  <Pressable
                    key={ord.id}
                    style={styles.historyOrderCard}
                    onPress={() => {
                      setHistoryModalOpen(false);
                      if (onSelectOrder) onSelectOrder(ord);
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={styles.historyOrderNumber}>#{ord.order_number}</Text>
                      <View style={styles.historyStatusBadge}>
                        <Text style={styles.historyStatusText}>{statusLabel(ord.status)}</Text>
                      </View>
                    </View>
                    <Text style={styles.historyDateText}>
                      তারিখ: {ord.created_at ? ord.created_at.slice(0, 16).replace('T', ' ') : '—'}
                    </Text>
                    {ord.items && ord.items.length > 0 && (
                      <Text style={styles.historyItemsSummary} numberOfLines={2}>
                        আইটেম: {ord.items.map((i) => `${i.product_name} (${i.quantity})`).join(', ')}
                      </Text>
                    )}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                      <Text style={styles.historyPaymentMethod}>
                        পেমেন্ট: {ord.payment_method?.toUpperCase() || 'COD'}
                      </Text>
                      <Text style={styles.historyOrderTotal}>{money(ord.total_amount)}</Text>
                    </View>
                  </Pressable>
                ))
              )}
            </ScrollView>

            <Pressable
              style={styles.closeFullBtn}
              onPress={() => setHistoryModalOpen(false)}
            >
              <Text style={styles.closeFullBtnText}>বন্ধ করুন</Text>
            </Pressable>
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
    borderBottomColor: '#EDE7F6',
    gap: 12,
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#F3E5F5',
  },
  backBtnText: {
    color: '#6A1B9A',
    fontWeight: '700',
    fontSize: 13,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#2E1065',
  },
  subtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
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
    fontSize: 17,
    fontWeight: '900',
    marginVertical: 4,
  },
  kpiSub: {
    fontSize: 9.5,
    color: '#777',
  },
  searchContainer: {
    position: 'relative',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  searchInput: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    color: '#1E293B',
  },
  clearSearchBtn: {
    position: 'absolute',
    right: 12,
    top: 10,
    padding: 4,
  },
  clearSearchText: {
    color: '#94A3B8',
    fontWeight: 'bold',
  },
  tabFilterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#EDE7F6',
  },
  filterChipActive: {
    backgroundColor: '#6A1B9A',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4A148C',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  listContainer: {
    gap: 12,
  },
  customerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 3 },
      android: { elevation: 2 },
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F3E5F5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CE93D8',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#6A1B9A',
  },
  customerName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B',
  },
  vipBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  vipBadgeText: {
    color: '#D97706',
    fontWeight: '800',
    fontSize: 10,
  },
  customerPhone: {
    fontSize: 12,
    color: '#4B5563',
    marginTop: 2,
    fontWeight: '600',
  },
  customerAddress: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  customerStatsBar: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 10,
    alignItems: 'center',
  },
  miniStat: {
    flex: 1,
    alignItems: 'center',
  },
  miniStatDivider: {
    width: 1,
    height: 22,
    backgroundColor: '#E2E8F0',
  },
  miniStatLabel: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '600',
  },
  miniStatValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 2,
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callBtn: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  callBtnText: {
    color: '#047857',
    fontWeight: '800',
    fontSize: 11.5,
  },
  waBtn: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  waBtnText: {
    color: '#16A34A',
    fontWeight: '800',
    fontSize: 11.5,
  },
  historyBtn: {
    backgroundColor: '#F3E5F5',
    borderWidth: 1,
    borderColor: '#E1BEE7',
  },
  historyBtnText: {
    color: '#6A1B9A',
    fontWeight: '800',
    fontSize: 11.5,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 10,
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
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#EDE7F6',
    paddingBottom: 12,
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1E293B',
  },
  modalSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 8,
  },
  modalCloseText: {
    fontSize: 18,
    color: '#94A3B8',
    fontWeight: 'bold',
  },
  historyOrderCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  historyOrderNumber: {
    fontSize: 13,
    fontWeight: '800',
    color: '#6A1B9A',
  },
  historyStatusBadge: {
    backgroundColor: '#EDE7F6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  historyStatusText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#6A1B9A',
  },
  historyDateText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
  },
  historyItemsSummary: {
    fontSize: 11.5,
    color: '#334155',
    marginTop: 3,
  },
  historyPaymentMethod: {
    fontSize: 11,
    color: '#64748B',
  },
  historyOrderTotal: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
  },
  closeFullBtn: {
    backgroundColor: '#6A1B9A',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  closeFullBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
});
