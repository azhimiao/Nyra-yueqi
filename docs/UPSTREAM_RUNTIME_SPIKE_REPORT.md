# UPSTREAM_RUNTIME_SPIKE_REPORT

> CP-4 · 执行日期 **2026-07-30**  
> **最终判定：`PASSED`（Node + Fake Model 自动集成）**  
> 路径 B BYOK：`IMPLEMENTED_PENDING_EXTERNAL`（脚手架存在，未作为门禁）

## 平台门禁快照（CP-4 结束时）

| 项 | 状态 |
|----|------|
| Node Runtime | **PASSED** |
| Fake Model | **PASSED** |
| 真实 BYOK | **IMPLEMENTED_PENDING_EXTERNAL** |
| Capacitor Web | **NOT_VERIFIED** |
| Android | **NOT_VERIFIED** |
| iOS | **NOT_VERIFIED** |

## 编码说明

集成测试控制台偶发中文乱码，根因是 **Windows 终端代码页（如 GBK）与 Node stdout 默认编码不一致**，不是测试夹具 JSON 损坏。  
报告与 `.tmp` / `artifacts` 持久化文件均以 **UTF-8** 写入；门禁以文件内容与断言为准，不以控制台字形为准。

## 1. OpenClaw 精确版本

| 项 | 值 |
|----|-----|
| npm 包名 | `openclaw` |
| 版本 | **`2026.7.1-2`** |
| 安装位置 | `F:\clawtry\app\node_modules\openclaw`（**未**复制进 `F:\beautiful`） |
| `package.json` | `F:\clawtry\app\node_modules\openclaw\package.json` |

## 2. 包名与 import specifier

| Specifier | 用途 |
|-----------|------|
| `openclaw/plugin-sdk/agent-core` | Agent Loop：`runAgentLoop`、`convertToLlm` |
| `openclaw/plugin-sdk/llm` | Fake Model 流：`createAssistantMessageEventStream` |

解析方式：Spike 通过 `OPENCLAW_APP_ROOT`（默认 `F:\clawtry\app`）上的 `createRequire` 解析公开 exports，再 `import(pathToFileURL(...))`。

## 3. 导入的公开符号

| 符号 | 来自 |
|------|------|
| `runAgentLoop` | `openclaw/plugin-sdk/agent-core` |
| `convertToLlm` | `openclaw/plugin-sdk/agent-core` |
| `createAssistantMessageEventStream` | `openclaw/plugin-sdk/llm` |

（`Agent` / `Session` 同包公开导出，本 Spike 闭环使用 `runAgentLoop`。）

## 4. 对应上游文件

| Specifier | 解析路径 |
|-----------|----------|
| agent-core | `...\openclaw\dist\plugin-sdk\agent-core.js` |
| llm | `...\openclaw\dist\plugin-sdk\llm.js` |

实现主体为 bundled `dist/`（无完整 TS 源码树在包内）。

## 5. 公开 exports 证据

`openclaw/package.json` → `exports`：

```json
"./plugin-sdk/agent-core": {
  "types": "./dist/plugin-sdk/agent-core.d.ts",
  "default": "./dist/plugin-sdk/agent-core.js"
},
"./plugin-sdk/llm": {
  "types": "./dist/plugin-sdk/llm.d.ts",
  "default": "./dist/plugin-sdk/llm.js"
}
```

**未**使用深层内部路径偷导入。`typebox` 为 openclaw 嵌套依赖，仅用于 Tool `parameters` Schema（与上游 `AgentTool` 合约一致）。

## 6. Spike 架构

```text
tests/integration/openclaw-agent-core-spike.mjs
  → runCharacterFixSpike()
       → OpenClaw runAgentLoop (上游主循环)
       → SpikeModelAdapter.streamFn   (仅伪造模型流)
       → SpikeToolAdapter tools       (character.inspect / workspace.write_text)
       → SpikeWorkspaceAdapter        (.tmp 沙箱)
       → SpikeEventCollector          (事件断言)
```

工作区布局：

```text
.tmp/upstream-agent-spike/<run-id>/
├── input/character.json
├── working/
└── output/character.fixed.json
```

## 7. 月栖仅新增的 Adapter

| Adapter | 文件 | 职责 |
|---------|------|------|
| SpikeModelAdapter | `spikes/openclaw-agent-core/src/spike-model-adapter.mjs` | Fake `streamFn` |
| SpikeToolAdapter | `spikes/openclaw-agent-core/src/spike-tool-adapter.mjs` | 两个测试 Tool |
| SpikeWorkspaceAdapter | `spikes/openclaw-agent-core/src/spike-workspace-adapter.mjs` | 路径沙箱 R/W |
| SpikeEventCollector | `spikes/openclaw-agent-core/src/spike-event-collector.mjs` | 事件归一化 |

**没有**自研 Plan/Act/Observe 主循环；**没有**从 `rescue/nar-from-scratch-current` 复制 loop。

## 8. 完整事件序列（Happy Path，实测）

上游 `AgentEvent.type` → Spike 归一化：

```text
agent_start              → RUN_STARTED
message_start(assistant) → MODEL_REQUESTED
tool_execution_start     → TOOL_CALL_REQUESTED: character.inspect
tool_execution_end       → TOOL_CALL_COMPLETED: character.inspect
message_start(assistant) → MODEL_REQUESTED
tool_execution_start     → TOOL_CALL_REQUESTED: workspace.write_text
tool_execution_end       → TOOL_CALL_COMPLETED: workspace.write_text
message_start(assistant) → MODEL_REQUESTED   (完成摘要)
agent_end                → RUN_COMPLETED
```

实测日志（代表性一次）：

```text
RUN_STARTED
→ MODEL_REQUESTED
→ TOOL_CALL_REQUESTED: character.inspect
→ TOOL_CALL_COMPLETED: character.inspect
→ MODEL_REQUESTED
→ TOOL_CALL_REQUESTED: workspace.write_text
→ TOOL_CALL_COMPLETED: workspace.write_text
→ MODEL_REQUESTED
→ RUN_COMPLETED
```

证明：≥2 次模型推进；≥2 次 Tool Call；Tool Result 回灌后 Runtime 继续；Runtime 正常结束。

## 9. 测试输入与产物

**输入** `input/character.json`：

```json
{
  "name": "月栖测试角色",
  "description": "用于验证 OpenClaw Agent Runtime"
}
```

**`character.inspect` 返回**（核心字段）：

```json
{
  "valid": false,
  "missingFields": ["personality"],
  "suggestedDefaults": {
    "personality": "温和、克制、具有持续记忆"
  }
}
```

**产物** `output/character.fixed.json`：

```json
{
  "name": "月栖测试角色",
  "description": "用于验证 OpenClaw Agent Runtime",
  "personality": "温和、克制、具有持续记忆"
}
```

示例磁盘路径：`.tmp/upstream-agent-spike/<run-id>/output/character.fixed.json`

## 10. 测试命令与结果

```bash
npm run verify:openclaw-agent-spike
# 或（需 Node >= 22）
# F:\clawtry\node-v22.22.3-win-x64\node.exe tests/integration/openclaw-agent-core-spike.mjs
```

| 套件 | 结果 |
|------|------|
| Fake Model 集成（路径 A） | **24/24 PASSED** |
| BYOK Smoke（路径 B） | `IMPLEMENTED_PENDING_EXTERNAL` |
| `verify:phase0` | 29/29 |
| `verify:security` | 20/20 |
| 仓库 lint / tsc 脚本 | **无**（本仓未配置独立 lint/typecheck 脚本） |

保护场景覆盖：正常完成、未知 Tool、Schema 校验失败、maxSteps（见缺口）、AbortSignal 取消、`../` 路径逃逸。

## 11. 是否真实复用上游 Agent Loop？

**是。**

- 主循环调用的是公开符号 `runAgentLoop`。
- Tool 仅在 `tool_execution_start` 时由 Runtime 调度 `AgentTool.execute`。
- Fake Model **只**通过 `streamFn` 产出含 `toolCall` 的 assistant 消息流，**从不**直接调用 Tool。
- 测试断言禁止 rescue / `src/agent/kernel/loop` 字符串出现在 Spike runner 源码中。

## 12. Capacitor Web / Android / iOS 兼容性

| 端 | 结论 |
|----|------|
| **Capacitor WebView** | **不适合**进程内直接跑完整 `openclaw`（Node API + 巨型依赖）。 |
| **Android** | 需 **Node sidecar / 独立服务**（决策文档方案 B）；WebView 仅 UI。 |
| **iOS** | 更倾向桌面/自托管 Sidecar（方案 C）；不假装 WebView 可嵌完整 OpenClaw。 |
| **Electron / 桌面 Node** | **可行**（本 Spike 环境）；要求 **Node ≥ 22**（undici）。 |

## 13. Node 内置模块与运行环境依赖

- Spike 自身：`fs` / `path` / `module` / `url` / `child_process`（验证包装器）。
- OpenClaw agent-core 运行时拉入大量 Node 生态（`undici` 等）；在 **Node 20.11** 上导入失败（`markAsUncloneable`），**Node 22.22.3** 通过。
- 验证包装器：`scripts/verify-openclaw-agent-spike.mjs` 自动选择 Node ≥ 22。

## 14. Bundle 体积影响

| 度量 | 约值 |
|------|------|
| `openclaw` 安装树 | **~288 MB**（含完整 dist/依赖，不宜打进移动端 Web bundle） |
| `dist/plugin-sdk/agent-core.js` 入口 | ~3.7 KB（再导出） |
| `dist/proxy-BzhBz8iM.js`（含 `runAgentLoop` 主体） | **~156 KB** |
| `dist/stream-BcRkg2P0.js` | ~30 KB |
| `dist/plugin-sdk/llm.js` 入口 | ~1.1 KB |

**结论**：产品侧必须 **桌面/sidecar 进程** 引用，禁止 Vite/Capacitor Web 全量打包 openclaw。

## 15. 上游升级与 API 稳定性风险

| 风险 | 说明 |
|------|------|
| 版本号日历化 | `2026.7.1-2` 演进快；需锁版本 + Spike 回归 |
| dist-only | 无源码 map；升级靠公开 exports / d.ts |
| `AgentLoopConfig` 无原生 `maxSteps` | Spike 用 `shouldStopAfterTurn`；产品 Adapter 需封装预算 |
| Tool Schema 强制转换 | TypeBox 可能 coerce number→string；校验应用「缺字段」等硬失败 |
| 嵌套 `typebox` | 非 openclaw 公开 export；产品应显式依赖兼容版本 |

## 16. CP-5 入口条件（历史备注）

CP-4 结束时已满足进入 CP-5 的前置（真实公开 import、上游 loop、两次 Tool Call、产物、自动测试、无 rescue 循环）。  
**CP-5 结论见** `docs/OPENCLAW_ADAPTER_COMPLETION_REPORT.md`（本文件不再重复最终产品接入状态）。

---

## CP-4 门禁核对

| 条件 | 结果 |
|------|------|
| 真实 import 上游公开符号 | ✅ |
| 真实执行上游 Agent Loop | ✅ |
| Runtime 发起两次 Tool Call | ✅ |
| 真实生成 output 产物 | ✅ |
| 自动测试通过 | ✅ 24/24 |
| 未使用 rescue 自研循环 | ✅ |
| 报告含可核验路径与日志 | ✅ |
