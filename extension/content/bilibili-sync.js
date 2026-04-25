// AllFans Bilibili data extractor (runtime v2)

(function() {
  'use strict';

  const MESSAGE_TYPES = {
    DATA_EXTRACTED: 'DATA_EXTRACTED',
    SYNC_PLATFORM: 'SYNC_PLATFORM'
  };

  const PLATFORM = 'bilibili';
  const API_URL = 'https://member.bilibili.com/x/web/data/index/stat?tmid=NaN';
  const NAV_API_URL = 'https://api.bilibili.com/x/web-interface/nav';
  const WAIT_OPTIONS = {
    timeoutMs: 15000,
    intervalMs: 500
  };

  function getRuntime() {
    return globalThis.browser || globalThis.chrome;
  }

  function createEmptyResult() {
    return {
      data: {
        platform: PLATFORM,
        uid: 0,
        displayName: '',
        fans: 0,
        fansChangeToday: 0,
        playCount: 0,
        likeCount: 0,
        commentCount: 0,
        danmakuCount: 0,
        shareCount: 0,
        favoriteCount: 0,
        coinCount: 0,
        updateSource: window.location.href
      },
      stats: {
        fansFound: false,
        videoMetricCount: 0
      }
    };
  }

  function getMetricsModule() {
    const metrics = globalThis.AllFansBilibiliMetrics;
    if (!metrics) {
      throw new Error('AllFansBilibiliMetrics is not available');
    }

    return metrics;
  }

  function extractDisplayName() {
    const selectors = [
      '.user-name',
      '.header-uname',
      '.account-info .name',
      '[class*="user-name"]',
      '[class*="account"] [class*="name"]'
    ];

    for (const selector of selectors) {
      const text = document.querySelector(selector)?.textContent?.trim();
      if (text && text.length <= 40) {
        return text;
      }
    }

    return '';
  }

  function extractBilibiliData(metrics) {
    const result = createEmptyResult();
    const fanItems = document.querySelectorAll('.fan-overview .fan-item');
    const videoCards = document.querySelectorAll('.section.video div.data-card');

    if (fanItems.length >= 1) {
      const fansText = fanItems[0].querySelector('.fan-num')?.textContent?.trim();
      if (fansText) {
        result.data.fans = metrics.parseCount(fansText);
        result.stats.fansFound = true;
      }
    }

    if (fanItems.length >= 2) {
      const fansChangeText = fanItems[1].querySelector('.fan-num')?.textContent?.trim();
      result.data.fansChangeToday = metrics.parseSignedCount(fansChangeText);
    }

    videoCards.forEach(card => {
      const iconElement = card.querySelector(
        'svg[class*="icon-sprite-dc-"], i[class*="icon-sprite-dc-"]'
      );
      const valueText = card.querySelector('.value span')?.textContent?.trim();

      if (!iconElement || !valueText) {
        return;
      }

      const field = metrics.getMetricFieldFromClassList(iconElement.classList);
      if (!field) {
        return;
      }

      result.data[field] = metrics.parseCount(valueText);
      result.stats.videoMetricCount += 1;
    });

    return result;
  }

  function waitForBilibiliData(metrics, options = WAIT_OPTIONS) {
    const startedAt = Date.now();

    return new Promise(resolve => {
      const attempt = () => {
        const result = extractBilibiliData(metrics);
        if (metrics.hasSufficientBilibiliData(result)) {
          resolve(result);
          return;
        }

        if (Date.now() - startedAt >= options.timeoutMs) {
          resolve(null);
          return;
        }

        setTimeout(attempt, options.intervalMs);
      };

      attempt();
    });
  }

  async function fetchBilibiliApiData(metrics) {
    const response = await fetch(API_URL, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`Bilibili stat request failed with status ${response.status}`);
    }

    const payload = await response.json();
    if (payload?.code !== 0 || !payload?.data) {
      throw new Error(payload?.message || 'Bilibili stat API returned an invalid payload');
    }

    return metrics.buildApiSnapshot(payload, window.location.href);
  }

  async function fetchBilibiliUserData(metrics) {
    const response = await fetch(NAV_API_URL, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`Bilibili nav request failed with status ${response.status}`);
    }

    const payload = await response.json();
    if (payload?.code !== 0 || !payload?.data) {
      throw new Error(payload?.message || 'Bilibili nav API returned an invalid payload');
    }

    return metrics.buildUserPatch(payload);
  }

  async function collectBilibiliData(metrics) {
    let userPatch = null;

    try {
      userPatch = await fetchBilibiliUserData(metrics);
    } catch (error) {
      console.warn('AllFans: failed to read Bilibili nav API', error);
    }

    const displayName = userPatch?.displayName || extractDisplayName();

    try {
      const apiResult = await fetchBilibiliApiData(metrics);
      apiResult.data.uid = userPatch?.uid || 0;
      apiResult.data.displayName = displayName;
      if (metrics.hasSufficientBilibiliData(apiResult)) {
        return apiResult;
      }
    } catch (error) {
      console.warn('AllFans: failed to read Bilibili stat API, falling back to DOM', error);
    }

    const domResult = await waitForBilibiliData(metrics);
    if (domResult) {
      domResult.data.uid = userPatch?.uid || 0;
      domResult.data.displayName = displayName;
    }

    return domResult;
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
          console.warn('AllFans: failed to store Bilibili data', lastError.message);
        }
      }
    );
  }

  async function runCollection(reason = 'passive') {
    const result = await collectBilibiliData(getMetricsModule());
    if (!result) {
      throw new Error('Bilibili data not ready before timeout');
    }

    if (reason === 'passive') {
      sendDataToBackground(result.data, reason);
    }

    return result;
  }

  getRuntime().runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== MESSAGE_TYPES.SYNC_PLATFORM || message?.platformId !== PLATFORM) {
      return false;
    }

    runCollection(message.reason || 'manual')
      .then(result => {
        sendResponse({ success: true, data: result.data });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });

    return true;
  });

  async function init() {
    try {
      await runCollection('passive');
    } catch (error) {
      console.warn('AllFans: Bilibili passive scan skipped', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
