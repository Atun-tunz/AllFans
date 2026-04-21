# 平台卡片模型

popup 平台卡片统一走 `extension/platforms/platform-card-model.js`，平台文件只声明 `card` 配置，不再手写卡片 DOM 模型。

## 两种同步模式

### single

适合 B 站这种一次同步拿完整数据的平台。所有 section 和 compact 指标都由同一个同步字段控制，当前使用 `lastUpdate`。

```js
card: {
  mode: 'single',
  homeUrl: 'https://member.bilibili.com/platform/home',
  compactMetricKeys: ['fans', 'playCount'],
  sections: [
    {
      key: 'account',
      title: '账号概览',
      syncField: 'lastUpdate',
      metrics: [
        { key: 'fans', label: '粉丝', variant: 'accent', inlineChangeKey: 'fansChangeToday' },
        { key: 'likeCount', label: '累计获赞', variant: 'hot' }
      ]
    }
  ]
}
```

### split

适合抖音、小红书、快手这种账号和作品分开同步的平台。账号 section 绑定 `accountStatsLastUpdate`，作品 section 绑定 `contentStatsLastUpdate`。

```js
card: {
  mode: 'split',
  homeUrl: 'https://cp.kuaishou.com/',
  compactMetricKeys: ['fans', 'playCount'],
  sections: [
    {
      key: 'account',
      title: '账号概览',
      syncField: 'accountStatsLastUpdate',
      metrics: [
        { key: 'fans', label: '粉丝', variant: 'accent' },
        { key: 'accountLikeCount', label: '累计获赞', variant: 'hot' }
      ]
    },
    {
      key: 'content',
      title: '作品汇总',
      syncField: 'contentStatsLastUpdate',
      meta: 'contentSummary',
      metrics: [
        { key: 'playCount', label: '播放量', variant: 'large' },
        { key: 'likeCount', label: '点赞量' },
        { key: 'commentCount', label: '评论量' }
      ]
    }
  ]
}
```

## 展示规则

- section 的 `syncField` 有值时，才展示该 section。
- section 未同步时，该 section 下的指标和 compact 指标都不展示。
- 指标字段存在且值为 `0` 时正常展示 `0`。
- 不显示 `未同步` 占位文案。
- `meta: 'contentSummary'` 会展示最近同步时间和作品数量，支持 `作品 0`、`作品 scanned / total`。

## 新平台接入要点

- 新增平台时优先选择 `single` 或 `split`，不要复制已有平台的 `createPopupCardModel()` 逻辑。
- `compactMetricKeys` 必须引用 `sections[].metrics[].key` 中已经声明的指标。
- 如果平台有账号和作品两类入口，优先使用 `split`，并分别写入 `accountStatsLastUpdate` 和 `contentStatsLastUpdate`。
- 如果平台只有一次同步入口，使用 `single`，并写入 `lastUpdate`。
