import { createSplitSyncCardModel } from './platform-card-model.js';

export const weiboPlatform = {
  id: 'weibo',
  displayName: '微博',
  title: '微博',
  order: 6,
  hostPermissions: ['https://weibo.com/*', 'https://www.weibo.com/*', 'https://me.weibo.com/*'],
  syncOptions: {
    tabLoadTimeoutMs: 60000
  },
  expectedSyncScopes: ['account', 'content'],
  contentScripts: [
    {
      matches: ['https://weibo.com/*', 'https://www.weibo.com/*', 'https://me.weibo.com/*'],
      js: ['content/weibo-bridge.js'],
      runAt: 'document_start',
      world: 'MAIN'
    },
    {
      matches: ['https://weibo.com/*', 'https://www.weibo.com/*', 'https://me.weibo.com/*'],
      js: ['content/weibo-metrics.js', 'content/weibo-sync.js'],
      runAt: 'document_start'
    }
  ],
  webAccessibleResources: [
    {
      resources: ['content/weibo-bridge.js'],
      matches: ['https://weibo.com/*', 'https://www.weibo.com/*', 'https://me.weibo.com/*']
    }
  ],
  syncEntrypoints: [
    {
      id: 'account',
      label: '打开微博主页',
      actionLabel: '同步粉丝数据',
      url: 'https://weibo.com/',
      urlPrefix: 'https://weibo.com/'
    },
    {
      id: 'videoContent',
      label: '打开微博视频管理页',
      actionLabel: '同步视频数据',
      url: 'https://me.weibo.com/content/video',
      urlPrefix: 'https://me.weibo.com/content/video'
    },
    {
      id: 'articleContent',
      label: '打开微博文章管理页',
      actionLabel: '同步文章数据',
      url: 'https://me.weibo.com/content/article',
      urlPrefix: 'https://me.weibo.com/content/article'
    }
  ],
  defaultSyncEntrypointId: 'videoContent',
  card: {
    mode: 'split',
    homeUrl: 'https://me.weibo.com/',
    accountNameFallback: '等待识别账号',
    compactMetricKeys: ['fans', 'playCount'],
    sections: [
      {
        key: 'account',
        title: '账号概览',
        syncField: 'accountStatsLastUpdate',
        metrics: [
          { key: 'fans', label: '粉丝', variant: 'accent' },
          { key: 'likeCount', label: '点赞', variant: 'hot' },
        ]
      },
      {
        key: 'content',
        title: '作品汇总',
        syncField: 'contentStatsLastUpdate',
        meta: 'contentSummary',
        metrics: [
          { key: 'playCount', label: '观看量', variant: 'large' },
          { key: 'commentCount', label: '评论量' },
          { key: 'shareCount', label: '转发量' },
          { key: 'danmakuCount', label: '弹幕量' }
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
        platformName: '微博'
      };
    }

    if (url?.startsWith('https://me.weibo.com/content/article')) {
      return {
        platformId: 'weibo',
        entrypointId: 'articleContent',
        platformName: '微博'
      };
    }

    if (url?.startsWith('https://weibo.com/') || url?.startsWith('https://www.weibo.com/')) {
      return {
        platformId: 'weibo',
        entrypointId: 'account',
        platformName: '微博'
      };
    }

    return null;
  },
  createPopupCardModel(platformData) {
    return createSplitSyncCardModel(this, platformData);
  }
};
