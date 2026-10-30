import type { Coupon, Order } from '../types';
import { resolveSheetsPostEndpoint, sheetsPostCredentials } from './googleSheets';

export interface SheetOrderCartLine {
  product_id: string;
  variant_id: string;
  flavor_id?: string;
  addon_ids: string[];
  writing_message: string;
  quantity: number;
}

export interface SheetOrderDraft {
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  delivery_zone_id: string;
  delivery_slot: string;
  delivery_date: string;
  cart_items: SheetOrderCartLine[];
  coupon_code?: string;
  order_note?: string;
  payment_method: 'cod';
  /** Compare-only quote guard; the server computes every authoritative price. */
  expected_total?: number;
}

/** Mirrors the server's monetary rounding for a compare-only checkout estimate. */
export function calculateSheetOrderEstimate(subtotalInput: number, deliveryFeeInput: number, coupon?: Pick<Coupon, 'is_active' | 'min_order_amount' | 'discount_type' | 'discount_value' | 'max_discount_amount'>): { discount: number; total: number } {
  const round2 = (value: number) => Math.round(value * 100) / 100;
  const subtotal = round2(subtotalInput);
  const deliveryFee = round2(deliveryFeeInput);
  let discount = 0;
  if (coupon?.is_active && subtotal >= round2(coupon.min_order_amount)) {
    const value = round2(coupon.discount_value);
    discount = coupon.discount_type === 'percentage' ? subtotal * value / 100 : value;
    if (coupon.max_discount_amount !== undefined) discount = Math.min(discount, round2(coupon.max_discount_amount));
    discount = round2(Math.min(subtotal, Math.max(0, discount)));
  }
  return { discount, total: round2(subtotal - discount + deliveryFee) };
}

export interface SheetOrderAttempt {
  readonly endpoint: string;
  readonly fingerprint: string;
  readonly request_id: string;
  readonly body: string;
}

export class SheetOrderSubmissionError extends Error {
  readonly ambiguous: boolean;
  readonly request_id?: string;
  constructor(message: string, ambiguous: boolean, requestId?: string) {
    super(message);
    this.name = 'SheetOrderSubmissionError';
    this.ambiguous = ambiguous;
    this.request_id = requestId;
  }
}

const RECEIPT_KEY = 'aurora_sheet_order_receipts_v1';
let memoryReceipts: Order[] = [];
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const isText = (value: unknown) => typeof value === 'string';
const hasText = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
const isAmount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const statuses = new Set(['pending', 'confirmed', 'preparing', 'ready', 'assigned', 'picked_up', 'out_for_delivery', 'delivered', 'cancelled']);

/** Validate the receipt used by the order screens, never an opaque or unconfirmed response. */
export function isValidSheetOrderReceipt(value: unknown): value is Order {
  if (!isObject(value) || !hasText(value.id) || !hasText(value.order_number)) return false;
  if (![value.customer_name, value.customer_phone, value.delivery_address, value.delivery_slot, value.delivery_date, value.created_at, value.updated_at].every(hasText)) return false;
  if (!statuses.has(String(value.status)) || value.payment_method !== 'cod' || !['pending', 'paid', 'failed'].includes(String(value.payment_status))) return false;
  if (![value.subtotal, value.delivery_fee, value.discount_amount, value.total_amount, value.cod_amount].every(isAmount)) return false;
  if (!isText(value.delivery_otp) || typeof value.cod_collected !== 'boolean') return false;
  const zone = value.delivery_zone;
  if (!isObject(zone) || !hasText(zone.id) || !hasText(zone.name) || !isAmount(zone.delivery_fee) || !isText(zone.estimated_time) || typeof zone.is_active !== 'boolean') return false;
  if (!Array.isArray(value.items) || !value.items.length || !Array.isArray(value.history)) return false;
  for (const item of value.items) {
    if (!isObject(item) || ![item.id, item.order_id, item.product_id, item.product_name, item.variant_name].every(hasText)) return false;
    if (!Number.isInteger(item.quantity) || Number(item.quantity) < 1 || ![item.unit_price, item.subtotal].every(isAmount) || !Array.isArray(item.addons)) return false;
    for (const addon of item.addons) {
      if (!isObject(addon) || ![addon.addon_id, addon.addon_name].every(hasText) || !Number.isInteger(addon.quantity) || Number(addon.quantity) < 1 || ![addon.unit_price, addon.subtotal].every(isAmount)) return false;
    }
  }
  return value.history.every(entry => isObject(entry) && hasText(entry.id) && statuses.has(String(entry.status)) && isText(entry.notes) && hasText(entry.created_at));
}

/** Private, device-only receipts; they never enter the public catalog endpoint. */
export function loadConfirmedSheetOrders(): Order[] {
  let stored: Order[] = [];
  try {
    const raw = globalThis.localStorage?.getItem(RECEIPT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) stored = parsed.filter((order): order is Order => isValidSheetOrderReceipt(order) && order.persistence === 'google_sheets');
  } catch { /* Keep the in-memory receipt when browser storage is unavailable. */ }
  const byId = new Map<string, Order>();
  for (const receipt of [...stored, ...memoryReceipts]) byId.set(receipt.id, receipt);
  memoryReceipts = [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 50);
  return [...memoryReceipts];
}

export function rememberConfirmedSheetOrder(order: Order): boolean {
  if (!isValidSheetOrderReceipt(order) || order.persistence !== 'google_sheets') return false;
  const existing = loadConfirmedSheetOrders();
  memoryReceipts = [order, ...existing.filter(receipt => receipt.id !== order.id)].slice(0, 50);
  try { globalThis.localStorage?.setItem(RECEIPT_KEY, JSON.stringify(memoryReceipts)); } catch { /* Memory is the fallback. */ }
  return true;
}

/** Remove only receipts restored during this Google session on sign-out. */
export function removeConfirmedSheetOrdersById(ids: readonly string[]): void {
  const excluded = new Set(ids);
  memoryReceipts = loadConfirmedSheetOrders().filter(receipt => !excluded.has(receipt.id));
  try { globalThis.localStorage?.setItem(RECEIPT_KEY, JSON.stringify(memoryReceipts)); }
  catch { /* Browser storage disabled; in-memory list has still been cleared. */ }
}

function normalizeEndpoint(raw: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { throw new SheetOrderSubmissionError('The bakery order endpoint is not configured correctly.', false); }
  if (url.protocol !== 'https:' || url.hostname !== 'script.google.com' || !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname) || url.username || url.password) {
    throw new SheetOrderSubmissionError('Use the configured Google Apps Script web app /exec endpoint.', false);
  }
  url.search = '';
  url.hash = '';
  return url.href;
}

function uuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  if (!globalThis.crypto?.getRandomValues) throw new SheetOrderSubmissionError('This browser cannot create a secure order reference. Please use a current browser.', false);
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Explicitly select public catalog identifiers; client prices are never serialized. */
function cleanDraft(input: SheetOrderDraft): SheetOrderDraft {
  if (input.payment_method !== 'cod') throw new SheetOrderSubmissionError('Only cash-on-delivery orders are currently available.', false);
  const draft: SheetOrderDraft = {
    customer_name: input.customer_name.trim(), customer_phone: input.customer_phone.trim(),
    delivery_address: input.delivery_address.trim(), delivery_zone_id: input.delivery_zone_id.trim(),
    delivery_slot: input.delivery_slot.trim(), delivery_date: input.delivery_date,
    cart_items: input.cart_items.map(item => ({
      product_id: item.product_id, variant_id: item.variant_id,
      ...(item.flavor_id ? { flavor_id: item.flavor_id } : {}),
      addon_ids: [...new Set(item.addon_ids)].sort(), writing_message: item.writing_message.trim(), quantity: item.quantity,
    })),
    ...(input.coupon_code?.trim() ? { coupon_code: input.coupon_code.trim().toUpperCase() } : {}),
    ...(input.order_note?.trim() ? { order_note: input.order_note.trim() } : {}),
    payment_method: 'cod',
    ...(input.expected_total !== undefined ? { expected_total: input.expected_total } : {}),
  };
  if (draft.expected_total !== undefined && !isAmount(draft.expected_total)) throw new SheetOrderSubmissionError('The estimated order total is unavailable. Review your bag and try again.', false);
  if (![draft.customer_name, draft.customer_phone, draft.delivery_address, draft.delivery_zone_id, draft.delivery_slot].every(hasText) || !/^\d{4}-\d{2}-\d{2}$/.test(draft.delivery_date) || !draft.cart_items.length) throw new SheetOrderSubmissionError('Complete the contact, delivery and cake details before placing an order.', false);
  if (draft.cart_items.some(item => !hasText(item.product_id) || !hasText(item.variant_id) || !Number.isInteger(item.quantity) || item.quantity < 1 || !item.addon_ids.every(hasText))) throw new SheetOrderSubmissionError('One of the selected cakes or quantities is unavailable. Review your bag and try again.', false);
  return draft;
}

/** Keep this attempt for an unchanged retry; a changed order receives a new UUID. */
export function createSheetOrderAttempt(endpoint: string, draft: SheetOrderDraft, previous?: SheetOrderAttempt | null): SheetOrderAttempt {
  const safeEndpoint = normalizeEndpoint(endpoint);
  const payload = cleanDraft(draft);
  const fingerprint = JSON.stringify({ endpoint: safeEndpoint, payload });
  if (previous?.fingerprint === fingerprint) return previous;
  const requestId = uuid();
  const checkoutProof = uuid() + uuid();
  return Object.freeze({ endpoint: safeEndpoint, fingerprint, request_id: requestId, body: JSON.stringify({ action: 'create_order', request_id: requestId, checkout_proof: checkoutProof, ...payload }) });
}

/** Recovery may return a later order status, but must still match this exact checkout. */
function matchesOriginalReceipt(order: Order, attempt: SheetOrderAttempt): boolean {
  try {
    const body = JSON.parse(attempt.body);
    if (body.action !== 'create_order' || body.request_id !== attempt.request_id) return false;
    const original = cleanDraft(body);
    if (order.id !== 'ord_' + attempt.request_id ||
      !/^[a-f0-9-]{72}$/i.test(order.customer_access_token || '') ||
      (order.payment_status === 'paid') !== order.cod_collected) return false;
    for (const key of ['customer_name', 'customer_phone', 'delivery_address', 'delivery_slot', 'delivery_date'] as const) {
      if (order[key] !== original[key]) return false;
    }
    if (order.delivery_zone.id !== original.delivery_zone_id ||
      (order.coupon_code || '') !== (original.coupon_code || '') ||
      (order.order_note || '') !== (original.order_note || '') ||
      (original.expected_total !== undefined && Math.abs(order.total_amount - original.expected_total) > 0.0100000001) ||
      order.items.length !== original.cart_items.length) return false;
    return order.items.every((item, index) => {
      const requested = original.cart_items[index];
      const stored = item as typeof item & { variant_id?: string; flavor_id?: string };
      return item.order_id === order.id && item.product_id === requested.product_id &&
        stored.variant_id === requested.variant_id && (stored.flavor_id || '') === (requested.flavor_id || '') &&
        item.quantity === requested.quantity && (item.writing_message || '') === requested.writing_message &&
        item.addons.every(addon => addon.quantity === requested.quantity) &&
        JSON.stringify(item.addons.map(addon => addon.addon_id).sort()) === JSON.stringify(requested.addon_ids);
    });
  } catch { return false; }
}

export async function submitSheetOrder(attempt: SheetOrderAttempt, options: { timeoutMs?: number; fetcher?: typeof fetch; recoverOriginal?: boolean } = {}): Promise<Order> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), options.timeoutMs ?? 45000);
  const unconfirmed = () => new SheetOrderSubmissionError("We couldn't confirm whether the bakery saved this order. Retry the original order with the same reference.", true, attempt.request_id);
  try {
    const postUrl = resolveSheetsPostEndpoint(attempt.endpoint);
    const response = await (options.fetcher ?? globalThis.fetch)(postUrl, {
      method: 'POST', mode: 'cors', headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      credentials: sheetsPostCredentials(postUrl), redirect: 'follow', cache: 'no-store', body: attempt.body, signal: controller.signal,
    });
    if (!response.ok) throw unconfirmed();
    let acknowledgement: unknown;
    try { acknowledgement = await response.json(); } catch { throw unconfirmed(); }
    if (isObject(acknowledgement) && acknowledgement.success === false && acknowledgement.persisted === false) {
      const reason = typeof acknowledgement.error === 'string' ? acknowledgement.error.slice(0, 400) : 'Review the selected cakes and delivery details.';
      throw new SheetOrderSubmissionError('The order was not saved. ' + reason, false, attempt.request_id);
    }
    if (!isObject(acknowledgement) || acknowledgement.success !== true || acknowledgement.persisted !== true || !isValidSheetOrderReceipt(acknowledgement.order)) throw unconfirmed();
    if (options.recoverOriginal ? !matchesOriginalReceipt(acknowledgement.order, attempt)
      : acknowledgement.order.payment_status !== 'pending' || acknowledgement.order.cod_collected) throw unconfirmed();
    return { ...acknowledgement.order, persistence: 'google_sheets' };
  } catch (error) {
    if (error instanceof SheetOrderSubmissionError) throw error;
    throw unconfirmed();
  } finally {
    globalThis.clearTimeout(timeout);
  }
}



