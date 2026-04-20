# AllFans Pro 桌面应用设计文档

> 版本: 1.0
> 日期: 2026-04-19
> 状态: 草案

## 1. 产品定位

### 1.1 核心价值

AllFans Pro 是一个本地桌面应用，与 AllFans 浏览器扩展配合使用，为创作者提供：

1. **历史数据趋势分析** — 追踪粉丝、播放量、点赞量的增长轨迹
2. **数据卡片导出** — 一键生成可用于视频/直播的数据展示素材

### 1.2 目标用户

| 优先级 | 用户类型 | 核心需求 |
|--------|----------|----------|
| P0 | 视频创作者 | 导出透明 PNG 数据卡，用于视频片头展示 |
| P0 | 个人创作者 | 查看历史趋势，了解成长轨迹 |
| P1 | 直播主播 | OBS 叠加实时数据展示 |
| P2 | MCN/代运营 | 多账号管理、客户报表 |

### 1.3 商业模式

采用**功能分级**模式：

- 免费版：基础趋势查看、基础导出（带水印）
- Pro 版：高级模板、高清导出、无水印、更多历史数据

具体划分待产品成熟后确定，当前预留授权检查接口。

---

## 2. 整体架构

### 2.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                          用户电脑                                    │
│                                                                     │
│  ┌──────────────┐      HTTP POST       ┌──────────────────────┐    │
│  │ 浏览器扩展    │ ───────────────────▶ │ Tauri 桌面应用        │    │
│  │ AllFans      │   localhost:8765     │ AllFans Pro          │    │
│  │              │                      │                      │    │
│  │ - 采集数据    │                      │ ┌──────────────────┐ │    │
│  │ - 推送快照    │                      │ │ HTTP Server      │ │    │
│  └──────────────┘                      │ │ (接收快照)       │ │    │
│                                        │ └────────┬─────────┘ │    │
│                                        │          ▼           │    │
│                                        │ ┌──────────────────┐ │    │
│                                        │ │ Core Layer       │ │    │
│                                        │ │ - Snapshot Repo  │ │    │
│                                        │ │ - Export Engine  │ │    │
│                                        │ │ - License Mgr    │ │    │
│                                        │ └────────┬─────────┘ │    │
│                                        │          ▼           │    │
│                                        │ ┌──────────────────┐ │    │
│                                        │ │ SQLite 数据库    │ │    │
│                                        │ └──────────────────┘ │    │
│                                        │          │           │    │
│                                        │          ▼           │    │
│                                        │ ┌──────────────────┐ │    │
│                                        │ │ React 前端       │ │    │
│                                        │ │ - 趋势图表       │ │    │
│                                        │ │ - 模板预览       │ │    │
│                                        │ │ - 导出控制       │ │    │
│                                        │ └──────────────────┘ │    │
│                                        └──────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
浏览器扩展                    Tauri 应用
    │                              │
    │  1. 用户点击"同步"           │
    │  ─────────────────────────▶  │
    │     POST /snapshot           │
    │     { platforms, summary }   │
    │                              │
    │                              │  2. 解析验证
    │                              │     │
    │                              │     ▼
    │                              │  3. 存入 SQLite
    │                              │     │
    │                              │     ▼
    │                              │  4. 发送事件通知前端
    │                              │     │
    │  ◀─────────────────────────  │     ▼
    │     200 OK                   │  5. 前端刷新趋势图
    │                              │
```

---

## 3. 模块设计

### 3.1 模块分层架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Presentation Layer (React)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │
│  │ Dashboard   │  │  Trend      │  │  Template   │  │ Settings  │  │
│  │ Page        │  │  Chart      │  │  Gallery    │  │ Page      │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ Tauri Commands
┌─────────────────────────────────────────────────────────────────────┐
│                      Service Layer (Rust)                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │
│  │ SyncService │  │ TrendService│  │ExportService│  │LicenseSvc │  │
│  │             │  │             │  │             │  │           │  │
│  │ - 同步调度  │  │ - 趋势计算  │  │ - 导出协调  │  │ - 授权检查│  │
│  │ - 冲突处理  │  │ - 异常检测  │  │ - 模板管理  │  │ - 功能门控│  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Core Layer (Rust)                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │
│  │ HttpServer  │  │  Snapshot   │  │   Export    │  │  Event    │  │
│  │             │  │  Repository │  │   Engine    │  │  Bus      │  │
│  │             │  │             │  │             │  │           │  │
│  │ - 监听端口  │  │ - 存储快照  │  │ - 模板渲染  │  │ - 消息分发│  │
│  │ - 解析请求  │  │ - 查询历史  │  │ - 格式转换  │  │ - 解耦模块│  │
│  │ - 验证格式  │  │ - 聚合统计  │  │ - 文件输出  │  │           │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Infrastructure Layer                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │ SQLite      │  │ File System │  │ Config      │                 │
│  │ (rusqlite)  │  │ (std::fs)   │  │ (toml)      │                 │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 模块职责说明

| 模块 | 层级 | 职责 | 依赖 |
|------|------|------|------|
| HttpServer | Core | 监听 localhost:8765，接收扩展推送的快照 | EventBus |
| SnapshotRepository | Core | 快照的 CRUD 操作，历史查询，聚合统计 | SQLite |
| ExportEngine | Core | 模板加载、数据绑定、渲染、格式转换 | FileSystem |
| EventBus | Core | 模块间异步通信，解耦 | 无 |
| SyncService | Service | 同步调度，冲突检测与处理 | SnapshotRepository, EventBus |
| TrendService | Service | 趋势计算，异常检测 | SnapshotRepository |
| ExportService | Service | 导出任务协调，模板选择 | ExportEngine, LicenseService |
| LicenseService | Service | 授权验证，功能门控 | Config |
| Dashboard | Presentation | 主页面，数据概览 | TrendService |
| TrendChart | Presentation | 趋势图表组件 | TrendService |
| TemplateGallery | Presentation | 模板选择与预览 | ExportService |
| Settings | Presentation | 设置页面 | Config |

### 3.3 设计原则

| 原则 | 应用示例 |
|------|----------|
| 单一职责 | ExportEngine 只负责渲染，格式转换由独立 Exporter 实现 |
| 依赖倒置 | Service 层依赖 Repository trait，不依赖具体 SQLite 实现 |
| 开闭原则 | 新增导出格式 = 新增 Exporter 实现，不修改 ExportEngine |
| 事件驱动 | 快照入库后发送 SnapshotSaved 事件，前端监听刷新 |

---

## 4. 数据模型

### 4.1 SQLite 表结构

```sql
-- 平台快照表
CREATE TABLE snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform_id TEXT NOT NULL,        -- bilibili, douyin, xiaohongshu
    fans_count INTEGER DEFAULT 0,
    play_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    extra_data TEXT,                  -- JSON，存储平台特有字段
    captured_at TEXT NOT NULL,        -- ISO 8601 时间戳
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 索引优化查询
CREATE INDEX idx_snapshots_platform_time ON snapshots(platform_id, captured_at);
CREATE INDEX idx_snapshots_captured_at ON snapshots(captured_at);

-- 同步记录表
CREATE TABLE sync_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,             -- 'extension', 'manual'
    status TEXT NOT NULL,             -- 'success', 'partial', 'failed'
    platforms_synced TEXT,            -- JSON array
    error_message TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 应用配置表
CREATE TABLE app_config (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 授权信息表
CREATE TABLE license (
    id INTEGER PRIMARY KEY CHECK (id = 1),  -- 单例
    license_key TEXT,
    status TEXT DEFAULT 'free',              -- 'free', 'pro', 'expired'
    activated_at TEXT,
    expires_at TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### 4.2 Rust 数据结构

```rust
// 快照实体
pub struct Snapshot {
    pub id: Option<i64>,
    pub platform_id: String,
    pub fans_count: i64,
    pub play_count: i64,
    pub like_count: i64,
    pub extra_data: Option<serde_json::Value>,
    pub captured_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

// 趋势数据点
pub struct TrendPoint {
    pub date: NaiveDate,
    pub fans_count: i64,
    pub fans_change: i64,        // 相比前一天的变化
    pub play_count: i64,
    pub play_change: i64,
    pub like_count: i64,
    pub like_change: i64,
}

// 平台聚合数据
pub struct PlatformSummary {
    pub platform_id: String,
    pub current_fans: i64,
    pub fans_7d_change: i64,
    pub fans_30d_change: i64,
    pub current_play: i64,
    pub current_like: i64,
}

// 扩展推送的快照格式（兼容现有格式）
#[derive(Deserialize)]
pub struct ExtensionSnapshot {
    pub schema_version: u32,
    pub timestamp: String,
    pub platforms: HashMap<String, PlatformData>,
    pub summary: SummaryData,
}

#[derive(Deserialize)]
pub struct PlatformData {
    pub fans_count: Option<i64>,
    pub play_count: Option<i64>,
    pub like_count: Option<i64>,
    #[serde(flatten)]
    pub extra: serde_json::Value,
}
```

### 4.3 扩展性设计

**核心字段 + JSON 扩展字段模式：**

| 字段类型 | 存储方式 | 扩展方式 |
|---------|---------|----------|
| 通用核心字段 | 独立列 | ALTER TABLE ADD COLUMN |
| 平台特有字段 | extra_data (JSON) | 直接存入，无需改表 |

**示例：**

```json
// Bilibili 的 extra_data
{
  "archive_count": 120,
  "follower_count": 50000,
  "level": 6
}

// 抖音的 extra_data
{
  "video_count": 89,
  "live_count": 12
}
```

---

## 5. 导出引擎设计

### 5.1 模块结构

```
┌─────────────────────────────────────────────────────────────────┐
│                       Export Engine                              │
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │   Template  │    │   Renderer  │    │     Exporter        │ │
│  │   Loader    │───▶│   (Canvas)  │───▶│  ┌───────────────┐  │ │
│  └─────────────┘    └─────────────┘    │  │ SvgExporter   │  │ │
│         │                  │           │  ├───────────────┤  │ │
│         ▼                  ▼           │  │ PngExporter   │  │ │
│  ┌─────────────┐    ┌─────────────┐    │  ├───────────────┤  │ │
│  │ 模板定义    │    │ 数据绑定    │    │  │ PdfExporter   │  │ │
│  │ (YAML)      │    │ 布局计算    │    │  └───────────────┘  │ │
│  └─────────────┘    └─────────────┘    └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 模板定义格式

```yaml
# templates/minimal-card.yaml
name: "简约数据卡"
version: 1
author: "AllFans"
canvas:
  width: 800
  height: 400
  background: "#1a1a2e"
elements:
  - type: text
    id: total_fans
    position: { x: 50, y: 80 }
    content: "{{summary.totalFans}}"
    style:
      font: "Arial"
      size: 48
      color: "#ffffff"
      weight: bold
  - type: text
    id: label
    position: { x: 50, y: 140 }
    content: "全网粉丝"
    style:
      font: "Arial"
      size: 24
      color: "#888888"
  - type: list
    id: platform_list
    position: { x: 50, y: 200 }
    direction: horizontal
    spacing: 20
    items: "{{platforms}}"
    template:
      type: container
      elements:
        - type: icon
          source: "platform://{{item.id}}"
          size: 32
        - type: text
          content: "{{item.fansCount}}"
          style:
            size: 20
            color: "#ffffff"
```

### 5.3 Rust 接口设计

```rust
// 模板定义
pub struct Template {
    pub name: String,
    pub version: u32,
    pub canvas: CanvasConfig,
    pub elements: Vec<TemplateElement>,
}

// 渲染器 trait
pub trait Renderer {
    fn render(&self, template: &Template, data: &ExportData) -> Result<Canvas, RenderError>;
}

// 导出器 trait
pub trait Exporter {
    fn export(&self, canvas: &Canvas, output: &mut dyn Write) -> Result<(), ExportError>;
    fn format(&self) -> ExportFormat;
    fn file_extension(&self) -> &'static str;
}

pub enum ExportFormat {
    Svg,
    Png { scale: f32, transparent: bool },
    Pdf,
}

// 导出数据
pub struct ExportData {
    pub summary: Summary,
    pub platforms: Vec<PlatformSnapshot>,
    pub trend: Option<TrendData>,
    pub generated_at: DateTime<Utc>,
}

// 导出服务
pub struct ExportService {
    template_loader: Box<dyn TemplateLoader>,
    renderer: Box<dyn Renderer>,
    exporters: HashMap<ExportFormat, Box<dyn Exporter>>,
    license_service: Arc<LicenseService>,
}

impl ExportService {
    pub async fn export(
        &self,
        template_id: &str,
        format: ExportFormat,
        data: ExportData,
    ) -> Result<Vec<u8>, ExportError> {
        // 1. 检查授权
        self.license_service.check_feature(Feature::Export(format.clone()))?;
        
        // 2. 加载模板
        let template = self.template_loader.load(template_id)?;
        
        // 3. 渲染
        let canvas = self.renderer.render(&template, &data)?;
        
        // 4. 导出
        let exporter = self.exporters.get(&format).ok_or(ExportError::UnsupportedFormat)?;
        let mut output = Vec::new();
        exporter.export(&canvas, &mut output)?;
        
        Ok(output)
    }
}
```

### 5.4 内置模板

| 模板 ID | 名称 | 用途 | Pro 专属 |
|---------|------|------|----------|
| minimal-card | 简约数据卡 | 视频片头展示 | 否 |
| dark-card | 深色数据卡 | 深色主题视频 | 否 |
| gradient-card | 渐变数据卡 | 时尚风格 | 是 |
| live-overlay | 直播叠加层 | OBS 浏览器源 | 是 |
| weekly-report | 周报卡片 | 社交媒体分享 | 是 |
| milestone | 里程碑卡片 | 粉丝突破庆祝 | 是 |

---

## 6. HTTP API 设计

### 6.1 扩展推送接口

**POST /api/snapshot**

接收扩展推送的快照数据。

请求体：
```json
{
  "schemaVersion": 2,
  "timestamp": "2026-04-19T10:30:00Z",
  "platforms": {
    "bilibili": {
      "fansCount": 50000,
      "playCount": 1000000,
      "likeCount": 200000
    },
    "douyin": {
      "fansCount": 30000,
      "playCount": 500000,
      "likeCount": 100000
    }
  },
  "summary": {
    "totalFans": 80000,
    "totalPlayCount": 1500000,
    "totalLikeCount": 300000
  }
}
```

响应：
```json
{
  "success": true,
  "savedPlatforms": ["bilibili", "douyin"],
  "snapshotId": 12345
}
```

### 6.2 Tauri Commands（前端调用）

```rust
#[tauri::command]
async fn get_trend_data(
    platform_id: Option<String>,
    days: u32,
    repo: State<'_, SnapshotRepository>,
) -> Result<Vec<TrendPoint>, String> {
    repo.get_trend(platform_id.as_deref(), days)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_platform_summary(
    repo: State<'_, SnapshotRepository>,
) -> Result<Vec<PlatformSummary>, String> {
    repo.get_platform_summaries()
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn export_image(
    template_id: String,
    format: String,
    export_service: State<'_, ExportService>,
) -> Result<Vec<u8>, String> {
    let format = parse_export_format(&format)?;
    let data = export_service.prepare_export_data().await?;
    export_service.export(&template_id, format, data).await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_templates(
    export_service: State<'_, ExportService>,
) -> Result<Vec<TemplateInfo>, String> {
    export_service.list_templates()
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_exported_file(
    data: Vec<u8>,
    filename: String,
    format: String,
) -> Result<String, String> {
    let path = show_save_dialog(&filename)?;
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}
```

---

## 7. 前端页面设计

### 7.1 页面结构

```
┌─────────────────────────────────────────────────────────────────┐
│  AllFans Pro                                    [设置] [最小化] │
├─────────────────────────────────────────────────────────────────┤
│  [仪表盘]  [趋势]  [导出]  [设置]                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                        页面内容区域                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 仪表盘页面

```
┌─────────────────────────────────────────────────────────────────┐
│  数据概览                                    最后同步: 10分钟前  │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   80,000     │  │  1,500,000   │  │    300,000   │          │
│  │   全网粉丝    │  │   总播放量    │  │    总点赞    │          │
│  │   +520 今日  │  │  +12,000 今日│  │  +3,200 今日 │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
├─────────────────────────────────────────────────────────────────┤
│  平台数据                                                       │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ [B站图标] Bilibili    50,000 粉丝    1,000,000 播放         ││
│  │           今日 +200              +5,000                     ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ [抖音图标] 抖音       30,000 粉丝      500,000 播放         ││
│  │           今日 +320              +7,000                     ││
│  └─────────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│  7日趋势                                                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    📈 趋势图表                               ││
│  │              （使用 Recharts 或 ECharts）                    ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 7.3 导出页面

```
┌─────────────────────────────────────────────────────────────────┐
│  数据卡片导出                                                   │
├─────────────────────────────────────────────────────────────────┤
│  选择模板                                                       │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐              │
│  │ 简约卡   │ │ 深色卡   │ │ 渐变卡   │ │ 直播层   │              │
│  │ [预览图] │ │ [预览图] │ │ [预览图] │ │ [预览图] │              │
│  │   ✓     │ │         │ │   🔒    │ │   🔒    │              │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘              │
├─────────────────────────────────────────────────────────────────┤
│  预览                                                          │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │              ┌─────────────────────┐                        ││
│  │              │    80,000           │                        ││
│  │              │    全网粉丝          │                        ││
│  │              │  [B站] [抖音] [小红书]│                        ││
│  │              └─────────────────────┘                        ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│  导出设置                                                       │
│  格式: [SVG ▼]    分辨率: [1x ▼]    背景: [透明 ☑]             │
│                                                                 │
│                              [导出到文件]  [复制到剪贴板]        │
└─────────────────────────────────────────────────────────────────┘
```

### 7.4 技术选型

| 类别 | 选择 | 理由 |
|------|------|------|
| 框架 | React 18 | 生态成熟，TypeScript 支持好 |
| 构建 | Vite | 快速，Tauri 官方推荐 |
| UI 组件 | shadcn/ui | 现代、可定制、基于 Tailwind |
| 图表 | Recharts | React 原生，声明式 API |
| 状态管理 | Zustand | 轻量，适合中小应用 |
| 样式 | Tailwind CSS | 与 shadcn/ui 配合 |

---

## 8. 授权系统设计

### 8.1 功能门控

```rust
pub enum Feature {
    Export(ExportFormat),
    Template(String),
    TrendHistory(u32),  // 天数
    Platform(String),   // 平台 ID
}

pub struct LicenseService {
    license: Arc<RwLock<License>>,
}

impl LicenseService {
    pub fn check_feature(&self, feature: Feature) -> Result<(), LicenseError> {
        let license = self.license.read().unwrap();
        
        match license.status {
            LicenseStatus::Pro => Ok(()),
            LicenseStatus::Free => {
                match feature {
                    Feature::Export(ExportFormat::Svg) => Ok(()),
                    Feature::Export(ExportFormat::Png { .. }) => Ok(()),
                    Feature::Template(id) if is_free_template(&id) => Ok(()),
                    Feature::TrendHistory(days) if days <= 7 => Ok(()),
                    _ => Err(LicenseError::ProRequired(feature)),
                }
            }
            LicenseStatus::Expired => Err(LicenseError::Expired),
        }
    }
}
```

### 8.2 授权验证流程

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  用户输入    │────▶│  本地验证    │────▶│  离线激活    │
│  License Key │     │  (签名校验)  │     │  (可选)     │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  存储授权    │
                    │  (SQLite)   │
                    └─────────────┘
```

**授权 Key 格式（离线验证）：**

```
ALLFANS-PRO-XXXX-XXXX-XXXX
         │
         └──▶ 包含加密的用户信息和过期时间
              使用非对称加密签名，公钥内置在应用中
```

---

## 9. 项目结构

```
allfans-pro/
├── src-tauri/                    # Rust 后端
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── src/
│   │   ├── main.rs              # 入口
│   │   ├── lib.rs               # 模块导出
│   │   ├── core/
│   │   │   ├── mod.rs
│   │   │   ├── http_server.rs   # HTTP 服务
│   │   │   ├── snapshot_repo.rs # 快照仓储
│   │   │   ├── export_engine/   # 导出引擎
│   │   │   │   ├── mod.rs
│   │   │   │   ├── template.rs
│   │   │   │   ├── renderer.rs
│   │   │   │   └── exporter/
│   │   │   │       ├── mod.rs
│   │   │   │       ├── svg.rs
│   │   │   │       └── png.rs
│   │   │   └── event_bus.rs     # 事件总线
│   │   ├── service/
│   │   │   ├── mod.rs
│   │   │   ├── sync_service.rs
│   │   │   ├── trend_service.rs
│   │   │   ├── export_service.rs
│   │   │   └── license_service.rs
│   │   ├── commands/            # Tauri 命令
│   │   │   ├── mod.rs
│   │   │   ├── snapshot.rs
│   │   │   ├── trend.rs
│   │   │   ├── export.rs
│   │   │   └── license.rs
│   │   ├── models/              # 数据模型
│   │   │   ├── mod.rs
│   │   │   ├── snapshot.rs
│   │   │   └── trend.rs
│   │   └── utils/
│   │       ├── mod.rs
│   │       └── db.rs
│   └── templates/               # 内置模板
│       ├── minimal-card.yaml
│       ├── dark-card.yaml
│       └── ...
├── src/                         # React 前端
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── ui/                  # shadcn/ui 组件
│   │   ├── Dashboard/
│   │   ├── TrendChart/
│   │   ├── TemplateGallery/
│   │   └── Settings/
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Trend.tsx
│   │   ├── Export.tsx
│   │   └── Settings.tsx
│   ├── stores/                  # Zustand stores
│   │   ├── snapshotStore.ts
│   │   └── settingsStore.ts
│   ├── hooks/
│   │   └── useTauri.ts
│   └── lib/
│       └── utils.ts
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

---

## 10. 开发计划

### 10.1 MVP 功能清单

| 阶段 | 功能 | 优先级 |
|------|------|--------|
| P0 | HTTP Server 接收快照 | 必须 |
| P0 | SQLite 存储快照 | 必须 |
| P0 | 仪表盘页面（数据概览） | 必须 |
| P0 | 趋势图表（7天） | 必须 |
| P0 | 基础模板导出（SVG/PNG） | 必须 |
| P1 | 多模板支持 | 重要 |
| P1 | 导出设置（分辨率、透明背景） | 重要 |
| P1 | 设置页面 | 重要 |
| P2 | 授权系统框架 | 可选 |
| P2 | 更多历史数据（30/90天） | 可选 |

### 10.2 后续迭代方向

1. **更多模板** — 根据用户反馈持续添加
2. **更多平台** — 快手、视频号、YouTube 等
3. **自动化功能** — 定时同步、数据提醒
4. **团队功能** — 多账号管理（需要云端支持）

---

## 11. 风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| 扩展推送格式变更 | 数据解析失败 | 版本号校验，兼容旧格式 |
| SQLite 数据损坏 | 历史数据丢失 | 定期备份，导出功能 |
| 模板渲染性能 | 导出慢 | 异步导出，进度提示 |
| 授权绕过 | 收入损失 | 离线签名验证，定期检查 |

---

## 附录 A：扩展快照格式

当前扩展推送的 JSON 格式（schema version 2）：

```json
{
  "schemaVersion": 2,
  "timestamp": "2026-04-19T10:30:00.000Z",
  "platforms": {
    "bilibili": {
      "fansCount": 50000,
      "playCount": 1000000,
      "likeCount": 200000,
      "lastUpdate": "2026-04-19T10:30:00.000Z"
    }
  },
  "summary": {
    "totalFans": 80000,
    "totalPlayCount": 1500000,
    "totalLikeCount": 300000,
    "lastUpdate": "2026-04-19T10:30:00.000Z"
  },
  "settingsSnapshot": {
    "enabledPlatformIds": ["bilibili", "douyin", "xiaohongshu"],
    "localBridgeEnabled": true,
    "localBridgeEndpoint": "http://127.0.0.1:8765"
  },
  "syncResults": [
    {
      "platformId": "bilibili",
      "status": "success",
      "timestamp": "2026-04-19T10:30:00.000Z"
    }
  ]
}
```

---

## 附录 B：技术栈依赖

**Rust (Cargo.toml):**

```toml
[dependencies]
tauri = { version = "2", features = ["shell-open"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
rusqlite = { version = "0.31", features = ["bundled"] }
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1", features = ["v4"] }
thiserror = "1"
tracing = "0.1"
tracing-subscriber = "0.3"
axum = "0.7"                    # HTTP server
tower-http = { version = "0.5", features = ["cors"] }
resvg = "0.41"                  # SVG 渲染
tiny-skia = "0.11"              # PNG 导出
fontdb = "0.16"                 # 字体管理
yaml-rust = "0.4"               # 模板解析
handlebars = "5"                # 模板变量替换
```

**前端 (package.json):**

```json
{
  "dependencies": {
    "react": "^18",
    "react-dom": "^18",
    "react-router-dom": "^6",
    "zustand": "^4",
    "recharts": "^2",
    "@tauri-apps/api": "^2",
    "lucide-react": "^0.300",
    "class-variance-authority": "^0.7",
    "clsx": "^2",
    "tailwind-merge": "^2"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2",
    "typescript": "^5",
    "vite": "^5",
    "@vitejs/plugin-react": "^4",
    "tailwindcss": "^3",
    "autoprefixer": "^10",
    "postcss": "^8"
  }
}
```
