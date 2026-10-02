# CP-18 完成报告：性能减重 — 懒加载 Agent / OpenClaw

> 2026-07-30 · **PASSED**（Node）

## 目标

冷启动与 Pop 对话路径不得 eager 加载完整 mobile Agent / OpenClaw 栈；仅在 Local Agent、Explore 任务或 Assist agent 工具首次需要时加载，并缓存 module promise。

## 延迟边界

| 模块 | 策略 | 触发 |
|------|------|------|
| `src/integrations/openclaw-mobile/` | `loadMobileAgentRuntime()` → dynamic `import("./index.js")` | 首次 Agent loop |
| `src/studio-assist/agent/runner.js` 等 | `lazy-agent.js` 缓存 promise | Assist Local Agent 首次任务 |
| `src/task-runtime/worldbook-merge-runner.js` | `lazy-runners.js` | Explore 世界书合并首次运行 |
| `src/studio-assist/agent/byok-stream.js` | 移出 `agent/index.js` 主 barrel；BYOK 脚本直引 | BYOK 验证 / 外部流 |
| `fixtures.js` | 轻量常量（角色 / 情景剧 fixture） | 路由与 UI 默认值 |

## 保持轻量的关键路径

* `src/app.js` → `studio-assist/assist-ui.js` → `chat-store.js` — 仅 `intent-router`、`task-store`、`lazy-agent`、`lazy-runners`
* `src/panels/chat.js` — Pop 对话，无 OpenClaw / `runAgentLoop`
* `src/skill-platform/ui/explore-ui.js` — 对话 Tab 轻量；任务 Tab 首次合并时 `lazy-runners`

## Vite 分包

`vite.config.js` 新增 manual chunks：

* `openclaw-mobile` — mobile slice + vendor bindings
* `agent-runtime` — runner / theme / scenario / worldbook-merge

## 验证

```bash
npm run verify:perf-cp18
npm run verify:explore-cp7   # 回归
```

静态审计：`tests/integration/perf-cp18.mjs` 扫描 critical path 文件，禁止静态 `import` OpenClaw / runner 重模块。

## 刻意不做

* CP-19 及后续
* Pop 每条消息走 OpenClaw
* scenario director LLM 大改（可选后续）
* Android / BYOK 阻塞项

## 数据流（Local Agent 首次触发）

```
用户消息 → routeAssistantIntent → mode=local-agent
  → lazy-agent.loadAgentRunnersModule()
  → dynamic import runner / theme / scenario
  → OpenClawMobileRuntimeAdapter → runAgentLoop
```

Pop / direct-action 路径在 `routeAssistantIntent` 处返回，不进入 lazy 链。
