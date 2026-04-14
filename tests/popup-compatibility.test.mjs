import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('popup visual effects keep webkit-prefixed fallbacks for Chromium browsers', () => {
  const cssPath = path.join(process.cwd(), 'extension', 'popup', 'popup.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.match(css, /-webkit-backdrop-filter:\s*blur\(18px\);/);
  assert.match(css, /-webkit-mask-image:\s*linear-gradient\(/);
});
