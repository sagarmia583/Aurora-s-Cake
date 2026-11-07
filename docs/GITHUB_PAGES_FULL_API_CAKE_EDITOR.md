# Aurora's Cake — GitHub Pages + Google Sheets / Apps Script

## Confirmed hosting decision
Cloudflare is not used. No Cloudflare Worker, token, account ID, worker deployment action, or Cloudflare API origin is required.

## Current architecture
- Customer website: GitHub Pages, deployed from main with the GitHub Pages Actions workflow.
- Public catalogue: existing Google Apps Script /exec public endpoint backed by the original Google Sheet.
- Cake editor: same authorized Staff Website Manager; edits map to products, product_variants and flavors in that Sheet. No new Sheets or columns.
- Checkout, password login, authenticated Staff CMS edits: the existing Apps Script R5 endpoint implements these actions on the server, but GitHub Pages itself cannot host a secure same-origin POST proxy. Direct cross-origin POST to Apps Script cannot be assumed to produce a readable acknowledgement in a browser. The GitHub Pages build therefore stays read-only until a supported non-Cloudflare transport is implemented and end-to-end tested.

## Next implementation choice
To run customer checkout and staff/admin edits on GitHub Pages without Cloudflare, use a separately verified, secure backend transport. Potential non-Cloudflare choices include an Apps Script HTMLService bridge with origin-validated postMessage and server-side authorization, or a hosted backend endpoint where the owner explicitly approves it. Do NOT silently enable 'no-cors' or GET-based mutation, and do not use unverified writes that can cause duplicate orders.

## Automatic Pages updates
Repository Settings > Pages > Source: GitHub Actions.
Main branch commits trigger the 'Publish Aurora's Cake to GitHub Pages' workflow and publish the built Vite app.

## Quick Cake Editor
Staff > Website Manager > সহজ Cake Editor:
- Select an existing cake or create a new cake.
- Select or create flavours.
- Add one or more sizes.
- Specify per-size Regular Price and Discount Price.
- Save to the original products/product_variants/flavors tables.
- Confirm a CMS write with the server and read it back before treating it as complete; multiple size writes may save partially after a network error.

## Safeguards
Do not place Google credentials, staff tokens or secret keys in client-side VITE_* variables. Never infer that a browser 404/opaque response means an order was not created. Test staff authorization and exact-once checkout before accepting live orders.
