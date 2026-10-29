# Aurora’s Cake — Firebase PRIMARY migration, Phase 1

**Goal:** Read the cake catalog directly from Firestore, with **no runtime Google Sheets dependency**. This change is an **independent, read-only catalog API and opt-in preview**, not yet a production checkout/database switchover.

**Current primary backend remains Google Apps Script** for checkout, order status, staff, customers, CMS, POS and payments. Do not tell customers that checkout is Firebase-only, or enable order submission through this catalog before independent audited Firestore Orders and staff authentication are ready.

## Implemented

- Cloudflare Worker GET-only route:
  `https://aurora-s-cake.sagarmia583.workers.dev/api/firebase-primary/catalog`
- Reads **fixed private Firestore document** `storefront_public/catalog_current` using service account IAM, scoped to `aurorascake-213a0`. Does not call Sheets or accept user-selected collection names.
- Only publishes normalized PublicSiteData v1 (shop info, public content, categories, products, sizes/prices, flavors/addons, delivery zones and slots etc). The existing public-field allowlist excludes private staff/customer/orders/keys. Returns `order_submission_enabled:false` unconditionally.
- Returns `catalog_not_seeded` with HTTP 503 when empty; does **not** pretend bundled demo products came from Firestore.
- Cloudflare `[vars]` enables the **isolated catalog read endpoint**; production storefront remains on its previous content source by default.
- Browser opt-in preview, after import:
  `https://aurora-s-cake.sagarmia583.workers.dev/?firebase_catalog_preview=1`
  This shows the catalog read from Firestore while deliberately disabling live checkout. It doesn't replace the existing live storefront route.
- Local, single-purpose import: `scripts/import-firestore-catalog.mjs`. It **dry-runs** unless explicitly passed `--write` and refuses to overwrite an existing document unless separately passed `--replace` with a Firestore updateTime concurrency precondition.

## Import catalog without making Sheets a live dependency

Prepare an accurate **PUBLIC** catalog JSON from your existing catalog records. Exporting your already-public catalog once is permitted: it doesn't mean keeping Sheets connected afterward. If the old Vercel website's `/api/public` still works, open `https://aurora-s-cake.vercel.app/api/public` and save the JSON response as `catalog-export.json` on your computer. Alternatively export a manually reviewed PublicSiteData v1 JSON file. The importer rejects malformed JSON, missing tables, and empty product catalogs; **never import receipts, customer lists, staff, passwords or private database exports**.

It must contain `schema_version:1` and these public fields:
`settings`, `content`, `products`, `categories`, `flavors`, `addons`, `zones`, `slots`, `coupons`, `banners`, `reviews`, `hero_slides`, `highlights`, `faqs`, `links`.
The existing public API wrapper `{ok:true,schema_version:1,data:{...}}` is also supported.

On a trusted local computer with Node.js 22+ and the repository checked out:

```sh
npm ci
# Validate ONLY, never writes any data (default)
npx tsx scripts/import-firestore-catalog.mjs --input ./catalog-export.json --key "/private/path/aurorascake-service-account.json"

# After reviewing catalog products, prices and delivery fees:
npx tsx scripts/import-firestore-catalog.mjs --input ./catalog-export.json --key "/private/path/aurorascake-service-account.json" --write
```

**Don't** copy the private JSON into the repository or paste it in chat. On Windows use a quoted full path to a private folder (for example `C:\\Users\\you\\Downloads\\firebase-service-account.json`). The key file is needed only for **local import**; the already-configured Cloudflare Worker Runtime Secret continues to be used for the live read.

The local importer writes the single `storefront_public/catalog_current` document. Future catalog replacements require reviewing the updated public JSON and explicitly running with `--write --replace`. The Firestore document is capped at 750 KB so large catalogs should be split into collections in Phase 2.

### Verify

1. Firebase Console → Firestore Database → **Data**: confirm `storefront_public/catalog_current` is present and its `catalog_json` contains only public catalog content.
2. Open `/api/firebase-primary/catalog`; expected `ok:true,provider:"firestore",order_submission_enabled:false`, list of products (prices from imported data, not demo).
3. Open the opt-in preview URL `?firebase_catalog_preview=1` and verify exact cakes and prices, slots and delivery zones. **Checkout remains disabled**.
4. Confirm a non-GET request to the new catalog route returns HTTP 405. Unknown `/api/firebase-primary/private-orders` returns HTTP 404.
5. Do not migrate live traffic until staff authentication, server-side pricing, COD/OTP workflow, idempotent checkout, secure customer receipts and historical order import are independently tested.

### What remains for full Firebase-only operation

- Staff Firebase Authentication with server-verified ID tokens and role permissions (no public access to order documents).
- Firestore Product CMS with audited admin write flows and historical price snapshot.
- Server-side quoted checkout, rate limiting/abuse protection, idempotent writes and confirmation, cash-on-delivery.
- Staff Order Queue, rider/delivery and secure OTP flows, customer account/order-history access.
- POS sales, inventory transactions, baking cost & expense ledger, refund/return, reconciliation.
- Migrate existing staff, customers, orders and accounting records from old storage; verify row counts and balances, then cut over safely.

**Safety:** The Firestore Web SDK Rules should continue to deny public/private reads/writes. The Cloudflare Worker uses Google service-account OAuth and IAM; do not change rules to `allow read,write: if true`. Store runtime secrets in Cloudflare, not in a `VITE_` build variable. Read and write quota limits of Spark still apply.
