import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDefaultData,
  createDefaultSettings,
  mergePlatformData,
  calculateSummary,
  normalizeSettings
} from '../extension/utils/data-model.mjs';
import { platformRegistry } from '../extension/runtime/platform-registry.js';

test('createDefaultData returns independent fresh objects for every registered platform', () => {
  const first = createDefaultData();
  const second = createDefaultData();

  first.platforms.bilibili.fans = 123;

  assert.equal(second.platforms.bilibili.fans, 0);
  assert.deepEqual(Object.keys(first.platforms), platformRegistry.map(platform => platform.id));
});

test('mergePlatformData preserves previous values when patch is partial', () => {
  const current = createDefaultData();
  current.platforms.bilibili.fans = 5306;
  current.platforms.bilibili.playCount = 582735;

  const merged = mergePlatformData(current.platforms.bilibili, {
    commentCount: 3980,
    updateSource: 'https://member.bilibili.com/platform/home'
  });

  assert.equal(merged.fans, 5306);
  assert.equal(merged.playCount, 582735);
  assert.equal(merged.commentCount, 3980);
});

test('createDefaultSettings enables all registered platforms by default', () => {
  const settings = createDefaultSettings();
  const platformIds = platformRegistry.map(platform => platform.id);

  assert.deepEqual(settings.enabledPlatformIds, platformIds);
  assert.deepEqual(settings.syncEnabledPlatformIds, platformIds);
  assert.deepEqual(settings.summaryIncludedPlatformIds, platformIds);
  assert.equal(settings.localBridgeEnabled, false);
  assert.equal(settings.localBridgeEndpoint, 'http://127.0.0.1:8765');
});

test('normalizeSettings filters unknown platform ids and preserves toggles', () => {
  const settings = normalizeSettings({
    enabledPlatformIds: ['bilibili', 'unknown'],
    syncEnabledPlatformIds: ['douyin', 'ghost'],
    summaryIncludedPlatformIds: ['douyin', 'bilibili', 'ghost'],
    localBridgeEnabled: true,
    localBridgeEndpoint: 'http://127.0.0.1:9999',
    externalApiEnabled: true
  });

  assert.deepEqual(settings.enabledPlatformIds, ['bilibili']);
  assert.deepEqual(settings.syncEnabledPlatformIds, ['douyin']);
  assert.deepEqual(settings.summaryIncludedPlatformIds, ['douyin', 'bilibili']);
  assert.equal(settings.localBridgeEnabled, true);
  assert.equal(settings.localBridgeEndpoint, 'http://127.0.0.1:9999');
  assert.equal(settings.externalApiEnabled, true);
});

test('calculateSummary aggregates only opted-in platforms', () => {
  const data = createDefaultData();
  data.platforms.bilibili.fans = 5306;
  data.platforms.bilibili.playCount = 582735;
  data.platforms.bilibili.likeCount = 14710;
  data.platforms.douyin.fans = 2400;
  data.platforms.douyin.playCount = 6818;
  data.platforms.douyin.accountLikeCount = 85;
  data.platforms.xiaohongshu.fans = 18;
  data.platforms.xiaohongshu.playCount = 1234;
  data.platforms.xiaohongshu.accountLikeCount = 56;

  const summary = calculateSummary(data.platforms, {
    summaryIncludedPlatformIds: ['bilibili', 'xiaohongshu']
  });

  assert.equal(summary.totalFans, 5324);
  assert.equal(summary.totalPlayCount, 583969);
  assert.equal(summary.totalLikeCount, 14766);
});
