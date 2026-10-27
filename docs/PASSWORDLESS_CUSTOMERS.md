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
4. The backend release must be `aurora-2026-10-27-cash-cost-coupons-r5`; visit the preview's `/api/backend-health` to confirm `up_to_date:true`.
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

1. Confirm updated `/api/backend-health` reports release `aurora-2026-10-27-cash-cost-coupons-r5`.
2. With test COD orders, mark one Delivered by the assigned rider and verify credit; record one cash deposit and ensure Remaining decreases by EXACTLY the amount. Replay the same request and confirm only one deposit row.
3. Enter one test ingredient cost, retry once, check only one cost entry; archive it, check the revised cost.
4. Create a product with base price and sale price, verify the storefront badge, size checkout estimate and server-confirmed actual price match.
5. Create an active coupon and confirm it appears on the homepage and can be applied in checkout.
6. Verify a previous order opens independently and that no private full address or order access key appears through phone-only search.

Do not merge/deploy production web changes before backend R5 is live and test workflow passes on a backed-up staging/test Sheet.
