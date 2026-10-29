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
