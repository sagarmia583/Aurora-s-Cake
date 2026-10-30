/** Bounded operational checks. These records never contain bakery/customer data. */
export const SUPABASE_HEALTH_CRON = '7,22,37,52 * * * *';
const WINDOW_MS = 6 * 60 * 60 * 1000;
const SLOT_MS = 15 * 60 * 1000;
const TICK_OFFSET_MS = 7 * 60 * 1000;
const MAX_EVENT_AGE_MS = 30 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 8000;
const PROJECT_HOST = /^[a-z0-9]{20}\.supabase\.co$/;

function legacyServiceKey(value) {
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return false;
  try {
    const encoded = value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(encoded)).role === 'service_role';
  } catch { return false; }
}

/** The server key is deliberately never returned by this diagnostic. */
export function supabaseHealthConfiguration(env = {}) {
  const enabled = env.SUPABASE_HEALTH_ENABLED === 'true';
  let url;
  try { url = new URL(env.SUPABASE_URL || ''); } catch { /* Invalid/missing config. */ }
  if (!url || url.protocol !== 'https:' || !PROJECT_HOST.test(url.hostname) ||
      url.username || url.password || url.port || !['', '/'].includes(url.pathname) || url.search || url.hash) {
    return { enabled, configured: false, code: 'missing_or_invalid_project_url' };
  }
  const key = typeof env.SUPABASE_SERVER_KEY === 'string' ? env.SUPABASE_SERVER_KEY : '';
  const isSecret = /^sb_secret_[A-Za-z0-9_-]{20,}$/.test(key);
  if (!isSecret && !legacyServiceKey(key)) {
    return { enabled, configured: false, code: 'missing_or_invalid_server_key' };
  }
  return { enabled, configured: true, code: enabled ? 'configured' : 'disabled' };
}

/** One changing quarter-hour per UTC six-hour window, computed without a database call. */
export async function supabaseHealthDueSlot(scheduledTime, projectUrl) {
  if (!Number.isFinite(scheduledTime) || scheduledTime < 0) return null;
  const url = new URL(projectUrl);
  const windowStart = Math.floor(scheduledTime / WINDOW_MS) * WINDOW_MS;
  const date = new Date(windowStart).toISOString().slice(0, 10);
  const window = new Date(windowStart).getUTCHours() / 6;
  const input = new TextEncoder().encode(`${url.hostname}|${date}|${window}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
  const quarter = ((digest[0] << 8) | digest[1]) % (WINDOW_MS / SLOT_MS);
  const dueAt = windowStart + quarter * SLOT_MS + TICK_OFFSET_MS;
  // A scheduled event's epoch minute is authoritative; execution can start later.
  if (Math.floor(scheduledTime / 60000) !== Math.floor(dueAt / 60000)) return null;
  return { slot: new Date(windowStart).toISOString(), scheduledAt: dueAt };
}

/** Called by Cloudflare scheduled(), never by visitor actions or an HTTP send route. */
export async function runSupabaseScheduledHealth(event, env = {}, options = {}) {
  const config = supabaseHealthConfiguration(env);
  if (!config.enabled) return { status: 'disabled' };
  if (!config.configured) return { status: 'not_configured', code: config.code };
  const now = options.now ?? Date.now();
  const scheduledTime = event?.scheduledTime;
  if (!Number.isFinite(now) || !Number.isFinite(scheduledTime) ||
      scheduledTime > now + 60000 || now - scheduledTime > MAX_EVENT_AGE_MS) {
    return { status: 'stale_event' };
  }
  let due;
  try { due = await supabaseHealthDueSlot(scheduledTime, env.SUPABASE_URL); }
  catch { return { status: 'not_configured', code: 'schedule_unavailable' }; }
  if (!due) return { status: 'not_due' };

  const endpoint = new URL('/rest/v1/rpc/aurora_operational_heartbeat', env.SUPABASE_URL);
  const headers = { 'Content-Type': 'application/json', apikey: env.SUPABASE_SERVER_KEY };
  // Opaque sb_secret_ keys are not JWTs and must not be placed in Bearer.
  if (legacyServiceKey(env.SUPABASE_SERVER_KEY)) headers.Authorization = `Bearer ${env.SUPABASE_SERVER_KEY}`;
  const controller = new AbortController();
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.max(1, Math.min(DEFAULT_TIMEOUT_MS, options.timeoutMs)) : DEFAULT_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (options.fetcher || fetch)(endpoint.href, {
      method: 'POST', headers, credentials: 'omit', redirect: 'error', cache: 'no-store',
      body: JSON.stringify({ p_slot: due.slot, p_request_id: crypto.randomUUID() }),
      signal: controller.signal,
    });
    if (!response.ok) return { status: 'unavailable', httpStatus: response.status };
    const result = await response.json();
    if (!result || result.ok !== true || typeof result.applied !== 'boolean' ||
        typeof result.checked_at !== 'string' || !Number.isFinite(Date.parse(result.checked_at))) {
      return { status: 'invalid_response' };
    }
    return { status: result.applied ? 'healthy' : 'already_checked' };
  } catch { return { status: 'unavailable' }; }
  finally { clearTimeout(timeout); }
}
