import { BrowserApi } from '../runtime/browser-api.js';
import { MESSAGE_TYPES } from '../runtime/messages.js';
import { platformRegistry } from '../runtime/platform-registry.js';
import { createFeedbackController } from './feedback.js';
import { formatNumber, formatTime } from './formatters.js';

const SYNC_STATUS_KEEP_MS = 5 * 60 * 1000;

let feedback;
const expandedPlatforms = new Set();
const transientSyncState = new Map();
let syncStateTimer = null;
let settingsPanelExpanded = false;
let latestData = null;

document.addEventListener('DOMContentLoaded', () => {
  feedback = createFeedbackController(document.getElementById('feedback'));
  bindActions();
  loadData();
});

function bindActions() {
  document.getElementById('syncAllBtn')?.addEventListener('click', syncAllPlatforms);
  document.getElementById('saveSettingsBtnBottom')?.addEventListener('click', saveSettings);
  document.getElementById('settingsToggleBtn')?.addEventListener('click', toggleSettingsPanel);
}

function setSyncAllButtonState(isRunning) {
  const button = document.getElementById('syncAllBtn');
  if (!button) {
    return;
  }

  button.disabled = isRunning;
  button.classList.toggle('is-running', isRunning);
  button.textContent = isRunning ? '同步中' : '一键全网';
}

function toggleSettingsPanel() {
  settingsPanelExpanded = !settingsPanelExpanded;
  syncSettingsPanelState();
}

function syncSettingsPanelState() {
  const panel = document.getElementById('settingsPanelBottom');
  const button = document.getElementById('settingsToggleBtn');

  if (!panel || !button) {
    return;
  }

  panel.classList.toggle('is-collapsed', !settingsPanelExpanded);
  button.setAttribute('aria-expanded', String(settingsPanelExpanded));
  button.textContent = settingsPanelExpanded ? '收起' : '展开';
}

function getEnabledPlatforms(data) {
  return platformRegistry.filter(platform => data.settings.enabledPlatformIds.includes(platform.id));
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

function isRecentUpdate(isoString) {
  if (!isoString) {
    return false;
  }

  const diff = Date.now() - new Date(isoString).getTime();
  return diff >= 0 && diff <= SYNC_STATUS_KEEP_MS;
}

function clearExpiredTransientSyncStates() {
  const now = Date.now();

  for (const [platformId, state] of transientSyncState.entries()) {
    if (state.kind === 'running') {
      continue;
    }

    if (state.expiresAt && state.expiresAt <= now) {
      transientSyncState.delete(platformId);
    }
  }
}

function scheduleSyncStateRefresh() {
  if (syncStateTimer) {
    clearTimeout(syncStateTimer);
    syncStateTimer = null;
  }

  if (!latestData) {
    return;
  }

  const now = Date.now();
  const candidates = [];

  for (const state of transientSyncState.values()) {
    if (state.kind !== 'running' && state.expiresAt && state.expiresAt > now) {
      candidates.push(state.expiresAt - now);
    }
  }

  for (const platform of platformRegistry) {
    const lastUpdate = getPlatformLastUpdate(latestData.platforms?.[platform.id]);
    if (!lastUpdate) {
      continue;
    }

    const expiresAt = new Date(lastUpdate).getTime() + SYNC_STATUS_KEEP_MS;
    if (expiresAt > now) {
      candidates.push(expiresAt - now);
    }
  }

  const nextDelay = candidates.sort((left, right) => left - right)[0];
  if (!nextDelay) {
    return;
  }

  syncStateTimer = setTimeout(() => {
    clearExpiredTransientSyncStates();
    if (latestData) {
      renderData(latestData);
    }
  }, nextDelay + 50);
}

function setTransientSyncState(platformId, state) {
  if (!state) {
    transientSyncState.delete(platformId);
  } else {
    transientSyncState.set(platformId, state);
  }

  scheduleSyncStateRefresh();
}

function mapSyncErrorToBadge(errorMessage) {
  const message = String(errorMessage || '');

  if (/登录|未登录|尚未登录|目标后台/.test(message)) {
    return { label: '请登录', tone: 'danger' };
  }

  if (/超时|timeout|timed out/i.test(message)) {
    return { label: '超时重试', tone: 'danger' };
  }

  return { label: '同步失败', tone: 'danger' };
}

function getPlatformStatusBadge(platform, data) {
  const syncEnabled = data.settings.syncEnabledPlatformIds.includes(platform.id);
  if (!syncEnabled) {
    return {
      label: '已关闭',
      tone: 'muted',
      disabled: true
    };
  }

  clearExpiredTransientSyncStates();
  const transient = transientSyncState.get(platform.id);
  if (transient) {
    return transient;
  }

  const platformData = data.platforms?.[platform.id] || {};
  const hasAccountSync = platform.syncEntrypoints.some(entrypoint => entrypoint.id === 'home');
  const hasContentSync = platform.syncEntrypoints.some(
    entrypoint => entrypoint.id === 'content' || entrypoint.id === 'notes'
  );
  const accountRecent = isRecentUpdate(platformData.accountStatsLastUpdate);
  const contentRecent = isRecentUpdate(platformData.contentStatsLastUpdate);
  const genericRecent = isRecentUpdate(platformData.lastUpdate);

  if (hasAccountSync && hasContentSync) {
    if (accountRecent && contentRecent) {
      return { label: '已同步', tone: 'success', disabled: false };
    }

    if (accountRecent || contentRecent) {
      return { label: '部分同步', tone: 'warning', disabled: false };
    }
  } else if (genericRecent || accountRecent || contentRecent) {
    return {
      label: '已同步',
      tone: 'success',
      disabled: false
    };
  }

  return {
    label: '点击同步',
    tone: 'muted',
    disabled: false
  };
}

async function loadData() {
  try {
    const response = await BrowserApi.runtime.sendMessage({ type: MESSAGE_TYPES.GET_ALL_DATA });
    if (!response?.success) {
      throw new Error(response?.error || 'Failed to load extension data');
    }

    latestData = response.data;
    renderData(response.data);
  } catch (error) {
    console.error('AllFans: failed to load popup data', error);
    feedback.show('加载数据失败，请稍后重试。', 'error');
  }
}

async function syncAllPlatforms() {
  setSyncAllButtonState(true);

  try {
    const response = await BrowserApi.runtime.sendMessage({
      type: MESSAGE_TYPES.SYNC_ALL_ENABLED_PLATFORMS,
      reason: 'manual'
    });

    if (!response?.success) {
      throw new Error(response?.error || '同步失败');
    }

    for (const result of response.data.results || []) {
      if (result.success) {
        setTransientSyncState(result.platformId, null);
      }
    }

    await loadData();

    const failedCount = response.data.results.filter(result => !result.success).length;
    const partialCount = response.data.results.filter(result => result.status === 'partial').length;
    const message =
      failedCount === 0 && partialCount === 0
        ? '已完成全部平台同步。'
        : failedCount === 0
          ? `同步完成，${partialCount} 个平台为部分同步。`
          : `同步完成，${failedCount} 个平台失败。`;

    feedback.show(message, failedCount === 0 ? 'success' : 'error');
  } catch (error) {
    console.error('AllFans: failed to sync all platforms', error);
    feedback.show(String(error?.message || '同步失败，请稍后重试。'), 'error');
  } finally {
    setSyncAllButtonState(false);
  }
}

async function saveSettings() {
  const button = document.getElementById('saveSettingsBtnBottom');
  button.disabled = true;
  button.textContent = '保存中...';

  try {
    const enabledPlatformIds = [];
    const syncEnabledPlatformIds = [];
    const summaryIncludedPlatformIds = [];

    for (const platform of platformRegistry) {
      if (document.getElementById(`${platform.id}-enabled-bottom`).checked) {
        enabledPlatformIds.push(platform.id);
      }
      if (document.getElementById(`${platform.id}-sync-bottom`).checked) {
        syncEnabledPlatformIds.push(platform.id);
      }
      if (document.getElementById(`${platform.id}-summary-bottom`).checked) {
        summaryIncludedPlatformIds.push(platform.id);
      }
    }

    const response = await BrowserApi.runtime.sendMessage({
      type: MESSAGE_TYPES.UPDATE_SETTINGS,
      settings: {
        autoUpdate: document.getElementById('autoUpdateSettingBottom').checked,
        externalApiEnabled: document.getElementById('externalApiEnabledSettingBottom').checked,
        localBridgeEnabled: document.getElementById('localBridgeEnabledSettingBottom').checked,
        localBridgeEndpoint: document.getElementById('localBridgeEndpointSettingBottom').value.trim(),
        enabledPlatformIds,
        syncEnabledPlatformIds,
        summaryIncludedPlatformIds
      }
    });

    if (!response?.success) {
      throw new Error(response?.error || '保存失败');
    }

    await loadData();
    feedback.show('设置已更新。', 'success');
  } catch (error) {
    console.error('AllFans: failed to save settings', error);
    feedback.show(String(error?.message || '保存失败，请稍后重试。'), 'error');
  } finally {
    button.disabled = false;
    button.textContent = '保存设置';
  }
}

function renderData(data) {
  const enabledPlatforms = getEnabledPlatforms(data);

  document.getElementById('totalFans').textContent = formatNumber(data.summary.totalFans);
  document.getElementById('totalPlayCount').textContent = formatNumber(data.summary.totalPlayCount);
  document.getElementById('totalLikeCount').textContent = formatNumber(data.summary.totalLikeCount);
  document.getElementById('activePlatformCount').textContent = String(enabledPlatforms.length);

  renderPlatformList(data, enabledPlatforms);
  renderSettings(data);
  scheduleSyncStateRefresh();
}

function buildMetricTiles(metrics) {
  return metrics
    .map(metric => {
      const inlineChange = metric.inlineChange
        ? `<span class="metric-inline-change tone-${metric.inlineChangeTone || 'success'}">${metric.inlineChange}</span>`
        : '';

      return `
        <div class="metric-tile${metric.variant ? ` ${metric.variant}` : ''}">
          <div class="metric-head">
            <span class="metric-label">${metric.label}</span>
            ${inlineChange}
          </div>
          <span class="metric-value">${metric.value}</span>
        </div>
      `;
    })
    .join('');
}

function renderPlatformList(data, enabledPlatforms) {
  const container = document.getElementById('platformList');
  container.innerHTML = '';

  if (enabledPlatforms.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'platform-empty';
    empty.textContent = '当前没有启用的平台。你可以在下方设置区重新开启任意平台。';
    container.appendChild(empty);
    return;
  }

  for (const platform of enabledPlatforms) {
    const model = platform.createPopupCardModel(data.platforms[platform.id], {
      isEnabled: true,
      isSyncEnabled: data.settings.syncEnabledPlatformIds.includes(platform.id),
      isIncludedInSummary: data.settings.summaryIncludedPlatformIds.includes(platform.id)
    });
    container.appendChild(renderPlatformCard(platform, model, data));
  }
}

function renderPlatformCard(platform, model, data) {
  const card = document.createElement('section');
  const isExpanded = expandedPlatforms.has(model.id);
  const statusBadge = getPlatformStatusBadge(platform, data);
  card.className = `platform-card${isExpanded ? '' : ' is-collapsed'}${model.hasData ? ' has-data' : ''}`;

  const compactHtml = model.compactMetrics
    .map(
      metric => `
        <div class="metric-chip">
          <span class="metric-chip-label">${metric.label}</span>
          <span class="metric-chip-value">${metric.value}</span>
        </div>
      `
    )
    .join('');

  const sectionsHtml = model.sections
    .map(
      section => `
        <section class="platform-section">
          <div class="platform-section-head">
            <span class="platform-section-title">${section.title}</span>
            <span class="platform-section-meta">${section.meta}</span>
          </div>
          <div class="platform-grid">${buildMetricTiles(section.metrics)}</div>
        </section>
      `
    )
    .join('');

  card.innerHTML = `
    <div class="platform-card-header">
      <div class="platform-title-wrap">
        <p class="platform-kicker">${model.kicker}</p>
        <button class="platform-name-link" type="button">${model.title}</button>
        <p class="platform-account-name">${model.accountName}</p>
      </div>
      <div class="platform-head-actions">
        <button
          class="platform-status platform-status-button tone-${statusBadge.tone}"
          type="button"
          ${statusBadge.disabled ? 'disabled' : ''}
        >${statusBadge.label}</button>
        <button class="platform-toggle" type="button" aria-expanded="${String(isExpanded)}">${isExpanded ? '收起' : '展开'}</button>
      </div>
    </div>
    <div class="platform-compact">${compactHtml}</div>
    <div class="platform-sections">${sectionsHtml}</div>
  `;

  card.querySelector('.platform-toggle').addEventListener('click', () => {
    if (expandedPlatforms.has(model.id)) {
      expandedPlatforms.delete(model.id);
    } else {
      expandedPlatforms.add(model.id);
    }

    renderPlatformList(latestData, getEnabledPlatforms(latestData));
  });

  card.querySelector('.platform-name-link').addEventListener('click', async () => {
    await BrowserApi.tabs.create({
      url: model.homeUrl,
      active: true
    });
  });

  card.querySelector('.platform-status-button').addEventListener('click', async event => {
    const button = event.currentTarget;
    if (button.disabled) {
      return;
    }

    setTransientSyncState(platform.id, {
      label: '同步中',
      tone: 'warning',
      disabled: true,
      kind: 'running'
    });
    renderPlatformList(latestData, getEnabledPlatforms(latestData));

    try {
      const response = await BrowserApi.runtime.sendMessage({
        type: MESSAGE_TYPES.OPEN_AND_SYNC_PLATFORM,
        platformId: platform.id,
        reason: 'manual'
      });

      if (!response?.success) {
        throw new Error(response?.error || '同步失败');
      }

      setTransientSyncState(platform.id, null);
      await loadData();
      feedback.show(
        response.data.status === 'partial'
          ? `${platform.title}已完成部分同步。`
          : `${platform.title}已完成同步。`,
        response.data.status === 'partial' ? 'error' : 'success'
      );
    } catch (error) {
      console.error('AllFans: failed to sync platform workflow', error);
      const badge = mapSyncErrorToBadge(error?.message);
      setTransientSyncState(platform.id, {
        ...badge,
        disabled: false,
        expiresAt: Date.now() + SYNC_STATUS_KEEP_MS
      });
      renderPlatformList(latestData, getEnabledPlatforms(latestData));
      feedback.show(String(error?.message || '同步失败，请稍后重试。'), 'error');
    }
  });

  return card;
}

function renderSettings(data) {
  syncSettingsPanelState();
  document.getElementById('autoUpdateSettingBottom').checked = Boolean(data.settings.autoUpdate);
  document.getElementById('externalApiEnabledSettingBottom').checked = Boolean(
    data.settings.externalApiEnabled
  );
  document.getElementById('localBridgeEnabledSettingBottom').checked = Boolean(
    data.settings.localBridgeEnabled
  );
  document.getElementById('localBridgeEndpointSettingBottom').value =
    data.settings.localBridgeEndpoint || '';

  const settingsList = document.getElementById('platformSettingsListBottom');
  settingsList.innerHTML = '';

  for (const platform of platformRegistry) {
    const row = document.createElement('label');
    row.className = 'platform-setting-row';
    row.innerHTML = `
      <span class="platform-setting-name">
        <span class="platform-setting-title">${platform.title}</span>
        <span class="platform-setting-caption">${platform.id}</span>
      </span>
      <input type="checkbox" id="${platform.id}-enabled-bottom" ${data.settings.enabledPlatformIds.includes(platform.id) ? 'checked' : ''}>
      <input type="checkbox" id="${platform.id}-sync-bottom" ${data.settings.syncEnabledPlatformIds.includes(platform.id) ? 'checked' : ''}>
      <input type="checkbox" id="${platform.id}-summary-bottom" ${data.settings.summaryIncludedPlatformIds.includes(platform.id) ? 'checked' : ''}>
    `;
    settingsList.appendChild(row);
  }

  const bridge = data.integrations.localBridge;
  const bridgeStatus = document.getElementById('localBridgeStatusBottom');
  bridgeStatus.textContent = [
    `状态：${bridge.lastStatus || 'idle'}`,
    bridge.lastSuccessAt ? `最近成功：${formatTime(bridge.lastSuccessAt)}` : '最近成功：暂无',
    bridge.lastError ? `最近错误：${bridge.lastError}` : null
  ]
    .filter(Boolean)
    .join(' | ');
}
