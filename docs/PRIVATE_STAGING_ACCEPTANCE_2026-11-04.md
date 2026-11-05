# Aurora’s Cake — private staging acceptance and release blocker
**Prepared:** 2026-11-04 · **Architecture:** Netlify + Google Apps Script + Google Sheets only.

## Actual Google Drive verification
- The configured production spreadsheet exists and is an original native Google Sheets workbook.
- An independent owner-private pre-deploy backup was created and its file metadata verified.
- A separate owner-private staging copy was created from that backup; it is NOT the authoritative live database.
- Each workbook contains 37 tabs. Header-only comparisons confirm the same critical structure for orders, staff_accounts, auth_sessions, inventory_items, refund_returns and rider_cash_deposits.
- Backup and staging file identifiers and links must remain in the owner's private Google Drive. **Do not commit them to the public GitHub repository.**
- Copies preserve production content, including real customer and account information; they are not anonymized test fixtures.

## P0 security blocker: source spreadsheet sharing
Drive metadata for the **original production workbook** reports an `anyone / reader` permission (link-access reader). Even if the public website only uses allowlisted JSON, a directly shared spreadsheet may reveal private tabs such as orders, customer_accounts, staff_accounts, auth_sessions, refunds and cash records. Private tab protections or hidden sheets are **not** adequate viewer access controls.

**Before production deployment, owner should:** In Google Drive open the **original** Aurora’s Cake file > Share > General access > set `Restricted`. Keep only the necessary owner/editor accounts. Verify metadata no longer contains any `anyone` permission. The public website should access catalog data through the Google Apps Script/Netlify endpoint, NOT via a publicly shared Sheet URL. Carefully test that the Apps Script is deployed to execute as its authorized owner and the public catalog still loads after permission removal. The copy operations did NOT change the original file's sharing.

## Staging deployment safety
1. Keep the immutable private backup untouched and the original production sheet unchanged.
2. Use a **separate Apps Script project** for staging; copy the matching Apps Script source files or generated `Code.AllInOne.gs` to it.
3. In the staging project's Script Properties, set `AURORA_SPREADSHEET_ID` to the **private staging copy's ID**. Check the ID is neither the original production ID nor the backup ID.
4. Ensure staging's `AURORA_DATABASE_BACKEND` is `google_sheets`. Do not configure any Supabase/Firebase/D1/R2 storage. Use a distinct staging `/exec` URL and a separate Netlify preview/site with its own `AURORA_SCRIPT_POST_URL` and `VITE_GOOGLE_SHEETS_URL`.
5. Because the staging copy still contains production PII and password hashes, **do not open it to "Anyone with the link" and do not use real customer accounts for tests**. Before writing synthetic records, prepare an explicitly sanitized staging fixture or a private separate test workbook with matching schema; preserve order references and ledgers in the immutable backup.
6. Use `node scripts/check-netlify-sheets-release.mjs https://<verified-private-preview-site>.netlify.app` for read-only GET health and public catalog checks. Release checks alone do not prove COD writes.
7. On sanitized staging data only, run COD create order, repeat same request UUID (expect exactly one order), gift recipient/price privacy, staff role authorization, kitchen transitions, assigned rider delivery, cash-confirmed COD, refunds and inventory edge cases.
8. Validate 100+ active orders and corrupt receipt behavior: old orders preserved, new valid orders visible, warning shown. Never silently delete a corrupt row.
9. Confirm owner sign-in, staff session expiry and revoked credentials; inspect Netlify function logs for private tokens/PII leakage.
10. Check backup restore procedure using a **new** rehearsal copy, never overwrite the real production Sheet. Preserve the previous Apps Script deployment and Netlify deploy for rollback.

## Acceptance criteria before production merge
- [x] Owner confirmed **Restricted** in Google Drive UI; secondary connected Drive account now receives 403. A public read-only GET check confirmed Apps Script can still access 15 product records. Final ACL metadata should be checked by the owner's Google account.
- [x] Private backup metadata and native tab structure confirmed.
- [x] Separate private staging copy metadata and key headers confirmed.
- [x] A new owner-private sanitized staging copy was created; 22 sensitive tabs have their data rows cleared, with the original backup untouched.
- [ ] Distinct staging Apps Script deployment verified to target staging only.
- [ ] Separate Netlify preview configured with staging `/exec`; read-only health and catalog pass.
- [ ] Staging COD, gift, order idempotency and staff permissions pass.
- [ ] Inventory/Refund/Costing/Cash Approval **Google Sheets-only** integration and audit tests pass.
- [ ] Live site permission, backups, rollback and release signatures verified.
- [ ] Review PR #37 with green CI; only then approve a controlled production release.

**Scope of assistant-run work:** backup, staging preparation, read-only verification and sharing the **sanitized staging copy only** with the production Sheet owner. No production orders, settings, Apps Script deployment, Netlify deployment or sensitive source data were modified by these checks. The owner changed the original production file's sharing to Restricted.

## Isolated acceptance preparation
The dedicated sanitized staging Sheet is separate from the older private snapshot containing production account data. A fail-closed Apps Script build generator and a staging-only HTTP COD runner have been added. Deployment still requires a NEW Apps Script project, owner OAuth authorization and a new /exec URL; until that happens, no real COD acceptance is claimed. See docs/ISOLATED_STAGING_COD_DEPLOYMENT_2026-11-04.md.


## Verified production privacy change / live public path (2026-11-05)
- The original owner sent a screenshot of **General access: Restricted**.
- The previously connected secondary Drive account now receives **403 Permission Denied** to the original Sheet, consistent with the intended restriction. This does not by itself prove every Google Drive permission has been removed; review it from the owner's account.
- A GitHub-hosted *unauthenticated, read-only* check successfully reached the production homepage **200** and the existing direct Apps Script public health **200** and public catalog **200** (15 cakes). The catalog field-name privacy guard did not detect sensitive order, session or account fields.
- The live Netlify `/api/public` and `/api/backend-health` URLs currently return **404**. That indicates the newer PR #37 Netlify Functions are not yet active; do **not** claim they have been deployed. Existing web content currently comes from the older direct Apps Script route.
- The **sanitized** staging copy is still not public: it has owner access and one **Editor** permission for the production Sheet owner's account. The separate full backup remains owner-only to its original Drive account.
- Staging deployment remains blocked on creating and authorizing a **new** Apps Script Web App. A protected local Windows PowerShell helper is available at `scripts/bootstrap-private-cod-staging.ps1`. It cannot authenticate to Google without the account owner's interactive OAuth action.
- The read-only workflow `Probe live Netlify after Sheet restriction (GET only)` runs in CI without POSTs; do not treat this as successful COD acceptance.
