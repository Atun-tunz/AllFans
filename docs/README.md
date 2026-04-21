# AllFans 文档

AllFans 是一个跨浏览器扩展，用于汇总查看多平台创作者后台数据。

## 文档索引

| 文档 | 说明 |
|------|------|
| [design.md](design.md) | 架构设计、目录结构、数据模型、同步链路 |
| [add-platform-guide.md](add-platform-guide.md) | 新平台接入步骤、数据准备模板、验收清单 |
| [platform-card-model.md](platform-card-model.md) | popup 平台卡片双模式模型、指标展示规则 |
| [local-bridge.md](local-bridge.md) | 本地程序对接协议 |
| [debug-guide.md](debug-guide.md) | 排查指南、常见问题 |

## 快速开始

```powershell
npm test        # 运行测试
npm run build   # 构建
```

构建产物输出到 `dist/chrome`、`dist/edge`、`dist/firefox`、`dist/safari`。

## 当前支持平台

- B站
- 抖音
- 小红书
- 快手

## 长期保留备忘

- [monetization-notes.md](monetization-notes.md) - DO NOT DELETE / 不要删除：盈利方向、Pro 工具和长期商业化备忘。
