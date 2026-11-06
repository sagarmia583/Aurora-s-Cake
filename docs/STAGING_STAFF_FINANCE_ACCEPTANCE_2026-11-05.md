# Isolated staging: Staff → Kitchen → Rider → COD

Date: 2026-11-05. Database: **Google Sheets only**. Netlify production and original Sheet must remain untouched.

## Verified starting state
One synthetic COD order exists, pending, BDT 360; its one item is recorded. The staging staff_accounts and auth_sessions tabs have no data rows. Inventory, refund, rider cash deposit and cost snapshot ledgers are currently empty.

## Step 1. Secure the EXISTING staging Apps Script deployment

The previously deployed staging backend includes a **critical insecure first-login admin bootstrap**. Replace the existing isolated staging project with the newer hardened generated code before sending any staff credentials. It blocks anonymous first-admin signup and requires an owner-only one-time editor setup. Use the same isolated staging Sheet and existing separate clasp project; do NOT use the production project.

From Windows PowerShell, project root:

~~~powershell
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/sagarmia583/Aurora-s-Cake/fix/netlify-google-sheets-only-20261104/scripts/prepare-staging-apps-script.mjs" -OutFile ".\scripts\prepare-staging-apps-script.mjs"
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/sagarmia583/Aurora-s-Cake/fix/netlify-google-sheets-only-20261104/scripts/accept-staging-staff.mjs" -OutFile ".\scripts\accept-staging-staff.mjs"
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/sagarmia583/Aurora-s-Cake/fix/netlify-google-sheets-only-20261104/scripts/run-staging-staff-acceptance.ps1" -OutFile ".\scripts\run-staging-staff-acceptance.ps1"
node .\scripts\prepare-staging-apps-script.mjs --sheet-id "<SANITIZED_STAGING_SHEET_ID>"
cd .aurora-staging-apps-script
clasp.cmd push
~~~

This overwrites the code of the previously CREATED **isolated staging project**, not any live production project. Check its own clasp project link before approving. In the staging Apps Script editor: **Deploy > Manage deployments > Edit (pencil) > Version: New version > Deploy**. Do not update the production Web App. Reuse the staging /exec URL if the same deployment is updated, otherwise use the new staging /exec URL.

## Step 2. Authorize the first administrator privately
In the **staging Apps Script editor** open **Project Settings > Script properties** and add a temporary value named **AURORA_STAGING_OWNER_PASSWORD**. Choose a *new unique* password 16+ characters, with uppercase, lowercase, number and symbol. Never use the Gmail or production account password.

Select **setupAuroraStagingOwnerOnce** from the editor function list and click **Run**, authorizing Google if asked. The function verifies the editor owner, validates the isolated staging Sheet, refuses existing accounts, hashes the secret into a staff_accounts row for username **admin**, and removes the temporary Script Property. Confirm the property has disappeared. Never send password, session tokens, .clasp.json, or Script Properties to GitHub or chat.

## Step 3. Run authenticated Staff acceptance
Return to the project root via PowerShell (cd ..), then run GET-only preflight:

~~~powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\run-staging-staff-acceptance.ps1" -Url "<STAGING_EXEC_URL>" -SheetId "<SANITIZED_STAGING_SHEET_ID>" -OrderId "ord_8e42ea25-120e-4e48-a0f3-9ed18ecf7e9f" -ExpectedTotal 360
~~~

It must report mode=preflight, isolated_staging=true, hardened_staff_auth=true.

To run the REAL isolated staged transitions, append **-Commit** to the same command. The PowerShell helper requires typing RUN-STAGING-STAFF and prompts for the staging admin password using hidden input. It creates temporary Order Manager, Kitchen, Delivery Manager, Rider and Accountant accounts with random passwords, runs permission-denial checks and transitions Pending > Confirmed > Preparing > Ready > Assigned > Picked Up > Out for Delivery > Delivered, checks that an unconfirmed COD collection is rejected, verifies paid BDT 360 and deactivates test accounts.

Never rerun -Commit after a partial failure without first inspecting the staging rows; the earlier stages may have saved successfully. This is NOT an automatically reversible database transaction.

## Step 4. Independently read back the Google Sheet
In private staging Sheet, verify **exactly one orders row** is marked Delivered and Paid, receipt JSON cod_collected=true, cash amount BDT 360, and one matching order_items row. Confirm actor history and that temporary Staff accounts are inactive.

Important: a rider's cod_collected flag is an **acknowledgement**, not an independent cash deposit and approval. Rider_cash_deposits must remain empty unless a separately approved cash handover was performed.

## Inventory, Refund and Accounting readiness — NOT yet live accepted
- inventory_items and inventory_movements exist as Sheet tabs, but the staging stock journal is empty.
- refund_returns contains headers but no refund requests, approval or settlement rows.
- order_cost_snapshots and item_costings contain headers but no production cost entries.
- rider_cash_deposits is empty; the current staff stage API does NOT implement independent cash handover approval.
- Native FinanceModule still uses Expo SecureStore/device-local demo expenses and accounts. Such values are NOT a Google Sheets source-of-truth financial ledger.
- Older unmerged PR #4 contains partially implemented ledger modules, but integration, role review and real staging acceptance are missing.

Thus Inventory, Refund and Accounting remain open. After real staff acceptance, wire the audited Google Sheets ledger modules and test stock idempotency, recipe cost freeze, independent refund approval, separate rider cash handover and second-person approval, cash balances and POS settlement. Do not mark those features complete or merge production PR #37 before then.

All production data and deployment must remain unchanged.


## Safe one-command upgrade for the previously created staging project

Verified status on 2026-11-05: the sanitized staging Sheet still has one BDT 360 Pending COD order and no staff_accounts or auth_sessions records. Do not merge into or replace the existing production Sheet.

The repository includes scripts/upgrade-existing-staging-safe.ps1, which checks the local .clasp.json project ID against the owner's expected STAGING project ID, blocks the production Sheet ID, regenerates the hardened staging Code.gs, and requires the typed confirmation UPDATE-ONLY-STAGING before clasp push.

From the root of the existing Windows project folder, update these scripts from the reviewed staging branch:

~~~powershell
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/sagarmia583/Aurora-s-Cake/fix/netlify-google-sheets-only-20261104/scripts/prepare-staging-apps-script.mjs" -OutFile ".\scripts\prepare-staging-apps-script.mjs"
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/sagarmia583/Aurora-s-Cake/fix/netlify-google-sheets-only-20261104/scripts/upgrade-existing-staging-safe.ps1" -OutFile ".\scripts\upgrade-existing-staging-safe.ps1"
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/sagarmia583/Aurora-s-Cake/fix/netlify-google-sheets-only-20261104/scripts/accept-staging-staff.mjs" -OutFile ".\scripts\accept-staging-staff.mjs"
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/sagarmia583/Aurora-s-Cake/fix/netlify-google-sheets-only-20261104/scripts/run-staging-staff-acceptance.ps1" -OutFile ".\scripts\run-staging-staff-acceptance.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\upgrade-existing-staging-safe.ps1" -SheetId "<SANITIZED_STAGING_SHEET_ID>" -ExpectedScriptId "<EXISTING_STAGING_SCRIPT_ID>"
~~~

This upgrades source ONLY. The owner then chooses Deploy > Manage deployments > Edit > New version in the existing STAGING Apps Script web app, never in production. Next, create a strong temporary Script Property AURORA_STAGING_OWNER_PASSWORD and run setupAuroraStagingOwnerOnce directly from the staging script editor to create the first owner. The temporary property is deleted on successful creation. Do not share the password.

The latest staff acceptance runner now attempts to deactivate every temporary staff account on both successful completion and partial failure; it reports an incomplete cleanup rather than hiding it. A partially applied stage transition cannot be undone automatically. Verify staging Sheet status before retrying any failed -Commit.

Once the Staging Web App has hardened_staff_auth in its health result and the one-time owner exists, run the read-only staging staff preflight first. The full authenticated test only follows after the owner explicitly authorizes -Commit.

Independent cash deposit approval, refunds, inventory movements and production-cost snapshots remain separate unimplemented or unaccepted workflows and cannot be certified by this single delivery test.

## Admin login recovery after invalid_credentials (2026-11-06)
The first Staging Staff -Commit stopped before creating roles because the admin login returned invalid_credentials. Private Sheet readback confirmed exactly one ACTIVE admin/super_admin with failed_attempts=1, locked_until=0, zero auth sessions and the original BDT 360 COD order PENDING. The first terminal attempt was only a rejected confirmation containing extra leading whitespace.

Do not guess passwords repeatedly (five failures can lock the account for 15 minutes). The updated staging generator adds an owner-only editor function resetAuroraStagingOwnerPasswordOnce. It is NOT routed through doPost or doGet, refuses production Sheet bindings and duplicate/inactive/non-super-admin accounts, rotates the password salt/hash, resets failed attempts, revokes staff sessions, and removes its temporary Script Property.

From the project root, download the updated file from GitHub and regenerate the *existing isolated staging project only*:

~~~powershell
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/sagarmia583/Aurora-s-Cake/fix/netlify-google-sheets-only-20261104/scripts/prepare-staging-apps-script.mjs" -OutFile ".\scripts\prepare-staging-apps-script.mjs"
node .\scripts\prepare-staging-apps-script.mjs --sheet-id "<ISOLATED_STAGING_SHEET_ID>"
cd .aurora-staging-apps-script
clasp.cmd push
~~~

Confirm that .clasp.json links only to the previously created STAGING project before approving push. The deployed /exec version does not need another deployment for this editor-only reset: the login reads the password hash from the same isolated staff_accounts Sheet row.

In the STAGING Apps Script editor open Project Settings > Script properties. Add the property AURORA_STAGING_OWNER_RESET_PASSWORD with a brand-new, unique, strong password (16+ characters, uppercase/lowercase, digit and symbol; no leading/trailing whitespace). Save. Return to the editor, select resetAuroraStagingOwnerPasswordOnce, then Run exactly once. Expected return: ok:true, reset:true, secret_deleted:true. Confirm the reset property is gone. Do NOT copy the password into chat or terminal commands.

Afterward return to the project root with cd .. and run GET-only Staff preflight. Only after a successful health check run the one-time authorized -Commit acceptance command, using the NEW password in the hidden PowerShell prompt. Never repeat a partially failed -Commit without checking the isolated Sheet.

The wrapper now accepts harmless surrounding whitespace in RUN-STAGING-STAFF but still requires that exact confirmation.
