# Aurora’s Cake

A responsive forest-green, pistachio and apricot bakery storefront using locally hosted Roboto, built with React, TypeScript, Vite and Tailwind CSS.

## Current production deployment — Netlify + Google Sheets only

The owner-selected deployment is **Netlify**. The only operational datastore is
**Google Sheets**, accessed through **Google Apps Script**. The browser and staff
web portal use Netlify same-origin functions `/api/public` (GET) and
`/api/operations` (POST); Apps Script remains the authoritative validator and
writer. Do **not** enable Cloudflare Workers, D1/R2, Supabase or Firebase as
production backends. Old source and migrations are retained solely as historical
references; they are not part of this Netlify deployment.

Set `AURORA_SCRIPT_POST_URL` in the Netlify dashboard to the approved existing
Apps Script `/exec` endpoint (server-side variable; never a client secret).
The Netlify build config sets `VITE_SHEETS_POST_PROXY=/api/operations` and
turns alternate datastore flags off. Keep the public `VITE_GOOGLE_SHEETS_URL`
pointing at the same Apps Script deployment. See
[Netlify + Sheets production checklist](docs/NETLIFY_SHEETS_ONLY_2026-11-04.md).

A GitHub commit or Netlify deploy does not publish Apps Script. Deploy the updated
Apps Script bundle separately after a private backup and staging acceptance tests.

## Run locally

```sh
npm ci
npm run dev
```

## Verify

```sh
node node_modules/typescript/bin/tsc --noEmit
node node_modules/tsx/dist/cli.mjs --test tests/*.test.ts tests/*.test.tsx
npm run build
```

## Implemented flows

- Search, category filters and sorting by the cheapest available cake variant
- Cake size, flavour, add-ons, dedication, quantity and live pricing
- Persistent cart, cash-on-delivery Sheet orders when enabled, local preview checkout, coupons, receipts and reorder
- Real custom design quotation requests in a private Sheet, reviewed by authenticated staff; local preview remains a fallback
- Free Google customer account linking and cross-device order recovery for explicitly linked receipts
- Verified Google staff sign-in for live COD order confirmation, kitchen status, rider assignment, and OTP/COD delivery
- Verified staff management for live product visibility/prices, shop order toggles, custom cake quotes and rider operations
- Developer-only mock Studio and optional legacy Supabase tools (not production order management)

## Google Sheets content
The public website can load its business identity, contact information, links, images, text, catalogue, sizes, add-ons, delivery options and FAQs through the configured Apps Script endpoint. For production, configure the endpoint with `VITE_GOOGLE_SHEETS_URL`; developer Studio provides connection status and manual refresh only during development.

Follow apps-script/README.md to authorize your account, create the public content and private order tables, then deploy the current endpoint. A sign-in page is never treated as a successful API response. The website uses its last validated snapshot or built-in preview content until the endpoint succeeds; Studio clearly identifies the source and connection state.

Edit business details in settings; marketing copy and section images in content; hero slides, highlights, FAQs and links in their respective tables. The visible page refreshes every minute and on window focus/connection recovery. A successful response is validated and cached. Empty tables stay empty; malformed responses never replace a valid snapshot. An updated catalogue reprices the cart and reports changed/unavailable selections before checkout.

Public GET responses expose only allowlisted website content and never include private order/customer records. The separate create_order POST validates current Sheet options and prices, accepts cash on delivery, and stores an order plus item rows in private orders/order_items tabs. A stable request ID makes uncertain retries idempotent. The client shows success only after a confirmed persisted receipt.

Install the matching current Apps Script modules or the combined installer, run the relevant non-destructive setup functions, then deploy a new Apps Script version. Until the endpoint advertises order_submission_enabled, checkout remains an explicit local preview. A fresh order-enabled response activates Sheet checkout. Receipts are cached on the ordering device. Once the new StaffOperations.gs is deployed, staff orders stay private and customer receipt tracking polls a narrow POST status endpoint by the original receipt ID and checkout phone.

## Production staff operations

Use **Staff login** for live operations and **My Google orders** for optional customer receipt linking/recovery. Deploy all current Apps Script files (including `CustomerAccounts.gs`, `LiveCatalog.gs` and `CustomCakeRequests.gs`) alongside `Code.gs` and `SeedData.gs`; configure the Google OAuth client ID and private staff allowlist. Full instructions and end-to-end validation: [Live Operations Setup](docs/LIVE_OPERATIONS_SETUP.md). This is **not** automatically deployed just because GitHub is updated.

## Preview data

When the configured endpoint supports live COD checkout, custom cake requests are submitted to the private Sheet and quoted by authorized staff. Without a live endpoint they remain explicitly marked local previews. Studio developer tools use the local mock database. Studio role switches are developer-only demonstration controls and exclude real Sheet receipts. The authenticated Staff Portal reads/writes real private Sheet orders; its updates can refresh the customer's original device-held receipt during tracking. Cross-device recovery uses free, verified Google accounts for explicitly linked receipts; a phone number alone is not a verified login. Online payment is not supported: cash-on-delivery only, with optional custom-cake quotation requests. No paid SMS or payment gateway is required.

The former SweetDelight branding and placeholder contact links have been removed from the rebuilt storefront. Stored data from a previous version in the same browser may still use its old catalogue or settings. Fresh browsers start with the Aurora catalogue and an empty order history.

Photography is illustrative catalogue imagery. Source references and the generated floral cake provenance are in `public/images/image-sources.md`.

## Android + iOS Staff Application (Expo)

The separate native Staff app is in [apps/staff-mobile](apps/staff-mobile/README.md).
It uses the existing role-verified Apps Script backend through the Cloudflare `/api/operations` API,
with employee Username/Password, encrypted native session persistence,
Kitchen, Rider, COD OTP and staff-specific permissions.

The app runs the same authenticated Staff Portal as the website, including the
website CMS, costings, team, custom cakes, order workflow and print layouts.
Both clients use the existing Google Sheets backend. The old native prototype
is retained as `NativeStaffPreview.tsx` and is not the running entry point.
This source is **not** a signed APK/IPA. The current Cloudflare Worker must expose
the matching website and `/api/operations`. See the app README for local preview,
Expo SDK 58, Android APK and iOS test/build instructions.

## Firebase (optional foundation)

See [Firebase setup instructions](docs/FIREBASE_SETUP.md). The current order/staff backend remains unchanged. After creating a Firebase project and deploying restrictive rules, set the Firebase Vite environment variables and visit `/?firebase-check=1` to run a read-only server connectivity check. This is not a migration of existing production data.
