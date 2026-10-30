import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('the one-file deployment bundle exactly matches all maintained backend modules',()=>{
  const path=new URL('../apps-script/Code.AllInOne.gs',import.meta.url),before=fs.readFileSync(path,'utf8');
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/build-apps-script.mjs',import.meta.url)),'--check'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.equal(fs.readFileSync(path,'utf8'),before,'Regenerate with node scripts/build-apps-script.mjs before committing');
});
