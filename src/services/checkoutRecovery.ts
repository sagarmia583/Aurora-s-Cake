import type { CartItem } from '../types';
import { createSheetOrderAttempt } from './googleSheetOrders';
import type { SheetOrderAttempt, SheetOrderDraft } from './googleSheetOrders';
import { validateGoogleSheetsEndpoint } from './googleSheets';

const PENDING_KEY = 'aurora_pending_checkout_v1';
const CART_KEY = 'cake_cart_items_v1';
const MAX_PENDING_LENGTH = 160_000;
const MAX_CART_LENGTH = 2_000_000;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
type CheckoutStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export interface CheckoutCartLine {
  cart_item_id: string;
  product_id: string;
  variant_id: string;
  flavor_id?: string;
  addon_ids: string[];
  writing_message: string;
  quantity: number;
}
export interface PendingCheckout {
  version: 1;
  created_at: string;
  attempt: SheetOrderAttempt;
  cart_lines: CheckoutCartLine[];
}
export interface CheckoutCompletion {
  request_id: string;
  cart_lines: readonly CheckoutCartLine[];
}
export type CheckoutRecovery =
  | { status: 'empty' }
  | { status: 'ready'; pending: PendingCheckout }
  | { status: 'blocked'; message: string };

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max = 300): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;
const quantity = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
function browserStorage(): CheckoutStorage {
  try { if (globalThis.localStorage) return globalThis.localStorage; } catch { /* Report a useful, definite pre-send failure. */ }
  throw new Error('Browser storage is unavailable. Enable storage before placing a live order; no new order was sent.');
}
const storageFor = (storage?: CheckoutStorage) => storage ?? browserStorage();
const selection = (line: Omit<CheckoutCartLine, 'cart_item_id'>) => JSON.stringify({
  product_id: line.product_id, variant_id: line.variant_id, ...(line.flavor_id ? { flavor_id: line.flavor_id } : {}),
  addon_ids: [...new Set(line.addon_ids)].sort(), writing_message: line.writing_message.trim(), quantity: line.quantity,
});
export function captureCheckoutCart(items: readonly CartItem[]): CheckoutCartLine[] {
  const lines = items.map(item => ({ cart_item_id: item.cart_item_id, product_id: item.product.id,
    variant_id: item.selected_variant.id, ...(item.selected_flavor ? { flavor_id: item.selected_flavor.id } : {}),
    addon_ids: [...new Set(item.selected_addons.map(addon => addon.id))].sort(),
    writing_message: item.writing_message.trim(), quantity: item.quantity }));
  if (!validCartLines(lines)) throw new Error('The selected bag cannot be saved safely. Review your cakes before placing an order.');
  return lines;
}
function validCartLines(value: unknown): value is CheckoutCartLine[] {
  if (!Array.isArray(value) || !value.length || value.length > 100) return false;
  const seen = new Set<string>();
  for (const line of value) {
    if (!object(line) || !text(line.cart_item_id) || seen.has(line.cart_item_id) || !text(line.product_id) || !text(line.variant_id) ||
      (line.flavor_id !== undefined && !text(line.flavor_id)) || !Array.isArray(line.addon_ids) || line.addon_ids.length > 100 ||
      !line.addon_ids.every(id => text(id)) || typeof line.writing_message !== 'string' || line.writing_message.length > 1000 || !quantity(line.quantity)) return false;
    seen.add(line.cart_item_id);
  }
  return true;
}
function validPending(value: unknown): value is PendingCheckout {
  try {
    if (!object(value) || value.version !== 1 || !text(value.created_at, 40) || !Number.isFinite(Date.parse(value.created_at)) ||
      !object(value.attempt) || !validCartLines(value.cart_lines)) return false;
    const attempt = value.attempt;
    if (!text(attempt.endpoint, 1500) || validateGoogleSheetsEndpoint(attempt.endpoint).href !== attempt.endpoint ||
      !text(attempt.request_id, 36) || !uuid.test(attempt.request_id) || !text(attempt.body, 70_000) || !text(attempt.fingerprint, 70_000)) return false;
    const body: unknown = JSON.parse(attempt.body), fingerprint: unknown = JSON.parse(attempt.fingerprint);
    if (!object(body) || !object(fingerprint) || fingerprint.endpoint !== attempt.endpoint || !object(fingerprint.payload) ||
      body.action !== 'create_order' || body.request_id !== attempt.request_id || typeof body.checkout_proof !== 'string' ||
      !/^[a-f0-9-]{72}$/i.test(body.checkout_proof) || !Array.isArray(body.cart_items) || body.cart_items.length !== value.cart_lines.length) return false;
    if (JSON.stringify({ action: 'create_order', request_id: attempt.request_id, checkout_proof: body.checkout_proof, ...fingerprint.payload }) !== attempt.body) return false;
    // Reuse the transport's sanitizer, including its exact canonical fingerprint.
    const verified = createSheetOrderAttempt(attempt.endpoint, fingerprint.payload as unknown as SheetOrderDraft, attempt as unknown as SheetOrderAttempt);
    if (verified !== (attempt as unknown as SheetOrderAttempt)) return false;
    const cartLines = value.cart_lines;
    return body.cart_items.every((line, i) => object(line) && selection(line as unknown as CheckoutCartLine) === selection(cartLines[i]));
  } catch { return false; }
}
export function inspectPendingCheckout(endpoint: string, storage?: CheckoutStorage): CheckoutRecovery {
  try {
    const target = validateGoogleSheetsEndpoint(endpoint).href;
    const raw = storageFor(storage).getItem(PENDING_KEY);
    if (!raw) return { status: 'empty' };
    if (raw.length > MAX_PENDING_LENGTH) throw new Error('invalid pending record');
    const value: unknown = JSON.parse(raw);
    if (!validPending(value)) throw new Error('invalid pending record');
    if (value.attempt.endpoint !== target) return { status: 'blocked', message: 'An unconfirmed order belongs to a different bakery connection. Restore the original connection or contact the bakery before placing another order. Its saved reference has been kept.' };
    return { status: 'ready', pending: value };
  } catch {
    return { status: 'blocked', message: 'The saved order reference could not be read safely. Check browser storage or contact the bakery before placing another live order. No new order was sent.' };
  }
}
export class PendingCheckoutConflict extends Error {
  constructor(readonly pending: PendingCheckout) { super('A previous order is still unconfirmed. Retry that original order with its saved reference first.'); }
}
/** This durable write and readback must finish before any live order POST. */
function writePendingCheckout(attempt: SheetOrderAttempt, cartLines: readonly CheckoutCartLine[], storage?: CheckoutStorage): PendingCheckout {
  const store = storageFor(storage);
  const previous = inspectPendingCheckout(attempt.endpoint, store);
  if (previous.status === 'blocked') throw new Error(previous.message);
  if (previous.status === 'ready') {
    if (previous.pending.attempt.request_id === attempt.request_id && previous.pending.attempt.body === attempt.body) return previous.pending;
    throw new PendingCheckoutConflict(previous.pending);
  }
  const snapshot = readCartSnapshot(store);
  const current = new Map(snapshot.items.map(item => [item.cart_item_id, item]));
  if (cartLines.some(line => {
    const item = current.get(line.cart_item_id);
    if (!item || snapshot.settled_cart_ids.includes(line.cart_item_id) || item.quantity < line.quantity) return true;
    return selection({ ...captureCheckoutCart([item])[0], quantity: line.quantity }) !== selection(line);
  })) throw new Error('Your bag was updated or already ordered in another tab. Reload and review the remaining cakes before placing a new order.');
  const pending: PendingCheckout = { version: 1, created_at: new Date().toISOString(), attempt, cart_lines: [...cartLines] };
  const encoded = JSON.stringify(pending);
  if (encoded.length > MAX_PENDING_LENGTH || !validPending(pending)) throw new Error('This checkout cannot be saved safely. No order was sent.');
  try {
    store.setItem(PENDING_KEY, encoded);
    if (store.getItem(PENDING_KEY) !== encoded) throw new Error('readback failed');
  } catch { throw new Error('The browser could not keep your order reference. Enable storage or free some browser space before retrying; no new order was sent.'); }
  return pending;
}
/** Serialize reservation across tabs before a new POST can begin. */
export async function preservePendingCheckout(attempt: SheetOrderAttempt, cartLines: readonly CheckoutCartLine[], storage?: CheckoutStorage): Promise<PendingCheckout> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks?.request) throw new Error('This browser cannot safely keep an order reference across tabs. Use a current browser on the secure bakery website; no new order was sent.');
  return locks.request('aurora-pending-checkout-v1', () => writePendingCheckout(attempt, cartLines, storage));
}
/** Never erase another tab's newer pending reference. Failure keeps recovery safe. */
export async function releasePendingCheckout(pending: PendingCheckout, storage?: CheckoutStorage): Promise<boolean> {
  try {
    const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
    if (!locks?.request) return false;
    return await locks.request('aurora-pending-checkout-v1', () => {
      const store = storageFor(storage), recovery = inspectPendingCheckout(pending.attempt.endpoint, store);
      if (recovery.status === 'empty') return true;
      if (recovery.status !== 'ready' || recovery.pending.attempt.request_id !== pending.attempt.request_id || recovery.pending.attempt.body !== pending.attempt.body) return false;
      store.removeItem(PENDING_KEY);
      return !store.getItem(PENDING_KEY);
    });
  } catch { return false; }
}
interface CartSnapshot { version: 2; items: CartItem[]; settled_request_ids: string[]; settled_cart_ids: string[] }
function readCartSnapshot(storage: CheckoutStorage): CartSnapshot {
  const raw = storage.getItem(CART_KEY);
  if (!raw) return { version: 2, items: [], settled_request_ids: [], settled_cart_ids: [] };
  if (raw.length > MAX_CART_LENGTH) throw new Error('The saved bag is too large.');
  const parsed: unknown = JSON.parse(raw);
  const items = Array.isArray(parsed) ? parsed : object(parsed) && parsed.version === 2 && Array.isArray(parsed.items) ? parsed.items : null;
  if (!items) throw new Error('The saved bag is invalid.');
  const settled = object(parsed) && Array.isArray(parsed.settled_request_ids) ? parsed.settled_request_ids.filter((id): id is string => text(id, 180)) : [];
  const cartIds = object(parsed) && Array.isArray(parsed.settled_cart_ids) ? parsed.settled_cart_ids.filter((id): id is string => text(id)) : [];
  return { version: 2, items: items as CartItem[], settled_request_ids: [...new Set(settled)].slice(-100), settled_cart_ids: [...new Set(cartIds)].slice(-2000) };
}
export function loadCheckoutCart(storage?: CheckoutStorage): CartItem[] {
  try { return readCartSnapshot(storageFor(storage)).items.filter(item => object(item) && text(item.cart_item_id) && quantity(item.quantity) && object(item.product) && object(item.selected_variant) && Array.isArray(item.selected_addons)); }
  catch { return []; }
}
export function saveCheckoutCart(items: CartItem[], storage?: CheckoutStorage): void {
  const store = storageFor(storage), snapshot = readCartSnapshot(store);
  // Refuse a stale tab's entire write, rather than filtering fulfilled IDs and
  // accidentally replacing freshly re-keyed residual cakes with an empty bag.
  if (items.some(item => snapshot.settled_cart_ids.includes(item.cart_item_id))) throw new Error('The bag changed in another tab. Reload before editing it.');
  store.setItem(CART_KEY, JSON.stringify({ ...snapshot, items }));
}
/** Subtract only the original line identity and quantity; later additions survive. */
export function removeConfirmedCheckoutItems(items: readonly CartItem[], confirmed: readonly CheckoutCartLine[]): CartItem[] {
  const byId = new Map(confirmed.map(line => [line.cart_item_id, line]));
  return items.flatMap(item => {
    const original = byId.get(item.cart_item_id);
    if (!original) return [item];
    const current = captureCheckoutCart([item])[0];
    if (selection({ ...current, quantity: original.quantity }) !== selection(original)) return [item];
    const remaining = Math.max(0, item.quantity - original.quantity);
    return remaining ? [{ ...item, quantity: remaining, total_price: item.unit_price * remaining }] : [];
  });
}
/** Bag contents and the completion marker share one atomic storage write. */
export function settleCheckoutCart(items: readonly CartItem[], completion: CheckoutCompletion, storage?: CheckoutStorage): CartItem[] {
  const store = storageFor(storage), snapshot = readCartSnapshot(store);
  if (snapshot.settled_request_ids.includes(completion.request_id)) return snapshot.items;
  // The latest durable bag may include another tab's later additions. Never
  // restore a stale render's removed lines while confirming an older attempt.
  const fulfilledIds = new Set(completion.cart_lines.map(line => line.cart_item_id));
  const remaining = removeConfirmedCheckoutItems(snapshot.items, completion.cart_lines).map(item =>
    fulfilledIds.has(item.cart_item_id) ? { ...item, cart_item_id: 'cart-' + crypto.randomUUID() } : item);
  const next: CartSnapshot = { version: 2, items: remaining,
    settled_request_ids: [...snapshot.settled_request_ids, completion.request_id].slice(-100),
    settled_cart_ids: [...new Set([...snapshot.settled_cart_ids, ...fulfilledIds])].slice(-2000) };
  const encoded = JSON.stringify(next);
  try {
    store.setItem(CART_KEY, encoded);
    if (store.getItem(CART_KEY) !== encoded) throw new Error('readback failed');
  } catch { throw new Error('Your order is saved, but this browser could not update the bag safely. Keep the original reference and retry confirmation; do not place another order.'); }
  return remaining;
}
