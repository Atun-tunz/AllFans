// AllFans Xiaohongshu data aggregator

(function() {
  'use strict';

  const MESSAGE_TYPES = {
    DATA_EXTRACTED: 'DATA_EXTRACTED',
    SYNC_PLATFORM: 'SYNC_PLATFORM'
  };

  const BRIDGE_SOURCE = 'allfans-xiaohongshu-bridge';
  const BRIDGE_EVENT_TYPE = 'ALLFANS_XIAOHONGSHU_POSTED_RESPONSE';
  const BRIDGE_ACCOUNT_EVENT_TYPE = 'ALLFANS_XIAOHONGSHU_PERSONAL_INFO_RESPONSE';
  const BRIDGE_FETCH_REQUEST_TYPE = 'ALLFANS_XIAOHONGSHU_FETCH_PAGE_REQUEST';
  const BRIDGE_FETCH_RESPONSE_TYPE = 'ALLFANS_XIAOHONGSHU_FETCH_PAGE_RESPONSE';
  const BRIDGE_ACCOUNT_FETCH_REQUEST_TYPE = 'ALLFANS_XIAOHONGSHU_FETCH_ACCOUNT_REQUEST';
  const BRIDGE_ACCOUNT_FETCH_RESPONSE_TYPE = 'ALLFANS_XIAOHONGSHU_FETCH_ACCOUNT_RESPONSE';
  const PLATFORM = 'xiaohongshu';
  const HOME_PATH_PREFIX = '/new/home';
  const NOTE_MANAGER_PATH_PREFIX = '/new/note-manager';
  const WAIT_OPTIONS = {
    timeoutMs: 30000,
    intervalMs: 300,
    maxPages: 200
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
    const metrics = globalThis.AllFansXiaohongshuMetrics;
    if (!metrics) {
      throw new Error('AllFansXiaohongshuMetrics is not available');
    }

    return metrics;
  }

  function isHomePage() {
    return window.location.pathname.startsWith(HOME_PATH_PREFIX);
  }

  function isManagePage() {
    return window.location.pathname.startsWith(NOTE_MANAGER_PATH_PREFIX);
  }

  function isSupportedXiaohongshuPage() {
    return window.location.hostname === 'creator.xiaohongshu.com' && (isHomePage() || isManagePage());
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function installBridgeScript() {
    if (bridgeReadyPromise) {
      return bridgeReadyPromise;
    }

    const runtime = getRuntime();
    const existing = document.getElementById('allfans-xiaohongshu-bridge');
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
        reject(new Error('Failed to load Xiaohongshu bridge script'));
      };

      script.addEventListener('load', handleLoad, { once: true });
      script.addEventListener('error', handleError, { once: true });

      if (!existing) {
        script.id = 'allfans-xiaohongshu-bridge';
        script.src = runtime.runtime.getURL('content/xiaohongshu-bridge.js');
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

      if (payload.type !== BRIDGE_EVENT_TYPE && payload.type !== BRIDGE_ACCOUNT_EVENT_TYPE) {
        if (
          payload.type !== BRIDGE_FETCH_RESPONSE_TYPE &&
          payload.type !== BRIDGE_ACCOUNT_FETCH_RESPONSE_TYPE
        ) {
          return;
        }

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
            new Error(`Xiaohongshu posted request failed with status ${payload.status}`)
          );
          return;
        }

        const isPostedResponse = payload.type === BRIDGE_FETCH_RESPONSE_TYPE;
        const isUsable = isPostedResponse
          ? metrics.hasUsablePostedResponse(payload.payload)
          : metrics.hasUsablePersonalInfoResponse(payload.payload);
        if (!isUsable) {
          requestState.reject(
            new Error(
              isPostedResponse
                ? 'Xiaohongshu posted payload was not usable'
                : 'Xiaohongshu personal info payload was not usable'
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

      if (payload.type === BRIDGE_EVENT_TYPE) {
        if (!metrics.isPrimaryPostedNotesResponseUrl(payload.url)) {
          return;
        }

        if (!metrics.hasUsablePostedResponse(payload.payload)) {
          return;
        }

        pendingSnapshot = {
          url: payload.url,
          response: payload.payload
        };
        return;
      }

      if (!metrics.isPersonalInfoResponseUrl(payload.url)) {
        return;
      }

      if (!metrics.hasUsablePersonalInfoResponse(payload.payload)) {
        return;
      }

      pendingAccountSnapshot = {
        url: payload.url,
        response: payload.payload
      };
    });

    bridgeBound = true;
  }

  async function seedFromKnownRequests(metrics) {
    if (pendingSnapshot?.url && metrics.isPrimaryPostedNotesResponseUrl(pendingSnapshot.url)) {
      return;
    }

    try {
      pendingSnapshot = await requestPostedNotesPageFromBridge(0, 0);
    } catch (error) {
      console.warn('AllFans: failed to request Xiaohongshu first page from page context', error);
    }
  }

  async function seedAccountInfoRequest(metrics) {
    if (pendingAccountSnapshot?.url && metrics.isPersonalInfoResponseUrl(pendingAccountSnapshot.url)) {
      return;
    }

    try {
      pendingAccountSnapshot = await requestPersonalInfoFromBridge();
    } catch (error) {
      console.warn('AllFans: failed to request Xiaohongshu account info from page context', error);
    }
  }

  async function waitForPostedSnapshot(metrics) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < WAIT_OPTIONS.timeoutMs) {
      if (metrics.hasUsablePostedResponse(pendingSnapshot?.response)) {
        return pendingSnapshot;
      }

      await delay(WAIT_OPTIONS.intervalMs);
    }

    return null;
  }

  async function waitForPersonalInfoSnapshot(metrics) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < WAIT_OPTIONS.timeoutMs) {
      if (metrics.hasUsablePersonalInfoResponse(pendingAccountSnapshot?.response)) {
        return pendingAccountSnapshot;
      }

      await delay(WAIT_OPTIONS.intervalMs);
    }

    return null;
  }

  function requestPostedNotesPageFromBridge(page, tab = 0) {
    return new Promise((resolve, reject) => {
      const requestId = `xhs-page-${Date.now()}-${bridgeRequestId++}`;
      const timeoutId = setTimeout(() => {
        pendingBridgeRequests.delete(requestId);
        reject(new Error('Xiaohongshu bridge request timed out'));
      }, WAIT_OPTIONS.timeoutMs);

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
          page,
          tab
        },
        '*'
      );
    });
  }

  function requestPersonalInfoFromBridge() {
    return new Promise((resolve, reject) => {
      const requestId = `xhs-account-${Date.now()}-${bridgeRequestId++}`;
      const timeoutId = setTimeout(() => {
        pendingBridgeRequests.delete(requestId);
        reject(new Error('Xiaohongshu account bridge request timed out'));
      }, WAIT_OPTIONS.timeoutMs);

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

  async function fetchPostedNotesPage(url, metrics) {
    const snapshot = await requestPostedNotesPageFromBridge(
      metrics.getPageFromUrl(url),
      metrics.getTabFromUrl(url)
    );
    return snapshot.response;
  }

  async function collectAllPostedNotes(metrics) {
    await seedFromKnownRequests(metrics);

    const firstSnapshot = await waitForPostedSnapshot(metrics);
    if (!firstSnapshot?.url) {
      return null;
    }

    const baseUrl = firstSnapshot.url;
    const firstPage = metrics.getPageFromUrl(firstSnapshot.url);
    let state = metrics.mergeContentResponse(metrics.createContentScanState(), firstSnapshot.response);
    let page = firstPage + 1;

    while (page < WAIT_OPTIONS.maxPages) {
      if (state.total > 0 && state.scannedItemCount >= state.total) {
        break;
      }

      const pageUrl = metrics.buildNextPostedNotesUrl(baseUrl, page);
      let response;

      try {
        response = await fetchPostedNotesPage(pageUrl, metrics);
      } catch (error) {
        console.warn('AllFans: failed to fetch Xiaohongshu pagination, keeping partial data', error);
        break;
      }

      const previousCount = state.scannedItemCount;
      state = metrics.mergeContentResponse(state, response);

      const items = metrics.getResponseItems(response);
      if (items.length === 0 || state.scannedItemCount === previousCount) {
        break;
      }

      page += 1;
    }

    return state;
  }

  async function collectAccountInfo(metrics, timestamp) {
    await seedAccountInfoRequest(metrics);

    const snapshot = await waitForPersonalInfoSnapshot(metrics);
    if (!snapshot?.url) {
      return null;
    }

    return metrics.buildAccountPlatformPatch(snapshot.response, {
      updateSource: snapshot.url,
      timestamp
    });
  }

  function getDisplayName() {
    const title = String(document.title || '').trim();
    return title.replace(/\s*-\s*小红书创作服务平台\s*$/, '').trim();
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
          console.warn('AllFans: failed to store Xiaohongshu data', lastError.message);
        }
      }
    );
  }

  async function performXiaohongshuScan() {
    if (!isSupportedXiaohongshuPage()) {
      throw new Error('请先打开小红书创作服务平台作品管理页。');
    }

    const metrics = getMetricsModule();
    const timestamp = new Date().toISOString();
    {
      const data = {
        platform: PLATFORM,
        updateSource: window.location.href
      };
      let syncScope = 'none';

      await installBridgeScript();
      bindBridgeListener(metrics);

      if (!metrics.hasReusablePersonalInfoSnapshot(pendingAccountSnapshot)) {
        pendingAccountSnapshot = null;
      }

      try {
        const accountPatch = await collectAccountInfo(metrics, timestamp);
        if (accountPatch && metrics.hasSufficientXiaohongshuAccountData(accountPatch)) {
          Object.assign(data, accountPatch);
          syncScope = 'account';
        }
      } catch (error) {
        console.warn('AllFans: failed to refresh Xiaohongshu account info', error);
      }

      if (isManagePage()) {
        if (!metrics.hasReusablePostedSnapshot(pendingSnapshot)) {
          pendingSnapshot = null;
        }

        const state = await collectAllPostedNotes(metrics);
        if (state) {
          const contentPatch = metrics.buildContentPlatformPatch(state, {
            displayName: data.displayName || getDisplayName(),
            updateSource: window.location.href,
            timestamp
          });

          if (!data.displayName) {
            delete contentPatch.displayName;
          }

          if (metrics.hasSufficientXiaohongshuData(contentPatch)) {
            Object.assign(data, contentPatch);
            syncScope = syncScope === 'account' ? 'both' : 'content';
          }
        }
      }

      if (syncScope !== 'none') {
        return { data, scope: syncScope };
      }
    }

    await installBridgeScript();
    bindBridgeListener(metrics);

    if (!metrics.hasReusablePostedSnapshot(pendingSnapshot)) {
      pendingSnapshot = null;
    }

    const state = await collectAllPostedNotes(metrics);
    if (!state) {
      return null;
    }

    const data = metrics.buildContentPlatformPatch(state, {
      displayName: getDisplayName(),
      updateSource: window.location.href,
      timestamp
    });

    if (!metrics.hasSufficientXiaohongshuData(data)) {
      return null;
    }

    return {
      data: {
        platform: PLATFORM,
        ...data
      },
      scope: 'content'
    };
  }

  async function runXiaohongshuScan(reason = 'passive') {
    if (activeScanPromise) {
      return activeScanPromise;
    }

    activeScanPromise = performXiaohongshuScan()
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

    runXiaohongshuScan(message.reason || 'manual')
      .then(result => {
        if (!result?.data) {
          sendResponse({
            success: false,
            error: '小红书作品数据暂未准备完成，请等待页面加载后再试。'
          });
          return;
        }

        sendResponse({ success: true, data: result.data, scope: result.scope });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message || '小红书数据刷新失败。' });
      });

    return true;
  });

  async function init() {
    if (!isSupportedXiaohongshuPage()) {
      return;
    }

    await installBridgeScript();
    bindBridgeListener(getMetricsModule());

    try {
      await runXiaohongshuScan('passive');
    } catch (error) {
      console.warn('AllFans: initial Xiaohongshu scan skipped', error);
    }
  }

  init();
})();
