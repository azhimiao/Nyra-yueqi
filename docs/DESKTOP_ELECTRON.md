# 月栖 Windows 桌面宿主（Phase 2）

Electron（MIT）透明置顶桌宠，复用 Phase 0 的 `overlay.html`、Runtime 与角色外表。

## 运行

```bash
# 先构建前端资源
npm run build

# 启动桌面宿主（托盘 + 置顶桌宠）
npm run desktop

# 开发：先开 Vite，再：
npm run desktop:dev
```

## 能力

| 能力 | 说明 |
|------|------|
| 透明无边框置顶 | `BrowserWindow` transparent + alwaysOnTop |
| 三态 | 收起 / 气泡 / 聊天（`overlay.html`） |
| 拖动吸边 | 松手吸附最近屏幕边 |
| 多显示器 / DPI | `screen.getDisplayMatching` + 工作区夹紧 |
| 点击穿透 | 非交互区域 `setIgnoreMouseEvents(true, { forward: true })` |
| 托盘 | 显示/隐藏桌宠、打开月栖、开机启动、退出 |
| 单实例 | `requestSingleInstanceLock` |
| 状态持久化 | `%APPDATA%/…/desktop-host.json` |
| 与主界面同步 | 角色页改外表 / 主动消息 → IPC 更新桌宠 |

## 入口

角色页 →「桌面置顶陪伴」。仅在 Electron 内可操作；浏览器只显示启动说明。

## 不做（Phase 2）

桌面行走、窗口攀爬、复杂物理、Live2D/Spine。

## PAIOS P3 · 进程隔离与 Core 桥

桌宠渲染与 Agent 执行隔离（计划 §7.4 / §P3）：

| 进程 / 角色 | 职责 | 禁止 |
|-------------|------|------|
| `pet` renderer（`overlay.html` + `preload-pet.cjs`） | 角色、气泡、轻交互 | 不得 import `src/agent/executor` |
| `app` renderer（`index.html`） | Core UI、Agent Runtime | 不得直接 `desktopCapturer` |
| Electron `main`（`electron/main.mjs`） | 窗口、托盘、截屏会话、IPC | 不得跑任务执行器 |
| Shared Core（`src/host/`） | `DeskPetHostAdapter`、`ScreenCaptureGate`、`TaskStateProjection` | 适配器 `mayExecuteAgent === false` |

桥接入口：`electron/host-core.mjs` → `src/host/index.js`。

- **open phone**：`desktop:open-phone` / pet `openApp`
- **task bubble**：`desktop:project-task`（仅投影，不执行）
- **截屏**：必须先有 `ScreenCaptureGate` 存储授权；启用「截帧读屏」或用户点看屏才会写入 grant；启动不自动授权

合同测试：`npm run verify:core-p3`。真机连续验收见 `docs/qa/paios/P3/DEVICE_PENDING.md`。
