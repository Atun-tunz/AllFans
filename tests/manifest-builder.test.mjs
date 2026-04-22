import test from 'node:test';
import assert from 'node:assert/strict';

import { buildManifestForTarget } from '../scripts/lib/manifest-builder.mjs';

test('chrome manifest keeps service worker, localhost permissions, and external messaging', () => {
  const manifest = buildManifestForTarget('chrome');

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.service_worker, 'background/background.js');
  assert.equal(manifest.options_ui.page, 'options/index.html');
  assert.equal(manifest.options_ui.open_in_tab, true);
  assert.ok(manifest.permissions.includes('alarms'));
  assert.ok(manifest.host_permissions.includes('http://127.0.0.1:8765/*'));
  assert.ok(manifest.host_permissions.includes('http://localhost:8765/*'));
  assert.deepEqual(manifest.externally_connectable.matches, [
    'http://127.0.0.1:8765/*',
    'http://localhost:8765/*'
  ]);
  assert.deepEqual(manifest.web_accessible_resources, [
    {
      resources: ['content/xiaohongshu-bridge.js'],
      matches: ['https://creator.xiaohongshu.com/*']
    },
    {
      resources: ['content/kuaishou-bridge.js'],
      matches: ['https://cp.kuaishou.com/*']
    },
    {
      resources: ['content/weixin-channels-bridge.js'],
      matches: ['https://channels.weixin.qq.com/*']
    }
  ]);
  assert.ok(manifest.host_permissions.includes('https://channels.weixin.qq.com/*'));
  assert.ok(
    manifest.content_scripts.some(
      entry =>
        entry.matches?.includes('https://cp.kuaishou.com/*') &&
        entry.js?.includes('content/kuaishou-sync.js') &&
        entry.run_at === 'document_start'
    )
  );
  assert.ok(
    manifest.content_scripts.some(
      entry =>
        entry.matches?.includes('https://channels.weixin.qq.com/*') &&
        entry.js?.includes('content/weixin-channels-bridge.js') &&
        entry.run_at === 'document_start' &&
        entry.all_frames === true &&
        entry.world === 'MAIN'
    )
  );
  assert.ok(
    manifest.content_scripts.some(
      entry =>
        entry.matches?.includes('https://channels.weixin.qq.com/*') &&
        entry.js?.includes('content/weixin-channels-sync.js') &&
        entry.run_at === 'document_start' &&
        entry.all_frames === true
    )
  );
});

test('firefox manifest omits chromium-only external messaging declaration', () => {
  const manifest = buildManifestForTarget('firefox');

  assert.equal(manifest.background.scripts[0], 'background/background.js');
  assert.equal('service_worker' in manifest.background, false);
  assert.equal('externally_connectable' in manifest, false);
  assert.equal(manifest.content_scripts.some(entry => 'world' in entry), false);
});

test('safari manifest keeps background scripts without Chromium external messaging settings', () => {
  const manifest = buildManifestForTarget('safari');

  assert.equal(manifest.background.scripts[0], 'background/background.js');
  assert.equal('externally_connectable' in manifest, false);
  assert.equal(manifest.content_scripts.some(entry => 'world' in entry), false);
});
