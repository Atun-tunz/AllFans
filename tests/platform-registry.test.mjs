import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getPlatformById,
  platformRegistry
} from '../extension/runtime/platform-registry.js';

test('platformRegistry exposes a stable ordered list of supported platforms', () => {
  assert.deepEqual(
    platformRegistry.map(platform => platform.id),
    ['bilibili', 'douyin']
  );
  assert.deepEqual(
    platformRegistry.map(platform => platform.order),
    [1, 2]
  );
});

test('getPlatformById returns platform definitions with sync entrypoints and popup models', () => {
  const platform = getPlatformById('douyin');
  const model = platform.createPopupCardModel(platform.createEmptyState(), {
    isEnabled: true,
    isSyncEnabled: true,
    isIncludedInSummary: true,
    justSynced: false
  });

  assert.equal(platform.id, 'douyin');
  assert.ok(platform.syncEntrypoints.length >= 2);
  assert.equal(model.title, 'Douyin');
  assert.equal(Array.isArray(model.sections), true);
});
