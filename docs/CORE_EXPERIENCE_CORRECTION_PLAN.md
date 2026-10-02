# 月栖核心体验纠偏与产品化执行计划

> 计划代号：Core Experience V2（CEV2）
> 适用仓库：`F:\beautiful`
> 版本：1.0
> 日期：2026-07-25
> 状态：主 Agent 自治推进中 · C0 证据门放行 · C1 进行中
> 唯一施工依据：本文件
> 历史资料：`docs/LIVING_PHONE_PLAN.md`、`docs/align/F0.md`–`F7.md` 和 `docs/align/UPGRADE_RUN.md` 只用于理解已有代码，不再作为“产品已完成”的依据。

---

## 0. 总命令与最高优先级规则

本轮不是继续扩 F8，也不是给现有页面补几层 CSS。目标是把已经接通的技术管道重新组成三条真正成立的恋爱伴侣体验：

1. **她像一个一直生活着的人**：聊天、朋友圈、日记、TA 的手机、情景剧和桌宠共享同一个角色连续性。
2. **她的手机可以被探索**：不是四个互不相关的“生成痕迹”按钮，而是同一天生活在多个 App 中留下的一致证据。
3. **她能和用户共同经历与创作**：情景剧有舞台、人物、动作、语音和结果；共创是多轮协作，不是一键生成表单。

本文件优先于旧 F0–F7 文档。硬规则如下：

- C0–C6 全部通过前，禁止新增消费者顶层 App。
- 禁止把 `verify x/x`、DOM 存在、路由可打开或 store 可写当成产品完成证据。
- 禁止实现者自检后直接标记“产品放行”。
- 禁止复制外部对照项目的源码、CSS、素材、提示词或独特文案；只对齐公开产品语义与通用交互规律。
- 禁止用灰框、tone 色块、emoji、裸列表或大面积空白代替最终 UI。
- 禁止主要入口首次进入显示“还没有内容，点击生成”。无 Key 时必须提供高质量、角色一致的离线首日内容。
- 禁止在消费者首页暴露接口、正则、预设、资源库、扩展 SDK、审核、举报、门禁等高级工具。
- 每波只完成一个从入口到结果的纵向闭环，不得一波横向堆十个壳。
- 所有迁移必须保留现有聊天、角色、记忆、日记、语音配置和角色包；不得静默清空或覆盖。

---

## 1. 产品北极星与边界

### 1.1 一句话目标

月栖是以可动悬浮角色为入口的跨端 AI 恋爱伴侣：桌宠承载“她在身边”，Pop 承载即时交流，小手机承载她的生活世界，TA 的手机和情景剧承载探索与共同经历，创作者中心承载角色定制。

### 1.2 三层结构

| 层级 | 核心任务 | 不应出现 |
|---|---|---|
| 系统悬浮伴侣 | 看见她、点她、短聊、语音、看屏幕、动作反馈 | 管理后台、世界书、应用市场 |
| App / 小手机 | 聊天、动态、日记、共同活动、剧情、探索她的生活 | 参数墙、正则、扩展审核、空壳 App |
| 创作者中心 | 角色卡、外表、动作、世界书、预设、资源和剧本 | 冒充恋爱体验的一键表单入口 |

### 1.3 本轮必须完成

- 小手机首页重新编排，消费者功能和高级功能分层。
- 建立统一的角色生命事件账本与“某一天生活包”。
- 重做“侧写 / TA 的手机”完整纵向体验。
- 重做情景剧演出，并复用角色动作、表情和语音。
- 重做共创为多轮会话、作品画布、版本与发布。
- 将结果正确投影回 Pop、日记、动态和悬浮角色状态。
- 建立独立验收、截图证据、真实路径和真机分级。

### 1.4 本轮冻结或隐藏

以下代码保留，但不出现在默认消费者首页，也不占用本轮开发时间：

- 栖市、扩展 SDK、账号门禁、成年审核、举报、管理中心、本地助手。
- 多人联机、游戏大厅和更多小游戏。
- 新商城、新经济系统、公开社交网络。
- 超出本计划六个 App 的更多侧写子 App。
- 新的独立生图产品；绘境只作为创作者工具或剧情素材来源。
- 复杂 3D、桌面物理、全双工语音、持续视频上传。

### 1.5 现有模块处理

| 模块 | 处理 |
|---|---|
| 聊天、模型、流式回复 | 保留，作为共享 Conversation Core |
| 角色卡、记忆、日记、世界书 | 保留，统一从新事件层读取或写入 |
| TTS / STT | 保留，接入情景剧和悬浮短聊 |
| Runtime Protocol / 桌宠动作 | 保留，扩展为情景剧与聊天共享播放器协议 |
| F0 同栖时间线 | 保留兼容入口，升级为生命事件账本的摘要投影 |
| F1–F7 store/schema | 可复用则迁移；不能支撑新语义时标 legacy，不为保旧代码而扭曲产品 |

---

## 2. 完成等级与状态管理

旧计划的“core 已落地”统一重定级为 **L1 Contract Green**。新状态只能使用：

| 等级 | 名称 | 定义 | 签字人 |
|---|---|---|---|
| L0 | Not Started | 尚未施工或只有旧代码 | 实现者 |
| L1 | Contract Green | schema、store、纯函数、迁移和降级测试通过 | 实现者 |
| L2 | Journey Green | 用户完整路径自动化可走通，状态持久化并跨模块投影 | 实现者 + 自动测试 |
| L3 | Product Accepted | UI、内容、交互、动效、语义和异常路径人工验收通过 | 独立 Checker / 用户 |
| L4 | Device Accepted | Android / Windows 真实宿主、权限、语音和性能通过 | 真机 Checker / 用户 |

硬规则：

- L1 不得写“已完成”；L2 不得写“视觉通过”。
- L3 前必须提交截图和逐步手测记录。
- L4 前不得宣称 Android / Windows 商用可交付。
- 实现 Cursor 只能把阶段推进到 `product_review`，不能自己签 `accepted`。

每波状态必须使用：

```text
阶段: Cn
当前等级: L0 | L1 | L2 | product_review | L3 | L4
实现提交/工作树: ...
自动测试: ...
截图目录: ...
人工路径: 未测 | 通过 | 打回
未通过项: ...
下一步: ...
```

---

## 3. 目标信息架构

### 3.1 小手机桌面

默认桌面最多 12 个消费者入口。

**Widget 页：**

- 时间 / 问候：真实当前时间；天气不可用时显示本地氛围，不伪造网络数据。
- 角色在场：角色半身或全身、当前状态、最近一句主动消息，点击进 Pop。
- 今日关系：下一条纪念日、日历或共同活动；无内容时显示角色建议，不显示空卡。
- 正在一起：正在听、一起看、情景剧进度三者取一，点击继续。

**应用页：**

| 位置 | App | 用户语义 |
|---|---|---|
| 1 | TA 的手机 | 探索她今天留下的生活痕迹 |
| 2 | 情景剧 | 和她共同经历一幕剧情 |
| 3 | 日记 | 查看两个人共同生活记录 |
| 4 | 相册 | 查看用户侧与共同相册 |
| 5 | 日历 | 纪念日、约定与共同计划 |
| 6 | 一起听 | 共听和情绪陪伴 |
| 7 | 一起看 | 共读 / 共看片段 |
| 8 | 记忆 | 查看和管理重要关系记忆 |
| 9 | 角色 | 当前角色、关系和外观快捷入口 |
| 10 | 创作者中心 | 高级编辑能力唯一入口 |
| 11 | 美化 | 壁纸、组件与小手机外观 |
| 12 | 设置 | 模型、语音、备份、隐私和系统设置 |

Dock 固定为 `Pop`、`朋友圈`、`桌宠`、`一起听`。

从默认桌面移除：栖店、栖市、接口、剧章、共创、游戏、资源库、绘境。它们分别并入共同活动、创作者中心、设置或实验开关。

### 3.2 导航原则

- 日常用户从角色或内容进入，不从功能分类进入。
- 每个 App 只有一个明确主任务。
- 列表、详情、编辑/播放分层，不在同屏混放。
- 返回保持滚动位置、选择与未完成会话。
- TA 的手机可以有独立 OS，但桌面必须有内容和个性，不能复制同样 App 到网格和 Dock。
- 创作者中心显式标注“高级”，不伪装成角色生活 App。

---

## 4. 统一角色连续性架构

### 4.1 新增领域层

```text
src/life/
  schema.js
  validate.js
  store.js
  generator.js
  projections.js
  prompt.js
  migration.js
  bridge.js
  fixtures/xingli-day-001.js
```

- `schema.js`：数据形状、版本和枚举。
- `validate.js`：校验、修复和拒绝不可恢复数据。
- `store.js`：唯一持久化入口，角色隔离，按日期查询。
- `generator.js`：一次生成完整生活包；禁止按 App 独立生成主故事。
- `projections.js`：从生活包构造各 App 视图模型。
- `prompt.js`：为 Pop / 情景剧提供有限摘要，不泄漏全部私密内容。
- `migration.js`：迁移旧 F2a payload，不清空用户数据。
- `bridge.js`：兼容 F0 `appendCohabitEvent`，逐步消除双时间线。

### 4.2 数据契约

```js
CharacterLifeEvent = {
  id, schemaVersion, characterId, occurredAt, durationMinutes,
  type, summary,
  participants: [{ id, name, relation }],
  location, emotionBefore, emotionAfter,
  privateFacts: [], memoryRefs: [], relatedEventIds: [], evidenceIds: [],
  visibility: "private" | "shared" | "discoverable",
  source: "seed" | "model" | "chat" | "scenario" | "user",
};

EvidenceItem = {
  id, eventId,
  app: "messages" | "album" | "calendar" | "memo" | "browser" | "orders",
  kind, occurredAt, title, content, assetRef, counterpart,
  crossRefs: [], discoverable,
};

CharacterDayPack = {
  id, schemaVersion, characterId, localDate, theme, generatedAt, source,
  events: [], evidence: [], appSummary: {},
  consistency: { checkedAt, errors: [], warnings: [] },
};

ObservationEvent = {
  id, characterId, dayPackId, evidenceId, observedAt, dwellMs,
  reactionState: "unseen" | "eligible" | "used",
};
```

### 4.3 生成和投影规则

- 一次模型调用生成完整 `CharacterDayPack`。
- 必须与角色卡、年龄、关系、作息、世界书和最近记忆一致。
- 每包 4–6 个生命事件、至少 12 个证据、至少 5 个跨 App 引用。
- 产品验收包覆盖六 App；时间、人物称谓和地点不得冲突。
- 私密事实不得直接全部进入 Pop prompt。
- 无 Key 时加载高质量 seed pack，不加载四份互不相关 fixture。
- 生成失败保留上一日内容并提示“今天还没有更新”，不得清空。
- 用户查看证据只写 `ObservationEvent`。
- 只有 `shared` 内容能直接进入日常聊天；`discoverable` 只有看过后才可产生含蓄反应。
- 情景剧谢幕生成生命事件和关系变化，后续聊天可自然提及。

---

## 5. 旗舰体验一：TA 的手机

### 5.1 产品语义与路径

不是临时伪造几页数据，而是进入她正在使用的一部手机，从相关痕迹中发现她的生活。

```text
小手机桌面 → TA 的手机 → 选择角色（单角色直接进入）
→ 首次关系边界说明 → TA 的锁屏 → TA 的桌面
→ App 列表 → 详情 → 跨 App 线索 → 退出
→ Pop 根据用户实际看过的内容产生有限反应
```

### 5.2 首版固定六 App

| App | 首屏密度 | 详情要求 | 关联 |
|---|---:|---|---|
| 讯息 | ≥5 会话 | 日期分隔、左右气泡、头像、已读/未读 | 引用日历、照片、订单或备忘 |
| 相册 | ≥3 相册、≥8 项 | 大图、时间、地点、说明 | 时间与事件一致 |
| 日历 | 本周 ≥3 项 | 日程、参与者、地点 | 对应聊天约定或订单 |
| 备忘 | ≥4 条 | 层级、置顶、修改时间 | 礼物、计划、未说出口的话 |
| 浏览器 | ≥8 条 | 分组、时间、标题、摘要 | 搜索对应事件动机 |
| 订单 | ≥3 条 | 商品卡、状态；不使用真实法币交易 | 对应聊天、礼物和日历 |

短信旧模块保留兼容，但不占首版六 App；以后可并入“通讯”文件夹。

### 5.3 UI 规格

- 单角色直接进入，多角色卡含头像、名字、关系称谓和最近更新时间。
- 首次边界说明只出现一次，不模拟破解密码。
- 锁屏有个性壁纸、时间、日期和 2–4 条 DayPack 通知；解锁 220–320ms。
- 内层桌面与外层月栖风格不同，有照片/日程组件、未读角标和活动时间。
- 网格与 Dock 不重复同样四个 App。
- 每个 App 有独立信息架构，但共用导航、字号、触控规范。
- 真实缩略图优先；离线图使用自有角色素材或自制场景插画。
- 详情返回保留滚动位置。
- 禁止显示“正在伪造”“生成痕迹”“fixture”“appKey”等开发语义。

### 5.4 功能验收

- 同一事件至少可从两个 App 找到，时间、人物、地点一致。
- 讯息中的照片引用能打开相册项；日程引用能打开日历详情。
- 退出再进入保持阅读位置和已查看状态。
- 角色切换后内容完全隔离。
- DayPack 坏 JSON 被拒绝或修复，不混合新旧半页数据。
- 用户看过 discoverable 证据后，Pop 最多在合适时机提及一次；未看过不得提及。

---

## 6. 旗舰体验二：情景剧

### 6.1 产品语义与页面

情景剧是用户与角色共同经历的沉浸演出，不是文本选项页，也不是剧本管理后台。

1. **剧场书架**：封面、标题、角色、时长、情绪、进度和继续。
2. **演出模式**：背景、角色、对白、动作、语音、选择和自由说。
3. **创作工坊**：结构、角色、世界书、节拍、分支和素材；只从创作者中心或“编辑此剧本”进入。

运行状态固定为：

```text
library → setup → opening → playing
→ waiting_choice / waiting_user → resolving → playing
→ finale → memory_commit
```

暂停、恢复、退出和异常恢复必须是显式状态。

### 6.2 Director 协议

```js
ScenarioTurn = {
  schemaVersion, sceneId, beatId,
  narration, speakerId, dialogue,
  emotion, expressionId, actionId,
  backgroundId, soundId,
  voice: { enabled, style },
  camera: { shot, focus, transition },
  choices: [{ id, text, intent }],
  stateDelta: { tension, intimacy, trust, flags: [] },
  memoryCandidate,
};
```

- action/expression 必须在角色包白名单；未知值映射安全 fallback。
- 背景、音效、TTS、动作单项失败只降级对应表现，不阻断对白。
- 每回合最多一个主动作，避免闪烁。
- 说话前完成表情/动作过渡；TTS 与口型由共享 Runtime 执行。
- 关系数值只用于内部状态，不直接做恋爱游戏数值面板。

### 6.3 UI 和内容规格

- 移动端上方 58%–68% 是舞台，下方是对白层。
- 选择用底部选择层，不把舞台推走；自由说为次级入口。
- Windows 舞台居中，文本行宽不超过 36em，支持键盘选择。
- 开幕 3 秒内出现背景、角色和入场动作。
- 首个 90 秒至少 3 次自然动作/表情变化。
- 无新动作时角色继续自然 idle，不得永远站立同一帧。
- 场景转场 220–450ms，并尊重 reduced motion。

首版只打磨三个内置剧本：夜雨车站、屋顶晚风、雨天咖啡馆。每个包含：

- 1 个背景组、6–10 个主节拍、至少 2 个结局。
- 至少 3 个动作、4 个表情。
- 1 个可写入日记与生命事件的谢幕摘要。
- 完整 deterministic 离线演示路径。

### 6.4 功能验收

- 选剧本→两次选择→一次自由说→暂离→刷新→恢复→谢幕完整可走。
- 恢复 scene/beat/state，不重复已提交结果。
- 谢幕写入日记、生命事件和关系状态各一次；重复点击幂等。
- 回 Pop 后可在自然语境中提到共同经历。
- 无 TTS、无背景或动作缺失时仍可演出。
- Director 坏 JSON 使用离线 turn 或安全重试，不出现裸错误。

---

## 7. 旗舰体验三：共创

### 7.1 产品语义与任务

共创是用户、角色和创作引擎围绕一个作品进行多轮协作。角色必须表达偏好、提出建议、接受修改并留下版本。一键生成只能作为快速起稿。

本轮固定三种任务：

- 一起补完角色往事。
- 一起写一幕约会剧情。
- 一起建立关系与共同世界设定。

### 7.2 数据契约

```js
CreationSession = {
  id, schemaVersion, characterId, type, title, goal,
  status: "active" | "paused" | "published" | "archived",
  turns: [], artifactId, activeVersionId, createdAt, updatedAt,
};

CreationTurn = {
  id, role: "user" | "character" | "assistant", text,
  proposals: [{ id, text, patch, status }], createdAt,
};

ArtifactVersion = {
  id, artifactId, parentVersionId, content, summary,
  sourceTurnIds: [], createdAt,
};
```

### 7.3 UI 规格

- 入口显示“继续上次共创”、三个任务模板和最近作品。
- 移动端为“对话 / 作品”双 Tab；切换不丢输入和滚动。
- Windows 为左会话、右作品双栏。
- 角色消息有头像、情绪、输入/思考状态。
- Proposal 可单独接受、修改、拒绝；接受形成新版本。
- 画布显示当前版本、历史、撤销和恢复。
- 发布页明确显示将写入角色卡、世界书或情景剧库的字段和 diff。
- 发布前备份目标记录；成功后可去角色页、去演出或继续共创。

### 7.4 功能验收

- 至少完成 3 轮互动才可标完整作品；快速发布仍需明确确认。
- 接受生成新版本，拒绝不修改作品；撤销刷新后保持一致。
- 发布人设只修改字段白名单，不覆盖头像、动作、语音或无关世界书。
- 发布剧本立即出现在剧场书架并可离线演出。
- 角色偏好与当前角色卡一致，不同角色不能说同一套话。
- 无 Key 时提供完整本地协作样例，不只给一个静态结果。

---

## 8. 创作者中心重组

创作者中心是以下能力的唯一消费者可见高级入口：

- 角色卡与关系设定。
- 外表、动作、表情和角色包检查。
- 世界书、预设、正则。
- 共创作品、剧本工坊。
- 资源库、贴纸、背景和绘境。

接口、TTS/STT、备份与隐私仍放设置。

UI 要求：

- 首页是角色/项目概览，不是几十个表单。
- 先选角色再编辑资源，避免串角色。
- 高级字段默认折叠。
- 所有写入有 dirty、保存中、已保存、失败和撤销反馈。
- 强能力可以保留，但不能污染普通用户恋爱体验。

---

## 9. 统一 UI 与动效标准

### 9.1 设计原则

- 气质：温柔、亲密、安静、有生活感；不用后台 SaaS 卡片墙。
- 一屏一个视觉中心，角色、照片、舞台或作品必须成为锚点。
- 一致不等于所有 App 都是白卡和圆角；信息架构必须符合 App 语义。
- 角色头像、全身形象、照片和场景优先于 emoji 与纯色占位。
- 磨砂只用于短暂浮层、顶栏和 Dock；正文禁止层层磨砂。
- 常规文字对比度达到 WCAG AA。

### 9.2 基础 Token

```text
spacing: 4 / 8 / 12 / 16 / 20 / 24 / 32
radius: 10 / 14 / 18 / 24 / pill
motion-fast: 160ms
motion-base: 240ms
motion-scene: 380ms
touch-min: 44px
content-desktop-max: 1120px
dialogue-line-max: 36em
```

### 9.3 必备状态

每个异步/数据页面必须有：初始内容或有意义空态、加载、成功、可恢复失败、离线/无 Key、权限拒绝（适用时）、重复点击防护。

### 9.4 禁止交付

- 大面积空白中间放一个按钮。
- emoji 作为最终主插画。
- 渐变矩形冒充照片或舞台。
- 一页全是 label/input/select/button。
- 同页超过两个同权重主按钮。
- 情景剧只显示角色名字，没有人物画面。
- 小手机桌面图标密集成能力清单。

---

## 10. 分波执行计划

执行顺序固定为：`基线 → 领域契约 → UI → 自动旅程 → 截图/录屏 → 独立 Checker`。前一波未到 L3，不得开始后一波的可见 UI；下一波领域准备可在前波 L2 后进行，但不得合并入口。

### C0：冻结、基线与重定级

**目标：** 停止错误完成叙事，建立可对比基线。

**允许修改：**

- 本计划、`docs/align/UPGRADE_RUN.md`。
- `docs/qa/core-experience/**`。
- 截图/检查脚本；不改产品功能。

**任务：**

1. 保存 390×844、375×812、1440×900 的小手机首页、TA 的手机、共创、情景剧基线。
2. 记录现有三条主路径和所有阻断/粗糙点。
3. F0–F7 全部重标为 L1 或更低，保留历史 verify 结果。
4. 新建 `docs/qa/core-experience/STATUS.md`。
5. 保存旧数据样本、备份恢复样本与测试角色。

**放行：** 截图、路径、状态和数据样本齐全；不得写“UI 后验”。

### C1：信息架构与小手机首页

**目标：** 首页像角色生活的手机，不像功能目录。

**主要文件：**

- `src/phone-shell/apps-catalog.js`
- `src/phone-shell/phone-shell.js`
- `src/phone-shell/home-layout.js`（新增）
- `src/phone-shell/os-prefs.js`
- `src/phone-shell/*.css`

**任务：**

1. 按 §3 重排 App、Dock、文件夹和高级入口。
2. 绑定四类真实 widget 数据。
3. 移除首页高级工具和冻结功能。
4. 修复首次进入、锁屏、解锁、横滑、返回和恢复位置。
5. 完成 375/390/桌面响应式。

**自动门：**

- 可见消费者入口 ≤12。
- Dock 恰好 4 个且不重复网格入口。
- widget 来自 repository/selector，不硬编码角色名和固定时间。
- 无横向溢出、无双滚动，触控目标 ≥44px。

**人工门：** 三视口截图通过；第一眼能认出角色、当前关系和下一步，不依赖说明文字。

### C2：生命事件账本与 DayPack

**目标：** 建立所有生活内容的一致事实源。

**主要文件：** `src/life/**`、`src/memory/cohabit-timeline.js`、备份模块、prompt 组装模块。

**任务：**

1. 实现 §4 schema、validator、store、generator、projection 和 migration。
2. 制作星梨首日高质量 seed pack。
3. 旧 F2a payload 迁移为 legacy evidence，不丢失。
4. 接入备份、恢复、角色删除与角色切换。
5. 接入有限 prompt 摘要与 observation 规则。

**自动门：**

- 正常、缺字段、坏时间、重复 id、跨角色引用、循环 crossRef 全覆盖。
- DayPack 至少 12 evidence、5 crossRefs、4 events。
- 同事件所有时间/人物/地点一致。
- 迁移前后旧 payload 可查看。
- 导出→清空测试仓→导入后深度等价。

### C3：TA 的手机产品化

**目标：** 完成 §5 六 App 探索闭环。

**主要文件：**

- `src/sidewrite/ui/**`
- `src/sidewrite/generate/**`
- `src/sidewrite/schema/**`
- `src/sidewrite/store.js`
- `src/sidewrite/*.css`

**任务：**

1. 用 DayPack projection 替换各 App 独立生成主路径。
2. 删除所有可见“生成痕迹 / 正在伪造”文案与按钮。
3. 完成锁屏、桌面、六 App、详情、cross-link 与已读状态。
4. 写 ObservationEvent，并接 Pop 有限反应。
5. 完成角色隔离、离线、失败、刷新和恢复。

**自动旅程：**

```text
首页 → TA 的手机 → 解锁 → 讯息 → 某聊天详情
→ 打开照片引用 → 相册详情
→ 返回桌面 → 日历 → 同事件详情
→ 退出 → Pop → 验证 prompt 只含已观察摘要
```

**人工门：** 六 App 各提交列表、详情截图；不得有空壳感、开发文案或重复 Dock。

### C4：情景剧播放器

**目标：** 完成 §6 沉浸演出，暂不扩创作工坊。

**建议结构：**

```text
src/scenario/runtime/
  schema.js
  state-machine.js
  director-adapter.js
  action-mapper.js
  persistence.js
src/scenario/player/
  player-ui.js
  stage-renderer.js
  dialogue-layer.js
  choice-layer.js
  controls.js
src/scenario/library/
src/scenario/presets.js
```

旧 `theater-ui.js` 逐步拆分；拆分期间不得维护两套 player 状态。

**任务：**

1. 固化 ScenarioTurn schema 与状态机。
2. 将角色包动作、表情、TTS、背景接入 player。
3. 打磨三个内置剧本。
4. 完成暂停、恢复、谢幕、幂等写入和异常降级。
5. 回写生命事件、日记和 Pop。

**自动旅程：** 选剧本→演出 4 回合→暂停→刷新→恢复→谢幕→回 Pop。

**人工门：** 提交 30–60 秒录屏；前三秒有人物入场，90 秒内至少三次动作/表情变化。

### C5：共创会话与发布

**目标：** 用多轮协作替换一键表单。

**建议结构：**

```text
src/cocreate/session-schema.js
src/cocreate/session-store.js
src/cocreate/session-engine.js
src/cocreate/artifact-store.js
src/cocreate/publish.js
src/cocreate/cocreate-ui.js
src/cocreate/cocreate-app.css
```

**任务：**

1. 实现 §7 数据契约。
2. 完成三种任务、会话/画布 UI、建议接受和版本。
3. 完成发布 diff、备份与目标字段白名单。
4. 发布剧本接 C4 library；发布设定接角色卡/世界书。
5. 旧草稿迁移为单版本 artifact。

**自动旅程：** 开始→3 轮→接受/拒绝→撤销→恢复→发布→剧场打开。

**人工门：** 移动双 Tab 和 Windows 双栏截图通过；页面不能是表单墙。

### C6：跨体验整合与消费者精修

**目标：** 三条旗舰体验共享同一个角色，而不是三个孤岛。

**任务：**

1. 情景剧、共创、TA 的手机结果正确进入生命事件。
2. Pop、朋友圈、日记、主动消息只读取权限允许的摘要。
3. 桌宠在情景剧/聊天中执行同一动作协议，结束后回自然 idle 轮播。
4. 完成创作者中心与设置入口重组。
5. 隐藏冻结功能，清理敬请期待、测试按钮、内部 ID 和临时文案。
6. 完整回归备份、恢复、角色切换、无 Key 和离线。

**最终旅程：**

```text
桌宠主动出现 → 打开 Pop 聊两句 → 进入小手机
→ 在 TA 的手机发现线索 → 回 Pop 得到有限反应
→ 开始情景剧并谢幕 → 日记出现共同经历
→ 共创修改剧本 → 再次进入剧场看到新版本
```

### C7：宿主与真机验收

只在 C0–C6 全部 L3 后开始：

- Windows Electron：透明置顶、拖动、吸边、动作、文字气泡、TTS、打开小手机。
- Android Overlay：权限引导、前台服务、输入焦点、软键盘、动作、文字/语音、屏幕单帧。
- 宿主只调用共享 Core/Runtime，不复制业务逻辑。
- Android 与 Windows 各做 30 分钟稳定性测试，记录内存、CPU、重启、权限撤销和网络失败。

---

## 11. 自动测试与验收体系

### 11.1 脚本分层

新增：

```text
scripts/verify-core-c0.mjs
scripts/verify-core-c1.mjs
...
scripts/verify-core-c6.mjs
scripts/verify-core-journeys.mjs
scripts/capture-core-experience.mjs
scripts/check-mobile-layout.mjs
```

每波验证必须区分：

- `contract`：schema、store、pure function、migration。
- `journey`：浏览器真实点击、刷新、返回、持久化。
- `semantic`：角色一致、跨 App 引用、权限和时间一致。
- `layout`：视口、溢出、触控尺寸、关键元素可见。

禁止用读取源码字符串、检查文件存在或 `querySelector` 存在代替 journey。

### 11.2 确定性模型替身

测试环境必须提供 deterministic provider：

- 固定输入返回固定合法 DayPack / ScenarioTurn / CreationTurn。
- 提供坏 JSON、超时、空响应、未知 action、重复 id 五类失败样本。
- E2E 不依赖真实 API Key 或网络。
- 真实 Key 只用于 L4 手测，不替代 deterministic 测试。

### 11.3 截图矩阵

| 视口 | 用途 |
|---|---|
| 375×812 | 小屏 Android |
| 390×844 | 主移动基线 |
| 1440×900 | Windows App |

每个波次截图默认、详情、加载、失败、离线、恢复后。情景剧另交录屏，共创另交双栏截图。

```text
docs/qa/core-experience/Cn/
  baseline/
  candidate/
  REVIEW.md
```

`REVIEW.md` 必须列页面、测试数据、结论和问题，不能只放图片。

### 11.4 性能门槛

- 本地数据页面 300ms 内出现内容或骨架。
- 小手机本地路由目标 200ms 内完成视觉切换。
- 情景剧动作切换不得造成整张角色图闪烁。
- 60 秒连续演出无不断增长的计时器、音频节点或 listener。
- 100 条消息/证据不明显卡顿，必要时分页或虚拟化。
- 移动端无持续高频重排和无意义动画。

### 11.5 回归命令

每波至少运行：

```text
npm run build
npm run verify:core-cN
npm run verify:core-journeys
npm run verify
```

旧 `verify:align-f0`–`f7` 只作为兼容回归，不再作为新阶段放行依据。

---

## 12. 独立 Checker 制度

### 12.1 实现 Cursor 交付

每波只提交：

- 变更文件清单。
- 新增/修改数据契约。
- 自动测试结果。
- 截图/录屏目录。
- 已知限制。
- 与本计划验收条款逐项映射。

实现者不得写“视觉已经很好”“企业级已完成”等主观结论。

### 12.2 Checker 工作方式

用全新上下文的 Cursor/Codex 会话，先读本计划、diff 和运行产物，再独立操作产品。实现者口头说明不算证据。

```text
阶段: Cn
结论: product_review | 打回 | L3 接受

功能路径:
- [ ] ...
语义一致:
- [ ] ...
UI / 动效:
- [ ] ...
异常 / 离线:
- [ ] ...
证据:
- 截图: ...
- 录屏: ...
- 测试: ...
阻塞问题:
1. ...
非阻塞问题:
1. ...
```

### 12.3 一票否决

出现任一项直接打回：

- 首屏或主路径为空壳、表单墙、裸列表。
- 角色、时间、地点、称谓或关系跨 App 冲突。
- 情景剧无人物画面或始终同一静态姿势。
- 共创仍是一次输入一次输出。
- 主要功能无 Key 就完全不可演示。
- 切角色串数据。
- 刷新丢主进度或重复写入关系/日记。
- 移动视口横向溢出、主要按钮不可见或触控过小。
- 复制外部源码、素材或版权文案。
- 自动测试全绿但无截图、录屏或人工路径证据。

---

## 13. Cursor 每波执行模板

把下列模板连同具体 `Cn` 交给 Cursor：

```text
你正在执行 F:\beautiful\docs\CORE_EXPERIENCE_CORRECTION_PLAN.md 的 Cn。

硬规则：
1. 只执行 Cn，不提前做下一波，不新增计划外 App。
2. 开始前读取本计划、相关现有模块和 git diff；保留用户已有改动。
3. 先保存基线截图和路径记录，再改代码。
4. 只学习公开产品语义，禁止复制外部仓源码、CSS、素材、提示词或文案。
5. 先完成领域契约和迁移，再完成 UI；不能用 UI mock 绕开真实数据。
6. 必须实现加载、成功、失败、离线、恢复和重复点击防护。
7. 必须增加 contract、journey、semantic、layout 四类验证中本波适用项。
8. 必须运行 build、本波验证、完整 journey 和既有 verify。
9. 必须在规定视口保存截图；情景剧必须录屏。
10. 只能把状态推进到 product_review，不能自行签 L3/L4。

开始时输出：
- 当前基线
- 本波文件边界
- 数据迁移风险
- 验收条款映射

完成时输出：
- 变更文件
- 测试结果
- 截图/录屏路径
- 未通过或需 Checker 判断的项目
- 是否仍有 placeholder / legacy fallback
```

---

## 14. 最终产品验收清单

### 14.1 用户体验

- [ ] 桌宠、Pop、小手机、TA 的手机、情景剧是同一角色连续体。
- [ ] 小手机首页不超过 12 个消费者入口，没有平台后台感。
- [ ] 首次进入每条主路径都有完整高质量内容。
- [ ] TA 的手机六 App 内容一致并可跨 App 发现线索。
- [ ] 情景剧有背景、人物、动作、表情、选择、自由说、暂停恢复和谢幕。
- [ ] 共创至少三轮，有画布、版本、撤销和发布。
- [ ] Pop 和日记正确反映已发生、允许共享的事件。

### 14.2 UI

- [ ] 375×812、390×844、1440×900 全部通过。
- [ ] 无裸 placeholder、emoji 主插画、重复 Dock、表单墙和无意义空白。
- [ ] 关键转场、人物动作和 reduced motion 正常。
- [ ] 每个 App 有独立而合理的信息架构。
- [ ] 人物视觉在主要体验中是主角，不被磨砂卡淹没。

### 14.3 工程与数据

- [ ] 生命事件是角色生活唯一事实源，旧时间线经 bridge 兼容。
- [ ] 所有 LLM 输出有 schema、验证、修复和 fallback。
- [ ] 角色隔离、备份、迁移、幂等和坏数据恢复通过。
- [ ] 自动测试不只检查选择器和源码字符串。
- [ ] 无 Key、离线和真实 Key 三种环境均有明确结果。
- [ ] 没有外部对照源码、素材和许可证污染。

### 14.4 宿主

- [ ] Windows 透明悬浮角色通过 30 分钟稳定性测试。
- [ ] Android Overlay 通过权限、输入、后台、语音和屏幕单帧测试。
- [ ] 宿主复用共享 Core/Runtime，没有第三套数据。
- [ ] iOS 明确降级，不承诺 Android 同款系统悬浮。

---

## 15. 初始状态板

| 阶段 | 内容 | 当前状态 | 放行条件 |
|---|---|---|---|
| C0 | 冻结、基线、重定级 | **product_review** | 证据见 `docs/qa/core-experience/`；实现者未签 L3 |
| C1 | 小手机信息架构 | L0 | 首页三视口 L3 |
| C2 | 生命事件 / DayPack | L0 | contract + semantic L2 |
| C3 | TA 的手机 | L0 | 六 App 完整路径 L3 |
| C4 | 情景剧播放器 | L0 | 完整演出 + 录屏 L3 |
| C5 | 共创会话 | L0 | 三轮共创 + 发布 L3 |
| C6 | 跨体验整合 | L0 | 最终用户旅程 L3 |
| C7 | Windows / Android | L0 | 真机 L4 |

状态只能由每波证据更新；不得因为代码量、commit 数、自动断言数量或“主路径大概能跑”直接跳级。
