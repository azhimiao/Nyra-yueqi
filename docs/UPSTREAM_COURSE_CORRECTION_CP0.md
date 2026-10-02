# CP-0 现场保护与纠偏记录

> 日期：2026-07-30  
> 状态：PASSED  
> 基线：`b4e73e2 chore: snapshot current companion stack before NAR agent runtime`

## 1. 立即停止

已停止「自研 NAR Agent Kernel / Plan-Act-Observe / Tool Loop」路线。  
**不再启动** Phase 1–5 自研实现子 Agent。

新目标：真实检查并复用 OpenClaw / Hermes **现有代码**（导入 / 裁剪 / Adapter / Sidecar），只写月栖胶水层。

## 2. Git 现场（按命令结果，非猜测）

### 2.1 纠偏前（已记录）

```text
master @ 66037c2
  66037c2 feat(nar): phase 4 tool registry...
  8c3ed3a feat(nar): phase 3 workspace...
  01429de feat(nar): phase 2 task gateway...
  ab156da feat(nar): phase 1 domain model...
  b4e73e2 chore: snapshot current companion stack before NAR agent runtime
```

`b4e73e2..HEAD` 共 **30 个路径**变更（+约 3579 行），另有未提交 Phase 5 WIP（kernel/loop、model provider、verify-nar-phase5 等）。

### 2.2 保护分支

```text
rescue/nar-from-scratch-current @ 2f5a8c2
```

包含：Phase 1–4 已提交实现 + Phase 5 WIP 快照。**未删除。**

### 2.3 主分支恢复后

```text
master @ b4e73e2 + 仅保留 Phase 0 文档提交
```

自研 Runtime（task-gateway 实现、kernel/loop、自研 tools registry 等）**不在 master 工作树上**。

保留有价值审计：

- `docs/NYRA_AGENT_RUNTIME_AUDIT.md`
- `docs/NYRA_AGENT_RUNTIME_ARCHITECTURE.md`

（架构文档中「自研 Kernel」结论已作废，仅作对照；以本纠偏与后续 UPSTREAM_* 文档为准。）

## 3. `b4e73e2` 之后本轮 NAR 新增清单（进 rescue）

| Commit | 内容 |
|--------|------|
| `ab156da` | Phase 1 领域模型 / state-machine |
| `01429de` | Phase 2 Task Gateway / event bus / mock backend |
| `8c3ed3a` | Phase 3 Workspace / path guard |
| `66037c2` | Phase 4 Tool registry / policy / workspace tools |
| `2f5a8c2` | Phase 5 WIP：kernel/loop、decision-schema、agent-model-provider、verify-nar-phase5 |

主要路径前缀：`src/agent/task-gateway/`、`src/agent/kernel/`、`src/agent/workspace/`、`src/agent/tools/`、`src/agent/backends/`、`src/agent/policy/`、`scripts/verify-nar-phase*.mjs`

## 4. 下一步

按纠偏文档执行 **CP-1**：检查 `F:\clawtry` 包结构 → `docs/UPSTREAM_PACKAGE_INSPECTION.md`。

Spike（CP-4）通过前，**禁止**重启大规模自研 Phase 1–5。
