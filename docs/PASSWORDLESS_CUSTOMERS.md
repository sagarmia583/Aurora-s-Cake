# Aurora's Cake — Password-free customer details and secure order recovery

The default customer experience no longer asks for a phone-account password.

## Customer flow

1. Open **Customer details / My orders**.
2. Enter **Name + Bangladesh mobile number + Delivery address**, then Save.
3. The details are posted to the private `customer_contact_requests` Google Sheet. They are **unverified submissions**; no anonymous phone search can read them. The browser also keeps a copy for autofilling checkout.
4. Staff can enter a mobile number in the authenticated **Customer Master · Phone VLOOKUP** panel. Confirmed COD customers are returned from `customer_master`. If there is no confirmed order but an unverified contact submission exists, it is explicitly marked **Unverified**.
5. Customers check out without a password. A successful COD order persists a full private `orders` receipt, `order_items`, and the normalized customer record in `customer_master`.
6. The order's receipt and dispatch OTP appear in **My orders / Order Tracking** on the same device.
7. On a different device the customer may recover an order with **Order ID + phone + original private receipt key**. This retrieves only that specific order. No customer profile, older order history or delivery OTP can be retrieved from a phone number alone.

Previous phone/password and Google-linked accounts still work through **Previously registered… → Existing account recovery**, so older customers are not stranded. The password is not required for new customer details or COD checkout.

## Before testing

1. Back up the existing production Google Sheet, including `orders`, `order_items`, `customer_master`, account sheets, and `receipt_json`.
2. Copy the **entire current** [All-in-One Apps Script](../apps-script/Code.AllInOne.gs) into the existing Apps Script `Code.gs` (remove duplicate old module files).
3. Manually run `setupSheetDatabase()` once: this adds the **private** `customer_contact_requests` sheet, preserving populated old sheets. Do not publish/share the Sheet.
4. **Deploy → Manage deployments → Edit → New version → Deploy**. Simply pushing GitHub or redeploying Vercel does not update Google Apps Script.
5. Test from a Preview with a harmless unverified test contact number; verify the private Sheet stores it, and the staff search shows an Unverified warning.
6. Use a controlled COD test and verify `orders`, `order_items`, customer lookup, customer receipt recovery and OTP at dispatch. Avoid modifying real customer orders.

## Security limits

Phone number alone does not authenticate possession; a public phone-only order-history/address search would expose private customer information. The API intentionally does not implement it. Customers must keep a private receipt key for recovery on another device; if lost, contact the shop for an independently verified recovery process. A saved form entry is not proof of identity. Google Apps Script + Google Sheets and Vercel Hobby free-tier quotas apply, and no paid SMS service is used.

## Release

The branch's automated CI test and Vercel Preview validate code/build, not real Apps Script owner credentials or the Google Sheet's data. Keep PR #2 Draft and Production unchanged until the manual migration/acceptance tests pass.
