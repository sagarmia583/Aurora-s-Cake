# Aurora's Cake — Staff Control Center redesign

## Why the old UI felt difficult

The former Staff Portal put every staff account, role form, private COD order, custom cake quote and full website editor in one long scrolling modal. The most important rider and kitchen actions were buried in lengthy cards, and the Google/employee sign-in form showed several troubleshooting paragraphs before users could work.

## New UX

- **Premium mobile-friendly Control Center** with dark bakery header, owner/employee login selector, large touch targets, compact role badge and consistent cards.
- **Role-aware navigation**: Overview, Orders & Delivery, Custom Cake Requests, Staff & Access, Website Manager. Unauthorized tabs are absent from navigation *and* still blocked by Apps Script authorization.
- **Kitchen / Rider / Order Manager open directly in Orders & Delivery**; Super Admin/Admin see an Overview with operational metrics.
- **Search orders** by order number/customer/phone/address/rider and filter Needs my action, In progress, Finished or All. Actionable orders sort first.
- **Readable workflow**: each order displays status badge, next step, progress strip, delivery slot, COD amount and any permitted phone/address, plus a clear next-action button. Secondary item details expand on demand. Rider has OTP + cash collected step.
- **Feedback**: immediate local update from server-confirmed status, explicit pending-saving button, visible error banner, loading/empty states, and refresh timestamp.
- **Faster loading**: Website Manager and Custom Cake Queue lazy-loaded only when their tabs open. Polling is suspended when users are in Team/Website/Cake management. Visible Rider operations refresh every 8 seconds, other operations every 12 seconds.
- **No new paid service or payment gateway.** Phone/password customers and private Google Sheets order records remain unchanged.

## What has and hasn't been verified

- GitHub CI includes TypeScript, production Vite bundle and unit/integration tests. New sign-in also has server-side render smoke tests.
- **The actual Vercel Free team hit the 100-deployments/day cap (HTTP 402)** when requesting a new Preview deployment. The redesigned commit is currently in GitHub Draft PR #2, not the verified live Preview/production website. After free daily quota resets, deploy this PR commit from Vercel. No paid upgrade is required.
- This interface redesign does **not** redeploy the existing Apps Script Web App or prove the customer's old delivery OTP problem is solved. The current all-in-one Apps Script must be manually deployed by the spreadsheet owner. Test real customer OTP **after dispatch**, COD collection, kitchen/rider stage transitions and customer status syncing on the new deployment.
- Historic orders and Google Sheets content have not been deleted or altered. Avoid merging the PR to production until staff roles and real COD test orders succeed.

## Quick test plan after Preview is available

1. Open Staff Login on both phone and desktop. Employee login should be the default; switching to Shop Owner should initialize Google button.
2. Owner logs in: Overview shows the queue metrics; Orders, Staff, Website Manager and Custom Cakes each open in their own tab.
3. Rider signs in with username/password: only Overview and Orders navigation is available; Orders is selected automatically. Use Pickup → Start delivery → Verify customer OTP with COD collected and verify server-confirmed statuses.
4. Kitchen role opens Orders: confirm that customer address/phone are not returned by backend; use Start baking → Mark ready.
5. Search for an order number, inspect progress and expand item details; confirm status filter and count update when backend changes.
6. Toggle Website Manager and back to Orders: heavy editor should load only when opened, and order polling should resume when returning to Orders.
7. Repeat on 375px mobile viewport; check scrolling, large buttons and OTP input usability.

Files: `src/components/StaffPortal.tsx`, `tests/staff-workspace-ui.test.ts`, `src/components/WebsiteManager.tsx`, `apps-script/Code.AllInOne.gs`.
