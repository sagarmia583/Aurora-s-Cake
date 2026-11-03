export const ORDER_RECEIPT_BASE = 'https://script.google.com/macros/s/AKfycbw38J4AzlYkAhNtyDAp_CP34fUk9Epae6xz46AQFbF9ye1VsZjxTXmzbJgs52WEoWETMw/exec';
export const ORDER_TRACKING_ORIGIN = 'https://aurorascake.netlify.app';
export const ORDER_TRACKING_PATH = '/track-order';

export function readOrderTrackingKey(parameters: URLSearchParams) {
  const orderId = parameters.get('ref') ?? '';
  const accessKey = parameters.get('access') ?? '';
  return /^ord_[0-9a-f-]{36}$/i.test(orderId) && /^[0-9a-f-]{72}$/i.test(accessKey)
    ? { orderId, accessKey }
    : null;
}

export function websiteOrderTrackingLink(value: unknown, orderId: string): string {
  if (typeof value !== 'string') return '';
  try {
    const legacy = new URL(value);
    if (legacy.origin + legacy.pathname !== ORDER_RECEIPT_BASE || legacy.username || legacy.password ||
        legacy.hash || legacy.searchParams.get('action') !== 'receipt') return '';
    const key = readOrderTrackingKey(legacy.searchParams);
    if (!key || key.orderId !== orderId) return '';
    const url = new URL(ORDER_TRACKING_PATH, ORDER_TRACKING_ORIGIN);
    url.hash = new URLSearchParams({ ref: key.orderId, access: key.accessKey }).toString();
    return url.href;
  } catch {
    return '';
  }
}
