# Aurora's Cake — Vercel Hobby (Free) deployment

This repository is a **Vite + React** storefront with a Google Sheets +
Apps Script cash-on-delivery backend. No paid API or payment gateway is needed
for the supported COD flows. Vercel Hobby and Apps Script usage limits apply.

## 1. Use the correct website domain for Google Sign-in

In [Google Auth Platform → Clients](https://console.cloud.google.com/auth/clients),
edit the **Web application** client `Aurora's Cake - Web Login`. Under
**Authorized JavaScript origins**, add the exact origin shown under your
**Vercel Project → Domains**:

```text
https://YOUR-VERCEL-PROJECT.vercel.app
```

Do not include a slash, a path, or `/api/operations`. The previous
`https://aurorascake.netlify.app` origin **does not authorize a Vercel
deployment**. Add the actual Vercel production domain, and test the exact
preview domain separately when Google sign-in on preview is needed (preview
URLs can change). The current Google Identity Services callback sign-in
does not need a redirect URI.

If Google Auth Platform → Audience is in **Testing**, authorize the staff
and customer test Gmail accounts there before trying login.

The **public Google OAuth Client ID** is already included in the frontend
and the all-in-one Apps Script. It is not a password. **Never upload a
Client Secret or an OAuth credentials JSON file to GitHub or your Vercel
frontend.** If a Client Secret was shared, rotate it in Google Cloud.

## 2. Install ONE Apps Script file

- Back up the existing shop Google Sheet.
- In the Google Apps Script project, paste the entire
  [Code.AllInOne.gs](../apps-script/Code.AllInOne.gs) into a **single
  `Code.gs`**. Remove duplicate older `.gs` modules.
- Check the configured spreadsheet ID belongs to your shop.
- From the Apps Script editor, manually run `setupAuroraOwnerOnce()` with
  the intended owner Google account (it will refuse to overwrite an
  existing staff list). Check `AURORA_STAFF_USERS` in **Script Properties**,
  adding authorized chefs, dispatchers, and riders if needed.
- Deploy the Google Apps Script Web App as a **New version**, running as the
  owner with the access needed for public guest COD checkout.
- Copy the **real** Apps Script Web App URL ending in `/exec`. Do not reuse
  a stale URL merely because it is present in repository examples.

## 3. Vercel Project → Settings → Environment Variables

Configure these in the **Production** environment (and separately in
**Preview** if testing PR deployments):

| Key | Value |
| --- | --- |
| `VITE_GOOGLE_OAUTH_CLIENT_ID` | Your **public** Google OAuth Web Client ID (the source also has a public fallback) |
| `VITE_GOOGLE_SHEETS_URL` | The latest Google Apps Script `https://script.google.com/macros/s/.../exec` URL |
| `VITE_SHEETS_POST_PROXY` | `/api/operations` |
| `AURORA_SCRIPT_POST_URL` | The **same** latest Google Apps Script `.../exec` URL, for the Vercel Function |

**Do not add the Client Secret**. The first three `VITE_` variables are
embedded in browser JavaScript, while `AURORA_SCRIPT_POST_URL` is read by
the Vercel serverless function. Only the Google Web Client ID, not the
secret, should be on the browser.

The repository includes:

- `api/operations.js` — a Vercel Function at `/api/operations`;
- `vercel.json` — Vite SPA routing, explicit API route, function duration
  and security headers.

The POST endpoint uses the existing server-side Google Sheet validations and
rate limiting. It rejects unrecognized actions and only forwards to a fixed
Google Apps Script host. It should prevent typical browser CORS problems,
but production network behaviour must still be tested.

> No Netlify variable or Netlify Function needs configuration on Vercel.

## 4. Redeploy and verify before merging

GitHub changes in **Draft PR #2** are not present on the default `main`
production deployment until you intentionally test/merge/deploy them.
If Vercel is linked to GitHub, use the Preview deployment for the PR
branch, then redeploy Production from `main` after review and tests.

A normal **GET** to `/api/operations` should return HTTP **405**; this
means the Vercel function is reachable (it accepts POST only). A **404**
or an HTML storefront page at that path means the function routing or
Vercel project Root Directory needs checking.

Use the detailed [Live Operations Setup](LIVE_OPERATIONS_SETUP.md) checklist
for a real end-to-end test:

1. Guest places a **COD** order, receiving a confirmed, private receipt.
2. Owner logs in via Google and confirms the order.
3. Kitchen prepares and marks it ready.
4. Dispatch assigns a real allowlisted rider; rider picks up and dispatches.
5. Customer sees the OTP **only after dispatch**, and rider confirms
   full COD cash collection and OTP before setting `delivered`.
6. Repeat as an unauthorized Gmail account and with invalid OTP to verify
   enforcement; confirm no duplicate rows on retries.

This is a free-tier implementation, not a claim of unlimited free usage or
a completed live Google OAuth/Apps Script acceptance test.
