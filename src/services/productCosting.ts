import type { Product, Order } from '../types';
import { DEFAULT_SHEETS_ENDPOINT } from './googleSheets';
import { privatePost } from './sheetStaffApi';

export interface ItemCostingRecord {
  product_id: string;
  product_name: string;
  category_name?: string;
  image_url: string;
  base_price: number;
  sale_price?: number;
  selling_price: number;
  cost_ingredients: number; // কাঁচামাল / বেকিং উপকরণ খরচ (ময়দা, চিনি, ডিম, মাখন, চকলেট, ক্রিম)
  cost_packaging: number;   // প্যাকেজিং খরচ (কেক বক্স, হার্ড বোর্ড, নাইফ, ক্যান্ডেল, ব্যাগ)
  cost_delivery: number;    // ডেলিভারি ও পরিবহন খরচ (ডেলিভারি হ্যান্ডলিং)
  cost_other: number;       // অন্যান্য ওভারহেড (গ্যাস, বিদ্যুৎ, মেকিং চার্জ ও শ্রম)
  total_cost: number;       // মোট খরচ (COGS)
  net_profit: number;       // নিট লাভ (Selling Price - Total Cost)
  profit_margin: number;    // প্রফিট মার্জিন শতকরা (%)
  updated_at: string;
}

export interface CostingSummary {
  total_items: number;
  avg_selling_price: number;
  avg_total_cost: number;
  avg_net_profit: number;
  avg_profit_margin: number;
  highest_profit_item: ItemCostingRecord | null;
  lowest_margin_item: ItemCostingRecord | null;
  total_order_revenue: number;
  total_order_cost: number;
  total_order_profit: number;
}

const STORAGE_KEY = 'aurora_cake_costings_v1';

// Specific initial realistic costings calibrated for Aurora's Cake menu
const DEFAULT_MENU_COSTINGS: Record<string, { ingredients: number; packaging: number; delivery: number; other: number }> = {
  'prod-vanilla': { ingredients: 380, packaging: 80, delivery: 70, other: 50 },
  'prod-chocolate': { ingredients: 460, packaging: 85, delivery: 70, other: 65 },
  'prod-red-velvet': { ingredients: 550, packaging: 90, delivery: 70, other: 70 },
  'prod-black-forest': { ingredients: 510, packaging: 85, delivery: 70, other: 65 },
  'prod-butterscotch': { ingredients: 440, packaging: 80, delivery: 70, other: 60 },
  'prod-strawberry': { ingredients: 470, packaging: 85, delivery: 70, other: 65 },
  'prod-cheesecake': { ingredients: 680, packaging: 95, delivery: 70, other: 85 },
  'prod-coffee-caramel': { ingredients: 490, packaging: 85, delivery: 70, other: 65 },
  'prod-bento-vanilla': { ingredients: 140, packaging: 45, delivery: 50, other: 30 },
  'prod-bento-chocolate': { ingredients: 160, packaging: 45, delivery: 50, other: 35 },
  'prod-rainbow': { ingredients: 580, packaging: 90, delivery: 70, other: 80 },
  'prod-tiramisu': { ingredients: 620, packaging: 95, delivery: 70, other: 85 },
  'prod-white-forest': { ingredients: 480, packaging: 85, delivery: 70, other: 65 },
};

export function getStoredCostings(): Record<string, Partial<ItemCostingRecord>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Calculates selling price, total cost, net profit, and profit margin percentage.
 */
export function calculateItemCosting(
  product: Product,
  overrides?: Partial<ItemCostingRecord>
): ItemCostingRecord {
  const sellingPrice =
    product.sale_price !== undefined && product.sale_price > 0 && product.sale_price < product.base_price
      ? product.sale_price
      : product.base_price;

  const stored = getStoredCostings()[product.id] || {};
  const defaults = DEFAULT_MENU_COSTINGS[product.id] || {
    ingredients: Math.round(sellingPrice * 0.35),
    packaging: 80,
    delivery: 70,
    other: Math.round(sellingPrice * 0.05),
  };

  const cost_ingredients = Number(
    overrides?.cost_ingredients ?? stored.cost_ingredients ?? product.cost_ingredients ?? defaults.ingredients
  );
  const cost_packaging = Number(
    overrides?.cost_packaging ?? stored.cost_packaging ?? product.cost_packaging ?? defaults.packaging
  );
  const cost_delivery = Number(
    overrides?.cost_delivery ?? stored.cost_delivery ?? product.cost_delivery ?? defaults.delivery
  );
  const cost_other = Number(
    overrides?.cost_other ?? stored.cost_other ?? product.cost_other ?? defaults.other
  );

  const total_cost = cost_ingredients + cost_packaging + cost_delivery + cost_other;
  const net_profit = sellingPrice - total_cost;
  const profit_margin = sellingPrice > 0 ? Math.round(((net_profit / sellingPrice) * 100) * 10) / 10 : 0;

  return {
    product_id: product.id,
    product_name: product.name,
    category_name: product.category_name,
    image_url: product.image_url,
    base_price: product.base_price,
    sale_price: product.sale_price,
    selling_price: sellingPrice,
    cost_ingredients,
    cost_packaging,
    cost_delivery,
    cost_other,
    total_cost,
    net_profit,
    profit_margin,
    updated_at: overrides?.updated_at || stored.updated_at || new Date().toISOString(),
  };
}

const LAST_SYNC_KEY = 'aurora_cake_costings_last_synced_v1';

export function resolveActiveSheetsEndpoint(customEndpoint?: string): string {
  if (customEndpoint && customEndpoint.trim()) {
    return customEndpoint.trim();
  }
  try {
    const saved = localStorage.getItem('aurora_google_sheets_endpoint_v1');
    if (saved && saved.trim()) return saved.trim();
  } catch {}
  return DEFAULT_SHEETS_ENDPOINT;
}

export function getLastCostingSyncTime(): string | null {
  try {
    return localStorage.getItem(LAST_SYNC_KEY);
  } catch {
    return null;
  }
}

export function setLastCostingSyncTime(isoDate?: string): void {
  try {
    localStorage.setItem(LAST_SYNC_KEY, isoDate || new Date().toISOString());
  } catch {}
}

/**
 * Saves costing for a single cake item into persistent storage and optionally syncs to Google Sheets.
 */
export function saveItemCosting(
  costing: {
    product_id: string;
    cost_ingredients: number;
    cost_packaging: number;
    cost_delivery: number;
    cost_other: number;
  },
  options?: {
    endpoint?: string;
    token?: string;
    fullRecord?: ItemCostingRecord;
  }
): void {
  try {
    const existing = getStoredCostings();
    const updatedRecord = {
      ...existing[costing.product_id],
      cost_ingredients: costing.cost_ingredients,
      cost_packaging: costing.cost_packaging,
      cost_delivery: costing.cost_delivery,
      cost_other: costing.cost_other,
      updated_at: new Date().toISOString(),
    };
    existing[costing.product_id] = updatedRecord;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));

    if (options?.fullRecord) {
      void syncItemCostingsToSheet(options.fullRecord, options.endpoint, options.token);
    }
  } catch {
    // ignore storage quota errors
  }
}

/**
 * Synchronizes item costings and profit margins directly to Google Sheets ('item_costings' sheet tab).
 */
export async function syncItemCostingsToSheet(
  costings: ItemCostingRecord[] | ItemCostingRecord,
  endpoint?: string,
  token?: string
): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    const targetEndpoint = resolveActiveSheetsEndpoint(endpoint);
    const list = Array.isArray(costings) ? costings : [costings];
    if (!list.length) {
      return { success: true, count: 0 };
    }

    const payload: Record<string, unknown> = {
      action: 'sync_item_costings',
      costings: list,
    };
    if (token) {
      if (/^[a-f0-9-]{72}$/i.test(token)) {
        payload.auth_token = token;
      } else {
        payload.id_token = token;
      }
    }

    const res = await privatePost(targetEndpoint, payload);
    const count = typeof res.count === 'number' ? res.count : list.length;
    setLastCostingSyncTime();
    return { success: true, count };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google Sheet costing sync failed';
    return { success: false, error: message };
  }
}

/**
 * Fetches existing item costings from the Google Sheets backend and merges into local cache.
 */
export async function fetchItemCostingsFromSheet(
  endpoint?: string,
  token?: string
): Promise<{ success: boolean; costings?: ItemCostingRecord[]; error?: string }> {
  try {
    const targetEndpoint = resolveActiveSheetsEndpoint(endpoint);
    const payload: Record<string, unknown> = {
      action: 'get_item_costings',
    };
    if (token) {
      if (/^[a-f0-9-]{72}$/i.test(token)) {
        payload.auth_token = token;
      } else {
        payload.id_token = token;
      }
    }

    const res = await privatePost(targetEndpoint, payload);
    if (Array.isArray(res.costings) && res.costings.length > 0) {
      const existing = getStoredCostings();
      for (const item of res.costings as Record<string, unknown>[]) {
        const pid = typeof item.product_id === 'string' ? item.product_id.trim() : '';
        if (pid) {
          existing[pid] = {
            ...existing[pid],
            cost_ingredients: Number(item.cost_ingredients) || 0,
            cost_packaging: Number(item.cost_packaging) || 0,
            cost_delivery: Number(item.cost_delivery) || 0,
            cost_other: Number(item.cost_other) || 0,
            updated_at: typeof item.updated_at === 'string' ? item.updated_at : new Date().toISOString(),
          };
        }
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
      } catch {}
      setLastCostingSyncTime();
      return { success: true, costings: res.costings as ItemCostingRecord[] };
    }
    return { success: true, costings: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google Sheet costing fetch failed';
    return { success: false, error: message };
  }
}

/**
 * Returns item costing for all products.
 */
export function getAllItemCostings(products: Product[]): ItemCostingRecord[] {
  return products.map((product) => calculateItemCosting(product));
}

export interface MinimalOrderCostingItem {
  product_id: string;
  unit_price: number;
  quantity: number;
}

export interface MinimalOrderRecord {
  status: string;
  total_amount: number;
  items?: MinimalOrderCostingItem[];
}

/**
 * Computes business-wide costing summary and actual profit from orders.
 */
export function getCostingSummary(
  products: Product[],
  orders: MinimalOrderRecord[] | Order[] | any[] = []
): CostingSummary {
  const items = getAllItemCostings(products);
  const count = items.length;

  if (count === 0) {
    return {
      total_items: 0,
      avg_selling_price: 0,
      avg_total_cost: 0,
      avg_net_profit: 0,
      avg_profit_margin: 0,
      highest_profit_item: null,
      lowest_margin_item: null,
      total_order_revenue: 0,
      total_order_cost: 0,
      total_order_profit: 0,
    };
  }

  const totalSelling = items.reduce((s, i) => s + i.selling_price, 0);
  const totalCost = items.reduce((s, i) => s + i.total_cost, 0);
  const totalProfit = items.reduce((s, i) => s + i.net_profit, 0);

  const highestProfitItem = [...items].sort((a, b) => b.net_profit - a.net_profit)[0] || null;
  const lowestMarginItem = [...items].sort((a, b) => a.profit_margin - b.profit_margin)[0] || null;

  // Realized profit from placed/confirmed orders
  const costingMap = new Map<string, ItemCostingRecord>(items.map((it) => [it.product_id, it]));
  let orderRevenue = 0;
  let orderCost = 0;

  for (const order of orders) {
    if (order.status === 'cancelled') continue;
    orderRevenue += Number(order.total_amount || 0);
    const orderItems = order.items || [];
    for (const item of orderItems) {
      const c = costingMap.get(item.product_id);
      const unitCost = c ? c.total_cost : (item.unit_price || 0) * 0.55;
      orderCost += unitCost * (item.quantity || 1);
    }
  }

  return {
    total_items: count,
    avg_selling_price: Math.round(totalSelling / count),
    avg_total_cost: Math.round(totalCost / count),
    avg_net_profit: Math.round(totalProfit / count),
    avg_profit_margin: Math.round(((totalProfit / totalSelling) * 100) * 10) / 10,
    highest_profit_item: highestProfitItem,
    lowest_margin_item: lowestMarginItem,
    total_order_revenue: orderRevenue,
    total_order_cost: Math.round(orderCost),
    total_order_profit: Math.round(orderRevenue - orderCost),
  };
}
