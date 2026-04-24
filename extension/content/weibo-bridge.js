(() => {
  if (window.__allfansWeiboBridgeInstalled) return;
  window.__allfansWeiboBridgeInstalled = true;

  const SOURCE = 'allfans-weibo-bridge';
  const ACCOUNT_EVENT_TYPE = 'ALLFANS_WEIBO_ACCOUNT_RESPONSE';
  const VIDEO_LIST_EVENT_TYPE = 'ALLFANS_WEIBO_VIDEO_LIST_RESPONSE';
  const ARTICLE_LIST_EVENT_TYPE = 'ALLFANS_WEIBO_ARTICLE_LIST_RESPONSE';
  const FETCH_REQUEST_TYPE = 'ALLFANS_WEIBO_FETCH_REQUEST';
  const FETCH_RESPONSE_TYPE = 'ALLFANS_WEIBO_FETCH_RESPONSE';
  const DYNAMIC_HEADER_NAMES = new Set([
    'cookie',
    'host',
    'authority',
    'content-length'
  ]);

  const latestTemplates = {
    account: null,
    video: null,
    article: null
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

  const isWeiboUrl = url => {
    try {
      const target = new URL(String(url), window.location.href);
      return target.hostname === 'weibo.com' || target.hostname === 'me.weibo.com';
    } catch {
      return false;
    }
  };

  const hasAccountShape = payload => {
    const user = payload?.data?.user;
    return Boolean(
      user &&
        typeof user === 'object' &&
        ('screen_name' in user || 'followers_count' in user)
    );
  };

  const hasVideoListShape = payload => Array.isArray(payload?.data?.videos);
  const hasArticleListShape = payload => Array.isArray(payload?.data?.list);

  const classifyPayload = payload => {
    if (hasAccountShape(payload)) {
      return 'account';
    }

    if (hasVideoListShape(payload)) {
      return 'video';
    }

    if (hasArticleListShape(payload)) {
      return 'article';
    }

    return null;
  };

  const getEventTypeForKind = kind => {
    if (kind === 'account') return ACCOUNT_EVENT_TYPE;
    if (kind === 'video') return VIDEO_LIST_EVENT_TYPE;
    if (kind === 'article') return ARTICLE_LIST_EVENT_TYPE;
    return null;
  };

  function postBridgeMessage(message) {
    window.postMessage({ source: SOURCE, frameUrl: window.location.href, ...message }, '*');
  }

  function captureFetchTemplate(args) {
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
      pageUrl: window.location.href,
      method: String(init.method || request?.method || 'GET').toUpperCase(),
      headers: serializeHeaders(init.headers || request?.headers),
      credentials: init.credentials || request?.credentials || 'include',
      mode: init.mode || request?.mode || 'cors',
      cache: init.cache || request?.cache || 'default',
      redirect: init.redirect || request?.redirect || 'follow',
      referrer: init.referrer || request?.referrer || window.location.href,
      referrerPolicy:
        init.referrerPolicy || request?.referrerPolicy || 'strict-origin-when-cross-origin',
      body: typeof init.body === 'string' ? init.body : null
    };
  }

  function buildReplayInit(template) {
    const init = {
      method: template?.method || 'GET',
      headers: sanitizeHeaders(template?.headers),
      credentials: 'include',
      mode: template?.mode || 'cors',
      cache: template?.cache || 'default',
      redirect: template?.redirect || 'follow',
      referrer: window.location.href,
      referrerPolicy: template?.referrerPolicy || 'strict-origin-when-cross-origin'
    };

    if (template?.body && init.method !== 'GET' && init.method !== 'HEAD') {
      init.body = template.body;
    }

    return init;
  }

  function rememberPayload(template, payload) {
    if (!isWeiboUrl(template?.url)) {
      return;
    }

    const kind = classifyPayload(payload);
    const eventType = getEventTypeForKind(kind);
    if (!kind || !eventType) {
      return;
    }

    latestTemplates[kind] = template;
    postBridgeMessage({
      type: eventType,
      kind,
      url: template.url,
      pageUrl: template.pageUrl,
      payload
    });
  }

  async function replayLatestTemplate(requestId, kind) {
    const template = latestTemplates[kind];
    if (!template?.url) {
      postBridgeMessage({
        type: FETCH_RESPONSE_TYPE,
        requestId,
        kind,
        error: `Weibo ${kind} request template is unavailable`
      });
      return;
    }

    try {
      const response = await window.fetch(template.url, buildReplayInit(template));
      const payload = await response.clone().json().catch(() => null);

      postBridgeMessage({
        type: FETCH_RESPONSE_TYPE,
        requestId,
        kind,
        url: template.url,
        pageUrl: template.pageUrl,
        ok: response.ok,
        status: response.status,
        payload
      });
    } catch (error) {
      postBridgeMessage({
        type: FETCH_RESPONSE_TYPE,
        requestId,
        kind,
        url: template.url,
        error: String(error?.message || error || 'Unknown bridge error')
      });
    }
  }

  window.addEventListener('message', event => {
    const payload = event.data;
    if (payload?.source !== SOURCE || payload.type !== FETCH_REQUEST_TYPE) {
      return;
    }

    replayLatestTemplate(payload.requestId, payload.kind);
  });

  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);

    try {
      const template = captureFetchTemplate(args);
      if (isWeiboUrl(template.url)) {
        response.clone().json().then(payload => rememberPayload(template, payload)).catch(() => {});
      }
    } catch {}

    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.__allfansWeiboUrl = typeof url === 'string' ? url : '';
    this.__allfansWeiboMethod = typeof method === 'string' ? method : 'GET';
    this.__allfansWeiboHeaders = [];
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    try {
      this.__allfansWeiboHeaders.push([name, value]);
    } catch {}

    return originalSetRequestHeader.call(this, name, value);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    this.addEventListener('load', function() {
      try {
        const template = {
          url: this.__allfansWeiboUrl,
          pageUrl: window.location.href,
          method: String(this.__allfansWeiboMethod || 'GET').toUpperCase(),
          headers: Array.isArray(this.__allfansWeiboHeaders) ? this.__allfansWeiboHeaders : [],
          credentials: 'include',
          mode: 'cors',
          cache: 'default',
          redirect: 'follow',
          referrer: window.location.href,
          referrerPolicy: 'strict-origin-when-cross-origin',
          body: typeof args[0] === 'string' ? args[0] : null
        };

        if (!isWeiboUrl(template.url)) {
          return;
        }

        rememberPayload(template, JSON.parse(this.responseText));
      } catch {}
    });

    return originalSend.apply(this, args);
  };
})();
