/**
 * Guard against Firebase App and Firestore loading separate copies of
 * @firebase/app, which breaks component registration at runtime.
 *
 * Run after npm ci and before production bundling.
 */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const packages = lock.packages || {};

assert.equal(pkg.dependencies.firebase, '12.19.0', 'Pin the audited Firebase SDK');
assert.equal(pkg.overrides?.['@firebase/app'], '0.16.2');
assert.equal(pkg.overrides?.['@firebase/app-compat'], '0.5.18');
assert.equal(packages['node_modules/firebase']?.version, '12.19.0');
assert.equal(packages['node_modules/@firebase/app']?.version, '0.16.2',
  'Top-level app package must match the Firebase SDK package');
assert.equal(packages['node_modules/@firebase/app-compat']?.version, '0.5.18');
const duplicates = Object.keys(packages).filter(path =>
  /\/node_modules\/@firebase\/(app|app-compat)$/.test(path) &&
  path !== 'node_modules/@firebase/app' &&
  path !== 'node_modules/@firebase/app-compat');
assert.deepEqual(duplicates, [], 'Unexpected Firebase App duplicate: ' + duplicates.join(', '));
console.log('Firebase component registry deduplication verified.');
