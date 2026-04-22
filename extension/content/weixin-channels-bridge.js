(() => {
  if (window.__allfansWeixinChannelsBridgeInstalled) return;
  window.__allfansWeixinChannelsBridgeInstalled = true;

  const SOURCE = 'allfans-weixin-channels-bridge';
  const ACCOUNT_EVENT_TYPE = 'ALLFANS_WEIXIN_CHANNELS_ACCOUNT_RESPONSE';
  const POST_LIST_EVENT_TYPE = 'ALLFANS_WEIXIN_CHANNELS_POST_LIST_RESPONSE';
  const ACCOUNT_FETCH_REQUEST_TYPE = 'ALLFANS_WEIXIN_CHANNELS_FETCH_ACCOUNT_REQUEST';
  const ACCOUNT_FETCH_RESPONSE_TYPE = 'ALLFANS_WEIXIN_CHANNELS_FETCH_ACCOUNT_RESPONSE';
  const POST_LIST_FETCH_REQUEST_TYPE = 'ALLFANS_WEIXIN_CHANNELS_FETCH_POST_LIST_REQUEST';
  const POST_LIST_FETCH_RESPONSE_TYPE = 'ALLFANS_WEIXIN_CHANNELS_FETCH_POST_LIST_RESPONSE';
  const RESET_POST_LIST_TEMPLATES_REQUEST_TYPE = 'ALLFANS_WEIXIN_CHANNELS_RESET_POST_LIST_TEMPLATES_REQUEST';
  const ACCOUNT_MATCHER = '/auth/auth_data';
  const POST_LIST_MATCHER = '/post/post_list';
  const DYNAMIC_HEADER_NAMES = new Set([
    'cookie',
    'host',
    'authority',
    'content-length'
  ]);
  const PAGE_PARAM_NAMES = ['page', 'pageNum', 'page_num', 'pageIndex', 'page_index', 'pageNo', 'page_no', 'currentPage'];
  const OFFSET_PARAM_NAMES = ['offset', 'start', 'begin', 'from'];
  const CURSOR_PARAM_NAMES = ['cursor', 'nextCursor', 'lastBuffer', 'last_buffer', 'pageToken'];

  let latestAccountRequestTemplate = null;
  const latestPostListRequestTemplates = {
    video: null,
    imageText: null,
    unclassified: null
  };

  const isAccountMatch = url => typeof url === 'string' && url.includes(ACCOUNT_MATCHER);
  const isPostListMatch = url => typeof url === 'string' && url.includes(POST_LIST_MATCHER);
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
  const getDecodedPageUrl = url => {
    try {
      const target = new URL(String(url), window.location.origin);
      return String(target.searchParams.get('_pageUrl') || '');
    } catch {
      return '';
    }
  };
  const getEntrypointKind = url => {
    try {
      const target = new URL(String(url), window.location.origin);
      const requestedEntry = target.searchParams.get('allfansEntry');
      if (requestedEntry === 'imageTextContent') {
        return 'imageText';
      }
      if (requestedEntry === 'videoContent') {
        return 'video';
      }
    } catch {}
    return null;
  };
  const getPostListKind = (url, fallbackPageUrl = '') => {
    const pageUrl = `${getDecodedPageUrl(url)} ${fallbackPageUrl} ${url || ''}`;
    if (
      pageUrl.includes('/platform/post/finderNewLifePostList') ||
      pageUrl.includes('/micro/content/post/finderNewLifePostList')
    ) {
      return 'imageText';
    }
    if (
      pageUrl.includes('/platform/post/list') ||
      pageUrl.includes('/micro/content/post/list')
    ) {
      return 'video';
    }
    return getEntrypointKind(fallbackPageUrl) || getEntrypointKind(url);
  };
  function postBridgeMessage(message) {
    const payload = { source: SOURCE, frameUrl: window.location.href, ...message };
    window.postMessage(payload, '*');

    if (window.top && window.top !== window) {
      window.top.postMessage(payload, '*');
    }
  }
  const postAccountPayload = (url, payload) => {
    postBridgeMessage({ type: ACCOUNT_EVENT_TYPE, url, payload });
  };
  const postPostListPayload = (url, kind, pageUrl, payload) => {
    postBridgeMessage({ type: POST_LIST_EVENT_TYPE, url, kind, pageUrl, payload });
  };
  const postFetchResponse = message => {
    postBridgeMessage(message);
  };
  function resetPostListTemplates() {
    latestPostListRequestTemplates.video = null;
    latestPostListRequestTemplates.imageText = null;
    latestPostListRequestTemplates.unclassified = null;
  }
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
    const body = typeof init.body === 'string' ? init.body : null;

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
      body
    };
  };
  const buildReplayInit = template => {
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
  };
  const toNonNegativeInteger = value => {
    const number = parseInt(String(value ?? '').replace(/[^\d-]/g, ''), 10);
    return Number.isFinite(number) && number >= 0 ? number : 0;
  };
  const applyPaginationParams = (params, pageRequest) => {
    let changed = false;
    const pageOffset = Math.max(1, toNonNegativeInteger(pageRequest.pageOffset));
    const offset = toNonNegativeInteger(pageRequest.offset);
    const cursor = pageRequest.cursor === 0 ? '0' : String(pageRequest.cursor || '').trim();

    for (const name of PAGE_PARAM_NAMES) {
      if (!params.has(name)) {
        continue;
      }

      params.set(name, String(toNonNegativeInteger(params.get(name)) + pageOffset));
      changed = true;
    }

    for (const name of OFFSET_PARAM_NAMES) {
      if (!params.has(name)) {
        continue;
      }

      params.set(name, String(offset));
      changed = true;
    }

    if (cursor) {
      for (const name of CURSOR_PARAM_NAMES) {
        if (!params.has(name)) {
          continue;
        }

        params.set(name, cursor);
        changed = true;
      }
    }

    return changed;
  };
  const applyPaginationObject = (body, pageRequest) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return false;
    }

    let changed = false;
    const pageOffset = Math.max(1, toNonNegativeInteger(pageRequest.pageOffset));
    const offset = toNonNegativeInteger(pageRequest.offset);
    const cursor = pageRequest.cursor === 0 ? '0' : String(pageRequest.cursor || '').trim();

    for (const name of PAGE_PARAM_NAMES) {
      if (!Object.prototype.hasOwnProperty.call(body, name)) {
        continue;
      }

      body[name] = toNonNegativeInteger(body[name]) + pageOffset;
      changed = true;
    }

    for (const name of OFFSET_PARAM_NAMES) {
      if (!Object.prototype.hasOwnProperty.call(body, name)) {
        continue;
      }

      body[name] = offset;
      changed = true;
    }

    if (cursor) {
      for (const name of CURSOR_PARAM_NAMES) {
        if (!Object.prototype.hasOwnProperty.call(body, name)) {
          continue;
        }

        body[name] = cursor;
        changed = true;
      }
    }

    return changed;
  };
  function applyPostListPagination(template, pageRequest) {
    if (!pageRequest) {
      return template;
    }

    const paginatedTemplate = { ...template };

    try {
      const url = new URL(paginatedTemplate.url, window.location.origin);
      if (applyPaginationParams(url.searchParams, pageRequest)) {
        paginatedTemplate.url = url.href;
      }
    } catch {}

    if (typeof paginatedTemplate.body === 'string' && paginatedTemplate.body.trim()) {
      try {
        const body = JSON.parse(paginatedTemplate.body);
        if (applyPaginationObject(body, pageRequest)) {
          paginatedTemplate.body = JSON.stringify(body);
        }
      } catch {}
    }

    return paginatedTemplate;
  }
  const rememberTemplate = template => {
    if (isAccountMatch(template.url)) {
      latestAccountRequestTemplate = template;
      return;
    }

    if (!isPostListMatch(template.url)) {
      return;
    }

    const kind = getPostListKind(template.url, template.pageUrl);
    if (kind) {
      latestPostListRequestTemplates[kind] = template;
    } else {
      latestPostListRequestTemplates.unclassified = template;
    }
  };
  const requestAccountInfo = async requestId => {
    const template = latestAccountRequestTemplate;
    if (!template?.url) {
      postFetchResponse({
        type: ACCOUNT_FETCH_RESPONSE_TYPE,
        requestId,
        error: 'Weixin Channels account request template is unavailable'
      });
      return;
    }

    try {
      const response = await window.fetch(template.url, buildReplayInit(template));
      const payload = await response.clone().json().catch(() => null);

      postFetchResponse({
        type: ACCOUNT_FETCH_RESPONSE_TYPE,
        requestId,
        url: template.url,
        pageUrl: template.pageUrl,
        ok: response.ok,
        status: response.status,
        payload
      });
    } catch (error) {
      postFetchResponse({
        type: ACCOUNT_FETCH_RESPONSE_TYPE,
        requestId,
        url: template.url,
        error: String(error?.message || error || 'Unknown bridge error')
      });
    }
  };
  const requestPostList = async (requestId, kind, pageRequest = null, options = {}) => {
    const template =
      latestPostListRequestTemplates[kind] || latestPostListRequestTemplates.unclassified;
    if (!template?.url) {
      if (options.allowMissingTemplate) {
        return;
      }

      postFetchResponse({
        type: POST_LIST_FETCH_RESPONSE_TYPE,
        requestId,
        kind,
        error: 'Weixin Channels post list request template is unavailable'
      });
      return;
    }

    try {
      const paginatedTemplate = applyPostListPagination(template, pageRequest);
      const response = await window.fetch(
        paginatedTemplate.url,
        buildReplayInit(paginatedTemplate)
      );
      const payload = await response.clone().json().catch(() => null);

      postFetchResponse({
        type: POST_LIST_FETCH_RESPONSE_TYPE,
        requestId,
        kind,
        url: paginatedTemplate.url,
        pageUrl: paginatedTemplate.pageUrl,
        ok: response.ok,
        status: response.status,
        payload
      });
    } catch (error) {
      postFetchResponse({
        type: POST_LIST_FETCH_RESPONSE_TYPE,
        requestId,
        kind,
        url: template.url,
        error: String(error?.message || error || 'Unknown bridge error')
      });
    }
  };

  window.addEventListener('message', event => {
    const payload = event.data;
    if (payload?.source !== SOURCE) {
      return;
    }

    if (payload.type === ACCOUNT_FETCH_REQUEST_TYPE) {
      requestAccountInfo(payload.requestId);
      return;
    }

    if (payload.type === POST_LIST_FETCH_REQUEST_TYPE) {
      requestPostList(payload.requestId, payload.kind, payload.pageRequest || null, {
        allowMissingTemplate: payload.allowMissingTemplate
      });
      return;
    }

    if (payload.type === RESET_POST_LIST_TEMPLATES_REQUEST_TYPE) {
      resetPostListTemplates();
    }
  });

  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);

    try {
      const template = captureFetchTemplate(args);
      rememberTemplate(template);

      if (isAccountMatch(template.url)) {
        response.clone().json().then(payload => postAccountPayload(template.url, payload)).catch(() => {});
      }

      if (isPostListMatch(template.url)) {
        const kind = getPostListKind(template.url, template.pageUrl);
        response.clone().json().then(payload => postPostListPayload(template.url, kind, template.pageUrl, payload)).catch(() => {});
      }
    } catch {}

    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.__allfansWeixinChannelsUrl = typeof url === 'string' ? url : '';
    this.__allfansWeixinChannelsMethod = typeof method === 'string' ? method : 'GET';
    this.__allfansWeixinChannelsHeaders = [];
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    try {
      this.__allfansWeixinChannelsHeaders.push([name, value]);
    } catch {}

    return originalSetRequestHeader.call(this, name, value);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    this.addEventListener('load', function() {
      try {
        const template = {
          url: this.__allfansWeixinChannelsUrl,
          pageUrl: window.location.href,
          method: String(this.__allfansWeixinChannelsMethod || 'GET').toUpperCase(),
          headers: Array.isArray(this.__allfansWeixinChannelsHeaders)
            ? this.__allfansWeixinChannelsHeaders
            : [],
          credentials: 'include',
          mode: 'cors',
          cache: 'default',
          redirect: 'follow',
          referrer: window.location.href,
          referrerPolicy: 'strict-origin-when-cross-origin',
          body: typeof args[0] === 'string' ? args[0] : null
        };

        rememberTemplate(template);

        if (isAccountMatch(template.url)) {
          postAccountPayload(template.url, JSON.parse(this.responseText));
          return;
        }

        if (isPostListMatch(template.url)) {
          const kind = getPostListKind(template.url, template.pageUrl);
          postPostListPayload(template.url, kind, template.pageUrl, JSON.parse(this.responseText));
        }
      } catch {}
    });

    return originalSend.apply(this, args);
  };
})();
