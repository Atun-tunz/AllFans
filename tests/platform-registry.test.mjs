import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getPlatformById,
  platformRegistry
} from '../extension/runtime/platform-registry.js';

test('platformRegistry exposes a stable ordered list of supported platforms', () => {
  assert.deepEqual(
    platformRegistry.map(platform => platform.id),
    ['bilibili', 'douyin', 'xiaohongshu', 'kuaishou', 'weixin_channels', 'weibo']
  );
  assert.deepEqual(
    platformRegistry.map(platform => platform.order),
    [1, 2, 3, 4, 5, 6]
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

test('Douyin allows slow creator pages to finish loading during open-and-sync', () => {
  const platform = getPlatformById('douyin');

  assert.equal(platform.syncOptions.tabLoadTimeoutMs, 90000);
  assert.equal(platform.syncOptions.messageRetryCount, 40);
  assert.equal(platform.syncOptions.messageRetryDelayMs, 500);
});

test('Douyin declares its page bridge resource for creator work-list capture', () => {
  const platform = getPlatformById('douyin');

  assert.deepEqual(
    platform.contentScripts.map(entry => ({
      js: entry.js,
      world: entry.world || null
    })),
    [
      {
        js: ['content/douyin-bridge.js'],
        world: 'MAIN'
      },
      {
        js: ['content/douyin-metrics.js', 'content/douyin-sync.js'],
        world: null
      }
    ]
  );
  assert.deepEqual(platform.webAccessibleResources, [
    {
      resources: ['content/douyin-bridge.js'],
      matches: ['https://creator.douyin.com/*']
    }
  ]);
});

test('Xiaohongshu content script is injected at document_start to catch early note requests', () => {
  const platform = getPlatformById('xiaohongshu');

  assert.equal(platform.contentScripts[0]?.runAt, 'document_start');
});

test('Douyin content script is injected at document_start to catch early work list requests', () => {
  const platform = getPlatformById('douyin');

  assert.equal(platform.contentScripts[0]?.runAt, 'document_start');
  assert.equal(platform.contentScripts[1]?.runAt, 'document_start');
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

test('creator popup models declare split account and content card sections', () => {
  for (const platformId of ['douyin', 'xiaohongshu', 'kuaishou']) {
    const platform = getPlatformById(platformId);

    assert.equal(platform.card.mode, 'split');
    assert.deepEqual(
      platform.card.sections.map(section => [section.key, section.syncField]),
      [
        ['account', 'accountStatsLastUpdate'],
        ['content', 'contentStatsLastUpdate']
      ]
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

test('Weixin Channels declares split account and content entrypoints without session URLs', () => {
  const platform = getPlatformById('weixin_channels');

  assert.equal(platform.id, 'weixin_channels');
  assert.deepEqual(platform.hostPermissions, ['https://channels.weixin.qq.com/*']);
  assert.deepEqual(
    platform.syncEntrypoints.map(entrypoint => entrypoint.id),
    ['home', 'videoContent', 'imageTextContent']
  );
  assert.deepEqual(
    platform.syncEntrypoints.map(entrypoint => [entrypoint.id, new URL(entrypoint.url).pathname]),
    [
      ['home', '/platform'],
      ['videoContent', '/platform/post/list'],
      ['imageTextContent', '/platform/post/finderNewLifePostList']
    ]
  );
  assert.equal(
    platform.syncEntrypoints.some(entrypoint => entrypoint.url.includes('_aid=')),
    false
  );
  assert.equal(
    platform.syncEntrypoints.some(entrypoint => entrypoint.url.includes('_rid=')),
    false
  );
  assert.deepEqual(platform.expectedSyncScopes, ['account', 'content']);
  assert.equal(platform.defaultSyncEntrypointId, 'videoContent');
  assert.equal(platform.useOnlyDefaultSyncEntrypoint, true);
  assert.equal(
    platform.syncEntrypoints.find(entrypoint => entrypoint.id === 'videoContent')?.urlPrefix,
    'https://channels.weixin.qq.com/platform/post/'
  );
  assert.deepEqual(platform.webAccessibleResources, [
    {
      resources: ['content/weixin-channels-bridge.js'],
      matches: ['https://channels.weixin.qq.com/*']
    }
  ]);
  assert.deepEqual(
    platform.contentScripts.map(entry => ({
      js: entry.js,
      allFrames: entry.allFrames,
      world: entry.world || null
    })),
    [
      {
        js: ['content/weixin-channels-bridge.js'],
        allFrames: true,
        world: 'MAIN'
      },
      {
        js: ['content/weixin-channels-metrics.js', 'content/weixin-channels-sync.js'],
        allFrames: true,
        world: null
      }
    ]
  );
});

test('Weixin Channels popup card renders account and merged content sections', () => {
  const platform = getPlatformById('weixin_channels');
  const model = platform.createPopupCardModel({
    displayName: '\u793a\u4f8b\u8d26\u53f7',
    fans: 18,
    accountLikeCount: 7,
    playCount: 175,
    likeCount: 14,
    commentCount: 5,
    shareCount: 3,
    favoriteCount: 8,
    worksCount: 3,
    totalWorksCount: 3,
    accountStatsLastUpdate: '2026-04-22T00:00:00.000Z',
    contentStatsLastUpdate: '2026-04-22T00:01:00.000Z',
    contentStatsExact: true
  });

  assert.equal(model.hasData, true);
  assert.equal(model.accountName, '\u793a\u4f8b\u8d26\u53f7');
  assert.deepEqual(
    model.sections.map(section => section.key),
    ['account', 'content']
  );
  assert.equal(model.sections[0].metrics[0].label, '\u7c89\u4e1d');
  assert.equal(model.sections[0].metrics[1].label, '\u70b9\u8d5e');
  assert.equal(model.sections[0].metrics.length, 2);
  assert.deepEqual(
    model.sections[1].metrics.map(metric => metric.label),
    ['\u89c2\u770b\u6570', '\u6536\u85cf\u91cf', '\u8bc4\u8bba\u91cf', '\u5206\u4eab\u91cf']
  );
});

test('Kuaishou empty state includes account fields', () => {
  const platform = getPlatformById('kuaishou');
  const state = platform.createEmptyState();

  assert.equal(state.fans, 0);
  assert.equal(state.accountLikeCount, 0);
  assert.equal(state.accountStatsLastUpdate, null);
  assert.equal(state.accountUpdateSource, null);
});

test('Weibo declares account, video, and article entrypoints with page bridge resources', () => {
  const platform = getPlatformById('weibo');

  assert.equal(platform.id, 'weibo');
  assert.deepEqual(platform.hostPermissions, [
    'https://weibo.com/*',
    'https://www.weibo.com/*',
    'https://me.weibo.com/*'
  ]);
  assert.deepEqual(
    platform.syncEntrypoints.map(entrypoint => entrypoint.id),
    ['account', 'videoContent', 'articleContent']
  );
  assert.equal(platform.syncEntrypoints[0].url, 'https://weibo.com/');
  assert.equal(platform.syncEntrypoints[1].url, 'https://me.weibo.com/content/video');
  assert.equal(platform.syncEntrypoints[2].url, 'https://me.weibo.com/content/article');
  assert.deepEqual(platform.expectedSyncScopes, ['account', 'content']);
  assert.deepEqual(platform.webAccessibleResources, [
    {
      resources: ['content/weibo-bridge.js'],
      matches: [
        'https://weibo.com/*',
        'https://www.weibo.com/*',
        'https://me.weibo.com/*'
      ]
    }
  ]);
  assert.deepEqual(
    platform.contentScripts.map(entry => ({
      js: entry.js,
      world: entry.world || null
    })),
    [
      {
        js: ['content/weibo-bridge.js'],
        world: 'MAIN'
      },
      {
        js: ['content/weibo-metrics.js', 'content/weibo-sync.js'],
        world: null
      }
    ]
  );
  assert.equal(
    platform.matchesActiveTab('https://weibo.com/')?.entrypointId,
    'account'
  );
  assert.equal(
    platform.matchesActiveTab('https://weibo.com/u/9161791838')?.entrypointId,
    'account'
  );
  assert.equal(
    platform.matchesActiveTab('https://www.weibo.com/u/9161791838')?.entrypointId,
    'account'
  );
  assert.equal(
    platform.matchesActiveTab('https://me.weibo.com/content/video')?.entrypointId,
    'videoContent'
  );
  assert.equal(
    platform.matchesActiveTab('https://me.weibo.com/content/article')?.entrypointId,
    'articleContent'
  );
});

test('Weibo popup card renders account and content metrics', () => {
  const platform = getPlatformById('weibo');
  const model = platform.createPopupCardModel({
    displayName: '\u963f\u5c6f\u7684\u5c6f',
    fans: 1,
    playCount: 14,
    likeCount: 5,
    commentCount: 3,
    shareCount: 4,
    danmakuCount: 5,
    worksCount: 2,
    totalWorksCount: 2,
    accountStatsLastUpdate: '2026-04-23T00:00:00.000Z',
    contentStatsLastUpdate: '2026-04-23T00:03:00.000Z',
    contentStatsExact: true
  });

  assert.equal(model.hasData, true);
  assert.equal(model.accountName, '\u963f\u5c6f\u7684\u5c6f');
  assert.deepEqual(
    model.sections.map(section => section.key),
    ['account', 'content']
  );
  assert.deepEqual(
    model.sections[0].metrics.map(metric => metric.label),
    ['\u7c89\u4e1d', '\u70b9\u8d5e']
  );
  assert.deepEqual(
    model.sections[0].metrics.map(metric => metric.variant),
    ['accent', 'hot']
  );
  assert.deepEqual(
    model.sections[1].metrics.map(metric => metric.label),
    ['\u89c2\u770b\u91cf', '\u8bc4\u8bba\u91cf', '\u8f6c\u53d1\u91cf', '\u5f39\u5e55\u91cf']
  );
  assert.deepEqual(
    model.compactMetrics.map(metric => metric.label),
    ['\u7c89\u4e1d', '\u89c2\u770b\u91cf']
  );
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

test('Kuaishou popup card hides account metrics when account stats are missing', () => {
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
  assert.equal(model.compactMetrics.some(metric => metric.label === '粉丝'), false);
  assert.equal(model.sections.some(section => section.key === 'account'), false);
  assert.equal(model.sections[0].key, 'content');
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
