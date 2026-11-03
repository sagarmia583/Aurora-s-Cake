# Website and staff app check — 1 November 2026

The live storefront and public backend are reachable, and the website and both mobile platforms produce bundles. There are confirmed customer-profile, mobile authentication, and transaction-confirmation defects that should be fixed before treating the staff app as production-ready.

Scope: current local source, automated checks, the deployed Cloudflare storefront, and public read-only API endpoints. Source was inspected without changing application code. No real order was submitted, staff account changed, message sent, or deployment performed. The temporary browser basket was emptied after checking checkout.

## Priority findings

### 1. P1 — Failed admin login creates a local super-admin session

Location: `apps/staff-mobile/App.tsx:790` and `:819`.

If `login()` rejects and the supplied username is `admin`, the catch handler calls `quickAdminAccess()`. That function fabricates a `super_admin` identity and token instead of retaining the login failure. Any password of at least four characters reaches this path, including when the real backend correctly rejects it or the network is offline.

This grants access to the privileged local interface and can make previously cached information accessible on a shared device. It does not demonstrate a server authentication bypass: the fabricated token fails the native API's token validation and should be rejected by the backend. It nevertheless defeats the app's login boundary and combines dangerously with the false-success handlers below.

Recommended fix: remove the fallback from production login and require a server-verified session before opening staff screens. Any deliberate demonstration mode needs explicit separation and must not load private caches.

### 2. P1 — Mobile sales can appear completed without a saved order

Locations: `apps/staff-mobile/App.tsx:1195`, `:1222`, `:1231`, and `apps/staff-mobile/src/modules/PosModule.tsx:148`.

Manual order creation inserts a synthetic order, closes the dialog, announces success, and clears fields before the POST completes. Its request failure is swallowed. POS similarly inserts a synthetic paid/delivered order before calling the backend and catches the backend error without propagating it. The POS component consequently clears the basket and shows a completed sale even when persistence failed.

The submitted payload also diverges from the displayed financial record: `buildSheetOrderPayload()` always sends `payment_method: 'cod'` and does not carry the UI's advance payment, paid/delivered status, payment selection, or manual discount. Callers construct variant IDs using `${productId}-1lb` instead of selecting an actual catalogue variant. An accepted order can therefore differ from the displayed receipt, while an invalid variant or pickup option can reject the request entirely.

Recommended fix: build a supported, validated staff/POS payload from actual variants, await persistence, verify the authoritative receipt, and only then update the list, clear input, and show success. Preserve the request identity and form contents after uncertain failures.

### 3. P1 — Mobile staff and catalogue operations acknowledge failed writes

Locations: `apps/staff-mobile/App.tsx:1265`, `:1289`, `:1319`, `:1352`, `:1375`, and `:1387`.

Staff creation, account activation/deactivation, password reset, and custom quotation handlers show success before server acknowledgement and discard errors. A manager can believe a staff account was disabled or a password reset when the backend did neither. Stock and product edits likewise update local data while hiding rejected writes. Product editing changes name and weight locally but only submits a price update to the backend.

Recommended fix: await each API call and surface failure; only commit the authoritative result and success notification after confirmation. Send all supported edited fields and retain unsaved input on failure.

### 4. P1 — Customer profile save calls an undefined function

Locations: `src/components/CustomerProfileModal.tsx:34`, `:51`, and `:395`.

The component calls `getSavedCustomerDirectory()` and `privatePost()` without importing or defining them. The directory reference is inside a swallowed exception, so the intended fallback silently does nothing. Profile saving with a configured endpoint reaches the uncaught `privatePost` reference before the account-update call, preventing that save from completing normally.

Recommended fix: import the intended directory helper and use the existing supported customer transport for the contact submission. Ensure account-profile persistence completes and errors are visible.

### 5. P2 — Multiple product images fail on the deployed website

Observed at [the live storefront](https://aurora-s-cake.sagarmia583.workers.dev/).

During browser inspection, 13 image elements reported complete loading with `naturalWidth === 0` across 11 distinct image URLs, including the chocolate, red velvet, orange, lemon, blueberry, strawberry, bento, and cupcake images. The chocolate product dialog visibly showed a blank image area and broken-image indicator. The corresponding JPEG files exist locally, so the cause needs to be checked against the deployed static assets and their responses; it was not established in this audit.

Evidence: [product-dialog screenshot](audit-product-image-2026-11-01.jpg).

### 6. P2 — Website type-check and regression tests need repair

`node node_modules/typescript/bin/tsc --noEmit` fails for the missing customer-profile references and their resulting type errors, plus a split-payment type mismatch at `src/components/admin/PosModule.tsx:127`: payment methods are inferred as `string` instead of `AccountType`.

The full automated suite exits unsuccessfully. A focused follow-up covering checkout durability, migration freeze, and four mobile test files reports **29 passed / 3 failed**:

- The App durability test cannot compile its isolated harness because its mocks omit `getStaffOrders`, `staffOrderToOrder`, and `loadStaffCredential`. See `tests/checkout-durability.test.tsx:236` and `:239`.
- Two migration-freeze tests use `0000000000`, which current phone validation correctly rejects before submission. A temporary copy replacing that fixture with `01700000000` passes **all four migration-freeze tests**. Original tests were left unchanged.

These three reproduced test failures are test-maintenance issues, not evidence by themselves that live checkout durability is broken. The underlying runtime findings above are independent of those tests.

## Verification results

| Check | Result | Evidence / limitation |
|---|---|---|
| Live storefront | Pass for inspected UI | Catalogue renders 13 products; customization opens. |
| Variant pricing | Pass | Chocolate half-pound selection shows ৳380; one-pound shows ৳750. |
| Basket and checkout opening | Pass | One-pound item enters basket; COD checkout shows ৳750 + ৳60 delivery = ৳810. No order submitted. |
| Public catalogue API | Pass | `/api/public` returns HTTP 200, `ok: true`, 13 products. |
| Backend health | Pass | `/api/backend-health` returns HTTP 200, `up_to_date: true`, `database_backend: google_sheets`, `writes_frozen: false`. Installed and expected release: `aurora-2026-10-30-supabase-store-r3`. |
| Website production build | Pass with warning | `npm run build` succeeds; some chunks exceed 500 kB. Vite build does not establish TypeScript correctness. |
| Website TypeScript | Fail | Missing customer-profile references and POS payment split typing. |
| Full automated suite | Fail | Focused reproduction and fixture diagnosis described above; no full-suite pass claimed. |
| Mobile TypeScript | Pass | Mobile `tsc --noEmit` succeeds. |
| Android export | Pass | Expo exports a Hermes bundle, 651 modules. Initial sandbox temp-write failure resolved by an approved rerun. |
| iOS export | Pass | Expo exports a Hermes bundle, 653 modules. |
| Real Android/iPhone execution | Not checked | No physical-device session or signed APK/IPA tested. Bundle export is not a signed native build. |
| Authenticated staff and real COD flow | Not checked live | No staff credentials used or real transactions created. Backend behavior was assessed through source and automated tests. |

This checkout is not a Git repository (`git status` returns “not a git repository”), so local source could not be compared to a commit or verified as matching the deployed frontend. The backend's own release check did match.

## Recommended repair order

1. Remove the mobile admin-login fallback.
2. Make order, payment, staff-management, and catalogue success depend on verified server acknowledgement; correct the native payload mapping.
3. Repair customer-profile transport/imports and clear the website type errors.
4. Diagnose deployed product-image responses and restore the images.
5. Repair stale test fixtures/mocks, rerun CI, then perform the real staff-to-kitchen-to-rider COD acceptance flow on Android and iPhone.
