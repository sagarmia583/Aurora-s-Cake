import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scriptUrl } from '../cloudflare/shared.js';

test('production Worker keeps a valid runtime backend binding matching the public storefront deployment', () => {
 const config=readFileSync(new URL('../wrangler.toml',import.meta.url),'utf8');
 const vars=config.split('[vars]')[1]?.split('\n[')[0] || '';
 const endpoint=vars.match(/^AURORA_SCRIPT_POST_URL\s*=\s*"([^"]+)"/m)?.[1];
 assert.ok(endpoint,'Public runtime backend URL must be declared for GitHub Worker builds.');
 const parsed=scriptUrl({AURORA_SCRIPT_POST_URL:endpoint});
 assert.ok(parsed,'Runtime binding must pass the same approved Apps Script URL validator as production.');
 const frontend=readFileSync(new URL('../src/services/googleSheets.ts',import.meta.url),'utf8');
 assert.ok(frontend.includes(endpoint),'Public fallback and server relay must target the same approved deployment.');
 assert.match(config,/^keep_vars\s*=\s*true/m);
});

test('health proxies identify the Apps Script release actually supplied for deployment',()=>{
 const backend=readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8');
 const release=backend.match(/var AURORA_BACKEND_RELEASE\s*=\s*'([^']+)'/)?.[1];
 assert.ok(release);
 for(const file of ['api/backend-health.js','functions/api/backend-health.js']){
  const proxy=readFileSync(new URL('../'+file,import.meta.url),'utf8');
  assert.equal(proxy.match(/const EXPECTED_RELEASE\s*=\s*'([^']+)'/)?.[1],release);
 }
});
