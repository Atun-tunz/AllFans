import { BrowserApi } from '../runtime/browser-api.js';
import { MESSAGE_TYPES } from '../runtime/messages.js';
import { platformRegistry } from '../runtime/platform-registry.js';
import { createFeedbackController } from './feedback.js';
import { formatNumber, formatTime } from './formatters.js';
import { animateValue, parseDisplayNumber, shouldAnimate } from './number-animation.js';
import ToastManager from './toast.js';

const SYNC_STATUS_KEEP_MS = 5 * 60 * 1000;

let feedback;
let toast;
const expandedPlatforms = new Set();
const transientSyncState = new Map();
let syncStateTimer = null;
let latestData = null;
let storageRefreshPromise = null;

document.addEventListener('DOMContentLoaded', () => {
  toast = new ToastManager();
  feedback = createFeedbackController(document.getElementById('feedback'));
  bindActions();
  loadData();
});

function bindActions() {
  document.getElementById('syncAllBtn')?.addEventListener('click', syncAllPlatforms);
  document.getElementById('clearCacheBtn')?.addEventListener('click', clearCachedData);
  document.getElementById('openOptionsBtn')?.addEventListener('click', openOptionsPage);
  document.addEventListener('keydown', handleGlobalKeydown);
  bindStorageRefresh();
}

function hasRelevantStorageChange(changes) {
  return ['platforms', 'summary', 'settings', 'integrations'].some(key =>
    Object.prototype.hasOwnProperty.call(changes, key)
  );
}

function bindStorageRefresh() {
  const onChanged = BrowserApi.raw.storage?.onChanged;
  if (!onChanged?.addListener) {
    return;
  }

  onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !hasRelevantStorageChange(changes)) {
      return;
    }

    if (storageRefreshPromise) {
      return;
    }

    storageRefreshPromise = loadData({ showLoading: false }).finally(() => {
      storageRefreshPromise = null;
    });
  });
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

function getEnabledPlatforms(data) {
  return platformRegistry.filter(platform => data.settings.enabledPlatformIds.includes(platform.id));
}

function getPlatformLastUpdate(platformData) {
  const updates = [
    platformData?.lastUpdate,
    platformData?.accountStatsLastUpdate,
    platformData?.contentStatsLastUpdate
  ]
    .filter(Boolean)
    .sort();

  return updates.length > 0 ? updates[updates.length - 1] : null;
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

function markSyncAllPlatformsRunning(data) {
  for (const platform of getEnabledPlatforms(data)) {
    if (!data.settings.syncEnabledPlatformIds.includes(platform.id)) {
      continue;
    }

    setTransientSyncState(platform.id, {
      label: '同步中',
      tone: 'warning',
      disabled: true,
      kind: 'running'
    });
  }

  renderPlatformList(data, getEnabledPlatforms(data));
}

function applySyncAllResultBadges(results) {
  for (const result of results) {
    if (result.success) {
      setTransientSyncState(result.platformId, null);
      continue;
    }

    const badge = mapSyncErrorToBadge(result.error);
    setTransientSyncState(result.platformId, {
      ...badge,
      disabled: false,
      expiresAt: Date.now() + SYNC_STATUS_KEEP_MS
    });
  }
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
  const hasAccountSync =
    platform.expectedSyncScopes?.includes('account') ||
    platform.syncEntrypoints.some(entrypoint => entrypoint.id === 'home');
  const hasContentSync =
    platform.expectedSyncScopes?.includes('content') ||
    platform.syncEntrypoints.some(entrypoint => entrypoint.id === 'content' || entrypoint.id === 'notes');
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
  }

  if (genericRecent || accountRecent || contentRecent) {
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

async function loadData({ showLoading = true } = {}) {
  if (showLoading) {
    showSkeleton();
  }

  try {
    const response = await BrowserApi.runtime.sendMessage({ type: MESSAGE_TYPES.GET_ALL_DATA });
    if (!response?.success) {
      throw new Error(response?.error || 'Failed to load extension data');
    }

    latestData = response.data;
    if (showLoading) {
      hideSkeleton();
    }
    renderData(response.data);
  } catch (error) {
    if (showLoading) {
      hideSkeleton();
    }
    console.error('AllFans: failed to load popup data', error);
    toast.show('加载数据失败，请稍后重试。', 'error');
  }
}

async function syncAllPlatforms() {
  setSyncAllButtonState(true);
  if (latestData) {
    markSyncAllPlatformsRunning(latestData);
  }

  try {
    const response = await BrowserApi.runtime.sendMessage({
      type: MESSAGE_TYPES.SYNC_ALL_ENABLED_PLATFORMS,
      reason: 'manual'
    });

    if (!response?.success) {
      throw new Error(response?.error || '同步失败');
    }

    applySyncAllResultBadges(response.data.results || []);

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
    toast.show(message, failedCount === 0 ? 'success' : 'error');
  } catch (error) {
    console.error('AllFans: failed to sync all platforms', error);
    if (latestData) {
      const badge = mapSyncErrorToBadge(error?.message);
      for (const platform of getEnabledPlatforms(latestData)) {
        if (!latestData.settings.syncEnabledPlatformIds.includes(platform.id)) {
          continue;
        }

        setTransientSyncState(platform.id, {
          ...badge,
          disabled: false,
          expiresAt: Date.now() + SYNC_STATUS_KEEP_MS
        });
      }
      renderPlatformList(latestData, getEnabledPlatforms(latestData));
    }
    feedback.show(String(error?.message || '同步失败，请稍后重试。'), 'error');
    toast.show(String(error?.message || '同步失败，请稍后重试。'), 'error');
  } finally {
    setSyncAllButtonState(false);
  }
}

async function openOptionsPage() {
  try {
    await BrowserApi.runtime.openOptionsPage();
  } catch (error) {
    console.warn('AllFans: runtime.openOptionsPage failed, opening a tab instead', error);
    await BrowserApi.tabs.create({
      url: BrowserApi.runtime.getURL('options/index.html'),
      active: true
    });
  }
}

async function clearCachedData() {
  const button = document.getElementById('clearCacheBtn');
  if (!button) {
    return;
  }

  const confirmed = window.confirm('确认清理当前扩展缓存数据？');
  if (!confirmed) {
    return;
  }

  button.disabled = true;
  button.textContent = '清理中...';

  try {
    const response = await BrowserApi.runtime.sendMessage({ type: MESSAGE_TYPES.CLEAR_DATA });
    if (!response?.success) {
      throw new Error(response?.error || '清理缓存失败');
    }

    transientSyncState.clear();
    expandedPlatforms.clear();
    latestData = null;
    await loadData();
    feedback.show('缓存已清理。', 'success');
    toast.show('缓存已清理。', 'success');
  } catch (error) {
    console.error('AllFans: failed to clear cached data', error);
    feedback.show(String(error?.message || '清理缓存失败，请稍后重试。'), 'error');
    toast.show(String(error?.message || '清理缓存失败，请稍后重试。'), 'error');
  } finally {
    button.disabled = false;
    button.textContent = '清理缓存';
  }
}

function renderData(data) {
  const enabledPlatforms = getEnabledPlatforms(data);

  const totalFansEl = document.getElementById('totalFans');
  const oldFans = parseDisplayNumber(totalFansEl.textContent);
  const newFans = data.summary.totalFans;
  if (shouldAnimate(oldFans, newFans)) {
    animateValue(totalFansEl, oldFans, newFans, 1000);
  } else {
    totalFansEl.textContent = formatNumber(newFans);
  }

  const totalPlayCountEl = document.getElementById('totalPlayCount');
  const oldPlays = parseDisplayNumber(totalPlayCountEl.textContent);
  const newPlays = data.summary.totalPlayCount;
  if (shouldAnimate(oldPlays, newPlays)) {
    animateValue(totalPlayCountEl, oldPlays, newPlays, 1000);
  } else {
    totalPlayCountEl.textContent = formatNumber(newPlays);
  }

  const totalLikeCountEl = document.getElementById('totalLikeCount');
  const oldLikes = parseDisplayNumber(totalLikeCountEl.textContent);
  const newLikes = data.summary.totalLikeCount;
  if (shouldAnimate(oldLikes, newLikes)) {
    animateValue(totalLikeCountEl, oldLikes, newLikes, 1000);
  } else {
    totalLikeCountEl.textContent = formatNumber(newLikes);
  }

  document.getElementById('activePlatformCount').textContent = String(enabledPlatforms.length);

  renderPlatformList(data, enabledPlatforms);
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
    empty.textContent = '当前没有启用的平台。你可以在设置中心重新开启任意平台。';
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
          class="platform-status platform-status-button tone-${statusBadge.tone}${statusBadge.kind === 'running' ? ' is-syncing' : ''}"
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
    const isCurrentlyExpanded = !card.classList.contains('is-collapsed');

    if (isCurrentlyExpanded) {
      card.classList.add('is-collapsed');
      expandedPlatforms.delete(model.id);
    } else {
      card.classList.remove('is-collapsed');
      expandedPlatforms.add(model.id);
    }

    const toggleBtn = card.querySelector('.platform-toggle');
    toggleBtn.textContent = isCurrentlyExpanded ? '展开' : '收起';
    toggleBtn.setAttribute('aria-expanded', String(!isCurrentlyExpanded));
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
      toast.show(
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
      toast.show(String(error?.message || '同步失败，请稍后重试。'), 'error');
    }
  });

  return card;
}

function showSkeleton() {
  const shell = document.querySelector('.shell');
  const hero = shell.querySelector('.hero');
  const content = shell.querySelector('.content');
  const footer = shell.querySelector('.footer');

  let loader = document.getElementById('skeletonLoader');
  if (!loader) {
    loader = document.createElement('div');
    loader.className = 'skeleton-loader';
    loader.id = 'skeletonLoader';
    loader.innerHTML = `
      <div class="skeleton skeleton-hero">
        <div class="skeleton-line skeleton-line-lg"></div>
        <div class="skeleton-line skeleton-line-md"></div>
      </div>
      <div class="skeleton-grid">
        <div class="skeleton skeleton-card"></div>
        <div class="skeleton skeleton-card"></div>
      </div>
      <div class="skeleton skeleton-button"></div>
    `;
    shell.insertBefore(loader, hero);
  }

  loader.style.display = '';

  if (hero) hero.style.opacity = '0';
  if (content) content.style.display = 'none';
  if (footer) footer.style.display = 'none';
}

function hideSkeleton() {
  const loader = document.getElementById('skeletonLoader');
  if (loader) {
    loader.style.opacity = '0';
    setTimeout(() => {
      if (loader.parentNode) loader.remove();
    }, 280);
  }

  const shell = document.querySelector('.shell');
  const hero = shell.querySelector('.hero');
  const content = shell.querySelector('.content');
  const footer = shell.querySelector('.footer');

  if (hero) hero.style.opacity = '';
  if (content) content.style.display = '';
  if (footer) footer.style.display = '';
}

function handleGlobalKeydown(e) {
  switch (e.key) {
    case 'Escape':
      handleEscapeKey(e);
      break;
    case 'ArrowUp':
    case 'ArrowDown':
      handleArrowKeyNav(e);
      break;
  }
}

function handleEscapeKey(e) {
  const expandedCards = document.querySelectorAll('.platform-card:not(.is-collapsed)');
  if (expandedCards.length > 0) {
    const lastExpanded = expandedCards[expandedCards.length - 1];
    lastExpanded.querySelector('.platform-toggle')?.click();
    e.preventDefault();
  }
}

function handleArrowKeyNav(e) {
  const focusedCard = document.activeElement.closest('.platform-card');
  if (!focusedCard) return;

  const cards = Array.from(document.querySelectorAll('.platform-card'));
  const currentIndex = cards.indexOf(focusedCard);

  let nextIndex;
  if (e.key === 'ArrowUp') {
    nextIndex = currentIndex > 0 ? currentIndex - 1 : cards.length - 1;
  } else {
    nextIndex = currentIndex < cards.length - 1 ? currentIndex + 1 : 0;
  }

  cards[nextIndex].querySelector('.platform-name-link')?.focus();
  e.preventDefault();
}
