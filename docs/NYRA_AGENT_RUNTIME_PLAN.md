# 月栖本地 Agent Runtime 与任务执行系统实施总计划

> 计划代号：**Nyra Agent Runtime（NAR）**  
> 适用仓库：`F:\beautiful`  
> 版本：1.1（**2026-07-30 紧急纠偏**）  
> 状态：自研 Kernel 路线 **ABORTED**；改走 **OpenClaw/Hermes 真实代码复用**  
>  
> **现行施工依据（纠偏后）：**  
> - `docs/UPSTREAM_COURSE_CORRECTION_CP0.md`  
> - `docs/UPSTREAM_PACKAGE_INSPECTION.md`  
> - `docs/UPSTREAM_AGENT_REUSE_MATRIX.md`  
> - `docs/UPSTREAM_RUNTIME_DECISION.md`  
>  
> 错误方向实现保存在分支：`rescue/nar-from-scratch-current`（勿合并回主路径）。  
> Phase 0 审计文档可保留作对照，其中「自研 Kernel」结论已作废。

---

## 0. 紧急纠偏（优先于下文旧 Phase 表）

停止自研：Agent Kernel、Plan/Act/Observe、Generic Tool Loop、Generic Skill Engine 等与上游重复的基础设施。

目标改为：

```text
NyraTaskController → UpstreamRuntimeAdapter → openclaw/plugin-sdk/agent-core
```

仅实现月栖胶水：Task、审批、Capability、业务 Tools、Workspace、Companion 委派、Model/Tool Adapter。

**CP-4 Spike 通过前，禁止重启大规模自研 Phase 1–5。**

下文 §1 起为纠偏前原文，仅作历史参考；执行以 UPSTREAM_* 文档为准。

---

## 0b. 原合理性裁定（历史）

本计划**合理，作为 NAR 唯一施工依据**。裁定依据：

| 原则 | 本计划 | 与既有产品共识 |
|------|--------|----------------|
| Pop 低延迟聊天 | 不进完整 Agent Loop | 已确认：即时聊天只走 Companion 上下文 + `callModel` |
| OpenClaw / Hermes | 不 fork、不作必需依赖 | 可插拔 External Backend 占位即可 |
| 真正需要规划的地方 | 助手、探索、复杂文件/多资源任务 | 与「动文件才进规划」一致 |
| 本地优先 / BYOK | 无月栖云、无 Docker、无用户 Gateway 也能跑 | 与 README / 路线图一致 |
| 状态常驻 ≠ 进程常驻 | Task Checkpoint + 再打开恢复 | 对齐离散事件、非 24h 常驻服务器 |
| 复用优先 | Phase 0 强制审计现有模块 | 已有 `studio-assist`、`skill-platform`、`src/agent/*`、任务中心 |

**明确不采纳的误解：**

- ❌ OpenClaw 进入某个 UI 页面（桌宠 / 栖机 / 探索 / 助手页本身）  
- ❌ 每条 Pop 消息 = 一次完整 Agent Loop  
- ❌ 每人一台常驻 Gateway / Docker 沙盒  

**OpenClaw 在本计划中的位置：** 仅作「未来 External Execution Backend」的可选适配器参考；月栖中心是 **Nyra Task Gateway + Local Agent Kernel**。

---

## 1. 总任务

在月栖现有产品中实现一套**自有、可嵌入**的 Agent 任务执行系统。

研究 OpenClaw / Hermes 的共性设计，抽取月栖真正需要的部分并本地实现：

- Agent 多步循环（有限步）
- 任务状态管理
- Tool Registry / Skill Registry
- Workspace
- 权限与审批
- 上下文构建（与 Companion 人格上下文隔离）
- 执行后端抽象
- 中断、恢复、重试
- 任务产物与进度事件
- Companion → 助手 / 探索 的任务委派

最终目标：

> 专门服务于月栖 Companion、栖机助手和探索模块的**本地优先 Agent Runtime**。

首个可交付版本必须能在**没有月栖云服务器、没有 Docker、没有用户自建 Gateway** 的情况下运行。模型调用继续复用当前 BYOK / Model Provider；任务编排与内部文件操作在 App 内完成。

---

## 2. Phase 0 前置阅读与审计（动代码前必须完成）

### 2.1 必读文档

```text
docs/PERSONAL_AI_OS_COMPLETION_PLAN.md
docs/PRODUCT_ROADMAP.md
docs/QIJI_ASSISTANT_ENTERPRISE.md
docs/REFERENCE_AIVIRTUALPHONE_GAP_AND_PLAN.md
docs/SCENARIO_THEATER_PLAN.md
docs/SKILL_AGENT_EXPLORATION_PLATFORM_PLAN.md
本文件
```

### 2.2 仓库审计清单

| 主题 | 已知入口（审计时核实） |
|------|------------------------|
| Pop 即时聊天 | `phone-shell` → `sendPhoneMessage` → App `sendMessage` / `assemblePrompt` → `callModel` |
| Companion 状态 | `src/runtime/companion-runtime.js`（当前偏桌宠 UI 状态，非任务 Kernel） |
| 栖机助手 | `src/studio-assist/*`、小手机 `assist` App、`docs/QIJI_ASSISTANT_ENTERPRISE.md` |
| 探索 | `src/skill-platform/*`、`src/agents/work-agent.js` |
| 模型层 | `src/model/client.js` |
| 既有 Agent / Task | `src/agent/*`（capabilities、executor、task-store）、任务中心 UI |
| Skill | `src/skill-platform`（导入、Run、Scopes） |
| 主动消息 | `src/proactive/*` |
| 持久化 | SQLite（真机）/ IndexedDB（Web）/ Capacitor Preferences / Filesystem |

### 2.3 Phase 0 产出（先于业务改动）

```text
docs/NYRA_AGENT_RUNTIME_AUDIT.md
docs/NYRA_AGENT_RUNTIME_ARCHITECTURE.md
```

审计报告必须包含：

1. 当前架构图  
2. 可复用模块（禁止重复建设）  
3. 需要替换或收敛的旧调用链  
4. 数据存储边界  
5. Android / iOS / Web 限制  
6. 本计划与现有目录的映射（实际采用的路径与接口名）  
7. 与栖机助手企业合同、Skill 平台计划的冲突消解表  

**复用优先原则：** 若已有相同能力，重构接入 NAR，不得平行再造第二套任务/工具/审批系统。

---

## 3. 产品边界：两套运行时

### 3.1 Companion Runtime

负责：

- Pop 即时聊天  
- 人格 / 情绪 / 关系  
- 长短期记忆  
- 日记、朋友圈等陪伴内容  
- 主动消息  
- **识别**用户是否提出了「需要动手」的任务  

**普通聊天不得进入完整多步 Agent Loop。**  
仅在用户要求完成实际任务时，向 Task Gateway **委派**（需确认）。

### 3.2 Agent Task Runtime

负责：

- 栖机助手的复杂系统操作  
- 探索中的多步骤任务  
- 文件读取与生成、角色卡 / 世界书 / 资源包处理  
- Skill 调用、多工具协作  
- 计划 / 执行 / 验证 / 交付  
- Companion 委派过来的复杂任务  

### 3.3 判断原则

```text
只需要「说什么」
→ Companion Runtime（轻量上下文 + callModel）

需要「改变月栖内部某个已知状态」
→ Direct Action（确定性 Tool / 业务 Service）

需要「读取、分析、修改多个资源并验证」
→ Local Agent Runtime

需要 Shell、代码执行、Git、浏览器自动化
→ External Execution Backend（第一版仅占位）
```

---

## 4. 关键架构结论

### 4.1 不需要常驻 Gateway

第一版不实现 OpenClaw 式常驻网络 Gateway。需要的是 App 内：

```text
Nyra Task Gateway
```

它是统一任务控制层（TypeScript Service，跑在 Capacitor App 内），负责：创建 / 保存 / 路由后端 / 启停恢复 Agent / 进度事件 / 审批 / 取消 / 产物。

**不要求后台进程永久存活。** 每完成一个 Agent Step 必须写 Checkpoint；App 被回收后再次打开可继续。

### 4.2 本地 Agent 不需要 Docker

第一版 Local Agent 只调用受控工具，禁止任意代码。操作对象：

- 月栖业务 Service  
- App 私有文件  
- 每任务独立 Workspace  
- SQLite / IndexedDB 的受控接口  

安全边界称为 **Capability Sandbox**（工具白名单 + Capability + Workspace 路径限制 + 业务校验 + 写审批）。  
**不得**宣传或命名为 Docker 级 Process Sandbox。

### 4.3 任意代码属于外部后端

第一版本地**禁止**：任意 Shell、Python、npm、eval、Git、编译、浏览器自动化、未审核二进制、任意爬取。

统一经可插拔 `External Execution Backend`；未来可接 OpenClaw / Hermes / 用户电脑 / VPS / 临时云容器等。**核心不得依赖其中任何一个具体项目。**

---

## 5. 目标架构

```text
┌────────────────────────────────────┐
│ 月栖 UI                            │
│ Pop / 栖机助手 / 探索 / 栖市 / 任务中心 │
└────────────────┬───────────────────┘
                 │
        ┌────────▼────────┐
        │ Intent Router   │
        └───────┬─────────┘
                │
     ┌──────────┴───────────┐
     │                      │
┌────▼────────────┐   ┌─────▼────────────┐
│ Companion       │   │ Nyra Task Gateway│
│ Runtime         │   │                  │
└─────────────────┘   └─────┬────────────┘
                             │
                     ┌───────▼──────────┐
                     │ Nyra Agent Kernel│
                     │ Plan/Act/Observe │
                     └───────┬──────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
       ┌──────▼──────┐ ┌─────▼──────┐ ┌────▼─────────────┐
       │ Tool        │ │ Skill      │ │ Execution Backend│
       │ Registry    │ │ Registry   │ │ Registry         │
       └──────┬──────┘ └────────────┘ └────┬─────────────┘
              │                             │
       ┌──────▼──────────┐         ┌────────▼──────────┐
       │ Local App Tools │         │ Future External   │
       │ Files/业务服务  │         │ OpenClaw/Hermes等 │
       └─────────────────┘         └───────────────────┘
```

逻辑模块建议（**Phase 0 按仓库实际调整，不得机械复制**）：

```text
src/
├── agent-runtime/          # 或收敛进现有 src/agent/ + skill-platform
│   ├── kernel/
│   ├── context/
│   ├── tools/
│   ├── skills/
│   ├── policy/
│   ├── workspace/
│   ├── persistence/
│   ├── scheduler/
│   └── observability/
├── task-gateway/           # 或扩展现有 task-store / task-center
├── execution-backends/
└── companion/
    └── TaskDelegationAdapter.ts
```

---

## 6. 三种执行模式

### 6.1 Direct Action

已知目标、无规划需求：切主题、改单项设置、打开功能、导出指定角色等。

```text
请求 → 参数验证 → 权限检查 → 业务 Service → 结果
```

禁止为了「显得智能」而启动 Agent。优先复用栖机助手已有 Capability 合同。

### 6.2 Local Agent

多步骤、但只碰月栖内部资源：修角色卡、合并世界书、整理日记 Markdown、校验资源包、生成角色包、安装已审核 Skill 等。

```text
创建任务 → 上下文 → 结构化下一步 → 受控 Tool → 观察 → … → 验证 → 产物 → 完成
```

### 6.3 External Execution

Shell / Git / 编译 / 浏览器 / 跑代码 / 装依赖等。第一阶段：**仅接口 + `WAITING_FOR_BACKEND` 提示**，不实现真实远程服务器，**不得伪造成功**。

---

## 7. 核心接口（规范；实现语言与现有 JS/TS 风格对齐）

### 7.1 Task

```ts
type TaskSource = "assistant" | "explore" | "companion" | "marketplace";

type TaskStatus =
  | "CREATED"
  | "ROUTING"
  | "PLANNING"
  | "RUNNING"
  | "WAITING_FOR_APPROVAL"
  | "WAITING_FOR_BACKEND"
  | "PAUSED"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELED";

interface AgentTask {
  id: string;
  source: TaskSource;
  userId: string;
  characterId?: string;
  title: string;
  instruction: string;
  expectedOutcome?: string;
  status: TaskStatus;
  executionMode: "direct" | "local-agent" | "external";
  requiredCapabilities: Capability[];
  authorizedResources: AuthorizedResource[];
  createdAt: string;
  updatedAt: string;
  currentStep?: number;
  maxSteps: number;
  checkpoint?: TaskCheckpoint;
  error?: TaskError;
}
```

### 7.2 Task Gateway

```ts
interface TaskGateway {
  submit(request: TaskRequest): Promise<AgentTask>;
  get(taskId: string): Promise<AgentTask>;
  resume(taskId: string): Promise<void>;
  cancel(taskId: string): Promise<void>;
  approve(
    taskId: string,
    approvalId: string,
    decision: "approve" | "reject",
  ): Promise<void>;
  subscribe(taskId: string, listener: (event: TaskEvent) => void): () => void;
}
```

### 7.3 Agent Kernel

```ts
interface AgentKernel {
  run(task: AgentTask): AsyncIterable<AgentRuntimeEvent>;
  resume(task: AgentTask): AsyncIterable<AgentRuntimeEvent>;
}
```

有限状态循环：

```text
BUILD_CONTEXT → PLAN_NEXT_ACTION → VALIDATE_ACTION → EXECUTE_TOOL
→ OBSERVE_RESULT → SAVE_CHECKPOINT → CONTINUE | APPROVAL | COMPLETE | FAIL
```

硬限制：最大步骤、最大模型调用、最大失败重试、单任务 Token 预算、单工具超时、总任务超时、用户取消检查。**禁止无限循环。**

### 7.4 Tool / Execution Backend

见原文规范：`AgentTool`（`riskLevel: safe | write | destructive | external`）、`ExecutionBackend`（`canExecute` / `execute` / `cancel`）。

---

## 8. Agent 输出协议

模型不得自由输出要执行的代码。每步只返回经 JSON Schema 验证的：

```ts
type AgentDecision =
  | { type: "tool_call"; toolName: string; arguments: unknown; userVisibleSummary: string }
  | { type: "request_approval"; proposedChanges: ProposedChange[]; userVisibleSummary: string }
  | { type: "complete"; summary: string; artifactIds: string[] }
  | { type: "fail"; reason: string; recoverable: boolean };
```

解析失败允许有限次纠正；超限则任务失败。  
**不得**把未验证文本当工具参数；**不得**保存或展示隐藏推理（CoT）。可持久化：计划摘要、目标、工具调用与结果摘要、错误、Checkpoint、用户可见进度。

---

## 9. Context Builder

分层上下文，避免全量灌模型；**与 Companion 人格上下文隔离**：

```text
Task Instruction / Plan Summary / Current Step
Authorized Resources / Available Tools
Relevant File Summaries / Operational Memory
Recent Tool Results / Token Budget
```

| 记忆类型 | 内容 | 边界 |
|----------|------|------|
| Companion Memory | 人格、感情、关系、共同经历 | 工作 Agent 不得直接改写人格 |
| Operational Memory | 文件处理经验、导入失败原因、Skill 用法 | 任务侧 |

Companion 只接收：用户可见结果、产物、短摘要、对关系有意义的事件。Tool 原始日志**不得**进入恋爱聊天历史。

---

## 10. Workspace

每任务独立目录：

```text
nyra-workspaces/<taskId>/{input,working,output,metadata.json}
```

- 真机：App 私有目录 + Capacitor Filesystem  
- Web：IndexedDB 或既有虚拟 FS  

所有路径经 `resolveTaskPath(taskId, relativePath)`；拒绝 `..`、绝对路径、跨任务、符号链接逃逸、未授权业务资源。  

Workspace 只存副本与产物；**生产写入必须经业务 Service**（角色 / 世界书 / 日记 / 主题等）。

---

## 11. 首批 Local Tools（名称可按仓库规范调整）

- **Workspace：** list / read_text / write_text / copy / move / delete / create_directory / extract_archive / create_archive / inspect_manifest / create_artifact  
- **角色 / 世界书：** inspect / export / propose_* / apply_*  
- **资源 / 主题：** list / inspect / propose_import / apply_*  
- **情景剧：** inspect / validate / propose_patch / apply_patch / export  
- **设置：** read / propose_update / apply_update（简单项优先 Direct Action）  

实现时应映射到现有 Service，并与栖机助手 Capability 目录对齐或迁移，避免双注册。

---

## 12. 权限与审批

Capability 集合见实施规范（`workspace.*` / `nyra.character.*` / `nyra.worldbook.*` / `nyra.resource.*` / `nyra.settings.*` / `nyra.scenario.*` / `network.access` / `shell.execute` / `browser.use` / `git.use`）。

| 风险 | 行为 |
|------|------|
| Safe | 可读、列目录、临时文件、校验、写 output |
| Write | 展示计划；可任务级一次授权后执行非破坏写入 |
| Destructive | **每次**审批（覆盖角色、删除、批量改、装插件等） |
| External | 本地禁止，走后端占位 |

与 `QIJI_ASSISTANT_ENTERPRISE.md` 的 `read/action/write/destructive` 对齐：模型字段无授权效力，确认只来自本地 UI。

---

## 13. 变更计划、Diff 与回滚

生产写入前必须生成：

```ts
interface ChangePlan {
  creates: ProposedChange[];
  modifies: ProposedChange[];
  deletes: ProposedChange[];
  businessMutations: BusinessMutation[];
  riskLevel: "write" | "destructive";
}
```

流程：Workspace 候选 → 校验 → ChangePlan + Diff → 用户审批 → 生产快照 → 业务 Service → 验证 → 提交 / 失败回滚。  
**禁止**先写生产再补审批。

---

## 14. Skill 系统

第一版 Skill = **声明式能力包**（`skill.json` + instructions + schemas/templates/examples），不是任意可执行代码。

只能：提供说明、限制工具、模板、Schema、示例、步骤预算。  
不得：任意 JS、Shell、动态装依赖、绕过 Tool Registry、直连 DB、未声明提权。

须与现有 `skill-platform` / `.yueqi-skill` **收敛为一套**，禁止两套 Manifest。

内置 Skill 样例（Phase 11）：

1. 角色卡检查与修复  
2. 世界书合并  
3. 情景剧资源整理  

---

## 15. 模型适配

复用现有 Model Provider / BYOK。新增 Agent 专用：

```ts
interface AgentModelProvider {
  generateDecision(request: AgentDecisionRequest): Promise<AgentDecisionResponse>;
}
```

与 Pop 聊天调用隔离；支持 Tool Schema、JSON 输出、超时、取消、Token 统计、重试、错误映射、无原生 tool-call 时的降级。  
预留：`cloud-byok` / `local-llm` / `shared-cloud`（第一版不强制本地小模型）。

---

## 16. 持久化与断点续跑

任务不是内存对象。创建、计划完成、工具前后、审批、每步、暂停、失败、完成均须落库。

```ts
interface TaskCheckpoint {
  planSummary?: string;
  currentGoal?: string;
  stepIndex: number;
  completedToolCalls: ToolCallRecord[];
  pendingApprovalId?: string;
  artifactIds: string[];
  tokenUsage: number;
  updatedAt: string;
}
```

再打开 App：查询 `RUNNING | PAUSED | WAITING_*` → 读 Checkpoint → 继续 / 取消 / 查看。  
第一版**不依赖** Android 后台常驻。

---

## 17–19. 产品接入

### 助手

```text
解释 → 普通助手回复
已知确定性操作 → Direct Action
复杂多步 → Task Gateway（Local Agent 优先）
```

### 探索

统一经 Task Gateway。本地支持 Markdown/JSON/TXT/角色包/世界书/主题/情景资源/ZIP 等分析重组。  
需 Shell/代码/Git/浏览器等 → `WAITING_FOR_BACKEND`，UI 明确说明，禁止假成功。

### Companion 委派

Pop **不**直接调 Agent Kernel。识别任务 → 委派说明 → 用户确认 → Gateway → 结果摘要回传角色口吻。  
普通「我今天很难受」类聊天**不得**创建 AgentTask。

---

## 20. External Backend 抽象

第一版：接口 + 连接配置模型 + 占位（OpenClaw / Hermes / Generic）+ `WAITING_FOR_BACKEND`。  
核心不依赖其具体协议。

---

## 21. UI

助手 / 探索 / 任务中心统一任务卡片：标题、状态、步骤摘要、执行模式、进度、用量、产物、审批、取消、失败原因、恢复。  
展示用户可见进度文案；**不展示**隐藏思维。优先扩展现有任务中心，避免第三套任务 UI。

---

## 22. Observability

记录 taskId、source、mode、provider/model、步数、工具数、Token、耗时、错误、审批、恢复、产物数。  
脱敏：无 API Key、默认不落完整私聊/文件全文/Companion 私密记忆、无隐藏推理。

---

## 23. 实施阶段与状态

状态枚举：`NOT_STARTED` | `IN_PROGRESS` | `PASSED` | `IMPLEMENTED_PENDING_EXTERNAL` | `BLOCKED_MISSING_INPUT` | `FAILED`

| Phase | 内容 | 状态 |
|-------|------|------|
| 0 | 审计 + `AUDIT.md` + `ARCHITECTURE.md` | NOT_STARTED |
| 1 | 领域模型 + 状态机 + 单测 | NOT_STARTED |
| 2 | Task Gateway + 持久化 + Event Bus + Mock Backend | NOT_STARTED |
| 3 | Workspace + Path Guard + ZIP + 三端适配 | NOT_STARTED |
| 4 | Tool Registry + Schema + Capability + 风险 | NOT_STARTED |
| 5 | Agent Kernel（循环、预算、Checkpoint、取消） | NOT_STARTED |
| 6 | 首批业务工具（角色/世界书/情景/资源/Workspace） | NOT_STARTED |
| 7 | ChangePlan / Diff / 快照 / 审批 / 回滚 | NOT_STARTED |
| 8 | 助手接入（Direct / Local / External Required） | NOT_STARTED |
| 9 | 探索接入 + 任务卡片 | NOT_STARTED |
| 10 | Companion 委派（不改动普通 Pop 路径） | NOT_STARTED |
| 11 | 声明式 Skill Runtime + 3 个内置 Skill | NOT_STARTED |
| 12 | External Backend 占位 | NOT_STARTED |
| 13 | 安全、回归、文档、完成报告 | NOT_STARTED |

外部 OpenClaw/Hermes/真机商店未就绪 → `IMPLEMENTED_PENDING_EXTERNAL`，**不阻塞**其他 Phase。

---

## 24. 必测用例（摘要）

1. 角色包检查 → output 产物，不改生产，用户再决定导入  
2. 世界书合并 → Diff → 批准 → 新书，原文件不变  
3. 破坏性覆盖 → `WAITING_FOR_APPROVAL` → 拒绝 → 生产无变化  
4. 路径逃逸全部失败  
5. App 中断后从 Checkpoint 恢复，已完成工具不重复执行  
6. 缺后端（如 Python）→ `WAITING_FOR_BACKEND`，不伪造输出  
7. Companion 普通聊天不创建 Task  
8. Companion 委派经确认后建任务，聊天只收摘要  

---

## 25. 完成标准

1. 无自有云亦可跑多步本地 Agent  
2. 普通 Pop 不经 Agent Kernel  
3. 助手可区分 Direct Action 与 Local Agent  
4. 探索统一任务生命周期  
5. 受控本地工具可用  
6. 每任务独立 Workspace  
7. 生产写入经业务 Service  
8. 高风险有审批与回滚  
9. App 关闭后可恢复  
10. 本地无 Shell / 任意代码  
11. OpenClaw/Hermes 仅为未来外部后端  
12. Skill 默认声明式  
13. 状态/进度/错误/产物可在 UI 查看  
14. 路径与跨任务访问测试全过  
15. 不保存/展示隐藏思维  
16. 三端有能力降级说明与核心回归  

最终交付：`docs/NYRA_AGENT_RUNTIME_COMPLETION_REPORT.md`

---

## 26. 明确禁止

- 完整 fork OpenClaw/Hermes 嵌入 App  
- 完整 Agent Loop 用于每条 Pop  
- Capacitor 中模拟 Docker  
- 任意 Shell / `eval` 执行模型输出  
- Agent 直接改 SQLite 文件 / Workspace 越出私有目录  
- 第三方 Skill 自动满权限  
- 把全部 Companion 记忆交给工作 Agent  
- 缺后端时伪造结果  
- 假设 JS 进程永久后台  
- 未验证自由文本当工具调用  
- 保存完整隐藏推理  
- 每用户常驻服务器  
- 因外部后端未接而阻塞本地 MVP  

---

## 27. 执行约定

- **先 Phase 0，再改业务代码。**  
- 每 Phase：相关单测 → 类型检查（若有）→ lint → 既有回归 → 更新本表状态 →（仅当用户要求时）Git Commit → 下一 Phase。  
- 聊天中不要求用户逐步签字；仅在缺密钥/不可逆外发/互斥产品方向/法律商业时暂停。  
- 与 C0–C6 / PAIOS 冲突时：**陪伴主路径与本计划 §3 边界优先**；任务系统不得拖垮 Pop 延迟。

---

## 28. 与现有模块的预期映射（审计时核实并改写）

| 现有 | NAR 角色 |
|------|----------|
| `src/studio-assist/*` | Direct Action 工具与审批 UX 的主要来源；复杂路径改走 Gateway |
| `src/skill-platform/*` | Skill Registry / Run 的收敛对象，避免双轨 |
| `src/agent/*` + 任务中心 | Task 存储、Capability、UI 卡片的优先扩展点 |
| `src/model/client.js` | 底层调用；之上加 `AgentModelProvider` |
| `src/proactive/*` | 仍属 Companion 侧调度；复杂结果可事后委派，不改为每心跳 Agent |
| `src/runtime/companion-runtime.js` | 保持桌宠/在场状态；委派适配器另建，勿把 Kernel 塞进桌宠 runtime |

---

**签字栏（工程）：** 本文件 v1.0 已作为 NAR 正式计划入库。下一步唯一动作：执行 Phase 0，输出 `NYRA_AGENT_RUNTIME_AUDIT.md` 与 `NYRA_AGENT_RUNTIME_ARCHITECTURE.md`。
