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
                    {order.items && <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                      <h5 className="text-sm font-bold text-slate-900">Order details</h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700">
                        <p><span className="text-slate-500">Delivery date:</span> {order.delivery_date || 'Not set'}</p>
                        <p><span className="text-slate-500">Delivery slot:</span> {order.delivery_slot || 'Not set'}</p>
                        <p><span className="text-slate-500">Payment:</span> {(order.payment_method || 'cod').toUpperCase()} · {order.payment_status || 'pending'}</p>
                      </div>
                      <div className="space-y-2 border-t border-slate-100 pt-3">
                        {order.items.map((item,itemIndex)=><div key={itemIndex} className="flex items-start justify-between gap-3 text-xs">
                          <span className="text-slate-700"><strong>{item.quantity} × {item.product_name}</strong>
                            {item.variant_name && <span className="block text-slate-500">{item.variant_name}</span>}
                            {item.flavor_name && <span className="block text-slate-500">Flavor: {item.flavor_name}</span>}
                            <span className="block text-slate-500">Unit price: ৳{item.unit_price.toLocaleString('en-BD')}</span>
                          </span>
                          <span className="font-bold text-slate-900 whitespace-nowrap">৳{item.subtotal.toLocaleString('en-BD')}</span>
                        </div>)}
                      </div>
                      <dl className="border-t border-slate-100 pt-3 space-y-1 text-xs">
                        <div className="flex justify-between"><dt>Subtotal</dt><dd>৳{(order.subtotal ?? 0).toLocaleString('en-BD')}</dd></div>
                        <div className="flex justify-between"><dt>Delivery fee</dt><dd>৳{(order.delivery_fee ?? 0).toLocaleString('en-BD')}</dd></div>
                        <div className="flex justify-between"><dt>Discount</dt><dd>-৳{(order.discount_amount ?? 0).toLocaleString('en-BD')}</dd></div>
                        <div className="flex justify-between font-black text-emerald-900 text-sm border-t pt-2"><dt>Total</dt><dd>৳{(order.total_amount ?? 0).toLocaleString('en-BD')}</dd></div>
                      </dl>
                      {!!order.timeline?.length && <details className="border-t border-slate-100 pt-3">
                        <summary className="cursor-pointer text-xs font-bold text-emerald-900">View status history ({order.timeline.length})</summary>
                        <ol className="mt-3 space-y-2">
                          {order.timeline.map((step,stepIndex)=><li key={stepIndex} className="flex justify-between gap-2 text-xs text-slate-700">
                            <span>{labels[step.status]}</span><time>{dateText(step.at)}</time>
                          </li>)}
                        </ol>
                      </details>}
                    </div>}
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
                      Progress is based on the bakery status, not live GPS. Personal delivery address, custom cake writing and private customer details remain visible only on the original saved receipt.
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
        Phone lookup displays cake items, charges and progress. Your exact address and private customer information remain protected.
      </p>
    </section>
  );
};
