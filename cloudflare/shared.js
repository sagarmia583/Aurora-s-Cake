const SCRIPT_RE = /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;

export const JSON_HEADERS = {
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
};
export function json(status, data, headers={}) {
  return new Response(JSON.stringify(data), {status,headers:{...JSON_HEADERS,...headers}});
}
/** Public maintenance metadata only; never forward arbitrary Script Properties. */
export function migrationFreezeStatus(record) {
  const frozen=typeof record?.writes_frozen==='boolean'?record.writes_frozen:null;
  const value=record?.frozen_at;
  let timestamp=null;
  if(frozen===true&&typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    const parsed=Date.parse(value);
    if(Number.isFinite(parsed)&&new Date(parsed).toISOString()===value)timestamp=value;
  }
  return {writes_frozen:frozen,frozen_at:timestamp};
}
export function scriptUrl(env) {
  let url;
  try { url = new URL(env?.AURORA_SCRIPT_POST_URL || ''); } catch { return null; }
  return url.protocol === 'https:' && url.hostname === 'script.google.com' &&
    SCRIPT_RE.test(url.pathname) && !url.username && !url.password &&
    !url.search && !url.hash ? url : null;
}
export function expectedUpstream(response) {
  if (!response.ok) return false;
  try {
    const hostname = new URL(response.url).hostname;
    return hostname === 'script.google.com' || hostname === 'script.googleusercontent.com';
  } catch { return false; }
}
