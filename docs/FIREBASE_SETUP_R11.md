# Aurora's Cake — Firebase Firestore Setup (R11 staging foundation)

**Current rollout state:** Source code prepared; not connected to a real Firebase project.
The live customer site and installed staff app **still use the previous Google
Sheets/Apps Script backend**. Do not remove Sheets or enable Firebase production
routing until the full operational migration and acceptance tests pass.

## 1. Firebase Console (project owner must authorize)

1. Open https://console.firebase.google.com/ and choose **Add project**.
   Suggested display name: `Aurora's Cake`. Choose the exact project ID yourself;
   the unique ID cannot easily be changed later.
2. Build → **Firestore Database** → **Create database**, use the default
   database and select a supported region near Bangladesh (e.g. Singapore/Mumbai).
   Firestore database location is an important long-term choice.
3. Choose **production mode**, NOT test mode. Our
   `firebase/firestore.rules` denies all direct mobile/browser reads/writes
   until separate scoped rules have been fully tested. The Admin SDK uses
   server credentials and separate IAM permissions.
4. Authentication → Sign-in method: enable **Email/Password** for employee
   accounts and **Google** for the shop owner. Firebase email/password login
   uses EMAIL rather than the legacy private staff username.
5. For the initial owner, create/sign in with an authorized Firebase Auth user
   whose email is verified. This Firebase Auth user is not automatically the
   Super Admin; run the one-time private owner bootstrap below.
6. Project Settings → General: take down Project ID, Web API Key and App IDs.
   These client config values are not the secret Admin service key.
7. Project Settings → Service accounts → Generate private key only if
   needed for your Vercel external server; NEVER add the JSON to GitHub,
   mobile source, screenshots, chat, or a client-side variable.

**Firestore Spark free tier:** exactly one database eligible for free quota,
1 GiB stored, 50K document reads/day, 20K writes/day, 20K deletes/day,
10 GiB/month outbound. These are quotas, not a guarantee all other services
are free. Restore/PITR/managed backups require billing. Protect with IAM.

## 2. Rules deployment (on owner Windows PC)

```powershell
npm install -g firebase-tools
firebase login
firebase use --add
# Select YOUR Firebase project; copy firebase/.firebaserc.example to .firebaserc
# and replace project placeholder only in your local copy.
firebase deploy --only firestore:rules,firestore:indexes --project YOUR_PROJECT_ID
```

Review `firebase/firestore.rules` before deploying: it deliberately blocks all
direct user access for finance/orders/receipt data. Access is through verified
Vercel backend only. Do not use `allow read, write: if true`.

## 3. Private Vercel server credentials

Vercel → Project → Settings → Environment Variables, add **server-only**:

- `FIREBASE_PROJECT_ID` = your Firebase project ID
- `FIREBASE_CLIENT_EMAIL` = service account `client_email`
- `FIREBASE_PRIVATE_KEY` = the PEM private key from the service account JSON,
  with the required newlines properly represented
- `AURORA_FIREBASE_MODE` = `staging` (initially)

The key must never be prefixed `VITE_` or `EXPO_PUBLIC_`. You can rotate
the key through Google Cloud IAM when needed. Deploy this branch to a
protected environment and check `GET /api/firebase-health`.
A `configured:true` response indicates environment properties exist;
it does **not** prove Firestore permissions/connectivity.

Use Firebase Admin SDK v14.5.0 on Node 22 in the private Vercel API.
Use the installed package from `npm ci` (keep lockfile in sync).

## 4. One-time Super Admin

After creating/verifying the owner email in Firebase Authentication, run
`scripts/firebase/bootstrap-owner.mjs` in a trusted server/PC environment
that has the same three Firebase admin environment variables and Node 22:

```powershell
node scripts/firebase/bootstrap-owner.mjs owner@example.com --confirm-owner=owner@example.com
```

The script requires exactly zero existing private `staff_accounts` entries.
It refuses to overwrite an existing staff directory. It looks up the *verified*
Firebase Auth user, then records the UID as active Super Admin. This is more
secure than allowing a public form to choose its own role.

New employees will need Firebase Auth Email/Password accounts **plus**
matching private `staff_accounts/{firebase-auth-uid}` entries. The legacy
username/password hash table is intentionally NOT migrated into Firebase Auth
because password hashes are not compatible.

## 5. Staging API (implemented)

`POST /api/firebase-operations` requires a valid Firebase Auth ID token and
the private staff record tied to its UID, email and active role. Request body:

```json
{"action":"staff_session","id_token":"<FIREBASE_AUTH_ID_TOKEN>"}
```

First-stage actions:
`staff_session`, `staff_orders`, `staff_pos_catalog`,
`staff_pos_history`, `staff_pos_create`.

- Firestore POS sale is repriced from current product variants inside a
  transaction, with stable UUID idempotency and duplicate mobile-money TXID
  prevention. bKash/Nagad is STILL **staff-attested**, not gateway-verified.
- Staff orders are read through the server and private fields are selected
  explicitly. Rider data is scoped to their own Firebase UID.
- **Not yet implemented on Firestore:** customer website checkout,
  legacy customer sign-in, phone-only tracking, all order status mutations,
  ingredient baking stock depletion, refunds/cash approvals, admin CRUD
  and historical production-cost transactions. Therefore **DO NOT switch**
  Vercel `/api/operations` or the mobile app base URL yet.
- The previous Google Sheets → Supabase private mirror from R10 may be left
  disabled; it is **not** the desired eventual architecture once Firestore
  migration completes.

## 6. Dry-run migration (no automatic cutover)

1. Back up the original Google Sheet and export only approved business sheets
   as reviewed JSON:
   `{"tables":{"orders":[{"id":"ord_...","order_number":"...",...}],"products":[...],"product_variants":[...]}}`.
   **Never commit exports with customer information to GitHub.**
2. Review schema fields and existing money/order counts.
3. On a trusted machine with server-only credentials:

```powershell
node scripts/firebase/import-sheets-json.mjs C:\secure\aurora-export.json
# Only after verifying dry-run counts and exact IDs:
node scripts/firebase/import-sheets-json.mjs C:\secure\aurora-export.json --commit --ack-reviewed-export
```

The importer rejects passwords/sessions and removes secrets/access tokens.
It uses create-only Firestore writes: existing docs cannot be overwritten.
After partial failure, inspect and reconcile documents before retrying; do
not automatically erase any order or money records. It intentionally excludes
staff login rows; recreate staff through Firebase Authentication.

**Required reconciliation checks:** old/new order ID count, paid/COD totals,
POS receipt totals, rider cash movements, refund history, ingredient stock
balances, historical production-cost snapshots, sample private PII masking,
read latency and real printer/device test. After validation schedule the
cutover, freeze old writes, switch clients, audit new writes for a period,
and retain old Sheets read-only until you have a verified backup and sign-off.

## Technical constraints

- Firestore is a document DB, not an SQL financial ledger. Atomic
  transactions/idempotency are mandatory; do not update cash totals in clients.
- Don't rely solely on Firestore Security Rules for privileged Admin SDK routes.
- Cloud Firestore has free quotas but certain services (including managed
  backup/restore, and some SMS/Cloud Functions features) may incur billing.
- The current R11 implementation is staging-only and deliberately does not
  claim fully working customer app, realtime updates, complete finance
  migration, actual cloud provisioning, or verified production data.
