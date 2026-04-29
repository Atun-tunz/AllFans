(function() {
  'use strict';

  const MESSAGE_TYPES = {
    DATA_EXTRACTED: 'DATA_EXTRACTED',
    GET_ACCOUNT_PROFILE_URL: 'GET_ACCOUNT_PROFILE_URL',
    GET_PLATFORM_DATA: 'GET_PLATFORM_DATA',
    SYNC_PLATFORM: 'SYNC_PLATFORM'
  };
  const BRIDGE_SOURCE = 'allfans-weibo-bridge';
  const BRIDGE_ACCOUNT_EVENT_TYPE = 'ALLFANS_WEIBO_ACCOUNT_RESPONSE';
  const BRIDGE_VIDEO_LIST_EVENT_TYPE = 'ALLFANS_WEIBO_VIDEO_LIST_RESPONSE';
  const BRIDGE_ARTICLE_LIST_EVENT_TYPE = 'ALLFANS_WEIBO_ARTICLE_LIST_RESPONSE';
  const BRIDGE_FETCH_REQUEST_TYPE = 'ALLFANS_WEIBO_FETCH_REQUEST';
  const BRIDGE_FETCH_RESPONSE_TYPE = 'ALLFANS_WEIBO_FETCH_RESPONSE';
  const PLATFORM = 'weibo';
  const WAIT_OPTIONS = {
    pageReadyTimeoutMs: 60000,
    pageReadyIntervalMs: 500,
    snapshotTimeoutMs: 10000,
    bridgeRequestTimeoutMs: 30000,
    settleDelayMs: 1200
  };

  let bridgeBound = false;
  let pendingAccountSnapshot = null;
  let pendingVideoSnapshot = null;
  let pendingArticleSnapshot = null;
  let activeScanPromise = null;
  let activeScanKey = null;
  let bridgeReadyPromise = null;
  let bridgeRequestId = 0;
  const pendingBridgeRequests = new Map();

  function getRuntime() {
    return globalThis.browser || globalThis.chrome;
  }

  function getMetricsModule() {
    const metrics = globalThis.AllFansWeiboMetrics;
    if (!metrics) {
      throw new Error('AllFansWeiboMetrics is not available');
    }
    return metrics;
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function isWeiboAccountHost(hostname) {
    return hostname === 'weibo.com' || hostname === 'www.weibo.com';
  }

  function parseUrl(url) {
    try {
      return new URL(String(url), window.location.href);
    } catch {
      return null;
    }
  }

  function isWeiboProfileUrl(url) {
    const target = parseUrl(url);
    if (!target || !isWeiboAccountHost(target.hostname)) {
      return false;
    }

    return (
      target.pathname.startsWith('/u/') ||
      target.pathname.startsWith('/p/')
    );
  }

  function normalizeProfileUrl(value) {
    const target = parseUrl(value);
    return target && isWeiboProfileUrl(target.href) ? target.href : null;
  }

  function decodeJsonStringValue(value) {
    try {
      return JSON.parse(`"${value}"`);
    } catch {
      return String(value || '').replace(/\\\//g, '/');
    }
  }

  function extractProfileUrlFromText(text) {
    const source = String(text || '');
    const match =
      source.match(/"profile_url"\s*:\s*"([^"]+)"/) ||
      source.match(/'profile_url'\s*:\s*'([^']+)'/) ||
      source.match(/profile_url\s*:\s*['"]([^'"]+)['"]/);

    return match ? normalizeProfileUrl(decodeJsonStringValue(match[1])) : null;
  }

  function readProfileUrlFromGlobals() {
    return normalizeProfileUrl(globalThis.$CONFIG?.user?.profile_url);
  }

  function readProfileUrlFromInlineConfig() {
    for (const script of document.querySelectorAll('script')) {
      const profileUrl = extractProfileUrlFromText(script.textContent);
      if (profileUrl) {
        return profileUrl;
      }
    }
    return null;
  }

  function resolveCurrentProfileUrl() {
    if (isWeiboProfileUrl(window.location.href)) {
      return window.location.href;
    }

    return readProfileUrlFromGlobals() || readProfileUrlFromInlineConfig();
  }

  function getPageRole() {
    if (isWeiboAccountHost(window.location.hostname)) {
      return 'account';
    }

    if (
      window.location.hostname === 'me.weibo.com' &&
      window.location.pathname.startsWith('/content/video')
    ) {
      return 'videoContent';
    }

    if (
      window.location.hostname === 'me.weibo.com' &&
      window.location.pathname.startsWith('/content/article')
    ) {
      return 'articleContent';
    }

    return null;
  }

  function getContentKindsForRole(role) {
    if (role === 'videoContent') {
      return ['video'];
    }

    if (role === 'articleContent') {
      return ['article'];
    }

    return [];
  }

  function isSupportedPage() {
    return Boolean(getPageRole());
  }

  function installBridgeScript() {
    if (bridgeReadyPromise) {
      return bridgeReadyPromise;
    }

    const runtime = getRuntime();
    const existing = document.getElementById('allfans-weibo-bridge');
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
        reject(new Error('Failed to load Weibo bridge script'));
      };

      script.addEventListener('load', handleLoad, { once: true });
      script.addEventListener('error', handleError, { once: true });

      if (!existing) {
        script.id = 'allfans-weibo-bridge';
        script.src = runtime.runtime.getURL('content/weibo-bridge.js');
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
      if (payload?.source !== BRIDGE_SOURCE) {
        return;
      }

      if (payload.type === BRIDGE_FETCH_RESPONSE_TYPE) {
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
          requestState.reject(new Error(`Weibo bridge request failed with status ${payload.status}`));
          return;
        }

        const isUsable =
          payload.kind === 'account'
            ? metrics.hasUsableAccountResponse(payload.payload)
            : payload.kind === 'video'
              ? metrics.hasUsableVideoListResponse(payload.payload)
              : metrics.hasUsableArticleListResponse(payload.payload);

        if (!isUsable) {
          requestState.reject(new Error(`Weibo ${payload.kind} payload was not usable`));
          return;
        }

        requestState.resolve({
          url: payload.url,
          pageUrl: payload.pageUrl,
          kind: payload.kind,
          response: payload.payload
        });
        return;
      }

      if (payload.type === BRIDGE_ACCOUNT_EVENT_TYPE) {
        if (!metrics.isAccountResponseUrl(payload.url)) {
          return;
        }

        if (!metrics.hasUsableAccountResponse(payload.payload)) {
          return;
        }

        pendingAccountSnapshot = {
          url: payload.url,
          pageUrl: payload.pageUrl,
          response: payload.payload
        };
        return;
      }

      if (payload.type === BRIDGE_VIDEO_LIST_EVENT_TYPE && metrics.hasUsableVideoListResponse(payload.payload)) {
        pendingVideoSnapshot = {
          url: payload.url,
          pageUrl: payload.pageUrl,
          response: payload.payload
        };
        return;
      }

      if (payload.type === BRIDGE_ARTICLE_LIST_EVENT_TYPE && metrics.hasUsableArticleListResponse(payload.payload)) {
        pendingArticleSnapshot = {
          url: payload.url,
          pageUrl: payload.pageUrl,
          response: payload.payload
        };
      }
    });

    bridgeBound = true;
  }

  async function prepareBridge() {
    if (!isSupportedPage()) {
      return;
    }

    const metrics = getMetricsModule();
    await installBridgeScript();
    bindBridgeListener(metrics);
  }

  function isDocumentReady() {
    return document.readyState === 'complete' && Boolean(document.body);
  }

  async function waitForPageSettled() {
    const startedAt = Date.now();

    while (Date.now() - startedAt < WAIT_OPTIONS.pageReadyTimeoutMs) {
      if (!isSupportedPage()) {
        throw new Error('\u8bf7\u5148\u6253\u5f00\u5fae\u535a\u4e2a\u4eba\u4e3b\u9875\u6216\u521b\u4f5c\u8005\u5165\u53e3\u3002');
      }

      if (isDocumentReady()) {
        await delay(WAIT_OPTIONS.settleDelayMs);
        return;
      }

      await delay(WAIT_OPTIONS.pageReadyIntervalMs);
    }

    throw new Error('\u5fae\u535a\u9875\u9762\u52a0\u8f7d\u8d85\u65f6\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002');
  }

  function requestSnapshotFromBridge(kind) {
    return new Promise((resolve, reject) => {
      const requestId = `weibo-${kind}-${Date.now()}-${bridgeRequestId++}`;
      const timeoutId = setTimeout(() => {
        pendingBridgeRequests.delete(requestId);
        reject(new Error(`Weibo ${kind} bridge request timed out`));
      }, WAIT_OPTIONS.bridgeRequestTimeoutMs);

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
          kind
        },
        '*'
      );
    });
  }

  async function waitForSnapshot(validateSnapshot, getSnapshot) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < WAIT_OPTIONS.snapshotTimeoutMs) {
      const snapshot = getSnapshot();
      if (validateSnapshot(snapshot)) {
        return snapshot;
      }

      await delay(WAIT_OPTIONS.pageReadyIntervalMs);
    }

    return null;
  }

  async function collectAccountInfo(metrics, timestamp) {
    if (!metrics.hasReusableAccountSnapshot(pendingAccountSnapshot)) {
      pendingAccountSnapshot =
        (await waitForSnapshot(
          metrics.hasReusableAccountSnapshot,
          () => pendingAccountSnapshot
        )) || pendingAccountSnapshot;
    }

    if (!metrics.hasReusableAccountSnapshot(pendingAccountSnapshot)) {
      pendingAccountSnapshot = await requestSnapshotFromBridge('account');
    }

    if (!metrics.hasReusableAccountSnapshot(pendingAccountSnapshot)) {
      return null;
    }

    return metrics.buildAccountPlatformPatch(pendingAccountSnapshot.response, {
      updateSource: pendingAccountSnapshot.url,
      timestamp
    });
  }

  async function collectContentSnapshot(metrics, kind) {
    const getSnapshot = () => (kind === 'video' ? pendingVideoSnapshot : pendingArticleSnapshot);
    const validateSnapshot =
      kind === 'video'
        ? metrics.hasReusableVideoListSnapshot
        : metrics.hasReusableArticleListSnapshot;

    let snapshot = getSnapshot();
    if (!validateSnapshot(snapshot)) {
      snapshot = (await waitForSnapshot(validateSnapshot, getSnapshot)) || snapshot;
    }

    if (!validateSnapshot(snapshot)) {
      snapshot = await requestSnapshotFromBridge(kind);
    }

    if (kind === 'video') {
      pendingVideoSnapshot = snapshot;
    } else {
      pendingArticleSnapshot = snapshot;
    }

    return validateSnapshot(snapshot) ? snapshot : null;
  }

  async function collectContentInfo(metrics, contentKinds, timestamp) {
    let state = metrics.createContentScanState();
    let updateSource = window.location.href;
    let capturedAny = false;

    if (contentKinds.includes('video')) {
      try {
        const videoSnapshot = await collectContentSnapshot(metrics, 'video');
        if (videoSnapshot) {
          state = metrics.mergeVideoListResponse(state, videoSnapshot.response);
          updateSource = videoSnapshot.url || updateSource;
          capturedAny = true;
        }
      } catch (error) {
        console.warn('AllFans: failed to refresh Weibo video data', error);
      }
    }

    if (contentKinds.includes('article')) {
      try {
        const articleSnapshot = await collectContentSnapshot(metrics, 'article');
        if (articleSnapshot) {
          state = metrics.mergeArticleListResponse(state, articleSnapshot.response);
          updateSource = articleSnapshot.url || updateSource;
          capturedAny = true;
        }
      } catch (error) {
        console.warn('AllFans: failed to refresh Weibo article data', error);
      }
    }

    if (!capturedAny) {
      return null;
    }

    const contentPatch = metrics.buildContentPlatformPatch(state, {
      updateSource,
      timestamp
    });
    const currentPlatformData = await getCurrentPlatformData();

    return metrics.mergeContentPatchWithStoredData(currentPlatformData, contentPatch);
  }

  function getCurrentPlatformData() {
    const runtime = getRuntime();

    return new Promise(resolve => {
      runtime.runtime.sendMessage(
        {
          type: MESSAGE_TYPES.GET_PLATFORM_DATA,
          platform: PLATFORM
        },
        response => {
          const lastError = runtime.runtime.lastError;
          if (lastError || !response?.success) {
            resolve({});
            return;
          }

          resolve(response.data || {});
        }
      );
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
          console.warn('AllFans: failed to store Weibo data', lastError.message);
        }
      }
    );
  }

  async function performScan(entrypointId = null) {
    const pageRole = getPageRole();
    if (!pageRole) {
      throw new Error('\u8bf7\u5148\u6253\u5f00\u5fae\u535a\u4e2a\u4eba\u4e3b\u9875\u6216\u521b\u4f5c\u8005\u5165\u53e3\u3002');
    }

    const metrics = getMetricsModule();
    await installBridgeScript();
    bindBridgeListener(metrics);
    await waitForPageSettled();

    const requestedRole =
      entrypointId === 'account' ||
      entrypointId === 'videoContent' ||
      entrypointId === 'articleContent'
        ? entrypointId
        : pageRole;
    const contentKinds = getContentKindsForRole(requestedRole);
    const timestamp = new Date().toISOString();
    const data = {
      platform: PLATFORM,
      updateSource: window.location.href,
      lastUpdate: timestamp
    };
    let syncScope = 'none';

    if (requestedRole === 'account' || pageRole === 'account') {
      try {
        const accountPatch = await collectAccountInfo(metrics, timestamp);
        if (accountPatch && metrics.hasSufficientWeiboAccountData(accountPatch)) {
          Object.assign(data, accountPatch);
          syncScope = 'account';
        }
      } catch (error) {
        console.warn('AllFans: failed to refresh Weibo account info', error);
      }
    }

    if (contentKinds.length > 0) {
      try {
        const contentPatch = await collectContentInfo(metrics, contentKinds, timestamp);
        if (contentPatch && metrics.hasSufficientWeiboContentData(contentPatch)) {
          Object.assign(data, contentPatch);
          syncScope = syncScope === 'account' ? 'both' : 'content';
        }
      } catch (error) {
        if (syncScope === 'none') {
          throw error;
        }
        console.warn('AllFans: failed to refresh Weibo content data, keeping account data', error);
      }
    }

    if (syncScope === 'none') {
      return null;
    }

    return { data, scope: syncScope };
  }

  async function runScan(reason = 'passive', entrypointId = null) {
    const scanKey = `${reason}:${entrypointId || 'auto'}`;
    if (activeScanPromise && activeScanKey === scanKey) {
      return activeScanPromise;
    }

    activeScanKey = scanKey;
    const scanPromise = performScan(entrypointId)
      .then(result => {
        if (reason === 'passive' && result?.data) {
          sendDataToBackground(result.data, reason);
        }

        return result;
      })
      .finally(() => {
        if (activeScanPromise === scanPromise) {
          activeScanPromise = null;
          activeScanKey = null;
        }
      });
    activeScanPromise = scanPromise;

    return activeScanPromise;
  }

  getRuntime().runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === MESSAGE_TYPES.GET_ACCOUNT_PROFILE_URL && message?.platformId === PLATFORM) {
      sendResponse({
        success: true,
        url: resolveCurrentProfileUrl()
      });
      return false;
    }

    if (message?.type !== MESSAGE_TYPES.SYNC_PLATFORM || message?.platformId !== PLATFORM) {
      return false;
    }

    runScan(message.reason || 'manual', message.entrypointId || null)
      .then(result => {
        if (!result?.data) {
          sendResponse({
            success: false,
            error: '\u5fae\u535a\u6570\u636e\u6682\u672a\u51c6\u5907\u5b8c\u6210\uff0c\u8bf7\u6253\u5f00\u6216\u5237\u65b0\u5bf9\u5e94\u9875\u9762\u540e\u518d\u8bd5\u3002'
          });
          return;
        }

        sendResponse({ success: true, data: result.data, scope: result.scope });
      })
      .catch(error => {
        sendResponse({
          success: false,
          error: error.message || '\u5fae\u535a\u6570\u636e\u5237\u65b0\u5931\u8d25\u3002'
        });
      });

    return true;
  });

  async function init() {
    if (!isSupportedPage()) {
      return;
    }

    await prepareBridge();

    try {
      await runScan('passive');
    } catch (error) {
      console.warn('AllFans: initial Weibo scan skipped', error);
    }
  }

  prepareBridge().catch(error => {
    console.warn('AllFans: failed to prepare Weibo bridge before page load', error);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
