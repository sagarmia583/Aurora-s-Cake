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
import type { StaffOrder } from '../domain';
import { INITIAL_CASH_ACCOUNTS, type CashAccountItem } from '../bmsData';

interface FinanceModuleProps {
  orders: StaffOrder[];
  onClose?: () => void;
  staffName?: string;
}

interface ExpenseEntry {
  id: string;
  category: string;
  description: string;
  amount: number;
  paid_from: string;
  date: string;
  recorded_by: string;
}

const EXPENSES_KEY = 'aurora_bms_expenses_v1';
const ACCOUNTS_KEY = 'aurora_bms_cash_accounts_v1';

export const FinanceModule: React.FC<FinanceModuleProps> = ({
  orders,
  onClose,
  staffName = 'Admin',
}) => {
  const [accounts, setAccounts] = useState<CashAccountItem[]>(INITIAL_CASH_ACCOUNTS);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([
    {
      id: 'exp-1',
      category: 'কাঁচামাল ক্রয়',
      description: 'ফ্রেশ মিলস ময়দা ক্রয়',
      amount: 4000,
      paid_from: 'কাউন্টার ক্যাশ ড্রয়ার (Bakery Cash)',
      date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
      recorded_by: 'Admin',
    },
    {
      id: 'exp-2',
      category: 'দোকান ভাড়া ও বিল',
      description: 'বেকারি শপ ইলেকট্রিসিটি ও গ্যাস বিল',
      amount: 2500,
      paid_from: 'DBBL ব্যাংক অ্যাকাউন্ট',
      date: new Date(Date.now() - 172800000).toISOString().slice(0, 10),
      recorded_by: 'Admin',
    },
  ]);

  const [activeTab, setActiveTab] = useState<'overview' | 'accounts' | 'expenses' | 'pl'>('overview');
  const [addExpenseModalOpen, setAddExpenseModalOpen] = useState(false);
  const [expenseCat, setExpenseCat] = useState('কাঁচামাল ক্রয়');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [paidFromAccountId, setPaidFromAccountId] = useState(INITIAL_CASH_ACCOUNTS[0]?.id || '');

  // Load from SecureStore
  useEffect(() => {
    SecureStore.getItemAsync(EXPENSES_KEY).then(raw => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) setExpenses(parsed);
        } catch {}
      }
    }).catch(() => {});

    SecureStore.getItemAsync(ACCOUNTS_KEY).then(raw => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) setAccounts(parsed);
        } catch {}
      }
    }).catch(() => {});
  }, []);

  // Compute total sales revenue from completed orders
  const totalRevenue = useMemo(() => {
    return orders
      .filter(o => o.status !== 'cancelled')
      .reduce((sum, o) => sum + (o.total_amount || 0), 0);
  }, [orders]);

  const totalExpenseAmount = useMemo(() => {
    return expenses.reduce((sum, e) => sum + e.amount, 0);
  }, [expenses]);

  const netProfit = totalRevenue - totalExpenseAmount;

  const totalLiquidity = useMemo(() => {
    return accounts.reduce((sum, a) => sum + a.current_balance, 0);
  }, [accounts]);

  const handleAddExpense = async () => {
    const amt = Number(expenseAmount.replace(/[^\d.]/g, '') || 0);
    if (amt <= 0) {
      Alert.alert('অবৈধ অঙ্ক', 'অনুগ্রহ করে খরচের সঠিক টাকার পরিমাণ লিখুন।');
      return;
    }

    const acc = accounts.find(a => a.id === paidFromAccountId) || accounts[0];
    const newEntry: ExpenseEntry = {
      id: `exp-${Date.now()}`,
      category: expenseCat,
      description: expenseDesc.trim() || expenseCat,
      amount: amt,
      paid_from: acc.account_name,
      date: new Date().toISOString().slice(0, 10),
      recorded_by: staffName,
    };

    // Deduct from account balance
    const updatedAccounts = accounts.map(a => {
      if (a.id === acc.id) {
        return { ...a, current_balance: Math.max(0, a.current_balance - amt) };
      }
      return a;
    });

    const updatedExpenses = [newEntry, ...expenses];

    setExpenses(updatedExpenses);
    setAccounts(updatedAccounts);
    setAddExpenseModalOpen(false);
    setExpenseAmount('');
    setExpenseDesc('');

    await SecureStore.setItemAsync(EXPENSES_KEY, JSON.stringify(updatedExpenses)).catch(() => {});
    await SecureStore.setItemAsync(ACCOUNTS_KEY, JSON.stringify(updatedAccounts)).catch(() => {});

    Alert.alert('খরচ এন্ট্রি সংরক্ষিত', `${money(amt)} টাকার খরচ রেকর্ড করা হয়েছে।`);
  };

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>💵 ফাইন্যান্স ও একাউন্টিং (Finance)</Text>
          <Text style={s.subtitle}>ক্যাশ ড্রয়ার, ব্যাংক ও বিকাশ ব্যালেন্স, খরচ লেজার ও লাভ-ক্ষতি</Text>
        </View>
        {onClose ? (
          <Pressable onPress={onClose} style={s.closeBtn}>
            <Text style={{ fontSize: 18, color: '#64748B', fontWeight: '800' }}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Tabs */}
      <View style={s.tabBar}>
        <Pressable onPress={() => setActiveTab('overview')} style={[s.tabBtn, activeTab === 'overview' && s.tabBtnActive]}>
          <Text style={[s.tabText, activeTab === 'overview' && s.tabTextActive]}>ব্যালেন্স</Text>
        </Pressable>
        <Pressable onPress={() => setActiveTab('pl')} style={[s.tabBtn, activeTab === 'pl' && s.tabBtnActive]}>
          <Text style={[s.tabText, activeTab === 'pl' && s.tabTextActive]}>লাভ-ক্ষতি (P&L)</Text>
        </Pressable>
        <Pressable onPress={() => setActiveTab('expenses')} style={[s.tabBtn, activeTab === 'expenses' && s.tabBtnActive]}>
          <Text style={[s.tabText, activeTab === 'expenses' && s.tabTextActive]}>খরচ ({expenses.length})</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }}>
        {activeTab === 'overview' ? (
          <>
            {/* Total Liquidity Banner */}
            <View style={s.heroCard}>
              <Text style={{ fontSize: 12, color: '#065F46', fontWeight: '800', textTransform: 'uppercase' }}>
                মোট ক্যাশ ও ব্যাংক ব্যালেন্স (Total Liquidity)
              </Text>
              <Text style={{ fontSize: 32, fontWeight: '900', color: '#064E3B', marginTop: 4 }}>
                {money(totalLiquidity)}
              </Text>
              <Text style={{ fontSize: 12, color: '#047857', marginTop: 4 }}>
                কাউন্টার ড্রয়ার, ব্যাংক, বিকাশ ও নগদ মিলে তাৎক্ষণিক নগদ অর্থ
              </Text>
            </View>

            {/* Account balances grid */}
            <Text style={{ fontSize: 14, fontWeight: '900', color: '#0F172A', marginTop: 4 }}>
              🏦 পেমেন্ট চ্যানেল ও ড্রয়ার ব্যালেন্স:
            </Text>

            {accounts.map(acc => (
              <View key={acc.id} style={s.card}>
                <View style={s.inlineBetween}>
                  <View>
                    <Text style={{ fontSize: 15, fontWeight: '900', color: '#0F172A' }}>{acc.account_name}</Text>
                    {acc.account_number ? (
                      <Text style={{ fontSize: 12, color: '#64748B' }}>অ্যাকাউন্ট নং: {acc.account_number}</Text>
                    ) : null}
                  </View>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: '#1D5845' }}>
                    {money(acc.current_balance)}
                  </Text>
                </View>
              </View>
            ))}

            <Pressable onPress={() => setAddExpenseModalOpen(true)} style={s.expenseBtn}>
              <Text style={s.expenseBtnText}>- নতুন ক্যাশ খরচ এন্ট্রি (Expense Voucher)</Text>
            </Pressable>
          </>
        ) : activeTab === 'pl' ? (
          /* Profit & Loss Statement */
          <>
            <View style={s.plCard}>
              <Text style={{ fontSize: 16, fontWeight: '900', color: '#0F172A' }}>📊 লাভ-ক্ষতি বিবরণী (Income Statement)</Text>
              <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                মোট বিক্রয় রাজস্ব থেকে খরচ বাদ দিয়ে আনুমানিক নিট মুনাফা:
              </Text>

              <View style={{ marginTop: 14, gap: 10 }}>
                <View style={s.inlineBetween}>
                  <Text style={{ fontSize: 14, color: '#334155', fontWeight: '700' }}>১. মোট অর্ডারের বিক্রয় (Revenue):</Text>
                  <Text style={{ fontSize: 16, color: '#16A34A', fontWeight: '900' }}>+ {money(totalRevenue)}</Text>
                </View>

                <View style={s.inlineBetween}>
                  <Text style={{ fontSize: 14, color: '#334155', fontWeight: '700' }}>২. মোট খরচ (Total Expenses):</Text>
                  <Text style={{ fontSize: 16, color: '#DC2626', fontWeight: '900' }}>- {money(totalExpenseAmount)}</Text>
                </View>

                <View style={[s.inlineBetween, { borderTopWidth: 2, borderColor: '#E2E8F0', paddingTop: 10, marginTop: 4 }]}>
                  <Text style={{ fontSize: 16, fontWeight: '900', color: '#0F172A' }}>আনুমানিক নিট লাভ (Net Profit):</Text>
                  <Text style={{ fontSize: 22, fontWeight: '900', color: netProfit >= 0 ? '#1D5845' : '#DC2626' }}>
                    {money(netProfit)}
                  </Text>
                </View>
              </View>

              <View style={s.tipBox}>
                <Text style={{ fontSize: 12, color: '#92400E', fontWeight: '700' }}>
                  💡 হিসাব সহায়িকা: কাঁচামাল কেনাকাটা, দোকান ভাড়া ও ডেলিভারি খরচের সব ভাউচার অন্তর্ভুক্ত রয়েছে।
                </Text>
              </View>
            </View>
          </>
        ) : (
          /* Expenses Ledger */
          <>
            <View style={s.inlineBetween}>
              <Text style={{ fontSize: 15, fontWeight: '900', color: '#0F172A' }}>📜 ব্যয়ের তালিকা ও ভাউচার</Text>
              <Pressable onPress={() => setAddExpenseModalOpen(true)} style={s.smallAddBtn}>
                <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 12 }}>+ খরচ এন্ট্রি</Text>
              </Pressable>
            </View>

            {expenses.map(e => (
              <View key={e.id} style={s.card}>
                <View style={s.inlineBetween}>
                  <View>
                    <Text style={{ fontSize: 15, fontWeight: '900', color: '#0F172A' }}>{e.category}</Text>
                    <Text style={{ fontSize: 13, color: '#334155', marginTop: 2 }}>{e.description}</Text>
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '900', color: '#DC2626' }}>
                    - {money(e.amount)}
                  </Text>
                </View>
                <View style={[s.inlineBetween, { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderColor: '#F1F5F9' }]}>
                  <Text style={{ fontSize: 11, color: '#64748B' }}>উৎস: {e.paid_from}</Text>
                  <Text style={{ fontSize: 11, color: '#64748B' }}>তারিখ: {e.date} • {e.recorded_by}</Text>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* Add Expense Modal */}
      {addExpenseModalOpen ? (
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.inlineBetween}>
              <Text style={{ fontSize: 17, fontWeight: '900', color: '#0F172A' }}>- নতুন ক্যাশ খরচ ভাউচার</Text>
              <Pressable onPress={() => setAddExpenseModalOpen(false)}>
                <Text style={{ fontSize: 18, color: '#64748B', fontWeight: '800' }}>✕</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ gap: 8, paddingVertical: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#334155' }}>খরচের খাত (Category):</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {['কাঁচামাল ক্রয়', 'দোকান ভাড়া ও বিল', 'কর্মচারী বেতন', 'প্যাকেজিং সামগ্রী', 'মার্কেটিং', 'অন্যান্য খরচ'].map(c => (
                  <Pressable
                    key={c}
                    onPress={() => setExpenseCat(c)}
                    style={[s.choicePill, expenseCat === c && s.choicePillActive]}
                  >
                    <Text style={[s.choicePillText, expenseCat === c && s.choicePillTextActive]}>{c}</Text>
                  </Pressable>
                ))}
              </View>

              <TextInput
                style={s.input}
                value={expenseDesc}
                onChangeText={setExpenseDesc}
                placeholder="খরচের বিস্তারিত বিবরণ"
                placeholderTextColor="#94A3B8"
              />

              <TextInput
                style={s.input}
                value={expenseAmount}
                onChangeText={setExpenseAmount}
                placeholder="টাকার পরিমাণ (৳)"
                keyboardType="numeric"
                placeholderTextColor="#94A3B8"
              />

              <Text style={{ fontSize: 12, fontWeight: '800', color: '#334155', marginTop: 4 }}>কোন অ্যাকাউন্ট থেকে দেওয়া হয়েছে:</Text>
              <View style={{ gap: 4 }}>
                {accounts.map(acc => (
                  <Pressable
                    key={acc.id}
                    onPress={() => setPaidFromAccountId(acc.id)}
                    style={[s.choicePill, paidFromAccountId === acc.id && s.choicePillActive]}
                  >
                    <Text style={[s.choicePillText, paidFromAccountId === acc.id && s.choicePillTextActive]}>
                      {acc.account_name} ({money(acc.current_balance)})
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Pressable onPress={handleAddExpense} style={s.saveBtn}>
                <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 14 }}>✓ খরচ সংরক্ষণ করুন</Text>
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
  heroCard: { backgroundColor: '#ECFDF5', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#A7F3D0' },
  tabBar: { flexDirection: 'row', backgroundColor: '#FFF', paddingHorizontal: 12, borderBottomWidth: 1, borderColor: '#E2E8F0' },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderColor: 'transparent' },
  tabBtnActive: { borderColor: '#1D5845' },
  tabText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  tabTextActive: { color: '#1D5845', fontWeight: '900' },
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  inlineBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  expenseBtn: { backgroundColor: '#DC2626', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  expenseBtnText: { color: '#FFF', fontWeight: '900', fontSize: 13 },
  smallAddBtn: { backgroundColor: '#DC2626', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  plCard: { backgroundColor: '#FFF', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  tipBox: { backgroundColor: '#FFFBEB', padding: 10, borderRadius: 8, marginTop: 14 },
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  modalSheet: { backgroundColor: '#FFF', borderRadius: 16, padding: 18, maxHeight: '90%' },
  choicePill: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#F8FAFC', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  choicePillActive: { backgroundColor: '#1D5845', borderColor: '#1D5845' },
  choicePillText: { fontSize: 12, color: '#334155', fontWeight: '700' },
  choicePillTextActive: { color: '#FFF', fontWeight: '800' },
  input: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: '#0F172A', marginTop: 6 },
  saveBtn: { backgroundColor: '#DC2626', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 12 },
});
