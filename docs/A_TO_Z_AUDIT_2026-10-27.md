# Aurora's Cake — A–Z Code & Operations Audit

**Date:** 2026-10-27 (BDT)  
**Scope:** `feat/passwordless-customer-order-panel`, Draft PR #4, Vercel routes, Apps Script modular + AllInOne, phone-only customer tracking, checkout/cart, staff permissions, courier/COD, finance, CMS, product pricing, coupons and mobile.  
**Verification boundary:** Static inspection of GitHub source + GitHub Actions automated tests + Vercel deployment metadata. **No authenticated production/staging browser, real customer orders, private Google Sheets, actual cash deposits, Google login or mobile device acceptance tests were executed.** `READY` on Vercel is a build/deployment state, not proof the Apps Script API is installed.

## 1 — Confirmed code defects fixed during this audit

| Severity | Issue | Evidence | Change |
| --- | --- | --- | --- |
| High | Restricted kitchen employee's successful `staff_mutate` returned unredacted customer phone/address even though `staff_orders` redacted them. | `apps-script/StaffOperations.gs`, post-mutation safe receipt | Sanitization now matches read permissions in both modular + AllInOne; regression test added. |
| High | Changing the phone while a previous tracking request was in flight could render the prior number's order status after the input changed. | `src/components/PhoneOrderTracking.tsx` asynchronous `search` | Latest-request ID cancels stale results, loading and browser storage changes. |
| High | An uncertain COD checkout stored its request ID/proof only in a React ref. Browser refresh could drop the original reference and prompt a new order instead of a same-ID retry. | `src/components/CheckoutModal.tsx`, `src/services/googleSheetOrders.ts` | Session-scoped pending attempt with validation; exact existing request/body restored and retried. Test added. |
| High | On initial load, a temporary bundled/demo catalog could reconcile against and delete real cakes restored from localStorage. | `src/App.tsx`, `src/services/reconcilePublicCart.ts` | Reconcile saved items only against a validated live or saved Google Sheets catalog. |
| Medium | Manager/admin was shown delivery actions on someone else's assigned order; backend then correctly denied the action. | `src/components/StaffPortal.tsx` vs `auroraOperationsPost_` | Only matching assigned staff receives the actionable controls; unit test. |
| Medium | Rider picker automatically preselected the first eligible member, potentially the owner or manager. | `src/components/StaffPortal.tsx` staff sign-in and rider selection | Explicit rider selection now required; reset after assigning. |

**Residual:** A pending checkout can survive refresh only when same-tab sessionStorage is writable. If browser storage is blocked/cleared, no persistent retry data can be guaranteed. Manual testing still required.

## 2 — Open high-priority product, privacy and financial risks

| Priority | Area | Finding | Proposed acceptance fix |
| --- | --- | --- | --- |
| P0 privacy | Phone-only tracking | Phone-number knowledge alone exposes limited status **and itemized cake/price/total**, without phone-ownership verification. Current per-number cache throttle (15 checks/10 minutes) does not enforce a global per-user/IP limit; enumeration may still be possible. | Decide whether to keep itemized information public; for truly private full details, verify number ownership or use a private receipt token. |
| P1 financial | Daily cash deposits | The debit is idempotent **by request UUID**, not proof of physical handover. Refreshing/creating a new UUID for the same physical deposit can record two debits. No receipt number, sign-off, correction journal or dual approval. | Immutable cash receipt/settlement ID, two-sided reconciliation and reversal-only corrections; daily rider/manager sign-off. |
| P1 pricing | Product-wide base markdown | Fixed taka markdown (`base_price - sale_price`) is subtracted from each size, floored at zero. A large markdown can make a small variant zero-priced. | Server/CMS cross-validation against all active variants; explicit pricing policy and boundary tests before publishing discounts. |
| P1 customer history | Phone tracking | API only returns latest **10** matching orders; customers with >10 cannot navigate to older orders from this endpoint, notwithstanding individual tracking cards. | Cursor/pagination with appropriate security/rate controls. |
| P1 staff history | Staff orders | API limits output to latest **100** orders, no server cursor/date-based archival query. | Paginated staff history, query by order reference/date and status. |
| P1 resilience | Staff orders | One malformed `receipt_json` marks `snapshot_complete:false`; UI refuses whole snapshot, leaving orders stuck on old cached data. | Quarantine bad rows, provide staff error banner + safe partial rows/recovery queue rather than disabling all operations. |
| P1 finance | Ledger source | Collected balance is **reconstructed from mutable order receipt JSON** and deposited amounts. Manual Sheet edits, receipt corruption or retroactive COD adjustments can change reported balance without immutable journal. | Append-only COD credit/debit/reversal ledger + daily reconciliation and variance alarm. |
| P1 deployment | Separate backend | GitHub/Vercel changes **do not deploy Apps Script automatically**. R6 staff permissions depend on owner-run `setupSheetDatabase()` (new permissions header) and publishing a new Apps Script deployment. | Stage backup/migration/deploy/health check + end-to-end test, then web release. |

## 3 — Medium-priority product and operations gaps

1. **Coupon operations:** `usage_count` exists in the catalog and appears in responses but normal COD order commit does not increment it. No coupon expiry window, global maximum uses or per-number redemption limit exists in the current Sheets schema. A visible active code may fail its minimum amount at checkout; preselected homepage coupon doesn't actively validate minimum before submitting.
2. **Historical costing:** Product/variant ingredient cost is a current editable recipe, not an immutable cost snapshot per delivered order. Estimated margin excludes overhead, wastage, rider pay, refunds and promotion economics.
3. **Customer identity:** Browser phone-only tracking is intentionally *not* authentication. Full address, custom writing, and private receipt details remain device-specific. Clearing localStorage removes the easy full-receipt path.
4. **Legacy customer passwords:** Old `customer_phone_signup/login/password` backend routes still exist even though new customer UI removes passwords. Before disabling or removing, audit any legacy accounts/sessions needing migration.
5. **Staff migration:** Owner-controlled UI edits **username/password staff accounts**. Google-allowlisted staff are still maintained via Script Properties and do not have per-user checkbox editing through Staff & Access.
6. **Permissions UX:** A staff member can be granted an operation without `orders_view`, resulting in permission that is not usable via UI. Add dependency warnings/presets.
7. **Delivery evidence:** OTP was intentionally removed; signed-in, assigned staff only self-check handover and COD cash. No photo/signature/customer acknowledgment or dispute flow.
8. **Rider reassignment:** `assign` is only valid from `ready`; after assignment, there is no safe built-in reassignment for an unavailable rider.
9. **Date/capacity checks:** Basic future delivery date and slot checks are present; no real bakery capacity/holiday blackout/lead-time booking limit is modeled.
10. **Photo upload:** CMS relies on browser-side `createImageBitmap`/canvas compression and Apps Script free upload; some browsers/devices or images may fail. Needs Safari/iPhone and slow-network acceptance.
11. **Staff credentials:** Username/password authentication uses iterated salted SHA-256 rather than a contemporary dedicated slow password KDF. Owner Google ID login is separate. Limit exposure and plan stronger long-term auth.
12. **Operations scaling:** Phone lookup scans all order phone/status columns; staff queue parses every private order; finance reloads orders + deposits + recipe rows. Large Sheet growth and 8–20s staff polling can hit Apps Script execution/quota limits.
13. **Observability/backups:** A comprehensive exception log, alerting, daily Sheet backups, rollback procedure and orphaned/inconsistent order-item repair report are not fully automated.
14. **Order stages:** Customer progress graphic derives completed stages from current status, even if historical imports skipped a stage; timestamped true audit events should be authoritative.
15. **Coupon/promotion UI:** Discount badge describes the cheapest active variant, so variant-specific promotions on other sizes can go unnoticed.

## 4 — Test matrix required before any production merge

- **Checkout:** one normal COD; invalid/expired coupon; markdown too large; network timeout; refresh while POST in-flight; same-ID retry; zero/two order duplication check by Google Sheet request ID; invoice totals verified.
- **Customer:** 0, 1, 4 and >10 matching phone orders; number switch during delayed response; refresh; another device; no private address/OTP in anonymous JSON; clear storage scenario.
- **Staff:** employee new/disable/permission revoke/login again; assigned and unassigned Manager delivery; bad permission matrix; denied access to customer phone/address in both GET list and mutation response.
- **Delivery/Cash:** COD amount + rider credit matches confirmed delivered order; partial daily deposit; same-ID replay; new-ID accidental duplicate prevention; incorrect rider, lost parcel, canceled delivery; daily receipt and sign-off.
- **Costing:** multiple sizes, ingredient unit conversion, update/archive, duplicate ID, cost > price, price markdown + coupon affects margin; historically delivered order cost unchanged.
- **CMS:** Create/edit/archive and image upload on Chrome, Safari and iPhone; public refresh; discount and coupon visible; checkout authoritative values match.
- **Reliability:** 100+ order staff history, corrupt JSON in one record, 1000+ order phone query, API timeout, Google quota, simultaneous admin+rider actions, rollback of wrong release.
- **Deployment:** compare Vercel Preview SHA to PR HEAD, `/api/backend-health` R6 `up_to_date:true`, Apps Script version and migration report; only then consider merge.

## 5 — Release decisions

- **Do not merge or roll out production** merely because GitHub Actions and Vercel deployment both say success.
- Backup Sheets first; deploy R6 AllInOne to script project, run `setupSheetDatabase()`, publish `New version`, verify environment and acceptance with **staging/test orders and test money only**.
- Consider actual phone number privacy and immutable cash ledger top priorities ahead of broad marketing launch.
- Latest audit fixes remain isolated to Draft PR #4 and are not a claim that any existing real order, staff account or balance was changed.
