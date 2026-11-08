# Aurora's Cake — 11-digit mobile inputs & lightweight runtime

## Scope
No site structure, colors, CSS, product layout, order flow, prices, backend schema, API route, or Google Sheet changes. This is a browser-side performance/input patch intended for the existing Google Sheets + Netlify deployment.

### Mobile input guard
- A shared controlled-input limiter strips non-digits and clamps editable numbers to at most 11 local digits.
- Pasted/typed `+8801…` is canonicalized to `01…`. Bengali numerals are converted to ASCII.
- Applies to Checkout customer/recipient/sender/payment sender, Custom Cake, customer profile/mobile account and legacy customer account.
- The pre-existing final Bangladesh `01[3-9][0-9]{8}` validation remains mandatory at order submission, with optional sender and payment sender verified if provided.
- Existing historical data is not rewritten.

### Runtime lightening
- The **12-second visible-tab Google Sheets polling cadence stays unchanged**, with an in-flight-request guard to avoid duplicate requests.
- Normalized public data is serialized once per response. Identical snapshots no longer trigger a catalogue re-render or synchronous localStorage write on every poll.
- Online status heartbeat is published no more than once per minute on unchanged snapshots; actual fetch attempts remain unchanged.
- Cart reconciliation preserves its existing array references when product, variant, additions and values have not changed; price and availability updates still trigger the normal reprice and notice flow.
- Storefront is React-memoized; App passes stable callbacks so cart, checkout, and background state do not re-render all cake cards.
- Customer Profile no longer fetches remote order history on every partial phone number.

### Validation before release
- Run `npx tsc --noEmit`, `npx tsx --test tests/phone-input-and-runtime-performance.test.tsx`, all existing tests, and `npm run build`.
- Check typing, paste, 11th/12th digit and invalid prefixes in Checkout, mobile account and Custom Cake. Check unchanged products, checkout recovery, COD, saved cart, prices, coupons and free gifts.
- Inspect network calls and render CPU in browser DevTools on a real mid-tier phone before claiming a quantified speedup; automated tests do **not** measure FPS or load-time improvements.
- This PR is a source patch; it does not deploy the site automatically. Netlify auto publishing should remain locked while the owner checks deployment-credit availability.
