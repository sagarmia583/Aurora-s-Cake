import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(file:string) {
  return fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
}

test('Pages publishes built Vite assets on every main update, never raw source',()=>{
  const workflow=read('.github/workflows/github-pages.yml');
  assert.match(workflow,/push:\s*\n\s*branches:\s*\[main\]/);
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/AURORA_GITHUB_PAGES: "true"/);
  assert.match(workflow,/VITE_GITHUB_PAGES_READ_ONLY: "true"/);
  assert.match(workflow,/run: npm run build/);
  assert.match(workflow,/cp dist\/index\.html dist\/404\.html/);
  assert.match(workflow,/actions\/upload-pages-artifact@v3/);
  assert.match(workflow,/actions\/deploy-pages@v4/);
  assert.match(workflow,/if: github\.event_name != 'pull_request'/);
});

test('Pages-only base path leaves normal Netlify and local builds unchanged',()=>{
  const vite=read('vite.config.ts');
  assert.match(vite,/base:githubPagesBuild\?githubPagesBase:'\/'/);
  assert.match(vite,/githubPagesBase='\/Aurora-s-Cake\/'/);
  assert.match(vite,/githubPagesAssets\(\)/);
  assert.match(vite,/if\(!githubPagesBuild\)/);
});

test('Pages can show default and live Sheet images, product detail and order routes',()=>{
  const sheet=read('src/services/googleSheets.ts');
  const app=read('src/App.tsx');
  const entry=read('src/main.tsx');
  assert.match(sheet,/base\.replace/); // local assets
  assert.match(app,/sitePrefix\+'\/cake\/'\+product\.slug/);
  assert.match(app,/sitePath\(\)\.match\(/);
  assert.match(entry,/currentPath===ORDER_TRACKING_PATH/);
});

test('Pages stays read-only until the secure API origin is explicitly configured',()=>{
  const sheet=read('src/services/googleSheets.ts');
  const app=read('src/App.tsx');
  const pagesApi=read('src/services/pagesApi.ts');
  const workflow=read('.github/workflows/github-pages.yml');
  assert.match(pagesApi,/isPagesApiUnavailable/);
  assert.match(pagesApi,/VITE_GITHUB_PAGES_API_ORIGIN/);
  assert.ok(pagesApi.includes('aurora-gh-pages-api'));
  assert.match(sheet,/getPagesApiOrigin/);
  assert.ok(sheet.includes('/api/operations'));
  assert.ok(app.includes('if (pagesReadOnly) {'));
  assert.ok(workflow.includes('vars.AURORA_PAGES_API_ORIGIN'));
});
