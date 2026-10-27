import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { AURORA_GOOGLE_WEB_CLIENT_ID, getAuroraGoogleClientId } from '../src/config/googleOAuth';

const source=(name:string)=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('public OAuth client ID is configured for the free web frontend and unified Apps Script',()=>{
  assert.match(AURORA_GOOGLE_WEB_CLIENT_ID,/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/);
  assert.equal(getAuroraGoogleClientId(),AURORA_GOOGLE_WEB_CLIENT_ID);
  const backend=source('apps-script/Code.AllInOne.gs');
  assert.ok(backend.includes(AURORA_GOOGLE_WEB_CLIENT_ID));
  assert.ok(backend.includes('AURORA_STAFF_USERS'));
  const example=source('.env.example');
  assert.ok(example.includes(AURORA_GOOGLE_WEB_CLIENT_ID));
  assert.equal(backend.includes('client_secret'),false);
  assert.equal(example.includes('client_secret'),false);
  assert.equal(backend.includes('GOCSPX-'),false);
});
