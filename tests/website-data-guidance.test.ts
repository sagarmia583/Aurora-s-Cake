import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';

// Keep the real panel and database-mode branching. Only the browser dialog
// effect and large raw downloadable backend asset are fixture boundaries.
const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL('../src/components/SheetContentPanel.tsx', import.meta.url), 'utf8')
  .replace("import setupCode from '../../apps-script/Code.AllInOne.gs?raw';", "const setupCode = 'offline_backend_fixture';");
const code = transformSync(source, { loader: 'tsx', format: 'cjs', jsx: 'transform' }).code;
const module = { exports: {} as { SheetContentPanel?: React.ComponentType<any> } };
new Function('require', 'module', 'exports', code)((name: string) => {
  if (name === './useCakeDialog') return { useCakeDialog: () => ({ current: null }) };
  if (name === '../services/backendDatabaseStatus') return require('../src/services/backendDatabaseStatus.ts');
  return require(name);
}, module, module.exports);
const Panel = module.exports.SheetContentPanel!;
const noop = () => {};
function render(databaseBackend: 'supabase' | 'google_sheets' | 'unknown') {
  return renderToStaticMarkup(React.createElement(Panel, {
    isOpen: true, endpoint: 'https://script.google.com/macros/s/fixture/exec',
    status: { state: 'connected', source: 'google_sheets' }, databaseBackend,
    orderSubmissionEnabled: true, onClose: noop, onRefresh: async () => {},
    onSaveEndpoint: noop, onOpenStaffPortal: noop,
  }));
}

test('Supabase owner guidance routes edits to Website manager and never offers Sheet initialization', () => {
  const markup = render('supabase');
  assert.match(markup, /Active database: Supabase/);
  assert.match(markup, /Staff login.*Website manager/);
  assert.match(markup, /Editing the old Google Sheet does not update/);
  assert.match(markup, /Open Staff login/);
  assert.match(markup, /Open Supabase project/);
  assert.match(markup, /Routine updates preserve the current database/);
  assert.doesNotMatch(markup, /setupSheetDatabase|docs\.google\.com\/spreadsheets|Open source Sheet|Live Google Sheets/);
});

test('unconfirmed backend cannot be inferred from the legacy transport source or suggest initialization', () => {
  const markup = render('unknown');
  assert.match(markup, /Active database: Status unknown/);
  assert.match(markup, /Confirm the active database/);
  assert.doesNotMatch(markup, /Active database: Supabase|Active database: Google Sheets|setupSheetDatabase|Open Supabase project|Open source Sheet/);
});

test('explicit Google Sheets mode retains initial setup under its own separate instructions', () => {
  const markup = render('google_sheets');
  assert.match(markup, /Active database: Google Sheets/);
  assert.match(markup, /Initial Google Sheets setup only/);
  assert.match(markup, /setupSheetDatabase/);
  assert.match(markup, /Open source Sheet/);
  assert.doesNotMatch(markup, /Open Supabase project|Editing the old Google Sheet/);
});
