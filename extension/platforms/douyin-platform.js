import { createSplitSyncCardModel } from './platform-card-model.js';

export const douyinPlatform = {
  id: 'douyin',
  displayName: '\u6296\u97f3',
  title: '\u6296\u97f3',
  order: 2,
  hostPermissions: ['https://www.douyin.com/*', 'https://creator.douyin.com/*'],
  syncOptions: {
    tabLoadTimeoutMs: 90000,
    messageRetryCount: 40,
    messageRetryDelayMs: 500
  },
  contentScripts: [
    {
      matches: ['https://creator.douyin.com/*'],
      js: ['content/douyin-bridge.js'],
      runAt: 'document_start',
      world: 'MAIN'
    },
    {
      matches: ['https://creator.douyin.com/*'],
      js: ['content/douyin-metrics.js', 'content/douyin-sync.js'],
      runAt: 'document_start'
    }
  ],
  webAccessibleResources: [
    {
      resources: ['content/douyin-bridge.js'],
      matches: ['https://creator.douyin.com/*']
    }
  ],
  syncEntrypoints: [
    {
      id: 'home',
      label: '\u6253\u5f00\u6296\u97f3\u521b\u4f5c\u8005\u4e2d\u5fc3\u9996\u9875',
      actionLabel: '\u540c\u6b65\u8d26\u53f7\u6570\u636e',
      url: 'https://creator.douyin.com/creator-micro/home',
      urlPrefix: 'https://creator.douyin.com/creator-micro/home'
    },
    {
      id: 'content',
      label: '\u6253\u5f00\u6296\u97f3\u4f5c\u54c1\u7ba1\u7406\u9875\u9762',
      actionLabel: '\u540c\u6b65\u4f5c\u54c1\u6570\u636e',
      url: 'https://creator.douyin.com/creator-micro/content/manage',
      urlPrefix: 'https://creator.douyin.com/creator-micro/content/manage'
    }
  ],
  defaultSyncEntrypointId: 'content',
  useOnlyDefaultSyncEntrypoint: true,
  card: {
    mode: 'split',
    homeUrl: 'https://creator.douyin.com/creator-micro/home',
    accountNameFallback: '\u7b49\u5f85\u8bc6\u522b\u8d26\u53f7',
    compactMetricKeys: ['fans', 'playCount'],
    sections: [
      {
        key: 'account',
        title: '\u8d26\u53f7\u6982\u89c8',
        syncField: 'accountStatsLastUpdate',
        metrics: [
          { key: 'fans', label: '\u7c89\u4e1d', variant: 'accent' },
          { key: 'accountLikeCount', label: '\u7d2f\u8ba1\u83b7\u8d5e', variant: 'hot' }
        ]
      },
      {
        key: 'content',
        title: '\u4f5c\u54c1\u6c47\u603b',
        syncField: 'contentStatsLastUpdate',
        meta: 'contentSummary',
        metrics: [
          { key: 'playCount', label: '\u89c2\u770b\u6570', variant: 'large' },
          { key: 'favoriteCount', label: '\u6536\u85cf\u91cf' },
          { key: 'commentCount', label: '\u8bc4\u8bba\u91cf' },
          { key: 'shareCount', label: '\u5206\u4eab\u91cf' }
        ]
      }
    ]
  },
  createEmptyState() {
    return {
      displayName: '',
      fans: 0,
      accountLikeCount: 0,
      playCount: 0,
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      favoriteCount: 0,
      worksCount: 0,
      totalWorksCount: 0,
      scannedItemCount: 0,
      accountStatsLastUpdate: null,
      accountUpdateSource: null,
      contentStatsLastUpdate: null,
      contentStatsExact: false,
      lastUpdate: null,
      updateSource: null
    };
  },
  getSummaryContributions(state) {
    return {
      totalFans: state?.fans || 0,
      totalPlayCount: state?.playCount || 0,
      totalLikeCount: state?.accountLikeCount || state?.likeCount || 0
    };
  },
  matchesActiveTab(url) {
    if (url?.startsWith('https://creator.douyin.com/creator-micro/content/manage')) {
      return {
        platformId: 'douyin',
        entrypointId: 'content',
        platformName: '\u6296\u97f3'
      };
    }

    if (url?.startsWith('https://creator.douyin.com/creator-micro/home')) {
      return {
        platformId: 'douyin',
        entrypointId: 'home',
        platformName: '\u6296\u97f3'
      };
    }

    return null;
  },
  createPopupCardModel(platformData) {
    return createSplitSyncCardModel(this, platformData);
  }
};
