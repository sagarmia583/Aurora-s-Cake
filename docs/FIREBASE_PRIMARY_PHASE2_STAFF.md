# Aurora’s Cake — Firebase-only migration Phase 2: Staff Authentication

**Deployment target: Cloudflare Worker ONLY.** Vercel and Netlify are intentionally disabled by the owner until Cloudflare is complete. Do not enable them, create deployments there, or change their settings.

**What is ready:** A separate Firebase Authentication staff preview and authenticated, read-only Firestore staff/session/order-list API. No Google Sheets requests are made by these endpoints.

**What is NOT ready:** Replacing production staff/order workflows, modifying order status, checkout, POS, inventory, baking cost, historical migration or customer authentication. Continue to treat all customer-facing financial operations as incomplete on the Firebase-only route until each is reviewed and tested.

## 1. Firebase Authentication setup (owner action)

1. Visit https://console.firebase.google.com/project/aurorascake-213a0/authentication/providers
2. Enable the **Email/Password** sign-in provider (email link not required). The new preview does not use Google OAuth or the older Google Apps Script login flow, so it avoids the old Google OAuth `origin_mismatch` problem.
3. Go to **Authentication → Users** and add a real owner account with a strong unique password. Disable self-service public sign-up in the app (the preview includes no signup form). Note: Email/Password APIs might still permit general signup on the Firebase project; anonymous registrants **cannot** access staff APIs because the private `staff_roles/{uid}` document is mandatory and cannot be created from the browser.
4. Copy the exact Firebase Authentication **User UID** from the Users list, and the exact email. Do not put any password in GitHub or chat.
5. Staff preview requires **email verification**. After login, click Send verification email and then I have verified. Unverified emails have no access to staff role/orders APIs.

## 2. Privately grant Super Admin role

Use the Firebase service account JSON ONLY on a trusted local PC. A dry-run local script is provided; it refuses to overwrite an existing role. Never place the service account JSON in the GitHub repository, frontend environment variable or chat.

With Node.js 22+ and a local checkout of GitHub main:

```powershell
npm ci
node scripts/bootstrap-firebase-staff.mjs --uid "EXACT_FIREBASE_AUTH_UID" --email "your-verified-email@example.com" --key "C:\\private\\aurora-firebase-key.json"
# Review the UID and email shown (no write happened)
node scripts/bootstrap-firebase-staff.mjs --uid "EXACT_FIREBASE_AUTH_UID" --email "your-verified-email@example.com" --key "C:\\private\\aurora-firebase-key.json" --write
```

Alternative: In Firebase Console → Firestore **Data**, create `staff_roles` collection, **document ID = exact Firebase Auth UID**, with the following fields:

| Field | Firestore Type | Value |
|---|---|---|
| `email` | string | Exact verified Firebase Auth user email in lower case |
| `name` | string | Owner display name |
| `role` | string | `super_admin` |
| `active` | boolean | `true` |

**Security:** Never permit an app user to set their own role via browser / public API. The existing Firestore Rules prohibit all public/private writes. The Cloudflare Worker uses IAM to read the staff role privately. Roles are tied to UID and verified email; an email-only match is insufficient.

## 3. Cloudflare deployment

Code lives in GitHub `sagarmia583/Aurora-s-Cake` and Cloudflare Worker `aurora-s-cake`. After GitHub tests pass and the merge into `main` completes, Cloudflare should deploy latest `main`. Ensure root `wrangler.toml` has `FIREBASE_PRIMARY_STAFF_ENABLED="true"`. The existing `FIREBASE_SERVICE_ACCOUNT_JSON` encrypted **runtime** secret is reused. No additional JSON key is necessary.

New read-only routes:

- `GET /api/firebase-primary/staff/session`
- `GET /api/firebase-primary/staff/orders` (currently limited to first 25 Firestore order docs)

The caller must send `Authorization: Bearer <FirebaseAuth-ID-token>`. The server verifies Google's Firebase signing key (RS256), project ID, issuer, token expiry, auth_time, email verification and private staff role document. Unprovisioned, inactive or spoofed roles receive HTTP 403. Unknown/expired tokens receive HTTP 401. POST/write operations are denied (405). Results have `Cache-Control: no-store`.

**DO NOT** paste a Firebase Auth ID token into public URLs or another person's messages. The new preview acquires it directly from Firebase Auth SDK and sends it only to the same-origin API.

## 4. Test the isolated new Staff Panel

Open:

https://aurora-s-cake.sagarmia583.workers.dev/?firebase_staff_preview=1

1. Sign in with the provisioned Firebase Email/Password account.
2. Verify your email when prompted, refresh verification state.
3. Click **Verify staff & load orders**.
4. Expected: actual role from Firestore, and a read-only list of up to 25 documents already in private `orders`. Empty results are possible, because Firebase migration/backfill isn't complete; this does not mean original Sheets orders are deleted.
5. Confirm a non-provisioned test user is denied. Confirm no customer receipt tokens, delivery OTPs or passwords appear in the list.
6. Keep normal public shop checkout and legacy Staff Portal unchanged until an authoritative Firestore checkout and transactional POS/ledger are ready and tested.

If the preview returns `firebase_role_not_provisioned` / `staff_role_not_provisioned`, verify document ID matches Firebase Auth UID and fields above. If `firebase_token_invalid`, verify you signed in with Firebase Auth (not the old Google popup), email verified, and no clock issues. If `firebase_backend_unavailable`, check Cloudflare logs and the service-account IAM role privately.

## 5. Security considerations and next phase

- Firebase staff token validation via Google's published Firebase signing keys (WebCrypto). Browser-supplied roles are ignored. This phase doesn't implement explicit token-revocation checks; tokens have short lifetimes. Deactivate the private `staff_roles/{uid}` document to revoke staff API authorization immediately.
- Existing Firestore security rules must **not** be changed to `allow read,write:true`.
- The Worker reads only narrowly scoped customer/order data after staff role verification and never sends secrets in API responses. For large accounts, authenticated pagination/queries and audit trails are needed.
- Real roles should be created only for verified staff. Staff role writes/mutations will be implemented via audited admin-only APIs later.
- POS sales, inventory quantities, returns/refunds, production cost snapshots and COD accounting are separate workstreams; do not claim full Firebase-only production readiness until validated.

**Next build milestone:** Firestore Product CMS with role-verified write actions and server-priced COD checkout with idempotency and Firestore transactions, followed by staff order status mutations and ledger.
