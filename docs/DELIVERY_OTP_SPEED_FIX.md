# Aurora's Cake — Delivery OTP & Speed Fix (Vercel + Apps Script)

## What changed

- **Customer Tracking:** checks the selected confirmed order every **12 seconds** while visible, refreshes on focus, adds **Refresh now**, last checked time, and a visible connection error instead of silently showing stale status.
- **OTP:** server issues the four-digit code only at the authorized rider's `Start delivery` transition. Only the original private checkout receipt holder, a linked Google customer or a linked **phone+password customer** may read it. No code leaks into a public catalog or Staff/Rider queue. It disappears on delivery/cancellation.
- **My orders:** active phone-account histories refresh while open and show the OTP once the status becomes `out_for_delivery`. Linked Google account history also displays the code after a manual refresh.
- **Rider speed:** order status changes update locally from the confirmed server mutation response; a secondary full-list fetch no longer blocks delivery-step feedback. Active Staff dashboards poll every 12 seconds, avoiding overlapping requests and background-tab polling.
- **Google Sheets speed:** the status endpoint now reads only the ID column, private receipt cell and headers instead of scanning all columns of every private order. Staff list reads only the receipt JSON column. Other private Sheets remain unexposed.
- **Storefront speed:** `/api/public` is a new **read-only Vercel Function** with a 20-second edge cache, avoiding the browser's slow CORS/JSONP redirect fallback. No payment gateway, no new paid services, and no private data via this endpoint.
- **Catalog refresh:** throttles unnecessary rereads when switching tabs or refocusing the browser.

## Required manual Apps Script update

**These source changes are not yet on the owner's live Apps Script deployment.**

1. Back up the current Google Spreadsheet.
2. Open [latest one-file Code.gs](../apps-script/Code.AllInOne.gs). Copy **all** contents into your existing Apps Script project's one `Code.gs`, replacing the old code. Do **not** install parallel old module copies.
3. Save. The current Sheet's orders and account tables should remain intact. `setupSheetDatabase()` is only needed if required tables or columns are missing; back up before using it.
4. **Deploy → Manage deployments → Edit → Version: New version → Deploy**. Keep the same configured `/exec` URL.
5. Verify `/exec?action=health`, then return to the **Draft PR Vercel Preview**, hard refresh the page and sign in.

## Real end-to-end acceptance test

Use an explicitly marked test COD order on the owner's own staging/test Sheet if possible; **do not use a real customer's order**:

1. Place a test guest COD order from the Preview, verify it appears once in private `orders` / `order_items`.
2. Super Admin approves (Confirm), Kitchen marks Baking → Ready.
3. Delivery Manager or Admin assigns a **registered active rider** to the order.
4. That rider signs in with their own authorized username/password or authorized legacy Gmail, taps **Pick up cake**, then **Start delivery**.
5. Open the original customer receipt in the Preview. Under My Orders or Track order, press **Refresh now**. Verify status is `Out for Delivery` and the 4-digit OTP is visible only on that customer's device/account.
6. Confirm a different customer account cannot obtain the OTP. The Rider screen itself never receives the OTP.
7. Rider enters the customer's OTP only after handing over the package and confirming full **cash received**; only then does status become `Delivered`.
8. Refresh the Customer receipt: code disappears after delivery, and the confirmed timeline/payment status update. Check private Sheet records once.
9. Sign in from a second device with the owner's linked phone account; its order history and delivery status should match.

**If an OTP is missing:** Confirm backend Web App is the latest version, the order is actually `out_for_delivery`, the customer holds the original `customer_access_token` or owns the linked Google/phone account, and the Vercel Preview uses the updated branch. The Customer tracking UI now exposes request errors for diagnosis. The browser Network tab can show the POST status code for `/api/operations` without revealing payload/OTP.

## Remaining limitations

- Google Apps Script cannot be redeployed from GitHub or Vercel merely by pushing code: the owner must publish the new Script version.
- Automated tests and read-only Preview API checks passed, but the live OTP/CDO end-to-end browser test has not been performed with a real owner/staging Sheet account.
- Polling is not instant/push; Google Apps Script/Sheets and Vercel Hobby have usage limits. Background tab requests pause intentionally.
- No SMS OTP is sent. The delivery OTP is an on-site code visible in the authenticated/receipt-owning customer's order UI.
