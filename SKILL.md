---
name: douyin-upload-mcp-skill
description: 通过抖音创作者平台（creator.douyin.com）立即或定时发布视频、图文。首选MCP工具，缺少能力时使用Skill脚本。禁止自行启动外部浏览器访问抖音。
---

# 抖音 MCP Skill

## ⚠️ 操作优先级（必须遵守）

1. **🥇 首选：调用 MCP 工具** — 直接调用本 Skill 暴露的 MCP 工具完成操作。绝大多数场景都应该走这条路径。
2. **🥈 兜底：运行 Skill 脚本** — 当 MCP 工具无法满足需求时，运行本 Skill 项目中的脚本（如 `demo.js`、`demo-imagetext.js`）
3. **🥉 最次：连接 Skill 管理的浏览器** — 仅前两种方式都无法解决时，通过 `douyin_browser_info` 获取 CDP 连接信息接管浏览器。**需先征得用户同意**

**绝对禁止**：自行启动新的浏览器实例访问抖音页面。

## 支持范围

| 类型 | 支持 | 说明 |
|------|------|------|
| 发布视频 | ✅ | 上传视频 + 选封面 + 填标题简介 + 发布 |
| 发布图文 | ✅ | 上传图片 + 填标题简介 + 选音乐 + 发布 |
| 发布全景视频 | ❌ | 不支持（场景极少） |
| 发布纯文字 | ❌ | 不支持（场景极少） |

## 可用 MCP 工具

### 核心发布工具

| 工具名 | 说明 | 入参 |
|--------|------|------|
| `douyin_publish_video` | 立即或定时发布视频（自动检查登录） | `filePath`（必填）, `title`, `description`, `timeout`, `scheduleAt` |
| `douyin_publish_imagetext` | 立即或定时发布图文（自动检查登录） | `filePaths`（必填，有序字符串数组）, `title`, `description`, `scheduleAt` |

### 登录与状态

| 工具名 | 说明 | 入参 |
|--------|------|------|
| `douyin_check_login` | 检查登录状态并推进登录流程 | `smsCode`（可选，短信验证码） |
| `douyin_probe` | 探测页面各元素状态 | 无 |
| `douyin_screenshot` | 对当前页面截图保存 | 无 |

### 页面操作

| 工具名 | 说明 | 入参 |
|--------|------|------|
| `douyin_navigate_to` | 打开指定抖音页面 URL（仅 douyin.com 域名） | `url`, `timeout` |
| `douyin_reload_page` | 刷新页面 | `timeout` |
| `douyin_browser_info` | 获取浏览器连接信息（兜底接管用） | 无 |

## 典型使用流程

### 1. 登录（多次调用 `douyin_check_login` 推进）

```
第1次调用 → phase: qrcode      → 用户扫码
第2次调用 → phase: sms_verification → 自动点击接收短信
第3次调用 → phase: sms_code_input   → 用户告知验证码
第4次调用(smsCode="123456") → phase: logged_in → 登录完成
```

### 2. 发布视频

```
调用 douyin_publish_video:
  filePath: "C:/videos/test.mp4"
  title: "我的视频"
  description: "视频简介 #标签"
```

### 3. 发布图文

```
调用 douyin_publish_imagetext:
  filePaths: ["C:/images/1.png", "C:/images/2.png"]
  title: "我的图文"
  description: "图文简介 #标签"
```

### 4. 定时发布视频或图文

仅在用户明确要求定时发布时传入 `scheduleAt`。这是提交到平台的待发布作品，到点会自动公开，不是草稿。用户说“仅上传、不发布”时不能擅自使用定时发布替代。

```text
douyin_publish_video:
  filePath: "C:/videos/test.mp4"
  title: "作品标题"
  description: "作品简介 #标签"
  scheduleAt: "2026-10-30T20:00:00+08:00"
```

- 时间必须包含上海时区 `+08:00`，使用整分钟；页面当前支持2小时后至14天内，执行时同时核对实际页面限制。
- 先选“定时发布”，填写“日期和时间”，失焦后回读并核对定时模式，再点击“发布”。遇到输入失败就停止，不能退回立即发布。
- 提交后在作品管理中核对同一标题、目标时间及“审核中/待发布/定时发布”状态。仅页面跳转或出现成功提示不足以确认时间。审核中可能暂时无法编辑；用户可在平台允许后修改待发布作品。
- 提交结果不明时先核查作品管理，不能直接重复提交。批次逐条确认后再继续。
- 用户同时查看平台时，可设置环境变量 `DOUYIN_WORKSPACE_TAB` 为本任务标识；脚本会在Skill托管浏览器中复用独立标签页，避免人工切换页面中断操作。
- MCP工具未提供新参数时，使用本包 `src/schedule.js` 的 `setSchedule`、`submitScheduled`、`verifyScheduled`；使用现有 `createDouyinSession()` 会话。`src/douyin-ops.js` 的 `publishVideo(filePath,{title,description,scheduleAt})` 也支持完整流程。
- 图文同样使用 `publishImageText(filePaths,{title,description,scheduleAt})`。先按用户指定顺序排列 `filePaths`，等待“已添加N张图片”且上传进度消失后再提交；核对图片数、封面和预览顺序。图文标题当前页面限制20字，视频30字，以页面为准。
- 分步处理图文时可传 `prepareOnly:true`，仅上传和填写，随后调用定时函数；不得将此返回状态当作已提交。正文含多段时逐段输入并用Enter换段，提交前回读正文，避免整段粘贴产生多余星号；话题可逐个输入并选择同名推荐，保留源文案中的所有标签。

### 未发布暂存的边界

本机实测网页“暂存离开”保存到浏览器单份 `publish_form_cache:<账号>`，下一次上传可能覆盖；不能据此声称已在平台草稿箱保存多条作品。本地导出的缓存只能称为恢复备份，不能冒充云端草稿。`draftOnly:true` 仅停在编辑页；已有暂存时阻止覆盖。是否存在独立草稿能力，以用户当前账号页面实际核验为准。

## MCP 客户端配置

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

也可通过 `npm run mcp` 手动启动。

## 架构

```
MCP Client → mcp-server.js → index.js → browser.js → Daemon
                                ↓
                          douyin-ops.js → operator.js → CDP → Chrome → douyin.com
```

- **Daemon**（独立进程）：管理浏览器生命周期，闲置 30 分钟自动销毁
- **browser.js**：Skill 侧连接器，按需自启 Daemon
- **operator.js**：纯 CDP 底层原子操作
- **douyin-ops.js**：抖音业务编排层
- **mcp-server.js**：MCP 工具协议层

### 端口配置（与 gemini-skill 共享同一浏览器实例）

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| CDP 端口 | 40821 | 与 gemini-skill 共享 |
| Daemon 端口 | 40225 | 与 gemini-skill 共享 |

多个 skill 共用同一个浏览器实例 + 同一个 Daemon，各 skill 各用各的 tab。
