import { formatChange, formatNumber, formatTime } from '../popup/formatters.js';

export const bilibiliPlatform = {
  id: 'bilibili',
  displayName: '哔哩哔哩',
  title: '哔哩哔哩',
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
      label: '打开哔哩哔哩创作中心首页',
      actionLabel: '同步数据',
      url: 'https://member.bilibili.com/platform/home',
      urlPrefix: 'https://member.bilibili.com/platform/home'
    }
  ],
  defaultSyncEntrypointId: 'home',
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
        platformName: '哔哩哔哩'
      };
    }

    return null;
  },
  createPopupCardModel(platformData) {
    const hasData = Boolean(platformData?.lastUpdate);
    const sections = [];

    if (hasData) {
      sections.push({
        key: 'account',
        title: '账号概览',
        meta: `最近同步：${formatTime(platformData.lastUpdate)}`,
        metrics: [
          {
            label: '粉丝',
            value: formatNumber(platformData?.fans || 0),
            variant: 'accent',
            inlineChange: formatChange(platformData?.fansChangeToday || 0),
            inlineChangeTone: (platformData?.fansChangeToday || 0) >= 0 ? 'success' : 'danger'
          },
          {
            label: '累计获赞',
            value: formatNumber(platformData?.likeCount || 0),
            variant: 'hot'
          }
        ]
      });

      sections.push({
        key: 'content',
        title: '作品汇总',
        meta: `最近同步：${formatTime(platformData.lastUpdate)}`,
        metrics: [
          { label: '观看数', value: formatNumber(platformData?.playCount || 0), variant: 'large' },
          { label: '收藏量', value: formatNumber(platformData?.favoriteCount || 0) },
          { label: '评论量', value: formatNumber(platformData?.commentCount || 0) },
          { label: '分享量', value: formatNumber(platformData?.shareCount || 0) },
          { label: '弹幕量', value: formatNumber(platformData?.danmakuCount || 0) },
          { label: '投币量', value: formatNumber(platformData?.coinCount || 0) }
        ]
      });
    }

    return {
      id: 'bilibili',
      title: '哔哩哔哩',
      kicker: 'Platform 01',
      accountName: platformData?.displayName || '等待识别账号',
      hasData,
      homeUrl: 'https://member.bilibili.com/platform/home',
      compactMetrics: [
        { label: '粉丝', value: formatNumber(platformData?.fans || 0) },
        { label: '观看数', value: formatNumber(platformData?.playCount || 0) }
      ],
      sections
    };
  }
};
