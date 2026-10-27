# Aurora's Cake — Customer Phone Master / VLOOKUP

## What is new

The owner has one private `customer_master` Sheet with **one row per normalized contact number**. The first **confirmed cash-on-delivery checkout** creates the customer record; subsequent orders using the same normalized phone update only the order summary in the existing record. The order itself is still stored as a separate immutable private `orders` record.

Columns:

| Column | Meaning |
| --- | --- |
| `id` | Stable master record ID |
| `phone_key` | Normalized phone number (e.g. `01700000000`) |
| `name` | Name supplied on the first confirmed order |
| `delivery_address` | Address supplied on the first confirmed order |
| `created_at`, `updated_at` | Master timestamps |
| `order_count` | Count of distinct committed orders for that phone |
| `last_order_id`, `last_order_at` | Most recent committed order |

Example: `01700000000`, `01700 000000`, and `+8801700000000` are the same customer key. A retry of the same COD request never adds a new customer or inflates `order_count`. Different delivery addresses remain on their individual order receipts; **an unverified guest cannot overwrite an existing customer's master name/address** simply by entering their phone number.

### Privacy-safe checkout autocomplete

In Checkout, typing a phone number will auto-populate the name/address **only if they belong to an authenticated phone customer account or are already stored on the same device in an owned checkout receipt / saved device profile**. The phone field auto-populates for an authenticated account when the checkout opens. Staff see an independent **Customer Master · Phone VLOOKUP** tool under Verified Staff Login → Orders, restricted to owner/admin/order/delivery managers.

**No open anonymous lookup for private contact details.** Giving every anonymous visitor existing name/address from a phone number would leak customer information and is unsafe. The public site never reveals whether a stranger's phone is present in the master directory. Use Phone + Password for cross-device profile autofill.

## Install (required to make real Google Sheet records)

1. **Back up the actual current Google Sheet.** Do not clear or overwrite existing COD orders, order_items or customer_accounts.
2. Replace the existing Apps Script project's single `Code.gs` with the **complete latest** [Code.AllInOne.gs](../apps-script/Code.AllInOne.gs) from the Draft PR branch. Do not leave old duplicated module files alongside it.
3. Save and **run `setupSheetDatabase()`** to create the new, private `customer_master` header if missing. Existing nonempty private tabs are preserved.
4. To import customers from historical orders, **run `backfillCustomerMasterOnce()` manually once** in the Apps Script editor. It reads existing `orders` and creates exactly one customer row per normalized phone; rerunning updates the same rows. It does NOT modify past COD receipts or order totals. For a very large Sheet, evaluate execution quotas and consider doing off-peak.
5. **Deploy → Manage deployments → Edit → New version → Deploy**. This is a manual Apps Script deployment step; GitHub/Vercel pushes do not deploy Apps Script automatically.
6. Open the Draft PR Vercel Preview and check a customer profile using an existing device receipt, then place two small COD test orders **only if appropriate** using the same test phone with different phone formatting. Verify one Customer Master row, two Order rows and matching history. Do not create unnecessary live orders without recording/cancelling them.

## Security constraints

- `customer_master` is **PRIVATE**. The public GET endpoint and public CMS cannot list it.
- Staff VLOOKUP requires authenticated, authorized Sales/Delivery Manager roles. Kitchen/rider and anonymous users cannot retrieve contact details.
- Customer Account ownership still requires login credentials or original receipt capability. **Matching a phone number never grants order history access or an OTP**.
- The customer master uses confirmed orders as its source of truth, not registration attempts. A phone signup alone creates a private `customer_accounts` record but not a fictitious COD order.
- Current site has no SMS ownership verification or paid gateway; verified phone ownership must not be inferred.
- Existing parent Google Sheets, Google Apps Script and Vercel Hobby quotas remain in effect.
- Automated tests cover canonical phone matching, unique-row upserts, unchanged retries, backfill, staff privacy and same-device autofill. **Live Google Sheets acceptance is not yet completed.**
