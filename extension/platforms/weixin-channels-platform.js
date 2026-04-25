import { createSplitSyncCardModel } from './platform-card-model.js';

export const weixinChannelsPlatform = {
  id: 'weixin_channels',
  displayName: '\u5fae\u4fe1\u89c6\u9891\u53f7',
  title: '\u5fae\u4fe1\u89c6\u9891\u53f7',
  order: 5,
  hostPermissions: ['https://channels.weixin.qq.com/*'],
  syncOptions: {
    tabLoadTimeoutMs: 60000
  },
  expectedSyncScopes: ['account', 'content'],
  contentScripts: [
    {
      matches: ['https://channels.weixin.qq.com/*'],
      js: ['content/weixin-channels-bridge.js'],
      runAt: 'document_start',
      allFrames: true,
      world: 'MAIN'
    },
    {
      matches: ['https://channels.weixin.qq.com/*'],
      js: ['content/weixin-channels-metrics.js', 'content/weixin-channels-sync.js'],
      runAt: 'document_start',
      allFrames: true
    }
  ],
  webAccessibleResources: [
    {
      resources: ['content/weixin-channels-bridge.js'],
      matches: ['https://channels.weixin.qq.com/*']
    }
  ],
  syncEntrypoints: [
    {
      id: 'home',
      label: '\u6253\u5f00\u5fae\u4fe1\u89c6\u9891\u53f7\u52a9\u624b\u5e73\u53f0\u9875',
      actionLabel: '\u540c\u6b65\u8d26\u53f7\u6570\u636e',
      url: 'https://channels.weixin.qq.com/platform',
      urlPrefix: 'https://channels.weixin.qq.com/platform'
    },
    {
      id: 'videoContent',
      label: '\u6253\u5f00\u5fae\u4fe1\u89c6\u9891\u53f7\u89c6\u9891\u4f5c\u54c1\u9875',
      actionLabel: '\u540c\u6b65\u89c6\u9891\u4f5c\u54c1\u6570\u636e',
      url: 'https://channels.weixin.qq.com/platform/post/list',
      urlPrefix: 'https://channels.weixin.qq.com/platform/post/'
    },
    {
      id: 'imageTextContent',
      label: '\u6253\u5f00\u5fae\u4fe1\u89c6\u9891\u53f7\u56fe\u6587\u4f5c\u54c1\u9875',
      actionLabel: '\u540c\u6b65\u56fe\u6587\u4f5c\u54c1\u6570\u636e',
      url: 'https://channels.weixin.qq.com/platform/post/finderNewLifePostList',
      urlPrefix: 'https://channels.weixin.qq.com/platform/post/finderNewLifePostList'
    }
  ],
  defaultSyncEntrypointId: 'videoContent',
  useOnlyDefaultSyncEntrypoint: true,
  card: {
    mode: 'split',
    homeUrl: 'https://channels.weixin.qq.com/platform',
    accountNameFallback: '\u7b49\u5f85\u8bc6\u522b\u8d26\u53f7',
    compactMetricKeys: ['fans', 'playCount'],
    sections: [
      {
        key: 'account',
        title: '\u8d26\u53f7\u6982\u89c8',
        syncField: 'accountStatsLastUpdate',
        metrics: [
          { key: 'fans', label: '\u7c89\u4e1d', variant: 'accent' },
          { key: 'accountLikeCount', label: '\u70b9\u8d5e', variant: 'hot' }
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
      videoPlayCount: 0,
      videoLikeCount: 0,
      videoCommentCount: 0,
      videoShareCount: 0,
      videoFavoriteCount: 0,
      videoWorksCount: 0,
      videoTotalWorksCount: 0,
      videoScannedItemCount: 0,
      videoResponseCount: 0,
      imageTextPlayCount: 0,
      imageTextLikeCount: 0,
      imageTextCommentCount: 0,
      imageTextShareCount: 0,
      imageTextFavoriteCount: 0,
      imageTextWorksCount: 0,
      imageTextTotalWorksCount: 0,
      imageTextScannedItemCount: 0,
      imageTextResponseCount: 0,
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
    const createMatch = entrypointId => ({
      platformId: 'weixin_channels',
      entrypointId,
      platformName: '\u5fae\u4fe1\u89c6\u9891\u53f7'
    });

    try {
      const target = new URL(String(url || ''));
      const requestedEntry = target.searchParams.get('allfansEntry');
      if (requestedEntry === 'videoContent' || requestedEntry === 'imageTextContent') {
        return createMatch(requestedEntry);
      }
    } catch {}

    if (
      url?.startsWith('https://channels.weixin.qq.com/platform/post/finderNewLifePostList') ||
      url?.startsWith('https://channels.weixin.qq.com/micro/content/post/finderNewLifePostList')
    ) {
      return createMatch('imageTextContent');
    }

    if (
      url?.startsWith('https://channels.weixin.qq.com/platform/post/list') ||
      url?.startsWith('https://channels.weixin.qq.com/micro/content/post/list')
    ) {
      return createMatch('videoContent');
    }

    if (url?.startsWith('https://channels.weixin.qq.com/platform')) {
      return createMatch('home');
    }

    return null;
  },
  createPopupCardModel(platformData) {
    return createSplitSyncCardModel(this, platformData);
  }
};
