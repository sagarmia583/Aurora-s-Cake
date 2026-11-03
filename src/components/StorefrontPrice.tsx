import React from 'react';

export function StorefrontPrice({regular, current, currency, size, compact = false}: {
  regular: number;
  current: number;
  currency: string;
  size?: string;
  compact?: boolean;
}) {
  const discount = regular - current;
  const money = (amount: number) => currency + amount.toLocaleString('en-BD', {maximumFractionDigits: 2});

  return <div className={`ac-storefront-price${compact ? ' ac-storefront-price--compact' : ''}`}>
    {size && <span className="ac-storefront-price-size">{size}</span>}
    <div className="ac-storefront-price-values">
      {discount > 0 && <span className="ac-storefront-price-regular">
        নিয়মিত <del>{money(regular)}</del>
      </span>}
      <span className="ac-storefront-price-pay">
        <span>{discount > 0 ? 'অফার' : 'মূল্য'}</span>
        <b>{money(current)}</b>
      </span>
      {discount > 0 && <span className="ac-discount-pill">{money(discount)} ছাড়</span>}
    </div>
  </div>;
}
