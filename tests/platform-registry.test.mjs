import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  getPlatformById,
  platformRegistry
} from '../extension/runtime/platform-registry.js';

test('platformRegistry exposes a stable ordered list of supported platforms', () => {
  assert.deepEqual(
    platformRegistry.map(platform => platform.id),
    ['bilibili', 'douyin', 'xiaohongshu', 'kuaishou']
  );
  assert.deepEqual(
    platformRegistry.map(platform => platform.order),
    [1, 2, 3, 4]
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

test('Kuaishou content script is injected at document_start to catch early photo list requests', () => {
  const platform = getPlatformById('kuaishou');

  assert.equal(platform.contentScripts[0]?.runAt, 'document_start');
});

test('Kuaishou sync declares separate account and content entrypoints', () => {
  const platform = getPlatformById('kuaishou');

  assert.deepEqual(platform.contentScripts[0]?.matches, ['https://cp.kuaishou.com/*']);
  assert.deepEqual(
    platform.syncEntrypoints.map(entrypoint => entrypoint.id),
    ['home', 'content']
  );
  assert.equal(platform.syncEntrypoints[0].url, 'https://cp.kuaishou.com/');
  assert.equal(
    platform.matchesActiveTab('https://cp.kuaishou.com/')?.entrypointId,
    'home'
  );
  assert.equal(
    platform.matchesActiveTab('https://cp.kuaishou.com/article/manage/video')?.entrypointId,
    'content'
  );
  assert.notEqual(platform.useOnlyDefaultSyncEntrypoint, true);
});

test('creator account popup models use the shared account overview helper', () => {
  const sourceByFile = {
    douyin: fs.readFileSync(
      path.join(process.cwd(), 'extension', 'platforms', 'douyin-platform.js'),
      'utf8'
    ),
    xiaohongshu: fs.readFileSync(
      path.join(process.cwd(), 'extension', 'platforms', 'xiaohongshu-card-platform.js'),
      'utf8'
    ),
    kuaishou: fs.readFileSync(
      path.join(process.cwd(), 'extension', 'platforms', 'kuaishou-platform.js'),
      'utf8'
    )
  };

  for (const [platformId, source] of Object.entries(sourceByFile)) {
    assert.match(
      source,
      /createAccountOverviewSection/,
      `${platformId} should build account overview with the shared helper`
    );
  }
});

test('Kuaishou declares its page bridge resource in the platform definition', () => {
  const platform = getPlatformById('kuaishou');

  assert.deepEqual(platform.webAccessibleResources, [
    {
      resources: ['content/kuaishou-bridge.js'],
      matches: ['https://cp.kuaishou.com/*']
    }
  ]);
  assert.equal(platform.syncOptions?.tabLoadTimeoutMs, 60000);
  assert.deepEqual(platform.expectedSyncScopes, ['account', 'content']);
});

test('Kuaishou empty state includes account fields', () => {
  const platform = getPlatformById('kuaishou');
  const state = platform.createEmptyState();

  assert.equal(state.fans, 0);
  assert.equal(state.accountLikeCount, 0);
  assert.equal(state.accountStatsLastUpdate, null);
  assert.equal(state.accountUpdateSource, null);
});

test('Kuaishou summary contributions include fans and prefer account likes', () => {
  const platform = getPlatformById('kuaishou');
  const contribution = platform.getSummaryContributions({
    fans: 3,
    accountLikeCount: 1,
    likeCount: 300,
    playCount: 8040
  });

  assert.equal(contribution.totalFans, 3);
  assert.equal(contribution.totalPlayCount, 8040);
  assert.equal(contribution.totalLikeCount, 1);
});

test('Kuaishou popup card renders account overview before content metrics', () => {
  const platform = getPlatformById('kuaishou');
  const model = platform.createPopupCardModel({
    displayName: '阿屯的屯',
    fans: 3,
    accountLikeCount: 1,
    playCount: 8040,
    likeCount: 300,
    commentCount: 130,
    worksCount: 2,
    accountStatsLastUpdate: '2026-04-21T00:00:00.000Z',
    contentStatsLastUpdate: '2026-04-21T00:01:00.000Z',
    contentStatsExact: true
  });

  assert.equal(model.hasData, true);
  assert.equal(model.accountName, '阿屯的屯');
  assert.equal(model.sections[0].key, 'account');
  assert.equal(model.sections[0].metrics[0].value, '3');
  assert.equal(model.sections[0].metrics[1].value, '1');
  assert.equal(model.sections[1].key, 'content');
  assert.equal(model.compactMetrics[0].value, '3');
});

test('Kuaishou popup card does not show zero fans when account stats are missing', () => {
  const platform = getPlatformById('kuaishou');
  const model = platform.createPopupCardModel({
    displayName: '阿屯的屯',
    fans: 0,
    accountLikeCount: 0,
    playCount: 8040,
    likeCount: 300,
    commentCount: 130,
    worksCount: 2,
    contentStatsLastUpdate: '2026-04-21T00:01:00.000Z',
    contentStatsExact: true
  });

  assert.equal(model.hasData, true);
  assert.equal(model.compactMetrics[0].label, '粉丝');
  assert.equal(model.compactMetrics[0].value, '未同步');
  assert.equal(model.sections[0].key, 'account');
  assert.equal(model.sections[0].metrics[0].label, '粉丝');
  assert.equal(model.sections[0].metrics[0].value, '未同步');
  assert.equal(model.sections[1].key, 'content');
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
