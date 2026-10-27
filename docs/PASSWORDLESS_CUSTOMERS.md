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
4. The backend release must be `aurora-2026-10-27-order-details-no-delivery-otp-r4`; visit the preview's `/api/backend-health` to confirm `up_to_date:true`.
5. Test a safe staging COD order from checkout through Owner Confirm > Kitchen Preparing > Ready > Assign Rider > Pickup > Start delivery > Rider handover + Cash collection > Delivered. Validate the buyer sees order details by phone after refresh, and neither rider nor customer needs an OTP.
6. The previous deployed backend version still requires OTP and will reject the new rider request; **do not roll out the OTP-free interface into production without upgrading the Apps Script endpoint first**.

This workflow retains free-tier Google Apps Script/Vercel limits. Browser/real-Sheet acceptance testing is required before claiming production-ready.
