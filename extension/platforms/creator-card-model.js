import { formatNumber, formatTime } from '../popup/formatters.js';

export const ACCOUNT_PENDING_TEXT = '\u672a\u540c\u6b65';

export function buildCreatorContentMeta(platformData, { timestampField = 'contentStatsLastUpdate' } = {}) {
  const parts = [`\u6700\u8fd1\u540c\u6b65\uff1a${formatTime(platformData?.[timestampField])}`];
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

export function hasAccountStats(platformData) {
  return Boolean(platformData?.accountStatsLastUpdate);
}

export function getAccountMetricValue(
  platformData,
  field,
  { pendingText = ACCOUNT_PENDING_TEXT } = {}
) {
  return hasAccountStats(platformData) ? formatNumber(platformData?.[field] || 0) : pendingText;
}

export function createAccountOverviewSection(
  platformData,
  { includePending = false, pendingText = ACCOUNT_PENDING_TEXT } = {}
) {
  const hasAccount = hasAccountStats(platformData);
  if (!hasAccount && !includePending) {
    return null;
  }

  return {
    key: 'account',
    title: '\u8d26\u53f7\u6982\u89c8',
    meta: hasAccount
      ? `\u6700\u8fd1\u540c\u6b65\uff1a${formatTime(platformData.accountStatsLastUpdate)}`
      : pendingText,
    metrics: [
      {
        label: '\u7c89\u4e1d',
        value: getAccountMetricValue(platformData, 'fans', { pendingText }),
        variant: 'accent'
      },
      {
        label: '\u7d2f\u8ba1\u83b7\u8d5e',
        value: getAccountMetricValue(platformData, 'accountLikeCount', { pendingText }),
        variant: 'hot'
      }
    ]
  };
}
