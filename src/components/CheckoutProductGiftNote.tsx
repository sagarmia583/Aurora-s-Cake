import React from 'react';
import type {Product} from '../types';
import {cleanFreeGiftItems, formatFreeGiftList} from '../utils/freeGifts';

/** Complimentary items must match this precise product only.
 * No shop-wide gift default, fabricated fallback, or paid add-on implied.
 */
export const CheckoutProductGiftNote: React.FC<{product:Product}>=({product})=>{
  const gifts=cleanFreeGiftItems(product.free_gift_items);
  if(!gifts.length)return null;
  return (
    <p className="mt-1 text-[10px] leading-relaxed font-semibold text-emerald-800 break-words" data-testid="checkout-product-gifts">
      🎁 এই কেকের ফ্রি উপহার: {formatFreeGiftList(gifts)}
    </p>
  );
};
