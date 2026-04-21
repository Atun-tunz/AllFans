# 新平台接入指南

这份文档用于帮助后续开发者快速理解 AllFans 的平台接入方式，并把一个新的创作者平台接入到现有浏览器扩展中。

AllFans 的平台能力采用注册式架构。新增平台时，应优先新增平台自己的定义、采集和解析模块，再把平台注册到统一注册表中。不要把平台专属逻辑写进 popup、background 或通用数据模型里。

## 当前接入结构

新增平台通常会涉及这些位置：

| 位置 | 职责 |
|------|------|
| `extension/platforms/*-platform.js` | 平台定义：名称、入口、权限、空状态、汇总贡献、popup 卡片模型 |
| `extension/content/*-metrics.js` | 平台数据解析：把页面或接口数据转换成 AllFans 统一字段 |
| `extension/content/*-sync.js` | 平台同步流程：在目标后台页采集数据并返回给 background |
| `extension/runtime/platform-registry.js` | 平台注册表：系统识别平台的单一事实源 |
| `extension/manifest.json` | 开发态 manifest：声明权限、content script、可访问资源 |
| `scripts/lib/manifest-builder.mjs` | 多浏览器构建时的 manifest 生成逻辑，如有特殊权限需要确认 |
| `tests/*` | 解析逻辑、注册表、manifest 或数据模型测试 |

现有平台可以作为参考：

- `extension/platforms/bilibili-platform.js`
- `extension/platforms/douyin-platform.js`
- `extension/platforms/xiaohongshu-card-platform.js`
- `extension/content/bilibili-sync.js`
- `extension/content/douyin-sync.js`
- `extension/content/xiaohongshu-sync.js`

## 接入前需要确认的信息

开发前至少要收集以下信息。

### 平台基本信息

- 平台中文名，例如“快手”“微博”“视频号”。
- 内部平台 ID，例如 `kuaishou`、`weibo`、`shipinhao`。
- 平台排序位置，用于 popup 和设置页展示。
- 平台图标，优先使用 SVG，放到 `extension/icons/platforms/`。

平台 ID 要稳定、全小写、便于作为对象 key 使用。后续本地缓存、设置项、汇总配置都会引用这个 ID。

### 后台入口和权限域名

需要确认：

- 创作者后台首页 URL。
- 账号概览页 URL。
- 作品管理页 URL。
- 数据中心或内容分析页 URL。
- 这些 URL 对应的域名和路径匹配规则。

这些信息会进入：

- `hostPermissions`
- `contentScripts.matches`
- `syncEntrypoints`
- `matchesActiveTab(url)`

### 需要采集的指标

当前 AllFans 汇总层主要识别这些通用字段：

| 字段 | 含义 |
|------|------|
| `displayName` | 账号名称 |
| `fans` | 粉丝数 |
| `accountLikeCount` | 账号累计获赞 |
| `playCount` | 播放量、阅读量或浏览量 |
| `likeCount` | 内容点赞量 |
| `commentCount` | 评论量 |
| `shareCount` | 分享量 |
| `favoriteCount` | 收藏量 |
| `worksCount` | 本次统计到的作品数 |
| `totalWorksCount` | 平台显示的作品总数 |
| `lastUpdate` | 最近更新时间 |
| `accountStatsLastUpdate` | 账号数据最近更新时间 |
| `contentStatsLastUpdate` | 作品数据最近更新时间 |

如果新平台有特殊指标，可以先放在平台自己的 state 中，但只有 `getSummaryContributions()` 返回的字段会进入全局汇总。

### 数据来源样本

优先使用平台后台页面里的接口响应，而不是 DOM 文本。

推荐提供：

- DevTools Network 里相关接口的 URL。
- 接口响应 JSON 样本，隐去用户 ID、手机号、token、cookie 等敏感信息。
- 每个目标指标对应的 JSON 字段路径。
- 如果接口不可用，再提供页面截图或 HTML 片段。

不要提交账号密码、cookie、token、验证码或其他登录凭据。

## 标准接入步骤

### 1. 新增平台定义

在 `extension/platforms/` 下新增 `xxx-platform.js`。

平台定义需要包含：

- `id`
- `displayName`
- `title`
- `order`
- `hostPermissions`
- `contentScripts`
- `syncEntrypoints`
- `defaultSyncEntrypointId`
- `card`
- `createEmptyState()`
- `getSummaryContributions(state)`
- `matchesActiveTab(url)`
- `createPopupCardModel(platformData)`

最小结构示例：

```js
import { createSplitSyncCardModel } from './platform-card-model.js';

export const examplePlatform = {
  id: 'example',
  displayName: '示例平台',
  title: '示例平台',
  order: 4,
  hostPermissions: ['https://creator.example.com/*'],
  contentScripts: [
    {
      matches: ['https://creator.example.com/*'],
      js: ['content/example-metrics.js', 'content/example-sync.js'],
      runAt: 'document_idle'
    }
  ],
  syncEntrypoints: [
    {
      id: 'home',
      label: '打开示例平台创作者首页',
      actionLabel: '同步账号数据',
      url: 'https://creator.example.com/home',
      urlPrefix: 'https://creator.example.com/home'
    }
  ],
  defaultSyncEntrypointId: 'home',
  card: {
    mode: 'split',
    homeUrl: 'https://creator.example.com/home',
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
  },
  createEmptyState() {
    return {
      displayName: '',
      fans: 0,
      accountLikeCount: 0,
      playCount: 0,
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      favoriteCount: 0,
      worksCount: 0,
      accountStatsLastUpdate: null,
      contentStatsLastUpdate: null,
      lastUpdate: null,
      updateSource: null
    };
  },
  getSummaryContributions(state) {
    return {
      totalFans: state?.fans || 0,
      totalPlayCount: state?.playCount || 0,
      totalLikeCount: state?.accountLikeCount || state?.likeCount || 0
    };
  },
  matchesActiveTab(url) {
    if (url?.startsWith('https://creator.example.com/home')) {
      return {
        platformId: 'example',
        entrypointId: 'home',
        platformName: '示例平台'
      };
    }

    return null;
  },
  createPopupCardModel(platformData) {
    return createSplitSyncCardModel(this, platformData);
  }
};
```

如果平台像 B 站一样一次同步拿完整数据，`card.mode` 使用 `single`，所有 section 的 `syncField` 使用 `lastUpdate`，并在 `createPopupCardModel()` 中调用 `createSingleSyncCardModel(this, platformData)`。

如果平台像抖音、小红书、快手一样账号和作品分开同步，`card.mode` 使用 `split`。账号 section 使用 `accountStatsLastUpdate`，作品 section 使用 `contentStatsLastUpdate`。未同步的 section 和 compact 指标不会展示；同步后真实返回 `0` 会正常展示 `0`。

更多配置说明见 [平台卡片模型](platform-card-model.md)。

### 2. 新增 metrics 解析模块

在 `extension/content/` 下新增 `xxx-metrics.js`。

这个文件只负责数据归一化，不负责打开页面、发消息或更新缓存。

建议拆出：

- 数字解析函数。
- 接口响应识别函数。
- 账号数据 patch 构建函数。
- 作品数据 patch 构建函数。
- 数据充分性判断函数。

输出应是平台 state 的局部 patch，例如：

```js
export function buildAccountPlatformPatch(payload, timestamp = new Date().toISOString()) {
  return {
    displayName: payload?.name || '',
    fans: Number(payload?.fans) || 0,
    accountLikeCount: Number(payload?.liked) || 0,
    accountStatsLastUpdate: timestamp,
    accountUpdateSource: 'account-api'
  };
}
```

解析模块要优先写单元测试。接口响应结构变化时，测试能最快发现问题。

### 3. 新增 sync 同步模块

在 `extension/content/` 下新增 `xxx-sync.js`。

这个文件负责：

- 监听 `MESSAGE_TYPES.SYNC_PLATFORM`。
- 判断当前页面是否是该平台支持的后台页。
- 读取页面上下文或接口响应。
- 调用 metrics 模块生成平台数据 patch。
- 返回 `{ success: true, data }` 给 background。

如果平台数据来自页面自己的 `fetch/XHR`，可以参考小红书的 bridge 方案：

- content script 负责和扩展通信。
- bridge script 注入页面上下文，拦截页面接口响应。
- manifest 中通过 `web_accessible_resources` 暴露 bridge 文件。

只有在 content script 无法直接拿到数据时，才引入 bridge。

### 4. 注册平台

修改 `extension/runtime/platform-registry.js`：

```js
import { examplePlatform } from '../platforms/example-platform.js';

export const platformRegistry = [
  bilibiliPlatform,
  douyinPlatform,
  xiaohongshuPlatform,
  examplePlatform
].sort((left, right) => left.order - right.order);
```

注册后，以下能力会自动使用新平台：

- 默认 settings 初始化。
- 平台启用 / 隐藏设置。
- 同步启用设置。
- 汇总纳入设置。
- popup 平台列表。
- 全量同步遍历。
- summary 聚合。

### 5. 更新 manifest

开发态需要修改 `extension/manifest.json`：

- 增加平台域名到 `host_permissions`。
- 增加 content script 注入规则。
- 如需 bridge，增加 `web_accessible_resources`。

示例：

```json
{
  "host_permissions": [
    "https://creator.example.com/*"
  ],
  "content_scripts": [
    {
      "matches": ["https://creator.example.com/*"],
      "js": ["content/example-metrics.js", "content/example-sync.js"],
      "run_at": "document_idle"
    }
  ]
}
```

构建产物的 manifest 由构建脚本生成。新增权限后，需要确认 `npm run build` 产出的各浏览器目录都包含正确声明。

### 6. 增加测试

优先补这些测试：

- `tests/xxx-metrics.test.mjs`：验证接口响应能解析成统一字段。
- `tests/platform-registry.test.mjs`：验证平台已注册、URL 能匹配。
- `tests/data-model.test.mjs`：如新增 state 字段或汇总行为变化，需要覆盖。
- `tests/manifest-builder.test.mjs`：如新增权限影响多浏览器 manifest，需要覆盖。

测试样本必须脱敏。不要把真实用户 ID、token、cookie 或私密接口参数提交到仓库。

## 数据采集建议

优先级从高到低：

1. 后台接口 JSON。
2. 页面内全局状态对象。
3. DOM 文本。
4. OCR 或截图识别，通常不建议用于正式接入。

接口 JSON 通常最稳定，也最容易测试。DOM 文本容易受到 UI 改版、语言、缩写和千分位格式影响，只适合作为兜底。

## 开发验收清单

新增平台完成前，应确认：

- 平台已出现在 popup 列表。
- 平台已出现在设置页，并支持启用、隐藏、允许同步、纳入汇总。
- 点击平台名称能打开正确后台页。
- 在目标页面点击同步能返回数据。
- 全量同步能打开默认入口并完成同步。
- 未登录或页面不正确时，有清晰错误提示。
- 本地缓存中 `platforms[platformId]` 字段结构符合 `createEmptyState()`。
- 全局 summary 正确累计粉丝、播放和点赞。
- `npm test` 通过。
- `npm run build` 通过。
- 构建后的 `dist/chrome`、`dist/edge`、`dist/firefox`、`dist/safari` manifest 权限正确。

## 给需求方的数据模板

后续新增平台时，可以让需求方按这个模板提供资料：

```text
平台：
内部 ID：
平台图标：

后台首页：
账号概览页：
作品管理页：
数据中心页：

需要统计：
- 粉丝数：
- 播放 / 阅读 / 浏览量：
- 点赞量：
- 评论量：
- 分享量：
- 收藏量：
- 作品数：
- 其他指标：

数据来源：
- 接口 1：
- 接口 2：
- 响应 JSON 样本：
- 字段路径说明：

同步流程：
1.
2.
3.

特殊说明：
- 是否需要滚动加载：
- 是否需要切换页面：
- 是否需要 bridge 注入：
- 未登录时页面表现：
```

## 常见风险

- 平台接口依赖登录态，不能在 background 里直接请求，需要在已登录页面的 content script 中采集。
- 平台接口字段可能经常变化，metrics 解析要尽量集中，避免散落到 sync 流程里。
- 部分平台数据分散在多个页面，需要设计多个 `syncEntrypoints`。
- 内容列表如果需要滚动加载，要明确统计口径：全部作品、当前页作品、最近 N 条作品。
- 扩展商店审核会关注新增域名权限，manifest 权限要保持最小化。
- 不要收集或持久化 cookie、token、手机号、私信、收入明细等非必要敏感数据。
