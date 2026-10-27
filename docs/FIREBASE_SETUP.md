# Firebase foundation — Aurora's Cake

This is a **non-destructive, read-only Firebase foundation** for the existing Vite web app, preconfigured with the registered Firebase project `aurorascake-213a0`. It does not migrate any production orders, payments, staff credentials or inventory data. The native Expo app is NOT switched to Firebase. Existing Google Apps Script / Supabase workflows are intentionally unchanged.

## 1. Create or choose a Firebase project

1. Open https://console.firebase.google.com and create/select a project (Spark plan is enough for initial Firestore and Authentication tests).
2. Add a **Web** app; copy its public Firebase web configuration.
3. In **Build > Firestore Database**, create a **Standard/Native mode** database, choosing a region you are comfortable keeping long-term.
4. In **Authentication > Sign-in method**, enable only the providers that the future authenticated workflow actually needs. Do not switch staff login yet.
5. Do **not** enable Cloud Storage for Firebase expecting a Spark-only deployment: starting February 3, 2026, Cloud Storage for Firebase requires Blaze billing. Existing external product image URLs can remain in use.

## 2. Configure web application

The public Firebase Web SDK config from the registration screenshot is already included in `src/services/firebaseClient.ts` and `.env.example`. For a different project, override with local `.env.local` (never commit it). To temporarily disable Firebase, set `VITE_FIREBASE_ENABLED=false`. For the registered project, the following values are used:

```dotenv
VITE_FIREBASE_ENABLED=true
VITE_FIREBASE_API_KEY=AIzaSyCNVQv0iH6fAvzG5WxAX6om5yQGizrgxug
VITE_FIREBASE_AUTH_DOMAIN=aurorascake-213a0.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=aurorascake-213a0
VITE_FIREBASE_APP_ID=1:102515276771:web:d06431a890c12808f8fed6
VITE_FIREBASE_MESSAGING_SENDER_ID=102515276771
VITE_FIREBASE_STORAGE_BUCKET=aurorascake-213a0.firebasestorage.app
VITE_FIREBASE_MEASUREMENT_ID=G-WRX6GNLXK4
```

Set the same environment variables for the correct **Vercel or Netlify** project, then redeploy the web app. The `VITE_` values are delivered to browsers. Never store an Admin SDK service account key or private token in `VITE_` variables.

The optional integration is exported from `src/services/firebaseClient.ts`:

```ts
import { getFirebaseServices, getFirebaseConfigurationStatus } from './services/firebaseClient';

const status = getFirebaseConfigurationStatus();
if (status.enabled && status.configured) {
  const firebase = await getFirebaseServices();
  const result = await firebase.checkConnection();
  console.log(result); // true only after Firestore server read succeeds
}
```

The integration uses Firebase's official modular `firebase` npm package (13.1.0), lazily loaded only in the diagnostics view. Run `npm ci` after `package-lock.json` is updated, and `npm run build` to verify. You may visit `/?firebase-check=1` on the deployed site for a read-only Firestore server check. The configuration alone does **not** activate order writes.

## 3. Deploy **security rules** before any data

Install the Firebase CLI on your own machine, sign in, and deploy only Firestore rules/indexes:

```sh
npm install --global firebase-tools
firebase login
firebase use --add
firebase deploy --only firestore
```

Select **the correct Firebase project (`aurorascake-213a0`)**, read the current deployed rules first, and ensure this is a new database: a CLI deploy overwrites its existing Firestore rules. The included rules let browsers only **GET** `public/health` and deny all other reads and writes.

After deploying, call `firebase.checkConnection()`. If it fails:
- `Missing Firebase config`: web app environment variables incomplete.
- `auth/invalid-api-key`: API key or app registration does not match.
- `permission-denied`: rules are not deployed to the same project/database.
- `failed-precondition`: database may not exist or is incorrectly configured.
- `unavailable` / network errors: verify service/network, browser console and Firebase console.

Note: initialization alone **does not prove** a live Firestore connection; the server read does.

## 4. Local rules tests

Run `firebase emulators:start --only firestore,auth` for local security-rule tests. Before allowing any private writes, test unauthenticated users, customer identities, staff roles, refunds, price overrides, POS payments and cross-user access.

## 5. Recommended migration (not implemented)

- Stage 1: Firebase project, web config, tests and restrictive rules (this branch).
- Stage 2: Verified Firebase Auth and per-role claims for Super Admin, Manager, Baker, Delivery and Sales Staff; don't trust UI-only role flags.
- Stage 3: Design immutable order/payment/refund ledger with idempotent IDs, audit history and server-side total validation.
- Stage 4: Controlled one-time migration with count and amount reconciliation from existing production sources.
- Stage 5: Switch selected reads/writes behind a feature flag, monitor receipts/POS, then retire legacy writes only after parity tests.
- Stage 6: Add Expo/mobile Firebase support separately, with its own SDK installation and credentials.

**Never** let a public browser write confirmed COD payments, costs, inventory or refunds without verified authorization and server-side rules. Avoid mirroring the same order independently from the browser to two databases: dual writes can diverge if one succeeds and the other fails.
