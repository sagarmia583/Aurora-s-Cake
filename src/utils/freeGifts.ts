/** Product-specific complimentary gifts. The legacy list is a CATALOGUE only,
 * never a promise to give every product every item.
 * Stored in the existing settings.complimentary_kit_items row, so an Apps Script
 * schema migration or a new database is not needed.
 */
export interface ProductGiftSettings {
  items: string[];
  products: Record<string,string[]>;
}
const isRecord = (value: unknown): value is Record<string,unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const validProductId = (value: string) =>
  /^[A-Za-z0-9_-]{1,100}$/.test(value) &&
  !['__proto__','constructor','prototype'].includes(value);

export function cleanFreeGiftItems(items?: readonly string[] | null): string[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of items) {
    if (typeof value !== 'string') continue;
    const item = value.trim();
    if (!item || item.length > 80 || /[\u0000-\u001f\u007f]/.test(item) || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
    if (result.length >= 20) break;
  }
  return result;
}

function normalizeAssignments(items: string[], source: unknown): Record<string,string[]> {
  const result: Record<string,string[]> = Object.create(null);
  if (!isRecord(source)) return result;
  for (const [productId, giftNames] of Object.entries(source).slice(0,500)) {
    if (!validProductId(productId) || !Array.isArray(giftNames)) continue;
    const selected = cleanFreeGiftItems(giftNames).filter(name => items.includes(name));
    if (selected.length) result[productId] = selected;
  }
  return result;
}

/** Accept legacy JSON/comma-separated gift list and version-2 product mapping.
 * Malformed public gift metadata fails closed without hiding the whole menu.
 */
export function parseFreeGiftSettings(value: unknown): ProductGiftSettings {
  const empty = (): ProductGiftSettings => ({ items:[], products:Object.create(null) });
  let decoded = value;
  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return empty();
    if (raw[0] === '[' || raw[0] === '{') {
      try { decoded = JSON.parse(raw); } catch { return empty(); }
    } else {
      decoded = raw.split(/[,\n]+/).map(item => item.trim());
    }
  }
  if (Array.isArray(decoded)) return {items:cleanFreeGiftItems(decoded),products:Object.create(null)};
  if (!isRecord(decoded) || decoded.version !== 2 || !Array.isArray(decoded.items)) return empty();
  const items = cleanFreeGiftItems(decoded.items);
  return {items,products:normalizeAssignments(items,decoded.products)};
}
export function getProductFreeGifts(settings: ProductGiftSettings, productId: string): string[] {
  if (!validProductId(productId)) return [];
  return cleanFreeGiftItems(settings.products[productId]).filter(name => settings.items.includes(name));
}
/** Save only bounded, per-product assignments. Apps Script accepts <=5000 chars. */
export function serializeFreeGiftSettings(settings: ProductGiftSettings): string {
  if (!Array.isArray(settings.items) || settings.items.length > 20 ||
      settings.items.some(item => typeof item !== 'string' || !item.trim() || item.trim().length > 80))
    throw new Error('Select no more than 20 gift names (80 characters each).');
  const items=cleanFreeGiftItems(settings.items);
  const products=normalizeAssignments(items,settings.products);
  const encoded=JSON.stringify({version:2,items,products});
  if(encoded.length>4500)throw new Error('Too many product gift assignments for the current Google Sheet setting.');
  return encoded;
}
export function formatFreeGiftList(items: readonly string[]): string {
  if (!items.length) return '';
  if (items.length === 1) return items[0];
  return items.slice(0,-1).join(', ') + ' ও ' + items[items.length-1];
}
export function formatFreeGiftBadge(items: readonly string[]): string {
  if (!items.length) return '';
  const featured = formatFreeGiftList(items.slice(0,2));
  return '✓ ফ্রি: ' + featured + (items.length > 2 ? ' + আরও ' + (items.length-2) + 'টি' : '');
}
