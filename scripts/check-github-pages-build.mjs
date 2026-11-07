/**
 * Static GitHub Pages build sanity checks: no backend secrets or extra setup.
 * Run after: AURORA_GITHUB_PAGES=true VITE_GITHUB_PAGES_READ_ONLY=true npm run build
 * and cp dist/index.html dist/404.html
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve('dist');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const fallback=fs.readFileSync(path.join(root,'404.html'),'utf8');
assert.equal(fallback,html,'GitHub Pages needs a SPA 404.html fallback');
assert.match(html,/\/Aurora-s-Cake\/assets\/index-[^"']+\.js/,'Expected a built JS entry with project base');
assert.doesNotMatch(html,/<script[^>]+\/src\/main\.tsx/,'Do not publish raw React source');
assert.match(html,/\/Aurora-s-Cake\/favicon\.svg/,'Favicon must resolve within project site');
assert.match(html,/\/Aurora-s-Cake\/fonts\/roboto-latin\.woff2/,'Font preload must use project base');
assert.ok(fs.existsSync(path.join(root,'images','aurora-logo.png')),'Public cake assets were not copied');
const assetsDir=path.join(root,'assets');
const scripts=fs.readdirSync(assetsDir).filter(name=>name.endsWith('.js'));
const bundled=scripts.map(name=>fs.readFileSync(path.join(assetsDir,name),'utf8')).join('\n');
assert.match(bundled,/\/Aurora-s-Cake\/images\//,'Bundled cakes must use the Pages base');
assert.match(bundled,/GitHub Pages preview/,'The static read-only warning must be visible');
assert.match(bundled,/server-side bakery API/,'Mutations must be guarded on the static host');
console.log('PASS: GitHub Pages production artifacts are built for /Aurora-s-Cake/ and are read-only.');
