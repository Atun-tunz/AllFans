(() => {
  if (window.__allfansKuaishouBridgeInstalled) return;
  window.__allfansKuaishouBridgeInstalled = true;

  const SOURCE = 'allfans-kuaishou-bridge';
  const PHOTO_LIST_EVENT_TYPE = 'ALLFANS_KUAISHOU_PHOTO_LIST_RESPONSE';
  const HOME_INFO_EVENT_TYPE = 'ALLFANS_KUAISHOU_HOME_INFO_RESPONSE';
  const FETCH_REQUEST_TYPE = 'ALLFANS_KUAISHOU_FETCH_PAGE_REQUEST';
  const FETCH_RESPONSE_TYPE = 'ALLFANS_KUAISHOU_FETCH_PAGE_RESPONSE';
  const ACCOUNT_FETCH_REQUEST_TYPE = 'ALLFANS_KUAISHOU_FETCH_ACCOUNT_REQUEST';
  const ACCOUNT_FETCH_RESPONSE_TYPE = 'ALLFANS_KUAISHOU_FETCH_ACCOUNT_RESPONSE';
  const MATCHER = '/rest/cp/works/v2/video/pc/photo/list';
  const HOME_INFO_MATCHER = '/rest/cp/creator/pc/home/infoV2';
  const DYNAMIC_HEADER_NAMES = new Set([
    'cookie',
    'host',
    'authority',
    'content-length'
  ]);

  let latestPhotoListRequestTemplate = null;
  let latestAccountRequestTemplate = null;

  const isMatch = url => typeof url === 'string' && url.includes(MATCHER);
  const isHomeInfoMatch = url =>
    typeof url === 'string' && url.includes(HOME_INFO_MATCHER);
  const postCapturedPayload = (type, url, payload) => {
    window.postMessage({ source: SOURCE, type, url, payload }, '*');
  };
  const postFetchResponse = (type, message) => {
    window.postMessage({ source: SOURCE, type, ...message }, '*');
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
    latestAccountRequestTemplate?.url || `${window.location.origin}${HOME_INFO_MATCHER}`;
  const requestWithTemplate = async ({ requestId, url, template, responseType }) => {
    try {
      const response = await window.fetch(url, buildReplayInit(template));
      const payload = await response.clone().json().catch(() => null);

      postFetchResponse(responseType, {
        requestId,
        url,
        ok: response.ok,
        status: response.status,
        payload
      });
    } catch (error) {
      postFetchResponse(responseType, {
        requestId,
        url,
        error: String(error?.message || error || 'Unknown bridge error')
      });
    }
  };
  const requestPhotoListPage = (requestId, url) =>
    requestWithTemplate({
      requestId,
      url,
      template: latestPhotoListRequestTemplate,
      responseType: FETCH_RESPONSE_TYPE
    });
  const requestAccountInfo = async requestId => {
    requestWithTemplate({
      requestId,
      url: buildAccountUrl(),
      template: latestAccountRequestTemplate,
      responseType: ACCOUNT_FETCH_RESPONSE_TYPE
    });
  };

  window.addEventListener('message', event => {
    const payload = event.data;
    if (event.source !== window || payload?.source !== SOURCE) {
      return;
    }

    if (payload.type === FETCH_REQUEST_TYPE && typeof payload.url === 'string') {
      requestPhotoListPage(payload.requestId, payload.url);
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
      if (isMatch(template.url)) {
        latestPhotoListRequestTemplate = template;
        response.clone().json().then(payload => {
          postCapturedPayload(PHOTO_LIST_EVENT_TYPE, template.url, payload);
        }).catch(() => {});
      }

      if (isHomeInfoMatch(template.url)) {
        latestAccountRequestTemplate = template;
        response.clone().json().then(payload => {
          postCapturedPayload(HOME_INFO_EVENT_TYPE, template.url, payload);
        }).catch(() => {});
      }
    } catch {}

    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.__allfansKuaishouUrl = typeof url === 'string' ? url : '';
    this.__allfansKuaishouMethod = typeof method === 'string' ? method : 'GET';
    this.__allfansKuaishouHeaders = [];
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    try {
      this.__allfansKuaishouHeaders.push([name, value]);
    } catch {}

    return originalSetRequestHeader.call(this, name, value);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    this.addEventListener('load', function() {
      try {
        const template = {
          url: this.__allfansKuaishouUrl,
          method: String(this.__allfansKuaishouMethod || 'GET').toUpperCase(),
          headers: Array.isArray(this.__allfansKuaishouHeaders)
            ? this.__allfansKuaishouHeaders
            : [],
          credentials: 'include',
          mode: 'cors',
          cache: 'default',
          redirect: 'follow',
          referrer: window.location.href,
          referrerPolicy: 'strict-origin-when-cross-origin'
        };

        if (isMatch(this.__allfansKuaishouUrl)) {
          latestPhotoListRequestTemplate = template;
          postCapturedPayload(
            PHOTO_LIST_EVENT_TYPE,
            this.__allfansKuaishouUrl,
            JSON.parse(this.responseText)
          );
          return;
        }

        if (isHomeInfoMatch(this.__allfansKuaishouUrl)) {
          latestAccountRequestTemplate = template;
          postCapturedPayload(
            HOME_INFO_EVENT_TYPE,
            this.__allfansKuaishouUrl,
            JSON.parse(this.responseText)
          );
        }
      } catch {}
    });

    return originalSend.apply(this, args);
  };
})();
