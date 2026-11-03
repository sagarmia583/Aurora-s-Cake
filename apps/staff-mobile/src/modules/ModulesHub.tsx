import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
} from 'react-native';
import { StaffOrder, Tab, StaffSession, money } from '../domain';

interface ModulesHubProps {
  orders: StaffOrder[];
  session: StaffSession;
  onNavigate: (tab: Tab) => void;
  onBack?: () => void;
  onHome?: () => void;
  lowStockCount?: number;
  cashDrawerBalance?: number;
  customCakesCount?: number;
}

interface HubItem {
  id: Tab;
  title: string;
  subtitle: string;
  emoji: string;
  color: string;
  badge?: string | number;
  badgeColor?: string;
  allowedRoles?: string[];
}

export const ModulesHub: React.FC<ModulesHubProps> = ({
  orders,
  session,
  onNavigate,
  onBack,
  onHome,
  lowStockCount = 2,
  cashDrawerBalance = 14500,
  customCakesCount = 0,
}) => {
  const pendingOrders = orders.filter((o) => o.status === 'pending').length;
  const kitchenOrders = orders.filter((o) => ['confirmed', 'preparing'].includes(o.status)).length;
  const readyOrders = orders.filter((o) => o.status === 'ready').length;
  const deliveryOrders = orders.filter((o) =>
    ['assigned', 'picked_up', 'out_for_delivery'].includes(o.status)
  ).length;

  const modules: HubItem[] = [
    {
      id: 'overview',
      title: 'ড্যাশবোর্ড',
      subtitle: 'আজকের বিক্রয় ও সারাংশ',
      emoji: '📊',
      color: '#6A1B9A',
    },
    {
      id: 'orders',
      title: 'অর্ডার তালিকা',
      subtitle: 'অর্ডার প্রসেসিং ও ট্র্যাকিং',
      emoji: '🛒',
      color: '#0284C7',
      badge: pendingOrders > 0 ? `${pendingOrders} নতুন` : orders.length,
      badgeColor: pendingOrders > 0 ? '#DC2626' : '#0284C7',
    },
    {
      id: 'pos',
      title: 'POS কাউন্টার সেল',
      subtitle: 'দোকানে সরাসরি বিক্রয় ও রসিদ',
      emoji: '🛍️',
      color: '#059669',
    },
    {
      id: 'kitchen',
      title: 'কিচেন ও বেকিং',
      subtitle: 'বেকিং কিউ, ব্যাচ ও রেসিপি',
      emoji: '👨‍🍳',
      color: '#D97706',
      badge: kitchenOrders > 0 ? `${kitchenOrders} বেকিং` : undefined,
      badgeColor: '#D97706',
    },
    {
      id: 'inventory',
      title: 'কাঁচামাল ইনভেন্টরি',
      subtitle: 'ময়দা, চিনি, ক্রিম ও প্যাকেজিং',
      emoji: '📦',
      color: '#7C3AED',
      badge: lowStockCount > 0 ? `${lowStockCount} লো স্টক` : undefined,
      badgeColor: '#DC2626',
    },
    {
      id: 'purchases',
      title: 'ক্রয় ও সাপ্লায়ার',
      subtitle: 'ভাউচার এন্ট্রি ও সাপ্লায়ার বাকি',
      emoji: '🧾',
      color: '#2563EB',
    },
    {
      id: 'cash',
      title: 'ডেলিভারি ও ক্যাশ',
      subtitle: 'রাইডার COD ও ক্যাশ ডিপোজিট',
      emoji: '🛵',
      color: '#EA580C',
      badge: deliveryOrders > 0 ? `${deliveryOrders} চলমান` : undefined,
      badgeColor: '#EA580C',
    },
    {
      id: 'finance',
      title: 'অর্থ ও অ্যাকাউন্টস',
      subtitle: 'ক্যাশ ড্রয়ার, খরচ ও P&L লাভ',
      emoji: '💰',
      color: '#10B981',
      badge: money(cashDrawerBalance),
      badgeColor: '#10B981',
    },
    {
      id: 'customers',
      title: 'কাস্টমার সিআরএম',
      subtitle: 'গ্রাহক তথ্য, VIP ও হিস্ট্রি',
      emoji: '👥',
      color: '#8B5CF6',
    },
    {
      id: 'products',
      title: 'কেক ক্যাটালগ ও স্টক',
      subtitle: 'কেকের দাম, ওজন ও ইন-স্টক',
      emoji: '🎂',
      color: '#DB2777',
    },
    {
      id: 'offers',
      title: 'অফার ও কুপন',
      subtitle: 'প্রমো কোড ও ডিসকাউন্ট',
      emoji: '🏷️',
      color: '#E11D48',
    },
    {
      id: 'custom_cakes',
      title: 'কাস্টম কেক রিকোয়েস্ট',
      subtitle: 'ডিজাইন, কোটেশন ও কাস্টমার নোট',
      emoji: '✨',
      color: '#9333EA',
      badge: customCakesCount > 0 ? `${customCakesCount} রিকোয়েস্ট` : undefined,
      badgeColor: '#9333EA',
    },
    {
      id: 'staff',
      title: 'টিম ও স্টাফ পারমিশন',
      subtitle: 'স্টাফ তালিকা, রোল ও পাসওয়ার্ড',
      emoji: '👔',
      color: '#475569',
    },
    {
      id: 'reports',
      title: 'রিপোর্ট ও অ্যানালিটিক্স',
      subtitle: 'বিক্রয় বিবরণী ও সেরা কেক',
      emoji: '📈',
      color: '#311B92',
    },
    {
      id: 'account',
      title: 'অ্যাপ সেটিংস ও সাউন্ড',
      subtitle: 'অর্ডার অ্যালার্ট সাউন্ড ও একাউন্ট',
      emoji: '⚙️',
      color: '#64748B',
    },
  ];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Top Navigation Row */}
      {(onBack || onHome) && (
        <View style={styles.navRow}>
          {onBack ? (
            <Pressable onPress={onBack} style={styles.navBtn}>
              <Text style={styles.navBtnText}>‹ ফিরে যান (Back)</Text>
            </Pressable>
          ) : <View />}
          {onHome ? (
            <Pressable onPress={onHome} style={[styles.navBtn, styles.navHomeBtn]}>
              <Text style={[styles.navBtnText, styles.navHomeBtnText]}>🏠 হোম (Home)</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      {/* Header Banner */}
      <View style={styles.banner}>
        <Text style={styles.bannerEmoji}>🧁</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>Aurora’s Cake Manager</Text>
          <Text style={styles.bannerSubtitle}>
            সম্পূর্ণ বেকারি ম্যানেজমেন্ট সিস্টেম (BMS) • {session.name} ({session.role})
          </Text>
        </View>
      </View>

      {/* Modules Grid */}
      <Text style={styles.sectionHeader}>⚡ সকল এন্টারপ্রাইজ মডিউল ({modules.length} টি)</Text>
      <View style={styles.grid}>
        {modules.map((item) => (
          <Pressable
            key={item.id}
            style={({ pressed }) => [
              styles.card,
              pressed && styles.cardPressed,
            ]}
            onPress={() => onNavigate(item.id)}
          >
            <View style={styles.cardTop}>
              <View style={[styles.iconBox, { backgroundColor: item.color + '15' }]}>
                <Text style={styles.iconEmoji}>{item.emoji}</Text>
              </View>
              {item.badge !== undefined && (
                <View style={[styles.badge, { backgroundColor: item.badgeColor || item.color }]}>
                  <Text style={styles.badgeText}>{item.badge}</Text>
                </View>
              )}
            </View>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardSubtitle} numberOfLines={2}>
              {item.subtitle}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 120,
    backgroundColor: '#F8FAFC',
    gap: 14,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: -4,
  },
  navBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
      android: { elevation: 1 },
    }),
  },
  navBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#1E293B',
  },
  navHomeBtn: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  navHomeBtnText: {
    color: '#065F46',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: '#EDE7F6',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 3 },
      android: { elevation: 2 },
    }),
  },
  bannerEmoji: {
    fontSize: 32,
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#2E1065',
  },
  bannerSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '800',
    color: '#334155',
    marginTop: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'space-between',
    minHeight: 115,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2 },
      android: { elevation: 1 },
    }),
  },
  cardPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: {
    fontSize: 20,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    maxWidth: '55%',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '800',
    textAlign: 'center',
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
  },
  cardSubtitle: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 14,
  },
});
