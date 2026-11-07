/**
 * Reject any accidental inclusion of private Google Apps Script backend
 * implementation in the public Netlify storefront bundle.
 *
 * Read-only, offline. Run after Vite build; safe for Windows and CI.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())yield* walk(full);
    else if(entry.isFile())yield full;
  }
}
const appSource=path.join(root,'src');
for(const file of walk(appSource)){
  if(!/\.(ts|tsx|js|jsx)$/.test(file))continue;
  const contents=fs.readFileSync(file,'utf8');
  assert.doesNotMatch(contents,/(?:import\s*\(|from\s*|new\s+URL\s*\()\s*['"`][^'"`]*apps-script\//,
    path.relative(root,file)+': backend implementation must not be imported into the browser');
  assert.doesNotMatch(contents,/Code\.AllInOne\.gs\?(?:raw|url)/,
    path.relative(root,file)+': backend source cannot be exposed as a public asset');
}
const dist=path.join(root,'dist');
assert.ok(fs.existsSync(path.join(dist,'index.html')),'Build first: dist/index.html is missing');
let examined=0;
for(const file of walk(dist)){
  const relative=path.relative(dist,file).replaceAll(path.sep,'/');
  assert.doesNotMatch(relative,/Code\.AllInOne|ShareFonts\.gs/i,
    'A private backend source file was emitted to the public build: '+relative);
  if(!/\.(?:js|html)$/.test(file))continue;
  examined++;
  const contents=fs.readFileSync(file,'utf8');
  assert.doesNotMatch(contents,/var AURORA_SPREADSHEET_ID\s*=|function setupSheetDatabase\s*\(|function auroraSpreadsheet_\s*\(|AURORA_SUPABASE_SERVICE_KEY/,
    'Private backend implementation was embedded in a browser asset: '+relative);
}
assert.ok(examined>0,'No JavaScript or HTML browser assets found');
console.log('PASS: public browser build excludes full Apps Script source ('+examined+' assets scanned).');
