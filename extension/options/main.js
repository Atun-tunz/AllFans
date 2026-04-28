import { BrowserApi } from '../runtime/browser-api.js';
import { MESSAGE_TYPES } from '../runtime/messages.js';
import { platformRegistry } from '../runtime/platform-registry.js';
import { createFeedbackController } from '../popup/feedback.js';
import { formatNumber, formatTime } from '../popup/formatters.js';
import {
  DEFAULT_DASHBOARD_TITLE,
  buildDashboardSnapshot,
  buildDashboardWorkbookXml,
  createDashboardExportPayload,
  createDashboardSvg,
  getDashboardPresetById
} from './dashboard-export.js';

const DASHBOARD_TITLE_STORAGE_KEY = 'allfans.dashboardTitle';
const DASHBOARD_BG_STORAGE_KEY = 'allfans.dashboardBackgroundMode';
const PRESET_HINTS = {
  landscape: '适合横向汇报页、投屏页和网页头图',
  square: '适合社媒封面、朋友圈和文档插图',
  story: '适合竖屏长图、海报和移动端分享'
};

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

function rerenderPreview() {
  if (latestData) {
    renderDashboardPreview(latestData);
  }
}

function createSnapshot(data) {
  return buildDashboardSnapshot(data, { title: readDashboardTitle() });
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
    empty.className = 'platform-insight-card';
    empty.innerHTML = `
      <h3>暂无平台数据</h3>
      <span class="insight-meta">先同步任意平台后，这里会展示平台亮点卡片。</span>
    `;
    container.appendChild(empty);
    return;
  }

  for (const card of snapshot.platformCards) {
    const element = document.createElement('article');
    element.className = 'platform-insight-card';
    element.innerHTML = `
      <h3>${card.title}</h3>
      <span class="insight-account">${card.displayName}</span>
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
    backgroundMode: readBackgroundMode()
  });

  document.getElementById('dashboardPresetLabel').textContent = preset.label;
  document.getElementById('dashboardPresetSize').textContent = `${preset.width} × ${preset.height}`;
  document.getElementById('dashboardPresetHint').textContent = PRESET_HINTS[preset.id];
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
        backgroundMode
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
