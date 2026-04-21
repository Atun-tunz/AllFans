import { createSplitSyncCardModel } from './platform-card-model.js';

export const xiaohongshuPlatform = {
  id: 'xiaohongshu',
  displayName: '\u5c0f\u7ea2\u4e66',
  title: '\u5c0f\u7ea2\u4e66',
  order: 3,
  hostPermissions: ['https://creator.xiaohongshu.com/*'],
  contentScripts: [
    {
      matches: ['https://creator.xiaohongshu.com/*'],
      js: ['content/xiaohongshu-metrics.js', 'content/xiaohongshu-sync.js'],
      runAt: 'document_start'
    }
  ],
  webAccessibleResources: [
    {
      resources: ['content/xiaohongshu-bridge.js'],
      matches: ['https://creator.xiaohongshu.com/*']
    }
  ],
  syncEntrypoints: [
    {
      id: 'home',
      label: '\u6253\u5f00\u5c0f\u7ea2\u4e66\u4e3b\u9875\u6982\u89c8\u9875\u9762',
      actionLabel: '\u540c\u6b65\u8d26\u53f7\u6570\u636e',
      url: 'https://creator.xiaohongshu.com/new/home',
      urlPrefix: 'https://creator.xiaohongshu.com/new/home'
    },
    {
      id: 'notes',
      label: '\u6253\u5f00\u5c0f\u7ea2\u4e66\u7b14\u8bb0\u7ba1\u7406\u9875\u9762',
      actionLabel: '\u540c\u6b65\u4f5c\u54c1\u6570\u636e',
      url: 'https://creator.xiaohongshu.com/new/note-manager',
      urlPrefix: 'https://creator.xiaohongshu.com/new/note-manager'
    }
  ],
  defaultSyncEntrypointId: 'notes',
  useOnlyDefaultSyncEntrypoint: true,
  card: {
    mode: 'split',
    homeUrl: 'https://creator.xiaohongshu.com/new/home',
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
    if (url?.startsWith('https://creator.xiaohongshu.com/new/home')) {
      return {
        platformId: 'xiaohongshu',
        entrypointId: 'home',
        platformName: '\u5c0f\u7ea2\u4e66'
      };
    }

    if (url?.startsWith('https://creator.xiaohongshu.com/new/note-manager')) {
      return {
        platformId: 'xiaohongshu',
        entrypointId: 'notes',
        platformName: '\u5c0f\u7ea2\u4e66'
      };
    }

    return null;
  },
  createPopupCardModel(platformData) {
    return createSplitSyncCardModel(this, platformData);
  }
};
