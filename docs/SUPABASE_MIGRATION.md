# Aurora database migration to Supabase

Destination: **`dtvefwpaxwffxglqbfoo`**. The existing Google Sheet is the production database until a verified runtime cutover. The tools below copy every source tab into **private, lossless staging**; staging alone does not move checkout, login, staff operations, email campaigns or financial writes to Supabase.

## Current compatibility constraints

Do **not** run `supabase db push` against this project with the entire checked-in migration history. Migrations `20261007_001` through `20261024_004` describe an older UUID-based prototype, include demo/default data, and expose an older order API. Current production IDs are opaque strings such as `order_…`, `customer_…` and existing owner-defined identifiers. Applying the prototype is not a conversion of the current database.

The production backend in `apps-script/` reads and updates Sheet ranges directly across orders, customer accounts, staff, profiles, catalog and campaigns. It also uses ScriptLock, ScriptCache, Script Properties, Google token validation, Drive image files, Sheet menus/triggers and MailApp. A new Supabase URL cannot replace these dependencies. There must be either a transactional compatibility adapter or a complete replacement API before production stops using the Sheet.

The public frontend must never receive service-role/secret credentials, password salts/hashes, session hashes, receipt access capabilities, private contacts or campaign recipient snapshots. Supabase Auth UUIDs must remain separate from the existing text business IDs; use an explicit ownership mapping if Supabase Auth is introduced.

## Source snapshot contract

Export privately through an authorized native Sheet connection. Do not use a public export endpoint for this data. Include **every tab**, including empty, legacy and unfamiliar tabs; preserve physical row order and header order. Do not filter, deduplicate, trim values, normalize phone numbers, convert IDs to UUIDs or select only the public columns.

```json
{
  "schema_version": 1,
  "target_project_ref": "dtvefwpaxwffxglqbfoo",
  "source": {
    "spreadsheet_id": "SOURCE_SPREADSHEET_ID",
    "exported_at": "2026-10-30T05:00:00.000Z"
  },
  "tables": {
    "orders": {
      "headers": ["id", "total_amount", "receipt_json"],
      "rows": [["order_original_id", 1200.25, "{\"id\":\"order_original_id\",\"total_amount\":1200.25}"]]
    }
  }
}
```

`rows` excludes the header row. Each cell is a JSON string, number, boolean or null. Preserve blank cells and short row widths; no row may extend past the declared header range. Include blank physical rows if present. Preserve headers exactly as strings; blank/duplicate headers are stored and reported as projection blockers. Keep leading-zero phone/ID values as strings. Export large integers as strings before JavaScript can lose precision. Dates should be exported deliberately as ISO strings, without locale reinterpretation. The snapshot is a database export, not a backup of Sheet formatting, Apps Script properties/code, owner permissions or Drive file bytes.

Optional per-tab metadata:

- `column_types`: one of `string`, `number`, `boolean`, `datetime`, `json`, `mixed`, `empty` for each header. This records the exporter's declared types; it does not cast the source.
- `formulas`: an array per data row, matching that row's width, containing original formula strings or null. Export both effective cell values and formula metadata when formulas exist. Formula text, leading `=`, quotes and SQL-looking text remain data; the importer never executes them.

Receipt/addon/history JSON stays in its original string cell, including fields not known to the current code. The source workbook may already contain a leading apostrophe added by `auroraSheetCell_`; retain it. The migration must not infer a missing receipt token or assign an account by matching an unverified phone/email.

The CLI rejects non-scalar cells, unsafe numeric integers, non-finite numbers, NUL (unsupported by PostgreSQL JSONB), extra unrecognized metadata and malformed row/formula dimensions. These require a deliberate export fix, not silent data loss. Input is bounded to 64 MiB. Contact/financial/auth data must stay in a private local directory outside this repository and outside `public`, `dist`, `build` or other served directories.

## Offline preparation

Use an owner-only directory such as a sibling `private-aurora-migration/`. On Windows, restrict that directory's ACL to the operator; the output mode `0600` alone does not enforce Windows ACLs. Do not place private artifacts in a public/synced share or commit them to Git.

```powershell
node scripts/prepare-supabase-import.mjs --input ../private-aurora-migration/source.json --project-ref dtvefwpaxwffxglqbfoo
```

This defaults to a **dry run**: no network calls and no output files. The console contains counts/checksums and blocker count, not cell contents, contacts, credentials or receipt secrets. Then explicitly prepare reviewable artifacts:

```powershell
node scripts/prepare-supabase-import.mjs --input ../private-aurora-migration/source.json --project-ref dtvefwpaxwffxglqbfoo --out ../private-aurora-migration/aurora-supabase-stage.sql
```

Three files are created without overwriting existing files:

| File | Purpose |
| --- | --- |
| `aurora-supabase-stage.sql` | Private transactional import with full source cells and exact row readback comparison |
| `aurora-supabase-stage.manifest.json` | Source SHA-256, table/row counts, per-table hashes, paisa totals, projection audit blockers |
| `aurora-supabase-stage.backup.json` | Canonical source snapshot retaining every exported cell, formula and type declaration |

The manifest's `source_sha256` hashes the canonical backup content (excluding its final newline). `manifest_sha256` hashes the manifest before adding that checksum field. Each table has its own SHA-256; each staged row has a SHA-256 of its ordinal, source ID, cells and formulas. The destination stores the same manifest and row digests. Re-exported timestamps produce a new run; rerunning the identical snapshot is idempotent.

Currency audit totals use signed integer **paisa**, calculated with `BigInt`, without rounding. Invalid currency precision, malformed receipt JSON, duplicate IDs, receipt/header ID or total mismatches, unresolved known references, missing session/receipt owners, ambiguous headers and unmapped tabs become cutover blockers. They remain in the staging/backup unchanged. Audits cover named currency fields and known references; they are not a complete financial reconciliation or a replacement for mapping unfamiliar columns.

## Apply and verify private staging

1. Run the read-only `supabase/dashboard/00-preflight.sql` in the Dashboard SQL Editor. Confirm the selected Supabase dashboard/Management API project is **`dtvefwpaxwffxglqbfoo`** and review its existing schemas/tables/functions before adding anything. Both CLI input and generated SQL metadata pin that ref. A PostgreSQL connection does not provide a reliable built-in Supabase project-ref assertion; metadata alone cannot prove a connection's identity. The selected authenticated destination is the actual boundary.
2. Inspect the existing destination database and take its backup before adding anything. Do not overwrite an existing production schema or use the incompatible old migrations.
3. Apply **only** `supabase/migrations/20261030_006_migration_staging.sql` as a trusted database administrator. Migration 005 is independent operational health infrastructure, not a data migration prerequisite. Do not add `aurora_migration` to exposed Data API schemas.
4. Review the private generated SQL, manifest, source tab inventory and blocker list. Apply that SQL to the same confirmed project as an administrator. It inserts into `aurora_migration` only; no public business tables, mail sends or external writes are performed.
5. The transaction takes a per-run advisory lock, inserts the run/table/row data, and compares exact table metadata and complete JSONB row values against temporary expected records. Counts and contents must match; any conflict or surplus rows roll the transaction back. Only a successful readback marks the run `verified_staging`.
6. Independently compare each source tab's row count, headers, row order, hashes, exact IDs, money totals and selected private receipts/accounts against the private backup. Keep a read-only backup and record the reviewed run ID. Do not show raw queries containing private cells in public logs or chat responses.

`aurora_migration.runs`, `source_tables` and `source_rows` have both enabled and forced RLS, no browser policies, and revoked `PUBLIC`/`anon`/`authenticated` schema/table access. They deliberately have no public REST/RPC readers. Trusted SQL administrators can inspect them. Generated SQL is a sensitive artifact even though source strings are hex-encoded; encoding is not encryption.

## Transitional runtime bridge

`20261030_007_private_runtime_store.sql` is a separate opt-in path that preserves the existing business rules and text IDs. Its owner-only `aurora_runtime.promote_staged_run` copies a reviewed verified source run into private ordered row storage. `public.aurora_runtime_snapshot` and `public.aurora_runtime_commit` are executable only by `service_role`; their contents must never be sent directly to a browser. Commits use a global revision, row deltas and unique operation IDs, with atomic rollback, replay checks and immutable source keys.

Promotion requires the exact run ID and source checksum. Any reported source blockers require an explicit reviewed audit hash and owner note; stored formulas require separate acceptance as **static values**, because PostgreSQL does not recalculate Sheet formulas. Promotion never deletes an orphan or invents its missing parent. Rerun the exact prepared staging SQL immediately before promotion to verify that staged cells still match the reviewed backup. Promotion does not activate the website backend.

The corresponding `apps-script/SupabaseStore.gs` adapter is off by default and uses the existing Apps Script API. Its server-only `AURORA_SUPABASE_SERVICE_KEY` property must never appear in frontend variables or chat. Backend selection is the private `AURORA_DATABASE_BACKEND` property. Follow `SUPABASE_RUNTIME.md` for the entry-point, flush, deployment and activation requirements. Keep the switch off until final reconciliation and acceptance pass. Apps Script remains responsible for authentication/business logic, Drive and mail during this transitional database migration.

This bridge can complete a database cutover without first changing every source table into the old normalized prototype. A future normalized schema is a separate migration. All tab/column/ownership and finance compatibility still needs review, and keeping physical Sheets as an editing/backup surface does not make them a second active writer.

## Production projection map

The checked-in code defines 27 current tabs; the current workbook also contains historical identity and financial tabs. The source export, not a hardcoded expected count, defines the complete tab inventory. Unknown tabs are retained and explicitly listed as unmapped. Every domain below requires a reviewed production projection or transactional compatibility mapping; the bridge's exact row storage is the compatibility path, while manifest `production_projection: pending` refers to normalized projection.

| Source tabs | Required preservation and runtime mapping |
| --- | --- |
| `settings`, `content`, `hero_slides`, `highlights`, `faqs`, `links`, `banners` | Text keys/IDs, sort and active values, URLs and every custom column; explicit public read allowlist |
| `categories`, `products`, `product_variants`, `flavors`, `product_addons`, `delivery_zones`, `delivery_slots`, `coupons`, `reviews` | Text IDs and relations, gallery/allowed-ID JSON, exact prices, coupon counters; server-side checkout validation |
| `orders`, `order_items`, `custom_cake_requests` | Original IDs/numbers, request IDs/hashes, complete receipt JSON/capabilities/ownership/history, item/addon snapshots, payment and lifecycle transitions; idempotent transactional writes |
| `customer_accounts`, `staff_accounts`, `auth_sessions` | Salted password hashes, lockouts, roles, session hashes/expiry/revocation, text account IDs; server-only auth and per-request role checks |
| `customer_master`, `customer_contact_requests` | Existing phone keys and profile/history links; no automatic authorization from phone/email matches |
| `customers`, `customer_sessions`, `customer_challenges` | Historical Google/OTP profile identities and session/challenge data; preserve first, explicitly decide compatibility/expiry; do not silently merge with current password accounts |
| `customer_subscriptions`, `email_campaigns`, `email_deliveries` | Consent/verified/unsubscribe state, confirmation hashes/nonces, campaign snapshots, delivery states and idempotency; private sender and unsubscribe handlers |
| `inventory_items`, `inventory_movements`, `refund_returns`, `order_cost_snapshots`, `rider_cash_deposits`, `cake_cost_items` | Every original source ID, source document/order link, quantity, cost/refund/cash amount, timestamps and staff attribution; explicit accounting reconciliation before cutover |
| Any other tab/column | Retain losslessly; review and document a mapping before declaring the whole database migrated |

Staging's `source_id` is an index aid selected from known ID headers. Exact `headers` + `cells` remain authoritative for unknown IDs, blank/duplicate IDs and legacy shapes. Business identifiers remain `text` in any replacement normalized schema. Amounts use exact `numeric(...,2)` or integer paisa; never float arithmetic for balances.

Current password verification is per-user salted, iterated SHA-256 in `AccountAuth.gs`, not Supabase Auth's password representation. Importing these hashes into `auth.users` does not make existing passwords work. A replacement must implement a deliberate server-only legacy verifier with rehash-on-login or an account reset/link flow. Preserve ownership in receipts (`customer_account_id`, historical Google subject, checkout capabilities); active browser session tokens are represented by their stored hashes, not their plaintext token.

## Atomic cutover requirements

1. Finish complete mapping for all exported tabs, extra columns, finance records and identity formats. Resolve or explicitly disposition every audit blocker. Inventory Script Properties separately; the staff Google owner allowlist, OAuth configuration, image configuration and secret settings are not Sheet rows.
2. Implement and test the replacement runtime. A compatibility adapter must read a consistent version and commit a **row-keyed write set** with a unique operation/request ID and expected row revisions inside one database transaction. Preserve ScriptLock-equivalent serialization or compare-and-swap retries. Never replace the whole workbook from an old snapshot. Enforce the same customer capability/ownership and staff role rules at the server.
3. Preserve durable side-effect boundaries: commit order/account/campaign state before sending mail or acknowledging success; use an outbox/idempotency key for retries. Do not replay historical email campaigns on import. Sheet-owner menus and Apps Script triggers need a replacement private owner interface/scheduler, or an explicitly retained dependency.
4. Copy Drive-hosted media into private/admin-managed storage with intentional public object access for storefront images; update public URLs only after verification. Keeping existing image URLs retains a Drive/Apps Script dependency. Media URL rows alone do not move image bytes.
5. Validate browse/config, exact checkout pricing/coupons, retry-safe order creation, receipt access, registration/login/lockouts, cross-device profiles, edit/reorder, staff role transitions, inventory/refunds/cost/cash totals, image access, confirmed-only campaign recipients and unsubscribe behavior end-to-end. Anonymous customers must not read another customer's information. A scheduled health request is not evidence these flows work.
6. Briefly freeze business writes, capture a final complete snapshot or verified delta, import and reconcile it, then switch the API/database selection once. Do not leave two independent writable databases behind one frontend. Verify newly created records are persisted only in Supabase.
7. Retain the source Sheet read-only and the private backups for rollback. Roll back only with a defined reconciliation of post-cutover writes; never overwrite newer orders with an old snapshot. Delete no source data as part of initial transfer.

Until these gates pass, report **private staging complete** separately from **production cutover complete**. The offline importer does not run a server, send data on a timer, perform a live cutover or guarantee a Free project's availability. See `SUPABASE_HEALTH.md` for the independent scheduled health-check behavior.

## Local checks

```powershell
node --import tsx --test tests/supabase-migration.test.ts
```

These exercise lossless values/IDs, private SQL encoding, financial precision, ownership/reference diagnostics, deterministic hashes, project pinning, private artifact paths, dry-run/no-overwrite behavior and RLS restrictions. Actual PostgreSQL application and live runtime acceptance must also be recorded against the confirmed destination; a passing local generator test does not establish that live data has been imported.

For independent PostgreSQL execution, install/use a trusted local `@electric-sql/pglite` runtime. The verifier never installs packages or opens network connections and creates a fresh in-memory database for each run:

```powershell
node scripts/verify-supabase-staging.mjs --fixture --project-ref dtvefwpaxwffxglqbfoo --pglite-module ../health-sql-runtime/node_modules/@electric-sql/pglite/dist/index.js
node scripts/verify-supabase-staging.mjs --input ../private-aurora-migration/source.json --project-ref dtvefwpaxwffxglqbfoo --pglite-module ../health-sql-runtime/node_modules/@electric-sql/pglite/dist/index.js --generated-sql ../private-aurora-migration/aurora-supabase-stage.sql --raw-export ../private-aurora-migration/raw-cells.json --normalizations ../private-aurora-migration/normalizations.json --report ../private-aurora-migration/verification.json
```

`--pglite-module` may be omitted if the package is already installed in the local project. The runner applies migration 006 and the exact generated import twice, compares every table/header/cell/formula/source ID/digest against the snapshot, tests anonymous/authenticated read and write denials, and checks conflict detection/rollback. Reports contain only counts/checksums/results, never row values. Reports are created once in a private directory; existing reports are not overwritten.

The raw export and normalization file checksums hash their original file bytes. The source checksum instead hashes the canonical normalized snapshot. Keep both provenance files when deliberately converting Google date serials to ISO dates or other reviewed export transformations. The normalized backup is not a byte-for-byte backup of the raw native API response. Offline verification explicitly reports `live_network_writes: false` and `production_cutover_ready: false`.

SQL 007 also has an independent repeatable verifier using the same trusted runtime:

```powershell
node scripts/verify-supabase-runtime.mjs --fixture --project-ref dtvefwpaxwffxglqbfoo --pglite-module ../health-sql-runtime/node_modules/@electric-sql/pglite/dist/index.js
node scripts/verify-supabase-runtime.mjs --input ../private-aurora-migration/source.json --project-ref dtvefwpaxwffxglqbfoo --pglite-module ../health-sql-runtime/node_modules/@electric-sql/pglite/dist/index.js --generated-sql ../private-aurora-migration/aurora-supabase-stage.sql --report ../private-aurora-migration/runtime-verification.json
```

It applies 006, the exact import and 007 to a new in-memory database, verifies source/audit/formula promotion gates and complete snapshot parity, then tests service-only RPC permissions, revision conflicts, operation replay, multirow rollback and immutable/unique keys. Its test-only acknowledgment of source audits never reaches the real database. Apps Script transaction/auth/email tests and live activation checks remain separate.
