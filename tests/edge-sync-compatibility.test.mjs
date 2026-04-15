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

test('douyin sync reuses a valid captured work list snapshot before clearing it', () => {
  const scriptPath = path.join(process.cwd(), 'extension', 'content', 'douyin-sync.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /hasReusableWorkListSnapshot/);
  assert.match(
    script,
    /if \(!metrics\.hasReusableWorkListSnapshot\(pendingSnapshot\)\) \{\s*pendingSnapshot = null;\s*\}/m
  );
});

test('xiaohongshu sync stops requesting extra pages once scanned works reach the known total', () => {
  const scriptPath = path.join(process.cwd(), 'extension', 'content', 'xiaohongshu-sync.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /state\.total > 0 && state\.scannedItemCount >= state\.total/);
});

test('background open-and-sync flow can collapse to the default entrypoint for unified platforms', () => {
  const scriptPath = path.join(process.cwd(), 'extension', 'background', 'main.js');
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /platform\.useOnlyDefaultSyncEntrypoint/);
});
