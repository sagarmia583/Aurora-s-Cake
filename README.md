# Aurora’s Cake

A responsive cream-and-blush bakery storefront built with React, TypeScript, Vite and Tailwind CSS.

## Run locally

```sh
npm ci
npm run dev
```

## Verify

```sh
node node_modules/typescript/bin/tsc --noEmit
node node_modules/tsx/dist/cli.mjs tests/order-pricing.test.ts
npm run build
```

## What works

- Search, category filters and sorting by the cheapest available cake variant
- Cake size, flavour, add-ons, dedication, quantity and live pricing
- Persistent cart, demo checkout, coupons, tracking and reorder
- Custom design requests and a local customer profile
- Existing studio, kitchen, rider and optional Supabase tools, accessible from Studio

## Preview data

Checkout and custom requests currently use the local mock database. No payment is collected and no real order or notification is sent. The demo does not authenticate staff; Studio role switches are demonstration controls. Before a real customer launch, configure verified business contacts, real product photos and descriptions, authenticated staff access, a durable order service, and a payment integration.

The former SweetDelight branding and placeholder contact links have been removed from the rebuilt storefront. Stored data from a previous version in the same browser may still use its old catalogue or settings. Fresh browsers start with the Aurora catalogue and an empty order history.

Photography is illustrative catalogue imagery. Source references and the generated floral cake provenance are in `public/images/image-sources.md`.
