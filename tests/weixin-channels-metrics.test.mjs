import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';

const metricsPath = join(process.cwd(), 'extension', 'content', 'weixin-channels-metrics.js');
const metricsCode = readFileSync(metricsPath, 'utf-8');

eval(metricsCode);

const metrics = globalThis.AllFansWeixinChannelsMetrics;
const SAMPLE_NAME = '\u793a\u4f8b\u8d26\u53f7';

test('Weixin Channels account response maps nickname, fans, and account likes without persistent account ids', () => {
  const timestamp = '2026-04-22T00:00:00.000Z';
  const patch = metrics.buildAccountPlatformPatch(
    {
      data: {
        finderUser: {
          nickname: SAMPLE_NAME,
          fansCount: 18,
          likeCount: 7,
          uniqId: 'exampleFinderUser'
        }
      }
    },
    {
      updateSource: 'captured-auth-url',
      timestamp
    }
  );

  assert.deepEqual(patch, {
    displayName: SAMPLE_NAME,
    fans: 18,
    accountLikeCount: 7,
    accountStatsLastUpdate: timestamp,
    accountUpdateSource: 'captured-auth-url'
  });
  assert.equal(Object.prototype.hasOwnProperty.call(patch, 'uniqId'), false);
});

test('Weixin Channels account likes accept alternate auth response field names', () => {
  const patch = metrics.buildAccountPlatformPatch({
    data: {
      finderUser: {
        nickname: SAMPLE_NAME,
        fansCount: 18,
        totalLikeCount: 12
      }
    }
  });

  assert.equal(patch.accountLikeCount, 12);
});

test('Weixin Channels recognizes stable account and post API paths', () => {
  assert.equal(
    metrics.isAccountResponseUrl(
      'https://channels.weixin.qq.com/cgi-bin/mmfinderassistant-bin/auth/auth_data?dynamic=1'
    ),
    true
  );
  assert.equal(
    metrics.isPostListResponseUrl(
      'https://channels.weixin.qq.com/micro/content/cgi-bin/mmfinderassistant-bin/post/post_list?dynamic=1'
    ),
    true
  );
  assert.equal(metrics.isAccountResponseUrl('https://channels.weixin.qq.com/platform'), false);
  assert.equal(metrics.isPostListResponseUrl(null), false);
});

test('Weixin Channels classifies video and image-text post list responses from page url', () => {
  assert.equal(
    metrics.getPostListKind(
      'https://channels.weixin.qq.com/micro/content/cgi-bin/mmfinderassistant-bin/post/post_list?_pageUrl=https:%2F%2Fchannels.weixin.qq.com%2Fmicro%2Fcontent%2Fpost%2Flist'
    ),
    'video'
  );
  assert.equal(
    metrics.getPostListKind(
      'https://channels.weixin.qq.com/micro/content/cgi-bin/mmfinderassistant-bin/post/post_list?_pageUrl=https:%2F%2Fchannels.weixin.qq.com%2Fmicro%2Fcontent%2Fpost%2FfinderNewLifePostList'
    ),
    'imageText'
  );
  assert.equal(metrics.getPostListKind('https://channels.weixin.qq.com/platform'), null);
});

test('Weixin Channels classifies current platform post manager page urls', () => {
  assert.equal(
    metrics.getPostListKind(
      'https://channels.weixin.qq.com/micro/content/cgi-bin/mmfinderassistant-bin/post/post_list?_pageUrl=https:%2F%2Fchannels.weixin.qq.com%2Fplatform%2Fpost%2Flist'
    ),
    'video'
  );
  assert.equal(
    metrics.getPostListKind(
      'https://channels.weixin.qq.com/micro/content/cgi-bin/mmfinderassistant-bin/post/post_list?_pageUrl=https:%2F%2Fchannels.weixin.qq.com%2Fplatform%2Fpost%2FfinderNewLifePostList'
    ),
    'imageText'
  );
});

test('Weixin Channels classifies post list responses from sync entrypoint hints', () => {
  const postListUrl =
    'https://channels.weixin.qq.com/micro/content/cgi-bin/mmfinderassistant-bin/post/post_list';

  assert.equal(
    metrics.getPostListKind(
      postListUrl,
      'https://channels.weixin.qq.com/platform?allfansEntry=videoContent'
    ),
    'video'
  );
  assert.equal(
    metrics.getPostListKind(
      postListUrl,
      'https://channels.weixin.qq.com/platform?allfansEntry=imageTextContent'
    ),
    'imageText'
  );
});

test('Weixin Channels merges video and image-text post metrics into one content patch', () => {
  const state = metrics.createContentScanState();
  const videoResponse = {
    data: {
      list: [
        {
          exportId: 'video-1',
          readCount: 100,
          likeCount: 9,
          commentCount: 3,
          forwardCount: 2,
          favCount: 1
        }
      ],
      totalCount: 1
    }
  };
  const imageTextResponse = {
    data: {
      list: [
        {
          exportId: 'image-1',
          readCount: 50,
          likeCount: 4,
          commentCount: 2,
          forwardCount: 1,
          favCount: 5
        },
        {
          exportId: 'image-2',
          readCount: 25,
          likeCount: 1,
          commentCount: 0,
          forwardCount: 0,
          favCount: 2
        }
      ],
      totalCount: 2
    }
  };

  const withVideo = metrics.mergePostListResponse(state, videoResponse, 'video');
  const merged = metrics.mergePostListResponse(withVideo, imageTextResponse, 'imageText');
  const timestamp = '2026-04-22T00:01:00.000Z';
  const patch = metrics.buildContentPlatformPatch(merged, {
    updateSource: 'captured-content-url',
    timestamp
  });

  assert.equal(patch.playCount, 175);
  assert.equal(patch.likeCount, 14);
  assert.equal(patch.commentCount, 5);
  assert.equal(patch.shareCount, 3);
  assert.equal(patch.favoriteCount, 8);
  assert.equal(patch.worksCount, 3);
  assert.equal(patch.totalWorksCount, 3);
  assert.equal(patch.scannedItemCount, 3);
  assert.equal(patch.contentStatsExact, true);
  assert.equal(patch.contentStatsLastUpdate, timestamp);
});

test('Weixin Channels accepts post list items without stable ids from current APIs', () => {
  const state = metrics.mergePostListResponse(
    metrics.createContentScanState(),
    {
      data: {
        list: [
          {
            likeCount: 0,
            commentCount: 0,
            readCount: 11,
            forwardCount: 0,
            favCount: 0
          }
        ],
        totalCount: 1
      }
    },
    'video'
  );
  const patch = metrics.buildContentPlatformPatch(state, {
    updateSource: 'captured-video-url',
    timestamp: '2026-04-22T00:01:30.000Z'
  });

  assert.equal(patch.videoWorksCount, 1);
  assert.equal(patch.videoPlayCount, 11);
  assert.equal(patch.videoResponseCount, 1);
  assert.equal(metrics.hasSufficientWeixinChannelsData(patch), true);
});

test('Weixin Channels marks zero-work content scans as exact only after both content types respond', () => {
  const state = metrics.createContentScanState();
  const empty = { data: { list: [], totalCount: 0 } };

  const onlyVideo = metrics.mergePostListResponse(state, empty, 'video');
  assert.equal(
    metrics.buildContentPlatformPatch(onlyVideo, {
      updateSource: 'captured-content-url',
      timestamp: '2026-04-22T00:02:00.000Z'
    }).contentStatsExact,
    false
  );

  const merged = metrics.mergePostListResponse(onlyVideo, empty, 'imageText');
  const patch = metrics.buildContentPlatformPatch(merged, {
    updateSource: 'captured-content-url',
    timestamp: '2026-04-22T00:03:00.000Z'
  });

  assert.equal(patch.worksCount, 0);
  assert.equal(patch.totalWorksCount, 0);
  assert.equal(patch.contentStatsExact, true);
});

test('Weixin Channels marks partial content scans when totals exceed scanned posts', () => {
  const state = metrics.createContentScanState();
  const partial = metrics.mergePostListResponse(
    state,
    {
      data: {
        list: [
          {
            exportId: 'video-1',
            readCount: 10,
            likeCount: 1,
            commentCount: 0,
            forwardCount: 0,
            favCount: 0
          }
        ],
        totalCount: 3
      }
    },
    'video'
  );
  const merged = metrics.mergePostListResponse(
    partial,
    {
      data: {
        list: [],
        totalCount: 0
      }
    },
    'imageText'
  );
  const patch = metrics.buildContentPlatformPatch(merged, {
    updateSource: 'captured-content-url',
    timestamp: '2026-04-22T00:04:00.000Z'
  });

  assert.equal(patch.worksCount, 1);
  assert.equal(patch.totalWorksCount, 3);
  assert.equal(patch.contentStatsExact, false);
});

test('Weixin Channels keeps zero-work partial content-kind scans for later merging', () => {
  const state = metrics.mergePostListResponse(
    metrics.createContentScanState(),
    {
      data: {
        list: [],
        totalCount: 0
      }
    },
    'video'
  );
  const patch = metrics.buildContentPlatformPatch(state, {
    updateSource: 'captured-video-url',
    timestamp: '2026-04-22T00:04:30.000Z'
  });

  assert.equal(patch.videoResponseCount, 1);
  assert.equal(patch.imageTextResponseCount, 0);
  assert.equal(patch.contentStatsExact, false);
  assert.equal(metrics.hasSufficientWeixinChannelsData(patch), true);
});

test('Weixin Channels combines a new content-kind patch with stored opposite-kind totals', () => {
  const stored = {
    videoPlayCount: 100,
    videoLikeCount: 9,
    videoCommentCount: 3,
    videoShareCount: 2,
    videoFavoriteCount: 1,
    videoWorksCount: 1,
    videoTotalWorksCount: 1,
    videoScannedItemCount: 1,
    videoResponseCount: 1
  };
  const state = metrics.mergePostListResponse(
    metrics.createContentScanState(),
    {
      data: {
        list: [
          {
            exportId: 'image-1',
            readCount: 50,
            likeCount: 4,
            commentCount: 2,
            forwardCount: 1,
            favCount: 5
          }
        ],
        totalCount: 1
      }
    },
    'imageText'
  );
  const imagePatch = metrics.buildContentPlatformPatch(state, {
    updateSource: 'captured-image-url',
    timestamp: '2026-04-22T00:05:00.000Z'
  });
  const merged = metrics.mergeContentPatchWithStoredData(stored, imagePatch);

  assert.equal(merged.playCount, 150);
  assert.equal(merged.likeCount, 13);
  assert.equal(merged.commentCount, 5);
  assert.equal(merged.shareCount, 3);
  assert.equal(merged.favoriteCount, 6);
  assert.equal(merged.worksCount, 2);
  assert.equal(merged.totalWorksCount, 2);
  assert.equal(merged.contentStatsExact, true);
});
