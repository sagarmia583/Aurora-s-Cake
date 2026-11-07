/** Static Netlify + Google Sheets release guard. No network, writes or deploys. */
import {readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const netlify=read('netlify.toml');
assert.match(netlify,/\[build\]/);
assert.match(netlify,/command\s*=\s*"npm run build"/);
assert.match(netlify,/publish\s*=\s*"dist"/);
assert.match(netlify,/functions\s*=\s*"netlify\/functions"/);
assert.match(netlify,/VITE_SHEETS_POST_PROXY\s*=\s*"\/api\/operations"/);
for(const path of ['netlify/functions/operations.mjs','netlify/functions/public.mjs',
  'netlify/functions/image.mjs','netlify/functions/backend-health.mjs']){
 assert.ok(existsSync(new URL('../'+path,import.meta.url)),path+' is missing.');
}
assert.match(read('vite.config.ts'),/process\.env\.NETLIFY/,
 'Vite must force same-origin proxy on Netlify builds.');
assert.match(read('apps/staff-mobile/src/native/client.ts'),/EXPO_PUBLIC_OPERATIONS_URL/);
const release=read('apps-script/Code.gs')
 .match(/var AURORA_BACKEND_RELEASE\s*=\s*'([^']+)'/)?.[1];
assert.ok(release,'Apps Script release ID missing.');
const health=read('netlify/functions/backend-health.mjs');
assert.ok(health.includes(release),'Netlify health release mismatches source.');
assert.match(health,/database_backend\s*!==\s*'google_sheets'/,
 'Netlify health must reject a non-Sheets backend.');
console.log('Netlify/Sheets-only preflight PASS:',release);

// No retired deployment target can be committed to the Netlify-only branch.
for(const path of ['vercel.json','wrangler.toml','wrangler.pages.toml','firebase.json','public/_routes.json','cloudflare/worker.js','api/operations.js','functions/api/operations.js'])
 assert.ok(!existsSync(new URL('../'+path,import.meta.url)),path+' must be absent');
