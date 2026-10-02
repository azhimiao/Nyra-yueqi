# ADR-001: Companion / Agent / Skill / Experience / OpenClaw

- Status: Accepted
- Date: 2026-07-31
- Phase: R1

## Context

月栖已有多套并行运行时与存储。R1 先冻结语义边界，禁止继续把它们混用。

## Decision

### Companion Core

唯一长期伴侣身份、关系合同、Relationship Timeline、用户理解与稳定记忆、跨表面 Context Builder。普通陪伴聊天永远从这里开始。Companion Core 不是 Skill，也不由 OpenClaw 接管。

### Selectable Agent

用户主动选择的专业工作模式。可有独立 working formulation，但不得自建第二套用户身份、关系数据库或权限系统。必须显式选择：独立会话副本 / 共享当前会话；是否读全局记忆；是否写回候选。

### Skill Package

Agent 可装配的知识、工作流、规则或受控工具能力。不得拥有平行 Relationship Store、Global Profile、Permission Runtime、Billing Ledger、Model Client 或任意 Shell。

### Experience Runtime

统一承载情景、冒险、漫卷、共创、YEOS、游戏型 Skill。必须区分 `reality` / `shared_fiction` / `simulation` / `creative_work`。虚构不得自动晋升现实 Stable Memory。

### OpenClaw

获权后的多步骤现实行动执行器。不用于普通恋爱聊天、每轮情绪分析、记忆检索或无工具 Skill 对话。不得成为总 Runtime。

## Routing

```text
User input → Agent Orchestrator
  ├─ companion chat
  ├─ direct action + Policy Engine
  ├─ Agent Session + Skill Host
  ├─ Unified Task → OpenClaw
  └─ Experience Runtime
```

## Consequences

- R2+ 迁移必须通过 Adapter，不得先删后补。
- 新产品面必须声明它走哪条路由与哪一个 Repository。
- Billing / managed metering 只能接统一 Model Gateway（R9），不得在本 ADR 外另立计费真相源。
