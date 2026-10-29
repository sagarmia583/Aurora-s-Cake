# Aurora’s Cake — Cloudflare Pages deployment

**Status:** Cloudflare source adapter prepared in GitHub. Cloudflare project/account authorization, production secrets, and real deployment require the owner. This repository change does not automatically create a Pages account, claim a `pages.dev` address or migrate data.

## Architecture

- Frontend: React + Vite → Cloudflare Pages static assets, `npm run build` → `dist`.
- Backends: `/functions/api/*` → same-origin Cloudflare Pages Functions:
  - `POST /api/operations`: pinned Apps Script relay; existing staff auth, customer login, order creation and delivery mutations. Never accepts a user-selected backend URL.
  - `GET /api/public`: validated public bakery catalog only.
  - `GET /api/image?id=...`: validated safe bakery images.
  - `GET /api/backend-health`: Apps Script release check.
  - `GET /api/firebase-sync-status`: safe Firebase mirror config status.
- Primary database: **Google Apps Script/Sheets** (unchanged).
- Optional secondary copy: server-only `orders/{id}` in Firestore `aurorascake-213a0`, after Apps Script confirms a committed order and **only if correctly configured**.
- Firestore browser rules continue to deny direct access to private orders, staff, cash and inventory. Don't change them.

**Note:** Not all staff features/older orders have been moved to Firebase. This is a verified-orders **one-way** mirror, not a full backend migration. The Pages Workers Free plan has request/CPU limits, and monitoring + historical backfill are necessary.

## 1. Prepare the Cloudflare account (user action)

1. Open https://dash.cloudflare.com/ and log in.
2. Go to **Workers & Pages → Create application → Pages → Connect to Git**.
3. Authorize the requested Cloudflare–GitHub integration and select `sagarmia583/Aurora-s-Cake`. You must approve GitHub access yourself; don't share passwords or tokens in chat.
4. Choose **Project name** `auroras-cake-pages` (if available; if taken, change the `name` in `wrangler.toml` to match the name you create).
5. **Production branch:** `main` once the Cloudflare integration PR has been reviewed and merged. To preview the PR before merge, allow preview builds on `feat/cloudflare-pages-20261029`.
6. Framework preset: **React (Vite)**; root directory: **repository root / blank**; build command `npm run build`; output directory `dist`. Use Node.js 22 or 24 on the Cloudflare build environment. The checked-in `wrangler.toml` sets the Workers compatibility date to `2026-10-29` and the Pages build output folder to `./dist`.
7. Open the generated `*.pages.dev` URL. Do not switch the original Vercel domain or disable existing checkout yet.

See Cloudflare docs:
- https://developers.cloudflare.com/pages/get-started/git-integration/
- https://developers.cloudflare.com/pages/functions/wrangler-configuration/
- https://developers.cloudflare.com/pages/functions/bindings/

## 2. Add Production Variables and Secrets

Cloudflare Dashboard → Workers & Pages → **auroras-cake-pages** → Settings → **Variables and Secrets** → Production.

| Name | Type | Value |
| --- | --- | --- |
| `AURORA_SCRIPT_POST_URL` | **Encrypted secret** | The existing deployed Google Apps Script `https://script.google.com/macros/s/.../exec` URL (same one used by Vercel). Must not contain query/fragment. |
| `VITE_GOOGLE_SHEETS_URL` | Build variable | Same published Apps Script `/exec` endpoint (a web app endpoint, not a credential). |
| `VITE_SHEETS_POST_PROXY` | Build variable | `/api/operations` |
| `VITE_GOOGLE_OAUTH_CLIENT_ID` | Build variable | Existing Google Web OAuth Client ID; register the exact new `https://<project>.pages.dev` site origin under **Authorized JavaScript origins** before testing staff Google login. |
| `FIREBASE_MIRROR_ENABLED` | Runtime variable | `false` for initial safe testing; set `true` only after approved credentials and live tests. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | **Encrypted secret** | Full service-account JSON issued for Firestore project `aurorascake-213a0`. Never paste in source code or frontend `VITE_` variables. |

Cloudflare secrets are **not copied automatically from Vercel**. Add values to **Production**, and to **Preview** only when needed to test a non-production deployment. After changing secrets, redeploy to apply them.

For testing, start with `FIREBASE_MIRROR_ENABLED=false` and do not configure a production Firestore credential on an unreviewed preview branch.

## 3. Enable and verify Firebase writing (Cloudflare, not Vercel)

1. Go to **Cloudflare Dashboard → Workers & Pages → your Pages project → Settings → Variables and Secrets → Production**. Variables from Vercel are **NOT** transferred automatically.
2. Confirm the following runtime bindings exist:
   - `AURORA_SCRIPT_POST_URL`: encrypted secret; the original deployed Apps Script `https://script.google.com/macros/s/.../exec` endpoint.
   - `FIREBASE_MIRROR_ENABLED`: plain text value `true`.
   - `FIREBASE_SERVICE_ACCOUNT_JSON`: **encrypted** secret containing the complete service account JSON for project `aurorascake-213a0`. It must be a Google **service account** credential, not Firebase web config / API key.
3. The service account needs **Cloud Datastore User** IAM permission for the Firestore database. Do not modify the private deny-by-default Firestore browser rules. The server-to-server API uses Google IAM.
4. Deploy the latest GitHub `main` commit to **Production**. Previously built deployments do not automatically pick up changed secrets. Read https://developers.cloudflare.com/pages/functions/bindings/ for current Pages secrets instructions.
5. Visit `https://<your-project>.pages.dev/api/firebase-sync-status`. It should show:
   ```json
   {"ok":true,"provider":"firestore","enabled":true,"configured":true,
    "configuration_code":"configured","deployment_platform":"cloudflare_pages"}
   ```
   The response has additional fields. `configured:true` is a **format check only**.
6. If configured is false, inspect `configuration_code`:
   - `disabled` → `FIREBASE_MIRROR_ENABLED` isn't exactly `true`.
   - `missing_service_account` → JSON secret not bound to this Pages environment.
   - `invalid_json` → full JSON object not pasted correctly; do not add extra outside quotes.
   - `not_service_account` → entered web config or another credential, not service account JSON.
   - `wrong_project_id` → credential belongs to a different Firebase/Google Cloud project.
   - `invalid_client_email` → service account email missing/invalid.
   - `missing_private_key` or `invalid_private_key` → key missing, malformed, or escaped incorrectly.
   Don't paste credentials into browser tools, a GitHub issue or chat.
7. Sign in to **Staff Panel as Super Admin → Orders & delivery → Firebase order backup → Test Firebase write**. This button is authorized by the existing Apps Script staff session and writes only a benign `integration_checks/cloudflare_pages` document.
   - `write_verified` means Google OAuth and Firestore IAM write both worked.
   - `firebase_oauth_failed_400/401` can indicate an invalid/revoked key, JWT signing or account problem.
   - `firestore_write_403` indicates insufficient IAM access / incorrect project or Firestore permissions.
   - `firebase_server_connectivity_failed` indicates timeout or server runtime/network problem.
8. Only after that, place **one real test COD order** in the Cloudflare-hosted storefront, and verify the returned `X-Aurora-Firebase-Mirror: saved` header and one private `orders/{order.id}` Firestore document. A Vercel-created order won't necessarily pass through the Cloudflare mirror.
9. To sync existing orders, Super Admin → Orders & delivery → **Sync existing orders**; repeat until the backfill is complete. Cross-check counts and totals with original Google Sheets. This copies records; it never deletes or updates Sheets.

Cloudflare Pages automatically uses the same-origin `/api/operations` proxy when built by Cloudflare, even if `VITE_SHEETS_POST_PROXY` was accidentally omitted. Don't bypass it with direct browser Apps Script calls.

**Limitations:** This mirror currently stores confirmed order summaries and status updates only. Independent POS sales, cash ledger, inventory, recipes, staff accounts and CMS remain in their existing storage until separately migrated. Cloudflare deployment and actual credentials cannot be verified from GitHub build success alone.

## 3. Verify each API before switching traffic

1. `https://<project>.pages.dev/api/backend-health` → JSON with `ok:true` and `up_to_date` (if false, Apps Script itself is older; Cloudflare cannot fix it).
2. `https://<project>.pages.dev/api/public` → `ok:true`, `schema_version`, `data` fields; product names should render on frontend.
3. `https://<project>.pages.dev/api/firebase-sync-status` → `enabled:false` while mirror disabled; after safe configuration, `enabled:true,configured:true` is only a config check, **not** proof that a Firestore write succeeded.
4. Open storefront in a fresh browser and test customer login, staff login, staff order queue, custom cake requests, product images and checkout. The Google OAuth client may need the `pages.dev` origin whitelisted.
5. Test one legitimate customer COD order with same request ID on retries; verify exactly one Sheets row and check the Firebase mirror response header `X-Aurora-Firebase-Mirror` after enabling it.
6. Test delivery status changes and verify they sync to Firestore `orders/{id}`. Ensure Firestore does **not** store OTP, customer receipt access tokens, passwords or auth sessions.
7. Historical orders: super admin → Orders → **Sync existing orders**, repeated until finished. Reconcile counts and audit errors. Do not interpret a completely empty Firestore as a completed migration.
8. Monitor Cloudflare function errors, latency and quotas before using this site for real transactions.

## 4. Security and performance

- `public/_routes.json` includes **only** `/api/*` so static HTML, CSS, JS and images don't consume the Functions quota.
- `public/_redirects` provides an SPA rewrite for static routes; Pages Functions are excluded from it.
- The Cloudflare Functions use `context.env` bindings, never JS client Firebase tokens.
- The Apps Script relay validates same-origin requests, action list, upstream domain and response, while Apps Script is the authority for staff roles/pricing/COD.
- Cloudflare Workers compatibility date `2026-10-29` enables supported Node compatibility for the Firestore mirror's Node `crypto` signing code. Real Workers runtime acceptance testing is still needed.
- Worker Free plan: **100,000 function requests/day** shared with Workers and constrained CPU time. Cloudflare Pages Free: **500 Git builds/month**, not unlimited.
- Preserve Vercel as a fallback until the new Pages backend passes production acceptance tests.

## 5. Updates

Git pushes to the Production branch can trigger Cloudflare deployments when Git integration is enabled. You can disable automatic branch builds in the Pages dashboard if you want fewer builds. Changes to Pages/Workers compatibility settings or secrets may require a new deployment.

Do not paste private service account keys, database passwords, Apps Script admin tokens, or customer data into GitHub issues, chats or public URLs.
