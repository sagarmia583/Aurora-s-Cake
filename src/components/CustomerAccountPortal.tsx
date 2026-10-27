import React, { useMemo, useState } from 'react';
import {
  ArrowRight, ClipboardCopy, MapPin, PackageCheck,
  Phone, ShieldCheck, ShoppingBag, Truck, UserRound, X
} from 'lucide-react';
import type { Order, OrderStatus } from '../types';
import { privatePost } from '../services/sheetStaffApi';
import { PhoneOrderTracking } from './PhoneOrderTracking';
import type { PhoneTrackingStatus } from '../services/phoneOrderTracking';

type Contact = { name: string; phone: string; address: string; email: string };
type PanelTab = 'orders' | 'details';

const normalizePhone = (phone: string) =>
  phone.replace(/\D/g, '').replace(/^88(?=01[3-9]\d{8}$)/, '');

const orderStage: Record<OrderStatus, string> = {
  pending: 'Order received',
  confirmed: 'Confirmed',
  preparing: 'Preparing your cake',
  ready: 'Ready for dispatch',
  assigned: 'Rider assigned',
  picked_up: 'Picked up',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled'
};

function storedContact(): Contact {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('aurora_customer_profile_v1') || '{}');
    if (!value || typeof value !== 'object') throw new Error('Invalid saved contact');
    const data = value as Record<string, unknown>;
    return {
      name: String(data.name || ''), phone: String(data.phone || ''),
      address: String(data.address || ''), email: String(data.email || '')
    };
  } catch {
    return { name: '', phone: '', address: '', email: '' };
  }
}

function initialContact(receipts: Order[]): Contact {
  const saved = storedContact();
  // The latest privately held receipt can prefill a blank device profile.
  // A typed phone number never triggers a lookup of other people's details.
  if (saved.phone) return saved;
  const latest = receipts
    .filter(order => order.persistence === 'google_sheets' && !!order.customer_access_token)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return latest ? {
    ...saved, name: saved.name || latest.customer_name,
    phone: latest.customer_phone, address: saved.address || latest.delivery_address
  } : saved;
}

interface Props {
  open: boolean;
  onClose: () => void;
  endpoint: string;
  localReceipts: Order[];
  onTrackOrder?: (orderId: string) => void;
  onReorder?: (order: Order) => void;
  onBrowseCakes?: () => void;
  historySyncing?: boolean;
}

export const CustomerAccountPortal: React.FC<Props> = ({
  open, onClose, endpoint, localReceipts,
  onTrackOrder, onReorder, onBrowseCakes, historySyncing = false
}) => {
  const [contact, setContact] = useState<Contact>(() => initialContact(localReceipts));
  const [tab, setTab] = useState<PanelTab>('orders');
  const [trackedOrders, setTrackedOrders] = useState<PhoneTrackingStatus[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const ownReceipts = useMemo(() => {
    const phone = normalizePhone(contact.phone);
    if (!/^(01[3-9]\d{8})$/.test(phone)) return [];
    const unique = new Map<string, Order>();
    for (const order of localReceipts) {
      if (order.persistence === 'google_sheets' && !!order.customer_access_token &&
          normalizePhone(order.customer_phone) === phone) unique.set(order.id, order);
    }
    return [...unique.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [contact.phone, localReceipts]);

  const activeOrders = (trackedOrders ?? ownReceipts).filter(order =>
    order.status !== 'delivered' && order.status !== 'cancelled').length;

  const saveContact = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const name = contact.name.trim();
    const phone = normalizePhone(contact.phone);
    const address = contact.address.trim();
    if (name.length < 2 || !/^(01[3-9]\d{8})$/.test(phone) || address.length < 6) {
      setError('Enter your name, a valid 11-digit mobile number and full delivery address.');
      return;
    }
    setBusy(true); setError(''); setMessage('');
    try {
      const saved = await privatePost(endpoint, {
        action: 'customer_contact_submit', name, phone, address
      });
      if (saved.saved !== true) throw new Error('The bakery did not confirm your details.');
      const updated = { ...contact, name, phone, address };
      localStorage.setItem('aurora_customer_profile_v1', JSON.stringify(updated));
      setContact(updated);
      setMessage('Details saved. They will be available for your next checkout on this device.');
      setTab('orders');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your details.');
    } finally {
      setBusy(false);
    }
  };

  const copyReceipt = async (order: Order) => {
    if (!order.customer_access_token) return;
    try {
      await navigator.clipboard.writeText(
        'Order ID: ' + order.id + '\nPhone: ' + order.customer_phone +
        '\nPrivate receipt key: ' + order.customer_access_token
      );
      setError('');
      setMessage('Private receipt copied. Keep it somewhere safe, away from public chats.');
    } catch {
      setError('Copying failed. Please preserve the receipt you received after checkout.');
    }
  };

  const changeTab = (next: PanelTab) => {
    setError(''); setMessage(''); setTab(next);
  };

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="customer-orders-title"
      className="fixed inset-0 z-[85] bg-slate-950/70 px-3 py-4 sm:py-8 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl rounded-3xl overflow-hidden bg-[#fffdf8] shadow-2xl">
        <header className="bg-gradient-to-br from-[#124934] via-[#176346] to-[#31886b] text-white px-5 py-6 sm:px-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-emerald-100">Aurora's Cake</span>
              <h2 id="customer-orders-title" className="mt-2 text-2xl sm:text-3xl font-black flex items-center gap-3">
                <ShoppingBag className="shrink-0" size={28}/> My Order Panel
              </h2>
              <p className="mt-2 text-emerald-50 text-sm">
                Check your orders, track delivery and save checkout details. No login required.
              </p>
            </div>
            <button aria-label="Close order panel" type="button" onClick={onClose}
              className="rounded-full p-2 hover:bg-white/15 focus-visible:outline focus-visible:outline-white">
              <X size={23}/>
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-6">
            <div className="rounded-2xl bg-white/15 p-3">
              <span className="block text-[11px] text-emerald-50">Phone orders</span>
              <strong className="block text-xl font-black mt-1">{trackedOrders?.length ?? ownReceipts.length}</strong>
            </div>
            <div className="rounded-2xl bg-white/15 p-3">
              <span className="block text-[11px] text-emerald-50">In progress</span>
              <strong className="block text-xl font-black mt-1">{activeOrders}</strong>
            </div>
            <div className="rounded-2xl bg-white/15 p-3">
              <span className="block text-[11px] text-emerald-50">Full receipts</span>
              <strong className="block text-lg sm:text-xl font-black mt-1">{ownReceipts.length}</strong>
            </div>
          </div>
        </header>

        <div className="px-4 pt-4 sm:px-7">
          <div role="tablist" aria-label="Customer order panel" className="grid grid-cols-2 gap-1 rounded-2xl bg-[#e9f1ea] p-1">
            {([
              { id: 'orders' as const, label: 'My Orders', icon: PackageCheck },
              { id: 'details' as const, label: 'My Details', icon: UserRound }
            ]).map(item => {
              const TabIcon = item.icon;
              return (
                <button key={item.id} type="button" role="tab"
                  aria-selected={tab === item.id}
                  onClick={() => changeTab(item.id)}
                  className={'flex items-center justify-center gap-2 rounded-xl px-2 py-3 text-xs sm:text-sm font-bold transition-colors ' +
                    (tab === item.id ? 'bg-white text-[#174b3b] shadow-sm' : 'text-slate-600 hover:text-[#174b3b]')}>
                  <TabIcon size={16} className="hidden sm:block"/>{item.label}
                </button>
              );
            })}
          </div>
        </div>

        <main className="p-4 sm:p-7 min-h-[220px] space-y-4">
          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}

          {tab === 'orders' && (
            <section role="tabpanel" aria-label="My Orders" className="space-y-4">
              <PhoneOrderTracking endpoint={endpoint} initialPhone={contact.phone} onResults={setTrackedOrders}/>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black text-slate-900">Full receipts saved on this device</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {historySyncing ? 'Checking saved receipts with the bakery…' :
                      'Only orders securely saved on this device are displayed.'}
                  </p>
                </div>
                <button type="button" onClick={() => changeTab('details')}
                  className="flex items-center gap-1 text-sm font-semibold text-[#176346]">
                  <Phone size={15}/> {contact.phone ? normalizePhone(contact.phone) : 'Save your phone'} <ArrowRight size={14}/>
                </button>
              </div>

              {ownReceipts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/50 p-7 text-center">
                  <ShoppingBag className="mx-auto text-[#176346]" size={34}/>
                  <h4 className="mt-3 font-bold text-slate-900">No orders saved on this device</h4>
                  <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto">
                    After checkout, full receipts are saved on this device. To check any
                    order using only your mobile number, use the tracking box above.
                  </p>
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                    {onBrowseCakes && <button type="button" onClick={onBrowseCakes}
                      className="rounded-xl border border-emerald-400 px-4 py-2.5 text-sm font-bold text-emerald-900">
                      Browse cakes
                    </button>}
                  </div>
                </div>
              ) : ownReceipts.slice(0, 50).map(order => (
                <article key={order.id} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
                  <div className="flex flex-wrap justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-slate-500">Order number</p>
                      <h4 className="font-black text-lg text-slate-900">{order.order_number}</h4>
                      <p className="text-xs text-slate-500 mt-1">
                        {new Date(order.created_at).toLocaleDateString('en-BD', {day:'numeric', month:'short', year:'numeric'})}
                        {' · '}{order.items.length} item(s)
                      </p>
                    </div>
                    <div className="text-right">
                      <strong className="text-lg text-[#174b3b]">৳{order.total_amount.toLocaleString('en-BD')}</strong>
                      <div className="mt-1"><span className={'inline-flex rounded-full px-3 py-1 text-xs font-bold ' +
                        (order.status === 'delivered' ? 'bg-emerald-100 text-emerald-800' :
                         order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                         'bg-amber-100 text-amber-900')}>
                        {orderStage[order.status] || order.status}
                      </span></div>
                    </div>
                  </div>
                  {order.status === 'out_for_delivery' && (
                    <p className="mt-3 inline-flex gap-2 items-center rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
                      <Truck size={16}/> Rider verification code:
                      {/^\d{4}$/.test(order.delivery_otp) ? order.delivery_otp : 'Check live tracking'}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {onTrackOrder && <button type="button"
                      onClick={() => onTrackOrder(order.id)}
                      className="rounded-xl bg-[#174b3b] text-white px-4 py-2.5 text-sm font-bold flex gap-2 items-center">
                      <Truck size={16}/> Track order
                    </button>}
                    {onReorder && order.status !== 'cancelled' && <button type="button"
                      onClick={() => onReorder(order)}
                      className="rounded-xl border border-emerald-300 text-emerald-900 px-3 py-2.5 text-sm font-semibold">
                      Order again
                    </button>}
                    <button type="button" onClick={() => void copyReceipt(order)}
                      className="rounded-xl border px-3 py-2.5 text-sm font-semibold text-slate-700 flex gap-1 items-center">
                      <ClipboardCopy size={15}/> Copy receipt
                    </button>
                  </div>
                  <details className="group mt-4 border-t pt-3">
                    <summary className="cursor-pointer text-sm font-bold text-[#174b3b]">View order details</summary>
                    <div className="grid gap-3 text-sm mt-4">
                      <div className="flex items-start gap-2 text-slate-700"><MapPin size={16} className="shrink-0 mt-1"/>
                        <span>{order.delivery_address}</span></div>
                      <p className="text-slate-600">Delivery: {order.delivery_date} · {order.delivery_slot}</p>
                      <ul className="rounded-xl bg-slate-50 p-3 space-y-2">
                        {order.items.map(item => (
                          <li key={item.id} className="flex items-start justify-between gap-3">
                            <span>{item.quantity} × {item.product_name} ({item.variant_name})</span>
                            <strong className="whitespace-nowrap">৳{item.subtotal.toLocaleString('en-BD')}</strong>
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs text-slate-500">Payment: {order.payment_method.toUpperCase()} · {order.payment_status}</p>
                    </div>
                  </details>
                </article>
              ))}
            </section>
          )}

          {tab === 'details' && (
            <section role="tabpanel" aria-label="My Details" className="space-y-4 max-w-2xl">
              <div>
                <h3 className="text-lg font-black text-slate-900">Your checkout details</h3>
                <p className="text-sm text-slate-600 mt-1">
                  Save them for your next order. There is no account registration or password.
                </p>
              </div>
              <form onSubmit={saveContact} className="grid sm:grid-cols-2 gap-4">
                <label className="text-sm font-semibold text-slate-700">Full name
                  <input required autoComplete="name" value={contact.name}
                    onChange={event => setContact(current => ({...current, name:event.target.value}))}
                    placeholder="Your name" className="w-full mt-2 rounded-xl border bg-white p-3"/>
                </label>
                <label className="text-sm font-semibold text-slate-700">Mobile number
                  <input required inputMode="tel" autoComplete="tel" value={contact.phone}
                    onChange={event => setContact(current => ({...current, phone:event.target.value}))}
                    placeholder="01XXXXXXXXX" className="w-full mt-2 rounded-xl border bg-white p-3"/>
                </label>
                <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Delivery address
                  <textarea required autoComplete="street-address" rows={3} value={contact.address}
                    onChange={event => setContact(current => ({...current, address:event.target.value}))}
                    placeholder="House, street, area and delivery instructions"
                    className="w-full mt-2 rounded-xl border bg-white p-3"/>
                </label>
                <button type="submit" disabled={busy}
                  className="sm:col-span-2 rounded-xl bg-[#174b3b] text-white font-bold p-3 disabled:opacity-50">
                  {busy ? 'Saving…' : 'Save my details'}
                </button>
              </form>
              <p className="text-xs text-slate-600 flex gap-2 items-start">
                <ShieldCheck size={16} className="shrink-0"/> Saved contact submissions are unverified.
                We never show a customer's details or order history to another visitor who enters the same phone number.
              </p>
            </section>
          )}


        </main>
      </div>
    </div>
  );
};
