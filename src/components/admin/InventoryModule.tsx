import React, { useState, useMemo } from 'react';
import {
  Package,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Edit2,
  Trash2,
  CheckCircle,
  FileText,
  SlidersHorizontal,
} from 'lucide-react';
import type { Ingredient, StockMovement, UnitType } from '../../types';

interface InventoryModuleProps {
  currency: string;
  staffName: string;
}

const DEFAULT_INGREDIENTS: Ingredient[] = [
  { id: 'ing-1', name: 'প্রিমিয়াম ময়দা (All-Purpose Flour)', category: 'flour', unit: 'kg', current_stock: 45, minimum_stock: 20, cost_per_unit: 75, supplier_name: 'ফ্রেশ মিলস', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'ing-2', name: 'সাদা চিনি (Refined Sugar)', category: 'sugar', unit: 'kg', current_stock: 12, minimum_stock: 25, cost_per_unit: 140, supplier_name: 'দেশ এন্টারপ্রাইজ', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'ing-3', name: 'হুইপিং ক্রিম (Ever-Whip Cream)', category: 'dairy', unit: 'liter', current_stock: 8, minimum_stock: 15, cost_per_unit: 450, supplier_name: 'গাজী অ্যান্ড ব্রাদার্স', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'ing-4', name: 'ডিম (Fresh Farm Eggs)', category: 'eggs', unit: 'pcs', current_stock: 120, minimum_stock: 60, cost_per_unit: 13, supplier_name: 'লোকাল পোল্ট্রি ফার্ম', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'ing-5', name: 'ডার্ক চকলেট কম্পাউন্ড (Van Houten)', category: 'flavoring', unit: 'kg', current_stock: 15, minimum_stock: 10, cost_per_unit: 850, supplier_name: 'চকলেট হাউস', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'ing-6', name: 'কেক বক্স (1kg Window Box)', category: 'packaging', unit: 'pcs', current_stock: 85, minimum_stock: 50, cost_per_unit: 35, supplier_name: 'প্যাকেজিং সলিউশন্স', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'ing-7', name: 'কেক বেস বোর্ড (10 inch Silver)', category: 'packaging', unit: 'pcs', current_stock: 40, minimum_stock: 50, cost_per_unit: 25, supplier_name: 'প্যাকেজিং সলিউশন্স', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'ing-8', name: 'বাটার (Aarong Unsalted Butter)', category: 'dairy', unit: 'kg', current_stock: 14, minimum_stock: 10, cost_per_unit: 920, supplier_name: 'আড়ং ডেইরি', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
];

export const InventoryModule: React.FC<InventoryModuleProps> = ({
  currency,
  staffName,
}) => {
  const [ingredients, setIngredients] = useState<Ingredient[]>(DEFAULT_INGREDIENTS);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'stock' | 'movements' | 'low_stock'>('stock');
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Ingredient | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustType, setAdjustType] = useState<'purchase' | 'usage' | 'damage' | 'adjustment'>('adjustment');
  const [adjustNote, setAdjustNote] = useState('');

  const [movements, setMovements] = useState<StockMovement[]>([
    { id: 'mov-1', ingredient_id: 'ing-1', ingredient_name: 'প্রিমিয়াম ময়দা', movement_type: 'purchase', quantity: 50, unit: 'kg', unit_cost: 75, total_cost: 3750, created_by: 'Admin', created_at: new Date(Date.now() - 3600000).toISOString() },
    { id: 'mov-2', ingredient_id: 'ing-3', ingredient_name: 'হুইপিং ক্রিম', movement_type: 'usage', quantity: -4, unit: 'liter', unit_cost: 450, total_cost: 1800, notes: 'Order #1042 ও #1043 এর জন্য ব্যবহৃত', created_by: 'Chef Baker', created_at: new Date(Date.now() - 7200000).toISOString() },
    { id: 'mov-3', ingredient_id: 'ing-4', ingredient_name: 'ডিম (Fresh Farm Eggs)', movement_type: 'damage', quantity: -6, unit: 'pcs', unit_cost: 13, total_cost: 78, notes: 'ফাটা ও নষ্ট ডিম ফেলে দেওয়া হয়েছে', created_by: 'Chef Baker', created_at: new Date(Date.now() - 14400000).toISOString() },
  ]);

  const lowStockItems = useMemo(
    () => ingredients.filter(i => i.current_stock <= i.minimum_stock),
    [ingredients]
  );

  const filteredItems = useMemo(() => {
    return ingredients.filter(i => {
      const matchSearch = i.name.toLowerCase().includes(search.toLowerCase());
      const matchCat = selectedCategory === 'all' || i.category === selectedCategory;
      if (activeTab === 'low_stock') return i.current_stock <= i.minimum_stock && matchSearch && matchCat;
      return matchSearch && matchCat;
    });
  }, [ingredients, search, selectedCategory, activeTab]);

  const totalValuation = useMemo(
    () => ingredients.reduce((sum, i) => sum + (i.current_stock * i.cost_per_unit), 0),
    [ingredients]
  );

  function handleSaveAdjustment() {
    if (!selectedItem) return;
    const qty = parseFloat(adjustQty);
    if (isNaN(qty) || qty === 0) return;

    const delta = adjustType === 'purchase' || (adjustType === 'adjustment' && qty > 0) ? Math.abs(qty) : -Math.abs(qty);
    const newStock = Math.max(0, selectedItem.current_stock + delta);

    setIngredients(prev =>
      prev.map(i => i.id === selectedItem.id ? { ...i, current_stock: newStock, updated_at: new Date().toISOString() } : i)
    );

    const newMov: StockMovement = {
      id: 'mov-' + Date.now(),
      ingredient_id: selectedItem.id,
      ingredient_name: selectedItem.name,
      movement_type: adjustType,
      quantity: delta,
      unit: selectedItem.unit,
      unit_cost: selectedItem.cost_per_unit,
      total_cost: Math.abs(delta) * selectedItem.cost_per_unit,
      notes: adjustNote || undefined,
      created_by: staffName,
      created_at: new Date().toISOString(),
    };

    setMovements(prev => [newMov, ...prev]);
    setAdjustModalOpen(false);
    setSelectedItem(null);
    setAdjustQty('');
    setAdjustNote('');
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Package size={26} style={{ color: '#B77D80' }} />
            ইনভেন্টরি ও উপকরণ স্টক (Inventory & Stock)
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">কাঁচামাল ও প্যাকেজিং উপকরণের রিয়েলটাইম স্টক ব্যবস্থাপনা</p>
        </div>

        {/* Tab Pills */}
        <div className="flex bg-white rounded-xl border border-rose-100 p-1 gap-1 shadow-sm">
          <button
            onClick={() => setActiveTab('stock')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'stock' ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
            style={activeTab === 'stock' ? { background: '#B77D80' } : {}}
          >
            স্টক তালিকা ({ingredients.length})
          </button>
          <button
            onClick={() => setActiveTab('low_stock')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
              activeTab === 'low_stock' ? 'text-white shadow-sm' : 'text-red-500 hover:text-red-700'
            }`}
            style={activeTab === 'low_stock' ? { background: '#EF4444' } : {}}
          >
            <AlertTriangle size={12} />
            লো স্টক সতর্কবার্তা ({lowStockItems.length})
          </button>
          <button
            onClick={() => setActiveTab('movements')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'movements' ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
            style={activeTab === 'movements' ? { background: '#B77D80' } : {}}
          >
            স্টক মুভমেন্ট হিস্ট্রি
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-rose-50 shadow-sm">
          <span className="text-xs text-gray-500 font-medium">মোট উপকরণের আইটেম</span>
          <p className="text-2xl font-bold text-gray-800 mt-1">{ingredients.length}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">সক্রিয় উপকরন</p>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-rose-50 shadow-sm">
          <span className="text-xs text-gray-500 font-medium">মোট স্টক মূল্যায়ন</span>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{currency}{totalValuation.toLocaleString('en-BD')}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">গুদামে বর্তমান পণ্যের মূল্য</p>
        </div>

        <div className="bg-red-50 rounded-2xl p-4 border border-red-200">
          <span className="text-xs text-red-700 font-bold flex items-center gap-1">
            <AlertTriangle size={13} />
            লো স্টক অ্যালার্ট
          </span>
          <p className="text-2xl font-black text-red-700 mt-1">{lowStockItems.length} টি</p>
          <p className="text-[11px] text-red-600 mt-0.5">দ্রুত কেনাকাটা প্রয়োজন</p>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-rose-50 shadow-sm">
          <span className="text-xs text-gray-500 font-medium">সর্বশেষ মুভমেন্ট</span>
          <p className="text-2xl font-bold text-gray-800 mt-1">{movements.length}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">ইন/আউট লেনদেন</p>
        </div>
      </div>

      {/* Filter / Search Bar */}
      {activeTab !== 'movements' && (
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
          <div className="relative flex-1 sm:w-72">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="উপকরণ খুঁজুন (ময়দা, চিনি, ডিম...)"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto">
            {(['all', 'flour', 'sugar', 'dairy', 'eggs', 'flavoring', 'packaging'] as const).map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat === 'all' ? 'সব' : cat === 'flour' ? 'ময়দা' : cat === 'sugar' ? 'চিনি' : cat === 'dairy' ? 'ডেইরি' : cat === 'eggs' ? 'ডিম' : cat === 'packaging' ? 'প্যাকেজিং' : 'ফ্লেভার'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Table Section */}
      {activeTab !== 'movements' ? (
        <div className="bg-white rounded-2xl shadow-sm border border-rose-50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50/70 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">উপকরণের নাম</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">ক্যাটাগরি</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">বর্তমান স্টক</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">মিনিমাম লিমিট</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">একক মূল্য</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">মোট মূল্য</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">স্ট্যাটাস</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">অ্যাকশন</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map(item => {
                  const isLow = item.current_stock <= item.minimum_stock;
                  return (
                    <tr key={item.id} className="border-t border-gray-50 hover:bg-rose-50/20 transition-colors">
                      <td className="px-4 py-3 font-bold text-gray-800">
                        {item.name}
                        {item.supplier_name && (
                          <span className="block text-[10px] text-gray-400 font-normal">সাপ্লায়ার: {item.supplier_name}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 capitalize text-gray-500">{item.category}</td>
                      <td className="px-4 py-3 font-bold text-gray-800">
                        {item.current_stock} {item.unit}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {item.minimum_stock} {item.unit}
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-gray-700">
                        {currency}{item.cost_per_unit}/{item.unit}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-gray-800">
                        {currency}{(item.current_stock * item.cost_per_unit).toLocaleString('en-BD')}
                      </td>
                      <td className="px-4 py-3">
                        {isLow ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
                            <AlertTriangle size={10} /> লো স্টক
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                            <CheckCircle size={10} /> পর্যাপ্ত
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => { setSelectedItem(item); setAdjustModalOpen(true); }}
                          className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold rounded-lg text-[11px] transition-colors"
                        >
                          অ্যাডজাস্ট / ইন-আউট
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Movements Log */
        <div className="bg-white rounded-2xl shadow-sm border border-rose-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 font-bold text-gray-800 text-sm">
            স্টক পরিবর্তনের ইতিহাস (Stock Movements Log)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">তারিখ ও সময়</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">উপকরণ</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">ধরনের</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">পরিমাণ</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">মোট খরচ</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">মন্তব্য</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">এন্ট্রি দাতা</th>
                </tr>
              </thead>
              <tbody>
                {movements.map(m => (
                  <tr key={m.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-gray-500 font-mono text-[11px]">
                      {new Date(m.created_at).toLocaleString('en-BD')}
                    </td>
                    <td className="px-4 py-3 font-bold text-gray-800">{m.ingredient_name}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                        m.movement_type === 'purchase'
                          ? 'bg-green-100 text-green-800'
                          : m.movement_type === 'damage'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {m.movement_type === 'purchase' ? 'ক্রয় (ইন)' : m.movement_type === 'damage' ? 'নষ্ট / ক্ষতি' : 'ব্যবহার (আউট)'}
                      </span>
                    </td>
                    <td className={`px-4 py-3 font-bold ${m.quantity > 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {m.quantity > 0 ? `+${m.quantity}` : m.quantity} {m.unit}
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-gray-700">
                      {m.total_cost ? `${currency}${m.total_cost.toLocaleString('en-BD')}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{m.notes || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 font-medium">{m.created_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Adjust Stock Modal */}
      {adjustModalOpen && selectedItem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <h3 className="font-bold text-gray-800 text-base">স্টক অ্যাডজাস্টমেন্ট — {selectedItem.name}</h3>
            <p className="text-xs text-gray-500">বর্তমান স্টক: <span className="font-bold text-gray-800">{selectedItem.current_stock} {selectedItem.unit}</span></p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-600 font-semibold mb-1">অ্যাকশনের ধরন:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustType('purchase')}
                    className={`py-2 rounded-xl font-bold border transition-colors ${adjustType === 'purchase' ? 'bg-green-50 border-green-300 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-600'}`}
                  >
                    নতুন ক্রয় (+ ইন)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustType('usage')}
                    className={`py-2 rounded-xl font-bold border transition-colors ${adjustType === 'usage' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-600'}`}
                  >
                    কিচেন ব্যবহার (- আউট)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustType('damage')}
                    className={`py-2 rounded-xl font-bold border transition-colors ${adjustType === 'damage' ? 'bg-red-50 border-red-300 text-red-700' : 'bg-gray-50 border-gray-200 text-gray-600'}`}
                  >
                    নষ্ট / অপচয় (- ড্যামেজ)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustType('adjustment')}
                    className={`py-2 rounded-xl font-bold border transition-colors ${adjustType === 'adjustment' ? 'bg-purple-50 border-purple-300 text-purple-700' : 'bg-gray-50 border-gray-200 text-gray-600'}`}
                  >
                    সরাসরি সমন্বয় (±)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-gray-600 font-semibold mb-1">পরিমাণ ({selectedItem.unit}):</label>
                <input
                  type="number"
                  placeholder={`যেমন: 5`}
                  value={adjustQty}
                  onChange={e => setAdjustQty(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-rose-400 font-bold"
                />
              </div>

              <div>
                <label className="block text-gray-600 font-semibold mb-1">কারণ বা মন্তব্য:</label>
                <input
                  type="text"
                  placeholder="যেমন: বাজার থেকে কেনা বা বেকিংয়ে ব্যবহার"
                  value={adjustNote}
                  onChange={e => setAdjustNote(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-rose-400"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleSaveAdjustment}
                className="flex-1 py-2.5 rounded-xl font-bold text-white text-xs shadow-md transition-all active:scale-95"
                style={{ background: '#B77D80' }}
              >
                সংরক্ষণ করুন (Save)
              </button>
              <button
                type="button"
                onClick={() => setAdjustModalOpen(false)}
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
