# AllFans

AllFans 是一个面向创作者后台的浏览器插件，用来汇总多平台账号数据，并在一个 popup 里统一查看。

当前版本已接入：

- Bilibili
- 抖音
- 小红书

## 当前能力

- 汇总全网粉丝数、播放量、点赞量和平台数
- 在 popup 中查看平台卡片和同步状态
- 支持点击平台标题直达创作中心首页
- 支持在 popup 中一键同步整个平台
- 支持从 B 站创作中心自动同步数据
- 支持从抖音创作者中心首页同步账号概览
- 支持从抖音作品管理页同步作品汇总
- 支持从小红书主页概览页同步账号信息
- 支持从小红书笔记管理页同步作品汇总
- 支持多浏览器构建产物输出

## 项目结构

```text
extension/
  background/      后台入口
  content/         内容脚本与指标提取
  icons/           扩展图标
  platforms/       平台定义
  popup/           popup 页面与交互
  runtime/         浏览器适配、消息协议、存储管理
  utils/           数据模型

scripts/           构建脚本
tests/             单元测试
dist/              构建产物
```

## 开发环境

- Node.js 18+
- npm

安装依赖：

```powershell
npm install
```

## 常用命令

运行测试：

```powershell
npm test
```

构建浏览器产物：

```powershell
npm run build
```

构建完成后会生成：

- `dist/chrome`
- `dist/edge`
- `dist/firefox`
- `dist/safari`

## 本地调试

开发阶段建议直接加载源码目录：

- Chrome / Edge：在扩展管理页开启开发者模式后，加载 `extension/`

如果需要验证打包产物，再加载对应目标目录：

- `dist/chrome`
- `dist/edge`
- `dist/firefox`
- `dist/safari`

核心入口文件：

- `extension/manifest.json`
- `extension/background/main.js`
- `extension/popup/index.html`

## Popup 交互

- 点击平台标题：打开对应创作中心首页
- 点击平台状态按钮：触发该平台的一键同步
- 点击展开：查看账号概览和作品汇总

## 数据来源

### Bilibili

- 创作中心统计接口
- 当前登录用户信息接口

### 抖音

- 创作者中心首页账号信息接口
- 作品管理页作品列表接口

### 小红书

- 首页账号信息接口
- 笔记管理页作品列表接口
- 页面上下文桥接脚本

## 扩展新平台

当前结构按平台拆分，新增平台时保持同样边界：

1. 在 `extension/platforms/` 新增平台定义
2. 在 `extension/content/` 新增平台同步脚本与指标提取
3. 在 `extension/runtime/platform-registry.js` 注册平台
4. 在 `tests/` 补对应测试

不要再引入影子实现、历史副本文件或平台专属的临时 popup 分支。

## 发布前检查

发布到 Git 之前，至少确认这几项：

- `npm test` 通过
- `npm run build` 可以生成各浏览器产物
- popup 中的 B 站、抖音和小红书同步链路可用
- 不提交本地调试文档和临时样本文件
