# Aurora’s Cake — Cloudflare Worker production setup

Current production target: [aurora-s-cake.sagarmia583.workers.dev](https://aurora-s-cake.sagarmia583.workers.dev). The project is a **Cloudflare Worker with Static Assets**, not a Pages project. Vercel and Netlify are retired deployment targets; do not reactivate them while repairing this deployment.

The live catalogue, checkout and existing staff operations use **Google Apps Script and Google Sheets** through the Worker's same-origin APIs. D1/R2 is a separate migration foundation. A configured D1 binding does not apply a schema, copy historical records, or switch checkout.

## 1. Build the existing Worker

In **Cloudflare → Workers & Pages → aurora-s-cake → Settings → Builds**, use:

| Field | Value |
| --- | --- |
| Git repository | `sagarmia583/Aurora-s-Cake` |
| Production branch | `main` |
| Root directory | Repository root |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Worker name | `aurora-s-cake` |
| Node.js | 22 or newer |

The root `wrangler.toml` selects `cloudflare/worker.js`, the Vite `dist` assets, SPA fallback and Worker-first `/api/*` routing. The Worker imports the handlers in `functions/api/`; a Workers project does not discover Pages Functions automatically. Do not use `wrangler.pages.toml` or a Pages deploy command for this Worker.

`keep_vars = true` preserves dashboard text variables that are not declared in `[vars]` during Wrangler deploys. Explicit tracked values still take precedence. Runtime secrets remain in Cloudflare; never write them into GitHub, frontend `VITE_` variables or build logs.

## 2. Configure the current Google Sheets backend

The public Apps Script web-app URL is declared in the tracked `wrangler.toml` `[vars]` as `AURORA_SCRIPT_POST_URL`. This configures the **Worker runtime**, not only the frontend build. The endpoint URL is already public application configuration; it does not grant access to private customer or staff records.

| Name | Type | Purpose |
| --- | --- | --- |
| `AURORA_SCRIPT_POST_URL` | Tracked runtime variable | The verified Apps Script web app URL ending in `/exec`; used by `/api/public`, `/api/backend-health` and `/api/operations`. |

Use the exact currently deployed shop endpoint. A stale repository example or a URL that returns a Google sign-in page is not a working backend. Confirm the Apps Script points at the intended private shop Sheet before changing the binding. Change the reviewed Wrangler/deployment configuration when selecting a different shop backend, and deploy that configuration so the active Worker receives it. Keep the runtime URL consistent with frontend configuration. If an older deployment has a same-name secret, resolve the reported binding conflict in that deployment rather than adding an unverified fallback URL.

Actual credentials, including private service-account JSON, OAuth client secrets and staff/session tokens, remain private secrets. Publishing the web-app URL must not weaken the backend's authentication or staff-role checks.

Frontend build configuration:

| Name | Purpose |
| --- | --- |
| `VITE_GOOGLE_SHEETS_URL` | Public Apps Script `/exec` URL for the current shop. Keep it consistent with the runtime backend. |
| `VITE_SHEETS_POST_PROXY` | `/api/operations`; Cloudflare production uses the same-origin relay. |
| `VITE_GOOGLE_OAUTH_CLIENT_ID` | Public Google Web Client ID, if Google account login is used. Authorize the exact Cloudflare origin in the Google OAuth client. |

The Google Web Client ID is public configuration. OAuth client secrets, service-account JSON, staff passwords and auth tokens must never be frontend variables.

The Apps Script deployment is separate from the Worker deployment. Install the matching current Apps Script modules or the single `Code.AllInOne.gs` file, without duplicate handlers. Back up existing code/data before an update, run only the relevant setup functions, and deploy a **New version** of the existing web app. Preserve existing staff access and customer/order rows. GitHub commits alone do not update Apps Script.

## 3. Keep migration features disabled

The current tracked defaults are deliberate:

```toml
FIREBASE_MIRROR_ENABLED = "false"
FIREBASE_PRIMARY_CATALOG_ENABLED = "false"
FIREBASE_PRIMARY_STAFF_ENABLED = "false"
D1_PREVIEW_ENABLED = "false"
D1_MUTATIONS_ENABLED = "false"
```

`GET /api/firebase-sync-status` reporting `enabled:false` / `configuration_code:"disabled"` is expected in this configuration. Do not add a Firebase service account, enable mirrors, run Firestore backfills or turn on a Firebase preview to repair Google Sheets checkout.

`AURORA_DB` is bound to the owner's existing `aurora-cake-db`. R2 has not been bound in the tracked configuration. Keep the D1 flags off until the schema, private backup, historical import reconciliation, R2 resource and access controls are verified. Follow [D1/R2 migration](CLOUDFLARE_D1_R2_MIGRATION.md) for that separate project; do not create a second database or treat a binding as a completed migration.

## 4. Read-only deployment checks

Use the Cloudflare hostname throughout:

1. Open `/` and confirm the current storefront renders and images load.
2. `GET /api/backend-health` must return JSON with `ok:true` and `up_to_date:true`. A `503` missing-backend error means `AURORA_SCRIPT_POST_URL` is absent/invalid at runtime; check that the active Worker revision includes the reviewed Wrangler runtime variable. A `502`/`504` means the upstream reply or connection failed. A valid but older release needs a matching Apps Script update; changing frontend files cannot update it.
3. `GET /api/public` must return the shop's validated public catalogue JSON. HTML, a Google login screen or a React shell is a failure. Customer records must not appear in this response.
4. `GET /api/operations` should return `405`, because it accepts POST only. Unknown `/api/*` paths should return JSON `404`, not the storefront HTML.
5. Confirm disabled migration status is expected; do not enable a migration flag merely to make its status green.

Check the deployed Worker version/build revision against the intended commit. A successful GitHub CI build or Wrangler dry-run does not prove that this Worker version was deployed or that runtime bindings and Apps Script match it.

## 5. Controlled acceptance after configuration

Use [Live Operations Setup](LIVE_OPERATIONS_SETUP.md) for the detailed business flow. Read-only checks and deliberately invalid POST requests can validate routing/rejection without creating an order. Successful order creation, staff status changes and COD delivery require a controlled test order approved by the shop owner.

For an approved test, verify exactly one order and its item rows, a confirmed receipt, role-restricted staff access, assigned-rider access and delivery OTP/COD rules. If an acknowledgement times out, retry the **same request ID** instead of submitting a new order. Reconcile the private Sheet record before declaring the flow successful.

Do not reactivate retired hosting, turn on D1/Firebase mutations, import historical records, or send customer campaigns as a side effect of a deployment health check.
