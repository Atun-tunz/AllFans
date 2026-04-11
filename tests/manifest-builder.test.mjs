import test from 'node:test';
import assert from 'node:assert/strict';

import { buildManifestForTarget } from '../scripts/lib/manifest-builder.mjs';

test('chrome manifest keeps service worker, localhost permissions, and external messaging', () => {
  const manifest = buildManifestForTarget('chrome');

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.service_worker, 'background/background.js');
  assert.ok(manifest.permissions.includes('alarms'));
  assert.ok(manifest.host_permissions.includes('http://127.0.0.1:8765/*'));
  assert.ok(manifest.host_permissions.includes('http://localhost:8765/*'));
  assert.deepEqual(manifest.externally_connectable.matches, [
    'http://127.0.0.1:8765/*',
    'http://localhost:8765/*'
  ]);
});

test('firefox manifest omits chromium-only external messaging declaration', () => {
  const manifest = buildManifestForTarget('firefox');

  assert.equal(manifest.background.scripts[0], 'background/background.js');
  assert.equal('service_worker' in manifest.background, false);
  assert.equal('externally_connectable' in manifest, false);
});

test('safari manifest keeps background scripts without Chromium external messaging settings', () => {
  const manifest = buildManifestForTarget('safari');

  assert.equal(manifest.background.scripts[0], 'background/background.js');
  assert.equal('externally_connectable' in manifest, false);
});
