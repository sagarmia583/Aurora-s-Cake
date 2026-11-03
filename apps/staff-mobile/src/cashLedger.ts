import type { StaffOrder, StaffSession } from './domain';

export interface CashDepositEntry {
  id: string;
  rider_id: string;
  rider_name: string;
  rider_phone?: string;
  amount: number;
  note?: string;
  deposited_at: string;
  status: 'confirmed' | 'pending';
  actor_name?: string;
}

export interface CashExpenseEntry {
  id: string;
  amount: number;
  category: string;
  note?: string;
  created_at: string;
  recorded_by: string;
}

export interface RiderCashReport {
  rider_id: string;
  rider_name: string;
  total_collected: number;
  total_deposited: number;
  cash_in_hand: number;
  delivered_orders_count: number;
  deposits: CashDepositEntry[];
}

export interface BakeryCashOverview {
  total_cod_collected: number;
  total_rider_deposited: number;
  total_cash_with_riders: number;
  counter_drawer_balance: number;
  counter_pickup_cash: number;
  total_delivered_cod_orders: number;
  total_expenses: number;
  rider_summaries: RiderCashReport[];
  recent_deposits: CashDepositEntry[];
}

/**
 * Calculates the cash amount collected for an order.
 */
export function getOrderCashAmount(order: StaffOrder): number {
  if (order.status !== 'delivered') return 0;

  if (order.due_amount !== undefined && order.due_amount !== null && !isNaN(Number(order.due_amount))) {
    return Math.max(0, Number(order.due_amount));
  }

  if (order.payment_method === 'cod' || order.cod_collected) {
    const total = Number(order.total_amount || 0);
    const advance = Number(order.advance_paid_amount || 0);
    return Math.max(0, total - advance);
  }

  return 0;
}

/**
 * Checks if order is a direct counter pickup.
 */
export function isCounterPickupOrder(order: StaffOrder): boolean {
  const addr = (order.delivery_address || '').toLowerCase();
  const zone = (order.delivery_zone_id || '').toLowerCase();
  const rider = (order.rider_id || '').toLowerCase();
  return zone === 'zone-pickup' || rider === 'pickup' || addr.includes('pickup') || addr.includes('দোকান থেকে');
}

/**
 * Checks if an order was delivered by a particular rider.
 */
export function orderMatchesRider(order: StaffOrder, riderIdentifier: string, riderName?: string): boolean {
  if (isCounterPickupOrder(order)) return false;

  const targetId = (riderIdentifier || '').toLowerCase().trim();
  const targetName = (riderName || '').toLowerCase().trim();
  const oRiderId = String(order.rider_id || '').toLowerCase().trim();
  const oRiderName = String(order.rider_name || '').toLowerCase().trim();

  if (targetId && (oRiderId === targetId || oRiderName === targetId)) return true;
  if (targetName && (oRiderName === targetName || oRiderId === targetName)) return true;

  // Fallback: If rider-1 default assignment
  if (targetId === 'rider-1' && (!oRiderId || oRiderId === 'rider-1')) return true;

  return false;
}

/**
 * Computes individual cash summary for a specific rider.
 */
export function computeRiderCashSummary(
  orders: StaffOrder[],
  deposits: CashDepositEntry[],
  riderIdentifier: string,
  riderName = 'Rider'
): RiderCashReport {
  const deliveredOrders = orders.filter(
    (o) => o.status === 'delivered' && orderMatchesRider(o, riderIdentifier, riderName)
  );

  const total_collected = deliveredOrders.reduce((sum, o) => sum + getOrderCashAmount(o), 0);

  const targetId = (riderIdentifier || '').toLowerCase().trim();
  const targetName = (riderName || '').toLowerCase().trim();

  const riderDeposits = deposits.filter((d) => {
    const dId = String(d.rider_id || '').toLowerCase().trim();
    const dName = String(d.rider_name || '').toLowerCase().trim();
    return (targetId && (dId === targetId || dName === targetId)) ||
           (targetName && (dName === targetName || dId === targetName));
  });

  const total_deposited = riderDeposits.reduce((sum, d) => sum + Number(d.amount || 0), 0);
  const cash_in_hand = Math.max(0, total_collected - total_deposited);

  return {
    rider_id: riderIdentifier,
    rider_name: riderName,
    total_collected,
    total_deposited,
    cash_in_hand,
    delivered_orders_count: deliveredOrders.length,
    deposits: riderDeposits,
  };
}

/**
 * Computes the overall bakery cash drawer & rider settlement overview for Admin/Boss.
 */
export function computeBakeryCashOverview(
  orders: StaffOrder[],
  deposits: CashDepositEntry[],
  expenses: CashExpenseEntry[] = [],
  knownRiders: Array<{ id: string; name: string }> = []
): BakeryCashOverview {
  let total_cod_collected = 0;
  let counter_pickup_cash = 0;
  let total_delivered_cod_orders = 0;

  // Track distinct riders encountered in orders or known list
  const riderMap = new Map<string, { id: string; name: string }>();
  knownRiders.forEach((r) => riderMap.set(r.id.toLowerCase(), r));

  for (const o of orders) {
    if (o.status !== 'delivered') continue;
    const cashAmt = getOrderCashAmount(o);
    if (cashAmt <= 0) continue;

    total_delivered_cod_orders++;

    if (isCounterPickupOrder(o)) {
      counter_pickup_cash += cashAmt;
    } else {
      total_cod_collected += cashAmt;
      const rId = String(o.rider_id || 'rider-1').trim();
      const rName = String(o.rider_name || 'Rider').trim();
      const key = rId.toLowerCase();
      if (!riderMap.has(key)) {
        riderMap.set(key, { id: rId, name: rName });
      }
    }
  }

  const total_rider_deposited = deposits.reduce((sum, d) => sum + Number(d.amount || 0), 0);
  const total_expenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const total_cash_with_riders = Math.max(0, total_cod_collected - total_rider_deposited);

  // Counter drawer receives rider deposits + direct store pickup sales minus expenses
  const counter_drawer_balance = Math.max(0, total_rider_deposited + counter_pickup_cash - total_expenses);

  // Generate per-rider summaries
  const rider_summaries: RiderCashReport[] = [];
  riderMap.forEach((r) => {
    rider_summaries.push(computeRiderCashSummary(orders, deposits, r.id, r.name));
  });

  const recent_deposits = [...deposits].sort(
    (a, b) => new Date(b.deposited_at).getTime() - new Date(a.deposited_at).getTime()
  );

  return {
    total_cod_collected,
    total_rider_deposited,
    total_cash_with_riders,
    counter_drawer_balance,
    counter_pickup_cash,
    total_delivered_cod_orders,
    total_expenses,
    rider_summaries,
    recent_deposits,
  };
}
