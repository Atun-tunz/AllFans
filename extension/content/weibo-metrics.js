(function() {
  const CONTENT_KINDS = ['video', 'article'];
  const KIND_PREFIX = {
    video: 'video',
    article: 'article'
  };
  const ARTICLE_VIEW_KEYS = [
    'read_count',
    'readCount',
    'view_count',
    'viewCount',
    'views_count',
    'viewsCount',
    'play_count',
    'playCount',
    'watch_count',
    'watchCount'
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

  function createKindState() {
    return {
      itemsById: {},
      responseCount: 0
    };
  }

  function createContentScanState() {
    return {
      video: createKindState(),
      article: createKindState()
    };
  }

  function getVideoItems(response) {
    return Array.isArray(response?.data?.videos) ? response.data.videos : [];
  }

  function getArticleItems(response) {
    return Array.isArray(response?.data?.list) ? response.data.list : [];
  }

  function hasUsableAccountResponse(response) {
    const user = response?.data?.user;
    return Boolean(
      user &&
        typeof user === 'object' &&
        ('screen_name' in user || 'followers_count' in user)
    );
  }

  function hasUsableVideoListResponse(response) {
    return Array.isArray(response?.data?.videos);
  }

  function hasUsableArticleListResponse(response) {
    return Array.isArray(response?.data?.list);
  }

  function hasReusableAccountSnapshot(snapshot) {
    return Boolean(snapshot?.url && hasUsableAccountResponse(snapshot?.response));
  }

  function hasReusableVideoListSnapshot(snapshot) {
    return Boolean(snapshot?.url && hasUsableVideoListResponse(snapshot?.response));
  }

  function hasReusableArticleListSnapshot(snapshot) {
    return Boolean(snapshot?.url && hasUsableArticleListResponse(snapshot?.response));
  }

  function getItemIdentity(item, kind, index) {
    const directId = [
      item?.id,
      item?.mid,
      item?.mblogid,
      item?.article_id,
      item?.articleId,
      item?.video_id,
      item?.videoId,
      item?.object_id,
      item?.objectId
    ]
      .map(value => String(value || '').trim())
      .find(Boolean);

    if (directId) {
      return `${kind}:${directId}`;
    }

    return [
      kind,
      index,
      normalizeMetricValue(item?.statistics?.play_count),
      normalizeMetricValue(item?.statistics?.attitude_count),
      normalizeMetricValue(item?.countList?.attitudes_count),
      normalizeMetricValue(item?.countList?.comments_count)
    ].join(':');
  }

  function extractVideoMetrics(item) {
    const statistics = item?.statistics || {};
    return {
      playCount: normalizeMetricValue(statistics.play_count),
      likeCount: normalizeMetricValue(statistics.attitude_count),
      commentCount: normalizeMetricValue(statistics.comment_count),
      shareCount: normalizeMetricValue(statistics.reposts_count),
      danmakuCount: normalizeMetricValue(statistics.danmaku_count)
    };
  }

  function extractArticleMetrics(item) {
    const countList = item?.countList || {};
    return {
      playCount: readFirstMetric(item, ARTICLE_VIEW_KEYS) || readFirstMetric(countList, ARTICLE_VIEW_KEYS),
      likeCount: normalizeMetricValue(countList.attitudes_count),
      commentCount: normalizeMetricValue(countList.comments_count),
      shareCount: normalizeMetricValue(countList.reposts_count),
      danmakuCount: 0
    };
  }

  function mergeItemsResponse(state, response, kind) {
    if (!CONTENT_KINDS.includes(kind)) {
      return state || createContentScanState();
    }

    const items = kind === 'video' ? getVideoItems(response) : getArticleItems(response);
    const currentKindState = state?.[kind] || createKindState();
    const nextKindState = {
      ...currentKindState,
      itemsById: { ...currentKindState.itemsById },
      responseCount: normalizeMetricValue(currentKindState.responseCount) + 1
    };

    for (const [index, item] of items.entries()) {
      const itemId = getItemIdentity(item, kind, index);
      if (!itemId || nextKindState.itemsById[itemId]) {
        continue;
      }

      nextKindState.itemsById[itemId] = {
        id: itemId,
        metrics: kind === 'video' ? extractVideoMetrics(item) : extractArticleMetrics(item)
      };
    }

    return {
      ...createContentScanState(),
      ...(state || {}),
      [kind]: nextKindState
    };
  }

  function mergeVideoListResponse(state, response) {
    return mergeItemsResponse(state, response, 'video');
  }

  function mergeArticleListResponse(state, response) {
    return mergeItemsResponse(state, response, 'article');
  }

  function buildKindTotals(kindState = createKindState()) {
    const totals = {
      playCount: 0,
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      danmakuCount: 0,
      worksCount: 0,
      responseCount: normalizeMetricValue(kindState.responseCount)
    };

    for (const item of Object.values(kindState.itemsById || {})) {
      totals.playCount += normalizeMetricValue(item?.metrics?.playCount);
      totals.likeCount += normalizeMetricValue(item?.metrics?.likeCount);
      totals.commentCount += normalizeMetricValue(item?.metrics?.commentCount);
      totals.shareCount += normalizeMetricValue(item?.metrics?.shareCount);
      totals.danmakuCount += normalizeMetricValue(item?.metrics?.danmakuCount);
      totals.worksCount += 1;
    }

    return totals;
  }

  function readKindTotals(source, kind) {
    const prefix = KIND_PREFIX[kind];
    return {
      playCount: normalizeMetricValue(source?.[`${prefix}PlayCount`]),
      likeCount: normalizeMetricValue(source?.[`${prefix}LikeCount`]),
      commentCount: normalizeMetricValue(source?.[`${prefix}CommentCount`]),
      shareCount: normalizeMetricValue(source?.[`${prefix}ShareCount`]),
      danmakuCount: normalizeMetricValue(source?.[`${prefix}DanmakuCount`]),
      worksCount: normalizeMetricValue(source?.[`${prefix}WorksCount`]),
      responseCount: normalizeMetricValue(source?.[`${prefix}ResponseCount`])
    };
  }

  function writeKindTotals(target, kind, totals) {
    const prefix = KIND_PREFIX[kind];
    target[`${prefix}PlayCount`] = totals.playCount;
    target[`${prefix}LikeCount`] = totals.likeCount;
    target[`${prefix}CommentCount`] = totals.commentCount;
    target[`${prefix}ShareCount`] = totals.shareCount;
    target[`${prefix}DanmakuCount`] = totals.danmakuCount;
    target[`${prefix}WorksCount`] = totals.worksCount;
    target[`${prefix}ResponseCount`] = totals.responseCount;
  }

  function buildContentPlatformPatch(state, { updateSource, timestamp } = {}) {
    const patch = {
      playCount: 0,
      likeCount: 0,
      accountLikeCount: 0,
      commentCount: 0,
      shareCount: 0,
      danmakuCount: 0,
      worksCount: 0,
      totalWorksCount: 0,
      scannedItemCount: 0,
      contentStatsLastUpdate: timestamp || null,
      contentStatsExact: false,
      updateSource: updateSource || null
    };

    let allKindsResponded = true;

    for (const kind of CONTENT_KINDS) {
      const totals = buildKindTotals(state?.[kind]);
      writeKindTotals(patch, kind, totals);

      patch.playCount += totals.playCount;
      patch.likeCount += totals.likeCount;
      patch.commentCount += totals.commentCount;
      patch.shareCount += totals.shareCount;
      patch.danmakuCount += totals.danmakuCount;
      patch.worksCount += totals.worksCount;

      if (totals.responseCount <= 0) {
        allKindsResponded = false;
      }
    }

    patch.accountLikeCount = patch.likeCount;
    patch.totalWorksCount = patch.worksCount;
    patch.scannedItemCount = patch.worksCount;
    patch.contentStatsExact = allKindsResponded;
    return patch;
  }

  function mergeContentPatchWithStoredData(storedData, contentPatch) {
    const kindTotalsByKind = Object.fromEntries(
      CONTENT_KINDS.map(kind => {
        const patchTotals = readKindTotals(contentPatch, kind);
        const storedTotals = readKindTotals(storedData, kind);
        return [kind, patchTotals.responseCount > 0 ? patchTotals : storedTotals];
      })
    );

    const state = createContentScanState();
    const patch = {
      playCount: 0,
      likeCount: 0,
      accountLikeCount: 0,
      commentCount: 0,
      shareCount: 0,
      danmakuCount: 0,
      worksCount: 0,
      totalWorksCount: 0,
      scannedItemCount: 0,
      contentStatsLastUpdate: contentPatch?.contentStatsLastUpdate || null,
      contentStatsExact: true,
      updateSource: contentPatch?.updateSource || storedData?.updateSource || null
    };

    for (const kind of CONTENT_KINDS) {
      const totals = kindTotalsByKind[kind] || buildKindTotals(state[kind]);
      writeKindTotals(patch, kind, totals);
      patch.playCount += totals.playCount;
      patch.likeCount += totals.likeCount;
      patch.commentCount += totals.commentCount;
      patch.shareCount += totals.shareCount;
      patch.danmakuCount += totals.danmakuCount;
      patch.worksCount += totals.worksCount;

      if (totals.responseCount <= 0) {
        patch.contentStatsExact = false;
      }
    }

    patch.accountLikeCount = patch.likeCount;
    patch.totalWorksCount = patch.worksCount;
    patch.scannedItemCount = patch.worksCount;
    return patch;
  }

  function buildAccountPlatformPatch(response, { updateSource, timestamp } = {}) {
    const user = response?.data?.user || {};

    return {
      displayName: String(user.screen_name || '').trim(),
      fans: normalizeMetricValue(user.followers_count),
      accountStatsLastUpdate: timestamp || null,
      accountUpdateSource: updateSource || null
    };
  }

  function hasSufficientWeiboAccountData(platformPatch) {
    return (
      String(platformPatch?.displayName || '').trim().length > 0 ||
      Number(platformPatch?.fans) > 0
    );
  }

  function hasSufficientWeiboContentData(platformPatch) {
    return (
      Number(platformPatch?.worksCount) > 0 ||
      Number(platformPatch?.playCount) > 0 ||
      Number(platformPatch?.likeCount) > 0 ||
      Number(platformPatch?.commentCount) > 0 ||
      Number(platformPatch?.shareCount) > 0 ||
      Number(platformPatch?.danmakuCount) > 0 ||
      Boolean(platformPatch?.videoResponseCount) ||
      Boolean(platformPatch?.articleResponseCount) ||
      (Boolean(platformPatch?.contentStatsExact) && Number(platformPatch?.totalWorksCount) === 0)
    );
  }

  globalThis.AllFansWeiboMetrics = {
    normalizeMetricValue,
    createContentScanState,
    hasUsableAccountResponse,
    hasUsableVideoListResponse,
    hasUsableArticleListResponse,
    hasReusableAccountSnapshot,
    hasReusableVideoListSnapshot,
    hasReusableArticleListSnapshot,
    mergeVideoListResponse,
    mergeArticleListResponse,
    buildAccountPlatformPatch,
    buildContentPlatformPatch,
    mergeContentPatchWithStoredData,
    hasSufficientWeiboAccountData,
    hasSufficientWeiboContentData
  };
})();
