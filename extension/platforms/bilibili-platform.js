import { createSingleSyncCardModel } from './platform-card-model.js';

export const bilibiliPlatform = {
  id: 'bilibili',
  displayName: '\u54d4\u54e9\u54d4\u54e9',
  title: '\u54d4\u54e9\u54d4\u54e9',
  order: 1,
  hostPermissions: [
    'https://api.bilibili.com/*',
    'https://member.bilibili.com/*',
    'https://space.bilibili.com/*'
  ],
  contentScripts: [
    {
      matches: ['https://member.bilibili.com/platform/home*'],
      js: ['content/bilibili-metrics.js', 'content/bilibili-sync.js'],
      runAt: 'document_idle'
    }
  ],
  syncEntrypoints: [
    {
      id: 'home',
      label: '\u6253\u5f00\u54d4\u54e9\u54d4\u54e9\u521b\u4f5c\u4e2d\u5fc3\u9996\u9875',
      actionLabel: '\u540c\u6b65\u6570\u636e',
      url: 'https://member.bilibili.com/platform/home',
      urlPrefix: 'https://member.bilibili.com/platform/home'
    }
  ],
  defaultSyncEntrypointId: 'home',
  card: {
    mode: 'single',
    homeUrl: 'https://member.bilibili.com/platform/home',
    accountNameFallback: '\u7b49\u5f85\u8bc6\u522b\u8d26\u53f7',
    compactMetricKeys: ['fans', 'playCount'],
    sections: [
      {
        key: 'account',
        title: '\u8d26\u53f7\u6982\u89c8',
        syncField: 'lastUpdate',
        metrics: [
          {
            key: 'fans',
            label: '\u7c89\u4e1d',
            variant: 'accent',
            inlineChangeKey: 'fansChangeToday'
          },
          {
            key: 'likeCount',
            label: '\u7d2f\u8ba1\u83b7\u8d5e',
            variant: 'hot'
          }
        ]
      },
      {
        key: 'content',
        title: '\u4f5c\u54c1\u6c47\u603b',
        syncField: 'lastUpdate',
        metrics: [
          { key: 'playCount', label: '\u89c2\u770b\u6570', variant: 'large' },
          { key: 'favoriteCount', label: '\u6536\u85cf\u91cf' },
          { key: 'commentCount', label: '\u8bc4\u8bba\u91cf' },
          { key: 'shareCount', label: '\u5206\u4eab\u91cf' },
          { key: 'danmakuCount', label: '\u5f39\u5e55\u91cf' },
          { key: 'coinCount', label: '\u6295\u5e01\u91cf' }
        ]
      }
    ]
  },
  createEmptyState() {
    return {
      uid: 0,
      displayName: '',
      fans: 0,
      fansChangeToday: 0,
      playCount: 0,
      likeCount: 0,
      commentCount: 0,
      danmakuCount: 0,
      shareCount: 0,
      favoriteCount: 0,
      coinCount: 0,
      lastUpdate: null,
      updateSource: null
    };
  },
  getSummaryContributions(state) {
    return {
      totalFans: state?.fans || 0,
      totalPlayCount: state?.playCount || 0,
      totalLikeCount: state?.likeCount || 0
    };
  },
  matchesActiveTab(url) {
    if (url?.startsWith('https://member.bilibili.com/platform/home')) {
      return {
        platformId: 'bilibili',
        entrypointId: 'home',
        platformName: '\u54d4\u54e9\u54d4\u54e9'
      };
    }

    return null;
  },
  createPopupCardModel(platformData) {
    return createSingleSyncCardModel(this, platformData);
  }
};
