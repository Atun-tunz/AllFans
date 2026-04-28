import { BrowserApi } from '../runtime/browser-api.js';
import { MESSAGE_TYPES } from '../runtime/messages.js';
import { platformRegistry } from '../runtime/platform-registry.js';
import { createFeedbackController } from '../popup/feedback.js';
import { formatNumber, formatTime } from '../popup/formatters.js';
import {
  DEFAULT_DASHBOARD_TITLE,
  DEFAULT_DASHBOARD_MODULE_IDS,
  DEFAULT_DASHBOARD_THEME_COLOR,
  buildDashboardSnapshot,
  buildDashboardWorkbookXml,
  createDashboardExportPayload,
  createDashboardSvg,
  getDashboardPresetById
} from './dashboard-export.js';

const DASHBOARD_TITLE_STORAGE_KEY = 'allfans.dashboardTitle';
const DASHBOARD_BG_STORAGE_KEY = 'allfans.dashboardBackgroundMode';
const DASHBOARD_MODULES_STORAGE_KEY = 'allfans.dashboardModules';
const DASHBOARD_THEME_COLOR_STORAGE_KEY = 'allfans.dashboardThemeColor';
const DASHBOARD_BACKGROUND_IMAGE_STORAGE_KEY = 'allfans.dashboardBackgroundImage';
const DASHBOARD_BACKGROUND_OPACITY_STORAGE_KEY = 'allfans.dashboardBackgroundOpacity';
const PRESET_HINTS = {
  landscape: '适合横向汇报页、投屏页和网页头图',
  square: '适合社媒封面、朋友圈和文档插图',
  story: '适合竖屏长图、海报和移动端分享'
};
const BACKGROUND_RATIO_HINTS = {
  landscape: '建议 16:9 背景图，已自动铺满并居中裁切',
  square: '建议 1:1 背景图，已自动铺满并居中裁切',
  story: '建议 9:16 背景图，已自动铺满并居中裁切'
};

const INSIGHT_CHARTS = [
  {
    key: 'fanShare',
    title: '粉丝占比',
    subtitle: '平台规模分布',
    valueFormatter: item => `${item.percent}%`
  },
  {
    key: 'topPlays',
    title: '播放排行',
    subtitle: 'Top 5 平台表现',
    valueFormatter: item => formatNumber(item.value)
  },
  {
    key: 'interactionMix',
    title: '互动结构',
    subtitle: '点赞、评论、转发等总量',
    valueFormatter: item => formatNumber(item.value)
  }
];

let feedback;
let latestData = null;
let currentPresetId = 'landscape';

document.addEventListener('DOMContentLoaded', () => {
  feedback = createFeedbackController(document.getElementById('feedback'));
  hydrateDashboardControls();
  bindActions();
  loadData();
});

function bindActions() {
  document.getElementById('saveSettingsBtn')?.addEventListener('click', saveSettings);
  document.getElementById('refreshOptionsBtn')?.addEventListener('click', loadData);

  document.getElementById('dashboardTitleInput')?.addEventListener('input', event => {
    persistDashboardTitle(event.target.value);
    rerenderPreview();
  });

  document.getElementById('transparentBackgroundToggle')?.addEventListener('change', event => {
    persistBackgroundMode(event.target.checked ? 'translucent' : 'solid');
    rerenderPreview();
  });

  document.querySelectorAll('[data-dashboard-module]').forEach(input => {
    input.addEventListener('change', () => {
      persistDashboardModules(readDashboardModulesFromControls());
      rerenderPreview();
    });
  });

  document.getElementById('dashboardThemeColorInput')?.addEventListener('input', event => {
    persistDashboardThemeColor(event.target.value);
    rerenderPreview();
  });

  document.getElementById('dashboardBackgroundOpacityInput')?.addEventListener('input', event => {
    persistDashboardBackgroundOpacity(Number(event.target.value) / 100);
    updateDashboardBackgroundOpacityLabel();
    rerenderPreview();
  });

  document.getElementById('dashboardBackgroundImageInput')?.addEventListener('change', event => {
    importDashboardBackgroundImage(event.target.files?.[0]);
    event.target.value = '';
  });

  document.getElementById('clearDashboardBackgroundBtn')?.addEventListener('click', () => {
    localStorage.removeItem(DASHBOARD_BACKGROUND_IMAGE_STORAGE_KEY);
    rerenderPreview();
  });

  document.querySelectorAll('[data-preset]').forEach(button => {
    button.addEventListener('click', () => {
      currentPresetId = button.dataset.preset || 'landscape';
      updatePresetButtons();
      rerenderPreview();
    });
  });

  document.querySelectorAll('[data-export-format]').forEach(button => {
    button.addEventListener('click', () => {
      exportDashboard(button.dataset.exportFormat);
    });
  });
}

function hydrateDashboardControls() {
  const titleInput = document.getElementById('dashboardTitleInput');
  if (titleInput) {
    titleInput.value = readDashboardTitle();
  }

  const transparentToggle = document.getElementById('transparentBackgroundToggle');
  if (transparentToggle) {
    transparentToggle.checked = readBackgroundMode() === 'translucent';
  }

  hydrateDashboardModuleControls();

  const themeColorInput = document.getElementById('dashboardThemeColorInput');
  if (themeColorInput) {
    themeColorInput.value = readDashboardThemeColor();
  }

  const backgroundOpacityInput = document.getElementById('dashboardBackgroundOpacityInput');
  if (backgroundOpacityInput) {
    backgroundOpacityInput.value = String(Math.round(readDashboardBackgroundOpacity() * 100));
    updateDashboardBackgroundOpacityLabel();
  }
}

function readDashboardTitle() {
  const storedTitle = localStorage.getItem(DASHBOARD_TITLE_STORAGE_KEY) || '';
  return storedTitle.trim() || DEFAULT_DASHBOARD_TITLE;
}

function persistDashboardTitle(title) {
  const normalized = String(title || '').trim();

  if (!normalized || normalized === DEFAULT_DASHBOARD_TITLE) {
    localStorage.removeItem(DASHBOARD_TITLE_STORAGE_KEY);
    return;
  }

  localStorage.setItem(DASHBOARD_TITLE_STORAGE_KEY, normalized);
}

function readBackgroundMode() {
  return localStorage.getItem(DASHBOARD_BG_STORAGE_KEY) === 'translucent'
    ? 'translucent'
    : 'solid';
}

function persistBackgroundMode(mode) {
  if (mode === 'translucent') {
    localStorage.setItem(DASHBOARD_BG_STORAGE_KEY, mode);
    return;
  }

  localStorage.removeItem(DASHBOARD_BG_STORAGE_KEY);
}

function readDashboardModules() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DASHBOARD_MODULES_STORAGE_KEY) || '[]');
    const selected = Array.isArray(parsed)
      ? parsed.filter(moduleId => DEFAULT_DASHBOARD_MODULE_IDS.includes(moduleId))
      : [];

    return selected.length > 0 ? selected : DEFAULT_DASHBOARD_MODULE_IDS;
  } catch {
    return DEFAULT_DASHBOARD_MODULE_IDS;
  }
}

function readDashboardModulesFromControls() {
  const selected = Array.from(document.querySelectorAll('[data-dashboard-module]'))
    .filter(input => input.checked)
    .map(input => input.dataset.dashboardModule)
    .filter(moduleId => DEFAULT_DASHBOARD_MODULE_IDS.includes(moduleId));

  return selected.length > 0 ? selected : DEFAULT_DASHBOARD_MODULE_IDS;
}

function hydrateDashboardModuleControls() {
  const selected = new Set(readDashboardModules());
  document.querySelectorAll('[data-dashboard-module]').forEach(input => {
    input.checked = selected.has(input.dataset.dashboardModule);
  });
}

function persistDashboardModules(moduleIds) {
  const normalized = moduleIds.filter(moduleId => DEFAULT_DASHBOARD_MODULE_IDS.includes(moduleId));

  if (normalized.length === DEFAULT_DASHBOARD_MODULE_IDS.length) {
    localStorage.removeItem(DASHBOARD_MODULES_STORAGE_KEY);
    return;
  }

  localStorage.setItem(DASHBOARD_MODULES_STORAGE_KEY, JSON.stringify(normalized));
}

function readDashboardThemeColor() {
  const storedColor = localStorage.getItem(DASHBOARD_THEME_COLOR_STORAGE_KEY) || '';
  return /^#[0-9a-fA-F]{6}$/.test(storedColor) ? storedColor : DEFAULT_DASHBOARD_THEME_COLOR;
}

function persistDashboardThemeColor(color) {
  if (!/^#[0-9a-fA-F]{6}$/.test(String(color || ''))) {
    return;
  }

  if (color.toUpperCase() === DEFAULT_DASHBOARD_THEME_COLOR.toUpperCase()) {
    localStorage.removeItem(DASHBOARD_THEME_COLOR_STORAGE_KEY);
    return;
  }

  localStorage.setItem(DASHBOARD_THEME_COLOR_STORAGE_KEY, color);
}

function readDashboardBackgroundImage() {
  const backgroundImage = localStorage.getItem(DASHBOARD_BACKGROUND_IMAGE_STORAGE_KEY) || '';
  return backgroundImage.startsWith('data:image/') ? backgroundImage : '';
}

function readDashboardBackgroundOpacity() {
  const storedValue = localStorage.getItem(DASHBOARD_BACKGROUND_OPACITY_STORAGE_KEY);
  const storedOpacity = storedValue === null ? Number.NaN : Number(storedValue);

  if (!Number.isFinite(storedOpacity)) {
    return 0.58;
  }

  return Math.max(0, Math.min(1, storedOpacity));
}

function persistDashboardBackgroundOpacity(opacity) {
  const normalizedOpacity = Math.max(0, Math.min(1, Number(opacity)));

  if (!Number.isFinite(normalizedOpacity)) {
    return;
  }

  if (normalizedOpacity === 0.58) {
    localStorage.removeItem(DASHBOARD_BACKGROUND_OPACITY_STORAGE_KEY);
    return;
  }

  localStorage.setItem(DASHBOARD_BACKGROUND_OPACITY_STORAGE_KEY, String(normalizedOpacity));
}

function updateDashboardBackgroundOpacityLabel() {
  const label = document.getElementById('dashboardBackgroundOpacityValue');
  if (label) {
    label.textContent = `${Math.round(readDashboardBackgroundOpacity() * 100)}%`;
  }
}

function importDashboardBackgroundImage(file) {
  if (!file) {
    return;
  }

  if (!file.type.startsWith('image/')) {
    feedback.show('请选择图片文件作为背景。', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const result = String(reader.result || '');
    if (!result.startsWith('data:image/')) {
      feedback.show('背景图片读取失败，请换一张图片重试。', 'error');
      return;
    }

    localStorage.setItem(DASHBOARD_BACKGROUND_IMAGE_STORAGE_KEY, result);
    rerenderPreview();
    feedback.show('背景图片已应用到预览和图片导出。', 'success');
  };
  reader.onerror = () => {
    feedback.show('背景图片读取失败，请换一张图片重试。', 'error');
  };
  reader.readAsDataURL(file);
}

function rerenderPreview() {
  if (latestData) {
    renderDashboardPreview(latestData);
  }
}

function createSnapshot(data) {
  return buildDashboardSnapshot(data, { title: readDashboardTitle() });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function loadData() {
  try {
    const response = await BrowserApi.runtime.sendMessage({ type: MESSAGE_TYPES.GET_ALL_DATA });
    if (!response?.success) {
      throw new Error(response?.error || 'Failed to load extension settings');
    }

    latestData = response.data;
    renderData(response.data);
  } catch (error) {
    console.error('AllFans: failed to load options data', error);
    feedback.show(String(error?.message || '加载设置失败，请稍后重试。'), 'error');
  }
}

function renderData(data) {
  renderOverview(data);
  renderPlatformInsights(data);
  renderPlatformSettings(data);
  renderSystemSettings(data);
  renderBridgeStatus(data.integrations?.localBridge || {});
  renderDashboardPreview(data);
}

function renderOverview(data) {
  const snapshot = createSnapshot(data);

  document.getElementById('overviewTotalFans').textContent = formatNumber(snapshot.summary.totalFans);
  document.getElementById('overviewTotalPlayCount').textContent = formatNumber(snapshot.summary.totalPlayCount);
  document.getElementById('overviewTotalLikeCount').textContent = formatNumber(snapshot.summary.totalLikeCount);
  document.getElementById('enabledPlatformCount').textContent = String(data.settings.enabledPlatformIds.length);
  document.getElementById('summaryPlatformCount').textContent = String(data.settings.summaryIncludedPlatformIds.length);
  document.getElementById('overviewLastUpdate').textContent = snapshot.summary.lastUpdate
    ? formatTime(snapshot.summary.lastUpdate)
    : '等待同步';

  if (snapshot.heroPlatform) {
    document.getElementById('heroPlatformName').textContent = snapshot.heroPlatform.title;
    document.getElementById('heroPlatformMeta').textContent =
      `${formatNumber(snapshot.heroPlatform.metrics.fans)} 粉丝 · ${formatNumber(snapshot.heroPlatform.metrics.playCount)} 播放`;
  } else {
    document.getElementById('heroPlatformName').textContent = '等待同步';
    document.getElementById('heroPlatformMeta').textContent = '同步后自动识别';
  }
}

function renderPlatformInsights(data) {
  const container = document.getElementById('platformInsightList');
  const snapshot = createSnapshot(data);
  container.innerHTML = '';

  if (snapshot.platformCards.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'platform-insight-card is-empty';
    empty.innerHTML = `
      <h3>暂无平台数据</h3>
      <span class="insight-meta">先同步任意平台后，这里会展示平台亮点卡片。</span>
    `;
    container.appendChild(empty);
    return;
  }

  const chartPanel = document.createElement('div');
  chartPanel.className = 'platform-chart-grid';
  chartPanel.innerHTML = INSIGHT_CHARTS.map(chartConfig =>
    renderInsightChart(snapshot.charts[chartConfig.key], chartConfig)
  ).join('');
  container.appendChild(chartPanel);

  for (const card of snapshot.platformCards) {
    const element = document.createElement('article');
    element.className = 'platform-insight-card';
    element.innerHTML = `
      <div class="insight-card-head">
        <h3>${escapeHtml(card.title)}</h3>
        <span class="insight-share">${card.share}%</span>
      </div>
      <span class="insight-account">${escapeHtml(card.displayName)}</span>
      <div class="insight-metrics">
        <span><strong>粉丝</strong><strong>${formatNumber(card.metrics.fans)}</strong></span>
        <span><strong>播放</strong><strong>${formatNumber(card.metrics.playCount)}</strong></span>
        <span><strong>点赞</strong><strong>${formatNumber(card.metrics.likeCount)}</strong></span>
      </div>
      <span class="insight-meta">最近更新：${card.lastUpdate ? formatTime(card.lastUpdate) : '等待同步'}</span>
    `;
    container.appendChild(element);
  }
}

function renderInsightChart(items, { title, subtitle, valueFormatter }) {
  const chartItems = Array.isArray(items) ? items.filter(item => item.value > 0).slice(0, 5) : [];
  const maxValue = Math.max(...chartItems.map(item => item.value), 1);
  const rows = chartItems.length > 0
    ? chartItems
        .map(item => {
          const width = Math.max(4, Math.round((item.value / maxValue) * 100));

          return `
            <div class="platform-chart-row">
              <span class="chart-name">${escapeHtml(item.label)}</span>
              <span class="chart-track" aria-hidden="true">
                <span class="chart-fill" style="width: ${width}%; background: ${item.color};"></span>
              </span>
              <strong>${escapeHtml(valueFormatter(item))}</strong>
            </div>
          `;
        })
        .join('')
    : '<span class="insight-meta">暂无可展示的统计数据</span>';

  return `
    <article class="platform-chart-card">
      <div>
        <h3>${escapeHtml(title)}</h3>
        <span class="insight-meta">${escapeHtml(subtitle)}</span>
      </div>
      <div class="platform-chart-list">${rows}</div>
    </article>
  `;
}

function renderPlatformSettings(data) {
  const settingsList = document.getElementById('platformSettingsList');
  settingsList.innerHTML = '';

  for (const platform of platformRegistry) {
    const row = document.createElement('label');
    row.className = 'platform-setting-row';
    row.innerHTML = `
      <span class="platform-setting-name">
        <span class="platform-setting-title">${platform.title}</span>
        <span class="platform-setting-caption">${platform.id}</span>
      </span>
      <input type="checkbox" id="${platform.id}-enabled" ${data.settings.enabledPlatformIds.includes(platform.id) ? 'checked' : ''}>
      <input type="checkbox" id="${platform.id}-sync" ${data.settings.syncEnabledPlatformIds.includes(platform.id) ? 'checked' : ''}>
      <input type="checkbox" id="${platform.id}-summary" ${data.settings.summaryIncludedPlatformIds.includes(platform.id) ? 'checked' : ''}>
    `;
    settingsList.appendChild(row);
  }
}

function renderSystemSettings(data) {
  document.getElementById('autoUpdateSetting').checked = Boolean(data.settings.autoUpdate);
  document.getElementById('externalApiEnabledSetting').checked = Boolean(data.settings.externalApiEnabled);
  document.getElementById('localBridgeEnabledSetting').checked = Boolean(data.settings.localBridgeEnabled);
  document.getElementById('localBridgeEndpointSetting').value = data.settings.localBridgeEndpoint || '';
}

function renderBridgeStatus(bridge) {
  const status = [
    `状态：${bridge.lastStatus || 'idle'}`,
    bridge.lastSuccessAt ? `最近成功：${formatTime(bridge.lastSuccessAt)}` : '最近成功：暂无',
    bridge.lastError ? `最近错误：${bridge.lastError}` : null
  ]
    .filter(Boolean)
    .join(' | ');

  document.getElementById('localBridgeStatus').textContent = status;
}

function renderDashboardPreview(data) {
  const snapshot = createSnapshot(data);
  const preset = getDashboardPresetById(currentPresetId);
  const preview = document.getElementById('dashboardPreview');
  preview.innerHTML = createDashboardSvg(snapshot, {
    presetId: currentPresetId,
    backgroundMode: readBackgroundMode(),
    moduleIds: readDashboardModules(),
    themeColor: readDashboardThemeColor(),
    backgroundImage: readDashboardBackgroundImage(),
    backgroundImageOpacity: readDashboardBackgroundOpacity()
  });

  document.getElementById('dashboardPresetLabel').textContent = preset.label;
  document.getElementById('dashboardPresetSize').textContent = `${preset.width} × ${preset.height}`;
  document.getElementById('dashboardPresetHint').textContent = PRESET_HINTS[preset.id];
  const backgroundRatioHint = document.getElementById('dashboardBackgroundRatioHint');
  if (backgroundRatioHint) {
    backgroundRatioHint.textContent = BACKGROUND_RATIO_HINTS[preset.id];
  }
  preview.style.aspectRatio = `${preset.width} / ${preset.height}`;
  updatePresetButtons();
}

function updatePresetButtons() {
  document.querySelectorAll('[data-preset]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.preset === currentPresetId);
  });
}

async function exportDashboard(format) {
  if (!latestData) {
    feedback.show('当前没有可导出的数据，请先刷新或同步。', 'error');
    return;
  }

  const buttons = Array.from(document.querySelectorAll('[data-export-format]'));
  buttons.forEach(button => {
    button.disabled = true;
  });

  try {
    const snapshot = createSnapshot(latestData);
    const preset = getDashboardPresetById(currentPresetId);
    const timestamp = formatTimestamp(new Date());

    if (format === 'json') {
      downloadBlob(
        new Blob([JSON.stringify(createDashboardExportPayload(snapshot), null, 2)], {
          type: 'application/json;charset=utf-8'
        }),
        `allfans-dashboard-${timestamp}.json`
      );
    } else if (format === 'excel') {
      downloadBlob(
        new Blob([buildDashboardWorkbookXml(snapshot)], {
          type: 'application/vnd.ms-excel;charset=utf-8'
        }),
        `allfans-dashboard-${timestamp}.xls`
      );
    } else {
      const backgroundMode = readBackgroundMode();
      const svg = createDashboardSvg(snapshot, {
        presetId: currentPresetId,
        backgroundMode,
        moduleIds: readDashboardModules(),
        themeColor: readDashboardThemeColor(),
        backgroundImage: readDashboardBackgroundImage(),
        backgroundImageOpacity: readDashboardBackgroundOpacity()
      });
      const filename = `allfans-dashboard-${preset.id}-${timestamp}.${format === 'jpg' ? 'jpg' : format}`;

      if (format === 'svg') {
        downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), filename);
      } else {
        const rasterBlob = await renderRasterBlob(svg, preset, {
          mimeType: format === 'png' ? 'image/png' : 'image/jpeg',
          backgroundMode
        });
        downloadBlob(rasterBlob, filename);
      }
    }

    feedback.show(`已导出 ${format.toUpperCase()} 文件。`, 'success');
  } catch (error) {
    console.error('AllFans: failed to export dashboard', error);
    feedback.show(String(error?.message || '导出失败，请稍后重试。'), 'error');
  } finally {
    buttons.forEach(button => {
      button.disabled = false;
    });
  }
}

async function renderRasterBlob(svg, preset, { mimeType, backgroundMode }) {
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const image = await loadImage(svgUrl);
    const canvas = document.createElement('canvas');
    canvas.width = preset.width;
    canvas.height = preset.height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas is not supported in this browser.');
    }

    if (mimeType === 'image/jpeg' || backgroundMode !== 'translucent') {
      context.fillStyle = '#16120f';
      context.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      context.clearRect(0, 0, canvas.width, canvas.height);
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvasToBlob(canvas, mimeType, mimeType === 'image/jpeg' ? 0.94 : undefined);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to render dashboard image.'));
    image.src = url;
  });
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('Failed to encode exported image.'));
        return;
      }

      resolve(blob);
    }, mimeType, quality);
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatTimestamp(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}${month}${day}-${hours}${minutes}`;
}

async function saveSettings() {
  const button = document.getElementById('saveSettingsBtn');
  button.disabled = true;
  button.textContent = '保存中...';

  try {
    const enabledPlatformIds = [];
    const syncEnabledPlatformIds = [];
    const summaryIncludedPlatformIds = [];

    for (const platform of platformRegistry) {
      if (document.getElementById(`${platform.id}-enabled`).checked) {
        enabledPlatformIds.push(platform.id);
      }
      if (document.getElementById(`${platform.id}-sync`).checked) {
        syncEnabledPlatformIds.push(platform.id);
      }
      if (document.getElementById(`${platform.id}-summary`).checked) {
        summaryIncludedPlatformIds.push(platform.id);
      }
    }

    const response = await BrowserApi.runtime.sendMessage({
      type: MESSAGE_TYPES.UPDATE_SETTINGS,
      settings: {
        autoUpdate: document.getElementById('autoUpdateSetting').checked,
        externalApiEnabled: document.getElementById('externalApiEnabledSetting').checked,
        localBridgeEnabled: document.getElementById('localBridgeEnabledSetting').checked,
        localBridgeEndpoint: document.getElementById('localBridgeEndpointSetting').value.trim(),
        enabledPlatformIds,
        syncEnabledPlatformIds,
        summaryIncludedPlatformIds
      }
    });

    if (!response?.success) {
      throw new Error(response?.error || '保存失败');
    }

    latestData = response.data;
    renderData(response.data);
    feedback.show('设置已更新。', 'success');
  } catch (error) {
    console.error('AllFans: failed to save options settings', error);
    feedback.show(String(error?.message || '保存失败，请稍后重试。'), 'error');
  } finally {
    button.disabled = false;
    button.textContent = '保存设置';
  }
}
