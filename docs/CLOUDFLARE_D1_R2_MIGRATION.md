# Aurora’s Cake → Cloudflare Workers + D1 + R2: Core Migration (Phase 1)

**Deployment target: Cloudflare ONLY.** Owner has turned off Vercel/Netlify. Do not reactivate them. Supabase/Firebase are not new sources of truth. Legacy Google Apps Script/Sheets checkout may still be in use; **do not delete old data or switch checkout before successful reconciliation**.

## Implementation delivered to this repository

- `cloudflare/d1/migrations/0001_aurora_core.sql`: D1 SQLite relational schema for Staff roles, Products, Variants, Customers, Orders/Lines/History, POS, Cash Register, Inventory/Recipe/Movements, Baking Cost snapshots, Accounting Journals/Entries, Refund/Payments, R2 object registry, migration staging and audit.
- **Money is stored as INTEGER poisha** (৳350.00 = 35000), not floating point. Stock quantities use milli-units. Foreign keys and CHECK constraints reject invalid stock and missing references. Inventory and Accounting ledger rows cannot be modified/deleted; corrections need offsetting entries.
- `cloudflare/d1/access.js`: validates Cloudflare Access-signed RS256 JWT, correct Access application audience and issuer, expiry and matching active D1 staff role. The untrusted browser cannot claim `super_admin` via a header/email.
- `cloudflare/d1/api.js`: separate D1 status & public published catalog endpoints; private staff role/session/order list, Inventory, POS and Accounting read views. Admin-write APIs include categories, draft products, visibility, inventory item/movement, register open, POS sale, expense, staff-created order. POS/Order use **database-quoted** product prices and idempotency keys, D1 `batch()` for atomic journals/order lines; public checkout is **not switched on**.
- `cloudflare/d1/media.js`: R2 image upload only for authorized staff, max 5 MB, JPEG/PNG/WebP magic signature; public product/banner images and private receipts/proofs are separated by metadata; private items are never served through a public URL.
- `scripts/prepare-d1-import.mjs`: offline export validator/generator, dry-run by default. Writes **only** to private `migration_runs` and `migration_staging`, with stable legacy text IDs, SHA-256 fingerprints, exact row counts and order-money totals. Does not delete or overwrite the legacy source or automatically change live orders.
- `scripts/verify-d1-schema.py` + `tests/cloudflare-d1-r2.test.ts`: schema constraints and fail-closed Worker route tests.

**Important:** This is the **foundation and isolated API**, not yet a finished customer app. New D1 API mutating operations are gated off; no D1 database/R2 bucket binding has been added because the owner's Cloudflare resource IDs have not been provided, and no real historical records have been copied. Live staff UI and customer checkout still rely on the older backend.

## Current D1 binding status

The owner supplied the real existing D1 database ID on October 29, 2026:
`71790429-c38a-483e-a0db-3fa7cfc4ba40`.

It is already set in `wrangler.toml` as `AURORA_DB` with database name `aurora-cake-db` and migration directory `cloudflare/d1/migrations`. **Do not create a second D1 database just because the generic setup steps below mention creation.**

The binding alone **does not run migrations or import data**, and no R2 bucket has been confirmed or bound. Both `D1_PREVIEW_ENABLED` and `D1_MUTATIONS_ENABLED` remain `false`, preventing premature production access. The active legacy backend remains untouched.

Next required steps are: (1) verify existing database ID in Cloudflare D1; (2) make a private backup of the legacy source; (3) apply the D1 migration using `npx wrangler d1 migrations apply aurora-cake-db --remote` with the correct Cloudflare account; (4) verify D1 schema; (5) confirm/create the `aurora-cake-media` R2 bucket before adding its binding. Never set D1 mutations on while there is unverified historical data.

## Resource setup (only after verifying Cloudflare account and backing up old data)

1. From a local checkout of this GitHub repository, `npx wrangler login` and confirm it uses the owner's Cloudflare account. Back up the old Google Sheets / Supabase / Firebase data **before any cutover**; export orders, staff records, products, customers and accounting ledgers separately. Never publish these files or keys.
2. Create new D1 and R2 resources (no need for a new Firebase/Supabase project):
   ```sh
   npx wrangler d1 create aurora-cake-db
   npx wrangler r2 bucket create aurora-cake-media
   ```
3. D1 create returns the **real** `database_id` UUID. Add this to the existing `wrangler.toml` (not a guessed ID):
   ```toml
   [[d1_databases]]
   binding = "AURORA_DB"
   database_name = "aurora-cake-db"
   database_id = "PASTE_REAL_D1_DATABASE_UUID"
   migrations_dir = "cloudflare/d1/migrations"

   [[r2_buckets]]
   binding = "AURORA_MEDIA"
   bucket_name = "aurora-cake-media"
   ```
4. Apply schema in a **local or staging** environment first:
   ```sh
   npx wrangler d1 migrations apply aurora-cake-db --local
   python3 scripts/verify-d1-schema.py
   ```
   Once schema is verified, apply remote migration:
   ```sh
   npx wrangler d1 migrations apply aurora-cake-db --remote
   ```
5. Confirm database backup and tables before enabling any mutation:
   ```sh
   npx wrangler d1 export aurora-cake-db --remote --output=aurora-backup-before-import.d1-backup.sql
   npx wrangler d1 execute aurora-cake-db --remote --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
   ```
   Keep the `.sql` backup privately, not in GitHub. Cloudflare D1 uses versioned migrations, and the Wrangler migration system records applied files. <https://developers.cloudflare.com/d1/reference/migrations/>
6. Configure **Cloudflare Access** application for `aurora-s-cake` private admin routes. The app must send a signed `Cf-Access-Jwt-Assertion` token. In Cloudflare runtime variables, set `CF_ACCESS_TEAM_DOMAIN` (e.g. `your-team.cloudflareaccess.com`) and `CF_ACCESS_AUD` (actual Cloudflare Access Application Audience Tag). An email alone never grants admin access.
7. Privately provision each approved staff email in D1 using a reviewed SQL statement; only trust the staff email matched by a valid Access JWT:
   ```sql
   INSERT INTO staff_members(id,access_email,display_name,role,active)
   VALUES ('owner-v1','YOUR_VERIFIED_ACCESS_EMAIL','Owner','super_admin',1);
   ```
   **Never** put a user password, Firebase token or secret in this table or GitHub. Staff creation should later get an audited owner-only UI.
8. Enable **only** `D1_PREVIEW_ENABLED="true"` in Cloudflare runtime after migrations and bindings are tested; keep `D1_MUTATIONS_ENABLED="false"` for review. Make sure no older dashboard variables override the intended flags. In production, test:
   ```
   GET /api/d1/status
   GET /api/d1/catalog
   GET /api/d1/admin/session   (requires Access-signed JWT and active staff role)
   ```
   Public catalog returns `order_submission_enabled:false`; it will not fabricate real products.
9. Only after full UI/permission/receipt/ledger tests, business approval and backup verification, enable mutations in a **restricted staging environment** first. Public checkout/POS cutover and old-system disconnection are later milestones.

## Import legacy data without deletion

The importer requires a **reviewed** JSON export. Example shape (replace with real data):

```json
{
  "products": [{"id":"legacy-product-1","name":"Vanilla cake","variants":[]}],
  "orders": [{"id":"legacy-order-1","order_number":"AC-1001","customer_name":"Customer",
    "customer_phone":"01XXXXXXXXX","delivery_address":"...",
    "total_amount":350,"items":[{"id":"line-1","product_name":"Vanilla","quantity":1,"unit_price":350,"subtotal":350}]}]
}
```

The script supports categories, products, variants, customers, inventory and orders. It strips unapproved fields, including staff passwords, access receipts, delivery OTPs, auth tokens, arbitrary payment data and internal full-blob fields. It only stages selected safe fields (which may still contain private customer data). Never upload private SQL to GitHub.

```sh
node scripts/prepare-d1-import.mjs --input ./aurora-export.json
# Review counts, total poisha and source records. Then generate PRIVATE SQL:
node scripts/prepare-d1-import.mjs --input ./aurora-export.json --out ./aurora-stage.sql
npx wrangler d1 execute aurora-cake-db --remote --file=./aurora-stage.sql
```

Verify staged row counts and total against the original source with SQL queries. Do **not** blindly move staged JSON into live relational tables: real source IDs/relations, price snapshots, historical COD/payment state, order item counts, returns and ledger balances all need explicit reconciliation before commit. Migration status stays `staged` until verified.

## Current API endpoints

| Route | Method | Authorization | Behavior |
|---|---|---|---|
| `/api/d1/status` | GET | Public | Binding/schema readiness, no private data |
| `/api/d1/catalog` | GET | Public | Only published categories/products/prices; checkout disabled |
| `/api/d1/media/:id` | GET | Public | Only approved product/banner objects |
| `/api/d1/admin/session` | GET | Signed Access + D1 role | Staff identity |
| `/api/d1/admin/products` | GET/POST | Super Admin/Admin | View/create draft products |
| `/api/d1/admin/categories` | POST | Super Admin/Admin | Create inactive category |
| `/api/d1/admin/products/visibility` | POST | Super Admin/Admin | Publish/unpublish |
| `/api/d1/admin/inventory` | GET/POST | Assigned inventory roles | Read inventory and journal stock movements |
| `/api/d1/admin/inventory/items` | POST | Assigned inventory roles | Create inventory item |
| `/api/d1/admin/pos` | GET/POST | Assigned POS roles | List/create cash/transfer POS sale with server pricing |
| `/api/d1/admin/pos/register` | POST | Assigned POS roles | Open register |
| `/api/d1/admin/orders` | GET/POST | Assigned order roles | Read and create internal orders |
| `/api/d1/admin/accounting` | GET/POST | Finance roles | Read double-entry journals / book expense |
| `/api/d1/admin/media` | POST | Authorized staff | Image upload with R2 binding |

Public buyers cannot call staff endpoints and cannot create an order with `D1_MUTATIONS_ENABLED=false`. Financial write endpoints use integer poisha, parameterized SQL, idempotency and D1 atomic `batch()`. They are not yet a substitute for end-to-end production POS/accounting acceptance tests.

## Must finish before declaring Firebase/Supabase/Sheets fully replaced

- Ingest all historical records and images, map legacy text IDs to D1, reconcile total orders, item counts, historical pricing, COD receivables, sales, refunds, accounting balances.
- Build **Cloudflare D1-first storefront Product CMS**, Checkout, Customer Tracking, Admin/Staff/POS UI, production/recipe stock debits, delivery OTP lifecycle, approval and refund/reversal workflows.
- Enable user-specific Cloudflare Access Staff UI and least-privilege staff permissions; independent cash approval, audit event consistency and rate limits.
- Secure public checkout anti-abuse/rate limits and transaction idempotency; customer receipt identity verification; R2 image update/replacement cleanup.
- Perform Cloudflare browser acceptance tests using realistic transactions. Compare before/after totals and restore from backup if a mismatch appears.
- **Only after successful acceptance** disable the legacy Google Apps Script/Supabase/Firebase client and remove unused modules. Never delete old Sheets or database files without backups.

No Vercel or Netlify deployment is needed or authorized for this phase.
