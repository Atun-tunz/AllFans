import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('xiaohongshu sync waits for the bridge script to be ready before requesting pages', () => {
  const scriptPath = path.join(process.cwd(), 'extension', 'content', 'xiaohongshu-sync.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /script\.addEventListener\('load'/);
  assert.match(script, /await installBridgeScript\(\);/);
});
