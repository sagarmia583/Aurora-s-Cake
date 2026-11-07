# Aurora's Cake — two live websites, one source and one database

## Approved architecture (NO CLOUDFLARE)
1. Frontend A: GitHub Pages https://sagarmia583.github.io/Aurora-s-Cake/
2. Frontend B + secure API: Netlify https://aurorascake.netlify.app/
3. Backend: existing Google Apps Script production R5 /exec
4. Database: original Aurora's Cake Google Sheet

Both websites use the SAME source branch (main), SAME published Apps Script endpoint and SAME Google Sheet. Never create a second database, separate coupon catalogue or separate order ledger.

## Automatic code publishing
- GitHub Pages already uses .github/workflows/github-pages.yml. Pushes to main build the Vite project with /Aurora-s-Cake/ base and publish it.
- Netlify is connected to the same GitHub repository and main branch. It must be configured in the Netlify dashboard to AUTO PUBLISH successful main builds (currently previously shown as **Auto Publishing Locked**). Unlock it once, and verify the published commit is the latest main SHA.
- If Netlify credits are exhausted or the site is paused, new builds and functions cannot be assumed live. A GitHub commit cannot override a Netlify billing or deployment lock. Check credits and status in Netlify before switching GitHub Pages to live ordering.

## ONE-TIME activation: verify Netlify BEFORE enabling GitHub Pages writes
1. In Netlify, verify the environment variable AURORA_SCRIPT_POST_URL points to the same production Apps Script /exec URL used by VITE_GOOGLE_SHEETS_URL; these must not be a staging /exec.
2. On https://app.netlify.com/projects/aurorascake/deploys inspect the latest main deployment. If auto publishing is locked, unlock and publish the reviewed successful build. Confirm all FOUR Functions: public, backend-health, image, operations.
3. Open https://aurorascake.netlify.app/api/backend-health — it must return status HTTP 200 with ok:true, up_to_date:true, database_backend:google_sheets, writes_frozen:false. If HTTP 404, Functions did not deploy; DO NOT activate customer ordering on Pages.
4. Run an approved no-write staff login / staff_session check on Netlify to verify credentials and roles. Do not expose any password or staff session in chat.
5. Once Netlify is healthy, open GitHub repository Settings > Secrets and variables > Actions > **Variables** and add:
   Name: AURORA_SHARED_NETLIFY_API_ORIGIN
   Value: https://aurorascake.netlify.app
   This is a public HTTPS origin, NOT a token or secret. Only this exact origin is accepted by the frontend. Leave the variable UNSET if Netlify is not healthy.
6. GitHub Actions > Publish Aurora's Cake to GitHub Pages > Run workflow on main. Until the variable is set, Pages remains safe READ-ONLY; after a successful verified build it routes checkout/staff CMS mutations to Netlify's original Functions endpoints.
7. Perform a controlled unique-reference test order from EACH website. Verify exactly one order per reference exists in the SAME Google Sheet. Confirm cross-site order tracking, staff login and CMS save. If acknowledgement is uncertain, retry ONLY the original request reference, not a new request.
8. For an Admin CMS test, update one harmless existing public content field on one site. Check the original Sheet and the other site after public-content refresh and CDN expiry.

## Security
- Netlify only permits cross-origin browser requests from the exact trusted GitHub Pages origin, and only on the canonical Netlify production hostname. Preview deploys are NOT allowed to accept Pages writes. Unknown origins get 403. Preflight permits Content-Type only.
- Original Apps Script still validates staff roles and order access. CORS is NOT authentication. Staff tokens are sent only in the POST body to the Netlify relay, and the relay forwards only the JSON payload to the pinned Google /exec endpoint (not cookies).
- Preview Netlify Functions reject write actions for production Sheet isolation. Keep credentials only in Netlify environment and Google Apps Script Properties; do not put them in VITE_* frontend code.
- If Netlify becomes unavailable, Pages must not fall back to direct cross-origin POST to Apps Script; network failures are shown instead, protecting order idempotency.
- No Cloudflare, Supabase, Firebase, new Sheets or schema migrations are involved.

## Cross-site update expectations
- Source code changes: main push triggers GitHub Pages build and the connected Netlify build (subject to Netlify credits/auto publishing). GitHub Actions passing alone does not mean Netlify has published the deployment.
- Admin changes: both websites read the original Google Sheet. Public polling and API cache may introduce a short delay; refresh as needed.
- Onboarding: Use Netlify for customer transactions until Pages has passed live CORS/preflight and single-order verification.
