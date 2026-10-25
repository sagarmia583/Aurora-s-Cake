# Aurora's Cake — Live COD Operations Setup

This is the operational implementation for the **existing Google Sheets checkout**, not a
Supabase migration. All real Customer, Admin, Kitchen, and Delivery actions read/write
the **same private orders tab**. Existing demo Studio panels remain isolated and are
not exposed through the role selector in production.

## Before going live

1. **Back up the spreadsheet.** Never publish or share the private orders tab.
2. **Simplest single-file installation:** Open [`apps-script/Code.AllInOne.gs`](../apps-script/Code.AllInOne.gs), copy its entire contents, and paste it into **one Apps Script `Code.gs` file**. Remove other `.gs` files from that Apps Script project first (except files you intentionally maintain with non-conflicting unique names). This single file already contains the public content API, complete seed data, staff operations, Google customer accounts, live catalog, and custom cake requests. It has exactly one `doGet` and one `doPost`.
   **Alternative for developers:** Install the original six separate files (`Code.gs`, `SeedData.gs`, `StaffOperations.gs`, `CustomerAccounts.gs`, `LiveCatalog.gs`, `CustomCakeRequests.gs`) instead. **Never use the all-in-one source and six separate files together.** Existing private order headers are preserved.
3. In Google Cloud Console, configure the Google OAuth consent screen and create an
   **OAuth Client ID, Application type: Web application**. Add the exact website
   origin(s) (such as `https://your-site.example`) to **Authorized JavaScript
   origins**. In testing mode, add the authorized Google accounts as test users.
4. **Fast owner setup (new, single-file only):** The public Aurora Web OAuth Client ID is already included in `Code.AllInOne.gs` and the React website code. After pasting the single file, select `setupAuroraOwnerOnce` in the Apps Script editor and press **Run** while signed in with the Google account that will administer the shop. Accept Google permissions when prompted. This writes `AURORA_GOOGLE_CLIENT_ID` and `AURORA_STAFF_USERS` for the executing owner **only if no staff list already exists**. It never reads or stores an OAuth Client Secret. Add riders/kitchen managers later in Script Properties. When Apps Script is bound to a different owner account, verify the returned owner email before production use.

5. Alternatively, configure Apps Script **Project Settings → Script Properties** manually:

   ```text
   AURORA_GOOGLE_CLIENT_ID = <the Google OAuth Web client ID>
   AURORA_STAFF_USERS = {"owner@example.com":{"role":"super_admin","name":"Shop Owner"},"chef@example.com":{"role":"kitchen_manager","name":"Chef"},"manager@example.com":{"role":"delivery_manager","name":"Dispatch"},"rider@example.com":{"role":"delivery_man","name":"Rider One"}}
   ```

   Replace these placeholder emails with the actual Google account addresses.
   Do NOT paste an OAuth client secret or staff credential into website code.
   Available roles: `super_admin`, `admin`, `order_manager`,
   `kitchen_manager`, `delivery_manager`, `delivery_man`, `accountant`.
   Staff users not listed here cannot access private orders.
6. Configure your hosting environment:

   ```text
   VITE_GOOGLE_OAUTH_CLIENT_ID = <same public Web Client ID>
   VITE_GOOGLE_SHEETS_URL = <current /exec Apps Script URL>
   # On Vercel Hobby or Netlify Free, optional same-origin browser POST:
   VITE_SHEETS_POST_PROXY = /api/operations
   ```

   On Vercel or Netlify, also configure the **server-side** environment variable
   `AURORA_SCRIPT_POST_URL` to the same trusted Google Script `/exec` URL.
   Vercel uses `api/operations.js`; Netlify uses `netlify/functions/operations.mjs`.
   Read the [Vercel-specific setup](VERCEL_FREE_DEPLOYMENT.md) before deploying.
   Local Vite without a function should leave `VITE_SHEETS_POST_PROXY` empty.

   Then **rebuild/redeploy the website**. The Google OAuth client ID is public;
   Script Properties remain private.
7. Save scripts, run `setupSheetDatabase` if not done, then **Deploy → Manage
   deployments → Edit → New version → Deploy**. An Apps Script file pushed to
   GitHub does NOT update the live Apps Script deployment automatically.
8. Go to **Staff login** on the website and sign in with an authorized Google
   account. The server verifies audience, Google issuer, expiry, verified email
   and private email-role allowlist **for every staff POST**. Tokens stay in
   memory in the tab and are not stored in localStorage.
9. Keep `staff` and `orders` private. The public GET endpoint continues to
   expose only the public catalogue/website settings; staff list and customer
   status lookup require POST. A customer status lookup needs the unpredictable
   receipt ID plus the matching checkout phone. It returns only limited status,
   not address or order items. After dispatch, a **linked** customer signed in with the matching verified Google account can also retrieve their delivery OTP; unverified lookups never return it.

## End-to-end acceptance checklist

- [ ] Place one COD order on the public site; verify exactly one `orders` row
      and matching `order_items` rows, with pending payment.
- [ ] Re-send the SAME checkout request ID: exactly one row remains.
- [ ] Staff login with an unlisted Google account is denied.
- [ ] Admin/order manager confirms the order.
- [ ] Kitchen manager starts baking, then marks it ready.
- [ ] Delivery manager assigns an allowlisted rider Google email.
- [ ] Another rider cannot see, collect or update this delivery.
- [ ] The assigned rider picks up the cake and starts delivery.
- [ ] Customer opens their original saved receipt; the status advances and
      the 4-digit OTP appears **only while out for delivery**. Never share it
      before receiving the cake.
- [ ] Rider must confirm full cash received and enter the matching OTP.
      Failed OTPs lock after five attempts for fifteen minutes.
- [ ] Customer's refreshed receipt shows delivered and paid, with a recorded
      status history.
- [ ] Open **My Google orders**, sign in, explicitly link a device-held COD receipt,
      and recover it on a different device using the same verified Google account.
- [ ] Verify a different Google account cannot claim that linked receipt.
- [ ] At dispatch, the linked customer can retrieve their OTP only with the matching
      Google login, not by using the guest order-status endpoint.
- [ ] Admin changes cake size regular and sale price; a fresh COD checkout uses the
      current Sheet values and the public storefront refreshes.
- [ ] Admin disables ordering: a new COD checkout is rejected server-side.
- [ ] Submit one custom cake quotation request, verify the private
      `custom_cake_requests` row, and retry the same reference without duplication.
- [ ] An authorized order manager saves a quote and customer retrieves the
      latest quotation status from the same request ID and phone.
- [ ] On an old Apps Script deployment, new operations fail clearly rather than
      being mistaken for completed writes.

## Operational and security boundaries

- The Google Sheet is the system of record for live COD orders. Legacy
  `SupabaseSyncModal`, `mockDatabase`, and developer Studio panels are NOT
  live operations; the real Staff Portal is separate.
- The private `custom_cake_requests` Sheet tab stores quotation requests. Staff managers can view, quote or decline them; a quote is NOT a payment or confirmed booking.
- The live shop editor allows approved admins to change product visibility, cake prices and shop/delivery switches in the original Google Sheet. Creating entirely new product/variant records and uploading private photos still uses the Sheet / public image URLs.
- No online bKash/Nagad/card payment verification has been added. Only COD
  payments become paid after a rider explicitly confirms cash and OTP.
- **Customer Google sign-in and recovery are now supported** without paid SMS. A guest can place COD orders without logging in, then explicitly link an original saved receipt to one verified Google account using the original order reference and checkout phone. The owner can restore linked receipts on another device after signing in. Never link someone else's receipt on a shared device.
- This is NOT phone-number OTP login. Without a verified free phone-delivery channel we cannot promise automatic phone-only identity verification.
- Apps Script reads the private order table and caps it at 50,000 rows; only
  the latest 100 authorized orders are displayed. This is suitable for a
  small bakery, not high-volume multi-warehouse dispatch.
- Delivery proof is a 4-digit OTP with limited attempts and a required rider
  cash-confirmation flag. It is not independent proof that physical cash was
  deposited; reconcile COD with the shop's actual cash collection records.
- Running the legacy Supabase SQL migrations alone DOES NOT enable live
  operations. The new SQL security hardening migration is defense-in-depth for
  the old, otherwise unused Supabase backend; review before deploying it.
- GitHub Actions checks TypeScript, existing checkout tests, private operations
  security tests, and production build. A passing CI does NOT replace a manual
  deployed Google OAuth/Apps Script acceptance test.

## No-paid-service operating plan (free quotas apply)

- **Hosting:** Netlify Free is USD 0/month and currently has a hard **300-credit monthly**
  usage limit. You must keep the site on the Free plan; do not enable paid upgrades
  or add-ons. See [Netlify pricing](https://www.netlify.com/pricing/) and
  [Free credit limits](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/).
- **Same-origin fallback:** Vercel Hobby uses `api/operations.js` and Netlify Free uses `netlify/functions/operations.mjs`. They forward only allowlisted POST actions to a fixed HTTPS Apps Script URL, reducing browser CORS/redirect issues. Real-browser tests remain required, and both free tiers have usage limits.
- **Backend:** Google Apps Script + Sheets uses the shop owner's own Google account,
  not Supabase paid compute or a paid hosted server. Google's published consumer
  quotas include **20,000 URL Fetch calls/day**, **6 min per execution**, and
  additional total execution/storage/service limits that can change.
  See [official Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas).
  Each staff/customer Google login verification uses an Apps Script URL Fetch call.
- **Login:** Google's standard Identity Services Web client ID is used for both staff
  and optional customer login; never put an OAuth client secret or service-role key
  into frontend code. You configure the OAuth consent screen and JavaScript origins.
- **Checkout:** Guest phone contact and **cash-on-delivery only**. There is no
  subscription, SMS sender, payment-gateway commission or automated bKash/Nagad
  transaction verification. The shop manually reconciles received COD cash.
- **Custom requests:** Design reference images must be publicly viewable HTTPS links.
  No paid image-upload storage is provisioned. Custom requests are quotations,
  not confirmed payments or orders. Latest reference/phone is saved locally on
  the sending device for the free status lookup.
- **Capacity:** Sheets/App Script quotas make this appropriate for a small local
  bakery, not an unlimited-traffic service. If free quotas are exhausted, the
  service may stop responding until the quota resets; code alone cannot guarantee
  uninterrupted no-cost hosting.
- **Final deployment:** GitHub commits and passing CI do NOT copy files to
  Apps Script or configure OAuth/Netlify settings. Shop-owner Google account
  access is required for these explicit steps; no secrets should be shared publicly.

## Final security-hardening rollout notes

- **New checkout proof is mandatory:** each new COD request must include the browser-generated `checkout_proof`, independent of the visible order ID. Deploy updated frontend and Apps Script together. An outdated browser may need a full refresh after a backend upgrade. Older in-flight legacy retries remain recognized if their original payload matches.
- **OTP is now server-only:** new confirmed checkout receipts have an empty `delivery_otp`. A delivery code is issued when an assigned rider starts delivery, available to the original receipt capability holder or the linked verified Google account, then cleared on delivery or cancellation. Older copies created by previous deployments may still contain previously exposed codes.
- **Receipt ownership:** customer account linking requires the original private receipt access token in addition to the order ID, checkout phone and verified Google login. Do not publish any original receipt or access token.
- **Google login:** Google's token verification response is cached server-side for at most five minutes, within token expiry. Staff permission lookups are not cached. The implementation still depends on Google's tokeninfo verification service; validate the production integration and its availability before launch.
- **Vercel/Netlify same-origin POST fallback:** set `VITE_SHEETS_POST_PROXY=/api/operations` on your hosting site and set server-only `AURORA_SCRIPT_POST_URL` to the same Google Script `/exec` URL. Vercel uses `api/operations.js`; Netlify uses `netlify/functions/operations.mjs`. Leave it disabled in standalone local Vite. Free quotas still apply.
- **Privacy:** signing out removes Google-recovered receipts restored during the current session, but does not delete original guest receipts deliberately stored on the device. Clear browser site data on shared devices.
- **Runtime limits:** Apps Script has no documented dedicated cryptographic random-byte API. This version uses platform-generated UUIDs rather than JavaScript `Math.random()` for receipt keys and dispatch codes, but a launch with stricter security requirements should separately verify the platform's randomness guarantees.
- **Production hold remains:** secure browser POST forwarding, real Google OAuth, a real Google Sheet deployment and a paid-service-free full order-to-delivery acceptance test still require an authorized shop owner to configure and verify those external services.

### Additional verification after upgrade

- Confirm the checkout response contains `delivery_otp: ""` but includes an unpredictable `customer_access_token`.
- Confirm a replay with a visible order number and phone but without the matching original `checkout_proof` does NOT reveal the receipt.
- Confirm account linking without `customer_access_token` returns `forbidden` even with a valid Google sign-in.
- Confirm staff order lists and mutation responses never return `customer_access_token` or `delivery_otp`.
- Confirm the rider cannot mark delivered without the dispatched OTP and actual COD cash confirmation.
- Confirm delivery/cancellation clears OTP and that changing staff roles revokes permissions even during a cached token's lifetime.
- On Vercel or Netlify, verify `/api/operations` rejects requests from other Origins and GET requests, then test a real browser POST through the deployed relay.