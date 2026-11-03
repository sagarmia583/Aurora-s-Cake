import React, { useState, useMemo } from 'react';
import {
  PackageOpen,
  Plus,
  Search,
  DollarSign,
  AlertCircle,
  CheckCircle,
  Truck,
  Phone,
  Calendar,
  Building,
} from 'lucide-react';
import type { Supplier, Purchase, AccountType } from '../../types';

interface PurchasesModuleProps {
  currency: string;
  staffName: string;
}

const DEFAULT_SUPPLIERS: Supplier[] = [
  { id: 'sup-1', name: 'ফ্রেশ ফ্লাওয়ার মিলস', contact_person: 'কামাল হোসেন', phone: '01711223344', email: 'fresh@example.com', address: 'টাঙ্গাইল সদর', due_amount: 4500, total_purchases: 85000, is_active: true, created_at: new Date().toISOString() },
  { id: 'sup-2', name: 'গাজী অ্যান্ড ব্রাদার্স (ডেইরি ও ক্রিম)', contact_person: 'মো. রফিক', phone: '01822334455', email: 'gazi@example.com', address: 'চকবাজার, ঢাকা', due_amount: 0, total_purchases: 120000, is_active: true, created_at: new Date().toISOString() },
  { id: 'sup-3', name: 'প্যাকেজিং সলিউশন্স', contact_person: 'হাসান আলী', phone: '01933445566', address: 'পুরান ঢাকা', due_amount: 1800, total_purchases: 45000, is_active: true, created_at: new Date().toISOString() },
];

const DEFAULT_PURCHASES: Purchase[] = [
  { id: 'pur-101', supplier_id: 'sup-1', supplier_name: 'ফ্রেশ ফ্লাওয়ার মিলস', total_amount: 7500, paid_amount: 3000, due_amount: 4500, payment_method: 'cash', account_id: 'acc-cash', purchase_date: '2026-10-28', received_by: 'Admin', notes: '৫০ কেজি ময়দা ও চিনি', status: 'received', created_at: '2026-10-28T10:00:00Z' },
  { id: 'pur-102', supplier_id: 'sup-2', supplier_name: 'গাজী অ্যান্ড ব্রাদার্স', total_amount: 18000, paid_amount: 18000, due_amount: 0, payment_method: 'bank', account_id: 'acc-bank', purchase_date: '2026-10-29', received_by: 'Admin', notes: '৪০ লিটার হুইপিং ক্রিম ও বাটার', status: 'received', created_at: '2026-10-29T14:30:00Z' },
  { id: 'pur-103', supplier_id: 'sup-3', supplier_name: 'প্যাকেজিং সলিউশন্স', total_amount: 5800, paid_amount: 4000, due_amount: 1800, payment_method: 'bkash', account_id: 'acc-bkash', purchase_date: '2026-10-30', received_by: 'Admin', notes: '২০০ পিস কেক বক্স ও বেস বোর্ড', status: 'received', created_at: '2026-10-30T11:15:00Z' },
];

export const PurchasesModule: React.FC<PurchasesModuleProps> = ({
  currency,
  staffName,
}) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>(DEFAULT_SUPPLIERS);
  const [purchases, setPurchases] = useState<Purchase[]>(DEFAULT_PURCHASES);
  const [activeTab, setActiveTab] = useState<'purchases' | 'suppliers'>('purchases');
  const [search, setSearch] = useState('');
  const [showAddPurchaseModal, setShowAddPurchaseModal] = useState(false);
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);

  // New purchase state
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || '');
  const [totalAmount, setTotalAmount] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<AccountType>('cash');
  const [purchaseNotes, setPurchaseNotes] = useState('');

  // New supplier state
  const [newSupName, setNewSupName] = useState('');
  const [newSupPerson, setNewSupPerson] = useState('');
  const [newSupPhone, setNewSupPhone] = useState('');
  const [newSupAddress, setNewSupAddress] = useState('');

  const totalPurchasesAmount = useMemo(
    () => purchases.reduce((sum, p) => sum + p.total_amount, 0),
    [purchases]
  );
  const totalSupplierDue = useMemo(
    () => suppliers.reduce((sum, s) => sum + s.due_amount, 0),
    [suppliers]
  );

  function handleCreatePurchase() {
    const total = parseFloat(totalAmount);
    const paid = parseFloat(paidAmount || '0');
    if (isNaN(total) || total <= 0) return;
    const due = Math.max(0, total - paid);
    const sup = suppliers.find(s => s.id === supplierId);

    const newP: Purchase = {
      id: 'pur-' + Date.now().toString().slice(-4),
      supplier_id: supplierId,
      supplier_name: sup?.name || 'Unknown Supplier',
      total_amount: total,
      paid_amount: paid,
      due_amount: due,
      payment_method: paymentMethod,
      account_id: 'acc-' + paymentMethod,
      purchase_date: new Date().toISOString().slice(0, 10),
      received_by: staffName,
      notes: purchaseNotes || undefined,
      status: 'received',
      created_at: new Date().toISOString(),
    };

    setPurchases(prev => [newP, ...prev]);

    // Update supplier due & purchases
    if (sup) {
      setSuppliers(prev => prev.map(s => s.id === sup.id ? {
        ...s,
        due_amount: s.due_amount + due,
        total_purchases: s.total_purchases + total,
      } : s));
    }

    setShowAddPurchaseModal(false);
    setTotalAmount('');
    setPaidAmount('');
    setPurchaseNotes('');
  }

  function handleCreateSupplier() {
    if (!newSupName || !newSupPhone) return;
    const sup: Supplier = {
      id: 'sup-' + Date.now().toString().slice(-4),
      name: newSupName,
      contact_person: newSupPerson || undefined,
      phone: newSupPhone,
      address: newSupAddress || undefined,
      due_amount: 0,
      total_purchases: 0,
      is_active: true,
      created_at: new Date().toISOString(),
    };
    setSuppliers(prev => [...prev, sup]);
    setShowAddSupplierModal(false);
    setNewSupName('');
    setNewSupPerson('');
    setNewSupPhone('');
    setNewSupAddress('');
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-800 flex items-center gap-2">
            <PackageOpen size={26} style={{ color: '#B77D80' }} />
            ক্রয় ও সরবরাহকারী (Purchases & Suppliers)
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">কাঁচামাল ক্রয় ইনভয়েস ও সাপ্লায়ারের বকেয়া হিসাব</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-white rounded-xl border border-rose-100 p-1 gap-1 shadow-sm">
            <button
              onClick={() => setActiveTab('purchases')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'purchases' ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
              style={activeTab === 'purchases' ? { background: '#B77D80' } : {}}
            >
              ক্রয় ইনভয়েস ({purchases.length})
            </button>
            <button
              onClick={() => setActiveTab('suppliers')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'suppliers' ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
              style={activeTab === 'suppliers' ? { background: '#B77D80' } : {}}
            >
              সাপ্লায়ার তালিকা ({suppliers.length})
            </button>
          </div>

          {activeTab === 'purchases' ? (
            <button
              onClick={() => setShowAddPurchaseModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white shadow-md active:scale-95 transition-all"
              style={{ background: '#B77D80' }}
            >
              <Plus size={15} />
              নতুন ক্রয় এন্ট্রি
            </button>
          ) : (
            <button
              onClick={() => setShowAddSupplierModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white shadow-md active:scale-95 transition-all"
              style={{ background: '#B77D80' }}
            >
              <Plus size={15} />
              নতুন সাপ্লায়ার যোগ
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-rose-50 shadow-sm">
          <span className="text-xs text-gray-500 font-medium">মোট ক্রয়ের পরিমাণ</span>
          <p className="text-2xl font-bold text-gray-800 mt-1">{currency}{totalPurchasesAmount.toLocaleString('en-BD')}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{purchases.length} টি ইনভয়েস</p>
        </div>

        <div className="bg-red-50 rounded-2xl p-4 border border-red-200">
          <span className="text-xs text-red-700 font-bold flex items-center gap-1">
            <AlertCircle size={13} />
            সাপ্লায়ার বকেয়া (Payable Due)
          </span>
          <p className="text-2xl font-black text-red-700 mt-1">{currency}{totalSupplierDue.toLocaleString('en-BD')}</p>
          <p className="text-[11px] text-red-600 mt-0.5">পরিশোধযোগ্য বাকি টাকা</p>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-rose-50 shadow-sm">
          <span className="text-xs text-gray-500 font-medium">নিবন্ধিত সাপ্লায়ার</span>
          <p className="text-2xl font-bold text-gray-800 mt-1">{suppliers.length}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">নিয়মিত সরবরাহকারী</p>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-rose-50 shadow-sm">
          <span className="text-xs text-gray-500 font-medium">চলতি মাসের ক্রয়</span>
          <p className="text-2xl font-bold text-blue-600 mt-1">{currency}{totalPurchasesAmount.toLocaleString('en-BD')}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">কাঁচামাল ও বক্স বাবদ</p>
        </div>
      </div>

      {/* Purchases Table */}
      {activeTab === 'purchases' ? (
        <div className="bg-white rounded-2xl shadow-sm border border-rose-50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50/70 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">ইনভয়েস #</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">সাপ্লায়ার</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">তারিখ</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">মোট বিল</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">পরিশোধ</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">বকেয়া</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">পদ্ধতি</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">মন্তব্য</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map(p => (
                  <tr key={p.id} className="border-t border-gray-50 hover:bg-rose-50/20 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-gray-700">#{p.id}</td>
                    <td className="px-4 py-3 font-bold text-gray-800">{p.supplier_name}</td>
                    <td className="px-4 py-3 text-gray-500">{p.purchase_date}</td>
                    <td className="px-4 py-3 font-mono font-bold text-gray-800">{currency}{p.total_amount.toLocaleString('en-BD')}</td>
                    <td className="px-4 py-3 font-mono font-semibold text-green-700">{currency}{p.paid_amount.toLocaleString('en-BD')}</td>
                    <td className="px-4 py-3 font-mono font-bold text-red-600">
                      {p.due_amount > 0 ? `${currency}${p.due_amount.toLocaleString('en-BD')}` : '০ (পরিশোধিত)'}
                    </td>
                    <td className="px-4 py-3 uppercase text-[10px] font-bold text-gray-500">{p.payment_method}</td>
                    <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{p.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Suppliers Table */
        <div className="bg-white rounded-2xl shadow-sm border border-rose-50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50/70 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">সাপ্লায়ার নাম</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">যোগাযোগ ব্যক্তি</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">ফোন নম্বর</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">ঠিকানা</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">মোট ক্রয়</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">বর্তমান বকেয়া</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map(s => (
                  <tr key={s.id} className="border-t border-gray-50 hover:bg-rose-50/20 transition-colors">
                    <td className="px-4 py-3 font-bold text-gray-800">{s.name}</td>
                    <td className="px-4 py-3 text-gray-600">{s.contact_person || '—'}</td>
                    <td className="px-4 py-3 font-mono text-gray-700">{s.phone}</td>
                    <td className="px-4 py-3 text-gray-500">{s.address || '—'}</td>
                    <td className="px-4 py-3 font-mono font-bold text-gray-800">{currency}{s.total_purchases.toLocaleString('en-BD')}</td>
                    <td className="px-4 py-3 font-mono font-bold text-red-600">
                      {s.due_amount > 0 ? `${currency}${s.due_amount.toLocaleString('en-BD')}` : '০ (পরিশোধিত)'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Add Purchase */}
      {showAddPurchaseModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <h3 className="font-bold text-gray-800 text-base">নতুন ক্রয় এন্ট্রি (New Purchase Entry)</h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-600 font-semibold mb-1">সরবরাহকারী (Supplier):</label>
                <select
                  value={supplierId}
                  onChange={e => setSupplierId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-rose-400"
                >
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.phone})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-gray-600 font-semibold mb-1">মোট বিলের পরিমাণ ({currency}):</label>
                <input
                  type="number"
                  placeholder="যেমন: 5000"
                  value={totalAmount}
                  onChange={e => setTotalAmount(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-rose-400 font-bold"
                />
              </div>

              <div>
                <label className="block text-gray-600 font-semibold mb-1">পরিশোধিত টাকা ({currency}):</label>
                <input
                  type="number"
                  placeholder="যেমন: 3000 (বাকি ২,০০০ বকেয়া থাকবে)"
                  value={paidAmount}
                  onChange={e => setPaidAmount(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-rose-400"
                />
              </div>

              <div>
                <label className="block text-gray-600 font-semibold mb-1">পেমেন্ট মাধ্যম:</label>
                <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value as AccountType)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-rose-400"
                >
                  <option value="cash">নগদ ক্যাশ (Cash)</option>
                  <option value="bank">ব্যাংক একাউন্ট (Bank)</option>
                  <option value="bkash">বিকাশ (bKash)</option>
                  <option value="nagad">নগদ (Nagad)</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-600 font-semibold mb-1">ক্রয় বিবরণ / নোট:</label>
                <input
                  type="text"
                  placeholder="যেমন: ২০ কেজি ময়দা ও ৫ কেজি চিনি"
                  value={purchaseNotes}
                  onChange={e => setPurchaseNotes(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-rose-400"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleCreatePurchase}
                className="flex-1 py-2.5 rounded-xl font-bold text-white text-xs shadow-md active:scale-95 transition-all"
                style={{ background: '#B77D80' }}
              >
                সংরক্ষণ করুন (Save Purchase)
              </button>
              <button
                type="button"
                onClick={() => setShowAddPurchaseModal(false)}
                className="px-4 py-2.5 rounded-xl font-semibold border border-gray-200 text-gray-600 text-xs hover:bg-gray-50"
              >
                বাতিল
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Supplier */}
      {showAddSupplierModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <h3 className="font-bold text-gray-800 text-base">নতুন সরবরাহকারী যোগ (New Supplier)</h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-600 font-semibold mb-1">কোম্পানি বা দোকানের নাম:</label>
                <input
                  type="text"
                  placeholder="যেমন: ফ্রেশ মিলস লিমিটেড"
                  value={newSupName}
                  onChange={e => setNewSupName(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-rose-400 font-semibold"
                />
              </div>

              <div>
                <label className="block text-gray-600 font-semibold mb-1">যোগাযোগ ব্যক্তি (Contact Person):</label>
                <input
                  type="text"
                  placeholder="যেমন: মো. কামাল হোসেন"
                  value={newSupPerson}
                  onChange={e => setNewSupPerson(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-rose-400"
                />
              </div>

              <div>
                <label className="block text-gray-600 font-semibold mb-1">মোবাইল নম্বর:</label>
                <input
                  type="tel"
                  placeholder="যেমন: 017xxxxxxxx"
                  value={newSupPhone}
                  onChange={e => setNewSupPhone(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-rose-400"
                />
              </div>

              <div>
                <label className="block text-gray-600 font-semibold mb-1">ঠিকানা / এলাকা:</label>
                <input
                  type="text"
                  placeholder="যেমন: টাঙ্গাইল সদর বাজার"
                  value={newSupAddress}
                  onChange={e => setNewSupAddress(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-rose-400"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleCreateSupplier}
                className="flex-1 py-2.5 rounded-xl font-bold text-white text-xs shadow-md active:scale-95 transition-all"
                style={{ background: '#B77D80' }}
              >
                সাপ্লায়ার যোগ করুন
              </button>
              <button
                type="button"
                onClick={() => setShowAddSupplierModal(false)}
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
