import React, { useState, useMemo } from 'react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Search,
  Calendar,
  Wallet,
  Building2,
  Smartphone,
  CheckCircle,
  AlertCircle,
  FileText,
  RotateCw,
} from 'lucide-react';
import type { CashAccount, Expense, FinanceLedgerEntry, Order, ApprovalRequest } from '../../types';

interface FinanceModuleProps {
  orders: Order[];
  currency: string;
  staffName: string;
  role: string;
}

const DEFAULT_ACCOUNTS: CashAccount[] = [
  { id: 'acc-cash', name: 'কাউন্টার ক্যাশ (Shop Cash Counter)', account_type: 'cash', balance: 34500, is_active: true, created_at: new Date().toISOString() },
  { id: 'acc-bkash', name: 'বিকাশ মার্চেন্ট (bKash 017xxxxxxxx)', account_type: 'bkash', balance: 48200, is_active: true, created_at: new Date().toISOString() },
  { id: 'acc-nagad', name: 'নগদ মার্চেন্ট (Nagad 018xxxxxxxx)', account_type: 'nagad', balance: 15600, is_active: true, created_at: new Date().toISOString() },
  { id: 'acc-bank', name: 'ডাচ-বাংলা ব্যাংক (DBBL Current A/C)', account_type: 'bank', balance: 125000, is_active: true, created_at: new Date().toISOString() },
];

const DEFAULT_EXPENSES: Expense[] = [
  { id: 'exp-1', category: 'ingredients', description: '৫০ কেজি ময়দা ও চিনি ক্রয়', amount: 7500, account_id: 'acc-cash', account_name: 'কাউন্টার ক্যাশ', expense_date: '2026-10-29', status: 'approved', created_by: 'Admin', created_at: '2026-10-29T10:00:00Z' },
  { id: 'exp-2', category: 'packaging', description: 'কেক বক্স ও শপিং ব্যাগ', amount: 4200, account_id: 'acc-bkash', account_name: 'বিকাশ মার্চেন্ট', expense_date: '2026-10-30', status: 'approved', created_by: 'Admin', created_at: '2026-10-30T14:00:00Z' },
  { id: 'exp-3', category: 'utilities', description: 'দোকানের বিদ্যুৎ বিল পরিশোধ', amount: 3800, account_id: 'acc-bank', account_name: 'ডাচ-বাংলা ব্যাংক', expense_date: '2026-10-31', status: 'pending', created_by: 'Accountant', created_at: '2026-10-31T11:00:00Z' },
];

export const FinanceModule: React.FC<FinanceModuleProps> = ({
  orders,
  currency,
  staffName,
  role,
}) => {
  const [activeTab, setActiveTab] = useState<'accounts' | 'expenses' | 'statement' | 'approvals'>('accounts');
  const [accounts, setAccounts] = useState<CashAccount[]>(DEFAULT_ACCOUNTS);
  const [expenses, setExpenses] = useState<Expense[]>(DEFAULT_EXPENSES);
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);

  // New expense state
  const [expCategory, setExpCategory] = useState('ingredients');
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expAccount, setExpAccount] = useState('acc-cash');

  const totalBalance = useMemo(
    () => accounts.reduce((sum, a) => sum + a.balance, 0),
    [accounts]
  );

  const totalRevenue = useMemo(
    () => orders.filter(o => o.status !== 'cancelled').reduce((sum, o) => sum + (o.total_amount || 0), 0),
    [orders]
  );

  const totalExpenses = useMemo(
    () => expenses.filter(e => e.status === 'approved').reduce((sum, e) => sum + e.amount, 0),
    [expenses]
  );

  const estimatedProfit = totalRevenue - totalExpenses;

  function handleCreateExpense() {
    const amt = parseFloat(expAmount);
    if (isNaN(amt) || amt <= 0 || !expDesc) return;
    const acc = accounts.find(a => a.id === expAccount);

    const newExp: Expense = {
      id: 'exp-' + Date.now().toString().slice(-4),
      category: expCategory,
      description: expDesc,
      amount: amt,
      account_id: expAccount,
      account_name: acc?.name || 'Cash',
      expense_date: new Date().toISOString().slice(0, 10),
      status: role === 'super_admin' || role === 'admin' ? 'approved' : 'pending',
      created_by: staffName,
      created_at: new Date().toISOString(),
    };

    setExpenses(prev => [newExp, ...prev]);

    // If auto approved, deduct from account balance
    if (newExp.status === 'approved') {
      setAccounts(prev => prev.map(a => a.id === expAccount ? { ...a, balance: a.balance - amt } : a));
    }

    setShowAddExpenseModal(false);
    setExpDesc('');
    setExpAmount('');
  }

  function handleApproveExpense(expId: string) {
    const exp = expenses.find(e => e.id === expId);
    if (!exp || exp.status === 'approved') return;

    setExpenses(prev => prev.map(e => e.id === expId ? { ...e, status: 'approved', approved_by: staffName } : e));
    setAccounts(prev => prev.map(a => a.id === exp.account_id ? { ...a, balance: a.balance - exp.amount } : a));
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-800 flex items-center gap-2">
            <DollarSign size={26} style={{ color: '#B77D80' }} />
            অর্থ ও হিসাবরক্ষণ (Finance & Accounting)
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">ক্যাশ ব্যালেন্স, খরচ লেজার ও লাভ-ক্ষতির পূর্ণাঙ্গ হিসাব</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Tab switcher */}
          <div className="flex bg-white rounded-xl border border-rose-100 p-1 gap-1 shadow-sm">
            <button
              onClick={() => setActiveTab('accounts')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'accounts' ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
              style={activeTab === 'accounts' ? { background: '#B77D80' } : {}}
            >
              একাউন্টস ব্যালেন্স
            </button>
            <button
              onClick={() => setActiveTab('expenses')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'expenses' ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
              style={activeTab === 'expenses' ? { background: '#B77D80' } : {}}
            >
              খরচ লেজার ({expenses.length})
            </button>
            <button
              onClick={() => setActiveTab('statement')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'statement' ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
              style={activeTab === 'statement' ? { background: '#B77D80' } : {}}
            >
              আয়-ব্যয় বিবরণী
            </button>
          </div>

          <button
            onClick={() => setShowAddExpenseModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white shadow-md active:scale-95 transition-all"
            style={{ background: '#B77D80' }}
          >
            <Plus size={15} />
            নতুন খরচ এন্ট্রি
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-rose-50 shadow-sm">
          <span className="text-xs text-gray-500 font-medium">মোট ক্যাশ ও ব্যাংক ব্যালেন্স</span>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{currency}{totalBalance.toLocaleString('en-BD')}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{accounts.length} টি একাউন্টে গচ্ছিত</p>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-rose-50 shadow-sm">
          <span className="text-xs text-gray-500 font-medium">মোট বিক্রয় আয় (Sales)</span>
          <p className="text-2xl font-bold text-gray-800 mt-1">{currency}{totalRevenue.toLocaleString('en-BD')}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">সব অর্ডার ও POS বিক্রয়</p>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-rose-50 shadow-sm">
          <span className="text-xs text-gray-500 font-medium">মোট ব্যবসায়িক খরচ (Expenses)</span>
          <p className="text-2xl font-bold text-red-600 mt-1">{currency}{totalExpenses.toLocaleString('en-BD')}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">কাঁচামাল, বিল ও পরিচালন খরচ</p>
        </div>

        <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-200">
          <span className="text-xs text-emerald-800 font-bold flex items-center gap-1">
            <TrendingUp size={13} />
            আনুমানিক মোট লাভ (Gross Profit)
          </span>
          <p className="text-2xl font-black text-emerald-900 mt-1">{currency}{estimatedProfit.toLocaleString('en-BD')}</p>
          <p className="text-[11px] text-emerald-700 mt-0.5">আয় ও খরচের সমন্বিত লাভ</p>
        </div>
      </div>

      {activeTab === 'accounts' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {accounts.map(acc => (
            <div key={acc.id} className="bg-white rounded-2xl p-5 border border-rose-100 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="w-10 h-10 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center font-bold">
                  {acc.account_type === 'cash' ? <Wallet size={20} /> : acc.account_type === 'bank' ? <Building2 size={20} /> : <Smartphone size={20} />}
                </span>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                  {acc.account_type}
                </span>
              </div>
              <div>
                <h3 className="font-bold text-gray-800 text-sm leading-tight">{acc.name}</h3>
                <p className="text-2xl font-black text-gray-900 mt-2 font-mono">
                  {currency}{acc.balance.toLocaleString('en-BD')}
                </p>
              </div>
              <div className="text-[11px] text-gray-400 pt-2 border-t border-gray-100 flex items-center justify-between">
                <span>স্ট্যাটাস: সক্রিয়</span>
                <span className="text-emerald-600 font-semibold">Live Balance</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'expenses' && (
        <div className="bg-white rounded-2xl shadow-sm border border-rose-50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50/70 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">তারিখ</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">খরচের বিবরণ</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">ক্যাটাগরি</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">পরিমাণ</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">পেমেন্ট একাউন্ট</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">এন্ট্রি দাতা</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">স্ট্যাটাস</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">অ্যাকশন</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map(exp => (
                  <tr key={exp.id} className="border-t border-gray-50 hover:bg-rose-50/20 transition-colors">
                    <td className="px-4 py-3 font-mono text-gray-500">{exp.expense_date}</td>
                    <td className="px-4 py-3 font-bold text-gray-800">{exp.description}</td>
                    <td className="px-4 py-3 capitalize text-gray-600">{exp.category}</td>
                    <td className="px-4 py-3 font-mono font-black text-red-600 text-sm">
                      {currency}{exp.amount.toLocaleString('en-BD')}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{exp.account_name}</td>
                    <td className="px-4 py-3 text-gray-600 font-medium">{exp.created_by}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                        exp.status === 'approved' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {exp.status === 'approved' ? '✓ অনুমোদিত' : '⏳ পেন্ডিং'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {exp.status === 'pending' && (role === 'super_admin' || role === 'admin') && (
                        <button
                          onClick={() => handleApproveExpense(exp.id)}
                          className="px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg text-[10px]"
                        >
                          অনুমোদন দিন
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'statement' && (
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-6 max-w-2xl">
          <div className="border-b border-gray-200 pb-4">
            <h2 className="text-lg font-bold text-gray-800">ব্যবসায়িক আয়-ব্যয় বিবরণী (Income Statement)</h2>
            <p className="text-xs text-gray-500">চলতি সময়কালের আর্থিক ফলাফল</p>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center py-2 border-b border-gray-100 font-bold text-gray-800">
              <span>মোট বিক্রয় আয় (Total Sales)</span>
              <span className="font-mono text-emerald-600">{currency}{totalRevenue.toLocaleString('en-BD')}</span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-gray-100 text-gray-600">
              <span>বিয়োগ: মোট খরচ (Operating & Production Expenses)</span>
              <span className="font-mono text-red-500">−{currency}{totalExpenses.toLocaleString('en-BD')}</span>
            </div>

            <div className="flex justify-between items-center py-3 border-t-2 border-gray-800 font-black text-base text-gray-900">
              <span>নীট আনুমানিক লাভ (Estimated Net Profit)</span>
              <span className="font-mono text-emerald-700">{currency}{estimatedProfit.toLocaleString('en-BD')}</span>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Expense */}
      {showAddExpenseModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <h3 className="font-bold text-gray-800 text-base">নতুন খরচ এন্ট্রি (New Expense Entry)</h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-600 font-semibold mb-1">খরচের ক্যাটাগরি:</label>
                <select
                  value={expCategory}
                  onChange={e => setExpCategory(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-rose-400"
                >
                  <option value="ingredients">কাঁচামাল ক্রয় (Ingredients)</option>
                  <option value="packaging">প্যাকেজিং বক্স ও ফিতা (Packaging)</option>
                  <option value="utilities">বিদ্যুৎ ও গ্যাস বিল (Utilities)</option>
                  <option value="salary">স্টাফ বেতন ও বোনাস (Staff Salary)</option>
                  <option value="rent">দোকানের ভাড়া (Shop Rent)</option>
                  <option value="marketing">বিজ্ঞাপন ও প্রমোশন (Marketing)</option>
                  <option value="other">অন্যান্য দৈনন্দিন খরচ (Other)</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-600 font-semibold mb-1">খরচের পরিমাণ ({currency}):</label>
                <input
                  type="number"
                  placeholder="যেমন: 2500"
                  value={expAmount}
                  onChange={e => setExpAmount(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-rose-400 font-bold"
                />
              </div>

              <div>
                <label className="block text-gray-600 font-semibold mb-1">কোন একাউন্ট থেকে পরিশোধ:</label>
                <select
                  value={expAccount}
                  onChange={e => setExpAccount(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-rose-400"
                >
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name} (ব্যালেন্স: {currency}{a.balance})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-gray-600 font-semibold mb-1">বিবরণ / নোট:</label>
                <input
                  type="text"
                  placeholder="যেমন: মে মাসের দোকান ভাড়ার কিস্তি"
                  value={expDesc}
                  onChange={e => setExpDesc(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-rose-400"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleCreateExpense}
                className="flex-1 py-2.5 rounded-xl font-bold text-white text-xs shadow-md active:scale-95 transition-all"
                style={{ background: '#B77D80' }}
              >
                সংরক্ষণ করুন (Save Expense)
              </button>
              <button
                type="button"
                onClick={() => setShowAddExpenseModal(false)}
                className="px-4 py-2.5 rounded-xl font-semibold border border-gray-200 text-gray-600 text-xs hover:bg-gray-50"
              >
                বাতিল
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
