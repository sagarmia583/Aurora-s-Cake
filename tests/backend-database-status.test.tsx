import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SupabaseSyncModal } from '../src/components/SupabaseSyncModal';
import {
  databaseBackendLabel, loadBackendDatabaseStatus, parseBackendDatabaseStatus, unknownBackendDatabaseStatus,
} from '../src/services/backendDatabaseStatus';

const backend = { ok: true, database_backend: 'google_sheets', installed_release: 'aurora-2026-10-30-profiles-email-r1', up_to_date: true };
const health = { ok: true, provider: 'supabase', enabled: false, configured: true };
const noop = () => {};

test('only an allowlisted production backend mode can select Supabase', () => {
  const configured = { ...health, enabled: true };
  for (const record of [null, {}, { isConnected: true }, { source: 'supabase_live' }, { ok: false, database_backend: 'supabase' },
    { ok: true, database_backend: 'SUPABASE' }, { ok: true, database_backend: true }, { ok: true }, { ok: true, database_backend: '<script>' }]) {
    const status = parseBackendDatabaseStatus(record, configured);
    assert.equal(status.backend, 'unknown');
    assert.equal(status.scheduledChecks.configured, true);
  }
  const sheets = parseBackendDatabaseStatus(backend, configured);
  assert.equal(sheets.backend, 'google_sheets');
  assert.equal(sheets.available, true);
  assert.equal(parseBackendDatabaseStatus({ ...backend, database_backend: 'supabase' }, null).backend, 'supabase');
  assert.deepEqual(['google_sheets', 'supabase', 'unknown'].map(value => databaseBackendLabel(value as 'google_sheets' | 'supabase' | 'unknown')),
    ['Google Sheets', 'Supabase', 'Status unknown']);
});

test('release and scheduled configuration fields reject unsafe or malformed values', () => {
  const valid = parseBackendDatabaseStatus({ ...backend, up_to_date: false }, health);
  assert.equal(valid.installedRelease, backend.installed_release);
  assert.equal(valid.upToDate, false);
  assert.deepEqual(valid.scheduledChecks, { available: true, enabled: false, configured: true });
  for (const installed_release of ['secret value with spaces', '<script>', 'x'.repeat(121), 12, null]) {
    const status = parseBackendDatabaseStatus({ ...backend, installed_release, up_to_date: 'true' }, health);
    assert.equal(status.installedRelease, null);
    assert.equal(status.upToDate, null);
  }
  for (const malformed of [{ ...health, ok: false }, { ...health, enabled: 'true' }, { ...health, configured: 'true' },
    { ...health, provider: 'other' }, null, []]) {
    assert.deepEqual(parseBackendDatabaseStatus(backend, malformed).scheduledChecks, unknownBackendDatabaseStatus().scheduledChecks);
  }
});

test('both read-only diagnostics start together and use fixed same-origin paths without credentials', async () => {
  const pending: { path: string; resolve: (value: Response) => void }[] = [];
  const fetcher = ((input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    assert.equal(init?.method, 'GET');
    assert.equal(init?.cache, 'no-store');
    assert.equal(init?.redirect, 'error');
    assert.equal(init?.credentials, 'same-origin');
    assert.equal(init?.body, undefined);
    assert.equal(new Headers(init?.headers).has('authorization'), false);
    assert.equal(new Headers(init?.headers).has('apikey'), false);
    assert.ok(init?.signal instanceof AbortSignal);
    return new Promise<Response>(resolve => pending.push({ path, resolve }));
  }) as typeof fetch;
  const promise = loadBackendDatabaseStatus({ fetcher });
  assert.deepEqual(pending.map(item => item.path), ['/api/backend-health', '/api/supabase-health']);
  pending[0].resolve(Response.json(backend));
  pending[1].resolve(Response.json(health));
  assert.deepEqual(await promise, parseBackendDatabaseStatus(backend, health));
});

test('partial and failed diagnostics preserve only independently verified information', async () => {
  for (const [backendResponse, healthResponse, expectedBackend, configured] of [
    [new Response('private SQL failure', { status: 503 }), Response.json(health), 'unknown', true],
    [Response.json(backend), new Response('private key failure', { status: 500 }), 'google_sheets', null],
    [new Response('not JSON'), Response.json(health), 'unknown', true],
    [Response.json({ ...backend, ok: false }), Response.json(health), 'unknown', true],
  ] as const) {
    const status = await loadBackendDatabaseStatus({ fetcher: (async input => String(input) === '/api/backend-health' ? backendResponse : healthResponse) as typeof fetch });
    assert.equal(status.backend, expectedBackend);
    assert.equal(status.scheduledChecks.configured, configured);
    assert.equal(JSON.stringify(status).includes('private'), false);
  }
  assert.deepEqual(await loadBackendDatabaseStatus({ fetcher: (async () => { throw new Error('PRIVATE_RESPONSE'); }) as typeof fetch }), unknownBackendDatabaseStatus());
});

test('abort cancels both diagnostics and cannot retain an obsolete Supabase mode', async () => {
  const controller = new AbortController();
  let calls = 0;
  const fetcher = ((_input: RequestInfo | URL, init?: RequestInit) => {
    calls += 1;
    return new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  }) as typeof fetch;
  const promise = loadBackendDatabaseStatus({ fetcher, signal: controller.signal });
  assert.equal(calls, 2);
  controller.abort();
  assert.deepEqual(await promise, unknownBackendDatabaseStatus());
  assert.deepEqual(await loadBackendDatabaseStatus({ fetcher, signal: controller.signal }), unknownBackendDatabaseStatus());
  assert.equal(calls, 2, 'already aborted callers must not start new requests');
});

test('modal shows Google Sheets when Supabase checks are configured but disabled', () => {
  const markup = renderToStaticMarkup(<SupabaseSyncModal isOpen onClose={noop} onRefresh={noop} loading={false} status={parseBackendDatabaseStatus(backend, health)} />);
  assert.match(markup, /Active database: Google Sheets/);
  assert.match(markup, /production backend is using Google Sheets/);
  assert.match(markup, /Disabled/);
  assert.match(markup, /Configured/);
  assert.match(markup, /Up to date/);
  assert.match(markup, /role="dialog"/);
  assert.match(markup, /aria-modal="true"/);
  assert.match(markup, /aria-label="Close database status"/);
  assert.doesNotMatch(markup, /<input|Local Database Mode|Local DB|Seed|SQL Editor|Anon Key/);
});

test('configured checks never label an unknown backend as active Supabase', () => {
  const unknown = parseBackendDatabaseStatus(null, { ...health, enabled: true });
  const markup = renderToStaticMarkup(<SupabaseSyncModal isOpen onClose={noop} onRefresh={noop} loading={false} status={unknown} />);
  assert.match(markup, /Active database: Status unknown/);
  assert.doesNotMatch(markup, /Active database: Supabase|production backend is using Supabase/);
  const active = renderToStaticMarkup(<SupabaseSyncModal isOpen onClose={noop} onRefresh={noop} loading status={parseBackendDatabaseStatus({ ...backend, database_backend: 'supabase' }, health)} />);
  assert.match(active, /Active database: Supabase/);
  assert.match(active, /Checking production status/);
  assert.match(active, /disabled=""/);
  assert.equal(renderToStaticMarkup(<SupabaseSyncModal isOpen={false} onClose={noop} onRefresh={noop} loading={false} status={unknown} />), '');
});

test('application and modal cannot import the legacy browser database client or seed flow', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const modal = readFileSync(new URL('../src/components/SupabaseSyncModal.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /supabaseDataService|supabaseClient/);
  assert.doesNotMatch(modal, /supabaseDataService|supabaseClient|localStorage|createClient|saveConfig|pushAllData|CREATE POLICY|<input/);
});
