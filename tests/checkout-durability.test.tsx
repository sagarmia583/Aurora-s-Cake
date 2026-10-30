import assert from 'node:assert/strict';
import test, { beforeEach, afterEach, type TestContext } from 'node:test';
import React, { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { CheckoutModal } from '../src/components/CheckoutModal';
import { mockDb } from '../src/services/mockDatabase';
import { createSheetOrderAttempt } from '../src/services/googleSheetOrders';
import * as recovery from '../src/services/checkoutRecovery';
import { DEFAULT_PUBLIC_SITE_DATA } from '../src/content/defaultSiteData';
import type { CartItem, Order } from '../src/types';
import type { SheetOrderDraft } from '../src/services/googleSheetOrders';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const endpoint = 'https://script.google.com/macros/s/test_deployment/exec';
const memoryStorage = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
};
let storage = memoryStorage(), originalStorage: PropertyDescriptor | undefined;
let originalNavigator: PropertyDescriptor | undefined;
beforeEach(() => {
  originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let queue: Promise<unknown> = Promise.resolve();
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: {
    request: (_name: string, callback: () => unknown) => { const result = queue.then(callback); queue = result.catch(() => {}); return result; },
  } } });
});
afterEach(() => { if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator); else Reflect.deleteProperty(globalThis, 'navigator'); });
beforeEach(() => {
  storage = memoryStorage(); originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
});
afterEach(() => { if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage); else Reflect.deleteProperty(globalThis, 'localStorage'); });
function fixture() {
  const data = structuredClone(DEFAULT_PUBLIC_SITE_DATA), product = data.products[0], variant = product.variants[0];
  const unit = variant.sale_price ?? variant.price;
  const item: CartItem = { cart_item_id: 'original-line', product, selected_variant: variant, selected_addons: [], writing_message: 'A birthday', quantity: 2, unit_price: unit, total_price: unit * 2 };
  const zone = data.zones[0], slot = data.slots[0];
  const draft: SheetOrderDraft = { customer_name: 'Offline buyer', customer_phone: '01700000000', delivery_address: 'Offline private test address',
    delivery_zone_id: zone.id, delivery_slot: slot.slot_label, delivery_date: '2099-12-01', payment_method: 'cod', expected_total: item.total_price + zone.delivery_fee,
    cart_items: [{ product_id: product.id, variant_id: variant.id, addon_ids: [], writing_message: item.writing_message, quantity: item.quantity }] };
  const order: Order = { id: 'ord_test', order_number: 'AC-test', customer_name: draft.customer_name, customer_phone: draft.customer_phone, delivery_address: draft.delivery_address,
    delivery_zone: zone, delivery_slot: slot.slot_label, delivery_date: draft.delivery_date, status: 'pending', subtotal: item.total_price, delivery_fee: zone.delivery_fee,
    discount_amount: 0, total_amount: draft.expected_total!, payment_method: 'cod', payment_status: 'pending', delivery_otp: '', cod_amount: draft.expected_total!, cod_collected: false,
    created_at: '2099-12-01T00:00:00.000Z', updated_at: '2099-12-01T00:00:00.000Z',
    items: [{ id: 'test-item', order_id: 'ord_test', product_id: product.id, product_name: product.name, variant_name: variant.name, writing_message: item.writing_message, unit_price: unit, quantity: 2, subtotal: item.total_price, addons: [] }], history: [], persistence: 'google_sheets' };
  return { data, item, draft, order, zone, slot };
}
const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());
const buttonText = (node: any): string => node.children.map((child: any) => typeof child === 'string' ? child : buttonText(child)).join('');
async function mount(t: TestContext, props: React.ComponentProps<typeof CheckoutModal>) {
  if (props.sheetOrderEndpoint && props.items.length && !localStorage.getItem('cake_cart_items_v1')) localStorage.setItem('cake_cart_items_v1', JSON.stringify(props.items));
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(React.createElement(CheckoutModal, props)); });
  let active = true;
  const close = async () => { if (active) { active = false; await act(async () => renderer.unmount()); } };
  t.after(close);
  return { renderer, close };
}
async function fill(renderer: ReactTestRenderer, draft: SheetOrderDraft) {
  for (const [label, value] of [['Full name', draft.customer_name], ['Mobile number', draft.customer_phone], ['Street address', draft.delivery_address], ['Delivery date', draft.delivery_date]])
    await act(async () => renderer.root.findByProps({ 'aria-label': label }).props.onChange({ target: { value } }));
}

test('a response lost after commit survives a full component reload and replays one durable UUID and exact body', async t => {
  const f = fixture(), saved = new Map<string, Order>(), posts: string[] = [];
  let loseResponse = true;
  storage.setItem('cake_cart_items_v1', JSON.stringify([f.item]));
  t.mock.method(globalThis, 'fetch', async (_url: unknown, options?: RequestInit) => {
    const body = String(options?.body), input = JSON.parse(body); posts.push(body);
    assert.equal(recovery.inspectPendingCheckout(endpoint).status, 'ready', 'the reference must be durable BEFORE POST');
    if (!saved.has(input.request_id)) {
      const id = 'ord_' + input.request_id;
      saved.set(input.request_id, { ...f.order, id, order_number: 'AC-20991201-' + input.request_id.replaceAll('-', '').toUpperCase(), customer_access_token: 'a'.repeat(72),
        items: f.order.items.map((item, i) => ({ ...item, order_id: id, variant_id: input.cart_items[i].variant_id,
          flavor_id: input.cart_items[i].flavor_id || '', writing_message: input.cart_items[i].writing_message })) });
    }
    if (loseResponse) throw new TypeError('Backend committed, then response was lost');
    return new Response(JSON.stringify({ success: true, persisted: true, order: saved.get(input.request_id) }));
  });
  const success = t.mock.fn((_order: Order, completion?: recovery.CheckoutCompletion) => {
    assert.ok(completion); recovery.settleCheckoutCart(recovery.loadCheckoutCart(), completion);
  });
  const props = { isOpen: true, onClose() {}, onOrderSuccess: success, items: [f.item], currency: '৳', zones: [f.zone], slots: [f.slot], sheetOrderEndpoint: endpoint };
  const first = await mount(t, props); await fill(first.renderer, f.draft);
  await act(async () => first.renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  const originalId = JSON.parse(posts[0]).request_id;
  assert.match(text(first.renderer), new RegExp(originalId)); await first.close();
  loseResponse = false;
  const second = await mount(t, { ...props, orderingPaused: true, items: [], zones: [], slots: [] });
  assert.match(text(second.renderer), new RegExp(originalId));
  const retry = second.renderer.root.findAllByType('button').find(button => buttonText(button).includes('Retry original order'))!;
  assert.ok(retry); await act(async () => retry.props.onClick());
  assert.equal(saved.size, 1); assert.equal(posts.length, 2); assert.equal(posts[1], posts[0]);
  assert.equal(success.mock.callCount(), 1); assert.equal(recovery.inspectPendingCheckout(endpoint).status, 'empty');
  assert.deepEqual(recovery.loadCheckoutCart(), []);
});

test('unavailable or silently failing durable storage blocks a new live POST', async t => {
  const f = fixture();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => key === 'cake_cart_items_v1' ? JSON.stringify([f.item]) : null, setItem() {}, removeItem() {} } });
  const network = t.mock.method(globalThis, 'fetch', async () => { throw new Error('must not send'); });
  const view = await mount(t, { isOpen: true, onClose() {}, onOrderSuccess() {}, items: [f.item], currency: '৳', zones: [f.zone], slots: [f.slot], sheetOrderEndpoint: endpoint });
  await fill(view.renderer, f.draft); await act(async () => view.renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.equal(network.mock.callCount(), 0); assert.match(text(view.renderer), /could not keep your order reference/);
});

test('a definite backend rejection releases the pending reference without altering the bag', async t => {
  const f = fixture(); storage.setItem('cake_cart_items_v1', JSON.stringify([f.item]));
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ success: false, persisted: false, code: 'price_changed', error: 'Prices changed' })));
  const view = await mount(t, { isOpen: true, onClose() {}, onOrderSuccess() {}, items: [f.item], currency: '৳', zones: [f.zone], slots: [f.slot], sheetOrderEndpoint: endpoint });
  await fill(view.renderer, f.draft); await act(async () => view.renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.equal(recovery.inspectPendingCheckout(endpoint).status, 'empty');
  assert.equal(recovery.loadCheckoutCart()[0].quantity, 2); assert.match(text(view.renderer), /Prices changed/);
});

test('pending attempts are bounded, body-validated and endpoint-scoped; unresolved records cannot be replaced', async () => {
  const f = fixture(), attempt = createSheetOrderAttempt(endpoint, f.draft), lines = recovery.captureCheckoutCart([f.item]);
  storage.setItem('cake_cart_items_v1', JSON.stringify([f.item]));
  const pending = await recovery.preservePendingCheckout(attempt, lines);
  assert.equal(recovery.inspectPendingCheckout(endpoint).status, 'ready');
  const other = 'https://script.google.com/macros/s/other_deployment/exec';
  assert.equal(recovery.inspectPendingCheckout(other).status, 'blocked');
  await assert.rejects(() => recovery.preservePendingCheckout(createSheetOrderAttempt(other, f.draft), lines));
  await assert.rejects(() => recovery.preservePendingCheckout(createSheetOrderAttempt(endpoint, { ...f.draft, delivery_address: 'A changed address' }), lines), recovery.PendingCheckoutConflict);
  assert.equal(recovery.inspectPendingCheckout(endpoint).status, 'ready');
  const altered = { ...pending, attempt: { ...pending.attempt, body: pending.attempt.body.replace('Offline buyer', 'Different buyer') } };
  storage.setItem('aurora_pending_checkout_v1', JSON.stringify(altered));
  assert.equal(recovery.inspectPendingCheckout(endpoint).status, 'blocked');
  storage.setItem('aurora_pending_checkout_v1', 'x'.repeat(160_001));
  assert.equal(recovery.inspectPendingCheckout(endpoint).status, 'blocked');
});

test('confirmation subtracts original quantities once and preserves later lines, increased quantities and changed selections', () => {
  const f = fixture(), lines = recovery.captureCheckoutCart([f.item]), request = createSheetOrderAttempt(endpoint, f.draft);
  const newLine = { ...f.item, cart_item_id: 'later-addition', quantity: 1, total_price: f.item.unit_price };
  const increased = { ...f.item, quantity: 3, total_price: f.item.unit_price * 3 };
  storage.setItem('cake_cart_items_v1', JSON.stringify([increased, newLine]));
  const completion = { request_id: request.request_id, cart_lines: lines };
  const remaining = recovery.settleCheckoutCart([increased, newLine], completion);
  assert.notEqual(remaining[0].cart_item_id, 'original-line');
  assert.deepEqual(remaining.map(item => item.quantity), [1, 1]);
  assert.equal(remaining[1].cart_item_id, 'later-addition');
  assert.equal(remaining[0].total_price, f.item.unit_price);
  assert.deepEqual(recovery.settleCheckoutCart(recovery.loadCheckoutCart(), completion), remaining, 'a recovered same-ID receipt must not subtract twice');
  const changed = { ...f.item, writing_message: 'A new, unsent dedication' };
  assert.deepEqual(recovery.removeConfirmedCheckoutItems([changed], lines), [changed]);
  recovery.saveCheckoutCart(remaining);
  assert.deepEqual(recovery.settleCheckoutCart(recovery.loadCheckoutCart(), completion), remaining, 'normal cart persistence keeps completion markers');
});

test('parallel tab reservations cannot replace the first durable pending reference', async () => {
  const f = fixture(), lines = recovery.captureCheckoutCart([f.item]);
  const first = createSheetOrderAttempt(endpoint, f.draft);
  const second = createSheetOrderAttempt(endpoint, { ...f.draft, delivery_address: 'A second tab address' });
  storage.setItem('cake_cart_items_v1', JSON.stringify([f.item]));
  const results = await Promise.allSettled([recovery.preservePendingCheckout(first, lines), recovery.preservePendingCheckout(second, lines)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  const pending = recovery.inspectPendingCheckout(endpoint);
  assert.equal(pending.status, 'ready');
  if (pending.status === 'ready') assert.equal(pending.pending.attempt.request_id, first.request_id);
});

test('settlement uses later persisted additions and never resurrects a stale removed render line', () => {
  const f = fixture(), added = { ...f.item, cart_item_id: 'another-tab-new-line' };
  const completion = { request_id: crypto.randomUUID(), cart_lines: recovery.captureCheckoutCart([f.item]) };
  storage.setItem('cake_cart_items_v1', JSON.stringify([added]));
  const remaining = recovery.settleCheckoutCart([f.item], completion);
  assert.deepEqual(remaining.map(item => item.cart_item_id), ['another-tab-new-line']);
});

test('pending cleanup is locked and an older cleanup cannot erase a newer reservation', async () => {
  const f = fixture(), lines = recovery.captureCheckoutCart([f.item]);
  storage.setItem('cake_cart_items_v1', JSON.stringify([f.item]));
  const first = await recovery.preservePendingCheckout(createSheetOrderAttempt(endpoint, f.draft), lines);
  const later = { ...f.item, cart_item_id: 'later-cart-id' };
  storage.setItem('cake_cart_items_v1', JSON.stringify([later]));
  const secondAttempt = createSheetOrderAttempt(endpoint, { ...f.draft, delivery_address: 'Another tab address' });
  const results = await Promise.all([recovery.releasePendingCheckout(first), recovery.preservePendingCheckout(secondAttempt, recovery.captureCheckoutCart([later])), recovery.releasePendingCheckout(first)]);
  assert.equal(results[0], true); assert.equal(results[2], false);
  const current = recovery.inspectPendingCheckout(endpoint);
  assert.equal(current.status, 'ready');
  if (current.status === 'ready') assert.equal(current.pending.attempt.request_id, secondAttempt.request_id);
});

test('a stale tab cannot resubmit fulfilled IDs or overwrite a later unsent partial residual', async () => {
  const f = fixture(), lines = recovery.captureCheckoutCart([f.item]);
  const increased = { ...f.item, quantity: 3, total_price: f.item.unit_price * 3 };
  storage.setItem('cake_cart_items_v1', JSON.stringify([increased]));
  const first = await recovery.preservePendingCheckout(createSheetOrderAttempt(endpoint, f.draft), lines);
  const residual = recovery.settleCheckoutCart([increased], { request_id: first.attempt.request_id, cart_lines: lines });
  await recovery.releasePendingCheckout(first);
  assert.equal(residual[0].quantity, 1); assert.notEqual(residual[0].cart_item_id, f.item.cart_item_id);
  await assert.rejects(() => recovery.preservePendingCheckout(createSheetOrderAttempt(endpoint, f.draft), lines), /updated or already ordered/);
  assert.throws(() => recovery.saveCheckoutCart([f.item]), /changed in another tab/);
  assert.deepEqual(recovery.loadCheckoutCart(), residual);
});

test('local demo completion supplies original cart proof and preserves unsent additions without a live POST', async t => {
  const f = fixture(), later = { ...f.item, cart_item_id: 'demo-later-item', quantity: 1, total_price: f.item.unit_price };
  storage.setItem('cake_cart_items_v1', JSON.stringify([f.item, later]));
  t.mock.method(mockDb, 'createSecureOrder', async () => ({ success: true, order: f.order }));
  const network = t.mock.method(globalThis, 'fetch', async () => { throw new Error('A demo must never become a live order'); });
  const success = t.mock.fn((order: Order, completion?: recovery.CheckoutCompletion) => {
    assert.equal(order.persistence, 'local_demo'); assert.ok(completion);
    assert.deepEqual(completion.cart_lines.map(line => line.cart_item_id), [f.item.cart_item_id]);
    recovery.settleCheckoutCart(recovery.loadCheckoutCart(), completion);
  });
  const close = t.mock.fn();
  const view = await mount(t, { isOpen: true, onClose: close, onOrderSuccess: success, items: [f.item], currency: '৳', zones: [f.zone], slots: [f.slot] });
  await fill(view.renderer, f.draft); await act(async () => view.renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.equal(success.mock.callCount(), 1); assert.equal(close.mock.callCount(), 1); assert.equal(network.mock.callCount(), 0);
  assert.deepEqual(recovery.loadCheckoutCart().map(item => item.cart_item_id), ['demo-later-item']);
});

// Render the actual App state and event handlers. Only external APIs and
// peripheral UI are replaced; durable bag settlement remains real.
test('App preserves an unrelated bag line added while its original checkout is unconfirmed', async t => {
  const f = fixture(), globals = ['window', 'document', 'sessionStorage', '__checkoutAudit'] as const;
  const previous = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const audit = { data: { ...f.data, order_submission_enabled: true, settings: { ...f.data.settings, accepting_orders: true } }, receipts: [] as Order[], recovery };
  Object.assign(globalThis, { __checkoutAudit: audit, sessionStorage: memoryStorage(),
    document: { visibilityState: 'visible', querySelector: () => null, addEventListener() {}, removeEventListener() {} },
    window: { location: { hostname: 'localhost', protocol: 'http:' }, setTimeout: () => 1, clearTimeout() {}, addEventListener() {}, removeEventListener() {} } });
  t.after(() => { for (const key of globals) { const descriptor = previous.get(key); if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });
  const stubs: Record<string, string> = {
    './hooks/useGoogleSheetContent': `export const useGoogleSheetContent=()=>({data:globalThis.__checkoutAudit.data,endpoint:${JSON.stringify(endpoint)},status:{state:'connected',source:'google_sheets'},refresh:async()=>{},updateEndpoint(){}});`,
    './services/mockDatabase': `export const mockDb={applyPublicSnapshot(){},subscribe:()=>()=>{},getOrders:()=>[],getCustomCakes:()=>[],getAuditLogs:()=>[]};`,
    './services/backendDatabaseStatus': `export const unknownBackendDatabaseStatus={available:false,backend:'unknown'};export const loadBackendDatabaseStatus=async()=>unknownBackendDatabaseStatus;`,
    './services/googleSheetOrders': `export const loadConfirmedSheetOrders=()=>globalThis.__checkoutAudit.receipts;export const rememberConfirmedSheetOrder=o=>{globalThis.__checkoutAudit.receipts.push(o);return true};export const removeConfirmedSheetOrdersById=()=>{};`,
    './services/sheetStaffApi': `export const fetchCustomerOrderStatus=async(_e,o)=>({...o});export const redeemLegacyReceiptAccess=async()=>({});`,
    './services/sheetOrderHistorySync': `export const isConfirmedDeletedSheetOrder=()=>false;export const verifyStoredOrderHistory=async()=>({current:[],deletedIds:[],failedIds:[]});`,
    './services/phoneCustomerApi': `export const syncPhoneCustomerConfirmedOrder=async()=> 'linked_only';`,
    './services/staffWorkspaceSession': `export const getBrowserWorkspaceStorage=()=>null;export const isStaffWorkspaceOpen=()=>false;export const setStaffWorkspaceOpen=()=>{};`,
    './services/reconcilePublicCart': `export const reconcilePublicCart=items=>({items,changed:false});export const reorderFromPublicOrder=()=>({items:[],changed:false});`,
    './services/checkoutRecovery': `export const {inspectPendingCheckout,loadCheckoutCart,saveCheckoutCart,settleCheckoutCart}=globalThis.__checkoutAudit.recovery;`,
  };
  const compiled = await build({ stdin: { contents: fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8'), loader: 'tsx', sourcefile: 'src/App.tsx' }, bundle: true, write: false, format: 'cjs', platform: 'node',
    external: ['react', 'lucide-react'], define: { 'import.meta.env.DEV': 'false' }, plugins: [{ name: 'offline-app-boundaries', setup(build) {
      build.onResolve({ filter: /^\.\// }, args => ({ path: args.path, namespace: 'audit' }));
      build.onLoad({ filter: /.*/, namespace: 'audit' }, args => {
        if (stubs[args.path]) return { contents: stubs[args.path], loader: 'js' };
        if (args.path.startsWith('./components/')) { const name = args.path.split('/').at(-1); return { contents: `import React from 'react';export const ${name}=props=>React.createElement('audit-${name}',props);`, loader: 'js' }; }
        throw new Error('Unstubbed audit boundary ' + args.path);
      });
    } }] });
  const require = createRequire(import.meta.url), target = { exports: {} as { default?: React.ComponentType } };
  new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(require, target, target.exports);
  storage.setItem('cake_cart_items_v1', JSON.stringify([f.item]));
  let app!: ReactTestRenderer; await act(async () => { app = create(React.createElement(target.exports.default!)); });
  try {
    const host = (name: string) => app.root.find(node => node.type === name);
    await act(async () => host('audit-Navbar').props.onOrderNow());
    const original = host('audit-CheckoutModal'); await act(async () => original.props.onClose());
    await act(async () => host('audit-CustomerStorefront').props.onSelectProduct(f.item.product));
    const added = { ...f.item, cart_item_id: 'new-unsent-line', quantity: 1, total_price: f.item.unit_price };
    await act(async () => host('audit-ProductDetailModal').props.onAddToCart(added));
    assert.equal(recovery.loadCheckoutCart().length, 2);
    await act(async () => original.props.onOrderSuccess(f.order, { request_id: crypto.randomUUID(), cart_lines: recovery.captureCheckoutCart([f.item]) }));
    assert.deepEqual(recovery.loadCheckoutCart().map(item => item.cart_item_id), ['new-unsent-line']);
    assert.match(JSON.stringify(app.toJSON()), /Cakes added after that checkout are still in your bag/);
  } finally { await act(async () => app.unmount()); }
});
