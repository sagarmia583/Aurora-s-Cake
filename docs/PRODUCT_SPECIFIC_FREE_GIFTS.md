# Aurora's Cake — Gift per product (Google Sheets / Netlify only)

## Why gifts appeared on every cake
The old storefront rendered `settings.complimentary_kit_items` as a global gift promise inside every cake card. That list is now **only the available gift catalogue**. No product receives gifts automatically.

## How to select individual cakes
1. Open **Staff → Live Website Manager → কেকভিত্তিক ফ্রি উপহার → উপহার নির্বাচন**.
2. Available gifts are loaded from the existing `settings` row whose key is `complimentary_kit_items`. The first release also accepts the existing comma-separated/JSON list.
3. Under each named product, tick only the gift(s) that this product should include. Leave all boxes unticked on products without gifts.
4. Click **Save Gift Assignments**. After the public content refreshes, only selected cakes show their own free-gift badge and detail message.

**Example:** Vanilla cake → ছুরি + মোমবাতি; Chocolate cake → কার্ড; Orange cake → nothing. Only these assignments appear, and a new product starts with no gifts.

## Storage / safety
- Reuses **the existing original Google Sheet** and the original `settings` table. No extra Google Sheets, columns, or Apps Script backend update are required.
- The row `complimentary_kit_items` is persisted as a bounded version-2 JSON string: `{"version":2,"items":["ছুরি","মোমবাতি"],"products":{"prod-vanilla":["ছুরি"]}}`.
- The old plain list, such as `["ছুরি","মোমবাতি"]`, remains accepted as choices, but it does **not** promise gifts for any specific product until assigned.
- Read and write are only through existing authenticated `staff_cms_list` and `staff_cms_update` actions. The Web storefront still reads the same public catalogue. The editor checks for a newer settings value before saving.
- No order or payment fields are edited. No priced addons are changed. These badges represent marketing/packing instructions; gift fulfillment is not yet its own financial or inventory ledger.
- Avoid simultaneously editing the `complimentary_kit_items` settings row in multiple tabs. The manager requests a refresh on a detected stale value.
- **Do not click the old global Free Gift checkboxes expecting a specific cake assignment**. They define options only; assign each cake through the manager.
- Frontend changes require a new Netlify Git-based production deploy to appear. Existing Apps Script `staff-order-alerts-r5` stays untouched. Keep automatic publishing locked until verified.
