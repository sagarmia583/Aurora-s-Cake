import {
  nextOperation,
  type StaffOrder,
  type StaffSession,
  type Role,
} from "../domain";
export type Screen = "today" | "orders" | "bake" | "delivery" | "more";
export type Row = Record<string, unknown>;
export type Variant = {
  id: string;
  name: string;
  price: number;
  sale_price?: number;
};
export type Product = {
  id: string;
  name: string;
  description: string;
  image_url: string;
  category: string;
  is_active: boolean;
  base_price: number;
  sale_price?: number;
  variants: Variant[];
  flavors: string[];
  addons: string[];
};
export type Option = { id: string; name: string; price: number };
export type Zone = { id: string; name: string; delivery_fee: number };
export type Coupon = {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  min_order_amount: number;
  max_discount_amount?: number;
  usage_count: number;
  usage_limit?: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
};
export type Catalog = {
  settings: Record<string, unknown>;
  products: Product[];
  flavors: Option[];
  addons: Option[];
  zones: Zone[];
  slots: string[];
  coupons: Coupon[];
};
export type CartLine = {
  key: string;
  product_id: string;
  variant_id: string;
  flavor_id: string;
  addon_ids: string[];
  writing_message: string;
  quantity: number;
  custom?: { name: string; size: string; flavor: string; unit_price: number };
};
export const CUSTOM_CAKE_ID = "__custom_cake__";
export type Draft = {
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  delivery_zone_id: string;
  delivery_date: string;
  delivery_slot: string;
  coupon_code: string;
  order_note: string;
  cart_items: Omit<CartLine, "key">[];
  payment_method: "cod";
  expected_total: number;
};
export type RichItem = {
  product_id?: string;
  product_name: string;
  variant_name?: string;
  flavor_name?: string;
  quantity: number;
  subtotal: number;
  writing_message?: string;
  addons?: { addon_name: string; quantity: number }[];
};
export const emptyCatalog: Catalog = {
  settings: {},
  products: [],
  flavors: [],
  addons: [],
  zones: [],
  slots: [],
  coupons: [],
};
export const active = (v: unknown) =>
  v === true ||
  v === 1 ||
  (typeof v === "string" &&
    ["true", "1", "yes", "on"].includes(v.trim().toLowerCase()));
// Existing Sheets treat a blank availability cell as active, like the backend.
export const available = (v: unknown) => {
  if (v === undefined || v === null || v === "") return true;
  if (active(v)) return true;
  if (
    v === false ||
    v === 0 ||
    (typeof v === "string" &&
      ["false", "no", "0", "off"].includes(v.trim().toLowerCase()))
  )
    return false;
  throw new Error("Sheet-এর availability flag TRUE/FALSE হতে হবে।");
};
const rows = (v: unknown): Row[] =>
  Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : [];
const amount = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0)
    throw new Error("Sheet-এ একটি price/amount সঠিক নয়।");
  return n;
};
const optional = (v: unknown) =>
  v === undefined || v === null || v === "" ? undefined : amount(v);
const list = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(String);
  try {
    const p = JSON.parse(String(v || "[]"));
    if (Array.isArray(p)) return p.map(String);
  } catch {}
  return String(v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
};
const allowed = (v: unknown, all: Option[]) => {
  const ids = list(v);
  return ids.some((id) => ["all", "*"].includes(id.toLowerCase()))
    ? all.map((o) => o.id)
    : ids.filter((id) => all.some((o) => o.id === id));
};
export function normalizeCatalog(value: unknown): Catalog {
  if (!value || typeof value !== "object")
    throw new Error("Live catalogue পাওয়া যায়নি।");
  const envelope = value as Row,
    d = (envelope.data || envelope) as Row;
  const options = (v: unknown): Option[] =>
    rows(v)
      .filter((r) => available(r.is_active))
      .map((r) => ({
        id: String(r.id),
        name: String(r.name || ""),
        price: amount(r.price || 0),
      }));
  const flavors = options(d.flavors),
    addons = options(d.product_addons || d.addons);
  const categories = rows(d.categories),
    variants = rows(d.product_variants);
  const products = rows(d.products).map((r) => ({
    id: String(r.id),
    name: String(r.name || ""),
    description: String(r.description || ""),
    image_url: String(r.image_url || ""),
    category: String(
      categories.find((c) => c.id === r.category_id)?.name ||
        r.category_name ||
        "Cakes",
    ),
    is_active: available(r.is_active),
    base_price: amount(r.base_price || 0),
    sale_price: optional(r.sale_price),
    variants: (Array.isArray(r.variants)
      ? rows(r.variants)
      : variants.filter((v) => v.product_id === r.id)
    )
      .filter((v) => available(v.is_active))
      .map((v) => ({
        id: String(v.id),
        name: String(v.name || ""),
        price: amount(v.price),
        sale_price: optional(v.sale_price),
      })),
    flavors: allowed(r.allowed_flavor_ids, flavors),
    addons: allowed(r.allowed_addon_ids, addons),
  }));
  const settings = Array.isArray(d.settings)
    ? Object.fromEntries(rows(d.settings).map((r) => [String(r.key), r.value]))
    : ((d.settings || {}) as Row);
  return {
    settings,
    products,
    flavors,
    addons,
    zones: rows(d.delivery_zones || d.zones)
      .filter((r) => available(r.is_active))
      .map((r) => ({
        id: String(r.id),
        name: String(r.name),
        delivery_fee: amount(r.delivery_fee),
      })),
    slots: rows(d.delivery_slots || d.slots)
      .filter((r) => available(r.is_active))
      .map((r) => String(r.slot_label)),
    coupons: rows(d.coupons).map((r) => ({
      id: String(r.id),
      code: String(r.code).toUpperCase(),
      discount_type: String(r.discount_type),
      discount_value: amount(r.discount_value),
      min_order_amount: amount(r.min_order_amount || 0),
      max_discount_amount: optional(r.max_discount_amount),
      usage_count: amount(r.usage_count || 0),
      usage_limit: optional(r.usage_limit),
      start_date: String(r.start_date || ""),
      end_date: String(r.end_date || ""),
      is_active: available(r.is_active),
    })),
  };
}
export function unitPrice(p: Product, v: Variant) {
  return (
    v.sale_price ??
    (p.sale_price !== undefined &&
    p.sale_price < p.base_price &&
    (v.id.includes("-half") || v.price <= p.base_price)
      ? p.sale_price
      : v.price)
  );
}
const round = (n: number) => Math.round(n * 100) / 100;
export function linePrice(c: Catalog, line: Omit<CartLine, "key">) {
  if (line.custom) return round(line.custom.unit_price * line.quantity);
  const p = c.products.find((p) => p.id === line.product_id && p.is_active),
    v = p?.variants.find((v) => v.id === line.variant_id);
  if (
    !p ||
    !v ||
    !Number.isInteger(line.quantity) ||
    line.quantity < 1 ||
    line.quantity > 50
  )
    throw new Error("কেক/সাইজ/quantity বদলেছে। আবার নির্বাচন করুন।");
  if (
    (p.flavors.length && !p.flavors.includes(line.flavor_id)) ||
    (line.flavor_id && !p.flavors.includes(line.flavor_id)) ||
    line.addon_ids.some((id) => !p.addons.includes(id))
  )
    throw new Error("Flavor বা add-on আবার নির্বাচন করুন।");
  return round(
    (unitPrice(p, v) +
      line.addon_ids.reduce(
        (sum, id) => sum + (c.addons.find((a) => a.id === id)?.price || 0),
        0,
      )) *
      line.quantity,
  );
}
export function couponReason(c: Coupon, subtotal: number, now = Date.now()) {
  if (!c.is_active) return "এই offer বন্ধ আছে";
  if (c.start_date && Date.parse(c.start_date) > now)
    return "Offer এখনও শুরু হয়নি";
  if (c.end_date && Date.parse(c.end_date) < now) return "Offer শেষ হয়েছে";
  if (c.usage_limit && c.usage_count >= c.usage_limit)
    return "Offer-এর limit শেষ";
  return subtotal < c.min_order_amount
    ? "ন্যূনতম ৳" + c.min_order_amount + " প্রয়োজন"
    : "";
}
export function quote(
  c: Catalog,
  lines: Omit<CartLine, "key">[],
  zoneId: string,
  code: string,
) {
  if (lines.length > 25)
    throw new Error("একটি order-এ সর্বোচ্চ ২৫টি আলাদা cake line রাখা যায়।");
  const subtotal = round(lines.reduce((sum, l) => sum + linePrice(c, l), 0)),
    zone = c.zones.find((z) => z.id === zoneId);
  if (zoneId && !zone) throw new Error("Delivery area বদলেছে। আবার বাছুন।");
  const coupon = code
    ? c.coupons.find((o) => o.code === code.trim().toUpperCase())
    : undefined;
  const error = code
    ? coupon
      ? couponReason(coupon, subtotal)
      : "Offer code পাওয়া যায়নি"
    : "";
  let discount =
    coupon && !error
      ? coupon.discount_type === "percentage"
        ? (subtotal * coupon.discount_value) / 100
        : coupon.discount_value
      : 0;
  if (coupon?.max_discount_amount !== undefined)
    discount = Math.min(discount, coupon.max_discount_amount);
  discount = round(Math.min(subtotal, Math.max(0, discount)));
  return {
    subtotal,
    discount,
    delivery: zone?.delivery_fee || 0,
    total: round(subtotal - discount + (zone?.delivery_fee || 0)),
    error,
  };
}
export const dhakaDate = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
export const isLive = (o: StaffOrder) =>
  !["delivered", "cancelled"].includes(o.status);
export const richItems = (o: StaffOrder) => (o.items as RichItem[]) || [];
export function zoneName(o: StaffOrder) {
  const z = o.delivery_zone as unknown;
  return z && typeof z === "object"
    ? String((z as Row).name || "")
    : String(z || "");
}
export function priorityOrders(orders: StaffOrder[], session: StaffSession) {
  return orders
    .filter(isLive)
    .filter(
      (o) =>
        session.role !== "delivery_man" ||
        o.rider_id?.toLowerCase() === session.email.toLowerCase(),
    )
    .slice()
    .sort((a, b) => {
      const actionable = (o: StaffOrder) => (nextOperation(o, session) ? 0 : 1);
      return (
        actionable(a) - actionable(b) ||
        String(a.delivery_date || "9999").localeCompare(
          String(b.delivery_date || "9999"),
        ) ||
        a.created_at.localeCompare(b.created_at)
      );
    });
}
export function batchPlan(orders: StaffOrder[], day: string) {
  const grouped = new Map<
    string,
    {
      name: string;
      variant: string;
      flavor: string;
      quantity: number;
      orders: Set<string>;
      messages: string[];
    }
  >();
  for (const o of orders.filter(
    (o) =>
      o.delivery_date === day && ["confirmed", "preparing"].includes(o.status),
  ))
    for (const item of richItems(o)) {
      const key = JSON.stringify([
        item.product_id || item.product_name,
        item.variant_name,
        item.flavor_name,
      ]);
      const row = grouped.get(key) || {
        name: item.product_name,
        variant: item.variant_name || "",
        flavor: item.flavor_name || "",
        quantity: 0,
        orders: new Set<string>(),
        messages: [],
      };
      row.quantity += item.quantity;
      row.orders.add(o.id);
      if (item.writing_message) row.messages.push(item.writing_message);
      grouped.set(key, row);
    }
  return [...grouped.values()].sort((a, b) => b.quantity - a.quantity);
}
export const canCreate = (role: Role) =>
  ["super_admin", "admin", "order_manager"].includes(role);
export const canManage = (role: Role) =>
  ["super_admin", "admin"].includes(role);

/** Compare JSON-shaped snapshots without depending on object key order. */
export function sameSnapshot(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
      a.every((entry, index) => sameSnapshot(entry, b[index]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) =>
    Object.prototype.hasOwnProperty.call(right, key) && sameSnapshot(left[key], right[key]));
}

export function mergeOrders(previous: StaffOrder[], incoming: StaffOrder[]) {
  const ids = new Set<string>();
  for (const o of incoming) {
    if (ids.has(o.id)) throw new Error("Duplicate live order snapshot");
    ids.add(o.id);
  }
  const old = new Map(previous.map((o) => [o.id, o]));
  const next = incoming.map((o) => {
    const p = old.get(o.id);
    return p && (Date.parse(p.updated_at) > Date.parse(o.updated_at) || sameSnapshot(p, o)) ? p : o;
  });
  return next.length === previous.length && next.every((order, index) => order === previous[index])
    ? previous : next;
}

/** A corrupt Sheet row must not erase last-known orders, but valid incoming
 * orders may still be safely added or advanced. Only a COMPLETE snapshot may
 * remove an old record.
 */
export function mergeOrderSnapshot(previous:StaffOrder[],incoming:StaffOrder[],complete:boolean):StaffOrder[]{
  if(complete)return mergeOrders(previous,incoming);
  const received=new Set(incoming.map(order=>order.id));
  return mergeOrders(previous,[...incoming,...previous.filter(order=>!received.has(order.id))]);
}
