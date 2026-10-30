# Final cutover without losing incoming writes

The existing `verified_staging` import is a backup, not the final live database. This release adds an owner-controlled write freeze and a seven-minute drain so the final export can include every completed source write. All controls are off until the owner explicitly starts them. They never select a backend, import data, promote a run, place orders or send campaign emails.

## Prepare first; keep the shop open

1. Deploy the complete `Code.AllInOne.gs` release `aurora-2026-10-30-supabase-store-r2` to the active `/exec` deployment, with `AURORA_DATABASE_BACKEND` still unset or `google_sheets`.
2. Set `AURORA_SUPABASE_SERVICE_KEY` privately in Apps Script Script Properties. Use the authorized project's secret/service-role key. Do not paste it into chat, a Sheet, GitHub, client code or the owner setup kit.
3. Run `verifySupabaseConnection()` manually as the configured owner. Its safe result is `{ok:true,code:'supabase_connection_verified'}`; the Execution log prints only the fixed result code, so share that code rather than any key or properties. It uses the pinned project's isolated operational heartbeat RPC with the real current six-hour slot and a fresh UUID. This may update the one operational-health row; it reads or writes no customer/order/catalog data and sends no mail. It does not promote or activate anything.
4. Confirm the live health release is exactly `aurora-2026-10-30-supabase-store-r2`. Prepare the final export/import procedure and a prompt owner handoff before starting the freeze. Do not leave checkout paused while waiting for keys, code deployment or a long chat response.

The editor controls require an interactive Google identity matching the effective identity and the configured campaign owner, or an already configured `super_admin` owner if no campaign owner exists. Anonymous HtmlService visitors and other editors cannot invoke them.

## Start a short, continuous freeze

Stop manual Sheet edits and all other writers first. Old Apps Script deployment URLs that still run older code may ignore this freeze. Update/disable their callers; do not assume a new deployment protects a separate old `/exec` version, another script project, direct database writers or manual Sheet changes.

Run `beginMigrationFreeze()` in the Apps Script editor. It acquires ScriptLock, records the original backend and sets one private timestamp. Repeating it returns the same timestamp rather than restarting the drain. Its safe freeze/drain metadata appears in the Execution log. Example safe result:

```json
{
  "ok": true,
  "writes_frozen": true,
  "frozen_at": "2026-10-30T12:00:00.000Z",
  "drain_until": "2026-10-30T12:07:00.000Z",
  "drain_ready": false
}
```

No function waits seven minutes in a blocking call. The timestamp is a gate: wait until at least `drain_until` before starting the final export. An execution that began before the freeze may finish within Apps Script's six-minute ceiling. The extra minute is the drain margin.

During the freeze:

- Every new POST is rejected before database reads/writes, including checkout retries, staff actions, account changes, uploads and email confirmation/unsubscribe forms. Responses use `code: 'migration_frozen'` and instruct retries with the same request ID. They deliberately omit `persisted:false`, since an earlier attempt may already have succeeded.
- Public content and health remain readable. Public content advertises `order_submission_enabled:false`, including content served from an earlier cached payload. Both backend caches are cleared on freeze changes.
- Health exposes only safe `writes_frozen` and strict-ISO `frozen_at`. Corrupt private metadata means frozen with `frozen_at:null`; its raw value is never returned. Future or invalid timestamps cannot satisfy the drain.
- Campaign workers stop before new claims, preserve their queue and installed trigger, and finish recording outcomes for already-claimed sends. They do not send later recipients while frozen. Owner draft edits, setup/backfill/image setup and campaign actions are also gated.
- `ok:true` Supabase health requires an actual valid runtime snapshot. A wrong key or unpromoted runtime yields a safe failure, not a claim that the database is ready; freeze metadata can still be present on that error.

## Export and promote the final source

1. After the full seven-minute drain, capture before-export health, export all source tabs, and capture after-export health. Both observations must show the same valid `frozen_at`, source backend `google_sheets` and an uninterrupted freeze. Keep the evidence and private export outside the repository.
2. Prepare and reconcile a **new final run**, whose `source.exported_at` is after the drain. The morning 36-tab/214-row snapshot cannot satisfy this gate. Counts may have changed while the shop remained open; retain all tabs and all completed records.
3. Use the private staging checker and `scripts/verify-supabase-cutover.mjs` to validate the final evidence and provenance. A count-only SQL response does not prove freshness or exact cell parity.
4. Apply the final reviewed import, SQL 007 runtime support and SQL 008 metadata-only cutover status, then owner-promote the exact final run. Verify `aurora_runtime.state` is empty before its first promotion. Promotion refuses to overwrite an initialized runtime. Do not delete/reset an existing runtime to get around this protection.
5. Explicitly review the known existing orphan row and static numeric phone formula as described in `SUPABASE_RUNTIME.md`. They remain preserved; no migration code invents a missing order or silently deletes a row.

SQL 008 exposes `aurora_runtime_cutover_status(p_project_ref)` only to the service role. It returns pinned project/run/checksum/export-time/revision metadata, never cells, credentials, sessions, receipt capabilities or customer details. It does not promote or change anything.

If an older run was accidentally promoted, keep writes frozen. The final guard rejects that run. Reconcile the situation with the owner rather than automatically overwriting data or switching authority.

## Explicitly reopen the target

While still frozen, explicitly select `AURORA_DATABASE_BACKEND=supabase` in the existing owner's Script Properties. This is a deliberate owner action; none of the freeze/verification functions selects it.

Run `endMigrationFreeze()`. It permits only the selected Supabase backend and requires all of the following:

- A valid freeze timestamp at least seven minutes old.
- A successful operational connection verification within 24 hours, matching the current private key and pinned project. Rotating the key requires verification again.
- A successful actual private runtime snapshot using that key.
- A promoted final run from the same project, with valid run/checksum identity and a matching current revision.
- `source_exported_at >= frozen_at + seven minutes`, and no more than 60 seconds ahead of the current clock. The small future tolerance is clock skew allowance, not permission to invent an export timestamp.

Any failed check leaves the freeze in place and changes no backend selection. Passing clears only the private freeze/source properties and public caches. It does not import, promote, overwrite or send anything.

Verify public health reports the r2 release, `database_backend:'supabase'` and `writes_frozen:false`. Then perform controlled owner acceptance for public data, authenticated profile/history, receipt recovery and staff operations. Real orders or campaign sends require deliberate owner testing; this implementation does not create test business records or send bulk mail automatically.

## Cancel without changing authority

`cancelMigrationFreeze()` is for abandoning the attempt while the **recorded original backend is still selected**. It clears the freeze and caches without changing that selection. A missing/corrupt original-backend record, or a different selected backend, is rejected. Corrupt freeze timestamps can be recovered by cancellation only with a valid unchanged recorded source.

After cancellation and resumed writes, discard the candidate final export and obtain a new freeze/drain/export for another attempt. Do not reuse its earlier provenance. After a successful Supabase cutover accepts new writes, reverting the backend flag alone would lose those updates; rollback requires reconciling the target delta first.

## Safe interfaces

| Function | Purpose |
|---|---|
| `beginMigrationFreeze()` | Owner starts/rechecks the same freeze and drain metadata |
| `verifySupabaseConnection()` | Owner checks only isolated operational connectivity; returns safe `ok/code` |
| `endMigrationFreeze()` | Owner completes verified final Supabase cutover and clears freeze |
| `cancelMigrationFreeze()` | Owner cancels with original backend unchanged |
| `auroraMigrationStatus_()` | Internal safe `{writes_frozen,frozen_at}` health fields |
| `auroraMigrationAssertWritable_()` | Internal manual-action write gate |

The private properties are implementation state. Do not manually backdate timestamps, delete provenance records, remove safety checks, or expose verification/key fingerprints to the browser.
