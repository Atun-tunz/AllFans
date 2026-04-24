import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';

const metricsPath = join(process.cwd(), 'extension', 'content', 'weibo-metrics.js');
const metricsCode = readFileSync(metricsPath, 'utf-8');

eval(metricsCode);

const metrics = globalThis.AllFansWeiboMetrics;
const SAMPLE_NAME = '\u963f\u5c6f\u7684\u5c6f';

test('Weibo account response maps screen name and follower count', () => {
  const timestamp = '2026-04-23T00:00:00.000Z';
  const patch = metrics.buildAccountPlatformPatch(
    {
      ok: 1,
      data: {
        user: {
          screen_name: SAMPLE_NAME,
          followers_count: 1
        }
      }
    },
    {
      updateSource: 'https://weibo.com/u/9161791838',
      timestamp
    }
  );

  assert.deepEqual(patch, {
    displayName: SAMPLE_NAME,
    fans: 1,
    accountStatsLastUpdate: timestamp,
    accountUpdateSource: 'https://weibo.com/u/9161791838'
  });
});

test('Weibo recognizes account, video, and article response shapes', () => {
  assert.equal(
    metrics.hasUsableAccountResponse({
      data: { user: { screen_name: SAMPLE_NAME, followers_count: 1 } }
    }),
    true
  );
  assert.equal(
    metrics.hasUsableVideoListResponse({
      data: { videos: [{ statistics: { play_count: 1 } }] }
    }),
    true
  );
  assert.equal(
    metrics.hasUsableArticleListResponse({
      data: { list: [{ countList: { comments_count: 1 } }] }
    }),
    true
  );
});

test('Weibo video response maps statistics into content totals', () => {
  const state = metrics.mergeVideoListResponse(
    metrics.createContentScanState(),
    {
      data: {
        videos: [
          {
            id: 'video-1',
            statistics: {
              comment_count: 1,
              attitude_count: 2,
              reposts_count: 3,
              play_count: 4,
              danmaku_count: 5
            }
          }
        ]
      }
    }
  );
  const patch = metrics.buildContentPlatformPatch(state, {
    updateSource: 'captured-video-url',
    timestamp: '2026-04-23T00:01:00.000Z'
  });

  assert.equal(patch.videoPlayCount, 4);
  assert.equal(patch.videoLikeCount, 2);
  assert.equal(patch.videoCommentCount, 1);
  assert.equal(patch.videoShareCount, 3);
  assert.equal(patch.videoDanmakuCount, 5);
  assert.equal(patch.playCount, 4);
  assert.equal(patch.likeCount, 2);
  assert.equal(patch.accountLikeCount, 2);
  assert.equal(patch.commentCount, 1);
  assert.equal(patch.shareCount, 3);
  assert.equal(patch.danmakuCount, 5);
});

test('Weibo article response maps countList and compatible view fields', () => {
  const state = metrics.mergeArticleListResponse(
    metrics.createContentScanState(),
    {
      data: {
        list: [
          {
            id: 'article-1',
            read_count: 11,
            countList: {
              reposts_count: 1,
              comments_count: 2,
              attitudes_count: 3
            }
          },
          {
            id: 'article-2',
            countList: {
              view_count: 7,
              reposts_count: 0,
              comments_count: 1,
              attitudes_count: 4
            }
          }
        ]
      }
    }
  );
  const patch = metrics.buildContentPlatformPatch(state, {
    updateSource: 'captured-article-url',
    timestamp: '2026-04-23T00:02:00.000Z'
  });

  assert.equal(patch.articlePlayCount, 18);
  assert.equal(patch.articleLikeCount, 7);
  assert.equal(patch.articleCommentCount, 3);
  assert.equal(patch.articleShareCount, 1);
  assert.equal(patch.playCount, 18);
  assert.equal(patch.likeCount, 7);
  assert.equal(patch.accountLikeCount, 7);
  assert.equal(patch.commentCount, 3);
  assert.equal(patch.shareCount, 1);
});

test('Weibo merges video and article content while keeping danmaku video-only', () => {
  const withVideo = metrics.mergeVideoListResponse(
    metrics.createContentScanState(),
    {
      data: {
        videos: [
          {
            id: 'video-1',
            statistics: {
              comment_count: 1,
              attitude_count: 2,
              reposts_count: 3,
              play_count: 4,
              danmaku_count: 5
            }
          }
        ]
      }
    }
  );
  const merged = metrics.mergeArticleListResponse(withVideo, {
    data: {
      list: [
        {
          id: 'article-1',
          view_count: 10,
          countList: {
            reposts_count: 1,
            comments_count: 2,
            attitudes_count: 3
          }
        }
      ]
    }
  });
  const patch = metrics.buildContentPlatformPatch(merged, {
    updateSource: 'captured-content-url',
    timestamp: '2026-04-23T00:03:00.000Z'
  });

  assert.equal(patch.playCount, 14);
  assert.equal(patch.likeCount, 5);
  assert.equal(patch.accountLikeCount, 5);
  assert.equal(patch.commentCount, 3);
  assert.equal(patch.shareCount, 4);
  assert.equal(patch.danmakuCount, 5);
  assert.equal(patch.worksCount, 2);
  assert.equal(patch.contentStatsExact, true);
});

test('Weibo empty video and article responses produce an exact zero-work content patch', () => {
  const withVideo = metrics.mergeVideoListResponse(
    metrics.createContentScanState(),
    { data: { videos: [] } }
  );
  const merged = metrics.mergeArticleListResponse(withVideo, { data: { list: [] } });
  const patch = metrics.buildContentPlatformPatch(merged, {
    updateSource: 'captured-content-url',
    timestamp: '2026-04-23T00:04:00.000Z'
  });

  assert.equal(patch.worksCount, 0);
  assert.equal(patch.videoResponseCount, 1);
  assert.equal(patch.articleResponseCount, 1);
  assert.equal(patch.contentStatsExact, true);
  assert.equal(metrics.hasSufficientWeiboContentData(patch), true);
});
