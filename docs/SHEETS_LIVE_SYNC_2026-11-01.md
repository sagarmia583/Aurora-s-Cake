# Google Sheets ordering and shared staff workspace — 1 November 2026

Latest app implementation: [native redesign and version 31 verification](NATIVE_APP_REDESIGN_2026-11-01.md). The app now uses native screens rather than the earlier shared WebView.

Follow-up fixes, real counter formulas, native sound verification, and the outstanding Apps Script deployment are recorded in [Staff order, counts and sound](STAFF_ORDER_COUNTS_SOUND_2026-11-01.md). That report supersedes the verification totals below.

## What changed

- The public storefront now takes its catalogue, options, prices, settings, logo and coupons from the validated Google Sheets snapshot. Local Studio records, orphan demo products and locally edited prices cannot override the shop. Empty Sheet tables remain empty. A fresh session starts with an empty catalogue while loading, rather than offering sample cakes for sale.
- Vite now serves the existing validated bakery API handlers at `/api/public`, `/api/operations`, `/api/image` and `/api/backend-health`. Local browser checkout and content reads use this relay instead of cross-origin Apps Script redirects. It retains request limits, the action allowlist, origin checks and backend authorization.
- Quick add only uses real active variants. It no longer creates a fictitious default variant. Variant discounts follow the authoritative backend's eligibility rule rather than depending on array position.
- The navbar attempts the actual Sheet logo URL. It no longer silently substitutes a bundled logo for every Facebook CDN URL. The current configured Facebook image returned HTTP 403. The owner chose to upload a replacement through Staff → Website → Settings → `logo_url`; its Sheet value has therefore not been replaced by an invented URL. Upload the image and **Save** the record to publish it.
- Missing customer-profile helper imports and the web POS split-payment TypeScript error were corrected.
- Removed the storefront's duplicate staff-order poller, which merged private staff orders into customer receipt state. The authenticated Staff Portal owns its live queue and reconciles complete snapshots; customers retain their own confirmed receipts.

## Live Sheet repair

Workbook: `18B0chk742grOCG4Wdx3w8Cn_sZFBCxc3WHbCtZBshY4` (`Aurora's Cake`). Only the grounded catalogue cells below were changed; order, customer, staff-account and session tables were not edited.

| Range | Repair |
|---|---|
| `product_variants!B22` | Corrected the existing vanilla cupcake variant's parent from the removed `prod-cupcake` ID to `prod-cupcake-vanilla`. |
| `product_variants!A24:G24` | Added `var-cupcake-chocolate-single` for the actual product ID `prod-cupcake-choclate`, using the neighboring single-piece structure and the existing product's ৳40 selling price. |

The vanilla variant retains its existing ৳30 price. The new chocolate row copied the neighboring native row structure before its row-specific values were set. Connector readback confirmed the two parent IDs, single-piece labels, weight, prices and active flags. The muffin row between them was unchanged. The public API subsequently returned one real variant for each cupcake.

The variants tab is hidden in the workbook. Anonymous Google Sheets UI redirected to the visible products tab, so hidden-tab visual inspection was unavailable; bounded native cell readback verified the repaired cells and neighboring row instead. No sharing or tab visibility settings were changed.

## App and web use the same staff workspace

The app entry is `apps/staff-mobile/App.tsx` → `src/SharedStaffWorkspace.tsx`. It embeds the actual authenticated website Staff Portal with React Native WebView. Therefore orders, kitchen, dispatch/rider actions, customer lookup, staff management, custom cakes, website CMS, item costings, collection statements and receipt layouts share the same implementation and Google Sheets API on web, Android and iOS.

The earlier standalone native prototype is preserved in `NativeStaffPreview.tsx` and is not imported by the running entry point. Its separate sample inventory/finance data and optimistic write handlers are not used by this app.

Native credentials are scoped to the workspace origin and persisted using Expo SecureStore. The WebView uses sessionStorage; the backend validates restored sessions. Login/logout writes are serialized, and a refresh injects the latest credential rather than the original startup token. Tokens are never put in navigation URLs. Native printing is bridged to Expo Print, and the WebView restricts external navigation and local-file access.

Public content polls while visible approximately every 12 seconds; staff orders poll every 8–20 seconds depending on role and screen. Confirmed staff writes refresh immediately, and app foreground/focus requests another refresh. This is live foreground synchronization with one backend, not push notifications or an offline mutation queue.

For this local session, the app's development website is `http://192.168.1.11:3000`. Release builds ignore the local override and use the approved HTTPS production website. Publishing the matching web source is required before distributing a new production app; no production frontend deployment or signed app distribution was performed in this task.

## Verification

| Check | Result |
|---|---|
| Root TypeScript | Passed. |
| Mobile TypeScript | Passed. |
| Full automated suite | 488 passed, 0 failed, 5 skipped (493 total). |
| Website production build | Passed. Existing large-chunk warnings remain. |
| Android and iOS Hermes exports | Passed with WebView and Expo Print included. These are bundle checks, not signed APK/IPA tests. |
| Updated Android development bundle | HTTP 200 from the restarted Expo server. |
| Read-only catalogue/backend parity | All 13 active products and 21 active variants passed 2,275 size/flavour/add-on/delivery-zone/time-slot pricing combinations against `auroraBuildOrder_`, using actual public catalogue data and raw public Sheet rows in an isolated VM. No database writes were possible in that verifier. |
| Live public API after repair | Both cupcake variants present; 13 active products. |
| Local private API | Unauthenticated `staff_session` rejected with `unauthorized`. |
| Browser cupcake flow | Vanilla cupcake single-piece selection reaches live COD checkout: ৳30 + ৳60 delivery = ৳90. No order submitted. The temporary basket line was removed afterward. |
| Shared staff entry | `/?staff=1&native=1` opens the actual employee/owner login screen; layout checked at 390px width. |

Stale checkout test phone fixtures and obsolete App harness mocks were also repaired. Migration-freeze tests now submit a valid Bangladeshi test number instead of failing phone validation before the behavior under test.

Still requiring owner/device acceptance: authenticated use on real Android/iPhone devices, real order persistence and the full kitchen-to-rider OTP/COD handover, image upload from the phone, and actual native printer output. No employee credentials were entered and no real test order was created.

Screenshots: [repaired cupcake checkout](cupcake-checkout-fixed-2026-11-01.jpg), [shared staff login at phone width](shared-staff-mobile-2026-11-01.jpg).
