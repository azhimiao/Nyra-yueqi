# UPSTREAM_RUNTIME_DECISION

> CP-3 产出 · 2026-07-30  
> **状态：`PASSED_FOR_NODE_ADAPTER`**  
> （CP-4 Node + Fake Model 闭环已通过；**不是**无条件的 `PASSED_FOR_PRODUCT_INTEGRATION`）

## 平台门禁

| 项 | 状态 |
|----|------|
| Node Runtime | **PASSED** |
| Fake Model | **PASSED** |
| 真实 BYOK | **IMPLEMENTED_PENDING_EXTERNAL** |
| Capacitor Web | **NOT_VERIFIED**（见 CP-5 兼容性报告） |
| Android | **NOT_VERIFIED** |
| iOS | **NOT_VERIFIED** |

## 首选 Runtime

**OpenClaw `plugin-sdk/agent-core`（npm `openclaw@2026.7.1-2`）**

理由（代码证据，非知名度）：

1. **公开库导出**含 `runAgentLoop` / `agentLoop` / `Agent` / `Session` / compaction / tool validation。  
2. 在 `F:\clawtry\app` 下 Node 22 **真实 import 成功**（70 个 export）。  
3. MIT 许可。  
4. 与月栖同为 **JS/TS 生态**，Adapter 成本低于 Python Hermes。  
5. 可用 `Agent` 构造时注入 runtime deps → **月栖 BYOK Model Adapter** 可行。

安装位置（不拷进月栖仓）：

```text
F:\clawtry\app\node_modules\openclaw
```

月栖工程通过 **依赖声明 / 工作区外路径 / 或 sidecar 服务** 引用，禁止把整个 openclaw 仓库复制进 `F:\beautiful`。

## 备用 Runtime

**Hermes Agent `0.19.0`（`F:\clawtry\hermes\hermes-agent`）**

- 完整源码、清晰 `run_conversation` + `ToolRegistry`。  
- 语言为 Python → 仅作 **SIDECAR_PROTOCOL** 候选。  
- 当 OpenClaw agent-core 在目标平台无法落地时启用。

## 明确不使用 / 延后

| 部分 | 原因 |
|------|------|
| OpenClaw 完整 Gateway 常驻 | 产品禁止每用户常驻服务器；首版不需要 |
| OpenClaw memory-core 全量 | Companion 记忆已有月栖实现；避免双记忆脑 |
| OpenClaw pty/browser/shell 默认开启 | 产品禁止任意代码；External only |
| Hermes 作为手机进程内 Runtime | 无 JS 嵌入；除非 Sidecar |
| rescue 自研 Kernel/loop | 与本决策冲突；留在 `rescue/nar-from-scratch-current` |

## 手机端策略

| 端 | 策略 |
|----|------|
| **Electron / 桌面 Node** | **方案 A**：进程内 `DIRECT_IMPORT` agent-core + Adapters（正式支持） |
| **Android** | **方案 B**：本地 Node sidecar / 独立 Service；WebView 不进程内跑 OpenClaw |
| **iOS** | 倾向 **方案 C**（桌面/自托管 Sidecar）；`IMPLEMENTED_PENDING_EXTERNAL` |
| **Web 预览** | 无 sidecar 时仅 Direct Action；禁止把 ~300MB 安装树打进 Vite bundle |

共享：**月栖 Task / Tool 协议**跨端一致；执行后端可不同。

## 目标架构（纠偏后）

```text
Nyra UI
  → NyraTaskController
  → OpenClawRuntimeAdapter  (NyraAgentRuntime)
  → openclaw/plugin-sdk/agent-core  (runAgentLoop)
  → NyraModelAdapter
  → NyraToolAdapter
  → NyraWorkspaceAdapter
  → NyraRuntimeEventAdapter / NyraCancellationAdapter
```

## 下一步

**CP-4：`PASSED`（Node Fake Model）** — `docs/UPSTREAM_RUNTIME_SPIKE_REPORT.md`  
**CP-5：`PASSED_NODE_ONLY`** — `docs/OPENCLAW_ADAPTER_COMPLETION_REPORT.md`  
**CP-5.5：`PASSED_BROWSER_ANDROID_PENDING`** — `docs/OPENCLAW_MOBILE_SLICE_REPORT.md`（Loop 不依赖 child_process；Browser Bundle 已通）  
**CP-6（助手接入）**：可规划；**不自动启动**。手机真机 Agent 跑通仍 pending。

## 门禁

| 问题 | 答案 |
|------|------|
| 复用哪个上游文件？ | `...\openclaw\dist\plugin-sdk\agent-core.js` |
| 导入哪个符号？ | `runAgentLoop` / `convertToLlm`（同包另有 `Agent` / `Session`） |
| 是否执行上游代码？ | **是** — CP-4 真实跑通 inspect → write_text |
| 为何不是重复实现？ | 决策明确禁止自研 GenericAgentLoop；月栖仅 Adapter |
| 产品全端是否通过？ | **否** — 仅 `PASSED_FOR_NODE_ADAPTER` |