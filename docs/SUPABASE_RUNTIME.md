# Private Supabase runtime bridge

This is an implemented, **inactive by default** persistence adapter for the existing Apps Script API. It moves row storage to project `dtvefwpaxwffxglqbfoo` while preserving account hashes, sessions, original text IDs, receipt capabilities, authoritative pricing, staff workflows and email consent. It is not a replacement with the unrelated old Supabase prototype or Supabase Auth.

The frontend continues calling the same Worker/API/Apps Script endpoints. Receipt `persistence: 'google_sheets'` remains a compatibility label required by existing tracking, recovery and ownership code. Actual storage is reported by the safe `database_backend` health field. Filenames and that compatibility label do not select the database. Follow `SUPABASE_CUTOVER.md` for the required final freeze/drain/export and guarded reopening procedure.

## Implemented boundaries

- `SupabaseStore.gs` reads one bounded, consistent snapshot through `aurora_runtime_snapshot`. It emulates the existing numeric range reads, row appends, partial cell writes, exact TextFinder, and harmless formatting methods.
- Changes accumulate as **changed rows only**. `aurora_runtime_commit` locks the singleton revision, validates the expected revision, and applies the bounded row delta in one PostgreSQL transaction. It cannot delete or replace tables, alter headers, change an existing record key or execute dynamic SQL.
- A global revision protects both existing-row updates and absent-row/reference checks in the existing business rules. A conflict aborts the complete delta. Business actions are not automatically replayed; the customer retries the same request ID.
- Lost commit acknowledgements retry the exact operation ID/revision/payload once. Server-side operation receipts prevent duplicate appends. An uncertain failure never switches back to Sheets.
- `doGet`/`doPost` initialize and discard request state. Successful JSON replies flush before being acknowledged. Validation failures discard pending business changes. Failed password-login and delivery-OTP counters have explicit durable checkpoints before their rejection response.
- Confirmation email state and campaign delivery claims commit before MailApp. After a send releases/reacquires the lock, the next logical transaction refreshes account/consent state. Trigger cleanup checks a fresh campaign list, preserving work queued during a send.
- Locks with already-authenticated objects retain their original database revision unless that path explicitly refreshes and reauthenticates. Concurrent changes therefore cause a safe CAS failure rather than silently applying stale authorization. ScriptLock is not treated as a database-wide lock.
- `auroraAccountSave_` preserves unknown owner columns such as `staff_accounts.permissions`. Imported extra order/account columns are retained.

The runtime remains intentionally small: at most 64 tables, 100 columns per table, 50,000 total data rows and an 8 MiB serialized snapshot. A commit is at most 1,000 changed rows and 2 MiB. Larger datasets fail closed and require indexed domain repositories rather than raising these limits without review. Snapshot reads can contain private customer and credential material; never log their payloads or call these RPCs from the browser.

## Owner database preparation

Apply migrations `20261030_006_migration_staging.sql` and `20261030_007_private_runtime_store.sql` to the authorized project. Do **not** apply migrations 001–004 as the production model. Import the private prepared SQL using the staging workflow. Its data, backup and manifest belong outside the source checkout and public/build folders.

Immediately before promotion, rerun the exact prepared SQL to reconcile every staging header, cell, formula, source ID and hash against the reviewed export. A privileged owner can change staging manually; `verified_staging` alone is not a fresh reconciliation guarantee.

Promotion is an owner-only SQL function, unavailable to `anon`, `authenticated` and `service_role`:

```sql
-- Inspect the manifest and audits in the private SQL Editor first.
SELECT run_id, source_sha256, status, manifest->'audits' AS audits,
       encode(sha256(convert_to((manifest->'audits')::text,'UTF8')),'hex') AS audits_sha256
FROM aurora_migration.runs
WHERE run_id = 'REVIEWED_RUN_ID';

SELECT aurora_runtime.promote_staged_run(
  p_run_id => 'REVIEWED_RUN_ID',
  p_expected_source_sha256 => 'REVIEWED_SOURCE_SHA256',
  p_accept_static_formulas => false,
  p_reviewed_audits_sha256 => NULL,
  p_review_note => NULL
);
```

When the source has audit blockers, promotion requires an explicit exact PostgreSQL JSONB audit hash and a 20–2,000-character owner review note. This acknowledges the reviewed source; it neither removes the rows nor invents missing parents. Source formulas require a separate explicit `p_accept_static_formulas => true`: computed scalar values become static runtime data, and original formulas stay in staging and source metadata. Formula-dependent recalculation needs a replacement implementation before accepting that option.

The current exported source contains 36 tabs and 214 rows. Review found one existing orphan `order_items` reference and one numeric phone formula in `settings`. Both are preserved. Accepting the orphan and the static formula is an owner decision, not an automatic repair. Promotion records its review and refuses to overwrite a runtime initialized from another run. Repeating the same promotion returns its current revision without resetting live changes.

Private runtime tables are under `aurora_runtime`; all have forced RLS and no browser policies or grants. Two business-store RPCs are exposed, both executable solely by the service role. SQL 008 adds a third service-only, metadata-only cutover status RPC. Do not add the private schemas to Supabase's exposed schemas.

## Apps Script configuration and cutover

Set Script Properties in the existing owner-controlled project:

| Property | Value |
|---|---|
| `AURORA_SUPABASE_SERVICE_KEY` | A Supabase secret API key or legacy service-role JWT, kept private |
| `AURORA_DATABASE_BACKEND` | Leave unset or use `google_sheets` while preparing; exact `supabase` activates |

The origin and project reference are pinned in code. A publishable key is rejected. Unknown backend values are rejected; there is no typo fallback. Never put a service key in `VITE_*`, browser code, GitHub, query parameters, exported setup kits or logs. The adapter sends no redirects and has no configurable outbound origin.

Preserve the existing owner/staff allowlist, Google client ID, subscription signing secret, campaign owner settings and installed trigger identity. Password hashes remain the existing scheme; active session hashes are preserved rather than being converted to `auth.users`. Apps Script still handles Google verification, MailApp and private Drive image serving. Those dependencies do not disappear when storage changes.

Rebuild the one-file deployment with `node scripts/build-apps-script.mjs`. Deploy the complete new bundle as a new version with the feature still off. Then:

1. Verify public, checkout, customer, staff, image and email-link behavior with the legacy backend selected.
2. Freeze source writes briefly, export/reconcile the final source, and perform reviewed promotion. An older export does not include orders received after it was captured.
3. Set the private service key and select exact `supabase`. Verify health reports the new release and `database_backend: 'supabase'`.
4. Complete private end-to-end acceptance: authoritative catalog, guest checkout, same-ID retry, second-device account/profile/history, staff status/OTP, receipt recovery, custom cake quote, explicit opt-in/confirmation/unsubscribe and owner campaign preview. Use controlled recipients; no bulk campaign is part of migration testing.
5. Keep the source backup. After Supabase accepts new writes, changing the flag back alone loses those updates. Reconcile/reverse-migrate the target delta before rolling back authority.

Do not call `setupSheetDatabase()` after activation: it explicitly refuses to seed or rebuild the SQL-managed runtime. Manual Customer Master backfill has its own begin/flush/end boundary and commits before returning counts.

## Campaign owner editing bridge

The existing Sheet menu remains the owner draft editor. New drafts are created in Supabase, committed, and projected into the physical `email_campaigns` tab. Review and confirmation copy only `subject`, `body` and `product_url` from the selected owner row to the authoritative draft. They cannot import recipient lists, counters or delivery statuses. Content/audience changes still invalidate the review token. Completed campaign status is projected back for display; projection failure does not reverse an accepted database operation.

Ordinary Sheet edits to catalog, profiles, orders or other tabs are **not synchronized after activation**. Use the website's authenticated editors or owner SQL tools. Editing the old `email_deliveries` Sheet is also not a write to the database. Supabase remains the single authority; the original Sheet is not a live mirror or a second writer.

## Verification and remaining acceptance

Offline tests cover inactive behavior, exact-range operations, bounded deltas, concurrent revision conflicts, lost acknowledgements, lockout checkpoints, checkout retry semantics, cross-device phone profiles/history, receipt linking, staff/rider/OTP transitions, campaign draft projection, durable mail claims and unsubscribe changes between recipients. SQL 007 was separately executed in an isolated PostgreSQL-compatible PGlite instance against the actual private 36-table export: source parity, promotion gates, role denials, replay/conflict and atomic rollback passed. This is not evidence of live activation or live mail delivery.

Existing inventory/finance/legacy tables are preserved generically, including empty tables. Current checked-in Apps Script does not contain the old finance/inventory/POS action implementation; disabled D1 preview is a separate model. Do not describe preserving stored rows as completing missing feature/API parity. Add explicit acceptance for any deployed custom backend features before replacing that deployment.

Operation receipts are durable idempotency evidence. Do not casually purge `aurora_runtime.commits` or manually rewrite runtime rows/revisions. A future retention policy needs an explicit retry horizon. The keepalive/operational-health mechanism is separate and does not prove business-data migration.
