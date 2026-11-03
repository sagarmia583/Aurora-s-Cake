# Native bakery workspace — 1 November 2026

## Research and design

| Official reference | Useful pattern | Applied here |
|---|---|---|
| [Shopify POS smart grid](https://help.shopify.com/en/manual/sell-in-person/getting-started/smart-grid) | Keep frequent tasks within reach. | Large shortcuts for orders, batch work and role-specific handoffs. |
| [Square KDS](https://squareup.com/help/us/en/article/8168-prioritize-orders-with-square-kds) | Prioritize kitchen tickets. | Next-action card and an actual delivery-date/role-based queue. |
| [Toast Go](https://pos.toasttab.com/hardware/toast-go) | Fast mobile order entry and informed staff. | Cake → delivery → review, with native controls and clear prices. |
| [DoorDash Business Manager](https://merchants.doordash.com/en-us/learning-center/business-manager-app) | Active-order visibility, contact actions and business summaries. | Handoff list, customer calls/directions and collection summaries. |

These are workflow inspirations, not copied screens/assets. Aurora uses warm cream, berry, apricot and mint; large touch areas; bilingual labels; bottom navigation and native modal screens. The shop name/logo and all commercial data come from the Sheet.

Bakery-specific features: **আজকের ছন্দ** shows the next actionable task; **Batch plan** groups confirmed/baking quantities by day, cake, size and flavor; **Cake passport** brings cake writing, extras, notes, handoff, payment state and order history together. No inventory quantity, distance, ETA or bank balance is invented.

## Native feature coverage

Entry: `apps/staff-mobile/App.tsx` → `src/native/NativeApp.tsx`. No WebView is rendered. The old wrapper and sample-data prototype remain reference files only.

| Work | Implementation |
|---|---|
| Sessions | Verified staff login, SecureStore persistence, existing native-token migration and acknowledged password-session logout. |
| Today/orders | Role-aware next task, counts, search/filters, alert acknowledgment, refresh and visible sync/error state. |
| New order | Real product/variant/flavor/add-on IDs, writing, quantities, customer lookup, address, area/slot/date, offers, server-checked COD total and receipt. |
| Kitchen | Date-specific batches and individual tickets; authorized start-baking/mark-ready actions. |
| Dispatch/rider | Registered rider selection, pickup/delivery stages, calls, directions, customer OTP, cash acknowledgment and explicit manager handover override. |
| CMS | Products/sizes/categories/flavors/extras, offers, review moderation, settings/logo, areas/slots, content, slides, banners, highlights, FAQ and links. |
| Photos | Native picker, JPEG resizing/compression, authenticated upload and explicit CMS save. No camera/microphone recording permission is added for this flow. |
| Team/custom cakes | Staff creation/access/password reset; actual custom request quotes/declines. |
| Statements/costing | Delivered value separately from collected COD, per-rider collections from loaded orders, native printing and an authenticated costing route. |
| Alerts | expo-audio WAV, device preference, test sound, acknowledgment/background stop and optional kitchen screen-awake mode. |

The app uses the same business backend as the web with a separate native UI. Technical migration/Firebase diagnostics remain in web administration. The sample inventory/purchasing/finance modules from the old prototype are not used. Checkout supports COD; unsupported advance payments are not presented as saved.

Fresh-install login uses a staff username/password created through web Staff & access. This redesign does not introduce native Google OAuth client IDs; an already saved native Google token can be revalidated. No signed APK/IPA, store submission or production frontend publication was performed.

## Data and durability

Public data starts empty until fetched. Empty Sheet tables stay empty. Blank availability cells follow the backend's legacy rule: two existing delivery areas with blank `is_active` remain available. Discounts follow variant/product fallback rules, including intentional zero prices.

The native order creator validates staff identity/role and commits the exact request ID, cryptographic checkout proof and draft into verified encrypted chunks before posting. Uncertain responses retain the reference; changed drafts cannot overwrite it. Double submissions are locked, confirmation failure retains the saved pending receipt, and staff receipts remove customer bearer keys/OTPs. Signed-out/expired sessions clear visible private screens. A stale read cannot undo a newer mutation.

Orders/catalogue refresh in parallel every 8–12 seconds while active, on foreground and on pull-to-refresh. Confirmed writes refresh. Public caching can add about 20 seconds. This is foreground polling, not background push or offline writes. Startup does not automatically replay an uncertain order.

## Verification

- Repository suite: **512 total; 507 passed, 0 failed, 5 skipped**.
- Root/native TypeScript and the website production build passed. Existing web chunk-size warnings remain.
- Android/iOS Hermes exports passed with native image/crypto modules and the notification WAV. Exports are bundle checks, not installed-device tests.
- Read bounded actual public product/variant rows from Google Sheets and compared native/web estimates against `auroraBuildOrder_` in an isolated VM: **13 active cakes, 21 active variants, 2,275 combinations, 0 mismatches**. No verifier can submit an order/write the database.
- At 390×844, exercised dashboard, batch plan, two-cake customization with candles/writing, delivery and offer review: ৳1,760 − ৳176 + ৳60 = **৳1,644**. Preview confirmation showed the explicit no-live-order message.
- Tests cover availability defaults, sale prices, batches, encrypted commit failures, exact replay, role/storage refusal, sign-in/logout, pinned gateway compatibility and costing authorization/validation.
- No real order, review, staff account, area, payment or costing record was created for testing. No employee credential was entered. Device speakers/gallery/printers still require acceptance on a phone.

Screenshots use the clearly labeled read-only design preview, not live customer orders:

- [Today](native-today-2026-11-01.png)
- [Batch](native-batch-2026-11-01.png)
- [Order review](native-order-review-2026-11-01.png)

## Backend update

Deployed release: `aurora-2026-11-01-native-workspace-r2`. It adds authenticated `staff_item_costings` reads/saves for authorized management/accounting roles, validates non-negative amounts and existing product IDs, and stores a supplied cancellation reason in order history. The existing checkout/CMS data model is retained. The local relay permits the new route. If an old production gateway rejects that action name, compatibility is pinned to this same shop's existing Apps Script endpoint with the same authentication checks.

The combined bundle was regenerated from 17 maintained modules and deployed in Chrome as **version 31 on 1 November 2026 at 22:27 Asia/Dhaka**. Version 30 remains available for rollback. The existing deployment URL, Script Properties, execution/access configuration and database were retained. No initialization or seeding ran.

Live verification returned `up_to_date: true`, the exact r2 release, `database_backend: google_sheets`, and writes unfrozen. Both the local relay and the pinned direct costing endpoint returned `unauthorized` without credentials; no costing/customer/business data was returned. The updated running Expo Android development bundle returned HTTP 200 (4,635,521 characters). [Deployment confirmation](native-backend-deploy-2026-11-01.png).

Backend bundle SHA-256: `4E5A60C26AEE3909905FBC5131184366EBFCCD6E3340F3E4A602D85B6F11E1E5`.
