# 月栖统一记忆、功能数据与企业上下文实施计划

> 版本：v1.0  
> 日期：2026-08-08  
> 执行对象：Cursor  
> 仓库：F:\beautiful  
> 状态：实施合同，不是概念草案  
> 上游合同：
> - docs/architecture/DATA_OWNERSHIP_MATRIX.md
> - docs/architecture/MEMORY_PIPELINE_CONTRACT.md
> - docs/architecture/MULTI_COMPANION_MEMORY_CONTRACT.md
> - docs/CONTEXT_PIPELINE_ENTERPRISE_EXECUTION_PLAN.md
> - docs/TEMPORAL_RELATIONSHIP_AUTOMATION_MEMORY_UNIFICATION_PLAN.md

---

## 0. Cursor 执行规则

本文只收敛记忆、功能数据和 Prompt 上下文，不重做 UI，不更换技术栈，不重建 Conversation V2、Timeline、Candidate Ledger、Stable Memory 或 Context Broker。

开工前必须：

1. 完整阅读本文与五份上游合同。
2. 记录当前 HEAD 和 git status --short。
3. 当前工作树有大量用户修改，禁止 reset、checkout、clean、批量格式化或覆盖无关文件。
4. 先核对本文提到的文件和函数是否仍存在；若 Cursor 已实现部分波次，在交付记录中标注“已存在并复核”，不要重复实现。
5. 每次只执行一个波次；波次测试通过、证据齐全后才能进入下一波。
6. 禁止用“文件存在”“构建成功”代替行为验收。
7. 所有迁移必须幂等；同一迁移运行三次不得重复生成 Timeline、Stable Memory、Context Graph 或 MemPalace 记录。
8. 所有新写入必须冻结 userId、companionId、relationshipId、realityNamespace 和 sourceRef；禁止运行中读取当前 UI 角色补作用域。
9. 普通聊天继续走 Conversation V2 + Context Broker；不得引入新的聊天历史库或新的 Prompt assembler。
10. 本计划完成前，旧链只能通过 feature flag 保留为回滚路径，不能继续扩展功能。

推荐每个波次一个独立提交。提交信息必须带波次编号，例如 memory-m3: unify listening and reading projections。

---

## 1. 结论：现在还缺什么

月栖已经拥有主要组件，但没有完全形成一条可证明的主链。缺口不是“再做一种记忆”，而是以下十项收敛工作。

### 1.1 权威仍未完全落实

- Conversation V2 已是对话权威。
- TimelineEvent V1 已是事件权威。
- Candidate Ledger 和 Stable Memory 已有合同。
- 但日记仍直接使用 MemPalace memories 记录作为业务原件。
- Context Graph 仍可被聊天、情景剧和 consolidation 直接写入 accepted 项。
- Calendar 的真实业务事件和聊天提取出的 schedule_commitment 仍是两套对象。

### 1.2 MemPalace 同时扮演业务库和索引

当前 diary.memory、book.chunk 等记录直接存进 memories，再被 MemPalace 搜索。这样删除索引可能删除业务原文，无法满足“索引可删除重建”。

### 1.3 Prompt 仍有两个召回入口

src/prompt/assemble.js 先直接 searchPalace/searchMemories，再调用 Context Broker。Broker 又查询 Context Graph、Stable Memory、Timeline 和其他投影。同一事实可能重复进入 Prompt。

### 1.4 同一事件存在多份可变副本

appendCohabitEvent 当前先写 Canonical Timeline，再写 cohabit localStorage 投影，还可能同步 Life。迁移阶段可以双跑，正式态必须只有 Timeline 是事件事实，其他记录只能通过 sourceEventId 回源。

### 1.5 功能没有统一的 Memory Adapter

日记、听歌、读书、商城、情景剧、Life 各自决定写什么、如何去重、是否进入长期记忆。缺少统一的写入协议、重要性规则、删除传播和重建入口。

### 1.6 “发生过”与“理解了”仍会混淆

“一起听过一首歌”属于 Timeline；“这首歌对用户非常重要”属于候选理解；“用户明确把它当作两人的歌”才可能进入 Stable Memory。当前部分路径会直接把事件摘要写 Context Graph。

### 1.7 现实与虚构隔离不完整

情景剧已有 shared_fiction namespace，但 scenario-memory-bridge 仍直接生成 Context Graph 项和旧关系数值候选。必须保证虚构经历不会晋升为 reality Stable Memory。

### 1.8 删除、纠正和遗忘没有端到端传播

删除日记、取消日历、纠正偏好、忘记稳定记忆后，Context Graph、MemPalace、KG、缓存和 Prompt 必须同步失效。目前没有统一 Source Tombstone 和重建验证。

### 1.9 缺少跨功能可解释召回

Context Inspector 能记录部分来源，但还不能完整回答：

- 这句回复为什么读取了这篇日记？
- 为什么读取了这次听歌而没有读取另一次？
- 这条 Stable Memory 来自哪些证据？
- 同一信息是否从 Palace 和 Graph 重复注入？

### 1.10 缺少商业产品级迁移和质量门

必须支持旧用户数据迁移、多角色隔离、备份恢复、离线启动、跨设备同步预留、索引损坏后重建和低端安卓性能预算。

---

## 2. 非目标

本计划不做：

- 不把所有 App 数据转换成聊天消息。
- 不把所有 App 数据直接塞进 Prompt。
- 不让 MemPalace 成为新的事实数据库。
- 不让 Context Graph 成为 Stable Memory 的平行权威。
- 不把每次播放、滚动、点击都记成长期经历。
- 不让模型自行修改 Calendar、Task、Stable Memory 或角色设定。
- 不把 shared_fiction 自动复制进 reality。
- 不在普通聊天热路径运行 OpenClaw。
- 不以亲密度、信任、张力数值作为普通关系记忆。
- 不重做日记、日历、听歌、读书或情景剧 UI。

---

## 3. 统一概念

Cursor 在代码、测试和文档中统一使用以下术语。

### 3.1 Source of Truth

功能原始数据。只有所属 Repository 可以修改。

例：

- Conversation V2：聊天原文。
- Diary Repository：日记原文和版本。
- Calendar Repository：准确日程。
- Media/Listen Store：曲目、播放状态和进度。
- Library/Reader Store：图书、章节、阅读进度和摘录。
- Experience Repository：情景剧会话、分支和结局。
- Life Repository：DayPack 和观察记录。

### 3.2 Canonical Event

已经发生、可以放进共同时间线的事实。唯一权威为 TimelineEvent V1。

它回答“什么时候发生了什么”，不保存完整文档。

### 3.3 Understanding Candidate

对用户、角色或关系的可能理解，尚未成为长期事实。

例：

- 用户可能偏爱安静陪伴。
- 某首歌可能有关系意义。
- 用户可能不喜欢临时改变计划。

### 3.4 Stable Memory

经过明确陈述、重复证据、人工确认或高置信规则晋升的长期理解。

它回答“角色真正稳定地了解什么”。

### 3.5 Context Graph

结构化检索投影，表达实体、关系、目标、偏好和事件之间的联系。它必须可从 Stable Memory、Timeline 和业务来源重建，不再接受无来源的事实写入。

### 3.6 MemPalace

文本与媒体的检索索引。保留分块、BM25、向量、邻居、Closet 和 KG 能力，但每条记录必须能回到权威来源。

### 3.7 Context Envelope

当前一次模型调用使用的临时资料包。由 Context Broker 按 purpose、token budget、权限、时间和相关性生成。它不作为新记忆保存。

---

## 4. 最终架构

~~~mermaid
flowchart TD
  CHAT["Conversation V2"]
  DIARY["Diary Repository"]
  CAL["Calendar Repository"]
  MEDIA["Media / Listen / Reader"]
  EXP["Experience Repository"]
  LIFE["Life Repository"]

  CHAT --> EVENT["Timeline Command Service"]
  DIARY --> EVENT
  CAL --> EVENT
  MEDIA --> EVENT
  EXP --> EVENT
  LIFE --> EVENT

  CHAT --> UNDERSTAND["Understanding Pipeline"]
  DIARY --> UNDERSTAND
  CAL --> UNDERSTAND
  MEDIA --> UNDERSTAND
  EXP --> UNDERSTAND

  UNDERSTAND --> CANDIDATE["Candidate Ledger"]
  CANDIDATE --> STABLE["Stable Memory"]

  EVENT --> GRAPH["Context Graph Projection"]
  STABLE --> GRAPH
  DIARY --> PALACE["MemPalace Index"]
  MEDIA --> PALACE
  EVENT --> PALACE
  STABLE --> PALACE

  CHAT --> BROKER["Context Broker"]
  EVENT --> BROKER
  STABLE --> BROKER
  GRAPH --> BROKER
  PALACE --> BROKER
  CAL --> BROKER
  LIFE --> BROKER

  BROKER --> ENVELOPE["Context Envelope"]
  ENVELOPE --> MODEL["Model Call"]
~~~

核心原则：

1. 原件只保存一次。
2. 事件只由 TimelineEvent V1 表达。
3. 长期理解只由 Stable Memory 表达。
4. Context Graph 和 MemPalace 都是可重建投影。
5. Context Broker 是唯一 Prompt 召回入口。

---

## 5. 权威矩阵

| 数据 | 唯一权威 | 允许的投影 | 禁止行为 |
|------|----------|------------|----------|
| 普通聊天原文 | Conversation V2 | Branch Summary、Palace 可选摘要 | IDB messages 独立成功 |
| 情景剧对话 | Conversation V2 scenario branch | Experience transcript view | 混入普通 DM |
| 日记原文 | Diary Repository | Artifact、Palace chunks | Palace 记录作为唯一日记 |
| 日历事件 | Calendar Repository | TodayContext、Timeline lifecycle event | 用 Timeline 摘要替代准确日历 |
| 待办/任务 | Unified Task Repository | Timeline lifecycle event | 新建另一套 task localStorage |
| 听歌状态 | Media/Listen Store | Timeline meaningful event | 每个 progress tick 写 Timeline |
| 阅读状态 | Reader Store | Timeline meaningful event、Palace book chunks | 把整本书当关系记忆 |
| 情景剧状态 | Experience Repository | Finale Event、Palace fiction index | 自动晋升现实 Stable |
| 角色日常 | Life Repository | permission-filtered prompt view | 将 privateFacts 全量注入 |
| 共同经历 | Relationship Timeline | Cohabit/UI/Palace/Graph projection | 投影反写同义事件 |
| 候选理解 | Candidate Ledger | 审核 UI、Graph candidate view | 直接当稳定事实 |
| 稳定理解 | Stable Memory | Graph/Palace index | Context Graph 独立修改 |
| 文本检索 | MemPalace | 无 | 拥有业务原文 |
| Prompt 上下文 | Context Envelope | Inspector trace | 保存为新事实 |

---

## 6. 新合同

### 6.1 SourceRef V1

新增 src/contracts/source-ref-v1.js。

~~~text
SourceRefV1 {
  schemaVersion: 1
  sourceType:
    conversation_turn |
    diary |
    calendar_event |
    unified_task |
    media_track |
    listening_session |
    book |
    book_chunk |
    reading_session |
    experience_session |
    life_event |
    timeline_event |
    stable_memory |
    artifact
  sourceId: string
  sourceVersion: number
  companionId: string
  relationshipId: string
  userId: string
  realityNamespace: reality | shared_fiction | simulation | creative_work
  occurredAt: ISO string
  visibility: shared | private | sensitive | forbidden
  contentHash: string
}
~~~

要求：

- 所有投影必须包含完整 sourceRef。
- sourceId + sourceVersion + projectionKind 构成幂等键。
- 原件更新后 sourceVersion 增加，旧投影标 stale。
- 原件删除后发布 tombstone，所有投影停止召回。

### 6.2 MemoryIndexEntry V1

新增 src/contracts/memory-index-entry-v1.js。

~~~text
MemoryIndexEntryV1 {
  schemaVersion: 1
  indexId: string
  sourceRef: SourceRefV1
  projectionKind: palace_text | palace_chunk | graph_node | graph_edge | kg_fact
  title: string
  text: string
  summary: string
  tags: string[]
  wing: string
  room: string
  embeddingVersion: string
  projectionVersion: number
  indexedAt: ISO string
  stale: boolean
  tombstone: object | null
}
~~~

禁止在该对象中保存业务可编辑状态。用户编辑日记必须更新 Diary Repository，再重新投影。

### 6.3 FeatureMemoryAdapter

新增 src/memory/adapters/contract.js。

每个功能适配器暴露：

~~~text
getSourceRef(change)
emitTimelineEvents(change, scope)
submitUnderstandingCandidates(change, scope)
buildIndexDocuments(change, scope)
handleSourceTombstone(change, scope)
rebuildForSource(sourceId, scope)
~~~

适配器只翻译，不拥有状态。

### 6.4 Projection Outbox V1

新增 src/projections/outbox.js 和 src/projections/worker.js。

业务写入成功后，把投影任务放入 outbox：

~~~text
ProjectionJob {
  jobId
  sourceRef
  operations: timeline | candidate | palace | graph | delivery
  status: pending | running | complete | failed | dead
  attempts
  nextAttemptAt
  lastError
}
~~~

要求：

- 原件写入不等待 embedding。
- Timeline 和 Candidate 可同步或快速本地完成。
- Palace embedding、KG 和批量分块异步执行。
- 启动时只恢复未完成任务，不全量重建。
- 连续失败进入 dead letter，可在设置/诊断页查看。

### 6.5 Context Provenance V1

扩展 Context Envelope provenance：

~~~text
{
  blockId
  sourceRef
  authority
  retrievalEngine
  score
  reasons[]
  tokens
  truncated
  dedupKey
  privacyDecision
}
~~~

每个注入块必须可解释和可追溯。

---

## 7. 统一写入主链

任何功能完成一次写入后遵循：

~~~text
1. 写业务权威 Repository
2. 返回 sourceRef
3. 创建 ProjectionJob
4. Adapter 判断是否值得生成 TimelineEvent
5. Adapter 判断是否生成 UnderstandingCandidate
6. 投影到 Context Graph / MemPalace
7. 通知或 Artifact Delivery 读取业务原件
8. Context Broker 下次请求按需召回
~~~

### 7.1 重要性规则

不要记录：

- 普通页面打开。
- 进度条每次变化。
- 同一首歌重复暂停。
- 书页每次滚动。
- 情景剧每一句台词。
- 用户撤销前的临时输入。

可以记录为 Timeline：

- 首次共同播放。
- 一次共同播放完成。
- 明确收藏、分享或标记为关系歌曲。
- 完成一本书或重要章节。
- 保存一段摘录并告诉角色。
- 创建、修改、完成、取消日历或任务。
- 日记生成完成、用户阅读或主动分享。
- 情景剧谢幕、共同选择的重要分支。

可以产生 Candidate：

- 用户明确表达偏好、边界、身份事实。
- 同一偏好多次出现。
- 用户明确说“记住”。
- 用户纠正角色。
- 一个事件被用户赋予长期关系意义。

不得产生 Candidate：

- 仅角色自己说出的推测。
- 情景剧角色台词。
- 单次播放或单次点击。
- 联网搜索结果。
- 模型为了完成日记而生成的文学描述。

---

## 8. 逐功能实现

### 8.1 普通聊天

权威：Conversation V2。

写入：

- 用户和角色消息先写 Conversation V2。
- TurnUnderstanding 只生成 Timeline proposal、Action proposal 和 Candidate proposal。
- 明确用户陈述可提交 Candidate，不能直接写 Stable。
- Branch Summary 只压缩被截断的历史，不产生新事实。

召回：

- 最近原文。
- 当前 branch summary。
- TodayContext。
- 相关 Stable Memory。
- 相关开放约定和少量 Timeline。
- 必要时 MemPalace 文档。

删除：

- 删除会话不自动删除已经确认的 Stable Memory。
- Stable Memory 必须保留 evidenceRef；用户可单独忘记。

修改：

- src/panels/chat.js
- src/conversation/companion-write.js
- src/context/branch-summary.js
- src/turn-understanding/**
- src/memory/candidate-ledger.js

### 8.2 日记

新增 Diary Repository，不能继续把 memories 作为日记原件。

新增：

- src/diary/repository.js
- src/diary/schema.js
- src/memory/adapters/diary.js

DiaryRecord V1 至少包含：

- diaryId、companionId、relationshipId、diaryDay。
- title、body、styleId、revision。
- generatedFromRefs。
- visibility、createdAt、updatedAt、deletedAt。

保存流程：

1. Diary Repository 保存原文。
2. Artifact 保存 diaryId 和 deep link，不复制可编辑原文。
3. Timeline 写 diary.created 或 diary.updated 摘要。
4. MemPalace 为正文建立 chunks。
5. 只有用户明确表达或多证据支持的内容进入 Candidate。
6. 通知从 Artifact Delivery 产生，不通过 Prompt 假装角色知道。

迁移：

- 扫描 memories 中 source=diary.memory。
- 以 id/diaryDay/companionId 幂等导入 Diary Repository。
- 为旧记录建立 sourceRef。
- 保留旧 Palace 记录为 legacy projection，shadow compare 通过后删除。

### 8.3 日历与待办

权威：

- Calendar Repository 保存日历。
- Unified Task Repository 保存待办和任务。

聊天提及处理：

- “明天下午答辩”只形成 ActionProposal。
- 未确认时不得写 Calendar。
- 用户明确命令且信息完整时，按风险策略执行。
- 执行成功后写 Timeline lifecycle event。

Timeline 事件：

- calendar.created
- calendar.updated
- calendar.completed
- calendar.cancelled
- task.created
- task.completed
- task.cancelled

TodayContext 直接读取 Calendar/Task 权威，不通过 MemPalace。

Stable Memory 只保存长期偏好，例如“重要事件提前一天提醒”，不保存每个日程。

修改：

- src/calendar/**
- src/agent/capabilities/local-calendar-store.js
- src/agent/capabilities/calendar-crud.js
- src/calendar/calendar-task-dispatch.js
- src/temporal/today-context.js
- src/memory/adapters/calendar.js
- src/memory/adapters/task.js

### 8.4 听歌

权威：Media/Listen Store。

Timeline：

- listen.started 仅首次或跨会话开始。
- listen.completed。
- listen.shared。
- listen.favorited。
- listen.relationship_marked。

不得为 pause、seek、progress tick 写事件。

Candidate：

- 用户明确说喜欢/讨厌某种音乐。
- 同一风格有多次独立证据。
- 用户明确把歌曲定义为共同关系符号。

MemPalace：

- 可索引曲目元数据、歌词摘要和用户笔记。
- 不索引每次播放状态。

修改：

- src/phone-shell/phone-listen.js
- src/library/co-listen.js
- src/library/recent-plays.js
- src/memory/adapters/listen.js

### 8.5 读书

权威：

- Library Store 保存书籍和媒体引用。
- Reader Store 保存章节、进度和用户摘录。

MemPalace：

- book.chunk 作为知识检索投影。
- 每个 chunk 必须有 bookId、chapterId、sourceVersion。
- 删除书籍必须级联 tombstone chunks。

Timeline：

- reading.started。
- reading.chapter_completed。
- reading.completed。
- reading.quote_saved。
- reading.shared_with_companion。

Stable Memory：

- 用户明确或重复表达的阅读偏好。
- 对用户长期重要的作品或摘录。

禁止把整本书内容当作用户记忆。

修改：

- src/library/books.js
- src/library/books-import.js
- src/library/book-reader.js
- src/phone-shell/phone-reader.js
- src/memory/adapters/reading.js

### 8.6 情景剧

权威：

- Experience Repository 保存 session state。
- Conversation V2 scenario branch 保存台词。

namespace：

- 情景剧默认 shared_fiction。
- 不得读取 reality 中的敏感记忆，除非 purpose policy 明确允许。
- shared_fiction Candidate 永远不能自动晋升 reality Stable。

谢幕流程：

1. 写 experience.completed TimelineEvent，namespace=shared_fiction。
2. 生成一份 finale summary Artifact 或 Experience Summary。
3. 为 summary 建 Palace fiction index。
4. 可生成 shared_fiction Candidate。
5. 只有用户明确说“现实中也请记住……”时，另建 reality Candidate。

移除普通关系对 intimacy/trust/tension delta 的依赖；情景剧内部游戏状态可留在 Experience Repository，不能写普通关系。

修改：

- src/experience/**
- src/scenario/player/player-ui.js
- src/companion/scenario-memory-bridge.js
- src/memory/adapters/scenario.js

### 8.7 Life / DayPack

权威：Life Repository。

规则：

- DayPack 是角色当天生活的源数据，不是用户记忆。
- private 事件永不进入普通 Prompt。
- discoverable 事件只有用户观察后才可使用。
- shared 事件可进入有限摘要。
- Observation 只记录用户看到什么，不自动代表用户喜欢。

Timeline：

- 只投影对关系有意义的 shared 事件。
- 不把整个 DayPack 复制到 Timeline。

MemPalace：

- 仅索引已允许发现或 shared 的证据。
- privateFacts 禁止 embedding、KG 和搜索。

修改：

- src/life/**
- src/memory/adapters/life.js

### 8.8 朋友圈、商城、相册、游戏和其他功能

统一原则：

- 业务结果留在业务 Repository。
- 购买、赠礼、共同游戏完成等重要结果写 Timeline。
- 内容正文按需建立 Palace 索引。
- 用户偏好只走 Candidate。
- 金额、订单状态和游戏存档不写 Stable Memory。

需要建立 adapter registry，未注册的功能禁止自行调用 appendCohabitEvent、ingestCandidate 或 fileDrawer。

---

## 9. Context Graph 与 MemPalace 的分工

### 9.1 Context Graph

用于结构化关系：

- 用户 -> 喜欢 -> 安静陪伴。
- 用户 -> 正在推进 -> 答辩。
- 关系 -> 共同经历 -> 某次听歌。
- Stable Memory -> evidence -> TimelineEvent。

Graph 节点必须引用 Stable Memory、Timeline 或业务 sourceRef。禁止模型直接创建无来源 accepted node。

### 9.2 MemPalace

用于文本和媒体检索：

- 日记正文。
- 书籍分块。
- 摘录。
- 情景剧摘要。
- 稳定记忆文本。
- 重要 Timeline 摘要。

Palace 命中后必须回源校验：

1. sourceRef 存在。
2. sourceVersion 一致。
3. source 未删除。
4. companionId/relationshipId/namespace 匹配。
5. visibility 满足当前 purpose。

任何一项失败，命中进入 redactions，不注入 Prompt，并排队 stale cleanup。

### 9.3 KG

- KG 只能从已授权、带 sourceRef 的索引提取。
- 每条 KG fact 必须携带 sourceRef 和 projectionVersion。
- 删除或修订原件时 invalidateKgFacts。
- 不允许全局 KG 在 Companion Prompt 中无作用域召回。

---

## 10. Context Broker 单入口

完成后，src/prompt/assemble.js 不再直接调用 searchPalace/searchMemories。

流程：

1. assemblePrompt 构造 ContextRequest。
2. Context Broker 根据 purpose policy 选择数据源。
3. Broker 内部调用统一 Retrieval Coordinator。
4. Coordinator 召回 Stable、Timeline、Graph、Palace、Calendar、Life。
5. Deduper 根据 sourceRef/dedupKey 合并。
6. Budgeter 分配 token。
7. Envelope 记录 provenance。
8. assemblePrompt 只把 Envelope 转为 canonical blocks。

### 10.1 Purpose 策略

| Purpose | 必选 | 条件召回 | 禁止 |
|---------|------|----------|------|
| chat | recent V2、branch summary、TodayContext、open commitments | Stable、Timeline、Palace | 全量日记/书籍 |
| deskpet | TodayContext、少量最近事件 | Stable、open commitments | 长历史和大文档 |
| proactive | TodayContext、待跟进事项 | 高置信 Stable、最近关键事件 | private Palace、宽泛回忆 |
| diary | 当日聊天摘要、当日 Timeline、Life shared | 相关 Stable、Moments | Worldbook、无关历史 |
| scenario | scenario branch、Experience state、Worldbook | shared_fiction Palace | reality sensitive memory |
| reading | 当前书/章/进度 | book chunks、相关摘录 | 无关关系历史 |
| listening | 当前曲目/会话 | 相关共同经历 | 宽泛 Palace |
| calendar | 时间快照、Calendar/Task | 长期提醒偏好 | 日记正文 |
| cocreate | project session、Worldbook | creative_work artifacts | 私密关系记忆 |

### 10.2 去重顺序

同一 sourceRef 出现多个投影时：

1. Stable Memory 文本优先表达长期结论。
2. Timeline 表达发生时间。
3. Palace 只补充原文片段。
4. Context Graph 只补充关系结构。
5. 同一 sourceRef 不得在最终 Envelope 中出现两个近义自然语言块。

### 10.3 Token 预算

以 balanced 8k 为例：

- Platform + Character：最多 1900。
- TodayContext + relationship continuity：最多 700。
- Recent history：最多 3000。
- Branch Summary：最多 500。
- Stable Memory：最多 500。
- Timeline/open commitments：最多 450。
- Palace document snippets：最多 500。
- Worldbook：最多 700。
- 输出预留：至少 1800。

预算不足时淘汰顺序：

1. 低相关 Palace。
2. 低重要 Timeline。
3. Context Graph 补充关系。
4. 较旧 Branch Summary 段。

不得淘汰：

- Platform safety。
- Character contract。
- 当前输入。
- TodayContext 中的准确时间。
- 当前日历命令涉及的目标事件。

---

## 11. 检索排序

统一 RetrievalScore：

~~~text
score =
  semanticRelevance
  + sourceAuthority
  + temporalRelevance
  + explicitUserIntent
  + relationshipRelevance
  + importance
  + pinnedBoost
  - duplicationPenalty
  - stalenessPenalty
  - privacyRiskPenalty
~~~

建议权重：

- 明确 ID/sourceRef 命中：+5。
- 当前任务实体命中：+4。
- 用户问“还记得”：+3。
- Stable Memory：+2.5。
- 开放承诺：+2.5。
- 30 天内关键 Timeline：+1.5。
- 普通 Palace 文档：+0.5 到 +1.5。
- projection stale：直接过滤。
- namespace 不匹配：直接过滤。
- companion 不匹配：直接过滤并记录 isolation alert。

召回不是越多越好。普通聊天最终隐式记忆块目标为 4 到 8 条。

---

## 12. 删除、纠正与遗忘

### 12.1 删除原件

删除日记、书籍、情景剧或媒体：

1. Repository 写 tombstone。
2. 发布 SourceTombstoned。
3. Palace chunks 标 stale/tombstone。
4. Graph 节点和 KG fact 失效。
5. Timeline 历史事件默认保留，但 payload 不得继续引用已删除正文；根据隐私删除请求可级联 tombstone。
6. Context Broker 立即停止召回。

### 12.2 纠正用户理解

用户说“我不是讨厌开会，我是不喜欢没有结论的会”：

1. 旧 Candidate corrected。
2. 旧 Stable tombstone 或 superseded。
3. 新 Candidate userStated=true。
4. 新 Stable 经受控晋升。
5. Graph/Palace 增量更新。
6. Inspector 显示 supersedes 链。

### 12.3 忘记

用户要求忘记时：

- Stable 和 Candidate 必须 tombstone。
- Palace/Graph/KG 投影删除。
- Conversation 原文是否删除由用户单独选择。
- 后续 consolidation 不得从未删除的旧聊天再次恢复被忘记事实；需要维护 suppression fingerprint。

新增 src/memory/suppression-ledger.js。

---

## 13. 迁移方案

### 13.1 Legacy Census

扩展 src/memory/palace/legacy-census.js，生成：

- diary.memory 数量。
- book.chunk 数量。
- chat.memory 数量。
- worldbook.memory 数量。
- legacy_unscoped 数量。
- 缺 companionId/sourceRef 数量。
- 重复 drawerId/contentHash 数量。
- orphan KG 数量。

输出 docs/qa/unified-memory/M0/LEGACY_CENSUS.json。

### 13.2 Shadow Projection

新旧链同时读取，但只把新链结果用于诊断：

- 比较 topK 命中。
- 比较重复率。
- 比较 token。
- 比较跨角色泄漏。
- 比较删除后残留。

不能直接切换生产结果。

### 13.3 数据回填

- 日记：memories -> Diary Repository -> new Palace projection。
- 书籍：book.chunk 补 sourceRef；无法回源的标 legacy_orphan。
- Context Graph：有明确 sourceRef 的转投影；无来源 accepted 项降级 legacy_unverified。
- Cohabit：根据 sourceEventId 绑定 Timeline；缺失 sourceEventId 的旧行迁移或 quarantine。
- Scenario：补 shared_fiction namespace。
- Stable：补 userId、relationshipId 和 evidenceRefs。

### 13.4 三次幂等

每个迁移脚本必须连续运行三次，并证明：

- 记录总数不继续增加。
- 同一 idempotencyKey 只有一条。
- 同一 sourceRef/projectionKind 只有一个当前版本。
- tombstone 不复活。

---

## 14. Feature Flags

新增或复用：

- unifiedMemoryAdaptersV1
- memoryProjectionOutboxV1
- diaryRepositoryV1
- palaceProjectionOnlyV1
- contextGraphProjectionOnlyV1
- singleBrokerRetrievalV1
- unifiedMemoryForgetV1

切换顺序：

1. adapters shadow。
2. outbox shadow。
3. diary dual-read/new-write。
4. Palace source validation on。
5. Broker shadow compare。
6. single broker on。
7. projection-only on。
8. legacy writers off。

回滚只能关闭新读路径，不能回滚已经正确写入的权威数据。

---

## 15. 实现波次

### M0：基线与冻结

目标：证明当前状态，不改行为。

工作：

- 运行现有 memory/context/timeline/multi-companion 测试。
- 生成 Legacy Census。
- 列出所有 direct fileDrawer、ingestCandidate、putItem、appendCohabitEvent、searchPalace 调用点。
- 建立 feature flag。
- 记录普通聊天一次 Prompt Envelope 的重复 source 列表。

通过条件：

- 所有直接写入点有表格。
- 现有失败基线被记录，不伪装通过。
- 无产品逻辑修改。

### M1：SourceRef 与投影基础设施

目标：所有新投影可回源。

工作：

- 实现 SourceRef V1、MemoryIndexEntry V1。
- 实现 Projection Outbox、Worker、Registry。
- Palace normalizeMemory 支持 sourceRef、projectionKind、projectionVersion、stale、tombstone。
- Context Inspector 展示 sourceRef。
- 不切换现有读取。

通过条件：

- 同一 sourceRef 重复排队只生成一份投影。
- sourceVersion 更新后旧投影失效。
- 多角色写入完全隔离。

### M2：日记权威迁移

目标：日记不再依赖 Palace 作为原件。

工作：

- 新建 Diary Repository。
- saveDiary 先写 Repository。
- Artifact、Timeline、Candidate、Palace 全部经 diary adapter。
- 实现旧 diary.memory 迁移。
- 日记 UI dual-read，优先 Repository。

通过条件：

- 删除全部 Palace 索引后日记仍可完整打开。
- rebuild 后搜索恢复。
- 编辑日记只产生新 sourceVersion，不重复创建日记。
- 通知和 deep link 正常。

### M3：听歌与读书

目标：媒体状态、经历、偏好和文档索引分层。

工作：

- listen/reading adapter。
- 合并高频 play/dwell 事件。
- book.chunk 补 sourceRef。
- 删除书籍级联索引。
- 明确偏好进入 Candidate，不直接 Graph。

通过条件：

- 100 次 seek 不生成 100 条 Timeline。
- 同一播放会话只生成合理生命周期事件。
- 删除书后搜索不到其 chunk。
- 普通聊天只有相关问题才召回书籍正文。

### M4：日历与任务

目标：聊天计划和真实日历闭环。

工作：

- Calendar Repository/Unified Task 成为唯一状态。
- TurnUnderstanding 只生成 ActionProposal。
- 执行成功后 adapter 写 lifecycle Timeline。
- TodayContext 直接读取 Repository。
- 提醒偏好进入 Candidate。

通过条件：

- “明天可能答辩”不自动建日历。
- “帮我建明天下午三点答辩”按策略确认并落库。
- 修改/取消后 TodayContext 立即更新。
- Timeline 与 Calendar 通过 sourceRef 对齐。

### M5：情景剧与 Life

目标：虚构隔离和角色生活隐私正确。

工作：

- scenario adapter。
- finale summary 单一写入。
- 移除普通关系数值写回。
- Life shared/discoverable/private 投影规则。
- privateFacts 禁止进入 Palace/KG。

通过条件：

- 情景剧台词不成为现实 Stable。
- 情景剧结束只生成一个 finale canonical event。
- 未观察的 discoverable Life 不进入 Prompt。
- privateFacts 全链路零泄漏。

### M6：Candidate、Stable 与 Context Graph 收敛

目标：长期理解只有 Candidate -> Stable 一条路。

工作：

- 禁止 chat/scenario/consolidator 直接写 accepted Context Graph 事实。
- Candidate promotion 后触发 Graph/Palace projection。
- Graph 变成只读投影。
- 实现纠正、supersede、forget 和 suppression。

通过条件：

- 单次模型推测不能晋升 Stable。
- shared_fiction 永远不能自动晋升 reality。
- 用户纠正后旧事实不再召回。
- 被忘记事实不会从旧聊天 consolidation 复活。

### M7：MemPalace 投影化

目标：Palace 可以完全删除重建。

工作：

- 所有 Palace 写入改由 projection worker。
- fileDrawer 降为内部 projector API；业务模块禁止直接调用。
- 实现 full rebuild、incremental rebuild、stale cleanup。
- KG source lineage。
- legacy orphan quarantine。

通过条件：

- 删除 Palace memories/KG 后能从权威源重建。
- 重建前后 topK golden query 结果满足阈值。
- 被删除/无来源记录召回率为零。

### M8：Context Broker 单入口

目标：取消 Prompt 双召回。

工作：

- 新建 Retrieval Coordinator。
- Broker 统一查询和去重。
- assemblePrompt 删除 direct searchPalace/searchMemories。
- purpose policy 扩展 reading/listening/calendar。
- 完整 provenance 和 budget trace。

通过条件：

- assemblePrompt 不再直接搜索任何记忆库。
- 同一 sourceRef 最终 Envelope 只出现一次。
- chat/diary/scenario/proactive 使用不同来源策略。
- 8k 上下文严格不超预算。

### M9：旧链关闭与迁移

目标：正式停止平行写入。

工作：

- 关闭 direct Context Graph writes。
- 关闭业务 direct fileDrawer。
- Cohabit 改为 Timeline projection-only。
- Life 不再接收同义事件副本，改按 sourceEventId 投影。
- 旧 localStorage 只读迁移后冻结。
- 备份格式升级。

通过条件：

- 静态扫描无禁止调用。
- 三次迁移幂等。
- 旧备份可恢复。
- 新备份恢复后索引可重建。

### M10：产品验收

目标：真实产品链路验收。

场景：

1. 聊天明确偏好，第二次聊天正确使用。
2. 写日记，角色收到 Artifact 通知，询问日记时可检索。
3. 删除日记，搜索和 Prompt 立即失效。
4. 一起听歌，Timeline 记录；普通闲聊不强行提歌。
5. 读书并保存摘录，询问时召回正确章节。
6. 聊天创建日历，次日 TodayContext 正确。
7. 情景剧谢幕后保留虚构经历，但现实聊天不当真。
8. 用户纠正偏好后旧偏好不再出现。
9. 切换角色时所有结果隔离。
10. 清空并重建 Palace 后行为一致。

必须在浏览器和 Android 真机各完成一次。

---

## 16. 文件级路径

### 新增

- src/contracts/source-ref-v1.js
- src/contracts/memory-index-entry-v1.js
- src/projections/outbox.js
- src/projections/worker.js
- src/projections/registry.js
- src/projections/rebuild.js
- src/memory/adapters/contract.js
- src/memory/adapters/registry.js
- src/memory/adapters/chat.js
- src/memory/adapters/diary.js
- src/memory/adapters/calendar.js
- src/memory/adapters/task.js
- src/memory/adapters/listen.js
- src/memory/adapters/reading.js
- src/memory/adapters/scenario.js
- src/memory/adapters/life.js
- src/memory/adapters/commerce.js
- src/memory/adapters/game.js
- src/memory/suppression-ledger.js
- src/context/retrieval-coordinator.js
- src/diary/schema.js
- src/diary/repository.js
- src/memory/palace/rebuild.js
- src/memory/palace/source-validator.js
- scripts/verify-unified-memory-m0.mjs
- scripts/verify-unified-memory-contracts.mjs
- scripts/verify-unified-memory-diary.mjs
- scripts/verify-unified-memory-media.mjs
- scripts/verify-unified-memory-calendar.mjs
- scripts/verify-unified-memory-fiction.mjs
- scripts/verify-unified-memory-forget.mjs
- scripts/verify-unified-memory-broker.mjs
- scripts/verify-unified-memory-migration.mjs
- e2e/unified-memory-journey.spec.mjs

### 重点修改

- src/contracts/index.js
- src/features/flags.js
- src/storage/db.js
- src/memory/data-modules.js
- src/memory/backup.js
- src/memory/candidate-ledger.js
- src/memory/cohabit-timeline.js
- src/memory/palace/drawer.js
- src/memory/palace/search.js
- src/memory/palace/kg.js
- src/memory/palace/legacy-census.js
- src/context/broker.js
- src/context/contract.js
- src/context/purpose-policy.js
- src/context/pipeline.js
- src/context/store.js
- src/context/inspector.js
- src/prompt/assemble.js
- src/diary/records.js
- src/library/books-import.js
- src/library/book-reader.js
- src/library/co-listen.js
- src/phone-shell/phone-listen.js
- src/phone-shell/phone-reader.js
- src/calendar/**
- src/timeline/repository.js
- src/timeline/from-conversation.js
- src/companion/scenario-memory-bridge.js
- src/life/**
- package.json

### 禁止新增

- 新聊天历史 Store。
- 新 Timeline Store。
- 新 Stable Memory Store。
- 新 Calendar Store。
- 新 Task Store。
- 另一个向量数据库抽象。
- 以 App 名称创建的独立长期记忆 localStorage。

---

## 17. 测试矩阵

### 17.1 合同

- SourceRef 必填字段。
- projection 唯一性。
- sourceVersion stale。
- namespace。
- companion/relationship 隔离。
- tombstone。
- idempotency。

### 17.2 功能

- 日记创建、编辑、删除、恢复、搜索。
- 日历创建、更新、完成、取消。
- 听歌开始、暂停、完成、收藏、重复播放。
- 阅读打开、滚动、章节完成、摘录、删除书。
- 情景剧进入、分支、谢幕、重开。
- Life shared/discoverable/private。

### 17.3 召回

Golden queries：

- “你还记得我们一起听的那首歌吗？”
- “我上次答辩是哪天？”
- “我之前说过不喜欢什么？”
- “把昨天日记里关于睡眠的部分找出来。”
- “我们在夜雨列车里最后选了什么？”
- “现实里我们真的在车站生活过吗？”
- “我刚才让你忘记的事情是什么？”应拒绝恢复具体内容。

每条检查：

- 正确 sourceRef。
- 正确 namespace。
- 无跨角色结果。
- 无已删除结果。
- 无重复块。
- token 在预算内。

### 17.4 指标

- 普通聊天重复 sourceRef：0。
- 跨角色泄漏：0。
- shared_fiction -> reality Stable 自动晋升：0。
- tombstone 召回：0。
- Palace orphan 注入：0。
- 三次迁移重复记录：0。
- 普通聊天隐式块：4 到 8 条目标范围。
- 8k Context Envelope 超预算率：0。
- 启动时全量 embedding：0。
- 日记写入首个可交互结果不等待 embedding。

### 17.5 回归

每波运行相关子集。M9/M10 至少运行：

- npm run verify:memory-pipeline
- npm run verify:multi-companion
- npm run verify:context-enterprise
- npm run verify:context-surfaces
- npm run verify:r2-timeline
- npm run verify:r3-memory
- npm run verify:backup-cp15
- npm run verify:temporal-w2
- npm run verify:turn-understanding-w3
- npm run build
- node e2e/unified-memory-journey.spec.mjs

若仓库已有对应失败，必须在 M0 记录基线并证明没有新增回归。

---

## 18. 备份与同步

备份必须区分：

### 必须备份的权威

- Conversation V2。
- Diary Repository。
- Calendar Repository。
- Unified Tasks。
- Experience Repository。
- Life Repository。
- Timeline。
- Candidate Ledger。
- Stable Memory。
- Character/Relationship contracts。

### 可以不备份、可重建

- Context Graph projection。
- MemPalace chunks/embedding。
- KG。
- retrieval cache。
- Context Inspector 临时 trace。

为了加快恢复，可以选择备份索引快照，但恢复后必须验证 sourceVersion；快照不能覆盖权威数据。

服务端同步未来只同步权威数据和 tombstones。各设备本地重建 Graph/Palace。

---

## 19. 性能要求

- 普通聊天首 token 不等待全量索引。
- Timeline/Candidate 本地写入目标小于 20ms。
- Projection Outbox 入队目标小于 5ms。
- Palace 单条增量 embedding 异步。
- 启动不遍历全部聊天、日记和图书。
- Context Broker 检索目标小于 120ms；超时降级为 Stable + Timeline + recent history。
- 低端 Android 内存中候选池有上限。
- 大书籍按 chunk 流式导入，不一次性加载全文。
- rebuild 支持暂停、恢复和电量/网络条件。

---

## 20. 完成定义

只有全部成立才算完成：

1. 每类原始数据有唯一 Repository。
2. Conversation V2 是唯一聊天权威。
3. TimelineEvent V1 是唯一共同经历权威。
4. Candidate -> Stable 是唯一长期理解晋升路径。
5. Context Graph 和 MemPalace 都可删除重建。
6. 日记不再依赖 memories 作为原件。
7. Calendar/Task 与聊天 ActionProposal 形成真实闭环。
8. 听歌和读书不会制造高频无意义事件。
9. 情景剧和现实 namespace 完全隔离。
10. Life privateFacts 不进入搜索和 Prompt。
11. assemblePrompt 不直接搜索 Palace/Graph/Stable。
12. Context Broker 是唯一 Prompt 召回入口。
13. 同一 sourceRef 不会重复注入。
14. 删除、纠正和忘记会传播到所有投影。
15. 被忘记事实不会从旧聊天重新复活。
16. 多角色、群聊、虚构世界和现实世界隔离测试通过。
17. 三次迁移幂等。
18. 旧备份可恢复，新备份可重建索引。
19. 浏览器 E2E 通过。
20. Android 真机完成十条产品旅程。

---

## 21. Cursor 每波交付格式

每个波次必须提交：

1. 波次编号和目标。
2. 修改文件列表。
3. 权威写入者是否变化。
4. 新旧链路数据流。
5. feature flag 状态。
6. 迁移脚本和三次幂等结果。
7. 执行的测试命令与真实输出。
8. Context Inspector 或 JSON provenance 证据。
9. 未完成项。
10. 已知风险和回滚方式。

禁止只报告：

- “已实现”。
- “测试通过”但不提供命令。
- “构建成功”。
- “代码中有该函数”。
- “理论上不会重复”。

---

## 22. 推荐 Cursor 开工指令

将以下内容原样交给 Cursor：

“完整阅读 docs/UNIFIED_MEMORY_FEATURE_CONTEXT_CURSOR_PLAN.md 和文首列出的上游合同。先执行 M0，不进入 M1。保留当前脏工作树，不修改 UI，不回滚用户文件。输出 direct writer/reader 清单、Legacy Census、现有测试基线和一次真实 Context Envelope 重复来源报告。证据不齐全时不得声称 M0 完成。”

