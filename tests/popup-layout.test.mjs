import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { getPlatformById } from '../extension/runtime/platform-registry.js';

test('Xiaohongshu sync entrypoint copy uses note manager wording', () => {
  const platform = getPlatformById('xiaohongshu');
  const entrypoint = platform.syncEntrypoints.find(candidate => candidate.id === 'notes');
  assert.equal(entrypoint?.label, '打开小红书笔记管理页面');
  assert.equal(entrypoint?.actionLabel, '同步作品数据');
  return;

  assert.equal(platform.syncEntrypoints[0]?.label, '打开小红书笔记管理页面');
  assert.equal(platform.syncEntrypoints[0]?.actionLabel, '同步数据');
});

test('popup keeps compact metrics visible when a platform without data is expanded', () => {
  const cssPath = path.join(process.cwd(), 'extension', 'popup', 'popup.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.match(
    css,
    /\.platform-card\.has-data:not\(\.is-collapsed\)\s+\.platform-compact\s*\{\s*display:\s*none\s*!important;/m
  );
});
