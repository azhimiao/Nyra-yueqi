# 栖机助手 CP-6 审计

> CP-6 · 2026-07-30 · UTF-8  
> 改代码前定位；优先复用现有 `studio-assist`，不建第二套助手页/业务 Service。

## 结论摘要

| # | 项 | 现状 |
|---|----|------|
| 1 | UI 入口 | 桌面：设置 `assist` + `mountStudioAssist`；小手机：`phone-assist` / `openApp("assist")` |
| 2 | 消息发送 | `assist-ui.submit` → `chat-store.send` → `tryAssistRoute` 或 `runAssistTurn` |
| 3 | 模型调用 | `engine.js` → `callModel`（**非流式**） |
| 4 | Tool | `studio-assist/tools.js` + `registry.js`（`<yq-tool>`）；另有 PAIOS `agent/` 未接入助手 Loop |
| 5 | 设置修改 | `executeAssistTool` → `appearance.*` / `voice.*` / `proactive.*` 等 |
| 6 | 业务 Service | `characters/store`、`worldbook/store`、`ui/theme`、`scenario/store` |
| 7 | 对话持久化 | **仅内存**；审计在 `audit-store`（localStorage） |
| 8 | 流式 | 助手路径 **不流式** |
| 9 | 错误展示 | 气泡文案 + 卡片 `is-failed` + toast |
| 10 | 平台分支 | 助手本身无 Android 专用码；`appMode` phone/app；OpenClaw Mobile Slice 未接线 |
| 11 | 任务/审批 UI | 助手已有 `assist-card` 确认；Task Center 独立 |
| 12 | CP-5.5 入口 | `src/integrations/openclaw-mobile` → `OpenClawMobileRuntimeAdapter` + `runAgentLoop` |

---

## 1. UI 入口

| 路径 | 作用 |
|------|------|
| `src/studio-assist/assist-ui.js` | `mountStudioAssist` |
| `src/studio-assist/index.js` | `registerStudioAssist` / `openStudioAssist` |
| `src/app.js` | 事件 `yueqi.assist.open` / `open-app` |
| `src/phone-shell/phone-assist.js` | 小手机助手屏 |
| `src/ui/settings-router.js` | 路由 `"assist"` |
| `src/agents/profile-schema.js` | 内置 profile `qiji-assistant` |

---

## 2. 消息发送流程

```text
用户输入
→ createAssistChatStore.send()
  → tryAssistRoute()（P6 技能/Agent 路由，无模型）
  → 否则 runAssistTurn()
    → callModel
    → parseAssistActions
    → executeAssistTool（读立即；写需确认卡）
→ renderLog()
```

关键文件：`chat-store.js`、`assist-routes.js`（`src/agents/`）、`engine.js`。

---

## 3. 模型调用

- `src/model/client.js`：`callModel` / `callModelStream` / `collectProviderConfig`
- 助手：`engine.js` 固定 `stream: false`
- BYOK：现有 Provider 表单 / 小手机 `readProviderConfig`

---

## 4. Function Calling / Tool

| 体系 | 位置 | 与 CP-6 关系 |
|------|------|--------------|
| 助手 Tool Gateway | `studio-assist/tools.js` + `registry.js` | Direct Action / 既有确认写入 |
| P6 Assist Routes | `agents/assist-routes.js` | 技能推荐等，非 OpenClaw |
| PAIOS Task Agent | `src/agent/*` | **不**作为 CP-6 Loop |
| OpenClaw Mobile | `integrations/openclaw-mobile` | **本阶段接入** Local Agent |

助手工具名是 `character.read`；OpenClaw Spike 是 `character.inspect`。CP-6 产品工具用 `nyra.character.*` + workspace，审批后调现有 `createCharacter`/`upsertCharacter`。

---

## 5. 设置修改接口

经 `executeAssistTool`：`appearance.apply_theme`、`appearance.switch_mode`、`voice.update`、`proactive.update` 等。  
CP-6：**Direct Action** 优先写设置；Agent 仅 `nyra.settings.read` / `describe`。

---

## 6. 业务 Service

| 域 | 模块 |
|----|------|
| 角色 | `src/characters/store.js` |
| 世界书 | `src/worldbook/store.js` |
| 主题 | `src/ui/theme.js` |
| 情景剧 | `src/scenario/store.js`（本阶段可选；数据若不稳定则不接） |

---

## 7–9. 持久化 / 流式 / 错误

- 聊天消息：内存；CP-6 **AssistantTask** 另持久化（localStorage）。
- 流式：不改助手普通对话为流式；Agent 进度用任务卡步骤摘要。
- 错误：沿用气泡 + 卡片；Agent 失败映射为 `task_failed` 用户文案（不泄 OpenClaw 内部对象）。

---

## 10. 平台

- Web / Capacitor WebView 共用 JS。
- Android：CP-5.5 `assembleDebug` 通过；**App 内 Runtime 未跑** → CP-6 允许 `IMPLEMENTED_PENDING_ANDROID_RUNTIME`。

---

## 11. 已有审批 / 进度 UI

- `assist-ui.js` `renderCard`：`needConfirm` / confirm / cancel。
- `agent/ui/task-center-ui.js`：独立任务中心 — **不**替换助手页；CP-6 在助手气泡内扩展 **任务卡**（状态、Diff、批准）。

---

## 12. CP-5.5 Adapter 调用入口

```text
import {
  OpenClawMobileRuntimeAdapter,
  runAgentLoop,
  convertToLlm,
  createAssistantMessageEventStream,
} from "../integrations/openclaw-mobile/index.js";
```

- Adapter：`OpenClawMobileRuntimeAdapter.js` → 内部 `runAgentLoop`
- 符号复用，**禁止**自研 Agent Loop / 恢复 rescue NAR

---

## 复用决策（CP-6）

| 复用 | 新建 |
|------|------|
| `studio-assist` UI + chat-store | Intent Router + AssistantTask 持久化 |
| `executeAssistTool` Direct Action | Local Agent 编排（调 Mobile Adapter） |
| `characters/store` 审批后导入 | 受控 Tool + Workspace 副本 |
| OpenClaw Mobile Adapter | 事件 → 助手任务卡映射 |
| 现有确认卡模式 | Diff / 任务状态扩展渲染 |

**禁止：** 第二套助手页面、接探索/Pop/Companion、Shell、完整 OpenClaw 包、直接写生产库。
