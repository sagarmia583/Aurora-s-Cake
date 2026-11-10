import QRCode from 'qrcode';
import { ORDER_TRACKING_ORIGIN } from './orderTrackingLink';

export const PUBLIC_WEBSITE = ORDER_TRACKING_ORIGIN + '/';
export const PUBLIC_FACEBOOK = 'https://www.facebook.com/aurorascake26';

function publicUrl(value?: string): URL | undefined {
  const input = value?.trim();
  if (!input || input.length > 180) return;
  try {
    const url = new URL(input.includes('://') ? input : 'https://' + input);
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        !/\.[a-z]{2,63}$/i.test(url.hostname) ||
        /\.(localhost|local|lan|internal|test|invalid|example|onion)$/i.test(url.hostname) ||
        url.href.length > 180) return;
    return url;
  } catch {
    return;
  }
}

export function resolvePublicWebUrl(value?: string): string {
  const url = publicUrl(value);
  // Older POS settings used this unregistered hostname as their default.
  return url && !/^(?:(www\.)?aurorascake\.com|aurora-s-cake\.sagarmia583\.workers\.dev|aurora-s-cake\.(?:pages\.dev|vercel\.app))$/i.test(url.hostname) ? url.href : PUBLIC_WEBSITE;
}

export function resolveFacebookUrl(value?: string): string {
  const url = publicUrl(value);
  return url && /^(?:(?:www|m|web)\.)?facebook\.com$/i.test(url.hostname) && url.pathname !== '/'
    ? url.href : PUBLIC_FACEBOOK;
}

export function createQrSvgPath(url: string) {
  // URL.href is ASCII, so explicitly pass bytes for Hermes runtimes.
  const bytes = Uint8Array.from(url, character => character.charCodeAt(0));
  const {modules} = QRCode.create([{data:bytes,mode:'byte'}],{errorCorrectionLevel:'M'});
  const margin = 4;
  const size = modules.size + margin * 2;
  const blocks: string[] = [];
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (modules.get(row, col)) blocks.push(`M${col + margin} ${row + margin}h1v1h-1z`);
    }
  }
  return {size,path:blocks.join(' ')};
}
