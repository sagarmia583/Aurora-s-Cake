import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import React, { act } from 'react';
import { create, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import { CheckoutModal } from '../src/components/CheckoutModal';
import { mockDb } from '../src/services/mockDatabase';
import type { CartItem, Order, Product } from '../src/types';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const endpoint = 'https://script.google.com/macros/s/test_deployment/exec';
const variant = { id: 'v1', product_id: 'p1', name: 'Small', weight_grams: 500, price: 200, is_active: true };
const product: Product = {
  id: 'p1', name: 'Test cake', slug: 'test-cake', category_id: 'c1', description: 'A test cake', base_price: 200,
  image_url: '', gallery_images: [], is_active: true, is_featured: false, rating: 0, review_count: 0,
  variants: [variant], allowed_flavor_ids: [], allowed_addon_ids: [],
};
const item: CartItem = {
  cart_item_id: 'cart-1', product, selected_variant: variant, selected_addons: [], writing_message: '',
  quantity: 2, unit_price: 200, total_price: 400,
};
const zone = { id: 'zone-1', name: 'Test zone', delivery_fee: 60, estimated_time: 'Today', is_active: true };
const receipt = (): Order => ({
  id: 'order-1', order_number: 'AC-1', customer_name: 'Test buyer', customer_phone: '0000000000', delivery_address: 'Test address',
  delivery_zone: zone, delivery_slot: 'Morning', delivery_date: '2099-12-01', status: 'pending', subtotal: 400, delivery_fee: 60,
  discount_amount: 0, total_amount: 460, payment_method: 'cod', payment_status: 'pending', delivery_otp: '',
  cod_amount: 460, cod_collected: false, created_at: '2099-12-01T00:00:00.000Z', updated_at: '2099-12-01T00:00:00.000Z',
  items: [{ id: 'i1', order_id: 'order-1', product_id: 'p1', product_name: 'Test cake', variant_name: 'Small', unit_price: 200, quantity: 2, subtotal: 400, addons: [] }], history: [],
});
type Props = React.ComponentProps<typeof CheckoutModal>;
function propsFor(t: TestContext, changes: Partial<Props> = {}) {
  return { isOpen: true, items: [item], currency: '৳', zones: [zone],
    slots: [{ id: 'slot-1', slot_label: 'Morning', is_active: true }],
    sheetOrderEndpoint: endpoint, ...changes, onClose: t.mock.fn(() => {}), onOrderSuccess: t.mock.fn((_order: Order) => {}) };
}
async function mount(t: TestContext, props: Props) {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(React.createElement(CheckoutModal, props)); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  return renderer;
}
async function update(renderer: ReactTestRenderer, props: Props) {
  await act(async () => renderer.update(React.createElement(CheckoutModal, props)));
}
async function fill(renderer: ReactTestRenderer) {
  for (const [label, value] of [['Full name', 'Test buyer'], ['Mobile number', '0000000000'], ['Street address', 'Test address'], ['Delivery date', '2099-12-01']]) {
    await act(async () => renderer.root.findByProps({ 'aria-label': label }).props.onChange({ target: { value } }));
  }
}
const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());
function content(node: ReactTestInstance): string {
  return node.children.map(child => typeof child === 'string' ? child : content(child)).join('');
}
function retryButton(renderer: ReactTestRenderer) {
  return renderer.root.findAllByType('button').find(button => content(button).includes('Retry original order'))!;
}
async function submit(renderer: ReactTestRenderer) {
  await act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
}

// This exercises an existing live dialog across the exact public-flag transition
// that previously changed its submit handler to the device-only demo path.
test('freezing an open live checkout blocks fresh submissions without changing it to a local demo', async t => {
  const calls: string[] = [];
  const fetcher: typeof fetch = async (_url, options) => { calls.push(String(options?.body)); throw new Error('No submit should occur while paused'); };
  t.mock.method(globalThis, 'fetch', fetcher);
  const demo = t.mock.method(mockDb, 'createSecureOrder', async () => ({ success: true, order: receipt() }));
  const props = propsFor(t);
  const renderer = await mount(t, props);
  await fill(renderer);
  await update(renderer, { ...props, sheetOrderEndpoint: undefined, orderingPaused: true });
  assert.match(text(renderer), /Cash-on-delivery checkout/);
  assert.match(text(renderer), /Online ordering is temporarily paused/);
  assert.doesNotMatch(text(renderer), /Save demo order|Demo checkout|bKash/);
  assert.equal(renderer.root.findByProps({ type: 'submit' }).props.disabled, true);
  await submit(renderer); // The handler must enforce the pause as well as the button.
  assert.equal(calls.length, 0);
  assert.equal(demo.mock.callCount(), 0);
  assert.equal(props.onClose.mock.callCount(), 0);
  assert.equal(props.onOrderSuccess.mock.callCount(), 0);
});

test('migration freeze keeps an ambiguous attempt, and retries replay the same body and UUID after close/reopen and refresh', async t => {
  const calls: { url: string; body: string }[] = [];
  let confirm = false;
  const fetcher: typeof fetch = async (url, options) => {
    calls.push({ url: String(url), body: String(options?.body) });
    return new Response(JSON.stringify(confirm ? { success: true, persisted: true, order: receipt() }
      : { success: false, code: 'migration_frozen', retryable: true }), { status: 200 });
  };
  t.mock.method(globalThis, 'fetch', fetcher);
  const demo = t.mock.method(mockDb, 'createSecureOrder', async () => ({ success: true, order: receipt() }));
  const props = propsFor(t);
  const renderer = await mount(t, props);
  await fill(renderer);
  await submit(renderer);
  assert.equal(calls.length, 1);
  const original = calls[0];
  const requestId = JSON.parse(original.body).request_id;
  assert.match(requestId, /^[a-f0-9-]{36}$/);
  assert.match(text(renderer), new RegExp(requestId));
  assert.ok(retryButton(renderer));

  // Catalog refresh can remove current options, and the legacy prop can vanish;
  // neither event may replace or validate away the frozen original attempt.
  const paused = { ...props, sheetOrderEndpoint: undefined, orderingPaused: true, items: [], zones: [], slots: [] };
  await update(renderer, paused);
  await update(renderer, { ...paused, isOpen: false });
  assert.equal(renderer.toJSON(), null);
  await update(renderer, paused);
  assert.match(text(renderer), new RegExp(requestId));
  assert.match(text(renderer), /Cash-on-delivery checkout/);
  assert.equal(retryButton(renderer).props.disabled, false);
  assert.equal(props.onClose.mock.callCount(), 0);
  await act(async () => retryButton(renderer).props.onClick());
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], original);
  assert.match(text(renderer), new RegExp(requestId));
  assert.equal(props.onOrderSuccess.mock.callCount(), 0);

  confirm = true;
  await update(renderer, { ...paused, orderingPaused: false, sheetOrderEndpoint: 'https://script.google.com/macros/s/new_deployment/exec' });
  await act(async () => retryButton(renderer).props.onClick());
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[2], original);
  assert.equal(demo.mock.callCount(), 0);
  assert.equal(props.onOrderSuccess.mock.callCount(), 1);
  assert.equal(props.onClose.mock.callCount(), 1);
  const saved = props.onOrderSuccess.mock.calls[0].arguments[0] as Order;
  assert.equal(saved.persistence, 'google_sheets');
});

test('an initially deliberate demo remains a demo when live settings arrive later', async t => {
  const fetcher: typeof fetch = async () => { throw new Error('A deliberate demo must not be submitted to the live bakery'); };
  const network = t.mock.method(globalThis, 'fetch', fetcher);
  const demo = t.mock.method(mockDb, 'createSecureOrder', async () => ({ success: true, order: receipt() }));
  const props = propsFor(t, { sheetOrderEndpoint: undefined });
  const renderer = await mount(t, props);
  await fill(renderer);
  await update(renderer, { ...props, sheetOrderEndpoint: endpoint });
  assert.match(text(renderer), /Demo checkout/);
  await submit(renderer);
  assert.equal(network.mock.callCount(), 0);
  assert.equal(demo.mock.callCount(), 1);
  const saved = props.onOrderSuccess.mock.calls[0].arguments[0] as Order;
  assert.equal(saved.persistence, 'local_demo');
});

test('a closed, unstarted checkout captures live intent only when it first opens', async t => {
  const props = propsFor(t, { isOpen: false, sheetOrderEndpoint: undefined });
  const renderer = await mount(t, props);
  assert.equal(renderer.toJSON(), null);
  await update(renderer, { ...props, isOpen: true, sheetOrderEndpoint: endpoint, orderingPaused: true });
  assert.match(text(renderer), /Cash-on-delivery checkout/);
  assert.match(text(renderer), /Ordering temporarily paused/);
  assert.doesNotMatch(text(renderer), /Save demo order|Demo checkout/);
});
