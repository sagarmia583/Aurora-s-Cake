import { normalizeCheckoutPhone } from './customerPhoneLookup';
import type { Order } from '../types';

export interface SavedCustomer {
  phone: string;
  name: string;
  address: string;
  email?: string;
  zone_id?: string;
  last_order_id?: string;
  updated_at: string;
}

const STORAGE_KEY_DIRECTORY = 'aurora_customer_directory_v1';
const STORAGE_KEY_SINGLE = 'aurora_customer_profile_v1';

let memoryDirectory: Record<string, SavedCustomer> = {};

/**
 * Loads the dictionary of all saved customer profiles indexed by normalized phone.
 */
export function getSavedCustomerDirectory(): Record<string, SavedCustomer> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY_DIRECTORY) : null;
    if (!raw) return { ...memoryDirectory };
    const parsed = JSON.parse(raw);
    const result = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : {};
    return { ...memoryDirectory, ...result };
  } catch {
    return { ...memoryDirectory };
  }
}

/**
 * Retrieves a customer profile by phone number without requiring a password.
 * Checks:
 * 1. Phone-indexed customer directory
 * 2. Current device profile (aurora_customer_profile_v1)
 * 3. Any previous confirmed orders placed with this phone number
 */
export function getSavedCustomer(phone: string, fallbackOrders: readonly Order[] = []): SavedCustomer | null {
  const target = normalizeCheckoutPhone(phone);
  if (!target) return null;

  // 1. Check directory
  const directory = getSavedCustomerDirectory();
  if (directory[target] && (directory[target].name || directory[target].address)) {
    return directory[target];
  }

  // 2. Check current device profile
  try {
    const singleRaw = localStorage.getItem(STORAGE_KEY_SINGLE);
    if (singleRaw) {
      const single = JSON.parse(singleRaw);
      if (single && typeof single === 'object' && normalizeCheckoutPhone(single.phone || '') === target) {
        if (single.name || single.address) {
          return {
            phone: target,
            name: typeof single.name === 'string' ? single.name.trim() : '',
            address: typeof single.address === 'string' ? single.address.trim() : '',
            email: typeof single.email === 'string' ? single.email.trim() : '',
            zone_id: typeof single.zone_id === 'string' ? single.zone_id : undefined,
            updated_at: new Date().toISOString(),
          };
        }
      }
    }
  } catch {
    // Ignore storage parse errors
  }

  // 3. Check past confirmed orders
  const matchingOrders = fallbackOrders
    .filter((order) => normalizeCheckoutPhone(order.customer_phone) === target)
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

  if (matchingOrders.length > 0) {
    const latest = matchingOrders[0];
    if (latest.customer_name || latest.delivery_address) {
      return {
        phone: target,
        name: latest.customer_name ? latest.customer_name.trim() : '',
        address: latest.delivery_address ? latest.delivery_address.trim() : '',
        zone_id: latest.delivery_zone?.id || undefined,
        last_order_id: latest.id,
        updated_at: latest.created_at || new Date().toISOString(),
      };
    }
  }

  return null;
}

/**
 * Saves or updates customer profile info by phone number.
 * Allows customers to change their info anytime.
 */
export function saveCustomerInfo(customer: {
  phone: string;
  name: string;
  address: string;
  email?: string;
  zone_id?: string;
  last_order_id?: string;
}): SavedCustomer | null {
  const target = normalizeCheckoutPhone(customer.phone);
  if (!target) return null;

  const record: SavedCustomer = {
    phone: target,
    name: customer.name.trim(),
    address: customer.address.trim(),
    email: customer.email?.trim() || '',
    zone_id: customer.zone_id,
    last_order_id: customer.last_order_id,
    updated_at: new Date().toISOString(),
  };

  memoryDirectory[target] = record;
  try {
    const directory = getSavedCustomerDirectory();
    directory[target] = record;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_DIRECTORY, JSON.stringify(directory));

      // Also update current active device profile
      localStorage.setItem(STORAGE_KEY_SINGLE, JSON.stringify({
        phone: target,
        name: record.name,
        address: record.address,
        email: record.email,
        zone_id: record.zone_id,
      }));
    }
  } catch {
    // Ignore storage quota errors
  }

  return record;
}

/**
 * Finds all orders matching a given phone number, deduplicated and sorted newest first.
 */
export function findCustomerOrders(phone: string, ordersList: readonly Order[]): Order[] {
  const target = normalizeCheckoutPhone(phone);
  if (!target) return [];

  const seen = new Set<string>();
  const results: Order[] = [];

  for (const order of ordersList) {
    if (!order || !order.id) continue;
    if (seen.has(order.id)) continue;

    if (normalizeCheckoutPhone(order.customer_phone) === target) {
      seen.add(order.id);
      results.push(order);
    }
  }

  return results.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}
