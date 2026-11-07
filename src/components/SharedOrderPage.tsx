import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock3, RefreshCw } from 'lucide-react';
import { readOrderTrackingKey } from '../../apps/staff-mobile/src/orderTrackingLink';
import { loadSharedOrder } from '../services/orderShare';
import { BakeryOperationsError } from '../services/sheetStaffApi';
import { formatShortOrderNumber } from '../utils/orderUtils';
import type { OrderStatus } from '../types';

const stages: Record<OrderStatus, string> = {
  pending: 'অর্ডার পেয়েছি', confirmed: 'অর্ডার নিশ্চিত হয়েছে', preparing: 'কেক তৈরি হচ্ছে',
  ready: 'কেক প্রস্তুত', assigned: 'রাইডার নির্ধারিত হয়েছে', picked_up: 'রাইডার কেক নিয়েছেন',
  out_for_delivery: 'কেক আপনার পথে', delivered: 'অর্ডার পৌঁছে গেছে', cancelled: 'অর্ডার বাতিল হয়েছে',
};
const invalidLink = 'এই লিংকটি আর ব্যবহার করা যাচ্ছে না। দোকান থেকে নতুন লিংক নিন।';
const connectionError = 'অর্ডারের সর্বশেষ তথ্য পাওয়া যায়নি। আবার চেষ্টা করুন।';
const panel = 'rounded-2xl border border-emerald-900/10 bg-white p-5 sm:p-6';

function Receipt({ fragment }: { fragment: string }) {
  const [receipt, setReceipt] = useState<Awaited<ReturnType<typeof loadSharedOrder>>>();
  const [error, setError] = useState('');
  const refresh = useRef<() => void>(() => {});
  const [busy, setBusy] = useState(false);
  const key = readOrderTrackingKey(new URLSearchParams(fragment.slice(1)));

  useEffect(() => {
    const proof = readOrderTrackingKey(new URLSearchParams(fragment.slice(1)));
    if (!proof) return;
    let active = true;
    let timer: number | undefined;
    let pending = false;
    let invalid = false;
    const update = async (manual = false) => {
      if (!active || pending || invalid || document.hidden) return;
      window.clearTimeout(timer);
      pending = true;
      if (manual) setBusy(true);
      try {
        const next = await loadSharedOrder(proof);
        if (active) {
          setReceipt(next);
          setError('');
        }
      } catch (cause) {
        if (!active) return;
        invalid = cause instanceof BakeryOperationsError && cause.code === 'forbidden';
        if (invalid) setReceipt(undefined);
        setError(invalid ? invalidLink : connectionError);
      } finally {
        pending = false;
        if (active) {
          if (manual) setBusy(false);
          if (!invalid) timer = window.setTimeout(() => void update(), 20000);
        }
      }
    };
    const refreshOnReturn = () => { if (!document.hidden) void update(); };
    refresh.current = () => void update(true);
    void update(true);
    document.addEventListener('visibilitychange', refreshOnReturn);
    return () => {
      active = false;
      refresh.current = () => {};
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', refreshOnReturn);
    };
  }, [fragment]);

  const order = receipt?.order;
  const money = (amount: number) => (receipt?.currency || '৳') + (Number(amount) || 0).toLocaleString('en-BD');
  return <main className="mx-auto max-w-2xl space-y-4 px-4 py-8 sm:py-12">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <a href={import.meta.env.BASE_URL || '/'} className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-900"><ArrowLeft size={16} /> দোকানের ওয়েবসাইট</a>
      <p className="text-sm font-bold text-emerald-950">{receipt?.shopName || 'Aurora’s Cake'}</p>
    </header>
    <section className="rounded-2xl bg-[#174b3b] p-5 text-white sm:p-6">
      <p className="text-sm text-emerald-100">অর্ডার ট্র্যাকিং</p>
      <h1 className="mt-2 text-2xl font-bold">{order ? '#' + formatShortOrderNumber(order.order_number) : 'আপনার অর্ডার'}</h1>
      {order && <p className="mt-3 flex items-center gap-2 text-lg" role="status">
        {order.status === 'delivered' ? <CheckCircle2 size={20} /> : <Clock3 size={20} />}
        {stages[order.status] || 'অর্ডারের তথ্য'}
      </p>}
    </section>
    {(!key || error) && <p className={panel} role="alert">{!key ? invalidLink : error}</p>}
    {key && !order && !error && <p className={panel} role="status">অর্ডারের তথ্য আসছে…</p>}
    {key && error !== invalidLink && (order || error) && <button type="button" disabled={busy}
      onClick={() => refresh.current()} className="inline-flex items-center gap-2 rounded-xl border border-emerald-800 px-4 py-2.5 text-sm font-semibold text-emerald-950 disabled:opacity-50">
      <RefreshCw size={16} /> {busy ? 'আপডেট হচ্ছে…' : 'স্ট্যাটাস আপডেট করুন'}
    </button>}
    {order && <>
      <section className={panel}>
        <h2 className="mb-3 text-lg font-bold">অর্ডারের আইটেম</h2>
        <ul className="divide-y divide-emerald-900/10">
          {order.items.map(item => <li key={item.id} className="py-3">
            <div className="flex justify-between gap-4 font-semibold"><span>{item.quantity} × {item.product_name}</span><span>{money(item.subtotal)}</span></div>
            <p className="text-sm text-slate-600">{[item.variant_name, item.flavor_name].filter(Boolean).join(' · ')}</p>
            {item.writing_message && <p className="text-sm">কেকের লেখা · {item.writing_message}</p>}
            {item.addons?.map(addon => <p key={addon.addon_id} className="text-sm text-slate-600">+ {addon.addon_name} × {addon.quantity}</p>)}
          </li>)}
        </ul>
      </section>
      <section className={panel}>
        <h2 className="mb-3 text-lg font-bold">ডেলিভারি</h2>
        <p className="font-semibold">{order.customer_name}</p>
        <p>{order.delivery_address}</p>
        <p className="text-sm text-slate-600">{[order.delivery_zone?.name, order.delivery_date, order.delivery_slot].filter(Boolean).join(' · ')}</p>
        {order.rider_name && <p className="text-sm">রাইডার · {order.rider_name}</p>}
        {order.order_note && <p className="mt-2 text-sm">অর্ডারের নোট · {order.order_note}</p>}
      </section>
      <section className={panel}>
        <h2 className="mb-3 text-lg font-bold">হিসাব</h2>
        <dl className="space-y-2">
          <div className="flex justify-between"><dt>আইটেম</dt><dd>{money(order.subtotal)}</dd></div>
          {order.discount_amount > 0 && <div className="flex justify-between"><dt>ছাড় {order.coupon_code && '(' + order.coupon_code + ')'}</dt><dd>−{money(order.discount_amount)}</dd></div>}
          <div className="flex justify-between"><dt>ডেলিভারি চার্জ</dt><dd>{money(order.delivery_fee)}</dd></div>
          <div className="flex justify-between border-t pt-2 font-bold"><dt>মোট</dt><dd>{money(order.total_amount)}</dd></div>
        </dl>
        <p className="mt-2 text-sm text-slate-600">{order.payment_status === 'paid' ? 'পরিশোধিত' : order.payment_method === 'cod' ? 'কেক বুঝে পেয়ে টাকা পরিশোধ করুন' : 'পেমেন্ট বাকি'}</p>
      </section>
      {order.history.length > 0 && <section className={panel}>
        <h2 className="mb-3 text-lg font-bold">অর্ডারের অগ্রগতি</h2>
        <ol className="space-y-2">
          {order.history.map(step => <li key={step.id} className="flex flex-wrap justify-between gap-x-3 text-sm">
            <span>{stages[step.status] || step.status}</span>
            <time dateTime={step.created_at} className="text-slate-600">{new Date(step.created_at).toLocaleString('bn-BD', {timeZone: 'Asia/Dhaka'})}</time>
          </li>)}
        </ol>
      </section>}
    </>}
  </main>;
}

export default function SharedOrderPage() {
  const [fragment, setFragment] = useState(window.location.hash);
  useEffect(() => {
    const read = () => setFragment(window.location.hash);
    document.title = 'অর্ডার ট্র্যাকিং · Aurora’s Cake';
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  return <Receipt key={fragment} fragment={fragment} />;
}
