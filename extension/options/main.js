import { BrowserApi } from '../runtime/browser-api.js';
import { MESSAGE_TYPES } from '../runtime/messages.js';
import { platformRegistry } from '../runtime/platform-registry.js';
import { createFeedbackController } from '../popup/feedback.js';
import { formatTime } from '../popup/formatters.js';

let feedback;

document.addEventListener('DOMContentLoaded', () => {
  feedback = createFeedbackController(document.getElementById('feedback'));
  bindActions();
  loadData();
});

function bindActions() {
  document.getElementById('saveSettingsBtn')?.addEventListener('click', saveSettings);
  document.getElementById('refreshOptionsBtn')?.addEventListener('click', loadData);
}

async function loadData() {
  try {
    const response = await BrowserApi.runtime.sendMessage({ type: MESSAGE_TYPES.GET_ALL_DATA });
    if (!response?.success) {
      throw new Error(response?.error || 'Failed to load extension settings');
    }

    renderData(response.data);
  } catch (error) {
    console.error('AllFans: failed to load options data', error);
    feedback.show(String(error?.message || '加载设置失败，请稍后重试。'), 'error');
  }
}

function renderData(data) {
  renderPlatformSettings(data);
  renderOverview(data);
}

function renderOverview(data) {
  const enabledCount = data.settings.enabledPlatformIds.length;
  document.getElementById('enabledPlatformCount').textContent = String(enabledCount);
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
        enabledPlatformIds,
        syncEnabledPlatformIds,
        summaryIncludedPlatformIds
      }
    });

    if (!response?.success) {
      throw new Error(response?.error || '保存失败');
    }

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
