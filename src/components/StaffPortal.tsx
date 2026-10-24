import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, RefreshCw, ShieldCheck, LockKeyhole, Truck, PackageCheck } from 'lucide-react';
import { checkStaffSession, getStaffOrders, mutateStaffOrder } from '../services/sheetStaffApi';
import type { StaffOperation, StaffOrder, StaffRoleName, StaffSession } from '../services/sheetStaffApi';
import { LiveShopEditor } from './LiveShopEditor';
import { CustomCakeQueue } from './CustomCakeQueue';

type GoogleSdk = {
  initialize: (options: { client_id: string; callback: (response: { credential: string }) => void }) => void;
  renderButton: (element: HTMLElement, options: { theme: string; size: string; text: string }) => void;
};
const googleSdk = (): GoogleSdk | undefined =>
  (window as Window & { google?: { accounts?: { id?: GoogleSdk } } }).google?.accounts?.id;

function canOperate(role: StaffRoleName, operation: StaffOperation): boolean {
  // Rider actions require an actual rider session, even for admins.
  if (['pick_up', 'start_delivery', 'deliver'].includes(operation)) return role === 'delivery_man';
  if (role === 'super_admin' || role === 'admin') return true;
  const rules: Partial<Record<StaffRoleName, StaffOperation[]>> = {
    order_manager: ['confirm', 'cancel'],
    kitchen_manager: ['start_baking', 'mark_ready'],
    delivery_manager: ['assign'],
  };
  return (rules[role] || []).includes(operation);
}
const actionForStatus: Record<string, { operation: StaffOperation; label: string } | null> = {
  pending: { operation: 'confirm', label: 'Confirm order' },
  confirmed: { operation: 'start_baking', label: 'Start baking' },
  preparing: { operation: 'mark_ready', label: 'Mark ready' },
  ready: { operation: 'assign', label: 'Assign rider' },
  assigned: { operation: 'pick_up', label: 'Pick up cake' },
  picked_up: { operation: 'start_delivery', label: 'Start delivery' },
  out_for_delivery: { operation: 'deliver', label: 'Verify delivery OTP' },
  delivered: null, cancelled: null,
};

interface StaffPortalProps {
  isOpen: boolean;
  onClose: () => void;
  endpoint: string;
  onCatalogUpdated?: () => void;
}
export const StaffPortal: React.FC<StaffPortalProps> = ({ isOpen, onClose, endpoint, onCatalogUpdated }) => {
  const oauthClientId = (import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID as string | undefined)?.trim();
  const signinRef = useRef<HTMLDivElement>(null);
  const [identity, setIdentity] = useState<(StaffSession & { token: string }) | null>(null);
  const [orders, setOrders] = useState<StaffOrder[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState('');
  const [riderEmail, setRiderEmail] = useState('');
  const [otpOrderId, setOtpOrderId] = useState('');
  const [otp, setOtp] = useState('');
  const [cashCollected, setCashCollected] = useState(false);
  const [updatedAt, setUpdatedAt] = useState('');

  const signIn = useCallback(async (idToken: string) => {
    setLoading(true); setError('');
    try {
      const profile = await checkStaffSession(endpoint, idToken);
      setIdentity({ ...profile, token: idToken });
      setRiderEmail(profile.riders[0]?.email || '');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Staff login failed.'); }
    finally { setLoading(false); }
  }, [endpoint]);

  useEffect(() => {
    if (!isOpen || identity || !oauthClientId) return;
    let active = true;
    const render = () => {
      if (!active || !signinRef.current || !googleSdk()) return;
      signinRef.current.replaceChildren();
      const sdk = googleSdk()!;
      sdk.initialize({ client_id: oauthClientId, callback: response => { if (response.credential) void signIn(response.credential); } });
      sdk.renderButton(signinRef.current, { theme: 'outline', size: 'large', text: 'signin_with' });
    };
    let script = document.getElementById('aurora-google-identity') as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = 'aurora-google-identity';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener('load', render);
    render();
    return () => { active = false; script?.removeEventListener('load', render); };
  }, [isOpen, identity, oauthClientId, signIn]);

  const refresh = useCallback(async () => {
    if (!identity) return;
    try {
      const fresh = await getStaffOrders(endpoint, identity.token);
      setOrders(fresh);
      setUpdatedAt(new Date().toLocaleTimeString());
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load orders.');
    }
  }, [endpoint, identity]);

  useEffect(() => {
    if (!isOpen || !identity) return;
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 30000);
    return () => window.clearInterval(interval);
  }, [isOpen, identity, refresh]);

  const mutate = async (order: StaffOrder, operation: StaffOperation) => {
    if (!identity || busyOrderId) return;
    if (operation === 'cancel' && !window.confirm('Cancel this order? This cannot be undone.')) return;
    if (operation === 'assign' && !riderEmail) { setError('Select a registered rider.'); return; }
    if (operation === 'deliver' && (!/^\d{4}$/.test(otp) || (order.payment_method === 'cod' && !cashCollected))) {
      setError('Enter the 4-digit delivery OTP and confirm that the cash was received.'); return;
    }
    setBusyOrderId(order.id); setError('');
    try {
      await mutateStaffOrder(endpoint, identity.token, operation, order.id,
        operation === 'assign' ? { rider_email: riderEmail } :
        operation === 'deliver' ? { delivery_otp: otp, cash_collected: cashCollected } : {});
      setOtp(''); setOtpOrderId(''); setCashCollected(false);
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to update order.'); }
    finally { setBusyOrderId(''); }
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/70 p-3 sm:p-8 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="staff-portal-title">
      <section className="mx-auto max-w-6xl min-h-[70vh] rounded-3xl bg-slate-50 shadow-2xl overflow-hidden">
        <header className="bg-slate-900 p-5 text-white flex justify-between items-start gap-3">
          <div>
            <h2 id="staff-portal-title" className="text-2xl font-extrabold flex items-center gap-2"><ShieldCheck /> Aurora's Cake — Staff Operations</h2>
            <p className="text-sm text-slate-300">Authenticated live COD orders stored in private Google Sheets</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close staff operations" className="p-2 rounded-full hover:bg-slate-700"><X /></button>
        </header>
        <div className="p-5 space-y-5">
          {!oauthClientId ? (
            <div role="alert" className="rounded-xl bg-amber-50 p-5 text-amber-900">Staff portal is not configured. Set VITE_GOOGLE_OAUTH_CLIENT_ID, and configure the matching Google client ID and authorized staff users in Apps Script Properties.</div>
          ) : !identity ? (
            <div className="bg-white p-7 rounded-2xl border border-slate-200 max-w-xl mx-auto text-center space-y-5">
              <LockKeyhole className="mx-auto text-emerald-700" size={44} />
              <h3 className="text-xl font-bold">Verified staff sign-in</h3>
              <p className="text-sm text-slate-600">Use your approved Google account. Your access level and delivery assignments are checked on the server.</p>
              <div ref={signinRef} className="flex justify-center min-h-12" />
              {loading && <p role="status">Verifying your Google account…</p>}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap justify-between items-center gap-3">
                <div><strong>{identity.name}</strong> <span className="text-slate-500 text-sm">({identity.role.replaceAll('_', ' ')})</span><p className="text-xs text-slate-500">{identity.email}</p></div>
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-slate-500">Last refreshed {updatedAt || '—'}</span>
                  <button type="button" onClick={() => void refresh()} className="flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-3 py-2 text-sm"><RefreshCw size={15} /> Refresh</button>
                  <button type="button" onClick={() => { setIdentity(null); setOrders([]); setError(''); }} className="rounded-xl px-3 py-2 border bg-white text-sm">Sign out</button>
                </div>
              </div>
              <p className="text-sm text-slate-600">Showing up to 100 recent authorized orders. Status updates are written to the same private Sheet used by Customer checkout.</p>
              {orders.length === 0 && <div className="bg-white rounded-xl p-8 text-center">No orders available for your role.</div>}
              <div className="grid gap-4">
                {orders.map(order => {
                  const next = actionForStatus[order.status] || null;
                  const canCancel = canOperate(identity.role, 'cancel') && ['pending','confirmed','preparing','ready','assigned'].includes(order.status);
                  return <article key={order.id} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                    <div className="flex flex-wrap justify-between gap-2">
                      <div><strong className="break-all">#{order.order_number}</strong><p className="text-sm">{order.customer_name} · <a className="underline" href={`tel:${order.customer_phone}`}>{order.customer_phone}</a></p></div>
                      <span className="self-start rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-emerald-900 text-xs font-bold">{order.status.replaceAll('_',' ')}</span>
                    </div>
                    <div className="grid sm:grid-cols-3 gap-2 text-sm text-slate-700">
                      <div><strong>Address:</strong> {order.delivery_address}</div>
                      <div><strong>Slot:</strong> {order.delivery_date} · {order.delivery_slot}</div>
                      <div><strong>COD:</strong> {order.total_amount} · {order.payment_status} {order.cod_collected ? '· collected' : ''}</div>
                    </div>
                    <div className="text-sm bg-slate-50 rounded-xl p-3">
                      {order.items.map(item => <p key={item.id}>{item.quantity} × {item.product_name} ({item.variant_name}) {item.flavor_name ? '· '+item.flavor_name : ''}{item.writing_message ? ' · '+item.writing_message : ''}</p>)}
                      {order.order_note && <p className="text-slate-500 mt-2">Note: {order.order_note}</p>}
                      {order.rider_name && <p className="mt-2 flex items-center gap-1"><Truck size={14} /> Assigned rider: {order.rider_name}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                      {next && canOperate(identity.role, next.operation) && next.operation !== 'deliver' && (
                        <>
                          {next.operation === 'assign' && <select aria-label="Assign registered rider" value={riderEmail} onChange={e => setRiderEmail(e.target.value)} className="border rounded-lg px-2 py-2 text-sm">
                            {identity.riders.map(rider => <option key={rider.email} value={rider.email}>{rider.name} — {rider.email}</option>)}
                          </select>}
                          <button type="button" disabled={!!busyOrderId} onClick={() => void mutate(order,next.operation)}
                            className="rounded-xl bg-emerald-700 text-white px-4 py-2 text-sm font-bold disabled:opacity-50 flex items-center gap-2"><PackageCheck size={15} /> {next.label}</button>
                        </>
                      )}
                      {next?.operation === 'deliver' && canOperate(identity.role,'deliver') && (
                        otpOrderId === order.id ? (
                          <div className="flex flex-wrap items-center gap-3">
                            <input type="text" inputMode="numeric" maxLength={4} aria-label="Customer delivery OTP" placeholder="4-digit OTP" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g,''))} className="w-32 border rounded-xl p-2" />
                            {order.payment_method === 'cod' && <label className="text-sm"><input type="checkbox" checked={cashCollected} onChange={e => setCashCollected(e.target.checked)} /> I collected the full cash amount</label>}
                            <button type="button" disabled={!!busyOrderId} onClick={() => void mutate(order,'deliver')} className="bg-emerald-700 text-white rounded-xl px-4 py-2 text-sm">Verify & deliver</button>
                          </div>
                        ) : <button type="button" onClick={() => { setOtpOrderId(order.id); setOtp(''); setCashCollected(false); }} className="bg-emerald-700 text-white rounded-xl px-4 py-2 text-sm">Verify customer OTP</button>
                      )}
                      {canCancel && <button type="button" disabled={!!busyOrderId} onClick={() => void mutate(order,'cancel')} className="rounded-xl border border-red-200 text-red-700 px-4 py-2 text-sm">Cancel</button>}
                    </div>
                  </article>;
                })}
              </div>
              {(['super_admin','admin','order_manager'] as string[]).includes(identity.role) && <CustomCakeQueue endpoint={endpoint} token={identity.token} />}
              {(identity.role === 'super_admin' || identity.role === 'admin') && <LiveShopEditor endpoint={endpoint} token={identity.token} onUpdated={() => onCatalogUpdated?.()} />}
            </>
          )}
          {error && <p role="alert" className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-800 text-sm">{error}</p>}
        </div>
      </section>
    </div>
  );
};
