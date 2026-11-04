# Aurora’s Cake — Netlify + Google Sheets only

## Production configuration

1. Netlify: build command `npm run build`, publish `dist`, functions `netlify/functions` (set in `netlify.toml`).
2. Netlify environment: set server-side `AURORA_SCRIPT_POST_URL` to the current, deployed, owner-controlled Google Apps Script `/exec` URL. This is a pinned endpoint, not a database credential. Set `VITE_GOOGLE_SHEETS_URL` to **the same** URL for public validation.
3. Build variables force `VITE_SHEETS_POST_PROXY=/api/operations` and disable Firebase/Supabase. No other datastore should be connected.
4. Ensure the Apps Script web app is deployed with current modular scripts and the generated `Code.AllInOne.gs` when using the one-file install. Existing Sheets, customer/order history and Script Properties must be backed up and preserved.
5. Mobile Expo: set `EXPO_PUBLIC_OPERATIONS_URL` to your real Netlify `https://<your-site>.netlify.app/api/operations` before signing iOS/Android builds. Never guess the site's name or send staff tokens to another host.

## Read-only smoke tests

- `GET /api/public`: valid JSON with `ok:true`, a public catalog and expected schema version.
- Netlify function logs: no Google sign-in HTML, no redirect to unknown domains, no private sheet data.
- Web: load product catalog, prices, add-to-cart and checkout; verify production banner says live only when `order_submission_enabled=true`.
- Staging Sheet: submit a COD order with stable request UUID, retry same request, verify exactly one order + receipt and correct server price.
- Staging Sheet: gift order shows recipient and gift message to the authorized staff, without displaying price on a recipient-only label.
- Login/logout and permissions: customer, owner, kitchen and rider. Verify no private fields leak into public GET.
- Backup and rollback: retain previous Apps Script deployment version and Netlify deploy; roll back both together on mismatch.

## Pending and excluded work

D1/R2 migration and Firebase/Supabase mirroring are explicitly out of scope. Historical files remain in source for reference but are not authoritative. Finance/Inventory R8 integration and physical mobile/printer tests require separate staging acceptance before production.


## Automated read-only release gate

A GitHub Actions workflow named **Verify Netlify + Google Sheets release** now checks deployment configuration, Netlify Functions, source/bundle parity, TypeScript, a Netlify-mode build and release-smoke fixtures without accessing production.

Once the exact Netlify site and its server environment are confirmed, run the **read-only** local command:

    node scripts/check-netlify-sheets-release.mjs https://YOUR-SITE.netlify.app

It makes only unauthenticated GET calls to /api/backend-health and /api/public. It rejects a non-Google-Sheets backend, incorrect Apps Script release, frozen/unknown writes, missing products and leakage of private order/auth fields. The URL must be a *.netlify.app site; for a verified owner-controlled custom domain set AURORA_APPROVED_NETLIFY_ORIGIN to that exact HTTPS origin.

A passing read-only check is not proof of COD, accounting, POS, device printing, migration or production deploy. First back up the existing Google Sheet and Apps Script version. Test order creation, idempotent retry, gift receipt, account expiry, kitchen/rider/COD workflow on staging data; keep PR draft until then.
