import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import { join } from 'path';

const kuaishouMetricsPath = join(process.cwd(), 'extension', 'content', 'kuaishou-metrics.js');
const kuaishouMetricsCode = readFileSync(kuaishouMetricsPath, 'utf-8');

eval(kuaishouMetricsCode);

const metrics = globalThis.AllFansKuaishouMetrics;

test('normalizeMetricValue 应正确解析数字', () => {
  assert.strictEqual(metrics.normalizeMetricValue(3040), 3040);
  assert.strictEqual(metrics.normalizeMetricValue('3040'), 3040);
  assert.strictEqual(metrics.normalizeMetricValue('3,040'), 3040);
  assert.strictEqual(metrics.normalizeMetricValue(null), 0);
  assert.strictEqual(metrics.normalizeMetricValue(undefined), 0);
  assert.strictEqual(metrics.normalizeMetricValue(''), 0);
  assert.strictEqual(metrics.normalizeMetricValue('abc'), 0);
});

test('createContentScanState 应创建初始状态', () => {
  const state = metrics.createContentScanState();
  
  assert.deepStrictEqual(state, {
    itemsById: {},
    displayName: '',
    scannedItemCount: 0,
    responseCount: 0,
    hasMore: false,
    total: 0
  });
});

test('isPhotoListResponseUrl 应正确识别 URL', () => {
  assert.strictEqual(
    metrics.isPhotoListResponseUrl('https://cp.kuaishou.com/rest/cp/works/v2/video/pc/photo/list'),
    true
  );
  assert.strictEqual(
    metrics.isPhotoListResponseUrl('https://cp.kuaishou.com/rest/cp/works/v2/video/pc/photo/list?param=value'),
    true
  );
  assert.strictEqual(
    metrics.isPhotoListResponseUrl('https://cp.kuaishou.com/other/api'),
    false
  );
  assert.strictEqual(metrics.isPhotoListResponseUrl(null), false);
  assert.strictEqual(metrics.isPhotoListResponseUrl(undefined), false);
});

test('isHomeInfoResponseUrl should match Kuaishou account info API with dynamic signature', () => {
  assert.strictEqual(
    metrics.isHomeInfoResponseUrl(
      'https://cp.kuaishou.com/rest/cp/creator/pc/home/infoV2?__NS_sig3=a0b0f7c72960159a8cfdfeff4857061d25c16985e1e1e3e3ecedeef4'
    ),
    true
  );
  assert.strictEqual(
    metrics.isHomeInfoResponseUrl('https://cp.kuaishou.com/rest/cp/works/v2/video/pc/photo/list'),
    false
  );
  assert.strictEqual(metrics.isHomeInfoResponseUrl(null), false);
});

test('hasUsablePhotoListResponse 应正确判断响应', () => {
  const validResponse = {
    result: 1,
    data: {
      list: [
        { playCount: 3040, likeCount: 100, commentCount: 50 }
      ],
      total: 1
    }
  };
  
  assert.strictEqual(metrics.hasUsablePhotoListResponse(validResponse), true);
  assert.strictEqual(metrics.hasUsablePhotoListResponse({ result: 0 }), false);
  assert.strictEqual(metrics.hasUsablePhotoListResponse({ result: 1, data: {} }), false);
  assert.strictEqual(metrics.hasUsablePhotoListResponse(null), false);
});

test('hasReusablePhotoListSnapshot 应只接受真实快手作品列表快照', () => {
  const snapshot = {
    url: 'https://cp.kuaishou.com/rest/cp/works/v2/video/pc/photo/list?page=1',
    response: {
      result: 1,
      data: {
        list: [],
        total: 0
      }
    }
  };

  assert.strictEqual(metrics.hasReusablePhotoListSnapshot(snapshot), true);
  assert.strictEqual(
    metrics.hasReusablePhotoListSnapshot({
      ...snapshot,
      url: 'https://cp.kuaishou.com/other'
    }),
    false
  );
  assert.strictEqual(
    metrics.hasReusablePhotoListSnapshot({
      ...snapshot,
      response: { result: 0 }
    }),
    false
  );
});

test('hasReusableHomeInfoSnapshot should accept captured Kuaishou account info responses', () => {
  const snapshot = {
    url: 'https://cp.kuaishou.com/rest/cp/creator/pc/home/infoV2?__NS_sig3=dynamic',
    response: {
      data: {
        userName: '阿屯的屯',
        fansCnt: 3,
        likeCnt: 1
      }
    }
  };

  assert.strictEqual(metrics.hasReusableHomeInfoSnapshot(snapshot), true);
  assert.strictEqual(
    metrics.hasReusableHomeInfoSnapshot({
      ...snapshot,
      url: 'https://cp.kuaishou.com/rest/cp/works/v2/video/pc/photo/list'
    }),
    false
  );
  assert.strictEqual(
    metrics.hasReusableHomeInfoSnapshot({
      ...snapshot,
      response: { data: {} }
    }),
    false
  );
});

test('buildAccountPlatformPatch should map Kuaishou infoV2 response into account fields', () => {
  const timestamp = '2026-04-21T00:00:00.000Z';
  const updateSource = 'https://cp.kuaishou.com/rest/cp/creator/pc/home/infoV2?__NS_sig3=dynamic';

  const patch = metrics.buildAccountPlatformPatch(
    {
      data: {
        userName: '阿屯的屯',
        fansCnt: 3,
        likeCnt: 1,
        followCnt: 2
      }
    },
    { updateSource, timestamp }
  );

  assert.deepStrictEqual(patch, {
    displayName: '阿屯的屯',
    fans: 3,
    accountLikeCount: 1,
    accountStatsLastUpdate: timestamp,
    accountUpdateSource: updateSource
  });
});

test('hasSufficientKuaishouAccountData should accept visible account identity or metrics', () => {
  assert.strictEqual(metrics.hasSufficientKuaishouAccountData({ displayName: '阿屯的屯' }), true);
  assert.strictEqual(metrics.hasSufficientKuaishouAccountData({ fans: 3 }), true);
  assert.strictEqual(metrics.hasSufficientKuaishouAccountData({ accountLikeCount: 1 }), true);
  assert.strictEqual(metrics.hasSufficientKuaishouAccountData({ displayName: '', fans: 0, accountLikeCount: 0 }), false);
  assert.strictEqual(metrics.hasSufficientKuaishouAccountData({}), false);
});

test('mergeContentResponse 应正确合并作品数据', () => {
  const state = metrics.createContentScanState();
  const response = {
    result: 1,
    data: {
      list: [
        {
          photoId: '123',
          userName: '阿屯的屯',
          playCount: 3040,
          likeCount: 100,
          commentCount: 50
        }
      ],
      total: 1
    }
  };
  
  const merged = metrics.mergeContentResponse(state, response);
  
  assert.strictEqual(merged.scannedItemCount, 1);
  assert.strictEqual(merged.total, 1);
  assert.strictEqual(merged.responseCount, 1);
  assert.strictEqual(merged.displayName, '阿屯的屯');
  assert.ok(merged.itemsById['123']);
  assert.strictEqual(merged.itemsById['123'].metrics.playCount, 3040);
  assert.strictEqual(merged.itemsById['123'].metrics.likeCount, 100);
  assert.strictEqual(merged.itemsById['123'].metrics.commentCount, 50);
});

test('mergeContentResponse 应支持不同的字段命名格式', () => {
  const state = metrics.createContentScanState();
  const response = {
    result: 1,
    data: {
      list: [
        {
          photo_id: '456',
          play_count: 5000,
          like_count: 200,
          comment_count: 80
        }
      ],
      total: 1
    }
  };
  
  const merged = metrics.mergeContentResponse(state, response);
  
  assert.strictEqual(merged.scannedItemCount, 1);
  assert.ok(merged.itemsById['456']);
  assert.strictEqual(merged.itemsById['456'].metrics.playCount, 5000);
  assert.strictEqual(merged.itemsById['456'].metrics.likeCount, 200);
  assert.strictEqual(merged.itemsById['456'].metrics.commentCount, 80);
});

test('mergeContentResponse 应支持缺少作品 ID 的快手列表项', () => {
  const state = metrics.createContentScanState();
  const response = {
    result: 1,
    data: {
      list: [
        {
          userName: '阿屯的屯',
          playCount: 3040,
          likeCount: 100,
          commentCount: 50
        }
      ],
      total: 1
    }
  };

  const merged = metrics.mergeContentResponse(state, response);

  assert.strictEqual(merged.scannedItemCount, 1);
  assert.strictEqual(merged.displayName, '阿屯的屯');
  assert.strictEqual(Object.values(merged.itemsById)[0].metrics.playCount, 3040);
});

test('buildContentPlatformPatch 应正确计算汇总数据', () => {
  const state = {
    itemsById: {
      '123': {
        id: '123',
        metrics: {
          playCount: 3040,
          likeCount: 100,
          commentCount: 50
        }
      },
      '456': {
        id: '456',
        metrics: {
          playCount: 5000,
          likeCount: 200,
          commentCount: 80
        }
      }
    },
    total: 2,
    responseCount: 1
  };
  
  const timestamp = '2025-04-21T00:00:00.000Z';
  const patch = metrics.buildContentPlatformPatch(state, {
    updateSource: 'https://cp.kuaishou.com/test',
    timestamp
  });
  
  assert.strictEqual(patch.playCount, 8040);
  assert.strictEqual(patch.likeCount, 300);
  assert.strictEqual(patch.commentCount, 130);
  assert.strictEqual(patch.worksCount, 2);
  assert.strictEqual(patch.totalWorksCount, 2);
  assert.strictEqual(patch.scannedItemCount, 2);
  assert.strictEqual(patch.contentStatsExact, true);
  assert.strictEqual(patch.contentStatsLastUpdate, timestamp);
  assert.strictEqual(patch.updateSource, 'https://cp.kuaishou.com/test');
});

test('buildContentPlatformPatch 应保留账号名并标记零作品精确扫描', () => {
  const state = {
    itemsById: {},
    displayName: '阿屯的屯',
    total: 0,
    responseCount: 1
  };
  const timestamp = '2025-04-21T00:00:00.000Z';
  const patch = metrics.buildContentPlatformPatch(state, {
    updateSource: 'https://cp.kuaishou.com/test',
    timestamp
  });

  assert.strictEqual(patch.displayName, '阿屯的屯');
  assert.strictEqual(patch.worksCount, 0);
  assert.strictEqual(patch.totalWorksCount, 0);
  assert.strictEqual(patch.contentStatsExact, true);
});

test('hasSufficientKuaishouData 应正确判断数据充分性', () => {
  assert.strictEqual(metrics.hasSufficientKuaishouData({ worksCount: 5 }), true);
  assert.strictEqual(metrics.hasSufficientKuaishouData({ worksCount: 0, totalWorksCount: 0 }), false);
  assert.strictEqual(
    metrics.hasSufficientKuaishouData({
      worksCount: 0,
      totalWorksCount: 0,
      contentStatsExact: true
    }),
    true
  );
  assert.strictEqual(metrics.hasSufficientKuaishouData({ worksCount: 0, totalWorksCount: 10 }), false);
  assert.strictEqual(metrics.hasSufficientKuaishouData({}), false);
});
