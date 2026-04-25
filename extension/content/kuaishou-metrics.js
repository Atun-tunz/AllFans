(function() {
  function normalizeMetricValue(value) {
    return parseInt(String(value ?? '').replace(/[^\d-]/g, ''), 10) || 0;
  }

  function createContentScanState() {
    return {
      itemsById: {},
      displayName: '',
      scannedItemCount: 0,
      responseCount: 0,
      total: 0
    };
  }

  function isPhotoListResponseUrl(url) {
    if (!url) return false;
    return String(url).includes('/rest/cp/works/v2/video/pc/photo/list');
  }

  function isHomeInfoResponseUrl(url) {
    if (!url) return false;
    return String(url).includes('/rest/cp/creator/pc/home/infoV2');
  }

  function hasUsablePhotoListResponse(response) {
    return response?.result === 1 && Array.isArray(response?.data?.list);
  }

  function hasUsableHomeInfoResponse(response) {
    const data = response?.data;
    return Boolean(
      data &&
        typeof data === 'object' &&
        ('userName' in data || 'fansCnt' in data || 'likeCnt' in data)
    );
  }

  function hasReusablePhotoListSnapshot(snapshot) {
    return Boolean(
      snapshot?.url &&
        isPhotoListResponseUrl(snapshot.url) &&
        hasUsablePhotoListResponse(snapshot?.response)
    );
  }

  function hasReusableHomeInfoSnapshot(snapshot) {
    return Boolean(
      snapshot?.url &&
        isHomeInfoResponseUrl(snapshot.url) &&
        hasUsableHomeInfoResponse(snapshot?.response)
    );
  }

  function buildNextPhotoListUrl(url, nextCursor) {
    const target = new URL(String(url));
    if (nextCursor) {
      target.searchParams.set('cursor', String(nextCursor));
    }
    return target.toString();
  }

  function getItemId(item, index) {
    const explicitId = String(
      item?.photoId ||
        item?.photo_id ||
        item?.workId ||
        item?.work_id ||
        item?.id ||
        item?.photo?.photoId ||
        item?.photo?.id ||
        ''
    ).trim();

    if (explicitId) {
      return explicitId;
    }

    return [
      'fallback',
      index,
      item?.userName || item?.user_name || '',
      item?.caption || item?.title || '',
      normalizeMetricValue(item?.playCount || item?.play_count),
      normalizeMetricValue(item?.likeCount || item?.like_count),
      normalizeMetricValue(item?.commentCount || item?.comment_count)
    ].join(':');
  }

  function getItemDisplayName(item) {
    return String(
      item?.userName ||
        item?.user_name ||
        item?.authorName ||
        item?.author_name ||
        item?.user?.name ||
        ''
    ).trim();
  }

  function mergeContentResponse(state, response) {
    const nextState = {
      ...state,
      itemsById: { ...state.itemsById },
      displayName: state.displayName || '',
      responseCount: state.responseCount + 1,
      total: normalizeMetricValue(response?.data?.total)
    };

    for (const [index, item] of (response?.data?.list || []).entries()) {
      const displayName = getItemDisplayName(item);
      if (!nextState.displayName && displayName) {
        nextState.displayName = displayName;
      }

      const itemId = getItemId(item, index);
      if (!itemId || nextState.itemsById[itemId]) continue;

      nextState.itemsById[itemId] = {
        id: itemId,
        metrics: {
          playCount: normalizeMetricValue(item?.playCount || item?.play_count),
          likeCount: normalizeMetricValue(item?.likeCount || item?.like_count),
          commentCount: normalizeMetricValue(item?.commentCount || item?.comment_count)
        }
      };
    }

    nextState.scannedItemCount = Object.keys(nextState.itemsById).length;
    return nextState;
  }

  function buildContentPlatformPatch(state, { updateSource, timestamp } = {}) {
    const patch = {
      displayName: String(state?.displayName || '').trim(),
      playCount: 0,
      likeCount: 0,
      commentCount: 0,
      worksCount: 0,
      totalWorksCount: normalizeMetricValue(state?.total),
      scannedItemCount: 0,
      contentStatsLastUpdate: timestamp || null,
      contentStatsExact: false,
      updateSource: updateSource || null
    };

    for (const item of Object.values(state?.itemsById || {})) {
      patch.playCount += item.metrics.playCount;
      patch.likeCount += item.metrics.likeCount;
      patch.commentCount += item.metrics.commentCount;
      patch.worksCount += 1;
    }

    patch.scannedItemCount = patch.worksCount;
    patch.contentStatsExact =
      normalizeMetricValue(state?.responseCount) > 0 &&
      patch.totalWorksCount === patch.worksCount;

    return patch;
  }

  function buildAccountPlatformPatch(response, { updateSource, timestamp } = {}) {
    const data = response?.data || {};

    return {
      displayName: String(data.userName || '').trim(),
      fans: normalizeMetricValue(data.fansCnt),
      accountLikeCount: normalizeMetricValue(data.likeCnt),
      accountStatsLastUpdate: timestamp || null,
      accountUpdateSource: updateSource || null
    };
  }

  function hasSufficientKuaishouData(platformPatch) {
    return (
      Number(platformPatch?.worksCount) > 0 ||
      (Boolean(platformPatch?.contentStatsExact) && Number(platformPatch?.totalWorksCount) === 0)
    );
  }

  function hasSufficientKuaishouAccountData(platformPatch) {
    return (
      String(platformPatch?.displayName || '').trim().length > 0 ||
      Number(platformPatch?.fans) > 0 ||
      Number(platformPatch?.accountLikeCount) > 0
    );
  }

  globalThis.AllFansKuaishouMetrics = {
    normalizeMetricValue,
    createContentScanState,
    isPhotoListResponseUrl,
    isHomeInfoResponseUrl,
    hasUsablePhotoListResponse,
    hasUsableHomeInfoResponse,
    hasReusablePhotoListSnapshot,
    hasReusableHomeInfoSnapshot,
    buildNextPhotoListUrl,
    mergeContentResponse,
    buildAccountPlatformPatch,
    buildContentPlatformPatch,
    hasSufficientKuaishouData,
    hasSufficientKuaishouAccountData
  };
})();
