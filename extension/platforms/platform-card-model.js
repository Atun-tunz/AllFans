import { formatChange, formatNumber, formatTime } from '../popup/formatters.js';

const DEFAULT_ACCOUNT_NAME_FALLBACK = '\u7b49\u5f85\u8bc6\u522b\u8d26\u53f7';

function hasOwnDataKey(platformData, key) {
  return Object.prototype.hasOwnProperty.call(platformData || {}, key);
}

function getSectionSyncTime(section, platformData) {
  return platformData?.[section.syncField];
}

function isSectionSynced(section, platformData) {
  return Boolean(getSectionSyncTime(section, platformData));
}

function getMetricValue(platformData, key) {
  return Number(platformData?.[key] || 0);
}

function buildContentSummaryMeta(section, platformData) {
  const parts = [`\u6700\u8fd1\u540c\u6b65\uff1a${formatTime(getSectionSyncTime(section, platformData))}`];
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

function buildSectionMeta(section, platformData) {
  if (section.meta === 'contentSummary') {
    return buildContentSummaryMeta(section, platformData);
  }

  return `\u6700\u8fd1\u540c\u6b65\uff1a${formatTime(getSectionSyncTime(section, platformData))}`;
}

function buildMetric(metric, platformData) {
  const value = getMetricValue(platformData, metric.key);
  const result = {
    label: metric.label,
    value: formatNumber(value)
  };

  if (metric.variant) {
    result.variant = metric.variant;
  }

  if (metric.inlineChangeKey && hasOwnDataKey(platformData, metric.inlineChangeKey)) {
    const inlineChangeValue = getMetricValue(platformData, metric.inlineChangeKey);
    result.inlineChange = formatChange(inlineChangeValue);
    result.inlineChangeTone = inlineChangeValue >= 0 ? 'success' : 'danger';
  }

  return result;
}

function isMetricAvailable(metric, section, platformData) {
  return isSectionSynced(section, platformData) && hasOwnDataKey(platformData, metric.key);
}

function buildSection(section, platformData) {
  if (!isSectionSynced(section, platformData)) {
    return null;
  }

  const metrics = (section.metrics || [])
    .filter(metric => isMetricAvailable(metric, section, platformData))
    .map(metric => buildMetric(metric, platformData));

  if (metrics.length === 0) {
    return null;
  }

  return {
    key: section.key,
    title: section.title,
    meta: buildSectionMeta(section, platformData),
    metrics
  };
}

function flattenMetricConfigs(card) {
  return (card.sections || []).flatMap(section =>
    (section.metrics || []).map(metric => ({
      section,
      metric
    }))
  );
}

function buildCompactMetrics(card, platformData) {
  const metricConfigs = flattenMetricConfigs(card);

  return (card.compactMetricKeys || [])
    .map(metricKey => metricConfigs.find(config => config.metric.key === metricKey))
    .filter(Boolean)
    .filter(({ section, metric }) => isMetricAvailable(metric, section, platformData))
    .map(({ metric }) => ({
      label: metric.label,
      value: formatNumber(getMetricValue(platformData, metric.key))
    }));
}

function createCardModel(platform, platformData) {
  const card = platform.card || {};
  const sections = (card.sections || [])
    .map(section => buildSection(section, platformData))
    .filter(Boolean);
  const hasData = (card.sections || []).some(section => isSectionSynced(section, platformData));

  return {
    id: platform.id,
    title: platform.title,
    kicker: `Platform ${String(platform.order).padStart(2, '0')}`,
    accountName: platformData?.displayName || card.accountNameFallback || DEFAULT_ACCOUNT_NAME_FALLBACK,
    hasData,
    homeUrl: card.homeUrl,
    compactMetrics: buildCompactMetrics(card, platformData),
    sections
  };
}

export function createSingleSyncCardModel(platform, platformData) {
  return createCardModel(platform, platformData);
}

export function createSplitSyncCardModel(platform, platformData) {
  return createCardModel(platform, platformData);
}
