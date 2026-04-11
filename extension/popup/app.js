import { BrowserApi } from '../runtime/browser-api.js';
import { MESSAGE_TYPES } from '../runtime/messages.js';
import { matchPlatformForUrl, platformRegistry } from '../runtime/platform-registry.js';
import { createFeedbackController } from './feedback.js';
import { formatNumber, formatTime } from './formatters.js';

let feedback;
let latestRefreshPlatform = null;
let clearConfirmPending = false;
let clearConfirmTimer = null;
const expandedPlatforms = new Set();
let settingsPanelExpanded = false;
let latestData = null;

document.addEventListener('DOMContentLoaded', () => {
  feedback = createFeedbackController(document.getElementById('feedback'));
  bindActions();
  loadData();
});

function bindActions() {
  document.getElementById('refreshBtn').addEventListener('click', refreshCurrentPlatformData);
  document.getElementById('syncAllBtn').addEventListener('click', syncAllPlatforms);
  document.getElementById('pushSnapshotBtn').addEventListener('click', pushLocalSnapshot);
  document.getElementById('clearBtn').addEventListener('click', handleClearButtonClick);
  document.getElementById('saveSettingsBtnBottom').addEventListener('click', saveSettings);
  document.getElementById('settingsToggleBtn').addEventListener('click', toggleSettingsPanel);
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

async function refreshCurrentPlatformData() {
  const button = document.getElementById('refreshBtn');
  button.disabled = true;
  button.textContent = '同步中...';

  try {
    const [activeTab] = await BrowserApi.tabs.query({
      active: true,
      currentWindow: true
    });
    const match = matchPlatformForUrl(activeTab?.url);

    if (!activeTab?.id || !match) {
      throw new Error('请先打开支持的创作者后台页面。');
    }

    const response = await BrowserApi.runtime.sendMessage({
      type: MESSAGE_TYPES.SYNC_PLATFORM,
      tabId: activeTab.id,
      platformId: match.platformId,
      entrypointId: match.entrypointId,
      reason: 'manual'
    });

    if (!response?.success) {
      throw new Error(response?.error || '同步失败');
    }

    latestRefreshPlatform = match.platformId;
    await loadData();
    feedback.show(`${match.platformName}数据已刷新。`, 'success');
  } catch (error) {
    console.error('AllFans: failed to refresh current platform data', error);
    feedback.show(String(error?.message || '同步失败，请稍后重试。'), 'error');
  } finally {
    button.disabled = false;
    button.textContent = '同步当前页面';
  }
}

async function syncAllPlatforms() {
  const button = document.getElementById('syncAllBtn');
  button.disabled = true;
  button.textContent = '同步中...';

  try {
    const response = await BrowserApi.runtime.sendMessage({
      type: MESSAGE_TYPES.SYNC_ALL_ENABLED_PLATFORMS,
      reason: 'manual'
    });

    if (!response?.success) {
      throw new Error(response?.error || '同步失败');
    }

    latestRefreshPlatform = null;
    await loadData();

    const failedCount = response.data.results.filter(result => !result.success).length;
    feedback.show(
      failedCount === 0 ? '已完成全部平台同步。' : `同步完成，${failedCount} 个平台失败。`,
      failedCount === 0 ? 'success' : 'error'
    );
  } catch (error) {
    console.error('AllFans: failed to sync all platforms', error);
    feedback.show(String(error?.message || '同步失败，请稍后重试。'), 'error');
  } finally {
    button.disabled = false;
    button.textContent = '同步全部已启用平台';
  }
}

async function pushLocalSnapshot() {
  const button = document.getElementById('pushSnapshotBtn');
  button.disabled = true;
  button.textContent = '推送中...';

  try {
    const response = await BrowserApi.runtime.sendMessage({
      type: MESSAGE_TYPES.PUSH_LOCAL_BRIDGE_SNAPSHOT
    });

    if (!response?.success) {
      throw new Error(response?.error || '推送失败');
    }

    await loadData();
    const pushStatus = response.data.status;
    feedback.show(
      pushStatus === 'success'
        ? '当前快照已推送到本地程序。'
        : pushStatus === 'disabled'
          ? '本地同步桥尚未启用。'
          : response.data.error || '本地推送失败。',
      pushStatus === 'success' ? 'success' : 'error'
    );
  } catch (error) {
    console.error('AllFans: failed to push local snapshot', error);
    feedback.show(String(error?.message || '推送失败，请稍后重试。'), 'error');
  } finally {
    button.disabled = false;
    button.textContent = '推送当前快照';
  }
}

function resetClearButtonState() {
  const button = document.getElementById('clearBtn');
  clearConfirmPending = false;
  button.textContent = '清空缓存';

  if (clearConfirmTimer) {
    clearTimeout(clearConfirmTimer);
    clearConfirmTimer = null;
  }
}

async function handleClearButtonClick() {
  const button = document.getElementById('clearBtn');

  if (!clearConfirmPending) {
    clearConfirmPending = true;
    button.textContent = '再次点击确认';
    feedback.show('再次点击“清空缓存”以确认。', 'error', 4000);
    clearConfirmTimer = setTimeout(resetClearButtonState, 4000);
    return;
  }

  resetClearButtonState();

  try {
    const response = await BrowserApi.runtime.sendMessage({ type: MESSAGE_TYPES.CLEAR_DATA });
    if (!response?.success) {
      throw new Error(response?.error || 'Failed to clear data');
    }

    latestRefreshPlatform = null;
    await loadData();
    feedback.show('本地缓存已清空。', 'success');
  } catch (error) {
    console.error('AllFans: failed to clear data', error);
    feedback.show('清空缓存失败，请稍后重试。', 'error');
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
  const enabledPlatforms = platformRegistry.filter(platform =>
    data.settings.enabledPlatformIds.includes(platform.id)
  );

  document.getElementById('totalFans').textContent = formatNumber(data.summary.totalFans);
  document.getElementById('totalPlayCount').textContent = formatNumber(data.summary.totalPlayCount);
  document.getElementById('totalLikeCount').textContent = formatNumber(data.summary.totalLikeCount);
  document.getElementById('activePlatformCount').textContent = String(enabledPlatforms.length);
  document.getElementById('lastUpdate').textContent = data.summary.lastUpdate
    ? formatTime(data.summary.lastUpdate)
    : '从未更新';

  renderPlatformList(data, enabledPlatforms);
  renderSettings(data);
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
      isIncludedInSummary: data.settings.summaryIncludedPlatformIds.includes(platform.id),
      justSynced: latestRefreshPlatform === platform.id
    });
    container.appendChild(renderPlatformCard(model));
  }
}

function renderPlatformCard(model) {
  const card = document.createElement('section');
  const isExpanded = expandedPlatforms.has(model.id);
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
    .map(section => {
      const metricsHtml = section.metrics
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

      return `
        <section class="platform-section">
          <div class="platform-section-head">
            <span class="platform-section-title">${section.title}</span>
            <span class="platform-section-meta">${section.meta}</span>
          </div>
          <div class="platform-grid">${metricsHtml}</div>
        </section>
      `;
    })
    .join('');

  const syncActionsHtml = model.syncEntrypoints
    .map(
      entrypoint => `
        <button
          class="platform-hint platform-link"
          type="button"
          data-platform-id="${entrypoint.platformId}"
          data-entrypoint-id="${entrypoint.id}"
        >
          <span class="platform-hint-text">${entrypoint.label}</span>
          <span class="platform-hint-action">${entrypoint.actionLabel}</span>
        </button>
      `
    )
    .join('');

  card.innerHTML = `
    <div class="platform-card-header">
      <div class="platform-title-wrap">
        <p class="platform-kicker">${model.kicker}</p>
        <h2 class="platform-name">${model.title}</h2>
        <p class="platform-account-name">${model.accountName}</p>
      </div>
      <div class="platform-head-actions">
        <span class="platform-status tone-${model.statusTone}">${model.status}</span>
        <button class="platform-toggle" type="button" aria-expanded="${String(isExpanded)}">${isExpanded ? '收起' : '展开'}</button>
      </div>
    </div>
    <div class="platform-compact">${compactHtml}</div>
    <div class="platform-sections">${sectionsHtml}</div>
    <div class="platform-card-footer">
      <div class="platform-link-group">${syncActionsHtml}</div>
    </div>
  `;

  card.querySelector('.platform-toggle').addEventListener('click', () => {
    if (expandedPlatforms.has(model.id)) {
      expandedPlatforms.delete(model.id);
    } else {
      expandedPlatforms.add(model.id);
    }

    renderPlatformList(latestData, platformRegistry.filter(platform =>
      latestData.settings.enabledPlatformIds.includes(platform.id)
    ));
  });

  card.querySelectorAll('[data-platform-id]').forEach(button => {
    button.addEventListener('click', async event => {
      const target = event.currentTarget;
      target.disabled = true;

      try {
        const response = await BrowserApi.runtime.sendMessage({
          type: MESSAGE_TYPES.OPEN_AND_SYNC_PLATFORM,
          platformId: target.dataset.platformId,
          entrypointId: target.dataset.entrypointId,
          reason: 'manual'
        });

        if (!response?.success) {
          throw new Error(response?.error || '同步失败');
        }

        latestRefreshPlatform = target.dataset.platformId;
        await loadData();
        feedback.show('平台页面已打开并开始同步。', 'success');
      } catch (error) {
        console.error('AllFans: failed to open and sync platform', error);
        feedback.show(String(error?.message || '同步失败，请稍后重试。'), 'error');
      } finally {
        target.disabled = false;
      }
    });
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
        <span class="platform-setting-caption">${platform.displayName}</span>
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
