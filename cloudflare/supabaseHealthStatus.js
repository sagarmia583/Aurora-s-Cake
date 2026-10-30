import { json } from './shared.js';
import { supabaseHealthConfiguration } from './supabaseHealth.js';

/** Configuration diagnostic only. A public GET never triggers a database check. */
export function supabaseHealthStatusHandler({ request, env }) {
  if (request.method !== 'GET') {
    return json(405, { ok: false, error: 'Method not allowed.' }, { Allow: 'GET' });
  }
  return json(200, { ok: true, provider: 'supabase', ...supabaseHealthConfiguration(env) });
}
