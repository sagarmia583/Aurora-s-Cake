import React, { useState } from 'react';

type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> & {
  src: string;
  alt: string;
  brandName: string;
};

/** Try the configured brand image; a new URL gets its own fresh load state. */
export function BrandImage(props: Props) {
  return <BrandImageSource key={props.src} {...props} />;
}

function BrandImageSource({ brandName, alt, style, onError, ...props }: Props) {
  const [failed, setFailed] = useState(false);
  if (!failed) return <img {...props} alt={alt} style={style} onError={event => {
    setFailed(true);
    onError?.(event);
  }} />;

  const initials = brandName.trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map(word => Array.from(word)[0]).join('').toLocaleUpperCase();
  const dimension = (value: string | number | undefined) =>
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return <span className={props.className} role={alt ? 'img' : undefined}
    aria-label={alt || undefined} aria-hidden={alt ? undefined : true} data-brand-fallback
    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      width: dimension(props.width) || 42, height: dimension(props.height) || 42,
      borderRadius: 8, background: 'rgba(143, 173, 145, .16)', fontSize: 15, fontWeight: 700,
      lineHeight: 1, ...style }}>
    {initials || <span aria-hidden="true">✦</span>}
  </span>;
}
