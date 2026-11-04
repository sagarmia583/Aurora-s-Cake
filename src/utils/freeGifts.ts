/** Free gifts are a public shop-wide offer managed in the Google Sheet. */
export function cleanFreeGiftItems(items?: readonly string[] | null): string[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of items) {
    if (typeof value !== 'string') continue;
    const item = value.trim();
    if (!item || item.length > 80 || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
    if (result.length >= 20) break;
  }
  return result;
}
export function formatFreeGiftList(items: readonly string[]): string {
  if (!items.length) return '';
  if (items.length === 1) return items[0];
  return items.slice(0,-1).join(', ') + ' ও ' + items[items.length-1];
}
/** Short on small cards; full item list is available via title and care guide. */
export function formatFreeGiftBadge(items: readonly string[]): string {
  if (!items.length) return '';
  const featured = formatFreeGiftList(items.slice(0,2));
  return '✓ ফ্রি: ' + featured + (items.length > 2 ? ' + আরও ' + (items.length-2) + 'টি' : '');
}
