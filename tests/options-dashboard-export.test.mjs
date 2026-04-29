import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_DASHBOARD_TITLE,
  DEFAULT_DASHBOARD_MODULE_IDS,
  buildDashboardSnapshot,
  buildDashboardWorkbookXml,
  createDashboardExportPayload,
  createDashboardSvg,
  getDashboardPresetById
} from '../extension/options/dashboard-export.js';

const sampleData = {
  summary: {
    totalFans: 389200,
    totalPlayCount: 6421000,
    totalLikeCount: 908300,
    lastUpdate: '2026-04-25T08:00:00.000Z'
  },
  settings: {
    enabledPlatformIds: ['bilibili', 'douyin', 'weibo', 'xiaohongshu'],
    platformOrder: ['douyin', 'bilibili', 'weibo', 'xiaohongshu']
  },
  platforms: {
    bilibili: {
      displayName: 'AllFans B',
      fans: 82000,
      playCount: 1740000,
      likeCount: 216000,
      commentCount: 120000,
      shareCount: 62000,
      favoriteCount: 83000,
      danmakuCount: 41000,
      coinCount: 19000,
      lastUpdate: '2026-04-25T06:00:00.000Z'
    },
    douyin: {
      displayName: 'AllFans D',
      fans: 240000,
      playCount: 3980000,
      accountLikeCount: 601000,
      commentCount: 152000,
      shareCount: 72000,
      favoriteCount: 113000,
      contentStatsLastUpdate: '2026-04-25T08:00:00.000Z'
    },
    weibo: {
      displayName: 'AllFans W',
      fans: 67200,
      playCount: 701000,
      readCount: 701000,
      likeCount: 91300,
      commentCount: 37000,
      shareCount: 44000,
      danmakuCount: 1200,
      lastUpdate: '2026-04-24T20:00:00.000Z'
    },
    xiaohongshu: {
      displayName: 'AllFans X',
      fans: 1200,
      playCount: 32000,
      accountLikeCount: 5600,
      commentCount: 800,
      shareCount: 600,
      favoriteCount: 1400,
      lastUpdate: '2026-04-24T18:00:00.000Z'
    }
  }
};

test('dashboard export presets expose landscape square and story sizes', () => {
  assert.deepEqual(getDashboardPresetById('landscape'), {
    id: 'landscape',
    label: '横版 16:9',
    width: 1600,
    height: 900
  });
  assert.equal(getDashboardPresetById('fhd').width, 1920);
  assert.equal(getDashboardPresetById('fhd').height, 1080);
  assert.equal(getDashboardPresetById('qhd').width, 2560);
  assert.equal(getDashboardPresetById('qhd').height, 1440);
  assert.equal(getDashboardPresetById('uhd').width, 3840);
  assert.equal(getDashboardPresetById('uhd').height, 2160);
  assert.equal(getDashboardPresetById('square-1080').width, 1080);
  assert.equal(getDashboardPresetById('square-2k').width, 2048);
  assert.equal(getDashboardPresetById('square-4k').height, 3840);
  assert.equal(getDashboardPresetById('story-2k').width, 1440);
  assert.equal(getDashboardPresetById('story-4k').height, 3840);
});

test('dashboard snapshot keeps ordered platform cards and custom title', () => {
  const snapshot = buildDashboardSnapshot(sampleData, { title: '鑷畾涔夌粡钀ユ€昏' });

  assert.equal(snapshot.platformCards.length, 4);
  assert.deepEqual(
    snapshot.platformCards.map(card => card.id),
    ['douyin', 'bilibili', 'weibo', 'xiaohongshu']
  );
  assert.equal(snapshot.title, '鑷畾涔夌粡钀ユ€昏');
  assert.equal(snapshot.heroPlatform.title, '抖音');
  assert.equal(snapshot.heroPlatform.metrics.fans, 240000);
  assert.equal(snapshot.summary.totalLikeCount, 908300);
  assert.equal(snapshot.summary.totalCommentCount, 309800);
  assert.equal(snapshot.summary.totalShareCount, 178600);
  assert.equal(snapshot.summary.totalFavoriteCount, 197400);
  assert.equal(snapshot.summary.totalDanmakuCount, 42200);
  assert.equal(snapshot.summary.totalCoinCount, 19000);
});

test('dashboard fan share merges platforms below one percent into other bucket', () => {
  const snapshot = buildDashboardSnapshot(sampleData);

  assert.ok(snapshot.charts.fanShare.at(-1)?.label);
  assert.equal(snapshot.charts.fanShare.at(-1)?.value, 1200);
  assert.equal(snapshot.charts.fanShare.length, 4);
});

test('dashboard fan share keeps overflow platforms in other bucket', () => {
  const data = {
    summary: {
      totalFans: 6000,
      totalPlayCount: 0,
      totalLikeCount: 0,
      lastUpdate: '2026-04-25T08:00:00.000Z'
    },
    settings: {
      enabledPlatformIds: ['bilibili', 'douyin', 'kuaishou', 'weixin_channels', 'weibo', 'xiaohongshu'],
      platformOrder: ['bilibili', 'douyin', 'kuaishou', 'weixin_channels', 'weibo', 'xiaohongshu']
    },
    platforms: {
      bilibili: { fans: 1000 },
      douyin: { fans: 1000 },
      kuaishou: { fans: 1000 },
      weixin_channels: { fans: 1000 },
      weibo: { fans: 1000 },
      xiaohongshu: { fans: 1000 }
    }
  };

  const snapshot = buildDashboardSnapshot(data);
  const fanShareTotal = snapshot.charts.fanShare.reduce((sum, item) => sum + item.value, 0);

  assert.equal(snapshot.charts.fanShare.length, 6);
  assert.ok(snapshot.charts.fanShare.at(-1)?.label);
  assert.equal(snapshot.charts.fanShare.at(-1)?.value, 1000);
  assert.equal(fanShareTotal, 6000);
});

test('dashboard svg contains title but omits removed marketing copy', () => {
  const snapshot = buildDashboardSnapshot(sampleData);
  const svg = createDashboardSvg(snapshot, { presetId: 'landscape' });

  assert.match(svg, /^<svg[^>]*width="1600"[^>]*height="900"/);
  assert.match(svg, /AllFans Data Board/);
  assert.match(svg, /全平台经营总览/);
  assert.match(svg, /抖音/);
  assert.match(svg, /哔哩哔哩/);
  assert.match(svg, /AllFans/);
  assert.doesNotMatch(svg, />AllFans D</);
  assert.doesNotMatch(svg, /小于 1% 的平台合并为其他/);
  assert.doesNotMatch(svg, /更大的展示画布，适合汇报、传播和二次编辑/);
});

test('dashboard svg supports custom account badge identity', () => {
  const snapshot = buildDashboardSnapshot(sampleData);
  const avatarImage = 'data:image/png;base64,YXZhdGFy';
  const svg = createDashboardSvg(snapshot, {
    presetId: 'landscape',
    accountName: 'AllFans Studio',
    avatarImage
  });

  assert.match(svg, /AllFans Studio/);
  assert.match(svg, /ACCOUNT/);
  assert.match(svg, /clipPath id="accountAvatarClip"/);
  assert.match(svg, /data:image\/png;base64,YXZhdGFy/);
  assert.match(svg, /translate\(1128 218\)/);
});

test('dashboard svg uses charts instead of platform card grid and supports translucent background', () => {
  const snapshot = buildDashboardSnapshot(sampleData);
  const svg = createDashboardSvg(snapshot, { presetId: 'landscape', backgroundMode: 'translucent' });

  assert.match(svg, /平台粉丝占比/);
  assert.match(svg, /互动结构/);
  assert.match(svg, /Top 平台播放/);
  assert.match(svg, /fill-opacity="0\.72"/);
  assert.doesNotMatch(svg, /PLATFORM 01/);
});

test('dashboard svg can hide optional export modules', () => {
  const snapshot = buildDashboardSnapshot(sampleData);
  const svg = createDashboardSvg(snapshot, {
    presetId: 'square',
    moduleIds: ['fanShare']
  });

  assert.deepEqual(DEFAULT_DASHBOARD_MODULE_IDS, [
    'account',
    'hero',
    'summary',
    'fanShare',
    'topPlays',
    'interactionMix'
  ]);
  assert.match(svg, /平台粉丝占比/);
  assert.doesNotMatch(svg, /ACCOUNT/);
  assert.doesNotMatch(svg, /当前领跑平台/);
  assert.doesNotMatch(svg, /totalPlayCount/);
  assert.doesNotMatch(svg, /Top 平台播放/);
  assert.doesNotMatch(svg, /互动结构/);
});

test('dashboard account module renders across square and story presets and scales high resolution output', () => {
  const snapshot = buildDashboardSnapshot(sampleData);
  const squareSvg = createDashboardSvg(snapshot, {
    presetId: 'square',
    moduleIds: DEFAULT_DASHBOARD_MODULE_IDS,
    accountName: 'AllFans Studio'
  });
  const storySvg = createDashboardSvg(snapshot, {
    presetId: 'story',
    moduleIds: DEFAULT_DASHBOARD_MODULE_IDS,
    accountName: 'AllFans Studio'
  });
  const highResSvg = createDashboardSvg(snapshot, {
    presetId: 'square-4k',
    moduleIds: DEFAULT_DASHBOARD_MODULE_IDS
  });

  assert.match(squareSvg, /ACCOUNT/);
  assert.match(storySvg, /ACCOUNT/);
  assert.match(storySvg, /<rect x="64" y="204" width="364" height="132"/);
  assert.match(storySvg, /transform="translate\(448 204\)"/);
  assert.match(highResSvg, /^<svg[^>]*width="3840"[^>]*height="3840"/);
  assert.match(highResSvg, /transform="scale\(3\.2\)"/);
});

test('dashboard svg applies custom theme color and background image', () => {
  const snapshot = buildDashboardSnapshot(sampleData);
  const backgroundImage = 'data:image/png;base64,ZmFrZS1pbWFnZQ==';
  const svg = createDashboardSvg(snapshot, {
    presetId: 'landscape',
    themeColor: '#33AAFF',
    backgroundImage,
    backgroundImageOpacity: 0.35
  });

  assert.match(svg, /stop-color="#33AAFF"/);
  assert.match(svg, new RegExp(`href="${backgroundImage}"`));
  assert.match(svg, /preserveAspectRatio="xMidYMid slice"/);
  assert.match(svg, /opacity="0\.35"/);
});

test('dashboard presets generate distinct layout markers and story uses larger typography', () => {
  const snapshot = buildDashboardSnapshot(sampleData, { title: DEFAULT_DASHBOARD_TITLE });
  const landscapeSvg = createDashboardSvg(snapshot, { presetId: 'landscape' });
  const squareSvg = createDashboardSvg(snapshot, { presetId: 'square' });
  const storySvg = createDashboardSvg(snapshot, { presetId: 'story' });

  assert.notEqual(landscapeSvg, squareSvg);
  assert.notEqual(squareSvg, storySvg);
  assert.match(landscapeSvg, /平台粉丝占比/);
  assert.doesNotMatch(squareSvg, /方版布局/);
  assert.doesNotMatch(storySvg, /竖版布局/);
  assert.match(storySvg, /font-size="72"/);
});

test('dashboard export payload and workbook keep summary and platform rows', () => {
  const snapshot = buildDashboardSnapshot(sampleData, { title: '缁忚惀鐪嬫澘' });
  const payload = createDashboardExportPayload(snapshot);
  const workbook = buildDashboardWorkbookXml(snapshot);

  assert.equal(payload.title, '缁忚惀鐪嬫澘');
  assert.equal(payload.summary.totalCommentCount, 309800);
  assert.equal(payload.summary.totalDanmakuCount, 42200);
  assert.equal(payload.platforms[0].platformId, 'douyin');
  assert.equal(payload.platforms[1].fans, 82000);
  assert.match(workbook, /Worksheet ss:Name="Summary"/);
  assert.match(workbook, /Worksheet ss:Name="Platforms"/);
  assert.match(workbook, /totalCommentCount|Comment|Summary/);
  assert.match(workbook, /totalDanmakuCount|Danmaku|Platforms/);
  assert.match(workbook, /缁忚惀鐪嬫澘/);
});
