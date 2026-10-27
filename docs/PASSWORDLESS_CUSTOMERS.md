# Aurora's Cake — Password-free, phone-only order tracking

## Customer experience

- **My Order Panel** shows **My Orders** and **My Details**, with no customer account password or login.
- **Track Orders** accepts only an 11-digit Bangladesh mobile number; no order ID or private key required.
- The backend searches the private Google Sheet's orders by normalized checkout phone. It returns up to 10 recent matching orders with only **masked order reference**, **status**, **created**, and **updated** timestamps.
- Checkout phone is saved on the device, so reopening Track or My Orders after refreshing starts an updated lookup from Google Sheets. Full receipts are also loaded from browser storage immediately at app startup.
- Phone-only search never returns full order ID, name, address, item details, amount, private receipt key or delivery verification OTP. The original private receipt on the same device can still show full detail and OTP.

## REQUIRED: Deploy updated Google Apps Script manually

GitHub pushes and Vercel preview deployments do NOT update the existing Apps Script /exec endpoint.

1. Back up the live private Google Sheet, including orders and order_items.
2. Copy the COMPLETE current apps-script/Code.AllInOne.gs into the Apps Script project's Code.gs. Remove duplicate old modules, or alternatively deploy the modular Code.gs and updated StaffOperations.gs together with dependencies.
3. Select Deploy > Manage deployments > Edit > New version > Deploy. Retain the same /exec URL. No Sheet schema changes are required.
4. On a Preview, check a permitted COD test order by phone number only, refresh the page, and check again.
5. Check a missing phone and an invalid phone. Verify that the anonymous network response contains no address, payment amount, receipt token or OTP.
6. Verify full private receipt status refresh and delivery OTP after dispatch. Production requires an independently verified live acceptance test.

## Privacy and limits

Phone alone is not proof of phone ownership. Anyone who knows a mobile number can discover whether there are recent orders and basic delivery progress. This is the requested no-password trade-off. Results are minimal, capped at 10 latest orders, and rate-limited to 15 lookups per phone per 10 minutes via Google CacheService. Rate limiting cannot fully prevent all enumeration.

Old customer password data and backend account functions have not been destructively deleted. Staff authentication stays separate and unchanged.