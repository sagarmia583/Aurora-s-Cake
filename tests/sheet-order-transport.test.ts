import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Order } from '../src/types';
import type { SheetOrderDraft } from '../src/services/googleSheetOrders';
import { calculateSheetOrderEstimate, createSheetOrderAttempt, submitSheetOrder, SheetOrderSubmissionError, isValidSheetOrderReceipt, loadConfirmedSheetOrders, rememberConfirmedSheetOrder } from '../src/services/googleSheetOrders';
import { CheckoutModal } from '../src/components/CheckoutModal';

const endpoint = 'https://script.google.com/macros/s/test_deployment/exec';
const draft = (): SheetOrderDraft => ({
  customer_name: 'Test buyer', customer_phone: '0000000000', delivery_address: 'Test address',
  delivery_zone_id: 'zone-1', delivery_slot: 'Morning', delivery_date: '2026-12-01',
  cart_items: [{ product_id: 'p1', variant_id: 'v1', flavor_id: 'f1', addon_ids: ['a2', 'a1', 'a1'], writing_message: 'Test', quantity: 2 }],
  payment_method: 'cod', expected_total: 460,
});
const receipt = (changes: Partial<Order> = {}): Order => ({
  id: 'order-1', order_number: 'AC-1', customer_name: 'Test buyer', customer_phone: '0000000000', delivery_address: 'Test address',
  delivery_zone: { id: 'zone-1', name: 'Test zone', delivery_fee: 60, estimated_time: 'Today', is_active: true },
  delivery_slot: 'Morning', delivery_date: '2026-12-01', status: 'pending', subtotal: 400, delivery_fee: 60,
  discount_amount: 0, total_amount: 460, payment_method: 'cod', payment_status: 'pending', delivery_otp: '',
  cod_amount: 460, cod_collected: false, created_at: '2026-12-01T00:00:00.000Z', updated_at: '2026-12-01T00:00:00.000Z',
  items: [{ id: 'i1', order_id: 'order-1', product_id: 'p1', product_name: 'Test cake', variant_name: 'Small', unit_price: 200, quantity: 2, subtotal: 400, addons: [] }], history: [], ...changes,
});
const jsonFetch = (body: unknown): typeof fetch => async () => new Response(JSON.stringify(body), { status: 200 });

test('order POST serializes identifiers and compare-only total without client unit prices or PII in the URL', () => {
  const input = draft();
  const poisoned = { ...input, cart_items: input.cart_items.map(item => ({ ...item, unit_price: 999999, total_price: 999999 })), total_amount: 999999 };
  const attempt = createSheetOrderAttempt(endpoint, poisoned);
  const body = JSON.parse(attempt.body);
  assert.equal(attempt.endpoint, endpoint);
  assert.ok(!attempt.endpoint.includes(input.customer_phone));
  assert.equal(body.action, 'create_order');
  assert.equal(body.expected_total, 460);
  assert.deepEqual(body.cart_items[0].addon_ids, ['a1', 'a2']);
  assert.ok(!attempt.body.includes('unit_price'));
  assert.ok(!attempt.body.includes('total_price'));
  assert.ok(!attempt.body.includes('total_amount'));
  assert.equal(body.payment_method, 'cod');
  assert.throws(() => createSheetOrderAttempt('https://example.com/order', input), SheetOrderSubmissionError);
});

test('an unchanged retry keeps its UUID while changed delivery details, cart quantity, or quoted total get new UUIDs', () => {
  const input = draft();
  const first = createSheetOrderAttempt(endpoint, input);
  assert.match(first.request_id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i);
  assert.equal(createSheetOrderAttempt(endpoint, input, first), first);
  for (const changed of [
    { ...input, delivery_address: 'Changed address' },
    { ...input, cart_items: input.cart_items.map(item => ({ ...item, quantity: 3 })) },
    { ...input, expected_total: 461 },
  ]) assert.notEqual(createSheetOrderAttempt(endpoint, changed, first).request_id, first.request_id);
  assert.throws(() => createSheetOrderAttempt(endpoint, { ...input, expected_total: NaN }), SheetOrderSubmissionError);
  assert.throws(() => createSheetOrderAttempt(endpoint, { ...input, expected_total: -1 }), SheetOrderSubmissionError);
});

test('only an explicit persisted acknowledgement returns a tagged receipt and the transport uses a readable credential-free POST', async () => {
  const attempt = createSheetOrderAttempt(endpoint, draft());
  const result = await submitSheetOrder(attempt, { fetcher: async (url, options) => {
    assert.equal(url, endpoint);
    assert.equal(options?.method, 'POST');
    assert.equal(options?.credentials, 'omit');
    assert.equal(options?.redirect, 'follow');
    assert.equal(options?.mode, 'cors');
    assert.equal(new Headers(options?.headers).get('Content-Type'), 'text/plain;charset=UTF-8');
    assert.equal(options?.body, attempt.body);
    return new Response(JSON.stringify({ success: true, persisted: true, order: receipt() }), { status: 200 });
  } });
  assert.equal(result.persistence, 'google_sheets');
  assert.equal(result.payment_status, 'pending');
  assert.equal(result.cod_collected, false);
});

test('missing, malformed, or paid acknowledgements stay unconfirmed instead of clearing an order', async () => {
  const attempt = createSheetOrderAttempt(endpoint, draft());
  const bodies = [
    { success: true, order: receipt() },
    { success: true, persisted: true, order: receipt({ items: [] }) },
    { success: true, persisted: true, order: receipt({ payment_status: 'paid' }) },
    { success: false, error: 'Write state unknown' },
  ];
  for (const body of bodies) await assert.rejects(submitSheetOrder(attempt, { fetcher: jsonFetch(body) }), error => error instanceof SheetOrderSubmissionError && error.ambiguous && error.request_id === attempt.request_id);
  await assert.rejects(submitSheetOrder(attempt, { fetcher: async () => new Response('<html>sign in</html>') }), error => error instanceof SheetOrderSubmissionError && error.ambiguous);
  assert.equal(createSheetOrderAttempt(endpoint, draft(), attempt).request_id, attempt.request_id);
});

test('explicit validation or price-race rejection is definite while HTTP and network failures are ambiguous', async () => {
  const attempt = createSheetOrderAttempt(endpoint, draft());
  await assert.rejects(submitSheetOrder(attempt, { fetcher: jsonFetch({ success: false, persisted: false, error: 'Prices changed. Review your total.' }) }), error => error instanceof SheetOrderSubmissionError && !error.ambiguous && error.message.includes('Prices changed'));
  await assert.rejects(submitSheetOrder(attempt, { fetcher: async () => new Response('Unavailable', { status: 503 }) }), error => error instanceof SheetOrderSubmissionError && error.ambiguous);
  await assert.rejects(submitSheetOrder(attempt, { fetcher: async () => { throw new TypeError('Network unavailable'); } }), error => error instanceof SheetOrderSubmissionError && error.ambiguous);
});

test('timeout preserves the same order reference for a later retry', async () => {
  const attempt = createSheetOrderAttempt(endpoint, draft());
  const fetcher: typeof fetch = async (_url, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new Error('Aborted'))));
  await assert.rejects(submitSheetOrder(attempt, { timeoutMs: 5, fetcher }), error => error instanceof SheetOrderSubmissionError && error.ambiguous && error.request_id === attempt.request_id);
  assert.equal(createSheetOrderAttempt(endpoint, draft(), attempt).request_id, attempt.request_id);
});

test('live quote math preserves fractional discounts, zero caps, and delivery fees with oversized fixed coupons', () => {
  const percentage = { is_active: true, min_order_amount: 0, discount_type: 'percentage' as const, discount_value: 12.5 };
  assert.deepEqual(calculateSheetOrderEstimate(100.5, 60, percentage), { discount: 12.56, total: 147.94 });
  assert.deepEqual(calculateSheetOrderEstimate(199.99, 25.5, { ...percentage, discount_value: 7.5 }), { discount: 15, total: 210.49 });
  assert.deepEqual(calculateSheetOrderEstimate(100, 60, { ...percentage, max_discount_amount: 0 }), { discount: 0, total: 160 });
  assert.deepEqual(calculateSheetOrderEstimate(100, 60, { ...percentage, discount_type: 'fixed', discount_value: 500 }), { discount: 100, total: 60 });
  assert.deepEqual(calculateSheetOrderEstimate(100.5, 12.345, { ...percentage, discount_type: 'fixed', discount_value: 10.125 }), { discount: 10.13, total: 102.72 });
});

test('receipt validation accepts picked_up and private receipt cache survives blocked browser storage without mixing demo orders', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    const data = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) } });
    const confirmed = receipt({ persistence: 'google_sheets', status: 'picked_up' });
    assert.equal(isValidSheetOrderReceipt(confirmed), true);
    assert.equal(rememberConfirmedSheetOrder(confirmed), true);
    assert.equal(rememberConfirmedSheetOrder(confirmed), true);
    assert.equal(loadConfirmedSheetOrders().filter(order => order.id === confirmed.id).length, 1);
    assert.ok(data.has('aurora_sheet_order_receipts_v1'));
    assert.equal(rememberConfirmedSheetOrder(receipt({ persistence: 'local_demo' })), false);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Storage denied'); } });
    assert.ok(loadConfirmedSheetOrders().some(order => order.id === confirmed.id));
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('live checkout has COD-only copy while inactive live ordering remains an explicit device-only demo', () => {
  const props = { isOpen: true, onClose() {}, items: [], currency: '৳', zones: [], slots: [], onOrderSuccess() {} };
  const demo = renderToStaticMarkup(React.createElement(CheckoutModal, props));
  const live = renderToStaticMarkup(React.createElement(CheckoutModal, { ...props, sheetOrderEndpoint: endpoint }));
  assert.ok(demo.includes('Live Google Sheets ordering is not activated yet.'));
  assert.ok(demo.includes('Save demo order'));
  assert.ok(demo.includes('bKash'));
  assert.ok(live.includes('Google Sheets confirms your order was saved'));
  assert.ok(live.includes('Place cash-on-delivery order'));
  assert.ok(live.includes('Estimated total'));
  assert.ok(!live.includes('bKash') && !live.includes('Preview only') && !live.includes('Save demo order'));
  assert.equal(renderToStaticMarkup(React.createElement(CheckoutModal, { ...props, isOpen: false })), '');
});

test('an ambiguous frozen attempt replays original bytes and UUID after current cart and quote change', async () => {
  const currentDraft = draft();
  const frozen = createSheetOrderAttempt(endpoint, currentDraft);
  const originalBody = frozen.body;
  await assert.rejects(submitSheetOrder(frozen, { fetcher: async () => { throw new TypeError('Response lost'); } }), error => error instanceof SheetOrderSubmissionError && error.ambiguous);
  currentDraft.cart_items = [];
  currentDraft.delivery_zone_id = 'zone-no-longer-available';
  currentDraft.expected_total = 999;
  const result = await submitSheetOrder(frozen, { fetcher: async (_url, options) => {
    assert.equal(options?.body, originalBody);
    const replay = JSON.parse(String(options?.body));
    assert.equal(replay.request_id, frozen.request_id);
    assert.equal(replay.expected_total, 460);
    assert.equal(replay.delivery_zone_id, 'zone-1');
    assert.equal(replay.cart_items.length, 1);
    return new Response(JSON.stringify({ success: true, persisted: true, order: receipt() }));
  } });
  assert.equal(result.persistence, 'google_sheets');
});
