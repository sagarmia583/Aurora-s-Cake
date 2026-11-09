# Aurora's Cake

The storefront and authenticated staff portal run on Netlify. The Expo staff app uses the same Netlify API. Google Apps Script reads and writes the existing private Google Sheet.

## Run a production build locally

1. Install the locked dependencies with `npm ci`.
2. Set `AURORA_SCRIPT_POST_URL` in `.env.local` to the existing Apps Script web app `/exec` URL.
3. Build with `npm run build` and run `npm run preview` with the Netlify environment enabled.

```powershell
$env:NETLIFY = 'true'
npm run build
npm run preview -- --host 127.0.0.1 --strictPort
```

Vite serves the built storefront and the same API handlers Netlify runs. The local routes are `/`, `/?staff=1` and `/track-order`. The configured Google Sheet is used for real operations. Automated tests use fixtures without sending orders to the live shop.

## Publish

- Build with `npm run build`, publish `dist`, and load Functions from `netlify/functions`. The repository's `netlify.toml` supplies these settings and skips branch and pull request deploys.
- Set the Netlify production Functions environment variable `AURORA_SCRIPT_POST_URL` to the existing Google Apps Script web app URL.
- Update the current Apps Script web app in place with `apps-script/Code.AllInOne.gs`, preserving Script Properties and the original Sheet. For a modular Apps Script installation, remove retired modules and avoid duplicating the combined installer with its separate modules. Existing stores can deploy a new version without rerunning database setup.
- Check `/api/backend-health` for the matching release before releasing the storefront.

Run `npm run lint` and `node scripts/build-apps-script.mjs --check` to validate source. See [staff app builds](apps/staff-mobile/README.md) for Android and iOS.
