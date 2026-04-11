// AllFans Douyin data aggregator (runtime v2)

(function() {
  'use strict';

  const MESSAGE_TYPES = {
    DATA_EXTRACTED: 'DATA_EXTRACTED',
    SYNC_PLATFORM: 'SYNC_PLATFORM'
  };

  const BRIDGE_SOURCE = 'allfans-douyin-bridge';
  const BRIDGE_EVENT_TYPE = 'ALLFANS_DOUYIN_WORK_LIST_RESPONSE';
  const PLATFORM = 'douyin';
  const HOME_PATH_PREFIX = '/creator-micro/home';
  const MANAGE_PATH_PREFIX = '/creator-micro/content/manage';
  const ACCOUNT_INFO_URL = 'https://creator.douyin.com/web/api/media/user/info/';
  const WAIT_OPTIONS = {
    timeoutMs: 15000,
    intervalMs: 300,
    maxPages: 50
  };

  let bridgeBound = false;
  let pendingSnapshot = null;
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
    if (document.getElementById('allfans-douyin-bridge')) {
      return;
    }

    const script = document.createElement('script');
    script.id = 'allfans-douyin-bridge';
    script.textContent = `(() => {
      if (window.__allfansDouyinBridgeInstalled) return;
      window.__allfansDouyinBridgeInstalled = true;

      const SOURCE = '${BRIDGE_SOURCE}';
      const EVENT_TYPE = '${BRIDGE_EVENT_TYPE}';
      const MATCHER = '/janus/douyin/creator/pc/work_list';

      const isMatch = url => typeof url === 'string' && url.includes(MATCHER);
      const postPayload = (url, payload) => {
        window.postMessage({ source: SOURCE, type: EVENT_TYPE, url, payload }, '*');
      };

      const originalFetch = window.fetch;
      window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);

        try {
          const request = args[0];
          const url =
            typeof request === 'string'
              ? request
              : request && typeof request.url === 'string'
                ? request.url
                : '';

          if (isMatch(url)) {
            response.clone().json().then(payload => postPayload(url, payload)).catch(() => {});
          }
        } catch {}

        return response;
      };

      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this.__allfansDouyinUrl = typeof url === 'string' ? url : '';
        return originalOpen.call(this, method, url, ...rest);
      };

      XMLHttpRequest.prototype.send = function(...args) {
        this.addEventListener('load', function() {
          try {
            if (!isMatch(this.__allfansDouyinUrl)) return;
            postPayload(this.__allfansDouyinUrl, JSON.parse(this.responseText));
          } catch {}
        });

        return originalSend.apply(this, args);
      };
    })();`;

    (document.documentElement || document.head || document.body).appendChild(script);
    script.remove();
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
    const urls = getKnownWorkListUrls(metrics);

    for (const url of urls) {
      try {
        const response = await fetch(url, { credentials: 'include' });
        if (!response.ok) {
          continue;
        }

        pendingSnapshot = {
          url,
          response: await response.json()
        };
        return;
      } catch (error) {
        console.warn('AllFans: failed to seed Douyin work list request', error);
      }
    }
  }

  async function waitForWorkListSnapshot() {
    const startedAt = Date.now();

    while (Date.now() - startedAt < WAIT_OPTIONS.timeoutMs) {
      if (
        pendingSnapshot?.response?.status_code === 0 &&
        Array.isArray(pendingSnapshot?.response?.aweme_list)
      ) {
        return pendingSnapshot;
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

    const firstSnapshot = await waitForWorkListSnapshot();
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
      const nextResponse = await fetchWorkListPage(nextUrl);
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

    try {
      const accountPatch = await fetchAccountInfo(metrics, timestamp);
      if (metrics.hasSufficientDouyinAccountData(accountPatch)) {
        Object.assign(data, accountPatch);
        syncScope = 'account';
      }
    } catch (error) {
      console.warn('AllFans: failed to refresh Douyin account info', error);
    }

    if (isManagePage()) {
      pendingSnapshot = null;
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
      }
    }

    if (syncScope === 'none') {
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
