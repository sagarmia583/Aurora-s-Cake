#!/usr/bin/env node
// Optional local SQL verification. No connection to a live database is made.
// Usage: node scripts/verify-supabase-health.mjs ../health-sql-runtime
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

let moduleUrl = '@electric-sql/pglite';
if (process.argv[2]) {
  const fromRuntime = createRequire(resolve(process.argv[2], 'package.json'));
  moduleUrl = pathToFileURL(fromRuntime.resolve('@electric-sql/pglite')).href;
}
const { PGlite } = await import(moduleUrl);
const db = await PGlite.create();
try {
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  `);
  const migration = await readFile(new URL('../supabase/migrations/20261030_005_operational_health.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration); // Rerunning must preserve the existing singleton.

  const before = await db.query('SELECT * FROM aurora_monitoring.app_health ORDER BY id');
  const roleBefore = await db.query('SELECT current_user');
  assert.equal(before.rows.length, 1);
  const verification = await readFile(new URL('../supabase/00-health-verification.sql', import.meta.url), 'utf8');
  await db.exec(verification);
  const after = await db.query('SELECT * FROM aurora_monitoring.app_health ORDER BY id');
  assert.deepEqual(after.rows, before.rows, 'Dashboard verification must roll back every fixture change');
  assert.deepEqual((await db.query('SELECT current_user')).rows, roleBefore.rows, 'Dashboard verification must restore the original database role');

  // Verify malformed slot/nonce rejection as actual PostgreSQL function execution.
  for (const sql of [
    `SELECT public.aurora_operational_heartbeat(NULL, '00000000-0000-4000-8000-000000000001')`,
    `SELECT public.aurora_operational_heartbeat(date_bin(INTERVAL '6 hours', now(), TIMESTAMPTZ '2000-01-01+00'), NULL)`,
    `SELECT public.aurora_operational_heartbeat(date_bin(INTERVAL '6 hours', now(), TIMESTAMPTZ '2000-01-01+00') + INTERVAL '1 minute', '00000000-0000-4000-8000-000000000001')`,
    `SELECT public.aurora_operational_heartbeat(date_bin(INTERVAL '6 hours', now(), TIMESTAMPTZ '2000-01-01+00') - INTERVAL '30 hours', '00000000-0000-4000-8000-000000000001')`,
  ]) {
    await assert.rejects(db.query(sql), error => error.code === '22023');
  }
  assert.deepEqual((await db.query('SELECT * FROM aurora_monitoring.app_health ORDER BY id')).rows, before.rows);
  const version = await db.query('SHOW server_version');
  console.log(`PASS: PostgreSQL ${version.rows[0].server_version} (PGlite): migration/rerun, browser-role denials, owner/service-role execution, idempotency, monotonic slots, malformed inputs, and complete verification rollback.`);
} finally {
  await db.close();
}
