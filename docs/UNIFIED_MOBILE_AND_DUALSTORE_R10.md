# Aurora's Cake — Unified Staff App & Two Database Foundation (R10)

## What is implemented in code

The existing Expo SDK 58 Android/iPhone app now has a role-aware bottom navigation:
Today (next order actions), Orders (full authorized queue), Sales (native POS),
More (role-specific tools), Account (secure session/logout).

The More workspace includes:
- **Super Admin:** staff username/password creation, active/disabled status, capability assignment;
  note: the owner must use native Google sign-in against the existing private allowlist.
- **Managers:** order/dispatch tasks, recipe costs, ingredient stock, cash approvals,
  private returns/refunds, product prices and shop availability.
- **Cashier:** counter POS, change, manual bKash/Nagad reference, saved receipt reprint
  (only if explicitly granted permissions).
- **Kitchen:** confirm/prepare/mark cake ready from the existing order flow
  (permissions limit which stages each employee may operate).
- **Delivery:** assignment, pickup, delivery completion and COD collection.
- **Finance:** recipe quantities/costs, frozen order costs, rider cash deposits,
  independent cash approval, refund/return ledger.
- **Custom cake:** quote requests and staff-authorized price/decline.
- **Database Sync:** configured status and last successful Sheets-to-Supabase sync.

Permissions come from the server-side StaffPermissions allowlist; hidden screens are
not the security boundary. All privileged backend operations reauthenticate sessions.
The native app intentionally does **not** hold the Supabase service key.

## Deployment dependency order

**R8 (PR #4) → R9 POS (PR #5) → R10 Mobile & dual-store (PR #6).**
These PRs are drafts and built on one another. Do not merge R10 directly to main
without first integrating the base branches and doing a complete live acceptance test.

### Google Sheets/Apps Script

1. Back up the *real* Google Spreadsheet and Apps Script sources.
2. Paste the complete new `apps-script/Code.AllInOne.gs` into one Apps Script
   `Code.gs` file. Do not paste it alongside duplicate modular functions.
3. Run `setupSheetDatabase()` to add the new R8/R9 private tabs safely.
4. Deploy → Manage deployments → Edit → **New version** → Deploy.
5. Check `/api/backend-health`: expected release is
   `aurora-2026-10-27-unified-mobile-mirror-r10`.
6. Create roles/staff accounts from Super Admin and test them separately.

### Supabase private mirror — opt-in

The mirror is **one-way, eventually consistent**, not two independently writable
systems. Primary confirmed order and financial writes continue to Google Sheets.
A cron-like Apps Script trigger scans limited batches repeatedly and upserts the
result into Supabase via a protected Vercel API. An unsuccessful API response
does not advance the cursor. The same batch is safe to retry. However, a
complete historical backfill and every subsequent update may take multiple runs.

1. Open the *correct* Supabase project. Back up the DB. In SQL Editor apply:
   `supabase/migrations/20261027_005_google_sheets_private_mirror.sql`.
   This creates `aurora_mirror_records` with RLS enabled and **no public policies**.
2. Configure these **server-only** Vercel Production (and needed Preview) variables:
   - `AURORA_SUPABASE_URL=https://<project>.supabase.co`
   - `AURORA_SUPABASE_SERVICE_ROLE_KEY=<private service_role JWT>`
   - `AURORA_MIRROR_SHARED_SECRET=<random 32+ character high entropy secret>`
   Never put any of these into `VITE_*` or `EXPO_PUBLIC_*` variables.
3. In Google Apps Script → Project Settings → **Script Properties**, configure:
   - `AURORA_MIRROR_ENDPOINT=https://<your-working-vercel-host>/api/mirror-ingest`
   - `AURORA_MIRROR_SHARED_SECRET=<exact same private shared secret>`
   Do not use a protected Vercel Preview hostname for a scheduled machine call.
4. In the Apps Script editor run `setupAuroraMirrorTriggerOnce()` as the owner
   and accept required permissions. This adds one scheduled trigger, every 5 minutes.
5. Run `auroraSyncSupabaseMirror()` manually for an initial smoke test.
   Check that `aurora_mirror_records` has rows. Repeat backfill runs until all
   tables have been scanned. Compare order IDs, paid totals and latest statuses.
6. The native More → **Database Sync** screen shows whether properties were
   configured and when the last acknowledged batch completed. This does not
   prove every row has synchronized; validate Supabase row counts/history.
7. Never edit mirror rows directly or expose the service role key. New rows may
   appear after several sync passes. The app must not call `/api/mirror-ingest`.

Currently mirrored: orders, order items, counter sales, custom cakes, ingredients,
stock movements, recipe components/cost snapshots, refunds, rider deposits,
customer master, public products/variants/categories/settings. **Passwords,
salted hashes, authentication sessions and private receipt capability tokens
are deliberately excluded.** Some mutable tables may require more than one
sync cycle to reflect changes. The mirror is NOT an atomic backup and does
not replace separate periodic point-in-time backups of your Google Sheet.

### Mobile app

From your Windows PC:

```powershell
cd apps/staff-mobile
Copy-Item .env.example .env
npm install
npx expo install --fix
npx expo start
```

The native Google owner login depends on the signed app build, **not Expo Go**.
Use the correct Google Cloud OAuth Web client ID already verified by Apps Script
(`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`). Create Google Cloud **Android OAuth**
with the exact `com.aurorascake.staff` package name and EAS SHA-1, and an
**iOS OAuth** client with the exact `com.aurorascake.staff` bundle ID. Set
`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` in the EAS build environment; it enables
the iOS native plugin URL scheme via `app.config.js`. Native rebuild is mandatory.

```powershell
npx expo-doctor
npx expo run:android
# To request an Android test APK through EAS:
eas build --platform android --profile preview
```

An iPhone physical device signed build requires compatible Apple Developer
signing and distribution. This repository does not include an installable IPA/APK.
Native 58mm/80mm receipts use `expo-print` OS print dialogs and the attached
printer's configured roll size; a Bluetooth-only ESC/POS device may require a
manufacturer SDK. Silent printing is not supported.

## Mandatory real-world acceptance cases

- Super Admin Google login on real iPhone/Android; staff login and secure restore
- Staff permission changes and disabled accounts stop unauthorized operations
- Order confirm → baking → cost snapshot/ingredient consumption → ready → dispatch
- Assigned rider-only delivery, handover/COD settlement with independent approval
- POS sale, bKash/Nagad duplicate reference, cash change, 58/80mm receipts
- Offline/interrupted POST retry does not create duplicate receipts/financial rows
- Inventory restock, waste and negative stock rejection
- Refund request requires independent approval, settlement evidence and correct cap
- Sheets → Supabase private sync: unconfigured, timeout, failed batch, retry and
  eventually updated order status/costs reflected without public data access
- Android/iOS device performance, navigation and 30s foreground order refresh

## Known limitations before full production

No tested signed device binary, real Google Sheet/Supabase dual-store acceptance
test, direct ESC/POS commands, automatic payment gateway verification, or offline
sale queue. Google Sheets remains slower than a transactional database at higher
order volumes. Supabase mirror is eventually consistent (up to multiple trigger
cycles), and finished-cake product stock is not yet reconciled with raw ingredient
inventory. POS revenue still needs a consolidated financial dashboard and
independent cash till reconciliation before full bookkeeping can be claimed.
