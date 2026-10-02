# 月栖 · 开放角色体验与小手机手感一次性交付计划

> 文档性质：Cursor 唯一施工合同 / 产品语义真源 / 验收真源  
> 当前定级：**Product RED / Architecture Prototype**  
> 执行方式：从 W0 连续执行到 W8，不逐波要求用户确认；最终只提交一次合并验收包  
> 适用仓库：`F:\beautiful`  
> 只读参考：`F:\商业参考\SillyTavern`、`F:\商业参考\ai-virtual-phone`  
> 最后更新：2026-07-27

---

## 0. 给执行者的总命令

本文件不是概念建议，也不是“先做一小步”的待讨论草案。Cursor 读取后必须把它当作本轮唯一施工合同，连续完成全部本地可完成工作。

执行者必须遵守：

1. **先读后改**：先读取本文件列出的现有代码、数据结构、历史计划和失败证据，再修改代码。
2. **保护工作树**：当前仓库存在大量未提交改动；禁止 `git reset --hard`、禁止覆盖用户改动、禁止以“重构”为由删除未理解的功能。
3. **一次性连续执行**：W0–W8 之间不再要求用户“确认下一步”。只有外部密钥、真实账号、真机权限等客观外部条件可以标为 `external_pending` 或 `device_pending`，不能阻塞其余本地工作。
4. **先修核心再扩表面积**：在“夜雨车站”开放式样板达到本计划验收前，冻结新 Agent 能力、新商城、联机、新游戏和新场景数量。
5. **不能用旧功能假装新语义**：固定剧情树、关键词路由、模板回声、预制测试数据不能算开放剧情。
6. **不能静默降级**：模型不可用时必须显式告诉用户并允许重试；禁止偷偷播放固定剧情并继续显示成正式情景剧。
7. **不能以测试数量自证完成**：`100/100`、`18/18`、截图存在、页面能打开都不是产品完成。完成必须同时满足行为、状态、视觉、异常、恢复和人工观感门。
8. **不能自签用户验收**：执行者最多标记 `product_review`；`user_accepted` 只能由用户签署。
9. **Clean-room 实现**：只学习参考产品的行为规律，不复制 AGPL 项目的源码、组件结构、提示词原文、CSS、Schema 字段组合、作品内容或美术资源。
10. **最终只交一次包**：完成后提交代码、迁移说明、自动证据、实测录屏、已知限制和逐条验收矩阵；不要在中途把用户变成 Cursor 与测试脚本之间的传话人。

本计划覆盖并取代以下旧文档中与“情景剧运行时、开放剧情、作品包、分支、情景 UI、小手机手感”冲突的条款：

- `docs/SCENARIO_THEATER_PLAN.md`
- `docs/qa/paios/V0_PRODUCT_CORRECTION.md`
- `docs/CORE_EXPERIENCE_CORRECTION_PLAN.md` 的 C4 情景剧旧实现条款
- `docs/PERSONAL_AI_OS_COMPLETION_PLAN.md` 中把局部接线绿视作产品放行的部分

其他计划中不冲突的桌宠、语音、记忆、宿主和角色资产内容继续有效。

---

## 1. 产品语义：我们到底在做什么

### 1.1 一句话定义

月栖是一个以可动悬浮角色为入口、围绕同一个长期 AI 关系运行的跨端个人伴侣平台。

情景剧不是独立小游戏，而是：

> **同一个长期陪伴角色，带着既有人格、关系和记忆，进入一个创作者定义的开放情境，与用户共同经历一段可自由推进、可修改未来、可回流长期关系的互动。**

小手机不是功能菜单，也不是后台控制台，而是：

> **TA 和用户共同生活的可触摸界面。它应像一台真实、流畅、有状态记忆的手机，而不是把网页卡片塞进手机边框。**

### 1.2 月栖不是这些东西

- 不是预设节点 + 关键词匹配的互动小说。
- 不是每个情景重新创建一个失忆角色。
- 不是只有漂亮立绘的 Galgame 播放器。
- 不是 SillyTavern 的移动端复刻。
- 不是 Float 的换皮版虚拟手机。
- 不是 AI 风月的作品库复刻。
- 不是桌面上悬浮的图片切换器。
- 不是把 API、RAG、Agent、世界书等工程名词直接暴露给普通用户的管理后台。
- 不是需要复杂物理世界模拟器才能成立的 RPG 引擎。

### 1.3 月栖必须形成的独特优势

竞品往往在以下一项很强：

- SillyTavern：强大的角色卡、提示词编排、世界书和分支控制。
- AI 风月：把自由角色聊天包装成可进入、可消费、可持续玩的作品。
- 星野：低门槛智能体创作、开放剧情、多模态和内容社区。
- Float / `ai-virtual-phone`：像真手机一样承载聊天、动态、应用和角色生活。

月栖不和它们拼“功能总数”。月栖要占据的产品位置是：

> **一个长期存在的 TA，在悬浮桌宠、Pop、聊天、小手机、朋友圈、情景作品和未来的行动能力中保持同一身份、同一关系、同一条生命线。**

作品改变的是“TA 此刻身处什么情境”，不是“TA 是谁”。

---

## 2. 不可破坏的十条语义定律

任何实现只要违反其中一条，就不能标记完成。

### L1 · 身份连续

当前角色 `characterId` 是所有模式的第一主键。用户在桌宠里看到的星梨、Pop 中聊天的星梨、夜雨车站里的星梨、TA 手机里的星梨必须是同一个角色包实例。

禁止：情景剧因为素材缺失换成通用人物、男孩图、另一张脸或不同声音。

### L2 · 会话单一事实源

聊天与沉浸情景必须共用一个 Canonical Conversation Runtime。情景剧不得再把 `run.beats[]` 当作剧情权威，再“尽力同步”一份副本给 Conversation Runtime。

### L3 · 情景是会话模式，不是剧情播放器

进入作品等于在同一角色会话上挂载 `ExperienceContext`，切换到 `immersive` 表现模式。退出作品后会话和关系继续存在。

### L4 · 自由输入是主路径

用户可以输入语言、行动、心理活动、导演意图或沉默。系统必须根据完整上下文实时反应。快捷选项只是输入建议，不是剧情节点 ID。

### L5 · 作品包定义容器，不预写未来

作品包负责前提、世界、开场、创作者意图、节奏、边界、视觉资源和结束策略；模型与用户共同决定之后发生什么。

### L6 · 模型提出，运行时裁决

模型可以提出台词、旁白、动作、情绪和 `scenePatch`；本地 Reducer 必须校验字段、范围、权限和前后状态，模型不能任意直接改长期关系或永久记忆。

### L7 · 用户可以修改未来

编辑、重生成、候选切换、检查点和分支必须保留真实的多条时间线。不得通过物理删除后续消息伪装成分支。

### L8 · 只有接受的世界线能形成经历

未选中的回复候选、已废弃分支、预览运行和测试运行不得写入长期记忆、日记、关系状态或主动陪伴。

### L9 · 表现服从角色状态

立绘、动作、口型、语音、背景和特效由本轮角色状态驱动。固定动画不能决定剧情；动作缺失时只能降级到同一角色的兼容动作。

### L10 · 失败必须诚实

模型不可用、响应格式损坏、世界书超预算、素材缺失和记忆提交失败必须有明确状态、可重试入口和不丢数据恢复路径。禁止静默播放固定内容后继续显示为正式结果。

---

## 3. 当前实现的准确基线

执行者不得把现状描述成“完全没做”，也不得继续称为“产品已完成”。当前是混合架构。

### 3.1 已有可复用部分

- `src/conversation/` 已有角色维度的 Conversation Session、Turn 和聊天/沉浸模式雏形。
- `src/scenario/runtime/director-adapter.js` 已能装配部分角色、世界书、会话历史和记忆，并调用模型。
- `src/scenario/runtime/schema.js` 已有台词、旁白、表情、动作、语音、镜头和关系增量的结构化输出雏形。
- `src/avatar/pet-action-protocol.js` 已有聊天、情景和桌宠共享动作映射与回 idle 逻辑。
- `src/worldbook/`、`src/memory/`、`src/context/` 已有存储和检索基础。
- `src/phone-shell/os-home-pager.js`、`os-home-gesture.js`、`os-lock-gesture.js`、`os-icon-edit.js` 已具备一部分跟手分页、Home 手势、解锁和图标编辑能力，不能推倒重写。
- 情景结束可向日记和共同经历投影。

### 3.2 当前阻断

- `src/scenario/presets.js` 仍以 `nextByChoice`、`nextByKeyword` 和固定 Beat 图控制夜雨车站。
- `offlineDirectorTurn()` 仍以关键词和模板台词伪装自由输入。
- 模型异常、无 Key 或无效输出时会静默退回固定剧情。
- 情景 `run.beats[]` 与 Conversation Runtime 双写，后者只是 best-effort 镜像。
- Conversation Session 仍是线性 `turns[]`，没有候选和非破坏性分支。
- `replaceLastAssistant()` 覆盖原回复，不保留候选。
- 当前世界书主要是选中 ID 后整体注入，缺少成熟的作用域、触发、预算、插入位置和激活解释。
- 每轮 `memoryCandidate` 过于接近“让模型直接写长期记忆”，缺少来源、置信度、分支归属、去重和提交门。
- 情景舞台虽然有动画，但“有 CSS 动画”不等于角色有生命；动作切换、闲置轮播和角色占屏仍需按真实资产验收。
- 旧 E2E 可以通过固定文案、预制数据或离线剧情树获得假绿。

### 3.3 旧概念的去留

| 旧概念 | 处理方式 |
|---|---|
| `ConversationSession` | 升级为 V2，作为唯一事实源 |
| `ScenarioRun` | 迁移为 `ExperienceSession` 投影视图，不再独立保存剧情正文 |
| `run.beats[]` | 只做旧数据迁移输入和只读兼容，不再写入 |
| `beatCursor / beatNodeId` | 从正式运行时删除 |
| `nextByChoice / nextByKeyword` | 从生产路径删除；旧预设迁移为作品开场与导演提示 |
| `choices[]` | 保留语义但改为模型实时生成的 `suggestedActions[]` |
| `offlineDirectorTurn` | 仅允许进入明确标注的开发演示模式；正式模式不得调用 |
| `memoryCandidate` | 升级为有来源和审批状态的 `ExperienceMemoryCandidate` |
| `ScenarioTurn` | 升级为通用 `AssistantTurnEnvelope`，聊天/情景/桌宠共用 |

---

## 4. 参考产品该学什么、不学什么

### 4.1 SillyTavern

学习：

- Character Card、Persona、Scenario、World Info、历史、摘要、扩展提示统一进入同一生成链。
- First Message 与 Alternate Greetings 提供多个进入状态。
- 编辑、Swipe、Regenerate、Checkpoint、Branch 真正改变未来。
- World Info 按条件、优先级和预算注入，而不是整本硬塞。
- VN 与表情是同一会话的表现层。

不学：

- 高级用户工具式复杂界面。
- 全局脚本扩展的宽权限。
- 把 Scenario 只做成一段不可验证文本。
- 把生成后的台词再用第二次分类猜情绪作为唯一方案。

### 4.2 Float / `ai-virtual-phone`

本轮已在 390×844 视口实测其启动、桌面分页、聊天列表、聊天房间、空状态、剧情入口和查手机入口。值得学习的是手感规律：

- 首页像系统桌面，不像 Dashboard。
- 横向翻页跟手，松手后有吸附和边缘阻尼。
- App 打开后全屏接管，不再保留桌面卡片壳。
- 页面返回路径单一明确。
- 已访问聊天保持挂载，返回后滚动、草稿和局部状态不被重置。
- 底部导航只保留高频入口，激活态有轻微弹性反馈。
- 空状态有清晰原因和一个主操作，不用一屏解释产品架构。
- 后台生成可继续，通知可进入对应结果。
- 安全区、底栏和键盘空间按手机设备处理。

不学：

- “取证台、解密节点、黑市”等与月栖恋爱陪伴不一致的语义。
- 为展示功能数量堆满多页图标。
- 任意 HTML/CSS/脚本直接进入商业产品运行时。
- 线性消息删除式重生成。
- AGPL 代码和资源。

### 4.3 AI 风月与星野

学习作品产品化：封面、介绍、角色适配、世界观、多开场、创作者规则、进入即玩、无限续写、社区预览和低门槛创作。

不把未经官方公开或未在真机验证的内部字段当成既定事实；月栖按自己的长期角色语义独立设计作品包。

---

## 5. 目标领域模型

### 5.1 CharacterPackage：TA 是谁

继续沿用并升级现有角色包，至少负责：

- 稳定 `characterId`、名称、人格、关系边界、语言习惯、示例对话。
- 外观、动作目录、表情目录、口型、声音、同角色降级素材。
- 默认日常 Scenario 与默认世界书绑定。
- 角色自身长期目标和生活倾向，但不包含具体作品的剧情未来。

### 5.2 UserPersona：用户是谁

至少包含：

- 名称、称呼、代词和交流习惯。
- 用户允许角色知道的事实。
- 关系边界、内容偏好和隐私范围。
- 当前作品可覆盖的玩家身份，但不能覆盖真实用户主档。

### 5.3 RelationshipState：两人走到了哪里

不做“好感度进度条”，但内部需要可审计结构：

```text
RelationshipState
- characterId
- userId
- stage
- trustBand
- intimacyBand
- knownBoundaries[]
- sharedPromises[]
- unresolvedThreads[]
- recentTone
- updatedFromEventIds[]
- version
```

模型不能直接覆盖此对象，只能产生候选事件，由 Relationship Reducer 根据已接受分支处理。

### 5.4 ExperiencePackage：进入什么作品

V1 必须实现：

```text
ExperiencePackage
- schemaVersion
- id / version / title / subtitle / synopsis
- cover / tags / contentRating / author
- compatibleCharacterRules
- playerRole
- scenarioOverride
- openings[]
- embeddedLorebook[]
- directorPolicy
- responseContract
- initialAssets / rendererProfile
- memoryPolicy
- permissions
- migration
```

其中每个 `opening` 不是一句开场白，而是完整初始快照：

```text
ExperienceOpening
- id / title / teaser
- relationshipPremise
- initialSceneState
- openingTurns[]
- suggestedActions[]
- initialPerformance
- enabledLoreIds[]
- creatorNote
```

### 5.5 ExperienceSession：这一次演到了哪里

```text
ExperienceSession
- id
- packageId / packageVersion
- characterId
- conversationSessionId
- activeBranchId
- openingId
- status: active | paused | ended | archived
- sceneState
- directorAgenda
- acceptedMemoryCandidateIds[]
- startedAt / updatedAt / endedAt
```

它只保存作品运行状态和对话引用，不再复制正文历史。

### 5.6 ConversationGraph：用户真正拥有未来

Conversation V2 必须从线性数组升级为可迁移的图：

```text
ConversationSession
- id / characterId
- activeBranchId
- branches{}
- messageNodes{}
- modeContext
- createdAt / updatedAt

ConversationBranch
- id
- parentBranchId?
- forkedFromMessageId?
- headMessageId
- label
- status: active | archived

MessageNode
- id / parentMessageId?
- branchId
- role
- candidates[]
- activeCandidateId
- mode
- createdAt
- accepted

TurnCandidate
- id
- content
- narration?
- scenePatch?
- performance?
- suggestedActions[]
- generationSnapshot
- createdAt
```

行为必须精确定义：

- 普通发送：在当前 Branch Head 后追加 User Node，再追加 Assistant Node。
- 重生成 AI：向同一 Assistant Node 添加 Candidate，旧 Candidate 保留。
- 切换候选：修改 `activeCandidateId`；如当前候选已有后代，继续生成前必须显式创建或选择分支。
- 编辑最新用户消息：可原位更新，但必须记录修订历史。
- 编辑有后代的历史消息：从其父节点创建新 Branch，旧分支完整保留。
- 从这里重走：复制截至目标节点的状态快照并创建新 Branch。
- 删除：默认归档 Branch 或 Candidate，不物理删除；只有用户执行永久清理才移除。
- 回滚：改变活动 Head，不破坏后代。

### 5.7 SceneState：够用但不假装模拟世界

```text
SceneState
- location
- timeOfDay
- weather
- participants[]
- participantPositions{}
- relationshipPremise
- tensionBand
- emotionalTone
- activeGoal
- unresolvedThreads[]
- establishedFacts[]
- inventoryHints[]
- visualState
- safetyState
- turnIndex
```

只保存影响后续生成的稳定事实。禁止为了“高级”加入没有用户体验价值的数百项物理模拟字段。

### 5.8 DirectorAgenda：角色为什么继续行动

作品包可以定义软目标：

- 角色当下想达成什么。
- 角色在回避什么。
- 场景张力如何上升或舒缓。
- 哪些线索尚未解决。
- 何时可以建议结束。

Agenda 是软约束，不得直接决定下一句固定台词或强制把用户拉回预定主线。

---

## 6. 唯一生成链

所有角色生成必须汇入一个 Canonical Prompt Assembler。聊天、Pop、桌宠短聊、情景剧和小手机中的聊天只通过 Mode Contribution 增加上下文，不得各自维护一套 Prompt 真源。

### 6.1 固定装配顺序

每轮按以下顺序构建，顺序必须有单元测试：

1. 平台安全、内容边界和输出协议。
2. CharacterPackage：角色身份、人格、语言、示例。
3. UserPersona：用户身份和授权事实。
4. RelationshipState：当前关系、承诺、边界、未解决事件。
5. Mode Context：日常 / Pop / 桌宠 / immersive。
6. ExperiencePackage：作品前提、玩家身份、导演规则。
7. 当前 Opening 与 SceneState。
8. 本轮激活的 World Info。
9. 检索到的相关长期记忆。
10. 当前分支的滚动摘要。
11. 按 Token 预算装入的真实分支历史。
12. 用户最新自由输入。
13. Post-history 约束和输出 Contract。

### 6.2 Token 预算

必须有明确预算策略：

- 永久层：安全、角色核心、用户边界、响应协议。
- 高优先层：当前场景状态、最近真实消息、强相关世界书。
- 中优先层：关系摘要、长期记忆、作品补充设定。
- 可裁剪层：示例对话、较旧历史、低优先 Lore。
- 不允许因为世界书过长挤掉用户最后一轮或当前角色身份。
- Prompt Inspector 必须显示每个区块的 Token 估算、来源和裁剪原因。

### 6.3 World Info Activation V1

每条 Lore 至少支持：

- `scope`：global / character / persona / experience / session。
- `enabled`、`priority`、`tokenBudget`。
- `keys`、`secondaryKeys`、`regex`、可选语义召回。
- `constant` 常驻。
- `matchMode`：any / all / not_any。
- `scanDepth`。
- `stickyTurns`、`cooldownTurns`、`delayTurns`。
- `insertPosition`：before_scenario / after_scenario / before_history / at_depth / post_history。
- `role`：system / user / assistant。
- `sourcePackageId` 和版本。

每轮生成保存 `LoreActivationTrace`：哪些条目被激活、为什么、插在哪里、用了多少预算、哪些被裁剪。创作者预览必须能看到此 Trace。

### 6.4 模型输出契约

正式输出统一为：

```json
{
  "schemaVersion": 2,
  "display": {
    "narration": "",
    "dialogue": ""
  },
  "performance": {
    "emotion": "warm",
    "expressionId": "soft_smile",
    "actionId": "lean_close",
    "voiceStyle": "soft",
    "backgroundId": "rain_station",
    "soundId": "rain_light",
    "camera": { "shot": "medium", "transition": "soft" }
  },
  "suggestedActions": [
    { "text": "把伞往她那边偏一点", "intent": "care" }
  ],
  "scenePatch": {
    "emotionalTone": "tender",
    "resolvedThreadIds": [],
    "newFacts": []
  },
  "memorySignals": [],
  "ending": { "mayEnd": false, "reason": "" }
}
```

约束：

- `suggestedActions` 0–3 条，必须是自然输入建议，不能带节点 ID。
- `scenePatch` 只能修改白名单字段，由 Reducer 校验。
- `memorySignals` 只是候选信号，不能直接写永久记忆。
- `actionId / expressionId / backgroundId` 必须经过当前角色包和作品资产白名单解析。
- 输出解析失败时允许一次结构修复请求；仍失败则进入显式错误态并保留用户输入。
- 禁止调用固定台词兜底继续推进。

### 6.5 生成生命周期

```text
idle
→ composing
→ context_ready
→ generating
→ streaming
→ validating
→ committed

异常：generating/streaming/validating → retryable_error
用户：generating/streaming → cancelled
```

用户发送后 100ms 内必须出现自己的消息和 TA 的“正在回应”状态；支持停止生成。失败后允许重试、编辑输入或切换模型，不能丢草稿和现场状态。

---

## 7. 夜雨车站：唯一旗舰垂直样板

在本样板通过前，不新增更多情景作品。

### 7.1 三个完整开场

必须至少包含：

1. **初次相遇**：陌生人在末班车前共享一把伞；低信任、强观察感。
2. **恋人争吵后**：两人已是恋人，刚经历一次未解决争执；熟悉但紧张。
3. **多年后重逢**：有共同旧记忆但长期分别；克制、试探、怀旧。

三者使用同一个星梨角色包，但初始关系、场景事实、服装/动作、角色目标、开场消息和可用世界书不同。

### 7.2 允许的用户行为

必须正确处理但不限于：

- 直接说话。
- 描述动作，例如把伞递给她、转身离开、坐到长椅上。
- 用括号表达心理活动或导演意图。
- 沉默、只输入省略号。
- 询问日常聊天中发生过的共同经历。
- 明确拒绝当前情绪方向。
- 突然改变计划，例如叫车离开车站。
- 指出角色说法与历史冲突。
- 尝试结束场景。
- 继续场景，不输入“规定答案”。

模型必须承认用户真实行动并产生因果后续，不得把不同输入重新合流到同一句预写台词。

### 7.3 场景长度与结束

- 不设固定 5 段或 8 段终点。
- 至少稳定支持 30 轮。
- `ending.mayEnd` 只显示柔和的“可以在这里收尾”提示。
- 用户可以随时暂停、退出或谢幕。
- 谢幕是用户结束当前 Experience Session，不是剧情树走到最后节点。
- 退出后再次进入必须恢复到同一分支、同一候选、同一场景状态和同一输入草稿。

---

## 8. 情景剧 UI：像共同经历，不像后台或点击小说

### 8.1 页面流

```text
作品库
→ 作品详情
→ 选择开场
→ 选择长期角色（默认当前 TA）
→ 开幕
→ 沉浸舞台
→ 可选的分支/候选面板
→ 谢幕与经历确认
→ 回到同一个 TA
```

### 8.2 作品库

- 第一屏只表达“今晚和她经历什么”。
- 卡片包含封面、标题、一句话前提、预计氛围、兼容角色、上次进度。
- 主入口是“开始 / 继续”，不是“编辑 Schema”。
- 创作者入口放在二级位置。
- 没有作品时提供一个明确动作：“创建第一部作品”或“导入作品包”。

### 8.3 作品详情与开场选择

- 作品详情先展示情境吸引力，再展示标签和边界。
- 多开场必须使用独立预览卡，明确关系前提，不只是三句不同开场白。
- 进入前显示“将由当前角色星梨出演”；允许更换角色。
- 世界书、模型和高级规则隐藏在“作品设置”，不污染主要旅程。

### 8.4 沉浸舞台

移动端构图要求：

- 角色是第一视觉主体，占舞台有效高度约 45%–68%，不能缩在大卡片角落。
- 背景铺满舞台，不在背景外再叠一圈大磨砂容器。
- 旁白与对白位于底部稳定阅读区；长文本可滚动但输入框位置不跳。
- 输入框始终可到达，支持文字、按住说话、停止生成。
- 快捷行动横向滚动，0–3 条；用户可忽略。
- 默认隐藏高级控制；轻点文本区或更多菜单后出现编辑、重生成、候选、分支、检查点、退出。
- 正在生成时角色保留自然 idle / listening 状态，不显示空白舞台或冻结站姿。
- TTS 可自动或手动播放，文字必须先可读，语音失败不能阻塞剧情。

桌面端构图要求：

- 舞台居中但不做窄手机截图放大。
- 文本、角色和场景保持同一视觉轴。
- 分支时间线可作为右侧临时抽屉，不常驻挤压舞台。

### 8.5 消息操作

- 轻点 AI 回复：在候选间切换。
- 长按/更多：编辑、复制、重新生成、从这里分支、查看本轮上下文。
- 用户历史消息编辑后必须明确提示“将从这里创建新时间线”。
- Candidate 指示使用 `1 / 3`，但不能像调试工具。
- Branch 面板显示开场、分叉点、最近一句和更新时间；用户能命名分支。
- 检查点是可命名的 Branch 快照，不另造一套存储。

### 8.6 谢幕

- 显示本次经历摘要、关系变化候选、重要事实候选。
- 用户可以取消某条记忆候选、改写或全部不保存。
- “保存为共同经历”只能提交当前接受分支。
- 保存后回到 Pop 时，TA 可以自然接续，但不能立刻机械重复谢幕摘要。

---

## 9. 视觉和桌宠表现协议

### 9.1 同一次生成驱动表现

角色文字与表现使用同一个 `AssistantTurnEnvelope`：

```text
display text
+ emotion
+ expressionId
+ actionId
+ voiceStyle
+ background/sound/camera
```

不要再用固定节点选择动画，也不要完全依赖生成后第二次情绪分类。

### 9.2 动作播放器

必须实现：

- 预加载下一动作资产，切换时不出现透明闪帧。
- 相同角色资产内降级：精确动作 → 同情绪兼容动作 → 同角色默认动作 → 同角色 idle。
- 禁止跨角色通用图片兜底。
- One-shot 动作结束后自然回到 idle 状态机，而不是统一 1800ms 硬切。
- idle 不是一张站立图；根据时间、情绪和最近动作在至少 3 个兼容 idle 中低频轮播。
- 轮播需有最短停留、随机抖动和最近不重复策略，避免机械循环。
- 对话时口型和呼吸叠加不互相重置。
- 拖动、点击、长时间未互动、语音播放、生成中和任务中应有不同状态。

### 9.3 物理舒适与资产质量

- 不拉伸身体比例。
- 不镜像包含不对称服装/发饰的完整角色图，除非角色包声明可镜像。
- 不用全图缩放模拟呼吸导致脚底漂移；呼吸锚点在胸肩或角色包指定节点。
- 动作切换不瞬移脚底、不切断头发、不改变脸型和年龄感。
- 表情变化优先局部或同构帧；不同构图只能使用柔和过渡并保持角色锚点。
- 8FPS/序列帧只在资产真的完整时启用；缺帧时诚实使用姿态切换，不伪装高帧动画。

### 9.4 桌宠与舞台联动

- 情景剧开始：桌宠进入与作品氛围对应的短动作，然后舞台接管。
- 情景进行：桌宠/Overlay 不重复播放舞台全部动画，只投影情绪、短气泡和语音状态。
- 情景结束：桌宠播放一次对应的余韵动作，然后回自然 idle 轮播。
- 用户回 Pop：显示真实可继续的同一分支，不生成一条脱离历史的固定回应。

---

## 10. 小手机手感：吸收 Float 优点，保留月栖气质

### 10.1 总原则

小手机必须像一个可每天使用的系统，不像嵌在 App 里的功能展厅。

应保留并打磨现有 `os-home-pager`、`os-home-gesture`、`os-lock-gesture`、`os-icon-edit`，不能另写第二套手势系统。

### 10.2 桌面分页

行为规格：

- 移动 6–8px 后锁定横纵轴。
- 横向移动时页面 1:1 跟随手指；拖动中禁止 settle transition。
- 超出首尾页后施加约 0.25–0.30 阻尼。
- 松手按距离或速度提交；距离门槛为屏宽约 20%–22%，且不少于 56–64px。
- 吸附时长 240–300ms，使用减速曲线，不弹跳过头。
- 图标点击、长按拖动与桌面翻页必须正确抢占手势，不能误开 App。
- 当前页是唯一状态源；手势结束后不得发生先跳页再弹回的竞态。

### 10.3 图标编辑

- 长按约 450–500ms 进入编辑。
- 支持轻微触觉反馈（宿主支持时）、图标抬起、占位反馈、跨页拖动、Dock 交换和文件夹合并。
- 移动超过 8–10px 时取消“点击打开”。
- 编辑态点击空白退出；有明确“完成”入口。
- 刷新后布局保持。

### 10.4 App 生命周期和导航

- App 打开后全屏接管手机内容区，桌面壁纸和桌面卡片不可穿透。
- 打开反馈在 100ms 内出现；本地 App 目标 250ms 内可交互，超过则显示骨架而不是白屏。
- App 关闭/返回时恢复原桌面页、滚动位置、图标编辑状态和正在进行的后台任务提示。
- 每个 App 使用统一导航栈：系统返回先退子页，再退 App，最后回桌面。
- Home Indicator 上滑回桌面，跟手并支持距离/速度提交。
- 聊天等高频 App 的已访问房间保留挂载或序列化 UI 状态；返回后保留滚动、草稿、候选和生成状态。
- 后台生成不能因退出 App 被取消；完成后用角色化通知进入准确结果。

### 10.5 视觉触感

- 不在所有元素外包半透明磨砂卡；磨砂只用于 Dock、底栏、临时浮层等需要层级分离的区域。
- 主页面一次只设一个视觉主角：角色、正在一起、作品封面或当前内容。
- 点击态 70–120ms 内出现轻微缩放/亮度反馈。
- 页面进入 160–240ms；底部 Sheet 220–320ms；禁止所有元素同时飞入。
- `prefers-reduced-motion` 下禁用非必要动画，但保留状态变化。
- 使用 `env(safe-area-inset-*)`，键盘出现后输入框和最后一条消息不得被遮挡。
- 390×844、375×812、360×800 和 1440×900 均不得横向溢出。

### 10.6 月栖自己的首页语义

首屏只保留：

- 当前 TA 的在场状态与最近一句主动消息。
- “正在一起”或当前情景进度，二者最多一个主卡。
- 6–8 个首要 App。
- Dock 中 4 个高频入口：Pop、朋友圈、桌宠、一起听（可由用户调整）。

创作者、世界书、资源库、扩展、接口等高级入口放到第二页或设置，不与“她此刻在你身边”争抢第一屏。

Float 的“取证/黑市/工具台”视觉语义不得进入月栖。月栖应是温暖、亲密、生活化，但不能幼稚或廉价粉色化。

---

## 11. 记忆与长期变化

### 11.1 三层记忆

1. **原始分支历史**：可追溯，属于具体 Branch。
2. **场景滚动摘要**：为上下文压缩服务，可随编辑/分支失效并重算。
3. **长期经历与关系事件**：只有当前接受分支经提交后进入。

### 11.2 ExperienceMemoryCandidate

```text
ExperienceMemoryCandidate
- id
- characterId
- experienceSessionId
- branchId
- sourceMessageIds[]
- type: shared_event | promise | preference | boundary | unresolved_thread
- summary
- evidence
- confidence
- privacy
- proposedRelationPatch
- status: proposed | accepted | rejected | revoked
- createdAt
```

### 11.3 提交规则

- 场景中每轮只记录信号，不立即形成长期记忆。
- 谢幕时根据当前分支抽取候选，做去重、冲突检查和来源绑定。
- 用户可修改、拒绝或撤销。
- 提交必须幂等：同一 `experienceSessionId + branchId + candidateId` 只能生效一次。
- 切换到另一分支后，旧分支已提交记忆必须提示用户是否撤销或保留为“另一种设想”；默认不把虚构替代线当真实共同经历。
- 后续 Pop 和桌宠召回记忆时记录 `lastUsedAt` 和来源，不得泄漏私密世界书全文。

---

## 12. 创作者 Studio 与作品包

本轮不做商业商城、支付和创作者分成，但必须做到“产物未来可以直接商业化”：本地创建、校验、预览、签名、导入和导出完整。

### 12.1 作品编辑器

按用户语言呈现，而非直接编辑 JSON：

- 基本信息：封面、标题、简介、标签、分级。
- 谁来出演：兼容任意角色 / 指定标签 / 指定角色。
- 用户是谁：玩家身份与可修改说明。
- 多个开场：每个开场编辑完整状态和开场消息。
- 世界与规则：世界书、角色知道什么、不能改变什么。
- 导演意图：目标、节奏、冲突、结束策略。
- 舞台：背景、声音、可用动作、主题。
- 记忆：结束后允许形成哪些类型的经历。
- 高级：响应 Contract、Token 预算、权限。

### 12.2 预览与调试

- 选择任意本地角色进入沙盒预览。
- 预览运行明确标记，不写长期记忆。
- 显示本轮 Prompt 区块、激活 Lore、Token 预算、Reducer 接受/拒绝的 Patch、动作降级原因。
- 支持用 10 条测试输入批量检查角色一致性和开放反应。
- 包导出前运行 Schema、资源、权限、动作、开场和迁移检查。

### 12.3 安全边界

- V1 作品包不得执行任意 JavaScript。
- 自定义 UI 只允许 Renderer Profile、设计 Token、受限 Markdown 和白名单组件。
- 自定义 CSS 如保留，必须作用域隔离、属性白名单、大小限制和清理；默认关闭。
- 外部资源必须声明来源、许可和哈希。
- 导出包不得包含 API Key、用户聊天、真实长期记忆或私密 Persona。

---

## 13. 工程落点与文件责任

执行者可以在审计后调整具体文件名，但不得改变职责边界。

### 13.1 Conversation Runtime

目标目录：`src/conversation/`

- `schema.js`：升级 V2 Session / Branch / MessageNode / Candidate。
- `migration.js`：`yueqi.conversation.v1 → v2`，幂等、可回滚备份。
- `store.js`：图存储、归档、活动分支、原子写入。
- `runtime.js`：发送、重生成、切换候选、编辑、分支、检查点。
- `events.js`：稳定事件总线，供记忆、TTS、桌宠、Agent 和 UI 订阅。
- `selectors.js`：为不同模式投影线性可见历史。

禁止任何消费者直接修改内部 Bag。

### 13.2 Experience Runtime

新增目标目录：`src/experience/`

- `schema.js`：Package / Opening / Session / SceneState。
- `store.js`：作品与 Session 元数据。
- `runtime.js`：进入、暂停、恢复、谢幕、模式挂载。
- `director.js`：调用统一 Prompt Runtime。
- `reducer.js`：验证 Scene Patch 和关系候选。
- `memory.js`：经历候选和提交。
- `package-io.js`：导入导出、迁移、签名检查。
- `presets/night-rain-station.js`：三开场样板，不含剧情节点图。

### 13.3 Prompt 与 World Info

- `src/prompt/assemble.js` 成为唯一 Canonical Assembler；现有聊天和情景适配到这里。
- 新增 `src/prompt/budget.js`、`inspector.js`、`mode-contributions.js`。
- `src/worldbook/match.js` 升级作用域、组合触发和确定性排序。
- 新增 `src/worldbook/activation.js`、`trace.js`。

### 13.4 情景播放器

现有 `src/scenario/player/` 迁移为 Experience Player UI，最终不得拥有独立剧情事实源。

- `player-ui.js` 只调用 Experience Runtime 和 Conversation Runtime。
- `stage-controller.js` 消费 Performance Envelope。
- `branch-panel.js` 消费 Conversation Graph。
- `memory-review.js` 处理谢幕候选。
- `src/scenario/runtime/director-adapter.js` 最终变成兼容层或删除。
- `src/scenario/presets.js` 固定图数据迁移后停止生产写入。
- `src/scenario/store.js` 只保留 V1 迁移读取和兼容查询，不能继续保存新 Beat。

### 13.5 小手机

继续使用：

- `src/phone-shell/os-navigation.js`
- `src/phone-shell/os-home-pager.js`
- `src/phone-shell/os-home-gesture.js`
- `src/phone-shell/os-lock-gesture.js`
- `src/phone-shell/os-icon-edit.js`

重构 `phone-shell.js` 时拆分生命周期、桌面、App 栈和情景入口，避免单文件继续膨胀。所有 App 必须通过统一 Phone App Lifecycle 保存和恢复 UI 状态。

### 13.6 表现与角色包

- `src/avatar/pet-action-protocol.js` 升级为状态机，不再只靠统一延迟回 idle。
- Character Manifest 增加动作兼容、锚点、持续时间、循环、可镜像、过渡和降级声明。
- 舞台、Pop 和桌宠使用同一个 Action Resolver。

---

## 14. 连续施工波次

### W0 · 冻结错误语义与建立基线

任务：

1. 标记当前产品为 `Product RED`，旧 RC 继续保持 superseded。
2. 建立本计划逐项追踪矩阵。
3. 录制当前夜雨车站、Pop、小手机和桌宠基线。
4. 导出当前 LocalStorage / IndexedDB 结构样本，设计迁移夹具。
5. 为生产调用添加遥测标记，证明当前哪些回合走在线模型、哪些走离线固定图。
6. 冻结新功能表面积。

放行：基线、风险、迁移样本和文件所有权齐全；不改产品语义也不能称绿。

### W1 · Conversation V2 与非破坏时间线

任务：

1. 实现 V2 Schema、Store、Runtime、事件总线和 V1 迁移。
2. 实现 Candidate、Regenerate、Edit、Fork、Checkpoint、Switch Branch、Archive。
3. Pop 聊天先切到 V2，并保持现有可见消息。
4. 所有编辑/分支行为写审计事件。
5. 刷新和重启后恢复活动 Branch、Candidate、草稿和滚动锚点。

放行：不依赖情景剧即可证明两条分支均完整保留、可切换、可继续，旧数据无丢失。

### W2 · Canonical Prompt、World Info 与 Director

任务：

1. 合并聊天和情景 Prompt 装配。
2. 实现固定区块顺序、Token 预算和 Inspector。
3. 实现 Lore Activation V1 和 Trace。
4. 实现统一输出 Contract、一次 Repair、白名单 Reducer。
5. 删除正式路径中的静默离线剧情回退。
6. 配置缺失和模型失败进入明确错误态。

放行：Prompt Spy 能证明所有模式使用同一装配器；相关 Lore 被激活、无关 Lore 不进入；模型失败不会产生伪台词。

### W3 · 夜雨车站开放式作品

任务：

1. 把旧固定图迁移成 ExperiencePackage 的前提、Lore、Agenda 和三开场。
2. 移除生产依赖的 `nextByChoice / nextByKeyword / beatCursor`。
3. Experience Session 挂载到当前角色 Conversation Branch。
4. 连续自由输入、暂停、恢复和谢幕。
5. 快捷行动由每轮模型生成。

放行：三开场各完成 30 轮；预先未写入的用户行动产生因果差异；不存在固定合流点。

### W4 · 沉浸舞台与 Float 级手感

任务：

1. 重做作品库、作品详情、开场选择、舞台、分支面板和谢幕。
2. 小手机情景 App 通过统一 App Lifecycle 全屏接管。
3. 保留并调优分页、Home、解锁和图标编辑手势。
4. 实现状态保留、后台生成、完成通知和准确返回。
5. 动作预加载、同角色降级、idle 状态机、TTS/口型协同。
6. 删除情景舞台周围无意义的大面积磨砂壳。

放行：真 DOM 路径录屏达到本计划第 10 节阈值；无闪图、无站桩、无回退丢状态。

### W5 · 经历回流与跨模式生命线

任务：

1. 实现 ExperienceMemoryCandidate、去重、冲突、接受、拒绝、撤销和幂等提交。
2. 谢幕结果进入日记、共同事件和 Relationship Reducer。
3. Pop、桌宠和小手机可召回已接受经历。
4. 未选 Candidate、废弃 Branch、预览和测试运行绝不投影。
5. 场景后角色动作和主动消息由真实事件驱动。

放行：以 `sessionId + branchId + candidateId` 验证准确投影；不允许只匹配“夜雨”“谢幕”等旧文案。

### W6 · Experience Studio 和作品包 IO

任务：

1. 完成作品字段编辑、多开场、Lore、导演规则、舞台、记忆策略。
2. 完成沙盒预览和 Inspector。
3. 完成导入、导出、Schema 校验、资源许可字段、版本迁移和签名检查。
4. 禁止任意 JS；限制自定义样式和外部资源。
5. 用全新原创样板包完成 round-trip。

放行：导出 → 清空 → 导入后作品行为、开场、Lore、资产引用和权限一致；不包含用户隐私和 Key。

### W7 · 质量、性能、安全和回归

任务：

1. 单元、集成、E2E、生成质量评测和视觉回归全部执行。
2. 修复主线程长任务、图片闪烁、键盘遮挡、滚动丢失和重复写入。
3. 检查所有包输入、Markdown、CSS、资源 URL 和输出协议。
4. 检查角色隔离、Branch 隔离、记忆隐私和导出清理。
5. `prefers-reduced-motion`、键盘导航、ARIA 和触摸目标达到要求。

放行：第 15 节全部 Gate 通过；没有 P0/P1 问题。

### W8 · 合并验收包

生成：

- `docs/qa/open-experience/EXECUTIVE_SUMMARY.md`
- `docs/qa/open-experience/TRACEABILITY_MATRIX.md`
- `docs/qa/open-experience/MIGRATION_REPORT.md`
- `docs/qa/open-experience/PROMPT_ASSEMBLY_REPORT.md`
- `docs/qa/open-experience/BRANCH_MEMORY_REPORT.md`
- `docs/qa/open-experience/HANDFEEL_REPORT.md`
- `docs/qa/open-experience/KNOWN_LIMITATIONS.md`
- 三开场 × 多视口截图、录屏和 Trace。

最终状态最多是 `product_review`。真实 OEM Overlay、外部账号和用户市场验证可分别标记 `device_pending / external_pending / market_pending`，不得假装完成，也不得反过来阻塞本地产品修复。

---

## 15. 测试与验收真源

### 15.1 状态等级

```text
not_started
implementation_green   代码与合同测试通过
evidence_green         真实 DOM 路径、持久化、异常和视觉证据通过
product_review         本地可完成范围全部完成，等待用户审查
user_accepted          仅用户可签
```

### 15.2 禁止的假证据

- 把步骤名称写进数组后逐项 PASS。
- 用 `page.evaluate()` 直接注入业务状态或触发隐藏函数。
- 使用 `force: true` 绕过真实遮挡。
- 只检查固定台词存在。
- 只检查页面 URL、按钮数量或 Store 中某字段存在。
- 用预制 `localStorage` Bag 跳过用户创建与真实写入。
- 截图前注入假角色、假日记或假情景结果。
- 以离线固定剧情树通过开放剧情测试。
- 用旧数据中的“夜雨车站”文案冒充本次投影。
- 只测 happy path，不测失败、取消、恢复和切分支。

### 15.3 单元和属性测试

必须覆盖：

- Conversation V1→V2 幂等迁移。
- Branch 图无环、Head 合法、Candidate 归属正确。
- 编辑有后代消息不会破坏原分支。
- Candidate 切换与继续生成的分支语义。
- Scene Reducer 白名单、范围和拒绝原因。
- Lore 作用域、组合触发、Sticky、Cooldown、预算和确定性排序。
- Token Budget 永远保留角色核心和最新用户输入。
- 记忆仅从接受分支提交且幂等。
- 动作解析只降级到同角色。
- 包导入拒绝任意 JS、越界路径、危险 URL 和非法资源。

### 15.4 确定性模型替身

可以使用 Fake Model，但必须是“语义响应器”，不能是按预设点击顺序吐固定答案的播放器。

Fake Model 必须：

- 读取 Character、Opening、Scene State、Lore Trace、Branch History 和最新输入中的标记。
- 对不同输入产生可证明不同的结构化结果。
- 能故意返回坏 JSON、未知动作、越界 Patch、超长输出和流式中断。
- 允许测试系统是否正确 Repair、拒绝、重试和恢复。

### 15.5 开放剧情行为集

三开场分别运行至少以下 10 类未知输入：

1. 与预期情绪一致的温柔行动。
2. 与预期相反的拒绝或离开。
3. 完全改变地点或计划。
4. 沉默。
5. 只写心理活动。
6. 引用普通聊天中的共同记忆。
7. 指出角色自相矛盾。
8. 询问世界书中的隐蔽事实。
9. 提前结束。
10. 继续 30 轮后的长上下文行动。

验收要求：

- 反应承认用户具体行动，不只复述输入。
- 三开场后续存在明显关系差异。
- 人格、称呼、边界和语言风格一致。
- 事实不随意重置。
- 不强制合流。
- 不连续三轮复用同一台词骨架。

### 15.6 分支验收

1. 在第 5 轮编辑用户消息，原第 6–10 轮仍可返回。
2. 新分支产生不同 Scene State。
3. 在同一 AI Turn 生成 3 个 Candidate，三个均保留。
4. 从 Candidate 2 继续后，再切 Candidate 1 时提示分支选择。
5. 刷新后活动 Branch 和 Candidate 不变。
6. 旧 Branch 不写入当前 Branch 的长期记忆。
7. 分支命名、归档和恢复有效。
8. 删除默认只是归档，永久删除有二次确认。

### 15.7 记忆验收

- 谢幕前长期记忆数量不变化。
- 谢幕候选包含准确来源消息。
- 拒绝候选后后续聊天不可召回。
- 接受后 Pop 能在相关语境自然召回，而不是立即机械复读摘要。
- 重复点击保存不重复写入。
- 切换角色不串记忆。
- 导出作品包不包含用户经历。
- 撤销后检索和主动行为均不再使用。

### 15.8 Float 级手感验收

必须录制 390×844 和 375×812：

- 桌面拖动 1:1 跟手，边缘有阻尼，松手不跳页。
- 快速轻扫与慢速长拖均能正确提交。
- 图标短按打开、长按编辑、拖动不误开。
- App 打开后桌面不穿透。
- 返回准确退到上一级，连续返回最终回原桌面页。
- 聊天房间返回再进，滚动和草稿保持。
- 情景生成时回桌面，生成继续且完成通知能准确打开原 Branch。
- 键盘弹起不遮挡输入和最后一条消息。
- 空状态只有一个主行动。
- 无全屏白闪、角色闪帧、重复加载 Skeleton 和不可点击透明层。

### 15.9 性能门

- 点击/按压视觉反馈：目标 <100ms。
- 本地 App 首个可交互状态：目标 <250ms；否则 100ms 内出现骨架。
- 发送用户消息后的本地回显：<100ms。
- 页面手势目标 60FPS；普通设备上不得持续出现 >50ms 主线程长任务。
- 页面切换无累计 Layout Shift。
- 角色动作切换零透明闪帧。
- 30 轮情景后输入、滚动和 Candidate 切换无明显退化。
- 图片、音频和背景有缓存上限与释放策略。

### 15.10 视觉门

截图矩阵：

- 390×844、375×812、360×800、1440×900。
- 作品库、详情、三开场、舞台默认、生成中、错误、分支、谢幕、空状态。
- 小手机首页第 1/2 页、图标编辑、文件夹、App 打开、键盘、后台通知。
- 桌宠 idle、说话、情景开始、情景结束、素材降级。

人工判定：

- 第一眼知道角色是谁、正在做什么、下一步是什么。
- 角色不是 UI 边角装饰。
- 没有大面积无意义磨砂层层嵌套。
- 不像后台、表单、测试页或功能陈列馆。
- 同一角色在各模式中脸、年龄、服装逻辑、声音和动作风格一致。

---

## 16. 真实模型质量评测

自动合同绿后，使用用户已经配置的任一真实 Provider 完成，不把 Key 写入仓库或证据包。

测试矩阵：三开场 × 3 次随机运行 × 每次至少 12 轮；其中一条运行到 30 轮。

评分维度，每项 1–5：

- 角色一致性。
- 用户行动因果响应。
- 与当前关系阶段一致。
- 世界事实正确性。
- 长上下文连续性。
- 不抢用户行动、不替用户说话。
- 文风自然、不像系统说明。
- 重复度。
- 结束建议自然度。
- 表现 Envelope 与文字一致性。

放行：

- 关键项平均 ≥4.0。
- 角色身份/边界硬错误为 0。
- 用户行动被完全忽略的回合 <5%。
- 连续模板化重复为 0。
- 如未达到，必须迭代 Prompt、Lore、Scene State 或 Reducer；不能通过放宽评分过关。

---

## 17. Definition of Done

只有同时满足以下条件，Cursor 才能把本轮标记为 `product_review`：

1. 聊天、Pop、情景剧使用同一个 Conversation V2 真源。
2. 正式情景路径不再依赖固定剧情树和关键词路由。
3. 夜雨车站三开场可自由输入并稳定运行 30 轮。
4. 编辑、重生成、Candidate、Checkpoint、Branch 均非破坏性。
5. World Info 有作用域、激活、预算、插入和 Trace。
6. 模型失败不会静默退回预制剧情。
7. 只有接受分支能形成共同经历，且可查看、拒绝和撤销。
8. Pop、桌宠、小手机和情景舞台保持同一角色身份与记忆。
9. 动作切换无闪帧，有自然 idle 轮播和同角色降级。
10. 小手机达到第 10 节和第 15.8 节的手感门。
11. Studio 能创建、预览、导出和重新导入原创作品包。
12. 自动测试、真实 DOM E2E、真实模型评测、截图和录屏证据齐全。
13. 没有 P0/P1 产品问题。
14. 已知外部限制被诚实标记，没有伪造真机、账号或市场验证。

如果只完成数据结构和测试，状态是 `implementation_green`。  
如果行为和证据通过但尚未人工审美复核，状态是 `evidence_green`。  
只有全部本地门通过并形成合并包，才是 `product_review`。  
用户亲自认可后才是 `user_accepted`。

---

## 18. 最终交付给用户时怎么说

最终回复只能包含：

1. 这次真正改变了什么用户行为。
2. 夜雨车站是否已成为开放角色体验，而不是剧情树。
3. 小手机手感有哪些可见变化。
4. 哪些证据可以点击查看。
5. 哪些事项仍依赖真机、外部账号或用户审美签署。
6. 一条从桌宠 → Pop → 夜雨车站 → 分支 → 谢幕 → 回 Pop 的建议验收路径。

禁止再次用“接线全绿”“合同 100/100”“本地软件层齐了”等没有产品语义的句子作为结论。

