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
