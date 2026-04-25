(function() {
  'use strict';

  const MESSAGE_TYPES = {
    DATA_EXTRACTED: 'DATA_EXTRACTED',
    GET_PLATFORM_DATA: 'GET_PLATFORM_DATA',
    SYNC_PLATFORM: 'SYNC_PLATFORM'
  };

  const BRIDGE_SOURCE = 'allfans-weixin-channels-bridge';
  const BRIDGE_ACCOUNT_EVENT_TYPE = 'ALLFANS_WEIXIN_CHANNELS_ACCOUNT_RESPONSE';
  const BRIDGE_POST_LIST_EVENT_TYPE = 'ALLFANS_WEIXIN_CHANNELS_POST_LIST_RESPONSE';
  const BRIDGE_ACCOUNT_FETCH_REQUEST_TYPE = 'ALLFANS_WEIXIN_CHANNELS_FETCH_ACCOUNT_REQUEST';
  const BRIDGE_ACCOUNT_FETCH_RESPONSE_TYPE = 'ALLFANS_WEIXIN_CHANNELS_FETCH_ACCOUNT_RESPONSE';
  const BRIDGE_POST_LIST_FETCH_REQUEST_TYPE = 'ALLFANS_WEIXIN_CHANNELS_FETCH_POST_LIST_REQUEST';
  const BRIDGE_POST_LIST_FETCH_RESPONSE_TYPE = 'ALLFANS_WEIXIN_CHANNELS_FETCH_POST_LIST_RESPONSE';
  const BRIDGE_RESET_POST_LIST_TEMPLATES_REQUEST_TYPE = 'ALLFANS_WEIXIN_CHANNELS_RESET_POST_LIST_TEMPLATES_REQUEST';
  const PLATFORM = 'weixin_channels';
  const CLIENT_ROUTES = {
    videoContent: '/platform/post/list',
    imageTextContent: '/platform/post/finderNewLifePostList'
  };
  const ROLE_TO_KIND = {
    videoContent: 'video',
    imageTextContent: 'imageText'
  };
  const KIND_TO_ROLE = {
    video: 'videoContent',
    imageText: 'imageTextContent'
  };
  const ROLE_COLLECTION_ORDER = {
    videoContent: ['video', 'imageText'],
    imageTextContent: ['imageText', 'video']
  };
  const SHARED_CONTENT_MENU_TEXT = [
    '\u5185\u5bb9\u7ba1\u7406',
    '\u4f5c\u54c1\u7ba1\u7406',
    '\u4f5c\u54c1',
    '\u53d1\u8868\u8bb0\u5f55'
  ];
  const CONTENT_MENU_TEXT = {
    videoContent: [
      '\u89c6\u9891',
      '\u89c6\u9891\u4f5c\u54c1',
      '\u89c6\u9891\u52a8\u6001',
      '\u4f5c\u54c1\u5217\u8868'
    ],
    imageTextContent: [
      '\u56fe\u6587',
      '\u56fe\u6587\u4f5c\u54c1',
      '\u56fe\u6587\u52a8\u6001',
      '\u65b0\u751f\u6d3b'
    ]
  };
  const WAIT_OPTIONS = {
    pageReadyTimeoutMs: 60000,
    pageReadyIntervalMs: 500,
    snapshotTimeoutMs: 8000,
    bridgeRequestTimeoutMs: 45000,
    settleDelayMs: 1200,
    pageDelayMs: 800,
    maxPages: 100
  };

  let bridgeBound = false;
  let pendingAccountSnapshot = null;
  const pendingPostListSnapshots = {
    video: null,
    imageText: null
  };
  let currentScanEntrypointId = null;
  let activeScanPromise = null;
  let activeScanKey = null;
  let bridgeReadyPromise = null;
  let bridgeRequestId = 0;
  const pendingBridgeRequests = new Map();

  function getRuntime() {
    return globalThis.browser || globalThis.chrome;
  }

  function postBridgeMessage(message, { includeChildFrames = false } = {}) {
    window.postMessage(message, '*');

    if (!includeChildFrames) {
      return;
    }

    for (const frame of document.querySelectorAll('iframe')) {
      try {
        frame.contentWindow.postMessage(message, '*');
      } catch {}
    }
  }

  function getMetricsModule() {
    const metrics = globalThis.AllFansWeixinChannelsMetrics;
    if (!metrics) {
      throw new Error('AllFansWeixinChannelsMetrics is not available');
    }

    return metrics;
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function getPageRole() {
    if (window.location.hostname !== 'channels.weixin.qq.com') {
      return null;
    }

    if (
      window.location.pathname.startsWith('/platform/post/finderNewLifePostList') ||
      window.location.pathname.startsWith('/micro/content/post/finderNewLifePostList')
    ) {
      return 'imageTextContent';
    }

    if (
      window.location.pathname.startsWith('/platform/post/list') ||
      window.location.pathname.startsWith('/micro/content/post/list')
    ) {
      return 'videoContent';
    }

    if (window.location.pathname.startsWith('/platform')) {
      return 'home';
    }

    return null;
  }

  function getContentKindForRole(role) {
    return ROLE_TO_KIND[role] || null;
  }

  function getRoleForContentKind(kind) {
    return KIND_TO_ROLE[kind] || null;
  }

  function getContentKindsForRole(role) {
    return ROLE_COLLECTION_ORDER[role] || [];
  }

  function isSupportedPage() {
    return Boolean(getPageRole());
  }

  function getRequestedEntrypointId(explicitEntrypointId) {
    if (explicitEntrypointId) {
      return explicitEntrypointId;
    }

    return getPageRole();
  }

  function shouldResetPostListTemplatesBeforeNavigation(entrypointId) {
    const route = CLIENT_ROUTES[entrypointId];
    return Boolean(route && !window.location.pathname.startsWith(route));
  }

  function getRequestedContentKindHint() {
    const currentScanKind = getContentKindForRole(currentScanEntrypointId);
    if (currentScanKind) {
      return currentScanKind;
    }

    try {
      const requestedEntry = new URL(window.location.href).searchParams.get('allfansEntry');
      const requestedKind = getContentKindForRole(requestedEntry);
      if (requestedKind) {
        return requestedKind;
      }
    } catch {}

    return getContentKindForRole(getPageRole());
  }

  function hasRequestedEntrypointParam() {
    try {
      const requestedEntry = new URL(window.location.href).searchParams.get('allfansEntry');
      return requestedEntry === 'videoContent' || requestedEntry === 'imageTextContent';
    } catch {
      return false;
    }
  }

  function findRouteLink(route) {
    const selectors = [
      `a[href*="${route}"]`,
      `[data-href*="${route}"]`,
      `[data-url*="${route}"]`,
      `[to*="${route}"]`
    ];

    for (const selector of selectors) {
      const routeLink = document.querySelector(selector);
      if (routeLink) {
        return routeLink;
      }
    }

    return null;
  }

  function normalizeMenuText(text) {
    return String(text || '').replace(/\s+/g, '').trim();
  }

  function isVisibleElement(element) {
    if (!element || !document.documentElement.contains(element)) {
      return false;
    }

    const style = window.getComputedStyle(element);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      Number(style.opacity) === 0
    ) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function getClickableMenuElement(element) {
    return (
      element.closest(
        'a,button,[role="button"],[role="menuitem"],[data-href],[data-url],[to],[tabindex],li'
      ) || element
    );
  }

  function findMenuTextCandidate(textCandidates) {
    const normalizedCandidates = textCandidates.map(normalizeMenuText).filter(Boolean);
    if (normalizedCandidates.length === 0) {
      return null;
    }

    const selector = [
      'a',
      'button',
      '[role="button"]',
      '[role="menuitem"]',
      '[data-href]',
      '[data-url]',
      '[to]',
      '[tabindex]',
      'li',
      'span'
    ].join(',');

    for (const element of document.querySelectorAll(selector)) {
      if (!isVisibleElement(element)) {
        continue;
      }

      const text = normalizeMenuText(element.textContent);
      if (!text || text.length > 30) {
        continue;
      }

      const matched = normalizedCandidates.some(candidate => text === candidate || text.includes(candidate));
      if (matched) {
        return getClickableMenuElement(element);
      }
    }

    return null;
  }

  function findTextRouteCandidate(entrypointId) {
    return findMenuTextCandidate(CONTENT_MENU_TEXT[entrypointId] || []);
  }

  async function waitForTextRouteCandidate(entrypointId) {
    const startedAt = Date.now();
    let sharedMenuOpened = false;

    while (Date.now() - startedAt < WAIT_OPTIONS.snapshotTimeoutMs) {
      const textRouteCandidate = findTextRouteCandidate(entrypointId);
      if (textRouteCandidate) {
        return textRouteCandidate;
      }

      if (!sharedMenuOpened) {
        const sharedMenuCandidate = findMenuTextCandidate(SHARED_CONTENT_MENU_TEXT);
        if (sharedMenuCandidate) {
          sharedMenuOpened = true;
          sharedMenuCandidate.click();
          await delay(WAIT_OPTIONS.settleDelayMs);
          continue;
        }
      }

      await delay(WAIT_OPTIONS.pageReadyIntervalMs);
    }

    return null;
  }

  async function waitForRouteLink(route) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < WAIT_OPTIONS.snapshotTimeoutMs) {
      const routeLink = findRouteLink(route);
      if (routeLink) {
        return routeLink;
      }

      await delay(WAIT_OPTIONS.pageReadyIntervalMs);
    }

    return null;
  }

  async function navigateToRequestedEntrypoint(entrypointId) {
    const route = CLIENT_ROUTES[entrypointId];
    if (!route || window.location.pathname.startsWith(route)) {
      return;
    }

    const routeLink = await waitForRouteLink(route);
    if (routeLink) {
      routeLink.click();
      await delay(WAIT_OPTIONS.settleDelayMs);
      return;
    }

    const textRouteCandidate = await waitForTextRouteCandidate(entrypointId);
    if (textRouteCandidate) {
      textRouteCandidate.click();
      await delay(WAIT_OPTIONS.settleDelayMs);
      return;
    }

    window.history.pushState({}, '', route);
    window.dispatchEvent(new PopStateEvent('popstate'));
    await delay(WAIT_OPTIONS.settleDelayMs);
  }

  function installBridgeScript() {
    if (bridgeReadyPromise) {
      return bridgeReadyPromise;
    }

    const runtime = getRuntime();
    const existing = document.getElementById('allfans-weixin-channels-bridge');
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
        reject(new Error('Failed to load Weixin Channels bridge script'));
      };

      script.addEventListener('load', handleLoad, { once: true });
      script.addEventListener('error', handleError, { once: true });

      if (!existing) {
        script.id = 'allfans-weixin-channels-bridge';
        script.src = runtime.runtime.getURL('content/weixin-channels-bridge.js');
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

      if (
        payload.type === BRIDGE_ACCOUNT_FETCH_RESPONSE_TYPE ||
        payload.type === BRIDGE_POST_LIST_FETCH_RESPONSE_TYPE
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
            new Error(`Weixin Channels bridge request failed with status ${payload.status}`)
          );
          return;
        }

        const isPostListResponse = payload.type === BRIDGE_POST_LIST_FETCH_RESPONSE_TYPE;
        const isUsable = isPostListResponse
          ? metrics.hasUsablePostListResponse(payload.payload)
          : metrics.hasUsableAccountResponse(payload.payload);

        if (!isUsable) {
          requestState.reject(
            new Error(
              isPostListResponse
                ? 'Weixin Channels post list payload was not usable'
                : 'Weixin Channels account payload was not usable'
            )
          );
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
          response: payload.payload
        };
        return;
      }

      if (payload.type !== BRIDGE_POST_LIST_EVENT_TYPE) {
        return;
      }

      if (!metrics.isPostListResponseUrl(payload.url)) {
        return;
      }

      const kind = payload.kind || metrics.getPostListKind(payload.url, payload.pageUrl) || getRequestedContentKindHint();
      if (!kind || !metrics.hasUsablePostListResponse(payload.payload)) {
        return;
      }

      pendingPostListSnapshots[kind] = {
        url: payload.url,
        pageUrl: payload.pageUrl,
        kind,
        response: payload.payload
      };
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
        throw new Error('\u8bf7\u5148\u6253\u5f00\u5fae\u4fe1\u89c6\u9891\u53f7\u52a9\u624b\u9875\u9762\u3002');
      }

      if (isDocumentReady()) {
        await delay(WAIT_OPTIONS.settleDelayMs);
        return;
      }

      await delay(WAIT_OPTIONS.pageReadyIntervalMs);
    }

    throw new Error('\u5fae\u4fe1\u89c6\u9891\u53f7\u9875\u9762\u52a0\u8f7d\u8d85\u65f6\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002');
  }

  function requestBridgePayload({
    requestIdPrefix,
    message,
    timeoutMessage,
    includeChildFrames = false
  }) {
    return new Promise((resolve, reject) => {
      const requestId = `${requestIdPrefix}-${Date.now()}-${bridgeRequestId++}`;
      const timeoutId = setTimeout(() => {
        pendingBridgeRequests.delete(requestId);
        reject(new Error(timeoutMessage));
      }, WAIT_OPTIONS.bridgeRequestTimeoutMs);

      pendingBridgeRequests.set(requestId, {
        resolve,
        reject,
        timeoutId
      });

      postBridgeMessage(
        {
          source: BRIDGE_SOURCE,
          ...message,
          requestId
        },
        { includeChildFrames }
      );
    });
  }

  function requestAccountFromBridge() {
    return requestBridgePayload({
      requestIdPrefix: 'weixin-channels-account',
      message: {
        type: BRIDGE_ACCOUNT_FETCH_REQUEST_TYPE
      },
      timeoutMessage: 'Weixin Channels account bridge request timed out'
    });
  }

  function requestPostListFromBridge(kind, pageRequest = null) {
    return requestBridgePayload({
      requestIdPrefix: `weixin-channels-post-${kind}`,
      message: {
        type: BRIDGE_POST_LIST_FETCH_REQUEST_TYPE,
        kind,
        pageRequest,
        allowMissingTemplate: true
      },
      timeoutMessage: 'Weixin Channels post list bridge request timed out',
      includeChildFrames: true
    });
  }

  function resetPostListTemplatesInBridge() {
    pendingPostListSnapshots.video = null;
    pendingPostListSnapshots.imageText = null;

    postBridgeMessage(
      {
        source: BRIDGE_SOURCE,
        type: BRIDGE_RESET_POST_LIST_TEMPLATES_REQUEST_TYPE
      },
      { includeChildFrames: true }
    );
  }

  async function waitForReusableSnapshot(getSnapshot, isReusable) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < WAIT_OPTIONS.snapshotTimeoutMs) {
      const snapshot = getSnapshot();
      if (isReusable(snapshot)) {
        return snapshot;
      }

      await delay(WAIT_OPTIONS.pageReadyIntervalMs);
    }

    return null;
  }

  async function waitForAccountSnapshot(metrics) {
    return waitForReusableSnapshot(
      () => pendingAccountSnapshot,
      snapshot => metrics.hasReusableAccountSnapshot(snapshot)
    );
  }

  async function waitForPostListSnapshot(metrics, kind) {
    return waitForReusableSnapshot(
      () => pendingPostListSnapshots[kind],
      snapshot => metrics.hasReusablePostListSnapshot(snapshot, kind)
    );
  }

  async function collectAccountInfo(metrics, timestamp) {
    if (!metrics.hasReusableAccountSnapshot(pendingAccountSnapshot)) {
      pendingAccountSnapshot = await waitForAccountSnapshot(metrics) || pendingAccountSnapshot;
    }

    if (!metrics.hasReusableAccountSnapshot(pendingAccountSnapshot)) {
      pendingAccountSnapshot = await requestAccountFromBridge();
    }

    if (!metrics.hasReusableAccountSnapshot(pendingAccountSnapshot)) {
      return null;
    }

    return metrics.buildAccountPlatformPatch(pendingAccountSnapshot.response, {
      updateSource: pendingAccountSnapshot.url,
      timestamp
    });
  }

  async function collectInitialPostListSnapshot(metrics, kind) {
    if (!metrics.hasReusablePostListSnapshot(pendingPostListSnapshots[kind], kind)) {
      pendingPostListSnapshots[kind] = await waitForPostListSnapshot(metrics, kind) || pendingPostListSnapshots[kind];
    }

    if (!metrics.hasReusablePostListSnapshot(pendingPostListSnapshots[kind], kind)) {
      pendingPostListSnapshots[kind] = await requestPostListFromBridge(kind);
    }

    const snapshot = pendingPostListSnapshots[kind];
    if (!metrics.hasReusablePostListSnapshot(snapshot, kind)) {
      return null;
    }

    return snapshot;
  }

  async function collectAllPostListData(metrics, kind) {
    const firstSnapshot = await collectInitialPostListSnapshot(metrics, kind);
    if (!firstSnapshot) {
      return null;
    }

    let latestSnapshot = firstSnapshot;
    let state = metrics.mergePostListResponse(
      metrics.createContentScanState(),
      firstSnapshot.response,
      kind
    );
    let pageCount = 0;

    while (pageCount < WAIT_OPTIONS.maxPages) {
      if (metrics.isPostListKindScanComplete(state, kind)) {
        break;
      }

      const pageRequest = metrics.buildNextPostListPageRequest(
        latestSnapshot.response,
        state[kind],
        pageCount + 1
      );

      let nextSnapshot;
      try {
        nextSnapshot = await requestPostListFromBridge(kind, pageRequest);
      } catch (error) {
        console.warn('AllFans: failed to fetch Weixin Channels pagination, keeping partial data', error);
        break;
      }

      if (!metrics.hasReusablePostListSnapshot(nextSnapshot, kind)) {
        break;
      }

      const previousCount = state?.[kind]?.scannedItemCount || 0;
      state = metrics.mergePostListResponse(state, nextSnapshot.response, kind);
      latestSnapshot = nextSnapshot;

      if ((state?.[kind]?.scannedItemCount || 0) === previousCount) {
        break;
      }

      pageCount += 1;
      await delay(WAIT_OPTIONS.pageDelayMs);
    }

    return state;
  }

  async function collectContentInfo(metrics, kind, timestamp) {
    const state = await collectAllPostListData(metrics, kind);
    if (!state) {
      return null;
    }

    return metrics.buildContentPlatformPatch(state, {
      updateSource: pendingPostListSnapshots[kind]?.url || window.location.href,
      timestamp
    });
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
          console.warn('AllFans: failed to store Weixin Channels data', lastError.message);
        }
      }
    );
  }

  async function performScan(entrypointId = null) {
    const requestedEntrypointId = getRequestedEntrypointId(entrypointId);
    if (!requestedEntrypointId || !isSupportedPage()) {
      throw new Error('\u8bf7\u5148\u6253\u5f00\u5fae\u4fe1\u89c6\u9891\u53f7\u52a9\u624b\u9875\u9762\u3002');
    }

    const metrics = getMetricsModule();
    const contentKinds = getContentKindsForRole(requestedEntrypointId);
    currentScanEntrypointId = requestedEntrypointId;
    await installBridgeScript();
    bindBridgeListener(metrics);
    await waitForPageSettled();
    if (shouldResetPostListTemplatesBeforeNavigation(requestedEntrypointId)) {
      await resetPostListTemplatesInBridge();
    }
    await navigateToRequestedEntrypoint(requestedEntrypointId);

    const timestamp = new Date().toISOString();
    const data = {
      platform: PLATFORM,
      updateSource: window.location.href,
      lastUpdate: timestamp
    };
    let syncScope = 'none';

    try {
      const accountPatch = await collectAccountInfo(metrics, timestamp);
      if (accountPatch && metrics.hasSufficientWeixinChannelsAccountData(accountPatch)) {
        Object.assign(data, accountPatch);
        syncScope = 'account';
      }
    } catch (error) {
      console.warn('AllFans: failed to refresh Weixin Channels account info', error);
    }

    if (contentKinds.length > 0) {
      const currentPlatformData = await getCurrentPlatformData();
      let currentContentData = {
        ...currentPlatformData,
        ...data
      };
      let mergedContentPatch = null;

      for (const contentKindToCollect of contentKinds) {
        const contentEntrypointId = getRoleForContentKind(contentKindToCollect);
        if (!contentEntrypointId) {
          continue;
        }

        currentScanEntrypointId = contentEntrypointId;
        if (shouldResetPostListTemplatesBeforeNavigation(contentEntrypointId)) {
          await resetPostListTemplatesInBridge();
        }
        await navigateToRequestedEntrypoint(contentEntrypointId);
        await waitForPageSettled();

        const contentPatch = await collectContentInfo(metrics, contentKindToCollect, timestamp);
        if (!contentPatch) {
          continue;
        }

        mergedContentPatch = metrics.mergeContentPatchWithStoredData(
          currentContentData,
          contentPatch
        );
        currentContentData = {
          ...currentContentData,
          ...mergedContentPatch
        };
      }

      if (mergedContentPatch) {
        if (metrics.hasSufficientWeixinChannelsData(mergedContentPatch)) {
          Object.assign(data, mergedContentPatch);
          syncScope = syncScope === 'account' ? 'both' : 'content';
        }
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
    if (message?.type !== MESSAGE_TYPES.SYNC_PLATFORM || message?.platformId !== PLATFORM) {
      return false;
    }

    runScan(message.reason || 'manual', message.entrypointId || null)
      .then(result => {
        if (!result?.data) {
          sendResponse({
            success: false,
            error: '\u5fae\u4fe1\u89c6\u9891\u53f7\u6570\u636e\u6682\u672a\u51c6\u5907\u5b8c\u6210\uff0c\u8bf7\u6253\u5f00\u6216\u5237\u65b0\u5bf9\u5e94\u9875\u9762\u540e\u518d\u8bd5\u3002'
          });
          return;
        }

        sendResponse({ success: true, data: result.data, scope: result.scope });
      })
      .catch(error => {
        sendResponse({
          success: false,
          error:
            error.message ||
            '\u5fae\u4fe1\u89c6\u9891\u53f7\u6570\u636e\u5237\u65b0\u5931\u8d25\u3002'
        });
      });

    return true;
  });

  async function init() {
    if (!isSupportedPage()) {
      return;
    }

    await prepareBridge();

    if (hasRequestedEntrypointParam()) {
      return;
    }

    try {
      await runScan('passive');
    } catch (error) {
      console.warn('AllFans: initial Weixin Channels scan skipped', error);
    }
  }

  prepareBridge().catch(error => {
    console.warn('AllFans: failed to prepare Weixin Channels bridge before page load', error);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
