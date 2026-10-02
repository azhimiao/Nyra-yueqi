# UPSTREAM_PACKAGE_INSPECTION

> CP-1 产出 · 2026-07-30  
> 检查根目录：`F:\clawtry`  
> 目的：确认 OpenClaw / Hermes **能否作为库被真实导入**，而非仅 CLI 能跑。

---

## 1. OpenClaw 安装布局

| 项 | 值 |
|----|-----|
| 启动器 | `F:\clawtry\openclaw.cmd` |
| 工作目录 | `F:\clawtry\app` |
| 本地依赖声明 | `F:\clawtry\app\package.json` → `"openclaw": "latest"` |
| 包安装路径 | `F:\clawtry\app\node_modules\openclaw\` |
| Node | `F:\clawtry\node-v22.22.3-win-x64\node.exe` |
| 数据目录 | `OPENCLAW_HOME=F:\clawtry\data`（由 launcher 设置） |
| 根目录 `F:\clawtry\package.json` | **不存在**（仅有 app 子项目） |

`openclaw.cmd` 实际调用：

```text
node.exe F:\clawtry\app\node_modules\openclaw\openclaw.mjs %*
```

---

## 2. OpenClaw 包元数据（实测）

来源：`F:\clawtry\app\node_modules\openclaw\package.json`

| 字段 | 值 |
|------|-----|
| **name** | `openclaw` |
| **version** | `2026.7.1-2` |
| **license** | `MIT`（`LICENSE` 文件存在） |
| **type** | `module` |
| **main** | `dist/index.js` |
| **bin** | `openclaw` → `openclaw.mjs` |
| **module** | （未单独字段；ESM via `"type":"module"`） |
| **files** | 含 `dist/`、`docs/`、`skills/`、`openclaw.mjs`；**排除** `dist/**/*.map` |
| **source maps** | package `files` 显式 `!dist/**/*.map` → **发布物不含 map** |
| **源码形态** | **编译后的 `dist/` + `.d.ts`**；`files` 排除 `dist/plugin-sdk/src/**`；仅保留少量 `src/agents/templates/` |
| **第三方依赖** | 大量 Node 生态：`openai`、`express`、`kysely`、`@modelcontextprotocol/sdk`、`@lydell/node-pty` 等（见 package.json dependencies） |

### 公开 exports（节选，与 Agent 相关）

`package.json` → `exports` 数组中可解析的库入口包括（实测 `require.resolve` / ESM import 从 `F:\clawtry\app`）：

| Export 路径 | 解析到的文件 |
|-------------|--------------|
| `openclaw/plugin-sdk/agent-core` | `...\dist\plugin-sdk\agent-core.js` |
| `openclaw/plugin-sdk/agent-runtime` | `...\dist\plugin-sdk\agent-runtime.js` |
| `openclaw/plugin-sdk/skills-runtime` | `...\dist\plugin-sdk\skills-runtime.js` |
| `openclaw/plugin-sdk/tool-plugin` | `...\dist\plugin-sdk\tool-plugin.js` |
| `openclaw/plugin-sdk/agent-harness` | `...\dist\plugin-sdk\agent-harness.js` |
| `openclaw/plugin-sdk/session-store-runtime` | `...\dist\plugin-sdk\session-store-runtime.js` |
| `openclaw/plugin-sdk/simple-completion-runtime` | `...\dist\plugin-sdk\simple-completion-runtime.js` |

另有大量 channel / approval / memory / gateway 相关 `plugin-sdk/*` 导出（完整列表见该 package.json `exports`）。

### CLI vs 库

- **CLI**：`openclaw.mjs` + `bin.openclaw` → onboard / dashboard 走这条。
- **库**：`exports` 暴露 **plugin-sdk** 子路径，**不是**「只有 CLI 私有封装」。
- 结论：**npm 包适合作为 Node 库导入关键 runtime 模块**；但实现主体是 **bundled dist**，不是完整 TypeScript monorepo 源码树。若需对照未打包源码，应另取与 `2026.7.1-2` 对齐的官方源到 `F:\clawtry\openclaw-source\`（当前未获取；Spike 可先用 dist 符号）。

---

## 3. 关键可导入符号（agent-core 实测）

在 `F:\clawtry\app` 下执行：

```js
import {
  Agent,
  AgentHarness,
  Session,
  agentLoop,
  agentLoopContinue,
  runAgentLoop,
  runAgentLoopContinue,
  InMemorySessionStorage,
  JsonlSessionStorage,
  validateToolCall,
  validateToolArguments,
  compact,
  buildSessionContext,
  // ...
} from "openclaw/plugin-sdk/agent-core";
```

实测：`Object.keys(ac).length === 70`，且包含上表符号。

`agent-core.js` 内可见：

- `Agent` 类包装上游 `Agent$1`，注入 `openClawAgentCoreRuntime`（`completeSimple` / `streamSimple`）
- 从 chunk `proxy-BzhBz8iM.js` 再导出 `runAgentLoop`、`agentLoop`、`Session`、compaction 等

文档侧（包内）：`F:\clawtry\app\node_modules\openclaw\docs\concepts\agent-loop.md`、`docs\agent-runtime-architecture.md`。

---

## 4. agent-runtime 导出性质

`openclaw/plugin-sdk/agent-runtime` 导出面极大（工具计划、TTS、鉴权、catalog、sandbox path 等），偏 **宿主集成 API**，不是最小 loop。

**Agent 多步循环的首选导入点：`openclaw/plugin-sdk/agent-core`。**

---

## 5. Hermes 检查

| 项 | 值 |
|----|-----|
| 路径 | `F:\clawtry\hermes\hermes-agent\`（完整源码树，非 npm-only） |
| name | `hermes-agent`（`pyproject.toml`） |
| version | `0.19.0` |
| license | **MIT**（Nous Research，`LICENSE`） |
| 语言 | **Python** |
| 主循环 | `agent/conversation_loop.py` → **`run_conversation(...)`** |
| Agent 入口 | `run_agent.py` → **`class AIAgent`**、`main(...)` |
| Tool Registry | `tools/registry.py` → **`ToolRegistry`**, `ToolEntry`, `discover_builtin_tools` |
| Tool 调度 | `model_tools.py` → **`get_tool_definitions`**, **`handle_function_call`** |
| Session/State | `hermes_state.py` 等 SQLite 状态 |
| Checkpoint | `tools/checkpoint_manager.py`（文件系统检查点） |

嵌入方式：无原生 JS 导出 → 月栖侧只能 **SIDECAR_PROTOCOL**（子进程 / HTTP / JSON-RPC）或参考概念；**不能** `import` 进 Capacitor WebView。

---

## 6. Capacitor / 浏览器可行性（包级结论）

| Runtime | 浏览器 / Capacitor JS | Node（Electron / 桌面 / Android sidecar） |
|---------|----------------------|-------------------------------------------|
| OpenClaw `agent-core` | **不可直接**：依赖 Node ESM、进程树、文件系统、LLM stream helpers | **可 DIRECT_IMPORT**（已在 Node 22 验证 import） |
| Hermes | 不可 | 需 Python 环境 → Sidecar |

因此手机端策略不能是「把整包塞进 APK WebView」，而应是：

- **桌面 / 本地 Node**：直接 import OpenClaw agent-core + 月栖 Adapter  
- **Android**：评估 Node sidecar / 独立 Service（CP-3/CP-4 再证）  
- **Web 预览**：Sidecar 或降级为「仅 Direct Action」直到 sidecar 可用  

---

## 7. 是否需要另拉 openclaw-source

| 问题 | 结论 |
|------|------|
| npm 是否含足够 **可运行** loop？ | **是**（dist + 公开 exports） |
| 是否含完整 TS 源便于改内核？ | **否**（map 剥离、plugin-sdk/src 排除） |
| Spike 是否必须先 clone 源码？ | **否**；先用 `2026.7.1-2` dist 做真实 import Spike |
| 若 Adapter 需改上游内部 | 再获取 **同版本** 源到 `F:\clawtry\openclaw-source\`，禁止整仓拷进月栖 |

---

## 8. CP-1 结论（门禁问答）

| 问题 | 答案 |
|------|------|
| 本阶段实际检查了哪个上游文件？ | `F:\clawtry\app\node_modules\openclaw\package.json`、`dist\plugin-sdk\agent-core.js`、Hermes `pyproject.toml` / `conversation_loop.py` / `tools\registry.py` |
| 实际可导入哪个符号？ | `runAgentLoop`, `agentLoop`, `Agent`, `Session` from `openclaw/plugin-sdk/agent-core` |
| 是否真的执行了上游代码？ | **Import 实测通过**（Node, cwd=`F:\clawtry\app`）。完整 Agent 任务 Spike → CP-4 |
| 新增代码为何不是重复实现？ | 本阶段仅文档检查，无自研 Kernel |

**状态：CP-1 PASSED（检查完成；Spike 未做）**
