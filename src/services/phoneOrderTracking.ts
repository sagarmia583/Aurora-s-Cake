import type { OrderStatus } from '../types';
import { privatePost } from './sheetStaffApi';

export interface PhoneTrackingStatus {
  reference: string;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
}

export function normalizeTrackingPhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  return /^8801[3-9]\d{8}$/.test(digits) ? '0' + digits.slice(3) : digits;
}

const allowedStatuses = new Set<OrderStatus>([
  'pending', 'confirmed', 'preparing', 'ready', 'assigned', 'picked_up',
  'out_for_delivery', 'delivered', 'cancelled'
]);

/**
 * Phone lookup is NOT customer authentication. The server must only return
 * redacted order status summaries, never a private order receipt or OTP.
 */
export async function getPhoneOrderStatuses(
  endpoint: string, phone: string
): Promise<PhoneTrackingStatus[]> {
  const normalized = normalizeTrackingPhone(phone);
  if (!/^01[3-9]\d{8}$/.test(normalized)) {
    throw new Error('Enter a valid 11-digit Bangladesh mobile number.');
  }
  const data = await privatePost(endpoint, {action:'customer_phone_tracking',phone:normalized});
  if (!Array.isArray(data.orders) || data.orders.length > 10) {
    throw new Error('The phone tracking response is invalid. Update the bakery Apps Script deployment.');
  }
  return data.orders.map((item: unknown): PhoneTrackingStatus => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('Invalid tracking response.');
    }
    const row = item as Record<string, unknown>;
    if (typeof row.reference !== 'string' || !/^••••.{0,4}$/u.test(row.reference) ||
        !allowedStatuses.has(row.status as OrderStatus) ||
        typeof row.updated_at !== 'string' || typeof row.created_at !== 'string' ||
        Object.keys(row).some(key => !['reference','status','created_at','updated_at'].includes(key))) {
      throw new Error('The server returned unsafe order details. Tracking was not displayed.');
    }
    return {
      reference: row.reference, status:row.status as OrderStatus,
      created_at: row.created_at, updated_at: row.updated_at
    };
  });
}
