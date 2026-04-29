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
const DASHBOARD_DEFAULT_BACKGROUND_OPACITY_STORAGE_KEY = 'allfans.dashboardDefaultBackgroundOpacity';
const DASHBOARD_MODULES_STORAGE_KEY = 'allfans.dashboardModules';
const DASHBOARD_THEME_COLOR_STORAGE_KEY = 'allfans.dashboardThemeColor';
const DASHBOARD_BACKGROUND_IMAGE_STORAGE_KEY = 'allfans.dashboardBackgroundImage';
const DASHBOARD_BACKGROUND_OPACITY_STORAGE_KEY = 'allfans.dashboardBackgroundOpacity';
const DASHBOARD_ACCOUNT_NAME_STORAGE_KEY = 'allfans.dashboardAccountName';
const DASHBOARD_AVATAR_IMAGE_STORAGE_KEY = 'allfans.dashboardAvatarImage';
const MAX_SOURCE_IMAGE_BYTES = 24 * 1024 * 1024;
const MAX_BACKGROUND_IMAGE_DATA_URL_BYTES = 1.2 * 1024 * 1024;
const MAX_AVATAR_IMAGE_DATA_URL_BYTES = 360 * 1024;
const PRESET_HINTS = {
  landscape: '适合横向汇报页、投屏页和网页头图',
  fhd: '适合 1080p 屏幕、视频封面和高清汇报',
  qhd: '适合 2K 大屏、高清投屏和演示素材',
  uhd: '适合 4K 大屏、展厅展示和高分辨率归档',
  square: '适合社媒封面、朋友圈和文档插图',
  'square-1080': '适合 1080 × 1080 社媒方图',
  'square-2k': '适合 2K 方图和高清社媒素材',
  'square-4k': '适合 4K 方图和高分辨率归档',
  story: '适合竖屏长图、海报和移动端分享',
  'story-2k': '适合 2K 竖屏海报和高清移动端长图',
  'story-4k': '适合 4K 竖屏海报和高清移动端长图'
};
const BACKGROUND_RATIO_HINTS = {
  landscape: '建议 16:9 背景图，已自动铺满并居中裁切',
  fhd: '建议 16:9 背景图，已自动铺满并居中裁切',
  qhd: '建议 16:9 背景图，已自动铺满并居中裁切',
  uhd: '建议 16:9 背景图，已自动铺满并居中裁切',
  square: '建议 1:1 背景图，已自动铺满并居中裁切',
  'square-1080': '建议 1:1 背景图，已自动铺满并居中裁切',
  'square-2k': '建议 1:1 背景图，已自动铺满并居中裁切',
  'square-4k': '建议 1:1 背景图，已自动铺满并居中裁切',
  story: '建议 9:16 背景图，已自动铺满并居中裁切',
  'story-2k': '建议 9:16 背景图，已自动铺满并居中裁切',
  'story-4k': '建议 9:16 背景图，已自动铺满并居中裁切'
};
const DASHBOARD_PRESET_MATRIX = {
  landscape: {
    standard: 'landscape',
    fhd: 'fhd',
    qhd: 'qhd',
    uhd: 'uhd'
  },
  square: {
    standard: 'square',
    fhd: 'square-1080',
    qhd: 'square-2k',
    uhd: 'square-4k'
  },
  story: {
    standard: 'story',
    fhd: 'story',
    qhd: 'story-2k',
    uhd: 'story-4k'
  }
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
let currentRatioId = 'square';
let currentSizeId = 'standard';

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

  document.getElementById('dashboardAccountNameInput')?.addEventListener('input', event => {
    persistDashboardAccountName(event.target.value);
    rerenderPreview();
  });

  document.getElementById('dashboardDefaultBackgroundOpacityInput')?.addEventListener('input', event => {
    persistDashboardDefaultBackgroundOpacity(Number(event.target.value) / 100);
    updateDashboardDefaultBackgroundOpacityLabel();
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
    importCompressedDashboardBackgroundImage(event.target.files?.[0]);
    event.target.value = '';
  });

  document.getElementById('dashboardAvatarImageInput')?.addEventListener('change', event => {
    importCompressedDashboardAvatarImage(event.target.files?.[0]);
    event.target.value = '';
  });

  document.getElementById('clearDashboardBackgroundBtn')?.addEventListener('click', () => {
    localStorage.removeItem(DASHBOARD_BACKGROUND_IMAGE_STORAGE_KEY);
    rerenderPreview();
  });

  document.getElementById('clearDashboardAvatarBtn')?.addEventListener('click', () => {
    localStorage.removeItem(DASHBOARD_AVATAR_IMAGE_STORAGE_KEY);
    rerenderPreview();
  });

  document.getElementById('dashboardRatioSelect')?.addEventListener('change', event => {
    currentRatioId = event.target.value || 'square';
    rerenderPreview();
  });

  document.getElementById('dashboardSizeSelect')?.addEventListener('change', event => {
    currentSizeId = event.target.value || 'standard';
    rerenderPreview();
  });

  document.querySelectorAll('[data-export-format]').forEach(button => {
    button.addEventListener('click', () => {
      const selectedFormat = document.getElementById('dashboardExportFormatSelect')?.value;
      exportDashboard(button.dataset.exportFormat || selectedFormat || 'png');
    });
  });
}

function hydrateDashboardControls() {
  const titleInput = document.getElementById('dashboardTitleInput');
  if (titleInput) {
    titleInput.value = readDashboardTitleOverride();
  }

  const accountNameInput = document.getElementById('dashboardAccountNameInput');
  if (accountNameInput) {
    accountNameInput.value = readDashboardAccountName();
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

  const defaultBackgroundOpacityInput = document.getElementById('dashboardDefaultBackgroundOpacityInput');
  if (defaultBackgroundOpacityInput) {
    defaultBackgroundOpacityInput.value = String(Math.round(readDashboardDefaultBackgroundOpacity() * 100));
    updateDashboardDefaultBackgroundOpacityLabel();
  }
}

function readDashboardTitle() {
  return readDashboardTitleOverride() || DEFAULT_DASHBOARD_TITLE;
}

function readDashboardTitleOverride() {
  const storedTitle = localStorage.getItem(DASHBOARD_TITLE_STORAGE_KEY) || '';
  return storedTitle.trim();
}

function persistDashboardTitle(title) {
  const normalized = String(title || '').trim();

  if (!normalized || normalized === DEFAULT_DASHBOARD_TITLE) {
    localStorage.removeItem(DASHBOARD_TITLE_STORAGE_KEY);
    return;
  }

  localStorage.setItem(DASHBOARD_TITLE_STORAGE_KEY, normalized);
}

function readDashboardAccountName() {
  return (localStorage.getItem(DASHBOARD_ACCOUNT_NAME_STORAGE_KEY) || '').trim();
}

function persistDashboardAccountName(name) {
  const normalized = String(name || '').trim();

  if (!normalized) {
    localStorage.removeItem(DASHBOARD_ACCOUNT_NAME_STORAGE_KEY);
    return;
  }

  localStorage.setItem(DASHBOARD_ACCOUNT_NAME_STORAGE_KEY, normalized);
}

function readBackgroundMode() {
  return localStorage.getItem(DASHBOARD_BG_STORAGE_KEY) === 'translucent'
    ? 'translucent'
    : 'solid';
}

function readDashboardDefaultBackgroundOpacity() {
  const storedValue = localStorage.getItem(DASHBOARD_DEFAULT_BACKGROUND_OPACITY_STORAGE_KEY);
  const storedOpacity = storedValue === null ? Number.NaN : Number(storedValue);

  if (!Number.isFinite(storedOpacity)) {
    return readBackgroundMode() === 'translucent' ? 0.72 : 1;
  }

  return Math.max(0, Math.min(1, storedOpacity));
}

function persistDashboardDefaultBackgroundOpacity(opacity) {
  const normalizedOpacity = Math.max(0, Math.min(1, Number(opacity)));

  if (!Number.isFinite(normalizedOpacity)) {
    return;
  }

  localStorage.removeItem(DASHBOARD_BG_STORAGE_KEY);

  if (normalizedOpacity === 1) {
    localStorage.removeItem(DASHBOARD_DEFAULT_BACKGROUND_OPACITY_STORAGE_KEY);
    return;
  }

  localStorage.setItem(DASHBOARD_DEFAULT_BACKGROUND_OPACITY_STORAGE_KEY, String(normalizedOpacity));
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

function readDashboardAvatarImage() {
  const avatarImage = localStorage.getItem(DASHBOARD_AVATAR_IMAGE_STORAGE_KEY) || '';
  return avatarImage.startsWith('data:image/') ? avatarImage : '';
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

function updateDashboardDefaultBackgroundOpacityLabel() {
  const label = document.getElementById('dashboardDefaultBackgroundOpacityValue');
  if (label) {
    label.textContent = `${Math.round(readDashboardDefaultBackgroundOpacity() * 100)}%`;
  }
}

function isImageTooLarge(file) {
  return Number(file?.size || 0) > MAX_SOURCE_IMAGE_BYTES;
}

function persistStoredImage(storageKey, dataUrl, errorMessage) {
  try {
    localStorage.setItem(storageKey, dataUrl);
    return true;
  } catch (error) {
    console.warn('AllFans: failed to store dashboard image', error);
    feedback.show(errorMessage, 'error');
    return false;
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

  if (isImageTooLarge(file)) {
    feedback.show('Image is too large. Please compress it below 3.5MB and try again.', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const result = String(reader.result || '');
    if (!result.startsWith('data:image/')) {
      feedback.show('背景图片读取失败，请换一张图片重试。', 'error');
      return;
    }

    if (!persistStoredImage(
      DASHBOARD_BACKGROUND_IMAGE_STORAGE_KEY,
      result,
      'Failed to save the background image. Please compress it and try again.'
    )) {
      return;
    }
    rerenderPreview();
    feedback.show('背景图片已应用到预览和图片导出。', 'success');
  };
  reader.onerror = () => {
    feedback.show('背景图片读取失败，请换一张图片重试。', 'error');
  };
  reader.readAsDataURL(file);
}

function importDashboardAvatarImage(file) {
  if (!file) {
    return;
  }

  if (isImageTooLarge(file)) {
    feedback.show('Image is too large. Please compress it below 3.5MB and try again.', 'error');
    return;
  }

  if (!file.type.startsWith('image/')) {
    feedback.show('请选择图片文件作为账号头像。', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const result = String(reader.result || '');
    if (!result.startsWith('data:image/')) {
      feedback.show('账号头像读取失败，请换一张图片重试。', 'error');
      return;
    }

    if (!persistStoredImage(
      DASHBOARD_AVATAR_IMAGE_STORAGE_KEY,
      result,
      'Failed to save the avatar image. Please compress it and try again.'
    )) {
      return;
    }
    rerenderPreview();
    feedback.show('账号头像已应用到看板预览。', 'success');
  };
  reader.onerror = () => {
    feedback.show('账号头像读取失败，请换一张图片重试。', 'error');
  };
  reader.readAsDataURL(file);
}

async function importCompressedDashboardBackgroundImage(file) {
  if (!file) {
    return;
  }

  if (!file.type.startsWith('image/')) {
    feedback.show('Please choose an image file for the background.', 'error');
    return;
  }

  if (isImageTooLarge(file)) {
    feedback.show('Image is too large. Please choose an image below 24MB.', 'error');
    return;
  }

  try {
    const result = await prepareStoredImageDataUrl(file, {
      maxDataUrlBytes: MAX_BACKGROUND_IMAGE_DATA_URL_BYTES,
      maxDimension: 2200,
      quality: 0.84
    });

    if (!result.startsWith('data:image/')) {
      feedback.show('Failed to read the background image. Please try another image.', 'error');
      return;
    }

    if (!persistStoredImage(
      DASHBOARD_BACKGROUND_IMAGE_STORAGE_KEY,
      result,
      'Failed to save the background image. Please try a smaller image.'
    )) {
      return;
    }

    rerenderPreview();
    feedback.show('Background image applied to preview and export.', 'success');
  } catch (error) {
    console.warn('AllFans: failed to import dashboard background image', error);
    feedback.show('Failed to prepare the background image. Please try another image.', 'error');
  }
}

async function importCompressedDashboardAvatarImage(file) {
  if (!file) {
    return;
  }

  if (!file.type.startsWith('image/')) {
    feedback.show('Please choose an image file for the account avatar.', 'error');
    return;
  }

  if (isImageTooLarge(file)) {
    feedback.show('Image is too large. Please choose an image below 24MB.', 'error');
    return;
  }

  try {
    const result = await prepareStoredImageDataUrl(file, {
      maxDataUrlBytes: MAX_AVATAR_IMAGE_DATA_URL_BYTES,
      maxDimension: 512,
      quality: 0.88
    });

    if (!result.startsWith('data:image/')) {
      feedback.show('Failed to read the account avatar. Please try another image.', 'error');
      return;
    }

    if (!persistStoredImage(
      DASHBOARD_AVATAR_IMAGE_STORAGE_KEY,
      result,
      'Failed to save the avatar image. Please try a smaller image.'
    )) {
      return;
    }

    rerenderPreview();
    feedback.show('Account avatar applied to preview.', 'success');
  } catch (error) {
    console.warn('AllFans: failed to import dashboard avatar image', error);
    feedback.show('Failed to prepare the avatar image. Please try another image.', 'error');
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

async function prepareStoredImageDataUrl(file, options) {
  const originalDataUrl = await readFileAsDataUrl(file);
  if (!originalDataUrl.startsWith('data:image/')) {
    return originalDataUrl;
  }

  if (estimateByteLength(originalDataUrl) <= options.maxDataUrlBytes) {
    return originalDataUrl;
  }

  if (file.type === 'image/svg+xml') {
    throw new Error('SVG image is too large to store.');
  }

  return compressImageDataUrl(originalDataUrl, options);
}

function estimateByteLength(value) {
  return new Blob([String(value || '')]).size;
}

function compressImageDataUrl(dataUrl, { maxDataUrlBytes, maxDimension, quality }) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const sourceWidth = image.naturalWidth || image.width || 1;
      const sourceHeight = image.naturalHeight || image.height || 1;
      const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));

      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Canvas is not supported in this browser.'));
        return;
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let compressed = canvas.toDataURL('image/jpeg', quality);

      if (estimateByteLength(compressed) > maxDataUrlBytes) {
        compressed = canvas.toDataURL('image/jpeg', 0.72);
      }

      if (estimateByteLength(compressed) > maxDataUrlBytes) {
        reject(new Error('Compressed image is still too large.'));
        return;
      }

      resolve(compressed);
    };
    image.onerror = () => reject(new Error('Failed to decode image file.'));
    image.src = dataUrl;
  });
}

function rerenderPreview() {
  if (latestData) {
    renderDashboardPreview(latestData);
  }
}

function getCurrentDashboardPresetId() {
  return DASHBOARD_PRESET_MATRIX[currentRatioId]?.[currentSizeId] || DASHBOARD_PRESET_MATRIX.square.standard;
}

function getPresetSelection(presetId) {
  for (const [ratioId, sizeMap] of Object.entries(DASHBOARD_PRESET_MATRIX)) {
    for (const [sizeId, mappedPresetId] of Object.entries(sizeMap)) {
      if (mappedPresetId === presetId) {
        return { ratioId, sizeId };
      }
    }
  }

  return { ratioId: 'square', sizeId: 'standard' };
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
  const presetId = getCurrentDashboardPresetId();
  const preset = getDashboardPresetById(presetId);
  const preview = document.getElementById('dashboardPreview');
  preview.innerHTML = createDashboardSvg(snapshot, {
    presetId,
    backgroundMode: readBackgroundMode(),
    defaultBackgroundOpacity: readDashboardDefaultBackgroundOpacity(),
    moduleIds: readDashboardModules(),
    themeColor: readDashboardThemeColor(),
    backgroundImage: readDashboardBackgroundImage(),
    backgroundImageOpacity: readDashboardBackgroundOpacity(),
    accountName: readDashboardAccountName(),
    avatarImage: readDashboardAvatarImage()
  });

  const selectedPreset = getPresetSelection(preset.id);
  const ratioSelect = document.getElementById('dashboardRatioSelect');
  if (ratioSelect) {
    ratioSelect.value = selectedPreset.ratioId;
  }
  const sizeSelect = document.getElementById('dashboardSizeSelect');
  if (sizeSelect) {
    sizeSelect.value = selectedPreset.sizeId;
  }
  document.getElementById('dashboardPresetSize').textContent = `${preset.width} × ${preset.height}`;
  document.getElementById('dashboardPresetHint').textContent = PRESET_HINTS[preset.id] || PRESET_HINTS.landscape;
  const backgroundRatioTip = document.querySelector('.info-tip');
  if (backgroundRatioTip) {
    backgroundRatioTip.setAttribute('aria-label', BACKGROUND_RATIO_HINTS[preset.id] || BACKGROUND_RATIO_HINTS.landscape);
  }
  preview.style.removeProperty('aspect-ratio');
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
    const presetId = getCurrentDashboardPresetId();
    const preset = getDashboardPresetById(presetId);
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
        presetId,
        backgroundMode,
        defaultBackgroundOpacity: readDashboardDefaultBackgroundOpacity(),
        moduleIds: readDashboardModules(),
        themeColor: readDashboardThemeColor(),
        backgroundImage: readDashboardBackgroundImage(),
        backgroundImageOpacity: readDashboardBackgroundOpacity(),
        accountName: readDashboardAccountName(),
        avatarImage: readDashboardAvatarImage()
      });
      const filename = `allfans-dashboard-${preset.id}-${timestamp}.${format === 'jpg' ? 'jpg' : format}`;

      if (format === 'svg') {
        downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), filename);
      } else {
        const rasterBlob = await renderRasterBlob(svg, preset, {
          mimeType: format === 'png' ? 'image/png' : 'image/jpeg',
          defaultBackgroundOpacity: readDashboardDefaultBackgroundOpacity()
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

async function renderRasterBlob(svg, preset, { mimeType, defaultBackgroundOpacity }) {
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

    if (mimeType === 'image/jpeg' || defaultBackgroundOpacity >= 1) {
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
