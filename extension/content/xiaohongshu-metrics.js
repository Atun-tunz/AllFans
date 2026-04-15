(function() {
  function normalizeMetricValue(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, Math.trunc(value));
    }

    const raw = String(value ?? '').trim();
    if (!raw) {
      return 0;
    }

    const compact = raw.replace(/,/g, '');
    const matched = compact.match(/^(-?\d+(?:\.\d+)?)([万亿wW])?$/);
    if (matched) {
      const base = Number(matched[1]);
      const unit = matched[2];
      if (!Number.isFinite(base)) {
        return 0;
      }

      if (unit === '万' || unit === 'w' || unit === 'W') {
        return Math.max(0, Math.round(base * 10000));
      }

      if (unit === '亿') {
        return Math.max(0, Math.round(base * 100000000));
      }

      return Math.max(0, Math.round(base));
    }

    return parseInt(compact.replace(/[^\d-]/g, ''), 10) || 0;
  }

  function createContentScanState() {
    return {
      itemsById: {},
      scannedItemCount: 0,
      responseCount: 0,
      total: 0,
      reachedEnd: false
    };
  }

  function isPostedNotesResponseUrl(url) {
    if (!url) return false;
    return String(url).includes('/api/galaxy/v2/creator/note/user/posted');
  }

  function isPersonalInfoResponseUrl(url) {
    if (!url) return false;
    return String(url).includes('/api/galaxy/creator/home/personal_info');
  }

  function getTabFromUrl(url) {
    try {
      const target = new URL(String(url));
      return normalizeMetricValue(target.searchParams.get('tab'));
    } catch {
      return 0;
    }
  }

  function isPrimaryPostedNotesResponseUrl(url) {
    return isPostedNotesResponseUrl(url) && getTabFromUrl(url) === 0;
  }

  function hasReusablePostedSnapshot(snapshot) {
    return Boolean(
      snapshot?.url &&
        isPrimaryPostedNotesResponseUrl(snapshot.url) &&
        hasUsablePostedResponse(snapshot?.response)
    );
  }

  function hasUsablePostedResponse(response) {
    return Array.isArray(response?.data?.notes);
  }

  function hasUsablePersonalInfoResponse(response) {
    return Boolean(response?.data && typeof response.data === 'object');
  }

  function buildNextPostedNotesUrl(url, nextPage) {
    const target = new URL(String(url));
    target.searchParams.set('page', String(nextPage));
    return target.toString();
  }

  function getPageFromUrl(url) {
    try {
      const target = new URL(String(url));
      return normalizeMetricValue(target.searchParams.get('page'));
    } catch {
      return 0;
    }
  }

  function hasReusablePersonalInfoSnapshot(snapshot) {
    return Boolean(
      snapshot?.url &&
        isPersonalInfoResponseUrl(snapshot.url) &&
        hasUsablePersonalInfoResponse(snapshot?.response)
    );
  }

  function getResponseItems(response) {
    return Array.isArray(response?.data?.notes) ? response.data.notes : [];
  }

  function getTagTotalCount(response) {
    const tags = Array.isArray(response?.data?.tags) ? response.data.tags : [];
    return tags.reduce((sum, tag) => sum + normalizeMetricValue(tag?.note_count), 0);
  }

  function getNoteIdentity(note, index) {
    const directId = [
      note?.note_id,
      note?.noteId,
      note?.id,
      note?.noteid,
      note?.item_id,
      note?.itemId
    ]
      .map(value => String(value || '').trim())
      .find(Boolean);

    if (directId) {
      return directId;
    }

    const signature = JSON.stringify({
      title: note?.title || '',
      publishTime: note?.publish_time || note?.publishTime || '',
      cover: note?.cover_url || note?.coverUrl || '',
      index
    });

    return signature;
  }

  function extractNoteMetrics(note) {
    return {
      viewCount: normalizeMetricValue(note?.view_count),
      likeCount: normalizeMetricValue(note?.likes ?? note?.like_count ?? note?.likes_count),
      commentCount: normalizeMetricValue(
        note?.comments_count ?? note?.comment_count ?? note?.coments_count
      ),
      shareCount: normalizeMetricValue(note?.shared_count ?? note?.share_count),
      favoriteCount: normalizeMetricValue(note?.collected_count ?? note?.collect_count)
    };
  }

  function mergeContentResponse(state, response) {
    const nextState = {
      ...state,
      itemsById: { ...state.itemsById },
      responseCount: state.responseCount + 1,
      total: Math.max(state.total, getTagTotalCount(response)),
      reachedEnd: state.reachedEnd
    };

    const notes = getResponseItems(response);
    if (notes.length === 0) {
      nextState.reachedEnd = true;
    }

    notes.forEach((note, index) => {
      const itemId = getNoteIdentity(note, index);
      if (!itemId || nextState.itemsById[itemId]) {
        return;
      }

      nextState.itemsById[itemId] = {
        id: itemId,
        metrics: extractNoteMetrics(note)
      };
    });

    nextState.scannedItemCount = Object.keys(nextState.itemsById).length;
    nextState.total = Math.max(nextState.total, nextState.scannedItemCount);

    return nextState;
  }

  function buildContentPlatformPatch(state, { updateSource, timestamp, displayName } = {}) {
    const patch = {
      displayName: String(displayName || '').trim(),
      playCount: 0,
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      favoriteCount: 0,
      worksCount: 0,
      totalWorksCount: normalizeMetricValue(state?.total),
      scannedItemCount: normalizeMetricValue(state?.scannedItemCount),
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
    patch.totalWorksCount = Math.max(patch.totalWorksCount, patch.worksCount);
    patch.contentStatsExact =
      Boolean(state?.reachedEnd) ||
      (patch.totalWorksCount === patch.worksCount &&
        (patch.worksCount > 0 || normalizeMetricValue(state?.responseCount) > 0));

    return patch;
  }

  function buildAccountPlatformPatch(response, { updateSource, timestamp } = {}) {
    return {
      displayName: String(response?.data?.name || '').trim(),
      fans: normalizeMetricValue(response?.data?.fans_count),
      accountLikeCount: normalizeMetricValue(response?.data?.faved_count),
      accountStatsLastUpdate: timestamp || null,
      accountUpdateSource: updateSource || null
    };
  }

  function hasSufficientXiaohongshuData(platformPatch) {
    return (
      Number(platformPatch?.worksCount) > 0 ||
      Number(platformPatch?.playCount) > 0 ||
      Number(platformPatch?.likeCount) > 0 ||
      Number(platformPatch?.commentCount) > 0 ||
      Number(platformPatch?.shareCount) > 0 ||
      Number(platformPatch?.favoriteCount) > 0 ||
      (Boolean(platformPatch?.contentStatsExact) && Number(platformPatch?.totalWorksCount) === 0)
    );
  }

  function hasSufficientXiaohongshuAccountData(platformPatch) {
    return (
      Number(platformPatch?.fans) > 0 || String(platformPatch?.displayName || '').trim().length > 0
    );
  }

  globalThis.AllFansXiaohongshuMetrics = {
    normalizeMetricValue,
    createContentScanState,
    isPostedNotesResponseUrl,
    isPersonalInfoResponseUrl,
    isPrimaryPostedNotesResponseUrl,
    hasReusablePostedSnapshot,
    hasReusablePersonalInfoSnapshot,
    hasUsablePostedResponse,
    hasUsablePersonalInfoResponse,
    buildNextPostedNotesUrl,
    getTabFromUrl,
    getPageFromUrl,
    getResponseItems,
    mergeContentResponse,
    buildAccountPlatformPatch,
    buildContentPlatformPatch,
    hasSufficientXiaohongshuAccountData,
    hasSufficientXiaohongshuData
  };
})();
