import { formatNumber, formatTime } from '../popup/formatters.js';

export const douyinPlatform = {
  id: 'douyin',
  displayName: '抖音',
  title: '抖音',
  order: 2,
  hostPermissions: ['https://www.douyin.com/*', 'https://creator.douyin.com/*'],
  contentScripts: [
    {
      matches: ['https://creator.douyin.com/*'],
      js: ['content/douyin-metrics.js', 'content/douyin-sync.js'],
      runAt: 'document_start'
    }
  ],
  syncEntrypoints: [
    {
      id: 'home',
      label: '打开抖音创作者中心首页',
      actionLabel: '同步账号数据',
      url: 'https://creator.douyin.com/creator-micro/home',
      urlPrefix: 'https://creator.douyin.com/creator-micro/home'
    },
    {
      id: 'content',
      label: '打开抖音作品管理页面',
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
      totalLikeCount: state?.accountLikeCount || state?.likeCount || 0
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
  createPopupCardModel(platformData) {
    const hasAccount = Boolean(platformData?.accountStatsLastUpdate);
    const hasContent = Boolean(platformData?.contentStatsLastUpdate);
    const hasData = hasAccount || hasContent;
    const sections = [];

    if (hasAccount) {
      sections.push({
        key: 'account',
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
        key: 'content',
        title: '作品汇总',
        meta: `最近同步：${formatTime(platformData.contentStatsLastUpdate)}`,
        metrics: [
          { label: '观看数', value: formatNumber(platformData?.playCount || 0), variant: 'large' },
          { label: '收藏量', value: formatNumber(platformData?.favoriteCount || 0) },
          { label: '评论量', value: formatNumber(platformData?.commentCount || 0) },
          { label: '分享量', value: formatNumber(platformData?.shareCount || 0) }
        ]
      });
    }

    return {
      id: 'douyin',
      title: '抖音',
      kicker: 'Platform 02',
      accountName: platformData?.displayName || '等待识别账号',
      hasData,
      homeUrl: 'https://creator.douyin.com/creator-micro/home',
      compactMetrics: [
        { label: '粉丝', value: formatNumber(platformData?.fans || 0) },
        { label: '观看数', value: formatNumber(platformData?.playCount || 0) }
      ],
      sections
    };
  }
};
