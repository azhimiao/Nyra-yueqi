# 栖机助手 Agent 架构（CP-6）

> 复用 CP-5.5 Mobile-safe OpenClaw Runtime；不自研 Agent Loop。

## 执行路径

```text
用户消息
→ routeAssistantIntent()
  → conversation          → 既有 tryAssistRoute / runAssistTurn
  → direct-action         → executeAssistTool（确定性业务 Service）
  → local-agent           → AssistantTask + OpenClawMobileRuntimeAdapter
  → external-required     → EXTERNAL_BACKEND_REQUIRED（不假装执行）
```

低置信度默认 **conversation**，不自动升级为 Agent。

## 复用符号

| 符号 | 来源 |
|------|------|
| `runAgentLoop` | `integrations/openclaw-mobile` → vendor slice |
| `convertToLlm` | 同上 |
| `createAssistantMessageEventStream` | 同上 |
| `OpenClawMobileRuntimeAdapter` | 同上（CP-6 扩展 `characterPayload` / `toolsFactory` / `productMode`） |

## 新增月栖模块

```text
src/studio-assist/agent/
  intent-router.js      # 意图路由
  task-store.js         # AssistantTask 持久化
  events.js             # Nyra → AssistantTaskEvent
  controlled-tools.js   # workspace.* / nyra.character.* / settings read
  character-commit.js   # 审批后调用 characters/store
  runner.js             # 任务编排（调 Mobile Adapter）
```

## Local Agent 闭环（角色卡）

```text
授权资源副本 → Workspace
→ character.inspect / nyra.character.inspect
→ workspace.write_text → output/character.fixed.json
→ Diff + WAITING_FOR_APPROVAL
→ 用户批准 → createCharacter / upsertCharacter（新建，不覆盖）
→ 重新读取验证
```

生产写入 **永不** 由 Tool 直接执行。

## 事件边界

OpenClaw 原始事件止于 Adapter；助手层只消费 `AssistantTaskEvent` / 任务卡文案。

## UI

沿用 `assist-ui` 气泡 + 扩展 `assist-card--agent`（状态、授权资源、Diff、批准/拒绝）。  
不新建第二套助手页。
