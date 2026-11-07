import React, { useState, useMemo } from 'react';
import { 
  X, 
  Printer, 
  Calendar, 
  DollarSign, 
  CreditCard, 
  Wallet, 
  Clock, 
  PackageCheck, 
  FileText, 
  Filter, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  ChevronRight,
  TrendingUp,
  Receipt,
  Download
} from 'lucide-react';
import type { Order } from '../types';
import { 
  CollectionDatePreset, 
  CollectionDateField, 
  CollectionStatusFilter, 
  CollectionPaymentFilter,
  StatementOrder,
  computeCollectionStatement,
  getStatementPaymentBreakdown,
  getDateRangeForPreset,
  getLocalTodayDateString
} from '../services/collectionStatementService';
import { formatShortOrderNumber } from '../utils/orderUtils';
import { PosDualQrCodes } from './PosQrCodes';

interface CollectionStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: StatementOrder[];
  currency?: string;
  shopName?: string;
  shopPhone?: string;
  shopAddress?: string;
}

export const CollectionStatementModal: React.FC<CollectionStatementModalProps> = ({
  isOpen,
  onClose,
  orders,
  currency = '৳',
  shopName = "Aurora's Cake & Pastry",
  shopPhone = "+880 1700-000000",
  shopAddress = "Tangail, Dhaka, Bangladesh",
}) => {
  const todayStr = useMemo(() => getLocalTodayDateString(), []);
  const [preset, setPreset] = useState<CollectionDatePreset>('today');
  const [startDate, setStartDate] = useState<string>(todayStr);
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [dateField, setDateField] = useState<CollectionDateField>('delivery_date');
  const [statusFilter, setStatusFilter] = useState<CollectionStatusFilter>('all_valid');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<CollectionPaymentFilter>('all');
  const [viewMode, setViewMode] = useState<'interactive' | 'a4_preview' | 'pos_preview'>('interactive');

  const handlePresetSelect = (newPreset: CollectionDatePreset) => {
    setPreset(newPreset);
    if (newPreset !== 'custom') {
      const range = getDateRangeForPreset(newPreset);
      setStartDate(range.startDate);
      setEndDate(range.endDate);
    }
  };

  const summary = useMemo(() => {
    return computeCollectionStatement(orders, {
      datePreset: preset,
      startDate,
      endDate,
      dateField,
      statusFilter,
      paymentMethodFilter,
    });
  }, [orders, preset, startDate, endDate, dateField, statusFilter, paymentMethodFilter]);

  if (!isOpen) return null;

  const handleTriggerPrint = (mode: 'a4' | 'pos') => {
    setViewMode(mode === 'a4' ? 'a4_preview' : 'pos_preview');
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const isSingleDay = startDate === endDate;
  const dateHeadingText = isSingleDay 
    ? `তারিখ: ${startDate}` 
    : `তারিখ: ${startDate} হতে ${endDate} পর্যন্ত`;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-5xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94vh]">
        
        {/* Top Header */}
        <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                <span>বিক্রয় ও ক্যাশ কালেকশন স্টেটমেন্ট</span>
                <span className="text-xs bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
                  {summary.matchingOrders.length} টি অর্ডার
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {dateHeadingText} • {dateField === 'delivery_date' ? 'ডেলিভারি তারিখ অনুযায়ী' : 'বুকিং তারিখ অনুযায়ী'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Switcher */}
            <div className="hidden sm:flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs font-bold">
              <button
                type="button"
                onClick={() => setViewMode('interactive')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  viewMode === 'interactive' ? 'bg-emerald-700 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
              >
                📊 ড্যাশবোর্ড
              </button>
              <button
                type="button"
                onClick={() => setViewMode('a4_preview')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  viewMode === 'a4_preview' ? 'bg-emerald-700 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
              >
                📄 A4 রিপোর্ট
              </button>
              <button
                type="button"
                onClick={() => setViewMode('pos_preview')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  viewMode === 'pos_preview' ? 'bg-emerald-700 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
              >
                🧾 POS স্লিপ
              </button>
            </div>

            {/* Print Button */}
            <button
              type="button"
              onClick={() => handleTriggerPrint(viewMode === 'pos_preview' ? 'pos' : 'a4')}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-md"
              title="রিপোর্ট প্রিন্ট করুন"
            >
              <Printer className="w-4 h-4" />
              <span>প্রিন্ট করুন</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors cursor-pointer"
              title="বন্ধ করুন"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="bg-slate-50 border-b border-slate-200 p-3 sm:p-4 space-y-3">
          {/* Quick Presets */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-600" />
              <span>তারিখ ফিল্টার:</span>
            </span>
            {[
              { id: 'today', label: 'আজকের দিন (Today)' },
              { id: 'yesterday', label: 'গতকাল (Yesterday)' },
              { id: 'last_7_days', label: 'গত ৭ দিন' },
              { id: 'this_month', label: 'চলতি মাস' },
              { id: 'all_time', label: 'সব রেকর্ড' },
              { id: 'custom', label: 'কাস্টম তারিখ' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePresetSelect(p.id as CollectionDatePreset)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  preset === p.id
                    ? 'bg-[#173b32] text-amber-300 shadow-xs'
                    : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Date range pickers and options */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-xl px-2.5 py-1">
                <span className="text-slate-500 font-bold">শুরু:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setPreset('custom');
                  }}
                  className="outline-none bg-transparent font-semibold text-slate-800 cursor-pointer"
                />
              </div>

              <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-xl px-2.5 py-1">
                <span className="text-slate-500 font-bold">শেষ:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setPreset('custom');
                  }}
                  className="outline-none bg-transparent font-semibold text-slate-800 cursor-pointer"
                />
              </div>

              {/* Date basis switch */}
              <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-xl px-2 py-1">
                <span className="text-slate-500 font-bold">ভিত্তি:</span>
                <select
                  value={dateField}
                  onChange={(e) => setDateField(e.target.value as CollectionDateField)}
                  className="bg-transparent font-bold text-slate-800 outline-none cursor-pointer"
                >
                  <option value="delivery_date">ডেলিভারির তারিখ</option>
                  <option value="created_at">অর্ডার বুকিং তারিখ</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as CollectionStatusFilter)}
                className="bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 font-bold text-slate-800 outline-none cursor-pointer"
              >
                <option value="all_valid">বাতিল ছাড়া কার্যকর সব অর্ডার</option>
                <option value="delivered_only">শুধুমাত্র সফল ডেলিভার্ড</option>
                <option value="all">বাতিলসহ সকল অর্ডার</option>
              </select>

              {/* Payment Filter */}
              <select
                value={paymentMethodFilter}
                onChange={(e) => setPaymentMethodFilter(e.target.value as CollectionPaymentFilter)}
                className="bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 font-bold text-slate-800 outline-none cursor-pointer"
              >
                <option value="all">সকল পেমেন্ট মাধ্যম</option>
                <option value="cod">ক্যাশ অন ডেলিভারি (COD)</option>
                <option value="bkash">বিকাশ (bKash)</option>
                <option value="online">অন্যান্য অনলাইন</option>
              </select>
            </div>
          </div>
        </div>

        {/* Modal Body / Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {/* VIEW 1: INTERACTIVE DASHBOARD VIEW */}
          {viewMode === 'interactive' && (
            <>
              {/* KPI Summary Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                {/* Total Sales */}
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/60 p-4 rounded-2xl border border-emerald-200/80 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between text-emerald-800">
                    <span className="text-xs font-bold uppercase tracking-wider">সর্বমোট বিক্রি (Sales)</span>
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <div className="text-2xl font-black text-emerald-950">
                    {currency}{summary.grossSales.toLocaleString()}
                  </div>
                  <div className="text-[11px] font-semibold text-emerald-700">
                    মোট {summary.totalOrders} টি অর্ডার (ডেলিভার্ড {summary.deliveredOrders} টি)
                  </div>
                </div>

                {/* Cash in Hand (COD Collected) */}
                <div className="bg-gradient-to-br from-amber-50 to-amber-100/60 p-4 rounded-2xl border border-amber-200/80 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between text-amber-800">
                    <span className="text-xs font-bold uppercase tracking-wider">COD ক্যাশ আদায়</span>
                    <Wallet className="w-4 h-4" />
                  </div>
                  <div className="text-2xl font-black text-amber-950">
                    {currency}{summary.cashCollected.toLocaleString()}
                  </div>
                  <div className="text-[11px] font-semibold text-amber-700">
                    ডেলিভারির সময় নগদ সংগ্রহ
                  </div>
                </div>

                {/* Digital / Advance Collected */}
                <div className="bg-gradient-to-br from-purple-50 to-purple-100/60 p-4 rounded-2xl border border-purple-200/80 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between text-purple-800">
                    <span className="text-xs font-bold uppercase tracking-wider">বিকাশ ও ডিজিটাল আদায়</span>
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <div className="text-2xl font-black text-purple-950">
                    {currency}{(summary.advanceCollected + summary.digitalCollected).toLocaleString()}
                  </div>
                  <div className="text-[11px] font-semibold text-purple-700">
                    অগ্রিম: {currency}{summary.advanceCollected} • অনলাইন: {currency}{summary.digitalCollected}
                  </div>
                </div>

                {/* Due / Pending Amount */}
                <div className="bg-gradient-to-br from-rose-50 to-rose-100/60 p-4 rounded-2xl border border-rose-200/80 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between text-rose-800">
                    <span className="text-xs font-bold uppercase tracking-wider">বকেয়া / অপ্রাপ্ত টাকা</span>
                    <AlertCircle className="w-4 h-4" />
                  </div>
                  <div className="text-2xl font-black text-rose-950">
                    {currency}{summary.totalDueAmount.toLocaleString()}
                  </div>
                  <div className="text-[11px] font-semibold text-rose-700">
                    {summary.pendingOrders} টি অর্ডার প্রসেসিংয়ে রয়েছে
                  </div>
                </div>
              </div>

              {/* Payment Method Breakdown Bar */}
              {summary.methodSummaries.length > 0 && (
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2.5">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Receipt className="w-4 h-4 text-emerald-700" />
                    <span>পেমেন্ট মাধ্যম অনুযায়ী সংগ্রহ বিবরণী</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    {summary.methodSummaries.map((m) => (
                      <div key={m.method} className="bg-white p-3 rounded-xl border border-slate-200 text-xs space-y-1">
                        <div className="font-bold text-slate-800 flex items-center justify-between">
                          <span>{m.label}</span>
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] text-slate-600">{m.orderCount} টি</span>
                        </div>
                        <div className="text-base font-black text-emerald-950">
                          {currency}{m.collectedAmount.toLocaleString()}
                        </div>
                        <div className="text-[10px] text-slate-500 flex justify-between">
                          <span>মোট বিল: {currency}{m.totalAmount}</span>
                          {m.dueAmount > 0 && <span className="text-rose-600 font-bold">বাকি: {currency}{m.dueAmount}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Detailed Orders Table */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs space-y-2">
                <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <PackageCheck className="w-4 h-4 text-emerald-700" />
                    <span>অর্ডারভিত্তিক বিস্তারিত তালিকা ({summary.matchingOrders.length})</span>
                  </h4>
                  <span className="text-xs font-bold text-slate-500">
                    মোট সংগৃহীত ক্যাশ: <strong className="text-emerald-900">{currency}{summary.cashCollected.toLocaleString()}</strong>
                  </span>
                </div>

                {summary.matchingOrders.length === 0 ? (
                  <div className="p-10 text-center text-slate-400 space-y-2">
                    <Calendar className="w-10 h-10 mx-auto text-slate-300" />
                    <p className="font-bold text-slate-600">নির্বাচিত তারিখে কোনো অর্ডারের রেকর্ড পাওয়া যায়নি।</p>
                    <p className="text-xs text-slate-400">ফিল্টার পরিবর্তন করে অন্য তারিখ চেষ্টা করুন।</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-100/80 text-slate-700 border-b border-slate-200 font-bold">
                          <th className="py-2.5 px-3">টোকেন</th>
                          <th className="py-2.5 px-3">তারিখ ও স্লট</th>
                          <th className="py-2.5 px-3">গ্রাহক ও ফোন</th>
                          <th className="py-2.5 px-3">কেক / আইটেম</th>
                          <th className="py-2.5 px-3">পেমেন্ট মাধ্যম</th>
                          <th className="py-2.5 px-3 text-right">অগ্রিম</th>
                          <th className="py-2.5 px-3 text-right">ক্যাশ আদায়</th>
                          <th className="py-2.5 px-3 text-right">মোট বিল</th>
                          <th className="py-2.5 px-3 text-center">স্ট্যাটাস</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-800">
                        {summary.matchingOrders.map((ord, idx) => {
                          const shortToken = formatShortOrderNumber(ord.order_number);
                          const isDelivered = ord.status === 'delivered';
                          const payment = getStatementPaymentBreakdown(ord);
                          const advancePaid = payment.advanceCollected;
                          const cashReceived = payment.cashCollected;

                          return (
                            <tr key={ord.id || idx} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-2.5 px-3 font-mono font-black text-slate-900 whitespace-nowrap">
                                <span className="bg-[#173b32] text-amber-300 px-2 py-0.5 rounded-md shadow-2xs">
                                  #{shortToken}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap text-slate-600">
                                <div>{ord.delivery_date || ord.created_at.slice(0, 10)}</div>
                                <div className="text-[10px] text-slate-400">{ord.delivery_slot || 'Any slot'}</div>
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="font-bold text-slate-900">{ord.customer_name}</div>
                                <div className="text-[11px] text-slate-500 font-mono">{ord.customer_phone}</div>
                              </td>
                              <td className="py-2.5 px-3 max-w-xs truncate">
                                {ord.items && ord.items.length > 0 ? (
                                  <span>{ord.items.map(it => `${it.quantity}x ${it.product_name}`).join(', ')}</span>
                                ) : (
                                  <span className="text-slate-400">কেক আইটেম</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <span className="uppercase font-bold px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700">
                                  {ord.payment_method === 'cod' ? '💵 COD' : `💳 ${ord.payment_method}`}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-semibold text-purple-900">
                                {advancePaid > 0 ? `${currency}${advancePaid}` : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-900">
                                {cashReceived > 0 ? `${currency}${cashReceived}` : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900">
                                {currency}{ord.total_amount}
                              </td>
                              <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                  isDelivered 
                                    ? 'bg-emerald-100 text-emerald-800' 
                                    : ord.status === 'cancelled'
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {ord.status.replace(/_/g, ' ')}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300">
                          <td colSpan={5} className="py-3 px-3 text-right">সর্বমোট হিসাব:</td>
                          <td className="py-3 px-3 text-right font-mono text-purple-900">{currency}{summary.advanceCollected.toLocaleString()}</td>
                          <td className="py-3 px-3 text-right font-mono text-amber-900">{currency}{summary.cashCollected.toLocaleString()}</td>
                          <td className="py-3 px-3 text-right font-mono text-emerald-950 text-sm">{currency}{summary.grossSales.toLocaleString()}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* VIEW 2: A4 OFFICIAL PRINT STATEMENT PREVIEW */}
          {viewMode === 'a4_preview' && (
            <div className="bg-slate-100 p-3 sm:p-6 rounded-2xl flex justify-center">
              <div 
                id="printable-collection-statement"
                className="bg-white p-8 max-w-3xl w-full shadow-lg border border-slate-300 text-black font-sans text-xs space-y-5"
              >
                {/* Print Header */}
                <div className="text-center border-b-2 border-black pb-4 space-y-1">
                  <h1 className="text-2xl font-black uppercase tracking-wider text-black">{shopName}</h1>
                  <p className="text-xs font-medium text-slate-700">{shopAddress} • মোবাইল: {shopPhone}</p>
                  <div className="pt-2">
                    <span className="inline-block bg-black text-white px-3 py-1 font-black text-sm uppercase tracking-wider rounded">
                      DAILY / DATE-WISE SALES & CASH COLLECTION STATEMENT
                    </span>
                  </div>
                  <p className="text-xs font-bold mt-1 text-slate-800">
                    বিবরণীর সময়কাল: <strong>{dateHeadingText}</strong> ({dateField === 'delivery_date' ? 'ডেলিভারি তারিখের ভিত্তিতে' : 'অর্ডার বুকিং তারিখের ভিত্তিতে'})
                  </p>
                </div>

                {/* KPI Summary Block */}
                <div className="grid grid-cols-4 gap-2 border border-black p-3 bg-slate-50 text-center font-bold">
                  <div>
                    <span className="text-[10px] block text-slate-600 uppercase">মোট অর্ডার</span>
                    <span className="text-sm font-black">{summary.totalOrders} টি</span>
                  </div>
                  <div>
                    <span className="text-[10px] block text-slate-600 uppercase">সর্বমোট বিক্রি</span>
                    <span className="text-sm font-black">{currency}{summary.grossSales.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-[10px] block text-slate-600 uppercase">নগদ ক্যাশ আদায়</span>
                    <span className="text-sm font-black">{currency}{summary.cashCollected.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-[10px] block text-slate-600 uppercase">বকেয়া টাকা</span>
                    <span className="text-sm font-black text-rose-700">{currency}{summary.totalDueAmount.toLocaleString()}</span>
                  </div>
                </div>

                {/* Orders Table */}
                <table className="w-full text-left border-collapse border border-black text-[11px]">
                  <thead>
                    <tr className="bg-slate-200 border-b border-black font-bold">
                      <th className="p-1.5 border-r border-black">ক্র:</th>
                      <th className="p-1.5 border-r border-black">টোকেন</th>
                      <th className="p-1.5 border-r border-black">গ্রাহকের নাম ও ফোন</th>
                      <th className="p-1.5 border-r border-black">অর্ডারকৃত কেক</th>
                      <th className="p-1.5 border-r border-black">পদ্ধতি</th>
                      <th className="p-1.5 border-r border-black text-right">অগ্রিম</th>
                      <th className="p-1.5 border-r border-black text-right">ক্যাশ আদায়</th>
                      <th className="p-1.5 border-r border-black text-right">মোট বিল</th>
                      <th className="p-1.5 text-center">স্ট্যাটাস</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.matchingOrders.map((ord, idx) => {
                      const shortToken = formatShortOrderNumber(ord.order_number);
                      const payment = getStatementPaymentBreakdown(ord);
                      const advancePaid = payment.advanceCollected;
                      const cashReceived = payment.cashCollected;

                      return (
                        <tr key={ord.id || idx} className="border-b border-slate-300">
                          <td className="p-1.5 border-r border-black font-mono">{idx + 1}</td>
                          <td className="p-1.5 border-r border-black font-mono font-bold">#{shortToken}</td>
                          <td className="p-1.5 border-r border-black">
                            <span className="font-bold">{ord.customer_name}</span> ({ord.customer_phone})
                          </td>
                          <td className="p-1.5 border-r border-black max-w-xs truncate">
                            {ord.items?.map(it => `${it.quantity}x ${it.product_name}`).join(', ')}
                          </td>
                          <td className="p-1.5 border-r border-black uppercase text-[10px]">
                            {ord.payment_method}
                          </td>
                          <td className="p-1.5 border-r border-black text-right font-mono">
                            {advancePaid > 0 ? `${currency}${advancePaid}` : '—'}
                          </td>
                          <td className="p-1.5 border-r border-black text-right font-mono font-bold">
                            {cashReceived > 0 ? `${currency}${cashReceived}` : '—'}
                          </td>
                          <td className="p-1.5 border-r border-black text-right font-mono font-bold">
                            {currency}{ord.total_amount}
                          </td>
                          <td className="p-1.5 text-center uppercase text-[10px] font-bold">
                            {ord.status}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-200 font-bold border-t-2 border-black">
                      <td colSpan={5} className="p-2 border-r border-black text-right">সর্বমোট যোগফল:</td>
                      <td className="p-2 border-r border-black text-right font-mono">{currency}{summary.advanceCollected.toLocaleString()}</td>
                      <td className="p-2 border-r border-black text-right font-mono">{currency}{summary.cashCollected.toLocaleString()}</td>
                      <td className="p-2 border-r border-black text-right font-mono font-black">{currency}{summary.grossSales.toLocaleString()}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>

                {/* Signatures Block */}
                <div className="pt-10 grid grid-cols-3 gap-8 text-center text-xs font-bold text-slate-800">
                  <div>
                    <div className="border-t border-black pt-1">প্রস্তুতকারক (Prepared By)</div>
                  </div>
                  <div>
                    <div className="border-t border-black pt-1">হিসাবরক্ষক (Accountant)</div>
                  </div>
                  <div>
                    <div className="border-t border-black pt-1">অনুমোদনকারী (Manager/Owner)</div>
                  </div>
                </div>

                <div className="border-t border-slate-300 pt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-[10px] text-slate-500">
                    <div>প্রিন্টের তারিখ ও সময়: {new Date().toLocaleString('en-GB')}</div>
                    <div>Aurora's Cake Cloud Management Suite • Verified Official Statement</div>
                  </div>
                  <PosDualQrCodes
                    size={52}
                    isNarrow={false}
                    headingText=""
                    className="border-t-0 pt-0 my-0"
                  />
                </div>
              </div>
            </div>
          )}

          {/* VIEW 3: POS THERMAL SLIP PREVIEW (80mm) */}
          {viewMode === 'pos_preview' && (
            <div className="bg-slate-100 p-4 rounded-2xl flex justify-center">
              <div 
                id="printable-collection-statement"
                className="pos-mode bg-white p-4 max-w-xs w-full shadow-lg border-2 border-black font-mono text-xs space-y-2.5 text-black"
              >
                <div className="text-center border-b-2 border-black pb-2">
                  <h3 className="text-base font-black uppercase">{shopName}</h3>
                  <div className="text-[10px] text-slate-600">{shopAddress}</div>
                  <div className="text-[10px] font-bold mt-1">
                    CASH COLLECTION CLOSEOUT
                  </div>
                  <div className="text-[10px] text-slate-700 font-bold mt-0.5">
                    {dateHeadingText}
                  </div>
                </div>

                <div className="space-y-1 text-xs border-b border-black pb-2">
                  <div className="flex justify-between">
                    <span>TOTAL ORDERS:</span>
                    <span className="font-bold">{summary.totalOrders}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>DELIVERED:</span>
                    <span className="font-bold">{summary.deliveredOrders}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>GROSS SALES:</span>
                    <span className="font-bold">{currency}{summary.grossSales.toLocaleString()}</span>
                  </div>
                </div>

                <div className="space-y-1 text-xs border-b border-black pb-2">
                  <div className="flex justify-between font-bold">
                    <span>CASH COLLECTED (COD):</span>
                    <span>{currency}{summary.cashCollected.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ADVANCE RECEIVED:</span>
                    <span>{currency}{summary.advanceCollected.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>BKASH / ONLINE:</span>
                    <span>{currency}{summary.digitalCollected.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>DUE / UNCOLLECTED:</span>
                    <span>{currency}{summary.totalDueAmount.toLocaleString()}</span>
                  </div>
                </div>

                <div className="bg-slate-100 p-2 border border-black text-center space-y-0.5">
                  <span className="text-[10px] uppercase font-bold block">NET CASH IN DRAWER</span>
                  <span className="text-lg font-black block">{currency}{summary.cashCollected.toLocaleString()}</span>
                </div>

                {/* Web & Facebook QR on POS Slip */}
                <PosDualQrCodes
                  size={56}
                  isNarrow={true}
                  headingText="AURORA'S CAKE ARTISAN BAKERY"
                  className="my-1.5"
                />

                <div className="pt-4 text-center space-y-3">
                  <div className="border-t border-dashed border-black pt-1 text-[10px]">
                    CASHIER SIGNATURE
                  </div>
                  <div className="text-[9px] text-slate-500">
                    Printed: {new Date().toLocaleDateString('en-GB')} {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 p-3 sm:p-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs font-semibold text-slate-600">
            নির্বাচিত ফিল্টারে মোট বিক্রয়: <strong className="text-emerald-900 font-bold">{currency}{summary.grossSales.toLocaleString()}</strong> • 
            সংগৃহীত ক্যাশ: <strong className="text-amber-900 font-bold">{currency}{summary.cashCollected.toLocaleString()}</strong>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleTriggerPrint('pos')}
              className="px-3 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>🧾 POS থার্মাল প্রিন্ট</span>
            </button>
            <button
              type="button"
              onClick={() => handleTriggerPrint('a4')}
              className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>🖨️ A4 রিপোর্ট প্রিন্ট</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
