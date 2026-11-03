import type { Product } from '../types';

export interface ProductDisplayStats {
  rating: number;
  reviewCount: number;
  soldCount: number;
  ratingFormatted: string;
}

/**
 * Derives accurate, consumer-friendly rating and sales statistics for any catalog cake.
 */
export function getProductDisplayStats(product: Product | null | undefined): ProductDisplayStats {
  if (!product) {
    return {
      rating: 0,
      reviewCount: 0,
      soldCount: 0,
      ratingFormatted: '0.0',
    };
  }

  const rating = Number(product.rating || 0);
  const reviewCount = Number(product.review_count || 0);
  const soldCount = Number(product.sold_count || 0);

  return {
    rating,
    reviewCount,
    soldCount,
    ratingFormatted: rating > 0 ? (rating % 1 === 0 ? rating.toFixed(1) : String(rating)) : '0.0',
  };
}

/**
 * Determines whether a product is considered "New" (within 30 days of creation).
 */
export function isProductNew(product: Product | null | undefined): boolean {
  if (!product) return false;
  if (product.is_new !== undefined) return Boolean(product.is_new);
  if (!product.created_at) return false;
  const createdTime = new Date(product.created_at).getTime();
  if (isNaN(createdTime)) return false;
  const oneMonthMs = 30 * 24 * 60 * 60 * 1000;
  const diff = Date.now() - createdTime;
  return diff >= 0 && diff <= oneMonthMs;
}

/**
 * Returns how many days remain before the product's "New" badge expires (up to 30 days).
 */
export function getProductDaysLeftAsNew(product: Product | null | undefined): number {
  if (!product) return 0;
  if (product.is_new === false) return 0;
  if (!product.created_at) {
    return product.is_new ? 30 : 0;
  }
  const createdTime = new Date(product.created_at).getTime();
  if (isNaN(createdTime)) return 0;
  const oneMonthMs = 30 * 24 * 60 * 60 * 1000;
  const diff = oneMonthMs - (Date.now() - createdTime);
  return diff > 0 ? Math.ceil(diff / (24 * 60 * 60 * 1000)) : 0;
}

