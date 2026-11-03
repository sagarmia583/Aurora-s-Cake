# Staff orders, Sheet counters and native audio — 1 November 2026

The owner subsequently requested an independent native experience. The current app entry, native feature coverage and backend version 31 are documented in the [native redesign report](NATIVE_APP_REDESIGN_2026-11-01.md). The shared-WebView description below records the earlier implementation.

## Implemented locally

- Staff-created orders now use the actual Sheet checkout API and then await staff confirmation. Previously this form used the local mock order creator even when a live backend was selected. Address, selected delivery area, real product/variant/options, coupon and server-checked total now reach the backend. Gift instructions are retained in the saved order note.
- The staff form displays active Sheet coupons, their discounts and minimum spend. Clicking an offer validates it against the bag; the backend still computes the authoritative discount.
- Admins can add a delivery area with its fee inside the form. It uses the authenticated website CMS, reads the saved rows back, selects the new real ID and refreshes the shared catalogue. Other roles retain the backend's existing permissions.
- A saved request ID and checkout proof survive reloads and lost responses. An uncertain request must be replayed unchanged; double-clicks cannot submit two orders. A confirmation failure shows the real saved pending order instead of claiming confirmation or recreating it.
- Live staff checkout supports COD. Advance-payment controls are disabled because the current checkout backend does not persist those payments. A full finance/payment implementation is outside these changes.

## Real counters in the existing Google Sheet

Workbook: `18B0chk742grOCG4Wdx3w8Cn_sZFBCxc3WHbCtZBshY4`.

| Cells | Change |
|---|---|
| `products!L2:L15` | Average rating from approved reviews of that product. |
| `products!M2:M15` | Actual approved review row count. |
| `products!P1:P15` | New `sold_count` header and delivered-order quantity formulas. |
| `reviews!I1` | Missing `image_url` header required by the existing CMS schema. |

Headers and existing cells were read before editing. One formula row was written and read back before applying the remaining rows. Final native cell readback showed no formula errors: all review counts/rating averages were zero; one delivered bento vanilla unit was counted. No order, customer, payment, staff account, or session rows were changed. Seeded manual review totals were replaced with the real approved-review totals as requested.

The maintained backend adds `sold_count` to the public allowlist. CMS product edits preserve Sheet formulas and reject manual counter changes. Newly created products receive statistics formulas automatically after deployment. `setupProductStatistics()` is a non-destructive owner utility for an existing workbook; this workbook's formulas are already installed.

Customer reviews now use a real POST, not a local success message. The server requires the original private receipt key, matching phone, delivered status and a purchased product. It derives the customer/product names from the receipt, saves a pending review, and deduplicates retries per order/product. Staff approves publication through Website manager → Reviews. Reviews do not increase simply because a cake was sold. Optional photos use a public HTTPS image link.

## App and website parity

The native app entry embeds the same authenticated `StaffPortal` as the website. Its overview, live orders and role-specific kitchen/rider operations, customer lookup, staff access, custom cakes, website CMS/review moderation, costing, collection statements and receipt forms share the same components and backend. There is no second native database or a second implementation of these forms. This confirms shared implementation, not physical-device acceptance of every operation.

Public content refreshes approximately every 12 seconds while visible, with a backend public cache of up to 20 seconds. Staff queues poll at 8/12/20-second intervals depending on role/screen and refresh after confirmed changes. Foreground/focus requests a refresh. This is foreground polling, not instantaneous push or offline writes.

The WebView's order alert now calls `expo-audio` with the bundled notification WAV. Playback waits for loading, seeks to the beginning on every alert, uses full player volume and the speaker route, and supports iOS silent mode. Vibration accompanies playback. Acknowledgment, mute, backgrounding and unmount stop the alert. A native **Test sound** button reports audio errors. No background push-notification implementation was added. Phone media volume/DND and actual speaker output still need a real-device check.

## Verification

- Full automated suite: **503 total, 498 passed, 0 failed, 5 skipped**.
- Root and native TypeScript: passed.
- Website production build: passed; existing chunk-size warnings remain.
- Android and iOS Hermes exports: passed with the notification WAV included. Compiler temporary-file access required running the export outside the restricted sandbox.
- Updated local Android development bundle: HTTP 200. Vite stays on port 3000; Expo on port 8081.
- New tests cover uncertain staff-order retry, exact offer/address transport, storage/auth refusal, failed confirmation, saving/selecting a delivery zone, review ownership and delivery checks, review retry deduplication, approved-only display counts, CMS formula preservation, native sound loading/replay/mute/stop.
- No fake live order, review, delivery zone, or financial transaction was created for testing. Physical phone audio, real fulfillment, native photo upload and printer output were not exercised.

## Backend deployment completed in Chrome

Supplied editor: https://script.google.com/u/0/home/projects/1rlF3afxFyvOoFMHtjkh6cCEs_Hd8qPhH_ZeGxWqVYydGj77LVt4XvH0U/edit

On the owner's follow-up request to retry Chrome, the authenticated editor was accessible. The generated combined source was inserted into the existing sole `Code.gs`, saved successfully, and the existing Web app deployment was updated from version **29** to **30** on **1 November 2026 at 21:18 Asia/Dhaka**. The editor reported “Deployment successfully updated.” Version 29 remains in project history for rollback. The deployment URL, execution identity, access configuration and Script Properties were retained.

Post-deployment verification through the local relay returned installed release `aurora-2026-11-01-staff-live-stats-r1`, `up_to_date: true`, database `google_sheets`, and writes unfrozen. All 14 public product rows expose numeric `sold_count`; bento vanilla reports one delivered unit. Direct and relayed `customer_review_submit` requests with deliberately invalid rating/comment returned `invalid_review`, confirming the new route without creating a review. One immediate request reached the prior POST version during deployment propagation; both routes returned the new validator on the subsequent check.

Deployed file: `apps-script/Code.AllInOne.gs`, generated from 17 maintained modules; SHA-256 `7165118D8543D6AE4D81785CF20A58E1B29719F00497F84E33C6D31D6B012A06`. No database initialization, seeding, real order, review or payment was performed during deployment.

Local app development uses `http://192.168.1.11:3000`; its Expo server is `exp://192.168.1.11:8081`. Release builds use the approved HTTPS production website, so production frontend publication and a rebuilt native app are also required before claiming the installed production app contains these changes. No signed APK/IPA or production frontend deployment was performed here.
