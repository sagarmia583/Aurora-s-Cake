# Aurora's Cake — Staff Counter Sales & Thermal POS Receipts (R9)

## What this adds

**Staff Portal → Counter sales** is a separate checkout for walk-in purchases.
It is NOT a fake COD delivery order: no delivery rider, delivery OTP or customer-delivery stage.

- Search active cake variants and build a quantity-adjustable cart.
- Price is re-read from live Google Sheets **on the server** when saving (no client price trust).
- Role permissions: `sales_view`, `sales_create`, `sales_discount`, `sales_history`.
- Cash sale with change due; bKash/Nagad with manually entered TXID/reference.
- Sale requests use a persistent UUID on retry; one authoritative `pos_sales` row and receipt JSON per sale.
- Duplicate bKash/Nagad transaction references for the **same channel** are rejected.
- Last 100 saved sales for authorized history viewers and receipt reprints.
- Browser print stylesheet for **58mm** and **80mm** thermal rolls; print dialog allows printer/PDF selection.
- Shop name/address/phone come from live Settings. No paid POS gateway or service.

**Important:** bKash and Nagad payments are **staff-recorded, not independently gateway-verified**.
The record says `payment_confirmation: staff_attested`; only mark as paid if the cashier
has actually received and verified payment in the respective app/account.

## Data model

Run `setupSheetDatabase()` after replacing your previous Apps Script (backup first).
It adds a **private** `pos_sales` tab with these fields:

`id,sale_number,request_id,request_hash,sold_at,staff_id,staff_name,customer_name,customer_phone,subtotal,discount_amount,total_amount,payment_method,payment_reference,amount_received,change_amount,receipt_json`

Only private authenticated POST actions use the new table:

- `staff_pos_catalog`: permission `sales_view`
- `staff_pos_create`: permission `sales_create` (+ `sales_discount` if discount > 0)
- `staff_pos_history`: permission `sales_history`

Existing delivery/COD order tables and receipts are left unchanged.

## Deployment (not automatic)

1. Back up the live Google Sheet and Apps Script project.
2. Use the updated `apps-script/Code.AllInOne.gs` **alone** in the Script editor, OR use separate modular `.gs` files (including `POSOperations.gs`) without duplicating functions.
3. Run `setupSheetDatabase()` as Sheet owner to create the private `pos_sales` headers.
4. In Staff & Access, enable applicable sales permissions for each cashier. Manager/owner have all; Order Manager has create/history, while discounts require an explicit extra grant.
5. Apps Script: **Deploy → Manage deployments → Edit → New version → Deploy**. Saving or GitHub commits alone do NOT change the live deployment.
6. Deploy the matching web app branch (and same-origin proxy) before opening the Sales tab.
7. Confirm `/api/backend-health` shows `up_to_date: true` with release `aurora-2026-10-27-sales-pos-r9`.
8. On a real Google Sheet, test one cash sale, one bKash/Nagad sale, duplicate-TXID rejection, server price change, payment failures and saved-receipt reprint. The automated tests do not replace live Sheet/browser tests.

## Thermal printer setup

1. On Windows, install the correct manufacturer driver and set the thermal printer paper profile to 58mm or 80mm. Browser printing requires an accessible OS printer.
2. Open Staff → Counter sales → save sale → choose receipt width → **Print / Save PDF**.
3. In the browser's print dialog select the POS printer, disable headers/footers, margins **None**, scale **100%**, and check the paper size.
4. If the printer is Bluetooth-only or an iPhone-only device, browser support varies by the specific hardware/driver. No claim of silent printing, direct ESC/POS, USB/WebUSB or Bluetooth printing is made; test on the target device.

## Accounting and inventory boundaries

Counter receipts are currently kept in a **separate append-only `pos_sales` journal**, so no delivery workflow or rider-held cash is incorrectly credited. R8 `FinancePanel` rider reconciliation does **not yet aggregate POS revenue**. There is no POS refund/exchange UI in this phase.

R8 stock tracks **ingredients consumed at Start Baking**, not ready-for-sale finished cakes. Deducting raw ingredients again when a completed cake is sold would double-charge the recipe inventory, so POS does **not** automatically deduct ingredient stock. A future finished-goods stock ledger can link produced cakes to sold variants and reconcile remaining stock, spoilage, and returns.

## Remaining acceptance / limitations

- Test real 58mm and 80mm hardware across supported browsers. CSS receipt is not ESC/POS printer command data.
- Ensure staff permissions and Google Apps Script deployment both match the frontend release.
- Verify browser preview, printer-specific margins, long item names, Bengali font support and print repeats.
- Add finished-goods inventory and consolidated finance report before treating this as full bookkeeping.
- No live payment verification, cash drawer control, offline checkout or POS stock reservations.
