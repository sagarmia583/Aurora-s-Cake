# Local order links, delivery and staff app preview — 2026-11-01

The user chose local preview before publication. No Cloudflare publication or Apps Script deployment was performed for these changes. The existing Sheet remains authoritative; no test business records were written.

Local pages:

- Website: http://localhost:3000/
- Staff app design: http://localhost:8081/?preview=1
- App login design: http://localhost:8081/
- Customer receipt design: http://localhost:3000/?order-preview=1

The staff design uses explicitly labeled development fixtures and blocks mutations. Browser login is a visual preview; real app credentials remain in phone SecureStore. The receipt preview runs the actual prepared Apps Script HTML renderer with explicit sample data. Its middleware exists only in Vite development and never contacts private order storage.

## Changes ready for review

- Delivery OTP generation and checks are removed, including legacy OTP lockouts. Staff authentication, assigned-rider checks for riders, customer receipt proof and COD cash confirmation remain required. Customer account authentication is unchanged.
- Admin/super admin can create, confirm, bake, mark ready, start delivery directly from ready and complete COD delivery without another rider or an override checkbox. Other roles retain their permissions.
- Staff-created order success views automatically request a customer link. Existing order cards have link creation/copy/open/share controls. The backend issues an idempotent, cryptographically random, separately revocable share key. Rotating it does not revoke the customer's account or original receipt proof.
- The customer page shows items, size/flavor, extras, writing, address/date/slot, discount, coupon, payment, total and public status history. It refreshes every 20 seconds while visible. All interpolated customer text is escaped. It excludes account identifiers, original checkout secrets, internal history notes and delivery codes.
- The receipt is hosted by the same pinned Apps Script deployment, so after the backend update it can work independently of a Cloudflare frontend deployment. The URL carries a private bearer key: send it only to the intended customer. It uses no-referrer and noindex directives and bundled fonts.
- The web staff mutation path now updates an order only after backend confirmation; a failed request cannot become a local-only successful delivery.
- A new original three-note chime is bundled for foreground audio and native notifications. Android uses a new immutable sound channel; muted alerts use a separate silent channel. Background baseline records contain only principal scope, IDs, stages and timestamp, stored through encrypted SecureStore chunks. No customer details appear in notification text. Logout unregisters the task and cancels pending notifications.
- Foreground polling stays at 8–12 seconds and runs again on resume/pull-to-refresh. Keep-awake defaults on for signed-in foreground work. BackgroundTask requests a minimum 15-minute interval, but the OS decides execution time and can stop work after force-close. This is not instant push or an always-running service.
- App login and shared buttons have revised spacing, cards, password visibility, focus/accessibility labels and press feedback. English uses bundled Roboto; Bengali uses bundled Noto Sans Bengali because Roboto lacks Bengali glyphs. Font licenses are included in More. Website floating support/footer now use the actual Sheet Facebook URL; there are no WhatsApp anchors in the verified local page.

## Verification and publication status

- Both TypeScript projects pass.
- Full tests: 518 total, 513 pass, 0 fail, 5 pre-existing skips. Coverage includes complete OTP-free COD flows, admin self-delivery, private link authorization/stability/rotation, revoked link denial, safe HTML rendering and background deduplication/mute/logout, and refusal to recreate a credential removed during logout.
- Website production build passes with existing large-chunk warnings.
- Android and iOS Hermes exports pass and include eight local font files plus the new WAV. These are bundle exports, not signed APK/IPA installers.
- Native config introspection includes iOS background processing identifiers and the custom sound configuration, with remote notification entitlement disabled.
- Browser checks confirm the actual customer template renders, native order details show customer-link controls and Start delivery, login renders without browser SecureStore errors, and the website loads the Sheet Facebook URL with zero WhatsApp anchors.
- Local health verified `google_sheets`, writes not frozen, installed `aurora-2026-11-01-native-workspace-r2`; the prepared source expects `aurora-2026-11-01-share-delivery-r3`. Real share-link issuance and OTP-free delivery require publishing the prepared backend after review. The live deployment remains version 31/r2.
- Physical-device audio, background scheduling, permission prompts and installed-app behavior remain device acceptance work. Custom notification sound/plugin changes require a rebuilt native app. OS scheduling and force-close limits are documented by [Expo BackgroundTask](https://docs.expo.dev/versions/latest/sdk/background-task/); custom sound assets are documented by [Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/).

Screenshots: `native-login-preview-2026-11-01.png`, `native-customer-link-preview-2026-11-01.png`, `customer-receipt-preview-2026-11-01.png`, `local-web-facebook-preview-2026-11-01.png` in this directory.
