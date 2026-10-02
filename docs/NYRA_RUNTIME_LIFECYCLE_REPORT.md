# 月栖 Runtime 生命周期报告

**日期：** 2026-07-31  
**范围：** OpenClaw Mobile / Local Agent / Companion 主动调度 / 桌宠

## 结论

| 检查项 | 结果 | 说明 |
|---|---|---|
| OpenClaw 仅任务时懒加载 | **通过（产品路径）** | `lazy-agent.js` / `lazy-runners.js` 动态 import runners；Pop 冷启动不加载 |
| 任务结束后释放资源 | **部分 → 已加固** | AbortController 在 `finally` 删除；本轮补 `workspaces.delete(runId)` |
| Pop 普通聊天不加载 OpenClaw | **通过** | `panels/chat.js` → `callModel`；CP-18 校验 |
| 离散主动事件按事件唤醒 | **通过** | `life-wake` + 日历/纪念日 `setTimeout`；心跳仅资格检查，无 LLM |
| 无意义轮询 | **部分 → 已改** | 动态原 60s `setInterval` → 按 `nextPostAfter` 的 `setTimeout`；受自主生活开关门控 |
| 持续模型调用 | **默认无** | 可选桌宠「屏幕注视」会周期性 `callModel`（用户开启） |
| 意外常驻前台服务 | **无 Agent FGS** | Android OverlayService 为用户开启的桌宠显示，非模型执行 |
| 桌宠与模型解耦 | **通过** | `pet-presence-bridge` ← life-state；短聊走 Pop |

## 加载链

```text
助手 Local Agent
  chat-store (mode=local-agent)
    → studio-assist/agent/lazy-agent.js
      → dynamic import runner / theme / scenario
        → OpenClawMobileRuntimeAdapter（静态 import openclaw-mobile）

探索世界书合并
  → task-runtime/lazy-runners.js
    → worldbook-merge-runner.js
      → OpenClawMobileRuntimeAdapter

文档辅助 API loadMobileAgentRuntime()
  → integrations/openclaw-mobile/lazy-load.js
  → 产品路径未调用（runners 直接 import）；模块缓存后直至刷新仍驻留 JS heap（预期，非常驻服务）
```

## 主动调度（非 OpenClaw）

| 源 | 机制 | 模型？ |
|---|---|---|
| 日历/纪念日 | `setTimeout` | 动作触发时可选 `callModel` |
| 心跳 | ≤5min 资格检查 | **否** |
| 用户消息 / 开 App | `wakeCompanionLife` | 默认确定性 tick |
| 日记定时 | 一次 `setTimeout` | 到期时生成 |
| 自动动态 | 到期唤醒（本轮改） | 发帖时可选 |

## 活动落盘（现有）

| 存储 | 键 |
|---|---|
| 共居时间线 | `yueqi.cohabit.timeline.v1` |
| App 事件环 | `yueqi.world.app-events.v1` |
| 生活态 | `yueqi.companion.life.v1` |
| 助手任务 | `yueqi.assist.agent.tasks.v1` |
| 助手审计 | `yueqi.assist.audit.v1` |

本轮新增用户可读活动日志：`yueqi.activity.center.v1`（见活动中心）。

## 本轮生命周期改动

1. `OpenClawMobileRuntimeAdapter.#run` `finally`：`workspaces.delete(runId)` + `controllers.delete`。
2. `moments/auto-post.js`：禁用时 `stopMomentsAutoPost`；启用时按下次到期调度，去掉无意义 60s 轮询。
3. 自主生活关闭时：调度器 / life-tick / 动态 / 日记主动路径不发模型。
4. Local Agent：权限关闭时 `lazy-agent` 入口拒绝启动。
