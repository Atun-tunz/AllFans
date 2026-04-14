import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('animations stylesheet does not force the sync-all button back to a fixed narrow pill', () => {
  const cssPath = path.join(process.cwd(), 'extension', 'popup', 'animations.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.match(css, /\.sync-all-button\s*\{[\s\S]*width:\s*100%;/m);
  assert.match(css, /\.sync-all-button\s*\{[\s\S]*margin:\s*0;/m);
  assert.doesNotMatch(css, /\.sync-all-button\s*\{[\s\S]*width:\s*180px;/m);
});
