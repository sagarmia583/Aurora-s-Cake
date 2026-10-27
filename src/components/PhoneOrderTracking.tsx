import React, { useEffect, useState } from 'react';
import { Phone, RotateCcw, Search, ShieldCheck, Truck } from 'lucide-react';
import {
  getPhoneOrderStatuses, normalizeTrackingPhone, type PhoneTrackingStatus
} from '../services/phoneOrderTracking';

const PHONE_STORAGE_KEY = 'aurora_tracking_phone_v1';
const labels: Record<PhoneTrackingStatus['status'], string> = {
  pending: 'Order placed',
  confirmed: 'Confirmed',
  preparing: 'Cake is being prepared',
  ready: 'Cake is ready',
  assigned: 'Delivery rider assigned',
  picked_up: 'Picked up for delivery',
  out_for_delivery: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled'
};
function lastSavedPhone(): string {
  try {
    const last = localStorage.getItem(PHONE_STORAGE_KEY) || '';
    if (/^01[3-9]\d{8}$/.test(normalizeTrackingPhone(last))) return normalizeTrackingPhone(last);
    const profile = JSON.parse(localStorage.getItem('aurora_customer_profile_v1') || '{}');
    return normalizeTrackingPhone(String(profile?.phone || ''));
  } catch { return ''; }
}
const dateText = (value:string):string => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-BD') : '';
};

interface Props {
  endpoint: string;
  initialPhone?: string;
  onResults?: (orders: PhoneTrackingStatus[]) => void;
}

export const PhoneOrderTracking: React.FC<Props> = ({ endpoint, initialPhone = '', onResults }) => {
  const [phone, setPhone] = useState(() => initialPhone || lastSavedPhone());
  const [orders, setOrders] = useState<PhoneTrackingStatus[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const search = async (candidate: string, signal?: { cancelled: boolean }) => {
    if (!endpoint || !candidate || signal?.cancelled) return;
    setLoading(true); setError('');
    try {
      const result = await getPhoneOrderStatuses(endpoint, candidate);
      if (signal?.cancelled) return;
      setOrders(result);
      onResults?.(result);
      setSearched(true);
      try { localStorage.setItem(PHONE_STORAGE_KEY, normalizeTrackingPhone(candidate)); } catch { /* Private storage is optional. */ }
    } catch (cause) {
      if (signal?.cancelled) return;
      setOrders([]); setSearched(false);
      setError(cause instanceof Error ? cause.message : 'Could not check your order.');
    } finally {
      if (!signal?.cancelled) setLoading(false);
    }
  };

  useEffect(() => {
    const last = normalizeTrackingPhone(initialPhone || lastSavedPhone());
    if (!/^01[3-9]\d{8}$/.test(last)) return;
    const signal = {cancelled:false};
    setPhone(last);
    void search(last, signal);
    return () => { signal.cancelled=true; };
    // Automatically load only when opened, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    void search(phone);
  };

  return (
    <section aria-label="Track by mobile number" className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 sm:p-5 space-y-3">
      <div>
        <h3 className="flex gap-2 items-center text-lg font-black text-[#174b3b]">
          <Truck size={20}/> Track with your phone number
        </h3>
        <p className="mt-1 text-sm text-slate-600">No password, account, order ID or receipt key needed.</p>
      </div>
      <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Your 11-digit mobile number</span>
          <Phone aria-hidden="true" size={18} className="absolute left-3 top-3 text-slate-400"/>
          <input type="tel" inputMode="tel" autoComplete="tel" required
            value={phone}
            onChange={event => {
              setPhone(event.target.value);setSearched(false);setOrders([]);onResults?.([]);setError('');
            }}
            placeholder="01XXXXXXXXX" aria-label="Your 11-digit mobile number"
            className="w-full min-w-0 rounded-xl border border-emerald-200 bg-white py-3 pl-10 pr-3 outline-emerald-700"/>
        </label>
        <button type="submit" disabled={loading || !endpoint}
          className="flex justify-center items-center gap-2 rounded-xl bg-[#174b3b] px-5 py-3 text-white text-sm font-bold disabled:opacity-50">
          {loading ? <RotateCcw size={17} className="animate-spin"/> : <Search size={17}/>}
          {loading ? 'Checking…' : 'Track Orders'}
        </button>
      </form>
      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg p-3">{error}</p>}
      {searched && <div role="status" className="space-y-2">
        {orders.length===0 ? (
          <p className="text-sm text-slate-600 rounded-xl bg-white p-3">
            No recent orders found for this number. Check the phone number used at checkout.
          </p>
        ) : (
          <>
            <p className="text-xs font-semibold text-emerald-900">{orders.length} recent order(s) found</p>
            {orders.map((order,i)=>(
              <div key={i} className="flex flex-wrap justify-between items-center gap-3 bg-white rounded-xl border border-emerald-100 p-3">
                <div>
                  <p className="font-bold text-slate-900">Order {order.reference}</p>
                  <p className="text-xs text-slate-500">Placed {dateText(order.created_at)}</p>
                </div>
                <div className="text-right">
                  <span className={'inline-block text-xs font-bold rounded-full px-3 py-1.5 ' +
                    (order.status==='delivered'?'text-emerald-800 bg-emerald-100':
                     order.status==='cancelled'?'text-red-800 bg-red-100':
                     'text-amber-900 bg-amber-100')}>
                    {labels[order.status]}
                  </span>
                  <p className="text-xs text-slate-500 mt-1">
                    {dateText(order.updated_at) ? 'Updated ' + dateText(order.updated_at) : ''}
                  </p>
                </div>
              </div>
            ))}
          </>
        )}
      </div>}
      <p className="flex items-start gap-2 text-xs text-slate-500">
        <ShieldCheck size={16} className="shrink-0"/>
        Phone lookup shows delivery progress only. Customer address, payment information and delivery OTP remain private.
      </p>
    </section>
  );
};
