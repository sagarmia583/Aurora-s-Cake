import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Share,
  Platform,
} from 'react-native';
import { StaffOrder, money } from '../domain';

interface ReportsModuleProps {
  orders: StaffOrder[];
  onBack?: () => void;
}

type Period = 'today' | '7days' | 'month' | 'all';

export const ReportsModule: React.FC<ReportsModuleProps> = ({ orders, onBack }) => {
  const [period, setPeriod] = useState<Period>('today');

  // Filter orders by period
  const periodOrders = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    return orders.filter((o) => {
      const orderDate = o.created_at ? o.created_at.slice(0, 10) : '';
      if (period === 'today') {
        return orderDate === todayStr;
      }
      if (period === '7days') {
        const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        return orderDate >= past7;
      }
      if (period === 'month') {
        const thisMonth = todayStr.slice(0, 7);
        return orderDate.startsWith(thisMonth);
      }
      return true; // 'all'
    });
  }, [orders, period]);

  const validOrders = useMemo(
    () => periodOrders.filter((o) => o.status !== 'cancelled'),
    [periodOrders]
  );
  const cancelledOrders = useMemo(
    () => periodOrders.filter((o) => o.status === 'cancelled'),
    [periodOrders]
  );

  const totalSales = useMemo(
    () => validOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0),
    [validOrders]
  );
  const totalCount = validOrders.length;
  const avgOrderValue = totalCount > 0 ? Math.round(totalSales / totalCount) : 0;
  const cancelRate = periodOrders.length > 0
    ? Math.round((cancelledOrders.length / periodOrders.length) * 100)
    : 0;

  // Best selling items ranking
  const bestSellers = useMemo(() => {
    const itemMap = new Map<string, { name: string; count: number; revenue: number }>();
    validOrders.forEach((o) => {
      o.items?.forEach((i) => {
        const name = i.product_name || 'কেক';
        const existing = itemMap.get(name);
        if (existing) {
          existing.count += i.quantity || 1;
          existing.revenue += i.subtotal || 0;
        } else {
          itemMap.set(name, {
            name,
            count: i.quantity || 1,
            revenue: i.subtotal || 0,
          });
        }
      });
    });
    return Array.from(itemMap.values()).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [validOrders]);

  // Payment Breakdown
  const paymentBreakdown = useMemo(() => {
    let cod = 0;
    let bkash = 0;
    let nagad = 0;
    let bank = 0;

    validOrders.forEach((o) => {
      const pm = (o.payment_method || '').toLowerCase();
      const amt = o.total_amount || 0;
      if (pm === 'cod') cod += amt;
      else if (pm.includes('bkash')) bkash += amt;
      else if (pm.includes('nagad')) nagad += amt;
      else bank += amt;
    });

    return { cod, bkash, nagad, bank, total: cod + bkash + nagad + bank };
  }, [validOrders]);

  const handleShareReport = async () => {
    const periodLabel =
      period === 'today'
        ? 'আজকের'
        : period === '7days'
        ? 'গত ৭ দিনের'
        : period === 'month'
        ? 'চলতি মাসের'
        : 'সর্বমোট';

    let msg = `📊 *Aurora's Cake — বিক্রয় ও অ্যানালিটিক্স রিপোর্ট*\n`;
    msg += `সময়কাল: ${periodLabel} (${new Date().toLocaleDateString('bn-BD')})\n\n`;
    msg += `💰 মোট বিক্রয়: ${money(totalSales)}\n`;
    msg += `📦 সফল অর্ডার: ${totalCount} টি\n`;
    msg += `🛒 গড় অর্ডার সাইজ: ${money(avgOrderValue)}\n`;
    msg += `❌ বাতিল অর্ডার: ${cancelledOrders.length} টি (${cancelRate}%)\n\n`;

    msg += `💳 *পেমেন্ট চ্যানেল সমাহার:*\n`;
    msg += `• ক্যাশ অন ডেলিভারি (COD): ${money(paymentBreakdown.cod)}\n`;
    msg += `• বিকাশ (bKash): ${money(paymentBreakdown.bkash)}\n`;
    msg += `• নগদ (Nagad): ${money(paymentBreakdown.nagad)}\n`;
    msg += `• ব্যাংক / কার্ড: ${money(paymentBreakdown.bank)}\n\n`;

    if (bestSellers.length > 0) {
      msg += `🏆 *শীর্ষ ৫ বিক্রিত কেক:*\n`;
      bestSellers.forEach((item, idx) => {
        msg += `${idx + 1}. ${item.name} — ${item.count} টি (${money(item.revenue)})\n`;
      });
      msg += `\n`;
    }

    msg += `রিপোর্ট প্রস্তুতকারক: Aurora's Cake Business Manager`;

    try {
      await Share.share({ message: msg });
    } catch {
      // Ignore
    }
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
          <Text style={styles.title}>📊 রিপোর্ট ও অ্যানালিটিক্স</Text>
          <Text style={styles.subtitle}>বিক্রয় বিবরণী, সেরা কেক ও পেমেন্ট হিসেব</Text>
        </View>
        <Pressable style={styles.shareHeaderBtn} onPress={() => void handleShareReport()}>
          <Text style={styles.shareHeaderText}>📤 শেয়ার</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Period Selector */}
        <View style={styles.periodRow}>
          {(
            [
              { key: 'today', label: 'আজকে' },
              { key: '7days', label: '৭ দিন' },
              { key: 'month', label: 'চলতি মাস' },
              { key: 'all', label: 'সব সময়' },
            ] as const
          ).map((item) => (
            <Pressable
              key={item.key}
              style={[styles.periodBtn, period === item.key && styles.periodBtnActive]}
              onPress={() => setPeriod(item.key)}
            >
              <Text
                style={[
                  styles.periodBtnText,
                  period === item.key && styles.periodBtnTextActive,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Main Stats Summary */}
        <View style={styles.statsCard}>
          <Text style={styles.statsCardTitle}>মোট রাজস্ব ও বিক্রয়</Text>
          <Text style={styles.bigRevenueText}>{money(totalSales)}</Text>
          <View style={styles.statsCardGrid}>
            <View style={styles.statsCardCol}>
              <Text style={styles.colLabel}>সফল অর্ডার</Text>
              <Text style={styles.colValue}>{totalCount} টি</Text>
            </View>
            <View style={styles.statsDivider} />
            <View style={styles.statsCardCol}>
              <Text style={styles.colLabel}>গড় টিকিট সাইজ</Text>
              <Text style={styles.colValue}>{money(avgOrderValue)}</Text>
            </View>
            <View style={styles.statsDivider} />
            <View style={styles.statsCardCol}>
              <Text style={styles.colLabel}>বাতিল রেট</Text>
              <Text style={[styles.colValue, { color: cancelRate > 10 ? '#DC2626' : '#16A34A' }]}>
                {cancelRate}% ({cancelledOrders.length})
              </Text>
            </View>
          </View>
        </View>

        {/* Payment Methods Breakdown */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionCardTitle}>💳 পেমেন্ট চ্যানেল বিবরণী</Text>
          <View style={styles.paymentList}>
            <View style={styles.paymentItem}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 16 }}>💵</Text>
                <Text style={styles.paymentName}>ক্যাশ অন ডেলিভারি (COD)</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.paymentAmount}>{money(paymentBreakdown.cod)}</Text>
                <Text style={styles.paymentPct}>
                  {paymentBreakdown.total > 0
                    ? Math.round((paymentBreakdown.cod / paymentBreakdown.total) * 100)
                    : 0}
                  %
                </Text>
              </View>
            </View>

            <View style={styles.paymentItem}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 16 }}>📱</Text>
                <Text style={styles.paymentName}>বিকাশ (bKash)</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.paymentAmount}>{money(paymentBreakdown.bkash)}</Text>
                <Text style={styles.paymentPct}>
                  {paymentBreakdown.total > 0
                    ? Math.round((paymentBreakdown.bkash / paymentBreakdown.total) * 100)
                    : 0}
                  %
                </Text>
              </View>
            </View>

            <View style={styles.paymentItem}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 16 }}>🟠</Text>
                <Text style={styles.paymentName}>নগদ (Nagad)</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.paymentAmount}>{money(paymentBreakdown.nagad)}</Text>
                <Text style={styles.paymentPct}>
                  {paymentBreakdown.total > 0
                    ? Math.round((paymentBreakdown.nagad / paymentBreakdown.total) * 100)
                    : 0}
                  %
                </Text>
              </View>
            </View>

            <View style={styles.paymentItem}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 16 }}>🏦</Text>
                <Text style={styles.paymentName}>ব্যাংক ট্রান্সফার / কার্ড</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.paymentAmount}>{money(paymentBreakdown.bank)}</Text>
                <Text style={styles.paymentPct}>
                  {paymentBreakdown.total > 0
                    ? Math.round((paymentBreakdown.bank / paymentBreakdown.total) * 100)
                    : 0}
                  %
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Top 5 Best Selling Cakes */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionCardTitle}>🏆 সেরা বিক্রিত কেক (Top 5 Best Sellers)</Text>
          {bestSellers.length === 0 ? (
            <View style={{ paddingVertical: 20, alignItems: 'center' }}>
              <Text style={{ color: '#888', fontSize: 13 }}>এই সময়কালে কোন কেক বিক্রির রেকর্ড নেই</Text>
            </View>
          ) : (
            <View style={{ gap: 8, marginTop: 8 }}>
              {bestSellers.map((item, idx) => (
                <View key={item.name} style={styles.bestSellerItem}>
                  <View style={styles.rankCircle}>
                    <Text style={styles.rankText}>#{idx + 1}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.bestSellerName}>{item.name}</Text>
                    <Text style={styles.bestSellerQty}>বিক্রি: {item.count} টি</Text>
                  </View>
                  <Text style={styles.bestSellerRevenue}>{money(item.revenue)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Share Button Full Card */}
        <Pressable
          style={styles.fullShareBtn}
          onPress={() => void handleShareReport()}
        >
          <Text style={styles.fullShareBtnText}>📤 এই রিপোর্টটি শেয়ার করুন (WhatsApp / Print)</Text>
        </Pressable>
      </ScrollView>
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
    gap: 10,
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#EDE7F6',
  },
  backBtnText: {
    color: '#6A1B9A',
    fontWeight: '700',
    fontSize: 13,
  },
  title: {
    fontSize: 17,
    fontWeight: '900',
    color: '#311B92',
  },
  subtitle: {
    fontSize: 11.5,
    color: '#666',
    marginTop: 2,
  },
  shareHeaderBtn: {
    backgroundColor: '#311B92',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  shareHeaderText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 120,
    gap: 14,
  },
  periodRow: {
    flexDirection: 'row',
    backgroundColor: '#EDE7F6',
    borderRadius: 10,
    padding: 3,
  },
  periodBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 8,
  },
  periodBtnActive: {
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
      android: { elevation: 1 },
    }),
  },
  periodBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5E35B1',
  },
  periodBtnTextActive: {
    color: '#311B92',
    fontWeight: '900',
  },
  statsCard: {
    backgroundColor: '#311B92',
    borderRadius: 16,
    padding: 16,
    ...Platform.select({
      ios: { shadowColor: '#311B92', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 6 },
      android: { elevation: 4 },
    }),
  },
  statsCardTitle: {
    fontSize: 12,
    color: '#D1C4E9',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bigRevenueText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    marginVertical: 6,
  },
  statsCardGrid: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 6,
  },
  statsCardCol: {
    flex: 1,
    alignItems: 'center',
  },
  statsDivider: {
    width: 1,
    height: '80%',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  colLabel: {
    fontSize: 10.5,
    color: '#D1C4E9',
    fontWeight: '600',
  },
  colValue: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  sectionCard: {
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
  sectionCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 8,
  },
  paymentList: {
    gap: 8,
  },
  paymentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  paymentName: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155',
  },
  paymentAmount: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  paymentPct: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
  },
  bestSellerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  rankCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  rankText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#B45309',
  },
  bestSellerName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  bestSellerQty: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  bestSellerRevenue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#311B92',
  },
  fullShareBtn: {
    backgroundColor: '#311B92',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  fullShareBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
});
