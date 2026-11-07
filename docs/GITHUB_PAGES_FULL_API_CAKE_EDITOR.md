
# Aurora's Cake — GitHub Pages API + Quick Cake Editor

## Implemented
- The public GitHub Pages React/Vite frontend remains at https://sagarmia583.github.io/Aurora-s-Cake/.
- A dedicated Cloudflare Worker named aurora-gh-pages-api securely relays the existing public catalogue, health, images and allowlisted POST actions to the ORIGINAL Apps Script R5 /exec. The Apps Script backend remains the authority for staff authorization, orders, COD, prices, and other writes. No new Sheet or Apps Script deployment is necessary.
- The Pages frontend refuses to submit orders or staff writes until an explicitly configured HTTPS Worker origin passes strict hostname validation.
- Staff Website Manager and Live Shop Manager get "সহজ Cake Editor" with cake selection/new cake, flavours, sizes, per-size regular and offer prices, plus new flavour creation; existing Products/Variants/Flavours tables stay intact.

## ONE-TIME USER SETUP
1. GitHub repository Settings > Pages > Source: GitHub Actions.
2. Cloudflare account: create a scoped Workers Scripts edit API token. Store only in GitHub repository Settings > Secrets and variables > Actions > Secrets as CLOUDFLARE_API_TOKEN. Store your real Cloudflare account ID in the same Secrets area as CLOUDFLARE_ACCOUNT_ID. NEVER share the token in chat or commit it.
3. On main: GitHub Actions > Deploy Aurora GitHub Pages API Worker > Run workflow. The workflow skips deployment (does not silently fail open) if those two GitHub Secrets are absent.
4. Open the workflow log and verify the actual deployed workers.dev URL (often https://aurora-gh-pages-api.<YOUR_WORKERS_SUBDOMAIN>.workers.dev). Do not guess the subdomain.
5. GitHub repository Settings > Secrets and variables > Actions > VARIABLES: add AURORA_PAGES_API_ORIGIN = the VERIFIED Worker origin URL (no /api/ suffix).
6. Actions > Publish Aurora's Cake to GitHub Pages > Run workflow, branch main. After this, any subsequent main branch push triggers a Pages frontend build with the configured public Worker origin.

## Verification BEFORE LIVE CUSTOMER ORDERS
- GET Worker /api/backend-health must show ok:true, database_backend:google_sheets, up_to_date:true and writes_frozen:false.
- GET Worker /api/public must provide public catalogue only; no private orders/staff accounts.
- Login as authorized staff through GitHub Pages; verify session role, and safely edit/reload a harmless website text.
- Use the Easy Cake Editor to verify an existing cake's sizes and prices, then make a controlled change and inspect the original Google Sheet.
- For checkout, place a controlled test order with a unique reference, and confirm it appears exactly once in the original orders table. After an uncertain network response do not generate a new order reference, because that could create a duplicate.
- Verify real mobile viewports, actual rider permissions, COD cash acknowledgment and receipt access before inviting regular customers.
- If any transactional check fails, remove AURORA_PAGES_API_ORIGIN, rerun Pages build to restore read-only mode while debugging.

## Important technical limitations
- GitHub Pages hosts static assets and cannot itself run a secure API. Cloudflare Worker must be deployed and connected.
- Cross-origin CORS/Origin restrictions are not user authentication; staff authorization remains inside Apps Script.
- Cake Editor writes several rows sequentially. On failure, a new product stays hidden and the editor reports partial writes. Check the original Sheet before retrying; do not clear historical data.
- The existing mobile Admin / Rider PR #47 is still a separate draft. This work does not silently merge it.
- No Supabase, Firebase, Google service credentials or Cloudflare token is ever required in public VITE_* settings.
