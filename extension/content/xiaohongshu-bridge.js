(() => {
  if (window.__allfansXiaohongshuBridgeInstalled) return;
  window.__allfansXiaohongshuBridgeInstalled = true;

  const SOURCE = 'allfans-xiaohongshu-bridge';
  const POSTED_EVENT_TYPE = 'ALLFANS_XIAOHONGSHU_POSTED_RESPONSE';
  const PERSONAL_INFO_EVENT_TYPE = 'ALLFANS_XIAOHONGSHU_PERSONAL_INFO_RESPONSE';
  const FETCH_REQUEST_TYPE = 'ALLFANS_XIAOHONGSHU_FETCH_PAGE_REQUEST';
  const FETCH_RESPONSE_TYPE = 'ALLFANS_XIAOHONGSHU_FETCH_PAGE_RESPONSE';
  const ACCOUNT_FETCH_REQUEST_TYPE = 'ALLFANS_XIAOHONGSHU_FETCH_ACCOUNT_REQUEST';
  const ACCOUNT_FETCH_RESPONSE_TYPE = 'ALLFANS_XIAOHONGSHU_FETCH_ACCOUNT_RESPONSE';
  const MATCHER = '/api/galaxy/v2/creator/note/user/posted';
  const PERSONAL_INFO_MATCHER = '/api/galaxy/creator/home/personal_info';
  const DYNAMIC_HEADER_NAMES = new Set([
    'x-s',
    'x-s-common',
    'x-t',
    'cookie',
    'host',
    'authority',
    'content-length'
  ]);

  let latestPrimaryRequestTemplate = null;
  let latestAccountRequestTemplate = null;

  const isMatch = url => typeof url === 'string' && url.includes(MATCHER);
  const isPersonalInfoMatch = url =>
    typeof url === 'string' && url.includes(PERSONAL_INFO_MATCHER);
  const isPrimaryMatch = url => {
    if (!isMatch(url)) return false;

    try {
      const target = new URL(url, window.location.href);
      return target.searchParams.get('tab') === '0';
    } catch {
      return false;
    }
  };
  const postPostedPayload = (url, payload) => {
    window.postMessage({ source: SOURCE, type: POSTED_EVENT_TYPE, url, payload }, '*');
  };
  const postAccountPayload = (url, payload) => {
    window.postMessage({ source: SOURCE, type: PERSONAL_INFO_EVENT_TYPE, url, payload }, '*');
  };
  const postFetchResponse = message => {
    window.postMessage({ source: SOURCE, type: FETCH_RESPONSE_TYPE, ...message }, '*');
  };
  const serializeHeaders = headersLike => {
    try {
      return Array.from(new Headers(headersLike).entries());
    } catch {
      return [];
    }
  };
  const sanitizeHeaders = headersEntries => {
    const headers = new Headers();

    for (const [key, value] of headersEntries || []) {
      if (!key || DYNAMIC_HEADER_NAMES.has(String(key).toLowerCase())) {
        continue;
      }

      headers.set(key, value);
    }

    return headers;
  };
  const captureFetchTemplate = args => {
    const input = args[0];
    const init = args[1] || {};
    const request = input instanceof Request ? input : null;
    const url =
      typeof input === 'string'
        ? input
        : request && typeof request.url === 'string'
          ? request.url
          : '';

    return {
      url,
      method: String(init.method || request?.method || 'GET').toUpperCase(),
      headers: serializeHeaders(init.headers || request?.headers),
      credentials: init.credentials || request?.credentials || 'include',
      mode: init.mode || request?.mode || 'cors',
      cache: init.cache || request?.cache || 'default',
      redirect: init.redirect || request?.redirect || 'follow',
      referrer: init.referrer || request?.referrer || window.location.href,
      referrerPolicy:
        init.referrerPolicy || request?.referrerPolicy || 'strict-origin-when-cross-origin'
    };
  };
  const buildPageUrl = (page, tab) => {
    const rawUrl =
      latestPrimaryRequestTemplate?.url ||
      `${window.location.origin}/api/galaxy/v2/creator/note/user/posted?tab=0&page=0`;
    const target = new URL(rawUrl, window.location.href);
    target.searchParams.set('tab', String(tab));
    target.searchParams.set('page', String(page));
    return target.toString();
  };
  const buildReplayInit = template => ({
    method: template?.method || 'GET',
    headers: sanitizeHeaders(template?.headers),
    credentials: 'include',
    mode: template?.mode || 'cors',
    cache: template?.cache || 'default',
    redirect: template?.redirect || 'follow',
    referrer: window.location.href,
    referrerPolicy: template?.referrerPolicy || 'strict-origin-when-cross-origin'
  });
  const buildAccountUrl = () =>
    latestAccountRequestTemplate?.url ||
    `${window.location.origin}/api/galaxy/creator/home/personal_info`;
  const requestPage = async (requestId, page, tab) => {
    const url = buildPageUrl(page, tab);

    try {
      const response = await window.fetch(url, buildReplayInit(latestPrimaryRequestTemplate));
      const payload = await response.clone().json().catch(() => null);

      postFetchResponse({
        requestId,
        url,
        ok: response.ok,
        status: response.status,
        payload
      });
    } catch (error) {
      postFetchResponse({
        requestId,
        url,
        error: String(error?.message || error || 'Unknown bridge error')
      });
    }
  };
  const requestAccountInfo = async requestId => {
    const url = buildAccountUrl();

    try {
      const response = await window.fetch(url, buildReplayInit(latestAccountRequestTemplate));
      const payload = await response.clone().json().catch(() => null);

      postFetchResponse({
        type: ACCOUNT_FETCH_RESPONSE_TYPE,
        requestId,
        url,
        ok: response.ok,
        status: response.status,
        payload
      });
    } catch (error) {
      postFetchResponse({
        type: ACCOUNT_FETCH_RESPONSE_TYPE,
        requestId,
        url,
        error: String(error?.message || error || 'Unknown bridge error')
      });
    }
  };

  window.addEventListener('message', event => {
    const payload = event.data;
    if (event.source !== window || payload?.source !== SOURCE) {
      return;
    }

    if (payload.type === FETCH_REQUEST_TYPE) {
      requestPage(payload.requestId, payload.page, payload.tab ?? 0);
      return;
    }

    if (payload.type === ACCOUNT_FETCH_REQUEST_TYPE) {
      requestAccountInfo(payload.requestId);
    }
  });

  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);

    try {
      const template = captureFetchTemplate(args);
      const url = template.url;

      if (isPrimaryMatch(url)) {
        latestPrimaryRequestTemplate = template;
        response.clone().json().then(payload => postPostedPayload(url, payload)).catch(() => {});
      }

      if (isPersonalInfoMatch(url)) {
        latestAccountRequestTemplate = template;
        response.clone().json().then(payload => postAccountPayload(url, payload)).catch(() => {});
      }
    } catch {}

    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.__allfansXiaohongshuUrl = typeof url === 'string' ? url : '';
    this.__allfansXiaohongshuMethod = typeof method === 'string' ? method : 'GET';
    this.__allfansXiaohongshuHeaders = [];
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    try {
      this.__allfansXiaohongshuHeaders.push([name, value]);
    } catch {}

    return originalSetRequestHeader.call(this, name, value);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    this.addEventListener('load', function() {
      try {
        if (isPrimaryMatch(this.__allfansXiaohongshuUrl)) {
          latestPrimaryRequestTemplate = {
            url: this.__allfansXiaohongshuUrl,
            method: String(this.__allfansXiaohongshuMethod || 'GET').toUpperCase(),
            headers: Array.isArray(this.__allfansXiaohongshuHeaders)
              ? this.__allfansXiaohongshuHeaders
              : [],
            credentials: 'include',
            mode: 'cors',
            cache: 'default',
            redirect: 'follow',
            referrer: window.location.href,
            referrerPolicy: 'strict-origin-when-cross-origin'
          };
          postPostedPayload(this.__allfansXiaohongshuUrl, JSON.parse(this.responseText));
          return;
        }

        if (!isPersonalInfoMatch(this.__allfansXiaohongshuUrl)) return;

        latestAccountRequestTemplate = {
          url: this.__allfansXiaohongshuUrl,
          method: String(this.__allfansXiaohongshuMethod || 'GET').toUpperCase(),
          headers: Array.isArray(this.__allfansXiaohongshuHeaders)
            ? this.__allfansXiaohongshuHeaders
            : [],
          credentials: 'include',
          mode: 'cors',
          cache: 'default',
          redirect: 'follow',
          referrer: window.location.href,
          referrerPolicy: 'strict-origin-when-cross-origin'
        };
        postAccountPayload(this.__allfansXiaohongshuUrl, JSON.parse(this.responseText));
      } catch {}
    });

    return originalSend.apply(this, args);
  };
})();
