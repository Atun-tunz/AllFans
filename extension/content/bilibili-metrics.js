(function() {
  const METRIC_FIELD_BY_ICON = {
    'icon-sprite-dc-play': 'playCount',
    'icon-sprite-dc-reply': 'commentCount',
    'icon-sprite-dc-dm': 'danmakuCount',
    'icon-sprite-dc-share': 'shareCount',
    'icon-sprite-dc-fav': 'favoriteCount',
    'icon-sprite-dc-coin': 'coinCount'
  };

  function parseCount(text) {
    if (!text) return 0;
    return parseInt(String(text).replace(/,/g, ''), 10) || 0;
  }

  function parseSignedCount(text) {
    if (!text) return 0;
    return parseInt(String(text).replace(/[^-\d]/g, ''), 10) || 0;
  }

  function getMetricFieldFromClassList(classList) {
    const matchedIcon = Array.from(classList).find(className =>
      className.startsWith('icon-sprite-dc-')
    );

    return matchedIcon ? METRIC_FIELD_BY_ICON[matchedIcon] || null : null;
  }

  function hasSufficientBilibiliData(result) {
    return Boolean(result?.stats?.fansFound) && Number(result?.stats?.videoMetricCount) > 0;
  }

  function buildApiSnapshot(response, updateSource) {
    const payload = response?.data || {};

    return {
      data: {
        platform: 'bilibili',
        fans: parseCount(payload.total_fans),
        fansChangeToday: parseSignedCount(payload.incr_fans),
        playCount: parseCount(payload.total_click),
        likeCount: parseCount(payload.total_like),
        commentCount: parseCount(payload.total_reply),
        danmakuCount: parseCount(payload.total_dm),
        shareCount: parseCount(payload.total_share),
        favoriteCount: parseCount(payload.total_fav),
        coinCount: parseCount(payload.total_coin),
        updateSource: updateSource || null
      },
      stats: {
        fansFound: payload.total_fans !== undefined && payload.total_fans !== null,
        videoMetricCount: [
          payload.total_click,
          payload.total_like,
          payload.total_reply,
          payload.total_dm,
          payload.total_share,
          payload.total_fav,
          payload.total_coin
        ].filter(value => value !== undefined && value !== null).length
      }
    };
  }

  function buildUserPatch(response) {
    const payload = response?.data || {};

    return {
      uid: parseCount(payload.mid),
      displayName: String(payload.uname || payload.name || '').trim()
    };
  }

  globalThis.AllFansBilibiliMetrics = {
    parseCount,
    parseSignedCount,
    getMetricFieldFromClassList,
    hasSufficientBilibiliData,
    buildApiSnapshot,
    buildUserPatch
  };
})();
