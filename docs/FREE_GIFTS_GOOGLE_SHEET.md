# Free gift items — owner-managed Google Sheet

Aurora's Cake customers see complimentary items under each cake card and in the Cake Care guide. This is a shop-wide offer: do not add automatic gifts through the product-creation form.

## Edit in Google Sheets

Open the original private owner Google Sheet and choose the visible tab **ফ্রি উপহার**.

- **A column (ফ্রি আইটেম):** Type the item name, for example ছুরি, মোমবাতি, শুভেচ্ছা কার্ড.
- **B column (দেওয়া হবে?):** Check TRUE for items currently supplied for free; uncheck to remove them from the website. The order is determined by the row order.
- Add new items in an unused row; do not enter prices or private customer data.
- If no box is checked, no free-item badge or promise appears.
- The product creation form need not change. Changes apply to all listed cakes, not individual products.

The hidden `settings` tab contains the formula-backed `complimentary_kit_items` key. The existing Apps Script public settings allowlist already includes this key. The storefront validates and converts the Sheet value to a list, shows up to two item names in the compact mobile badge (plus remaining count), and shows the complete list in the cake-care guide.

New rows appear after the next site data refresh (typically tens of seconds, subject to Apps Script/Netlify caching). Only Google Sheets is used; no new database. Deploy the updated frontend before expecting the old hardcoded badge to disappear.

The mobile breaking-offer ticker no longer pauses indefinitely after touching a coupon on iOS. On desktop it can still pause on hover or keyboard focus; users who request reduced motion see a stationary, horizontally scrollable list.

No change to live orders, accounting, payments or customer identities is involved.
