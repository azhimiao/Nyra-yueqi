# 月栖 Skill × Agent × 探索 App 完整执行计划

> 版本：v1.2.1  
> 状态：**P0–P6 `implementation_green`（自动 verify 绿）；`product_review` / 用户 L3 黄金旅程 / Android 真机手测仍待人工验收**  
> 目标：把月栖现有 Agent Task Runtime 升级为可发现、可导入、可授权、可运行、可审计的 Skill 平台；首个完整样板为“关系探索 / 恋爱咨询” Skill。  
> 本文是唯一施工依据。任何测试、截图或 UI 占位都不能替代这里定义的行为验收。  
> **分层修正（P0）**：用户向平台落在 `src/skill-platform/` + `src/agents/`；现有 `src/skills/` 保留为 PAIOS 开发者 Skill SDK（`verify:core-p5`）。详见 `docs/qa/skill-platform/P0/LAYERING.md`。

---

## 0. 一句话产品定义

月栖不是把一段 `SKILL.md` 塞进聊天提示词，也不是让普通用户配置 Skill 文件。用户在“小手机 → 探索”中看到的是一个个可主动选择、组合与创建的**个人 Agent**：关系探索、生活整理、一起写长篇、游戏主持人、旅行规划、学习教练……；点开始后，月栖 Agent 自动加载相应的方法、状态和已获授权的工具，用自然聊天完成工作。

`SKILL.md`、Manifest、资源路径、Schema 和工具映射均是**产品内部实现**。用户不需要懂、看、编辑或手动填写其中任何一个。

```text
探索 App（发现 / 一键安装 / 简明隐私选择 / 管理）
        ↓
Agent Profile（用户可选择的专业 Agent：身份、默认 Skills、权限）
        ↓
Skill Registry（包、版本、文件、声明、启用状态）
        ↓
Skill Runtime（路由、上下文、状态、输出校验）
        ↓
Conversation V2 + Context Broker + Agent Task Runtime
        ↓
聊天 / 独立技能会话 / 任务中心 / 记忆候选确认
```

用户面对的是 **Agent**；Skill 是 Agent 的知识、方法与工具工作流。一个 Agent 可以装载多个 Skill；一个 Skill 也可以被多个 Agent 复用。栖机助手是默认的通用 Agent，安装的新 Skill 可以增强它，也可以被组合成一个独立的专业 Agent。

桌宠仍然只承担陪伴入口和状态投影；**不得把桌宠资产、动作或角色立绘塞进探索 App、技能详情页或技能会话的主视觉。**

---

## 1. 已有底座与真实缺口

### 1.1 可复用的已有实现

| 底座 | 现有路径 | 复用方式 |
|---|---|---|
| Agent 任务状态机 | `src/agent/` | 复用任务、审批、暂停、取消、审计和幂等键；不重写第二套执行器 |
| 本地 Capabilities | `src/agent/capabilities/` | 作为 Skill 可申请调用的白名单工具 |
| Conversation V2 | `src/conversation/` | 作为共享会话、复制快照和技能会话的唯一会话图 |
| Context Broker | `src/context/` | 所有 Skill 模型调用都必须由 Broker 组装上下文 |
| 长期记忆 / 同栖 / 朋友圈 | `src/memory/`、`src/moments/` | 仅经 Scope 授权后读取；写入必须候选化 |
| 小手机与任务中心 | `src/phone-shell/`、`src/agent/ui/` | 增加独立“探索” App；任务仍只在任务中心展示 |

### 1.2 不能宣称已有的能力

当前项目**没有**以下产品能力：Skill Registry、可导入包解析、探索页、Skill 权限、Skill Session、Skill Router、Skill 状态存储、Skill 评测、外来 Skill 的工具权限映射。当前 Agent 只是内置本地任务执行器。

同样没有：用户主动切换 Agent、Agent 组合、从自然语言创建自己的 Agent/Skill、手机端 sandbox 部署包。这些是本计划的主路径，不是后置彩蛋。

---

## 1.3 用户选择的是真正的 Agent

### 用户侧的信息架构

```text
探索
├─ 找 Agent：关系、生活、创作、游戏、学习、开发
├─ 我的 Agent：栖机助手 + 用户安装/创建的 Agent
├─ Skills：已安装的能力模块、可组合到 Agent
└─ 创建：用一句话创建自己的 Agent / 从文件导入
```

### Agent Profile（用户可见）

一个 Agent Profile 是用户真正选择的工作伙伴，而不是技术概念：

```json
{
  "id": "relationship-guide",
  "name": "关系探索",
  "tagline": "用清晰的方法陪你梳理关系，而不是替你下结论。",
  "icon": "compass-heart",
  "kind": "specialist",
  "skillIds": ["relationship-intelligence"],
  "defaultRunMode": "isolated_new",
  "defaultScopes": { "memoryRead": "none", "memoryWrite": "off" }
}
```

用户可以：

1. 在聊天输入框旁主动点“选择 Agent”；
2. 在探索页点某个 Agent 的“开始”；
3. 把某个 Agent 设为某个会话的默认专家；
4. 把已安装 Skills 添加进“栖机助手”，让通用助手能力变强；
5. 创建自己的 Agent，例如“我的跑团主持人”“我的小说总编”“我的留学规划搭子”。

恋人角色不是 Agent Profile 的替代品。默认情况下，专业 Agent 以清晰的“关系探索 / 创作伙伴”等来源出现；只有用户选择共享会话和同步结论时，恋人角色才参与或参考其确认结果。

### Skill 的四个能力等级

| 等级 | 用户感受 | 技术实现 | 首发状态 |
|---|---|---|---|
| L1 知识型 | “它很懂某个领域” | prompt / policy / reference 检索 | 必做 |
| L2 工作流型 | “它会按一套方法持续帮我推进” | Skill state、schema、阶段机 | 必做 |
| L3 工具型 | “它能帮我记笔记、建计划、做任务” | 已授权 Capability + Agent 审批 | 必做 |
| L4 扩展型 | “它带有自定义程序/复杂玩法” | 签名 WASM/受限扩展 Sandbox | 后置，不允许首发执行任意代码 |

“任何创意都可以导入”的首发含义是：任何创意都可以作为 L1/L2/L3 的**知识、工作流、状态、资源和受控工具申请**被安装、组合与运行。游戏可先以世界设定、规则、角色、地图状态和回合协议实现；不需要放开任意 JavaScript 才能有自由度。

---

## 2. 核心语义：会话、记忆、角色可见性必须独立

“独立 Skill 会话”不能被硬编码为默认且唯一的模式。用户必须在开始 Skill 时选择会话连接方式；同时，读取记忆、让角色看见、写入全局记忆必须是三个独立决定。

### 2.1 会话连接模式

| 模式 | `conversationSessionId` | 用户看到什么 | 适用场景 |
|---|---|---|---|
| `isolated_new` | 新建 `skill:*` 会话 | 独立的咨询/写作/学习界面 | 私密探索、首次使用 |
| `snapshot_copy` | 新建 Skill 会话 + 只读 `sourceSnapshotId` | 带入启动时聊天副本，之后互不追加 | 想让 Skill 了解背景但不混入日常聊天 |
| `shared_live` | 复用当前 Pop / 群聊 / 项目会话 | 同一条即时通讯时间线，Skill 发言有来源标识 | 希望恋人和 Skill 在同一上下文中共同推进 |

约束：

1. `snapshot_copy` 只能读取启动那一刻的消息快照，之后不监听原会话；不得伪装成实时同步。
2. `shared_live` 真正复用同一个 Conversation V2 session，不复制用户消息；Skill 回合须有 `meta.origin = "skill"`、`meta.skillId`、`meta.skillRunId`，方便筛选、审计和导出。
3. `isolated_new` 的默认标题为 Skill 名称，不自动带入恋人角色的全部聊天。
4. 同一会话内可同时存在日常聊天和 Skill 回合；Prompt 组装必须按当前 `appId/purpose/skillRunId` 过滤，不允许把另一个 Skill 的私密状态混入。

### 2.2 四个独立授权

| 授权键 | 选项 | 默认 | 含义 |
|---|---|---|---|
| `conversationRead` | `none` / `snapshot` / `shared_live` | `none` | Skill 能读取哪一段聊天 |
| `memoryRead` | `none` / `global_personal` / `selected_character` / `relationship` | `none` | Skill 能从哪些长期记忆检索 |
| `characterVisibility` | `private` / `selected_character` | `private` | Skill 的结论是否可以成为指定角色的可见上下文 |
| `memoryWrite` | `off` / `propose_personal` / `propose_character` / `propose_both` | `off` | Skill 的结论可提议写入何处 |

硬规则：

- 授权并非一次安装永久放行；每次新建 Skill Run 都显示摘要，用户可沿用或修改。
- `characterVisibility` 不能自动推导 `memoryWrite`，反之亦然。
- `memoryWrite` 永远只产生候选，不能由模型或 Skill 自动提交长期记忆。
- `shared_live` 只表示共享**对话历史**，不等于自动读全局记忆、更不等于自动写回角色记忆。
- 恋爱咨询默认 `isolated_new + memoryRead:none + characterVisibility:private + memoryWrite:off`。

### 2.3 用户可见的开始页文案

开始页必须清楚解释，不得只放复杂开关：

```text
这次怎么开始？
○ 从空白关系探索开始
○ 带入当前聊天副本（之后不会继续同步）
○ 在当前聊天里共同探索

要让谁知道这次探索？
□ 仅本次 Skill 可见
□ 允许「星梨」在今后的聊天中参考我确认过的结论

记忆写入：默认不写。每条结论会在结束时单独请你确认。
```

---

## 3. Skill 包标准与安全边界

### 3.1 导入原则

`F:\skills` 是**作者本机参考与首批导入源**，不是 Web App 在运行时可任意扫描和执行的目录。浏览器/PWA 只能让用户显式选择文件；桌面宿主可调用文件选择器，但同样必须走导入确认。

面向普通用户的入口只有两个：

1. **探索页卡片一键安装**：月栖随产品提供的精选包；用户点“添加”即可。
2. **从文件导入**：用户只需在系统文件选择器中选一个 `.yueqi-skill` / `.zip` / 文件夹，月栖自动识别内容并展示一张普通语言的“能力卡”供确认。

用户不会被要求选择入口文件、填 Manifest、指定 prompt 文件或配置工具。`F:\skills` 用于开发期批量导入与首批精选内容；发布后的用户只看到编译好的能力卡或选择一个包。

手机端导入必须支持“选 zip → 自动部署”：Capacitor/Android Host 通过系统文件选择器获得用户明确选择的文件，将其解压到应用私有沙盒临时目录，完成解析/校验/索引后把安全文本资源写入应用数据仓库，最后删除临时解压目录。用户只看到“正在识别这个 Agent 包”“已添加到我的 Agent”，不会接触目录、压缩算法或部署命令。

首发接受：

1. 单个 `SKILL.md`；
2. `.zip` Skill Bundle（仅文本资源）；
3. 月栖自有 `.yueqi-skill.json` 导出包。

首发拒绝或隔离：

- 任意 `.js` / `.py` / `.exe` / shell 脚本直接执行；
- HTML 注入、外链 iframe、未经声明的网络访问；
- 未知二进制文件；
- 超过大小/文件数/路径深度阈值的压缩包；
- 路径穿越（`../`）和同名覆盖。

### 3.2 智能导入器：用户只选包，系统负责解析

导入不是“上传一个 Markdown 后由用户手工配置”。必须实现 `Skill Import Wizard`，其内部流程如下：

```text
用户选中一个文件夹 / zip / 已下载的 .yueqi-skill
    ↓
临时沙箱解包（不执行任何文件）
    ↓
递归找 SKILL.md、读取 frontmatter、解析相对链接与目录结构
    ↓
确定性分类：system / policy / schema / example / eval / static asset
    ↓
缺少标准字段时：Host Import Classifier 仅阅读文本，生成“导入提案”
    ↓
安全校验、hash、权限推断、能力卡预览
    ↓
用户只确认：名称、用途、隐私提醒、是否添加
    ↓
写入内部 Manifest 与文件仓库
```

实现细则：

1. 优先确定性解析，不能依赖模型才能导入标准包；`relationship-intelligence-skill` 这种“根 SKILL.md + prompts/policies/schemas/evals”目录必须零配置解析成功。
2. `SKILL.md` 单文件只在它没有相对资源依赖时允许直接安装；如检测到 `prompts/system.md` 等相对链接但用户只选了单文件，UI 用普通语言提示“这个能力还缺配套资料，请选择整个文件夹或压缩包”，不能安装残包。
3. 对没有 frontmatter/结构不完整但都是文本的包，可由 Host Import Classifier 生成候选名称、分类、用途和资源映射；它只能提出方案，不能自己安装。用户看到的仍是普通能力卡，不是 JSON。
4. 无模型配置时，标准包照常可导入；非标准包显示“无法自动识别，请使用完整 Skill 包”。
5. Import Classifier 永远不得执行包内代码、访问包外路径或把包内容上传到未知第三方。
6. 导入预览显示“将读取什么”“可建议什么任务”，而不是 `Manifest`、token 或文件路径。
7. 成功导入后，系统自动生成一个 Agent Profile：单 Skill 包默认成为一个同名专业 Agent；用户也可以在“添加到哪个 Agent？”中选择栖机助手、已有 Agent 或“新建一个”。
8. 包内存在多个可识别 Skill 时，Wizard 自动显示“发现 3 个能力”，用户勾选要添加的 Agent；不得要求用户自行拆 zip。
9. 解压、解析、写入、激活是四个原子阶段；任一步失败必须回滚本次临时文件和安装记录，不能留下半部署 Agent。

### 3.3 内部 Manifest：`yueqi-skill-manifest.v1`

导入器将外部 `SKILL.md` 的 frontmatter 与目录资源编译为本地 Manifest；不要要求所有现有包先重写。

```json
{
  "schemaVersion": 1,
  "id": "relationship-intelligence",
  "name": "关系探索",
  "version": "1.1.0",
  "description": "以工作性概念化和情景模拟进行关系探索。",
  "category": "relationship",
  "entry": "SKILL.md",
  "resources": {
    "system": ["prompts/system.md"],
    "policies": ["policies/conversation-policy.md", "policies/safety-policy.md"],
    "schemas": ["schemas/session-state.schema.md", "schemas/working-formulation.schema.md"],
    "evals": ["evals/behavioral-cases.md"]
  },
  "triggers": ["恋爱咨询", "关系困惑", "想知道自己适合什么关系"],
  "outputMode": "structured_dialogue",
  "requestedCapabilities": ["structured-notes", "calendar-draft"],
  "requestedDataScopes": ["conversation.snapshot", "memory.personal"],
  "execution": {
    "kind": "prompt_policy",
    "modelInvocation": "host_only"
  },
  "integrity": { "sha256": "..." }
}
```

字段要求：

- `id` 采用小写 kebab-case；同 ID 新版本必须进入升级流，不能静默覆盖。
- `requestedCapabilities` 只是申请，安装后实际 `grantedCapabilities` 另存。
- 外部 frontmatter 中的 `disable-model-invocation: true` 映射为 `execution.modelInvocation = "host_only"`：Skill 不可自行递归调用模型或工具；只有月栖 Runtime 能调用当前用户配置的模型。
- `outputMode` 首发只允许 `dialogue`、`structured_dialogue`、`artifact_draft`；未知模式拒绝导入。

### 3.4 安全模型

```text
导入的 Skill 文本 / Schema / 资源
       ↓ 解析 + hash + 结构校验
InstalledSkill（静态、不可执行）
       ↓ 用户安装并授予范围
SkillRun（会话级授权、状态）
       ↓ Router 选择 / 用户明确启动
Host Skill Runtime
       ↓ 只映射到已注册的月栖 Capability
Agent Task Runtime（审批、审计、暂停、取消）
```

禁止把导入包中的脚本名、URL、任意 Tool ID 直接交给 `eval`、`Function`、`import()` 或系统 shell。

---

## 4. 数据模型与存储

新增模块：`src/skills/`。所有本地 Key 必须带版本；所有导入/更新/删除都记审计事件。

| 模型 | 建议 Key | 关键字段 |
|---|---|---|
| Skill Catalog | `yueqi.skills.catalog.v1` | manifest 摘要、来源、hash、安装状态、版本 |
| Skill Files | IndexedDB `skill_files` | `skillId/version/path/content/hash/mediaType` |
| Installation | `yueqi.skills.installations.v1` | skillId、enabled、grants、pinned、installedAt |
| Skill Run | `yueqi.skills.runs.v1` | mode、conversation binding、scope、state、status |
| Skill State | IndexedDB `skill_state` | runId、schemaVersion、JSON 状态、revision |
| Skill Audit | `yueqi.skills.audit.v1` | import/run/route/permission/memory/task 事件 |
| Memory Candidate | 复用/扩展现有 memory candidate store | origin skill/run、target scope、evidence span、用户决定 |

### 4.1 `SkillRun` 示例

```json
{
  "id": "skillrun_rel_01",
  "skillId": "relationship-intelligence",
  "skillVersion": "1.1.0",
  "characterId": "xingli",
  "mode": "snapshot_copy",
  "conversation": {
    "conversationSessionId": "conv_skill_01",
    "sourceConversationSessionId": "conv_pop_99",
    "sourceSnapshotId": "snapshot_01"
  },
  "scopes": {
    "conversationRead": "snapshot",
    "memoryRead": "global_personal",
    "characterVisibility": "private",
    "memoryWrite": "propose_personal"
  },
  "grantedCapabilities": ["structured-notes"],
  "stateRevision": 4,
  "status": "active",
  "createdAt": "..."
}
```

### 4.2 会话与状态的一致性规则

1. Skill 状态更新必须使用 revision/CAS；旧模型回包不得覆盖新一轮状态。
2. 模型输出解析失败时，聊天消息、状态、记忆候选、任务都不得部分提交。
3. `snapshot_copy` 的快照应保存 source message IDs、内容 hash 和创建时间；原聊天删除后仍不改变已启动的历史快照。
4. 删除 Skill 不删除用户已确认的全局记忆；删除前必须告知会删除哪些 Skill Run 和私有状态。
5. 更新 Skill 要新建版本记录；运行中的 Run 固定使用启动时版本，用户明确迁移后才升级。

---

## 5. Runtime 协议：Skill 不是自由提示词

### 5.0 产品核心：Skill 提升 Agent，不是让用户“运行 Skill”

用户感受到的主体始终是月栖 Agent，而不是一堆需要自己操作的插件。Skill 给 Agent 增加的是专业方法、稳定状态和受限工具选择：

```text
普通用户说：“我每次恋爱都很累，不知道问题在哪。”
    ↓
月栖 Agent 理解意图
    ↓
已安装“关系探索”时：自然回复 + 显示“用关系探索陪你理一理”轻提示
    ↓ 用户点一次，或已将其设为默认助手
Skill Router 绑定 Relationship SkillRun
    ↓
Agent 读取该 Skill 的方法、当前工作假设、用户授权的上下文
    ↓
自然对话；需要笔记/提醒时才提议任务并走审批
```

因此必须实现的 Agent 升级是：

| Agent 能力 | 没有 Skill 时 | 有 Skill 平台后 |
|---|---|---|
| 意图理解 | 只能泛用聊天或固定 Capability | 知道何时使用关系探索、创作、学习等专业方法 |
| 持续状态 | 只有普通聊天历史 | 维护每个专业过程的工作假设、阶段、进度和可撤回结论 |
| 工具选择 | 只执行预置任务 | 根据已安装 Skill 的声明提出最合适的已授权任务 |
| 记忆 | 泛用抽取 | 区分草稿、Skill 私有状态、用户确认的个人事实、可同步给角色的关系事实 |
| 可解释性 | “我做了一个任务” | “我正在以关系探索的方式工作；本次读取了哪些内容、会写到哪里” |

用户不需要输入 `/skill`、选择工具 ID、维护状态机，或理解 Skill 和 Capability 的差异。所有技术名仅在开发者诊断页出现。

### 5.1 路由流程

```text
用户输入 / 点击探索入口 / 已绑定的 Skill 会话
    ↓
Skill Router：已安装 + 启用 + trigger 匹配 + 当前授权
    ↓
无明确匹配：普通聊天，不假装调用 Skill
首次有明确匹配：展示 1–3 个自然语言建议（例如“用关系探索陪你理一理”）
用户选择、已固定 Run 或用户把 Skill 设为默认助手：创建或恢复 SkillRun
    ↓
Context Broker 依据 run.scopes 建 ContextRequest
    ↓
Host 读取 Skill 资源、构造 Host Envelope
    ↓
模型返回结构化 SkillTurn
    ↓
校验 state patch / memory candidates / task proposals
    ↓
原子提交 Conversation + State；候选记忆与任务等待用户确认
```

### 5.2 `SkillTurn` 宿主输出格式

不要要求外部 Skill 自己遵守月栖内部格式。Host 在其系统层附加该协议，并负责解析。

```json
{
  "assistantText": "我先抓到的不是你不想亲密，而是……",
  "nextAction": "FORMULATE",
  "statePatch": {
    "workingFormulation": { "hypothesis": "...", "confidence": 0.56 },
    "questionEndingStreak": 0
  },
  "memoryCandidates": [
    {
      "text": "用户确认：冷处理会明显降低其安全感。",
      "target": "personal",
      "evidenceMessageIds": ["msg_1", "msg_3"]
    }
  ],
  "taskProposals": [
    {
      "capabilityId": "structured-notes",
      "title": "保存关系探索地图",
      "input": { "...": "..." }
    }
  ]
}
```

校验规则：

- `assistantText` 必须存在且长度受限；不得把 JSON 或运行标记显示给用户。
- `nextAction` 必须属于该 Skill Manifest 允许的动作；关系探索首发为 `CONTAIN/REFLECT/FORMULATE/DISCRIMINATE/SIMULATE/DEBRIEF/SYNTHESIZE/ADVISE/SAFETY_OVERRIDE`。
- `statePatch` 只能改该 Run 的白名单字段，不能改角色卡、全局设置或其他 Run。
- `memoryCandidates` 必须含来自用户原文的 evidence IDs/span；不能由助手自述作为证据。
- `taskProposals.capabilityId` 必须同时在 Manifest `requestedCapabilities`、Installation grant、Run grant 和月栖 Capability Registry 中存在。
- 任一字段非法：显示诚实重试态，不写状态、不写记忆、不建任务。

### 5.3 上下文装配顺序

```text
平台安全与高风险边界
→ 月栖即时聊天 / 独立会话输出契约
→ Skill 的 system + 必要 policy
→ SkillRun 状态（最小化）
→ 用户明确授权的记忆/角色上下文
→ Conversation V2 历史或快照
→ 当前用户输入
→ Host SkillTurn JSON 契约
```

不得：

- 把整个 `SKILL.md`、全部 examples、全部 evals 每轮塞进 Prompt；按入口和当前 action 选择必要资源，并记录 token trace。
- 让 Skill 绕过 Context Broker 直接读 localStorage/IDB。
- 让 `shared_live` 自动等同于“恋人角色同意/认可咨询结论”。

---

## 6. 探索 App UI 与信息架构

### 6.1 小手机入口

新增独立 App：`探索`（建议 appId：`explore`）。它与 Pop、情景、共创、桌宠分离；用户进入这里是为了主动选择“谁来帮我”，不是管理技术文件。

首页四区：

1. **找 Agent**：关系、生活、创作、游戏、学习、开发等专业 Agent 卡；点击“开始”直接开自然对话；
2. **我的 Agent**：栖机助手、已安装/创建的 Agent、最近 Run、默认会话绑定；
3. **能力库**：每个 Agent 使用哪些 Skills，可添加/移除/停用；
4. **创建与导入**：`描述你想要的 Agent`、`从文件添加`、`导入 Agent 包`。

聊天输入框和栖机助手入口也必须提供轻量“选择 Agent”入口：用户无需先进入探索页才能主动切换专家。

禁止：伪造商店销量、虚构“热门安装量”、未经授权联网下载、把桌宠头像作为每张 Skill 卡图。

### 6.2 创建自己的 Agent：自然语言优先

用户点击“创建 Agent”后只需要表达目的，例如：

```text
我想要一个带世界观、地图和骰子规则的跑团主持人。
我想做一个会记住人物关系和章节大纲的小说总编。
我想做一个帮我每周整理生活并提醒我复盘的 Agent。
```

`Agent Composer` 的步骤：

1. Agent 用至多 3 个高价值问题补足边界（用途、是否需要记忆、是否需要任务）；
2. 推荐已有 Skills，或生成一个草稿 Skill（目标、触发语、方法、状态、可申请工具）；
3. 用户看到一张普通语言 Agent 卡：名称、能做什么、不会做什么、可能读什么、可能提议什么任务；
4. 用户点击“创建”，内部生成 Agent Profile + 私有 Skill Bundle；
5. 所有生成的资源可在“编辑我的 Agent”里用自然语言迭代，并可导出为 `.yueqi-skill`。

不能让 Agent Composer 直接生成/执行任意 JS。复杂游戏与自动化先落在 L1–L3 声明式能力，L4 受签名 Sandbox 约束。

### 6.3 Agent / Skill 详情页

必须展示：

- 名称、图标、作者/来源（内置、从我的文件添加）、版本；
- 用途、非用途、适合的输入示例；
- 读取的数据范围和可能创建的任务；
- Capability 申请与风险等级；
- 隐私标签：`仅本次`、`可读取个人记忆`、`可向角色提议同步`；
- 安装/更新/停用/删除按钮；
- “版本与来源”折叠区。hash、资源文件和完整 Manifest 只在开发者诊断页显示。

### 6.4 启动 Agent 的 Scope Sheet

不能只在安装时授权；每次新 Run 打开 Scope Sheet：会话模式、读记忆、角色可见性、记忆候选目标、Capability grant。高风险动作仍在任务中心逐次审批。

### 6.5 Agent 会话界面

- `isolated_new` / `snapshot_copy`：独立干净消息页，顶部显示 Skill 名、会话模式和“隐私范围”入口。
- `shared_live`：在 Pop 内显示小型来源标签（例如“关系探索”），但消息仍是即时通讯文本，不能变成情景剧幕布。
- 关系探索的“探索地图 / 当前理解”是可展开的侧页，不占用每条消息，不强制逼用户填表。
- 每次出现记忆候选，底部显示简明三选项：`仅本次` / `写入我的记忆` / `同步给星梨`，并可编辑文本。

---

## 7. 首个完整样板：Relationship Intelligence

### 7.1 导入来源和适配

首批用 `F:\skills\relationship-intelligence-skill` 作为**用户自有导入包的测试样本**，但不把其文件复制成第三方商城内容。导入后：

- 读取其 `SKILL.md` frontmatter 和声明资源；
- 载入 `prompts/system.md`、`policies/conversation-policy.md`、`policies/safety-policy.md`；
- 将 working formulation、session state、safety state 映射为该 Skill Run 的 schema；
- 将 evals 转成开发期回归 fixture，不展示给终端用户；
- `disable-model-invocation` 只允许 Host 调用一次用户配置的模型，不允许 Skill 自己再开递归 Agent。

### 7.2 关系探索状态机

```text
ENTRY → WORKING_ALLIANCE → OPEN_NARRATIVE
→ WORKING_FORMULATION ⇄ DISCRIMINATE / SIMULATE
→ DEBRIEF → MODEL_UPDATE → SYNTHESIS → DECISION_SUPPORT

任意节点：SAFETY_OVERRIDE / USER_PAUSE
```

实现要求：

- 连续两次以问题结尾后，下一轮不得再以采集问题结尾；
- 同时仅 1 个主假设和最多 1 个替代假设；
- 主假设 ≥0.5 且可检验时优先模拟；
- 绝不输出诊断、匹配百分比、操控建议、排他性情感绑定；
- 风险信号切换安全流程，并阻止普通恋爱建议覆盖安全提示。

### 7.3 与恋人角色协作的正确行为

用户选择“同步给星梨”后，只同步**用户确认的记忆条目**，而不是咨询原文、假设草稿、风险检查或完整状态机。角色 Prompt 中以：

```text
用户主动确认希望你知道：冷处理会明显降低其安全感。
来源：关系探索（用户于 YYYY-MM-DD 确认同步）。
```

呈现；不得写成“咨询师诊断用户……”。

---

## 8. Agent Runtime 的接线规范

### 8.1 Skill 与 Capability 的分工

| 层 | 负责什么 | 不能做什么 |
|---|---|---|
| Skill | 专业策略、状态机、输出结构、任务建议 | 直接写文件、发送消息、改日历、访问网络 |
| Skill Runtime | 选择资源、组 Prompt、校验输出、生成候选 | 直接信任外部包的脚本或工具名 |
| Agent Runtime | 建任务、审批、执行、暂停、取消、审计 | 自行决定读取/写入私密数据 |
| Capability | 实际受限动作 | 读取未授予目录或未经批准的外部系统 |

### 8.2 任务提议路径

```text
SkillTurn.taskProposals
  → Host 校验 Manifest + Install + Run grant
  → Agent createTaskDraft
  → proposeTask
  → R0/R1 自动执行；R2/R3 进入任务中心精确审批
  → 审计回写到 SkillRun（只存结果摘要）
```

Skill 不得在聊天中声称“我已经保存/发送/安排”，除非对应任务 outcome 已完成。

### 8.3 Agent 助手入口

现有“栖机助手”应升级为默认通用 Agent，并增加以下行为：

1. **主动切换专家**：例如用户说“切到关系探索”，立即打开 Agent Picker/恢复对应 Run；
2. **推荐已安装能力**：例如“用关系探索帮我理清这段关系”，显示自然语言推荐 chip，用户确认后启动 Run；
3. **指导添加/创建**：例如“我想导入一个恋爱咨询 Agent”或“给我做个跑团主持人”，打开探索导入/创建页，而不是假装已经拥有该能力；
4. **组合技能**：用户说“给栖机助手加上生活整理能力”，展示将新增的能力、数据范围和任务权限，确认后更新 Agent Profile。

它不应把所有用户聊天强行路由到 Skill。普通陪伴、恋人聊天和日常任务仍走现有路径。

---

## 9. 分阶段执行顺序

每阶段必须先写红测/负测，再接 UI；任何阶段未通过不得宣称“可用”并跳到后面。

### P0 — 基线审计与冻结

**目标**：确认现有 `src/agent/`、Conversation V2、Context Broker 的真实接口；不写 UI。

实施：

1. 建 `docs/qa/skill-platform/P0/AUDIT.md`，列出现有任务入口、Capability、会话映射、备份模块、权限状态。
2. 明确哪些现有 Agent 测试是合同测试，哪些是浏览器证据。
3. 建 `src/skills/README.md`，写入本计划的核心不可变约束。

验收：审计能追到真实代码；无新 fake skill UI；`npm run build` 绿。

### P1 — Agent Registry、Skill Registry、手机 Sandbox Import

**目标**：用户选 zip/文件夹后，手机/桌面 Host 自动在应用私有 Sandbox 识别并部署为可选择的 Agent；全程不执行外来代码。

实施：

1. 新建 `src/skills/schema.js`、`store.js`、`manifest.js`、`importer.js`、`integrity.js`、`audit.js`，以及 `src/agents/profile-schema.js`、`profile-store.js`。
2. 实现 Android/Capacitor 与桌面 Host 的“选包 → 应用私有临时目录解压 → 扫描 → 校验 → 写入应用仓库 → 清理临时目录”桥接；Web/PWA 保持同样语义的内存/IndexedDB导入路径。
3. 支持 `SKILL.md` 与文本 zip bundle；解析 YAML frontmatter、相对资源和目录结构；标准包自动生成/校验内部 Manifest。
4. 提取入口/资源/触发词，保存原文件 hash；拒绝路径穿越、可执行文件、过大包、无 id/name 包；非标准文本包走 Import Proposal。
5. 安装成功时自动创建同名 Agent Profile；实现把 Skill 加入栖机助手/已有 Agent/新 Agent、启用、停用、升级候选、删除；版本不可静默覆盖。
6. 备份/恢复接入 `src/memory/backup.js`；恢复后 hash 不匹配必须禁用并提示。

验收：

- relationship-intelligence 的真实目录导入成功，资源索引正确；
- Android Host mock 与桌面 Host mock 都证明：zip 仅在应用私有 sandbox 临时解压，成功后临时目录清空；失败后无残留安装；
- 用户不填写任何 JSON/路径即可从完整 relationship-intelligence 文件夹得到“关系探索”Agent 卡；
- 恶意 zip（`../x`、`.js`、超限）拒绝且不写安装记录；
- 同 ID 新版本产生 update candidate，不覆盖运行中版本；
- 导出后导入，catalog / files / grants / disabled 状态数量与 hash 一致；
- 删除只删该 Skill 私有文件与 Run，不删已确认用户记忆。

### P2 — Agent 选择、Scope、SkillRun、Conversation Binding

**目标**：三种会话模式和四个独立授权真实生效。

实施：

1. 新建 `src/skills/run-schema.js`、`run-store.js`、`scopes.js`、`conversation-binding.js`、`src/agents/selection.js`。
2. `isolated_new` 创建独立 Conversation V2 session。
3. `snapshot_copy` 固化 source message IDs/content hash；后续源会话新增消息不可见。
4. `shared_live` 复用 session，写入 `origin/skillId/skillRunId` meta。
5. 把 scopes 传入 ContextRequest；无 grant 不读取相应数据。
6. 支持用户在探索页、聊天输入框、栖机助手中主动选择 Agent；会话可绑定默认 Agent，但不覆盖恋人角色身份。

验收：

- 三个模式各自有真实 Conversation V2 证据；
- snapshot 启动后向源聊天追加内容，Skill Prompt 不得出现；
- shared_live 用户消息只存在一个 Conversation V2 node；
- 关闭 `memoryRead` 后，检索 trace 中不得出现 global/character memory block；
- `characterVisibility:private` 时，角色普通聊天 Prompt 不得出现 Skill state / 私密原文。
- 用户主动切换“关系探索 / 栖机助手 / 我的跑团主持人”后，Router 只加载选中 Agent 的 Skills；切换不丢失各自 Run 状态。

### P3 — Agent Brain、Skill Runtime、Router、结构化输出

**目标**：已安装 Skill 真正改变一次受控模型调用，而非只显示页面。

实施：

1. 新建 `src/skills/runtime.js`、`router.js`、`prompt-loader.js`、`turn-parser.js`、`state-machine.js`。
2. Router 先解析当前选中的 Agent，再从其已启用 Skills 中选择；无主动选择时只在显式启动、固定 Run 或用户确认 chip 后运行，匹配不确定时不自动劫持普通聊天。
3. Runtime 从 Context Broker 获得授权上下文，读取最小 Skill 资源，拼 Host Envelope。
4. 解析 `SkillTurn`；状态/会话/候选原子提交；失败时显示诚实错误态。
5. 按 Manifest/Run grant 过滤 task proposals；接 `createTaskDraft`，保留现有审批。

验收：

- 无已安装匹配 Skill → 普通聊天，trace 无 Skill resources；
- 用户主动选定 Agent → 即使自然语言 trigger 不精确，也必须按该 Agent 的绑定 Skill 工作；
- 有 2 个匹配 → 显示 1–3 推荐，不自动执行；
- 用户选关系探索 → trace 包含其 system/policy/状态，且只一次；
- 无效 JSON、超权限 capability、非法 state patch → 0 状态提交、0 记忆、0 任务；
- 合法 R2 proposal → 进入现有任务中心审批，未批准前不产生副作用；
- 暂停/恢复 Run 后状态 revision 连续，旧回包不能覆盖新状态。

### P4 — 探索 App、Agent 选择、导入与创建 UI

**目标**：用户无需开发者工具即可发现、主动选择、导入、创建、配置和启动 Agent。

实施：

1. 新建 `src/skills/ui/explore-ui.js`、`explore.css`、`skill-detail-ui.js`、`scope-sheet.js`、`skill-session-ui.js`，以及 `src/agents/ui/agent-picker.js`、`agent-composer.js`。
2. 在 `phone-shell` 注册 `explore` App、图标、导航、生命周期；桌宠不参与该界面。
3. 完成找 Agent、我的 Agent、能力库、详情、zip/文件夹导入、升级、停用、删除、Scope Sheet、Run 历史和聊天内 Agent Picker。
4. 完成 Agent Composer：用户用自然语言描述目标 → 生成可编辑的 Agent 草稿 → 选择创建；不得暴露 Manifest/代码编辑器。
5. 中英文文案接 i18n；不能只做中文硬编码。
6. 添加空态、导入失败态、无授权态、模型不可用态、升级冲突态。

验收：

- 390×844、768×1024、1366×768 无横向溢出、无遮挡；
- 关系探索完整路径不需开发者入口：探索 → 从 zip/文件夹添加 → 自动识别 Agent 卡 → 添加 → Scope → 首轮；
- 用户可以从聊天内主动选择一个 Agent，也能用一句话创建“我的跑团主持人”草稿；
- 每项授权在启动前可见，且用户可返回修改；
- 停用后 Router 不推荐且不能新开 Run；已有历史仍可只读；
- 删除二次确认准确列出将删除的 Run 数量和不删除的用户记忆。

### P5 — Relationship Intelligence 正式 Adapter

**目标**：把关系探索包从“导入了文档”变成真正高质量、可验收的对话产品。

实施：

1. 编写 `src/skills/adapters/relationship-intelligence.js`，仅处理该包明确声明的状态/action/schema。
2. 从资源中按需加载 system、conversation/safety policy、schema；不整包每轮注入。
3. 实现 FORMULATE、DISCRIMINATE、SIMULATE、SAFETY_OVERRIDE 的 host validator。
4. 做“探索地图”侧页和阶段总结；不把咨询状态塞进恋人角色卡。
5. 实现逐条记忆候选确认和“同步给指定角色”。

验收：

- 使用包内 ordinary / bias / safety / professional-control fixtures，普通与偏见评分达到包声明门槛；R2/R3/R4 关键案例全部通过；
- 连续两轮问句后，第三轮必须反映/概念化/总结，不能继续问卷；
- 至多一主一备假设；
- 未确认结论不进 global / relationship memory；
- 用户选“同步给星梨”后，角色 Prompt 只看到确认过的简短条目，不看到咨询原文和诊断语言；
- shared_live 下角色能接住用户授权同步的结论，不把 Skill 当成另一个人格抢话。

### P6 — Agent 助手接线、审计、迁移与性能

**目标**：平台级收口，不留第二条绕过路径。

实施：

1. 栖机助手加入“主动切换 Agent / 推荐已安装能力 / 打开探索导入 / 创建 Agent / 向自身添加 Skill”五个受控路由。
2. Skill audit 与 Agent audit 关联 `skillRunId/taskId`。
3. 备份、导出、恢复、数据删除、迁移、版本升级全覆盖。
4. 增加 Inspector：显示本轮启用 Skill、资源、scope、token、Capability proposal、memory candidates；敏感原文默认折叠。
5. 清理旧 demo/样例入口，不得保留“样例三轮”或伪成功文案。

验收：

- 任何 Skill 发起任务都可从任务中心追到 Skill Run；
- 任何记忆候选可追到证据消息、用户同意和目标范围；
- 备份恢复后 100 Run / 50 Skill / 1000 state revision 不串包；
- 禁用/删除/撤销授权立即阻断新读取和新写入；
- 无 Key 时明确提示“需要配置模型”，不播放预制咨询回答。

---

## 10. 质量门与证据要求

### 10.1 自动验证命令（必须新建）

| 命令 | 至少覆盖 |
|---|---|
| `npm run verify:skills:import` | manifest、zip 安全、hash、版本、删除、恢复 |
| `npm run verify:skills:scopes` | 3 会话模式、4 授权、跨角色/跨 run 隔离 |
| `npm run verify:skills:runtime` | router、Prompt 资源、SkillTurn 原子校验、失败不落库 |
| `npm run verify:skills:agent` | capability grant、审批、审计、取消/恢复 |
| `npm run verify:skills:relationship` | 关系探索状态机、安全、问题预算、记忆候选 |
| `npm run e2e:skills` | 真实 Playwright UI 路径、trace/video/screenshot |

禁止把“数组里存在步骤”“页面有按钮”“字符串含 Skill”当成 PASS。每个 verify 必须 import 并调用生产函数，检查持久化结果和负例。

### 10.2 规模与隔离门

| 门 | 指标 |
|---|---|
| Catalog | 100 个 Skill、每个 20 个资源，列表/搜索 P95 ≤150ms Desktop |
| Run 隔离 | 1000 条跨角色/跨 Skill/跨 Scope 查询，0 泄漏 |
| 状态一致性 | 200 次并发旧回包模拟，0 revision 回退 |
| 导入安全 | 100 个 malformed/zip-slip/executable/oversize 包，100% 拒绝且 0 残留 |
| 预算 | 1000 组资源/历史/记忆组合，0 token overflow、0 半截 JSON |
| 备份 | 50 Skill / 100 Run / 1000 state revision 往返后 hash、版本、授权、状态数量一致 |

### 10.3 人工 L3 黄金旅程

必须录屏，并由用户自己验收：

1. 打开小手机 → 探索；
2. 导入 relationship-intelligence 的真实包；
3. 看清权限和安全边界后安装；
4. 以 `snapshot_copy` 启动，确认带入旧聊天但后续源聊天不泄漏；
5. 形成一条工作假设，打开探索地图；
6. 对一条候选选“仅本次”，确认普通恋人聊天看不到；
7. 对另一条候选选“同步给星梨”，确认角色只看到该确认条目；
8. 用 `shared_live` 新开 Run，连续发送两条消息，确认时间线不重复、不串角色；
9. 让 Skill 提议保存笔记，任务中心审批后再确认结果；
10. 停用 Skill，确认助手不再推荐且旧 Run 保持只读；
11. 备份 → 清空测试数据 → 恢复，确认状态/授权/历史正确。

---

## 11. 明确不做与后置项

首发不做：

- 公共联网 Skill 商城、支付、分成、作者结算；
- 任意第三方代码执行、远程脚本、自动 shell；
- 未经审批的邮件发送、日历写入、浏览器操作、账户登录；
- 把咨询 Skill 宣称为心理治疗、诊断或持证咨询；
- 让所有 Skill 自动访问恋人/私人聊天；
- 将桌宠作为探索页的装饰性大头像或情景幕布。

后置条件：只有 P0–P6 L3 全绿后，才讨论创作者上传、签名分发、审核队列、社区发现或官方精选包。

---

## 12. Cursor 执行纪律

1. 先完成 P0 审计并将“现有/缺失/风险”写成证据；不要先造探索 UI。
2. 每个阶段一个独立 commit/验收包，状态只能是 `red`、`implementation_green`、`evidence_green`、`product_review`；禁止自封 `user_accepted`。
3. 每次发现产品语义与本文不符，优先修语义、测试和数据模型，再改 UI。
4. 不复制 `F:\skills` 内的品牌、示例内容或脚本到公开产品；导入流程处理用户授权的文件即可。
5. 不因“有测试”而跳过真实模型/浏览器/真机证据；模型失败必须诚实失败。
6. 未经用户明确确认，不扩大为远程商城、外部 OAuth、支付或执行任意代码。

## 13. 最终放行定义

只有同时满足以下条件，才能从 `Product RED` 升为 `product_review`：

- P0–P6 自动验证全部绿；
- 规模/隔离/安全门全部绿；
- 真实关系探索包完成导入、安装、三模式会话、逐条记忆回流、任务审批的浏览器 E2E trace/video；
- Android 真机完成导入/Scope Sheet/Skill 会话/任务审批手测；
- 用户亲自完成 §10.3 黄金旅程并签字。

在此之前，任何“探索 App 已完成”“Skill Agent 已上线”的说法都不成立。
