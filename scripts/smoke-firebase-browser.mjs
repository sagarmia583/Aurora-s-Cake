import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const executablePath = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
].find(existsSync);
assert.ok(executablePath, 'A Chromium browser is required on the CI runner');

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const url = process.env.SMOKE_URL || 'http://127.0.0.1:4173/?firebase-check=1';
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => {
    const result = document.querySelector('aside[role="status"] p')?.textContent || '';
    return result.startsWith('Connected:') || (result.startsWith('Not connected:') && !result.includes('Checking Firebase settings...'));
  }, null, { timeout: 60000 });

  const result = (await page.locator('aside[role="status"] p').textContent())?.trim() || '';
  console.log('Browser Firebase connection test:', result);
  console.log('Page exceptions:', errors.slice(0, 5));
  assert.ok(result.startsWith('Connected:'),
    'Live Firestore read failed in Chrome: ' + result);
  assert.equal(errors.length, 0, 'Browser JS errors: ' + errors.join('; '));
} finally {
  await browser.close();
}
