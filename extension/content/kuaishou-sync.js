(function() {
  'use strict';

  const MESSAGE_TYPES = {
    DATA_EXTRACTED: 'DATA_EXTRACTED',
    SYNC_PLATFORM: 'SYNC_PLATFORM'
  };

  const BRIDGE_SOURCE = 'allfans-kuaishou-bridge';
  const BRIDGE_EVENT_TYPE = 'ALLFANS_KUAISHOU_PHOTO_LIST_RESPONSE';
  const BRIDGE_ACCOUNT_EVENT_TYPE = 'ALLFANS_KUAISHOU_HOME_INFO_RESPONSE';
  const BRIDGE_FETCH_REQUEST_TYPE = 'ALLFANS_KUAISHOU_FETCH_PAGE_REQUEST';
  const BRIDGE_FETCH_RESPONSE_TYPE = 'ALLFANS_KUAISHOU_FETCH_PAGE_RESPONSE';
  const BRIDGE_ACCOUNT_FETCH_REQUEST_TYPE = 'ALLFANS_KUAISHOU_FETCH_ACCOUNT_REQUEST';
  const BRIDGE_ACCOUNT_FETCH_RESPONSE_TYPE = 'ALLFANS_KUAISHOU_FETCH_ACCOUNT_RESPONSE';
  const PLATFORM = 'kuaishou';
  const PHOTO_LIST_URL = 'https://cp.kuaishou.com/rest/cp/works/v2/video/pc/photo/list';
  const WAIT_OPTIONS = {
    pageReadyTimeoutMs: 60000,
    pageReadyIntervalMs: 1000,
    photoListRequestTimeoutMs: 60000,
    homeInfoSnapshotTimeoutMs: 10000,
    settleDelayMs: 1500,
    pageDelayMs: 200,
    maxPages: 50
  };

  let bridgeBound = false;
  let pendingSnapshot = null;
  let pendingAccountSnapshot = null;
  let activeScanPromise = null;
  let bridgeReadyPromise = null;
  let bridgeRequestId = 0;
  const pendingBridgeRequests = new Map();

  function getRuntime() {
    return globalThis.browser || globalThis.chrome;
  }

  function getMetricsModule() {
    const metrics = globalThis.AllFansKuaishouMetrics;
    if (!metrics) {
      throw new Error('AllFansKuaishouMetrics is not available');
    }
    return metrics;
  }

  function isManagePage() {
    return window.location.pathname.startsWith('/article/manage/video');
  }

  function getKuaishouPageRole() {
    if (window.location.hostname !== 'cp.kuaishou.com') {
      return null;
    }

    return isManagePage() ? 'content' : 'account';
  }

  function isSupportedKuaishouPage() {
    return Boolean(getKuaishouPageRole());
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function installBridgeScript() {
    if (bridgeReadyPromise) {
      return bridgeReadyPromise;
    }

    const runtime = getRuntime();
    const existing = document.getElementById('allfans-kuaishou-bridge');
    if (existing?.dataset.ready === 'true') {
      return Promise.resolve();
    }

    bridgeReadyPromise = new Promise((resolve, reject) => {
      const script = existing || document.createElement('script');

      const handleLoad = () => {
        script.dataset.ready = 'true';
        resolve();
      };

      const handleError = () => {
        bridgeReadyPromise = null;
        reject(new Error('Failed to load Kuaishou bridge script'));
      };

      script.addEventListener('load', handleLoad, { once: true });
      script.addEventListener('error', handleError, { once: true });

      if (!existing) {
        script.id = 'allfans-kuaishou-bridge';
        script.src = runtime.runtime.getURL('content/kuaishou-bridge.js');
        script.async = false;
        (document.documentElement || document.head || document.body).appendChild(script);
        return;
      }

      if (script.dataset.ready === 'true') {
        handleLoad();
      }
    });

    return bridgeReadyPromise;
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

      if (
        payload.type === BRIDGE_FETCH_RESPONSE_TYPE ||
        payload.type === BRIDGE_ACCOUNT_FETCH_RESPONSE_TYPE
      ) {
        const requestState = pendingBridgeRequests.get(payload.requestId);
        if (!requestState) {
          return;
        }

        clearTimeout(requestState.timeoutId);
        pendingBridgeRequests.delete(payload.requestId);

        if (payload.error) {
          requestState.reject(new Error(payload.error));
          return;
        }

        if (payload.ok === false) {
          requestState.reject(
            new Error(`Kuaishou bridge request failed with status ${payload.status}`)
          );
          return;
        }

        const isPhotoListResponse = payload.type === BRIDGE_FETCH_RESPONSE_TYPE;
        const isUsable = isPhotoListResponse
          ? metrics.hasUsablePhotoListResponse(payload.payload)
          : metrics.hasUsableHomeInfoResponse(payload.payload);

        if (!isUsable) {
          requestState.reject(
            new Error(
              isPhotoListResponse
                ? 'Kuaishou photo list payload was not usable'
                : 'Kuaishou home info payload was not usable'
            )
          );
          return;
        }

        requestState.resolve({
          url: payload.url,
          response: payload.payload
        });
        return;
      }

      if (payload.type === BRIDGE_ACCOUNT_EVENT_TYPE) {
        if (!metrics.isHomeInfoResponseUrl(payload.url)) {
          return;
        }

        if (!metrics.hasUsableHomeInfoResponse(payload.payload)) {
          return;
        }

        pendingAccountSnapshot = {
          url: payload.url,
          response: payload.payload
        };
        return;
      }

      if (payload.type !== BRIDGE_EVENT_TYPE) {
        return;
      }

      if (!metrics.isPhotoListResponseUrl(payload.url)) {
        return;
      }

      if (!metrics.hasUsablePhotoListResponse(payload.payload)) {
        return;
      }

      pendingSnapshot = {
        url: payload.url,
        response: payload.payload
      };
    });

    bridgeBound = true;
  }

  async function prepareKuaishouBridge() {
    if (!isSupportedKuaishouPage()) {
      return;
    }

    const metrics = getMetricsModule();
    await installBridgeScript();
    bindBridgeListener(metrics);
  }

  function isDocumentReady() {
    return document.readyState === 'complete' && Boolean(document.body);
  }

  async function waitForKuaishouPageSettled() {
    const startedAt = Date.now();

    while (Date.now() - startedAt < WAIT_OPTIONS.pageReadyTimeoutMs) {
      if (!isSupportedKuaishouPage()) {
        throw new Error('请先打开快手创作者后台页面。');
      }

      if (isDocumentReady()) {
        await delay(WAIT_OPTIONS.settleDelayMs);
        return;
      }

      await delay(WAIT_OPTIONS.pageReadyIntervalMs);
    }

    throw new Error('快手创作者页面加载超时，请稍后再试。');
  }

  function requestPhotoListPageFromBridge(url) {
    return new Promise((resolve, reject) => {
      const requestId = `kuaishou-page-${Date.now()}-${bridgeRequestId++}`;
      const timeoutId = setTimeout(() => {
        pendingBridgeRequests.delete(requestId);
        reject(new Error('Kuaishou bridge request timed out'));
      }, WAIT_OPTIONS.photoListRequestTimeoutMs);

      pendingBridgeRequests.set(requestId, {
        resolve,
        reject,
        timeoutId
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

  function requestHomeInfoFromBridge() {
    return new Promise((resolve, reject) => {
      const requestId = `kuaishou-account-${Date.now()}-${bridgeRequestId++}`;
      const timeoutId = setTimeout(() => {
        pendingBridgeRequests.delete(requestId);
        reject(new Error('Kuaishou account bridge request timed out'));
      }, WAIT_OPTIONS.photoListRequestTimeoutMs);

      pendingBridgeRequests.set(requestId, {
        resolve,
        reject,
        timeoutId
      });

      window.postMessage(
        {
          source: BRIDGE_SOURCE,
          type: BRIDGE_ACCOUNT_FETCH_REQUEST_TYPE,
          requestId
        },
        '*'
      );
    });
  }

  async function fetchPhotoListPage(url) {
    const snapshot = await requestPhotoListPageFromBridge(url);
    return snapshot.response;
  }

  async function collectAccountInfo(metrics, timestamp) {
    if (!metrics.hasReusableHomeInfoSnapshot(pendingAccountSnapshot)) {
      pendingAccountSnapshot = await waitForHomeInfoSnapshot(metrics) || pendingAccountSnapshot;
    }

    if (!metrics.hasReusableHomeInfoSnapshot(pendingAccountSnapshot)) {
      try {
        pendingAccountSnapshot = await requestHomeInfoFromBridge();
      } catch (error) {
        console.warn('AllFans: failed to request Kuaishou account info from page context', error);
      }
    }

    if (!metrics.hasReusableHomeInfoSnapshot(pendingAccountSnapshot)) {
      return null;
    }

    return metrics.buildAccountPlatformPatch(pendingAccountSnapshot.response, {
      updateSource: pendingAccountSnapshot.url,
      timestamp
    });
  }

  function getKnownPhotoListUrls(metrics) {
    return Array.from(
      new Set(
        performance
          .getEntriesByType('resource')
          .map(entry => entry.name)
          .filter(url => metrics.isPhotoListResponseUrl(url))
      )
    );
  }

  async function waitForPhotoListRequestUrl(metrics) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < WAIT_OPTIONS.photoListRequestTimeoutMs) {
      const [firstUrl] = getKnownPhotoListUrls(metrics);
      if (firstUrl) {
        return firstUrl;
      }

      await delay(WAIT_OPTIONS.pageReadyIntervalMs);
    }

    return null;
  }

  async function waitForPhotoListSnapshot(metrics) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < WAIT_OPTIONS.photoListRequestTimeoutMs) {
      if (metrics.hasReusablePhotoListSnapshot(pendingSnapshot)) {
        return pendingSnapshot;
      }

      await delay(WAIT_OPTIONS.pageReadyIntervalMs);
    }

    return null;
  }

  async function waitForHomeInfoSnapshot(metrics) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < WAIT_OPTIONS.homeInfoSnapshotTimeoutMs) {
      if (metrics.hasReusableHomeInfoSnapshot(pendingAccountSnapshot)) {
        return pendingAccountSnapshot;
      }

      await delay(WAIT_OPTIONS.pageReadyIntervalMs);
    }

    return null;
  }

  async function collectAllPhotoListData(metrics) {
    const firstSnapshot = await waitForPhotoListSnapshot(metrics);
    let state = firstSnapshot
      ? metrics.mergeContentResponse(metrics.createContentScanState(), firstSnapshot.response)
      : metrics.createContentScanState();
    let requestUrl = firstSnapshot?.url || (await waitForPhotoListRequestUrl(metrics)) || PHOTO_LIST_URL;
    let currentCursor = firstSnapshot?.response?.data?.nextCursor || firstSnapshot?.response?.data?.cursor || null;
    let pageCount = 0;

    while (pageCount < WAIT_OPTIONS.maxPages) {
      if (state.total > 0 && state.scannedItemCount >= state.total) {
        break;
      }

      const url = currentCursor
        ? metrics.buildNextPhotoListUrl(requestUrl, currentCursor)
        : requestUrl;

      let response;
      try {
        response = await fetchPhotoListPage(url);
      } catch (error) {
        if (state.responseCount > 0) {
          console.warn('AllFans: failed to fetch Kuaishou pagination, keeping partial data', error);
          break;
        }
        throw error;
      }

      if (!metrics.hasUsablePhotoListResponse(response)) {
        break;
      }

      const previousCount = state.scannedItemCount;
      state = metrics.mergeContentResponse(state, response);

      if (state.scannedItemCount === previousCount) {
        break;
      }

      if (state.total > 0 && state.scannedItemCount >= state.total) {
        break;
      }

      currentCursor = response?.data?.nextCursor || response?.data?.cursor;
      if (!currentCursor) {
        break;
      }

      pageCount += 1;
      await delay(WAIT_OPTIONS.pageDelayMs);
    }

    return state;
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
          console.warn('AllFans: 快手数据存储失败', lastError.message);
        }
      }
    );
  }

  async function performKuaishouScan() {
    const pageRole = getKuaishouPageRole();
    if (!pageRole) {
      throw new Error('请先打开快手创作者后台页面。');
    }

    const metrics = getMetricsModule();
    await installBridgeScript();
    bindBridgeListener(metrics);
    if (!metrics.hasReusablePhotoListSnapshot(pendingSnapshot)) {
      pendingSnapshot = null;
    }
    if (!metrics.hasReusableHomeInfoSnapshot(pendingAccountSnapshot)) {
      pendingAccountSnapshot = null;
    }

    await waitForKuaishouPageSettled();

    const timestamp = new Date().toISOString();
    const data = {
      platform: PLATFORM,
      updateSource: window.location.href,
      lastUpdate: timestamp
    };
    let syncScope = 'none';

    try {
      const accountPatch = await collectAccountInfo(metrics, timestamp);
      if (accountPatch && metrics.hasSufficientKuaishouAccountData(accountPatch)) {
        Object.assign(data, accountPatch);
        syncScope = 'account';
      }
    } catch (error) {
      console.warn('AllFans: failed to refresh Kuaishou account info', error);
    }

    if (pageRole === 'account') {
      if (syncScope === 'account') {
        return { data, scope: 'account' };
      }

      return null;
    }

    try {
      const state = await collectAllPhotoListData(metrics);
      const contentPatch = metrics.buildContentPlatformPatch(state, {
        updateSource: window.location.href,
        timestamp
      });

      if (metrics.hasSufficientKuaishouData(contentPatch)) {
        if (!data.displayName) {
          Object.assign(data, contentPatch);
        } else {
          delete contentPatch.displayName;
          Object.assign(data, contentPatch);
        }
        syncScope = syncScope === 'account' ? 'both' : 'content';
      }
    } catch (error) {
      if (syncScope === 'none') {
        throw error;
      }
      console.warn('AllFans: failed to refresh Kuaishou content data, keeping account data', error);
    }

    if (syncScope === 'none') {
      return null;
    }

    return { data, scope: syncScope };
  }

  async function runKuaishouScan(reason = 'passive') {
    if (activeScanPromise) {
      return activeScanPromise;
    }

    activeScanPromise = performKuaishouScan()
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

    runKuaishouScan(message.reason || 'manual')
      .then(result => {
        if (!result?.data) {
          sendResponse({
            success: false,
            error: '快手数据暂未准备完成，请等待页面加载后再试。'
          });
          return;
        }

        sendResponse({ success: true, data: result.data, scope: result.scope });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message || '快手数据刷新失败。' });
      });

    return true;
  });

  async function init() {
    if (!isSupportedKuaishouPage()) {
      return;
    }

    await prepareKuaishouBridge();

    try {
      await runKuaishouScan('passive');
    } catch (error) {
      console.warn('AllFans: 快手初始扫描跳过', error);
    }
  }

  prepareKuaishouBridge().catch(error => {
    console.warn('AllFans: failed to prepare Kuaishou bridge before page load', error);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
