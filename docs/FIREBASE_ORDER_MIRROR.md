# Aurora's Cake — Server-side Firestore orders mirror

This is a **one-way secondary mirror**, not a switch of the shop's system of record. Google Apps Script / Google Sheets remains authoritative for checkout, prices, staff permissions, COD, and customer receipts.

## Why Firestore initially showed no data

`firebaseClient.ts` only initializes a public browser SDK and reads `public/health`. The deployed Firestore Rules deny all access to private collections. No order-save code existed in the Firebase client. A successful connection check **does not write any documents**.

## What this change does

The Vercel `/api/operations` server obtains a response directly from the existing Google Apps Script backend. ONLY when the backend confirms `create_order` with `success:true,persisted:true`, or `staff_mutate` with `ok:true`, Vercel attempts a private Firestore write to:

```text
projects/aurorascake-213a0/databases/(default)/documents/orders/{order.id}
```

The same ID is used for retries. Updates compare `updated_at` and use a Firestore current-document precondition. Firestore retains only an allowlisted order projection (order number, items, address, phone, totals, status), **never** delivery OTPs, tokens, customer receipt capabilities or staff secrets. The Firestore Rules continue to deny all private browser reads and writes. An explicitly authenticated super admin can trigger a paged backfill of previous Google Sheets orders in the Staff Panel; ordinary automatic staff polling does not trigger backfill writes.

Importantly: if Firestore is down, a confirmed Google Sheets order **remains confirmed**. Vercel reports `X-Aurora-Firebase-Mirror: failed` instead of undoing it. For legally or financially critical durability, use a durable outbox/reconciliation job in the next phase rather than treating this best-effort mirror as a guaranteed second commit.

## REQUIRED: Configure server-only Google service-account credentials

1. In Google Cloud Console for project **`aurorascake-213a0`**, create a dedicated service account. Grant the minimal **Cloud Datastore User** permission for the Firestore database. Do **not** use a Firebase Web API key, publish an Admin SDK key to GitHub, or change Firestore Rules to `allow write: if true`.
2. Generate/download a service account JSON key securely. Keep its private key confidential. Prefer managed, short-lived credentials in the future if available; this implementation currently uses an explicitly provisioned service-account JSON key for Vercel serverless OAuth.
3. In Vercel → **aurorascake → Settings → Environment Variables**, add:
   - `FIREBASE_MIRROR_ENABLED` = `true` (Production).
   - `FIREBASE_SERVICE_ACCOUNT_JSON` = **entire private service-account JSON** (Production, secret/encrypted value).
4. Redeploy the **latest reviewed main commit** (not an old deployment) so the serverless function receives these variables.
5. Open `https://aurora-s-cake.vercel.app/api/firebase-sync-status`. Expected: `"enabled":true, "configured":true`. This checks only that the credentials parse and match the project; it does NOT guarantee that OAuth or Firestore writes work.
6. Submit a legitimate test COD order through the public checkout. On its `/api/operations` network response inspect header `X-Aurora-Firebase-Mirror`: `saved` or `unchanged` means mirror responded successfully.
7. Check Firebase Console → Firestore → **Data → orders → {order.id}**. Check total and status match Google Sheets; confirm no `delivery_otp` or receipt bearer token was persisted.
8. Log in as **Super Admin** and open **Orders & delivery → Firebase order backup → Sync existing orders** to copy previous orders. The button handles 25 orders per click in batches of 5; repeat until complete and review failures. It never changes original Sheets data.

Do **NOT** paste the service-account JSON into ChatGPT or a GitHub issue. Configure it in Vercel's encrypted environment settings.

## API diagnostics and authorization

- `GET /api/firebase-sync-status` exposes only non-secret state (`enabled`/`configured`), not orders or access keys.
- `POST /api/operations`: Only authorized, successful Apps Script actions are mirrored. The client cannot choose the Firestore document status or amount directly.
- `staff_orders` backfill requires a **verified `super_admin` role** in the Apps Script backend response and an explicit `firebase_mirror_backfill:true` request. Other roles cannot start backfill.

## Known limits

- **Existing historical orders:** not automatically migrated. Use the Super Admin backfill and verify counts against Sheets.
- **Other data:** sales/POS independent records, inventory, expenses, recipes, CMS, staff accounts and customer accounts are **not** yet mirrored. Do not claim full dual-database coverage.
- **Out-of-band writes:** Orders saved by calling Google Apps Script directly (bypassing Vercel `/api/operations`) will not enter Firestore until a later authorized backfill.
- **Secrets:** The Firebase Web configuration does **not** authorize private writes. Only the Vercel service account can mirror.
- **Firebase costs:** Firestore has Spark quotas; bulk mirroring needs monitoring. This design doesn't require Firebase Cloud Storage, billed extensions or a paid payment gateway.
- **Accountability:** Monitor the response header and periodically reconcile Sheets ↔ Firestore. Failed secondary writes must be retried by authorized super admin; successful Sheets data stays primary.
- **Access:** Private Firestore documents deliberately cannot be read directly by customers or staff from the Web SDK. Build role-based Firebase Auth rules and audited backend reads before switching any views to Firestore.

## Emergency disable

Change `FIREBASE_MIRROR_ENABLED` to `false` in Production and deploy. Existing Sheets checkout remains intact. No Firestore collections are deleted.
