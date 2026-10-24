# Aurora’s Cake

A responsive forest-green, pistachio and apricot bakery storefront using locally hosted Roboto, built with React, TypeScript, Vite and Tailwind CSS.

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

## What works

- Search, category filters and sorting by the cheapest available cake variant
- Cake size, flavour, add-ons, dedication, quantity and live pricing
- Persistent cart, demo checkout, coupons, tracking and reorder
- Custom design requests and a local customer profile
- Existing studio, kitchen, rider and optional Supabase tools, accessible from Studio

## Google Sheets content
The public website can load its business identity, contact information, links, images, text, catalogue, sizes, add-ons, delivery options and FAQs through the configured Apps Script endpoint. Open **Studio → Google Sheets content** for connection status, manual refresh and setup code.

Follow apps-script/README.md to authorize your account, seed public tables and deploy the read-only endpoint. A sign-in page is never treated as a successful API response. The website uses its last validated snapshot or built-in preview content until the endpoint succeeds; Studio clearly identifies the source and connection state.

Edit business details in settings; marketing copy and section images in content; hero slides, highlights, FAQs and links in their respective tables. The visible page refreshes every minute and on window focus/connection recovery. A successful response is validated and cached. Empty tables stay empty; malformed responses never replace a valid snapshot. An updated catalogue reprices the cart and reports changed/unavailable selections before checkout.

The API exposes only allowlisted public fields. It has no public write operation and does not read orders, customer profiles, addresses, delivery OTPs, staff data, audit logs or custom requests. Customer checkout remains a separate local demonstration.

## Preview data

Checkout and custom requests currently use the local mock database. No payment is collected and no real order or notification is sent. The demo does not authenticate staff; Studio role switches are demonstration controls. Before a real customer launch, configure verified business contacts, real product photos and descriptions, authenticated staff access, a durable order service, and a payment integration.

The former SweetDelight branding and placeholder contact links have been removed from the rebuilt storefront. Stored data from a previous version in the same browser may still use its old catalogue or settings. Fresh browsers start with the Aurora catalogue and an empty order history.

Photography is illustrative catalogue imagery. Source references and the generated floral cake provenance are in `public/images/image-sources.md`.
