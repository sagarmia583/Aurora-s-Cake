# Aurora's Cake — Website A–Z Audit & Live CMS Matrix

## What is really live (Google Sheets + Apps Script)
The actual production data source is Google Sheets through the configured Apps Script `/exec` URL, with a Vercel Hobby same-origin POST function `/api/operations`. Staff/Owner must sign in to mutate live records. The separate legacy `mockDb`/Supabase Studio is development-only; it is not a production management tool.

### Public website administration in the new Staff Operations → Live Website Manager

| Section | Create | Edit | Safe Delete | Persistence |
|---|---|---|---|---|
| Shop settings and website text | Approved missing keys | Approved values | Keys protected, clear text or change values | Google Sheets `settings`, `content` |
| Hero slides / Highlights / FAQs | Yes | Yes | Archive / hide | Google Sheets |
| Links / social / footer | Yes | Yes | Archive / hide | Google Sheets |
| Categories | Yes | Yes | Archive if no active products depend on it | Google Sheets |
| Products | Yes | Yes | Archive; historic orders retained | Google Sheets |
| Sizes / product variants | Yes | Yes | Archive | Google Sheets |
| Flavours / Add-ons | Yes | Yes | Archive | Google Sheets |
| Banners | Yes | Yes | Archive | Google Sheets |
| Delivery zones and slots | Yes | Yes | Archive | Google Sheets |
| Coupons | Yes | Yes | Archive | Google Sheets |
| Reviews | Yes | Moderate/update | Hide | Google Sheets |

Forms use the actual Sheet columns, with number, boolean, URL, image-path, slug and reference checks. Admins can create/edit public content; **only Super Admin can archive**, enforced again in Apps Script. No public GET exposes CMS rows beyond public data itself.

Other workflows:
- **Super Admin**: Gmail login; create/disable/enable/reset staff Username + Password accounts; see private staff directory.
- **Kitchen, Rider, Delivery, Order Manager**: own credentials and role-restricted COD order transitions; rider OTP and COD collection are verified server-side.
- **Customer**: Phone + Password profile; linked order history stored and recovered from a private Sheet across browsers; phone ownership **not SMS-verified** and cannot automatically claim guest orders without original receipt.
- **Private order, item, payment and account/session tables**: never exposed in generic website CMS. COD order records are preserved for financial reconciliation; cancel/archive through purpose-built workflows rather than hard deletion.

### Key corrections during this review
1. Replaced the former `LiveShopEditor` (only basic product/price toggles) with **Live Website Manager** for 16 public table types.
2. Added `staff_cms_list/create/update/delete` routes, owner/admin authorization, a strict table/column allowlist, ScriptLock, archived deletion, cached-public-data invalidation and hardened validation.
3. Protected customer/private orders and password hashes, validated product/category references, prevented duplicate slugs/coupon codes and restricted unsafe URLs / spreadsheet formulas.
4. Fixed the **Copy setup code / Download** action inside the website: it formerly copied incomplete `SeedData.gs + Code.gs`. It now copies the **complete current `Code.AllInOne.gs`**.
5. Kept the optional older Demo Studio development-only. **Use Staff Login** for real admin work. Demo data must not be confused with Google Sheets persistence.
6. Retained the Vercel same-origin relay; no paid SMS gateway, payment processor or new paid infrastructure is added.

## Mandatory migration before testing a new feature
1. **Back up your actual production Google Sheet**. Check that all current COD orders and private receipts exist.
2. From this PR, copy the **entire** `apps-script/Code.AllInOne.gs` into the existing Google Apps Script project's **single `Code.gs`**. Remove old duplicate module files.
3. Save, then run `setupSheetDatabase()`. It creates missing headers/tabs but **preserves nonempty existing tabs**. Never use a demo Sheet or overwrite real orders.
4. **Deploy → Manage deployments → Edit → New version → Deploy**. Confirm the Apps Script `/exec?action=health` JSON.
5. Open the PR's **Vercel Preview**, log in via **Staff Login** as a legitimate Admin, scroll to **Live Website Manager**, test a harmless FAQ create/edit/archive and refresh the public storefront.
6. Test Product and Size changes, then a guest COD checkout. Confirm private `orders`/`order_items` contain the correct confirmed receipt and amounts; use Kitchen/Rider to validate full delivery.
7. Test phone login from a second browser, access denial for other users, disabled employee access, and reset-password session revocation.

### Unverified / intentionally limited
- **No live Google Sheet mutations were made during this source review.** GitHub Actions builds, unit/integration tests and Vercel Preview compilation are not a substitute for a complete manual browser-and-Sheets acceptance test.
- Public CMS archives entries; does not physically delete historical orders, customer account data or ledger transactions.
- Settings/content key creation is restricted to the existing allowlist; unsupported new website sections require code/schema changes.
- Edits show the first 500 records per public table; much larger datasets need pagination or manual maintenance.
- Picture files cannot be uploaded into Sheets by pasting binary data. Use an existing public HTTPS image URL or deployed `/images/` assets; image hosting/upload flow is not automatically implemented.
- Phone numbers are not verified through SMS. Password hashing and UUID-based bearer sessions remain constrained by Google Apps Script's APIs; stronger auth/bot protection and formal penetration testing are recommended if user volume grows.
- No claim of zero bugs, unrestricted Free usage or completed production release is made. Keep PR Draft until live validation and backup are complete.

Links: [Full one-file Apps Script](../apps-script/Code.AllInOne.gs), [Phone & Staff Accounts](PHONE_CUSTOMER_AND_STAFF_ACCOUNTS.md), [Vercel Setup](VERCEL_FREE_DEPLOYMENT.md).
