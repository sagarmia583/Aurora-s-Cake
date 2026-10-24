import type { CartItem, Order } from '../types';
import type { PublicSiteData } from '../types/siteContent';

export interface ReconciledPublicCart {
  items: CartItem[];
  changed: boolean;
  /** Number of cart lines removed, rather than the number of individual cakes. */
  removedCount: number;
}
const row = (value: unknown): Record<string, unknown> | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const id = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value : undefined;
const price = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;

/**
 * Rebuild saved cart selections from the current public catalogue.
 * Missing variants/flavours remove a line; missing add-ons are removed and the line is repriced.
 * The inputs are never mutated. Image/name changes are copied without producing a price-change warning.
 */
export function reconcilePublicCart(items: CartItem[], data: PublicSiteData): ReconciledPublicCart {
  if (!Array.isArray(items)) return { items: [], changed: true, removedCount: 0 };
  const reconciled: CartItem[] = [];
  const cartIds = new Set<string>();
  let changed = false;
  let removedCount = 0;
  const removeLine = () => { changed = true; removedCount++; };
  for (const candidate of items as unknown[]) {
    const item = row(candidate);
    const cartId = id(item?.cart_item_id);
    const productId = id(row(item?.product)?.id);
    const oldVariant = row(item?.selected_variant);
    const variantId = id(oldVariant?.id);
    const quantity = item?.quantity;
    if (!item || !cartId || cartIds.has(cartId) || !productId || !variantId || typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity <= 0) {
      removeLine();
      continue;
    }
    cartIds.add(cartId);
    const product = data.products.find(value => value.id === productId && value.is_active);
    const variant = product?.variants.find(value => value.id === variantId && value.is_active);
    const variantPrice = price(variant?.sale_price ?? variant?.price);
    if (!product || !variant || variantPrice === undefined) { removeLine(); continue; }

    const oldFlavor = item.selected_flavor;
    const oldFlavorId = id(row(oldFlavor)?.id);
    const flavor = oldFlavorId ? data.flavors.find(value => value.id === oldFlavorId && value.is_active && product.allowed_flavor_ids.includes(value.id)) : undefined;
    if (oldFlavor !== undefined && oldFlavor !== null && (!oldFlavorId || !flavor)) { removeLine(); continue; }

    const addonIds = new Set<string>();
    const addons: CartItem['selected_addons'] = [];
    const requestedAddons = item.selected_addons;
    if (requestedAddons !== undefined && requestedAddons !== null && !Array.isArray(requestedAddons)) { removeLine(); continue; }
    for (const candidateAddon of (Array.isArray(requestedAddons) ? requestedAddons : []) as unknown[]) {
      const oldAddon = row(candidateAddon);
      const addonId = id(oldAddon?.id);
      const addon = addonId ? data.addons.find(value => value.id === addonId && value.is_active && product.allowed_addon_ids.includes(value.id)) : undefined;
      if (!addon || addonIds.has(addon.id) || price(addon.price) === undefined) { changed = true; continue; }
      addonIds.add(addon.id);
      addons.push(addon);
      if (oldAddon?.price !== addon.price) changed = true;
    }
    const unitPrice = variantPrice + addons.reduce((sum, addon) => sum + addon.price, 0);
    const totalPrice = unitPrice * quantity;
    if (!Number.isFinite(unitPrice) || !Number.isFinite(totalPrice)) { removeLine(); continue; }
    const writingMessage = typeof item.writing_message === 'string' ? item.writing_message : '';
    if (item.unit_price !== unitPrice || item.total_price !== totalPrice || price(oldVariant?.sale_price ?? oldVariant?.price) !== variantPrice || oldVariant?.weight_grams !== variant.weight_grams || item.writing_message !== writingMessage) changed = true;
    reconciled.push({
      cart_item_id: cartId,
      product,
      selected_variant: variant,
      selected_flavor: flavor,
      selected_addons: addons,
      writing_message: writingMessage,
      quantity,
      unit_price: unitPrice,
      total_price: totalPrice,
    });
  }
  return { items: reconciled, changed, removedCount };
}




let reorderSequence = 0;
function reorderCartId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return 'cart-reorder-' + globalThis.crypto.randomUUID();
  return 'cart-reorder-' + Date.now().toString(36) + '-' + (++reorderSequence).toString(36) + '-' + Math.random().toString(36).slice(2);
}

/** Reorder only products and options that still exist in the current public Sheet catalogue. */
export function reorderFromPublicOrder(order: Order, data: PublicSiteData): ReconciledPublicCart {
  if (!order || !Array.isArray(order.items)) return {items:[],changed:true,removedCount:0};
  const items: CartItem[] = [];
  let changed = false;
  let removedCount = 0;
  const removeLine = () => { changed = true; removedCount++; };
  for (const candidate of order.items as unknown[]) {
    const line = row(candidate);
    const productId = id(line?.product_id);
    const variantName = id(line?.variant_name);
    const quantity = line?.quantity;
    if (!line || !productId || !variantName || typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity <= 0) { removeLine(); continue; }
    const product = data.products.find(value => value.id === productId && value.is_active);
    const variant = product?.variants.find(value => value.name === variantName && value.is_active);
    const variantPrice = price(variant?.sale_price ?? variant?.price);
    if (!product || !variant || variantPrice === undefined) { removeLine(); continue; }
    const historicalFlavor = line.flavor_name;
    const flavorName = id(historicalFlavor);
    const flavor = flavorName ? data.flavors.find(value => value.name === flavorName && value.is_active && product.allowed_flavor_ids.includes(value.id)) : undefined;
    if (historicalFlavor !== undefined && historicalFlavor !== null && historicalFlavor !== '' && (!flavorName || !flavor)) { removeLine(); continue; }

    const addons: CartItem['selected_addons'] = [];
    const addonIds = new Set<string>();
    const historicalAddons = line.addons;
    if (historicalAddons !== undefined && historicalAddons !== null && !Array.isArray(historicalAddons)) changed = true;
    for (const candidateAddon of (Array.isArray(historicalAddons) ? historicalAddons : []) as unknown[]) {
      const previous = row(candidateAddon);
      const addonId = id(previous?.addon_id);
      const addon = addonId ? data.addons.find(value => value.id === addonId && value.is_active && product.allowed_addon_ids.includes(value.id)) : undefined;
      if (!addon || addonIds.has(addon.id) || price(addon.price) === undefined) { changed = true; continue; }
      addonIds.add(addon.id);
      addons.push(addon);
      if (previous?.unit_price !== addon.price) changed = true;
    }
    const unitPrice = variantPrice + addons.reduce((sum, addon) => sum + addon.price, 0);
    const totalPrice = unitPrice * quantity;
    if (!Number.isFinite(unitPrice) || !Number.isFinite(totalPrice)) { removeLine(); continue; }
    if (line.unit_price !== variantPrice || line.subtotal !== totalPrice) changed = true;
    const writingMessage = typeof line.writing_message === 'string' ? line.writing_message : '';
    items.push({
      cart_item_id: reorderCartId(),
      product,
      selected_variant: variant,
      selected_flavor: flavor,
      selected_addons: addons,
      writing_message: writingMessage,
      quantity,
      unit_price: unitPrice,
      total_price: totalPrice,
    });
  }
  return {items,changed,removedCount};
}

