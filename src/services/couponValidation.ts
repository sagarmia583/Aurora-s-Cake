import type { Coupon } from '../types';

export interface CouponValidationResult {
  isValid: boolean;
  coupon?: Coupon;
  discount: number;
  reason?: string;
}

export function validateCoupon(
  coupon: Coupon | null | undefined,
  subtotal: number,
  now: Date = new Date()
): CouponValidationResult {
  if (!coupon) {
    return { isValid: false, discount: 0, reason: 'This coupon is not available.' };
  }
  if (!coupon.is_active) {
    return { isValid: false, discount: 0, reason: 'This coupon is currently inactive.' };
  }
  if (coupon.valid_from) {
    const fromTime = new Date(coupon.valid_from.includes('T') ? coupon.valid_from : `${coupon.valid_from}T00:00:00`).getTime();
    if (!isNaN(fromTime) && now.getTime() < fromTime) {
      return { isValid: false, discount: 0, reason: `This coupon starts on ${coupon.valid_from}.` };
    }
  }
  if (coupon.valid_until) {
    const untilTime = new Date(coupon.valid_until.includes('T') ? coupon.valid_until : `${coupon.valid_until}T23:59:59.999`).getTime();
    if (!isNaN(untilTime) && now.getTime() > untilTime) {
      return { isValid: false, discount: 0, reason: 'This coupon has expired.' };
    }
  }
  if (coupon.usage_limit && coupon.usage_limit > 0) {
    if ((coupon.usage_count || 0) >= coupon.usage_limit) {
      return { isValid: false, discount: 0, reason: 'This coupon has reached its maximum usage limit.' };
    }
  }
  if (coupon.min_order_amount && subtotal < coupon.min_order_amount) {
    return {
      isValid: false,
      discount: 0,
      reason: `Requires a minimum cake subtotal of ৳${coupon.min_order_amount}.`,
    };
  }

  let discount = 0;
  if (coupon.discount_type === 'percentage') {
    discount = Math.round((subtotal * coupon.discount_value) / 100);
    if (coupon.max_discount_amount && discount > coupon.max_discount_amount) {
      discount = coupon.max_discount_amount;
    }
  } else {
    discount = Math.min(coupon.discount_value, subtotal);
  }

  return {
    isValid: true,
    coupon,
    discount,
  };
}
