import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBilibiliMetrics } from './helpers/load-bilibili-metrics.mjs';

const {
  buildApiSnapshot,
  buildUserPatch,
  getMetricFieldFromClassList,
  hasSufficientBilibiliData,
  parseCount,
  parseSignedCount
} = loadBilibiliMetrics();

test('parseCount strips commas from count text', () => {
  assert.equal(parseCount('582,735'), 582735);
  assert.equal(parseCount(''), 0);
});

test('parseSignedCount keeps positive and negative signs', () => {
  assert.equal(parseSignedCount('+16'), 16);
  assert.equal(parseSignedCount('-8'), -8);
  assert.equal(parseSignedCount('今日无变化'), 0);
});

test('getMetricFieldFromClassList finds mapped metric icon', () => {
  const field = getMetricFieldFromClassList([
    'icon-sprite',
    'icon-sprite-dc-play',
    'extra-class'
  ]);

  assert.equal(field, 'playCount');
});

test('hasSufficientBilibiliData requires fans and at least one video metric', () => {
  assert.equal(
    hasSufficientBilibiliData({
      stats: {
        fansFound: true,
        videoMetricCount: 1
      }
    }),
    true
  );

  assert.equal(
    hasSufficientBilibiliData({
      stats: {
        fansFound: true,
        videoMetricCount: 0
      }
    }),
    false
  );
});

test('buildApiSnapshot maps Bilibili stat API response into runtime data shape', () => {
  const result = buildApiSnapshot(
    {
      code: 0,
      data: {
        total_click: 582735,
        total_dm: 2052,
        total_reply: 3980,
        total_fans: 5310,
        total_fav: 8843,
        total_like: 14710,
        total_share: 420,
        total_coin: 7191,
        incr_fans: 16
      }
    },
    'https://member.bilibili.com/platform/home'
  );

  assert.deepEqual(JSON.parse(JSON.stringify(result.data)), {
    platform: 'bilibili',
    fans: 5310,
    fansChangeToday: 16,
    playCount: 582735,
    likeCount: 14710,
    commentCount: 3980,
    danmakuCount: 2052,
    shareCount: 420,
    favoriteCount: 8843,
    coinCount: 7191,
    updateSource: 'https://member.bilibili.com/platform/home'
  });
  assert.equal(result.stats.fansFound, true);
  assert.equal(result.stats.videoMetricCount, 7);
});

test('buildUserPatch maps Bilibili nav response into uid and display name', () => {
  const patch = buildUserPatch({
    code: 0,
    data: {
      mid: 123456,
      uname: '阿屯的屯'
    }
  });

  assert.deepEqual(JSON.parse(JSON.stringify(patch)), {
    uid: 123456,
    displayName: '阿屯的屯'
  });
});
