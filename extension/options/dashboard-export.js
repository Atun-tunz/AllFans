import { formatNumber } from '../popup/formatters.js';
import { platformRegistry } from '../runtime/platform-registry.js';

export const DEFAULT_DASHBOARD_TITLE = '全平台经营总览';

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
  labelFontSize = 14,
  valueFontSize = 30
}) {
  return `
    <g transform="translate(${x} ${y})">
      <rect width="${width}" height="${height}" rx="22" fill="#FFFFFF" fill-opacity="0.06" stroke="${accent}" stroke-opacity="0.24"/>
      <text x="18" y="30" fill="#D8C6B0" font-size="${labelFontSize}" letter-spacing="1.2">${escapeXml(label)}</text>
      <text x="18" y="${height - 20}" fill="#FFF7EC" font-size="${valueFontSize}" font-weight="700">${escapeXml(value)}</text>
    </g>
  `;
}

function renderPanelShell({ x, y, width, height, title, subtitle = '', titleFontSize = 18 }) {
  const subtitleMarkup = subtitle
    ? `<text x="22" y="48" fill="#A99784" font-size="14">${escapeXml(subtitle)}</text>`
    : '';

  return `
    <g transform="translate(${x} ${y})">
      <rect width="${width}" height="${height}" rx="28" fill="#FFFFFF" fill-opacity="0.055" stroke="#FFFFFF" stroke-opacity="0.12"/>
      <text x="22" y="30" fill="#F5E6D3" font-size="${titleFontSize}" font-weight="700">${escapeXml(title)}</text>
      ${subtitleMarkup}
    </g>
  `;
}

function renderDonutPanel(chart, x, y, width, height, { large = false } = {}) {
  const centerX = x + (large ? 140 : 118);
  const centerY = y + height / 2 + 8;
  const radius = large ? 72 : 58;
  const strokeWidth = large ? 22 : 18;
  const circumference = 2 * Math.PI * radius;
  const total = Math.max(chart.reduce((sum, item) => sum + item.value, 0), 1);
  let offset = 0;

  const arcs = chart
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

  const legendStartX = x + (large ? 286 : 232);
  const legend = chart
    .map(
      (item, index) => `
        <rect x="${legendStartX}" y="${y + 64 + index * (large ? 32 : 28)}" width="10" height="10" rx="5" fill="${item.color}"/>
        <text x="${legendStartX + 16}" y="${y + 73 + index * (large ? 32 : 28)}" fill="#F7EADB" font-size="${large ? 17 : 15}">${escapeXml(item.label)}</text>
        <text x="${x + width - 20}" y="${y + 73 + index * (large ? 32 : 28)}" fill="#CDB8A0" font-size="${large ? 17 : 15}" text-anchor="end">${escapeXml(`${item.percent}%`)}</text>
      `
    )
    .join('');

  return `
    ${renderPanelShell({ x, y, width, height, title: '平台粉丝占比', subtitle: '小于 1% 的平台合并为其他', titleFontSize: large ? 20 : 18 })}
    <circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="none" stroke="#FFFFFF" stroke-opacity="0.08" stroke-width="${strokeWidth}"/>
    ${arcs}
    <text x="${centerX}" y="${centerY - 8}" fill="#CDB89F" font-size="${large ? 16 : 14}" text-anchor="middle">总粉丝</text>
    <text x="${centerX}" y="${centerY + 28}" fill="#FFF7EC" font-size="${large ? 34 : 28}" font-weight="700" text-anchor="middle">${escapeXml(formatNumber(total))}</text>
    ${legend}
  `;
}

function renderBarPanel(chart, x, y, width, height, title, subtitle, { large = false } = {}) {
  const maxValue = Math.max(...chart.map(item => item.value), 1);
  const rowHeight = Math.min(large ? 48 : 42, (height - 82) / Math.max(chart.length, 1));
  const labelX = x + 22;
  const barX = x + (large ? 136 : 110);
  const barWidth = width - (large ? 212 : 180);

  const bars = chart
    .map((item, index) => {
      const widthValue = (barWidth * item.value) / maxValue;
      const top = y + 62 + index * rowHeight;

      return `
        <text x="${labelX}" y="${top + 18}" fill="#F7EADB" font-size="${large ? 17 : 15}">${escapeXml(item.label)}</text>
        <rect x="${barX}" y="${top + 2}" width="${barWidth}" height="${large ? 16 : 14}" rx="8" fill="#FFFFFF" fill-opacity="0.07"/>
        <rect x="${barX}" y="${top + 2}" width="${widthValue}" height="${large ? 16 : 14}" rx="8" fill="${item.color}"/>
        <text x="${x + width - 20}" y="${top + 18}" fill="#CDB8A0" font-size="${large ? 17 : 15}" text-anchor="end">${escapeXml(formatNumber(item.value))}</text>
      `;
    })
    .join('');

  return `
    ${renderPanelShell({ x, y, width, height, title, subtitle, titleFontSize: large ? 20 : 18 })}
    ${bars}
  `;
}

function renderHeroCard(snapshot, x, y, width, height, { large = false } = {}) {
  const title = snapshot.heroPlatform?.title || '等待同步';
  const meta = snapshot.heroPlatform
    ? `${formatNumber(snapshot.heroPlatform.metrics.fans)} 粉丝 / ${formatNumber(snapshot.heroPlatform.metrics.playCount)} 播放`
    : '同步后自动识别';

  return `
    <g transform="translate(${x} ${y})">
      <rect width="${width}" height="${height}" rx="28" fill="#FFFFFF" fill-opacity="0.06" stroke="#FFFFFF" stroke-opacity="0.12"/>
      <text x="24" y="36" fill="#D6B692" font-size="${large ? 17 : 15}" letter-spacing="1.2">当前领跑平台</text>
      <text x="24" y="${large ? 88 : 78}" fill="#FFF7EC" font-size="${large ? 40 : 34}" font-weight="700">${escapeXml(title)}</text>
      <text x="24" y="${large ? 122 : 108}" fill="#D4C2B1" font-size="${large ? 20 : 18}">${escapeXml(meta)}</text>
      <text x="24" y="${height - 18}" fill="#A99784" font-size="14">最近汇总：${escapeXml(snapshot.summary.lastUpdateLabel)}</text>
    </g>
  `;
}

function renderLandscape(snapshot, preset) {
  const metricWidth = 244;
  const metricHeight = 92;
  const metricGap = 16;
  const chartWidth = (preset.width - 72 * 2 - 24 * 2) / 3;
  const summaryCards = [
    ['总粉丝', snapshot.summary.totalFans, '#FFBE82'],
    ['总播放', snapshot.summary.totalPlayCount, '#F28D5C'],
    ['总点赞', snapshot.summary.totalLikeCount, '#FFDDA8'],
    ['总评论', snapshot.summary.totalCommentCount, '#D66C47'],
    ['总转发', snapshot.summary.totalShareCount, '#FFBE82'],
    ['总收藏', snapshot.summary.totalFavoriteCount, '#F28D5C'],
    ['总弹幕', snapshot.summary.totalDanmakuCount, '#FFDDA8'],
    ['总投币', snapshot.summary.totalCoinCount, '#D66C47']
  ];

  return `
    <text x="72" y="66" fill="#D4B795" font-size="18" letter-spacing="4">AllFans Data Board</text>
    <text x="72" y="136" fill="#FFF7EC" font-size="${getTitleFontSize(snapshot.title, preset.id)}" font-weight="700">${escapeXml(snapshot.title)}</text>
    <text x="72" y="174" fill="#BFA78D" font-size="16">最近汇总：${escapeXml(snapshot.summary.lastUpdateLabel)}</text>
    ${renderHeroCard(snapshot, 1170, 62, 358, 154)}
    ${summaryCards
      .map(([label, value, accent], index) =>
        renderMetricCard({
          x: 72 + (index % 4) * (metricWidth + metricGap),
          y: 224 + Math.floor(index / 4) * (metricHeight + metricGap),
          width: metricWidth,
          height: metricHeight,
          label,
          value: formatNumber(value),
          accent
        })
      )
      .join('')}
    ${renderDonutPanel(snapshot.charts.fanShare, 72, 448, chartWidth, 360)}
    ${renderBarPanel(snapshot.charts.topPlays, 72 + chartWidth + 24, 448, chartWidth, 360, 'Top 平台播放', '播放量 Top 5 平台')}
    ${renderBarPanel(snapshot.charts.interactionMix, 72 + (chartWidth + 24) * 2, 448, chartWidth, 360, '互动结构', '点赞 / 评论 / 转发 / 收藏 / 弹幕 / 投币')}
  `;
}

function renderSquare(snapshot, preset) {
  const metricWidth = (preset.width - 72 * 2 - 18 * 3) / 4;
  const metricHeight = 88;
  const chartWidth = (preset.width - 72 * 2 - 24) / 2;
  const summaryCards = [
    ['总粉丝', snapshot.summary.totalFans, '#FFBE82'],
    ['总播放', snapshot.summary.totalPlayCount, '#F28D5C'],
    ['总点赞', snapshot.summary.totalLikeCount, '#FFDDA8'],
    ['总评论', snapshot.summary.totalCommentCount, '#D66C47'],
    ['总转发', snapshot.summary.totalShareCount, '#FFBE82'],
    ['总收藏', snapshot.summary.totalFavoriteCount, '#F28D5C'],
    ['总弹幕', snapshot.summary.totalDanmakuCount, '#FFDDA8'],
    ['总投币', snapshot.summary.totalCoinCount, '#D66C47']
  ];

  return `
    <text x="72" y="66" fill="#D4B795" font-size="18" letter-spacing="4">AllFans Data Board</text>
    <text x="72" y="132" fill="#FFF7EC" font-size="${getTitleFontSize(snapshot.title, preset.id)}" font-weight="700">${escapeXml(snapshot.title)}</text>
    <text x="${preset.width - 72}" y="132" fill="#D6B692" font-size="18" text-anchor="end">方版布局</text>
    ${renderHeroCard(snapshot, 72, 172, preset.width - 144, 140)}
    ${summaryCards
      .map(([label, value, accent], index) =>
        renderMetricCard({
          x: 72 + (index % 4) * (metricWidth + 18),
          y: 340 + Math.floor(index / 4) * 104,
          width: metricWidth,
          height: metricHeight,
          label,
          value: formatNumber(value),
          accent
        })
      )
      .join('')}
    ${renderDonutPanel(snapshot.charts.fanShare, 72, 568, chartWidth, 264)}
    ${renderBarPanel(snapshot.charts.topPlays, 72 + chartWidth + 24, 568, chartWidth, 264, 'Top 平台播放', '平台观察')}
    ${renderBarPanel(snapshot.charts.interactionMix, 72, 860, preset.width - 144, 268, '互动结构', '按总量展示评论、转发、收藏、弹幕、投币')}
  `;
}

function renderStory(snapshot, preset) {
  const metricWidth = (preset.width - 72 * 2 - 18) / 2;
  const metricHeight = 82;
  const summaryCards = [
    ['总粉丝', snapshot.summary.totalFans, '#FFBE82'],
    ['总播放', snapshot.summary.totalPlayCount, '#F28D5C'],
    ['总点赞', snapshot.summary.totalLikeCount, '#FFDDA8'],
    ['总评论', snapshot.summary.totalCommentCount, '#D66C47'],
    ['总转发', snapshot.summary.totalShareCount, '#FFBE82'],
    ['总收藏', snapshot.summary.totalFavoriteCount, '#F28D5C'],
    ['总弹幕', snapshot.summary.totalDanmakuCount, '#FFDDA8'],
    ['总投币', snapshot.summary.totalCoinCount, '#D66C47']
  ];

  return `
    <text x="72" y="76" fill="#D4B795" font-size="18" letter-spacing="4">AllFans Data Board</text>
    <text x="72" y="148" fill="#FFF7EC" font-size="${getTitleFontSize(snapshot.title, preset.id)}" font-weight="700">${escapeXml(snapshot.title)}</text>
    <text x="72" y="190" fill="#D6B692" font-size="22">竖版布局</text>
    ${renderHeroCard(snapshot, 72, 224, preset.width - 144, 150, { large: true })}
    ${summaryCards
      .map(([label, value, accent], index) =>
        renderMetricCard({
          x: 72 + (index % 2) * (metricWidth + 18),
          y: 404 + Math.floor(index / 2) * 98,
          width: metricWidth,
          height: metricHeight,
          label,
          value: formatNumber(value),
          accent,
          labelFontSize: 15,
          valueFontSize: 34
        })
      )
      .join('')}
    ${renderDonutPanel(snapshot.charts.fanShare, 72, 814, preset.width - 144, 320, { large: true })}
    ${renderBarPanel(snapshot.charts.topPlays, 72, 1162, preset.width - 144, 286, 'Top 平台播放', '按播放量排序', { large: true })}
    ${renderBarPanel(snapshot.charts.interactionMix, 72, 1474, preset.width - 144, 300, '互动结构', '点赞 / 评论 / 转发 / 收藏 / 弹幕 / 投币', { large: true })}
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
  { presetId = 'landscape', backgroundMode = 'solid' } = {}
) {
  const preset = getDashboardPresetById(presetId);
  const backgroundOpacity = backgroundMode === 'translucent' ? '0.72' : '1';
  const glowOpacity = backgroundMode === 'translucent' ? '0.34' : '0.48';
  const circleOpacity = backgroundMode === 'translucent' ? '0.05' : '0.08';
  const circleOpacitySoft = backgroundMode === 'translucent' ? '0.04' : '0.05';
  const ribbonOpacity = backgroundMode === 'translucent' ? '0.02' : '0.03';

  const body =
    preset.id === 'story'
      ? renderStory(snapshot, preset)
      : preset.id === 'square'
        ? renderSquare(snapshot, preset)
        : renderLandscape(snapshot, preset);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${preset.width}" height="${preset.height}" viewBox="0 0 ${preset.width} ${preset.height}" fill="none">
    <defs>
      <linearGradient id="bgBlend" x1="0" y1="0" x2="${preset.width}" y2="${preset.height}" gradientUnits="userSpaceOnUse">
        <stop stop-color="#120F0C"/>
        <stop offset="0.55" stop-color="#1D1712"/>
        <stop offset="1" stop-color="#0D1014"/>
      </linearGradient>
      <radialGradient id="sunGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(${preset.width * 0.84} ${preset.height * 0.16}) rotate(120) scale(${preset.height * 0.42} ${preset.width * 0.24})">
        <stop stop-color="#FFB96B" stop-opacity="${glowOpacity}"/>
        <stop offset="1" stop-color="#FFB96B" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${preset.width}" height="${preset.height}" fill="url(#bgBlend)" fill-opacity="${backgroundOpacity}"/>
    <rect width="${preset.width}" height="${preset.height}" fill="url(#sunGlow)"/>
    <circle cx="${preset.width - 112}" cy="${preset.height - 132}" r="${preset.width * 0.08}" fill="#F28D5C" fill-opacity="${circleOpacity}"/>
    <circle cx="118" cy="${preset.height - 120}" r="${preset.width * 0.06}" fill="#FFDDA8" fill-opacity="${circleOpacitySoft}"/>
    <path d="M0 ${preset.height - 148}C${preset.width * 0.28} ${preset.height - 260} ${preset.width * 0.66} ${preset.height - 24} ${preset.width} ${preset.height - 118}V${preset.height}H0Z" fill="#FFFFFF" fill-opacity="${ribbonOpacity}"/>
    ${body}
  </svg>`;
}
