import { formatNumber } from '../popup/formatters.js';
import { platformRegistry } from '../runtime/platform-registry.js';

export const DEFAULT_DASHBOARD_TITLE = '全平台经营总览';
export const DEFAULT_DASHBOARD_MODULE_IDS = [
  'hero',
  'summary',
  'fanShare',
  'topPlays',
  'interactionMix'
];
export const DEFAULT_DASHBOARD_THEME_COLOR = '#FFBE82';

const DASHBOARD_PRESETS = [
  { id: 'landscape', label: '横版 16:9', width: 1600, height: 900 },
  { id: 'square', label: '方版 1:1', width: 1200, height: 1200 },
  { id: 'story', label: '竖版 9:16', width: 1080, height: 1920 }
];

const PALETTE = ['#FFBE82', '#F28D5C', '#FFDDA8', '#D66C47', '#8A583B', '#E8B68A'];
const DETAIL_METRIC_DEFS = [
  { key: 'totalCommentCount', label: '总评论', stateKey: 'commentCount' },
  { key: 'totalShareCount', label: '总转发', stateKey: 'shareCount' },
  { key: 'totalFavoriteCount', label: '总收藏', stateKey: 'favoriteCount' },
  { key: 'totalDanmakuCount', label: '总弹幕', stateKey: 'danmakuCount' },
  { key: 'totalCoinCount', label: '总投币', stateKey: 'coinCount' }
];

function normalizeNumber(value) {
  return Number(value || 0);
}

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function normalizeHexColor(value, fallback = DEFAULT_DASHBOARD_THEME_COLOR) {
  const color = String(value || '').trim();

  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    return color.toUpperCase();
  }

  return fallback;
}

function hexToRgb(hexColor) {
  const color = normalizeHexColor(hexColor).slice(1);
  return {
    r: Number.parseInt(color.slice(0, 2), 16),
    g: Number.parseInt(color.slice(2, 4), 16),
    b: Number.parseInt(color.slice(4, 6), 16)
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b]
    .map(channel => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase();
}

function mixHexColor(left, right, weight = 0.5) {
  const leftRgb = hexToRgb(left);
  const rightRgb = hexToRgb(right);
  return rgbToHex({
    r: leftRgb.r * (1 - weight) + rightRgb.r * weight,
    g: leftRgb.g * (1 - weight) + rightRgb.g * weight,
    b: leftRgb.b * (1 - weight) + rightRgb.b * weight
  });
}

function createThemePalette(themeColor) {
  const primary = normalizeHexColor(themeColor);
  return [
    primary,
    mixHexColor(primary, '#F05D3F', 0.32),
    mixHexColor(primary, '#FFFFFF', 0.42),
    mixHexColor(primary, '#8C3F2F', 0.44),
    mixHexColor(primary, '#2A211B', 0.62),
    mixHexColor(primary, '#E8B68A', 0.24)
  ];
}

function withThemeColor(items, themePalette) {
  return items.map((item, index) => ({
    ...item,
    color: themePalette[index % themePalette.length]
  }));
}

function formatAbsoluteTime(isoString) {
  if (!isoString) {
    return '等待同步';
  }

  return new Date(isoString).toLocaleString('zh-CN', {
    hour12: false
  });
}

function getPlatformLastUpdate(platformData) {
  return [
    platformData?.lastUpdate,
    platformData?.accountStatsLastUpdate,
    platformData?.contentStatsLastUpdate
  ]
    .filter(Boolean)
    .sort()
    .at(-1) || null;
}

function getOrderedPlatforms(settings) {
  const enabledSet = new Set(settings?.enabledPlatformIds || []);
  const orderMap = new Map(
    (settings?.platformOrder || []).map((platformId, index) => [platformId, index])
  );

  return platformRegistry
    .filter(platform => enabledSet.has(platform.id))
    .sort((left, right) => {
      const leftOrder = orderMap.has(left.id) ? orderMap.get(left.id) : left.order;
      const rightOrder = orderMap.has(right.id) ? orderMap.get(right.id) : right.order;
      return leftOrder - rightOrder;
    });
}

function getIncludedPlatformIds(settings) {
  const summaryIds = Array.isArray(settings?.summaryIncludedPlatformIds)
    ? settings.summaryIncludedPlatformIds
    : [];

  if (summaryIds.length > 0) {
    return new Set(summaryIds);
  }

  return new Set(settings?.enabledPlatformIds || []);
}

function buildPlatformCard(platform, platformData, summaryTotals) {
  const contribution = platform.getSummaryContributions(platformData || {});
  const fans = normalizeNumber(contribution.totalFans);
  const plays = normalizeNumber(contribution.totalPlayCount);
  const likes = normalizeNumber(contribution.totalLikeCount);
  const totalFans = Math.max(normalizeNumber(summaryTotals.totalFans), 1);
  const share = Math.round((fans / totalFans) * 1000) / 10;

  return {
    id: platform.id,
    title: platform.title,
    displayName: platformData?.displayName || '待识别账号',
    metrics: {
      fans,
      playCount: plays,
      likeCount: likes,
      commentCount: normalizeNumber(platformData?.commentCount),
      shareCount: normalizeNumber(platformData?.shareCount),
      favoriteCount: normalizeNumber(platformData?.favoriteCount),
      danmakuCount: normalizeNumber(platformData?.danmakuCount),
      coinCount: normalizeNumber(platformData?.coinCount)
    },
    share,
    lastUpdate: getPlatformLastUpdate(platformData),
    lastUpdateLabel: formatAbsoluteTime(getPlatformLastUpdate(platformData))
  };
}

function buildHighlights(platformCards) {
  const fansChampion = [...platformCards].sort(
    (left, right) => right.metrics.fans - left.metrics.fans
  )[0] || null;
  const playChampion = [...platformCards].sort(
    (left, right) => right.metrics.playCount - left.metrics.playCount
  )[0] || null;
  const freshnessChampion = [...platformCards].sort((left, right) =>
    String(right.lastUpdate || '').localeCompare(String(left.lastUpdate || ''))
  )[0] || null;

  return {
    heroPlatform: fansChampion,
    highlights: [
      fansChampion
        ? {
            label: '粉丝最高平台',
            value: fansChampion.title,
            meta: `${formatNumber(fansChampion.metrics.fans)} 粉丝`
          }
        : null,
      playChampion
        ? {
            label: '播放最高平台',
            value: playChampion.title,
            meta: `${formatNumber(playChampion.metrics.playCount)} 播放`
          }
        : null,
      freshnessChampion
        ? {
            label: '最近更新平台',
            value: freshnessChampion.title,
            meta: freshnessChampion.lastUpdateLabel
          }
        : null
    ].filter(Boolean)
  };
}

function buildDetailTotals(data, orderedPlatforms, includedIds) {
  const totals = Object.fromEntries(DETAIL_METRIC_DEFS.map(def => [def.key, 0]));

  for (const platform of orderedPlatforms) {
    if (!includedIds.has(platform.id)) {
      continue;
    }

    const platformData = data.platforms?.[platform.id] || {};
    for (const metric of DETAIL_METRIC_DEFS) {
      totals[metric.key] += normalizeNumber(platformData?.[metric.stateKey]);
    }
  }

  return totals;
}

function mergeSmallFanSharePlatforms(platformCards, summary) {
  const major = platformCards.filter(card => card.metrics.fans > 0 && card.share >= 1).slice(0, 5);
  const minor = platformCards.filter(card => card.metrics.fans > 0 && card.share < 1);
  const result = major.map((card, index) => ({
    label: card.title,
    value: card.metrics.fans,
    percent: card.share,
    color: PALETTE[index % PALETTE.length]
  }));

  if (minor.length > 0) {
    const otherValue = minor.reduce((sum, card) => sum + card.metrics.fans, 0);
    result.push({
      label: '其他',
      value: otherValue,
      percent: Math.round((otherValue / Math.max(summary.totalFans, 1)) * 1000) / 10,
      color: PALETTE[result.length % PALETTE.length]
    });
  }

  return result;
}

function buildCharts(platformCards, summary) {
  const fanShare = mergeSmallFanSharePlatforms(platformCards, summary);
  const topPlays = [...platformCards]
    .sort((left, right) => right.metrics.playCount - left.metrics.playCount)
    .slice(0, 5)
    .map((card, index) => ({
      label: card.title,
      value: card.metrics.playCount,
      color: PALETTE[index % PALETTE.length]
    }));
  const interactionMix = [
    { label: '点赞', value: summary.totalLikeCount, color: PALETTE[0] },
    { label: '评论', value: summary.totalCommentCount, color: PALETTE[1] },
    { label: '转发', value: summary.totalShareCount, color: PALETTE[2] },
    { label: '收藏', value: summary.totalFavoriteCount, color: PALETTE[3] },
    { label: '弹幕', value: summary.totalDanmakuCount, color: PALETTE[4] },
    { label: '投币', value: summary.totalCoinCount, color: PALETTE[5] }
  ];

  return {
    fanShare,
    topPlays,
    interactionMix
  };
}

function getTitleFontSize(title, presetId) {
  const length = String(title || '').length;
  const base = presetId === 'story' ? 72 : presetId === 'square' ? 56 : 62;

  if (length <= 8) {
    return base;
  }

  if (length <= 12) {
    return base - 6;
  }

  return base - 12;
}

function renderMetricCard({
  x,
  y,
  width,
  height,
  label,
  value,
  accent,
  labelFontSize = 16,
  valueFontSize = 36
}) {
  return `
    <g transform="translate(${x} ${y})">
      <rect width="${width}" height="${height}" rx="18" fill="#FFFFFF" fill-opacity="0.065" stroke="${accent}" stroke-opacity="0.28"/>
      <text x="18" y="30" fill="#D8C6B0" font-size="${labelFontSize}">${escapeXml(label)}</text>
      <text x="18" y="${height - 18}" fill="#FFF7EC" font-size="${valueFontSize}" font-weight="700">${escapeXml(value)}</text>
    </g>
  `;
}

function renderPanelShell({ x, y, width, height, title, subtitle = '', titleFontSize = 22 }) {
  const subtitleMarkup = subtitle
    ? `<text x="24" y="56" fill="#A99784" font-size="16">${escapeXml(subtitle)}</text>`
    : '';

  return `
    <g transform="translate(${x} ${y})">
      <rect width="${width}" height="${height}" rx="22" fill="#FFFFFF" fill-opacity="0.06" stroke="#FFFFFF" stroke-opacity="0.14"/>
      <text x="24" y="34" fill="#F5E6D3" font-size="${titleFontSize}" font-weight="700">${escapeXml(title)}</text>
      ${subtitleMarkup}
    </g>
  `;
}

function renderDonutPanel(chart, x, y, width, height, { large = false, themePalette = PALETTE } = {}) {
  const themedChart = withThemeColor(chart, themePalette);
  const centerX = x + (large ? 152 : 128);
  const centerY = y + height / 2 + (large ? 8 : 12);
  const radius = large ? 78 : 64;
  const strokeWidth = large ? 24 : 20;
  const circumference = 2 * Math.PI * radius;
  const total = Math.max(themedChart.reduce((sum, item) => sum + item.value, 0), 1);
  let offset = 0;

  const arcs = themedChart
    .map(item => {
      const length = (item.value / total) * circumference;
      const dasharray = `${length} ${circumference - length}`;
      const currentOffset = offset;
      offset -= length;

      return `
        <circle
          cx="${centerX}"
          cy="${centerY}"
          r="${radius}"
          fill="none"
          stroke="${item.color}"
          stroke-width="${strokeWidth}"
          stroke-linecap="round"
          stroke-dasharray="${dasharray}"
          stroke-dashoffset="${currentOffset}"
          transform="rotate(-90 ${centerX} ${centerY})"
        />
      `;
    })
    .join('');

  const legendStartX = x + (large ? 316 : 258);
  const legend = themedChart
    .map(
      (item, index) => `
        <rect x="${legendStartX}" y="${y + 78 + index * (large ? 38 : 34)}" width="12" height="12" rx="6" fill="${item.color}"/>
        <text x="${legendStartX + 20}" y="${y + 89 + index * (large ? 38 : 34)}" fill="#F7EADB" font-size="${large ? 19 : 17}" font-weight="600">${escapeXml(item.label)}</text>
        <text x="${x + width - 24}" y="${y + 89 + index * (large ? 38 : 34)}" fill="#E3C9AB" font-size="${large ? 19 : 17}" font-weight="700" text-anchor="end">${escapeXml(`${item.percent}%`)}</text>
      `
    )
    .join('');

  return `
    ${renderPanelShell({ x, y, width, height, title: '平台粉丝占比', subtitle: '小于 1% 的平台合并为其他', titleFontSize: large ? 24 : 22 })}
    <circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="none" stroke="#FFFFFF" stroke-opacity="0.08" stroke-width="${strokeWidth}"/>
    ${arcs}
    <text x="${centerX}" y="${centerY - 10}" fill="#CDB89F" font-size="${large ? 18 : 16}" text-anchor="middle">总粉丝</text>
    <text x="${centerX}" y="${centerY + 34}" fill="#FFF7EC" font-size="${large ? 40 : 34}" font-weight="700" text-anchor="middle">${escapeXml(formatNumber(total))}</text>
    ${legend}
  `;
}

function renderBarPanel(chart, x, y, width, height, title, subtitle, { large = false, themePalette = PALETTE } = {}) {
  const themedChart = withThemeColor(chart, themePalette);
  const maxValue = Math.max(...themedChart.map(item => item.value), 1);
  const rowHeight = Math.min(large ? 54 : 48, (height - 92) / Math.max(themedChart.length, 1));
  const labelX = x + 24;
  const barX = x + (large ? 150 : 128);
  const barWidth = width - (large ? 250 : 230);

  const bars = themedChart
    .map((item, index) => {
      const widthValue = (barWidth * item.value) / maxValue;
      const top = y + 76 + index * rowHeight;

      return `
        <text x="${labelX}" y="${top + 20}" fill="#F7EADB" font-size="${large ? 19 : 17}" font-weight="600">${escapeXml(item.label)}</text>
        <rect x="${barX}" y="${top + 3}" width="${barWidth}" height="${large ? 18 : 16}" rx="8" fill="#FFFFFF" fill-opacity="0.08"/>
        <rect x="${barX}" y="${top + 3}" width="${widthValue}" height="${large ? 18 : 16}" rx="8" fill="${item.color}"/>
        <text x="${x + width - 24}" y="${top + 20}" fill="#E3C9AB" font-size="${large ? 19 : 17}" font-weight="700" text-anchor="end">${escapeXml(formatNumber(item.value))}</text>
      `;
    })
    .join('');

  return `
    ${renderPanelShell({ x, y, width, height, title, subtitle, titleFontSize: large ? 24 : 22 })}
    ${bars}
  `;
}

function hasModule(moduleSet, moduleId) {
  return moduleSet.has(moduleId);
}

function normalizeDashboardModuleIds(moduleIds = DEFAULT_DASHBOARD_MODULE_IDS) {
  const allowedIds = new Set(DEFAULT_DASHBOARD_MODULE_IDS);
  const normalized = Array.isArray(moduleIds)
    ? moduleIds.filter(moduleId => allowedIds.has(moduleId))
    : DEFAULT_DASHBOARD_MODULE_IDS;

  return normalized.length > 0 ? normalized : DEFAULT_DASHBOARD_MODULE_IDS;
}

function normalizeOpacity(value, fallback = 0.58) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, numberValue));
}

function renderHeroCard(snapshot, x, y, width, height, { large = false } = {}) {
  const title = snapshot.heroPlatform?.title || '等待同步';
  const meta = snapshot.heroPlatform
    ? `${formatNumber(snapshot.heroPlatform.metrics.fans)} 粉丝 / ${formatNumber(snapshot.heroPlatform.metrics.playCount)} 播放`
    : '同步后自动识别';
  const recentMarkup = height >= 150
    ? `<text x="26" y="${height - 18}" fill="#A99784" font-size="15">最近汇总：${escapeXml(snapshot.summary.lastUpdateLabel)}</text>`
    : '';

  return `
    <g transform="translate(${x} ${y})">
      <rect width="${width}" height="${height}" rx="22" fill="#FFFFFF" fill-opacity="0.065" stroke="#FFFFFF" stroke-opacity="0.14"/>
      <text x="26" y="38" fill="#D6B692" font-size="${large ? 19 : 17}">当前领跑平台</text>
      <text x="26" y="${large ? 92 : 82}" fill="#FFF7EC" font-size="${large ? 44 : 36}" font-weight="700">${escapeXml(title)}</text>
      <text x="26" y="${large ? 128 : 116}" fill="#D4C2B1" font-size="${large ? 22 : 20}">${escapeXml(meta)}</text>
      ${recentMarkup}
    </g>
  `;
}

function renderChartModule(snapshot, moduleId, x, y, width, height, options = {}) {
  if (moduleId === 'fanShare') {
    return renderDonutPanel(snapshot.charts.fanShare, x, y, width, height, options);
  }

  if (moduleId === 'topPlays') {
    return renderBarPanel(snapshot.charts.topPlays, x, y, width, height, 'Top 平台播放', '播放量 Top 5 平台', options);
  }

  return renderBarPanel(snapshot.charts.interactionMix, x, y, width, height, '互动结构', '点赞 / 评论 / 转发 / 收藏 / 弹幕 / 投币', options);
}

function getEnabledChartModules(moduleSet) {
  return ['fanShare', 'topPlays', 'interactionMix'].filter(moduleId => hasModule(moduleSet, moduleId));
}

function renderLandscape(snapshot, preset, moduleSet, themePalette) {
  const metricWidth = 244;
  const metricHeight = 94;
  const metricGap = 16;
  const chartModules = getEnabledChartModules(moduleSet);
  const chartGap = 22;
  const chartWidth = chartModules.length > 0
    ? (preset.width - 64 * 2 - chartGap * (chartModules.length - 1)) / chartModules.length
    : 0;
  const summaryCards = [
    ['总粉丝', snapshot.summary.totalFans, themePalette[0]],
    ['总播放', snapshot.summary.totalPlayCount, themePalette[1]],
    ['总点赞', snapshot.summary.totalLikeCount, themePalette[2]],
    ['总评论', snapshot.summary.totalCommentCount, themePalette[3]],
    ['总转发', snapshot.summary.totalShareCount, themePalette[0]],
    ['总收藏', snapshot.summary.totalFavoriteCount, themePalette[1]],
    ['总弹幕', snapshot.summary.totalDanmakuCount, themePalette[2]],
    ['总投币', snapshot.summary.totalCoinCount, themePalette[3]]
  ];

  return `
    <text x="64" y="62" fill="#D4B795" font-size="20" letter-spacing="4">AllFans Data Board</text>
    <text x="64" y="134" fill="#FFF7EC" font-size="${getTitleFontSize(snapshot.title, preset.id)}" font-weight="700">${escapeXml(snapshot.title)}</text>
    <text x="64" y="176" fill="#BFA78D" font-size="18">最近汇总：${escapeXml(snapshot.summary.lastUpdateLabel)}</text>
    ${hasModule(moduleSet, 'hero') ? renderHeroCard(snapshot, 1128, 58, 408, 160) : ''}
    ${hasModule(moduleSet, 'summary') ? summaryCards
      .map(([label, value, accent], index) =>
        renderMetricCard({
          x: 64 + (index % 4) * (metricWidth + metricGap),
          y: 218 + Math.floor(index / 4) * (metricHeight + metricGap),
          width: metricWidth,
          height: metricHeight,
          label,
          value: formatNumber(value),
          accent
        })
      )
      .join('') : ''}
    ${chartModules
      .map((moduleId, index) =>
        renderChartModule(snapshot, moduleId, 64 + index * (chartWidth + chartGap), hasModule(moduleSet, 'summary') ? 444 : 226, chartWidth, hasModule(moduleSet, 'summary') ? 380 : 598, { themePalette })
      )
      .join('')}
  `;
}

function renderSquare(snapshot, preset, moduleSet, themePalette) {
  const metricWidth = (preset.width - 64 * 2 - 18 * 3) / 4;
  const metricHeight = 86;
  const chartModules = getEnabledChartModules(moduleSet);
  const chartWidth = (preset.width - 64 * 2 - 22) / 2;
  const hasSummary = hasModule(moduleSet, 'summary');
  const summaryCards = [
    ['总粉丝', snapshot.summary.totalFans, themePalette[0]],
    ['总播放', snapshot.summary.totalPlayCount, themePalette[1]],
    ['总点赞', snapshot.summary.totalLikeCount, themePalette[2]],
    ['总评论', snapshot.summary.totalCommentCount, themePalette[3]],
    ['总转发', snapshot.summary.totalShareCount, themePalette[0]],
    ['总收藏', snapshot.summary.totalFavoriteCount, themePalette[1]],
    ['总弹幕', snapshot.summary.totalDanmakuCount, themePalette[2]],
    ['总投币', snapshot.summary.totalCoinCount, themePalette[3]]
  ];

  return `
    <text x="64" y="58" fill="#D4B795" font-size="20" letter-spacing="4">AllFans Data Board</text>
    <text x="64" y="122" fill="#FFF7EC" font-size="${getTitleFontSize(snapshot.title, preset.id)}" font-weight="700">${escapeXml(snapshot.title)}</text>
    ${hasModule(moduleSet, 'hero') ? renderHeroCard(snapshot, 64, 152, preset.width - 128, 140) : ''}
    ${hasSummary ? summaryCards
      .map(([label, value, accent], index) =>
        renderMetricCard({
          x: 64 + (index % 4) * (metricWidth + 18),
          y: 318 + Math.floor(index / 4) * 98,
          width: metricWidth,
          height: metricHeight,
          label,
          value: formatNumber(value),
          accent
        })
      )
      .join('') : ''}
    ${chartModules
      .map((moduleId, index) => {
        if (chartModules.length === 1) {
          return renderChartModule(snapshot, moduleId, 64, hasSummary ? 528 : 318, preset.width - 128, hasSummary ? 584 : 794, { themePalette });
        }

        if (index < 2) {
          return renderChartModule(snapshot, moduleId, 64 + index * (chartWidth + 22), hasSummary ? 528 : 318, chartWidth, hasSummary ? 286 : 374, { themePalette });
        }

        return renderChartModule(snapshot, moduleId, 64, hasSummary ? 836 : 714, preset.width - 128, hasSummary ? 276 : 398, { themePalette });
      })
      .join('')}
  `;
}

function renderStory(snapshot, preset, moduleSet, themePalette) {
  const metricWidth = (preset.width - 64 * 2 - 18) / 2;
  const metricHeight = 88;
  const chartModules = getEnabledChartModules(moduleSet);
  const hasSummary = hasModule(moduleSet, 'summary');
  const summaryCards = [
    ['总粉丝', snapshot.summary.totalFans, themePalette[0]],
    ['总播放', snapshot.summary.totalPlayCount, themePalette[1]],
    ['总点赞', snapshot.summary.totalLikeCount, themePalette[2]],
    ['总评论', snapshot.summary.totalCommentCount, themePalette[3]],
    ['总转发', snapshot.summary.totalShareCount, themePalette[0]],
    ['总收藏', snapshot.summary.totalFavoriteCount, themePalette[1]],
    ['总弹幕', snapshot.summary.totalDanmakuCount, themePalette[2]],
    ['总投币', snapshot.summary.totalCoinCount, themePalette[3]]
  ];

  return `
    <text x="64" y="72" fill="#D4B795" font-size="22" letter-spacing="4">AllFans Data Board</text>
    <text x="64" y="152" fill="#FFF7EC" font-size="${getTitleFontSize(snapshot.title, preset.id)}" font-weight="700">${escapeXml(snapshot.title)}</text>
    ${hasModule(moduleSet, 'hero') ? renderHeroCard(snapshot, 64, 204, preset.width - 128, 164, { large: true }) : ''}
    ${hasSummary ? summaryCards
      .map(([label, value, accent], index) =>
        renderMetricCard({
          x: 64 + (index % 2) * (metricWidth + 18),
          y: 394 + Math.floor(index / 2) * 106,
          width: metricWidth,
          height: metricHeight,
          label,
          value: formatNumber(value),
          accent,
          labelFontSize: 17,
          valueFontSize: 40
        })
      )
      .join('') : ''}
    ${chartModules
      .map((moduleId, index) =>
        renderChartModule(snapshot, moduleId, 64, (hasSummary ? 844 : 394) + index * 326, preset.width - 128, 300, { large: true, themePalette })
      )
      .join('')}
  `;
}

export function getDashboardPresetById(presetId) {
  return DASHBOARD_PRESETS.find(preset => preset.id === presetId) || DASHBOARD_PRESETS[0];
}

export function buildDashboardSnapshot(data, { title = DEFAULT_DASHBOARD_TITLE } = {}) {
  const orderedPlatforms = getOrderedPlatforms(data.settings);
  const includedIds = getIncludedPlatformIds(data.settings);
  const detailTotals = buildDetailTotals(data, orderedPlatforms, includedIds);
  const summary = {
    totalFans: normalizeNumber(data.summary?.totalFans),
    totalPlayCount: normalizeNumber(data.summary?.totalPlayCount),
    totalLikeCount: normalizeNumber(data.summary?.totalLikeCount),
    ...detailTotals,
    lastUpdate: data.summary?.lastUpdate || null,
    lastUpdateLabel: formatAbsoluteTime(data.summary?.lastUpdate)
  };

  const platformCards = orderedPlatforms.map(platform =>
    buildPlatformCard(platform, data.platforms?.[platform.id], summary)
  );
  const { heroPlatform, highlights } = buildHighlights(platformCards);

  return {
    title: String(title || DEFAULT_DASHBOARD_TITLE).trim() || DEFAULT_DASHBOARD_TITLE,
    generatedAt: new Date().toISOString(),
    summary,
    platformCards,
    heroPlatform,
    highlights,
    charts: buildCharts(platformCards, summary)
  };
}

export function createDashboardExportPayload(snapshot) {
  return {
    title: snapshot.title,
    generatedAt: snapshot.generatedAt,
    summary: {
      totalFans: snapshot.summary.totalFans,
      totalPlayCount: snapshot.summary.totalPlayCount,
      totalLikeCount: snapshot.summary.totalLikeCount,
      totalCommentCount: snapshot.summary.totalCommentCount,
      totalShareCount: snapshot.summary.totalShareCount,
      totalFavoriteCount: snapshot.summary.totalFavoriteCount,
      totalDanmakuCount: snapshot.summary.totalDanmakuCount,
      totalCoinCount: snapshot.summary.totalCoinCount,
      lastUpdate: snapshot.summary.lastUpdate,
      lastUpdateLabel: snapshot.summary.lastUpdateLabel
    },
    platforms: snapshot.platformCards.map(card => ({
      platformId: card.id,
      platformName: card.title,
      accountName: card.displayName,
      fans: card.metrics.fans,
      playCount: card.metrics.playCount,
      likeCount: card.metrics.likeCount,
      commentCount: card.metrics.commentCount,
      shareCount: card.metrics.shareCount,
      favoriteCount: card.metrics.favoriteCount,
      danmakuCount: card.metrics.danmakuCount,
      coinCount: card.metrics.coinCount,
      fanSharePercent: card.share,
      lastUpdate: card.lastUpdate,
      lastUpdateLabel: card.lastUpdateLabel
    }))
  };
}

function createWorkbookCell(value, type = 'String') {
  return `<Cell><Data ss:Type="${type}">${escapeXml(value)}</Data></Cell>`;
}

function createWorkbookRow(cells) {
  return `<Row>${cells.join('')}</Row>`;
}

export function buildDashboardWorkbookXml(snapshot) {
  const payload = createDashboardExportPayload(snapshot);
  const summaryRows = [
    ['标题', payload.title],
    ['生成时间', payload.generatedAt],
    ['总粉丝', payload.summary.totalFans],
    ['总播放', payload.summary.totalPlayCount],
    ['总点赞', payload.summary.totalLikeCount],
    ['总评论', payload.summary.totalCommentCount],
    ['总转发', payload.summary.totalShareCount],
    ['总收藏', payload.summary.totalFavoriteCount],
    ['总弹幕', payload.summary.totalDanmakuCount],
    ['总投币', payload.summary.totalCoinCount],
    ['最近同步', payload.summary.lastUpdateLabel]
  ];

  const platformHeader = [
    '平台 ID',
    '平台名称',
    '账号名称',
    '粉丝',
    '播放',
    '点赞',
    '评论',
    '转发',
    '收藏',
    '弹幕',
    '投币',
    '粉丝占比(%)',
    '最近同步'
  ];

  const platformRows = payload.platforms.map(platform => [
    platform.platformId,
    platform.platformName,
    platform.accountName,
    platform.fans,
    platform.playCount,
    platform.likeCount,
    platform.commentCount,
    platform.shareCount,
    platform.favoriteCount,
    platform.danmakuCount,
    platform.coinCount,
    platform.fanSharePercent,
    platform.lastUpdateLabel
  ]);

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook
  xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40"
>
  <Worksheet ss:Name="Summary">
    <Table>
      ${summaryRows
        .map(([label, value]) =>
          createWorkbookRow([
            createWorkbookCell(label),
            createWorkbookCell(value, typeof value === 'number' ? 'Number' : 'String')
          ])
        )
        .join('')}
    </Table>
  </Worksheet>
  <Worksheet ss:Name="Platforms">
    <Table>
      ${createWorkbookRow(platformHeader.map(cell => createWorkbookCell(cell)))}
      ${platformRows
        .map(row =>
          createWorkbookRow(
            row.map(cell => createWorkbookCell(cell, typeof cell === 'number' ? 'Number' : 'String'))
          )
        )
        .join('')}
    </Table>
  </Worksheet>
</Workbook>`;
}

export function createDashboardSvg(
  snapshot,
  {
    presetId = 'landscape',
    backgroundMode = 'solid',
    moduleIds = DEFAULT_DASHBOARD_MODULE_IDS,
    themeColor = DEFAULT_DASHBOARD_THEME_COLOR,
    backgroundImage = '',
    backgroundImageOpacity = 0.58
  } = {}
) {
  const preset = getDashboardPresetById(presetId);
  const moduleSet = new Set(normalizeDashboardModuleIds(moduleIds));
  const normalizedThemeColor = normalizeHexColor(themeColor);
  const themePalette = createThemePalette(normalizedThemeColor);
  const backgroundOpacity = backgroundMode === 'translucent' ? '0.72' : '1';
  const glowOpacity = backgroundMode === 'translucent' ? '0.34' : '0.48';
  const circleOpacity = backgroundMode === 'translucent' ? '0.05' : '0.08';
  const circleOpacitySoft = backgroundMode === 'translucent' ? '0.04' : '0.05';
  const ribbonOpacity = backgroundMode === 'translucent' ? '0.02' : '0.03';
  const normalizedBackgroundImageOpacity = normalizeOpacity(backgroundImageOpacity).toFixed(2);
  const backgroundImageMarkup = String(backgroundImage || '').startsWith('data:image/')
    ? `
    <image href="${escapeXml(backgroundImage)}" x="0" y="0" width="${preset.width}" height="${preset.height}" preserveAspectRatio="xMidYMid slice" opacity="${normalizedBackgroundImageOpacity}"/>
    <rect width="${preset.width}" height="${preset.height}" fill="#090807" fill-opacity="${backgroundMode === 'translucent' ? '0.42' : '0.54'}"/>`
    : '';

  const body =
    preset.id === 'story'
      ? renderStory(snapshot, preset, moduleSet, themePalette)
      : preset.id === 'square'
        ? renderSquare(snapshot, preset, moduleSet, themePalette)
        : renderLandscape(snapshot, preset, moduleSet, themePalette);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${preset.width}" height="${preset.height}" viewBox="0 0 ${preset.width} ${preset.height}" fill="none">
    <defs>
      <linearGradient id="bgBlend" x1="0" y1="0" x2="${preset.width}" y2="${preset.height}" gradientUnits="userSpaceOnUse">
        <stop stop-color="#120F0C"/>
        <stop offset="0.55" stop-color="${mixHexColor(normalizedThemeColor, '#1D1712', 0.74)}"/>
        <stop offset="1" stop-color="#0D1014"/>
      </linearGradient>
      <radialGradient id="sunGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(${preset.width * 0.84} ${preset.height * 0.16}) rotate(120) scale(${preset.height * 0.42} ${preset.width * 0.24})">
        <stop stop-color="${normalizedThemeColor}" stop-opacity="${glowOpacity}"/>
        <stop offset="1" stop-color="${normalizedThemeColor}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${preset.width}" height="${preset.height}" fill="url(#bgBlend)" fill-opacity="${backgroundOpacity}"/>
    ${backgroundImageMarkup}
    <rect width="${preset.width}" height="${preset.height}" fill="url(#sunGlow)"/>
    <circle cx="${preset.width - 112}" cy="${preset.height - 132}" r="${preset.width * 0.08}" fill="${themePalette[1]}" fill-opacity="${circleOpacity}"/>
    <circle cx="118" cy="${preset.height - 120}" r="${preset.width * 0.06}" fill="${themePalette[2]}" fill-opacity="${circleOpacitySoft}"/>
    <path d="M0 ${preset.height - 148}C${preset.width * 0.28} ${preset.height - 260} ${preset.width * 0.66} ${preset.height - 24} ${preset.width} ${preset.height - 118}V${preset.height}H0Z" fill="#FFFFFF" fill-opacity="${ribbonOpacity}"/>
    ${body}
  </svg>`;
}
