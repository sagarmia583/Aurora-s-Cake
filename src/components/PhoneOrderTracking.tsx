import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle2, Circle, Phone, RotateCcw, Search, ShieldCheck, Truck } from 'lucide-react';
import {
  getPhoneOrderStatuses, normalizeTrackingPhone, type PhoneTrackingStatus
} from '../services/phoneOrderTracking';

const PHONE_STORAGE_KEY = 'aurora_tracking_phone_v1';
const PROGRESS_STAGES = [
  {status: 'pending', label: 'Order placed'},
  {status: 'confirmed', label: 'Confirmed'},
  {status: 'preparing', label: 'Preparing'},
  {status: 'ready', label: 'Ready'},
  {status: 'assigned', label: 'Rider assigned'},
  {status: 'picked_up', label: 'Picked up'},
  {status: 'out_for_delivery', label: 'On the way'},
  {status: 'delivered', label: 'Delivered'}
] as const;

const orderCardKey = (order: PhoneTrackingStatus, index: number): string =>
  order.reference + ':' + order.created_at + ':' + index;
const formatCheckedTime = () => new Date().toLocaleTimeString('en-BD', {hour:'numeric',minute:'2-digit'});
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
  const [backendWarning, setBackendWarning] = useState('');
  const [expandedOrderKey, setExpandedOrderKey] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState('');

  const search = async (candidate: string, signal?: { cancelled: boolean }) => {
    if (!endpoint || !candidate || signal?.cancelled) return;
    setLoading(true); setError('');
    try {
      const result = await getPhoneOrderStatuses(endpoint, candidate);
      if (signal?.cancelled) return;
      setOrders(result);
      onResults?.(result);
      setSearched(true);
      setCheckedAt(formatCheckedTime());
      try { localStorage.setItem(PHONE_STORAGE_KEY, normalizeTrackingPhone(candidate)); } catch { /* Private storage is optional. */ }
    } catch (cause) {
      if (signal?.cancelled) return;
      // A temporary network error must not erase already found orders.
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

  useEffect(() => {
    let active = true;
    // Read-only health metadata; no phone number or receipt is sent.
    void fetch('/api/backend-health', {cache:'no-store'})
      .then(async response => response.ok ? response.json() : null)
      .then((health: unknown) => {
        if (!active || !health || typeof health !== 'object') return;
        const result = health as Record<string,unknown>;
        if (result.ok === true && result.up_to_date === false) {
          setBackendWarning('The bakery is using an older Google Apps Script version. Update Code.AllInOne.gs and deploy a new Apps Script version to enable phone-only tracking.');
        }
      }).catch(() => { /* The preview can still display locally held receipts. */ });
    return () => {active = false;};
  }, []);

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
              setPhone(event.target.value);setSearched(false);setOrders([]);
              setExpandedOrderKey(null);setCheckedAt('');onResults?.([]);setError('');
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
      {backendWarning && <p role="status" className="text-sm text-amber-900 bg-amber-50 rounded-lg p-3">{backendWarning}</p>}
      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg p-3">{error}{searched && ' Showing the last successfully loaded statuses.'}</p>}
      {searched && <div role="status" className="space-y-2">
        {orders.length===0 ? (
          <p className="text-sm text-slate-600 rounded-xl bg-white p-3">
            No recent orders found for this number. Check the phone number used at checkout.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-emerald-900">{orders.length} recent order(s) found</p>
              {checkedAt && <p className="text-xs text-slate-500">Last checked {checkedAt}</p>}
            </div>
            {orders.map((order,i)=>{
              const cardKey = orderCardKey(order,i);
              const expanded = expandedOrderKey === cardKey;
              const currentStage = PROGRESS_STAGES.findIndex(stage => stage.status === order.status);
              const currentLabel = labels[order.status];
              return (
                <article key={cardKey} className="overflow-hidden bg-white rounded-xl border border-emerald-100">
                  <button type="button" aria-expanded={expanded}
                    aria-controls={'phone-order-progress-'+i}
                    onClick={() => setExpandedOrderKey(current => current === cardKey ? null : cardKey)}
                    className="w-full flex flex-wrap justify-between items-center gap-3 p-3 text-left hover:bg-emerald-50/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700">
                    <div>
                      <p className="font-bold text-slate-900">Order {order.reference}</p>
                      <p className="text-xs text-slate-500">Placed {dateText(order.created_at)}</p>
                    </div>
                    <div className="ml-auto flex items-center gap-3">
                      <div className="text-right">
                        <span className={'inline-block text-xs font-bold rounded-full px-3 py-1.5 ' +
                          (order.status==='delivered'?'text-emerald-800 bg-emerald-100':
                           order.status==='cancelled'?'text-red-800 bg-red-100':
                           'text-amber-900 bg-amber-100')}>
                          {currentLabel}
                        </span>
                        <p className="text-xs text-slate-500 mt-1">
                          {dateText(order.updated_at) ? 'Updated ' + dateText(order.updated_at) : ''}
                        </p>
                      </div>
                      {expanded ? <ChevronUp size={18} className="text-emerald-800 shrink-0"/> :
                        <ChevronDown size={18} className="text-emerald-800 shrink-0"/>}
                    </div>
                    <span className="basis-full text-xs font-semibold text-[#174b3b]">{expanded?'Hide progress':'View progress & actions'}</span>
                  </button>
                  {expanded && <div id={'phone-order-progress-'+i} className="border-t border-emerald-100 bg-[#fbfdfb] p-4 space-y-4">
                    <div>
                      <h4 className="text-sm font-black text-[#174b3b]">Order tracking</h4>
                      <p className="text-xs text-slate-600 mt-1">
                        {order.status === 'cancelled'
                          ? 'This order is cancelled.'
                          : order.status === 'delivered'
                            ? 'This order has been delivered.'
                            : 'Current update: ' + currentLabel + '. Tracking reflects the latest bakery status.'}
                      </p>
                    </div>
                    {order.status === 'cancelled' ? (
                      <p className="rounded-lg bg-red-50 text-red-800 text-sm p-3">
                        Cancelled — contact the bakery if you need assistance.
                      </p>
                    ) : (
                      <ol aria-label="Order progress" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {PROGRESS_STAGES.map((stage,stageIndex)=>{
                          const completed = stageIndex <= currentStage;
                          const isCurrent = stageIndex === currentStage;
                          return <li key={stage.status}
                            aria-current={isCurrent ? 'step' : undefined}
                            className={'rounded-xl border p-2.5 min-h-[68px] flex items-start gap-2 ' +
                              (isCurrent ? 'border-emerald-500 bg-emerald-50 text-emerald-900' :
                               completed ? 'border-emerald-200 bg-white text-emerald-900' :
                               'border-slate-200 bg-white text-slate-400')}>
                            {completed ? <CheckCircle2 size={16} className="shrink-0 mt-0.5"/> :
                              <Circle size={16} className="shrink-0 mt-0.5"/>}
                            <span className="text-xs font-semibold">
                              {stage.label}
                              {isCurrent && <span className="block text-[10px] font-normal mt-1">Current stage</span>}
                            </span>
                          </li>;
                        })}
                      </ol>
                    )}
                    <div className="flex flex-wrap items-center gap-3">
                      <button type="button" disabled={loading} onClick={() => void search(phone)}
                        className="inline-flex items-center gap-2 rounded-lg bg-[#174b3b] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
                        <RotateCcw size={15} className={loading?'animate-spin':''}/>
                        {loading?'Updating…':'Refresh status'}
                      </button>
                      <p className="text-xs text-slate-500">
                        {checkedAt ? 'Last checked at ' + checkedAt : 'Check for the latest status'}
                      </p>
                    </div>
                    <p className="text-xs text-slate-500">
                      Progress shows the current order stage, not real-time rider GPS. Detailed receipts and delivery OTP cannot be opened with a phone number alone.
                    </p>
                  </div>}
                </article>
              );
            })}
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
