import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SUPABASE_HEALTH_CRON,
  runSupabaseScheduledHealth,
  supabaseHealthConfiguration,
  supabaseHealthDueSlot,
} from '../cloudflare/supabaseHealth.js';
import { supabaseHealthStatusHandler } from '../cloudflare/supabaseHealthStatus.js';

const project = 'https://dtvefwpaxwffxglqbfoo.supabase.co';
const key = 'sb_secret_testOnlyNeverARealSecret123456789';
const env = { SUPABASE_URL: project, SUPABASE_SERVER_KEY: key, SUPABASE_HEALTH_ENABLED: 'true' };
const day = Date.parse('2026-10-30T00:00:00Z');
const quarterHour = 15 * 60 * 1000;
const sixHours = 6 * 60 * 60 * 1000;

function serviceJwt(role = 'service_role') {
  return [Buffer.from('{}').toString('base64url'), Buffer.from(JSON.stringify({ role })).toString('base64url'), 'testsignature'].join('.');
}

async function dueEvents(date = day) {
  const events: number[] = [];
  for (let tick = date + 7 * 60000; tick < date + 24 * 60 * 60000; tick += quarterHour) {
    if (await supabaseHealthDueSlot(tick, project)) events.push(tick);
  }
  return events;
}

function acknowledgement(applied = true) {
  return Response.json({ ok: true, applied, checked_at: '2026-10-30T00:07:00Z' });
}

test('health configuration is disabled unless exactly true, and exposes no secrets', async () => {
  let calls = 0;
  const fetcher = async () => { calls += 1; return acknowledgement(); };
  for (const flag of [undefined, false, true, 'TRUE', 'false', '1', '']) {
    const result = await runSupabaseScheduledHealth({ scheduledTime: day }, { ...env, SUPABASE_HEALTH_ENABLED: flag }, { now: day, fetcher });
    assert.deepEqual(result, { status: 'disabled' });
  }
  assert.equal(calls, 0);
  const status = supabaseHealthConfiguration(env);
  assert.deepEqual(status, { enabled: true, configured: true, code: 'configured' });
  assert.equal(JSON.stringify(status).includes(key), false);
  assert.equal(JSON.stringify(status).includes(project), false);
});

test('public status GET reports configuration only and never makes a database call', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls += 1; throw new Error('GET status must not fetch'); }) as typeof fetch;
  try {
    const response = supabaseHealthStatusHandler({ request: new Request('https://bakery.example/api/supabase-health'), env });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(await response.json(), { ok: true, provider: 'supabase', enabled: true, configured: true, code: 'configured' });
    const disabled = supabaseHealthStatusHandler({ request: new Request('https://bakery.example/api/supabase-health'), env: {} });
    assert.deepEqual(await disabled.json(), { ok: true, provider: 'supabase', enabled: false, configured: false, code: 'missing_or_invalid_project_url' });
    for (const method of ['POST', 'HEAD', 'DELETE']) {
      const denied = supabaseHealthStatusHandler({ request: new Request('https://bakery.example/api/supabase-health', { method }), env });
      assert.equal(denied.status, 405);
      assert.equal(denied.headers.get('allow'), 'GET');
      assert.deepEqual(await denied.json(), { ok: false, error: 'Method not allowed.' });
    }
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test('health configuration requires a clean official HTTPS project URL and a server key', async () => {
  let calls = 0;
  const fetcher = async () => { calls += 1; return acknowledgement(); };
  const urls = ['', 'http://dtvefwpaxwffxglqbfoo.supabase.co', 'https://example.com',
    project + '.evil.example', project + ':8443', project + '/rest/v1/', project + '?key=wrong',
    project + '#wrong', 'https://user:pass@dtvefwpaxwffxglqbfoo.supabase.co'];
  for (const url of urls) {
    assert.equal((await runSupabaseScheduledHealth({ scheduledTime: day }, { ...env, SUPABASE_URL: url }, { now: day, fetcher })).status, 'not_configured');
  }
  for (const invalidKey of ['', 'sb_publishable_notASecret12345678901234', serviceJwt('anon'), serviceJwt('authenticated'), 'invalid\nkey']) {
    assert.equal(supabaseHealthConfiguration({ ...env, SUPABASE_SERVER_KEY: invalidKey }).configured, false);
  }
  assert.equal(supabaseHealthConfiguration({ ...env, SUPABASE_SERVER_KEY: serviceJwt() }).configured, true);
  assert.equal(calls, 0);
});

test('96 cron ticks cause exactly four calls per day with changing quarter-hour slots', async () => {
  assert.equal(SUPABASE_HEALTH_CRON, '7,22,37,52 * * * *');
  const dailyTimes: string[] = [];
  for (let date = day; date < day + 7 * 24 * 60 * 60000; date += 24 * 60 * 60000) {
    const events = await dueEvents(date);
    assert.equal(events.length, 4);
    assert.deepEqual(events.map(time => Math.floor((time - date) / sixHours)), [0, 1, 2, 3]);
    const calls: string[] = [];
    for (let tick = date + 7 * 60000; tick < date + 24 * 60 * 60000; tick += quarterHour) {
      const result = await runSupabaseScheduledHealth({ scheduledTime: tick }, env, { now: tick,
        fetcher: async (url: string) => { calls.push(url); return acknowledgement(); } });
      assert.equal(result.status, events.includes(tick) ? 'healthy' : 'not_due');
    }
    assert.equal(calls.length, 4);
    dailyTimes.push(events.map(time => (time - date) % sixHours).join(','));
  }
  assert.ok(new Set(dailyTimes).size > 1, 'scheduled quarters should change across dates');
  assert.equal(await supabaseHealthDueSlot(Number.NaN, project), null);
});

test('stale and future scheduler events make no remote requests', async () => {
  const [tick] = await dueEvents();
  let calls = 0;
  const fetcher = async () => { calls += 1; return acknowledgement(); };
  for (const event of [{}, { scheduledTime: Number.NaN }, { scheduledTime: tick - 31 * 60000 }, { scheduledTime: tick + 2 * 60000 }]) {
    assert.deepEqual(await runSupabaseScheduledHealth(event, env, { now: tick, fetcher }), { status: 'stale_event' });
  }
  assert.equal(calls, 0);
});

test('opaque secret keys use apikey only and body has only slot and random nonce', async () => {
  const [tick] = await dueEvents();
  let calls = 0;
  const result = await runSupabaseScheduledHealth({ scheduledTime: tick }, env, { now: tick + 1000,
    fetcher: async (url: string, init: RequestInit) => {
      calls += 1;
      assert.equal(url, project + '/rest/v1/rpc/aurora_operational_heartbeat');
      assert.equal(init.method, 'POST');
      assert.equal(init.credentials, 'omit');
      assert.equal(init.redirect, 'error');
      assert.equal(init.cache, 'no-store');
      assert.equal(new Headers(init.headers).get('apikey'), key);
      assert.equal(new Headers(init.headers).has('authorization'), false);
      assert.equal(url.includes(key), false);
      const body = JSON.parse(String(init.body));
      assert.deepEqual(Object.keys(body).sort(), ['p_request_id', 'p_slot']);
      assert.equal(body.p_slot, new Date(Math.floor(tick / sixHours) * sixHours).toISOString());
      assert.match(body.p_request_id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
      assert.ok(init.signal instanceof AbortSignal);
      return acknowledgement();
    } });
  assert.deepEqual(result, { status: 'healthy' });
  assert.equal(calls, 1);
});

test('legacy service-role JWTs use apikey and Bearer headers', async () => {
  const [tick] = await dueEvents();
  const legacy = serviceJwt();
  assert.deepEqual(await runSupabaseScheduledHealth({ scheduledTime: tick }, { ...env, SUPABASE_SERVER_KEY: legacy }, { now: tick,
    fetcher: async (_url: string, init: RequestInit) => {
      assert.equal(new Headers(init.headers).get('apikey'), legacy);
      assert.equal(new Headers(init.headers).get('authorization'), 'Bearer ' + legacy);
      return acknowledgement();
    } }), { status: 'healthy' });
});

test('duplicate SQL acknowledgements are safe and HTTP/parse failures do not retry or expose response data', async () => {
  const [tick] = await dueEvents();
  const outcomes = [
    { fetcher: async () => acknowledgement(false), status: 'already_checked' },
    { fetcher: async () => new Response('server private error ' + key, { status: 503 }), status: 'unavailable' },
    { fetcher: async () => Response.json({ ok: true, applied: true, checked_at: 'invalid' }), status: 'invalid_response' },
    { fetcher: async () => new Response('not JSON ' + key), status: 'unavailable' },
    { fetcher: async () => { throw new Error('private error ' + key); }, status: 'unavailable' },
  ];
  for (const outcome of outcomes) {
    let calls = 0;
    const result = await runSupabaseScheduledHealth({ scheduledTime: tick }, env, { now: tick,
      fetcher: async () => { calls += 1; return outcome.fetcher(); } });
    assert.equal(result.status, outcome.status);
    assert.equal(calls, 1);
    assert.equal(JSON.stringify(result).includes(key), false);
  }
});

test('health timeout aborts the only remote request', async () => {
  const [tick] = await dueEvents();
  let calls = 0;
  let aborted = false;
  const result = await runSupabaseScheduledHealth({ scheduledTime: tick }, env, { now: tick, timeoutMs: 5,
    fetcher: async (_url: string, init: RequestInit) => {
      calls += 1;
      return new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => { aborted = true; reject(new Error('AbortError')); }, { once: true });
      });
    } });
  assert.deepEqual(result, { status: 'unavailable' });
  assert.equal(aborted, true);
  assert.equal(calls, 1);
});

test('health SQL restricts the singleton and RPC without altering business records', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261030_005_operational_health.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE SCHEMA IF NOT EXISTS aurora_monitoring/);
  assert.match(sql, /CHECK \(id = 1\)/);
  assert.match(sql, /app_health ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON SCHEMA aurora_monitoring FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /REVOKE ALL ON TABLE aurora_monitoring\.app_health FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /SECURITY DEFINER\s+SET search_path = ''/);
  assert.match(sql, /last_slot IS NULL OR last_slot < p_slot/);
  assert.match(sql, /p_slot > v_now OR p_slot < v_now - INTERVAL '24 hours'/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.aurora_operational_heartbeat\(timestamptz, uuid\) FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.aurora_operational_heartbeat\(timestamptz, uuid\) TO service_role/);
  assert.doesNotMatch(sql, /(?:INSERT INTO|UPDATE|DELETE FROM|ALTER TABLE)\s+(?:public\.)?(?:orders|customers|profiles|products)\b/i);
  const verification = readFileSync(new URL('../supabase/00-health-verification.sql', import.meta.url), 'utf8');
  assert.match(verification, /SET LOCAL ROLE %I/);
  assert.match(verification, /EXCEPTION WHEN insufficient_privilege/);
  assert.match(verification, /v_counter IS DISTINCT FROM 1/);
  assert.match(verification, /ROLLBACK;\s*$/);
  assert.doesNotMatch(verification, /^COMMIT\s*;/im);
});
