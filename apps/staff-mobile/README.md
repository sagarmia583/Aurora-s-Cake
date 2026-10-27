# Aurora's Cake — Staff Mobile (Android and iOS)

Expo SDK 58 / React Native native staff app. This is source code, not yet a signed APK or IPA.

## What it does
- Employee Username + Password sign-in. No new Gmail or paid service for Kitchen/Rider staff.
- Persistent session encrypted on the phone by Expo SecureStore; 12-hour backend expiry, revocation, and logout.
- Role-based Dashboard: Kitchen, Order Manager, Dispatch Manager, Delivery Rider, Admin and Accountant.
- My Tasks, Orders, Account; fast virtualized order list, pull refresh and foreground automatic refresh approximately every 30 seconds.
- Rider: Pick Up > Start Delivery > Ask Customer for OTP > Confirm Full COD cash > Verify/Deliver.
- OTP never sent to rider by API; issued to customer's private tracking only after dispatch.
- Inline stage update after server success. Failed network requests preserve existing list; no offline mutation queue.

## Required backend before native login works
1. Back up Google Sheet and install/deploy latest ALL-IN-ONE Code.gs using Apps Script New version.
2. Run setupSheetDatabase() to add private staff_accounts and auth_sessions if absent.
3. In the Super Admin web dashboard create active employee username/password accounts.
4. The Vercel Production deployment must have working POST /api/operations, configured with the same Apps Script /exec URL.
5. A Vercel SSO-protected Preview is normally unsuitable for native login: do not remove authentication to bypass it.

## Run with Expo in Windows PowerShell

    cd apps/staff-mobile
    Copy-Item .env.example .env
    npm install
    npx expo install --fix
    npx expo start

Edit EXPO_PUBLIC_OPERATIONS_URL in .env if the real production Vercel hostname changes.
Only trusted HTTPS Vercel API origins ending in /api/operations are accepted by the native API client.
No OAuth Client Secret, service password, Google API key, or customer credential belongs in .env.

## Build an Android APK

    npm install -g eas-cli
    eas login
    eas build:configure
    eas build --platform android --profile preview

EAS Build Free tier has usage limits. An Android APK can be shared to test phones directly without Play Store membership.
Building an APK needs your Expo account and Android signing setup; no APK is included in the source repository.

## Test on iPhone / iOS simulator

    eas build --platform ios --profile preview

This project config intentionally creates an unsigned iOS SIMULATOR preview, not a device IPA.
Expo Go is an additional development option if the installed Expo Go release supports Expo SDK 58.
For signed physical iPhone Ad Hoc / TestFlight / App Store distribution Apple Developer Program normally costs $99/year.
Expo Free does not bypass Apple distribution requirements.

## Mandatory real-world COD acceptance test
1. Owner creates kitchen01, dispatch01 and rider01 from web Super Admin.
2. Each mobile login works on separate devices; close/reopen each app and verify secure session restore.
3. Customer places confirmed small COD order; Manager confirms it, Kitchen prepares, Dispatcher assigns rider01.
4. Assigned rider alone sees Pick Up/Start Delivery. Unassigned rider cannot change that order.
5. After Start Delivery, customer with original receipt sees their private OTP; Rider enters it and confirms full cash.
6. Wrong OTP is refused; valid OTP sets Delivered, COD Paid and clears one-time code.
7. Disable an employee in the web dashboard and confirm old session cannot perform an update.
8. Disconnect/reconnect internet; previous list remains but no mutation is falsely marked successful.

## Limitations
- Source and automated tests do not prove a working APK/IPA on real devices. Both physical platforms require testing.
- Foreground refresh only; push notifications and offline write queues are not implemented.
- Native app reads the existing role-authorized Google Sheets snapshot; large Sheets or Apps Script quotas can still cause delays.
- No public CMS delete access, order deletion, customer password/OTP disclosure or payment ledger edits.

Code: App.tsx (interface), src/api.ts (secure transport), src/domain.ts (permissions), eas.json (build profiles).
