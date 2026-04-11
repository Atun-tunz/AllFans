import { formatNumber, formatTime } from '../popup/formatters.js';

export const douyinPlatform = {
  id: 'douyin',
  displayName: '抖音',
  title: 'Douyin',
  order: 2,
  hostPermissions: [
    'https://www.douyin.com/*',
    'https://creator.douyin.com/*'
  ],
  contentScripts: [
    {
      matches: ['https://creator.douyin.com/*'],
      js: ['content/douyin-metrics.js', 'content/douyin-sync.js'],
      runAt: 'document_idle'
    }
  ],
  syncEntrypoints: [
    {
      id: 'home',
      label: '打开抖音创作者中心首页',
      actionLabel: '同步粉丝数',
      url: 'https://creator.douyin.com/creator-micro/home',
      urlPrefix: 'https://creator.douyin.com/creator-micro/home'
    },
    {
      id: 'content',
      label: '打开抖音作品管理页',
      actionLabel: '同步作品数据',
      url: 'https://creator.douyin.com/creator-micro/content/manage',
      urlPrefix: 'https://creator.douyin.com/creator-micro/content/manage'
    }
  ],
  defaultSyncEntrypointId: 'content',
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
      totalLikeCount: state?.likeCount || 0
    };
  },
  matchesActiveTab(url) {
    if (url?.startsWith('https://creator.douyin.com/creator-micro/content/manage')) {
      return {
        platformId: 'douyin',
        entrypointId: 'content',
        platformName: '抖音'
      };
    }

    if (url?.startsWith('https://creator.douyin.com/creator-micro/home')) {
      return {
        platformId: 'douyin',
        entrypointId: 'home',
        platformName: '抖音'
      };
    }

    return null;
  },
  createPopupCardModel(platformData, context = {}) {
    const hasAccount = Boolean(platformData?.accountStatsLastUpdate);
    const hasContent = Boolean(platformData?.contentStatsLastUpdate);
    const hasData = hasAccount || hasContent;

    let status = '暂无数据';
    let statusTone = 'muted';
    if (hasData) {
      status = context.justSynced
        ? '刚同步'
        : hasContent && !platformData?.contentStatsExact
          ? '部分缓存'
          : '已缓存';
      statusTone = context.justSynced ? 'success' : 'warning';
    }

    const sections = [];

    if (hasAccount) {
      sections.push({
        title: '账号概览',
        meta: `最近同步：${formatTime(platformData.accountStatsLastUpdate)}`,
        metrics: [
          { label: '粉丝', value: formatNumber(platformData?.fans || 0), variant: 'accent' },
          {
            label: '累计获赞',
            value: formatNumber(platformData?.accountLikeCount || 0),
            variant: 'hot'
          }
        ]
      });
    }

    if (hasContent) {
      sections.push({
        title: '作品汇总',
        meta: `最近同步：${formatTime(platformData.contentStatsLastUpdate)}`,
        metrics: [
          { label: '作品数', value: formatNumber(platformData?.worksCount || 0), variant: 'large' },
          { label: '播放量', value: formatNumber(platformData?.playCount || 0), variant: 'large' },
          { label: '点赞量', value: formatNumber(platformData?.likeCount || 0) },
          { label: '评论量', value: formatNumber(platformData?.commentCount || 0) },
          { label: '分享量', value: formatNumber(platformData?.shareCount || 0) },
          { label: '收藏量', value: formatNumber(platformData?.favoriteCount || 0) }
        ]
      });
    }

    return {
      id: 'douyin',
      title: 'Douyin',
      kicker: 'Platform 02',
      accountName: platformData?.displayName || '等待识别账号',
      status,
      statusTone,
      hasData,
      compactMetrics: [
        { label: '粉丝', value: formatNumber(platformData?.fans || 0) },
        { label: '播放量', value: formatNumber(platformData?.playCount || 0) }
      ],
      sections,
      syncEntrypoints: this.syncEntrypoints.map(entrypoint => ({
        ...entrypoint,
        platformId: 'douyin'
      }))
    };
  }
};
