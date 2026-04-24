import { createSplitSyncCardModel } from './platform-card-model.js';

export const weiboPlatform = {
  id: 'weibo',
  displayName: '\u5fae\u535a',
  title: '\u5fae\u535a',
  order: 6,
  hostPermissions: ['https://weibo.com/*', 'https://me.weibo.com/*'],
  syncOptions: {
    tabLoadTimeoutMs: 60000
  },
  expectedSyncScopes: ['account', 'content'],
  contentScripts: [
    {
      matches: ['https://weibo.com/*', 'https://me.weibo.com/*'],
      js: ['content/weibo-metrics.js', 'content/weibo-sync.js'],
      runAt: 'document_start'
    }
  ],
  webAccessibleResources: [
    {
      resources: ['content/weibo-bridge.js'],
      matches: ['https://weibo.com/*', 'https://me.weibo.com/*']
    }
  ],
  syncEntrypoints: [
    {
      id: 'account',
      label: '\u6253\u5f00\u5fae\u535a\u4e3b\u9875',
      actionLabel: '\u540c\u6b65\u7c89\u4e1d\u6570\u636e',
      url: 'https://weibo.com/',
      urlPrefix: 'https://weibo.com/'
    },
    {
      id: 'videoContent',
      label: '\u6253\u5f00\u5fae\u535a\u89c6\u9891\u7ba1\u7406\u9875',
      actionLabel: '\u540c\u6b65\u89c6\u9891\u6570\u636e',
      url: 'https://me.weibo.com/content/video',
      urlPrefix: 'https://me.weibo.com/content/video'
    },
    {
      id: 'articleContent',
      label: '\u6253\u5f00\u5fae\u535a\u6587\u7ae0\u7ba1\u7406\u9875',
      actionLabel: '\u540c\u6b65\u6587\u7ae0\u6570\u636e',
      url: 'https://me.weibo.com/content/article',
      urlPrefix: 'https://me.weibo.com/content/article'
    }
  ],
  defaultSyncEntrypointId: 'videoContent',
  card: {
    mode: 'split',
    homeUrl: 'https://me.weibo.com/',
    accountNameFallback: '\u7b49\u5f85\u8bc6\u522b\u8d26\u53f7',
    compactMetricKeys: ['fans', 'playCount'],
    sections: [
      {
        key: 'account',
        title: '\u8d26\u53f7\u6982\u89c8',
        syncField: 'accountStatsLastUpdate',
        metrics: [
          { key: 'fans', label: '\u7c89\u4e1d', variant: 'accent' },
          { key: 'likeCount', label: '\u70b9\u8d5e\u91cf', variant: 'hot'},
        ]
      },
      {
        key: 'content',
        title: '\u4f5c\u54c1\u6c47\u603b',
        syncField: 'contentStatsLastUpdate',
        meta: 'contentSummary',
        metrics: [
          { key: 'playCount', label: '\u89c2\u770b\u91cf', variant: 'large' },
          { key: 'commentCount', label: '\u8bc4\u8bba\u91cf' },
          { key: 'shareCount', label: '\u8f6c\u53d1\u91cf' },
          { key: 'danmakuCount', label: '\u5f39\u5e55\u91cf' }
        ]
      }
    ]
  },
  createEmptyState() {
    return {
      displayName: '',
      fans: 0,
      playCount: 0,
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      danmakuCount: 0,
      worksCount: 0,
      totalWorksCount: 0,
      scannedItemCount: 0,
      videoPlayCount: 0,
      videoLikeCount: 0,
      videoCommentCount: 0,
      videoShareCount: 0,
      videoDanmakuCount: 0,
      videoWorksCount: 0,
      videoResponseCount: 0,
      articlePlayCount: 0,
      articleLikeCount: 0,
      articleCommentCount: 0,
      articleShareCount: 0,
      articleDanmakuCount: 0,
      articleWorksCount: 0,
      articleResponseCount: 0,
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
      totalLikeCount: state?.likeCount || 0
    };
  },
  matchesActiveTab(url) {
    if (url?.startsWith('https://me.weibo.com/content/video')) {
      return {
        platformId: 'weibo',
        entrypointId: 'videoContent',
        platformName: '\u5fae\u535a'
      };
    }

    if (url?.startsWith('https://me.weibo.com/content/article')) {
      return {
        platformId: 'weibo',
        entrypointId: 'articleContent',
        platformName: '\u5fae\u535a'
      };
    }

    if (url?.startsWith('https://weibo.com/')) {
      return {
        platformId: 'weibo',
        entrypointId: 'account',
        platformName: '\u5fae\u535a'
      };
    }

    return null;
  },
  createPopupCardModel(platformData) {
    return createSplitSyncCardModel(this, platformData);
  }
};
