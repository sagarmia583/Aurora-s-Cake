# Aurora’s Cake — native staff workspace

`App.tsx` loads bundled fonts through `src/native/FontBootstrap.tsx`, then `src/native/NativeApp.tsx`. It renders React Native screens.

The native workspace includes Today/next action, searchable orders, three-step COD checkout, date-specific kitchen batches, OTP-free COD handover, private customer view links, customer lookup, custom quotes, staff access, native website CMS/photo upload, reports/collection printing, item costings and a bundled three-note chime. Admin can prepare and self-deliver an order. Business data comes from the same live Google Sheets backend as the website. No sample inventory, simulated balances or local-only successful sales are used in live mode.

Staff sign-in is verified by the backend and stored in Expo SecureStore. Existing native sessions can be revalidated. Fresh installs use a staff username/password created in web Staff & access; this redesign does not configure a new native Google OAuth client. Password-session logout waits for the server’s revocation acknowledgment. Uncertain orders retain an encrypted original request reference and require an explicit retry.

Orders/catalogue refresh every 8–12 seconds while active and on foreground/pull-to-refresh. Public caching can add about 20 seconds. Foreground keep-awake defaults on after login. BackgroundTask requests a minimum 15-minute sync interval, subject to the OS, network and battery. The app can also register for new-order push using its linked EAS project. Delivery requires Android FCM or iOS APNs credentials and the backend push access token. A device build is needed to verify background scheduling, push and custom sound. Reports describe their loaded-order snapshot.

Start Vite with `npm run dev` at the repository root. In this directory run `npm install`, then `npx expo start --lan --port 8081`. On the same Wi-Fi, use an Expo Go version compatible with SDK 58. Use the Expo terminal to find your local device connection. Release builds use the approved Netlify API.

## Android and iOS builds

Run the following from `apps/staff-mobile`. This checkout is linked to the [Aurora’s Cake Expo project](https://expo.dev/accounts/sagarmia583/projects/auroras-cake-staff).

```powershell
npm ci
npm run typecheck
npx expo export --platform android --platform ios --output-dir dist-native-release
eas build --platform android --profile preview
eas build --platform android --profile android-release
eas build --platform ios --profile ios-simulator
eas build --platform ios --profile ios-device
```

The Android `preview` profile produces a signed installable APK. The iOS simulator profile produces a simulator archive for Xcode on macOS. The iPhone profile produces an ad hoc IPA after the owner configures Apple Developer signing and registers the device. Use `production` for store builds. In a source export without a Git checkout, set `$env:EAS_NO_VCS='1'` before running EAS. The Hermes export verifies both bundles. Test installed-device sound, photo access and physical printing separately.

The Android `android-release` profile produces a signed AAB as the primary archive and a signed APK in the additional artifacts. Use the APK to test a direct install, then upload the AAB to Google Play Console → Testing → Internal testing. Google Play publication requires the owner’s developer account, Play App Signing and the applicable listing, access and review steps. [Google Play testing tracks](https://support.google.com/googleplay/android-developer/answer/9845334)

Android 0.1.1 disables release code shrinking after reproducing a launch crash in AndroidX WorkManager’s startup provider on the previous APK. Keep this build property until release-device tests pass with a targeted rule or a fixed dependency. The app displays `STARTUP_MODULE` or `STARTUP_RENDER` when the JavaScript workspace fails to start, with a link to the web staff panel.

Android 0.1.2 uses a compact login card and a scrollable form with Android keyboard resize and iOS keyboard insets. Order history provides per-stage alerts for new changes, and the chime uses the separate `aurora-orders-chime-v3` Android channel so the new sound applies after updating. Device media/notification volume and permissions still apply.

Instant locked-screen alerts require the prepared `staff-order-alerts-r5` Apps Script release, Expo push access token, and Android FCM or iOS APNs. Password staff accounts receive alerts relevant to their role. If remote registration is unavailable, the app can notify from the latest order sync while open and from OS-scheduled background refresh when permitted.

For the website, run `npm run build` from the repository root for the `dist` assets. Hosting and API rewrites are defined in `netlify.toml`. The production backend source is `apps-script/Code.AllInOne.gs`. Deploy it as a new version of the existing web app to retain the live Google Sheet and current endpoint.

Research, feature coverage, screenshots and verification: [native redesign report](../../docs/NATIVE_APP_REDESIGN_2026-11-01.md).

Latest backend release and setup steps are in the [web and app audit](../../docs/FULL_WEB_APP_AUDIT_2026-11-03.md). Embedded fonts use Roboto for Latin and Noto Sans Bengali for Bengali. The app includes both OFL notices under More → Fonts & licenses.

POS is available from order details → POS print. It defaults to 80mm USB/Wi-Fi and also supports 58mm. Cash Memo and Box Label include offline-generated Website and Facebook QR codes. Their destinations use the public Sheet settings with the live shop links as fallback. Kitchen tickets omit promotional QR codes. Printing uses the OS print dialog and installed driver. The bundled app icon is the current public Sheet logo. See [POS, numbers and logo](../../docs/POS_NUMBERS_LOGO_2026-11-01.md) for hardware setup.
