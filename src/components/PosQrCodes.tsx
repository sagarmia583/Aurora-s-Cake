import React, { useMemo } from 'react';
import {createQrSvgPath,resolvePublicWebUrl,resolveFacebookUrl,PUBLIC_WEBSITE,PUBLIC_FACEBOOK} from '../../apps/staff-mobile/src/receiptQr';
export {resolvePublicWebUrl} from '../../apps/staff-mobile/src/receiptQr';

interface PosSingleQrProps {
  url: string;
  title: string;
  subtitle?: string;
  icon?: string;
  size?: number;
  className?: string;
}

export const PosSingleQr: React.FC<PosSingleQrProps> = ({
  url,
  title,
  subtitle,
  icon,
  size = 72,
  className = '',
}) => {
  // The SVG includes its own four-module quiet zone.
  const { size: totalSize, path } = useMemo(() => createQrSvgPath(url), [url]);

  if (!url || !path) return null;

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={`flex min-w-0 flex-col items-center text-center text-black ${className}`}>
      {/* Clean borderless white container so outer box does NOT corrupt the QR quiet zone */}
      <div 
        className="bg-white p-1 inline-flex items-center justify-center"
        style={{ width: size + 6, height: size + 6 }}
      >
        <svg
          viewBox={`0 0 ${totalSize} ${totalSize}`}
          width={size}
          height={size}
          shapeRendering="crispEdges"
          className="bg-white block mx-auto"
          aria-label={`${title} QR Code`}
        >
          <rect width={totalSize} height={totalSize} fill="#ffffff" />
          <path d={path} fill="#000000" />
        </svg>
      </div>
      <div className="mt-1 leading-tight">
        <div className="font-black text-black text-[10px] flex items-center justify-center gap-1">
          {icon && <span>{icon}</span>}
          <span>{title}</span>
        </div>
        {subtitle && (
          <div className="text-[8px] font-semibold text-slate-700">
            {subtitle}
          </div>
        )}
      </div>
    </a>
  );
};

export interface PosDualQrCodesProps {
  websiteUrl?: string;
  facebookUrl?: string;
  showWeb?: boolean;
  showFacebook?: boolean;
  size?: number;
  isNarrow?: boolean;
  headingText?: string;
  className?: string;
}

export const PosDualQrCodes: React.FC<PosDualQrCodesProps> = ({
  websiteUrl = PUBLIC_WEBSITE,
  facebookUrl = PUBLIC_FACEBOOK,
  showWeb = true,
  showFacebook = true,
  size,
  isNarrow = false,
  headingText = '📱 SCAN TO CONNECT & RE-ORDER',
  className = '',
}) => {
  if (!showWeb && !showFacebook) return null;

  // Determine optimal QR size based on roll width
  const effectiveSize = size || (isNarrow ? 76 : 88);

  // Sanitize URLs to ensure no localhost on customer-facing slips
  const safeWebUrl = resolvePublicWebUrl(websiteUrl);
  const safeFacebookUrl = resolveFacebookUrl(facebookUrl);

  // Clean display labels
  const webDisplay = safeWebUrl.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  const fbDisplay = safeFacebookUrl.includes('facebook.com/') 
    ? safeFacebookUrl.split('facebook.com/')[1].replace(/\/$/, '') 
    : 'aurorascake26';

  return (
    <div className={`border-t-2 border-dashed border-black pt-2 my-1 text-black font-sans ${className}`}>
      {headingText && (
        <div className="text-center font-black text-[9px] uppercase tracking-wider text-black pb-1">
          {headingText}
        </div>
      )}

      <div className={`flex items-start justify-around gap-2 px-1 ${isNarrow ? 'gap-1.5' : 'gap-3'}`}>
        {showWeb && (
          <PosSingleQr
            url={safeWebUrl}
            title="Website"
            subtitle={isNarrow ? 'Menu and orders' : (webDisplay.length > 18 ? 'Menu and orders' : webDisplay)}
            
            size={effectiveSize}
          />
        )}

        {showFacebook && (
          <PosSingleQr
            url={safeFacebookUrl}
            title="Facebook"
            subtitle={isNarrow ? 'Reviews and chat' : `@${fbDisplay}`}
            
            size={effectiveSize}
          />
        )}
      </div>

      <div className="text-center text-[8px] font-bold text-slate-800 pt-1 border-t border-dotted border-slate-400 mt-1.5">
        Leave a photo review or place another order.
      </div>
    </div>
  );
};
