import type { Order } from '../types';
import type { StaffOrder } from './sheetStaffApi';

export type StatementOrder = Order | StaffOrder;

export type CollectionDatePreset = 'today' | 'yesterday' | 'last_7_days' | 'this_month' | 'all_time' | 'custom';
export type CollectionDateField = 'delivery_date' | 'created_at';
export type CollectionStatusFilter = 'all_valid' | 'delivered_only' | 'all';
export type CollectionPaymentFilter = 'all' | 'cod' | 'bkash' | 'online';

export interface CollectionFilterOptions {
  datePreset: CollectionDatePreset;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  dateField: CollectionDateField;
  statusFilter: CollectionStatusFilter;
  paymentMethodFilter: CollectionPaymentFilter;
}

export interface PaymentMethodSummary {
  method: string;
  label: string;
  orderCount: number;
  totalAmount: number;
  collectedAmount: number;
  dueAmount: number;
}

export interface CollectionStatementSummary {
  totalOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  pendingOrders: number;
  grossSales: number;
  totalDeliveryFees: number;
  totalDiscounts: number;
  netSales: number;
  cashCollected: number;
  advanceCollected: number;
  digitalCollected: number;
  totalActualCollected: number;
  totalDueAmount: number;
  methodSummaries: PaymentMethodSummary[];
  matchingOrders: StatementOrder[];
  startDate: string;
  endDate: string;
}

/**
 * Returns today's date formatted as YYYY-MM-DD in local time
 */
export function getLocalTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Normalizes any date string (ISO timestamp, YYYY-MM-DD, etc.) to YYYY-MM-DD
 */
export function normalizeDateToYMD(dateStr?: string): string {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  // Match standard YYYY-MM-DD at the start
  const match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    const y = match[1];
    const m = match[2].padStart(2, '0');
    const d = match[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  // If parsing as Date
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return trimmed;
}

/**
 * Computes start and end dates for a preset
 */
export function getDateRangeForPreset(preset: CollectionDatePreset, customStart?: string, customEnd?: string): { startDate: string; endDate: string } {
  const todayStr = getLocalTodayDateString();
  const now = new Date();

  switch (preset) {
    case 'today':
      return { startDate: todayStr, endDate: todayStr };

    case 'yesterday': {
      const yDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const yYear = yDate.getFullYear();
      const yMonth = String(yDate.getMonth() + 1).padStart(2, '0');
      const yDay = String(yDate.getDate()).padStart(2, '0');
      const yStr = `${yYear}-${yMonth}-${yDay}`;
      return { startDate: yStr, endDate: yStr };
    }

    case 'last_7_days': {
      const past7 = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      const pYear = past7.getFullYear();
      const pMonth = String(past7.getMonth() + 1).padStart(2, '0');
      const pDay = String(past7.getDate()).padStart(2, '0');
      return { startDate: `${pYear}-${pMonth}-${pDay}`, endDate: todayStr };
    }

    case 'this_month': {
      const mYear = now.getFullYear();
      const mMonth = String(now.getMonth() + 1).padStart(2, '0');
      return { startDate: `${mYear}-${mMonth}-01`, endDate: todayStr };
    }

    case 'all_time':
      return { startDate: '2020-01-01', endDate: '2099-12-31' };

    case 'custom':
    default:
      return {
        startDate: customStart || todayStr,
        endDate: customEnd || todayStr,
      };
  }
}

/**
 * Computes the complete collection statement summary from orders
 */
export function computeCollectionStatement(orders: StatementOrder[], options: CollectionFilterOptions): CollectionStatementSummary {
  const { startDate, endDate, dateField, statusFilter, paymentMethodFilter } = options;

  const matchingOrders = orders.filter((order) => {
    // 1. Status Filter
    if (statusFilter === 'all_valid' && order.status === 'cancelled') return false;
    if (statusFilter === 'delivered_only' && order.status !== 'delivered') return false;

    // 2. Payment Method Filter
    if (paymentMethodFilter !== 'all') {
      const method = (order.payment_method || '').toLowerCase();
      if (paymentMethodFilter === 'cod' && method !== 'cod') return false;
      if (paymentMethodFilter === 'bkash' && method !== 'bkash') return false;
      if (paymentMethodFilter === 'online' && (method === 'cod' || method === 'bkash')) return false;
    }

    // 3. Date Matching
    const rawDate = dateField === 'delivery_date' ? (order.delivery_date || order.created_at) : order.created_at;
    const ymd = normalizeDateToYMD(rawDate);
    if (!ymd) return true; // If no date, retain

    if (startDate && ymd < startDate) return false;
    if (endDate && ymd > endDate) return false;

    return true;
  });

  // Sort matching orders: newest date first, then order id
  matchingOrders.sort((a, b) => {
    const da = normalizeDateToYMD(dateField === 'delivery_date' ? (a.delivery_date || a.created_at) : a.created_at);
    const db = normalizeDateToYMD(dateField === 'delivery_date' ? (b.delivery_date || b.created_at) : b.created_at);
    return db.localeCompare(da);
  });

  let totalOrders = 0;
  let deliveredOrders = 0;
  let cancelledOrders = 0;
  let pendingOrders = 0;
  let grossSales = 0;
  let totalDeliveryFees = 0;
  let totalDiscounts = 0;
  let cashCollected = 0;
  let advanceCollected = 0;
  let digitalCollected = 0;
  let totalDueAmount = 0;

  const methodMap: Record<string, { count: number; total: number; collected: number; due: number; label: string }> = {
    cod: { count: 0, total: 0, collected: 0, due: 0, label: 'ক্যাশ অন ডেলিভারি (COD)' },
    bkash: { count: 0, total: 0, collected: 0, due: 0, label: 'বিকাশ (bKash Wallet)' },
    nagad: { count: 0, total: 0, collected: 0, due: 0, label: 'নগদ (Nagad)' },
    online: { count: 0, total: 0, collected: 0, due: 0, label: 'অনলাইন / কার্ড / অন্যান্য' },
  };

  for (const order of matchingOrders) {
    totalOrders++;
    if (order.status === 'delivered') deliveredOrders++;
    else if (order.status === 'cancelled') cancelledOrders++;
    else pendingOrders++;

    const orderTotal = Number(order.total_amount || 0);
    const orderDeliveryFee = Number(order.delivery_fee || 0);
    const orderDiscount = Number(order.discount_amount || 0);
    const advancePaid = Number(order.advance_paid_amount || 0);

    grossSales += orderTotal;
    totalDeliveryFees += orderDeliveryFee;
    totalDiscounts += orderDiscount;
    advanceCollected += advancePaid;

    const rawMethod = (order.payment_method || 'cod').toLowerCase();
    const isCod = rawMethod === 'cod';
    const isBkash = rawMethod === 'bkash';
    const isNagad = rawMethod === 'nagad';
    const methodKey = isCod ? 'cod' : isBkash ? 'bkash' : isNagad ? 'nagad' : 'online';

    if (!methodMap[methodKey]) {
      methodMap[methodKey] = { count: 0, total: 0, collected: 0, due: 0, label: rawMethod.toUpperCase() };
    }
    methodMap[methodKey].count++;
    methodMap[methodKey].total += orderTotal;

    if (isCod) {
      // Cash on delivery: cash collected on delivery if delivered or rider marked cod_collected
      const isCollected = order.status === 'delivered' || Boolean(order.cod_collected);
      const actualCash = isCollected ? Math.max(0, orderTotal - advancePaid) : 0;
      const orderDue = isCollected ? 0 : (order.due_amount ?? Math.max(0, orderTotal - advancePaid));

      cashCollected += actualCash;
      totalDueAmount += orderDue;
      methodMap[methodKey].collected += actualCash + advancePaid;
      methodMap[methodKey].due += orderDue;
    } else {
      // Prepaid (bKash/Nagad/Card)
      const isPaid = order.payment_status === 'paid' || advancePaid >= orderTotal;
      const collectedHere = isPaid ? orderTotal : advancePaid;
      const orderDue = isPaid ? 0 : Math.max(0, orderTotal - advancePaid);

      digitalCollected += collectedHere;
      totalDueAmount += orderDue;
      methodMap[methodKey].collected += collectedHere;
      methodMap[methodKey].due += orderDue;
    }
  }

  const totalActualCollected = cashCollected + advanceCollected + digitalCollected;
  const netSales = grossSales - totalDiscounts;

  const methodSummaries: PaymentMethodSummary[] = Object.keys(methodMap).map((k) => ({
    method: k,
    label: methodMap[k].label,
    orderCount: methodMap[k].count,
    totalAmount: methodMap[k].total,
    collectedAmount: methodMap[k].collected,
    dueAmount: methodMap[k].due,
  })).filter((m) => m.orderCount > 0);

  return {
    totalOrders,
    deliveredOrders,
    cancelledOrders,
    pendingOrders,
    grossSales,
    totalDeliveryFees,
    totalDiscounts,
    netSales,
    cashCollected,
    advanceCollected,
    digitalCollected,
    totalActualCollected,
    totalDueAmount,
    methodSummaries,
    matchingOrders,
    startDate,
    endDate,
  };
}
