import test from 'node:test';
import assert from 'node:assert/strict';

import { getPlatformById } from '../extension/runtime/platform-registry.js';

function getMetricLabels(model) {
  return model.sections.flatMap(section => section.metrics.map(metric => metric.label));
}

function getCompactLabels(model) {
  return model.compactMetrics.map(metric => metric.label);
}

test('single-sync platform empty state does not render placeholder zero metrics', () => {
  const platform = getPlatformById('bilibili');
  const model = platform.createPopupCardModel(platform.createEmptyState());

  assert.equal(model.hasData, false);
  assert.deepEqual(model.sections, []);
  assert.deepEqual(model.compactMetrics, []);
});

test('single-sync platform renders zero-valued metrics after sync', () => {
  const platform = getPlatformById('bilibili');
  const model = platform.createPopupCardModel({
    displayName: 'Test',
    fans: 0,
    fansChangeToday: 0,
    playCount: 0,
    likeCount: 0,
    commentCount: 0,
    danmakuCount: 0,
    shareCount: 0,
    favoriteCount: 0,
    coinCount: 0,
    lastUpdate: '2026-04-15T10:00:00.000Z'
  });

  assert.equal(model.hasData, true);
  assert.equal(model.sections.length, 2);
  assert.equal(model.sections[0].metrics[0].value, '0');
  assert.equal(model.sections[0].metrics[0].inlineChange, '0');
  assert.equal(model.sections[1].metrics[0].value, '0');
  assert.deepEqual(
    model.compactMetrics.map(metric => metric.value),
    ['0', '0']
  );
});

test('split-sync platforms hide account metrics until account sync exists', () => {
  for (const platformId of ['douyin', 'xiaohongshu', 'kuaishou']) {
    const platform = getPlatformById(platformId);
    const model = platform.createPopupCardModel({
      displayName: 'Test',
      fans: 0,
      accountLikeCount: 0,
      playCount: 12,
      likeCount: 3,
      commentCount: 1,
      worksCount: 1,
      totalWorksCount: 1,
      contentStatsLastUpdate: '2026-04-15T10:00:00.000Z',
      contentStatsExact: true
    });

    assert.equal(model.hasData, true, `${platformId} should still have content data`);
    assert.equal(
      model.sections.some(section => section.key === 'account'),
      false,
      `${platformId} should hide account section`
    );
    assert.equal(
      getCompactLabels(model).includes('\u7c89\u4e1d'),
      false,
      `${platformId} should hide compact fans`
    );
  }
});

test('split-sync platforms hide content metrics until content sync exists', () => {
  for (const platformId of ['douyin', 'xiaohongshu', 'kuaishou']) {
    const platform = getPlatformById(platformId);
    const model = platform.createPopupCardModel({
      displayName: 'Test',
      fans: 0,
      accountLikeCount: 0,
      playCount: 0,
      likeCount: 0,
      commentCount: 0,
      accountStatsLastUpdate: '2026-04-15T09:00:00.000Z',
      lastUpdate: '2026-04-15T09:00:00.000Z'
    });

    assert.equal(model.hasData, true, `${platformId} should still have account data`);
    assert.equal(
      model.sections.some(section => section.key === 'content'),
      false,
      `${platformId} should hide content section`
    );
    assert.equal(
      getCompactLabels(model).some(label => label === '\u89c2\u770b\u6570' || label === '\u64ad\u653e\u91cf'),
      false,
      `${platformId} should hide compact content metric`
    );
  }
});

test('kuaishou content-only card does not expose pending account placeholders', () => {
  const platform = getPlatformById('kuaishou');
  const model = platform.createPopupCardModel({
    displayName: 'Test',
    fans: 0,
    accountLikeCount: 0,
    playCount: 8040,
    likeCount: 300,
    commentCount: 130,
    worksCount: 2,
    totalWorksCount: 2,
    contentStatsLastUpdate: '2026-04-21T00:01:00.000Z',
    contentStatsExact: true
  });

  assert.equal(model.sections.length, 1);
  assert.equal(model.sections[0].key, 'content');
  assert.equal(getMetricLabels(model).includes('\u7c89\u4e1d'), false);
  assert.equal(getCompactLabels(model).includes('\u7c89\u4e1d'), false);
  assert.equal(JSON.stringify(model).includes('\u672a\u540c\u6b65'), false);
});

test('split-sync platforms render real zero account metrics after account sync', () => {
  for (const platformId of ['douyin', 'xiaohongshu', 'kuaishou']) {
    const platform = getPlatformById(platformId);
    const model = platform.createPopupCardModel({
      displayName: 'Test',
      fans: 0,
      accountLikeCount: 0,
      accountStatsLastUpdate: '2026-04-15T09:00:00.000Z'
    });

    const accountSection = model.sections.find(section => section.key === 'account');
    assert.ok(accountSection, `${platformId} should show account section`);
    assert.equal(accountSection.metrics[0].value, '0');
    assert.equal(accountSection.metrics[1].value, '0');
  }
});
