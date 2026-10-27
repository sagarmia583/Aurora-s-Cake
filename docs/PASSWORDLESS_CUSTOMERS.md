# Aurora's Cake — Customer Order Details and OTP-free Delivery

## Customer order panel

- Customer enters only their Bangladeshi phone number and taps **Track Orders**.
- Each returned order card opens a **View progress & actions** panel with current status, progress timeline, itemized cake/variant/flavor, quantities, unit price, subtotal, delivery fee, discount, total, COD payment status, delivery date and time slot, and a **Refresh status** action.
- Data comes from the private Google Sheet when the lookup runs. Up to 10 recent matching orders are displayed.
- The lookup returns only deliberately selected fields, never the raw private receipt, customer name, phone number, exact delivery address, private cake-writing message, original order UUID, receipt key or delivery OTP.
- The same browser's securely held private checkout receipt can show additional customer/recipient detail in **Full receipts saved on this device**.
- Phone alone does not prove identity, so anyone who knows a phone number can see these non-address purchase details. To expose private details across devices, implement actual identity verification first.
- Local storage keeps the checkout phone and retained receipts; a page refresh should not erase Google Sheets order history.

## Delivery change — OTP removed

- The server does **not** issue a delivery OTP at Start delivery.
- Only the **signed-in, assigned delivery rider** can change `out_for_delivery` to `delivered`.
- The rider must explicitly confirm `package_handed_over: true` and, for COD, `cash_collected: true`. The backend validates both, records the status in the order history and marks COD paid.
- OTP is removed from the Web Staff Panel, customer tracker, demo rider screens and native staff mobile interface.
- Customer tracking never includes a delivery OTP even for previously linked Google/phone accounts. Existing stored legacy codes are cleared at Start delivery/Deliver/Cancel.
- An unauthorized user, the wrong rider, or a delivery without handover/cash confirmation must not be able to mark Delivered.

## REQUIRED: Deploy the new Google Apps Script version

**A GitHub/Vercel preview deployment does NOT publish an updated Apps Script Web App.**

1. Backup the owner's actual Google Sheets `orders`, `order_items`, customer and staff tables.
2. Copy all of `apps-script/Code.AllInOne.gs` from branch `feat/passwordless-customer-order-panel` to the current Apps Script project's single `Code.gs`. Do not leave duplicate old modules alongside it.
3. **Deploy > Manage deployments > Edit > New version > Deploy**, retain the existing `/exec` URL.
4. The backend release must be `aurora-2026-10-27-audit-hardening-r7`; visit the preview's `/api/backend-health` to confirm `up_to_date:true`.
5. Test a safe staging COD order from checkout through Owner Confirm > Kitchen Preparing > Ready > Assign Rider > Pickup > Start delivery > Rider handover + Cash collection > Delivered. Validate the buyer sees order details by phone after refresh, and neither rider nor customer needs an OTP.
6. The previous deployed backend version still requires OTP and will reject the new rider request; **do not roll out the OTP-free interface into production without upgrading the Apps Script endpoint first**.

This workflow retains free-tier Google Apps Script/Vercel limits. Browser/real-Sheet acceptance testing is required before claiming production-ready.

## New customer store + finance features (R5)

- Each previous phone-search order opens a single dedicated tracker, with a back-to-order-list action and independent progress, cake items, prices and timestamps. It is not a private full-receipt login.
- Removed the "Keep your private recovery receipt" callout in the main tracking modal.
- Cart footer has **Order Now**, opening the existing secure checkout (no payment bypass).
- Homepage shows active coupons and the "Use code" control opens checkout with that coupon; Google Sheets remains the final coupon validator.
- Product cards show discount badges, original prices and sale prices. The backend computes the same price for each size: a size-specific sale overrides the product-base markdown; otherwise the amount reduced from product `base_price` to `sale_price` is deducted from that size. A product's price shown at checkout is the authoritative server price.
- The **Cash & costs** Staff tab contains two PRIVATE Sheets, created by `setupSheetDatabase()` without clearing other records:
  - `rider_cash_deposits`: every confirmed physical rider cash handover is posted as a DEBIT against that rider's COD collected balance. A stable request ID prevents double debit on retry; an amount larger than outstanding cash is rejected.
  - `cake_cost_items`: add ingredient, packaging and labour unit costs for each product/variant; total recipe cost and estimated margin are calculated in staff UI. This is an estimated recipe costing tool, not ingredient stock accounting or an audited net profit statement.
- Only authenticated Super Admin/Admin can record cash deposits and edit costing. Accountant can view the private ledger. Rider cannot create his own debit transaction.
- **Important**: Existing production Google Sheets need the two new private tabs/headers; after backup, run `setupSheetDatabase()` on the new backend, then **Deploy > Manage deployments > Edit > New version**. No cash deposits are deducted just by opening a page; an administrator must confirm the rider's physical deposit.

## Migration verification

1. Confirm updated `/api/backend-health` reports release `aurora-2026-10-27-audit-hardening-r7`.
2. With test COD orders, mark one Delivered by the assigned rider and verify credit; record one cash deposit and ensure Remaining decreases by EXACTLY the amount. Replay the same request and confirm only one deposit row.
3. Enter one test ingredient cost, retry once, check only one cost entry; archive it, check the revised cost.
4. Create a product with base price and sale price, verify the storefront badge, size checkout estimate and server-confirmed actual price match.
5. Create an active coupon and confirm it appears on the homepage and can be applied in checkout.
6. Verify a previous order opens independently and that no private full address or order access key appears through phone-only search.

Do not merge/deploy production web changes before backend R5 is live and test workflow passes on a backed-up staging/test Sheet.

## Owner-Controlled Staff Access (R6)

- The owner opens **Staff & access → Create new employee** and chooses Manager / another role. Role defaults are preselected as editable checkboxes for: order view/confirm/cancel; kitchen; rider assignment, pickup/start/completion; custom cakes; customer lookup; catalog view/edit/archive; finance read/write.
- A new Manager has every *operational* capability, including COD delivery, kitchen, public catalog, finance, customer lookup, and quote management. **Owner-only staff account/password/permission administration remains protected.**
- Existing username/password staff accounts show **Edit access**. The owner can grant or remove each capability. All changes are validated and saved to the private Google Sheets `staff_accounts.permissions` column. Previous sessions are revoked so removed privileges do not persist.
- Backend enforces every allowed action; hiding a button is never security. The authenticated manager may be included in the rider list and can assign a delivery to themselves; **pickup/start/deliver require that exact order to be assigned to the actor**. Handover confirmation and COD cash collection remain mandatory, no OTP.
- Staff with no customer lookup access cannot read customer phone/address from unrelated orders. An assigned rider retains essential delivery contact details.
- For compatibility, previously created staff accounts with an empty `permissions` cell keep their original role defaults. New staff have explicit grants. `manager` always has full operational permissions.
- A Google-allowlisted owner's role remains controlled by Apps Script Script Properties, not the staff editor.

### Required safe migration

1. Back up the private Google Sheet.
2. Replace the old Apps Script deployment code with `apps-script/Code.AllInOne.gs` R6, removing other duplicate legacy modules in that editor.
3. **Run `setupSheetDatabase()` in the Apps Script editor while signed in as the owner.** It adds the `permissions` header to existing `staff_accounts`, preserving saved employee rows and credentials; creates missing finance tables. Verify the returned report.
4. **Deploy > Manage deployments > Edit > New version > Deploy**.
5. Open backend health and confirm `up_to_date:true` on R6; test a kitchen employee denied from assigning delivery, owner granting it and old session revocation, and a manager assigned to their own test COD order completing the full workflow.
6. Deploy the corresponding web/mobile version once backend R6 is confirmed. A preview or GitHub merge alone never deploys Apps Script.

Do not give untrusted staff Manager role: it includes cash accounting and catalog management. Only the Owner can manage staff accounts and access grants.

## R7 deep-audit corrections

1. **Pricing**: invalid free/zero-price size-sale values and base-price markdowns exceeding a cake size now fail at checkout. Live CMS rejects active products without positive prices and zero/negative sale prices. Storefront ignores an invalid sale rather than advertising a free cake. A real eligible coupon may still reduce the **total** to a delivery fee only.
2. **Production-safe checkout**: a published site no longer substitutes a device-only demonstration order when Google Sheets ordering is unavailable. Cart, navbar, coupon and mobile routes use a connected live checkout guard. In development, mock orders are still available and are explicitly labeled as such.
3. **Historical tracking**: phone-only history is paginated with `next_cursor` and Load earlier orders; it no longer stops permanently at ten. The client validates cursor shape. Refreshed selection uses masked reference plus creation timestamp instead of list position. Phone-number lookup is intentionally NOT identity verification; item/price/date visibility to anyone knowing the phone number remains a **user-requested privacy tradeoff**.
4. **Coupon integrity**: `usage_count` is reconciled from committed, noncancelled coupon-bearing orders under the order lock, including after retries and cancellation. With older sheets missing the column it skips reconciliation, preserving existing data. Checkout clears applied coupon if edited or no longer eligible. Homepage can expand beyond six coupons.
5. **Staff privacy**: employees without `customers_lookup` cannot view name, phone, address, or private delivery notes in unassigned order list or mutation responses; assigned riders retain delivery contact details needed for service. View-only CMS screens now disable Create/Save/Image Upload inputs.
6. **Delivery slot**: conventional 12h/24h delivery ranges that have already ended in `Asia/Dhaka` on today's date are rejected. Unstructured, non-time-parsable slot labels still require manual shop policy/capacity rules.
7. **Cash correction**: admin with `finance_edit` can void a mistaken deposit with a mandatory 8–300 character reason. The old row is retained with `voided_at`, `voided_by`, `void_reason`, and no longer reduces rider outstanding cash. Repeated voids return `already_voided`. This is an accounting **correction**, not a reversal of a real bank transfer.
8. **Migration**: backup and run `setupSheetDatabase()` to add 3 cash-deposit audit columns to an existing `rider_cash_deposits` tab before enabling corrections. No existing cash row is deleted. Publish a new Apps Script Web App version and check R7 `/api/backend-health` before web rollout.

### Not yet production-verified or fully implemented

- Any actual Apps Script / Google Sheets live checkout, customer privacy pen-test, slow network or mobile-device end-to-end acceptance test.
- Real-time rider GPS, delivery-slot capacity booking / staff shifts, refund and return accounting, per-order historical cost snapshot, stock inventory, independent two-person cash settlement approval, reconciliation to bank statements or a full double-entry accounting system.
- Phone-only tracking cannot securely disclose full private receipt/address to a device that merely knows the phone number without additional ownership verification. Do not weaken this.
- Public tracking still reads several entire Google Sheets columns per lookup; large-scale indexing, performance and Google Apps Script quotas require real load testing.
- Old Google Sheet orders without full receipt JSON may have limited historical item details. Existing saved rows are not rewritten automatically.
- Existing `customer_phone_signup/login/password` legacy routes remain for backwards compatibility, even though the current no-password customer interface does not use them. Removing these and migrating any real accounts requires a separate verified data migration.

Do not merge PR #4 into Production before R7 deployment to a backed-up/staging Sheet and controlled live acceptance tests.
