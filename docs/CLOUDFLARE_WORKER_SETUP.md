# Aurora’s Cake — Existing Cloudflare Worker: Fix build and enable Firebase

**Project already created:** `aurora-s-cake`
**Public hostname:** `https://aurora-s-cake.sagarmia583.workers.dev`
**Runtime:** Cloudflare **Workers** (not Pages).
**GitHub repository:** `sagarmia583/Aurora-s-Cake`

## Why the existing build failed

Previously the repository root `wrangler.toml` described a **Pages** project (`pages_build_output_dir` and a different project name), but the Cloudflare account created a **Worker** project. Pages' `functions/api/*.js` files are not autodiscovered by Workers Builds.

The new root `wrangler.toml` targets `aurora-s-cake` as a Worker using `cloudflare/worker.js`, Vite static assets from `dist`, SPA fallback, and `/api/*` route-first handling. The same validated Pages Functions are imported and dispatched by the Worker entrypoint.

### 1. Fix Cloudflare Worker Builds

Go to **Cloudflare → Workers & Pages → aurora-s-cake → Settings → Builds**.

| Field | Value |
| --- | --- |
| Git repository | `sagarmia583/Aurora-s-Cake` |
| Production branch | `main` |
| Root directory | Repository root (blank or `/`, depending on UI) |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Worker name (from `wrangler.toml`) | `aurora-s-cake` |

Cloudflare installs npm packages from `package-lock.json` during the build. If the Build settings support configuring Node.js, use Node 22+. You no longer need `npx wrangler pages deploy`, `wrangler pages functions build` or the Pages-only `wrangler.pages.toml` for this Worker.

Save build settings and **Retry build** or deploy the latest `main` commit. The Worker gets the React app (static assets), secure same-origin bakery APIs and Firestore mirror. The Vercel site remains untouched.

Cloudflare docs: https://developers.cloudflare.com/workers/ci-cd/builds/configuration/ and https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/

### 2. Set runtime bindings (NOT build variables)

Open **Workers & Pages → aurora-s-cake → Settings → Variables and Secrets** (sometimes called *Bindings → Variables and Secrets*). These variables must be **runtime**, not Git/build-time values.

| Name | Type | Value |
| --- | --- | --- |
| `AURORA_SCRIPT_POST_URL` | **Secret** | Your actual deployed Apps Script `https://script.google.com/macros/s/.../exec` URL, same as production Vercel. |
| `FIREBASE_MIRROR_ENABLED` | Plain Text | `true` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | **Secret** | Full Google service account JSON, project ID `aurorascake-213a0`. |

Do **not** upload JSON to GitHub or set `VITE_FIREBASE_SERVICE_ACCOUNT_JSON`. The Worker reads secrets from its `env` bindings; they are never sent to the client. The service account must have the minimal appropriate **Cloud Datastore User** IAM role in Google Cloud for this project. Do **not** open Firestore rules for public writes: the server uses Google IAM directly.

Optional build-time variables:
- `VITE_GOOGLE_SHEETS_URL`: public Apps Script `/exec` URL (there is a legacy fallback).
- `VITE_SHEETS_POST_PROXY`: `/api/operations` (the Workers hostname now uses this same-origin route even without this build variable).
- `VITE_GOOGLE_OAUTH_CLIENT_ID`: configured Google web OAuth client; whitelist `https://aurora-s-cake.sagarmia583.workers.dev` in Google Cloud OAuth **Authorized JavaScript origins** for owner Google Login.

**After editing secrets/variables**, save/deploy a new Worker version so the active isolate receives the bindings.

### 3. Check whether the APIs are online

1. `https://aurora-s-cake.sagarmia583.workers.dev/api/firebase-sync-status`
   - Expected: `enabled:true`, `configured:true`, `configuration_code:"configured"`, `deployment_platform:"cloudflare_worker"`.
   - If false, use the non-sensitive `configuration_code` to diagnose whether variable is disabled/missing, JSON invalid, private key malformed, or project ID wrong.
   - `configured:true` is **only a format check**, not proof that Firestore permissions work.
2. `https://aurora-s-cake.sagarmia583.workers.dev/api/backend-health`
   - `up_to_date:false` means the Apps Script code itself must be redeployed separately.
3. `https://aurora-s-cake.sagarmia583.workers.dev/api/public`
   - Expected validated public catalog JSON and products.

### 4. Test Firestore writing (Super Admin only)

Log into Staff Panel as **super_admin**, open **Orders & delivery → Firebase order backup → Test Firebase write**. The request is first authorized by Apps Script. Only a verified `super_admin` is allowed to trigger a harmless Firestore write to `integration_checks/cloudflare_pages` (the document ID is historical and shared by Pages and Workers). Inspect the response:
- `write_verified`: OAuth and Firestore IAM write succeeded.
- `firebase_oauth_failed_400`: service account JSON/key may be wrong or revoked.
- `firestore_write_403`: insufficient Firestore IAM permission.
- `firebase_server_connectivity_failed`: timeouts, network or runtime error.
- `not_configured` / `invalid_json` / `wrong_project_id`: review Cloudflare runtime secrets.

Then place **one real checkout test order** through the **Workers** site. In DevTools → Network → `/api/operations` the response should have header `X-Aurora-Firebase-Mirror: saved` or `unchanged`. Verify the order exists in both:
- Google Sheets (source of truth).
- Cloud Firestore → database `(default)` → collection `orders` → document `{order.id}` (mirror).

**Do not place a second order if a write times out.** Retry the *same request ID* through the existing checkout system.

### 5. Migrate historical orders after live test

Use the existing **Super Admin → Orders → Sync existing orders** button. This is an explicit, paged backfill of server-verified Google Sheets data. It does not delete or modify the original. Review errors, reconcile totals and repeat until complete.

### What is not yet migrated

This update mirrors only authoritative order documents + order status transitions. Standalone POS Sales, inventory quantities, expenses, baking cost snapshots, full customer accounts, CMS and staff identity are **not** yet fully migrated to Firebase. They remain in the original systems, and it would be unsafe to present this as a full primary database switch.

Cloudflare has usage limits even on the Free plan. The hostname works only after the Cloudflare project itself has completed a successful deploy. CI build tests are not equivalent to a real deployed customer order test.
