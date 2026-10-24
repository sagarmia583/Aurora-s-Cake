# Aurora's Cake — Live COD Operations Setup

This is the operational implementation for the **existing Google Sheets checkout**, not a
Supabase migration. All real Customer, Admin, Kitchen, and Delivery actions read/write
the **same private orders tab**. Existing demo Studio panels remain isolated and are
not exposed through the role selector in production.

## Before going live

1. **Back up the spreadsheet.** Never publish or share the private orders tab.
2. Copy all six current Apps Script files into the SAME script project:
   `apps-script/Code.gs`, `apps-script/SeedData.gs`,
   `apps-script/StaffOperations.gs`, `apps-script/CustomerAccounts.gs`,
   `apps-script/LiveCatalog.gs`, and `apps-script/CustomCakeRequests.gs`. Keep only one `doPost` and `doGet`
   implementation. Existing private order headers are preserved.
3. In Google Cloud Console, configure the Google OAuth consent screen and create an
   **OAuth Client ID, Application type: Web application**. Add the exact website
   origin(s) (such as `https://your-site.example`) to **Authorized JavaScript
   origins**. In testing mode, add the authorized Google accounts as test users.
4. In Apps Script **Project Settings → Script Properties** set:

   ```text
   AURORA_GOOGLE_CLIENT_ID = <the Google OAuth Web client ID>
   AURORA_STAFF_USERS = {"owner@example.com":{"role":"super_admin","name":"Shop Owner"},"chef@example.com":{"role":"kitchen_manager","name":"Chef"},"manager@example.com":{"role":"delivery_manager","name":"Dispatch"},"rider@example.com":{"role":"delivery_man","name":"Rider One"}}
   ```

   Replace these placeholder emails with the actual Google account addresses.
   Do NOT paste an OAuth client secret or staff credential into website code.
   Available roles: `super_admin`, `admin`, `order_manager`,
   `kitchen_manager`, `delivery_manager`, `delivery_man`, `accountant`.
   Staff users not listed here cannot access private orders.
5. Configure your hosting environment:

   ```text
   VITE_GOOGLE_OAUTH_CLIENT_ID = <same public Web Client ID>
   VITE_GOOGLE_SHEETS_URL = <current /exec Apps Script URL>
   ```

   Then **rebuild/redeploy the website**. The Google OAuth client ID is public;
   Script Properties remain private.
6. Save scripts, run `setupSheetDatabase` if not done, then **Deploy → Manage
   deployments → Edit → New version → Deploy**. An Apps Script file pushed to
   GitHub does NOT update the live Apps Script deployment automatically.
7. Go to **Staff login** on the website and sign in with an authorized Google
   account. The server verifies audience, Google issuer, expiry, verified email
   and private email-role allowlist **for every staff POST**. Tokens stay in
   memory in the tab and are not stored in localStorage.
8. Keep `staff` and `orders` private. The public GET endpoint continues to
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
