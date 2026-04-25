# 平台卡片模型

popup 平台卡片统一走 `extension/platforms/platform-card-model.js`，平台文件只声明 `card` 配置，不再手写卡片 DOM 模型。

## 核心实现

`createSingleSyncCardModel` 和 `createSplitSyncCardModel` 都调用同一个 `createCardModel` 函数，模式的区别主要体现在 `syncField` 的使用上。

```js
export function createSingleSyncCardModel(platform, platformData) {
  return createCardModel(platform, platformData);
}

export function createSplitSyncCardModel(platform, platformData) {
  return createCardModel(platform, platformData);
}
```

## 两种同步模式

### single

适合 B 站这种一次同步拿完整数据的平台。所有 section 和 compact 指标都由同一个同步字段控制，当前使用 `lastUpdate`。

```js
card: {
  mode: 'single',
  homeUrl: 'https://member.bilibili.com/platform/home',
  accountNameFallback: '等待识别账号',
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
    },
    {
      key: 'content',
      title: '作品汇总',
      syncField: 'lastUpdate',
      metrics: [
        { key: 'playCount', label: '观看数', variant: 'large' },
        { key: 'favoriteCount', label: '收藏量' },
        { key: 'commentCount', label: '评论量' },
        { key: 'shareCount', label: '分享量' },
        { key: 'danmakuCount', label: '弹幕量' },
        { key: 'coinCount', label: '投币量' }
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
  homeUrl: 'https://creator.douyin.com/creator-micro/home',
  accountNameFallback: '等待识别账号',
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
        { key: 'playCount', label: '观看数', variant: 'large' },
        { key: 'favoriteCount', label: '收藏量' },
        { key: 'commentCount', label: '评论量' },
        { key: 'shareCount', label: '分享量' }
      ]
    }
  ]
}
```

## 展示规则

### Section 展示规则

- section 的 `syncField` 有值时，才展示该 section。
- section 未同步时，该 section 下的指标和 compact 指标都不展示。
- 指标字段存在且值为 `0` 时正常展示 `0`。
- 不显示 `未同步` 占位文案。

### Meta 展示规则

- `meta: 'contentSummary'` 会展示最近同步时间和作品数量，支持以下格式：
  - `作品 0`：当 `contentStatsExact` 为 true 且 `totalWorksCount` 为 0 时
  - `作品 scanned / total`：当 `totalWorksCount > 0` 且不等于 `worksCount` 时
  - `作品 count`：其他情况
- 默认展示：`最近同步：{时间}`

### Compact 指标规则

- `compactMetricKeys` 必须引用 `sections[].metrics[].key` 中已经声明的指标。
- compact 指标只有在对应 section 已同步且数据字段存在时才展示。

### 账号名称规则

- 优先使用 `platformData.displayName`
- 如果不存在，使用 `card.accountNameFallback`
- 默认兜底：`等待识别账号`

## 配置字段说明

### Card 配置

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `mode` | string | 是 | 同步模式：`single` 或 `split` |
| `homeUrl` | string | 是 | 平台主页链接 |
| `accountNameFallback` | string | 否 | 账号名称兜底文案 |
| `compactMetricKeys` | string[] | 否 | 紧凑视图显示的指标 key 列表 |
| `sections` | Section[] | 是 | 卡片分区配置 |

### Section 配置

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `key` | string | 是 | 分区唯一标识 |
| `title` | string | 是 | 分区标题 |
| `syncField` | string | 是 | 同步时间字段名 |
| `meta` | string | 否 | 元信息类型，目前支持 `contentSummary` |
| `metrics` | Metric[] | 是 | 指标配置列表 |

### Metric 配置

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `key` | string | 是 | 数据字段名 |
| `label` | string | 是 | 显示标签 |
| `variant` | string | 否 | 样式变体：`accent`、`hot`、`large` |
| `inlineChangeKey` | string | 否 | 内联变化值字段名，用于显示涨跌 |

### Variant 说明

- `accent`：强调样式，通常用于粉丝数
- `hot`：热门样式，通常用于获赞数
- `large`：大号样式，通常用于播放量

## 实际使用案例

### 快手平台

```js
card: {
  mode: 'split',
  homeUrl: 'https://cp.kuaishou.com/',
  accountNameFallback: '等待识别账号',
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

### B 站平台（带 inlineChangeKey）

B 站粉丝数支持显示今日涨跌：

```js
{
  key: 'fans',
  label: '粉丝',
  variant: 'accent',
  inlineChangeKey: 'fansChangeToday'
}
```

当 `fansChangeToday` 字段存在时，会在粉丝数旁边显示涨跌值，正数显示绿色，负数显示红色。

## 新平台接入要点

### 模式选择

- 如果平台只有一次同步入口，使用 `single` 模式，同步时写入 `lastUpdate` 字段。
- 如果平台有账号和作品两类入口，优先使用 `split` 模式，分别写入 `accountStatsLastUpdate` 和 `contentStatsLastUpdate` 字段。

### 配置注意事项

- 新增平台时优先选择 `single` 或 `split`，不要复制已有平台的 `createPopupCardModel()` 逻辑。
- `compactMetricKeys` 必须引用 `sections[].metrics[].key` 中已经声明的指标。
- `accountNameFallback` 建议设置为 `等待识别账号`，保持各平台一致性。
- 作品汇总 section 建议添加 `meta: 'contentSummary'` 以展示作品数量信息。

### 数据字段要求

- `syncField` 对应的时间字段必须存在且有值，section 才会展示。
- 指标字段不存在时，该指标不展示；存在且为 `0` 时正常展示 `0`。
- 使用 `inlineChangeKey` 时，需要确保对应的变化值字段已写入数据。

### 代码集成

在平台文件中导入并使用对应的函数：

```js
import { createSingleSyncCardModel } from './platform-card-model.js';
// 或
import { createSplitSyncCardModel } from './platform-card-model.js';

export default {
  id: 'your-platform',
  // ... 其他配置
  card: {
    // ... card 配置
  },
  createPopupCardModel(platformData) {
    return createSingleSyncCardModel(this, platformData);
    // 或 return createSplitSyncCardModel(this, platformData);
  }
}
```
