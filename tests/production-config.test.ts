import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Netlify and Google Sheets are the only supported production stack',()=>{
 const config=read('netlify.toml');
 assert.match(config,/publish\s*=\s*"dist"/);
 assert.match(config,/functions\s*=\s*"netlify\/functions"/);
 assert.match(config,/VITE_SHEETS_POST_PROXY\s*=\s*"\/api\/operations"/);
 for(const p of ['wrangler.toml','wrangler.pages.toml','vercel.json','firebase.json','cloudflare/worker.js','functions/api/operations.js','api/operations.js','public/_routes.json'])assert.equal(existsSync(new URL('../'+p,import.meta.url)),false);
 for(const p of ['netlify/functions/operations.mjs','netlify/functions/public.mjs','netlify/functions/backend-health.mjs','netlify/functions/image.mjs'])assert.ok(existsSync(new URL('../'+p,import.meta.url)));
 assert.doesNotMatch(read('src/main.tsx'),/firebase|supabase/i);
});
test('Netlify health matches Google Apps Script release',()=>{
 const release=read('apps-script/Code.gs').match(/var AURORA_BACKEND_RELEASE\s*=\s*'([^']+)'/)?.[1];
 assert.ok(release);assert.ok(read('netlify/functions/backend-health.mjs').includes(release));
});

test('Netlify API routes explicitly rewrite to deployed Functions and retain default function paths',()=>{
 const netlify=read('netlify.toml');
 for(const [path,name] of [['/api/public','public'],['/api/operations','operations'],['/api/image','image'],['/api/backend-health','backend-health']]){
   assert.ok(netlify.includes('from = "'+path+'"'));
   assert.ok(netlify.includes('to = "/.netlify/functions/'+name+'"'));
   assert.doesNotMatch(read('netlify/functions/'+name+'.mjs'),/export\s+const\s+config\s*=\s*\{\s*path\s*:/);
 }
 assert.match(netlify,/force\s*=\s*true/);
});
