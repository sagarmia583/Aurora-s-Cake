import test from 'node:test';
import assert from 'node:assert/strict';
import type { Order } from '../src/types';
import {
  computeCollectionStatement,
  getStatementPaymentBreakdown,
  normalizeDateToYMD,
} from '../src/services/collectionStatementService';
import type { CollectionFilterOptions } from '../src/services/collectionStatementService';

const filters: CollectionFilterOptions = {
  datePreset: 'custom',
  startDate: '2026-11-01',
  endDate: '2026-11-30',
  dateField: 'created_at',
  statusFilter: 'all_valid',
  paymentMethodFilter: 'all',
};
const order = (
  id: string,
  extra: Partial<Order> = {},
): Order => ({
  id,
  created_at: '2026-11-07T10:00:00.000Z',
  delivery_date: '2026-11-07',
  status: 'pending',
  subtotal: 1100,
  discount_amount: 100,
  delivery_fee: 0,
  total_amount: 1000,
  payment_method: 'cod',
  payment_status: 'pending',
  advance_paid_amount: 0,
  cod_collected: false,
  ...extra,
} as Order);
const report = (...orders: Order[]) => computeCollectionStatement(orders, filters);

test('confirmed COD collection counts the advance and remaining cash exactly once', () => {
  const result = report(order('cod', {
    status: 'delivered', cod_collected: true, payment_status: 'paid', advance_paid_amount: 250,
  }));
  assert.equal(result.advanceCollected, 250);
  assert.equal(result.cashCollected, 750);
  assert.equal(result.digitalCollected, 0);
  assert.equal(result.totalActualCollected, 1000);
  assert.equal(result.totalDueAmount, 0);
  assert.equal(result.methodSummaries[0].collectedAmount, 1000);
});

test('a legacy delivered status without explicit cash confirmation does not invent collection', () => {
  const result = report(order('unconfirmed', { status: 'delivered', cod_collected: false }));
  assert.equal(result.cashCollected, 0);
  assert.equal(result.totalDueAmount, 1000);
  assert.equal(result.methodSummaries[0].collectedAmount, 0);
});

test('paid bKash order with a recorded advance cannot be double counted', () => {
  const result = report(order('paid', {
    payment_method: 'bkash', payment_status: 'paid', advance_paid_amount: 300,
  }));
  assert.equal(result.advanceCollected, 300);
  assert.equal(result.digitalCollected, 700);
  assert.equal(result.totalActualCollected, 1000);
  assert.equal(result.methodSummaries[0].collectedAmount, 1000);
  assert.equal(result.methodSummaries[0].dueAmount, 0);
});

test('unpaid digital remainder stays due rather than recorded as received', () => {
  const result = report(order('partial', {
    payment_method: 'nagad', payment_status: 'pending', advance_paid_amount: 300,
  }));
  assert.equal(result.advanceCollected, 300);
  assert.equal(result.digitalCollected, 0);
  assert.equal(result.totalDueAmount, 700);
  assert.equal(result.totalActualCollected, 300);
});

test('discount is not deducted twice from an already discounted total_amount', () => {
  const result = report(order('discount', {
    subtotal: 1000, delivery_fee: 50, discount_amount: 150, total_amount: 900,
  }));
  assert.equal(result.grossSales, 900);
  assert.equal(result.totalDiscounts, 150);
  assert.equal(result.netSales, 900);
});

test('collection totals reconcile across COD, bKash and pending payment methods', () => {
  const result = report(
    order('cod', { cod_collected: true, advance_paid_amount: 200 }),
    order('bkash', { payment_method: 'bkash', payment_status: 'paid', advance_paid_amount: 400 }),
    order('nagad', { payment_method: 'nagad', advance_paid_amount: 300 }),
  );
  assert.equal(result.grossSales, 3000);
  assert.equal(result.cashCollected, 800);
  assert.equal(result.advanceCollected, 900);
  assert.equal(result.digitalCollected, 600);
  assert.equal(result.totalDueAmount, 700);
  assert.equal(result.totalActualCollected + result.totalDueAmount, result.grossSales);
  assert.equal(result.methodSummaries.reduce((sum, method) => sum + method.collectedAmount, 0), result.totalActualCollected);
  assert.equal(result.methodSummaries.reduce((sum, method) => sum + method.dueAmount, 0), result.totalDueAmount);
});

test('invalid and missing dates cannot leak into a dated financial statement', () => {
  assert.equal(normalizeDateToYMD('2026-02-30'), '');
  assert.equal(normalizeDateToYMD('2026-13-02'), '');
  assert.equal(normalizeDateToYMD('not-a-date'), '');
  assert.equal(normalizeDateToYMD('2024-02-29T00:00:00Z'), '2024-02-29');
  const result = report(
    order('valid'),
    order('missing', { created_at: '' }),
    order('invalid', { created_at: '2026-02-30' }),
    order('outside', { created_at: '2026-10-28' }),
  );
  assert.deepEqual(result.matchingOrders.map(item => item.id), ['valid']);
});

test('overstated advance and non-finite values never inflate received totals', () => {
  const result = getStatementPaymentBreakdown(order('clamp', {
    total_amount: 500,
    advance_paid_amount: 900,
    cod_collected: false,
  }));
  assert.deepEqual(result, { advanceCollected: 500, cashCollected: 0, digitalCollected: 0, dueAmount: 0 });
  const invalid = getStatementPaymentBreakdown(order('bad', {
    total_amount: Number.NaN,
    advance_paid_amount: -100,
  }));
  assert.deepEqual(invalid, { advanceCollected: 0, cashCollected: 0, digitalCollected: 0, dueAmount: 0 });
});
