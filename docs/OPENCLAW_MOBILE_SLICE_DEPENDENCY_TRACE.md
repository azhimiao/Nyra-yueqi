# OPENCLAW_MOBILE_SLICE_DEPENDENCY_TRACE

> CP-5.5 · 2026-07-30 · UTF-8  
> 数据：`.tmp/openclaw-mobile-runtime-trace.json`、`vendor/openclaw-agent-mobile/MANIFEST.json`

## 起点（CP-5 公开 import）

| Specifier | 符号 |
|-----------|------|
| `openclaw/plugin-sdk/agent-core` | `runAgentLoop`, `convertToLlm`, `killProcessTree`（再导出） |
| `openclaw/plugin-sdk/llm` | `createAssistantMessageEventStream` |

## `kill-tree` / `child_process` 结论

| 问题 | 答案 |
|------|------|
| 为何被加载？ | `agent-core.js` **顶层静态 import** `../kill-tree-*.js`（再导出）；`proxy-*.js` **顶层静态 import** 同一模块（供 Shell/子进程 harness） |
| Agent Loop 每次运行是否调用？ | **否** |
| 是否只用于终止 Shell/PTY/子进程？ | **是** — `killProcessTree` / `taskkill` / `process.kill` 仅在子进程超时/abort 路径 |
| 仅月栖受控 Tool 时是否执行？ | **否** — 运行时覆盖率：模块 **被 evaluate**，但 `spawn`/`killProcessTree` **未被调用** |
| Vite 是否无条件解析？ | **是** — 静态 import 导致打包期解析 `node:child_process` |
| 可否注入 `ProcessController`？ | 上游未提供注入点；本阶段用 **Route B alias + Vendored stub** 替换 |
| 移动端 `NoopProcessController`？ | **否（静默成功禁止）** — stub **抛出** `UNSUPPORTED_RUNTIME_CAPABILITY` |
| AbortSignal 是否足够？ | **是** — 纯模型 + 受控 Tool 取消用 AbortSignal |

## 运行时跟踪（Happy Path）

任务：`character.inspect` → `workspace.write_text` → stop  

| 观测 | 值 |
|------|-----|
| 事件 | `agent_start` … `tool_execution_*` ×2 … `agent_end` |
| `kill-tree` 模块 evaluate | **true**（静态 import） |
| `child_process` 函数调用 | **false** |

## 分层表（节选）

| 模块 | 导入符号 | 为何加载 | Spike 实际使用 | 可排除/替换 |
|------|----------|----------|----------------|-------------|
| `plugin-sdk/agent-core.js` | 再导出 | 公开入口 | 间接 | 移动端改用窄 chunk + vendor |
| `proxy-*.js` | `runAgentLoop` | Loop 主体 | **是** | 保留（上游） |
| `validation-*.js` | `createAssistantMessageEventStream` | Fake stream | **是** | 保留 |
| `kill-tree-*.js` | `killProcessTree` | 静态边 | **否** | **stub 替换** |
| `node:child_process` | `spawn` | kill-tree | **否** | shim 抛错 |
| `node:fs*` | 多 | Session/文件 harness | **否**（受控 Tool 用 App WS） | shim 抛错 |
| Shell harness 路径 | `spawn`+kill | proxy 内 | **否** | 不调用 |

## 路线选择

**A** 官方更小公开入口：无 browser-safe agent-core → 不可用  
**B** Vite alias：shim Node builtins + kill-tree → **采用**  
**C** DI ProcessController：上游无钩子 → 部分以 stub 代替  
**D** 最小 Vendoring：复制 proxy/validation BFS 子集并改写 kill-tree import → **采用（与 B 组合）**
