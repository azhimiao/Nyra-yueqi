# UPSTREAM_AGENT_REUSE_MATRIX

> CP-2 产出 · 2026-07-30  
> 依据：`docs/UPSTREAM_PACKAGE_INSPECTION.md`  
> OpenClaw：`2026.7.1-2` @ `F:\clawtry\app\node_modules\openclaw`  
> Hermes：`0.19.0` @ `F:\clawtry\hermes\hermes-agent`

复用方式枚举：`DIRECT_IMPORT` | `VENDORED_SUBSET` | `SIDECAR_PROTOCOL` | `ADAPTER_AROUND_UPSTREAM` | `NOT_REUSABLE` | `NYRA_SPECIFIC_IMPLEMENTATION`

---

## Agent Loop

| 字段 | 内容 |
|------|------|
| OpenClaw 路径 | `dist/plugin-sdk/agent-core.js`（实现 chunk `dist/proxy-BzhBz8iM.js`） |
| OpenClaw 符号 | `runAgentLoop`, `runAgentLoopContinue`, `agentLoop`, `agentLoopContinue`, `Agent` |
| Hermes 路径 | `agent/conversation_loop.py` |
| Hermes 符号 | `run_conversation` |
| 可直接导入 | OpenClaw：**是**（Node）；Hermes：否（Python） |
| 依赖 Node/Python/OS | OpenClaw：Node ESM；Hermes：Python 3 |
| 浏览器/Capacitor | 不可直接 |
| 复用方式 | **ADAPTER_AROUND_UPSTREAM**（Node/桌面/Sidecar 内 `DIRECT_IMPORT` agent-core） |
| 月栖适配器 | `UpstreamRuntimeAdapter` 调用 `runAgentLoop` / `Agent`；注入月栖 Model/Tool |
| 决定 | **首选 OpenClaw agent-core**；Hermes 作备用 Sidecar |
| 证据 | Node import 实测 70 exports；见 CP-1 |

---

## Structured Tool Calling

| 字段 | 内容 |
|------|------|
| OpenClaw | `validateToolCall`, `validateToolArguments`（agent-core）；工具执行经 Agent/harness |
| Hermes | `model_tools.handle_function_call`, `coerce_tool_args` |
| 复用方式 | **ADAPTER_AROUND_UPSTREAM** |
| 月栖适配器 | `NyraToolAdapter`：把上游 tool_call 转到月栖 `character.inspect` / `workspace.*` |
| 决定 | 复用上游发起与校验；工具实现月栖提供 |
| 证据 | agent-core 导出列表；Hermes `model_tools.py:1084` |

---

## Tool Registry

| 字段 | 内容 |
|------|------|
| OpenClaw | `plugin-sdk/tool-plugin`；`defineToolDescriptor(s)`（agent-runtime）；插件 `registerTool` |
| Hermes | `tools/registry.py` → `ToolRegistry`, `ToolEntry`, `discover_builtin_tools` |
| 复用方式 | OpenClaw：**ADAPTER_AROUND_UPSTREAM**（向 Agent 注册月栖工具描述）；Hermes：SIDECAR 若选用 |
| 决定 | 不自研第二套 registry 循环；月栖维护**业务工具实现表**，描述交给上游 |
| 证据 | CP-1 exports；Hermes registry 类定义 |

---

## Skill Loader

| 字段 | 内容 |
|------|------|
| OpenClaw | `openclaw/plugin-sdk/skills-runtime`；包内 `skills/` |
| Hermes | `skills/`、`optional-skills/` |
| 复用方式 | **ADAPTER_AROUND_UPSTREAM** / 远期 DIRECT_IMPORT skills-runtime |
| 决定 | Spike 后接线；禁止自研 GenericSkillEngine |
| 证据 | package exports 含 `skills-runtime` |

---

## Context Builder / Compaction

| 字段 | 内容 |
|------|------|
| OpenClaw | `buildSessionContext`, `compact`, `prepareCompaction`, `shouldCompact`, `generateSummary`（agent-core） |
| Hermes | `conversation_loop` 内 `_apply_context_engine_selection`, `_notify_context_engine_turn_complete` |
| 复用方式 | **DIRECT_IMPORT**（Node）+ 月栖只注入「授权资源摘要」钩子 |
| 决定 | 使用上游 compaction；月栖不写 GenericContextCompactor |
| 证据 | agent-core 导出 |

---

## Session

| 字段 | 内容 |
|------|------|
| OpenClaw | `Session`, `InMemorySessionStorage`, `JsonlSessionStorage`, `session-store-runtime` |
| Hermes | `hermes_state.py` SQLite |
| 复用方式 | **ADAPTER_AROUND_UPSTREAM**：默认 InMemory/Jsonl 于任务 Workspace；持久化桥到月栖 store |
| Capacitor | Jsonl/Node FS → Sidecar；Web 用 Adapter 映射 IndexedDB **仅作存储后端**，loop 仍在 Node |
| 决定 | 复用 Session 类型与存储接口；产品任务态见下 |

---

## Checkpoint / Resume

| 字段 | 内容 |
|------|------|
| OpenClaw | `agentLoopContinue`, `runAgentLoopContinue`；transcript SessionManager（docs） |
| Hermes | `tools/checkpoint_manager.py` |
| 复用方式 | **DIRECT_IMPORT** continue API + **NYRA_SPECIFIC** 任务级 `WAITING_*` 状态机 |
| 决定 | 循环续跑用上游；产品审批暂停用月栖 Task Controller |
| 证据 | agent-core 导出 continue 符号 |

---

## Cancellation / Retry

| 字段 | 内容 |
|------|------|
| OpenClaw | `AbortEvent`, `AbortResult`；`plugin-sdk/retry-runtime` |
| Hermes | conversation_loop 中断 / failover |
| 复用方式 | **ADAPTER_AROUND_UPSTREAM** |
| 决定 | 取消信号接入上游 Abort；不自研 GenericRetryRuntime |

---

## Event Streaming

| 字段 | 内容 |
|------|------|
| OpenClaw | Agent event sink / stream helpers（agent-core + agent-runtime） |
| Hermes | 流式与 hook（`_emit_post_tool_call_hook` 等） |
| 复用方式 | **ADAPTER_AROUND_UPSTREAM** → 映射为月栖 TaskEvent |
| 决定 | 订阅上游事件，UI 任务卡片消费 |

---

## Task State（产品域）

| 字段 | 内容 |
|------|------|
| OpenClaw / Hermes | 无「月栖助手/探索/栖市」任务状态机 |
| 复用方式 | **NYRA_SPECIFIC_IMPLEMENTATION** |
| 为什么上游不能用 | 产品状态（审批、委派源、栖币无关）属月栖领域；上游是 session/turn |
| 检查过 | agent-core Session；Hermes hermes_state |
| 为何非 Adapter-only | 需与 UI / 审批 / Companion 委派契约绑定 |
| 最小范围 | `NyraTaskController` 状态枚举与持久化，**不包含** Agent Loop |

---

## Model Provider

| 字段 | 内容 |
|------|------|
| OpenClaw | `openClawAgentCoreRuntime` 默认 `completeSimple`/`streamSimple`；可换 runtime deps |
| Hermes | 自有 providers/ |
| 复用方式 | **ADAPTER_AROUND_UPSTREAM**：`NyraModelProviderAdapter` 实现上游所需 complete/stream，内部调 `src/model/client.js` BYOK |
| 决定 | 不替换月栖 BYOK；适配进 OpenClaw Agent runtime 选项 |

---

## Memory（Companion vs Operational）

| 字段 | 内容 |
|------|------|
| OpenClaw | `memory-core*` 大量 exports（偏宿主记忆引擎） |
| Hermes | 会话 SQLite |
| 复用方式 | Companion 记忆：**NYRA_SPECIFIC**（已有宫殿/记忆）；工作记忆：上游 session 即可 |
| 决定 | **禁止**把恋爱 Companion 全量记忆灌进工作 Agent；不强制接入 memory-core 首版 |

---

## Workspace / Path Guard

| 字段 | 内容 |
|------|------|
| OpenClaw | `assertSandboxPath`, `resolveSandboxPath`, `resolveSandboxInputPath`（agent-runtime） |
| Hermes | checkpoint / cwd 工具 |
| 复用方式 | **ADAPTER_AROUND_UPSTREAM** + **NYRA_SPECIFIC** 月栖任务目录布局 |
| 决定 | 路径策略可借用 sandbox helpers；业务根目录与 Capacitor FS 由 `NyraWorkspaceAdapter` 实现 |

---

## Capability Policy / Approval

| 字段 | 内容 |
|------|------|
| OpenClaw | `approval-*-runtime`, `exec-approvals-runtime`, `ActionGate` |
| Hermes | 工具权限 / 确认流（若有） |
| 复用方式 | OpenClaw approval：**ADAPTER**（桌面）；月栖产品审批 UI：**NYRA_SPECIFIC**（对齐栖机助手合同） |
| 决定 | 危险写必须本地 UI 确认；可桥接 OpenClaw approval 事件 |

---

## Artifact Handling

| 字段 | 内容 |
|------|------|
| 上游 | 无月栖「产物卡片」产品模型 |
| 复用方式 | **NYRA_SPECIFIC_IMPLEMENTATION**（`NyraArtifactService`） |
| 决定 | 工具把文件写到 workspace/output；产品层登记 artifact |

---

## External Execution（Shell/浏览器）

| 字段 | 内容 |
|------|------|
| OpenClaw | process-runtime、browser、pty 等 Node 能力 |
| Hermes | shell 类工具、Docker 相关文件存在 |
| 复用方式 | 首版 **NOT_REUSABLE 于手机默认**；桌面可选 SIDECAR 暴露受限子集 |
| 为何 | Capacitor 不能放行任意 shell；产品明确禁止本地任意代码 |
| 证据 | 依赖 `@lydell/node-pty`；产品边界文档 |
| 最小自研 | 仅 `WAITING_FOR_BACKEND` 状态与提示，不伪造执行 |

---

## 汇总决策表

| 能力 | 决定 |
|------|------|
| Agent Loop | OpenClaw `agent-core` DIRECT_IMPORT（Node）+ Adapter |
| Tool Calling | 上游发起 + NyraToolAdapter |
| Tool Registry | 上游描述协议 + 月栖实现表 |
| Skill Loader | OpenClaw skills-runtime（后续） |
| Context/Compact | OpenClaw compact/* |
| Session | OpenClaw Session + Adapter 持久化 |
| Checkpoint | continue API + 月栖任务态 |
| Task State UI | 月栖 Task Controller |
| Model | 月栖 BYOK Adapter |
| Companion Memory | 月栖自有，隔离 |
| Shell | 不做进默认本地 Agent |

**禁止项确认：** 不得恢复 rescue 分支中的自研 `src/agent/kernel/loop.js` 作为主路径。
