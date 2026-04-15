import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('popup does not expose a special zero-work success badge in the top status action', () => {
  const scriptPath = path.join(process.cwd(), 'extension', 'popup', 'main.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.doesNotMatch(script, /\\u5df2\\u540c\\u6b65 0\\u4f5c\\u54c1/);
});
