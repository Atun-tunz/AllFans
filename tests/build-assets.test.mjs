import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  BASE_STATIC_ASSET_PATHS,
  getPlatformContentAssetPaths,
  getStaticAssetPaths,
  PLATFORM_ICON_PATHS
} from '../scripts/lib/build-assets.mjs';
import { buildManifestForTarget } from '../scripts/lib/manifest-builder.mjs';
import { platformRegistry } from '../extension/runtime/platform-registry.js';

test('build asset list derives platform content files from platform registry', () => {
  const expectedContentAssets = new Set(
    platformRegistry.flatMap(platform => [
      ...(platform.contentScripts || []).flatMap(entry => entry.js || []),
      ...(platform.webAccessibleResources || []).flatMap(entry => entry.resources || [])
    ])
  );

  assert.deepEqual(
    new Set(getPlatformContentAssetPaths()),
    expectedContentAssets
  );
});

test('build asset list contains existing static files without duplicates', () => {
  const assetPaths = getStaticAssetPaths();

  assert.equal(new Set(assetPaths).size, assetPaths.length);
  assert.deepEqual(
    BASE_STATIC_ASSET_PATHS.filter(assetPath => assetPaths.includes(assetPath)),
    BASE_STATIC_ASSET_PATHS
  );
  assert.deepEqual(
    PLATFORM_ICON_PATHS.filter(assetPath => assetPaths.includes(assetPath)),
    PLATFORM_ICON_PATHS
  );

  for (const assetPath of assetPaths) {
    assert.equal(
      fs.existsSync(path.join(process.cwd(), 'extension', assetPath)),
      true,
      `Missing static asset: ${assetPath}`
    );
  }
});

test('build asset list covers every generated manifest content resource', () => {
  const assetPaths = new Set(getStaticAssetPaths());

  for (const target of ['chrome', 'edge', 'firefox', 'safari']) {
    const manifest = buildManifestForTarget(target);
    const manifestAssets = [
      ...manifest.content_scripts.flatMap(entry => entry.js || []),
      ...manifest.web_accessible_resources.flatMap(entry => entry.resources || [])
    ];

    for (const assetPath of manifestAssets) {
      assert.equal(
        assetPaths.has(assetPath),
        true,
        `${target} manifest references uncopied asset: ${assetPath}`
      );
    }
  }
});
