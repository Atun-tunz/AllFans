import { BrowserApi } from '../runtime/browser-api.js';
import { pushSnapshotToLocalBridge } from '../runtime/local-bridge.js';
import { DAILY_SYNC_ALARM, MESSAGE_TYPES } from '../runtime/messages.js';
import { getPlatformById } from '../runtime/platform-registry.js';
import { StorageManager } from '../runtime/storage-manager.js';

const OPEN_SYNC_OPTIONS = {
  tabLoadTimeoutMs: 20000,
  messageRetryCount: 20,
  messageRetryDelayMs: 400
};

BrowserApi.runtime.onInstalled.addListener(async details => {
  console.log('AllFans: onInstalled', details);

  if (details.reason === 'install') {
    await StorageManager.clearAllData();
  } else {
    await StorageManager.getAllData();
  }

  const data = await StorageManager.getAllData();
  await reconcileDailySyncAlarm(data.settings);
  await pushSnapshotAndPersistState([], data);
});

BrowserApi.runtime.onStartup?.addListener(async () => {
  const data = await StorageManager.getAllData();
  await reconcileDailySyncAlarm(data.settings);
  await pushSnapshotAndPersistState([], data);
});

BrowserApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender, sendResponse);
  return true;
});

BrowserApi.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.type !== MESSAGE_TYPES.GET_ALL_DATA) {
    sendResponse({ success: false, error: 'Unsupported message type' });
    return;
  }

  StorageManager.getAllData()
    .then(data => {
      if (!data.settings.externalApiEnabled) {
        sendResponse({ success: false, error: 'External read API is disabled.' });
        return;
      }

      if (!isAllowedExternalSender(sender?.url, data.settings.localBridgeEndpoint)) {
        sendResponse({ success: false, error: 'External sender is not allowed.' });
        return;
      }

      sendResponse({
        success: true,
        data,
        timestamp: new Date().toISOString()
      });
    })
    .catch(error => {
      sendResponse({ success: false, error: error.message });
    });

  return true;
});

if (BrowserApi.alarms) {
  BrowserApi.alarms.onAlarm.addListener(alarm => {
    if (alarm.name !== DAILY_SYNC_ALARM) {
      return;
    }

    syncAllEnabledPlatforms('alarm').catch(error => {
      console.error('AllFans: scheduled sync failed', error);
    });
  });
}

async function handleMessage(message, sender, sendResponse) {
  try {
    switch (message.type) {
      case MESSAGE_TYPES.DATA_EXTRACTED: {
        const updatedData = await StorageManager.updatePlatformData(
          message.platformId || message.data.platform,
          message.data
        );
        await pushSnapshotAndPersistState(
          [
            {
              platformId: message.platformId || message.data.platform,
              success: true,
              reason: message.reason || 'passive'
            }
          ],
          updatedData
        );
        sendResponse({ success: true, data: updatedData });
        break;
      }

      case MESSAGE_TYPES.GET_PLATFORM_DATA: {
        const platformData = await StorageManager.getPlatformData(message.platform);
        sendResponse({ success: true, data: platformData });
        break;
      }

      case MESSAGE_TYPES.GET_ALL_DATA: {
        const allData = await StorageManager.getAllData();
        sendResponse({ success: true, data: allData });
        break;
      }

      case MESSAGE_TYPES.UPDATE_SETTINGS: {
        const updatedData = await StorageManager.updateSettings(message.settings);
        await reconcileDailySyncAlarm(updatedData.settings);
        await pushSnapshotAndPersistState([], updatedData);
        sendResponse({ success: true, data: updatedData });
        break;
      }

      case MESSAGE_TYPES.CLEAR_DATA: {
        await StorageManager.clearAllData();
        sendResponse({ success: true });
        break;
      }

      case MESSAGE_TYPES.SYNC_PLATFORM: {
        const result = await syncPlatformInTab({
          platformId: message.platformId,
          entrypointId: message.entrypointId,
          tabId: message.tabId,
          reason: message.reason || 'manual'
        });
        sendResponse({ success: true, data: result });
        break;
      }

      case MESSAGE_TYPES.OPEN_AND_SYNC_PLATFORM: {
        const result = await openAndSyncPlatform({
          platformId: message.platformId,
          entrypointId: message.entrypointId,
          reason: message.reason || 'manual'
        });
        sendResponse({ success: true, data: result });
        break;
      }

      case MESSAGE_TYPES.SYNC_ALL_ENABLED_PLATFORMS: {
        const result = await syncAllEnabledPlatforms(message.reason || 'manual');
        sendResponse({ success: true, data: result });
        break;
      }

      case MESSAGE_TYPES.PUSH_LOCAL_BRIDGE_SNAPSHOT: {
        const data = await StorageManager.getAllData();
        const pushResult = await pushSnapshotAndPersistState([], data);
        sendResponse({ success: true, data: pushResult });
        break;
      }

      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  } catch (error) {
    console.error('AllFans: failed to handle message', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function reconcileDailySyncAlarm(settings) {
  if (!BrowserApi.alarms) {
    return;
  }

  if (!settings.autoUpdate || settings.syncEnabledPlatformIds.length === 0) {
    await BrowserApi.alarms.clear(DAILY_SYNC_ALARM);
    return;
  }

  await BrowserApi.alarms.create(DAILY_SYNC_ALARM, {
    delayInMinutes: 1440,
    periodInMinutes: 1440
  });
}

function ensurePlatformSyncIsEnabled(platformId, settings) {
  if (!settings.enabledPlatformIds.includes(platformId)) {
    throw new Error('该平台已在设置中隐藏，请先启用后再同步。');
  }

  if (!settings.syncEnabledPlatformIds.includes(platformId)) {
    throw new Error('该平台的同步功能已在设置中关闭。');
  }
}

async function pushSnapshotAndPersistState(syncResults = [], data = null) {
  const currentData = data || (await StorageManager.getAllData());
  const attemptedAt = new Date().toISOString();
  const pushResult = await pushSnapshotToLocalBridge({
    settings: currentData.settings,
    data: currentData,
    syncResults
  });

  const nextState = {
    lastStatus: pushResult.status,
    lastAttemptAt: attemptedAt,
    lastEndpoint:
      pushResult.endpoint ||
      currentData.settings.localBridgeEndpoint ||
      currentData.integrations.localBridge.lastEndpoint,
    lastError: pushResult.status === 'error' ? pushResult.error : null
  };

  if (pushResult.status === 'success') {
    nextState.lastSuccessAt = attemptedAt;
  }

  await StorageManager.updateLocalBridgeState(nextState);
  return pushResult;
}

async function syncPlatformInTab({ platformId, entrypointId, tabId, reason, skipPush = false }) {
  const data = await StorageManager.getAllData();
  ensurePlatformSyncIsEnabled(platformId, data.settings);

  const platform = getPlatformById(platformId);
  if (!platform) {
    throw new Error(`Unsupported platform "${platformId}".`);
  }

  const entrypoint =
    platform.syncEntrypoints.find(candidate => candidate.id === entrypointId) ||
    platform.syncEntrypoints.find(candidate => candidate.id === platform.defaultSyncEntrypointId) ||
    platform.syncEntrypoints[0];

  const response = await sendMessageWithRetry(
    tabId,
    {
      type: MESSAGE_TYPES.SYNC_PLATFORM,
      platformId,
      entrypointId: entrypoint?.id || null,
      reason
    },
    OPEN_SYNC_OPTIONS
  );

  if (!response?.success) {
    throw new Error(response?.error || `${platform.displayName}同步失败`);
  }

  const updatedData = await StorageManager.updatePlatformData(platformId, response.data);
  const syncResults = [
    {
      platformId,
      entrypointId: entrypoint?.id || null,
      success: true,
      reason,
      scope: response.scope || null
    }
  ];

  let pushResult = null;
  if (!skipPush) {
    pushResult = await pushSnapshotAndPersistState(syncResults, updatedData);
  }

  return {
    platformId,
    entrypointId: entrypoint?.id || null,
    scope: response.scope || null,
    status: 'success',
    data: response.data,
    pushResult
  };
}

function resolvePlatformSyncEntrypoints(platform, entrypointId = null) {
  if (entrypointId) {
    const matched =
      platform.syncEntrypoints.find(candidate => candidate.id === entrypointId) ||
      platform.syncEntrypoints.find(candidate => candidate.id === platform.defaultSyncEntrypointId) ||
      platform.syncEntrypoints[0];

    return matched ? [matched] : [];
  }

  return [...platform.syncEntrypoints];
}

function aggregateSyncScope(results) {
  const scopes = new Set(results.map(result => result.scope).filter(Boolean));

  if (scopes.has('both') || (scopes.has('account') && scopes.has('content'))) {
    return 'both';
  }

  if (scopes.has('content')) {
    return 'content';
  }

  if (scopes.has('account')) {
    return 'account';
  }

  return null;
}

function shouldRetryEntrypointSync(entrypoint, error) {
  if (!entrypoint || entrypoint.id === 'home') {
    return false;
  }

  const message = String(error?.message || error || '');
  return (
    message.includes('暂未准备完成') ||
    message.includes('bridge request timed out') ||
    message.includes('account bridge request timed out') ||
    message.includes('Could not establish connection') ||
    message.includes('Receiving end does not exist') ||
    /timeout|timed out/i.test(message)
  );
}

async function openAndSyncSingleEntrypoint({ platform, entrypoint, reason, skipPush = false }) {
  const tab = await openOrActivateTargetTab(entrypoint.url, entrypoint.urlPrefix);
  await waitForTabReady(tab.id, entrypoint.urlPrefix);

  const latestTab = await BrowserApi.tabs.get(tab.id);
  if (!latestTab.url?.startsWith(entrypoint.urlPrefix)) {
    throw new Error(`${platform.displayName}页面未进入目标后台，可能尚未登录。`);
  }

  try {
    return await syncPlatformInTab({
      platformId: platform.id,
      entrypointId: entrypoint.id,
      tabId: tab.id,
      reason,
      skipPush
    });
  } catch (error) {
    if (!shouldRetryEntrypointSync(entrypoint, error)) {
      throw error;
    }

    await BrowserApi.tabs.reload(tab.id);
    await waitForTabReady(tab.id, entrypoint.urlPrefix);

    return syncPlatformInTab({
      platformId: platform.id,
      entrypointId: entrypoint.id,
      tabId: tab.id,
      reason,
      skipPush
    });
  }
}

async function openAndSyncPlatform({ platformId, entrypointId, reason, skipPush = false }) {
  const platform = getPlatformById(platformId);
  if (!platform) {
    throw new Error(`Unsupported platform "${platformId}".`);
  }

  {
    const entrypoints = resolvePlatformSyncEntrypoints(platform, entrypointId);
    const firstEntrypoint = entrypoints[0];

    if (!firstEntrypoint) {
      throw new Error(`${platform.displayName}没有可用的同步入口。`);
    }

    if (entrypoints.length === 1) {
      return openAndSyncSingleEntrypoint({
        platform,
        entrypoint: firstEntrypoint,
        reason,
        skipPush
      });
    }

    const results = [];

    for (const candidate of entrypoints) {
      try {
        const result = await openAndSyncSingleEntrypoint({
          platform,
          entrypoint: candidate,
          reason,
          skipPush: true
        });

        results.push({
          entrypointId: candidate.id,
          success: true,
          scope: result.scope || null
        });
      } catch (error) {
        results.push({
          entrypointId: candidate.id,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    const successResults = results.filter(result => result.success);
    if (successResults.length === 0) {
      throw new Error(results[0]?.error || `${platform.displayName}同步失败`);
    }

    const refreshedData = await StorageManager.getAllData();
    let pushResult = null;
    if (!skipPush) {
      pushResult = await pushSnapshotAndPersistState(
        [
          {
            platformId,
            entrypointId: null,
            success: true,
            reason,
            scope: aggregateSyncScope(successResults)
          }
        ],
        refreshedData
      );
    }

    return {
      platformId,
      entrypointId: null,
      scope: aggregateSyncScope(successResults),
      status: successResults.length === results.length ? 'success' : 'partial',
      results,
      data: refreshedData.platforms[platformId],
      pushResult
    };
  }

  const entrypoint =
    platform.syncEntrypoints.find(candidate => candidate.id === entrypointId) ||
    platform.syncEntrypoints.find(candidate => candidate.id === platform.defaultSyncEntrypointId) ||
    platform.syncEntrypoints[0];

  if (!entrypoint) {
    throw new Error(`${platform.displayName}没有可用的同步入口。`);
  }

  const tab = await openOrActivateTargetTab(entrypoint.url, entrypoint.urlPrefix);
  await waitForTabReady(tab.id, entrypoint.urlPrefix);

  const latestTab = await BrowserApi.tabs.get(tab.id);
  if (!latestTab.url?.startsWith(entrypoint.urlPrefix)) {
    throw new Error(`${platform.displayName}页面未进入目标后台，可能尚未登录。`);
  }

  return syncPlatformInTab({
    platformId,
    entrypointId: entrypoint.id,
    tabId: tab.id,
    reason,
    skipPush
  });
}

async function syncAllEnabledPlatforms(reason) {
  const data = await StorageManager.getAllData();
  const platformIds = data.settings.enabledPlatformIds.filter(platformId =>
    data.settings.syncEnabledPlatformIds.includes(platformId)
  );
  const results = [];

  for (const platformId of platformIds) {
    try {
      const result = await openAndSyncPlatform({
        platformId,
        reason,
        skipPush: true
      });

      results.push({
        platformId,
        entrypointId: result.entrypointId,
        scope: result.scope || null,
        status: result.status || 'success',
        success: true
      });
    } catch (error) {
      results.push({
        platformId,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const refreshedData = await StorageManager.getAllData();
  const pushResult = await pushSnapshotAndPersistState(results, refreshedData);

  return {
    results,
    pushResult
  };
}

async function openOrActivateTargetTab(targetUrl, urlPrefix) {
  const tabs = await BrowserApi.tabs.query({ lastFocusedWindow: true });
  const existingTab = tabs.find(
    tab => tab.url?.startsWith(urlPrefix) || tab.pendingUrl?.startsWith(urlPrefix)
  );

  if (existingTab) {
    await BrowserApi.tabs.update(existingTab.id, { active: true });

    if (existingTab.url === targetUrl) {
      await BrowserApi.tabs.reload(existingTab.id);
    } else {
      await BrowserApi.tabs.update(existingTab.id, { url: targetUrl });
    }

    return BrowserApi.tabs.get(existingTab.id);
  }

  return BrowserApi.tabs.create({
    url: targetUrl,
    active: true
  });
}

function waitForTabReady(tabId, urlPrefix, options = OPEN_SYNC_OPTIONS) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let timeout = null;

    const finish = callback => {
      if (timeout) {
        clearInterval(timeout);
      }
      BrowserApi.tabs.onUpdated.removeListener(handleUpdated);
      callback();
    };

    const handleUpdated = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId !== tabId) {
        return;
      }

      if (!tab.url?.startsWith(urlPrefix) && !tab.pendingUrl?.startsWith(urlPrefix)) {
        if (changeInfo.status === 'complete') {
          finish(() => reject(new Error('页面未进入目标后台，可能尚未登录。')));
        }
        return;
      }

      if (changeInfo.status === 'complete') {
        finish(resolve);
      }
    };

    BrowserApi.tabs.onUpdated.addListener(handleUpdated);

    BrowserApi.tabs
      .get(tabId)
      .then(tab => {
        if (tab.status === 'complete' && tab.url?.startsWith(urlPrefix)) {
          finish(resolve);
          return;
        }

        timeout = setInterval(() => {
          if (Date.now() - startedAt < options.tabLoadTimeoutMs) {
            return;
          }

          finish(() => reject(new Error('页面加载超时，请稍后重试。')));
        }, 250);
      })
      .catch(error => {
        finish(() => reject(error));
      });
  });
}

async function sendMessageWithRetry(tabId, message, options = OPEN_SYNC_OPTIONS) {
  let lastError = null;

  for (let attempt = 0; attempt < options.messageRetryCount; attempt += 1) {
    try {
      return await BrowserApi.tabs.sendMessage(tabId, message);
    } catch (error) {
      lastError = error;
      const rawMessage = String(error?.message || '');
      const shouldRetry =
        rawMessage.includes('Receiving end does not exist') ||
        rawMessage.includes('Could not establish connection');

      if (!shouldRetry || attempt === options.messageRetryCount - 1) {
        break;
      }

      await delay(options.messageRetryDelayMs);
    }
  }

  throw lastError || new Error('页面脚本尚未准备完成。');
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isAllowedExternalSender(senderUrl, endpoint) {
  if (!senderUrl) {
    return false;
  }

  try {
    const sender = new URL(senderUrl);
    const target = new URL(endpoint || 'http://127.0.0.1:8765');
    return (
      ['127.0.0.1', 'localhost'].includes(sender.hostname) &&
      sender.port === target.port &&
      ['http:', 'https:'].includes(sender.protocol)
    );
  } catch {
    return false;
  }
}

console.log('AllFans: background script loaded');
