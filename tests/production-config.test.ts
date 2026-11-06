import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Netlify deploy uses Google Sheets as its only operational backend',()=>{
 const netlify=readFileSync(new URL('../netlify.toml',import.meta.url),'utf8');
 assert.match(netlify,/publish\s*=\s*"dist"/);
 assert.match(netlify,/functions\s*=\s*"netlify\/functions"/);
 assert.match(netlify,/VITE_SHEETS_POST_PROXY\s*=\s*"\/api\/operations"/);
 assert.match(netlify,/VITE_FIREBASE_ENABLED\s*=\s*"false"/);
 assert.match(netlify,/VITE_SUPABASE_ENABLED\s*=\s*"false"/);
 const relay=readFileSync(new URL('../netlify\/functions\/operations.mjs',import.meta.url),'utf8');
 assert.ok(relay.includes("target.hostname!=='script.google.com'"));
 const api=readFileSync(new URL('../netlify/functions/public.mjs',import.meta.url),'utf8');
 assert.ok(api.includes("endpoint")===false || api.includes("public"));
});

test('Netlify and historical proxies compare against the current Apps Script release',()=>{
 const source=readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8');
 const release=source.match(/var AURORA_BACKEND_RELEASE\s*=\s*'([^']+)'/)?.[1];
 assert.ok(release);
 for(const path of ['netlify/functions/backend-health.mjs','functions/api/backend-health.js']){
   const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
   assert.equal(source.match(/(?:export\s+)?const EXPECTED_RELEASE\s*=\s*'([^']+)'/)?.[1],release);
 }
 const oldProxy=readFileSync(new URL('../api/backend-health.js',import.meta.url),'utf8');
 assert.match(oldProxy,/import\s*\{\s*EXPECTED_RELEASE\s*\}/);
});
