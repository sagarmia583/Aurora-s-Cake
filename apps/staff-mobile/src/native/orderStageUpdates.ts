import {statuses, type StaffOrder, type Status} from '../domain';
import {formatOrderNumber} from '../orderNumber';

export type StageSnapshot = Record<string, {status: Status; updatedAt: string}>;
export type StageUpdate = {id: string; number: string; status: Status};

export function orderStages(orders: StaffOrder[]): StageSnapshot {
  return Object.fromEntries(orders.map(order => [order.id, {status: order.status, updatedAt: order.updated_at}]));
}

export function orderStageUpdates(before: StageSnapshot, orders: StaffOrder[]): StageUpdate[] {
  return orders.flatMap(order => {
    const previous = before[order.id];
    if (previous && previous.status === order.status && previous.updatedAt === order.updated_at) return [];
    const number = formatOrderNumber(order.order_number);
    const history = (order as StaffOrder & {history?: {status: Status; created_at: string}[]}).history;
    const since = previous ? Date.parse(previous.updatedAt) : NaN;
    const stages = Array.isArray(history) && Number.isFinite(since)
      ? history.filter(event => event && statuses.includes(event.status) && Date.parse(event.created_at) > since)
        .map(event => event.status)
      : [];
    if (stages.length === 0) {
      if (previous?.status === order.status) return [];
      stages.push(order.status);
    }
    return stages.map(status => ({id: order.id, number, status}));
  });
}
