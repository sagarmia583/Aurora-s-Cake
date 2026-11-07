# Aurora's Cake — GitHub Pages automatic site deployment

## The fix
**URL:** https://sagarmia583.github.io/Aurora-s-Cake/

GitHub Pages was set to **Deploy from a branch → main / (root)**. That publishes the repository's raw Vite/React source instead of the built site. It does not compile TypeScript, bundle React, or adjust nested asset paths.

The repository now includes `.github/workflows/github-pages.yml`. On every push/merge to **main**, GitHub Actions:
1. Installs dependencies, checks TypeScript, builds a Pages-specific Vite bundle under `/Aurora-s-Cake/`.
2. Rewrites static `/images/...` defaults to the Pages base, preserving Netlify's normal root paths.
3. Adds `404.html` so direct `/Aurora-s-Cake/cake/<slug>` and `/Aurora-s-Cake/track-order` links render the SPA.
4. Checks that the artifact contains built JS and real cake images, **not** raw `.tsx` source.
5. Publishes the generated **dist** folder with GitHub Pages Actions.

## REQUIRED one-time GitHub UI action
Your existing GitHub Pages selection is still **Deploy from a branch → main / (root)**. This is a repository setting that cannot be changed by just committing an Actions workflow.

Go to **Repository → Settings → Pages → Build and deployment → Source**.
Change the dropdown from **Deploy from a branch** to **GitHub Actions**. Do not create a new `gh-pages` branch, do not select `main / root`, and do not choose a Jekyll template.
Then visit **Actions → Publish Aurora's Cake to GitHub Pages**, open a successful run, or manually choose **Run workflow** (main). It will publish the **dist** build without manual ZIP uploads.

From then on, only changes merged/pushed to the **main** branch automatically update the Pages URL. Changes in a draft PR do **not** update the site until merged. This avoids publishing unreviewed features.

## Important security / functionality boundary
GitHub Pages is a **static website host**, with no server-side `/api/operations` or Netlify Functions. To prevent ambiguous cross-origin order submissions that might be accepted by Apps Script but not confirmed by the browser, GitHub Pages builds are intentionally **read-only**:
- Cake catalogue, banners, photos, promotions, public Google Sheets data and frontend pages can be viewed.
- **Checkout orders and staff/admin updates cannot be saved on Pages alone**. Staff login and other private POST actions require a secure backend relay; the Pages build blocks direct browser writes.
- Customer order tracking requires an authenticated backend read path and may not function without a server-side relay.
- Do not publish service credentials or Apps Script secrets in a `VITE_*` value, GitHub Pages artifacts, or a public repository.
- Google Sheets public reads use the existing public `/exec?action=public` endpoint (including its JSONP compatibility route). The original Google Sheet and production Apps Script remain untouched.

To make this URL fully transactional, configure a properly authenticated HTTPS API on Netlify, Cloudflare Workers, or another host and explicitly connect the frontend. Do **not** disable the read-only protection just to make browser POST requests appear to work.

## Future changes
- Keep Netlify and Cloudflare deploys separate. Their Vite base remains `/`; Pages alone uses `/Aurora-s-Cake/`.
- New main commits trigger this Pages workflow without changing the static Pages settings again.
- If the site is blank, open Actions → Publish Aurora's Cake to GitHub Pages and inspect the build/deploy logs; check that Source remains GitHub Actions.
