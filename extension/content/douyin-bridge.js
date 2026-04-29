(() => {
  if (window.__allfansDouyinBridgeInstalled) return;
  window.__allfansDouyinBridgeInstalled = true;

  const SOURCE = 'allfans-douyin-bridge';
  const EVENT_TYPE = 'ALLFANS_DOUYIN_WORK_LIST_RESPONSE';
  const FETCH_REQUEST_TYPE = 'ALLFANS_DOUYIN_FETCH_PAGE_REQUEST';
  const FETCH_RESPONSE_TYPE = 'ALLFANS_DOUYIN_FETCH_PAGE_RESPONSE';
  const MATCHER = '/janus/douyin/creator/pc/work_list';
  let latestWorkListRequestTemplate = null;

  const isMatch = url => typeof url === 'string' && url.includes(MATCHER);
  const postPayload = (url, payload) => {
    window.postMessage({ source: SOURCE, type: EVENT_TYPE, url, payload }, '*');
  };

  const normalizeHeaders = headers => {
    const normalized = {};
    try {
      new Headers(headers || {}).forEach((value, key) => {
        normalized[key] = value;
      });
    } catch {}
    return normalized;
  };

  const rememberTemplate = template => {
    latestWorkListRequestTemplate = {
      ...template,
      headers: normalizeHeaders(template.headers)
    };
  };

  const buildReplayInit = template => ({
    method: template.method || 'GET',
    credentials: template.credentials || 'include',
    mode: template.mode || 'cors',
    headers: { ...(template.headers || {}) },
    body: template.body || undefined
  });

  const requestWithTemplate = async url => {
    if (!latestWorkListRequestTemplate) {
      throw new Error('Douyin work_list request template is not available');
    }

    const response = await originalFetch(url, buildReplayInit(latestWorkListRequestTemplate));
    const payload = await response.clone().json();
    window.postMessage(
      {
        source: SOURCE,
        type: FETCH_RESPONSE_TYPE,
        requestId: latestWorkListRequestTemplate.requestId,
        url,
        ok: response.ok,
        status: response.status,
        payload
      },
      '*'
    );
  };

  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);

    try {
      const request = args[0];
      const init = args[1] || {};
      const url =
        typeof request === 'string'
          ? request
          : request && typeof request.url === 'string'
            ? request.url
            : '';

      if (isMatch(url)) {
        rememberTemplate({
          url,
          method: init.method || request?.method || 'GET',
          credentials: init.credentials || request?.credentials || 'include',
          mode: init.mode || request?.mode || 'cors',
          headers: init.headers || request?.headers || {},
          body: init.body || null
        });
        response.clone().json().then(payload => postPayload(url, payload)).catch(() => {});
      }
    } catch {}

    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.__allfansDouyinUrl = typeof url === 'string' ? url : '';
    this.__allfansDouyinMethod = method || 'GET';
    this.__allfansDouyinHeaders = {};
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
    if (this.__allfansDouyinHeaders) {
      this.__allfansDouyinHeaders[header] = value;
    }
    return originalSetRequestHeader.call(this, header, value);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    this.addEventListener('load', function() {
      try {
        if (!isMatch(this.__allfansDouyinUrl)) return;
        rememberTemplate({
          url: this.__allfansDouyinUrl,
          method: this.__allfansDouyinMethod || 'GET',
          credentials: 'include',
          mode: 'cors',
          headers: this.__allfansDouyinHeaders || {},
          body: args[0] || null
        });
        postPayload(this.__allfansDouyinUrl, JSON.parse(this.responseText));
      } catch {}
    });

    return originalSend.apply(this, args);
  };

  window.addEventListener('message', event => {
    const payload = event.data;
    if (event.source !== window || payload?.source !== SOURCE || payload?.type !== FETCH_REQUEST_TYPE) {
      return;
    }

    latestWorkListRequestTemplate = {
      ...(latestWorkListRequestTemplate || {}),
      requestId: payload.requestId
    };

    requestWithTemplate(payload.url).catch(error => {
      window.postMessage(
        {
          source: SOURCE,
          type: FETCH_RESPONSE_TYPE,
          requestId: payload.requestId,
          url: payload.url,
          ok: false,
          status: 0,
          error: error instanceof Error ? error.message : String(error)
        },
        '*'
      );
    });
  });
})();
