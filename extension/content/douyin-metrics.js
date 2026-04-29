(function() {
  function normalizeMetricValue(value) {
    return parseInt(String(value ?? '').replace(/[^\d-]/g, ''), 10) || 0;
  }

  function createContentScanState() {
    return {
      itemsById: {},
      scannedItemCount: 0,
      responseCount: 0,
      total: 0
    };
  }

  function isWorkListResponseUrl(url) {
    if (!url) return false;
    return String(url).includes('/janus/douyin/creator/pc/work_list');
  }

  function hasUsableWorkListResponse(response) {
    return response?.status_code === 0 && Array.isArray(response?.aweme_list);
  }

  function hasReusableWorkListSnapshot(snapshot) {
    return Boolean(
      snapshot?.url &&
        isWorkListResponseUrl(snapshot.url) &&
        hasUsableWorkListResponse(snapshot?.response)
    );
  }

  function buildNextWorkListUrl(url, nextCursor) {
    const target = new URL(String(url), globalThis.location?.origin || 'https://creator.douyin.com');
    target.searchParams.set('max_cursor', String(nextCursor));
    return target.toString();
  }

  function buildAccountPlatformPatch(response, { updateSource, timestamp } = {}) {
    const user = response?.user || {};

    return {
      displayName: String(user.nickname || user.third_name || '').trim(),
      fans: normalizeMetricValue(user.follower_count),
      accountLikeCount: normalizeMetricValue(user.total_favorited),
      accountStatsLastUpdate: timestamp || null,
      accountUpdateSource: updateSource || null
    };
  }

  function mergeContentResponse(state, response) {
    const nextState = {
      ...state,
      itemsById: { ...state.itemsById },
      responseCount: state.responseCount + 1,
      total: normalizeMetricValue(response?.total)
    };

    for (const item of response?.aweme_list || []) {
      const itemId = String(item?.statistics?.aweme_id || '').trim();
      if (!itemId || nextState.itemsById[itemId]) continue;

      nextState.itemsById[itemId] = {
        id: itemId,
        metrics: {
          viewCount: normalizeMetricValue(item?.statistics?.play_count),
          likeCount: normalizeMetricValue(item?.statistics?.digg_count),
          commentCount: normalizeMetricValue(item?.statistics?.comment_count),
          shareCount: normalizeMetricValue(item?.statistics?.share_count),
          favoriteCount: normalizeMetricValue(item?.statistics?.collect_count)
        }
      };
    }

    nextState.scannedItemCount = Object.keys(nextState.itemsById).length;

    return nextState;
  }

  function buildContentPlatformPatch(state, { updateSource, timestamp } = {}) {
    const patch = {
      playCount: 0,
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      favoriteCount: 0,
      worksCount: 0,
      totalWorksCount: normalizeMetricValue(state?.total),
      scannedItemCount: 0,
      contentStatsLastUpdate: timestamp || null,
      contentStatsExact: false,
      updateSource: updateSource || null
    };

    for (const item of Object.values(state?.itemsById || {})) {
      patch.playCount += item.metrics.viewCount;
      patch.likeCount += item.metrics.likeCount;
      patch.commentCount += item.metrics.commentCount;
      patch.shareCount += item.metrics.shareCount;
      patch.favoriteCount += item.metrics.favoriteCount;
      patch.worksCount += 1;
    }

    patch.scannedItemCount = patch.worksCount;
    patch.contentStatsExact =
      normalizeMetricValue(state?.responseCount) > 0 &&
      patch.totalWorksCount === patch.worksCount;

    return patch;
  }

  function hasSufficientDouyinAccountData(platformPatch) {
    return (
      Number(platformPatch?.fans) > 0 ||
      Number(platformPatch?.accountLikeCount) > 0 ||
      Boolean(platformPatch?.displayName)
    );
  }

  globalThis.AllFansDouyinMetrics = {
    createContentScanState,
    isWorkListResponseUrl,
    hasUsableWorkListResponse,
    hasReusableWorkListSnapshot,
    buildNextWorkListUrl,
    buildAccountPlatformPatch,
    mergeContentResponse,
    buildContentPlatformPatch,
    hasSufficientDouyinAccountData
  };
})();
