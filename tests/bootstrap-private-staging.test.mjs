import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ps=readFileSync(new URL('../scripts/bootstrap-private-cod-staging.ps1',import.meta.url),'utf8');
test('staging PowerShell requires a new clasp project and refuses production Sheet ID',()=>{
  assert.match(ps,/STOP: the supplied ID is the original production Google Sheet/);
  assert.match(ps,/\.clasp\.json/);
  assert.match(ps,/Refusing to reuse or overwrite it/);
  assert.match(ps,/CREATE-STAGING/);
  assert.match(ps,/--type standalone/);
  assert.match(ps,/prepare-staging-apps-script\.mjs/);
  assert.match(ps,/build-apps-script\.mjs/);
  assert.doesNotMatch(ps,/\bclasp\s+clone\b/i);
  assert.doesNotMatch(ps,/clasp[^\\n]*--force/i);
  assert.doesNotMatch(ps,/\bclasp\s+(?:deploy|redeploy|undeploy)\b/i);
});

const upgrade=readFileSync(new URL('../scripts/upgrade-existing-staging-safe.ps1',import.meta.url),'utf8');
test('existing staging updater validates expected clasp project ID and hardened source before push',()=>{
  assert.match(upgrade,/\$config\.scriptId -cne \$ExpectedScriptId/);
  assert.match(upgrade,/STOP: linked Apps Script project ID does not match/);
  assert.match(upgrade,/STOP: this is the production Sheet ID/);
  assert.match(upgrade,/staging_auth_hardened:true/);
  assert.match(upgrade,/setupAuroraStagingOwnerOnce/);
  assert.match(upgrade,/UPDATE-ONLY-STAGING/);
  const claspCommands=upgrade.split('\n').map(line=>line.trim()).filter(line=>/^& \$clasp\.Source\s+/.test(line));
  assert.deepEqual(claspCommands,['& $clasp.Source push'],
    'The script may ONLY push into the already-verified staging clasp project');
});
