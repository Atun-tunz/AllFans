import { formatNumber, formatTime } from '../popup/formatters.js';

function buildContentMeta(platformData) {
  const parts = [`\u6700\u8fd1\u540c\u6b65\uff1a${formatTime(platformData.contentStatsLastUpdate)}`];
  const worksCount = Number(platformData?.worksCount) || 0;
  const totalWorksCount = Number(platformData?.totalWorksCount) || 0;

  if (platformData?.contentStatsExact && totalWorksCount === 0) {
    parts.push('\u4f5c\u54c1 0');
  } else if (totalWorksCount > 0 && totalWorksCount !== worksCount) {
    parts.push(`\u4f5c\u54c1 ${formatNumber(worksCount)} / ${formatNumber(totalWorksCount)}`);
  } else {
    parts.push(`\u4f5c\u54c1 ${formatNumber(worksCount)}`);
  }

  return parts.join(' | ');
}

export const xiaohongshuPlatform = {
  id: 'xiaohongshu',
  displayName: '小红书',
  title: '小红书',
  order: 3,
  hostPermissions: ['https://creator.xiaohongshu.com/*'],
  contentScripts: [
    {
      matches: ['https://creator.xiaohongshu.com/*'],
      js: ['content/xiaohongshu-metrics.js', 'content/xiaohongshu-sync.js'],
      runAt: 'document_start'
    }
  ],
  syncEntrypoints: [
    {
      id: 'home',
      label: '打开小红书主页概览页面',
      actionLabel: '同步账号数据',
      url: 'https://creator.xiaohongshu.com/new/home',
      urlPrefix: 'https://creator.xiaohongshu.com/new/home'
    },
    {
      id: 'notes',
      label: '打开小红书笔记管理页面',
      actionLabel: '同步作品数据',
      url: 'https://creator.xiaohongshu.com/new/note-manager',
      urlPrefix: 'https://creator.xiaohongshu.com/new/note-manager'
    }
  ],
  defaultSyncEntrypointId: 'notes',
  useOnlyDefaultSyncEntrypoint: true,
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
        platformName: '小红书'
      };
    }

    if (url?.startsWith('https://creator.xiaohongshu.com/new/note-manager')) {
      return {
        platformId: 'xiaohongshu',
        entrypointId: 'notes',
        platformName: '小红书'
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

    const contentSection = sections.find(section => section.key === 'content');
    if (contentSection) {
      contentSection.meta = buildContentMeta(platformData);
    }

    return {
      id: 'xiaohongshu',
      title: '小红书',
      kicker: 'Platform 03',
      accountName: platformData?.displayName || '等待识别账号',
      hasData,
      homeUrl: 'https://creator.xiaohongshu.com/new/home',
      compactMetrics: [
        { label: '粉丝', value: formatNumber(platformData?.fans || 0) },
        { label: '观看数', value: formatNumber(platformData?.playCount || 0) }
      ],
      sections
    };
  }
};
