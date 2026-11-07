# Aurora's Cake — Netlify + Google Sheets release readiness
Date: 2026-11-07

## Single approved production stack
- **Netlify** builds and serves React storefront, Staff UI, and same-origin Functions: `/api/public`, `/api/backend-health`, `/api/image` (GET) and `/api/operations` (POST).
- **Google Apps Script** existing production Web App is the authoritative API and authorization layer.
- **Google Sheets** original production workbook is the sole authoritative operational database.
- No Cloudflare Workers/Pages, D1/R2, Vercel, Firebase or Supabase runtime integration or deployment is authorized.

## Release candidate provenance
- Release candidate: Draft PR #43, based on main, Netlify-only cleanup with 12 reviewed security files overlaid *byte-identically* from PR #42's pinned reviewed commit `d0015d946d171f91f06507b2472aa39aef9c9be0`.
- Isolated STAGING at that reviewed Apps Script code successfully executed owner-confirmed Staff → Kitchen → Rider → COD simulation: 7 stages, role permission checks, COD acknowledgment, one synthetic BDT 360 order delivered/paid; five temporary staff accounts subsequently disabled.
- STAGING testing and a successful build do **not** certify production cutover, physical POS/printing, real rider deposits, independent cash approvals, inventory valuation, refund settlement, or historical production costing.
- PR #43 remains Draft pending production owner review and release gate checks.

## Environment and preview safety
- Existing production Apps Script `/exec` path is configured as `AURORA_SCRIPT_POST_URL` in the **Netlify Production** context; `VITE_GOOGLE_SHEETS_URL` at **Netlify Build** must refer to the *same* production deployment. Do not use the isolated staging URL for live production.
- The Netlify Vite build sets `VITE_SHEETS_POST_PROXY=/api/operations` in netlify.toml. Netlify Function validates backend HTTPS host and `/exec` path.
- Netlify Deploy Preview and Branch Deploy must never accidentally post to the production Sheet. PR #43 explicitly denies all POST operations for preview/branch hostname or non-production Netlify deploy context. Public GET catalog can still be previewed; preview login/checkout are intentionally disabled.
- A Netlify deploy-preview **SUCCESS** confirms an artifact was built; it is not proof that the preview Functions have an approved Sheets backend.
- Check the **Netlify Dashboard**, not only the repository. Previous Vercel integration may continue to publish a failing GitHub status until the owner disconnects/removes that external Vercel project.

## Pre-release gate
1. Owner confirmed a **new private original Production Google Sheet backup**; verify its exact workbook content, permission scope (Restricted) and retrieval from the production owner's own Google account. The connected integration currently cannot independently access this backup or the original production workbook.
2. Save current live Netlify deploy ID, production Apps Script existing deployment ID/version, and original production Apps Script source backup; keep original Script Properties. Restrict backup links.
3. Verify Netlify Production environment variables and run GET-only checks of live `/`, `/api/backend-health`, `/api/public`, and current production Apps Script `?action=health`. Never send credentials or invoke POST during preflight.
4. Confirm exactly which backend the live Netlify Functions use; equality of a release **label** does NOT independently prove identical Google Apps Script code. The current `AURORA_BACKEND_RELEASE` string was present before the audited patch.
5. During an owner-approved cutover, publish the reviewed source to the **existing production Apps Script project**, selecting **Edit existing deployment > New version** (keep URL). Verify production Sheet binding; do not run `setupSheetDatabase` or staging password reset. Do not create a new Production Sheet.
6. Only after backend verification, merge PR #43 to the Netlify production branch and verify live GET health/catalog. Check the owner-approved authenticated checkout, Staff dashboard, kitchen, delivery and COD workflows using a separately planned safe live test; avoid unapproved real orders.
7. The independent financial ledgers and physical POS remain separate launch blockers for claiming complete finance readiness.

## Rollback
- Netlify: save currently published deploy ID before release; in Netlify **Deploys**, use **Publish Deploy** on the previously verified deploy if the storefront regresses. Note that subsequent Git-triggered deployments can republish new code.
- Apps Script: retain prior existing production deployment version; restore the version in **Manage deployments > Edit existing Web app** (do not create new URL).
- Google Sheets: never overwrite the active Production Sheet from backup as a reflexive rollback — orders received after backup would be lost. Reconcile post-backup writes before any selective restore.
- If a cutover fails after any live order, stop and audit transaction/order states before retrying; do not replay idempotency-sensitive actions blindly.

## Exclusions
- The PR removes retired hosting/database infrastructure and browser-facing previews. Some legacy optional adapter functions remain inside the pinned reviewed Apps Script bundle so the successful Staging security acceptance remains valid. Their removal requires a **separate reviewed backend change and another isolated Staging acceptance**.
- No GitHub edit alone can delete external Vercel/Cloudflare accounts or validate private production Sheet backups.

## Preflight findings · 2026-11-07 (owner-run Windows GET-only)
- Live Netlify homepage returned HTTP 200; `/api/backend-health` and `/api/public` returned HTTP **404**, showing live API routes unavailable. This could mean the published deployment is missing Functions, uses a static-only upload or does not route the function URLs. Check Netlify **Deploys > Published deploy > Functions** and its deploy log for function bundling. Root homepage HTTP 200 is not an API readiness check.
- PR #43 Deploy Preview GET returned HTTP **401** at homepage and APIs. This is consistent with Netlify Preview access protection; do not disable the protection or infer a broken function. Owner may open preview while authenticated to inspect it.
- Current direct production Apps Script `?action=health` returned `release=aurora-2026-11-03-order-links-r2` and `writes_frozen=false`. The release candidate's Netlify health expects `aurora-2026-11-03-staff-order-alerts-r5`; do not merge or redeploy the Netlify frontend until the approved existing production Apps Script project is updated and the exact production binding is verified.
- On this PR, routing was made explicit with four `netlify.toml` 200 rewrites and the default `/.netlify/functions/<name>` entrypoints. This only fixes a misrouted **Git-based deploy that bundles the Functions**; it cannot repair a static `dist` upload or a live site whose Netlify Functions have not been deployed. Do not assume this change fixes the live HTTP 404 before re-testing on a new deploy.
