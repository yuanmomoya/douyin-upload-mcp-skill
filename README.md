## 基于 CDP 操控抖音创作者平台，实现视频、图文的全自动发布。

<p align="center">
  <a href="https://github.com/yuanmomoya/douyin-upload-mcp-skill/">
    <img src="markdown/douyin.png" alt="Logo" width="150" height="150" style="margin: 0; border-radius: 24px;">
  </a>
</p>

<h1 align="center">Douyin Upload MCP Skill</h1>

<p align="center">
  <a href="#快速开始">快速开始</a>
  ·
  <a href="https://github.com/yuanmomoya/douyin-upload-mcp-skill/issues">报告 Bug</a>
  ·
  <a href="https://github.com/yuanmomoya/douyin-upload-mcp-skill/issues">提出新特性</a>
</p>

<p align="center">
  <a href="./README.en.md">English</a> | 中文
</p>

<br>

<p align="center">
  <img src="./markdown/example.png" alt="抖音自动发布示例" width="100%">
</p>

<p align="center"><em>▲ 通过 MCP 工具全自动发布视频和图文</em></p>

<br>

# douyin-upload-mcp-skill

基于 CDP（Chrome DevTools Protocol）的抖音创作者平台自动化上传服务，通过 MCP 协议对外暴露工具，支持视频和图文的全自动发布。

## 功能

- **视频发布**：上传视频 → 等待转码 → AI 封面推荐 → 填写标题/简介 → 一键发布
- **图文发布**：上传多张图片 → 填写标题/简介 → 自动选择音乐 → 一键发布
- **定时发布**：视频、图文均支持指定上海时间，提交前核对定时模式，提交后核对作品管理记录
- **登录管理**：扫码 → 短信验证 → 验证码输入，全流程自动推进
- **浏览器托管**：独立 Daemon 进程管理 Chrome 生命周期，闲置 30 分钟自动销毁

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 作为 MCP 服务使用（推荐）

在 MCP 客户端配置中添加：

```json
{
  "mcpServers": {
    "douyin": {
      "command": "node",
      "args": ["<项目绝对路径>/src/mcp-server.js"]
    }
  }
}
```

或手动启动：

```bash
npm run mcp
```

### 3. 运行 Demo 测试

```bash
# 视频发布
node src/demo.js

# 图文发布
node src/demo-imagetext.js
```

## MCP 工具列表

### 核心发布

| 工具 | 说明 | 必填参数 | 可选参数 |
|------|------|----------|----------|
| `douyin_publish_video` | 立即或定时发布视频 | `filePath` | `title`, `description`, `timeout`, `scheduleAt` |
| `douyin_publish_imagetext` | 立即或定时发布图文 | `filePaths` | `title`, `description`, `scheduleAt` |

### 定时发布

为上述任一发布工具传入 `scheduleAt`，例如 `2026-10-31T20:00:00+08:00`；请替换为执行时2小时后、14天内的实际日期。必须显式包含上海时区 `+08:00`，精确到整分钟，并提供 `title` 以便核验作品。

定时发布会提交一条到点自动公开的作品，不是草稿。省略 `scheduleAt` 保持立即发布。脚本只有在作品管理中找到唯一标题、正确时间及审核中/待发布状态后才返回定时提交成功；结果不明时先核查平台，不要直接重试。

图文的 `filePaths` 按传入顺序上传，按文件名排序应由调用方在传参前完成。图文标题当前限制20字，视频30字，以实际页面为准。定时图文流程不自动添加音乐。

JS 分步操作可使用 `ops.publishVideo(filePath, {title, description, draftOnly: true})` 或 `ops.publishImageText(filePaths, {title, description, prepareOnly: true})`，仅停在编辑页；再从 `src/schedule.js` 导入 `setSchedule`、`submitScheduled`、`verifyScheduled` 完成定时和核验。不要把准备模式与 `scheduleAt` 混用。

本机实测网页“暂存离开”使用单份浏览器编辑缓存，连续上传可能覆盖旧暂存。编辑页或本地缓存备份不等于多条独立云端草稿。

### 验证

```bash
npm test
```

测试覆盖时间范围、无效日期、提交前校验、临近发布时间的核验、重复记录和不确定提交，以及 MCP 参数契约；不会上传或发布真实内容。

### 登录与状态

| 工具 | 说明 | 可选参数 |
|------|------|----------|
| `douyin_check_login` | 检查登录状态并推进登录流程 | `smsCode` |
| `douyin_probe` | 探测页面元素状态 | — |
| `douyin_screenshot` | 页面截图 | — |

### 页面操作

| 工具 | 说明 | 参数 |
|------|------|------|
| `douyin_navigate_to` | 导航到指定抖音 URL | `url`, `timeout` |
| `douyin_reload_page` | 刷新页面 | `timeout` |
| `douyin_browser_info` | 获取浏览器连接信息 | — |

## 登录流程

MCP 不支持中途交互，登录需要多次调用 `douyin_check_login` 推进：

```
第 1 次调用 → phase: qrcode           → 截图保存二维码，用户扫码
第 2 次调用 → phase: sms_verification → 自动点击「接收短信验证码」
第 3 次调用 → phase: sms_code_input   → 提示输入验证码
第 4 次调用 → phase: logged_in        → 传入 smsCode 完成登录
```

## 架构

```
MCP Client → mcp-server.js → index.js → browser.js → Daemon
                                ↓
                          douyin-ops.js → operator.js → CDP → Chrome → douyin.com
```

| 层 | 文件 | 职责 |
|----|------|------|
| 协议层 | `mcp-server.js` | MCP 工具注册，stdio 传输 |
| 入口层 | `index.js` | 对外暴露 `createDouyinSession()` |
| 业务层 | `douyin-ops.js` | 抖音业务编排（上传、填写、发布） |
| 原子层 | `operator.js` | CDP 底层操作（locate/click/type），带人类行为模拟 |
| 连接层 | `browser.js` | 连接 Daemon 获取浏览器实例 |
| Daemon | `daemon/` | 独立进程管理浏览器生命周期 |

## 配置

所有配置通过环境变量或 `.env` 文件设置。项目根目录已提供 `.env` 模板，可直接修改。

**配置优先级：** `process.env` > `.env.development` > `.env` > 代码默认值

> `.env.development` 不会被 git 追踪，适合存放本地私有配置（如浏览器路径）。

### 浏览器配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `BROWSER_PATH` | 自动检测 | 浏览器可执行文件路径，支持 Chrome / Edge / Chromium。不设则自动按优先级检测系统已安装的浏览器 |
| `BROWSER_DEBUG_PORT` | `40821` | CDP 远程调试端口。多个 skill（如 gemini-skill）共享同一端口即共享同一浏览器实例 |
| `BROWSER_HEADLESS` | `false` | 是否无头模式。首次使用建议关闭（`false`），方便扫码登录 |
| `BROWSER_USER_DATA_DIR` | `~/.wjz_browser_data` | 浏览器用户数据目录，保存登录态、cookies 等。首次运行会自动从系统默认浏览器目录克隆 |
| `BROWSER_PROTOCOL_TIMEOUT` | `60000` | CDP 协议超时时间（毫秒）。视频上传等长操作可适当增大 |

### Daemon 配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DAEMON_PORT` | `40225` | Daemon HTTP 服务端口。与 gemini-skill 共享同一 Daemon |
| `DAEMON_TTL_MS` | `1800000` | 闲置超时时间（毫秒），默认 30 分钟。超时后自动关闭浏览器并退出 Daemon，下次调用时自动重新拉起 |

### 其他配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `OUTPUT_DIR` | `./douyin-output` | 截图、二维码等输出文件目录 |
| `DOUYIN_URL` | `https://creator.douyin.com/` | 抖音创作者平台首页 URL |
| `DOUYIN_WORKSPACE_TAB` | 未设置 | 可选任务标识；设置后在托管浏览器中使用独立标签页，避免人工切换页面干扰批处理 |

### 关于 OpenClaw 浏览器复用

[OpenClaw](https://github.com/) 的默认 CDP 端口是 **18800**。如果你希望复用 OpenClaw 已启动的浏览器会话，可以将 `BROWSER_DEBUG_PORT` 改为 `18800`：

```env
BROWSER_DEBUG_PORT=18800
```

**但请注意**：OpenClaw 自带的浏览器会话**没有集成 Stealth 反爬插件**，在反检测能力上不如本项目自行维护的浏览器实例。本项目使用 `puppeteer-extra-plugin-stealth` 提供了完整的反爬保护（隐藏 webdriver 标记、模拟真实浏览器指纹等），能更好地规避抖音平台的自动化检测。

**建议**：除非有特殊需求，推荐使用默认端口 `40821`，让项目自行管理浏览器实例以获得最佳的反爬效果。

## 技术栈

- **puppeteer-core** + **puppeteer-extra-plugin-stealth**：CDP 连接 + 反检测
- **@modelcontextprotocol/sdk**：MCP 协议实现
- **原生 Node.js HTTP**：Daemon 微服务

本分支基于 [WJZ-P/douyin-upload-mcp-skill](https://github.com/WJZ-P/douyin-upload-mcp-skill)，保留原项目许可证。

## License

[AGPL-3.0](LICENSE)

## LINUX DO

本项目支持 [LINUX DO](https://linux.do) 社区
