# Aurora’s Cake — isolated staging Apps Script + real COD acceptance

## Actual current state
- Google Sheets is the only database; Netlify is the intended hosting platform.
- An owner-private isolated test Google Sheet exists. Its original nonpublic order, staff, session, customer, refund, expense and review values were cleared while public catalogue and 37 tab headers/structure were retained. The production Sheet and private full backup remain unchanged.
- A separate staging Apps Script Web App has NOT been deployed. No real HTTP COD test has run yet, because the available Google Drive connection cannot create Apps Script projects, authorize Apps Script deployments or mint their /exec URLs.
- No production credentials, Sheet IDs, staging IDs, script tokens or external web app endpoints belong in public GitHub.

## One-time staging Apps Script deployment (Windows PowerShell)
Use a LOCAL checkout of the PR branch. The following script creates a fail-closed Code.gs from the current single-file bundle and embeds the private sanitized staging Sheet ID locally. It cannot target the original production Sheet.

~~~powershell
git fetch origin
git checkout fix/netlify-google-sheets-only-20261104
npm ci
node scripts/build-apps-script.mjs --check
node scripts/prepare-staging-apps-script.mjs --sheet-id "<PRIVATE_SANITIZED_STAGING_SHEET_ID>"
npm install -g @google/clasp
clasp login
cd .aurora-staging-apps-script
clasp create --type standalone --title "Aurora Cake - ISOLATED COD STAGING"
clasp push
~~~

Important: create a **NEW** Apps Script project. Do not paste or reuse production .clasp.json or an existing deployment ID. The generated folder is ignored by Git. It writes Code.gs and appsscript.json. The staging script hardcodes the sanitized Sheet ID; it refuses mismatched Script Properties, refuses a non-Google-Sheets database, disables staging new-order push notifications, and does not generate production receipt-view links.

Open the **NEW** project in Apps Script. Choose Deploy > New deployment > Web app; set Execute as: Me (the Sheet owner), Who has access: Anyone, then authorize it. Record the newly created **staging-only** /exec URL. Keep the sanitized Google Sheet Restricted/private. The web app can run as its authorized owner without making the Sheet itself public.

Authoritative deployment documentation:
https://developers.google.com/apps-script/concepts/deployments
https://developers.google.com/apps-script/guides/clasp

## Real COD acceptance (separate from Netlify)
First, run the zero-write health/catalog preflight:

~~~powershell
cd ..
node scripts/accept-staging-cod.mjs --url "<NEW_STAGING_EXEC_URL>" --sheet-id "<PRIVATE_SANITIZED_STAGING_SHEET_ID>"
~~~

It refuses all production endpoints without a special staging health marker and a fingerprint matching the specified Sheet ID. A successful preflight is not a COD test.

Then intentionally submit **one synthetic gift/COD order**, replay its exact UUID, attempt a different payload with the same UUID (must be rejected), and read private order status with the returned capability:

~~~powershell
node scripts/accept-staging-cod.mjs --url "<NEW_STAGING_EXEC_URL>" --sheet-id "<PRIVATE_SANITIZED_STAGING_SHEET_ID>" --commit
~~~

The runner prints only a test order reference and total, not bearer credentials. It uses synthetic customer/recipient details and states "DO NOT DELIVER" in the note. Afterward use private Google Sheets to verify exactly ONE matching row in orders and a single order-item row. Even a successful HTTP retry must NOT substitute for private Sheet row-count verification.

## Release acceptance / safety
- [x] Owner-private backup exists and is unchanged.
- [x] Isolated private COD testing Sheet with 37 original tabs, cleared private data rows and preserved catalogue exists.
- [x] Fail-closed staging Code.gs generator and staging HTTP acceptance runner added to PR #37.
- [ ] New Apps Script project created and a *staging* /exec URL verified.
- [ ] GET health shows environment=staging, Sheets-only and matching Sheet fingerprint.
- [ ] Real gift/COD staging order saved and private status recovered.
- [ ] Exact UUID retry returns same order and conflicting retry is rejected.
- [ ] One order + one item verified independently in private Sheet.
- [ ] Staff roles, fulfillment, rider cash collection, refund and POS acceptance separately tested.
- [ ] Production original Google Sheet access changed from link-reader to Restricted.
- [ ] Netlify staging preview checked separately with staging-only /exec URL.

No production Sheet, Netlify site or live Apps Script deployment was modified. Do not merge PR #37 to production before these checks pass.
