import { createSplitSyncCardModel } from './platform-card-model.js';

export const kuaishouPlatform = {
  id: 'kuaishou',
  displayName: '\u5feb\u624b',
  title: '\u5feb\u624b',
  order: 4,
  hostPermissions: ['https://cp.kuaishou.com/*'],
  syncOptions: {
    tabLoadTimeoutMs: 60000
  },
  expectedSyncScopes: ['account', 'content'],
  contentScripts: [
    {
      matches: ['https://cp.kuaishou.com/*'],
      js: ['content/kuaishou-metrics.js', 'content/kuaishou-sync.js'],
      runAt: 'document_start'
    }
  ],
  webAccessibleResources: [
    {
      resources: ['content/kuaishou-bridge.js'],
      matches: ['https://cp.kuaishou.com/*']
    }
  ],
  syncEntrypoints: [
    {
      id: 'home',
      label: '\u6253\u5f00\u5feb\u624b\u521b\u4f5c\u8005\u9996\u9875',
      actionLabel: '\u540c\u6b65\u8d26\u53f7\u6570\u636e',
      url: 'https://cp.kuaishou.com/',
      urlPrefix: 'https://cp.kuaishou.com/'
    },
    {
      id: 'content',
      label: '\u6253\u5f00\u5feb\u624b\u521b\u4f5c\u8005\u4f5c\u54c1\u7ba1\u7406\u9875',
      actionLabel: '\u540c\u6b65\u4f5c\u54c1\u6570\u636e',
      url: 'https://cp.kuaishou.com/article/manage/video',
      urlPrefix: 'https://cp.kuaishou.com/article/manage/video'
    }
  ],
  defaultSyncEntrypointId: 'content',
  card: {
    mode: 'split',
    homeUrl: 'https://cp.kuaishou.com/',
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
          { key: 'playCount', label: '\u64ad\u653e\u91cf', variant: 'large' },
          { key: 'likeCount', label: '\u70b9\u8d5e\u91cf' },
          { key: 'commentCount', label: '\u8bc4\u8bba\u91cf' }
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
    if (url?.startsWith('https://cp.kuaishou.com/article/manage/video')) {
      return {
        platformId: 'kuaishou',
        entrypointId: 'content',
        platformName: '\u5feb\u624b'
      };
    }
    if (url?.startsWith('https://cp.kuaishou.com/')) {
      return {
        platformId: 'kuaishou',
        entrypointId: 'home',
        platformName: '\u5feb\u624b'
      };
    }
    return null;
  },
  createPopupCardModel(platformData) {
    return createSplitSyncCardModel(this, platformData);
  }
};
