import type { Product, ProductVariant } from '../types';

/** Product-level markdown is a fixed taka reduction from the base price.
 * An explicit variant sale_price overrides that markdown for that size.
 * This same rule must be mirrored in Google Apps Script checkout.
 */
export function variantPrice(product: Product, variant: ProductVariant): number {
  const original = Number(variant.price);
  const explicit = variant.sale_price;
  // A bad discount must never silently turn a cake into a free checkout item.
  // The backend rejects invalid/zero sale prices; this fallback keeps the
  // storefront from advertising an accidental zero-taka offer.
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit > 0 && explicit < original)
    return explicit;
  const markdown = typeof product.sale_price === 'number' && product.sale_price > 0 &&
    product.sale_price < product.base_price && Number.isFinite(product.base_price)
    ? Math.max(0, product.base_price - product.sale_price) : 0;
  const candidate = Math.round((original - markdown) * 100) / 100;
  return Number.isFinite(candidate) && candidate > 0 ? candidate : original;
}
export function variantDiscount(product: Product, variant: ProductVariant): number {
  const regular=Number(variant.price);
  const reduced=variantPrice(product,variant);
  return regular>0 && reduced<regular ? Math.round((regular-reduced)/regular*100) : 0;
}
