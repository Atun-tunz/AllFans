(function() {
  const CONTENT_KINDS = ['video', 'imageText'];
  const KIND_PREFIX = {
    video: 'video',
    imageText: 'imageText'
  };
  const ACCOUNT_LIKE_FIELD_KEYS = [
    'accountLikeCount',
    'likeCount',
    'likeCnt',
    'likedCount',
    'likedCnt',
    'praiseCount',
    'totalLikeCount',
    'totalLikedCount',
    'totalLikeCnt',
    'feedLikeCount',
    'receiveLikeCount',
    'receiveLikeCnt',
    'allLikeCount',
    'beLikedCount'
  ];

  function normalizeMetricValue(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, Math.trunc(value));
    }

    return parseInt(String(value ?? '').replace(/[^\d-]/g, ''), 10) || 0;
  }

  function readFirstMetric(source, keys) {
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(source || {}, key)) {
        continue;
      }

      return normalizeMetricValue(source[key]);
    }

    return 0;
  }

  function isAccountResponseUrl(url) {
    return Boolean(url && String(url).includes('/auth/auth_data'));
  }

  function isPostListResponseUrl(url) {
    return Boolean(url && String(url).includes('/post/post_list'));
  }

  function getDecodedPageUrl(url) {
    try {
      const base =
        typeof window !== 'undefined' && window.location?.origin
          ? window.location.origin
          : 'https://channels.weixin.qq.com';
      const target = new URL(String(url), base);
      return String(target.searchParams.get('_pageUrl') || '');
    } catch {
      return '';
    }
  }

  function getEntrypointKind(url) {
    try {
      const base =
        typeof window !== 'undefined' && window.location?.origin
          ? window.location.origin
          : 'https://channels.weixin.qq.com';
      const target = new URL(String(url), base);
      const requestedEntry = target.searchParams.get('allfansEntry');

      if (requestedEntry === 'imageTextContent') {
        return 'imageText';
      }

      if (requestedEntry === 'videoContent') {
        return 'video';
      }
    } catch {}

    return null;
  }

  function getPostListKind(url, fallbackPageUrl = '') {
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
  }

  function createKindScanState() {
    return {
      itemsById: {},
      scannedItemCount: 0,
      responseCount: 0,
      total: 0
    };
  }

  function createContentScanState() {
    return {
      video: createKindScanState(),
      imageText: createKindScanState()
    };
  }

  function hasUsableAccountResponse(response) {
    const finderUser = response?.data?.finderUser;
    return Boolean(
      finderUser &&
        typeof finderUser === 'object' &&
        ('nickname' in finderUser || 'fansCount' in finderUser)
    );
  }

  function hasUsablePostListResponse(response) {
    return Array.isArray(response?.data?.list);
  }

  function getPostListItems(response) {
    return Array.isArray(response?.data?.list) ? response.data.list : [];
  }

  function hasReusableAccountSnapshot(snapshot) {
    return Boolean(
      snapshot?.url &&
        isAccountResponseUrl(snapshot.url) &&
        hasUsableAccountResponse(snapshot?.response)
    );
  }

  function hasReusablePostListSnapshot(snapshot, kind = null) {
    if (!snapshot?.url || !isPostListResponseUrl(snapshot.url) || !hasUsablePostListResponse(snapshot.response)) {
      return false;
    }

    return kind ? getPostListKind(snapshot.url, snapshot.pageUrl) === kind : true;
  }

  function getPostIdentity(item, kind, index) {
    const directId = [
      item?.exportId,
      item?.feedId,
      item?.finderFeedId,
      item?.postId,
      item?.objectId,
      item?.id
    ]
      .map(value => String(value || '').trim())
      .find(Boolean);

    if (directId) {
      return `${kind}:${directId}`;
    }

    return [
      kind,
      index,
      normalizeMetricValue(item?.readCount),
      normalizeMetricValue(item?.likeCount),
      normalizeMetricValue(item?.commentCount),
      normalizeMetricValue(item?.forwardCount),
      normalizeMetricValue(item?.favCount)
    ].join(':');
  }

  function extractPostMetrics(item) {
    return {
      playCount: normalizeMetricValue(item?.readCount),
      likeCount: normalizeMetricValue(item?.likeCount),
      commentCount: normalizeMetricValue(item?.commentCount),
      shareCount: normalizeMetricValue(item?.forwardCount),
      favoriteCount: normalizeMetricValue(item?.favCount)
    };
  }

  function mergePostListResponse(state, response, kind) {
    if (!CONTENT_KINDS.includes(kind)) {
      return state;
    }

    const currentKindState = state?.[kind] || createKindScanState();
    const nextKindState = {
      ...currentKindState,
      itemsById: { ...currentKindState.itemsById },
      responseCount: normalizeMetricValue(currentKindState.responseCount) + 1,
      total: normalizeMetricValue(response?.data?.totalCount)
    };

    for (const [index, item] of getPostListItems(response).entries()) {
      const itemId = getPostIdentity(item, kind, index);
      if (!itemId || nextKindState.itemsById[itemId]) {
        continue;
      }

      nextKindState.itemsById[itemId] = {
        id: itemId,
        metrics: extractPostMetrics(item)
      };
    }

    nextKindState.scannedItemCount = Object.keys(nextKindState.itemsById).length;

    return {
      ...createContentScanState(),
      ...(state || {}),
      [kind]: nextKindState
    };
  }

  function isPostListKindScanComplete(state, kind) {
    if (!CONTENT_KINDS.includes(kind)) {
      return true;
    }

    const kindState = state?.[kind] || createKindScanState();
    const responseCount = normalizeMetricValue(kindState.responseCount);
    const total = normalizeMetricValue(kindState.total);
    const scannedItemCount = normalizeMetricValue(kindState.scannedItemCount);

    if (responseCount <= 0) {
      return false;
    }

    if (total === 0) {
      return true;
    }

    return scannedItemCount >= total;
  }

  function getPostListNextCursor(response) {
    const data = response?.data || {};
    return [
      data.nextCursor,
      data.cursor,
      data.nextBuffer,
      data.lastBuffer,
      data.last_buffer,
      data.nextPageToken,
      data.pageToken
    ]
      .map(value => (value === 0 ? '0' : String(value || '').trim()))
      .find(Boolean) || null;
  }

  function buildNextPostListPageRequest(response, kindState = createKindScanState(), pageOffset = 1) {
    const items = getPostListItems(response);
    const scannedItemCount = normalizeMetricValue(kindState.scannedItemCount);
    const pageSize = Math.max(
      items.length,
      normalizeMetricValue(response?.data?.pageSize),
      normalizeMetricValue(response?.data?.page_size),
      normalizeMetricValue(response?.data?.count),
      1
    );

    return {
      pageOffset: Math.max(1, normalizeMetricValue(pageOffset)),
      offset: scannedItemCount,
      pageSize,
      cursor: getPostListNextCursor(response)
    };
  }

  function buildKindTotals(kindState = createKindScanState()) {
    const totals = {
      playCount: 0,
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      favoriteCount: 0,
      worksCount: 0,
      totalWorksCount: normalizeMetricValue(kindState.total),
      scannedItemCount: normalizeMetricValue(kindState.scannedItemCount),
      responseCount: normalizeMetricValue(kindState.responseCount)
    };

    for (const item of Object.values(kindState.itemsById || {})) {
      totals.playCount += normalizeMetricValue(item?.metrics?.playCount);
      totals.likeCount += normalizeMetricValue(item?.metrics?.likeCount);
      totals.commentCount += normalizeMetricValue(item?.metrics?.commentCount);
      totals.shareCount += normalizeMetricValue(item?.metrics?.shareCount);
      totals.favoriteCount += normalizeMetricValue(item?.metrics?.favoriteCount);
      totals.worksCount += 1;
    }

    totals.scannedItemCount = totals.worksCount;
    return totals;
  }

  function readKindTotals(source, kind) {
    const prefix = KIND_PREFIX[kind];
    return {
      playCount: normalizeMetricValue(source?.[`${prefix}PlayCount`]),
      likeCount: normalizeMetricValue(source?.[`${prefix}LikeCount`]),
      commentCount: normalizeMetricValue(source?.[`${prefix}CommentCount`]),
      shareCount: normalizeMetricValue(source?.[`${prefix}ShareCount`]),
      favoriteCount: normalizeMetricValue(source?.[`${prefix}FavoriteCount`]),
      worksCount: normalizeMetricValue(source?.[`${prefix}WorksCount`]),
      totalWorksCount: normalizeMetricValue(source?.[`${prefix}TotalWorksCount`]),
      scannedItemCount: normalizeMetricValue(source?.[`${prefix}ScannedItemCount`]),
      responseCount: normalizeMetricValue(source?.[`${prefix}ResponseCount`])
    };
  }

  function writeKindTotals(target, kind, totals) {
    const prefix = KIND_PREFIX[kind];
    target[`${prefix}PlayCount`] = totals.playCount;
    target[`${prefix}LikeCount`] = totals.likeCount;
    target[`${prefix}CommentCount`] = totals.commentCount;
    target[`${prefix}ShareCount`] = totals.shareCount;
    target[`${prefix}FavoriteCount`] = totals.favoriteCount;
    target[`${prefix}WorksCount`] = totals.worksCount;
    target[`${prefix}TotalWorksCount`] = totals.totalWorksCount;
    target[`${prefix}ScannedItemCount`] = totals.scannedItemCount;
    target[`${prefix}ResponseCount`] = totals.responseCount;
  }

  function buildAggregateContentPatch(kindTotalsByKind, { updateSource, timestamp } = {}) {
    const patch = {
      playCount: 0,
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      favoriteCount: 0,
      worksCount: 0,
      totalWorksCount: 0,
      scannedItemCount: 0,
      contentStatsLastUpdate: timestamp || null,
      contentStatsExact: false,
      updateSource: updateSource || null
    };

    let allKindsResponded = true;
    let allKindTotalsExact = true;

    for (const kind of CONTENT_KINDS) {
      const totals = kindTotalsByKind[kind] || readKindTotals(null, kind);
      writeKindTotals(patch, kind, totals);

      patch.playCount += totals.playCount;
      patch.likeCount += totals.likeCount;
      patch.commentCount += totals.commentCount;
      patch.shareCount += totals.shareCount;
      patch.favoriteCount += totals.favoriteCount;
      patch.worksCount += totals.worksCount;
      patch.totalWorksCount += totals.totalWorksCount;
      patch.scannedItemCount += totals.scannedItemCount;

      if (totals.responseCount <= 0) {
        allKindsResponded = false;
      }

      if (totals.worksCount !== totals.totalWorksCount) {
        allKindTotalsExact = false;
      }
    }

    patch.contentStatsExact = allKindsResponded && allKindTotalsExact;
    return patch;
  }

  function buildContentPlatformPatch(state, options = {}) {
    const kindTotalsByKind = Object.fromEntries(
      CONTENT_KINDS.map(kind => [kind, buildKindTotals(state?.[kind])])
    );

    return buildAggregateContentPatch(kindTotalsByKind, options);
  }

  function mergeContentPatchWithStoredData(storedData, contentPatch) {
    const kindTotalsByKind = Object.fromEntries(
      CONTENT_KINDS.map(kind => {
        const patchTotals = readKindTotals(contentPatch, kind);
        const storedTotals = readKindTotals(storedData, kind);
        return [kind, patchTotals.responseCount > 0 ? patchTotals : storedTotals];
      })
    );

    return buildAggregateContentPatch(kindTotalsByKind, {
      updateSource: contentPatch?.updateSource || storedData?.updateSource || null,
      timestamp: contentPatch?.contentStatsLastUpdate || null
    });
  }

  function buildAccountPlatformPatch(response, { updateSource, timestamp } = {}) {
    const finderUser = response?.data?.finderUser || {};
    const data = response?.data || {};
    const accountLikeCount =
      readFirstMetric(finderUser, ACCOUNT_LIKE_FIELD_KEYS) ||
      readFirstMetric(data, ACCOUNT_LIKE_FIELD_KEYS);

    return {
      displayName: String(finderUser.nickname || '').trim(),
      fans: normalizeMetricValue(finderUser.fansCount),
      accountLikeCount,
      accountStatsLastUpdate: timestamp || null,
      accountUpdateSource: updateSource || null
    };
  }

  function hasSufficientWeixinChannelsAccountData(platformPatch) {
    return (
      String(platformPatch?.displayName || '').trim().length > 0 ||
      Number(platformPatch?.fans) > 0 ||
      Number(platformPatch?.accountLikeCount) > 0
    );
  }

  function hasSufficientWeixinChannelsData(platformPatch) {
    const hasContentKindResponse = CONTENT_KINDS.some(
      kind => readKindTotals(platformPatch, kind).responseCount > 0
    );

    return (
      Number(platformPatch?.worksCount) > 0 ||
      Number(platformPatch?.playCount) > 0 ||
      Number(platformPatch?.likeCount) > 0 ||
      Number(platformPatch?.commentCount) > 0 ||
      Number(platformPatch?.shareCount) > 0 ||
      Number(platformPatch?.favoriteCount) > 0 ||
      hasContentKindResponse ||
      (Boolean(platformPatch?.contentStatsExact) && Number(platformPatch?.totalWorksCount) === 0)
    );
  }

  globalThis.AllFansWeixinChannelsMetrics = {
    normalizeMetricValue,
    createContentScanState,
    isAccountResponseUrl,
    isPostListResponseUrl,
    getPostListKind,
    hasUsableAccountResponse,
    hasUsablePostListResponse,
    hasReusableAccountSnapshot,
    hasReusablePostListSnapshot,
    mergePostListResponse,
    isPostListKindScanComplete,
    buildNextPostListPageRequest,
    buildAccountPlatformPatch,
    buildContentPlatformPatch,
    mergeContentPatchWithStoredData,
    hasSufficientWeixinChannelsAccountData,
    hasSufficientWeixinChannelsData
  };
})();
