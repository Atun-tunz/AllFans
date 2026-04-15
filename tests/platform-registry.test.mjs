import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getPlatformById,
  platformRegistry
} from '../extension/runtime/platform-registry.js';

test('platformRegistry exposes a stable ordered list of supported platforms', () => {
  assert.deepEqual(
    platformRegistry.map(platform => platform.id),
    ['bilibili', 'douyin', 'xiaohongshu']
  );
  assert.deepEqual(
    platformRegistry.map(platform => platform.order),
    [1, 2, 3]
  );
});

test('getPlatformById returns platform definitions with sync entrypoints and popup models', () => {
  const platform = getPlatformById('douyin');
  const model = platform.createPopupCardModel(platform.createEmptyState(), {});

  assert.equal(platform.id, 'douyin');
  assert.ok(platform.syncEntrypoints.length >= 2);
  assert.equal(model.title, '抖音');
  assert.equal(Array.isArray(model.sections), true);
});

test('getPlatformById returns Xiaohongshu platform definition with sync entrypoints', () => {
  const platform = getPlatformById('xiaohongshu');
  const model = platform.createPopupCardModel(platform.createEmptyState(), {});

  assert.equal(platform.id, 'xiaohongshu');
  assert.equal(platform.syncEntrypoints.length, 2);
  assert.equal(model.title, '小红书');
  assert.equal(Array.isArray(model.sections), true);
});

test('Xiaohongshu popup card keeps platform color conventions for key metrics', () => {
  const platform = getPlatformById('xiaohongshu');
  const model = platform.createPopupCardModel(
    {
      displayName: 'Test',
      fans: 18,
      accountLikeCount: 22,
      worksCount: 12,
      playCount: 3456,
      likeCount: 789,
      commentCount: 12,
      shareCount: 9,
      favoriteCount: 34,
      accountStatsLastUpdate: '2026-04-12T09:30:00.000Z',
      contentStatsLastUpdate: '2026-04-12T10:00:00.000Z',
      contentStatsExact: true
    },
    {}
  );

  assert.equal(model.sections[0].metrics[0].variant, 'accent');
  assert.equal(model.sections[0].metrics[1].variant, 'hot');
  const contentMetrics = model.sections[1].metrics;
  assert.equal(contentMetrics[0].variant, 'large');
  assert.equal(contentMetrics.length, 4);
});

test('Bilibili popup card still renders zero-valued metrics once sync time exists', () => {
  const platform = getPlatformById('bilibili');
  const model = platform.createPopupCardModel(
    {
      displayName: 'Test',
      fans: 0,
      fansChangeToday: 0,
      playCount: 0,
      likeCount: 0,
      commentCount: 0,
      danmakuCount: 0,
      shareCount: 0,
      favoriteCount: 0,
      coinCount: 0,
      lastUpdate: '2026-04-15T10:00:00.000Z'
    },
    {}
  );

  assert.equal(model.hasData, true);
  assert.equal(model.sections.length, 2);
  assert.match(model.sections[0].meta, /^\u6700\u8fd1\u540c\u6b65\uff1a/);
});

test('Douyin popup card surfaces explicit zero-work confirmation in content meta', () => {
  const platform = getPlatformById('douyin');
  const model = platform.createPopupCardModel(
    {
      displayName: 'Test',
      worksCount: 0,
      totalWorksCount: 0,
      playCount: 0,
      favoriteCount: 0,
      commentCount: 0,
      shareCount: 0,
      contentStatsLastUpdate: '2026-04-15T10:00:00.000Z',
      contentStatsExact: true
    },
    {}
  );

  assert.match(model.sections[0].meta, /^\u6700\u8fd1\u540c\u6b65\uff1a/);
  assert.match(model.sections[0].meta, /\u4f5c\u54c1 0/);
});

test('Xiaohongshu popup card shows scanned and total works in content meta', () => {
  const platform = getPlatformById('xiaohongshu');
  const model = platform.createPopupCardModel(
    {
      displayName: 'Test',
      worksCount: 3,
      totalWorksCount: 5,
      playCount: 3456,
      likeCount: 789,
      commentCount: 12,
      shareCount: 9,
      favoriteCount: 34,
      contentStatsLastUpdate: '2026-04-15T10:00:00.000Z',
      contentStatsExact: false
    },
    {}
  );

  assert.match(model.sections[0].meta, /^\u6700\u8fd1\u540c\u6b65\uff1a/);
  assert.match(model.sections[0].meta, /\u4f5c\u54c1 3 \/ 5/);
});

test('Douyin and Xiaohongshu prefer syncing only their default entrypoint in open-and-sync flow', () => {
  assert.equal(getPlatformById('douyin').useOnlyDefaultSyncEntrypoint, true);
  assert.equal(getPlatformById('xiaohongshu').useOnlyDefaultSyncEntrypoint, true);
});

test('Xiaohongshu content script is injected at document_start to catch early note requests', () => {
  const platform = getPlatformById('xiaohongshu');

  assert.equal(platform.contentScripts[0]?.runAt, 'document_start');
});

test('Douyin content script is injected at document_start to catch early work list requests', () => {
  const platform = getPlatformById('douyin');

  assert.equal(platform.contentScripts[0]?.runAt, 'document_start');
});

test('Xiaohongshu matches both home and note-manager pages', () => {
  const platform = getPlatformById('xiaohongshu');

  assert.equal(
    platform.matchesActiveTab('https://creator.xiaohongshu.com/new/home')?.entrypointId,
    'home'
  );
  assert.equal(
    platform.matchesActiveTab('https://creator.xiaohongshu.com/new/note-manager')?.entrypointId,
    'notes'
  );
});
