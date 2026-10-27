# Aurora's Cake — Free Staff Passwords & Customer Phone Accounts

This migration is **not live until the Google Apps Script project is updated and redeployed**. Changes are under Draft PR #2. The Vercel preview build does not itself update the owner's Google Apps Script project.

## Features

- Super Admin signs in with approved Google Gmail (already configured).
- Super Admin creates private **username + password** accounts for Kitchen, Rider, Admin, Order Manager, Delivery Manager, and Accountant. Passwords never appear again in the staff directory. Password reset and disable endpoints are owner-only.
- Employees use the **Employee Login** form; Gmail is not required. Existing legacy Google-allowlisted staff can be migrated gradually; remove those entries from `AURORA_STAFF_USERS` after creating replacement password accounts to enforce Google login for the owner only.
- Customer signs up with **Bangladesh phone number + password** and optionally saves profile name, delivery address, and contact email in a private Google Sheet.
- Each registered customer's linked order history is retrieved from the private `orders` Google Sheet after login from any browser. Original confirmed COD orders are **always stored in private Sheets**, including guests. Order snapshots on the browser are an optional local cache, not the source of truth.
- Orders from an unverified phone **never become owned by a newly registered account automatically**. The user must submit the original confirmed receipt's private `customer_access_token` through **Link original receipt**; newly submitted orders are linked automatically after successful checkout while signed in (and can be manually retried if network is interrupted).
- A phone number alone proves **nothing** about ownership. **No SMS OTP/phone verification or automatic forgotten-password recovery** is provided. This is a *phone login identifier*, not a verified phone identity.

## Checkout: Autofill saved customer details

The COD Checkout form includes **Returning customer? → Use my saved details**. Enter the phone number associated with your account, then enter the customer phone-account password and select **Verify & autofill name and address**. The server authenticates the password and sends back only that customer's profile. The customer can edit the contact details for the individual order before checkout.

A previous verified phone account session can automatically populate the Checkout form while it remains valid. On the same device, locally owned saved details or original receipt capabilities may also autofill without another password. Simply typing a phone number must **never** retrieve a private Google Sheets address without account authentication.

For a new account, use **Sign up / My orders** and save the address in the profile first. The checkout auto-fill requires the **latest Apps Script all-in-one deployment** with phone-account POST actions. A Frontend Preview build alone cannot migrate the deployed Apps Script.

## Deployment migration

1. Make a copy/backup of the actual production Google Sheet.
2. In the existing Apps Script editor, replace the old single `Code.gs` contents with the entire up-to-date [Code.AllInOne.gs](../apps-script/Code.AllInOne.gs); **do not** keep both it and the six modules.
3. **Run `setupSheetDatabase()` once after saving**. It creates these private tabs if missing, while preserving nonempty existing `orders`, `order_items`, `settings` and other tabs:
   - `staff_accounts`: username, name, role, salted/iterated password hash, failed attempts, lock, status, timestamps.
   - `customer_accounts`: phone, name, address, email, salted/iterated password hash, status, timestamps.
   - `auth_sessions`: SHA-256 session token hashes, account type/id, creation, expiry, revocation flag.
4. Never publish or share the private Sheet with customers, employees, or anyone else. Google Apps Script executes **as the owner** and enforces every private action's session/role check. Never put the spreadsheet ID or Google OAuth **Client Secret** in an untrusted web form.
5. Open **Deploy → Manage deployments → Edit → Version: New version → Deploy**, retaining the existing public /exec URL. For public guest COD and phone signup, Web App access must permit anonymous requests while the Sheets themselves remain private.
6. Under Vercel, the existing four environment variables are already configured for the owner project. The relay allowlist now accepts `staff_password_login`, `staff_account_create`, `customer_phone_signup`, `customer_phone_login`, `customer_phone_orders`, `customer_phone_profile`, and original-receipt link actions. Use the **Draft PR preview deployment** and test before any production release.
7. Staff owner logs in with Google and uses the **Create new employee login** form. Roles are restricted server-side. The Rider username appears in the assign dropdown after profile refresh.
8. Customer signs up with phone+password, places a small test COD order, confirms it appears in both the **orders** Sheet and **My order history**. Sign out, open a new browser/device, sign in again, and confirm history recovery. Confirm an attacker knowing the order number + phone *cannot* claim or read it without receipt capability.
9. Test wrong staff password (five failures temporarily lock the account), other Staff role permissions, OTP issuance at dispatch, and cash confirmation at delivery.

## Security and recovery limits

- Passwords are stored as a **salted iterated SHA-256 hash**, using Apps Script's available digest primitive (5,000 iterations). This is not equivalent to memory-hard Argon2id/scrypt/bcrypt. If the application grows, migrate account authentication to a hardened identity provider. The private spreadsheet and Google account permissions are especially important.
- Session tokens are generated using two Google Apps Script platform UUIDs, **hashed at rest**, retained for 12 hours (staff) or 7 days (customer), and can be invalidated. Apps Script's UUID API is not documented as a cryptographic RNG guarantee.
- Customer signup does **not prove ownership of a mobile phone**; it is unsuitable for SMS-based password reset or automatic matching of historical orders. Lost-password recovery must be manually handled by the bakery after independent proof of purchase and should revoke old sessions. No free SMS gateway is assumed.
- Only confirmed original receipt capabilities can associate a guest order with a new phone account. Order IDs, phone numbers, names, or public order history are not authorization.
- Sessions in the browser are stored in `sessionStorage` (cleared at end of browser session); never store raw passwords. Do not use shared devices for customer accounts.
- Serverless Vercel Hobby, Google Apps Script and Google Sheets have quotas and no uptime guarantee. Test real signup and login on your project before release.
