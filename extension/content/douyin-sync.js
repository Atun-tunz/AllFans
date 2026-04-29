// AllFans Douyin data aggregator (runtime v2)

(function() {
  'use strict';

  const MESSAGE_TYPES = {
    DATA_EXTRACTED: 'DATA_EXTRACTED',
    SYNC_PLATFORM: 'SYNC_PLATFORM'
  };

  const BRIDGE_SOURCE = 'allfans-douyin-bridge';
  const BRIDGE_EVENT_TYPE = 'ALLFANS_DOUYIN_WORK_LIST_RESPONSE';
  const BRIDGE_FETCH_REQUEST_TYPE = 'ALLFANS_DOUYIN_FETCH_PAGE_REQUEST';
  const BRIDGE_FETCH_RESPONSE_TYPE = 'ALLFANS_DOUYIN_FETCH_PAGE_RESPONSE';
  const PLATFORM = 'douyin';
  const HOME_PATH_PREFIX = '/creator-micro/home';
  const MANAGE_PATH_PREFIX = '/creator-micro/content/manage';
  const ACCOUNT_INFO_URL = 'https://creator.douyin.com/web/api/media/user/info/';
  const WAIT_OPTIONS = {
    timeoutMs: 60000,
    intervalMs: 300,
    maxPages: 50
  };

  let bridgeBound = false;
  let pendingSnapshot = null;
  const pendingBridgeRequests = new Map();
  let activeScanPromise = null;

  function getRuntime() {
    return globalThis.browser || globalThis.chrome;
  }

  function getMetricsModule() {
    const metrics = globalThis.AllFansDouyinMetrics;
    if (!metrics) {
      throw new Error('AllFansDouyinMetrics is not available');
    }

    return metrics;
  }

  function isHomePage() {
    return window.location.pathname.startsWith(HOME_PATH_PREFIX);
  }

  function isManagePage() {
    return window.location.pathname.startsWith(MANAGE_PATH_PREFIX);
  }

  function isSupportedDouyinPage() {
    return window.location.hostname === 'creator.douyin.com' && (isHomePage() || isManagePage());
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function installBridgeScript() {
    const existing = document.getElementById('allfans-douyin-bridge');
    if (existing) {
      existing.remove();
    }

    if (!(document.documentElement || document.head || document.body)) {
      return;
    }

    const runtime = getRuntime();
    const script = document.createElement('script');
    script.id = 'allfans-douyin-bridge';
    script.src = runtime.runtime.getURL('content/douyin-bridge.js');
    script.async = false;
    (document.documentElement || document.head || document.body).appendChild(script);
  }

  function bindBridgeListener(metrics) {
    if (bridgeBound) {
      return;
    }

    window.addEventListener('message', event => {
      const payload = event.data;
      if (event.source !== window || payload?.source !== BRIDGE_SOURCE) {
        return;
      }

      if (payload.type === BRIDGE_FETCH_RESPONSE_TYPE) {
        const pending = pendingBridgeRequests.get(payload.requestId);
        if (!pending) {
          return;
        }

        pendingBridgeRequests.delete(payload.requestId);
        if (!payload.ok) {
          pending.reject(new Error(payload.error || `Douyin work_list request failed with status ${payload.status}`));
          return;
        }

        pending.resolve({
          url: payload.url,
          response: payload.payload
        });
        return;
      }

      if (payload.type !== BRIDGE_EVENT_TYPE) {
        return;
      }

      if (!metrics.isWorkListResponseUrl(payload.url)) {
        return;
      }

      pendingSnapshot = {
        url: payload.url,
        response: payload.payload
      };
    });

    bridgeBound = true;
  }

  function requestWorkListFromBridge(url) {
    const requestId = `douyin-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingBridgeRequests.delete(requestId);
        reject(new Error('Douyin bridge request timed out'));
      }, WAIT_OPTIONS.timeoutMs);

      pendingBridgeRequests.set(requestId, {
        resolve(value) {
          clearTimeout(timeout);
          resolve(value);
        },
        reject(error) {
          clearTimeout(timeout);
          reject(error);
        }
      });

      window.postMessage(
        {
          source: BRIDGE_SOURCE,
          type: BRIDGE_FETCH_REQUEST_TYPE,
          requestId,
          url
        },
        '*'
      );
    });
  }

  function getKnownWorkListUrls(metrics) {
    return Array.from(
      new Set(
        performance
          .getEntriesByType('resource')
          .map(entry => entry.name)
          .filter(url => metrics.isWorkListResponseUrl(url))
      )
    );
  }

  async function seedFromKnownRequests(metrics) {
    if (metrics.hasReusableWorkListSnapshot(pendingSnapshot)) {
      return;
    }

    const urls = getKnownWorkListUrls(metrics);

    for (const url of urls) {
      try {
        const payload = await fetchWorkListPage(url);
        if (!metrics.hasUsableWorkListResponse(payload)) {
          continue;
        }

        pendingSnapshot = {
          url,
          response: payload
        };
        return;
      } catch (error) {
        try {
          const snapshot = await requestWorkListFromBridge(url);
          if (!metrics.hasUsableWorkListResponse(snapshot.response)) {
            continue;
          }

          pendingSnapshot = snapshot;
          return;
        } catch (bridgeError) {
          console.warn('AllFans: failed to seed Douyin work list request', bridgeError || error);
        }
      }
    }
  }

  async function waitForWorkListSnapshot(metrics) {
    const startedAt = Date.now();
    let bridgeReinstalled = false;

    while (Date.now() - startedAt < WAIT_OPTIONS.timeoutMs) {
      if (metrics.hasReusableWorkListSnapshot(pendingSnapshot)) {
        return pendingSnapshot;
      }

      if (!bridgeReinstalled && Date.now() - startedAt > WAIT_OPTIONS.timeoutMs / 2) {
        installBridgeScript();
        bridgeReinstalled = true;
      }

      await delay(WAIT_OPTIONS.intervalMs);
    }

    return null;
  }

  async function fetchWorkListPage(url) {
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`Douyin work_list request failed with status ${response.status}`);
    }

    return response.json();
  }

  async function collectAllWorkListData(metrics) {
    await seedFromKnownRequests(metrics);

    const firstSnapshot = await waitForWorkListSnapshot(metrics);
    if (!firstSnapshot) {
      return null;
    }

    let state = metrics.mergeContentResponse(
      metrics.createContentScanState(),
      firstSnapshot.response
    );
    let requestUrl = firstSnapshot.url;
    let currentCursor = String(firstSnapshot.response?.max_cursor ?? '');

    for (let page = 0; page < WAIT_OPTIONS.maxPages; page += 1) {
      if (state.total > 0 && state.scannedItemCount >= state.total) {
        break;
      }

      if (!currentCursor || currentCursor === '0') {
        break;
      }

      const nextUrl = metrics.buildNextWorkListUrl(requestUrl, currentCursor);
      let nextResponse;
      try {
        nextResponse = await fetchWorkListPage(nextUrl);
      } catch (error) {
        const nextSnapshot = await requestWorkListFromBridge(nextUrl);
        nextResponse = nextSnapshot.response;
      }
      const previousCount = state.scannedItemCount;

      state = metrics.mergeContentResponse(state, nextResponse);

      const nextCursorValue = String(nextResponse?.max_cursor ?? '');
      if (
        state.scannedItemCount === previousCount ||
        !nextCursorValue ||
        nextCursorValue === currentCursor
      ) {
        break;
      }

      requestUrl = nextUrl;
      currentCursor = nextCursorValue;
    }

    return state;
  }

  async function fetchAccountInfo(metrics, timestamp) {
    const response = await fetch(ACCOUNT_INFO_URL, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`Douyin account info request failed with status ${response.status}`);
    }

    const payload = await response.json();
    return metrics.buildAccountPlatformPatch(payload, {
      updateSource: ACCOUNT_INFO_URL,
      timestamp
    });
  }

  function sendDataToBackground(data, reason) {
    const runtime = getRuntime();
    runtime.runtime.sendMessage(
      {
        type: MESSAGE_TYPES.DATA_EXTRACTED,
        platformId: PLATFORM,
        data,
        reason
      },
      () => {
        const lastError = runtime.runtime.lastError;
        if (lastError) {
          console.warn('AllFans: failed to store Douyin data', lastError.message);
        }
      }
    );
  }

  async function performDouyinScan() {
    if (!isSupportedDouyinPage()) {
      throw new Error('请先打开抖音创作者中心首页或作品管理页。');
    }

    const metrics = getMetricsModule();
    const timestamp = new Date().toISOString();
    const data = {
      platform: PLATFORM,
      updateSource: window.location.href
    };
    let syncScope = 'none';
    const failures = [];

    try {
      const accountPatch = await fetchAccountInfo(metrics, timestamp);
      if (metrics.hasSufficientDouyinAccountData(accountPatch)) {
        Object.assign(data, accountPatch);
        syncScope = 'account';
      }
    } catch (error) {
      failures.push(`account: ${error?.message || error}`);
      console.warn('AllFans: failed to refresh Douyin account info', error);
    }

    if (isManagePage()) {
      if (!metrics.hasReusableWorkListSnapshot(pendingSnapshot)) {
        pendingSnapshot = null;
      }
      installBridgeScript();
      bindBridgeListener(metrics);

      const state = await collectAllWorkListData(metrics);
      if (state) {
        Object.assign(
          data,
          metrics.buildContentPlatformPatch(state, {
            updateSource: window.location.href,
            timestamp
          })
        );
        syncScope = syncScope === 'account' ? 'both' : 'content';
      } else {
        failures.push('content: work_list snapshot was not captured before timeout');
      }
    }

    if (syncScope === 'none') {
      if (failures.length > 0) {
        throw new Error(`Douyin sync produced no usable data (${failures.join('; ')})`);
      }
      return null;
    }

    return {
      data,
      scope: syncScope
    };
  }

  async function runDouyinScan(reason = 'passive') {
    if (activeScanPromise) {
      return activeScanPromise;
    }

    activeScanPromise = performDouyinScan()
      .then(result => {
        if (reason === 'passive' && result?.data) {
          sendDataToBackground(result.data, reason);
        }

        return result;
      })
      .finally(() => {
        activeScanPromise = null;
      });

    return activeScanPromise;
  }

  getRuntime().runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== MESSAGE_TYPES.SYNC_PLATFORM || message?.platformId !== PLATFORM) {
      return false;
    }

    runDouyinScan(message.reason || 'manual')
      .then(result => {
        if (!result?.data) {
          sendResponse({
            success: false,
            error: '抖音数据暂未准备完成，请等待页面加载后再试。'
          });
          return;
        }

        sendResponse({ success: true, data: result.data, scope: result.scope });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message || '抖音数据刷新失败。' });
      });

    return true;
  });

  async function init() {
    if (!isSupportedDouyinPage()) {
      return;
    }

    if (isManagePage()) {
      installBridgeScript();
      bindBridgeListener(getMetricsModule());
    }

    try {
      await runDouyinScan('passive');
    } catch (error) {
      console.warn('AllFans: initial Douyin scan skipped', error);
    }
  }

  init();
})();
