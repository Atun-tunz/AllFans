import test from 'node:test';
import assert from 'node:assert/strict';

import { loadDouyinMetrics } from './helpers/load-douyin-metrics.mjs';

const {
  createContentScanState,
  isWorkListResponseUrl,
  buildNextWorkListUrl,
  buildAccountPlatformPatch,
  mergeContentResponse,
  buildContentPlatformPatch,
  hasSufficientDouyinData,
  hasSufficientDouyinAccountData
} = loadDouyinMetrics();

test('isWorkListResponseUrl matches Douyin work list API', () => {
  assert.equal(
    isWorkListResponseUrl(
      'https://creator.douyin.com/janus/douyin/creator/pc/work_list?scene=star_atlas&count=12'
    ),
    true
  );
  assert.equal(
    isWorkListResponseUrl('https://creator.douyin.com/web/api/creator/item/list?count=10&order_by=1'),
    false
  );
});

test('buildNextWorkListUrl updates max_cursor while preserving other query parameters', () => {
  const nextUrl = buildNextWorkListUrl(
    'https://creator.douyin.com/janus/douyin/creator/pc/work_list?scene=star_atlas&status=0&count=12&max_cursor=0&aid=1128',
    1759228221000
  );

  assert.equal(
    nextUrl,
    'https://creator.douyin.com/janus/douyin/creator/pc/work_list?scene=star_atlas&status=0&count=12&max_cursor=1759228221000&aid=1128'
  );
});

test('buildAccountPlatformPatch maps account overview response with nickname priority', () => {
  const patch = buildAccountPlatformPatch(
    {
      user: {
        follower_count: 2026,
        nickname: '阿屯的屯',
        third_name: '另一个名字',
        total_favorited: '11095'
      }
    },
    {
      updateSource: 'https://creator.douyin.com/creator-micro/home',
      timestamp: '2026-04-10T12:00:00.000Z'
    }
  );

  assert.equal(patch.displayName, '阿屯的屯');
  assert.equal(patch.fans, 2026);
  assert.equal(patch.accountLikeCount, 11095);
  assert.equal(patch.accountStatsLastUpdate, '2026-04-10T12:00:00.000Z');
  assert.equal(patch.accountUpdateSource, 'https://creator.douyin.com/creator-micro/home');
});

test('mergeContentResponse stores all aweme statistics from work list response', () => {
  let state = createContentScanState();

  state = mergeContentResponse(state, {
    status_code: 0,
    total: 3,
    aweme_list: [
      {
        statistics: {
          aweme_id: 'a',
          play_count: 100,
          digg_count: 10,
          comment_count: 2,
          share_count: 1,
          collect_count: 3
        }
      },
      {
        statistics: {
          aweme_id: 'b',
          play_count: 50,
          digg_count: 5,
          comment_count: 1,
          share_count: 0,
          collect_count: 1
        }
      }
    ]
  });

  assert.equal(state.responseCount, 1);
  assert.equal(state.scannedItemCount, 2);
  assert.equal(state.hasMore, false);
  assert.equal(state.total, 3);
  assert.deepEqual(Object.keys(state.itemsById).sort(), ['a', 'b']);
});

test('mergeContentResponse deduplicates repeated aweme items across work list pages', () => {
  let state = createContentScanState();

  state = mergeContentResponse(state, {
    status_code: 0,
    total: 3,
    aweme_list: [
      {
        statistics: {
          aweme_id: 'a',
          play_count: 100,
          digg_count: 10,
          comment_count: 2,
          share_count: 1,
          collect_count: 3
        }
      },
      {
        statistics: {
          aweme_id: 'b',
          play_count: 50,
          digg_count: 5,
          comment_count: 1,
          share_count: 0,
          collect_count: 1
        }
      }
    ]
  });

  state = mergeContentResponse(state, {
    status_code: 0,
    total: 3,
    aweme_list: [
      {
        statistics: {
          aweme_id: 'b',
          play_count: 50,
          digg_count: 5,
          comment_count: 1,
          share_count: 0,
          collect_count: 1
        }
      },
      {
        statistics: {
          aweme_id: 'c',
          play_count: 200,
          digg_count: 20,
          comment_count: 4,
          share_count: 2,
          collect_count: 6
        }
      }
    ]
  });

  assert.equal(state.responseCount, 2);
  assert.equal(state.scannedItemCount, 3);
  assert.equal(state.total, 3);
  assert.deepEqual(Object.keys(state.itemsById).sort(), ['a', 'b', 'c']);
});

test('buildContentPlatformPatch aggregates exact totals from aweme statistics', () => {
  let state = createContentScanState();

  state = mergeContentResponse(state, {
    status_code: 0,
    total: 2,
    aweme_list: [
      {
        statistics: {
          aweme_id: '7531588473980046644',
          play_count: 84639,
          digg_count: 1706,
          comment_count: 116,
          share_count: 113,
          collect_count: 939
        }
      },
      {
        statistics: {
          aweme_id: 'b',
          play_count: 5980,
          digg_count: 63,
          comment_count: 11,
          share_count: 3,
          collect_count: 12
        }
      }
    ]
  });

  const patch = buildContentPlatformPatch(state, {
    updateSource: 'https://creator.douyin.com/creator-micro/content/manage',
    timestamp: '2026-04-10T10:00:00.000Z'
  });

  assert.equal(patch.playCount, 90619);
  assert.equal(patch.likeCount, 1769);
  assert.equal(patch.commentCount, 127);
  assert.equal(patch.shareCount, 116);
  assert.equal(patch.favoriteCount, 951);
  assert.equal(patch.worksCount, 2);
  assert.equal(patch.scannedItemCount, 2);
  assert.equal(patch.contentStatsExact, true);
  assert.equal(patch.contentStatsLastUpdate, '2026-04-10T10:00:00.000Z');
  assert.equal(patch.totalWorksCount, 2);
});

test('hasSufficientDouyinData accepts partial content scans with at least one item', () => {
  assert.equal(
    hasSufficientDouyinData({
      worksCount: 1,
      playCount: 0,
      contentStatsExact: true
    }),
    true
  );

  assert.equal(
    hasSufficientDouyinData({
      worksCount: 0,
      playCount: 0,
      contentStatsExact: false
    }),
    false
  );
});

test('buildContentPlatformPatch marks exact empty scans as successful zero-work results', () => {
  let state = createContentScanState();

  state = mergeContentResponse(state, {
    status_code: 0,
    total: 0,
    aweme_list: []
  });

  const patch = buildContentPlatformPatch(state, {
    updateSource: 'https://creator.douyin.com/creator-micro/content/manage',
    timestamp: '2026-04-15T10:00:00.000Z'
  });

  assert.equal(patch.worksCount, 0);
  assert.equal(patch.totalWorksCount, 0);
  assert.equal(patch.scannedItemCount, 0);
  assert.equal(patch.contentStatsExact, true);
});

test('hasSufficientDouyinData accepts exact empty scans with zero works', () => {
  assert.equal(
    hasSufficientDouyinData({
      worksCount: 0,
      totalWorksCount: 0,
      contentStatsExact: true
    }),
    true
  );
});

test('hasSufficientDouyinAccountData accepts account patches with visible profile data', () => {
  assert.equal(
    hasSufficientDouyinAccountData({
      displayName: '阿屯的屯',
      fans: 2026,
      accountLikeCount: 11095
    }),
    true
  );

  assert.equal(
    hasSufficientDouyinAccountData({
      displayName: '',
      fans: 0,
      accountLikeCount: 0
    }),
    false
  );
});
