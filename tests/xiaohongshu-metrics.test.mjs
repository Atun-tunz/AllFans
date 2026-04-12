import test from 'node:test';
import assert from 'node:assert/strict';

import { loadXiaohongshuMetrics } from './helpers/load-xiaohongshu-metrics.mjs';

const {
  createContentScanState,
  isPostedNotesResponseUrl,
  isPersonalInfoResponseUrl,
  isPrimaryPostedNotesResponseUrl,
  buildNextPostedNotesUrl,
  getTabFromUrl,
  hasReusablePersonalInfoSnapshot,
  hasReusablePostedSnapshot,
  hasUsablePersonalInfoResponse,
  hasUsablePostedResponse,
  mergeContentResponse,
  buildAccountPlatformPatch,
  buildContentPlatformPatch,
  hasSufficientXiaohongshuAccountData,
  hasSufficientXiaohongshuData
} = loadXiaohongshuMetrics();

test('isPostedNotesResponseUrl matches Xiaohongshu posted note API', () => {
  assert.equal(
    isPostedNotesResponseUrl(
      'https://creator.xiaohongshu.com/api/galaxy/v2/creator/note/user/posted?tab=0&page=0'
    ),
    true
  );
  assert.equal(
    isPostedNotesResponseUrl(
      'https://creator.xiaohongshu.com/api/galaxy/v2/creator/note/user/drafts?tab=0&page=0'
    ),
    false
  );
});

test('isPersonalInfoResponseUrl matches Xiaohongshu account API', () => {
  assert.equal(
    isPersonalInfoResponseUrl('https://creator.xiaohongshu.com/api/galaxy/creator/home/personal_info'),
    true
  );
  assert.equal(
    isPersonalInfoResponseUrl(
      'https://creator.xiaohongshu.com/api/galaxy/v2/creator/note/user/posted?tab=0&page=0'
    ),
    false
  );
});

test('isPrimaryPostedNotesResponseUrl only accepts the tab=0 note list', () => {
  assert.equal(
    isPrimaryPostedNotesResponseUrl(
      'https://creator.xiaohongshu.com/api/galaxy/v2/creator/note/user/posted?tab=0&page=0'
    ),
    true
  );
  assert.equal(
    isPrimaryPostedNotesResponseUrl(
      'https://creator.xiaohongshu.com/api/galaxy/v2/creator/note/user/posted?tab=1&page=0'
    ),
    false
  );
});

test('buildNextPostedNotesUrl updates page while preserving other query parameters', () => {
  const nextUrl = buildNextPostedNotesUrl(
    'https://creator.xiaohongshu.com/api/galaxy/v2/creator/note/user/posted?tab=0&page=0',
    3
  );

  assert.equal(
    nextUrl,
    'https://creator.xiaohongshu.com/api/galaxy/v2/creator/note/user/posted?tab=0&page=3'
  );
});

test('getTabFromUrl parses the current tab parameter', () => {
  assert.equal(
    getTabFromUrl(
      'https://creator.xiaohongshu.com/api/galaxy/v2/creator/note/user/posted?tab=0&page=0'
    ),
    0
  );
  assert.equal(
    getTabFromUrl(
      'https://creator.xiaohongshu.com/api/galaxy/v2/creator/note/user/posted?tab=1&page=0'
    ),
    1
  );
});

test('hasReusablePostedSnapshot accepts a captured primary response with notes array', () => {
  assert.equal(
    hasReusablePostedSnapshot({
      url: 'https://creator.xiaohongshu.com/api/galaxy/v2/creator/note/user/posted?tab=0&page=0',
      response: {
        data: {
          notes: []
        }
      }
    }),
    true
  );

  assert.equal(
    hasReusablePostedSnapshot({
      url: 'https://creator.xiaohongshu.com/api/galaxy/v2/creator/note/user/posted?tab=1&page=0',
      response: {
        data: {
          notes: []
        }
      }
    }),
    false
  );

  assert.equal(
    hasReusablePostedSnapshot({
      url: 'https://creator.xiaohongshu.com/api/galaxy/v2/creator/note/user/posted?tab=0&page=0',
      response: {
        code: -1,
        success: false
      }
    }),
    false
  );
});

test('hasReusablePersonalInfoSnapshot accepts a captured account response', () => {
  assert.equal(
    hasReusablePersonalInfoSnapshot({
      url: 'https://creator.xiaohongshu.com/api/galaxy/creator/home/personal_info',
      response: {
        data: {
          name: 'PPKooBow',
          fans_count: 18
        }
      }
    }),
    true
  );

  assert.equal(
    hasReusablePersonalInfoSnapshot({
      url: 'https://creator.xiaohongshu.com/api/galaxy/creator/home/personal_info',
      response: {
        code: -1,
        success: false
      }
    }),
    false
  );
});

test('hasUsablePostedResponse rejects error payloads and accepts note arrays', () => {
  assert.equal(
    hasUsablePostedResponse({
      data: {
        notes: []
      }
    }),
    true
  );

  assert.equal(
    hasUsablePostedResponse({
      code: -1,
      success: false
    }),
    false
  );

  assert.equal(
    hasUsablePostedResponse({
      success: true,
      data: {}
    }),
    false
  );
});

test('hasUsablePersonalInfoResponse accepts account payloads and rejects error payloads', () => {
  assert.equal(
    hasUsablePersonalInfoResponse({
      data: {
        name: 'PPKooBow',
        fans_count: 18
      }
    }),
    true
  );

  assert.equal(
    hasUsablePersonalInfoResponse({
      code: -1,
      success: false
    }),
    false
  );
});

test('buildAccountPlatformPatch extracts display name and fan count', () => {
  const patch = buildAccountPlatformPatch(
    {
      data: {
        name: 'PPKooBow',
        fans_count: 18,
        faved_count: 22
      }
    },
    {
      updateSource: 'https://creator.xiaohongshu.com/api/galaxy/creator/home/personal_info',
      timestamp: '2026-04-12T08:00:00.000Z'
    }
  );

  assert.equal(patch.displayName, 'PPKooBow');
  assert.equal(patch.fans, 18);
  assert.equal(patch.accountLikeCount, 22);
  assert.equal(patch.accountStatsLastUpdate, '2026-04-12T08:00:00.000Z');
});

test('mergeContentResponse stores note metrics and infers total count from tags', () => {
  let state = createContentScanState();

  state = mergeContentResponse(state, {
    data: {
      notes: [
        {
          note_id: 'xhs-1',
          view_count: 120,
          comments_count: 4,
          shared_count: 3,
          collected_count: 2,
          likes: 11
        },
        {
          note_id: 'xhs-2',
          view_count: 50,
          comments_count: 1,
          shared_count: 0,
          collected_count: 1,
          likes: 7
        }
      ],
      tags: [
        { note_count: 2 },
        { note_count: 1 }
      ]
    }
  });

  assert.equal(state.responseCount, 1);
  assert.equal(state.scannedItemCount, 2);
  assert.equal(state.reachedEnd, false);
  assert.equal(state.total, 3);
  assert.deepEqual(Object.keys(state.itemsById).sort(), ['xhs-1', 'xhs-2']);
});

test('mergeContentResponse deduplicates repeated note items across pages', () => {
  let state = createContentScanState();

  state = mergeContentResponse(state, {
    data: {
      notes: [
        {
          note_id: 'xhs-1',
          view_count: 120,
          comments_count: 4,
          shared_count: 3,
          collected_count: 2,
          likes: 11
        },
        {
          note_id: 'xhs-2',
          view_count: 50,
          comments_count: 1,
          shared_count: 0,
          collected_count: 1,
          likes: 7
        }
      ],
      tags: [{ note_count: 3 }]
    }
  });

  state = mergeContentResponse(state, {
    data: {
      notes: [
        {
          note_id: 'xhs-2',
          view_count: 50,
          comments_count: 1,
          shared_count: 0,
          collected_count: 1,
          likes: 7
        },
        {
          note_id: 'xhs-3',
          view_count: 300,
          comments_count: 9,
          shared_count: 5,
          collected_count: 6,
          likes: 28
        }
      ],
      tags: [{ note_count: 3 }]
    }
  });

  assert.equal(state.responseCount, 2);
  assert.equal(state.scannedItemCount, 3);
  assert.equal(state.total, 3);
  assert.deepEqual(Object.keys(state.itemsById).sort(), ['xhs-1', 'xhs-2', 'xhs-3']);
});

test('buildContentPlatformPatch aggregates note statistics and marks exact scans at end', () => {
  let state = createContentScanState();

  state = mergeContentResponse(state, {
    data: {
      notes: [
        {
          note_id: 'xhs-1',
          view_count: 120,
          comments_count: 4,
          shared_count: 3,
          collected_count: 2,
          likes: 11
        },
        {
          note_id: 'xhs-2',
          view_count: 50,
          comments_count: 1,
          shared_count: 0,
          collected_count: 1,
          likes: 7
        }
      ],
      tags: [{ note_count: 2 }]
    }
  });

  state = mergeContentResponse(state, {
    data: {
      notes: [],
      tags: [{ note_count: 2 }]
    }
  });

  const patch = buildContentPlatformPatch(state, {
    updateSource: 'https://creator.xiaohongshu.com/new/note-manager',
    timestamp: '2026-04-12T06:00:00.000Z'
  });

  assert.equal(patch.playCount, 170);
  assert.equal(patch.likeCount, 18);
  assert.equal(patch.commentCount, 5);
  assert.equal(patch.shareCount, 3);
  assert.equal(patch.favoriteCount, 3);
  assert.equal(patch.worksCount, 2);
  assert.equal(patch.totalWorksCount, 2);
  assert.equal(patch.scannedItemCount, 2);
  assert.equal(patch.contentStatsExact, true);
  assert.equal(patch.contentStatsLastUpdate, '2026-04-12T06:00:00.000Z');
});

test('hasSufficientXiaohongshuData accepts partial scans with at least one note', () => {
  assert.equal(
    hasSufficientXiaohongshuData({
      worksCount: 1,
      playCount: 120
    }),
    true
  );

  assert.equal(
    hasSufficientXiaohongshuData({
      worksCount: 0,
      playCount: 0
    }),
    false
  );
});

test('hasSufficientXiaohongshuAccountData accepts either name or fan count', () => {
  assert.equal(
    hasSufficientXiaohongshuAccountData({
      displayName: 'PPKooBow',
      fans: 0
    }),
    true
  );

  assert.equal(
    hasSufficientXiaohongshuAccountData({
      displayName: '',
      fans: 18
    }),
    true
  );

  assert.equal(
    hasSufficientXiaohongshuAccountData({
      displayName: '',
      fans: 0
    }),
    false
  );
});

test('hasSufficientXiaohongshuData accepts notes even when aggregated play count is zero', () => {
  assert.equal(
    hasSufficientXiaohongshuData({
      worksCount: 3,
      playCount: 0,
      likeCount: 0
    }),
    true
  );
});
