import { formatNumber } from '../popup/formatters.js';
import {
  buildCreatorContentMeta,
  createAccountOverviewSection,
  getAccountMetricValue
} from './creator-card-model.js';

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
    const hasAccount = Boolean(platformData?.accountStatsLastUpdate);
    const hasContent = Boolean(platformData?.contentStatsLastUpdate || platformData?.lastUpdate);
    const hasData = hasAccount || hasContent;
    const accountFanValue = getAccountMetricValue(platformData, 'fans');
    const sections = [];
    const accountSection = createAccountOverviewSection(platformData, { includePending: hasContent });

    if (accountSection) {
      sections.push(accountSection);
    }

    if (hasContent) {
      sections.push({
        key: 'content',
        title: '\u4f5c\u54c1\u6c47\u603b',
        meta: buildCreatorContentMeta({
          ...platformData,
          contentStatsLastUpdate: platformData?.contentStatsLastUpdate || platformData?.lastUpdate
        }),
        metrics: [
          { label: '\u64ad\u653e\u91cf', value: formatNumber(platformData?.playCount || 0), variant: 'large' },
          { label: '\u70b9\u8d5e\u91cf', value: formatNumber(platformData?.likeCount || 0) },
          { label: '\u8bc4\u8bba\u91cf', value: formatNumber(platformData?.commentCount || 0) }
        ]
      });
    }

    return {
      id: 'kuaishou',
      title: '\u5feb\u624b',
      kicker: 'Platform 04',
      accountName: platformData?.displayName || '\u7b49\u5f85\u8bc6\u522b\u8d26\u53f7',
      hasData,
      homeUrl: 'https://cp.kuaishou.com/',
      compactMetrics: [
        { label: '\u7c89\u4e1d', value: accountFanValue },
        { label: '\u64ad\u653e\u91cf', value: formatNumber(platformData?.playCount || 0) }
      ],
      sections
    };
  }
};
