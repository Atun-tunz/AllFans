# AllFans 文档

AllFans 是一个跨浏览器扩展，用于汇总查看多平台创作者后台数据。

## 文档索引

| 文档 | 说明 |
|------|------|
| [architecture.md](architecture.md) | 项目架构设计、核心模块、数据流说明 |
| [developer-guide.md](developer-guide.md) | 开发环境搭建、构建测试、代码规范 |
| [add-platform-guide.md](add-platform-guide.md) | 新平台接入步骤、数据准备模板、验收清单 |
| [platform-card-model.md](platform-card-model.md) | popup 平台卡片双模式模型、指标展示规则 |
| [local-bridge.md](local-bridge.md) | 本地桥接功能、数据格式、接口说明 |
| [debug-guide.md](debug-guide.md) | 常见问题排查、调试工具使用、错误信息说明 |

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
- 微博
- 视频号

## 相关文档

- [隐私政策](../privacy-policy.md) - 用户隐私政策说明
