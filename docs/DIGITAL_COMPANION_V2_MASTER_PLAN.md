# 月栖数字伴侣 V2：Prompt、冷启动、角色卡与工具闭环总计划

> 状态：Proposed，等待产品确认后进入实现  
> 日期：2026-08-17  
> 适用仓库：`F:/beautiful`  
> 依据：
> - `docs/COMPANION_PRODUCT_CUTOVER_RELEASE_PLAN.md`
> - `docs/qa/product-cutover/C8_RELEASE_GATE.md`（当前 FAIL）
> - `docs/formats/GENERIC_CHARACTER_CARD_COMPATIBILITY.md`
> - `docs/architecture/adr/002-data-entities-resources-portability.md`
> - `AGENTS.md`

## 1. 目标

把月栖从“角色卡文本 + 聊天模型 + 若干默认关闭的能力模块”收口成一个可验证的数字伴侣产品：

1. 冷启动完成后，首个真实回合就是**具体、有身份、有性别/代词认知、有关系立场、有自身边界**的数字伴侣，而不是通用客服或无条件附和者。
2. 用户在冷启动中选择的陪伴目的、互动偏好、亲密方式、主动频率、冲突修复、督促与静默边界，全部可追踪地进入持久层与 Prompt。
3. 用户可自由编辑角色设定、自由文本 Prompt、场景、首句、示例对话和世界书；系统只限制安全、容量、权限与事实边界，不限制正常创作自由。
4. 编辑、保存、预览、真实请求使用同一权威数据，刷新、切角色、切壳、重启后不丢失、不串角色。
5. 模型只看见当前真正可请求的能力，并通过唯一、幂等、可审批、可恢复、可审计的工具闭环执行。
6. Tavern / SillyTavern 常见 V2/V3 JSON/PNG 卡可以导入；所有字段必须明确标记为保留、转换、降权或丢弃，禁止静默丢失。
7. App、小手机、桌宠、主动消息、日记和情景等伴侣表面使用同一 Prompt 编译合同与角色权威源。

## 2. 非目标

本计划不做以下事情：

- 不把 CogPrism 全套多席认知管线直接搬进月栖。
- 不通过堆长 Prompt 代替数据合同、工具执行或持久化。
- 不把用户关系偏好写入可分享角色卡。
- 不让角色为了“取悦用户”而无条件服从、操控依赖或放弃自身人格。
- 不在缺少 C6/C7/C8 证据时静默把敏感联网与写能力开放给所有用户。
- 不把角色性别强制为二元；允许自定义、无性别与暂不设定。
- 不承诺任意第三方卡完全无损；只承诺支持矩阵中明确列出的路径。

## 3. 当前基线与必须承认的事实

### 3.1 已存在

- Canonical Prompt 装配、Character Identity、Context Broker、历史、记忆、世界书和日常状态。
- First Light 关系与互动偏好问卷。
- Character IndexedDB/SQLite/localStorage 存储、手机端 CRUD、角色隔离会话。
- Capability registry、ActionProposal、天气/搜索/日历/设备执行器。
- `.nychar`、generic JSON/PNG/WebP best-effort 导入。

### 3.2 当前产品级断链

- 新安装 `DEFAULT_CUTOVER_PROFILE = legacy`；时间、关系连续性、TurnUnderstanding、联网检索和统一记忆正式链路关闭。
- First Light 的 `purposes`、`conflictStyle`、`allowNudge` 等结构偏好写入后无人读取；角色性别/代词未采集。
- Prompt 编译同时读取 Character Store 与桌面 DOM，切角色后存在旧 DOM 串入新角色的风险。
- Prompt 预览仅是五行摘要，不是最终请求。
- 主聊天不传 OpenAI tools；流式客户端不处理 `tool_calls`。
- 冷启动 `import` 选项没有打开导入器。
- generic 卡的首句、示例对话、后置指令、世界书等存在缺失或断链。
- C8 Release Gate 当前 FAIL；不能把“代码存在”当作“正式链路已上线”。

## 4. 产品原则与权威顺序

### 4.1 人格与事实权威

从高到低：

1. Platform Reality / Safety
2. 用户本轮明确纠正与双方硬边界（取更严格者）
3. Character Identity
4. 当前已确认产品事实与 Tool Receipt
5. User × Character Relationship Contract
6. 同角色稳定记忆与已确认共同经历
7. 世界书 / 场景 / 会话摘要 / 近期历史
8. 检索结果、示例对话和风格补充

任何下层内容不得覆盖上层。导入的 `system_prompt`、`post_history_instructions`、世界书、网页结果和工具结果均视为**非可信内容**，只能作为数据块进入对应层。

### 4.2 “取悦用户”的产品定义

“取悦”只表示：

- 了解用户喜欢怎样被倾听、安慰、鼓励、调情、督促和陪伴。
- 在用户允许范围内调整主动频率、语言风格和关系距离。
- 记住用户明确的偏好与边界。
- 仍保留角色自己的判断、价值观、犹豫、拒绝和不同意见。

禁止：

- 默认同意所有观点。
- 通过嫉妒、内疚、威胁离开、隔离现实关系等方式提高留存。
- 将亲密度数值、付费或连续签到包装成情感义务。
- 把用户未回答的默认值当成明确同意。

## 5. 目标数据合同

所有合同须有运行时 schema 校验、`schemaVersion`、独立 `revision`、字段长度限制、来源与迁移报告。

### 5.1 `CharacterProfileV2`（可分享角色实体）

```ts
type CharacterProfileV2 = {
  schemaVersion: 2;
  characterId: string;
  revision: number;
  name: string;
  selfIdentity: {
    genderIdentity?: string;
    pronouns?: string[];
    speciesOrForm?: string;
    agePresentation?: string;
    occupationOrRole?: string;
    worldOrSetting?: string;
  };
  persona: {
    description: string;
    personality: string;
    values: string[];
    coreConflict?: string;
    autonomy: string;
    voiceAndManner: string;
    ownBoundaries: string[];
  };
  prompts: {
    characterSystemSupplement: string;
    characterDeveloperSupplement: string;
    postHistoryInstructions: string;
  };
  scenario?: string;
  greetings: {
    primary?: string;
    alternate: string[];
  };
  exampleDialogue: string[];
  tags: string[];
  loreEntryIds: string[];
  presentation: {
    avatarMediaId?: string;
    petId?: string;
  };
  provenance: {
    source: "builtin" | "user" | "import";
    importedFormat?: string;
    importedAt?: string;
    rawSourceRef?: string;
  };
  createdAt: string;
  updatedAt: string;
};
```

约束：

- 不包含用户身份、关系历史、对话、记忆、支付、权限或私密偏好。
- 导入 Prompt 只进入 Character Identity 的非可信补充区，不成为 Platform Kernel。
- 未知扩展保存在受限 `rawSourceRef`，不得直接注入 Prompt。

### 5.2 `UserCompanionPreferenceV2`（私有用户×角色关系）

主键：`(userId, characterId)`。

```ts
type ExplicitValue<T> = {
  value: T;
  source: "explicit" | "import_review" | "default" | "skipped";
  updatedAt: string;
};

type UserCompanionPreferenceV2 = {
  schemaVersion: 2;
  revision: number;
  userId: string;
  characterId: string;
  userIdentity: {
    preferredName?: ExplicitValue<string>;
    pronouns?: ExplicitValue<string[]>;
    callUserAs?: ExplicitValue<string>;
  };
  relationship: {
    type: ExplicitValue<string>;
    startMode: ExplicitValue<string>;
    sharedHistory?: ExplicitValue<string>;
    purposes: ExplicitValue<string[]>;
  };
  interaction: {
    supportStyle: ExplicitValue<string>;
    initiativeStyle: ExplicitValue<string>;
    conflictRepairStyle: ExplicitValue<string>;
    intimacyStyle: ExplicitValue<string>;
    flirtLevel: ExplicitValue<"off" | "light" | "open">;
    autonomyPreference: ExplicitValue<string>;
    nudgePolicy: ExplicitValue<"off" | "gentle" | "direct">;
  };
  boundaries: {
    allowProactive: ExplicitValue<boolean>;
    allowJealousExpression: ExplicitValue<boolean>;
    quietHours: ExplicitValue<{ start: string; end: string }>;
    userHardBoundaries: ExplicitValue<string[]>;
  };
  onboardingVersion: number;
  createdAt: string;
  updatedAt: string;
};
```

约束：

- 不进入 `.nychar` 导出。
- 角色自身边界、用户边界、平台边界冲突时取更严格者。
- `default` 与 `skipped` 不等于用户同意敏感/主动能力。
- 主动消息、督促与免打扰必须由调度/策略层执行，不得只靠 Prompt。

### 5.3 `TurnExecutionSnapshotV1`

每一轮开始后冻结：

- `turnExecutionId`
- `conversationId/sessionId`
- `conversationRevision`
- `speakerCharacterId`
- 当前 DM 或群聊全部参与角色及其 `revision`
- `userId`
- `relationshipScope`
- `UserCompanionPreferenceV2.revision`
- locale / conversation language
- active preset id + revision
- Prompt settings + budget profile
- feature/cutover profile
- provider capability negotiation
- runtime capability snapshot（权限、网络、前台状态、账号、Provider）
- temporal snapshot
- history boundary ids
- current input / attachment refs

规则：

- Snapshot 创建后深冻结。
- 角色被删除、revision 变化或会话 scope 不匹配时 fail closed 或明确重建，不得静默换角色。
- 群聊包含多个角色 snapshot，不使用单个 activeCharacterId 代替。

### 5.4 `PreparedModelRequestV1`

Prompt 编译器的唯一输出：

```ts
type PreparedModelRequestV1 = {
  requestId: string;
  snapshotHash: string;
  messages: Array<{ role: string; content: unknown; provenance: string }>;
  tools: unknown[];
  toolChoice?: unknown;
  budgetLedger: Array<{
    blockId: string;
    source: string;
    chars: number;
    estimatedTokens: number;
    truncated: boolean;
    omittedReason?: string;
  }>;
  protectedBlockIds: string[];
  outputReserveTokens: number;
  providerMode: string;
};
```

规则：

- 模型链路不得再读取 DOM。
- Prompt 预览由该对象的脱敏副本生成。
- 真实请求 trace 保存 hash、block provenance 与预算，不保存凭据。
- Preview 编译必须纯读取，不刷新 Continuity、不消费一次性状态、不写任何 Repository。

### 5.5 `CapabilityOperationV2` 与 `ToolRunV1`

每个 operation 自注册：

- 输入/输出 schema。
- `discoverable`、`requestable`、`executable` 状态及 reason code。
- 风险等级与审批规则。
- 需要的 feature flag、平台、权限、账号、Provider、网络与前台状态。
- executor。
- 幂等键策略。
- receipt 证据要求。
- 可否撤销及撤销 executor。

`ToolRunV1` 至少包含：

`planned → awaiting_approval → approved → executing → succeeded | failed | unknown → reconciled | undone | expired`

所有正则、TurnUnderstanding、OpenClaw、快捷命令和原生 tool call 都只能创建/更新同一个 ToolRun；只有一个 executor 有副作用权限。

## 6. Prompt 编译设计

### 6.1 固定层级

1. `platform_reality`
   - 数字存在定义、事实边界、安全、隐私、Prompt injection 防护、工具真实性。
   - 不夹带默认温柔人格。
2. `character_identity`
   - `CharacterProfileV2` 的身份、性别/代词、人格、价值观、自主性、表达与角色自身边界。
3. `user_relationship_contract`
   - 私有 `UserCompanionPreferenceV2`。
   - 只注入当前用户×角色。
4. `current_reality`
   - 时间、天气、日程、权限、关系连续性、已确认事件、待办。
5. `lore_and_memory`
   - 激活世界书、稳定记忆、选择性示例、共享经历。
6. `history`
   - 滚动摘要 + 最近原文。
7. `tool_state_and_receipts`
   - 当前可请求能力摘要、待审批动作、真实 Tool Receipt。
8. `turn_input`
   - 用户消息与附件事实。
9. `output_contract`
   - IM 体裁、语言、运行标记、回复长度与工具结果回应。

### 6.2 预算与自由度

存储上限与单轮注入上限分开。允许用户存很多设定，但按场景选择性注入。

建议默认上限：

- Character Identity 结构字段合计：24,000 字。
- `characterSystemSupplement`：16,000 字。
- `characterDeveloperSupplement`：8,000 字。
- `postHistoryInstructions`：8,000 字。
- scenario：8,000 字。
- primary / alternate greeting：单条 2,000 字，最多 50 条。
- example dialogue：存储合计 64,000 字；单轮最多激活约 4,000 字。
- 单个 worldbook entry：8,000 字；每卡最多 500 条；单轮按触发和优先级注入，不整包注入。
- generic/nychar 角色文本总量：默认 512 KiB；超过时拒绝或显式分批，不静默截断。

动态 token 预算按 Provider context 计算，最低保护：

- Platform Reality：完整保留。
- Character Identity 核心与双方硬边界：完整保留。
- 当前 user input：完整保留。
- Tool Receipt 与待审批精确影响：完整保留。
- Output reserve：不可被历史/世界书占用。

可裁剪顺序：

1. 低优先世界书。
2. 示例对话。
3. 较旧原文历史。
4. 较低置信检索记忆。
5. scenario 辅助描写。

永不先裁剪：角色身份、性别/代词、硬边界、当前用户纠正、当前输入、工具结果。

UI 必须显示：

- 存储字符数。
- 预计 token。
- 当前模型上下文占用比例。
- 本次预览中哪些块被裁剪/省略及原因。
- 70% 轻提示、90% 强警告、100% 阻止保存或要求拆分。

## 7. Prompt 编写与角色编辑界面

### 7.1 信息架构

角色编辑器统一为一个页面，App 与小手机共享相同数据容器与保存服务，UI 可不同。

一级页签：

1. **身份**
   - 姓名、性别认同、代词、自我认知、身份/职业、年龄感、世界。
2. **人格与价值**
   - 性格、价值观、核心冲突、自主性、渴望/恐惧、角色自身边界。
3. **说话方式**
   - 语气、节奏、称呼习惯、口头禅、不同关系下的表达差异。
4. **关系**
   - 当前用户×角色的关系与互动偏好。
   - 明确标识“仅你可见，不随角色卡导出”。
5. **场景与开场**
   - scenario、primary greeting、alternate greetings、示例对话。
6. **世界书**
   - 关联条目、触发词、优先级、位置、预算预估。
7. **高级 Prompt**
   - Character System Supplement。
   - Character Developer Supplement。
   - Post-history Instructions。
   - 明确显示其权威位置与不可覆盖层。
8. **调试与预览**
   - 最终 block inspector、预算、来源、模型 sandbox。

### 7.2 Basic / Advanced

- 默认 Basic：结构化字段与自然语言说明。
- Advanced：开放原始补充 Prompt、Prompt 层级、预算和 Inspector。
- Basic 与 Advanced 写入同一合同，不维护两套 Prompt。
- 从 Advanced 回到 Basic 不丢原文；不认识的扩展进入“保留但未注入”区。

### 7.3 保存模型

- 用户输入先自动保存为**本角色草稿**，但不直接覆盖已提交角色。
- 页面底部固定操作：
  - `保存`
  - `撤销本次修改`
  - `查看与已保存版本的差异`
  - `预览下一轮`
- 草稿绑定 `editingCharacterId + baseRevision`。
- 保存使用 compare-and-swap：
  - revision 一致：提交。
  - revision 冲突：展示差异，允许保留本地、使用新版本或手动合并。
- 切角色、返回、切壳或退出前有未提交修改时必须明确提示。
- 保存失败不可只写 console；必须保留草稿并显示错误。
- 保存成功后发布一次角色变更事件，缓存与所有壳从 Repository 重新读取。
- 保留最近 20 个本地版本；用户可恢复，恢复本身产生新 revision。

### 7.4 预览

提供三种视图：

1. **角色视图**：最终 Character Identity / Relationship Contract 的可读版。
2. **请求视图**：真正 `PreparedModelRequestV1` 的脱敏 messages、block、预算和工具 schema。
3. **效果视图**：用用户自填样例或内置场景运行 sandbox，显示回复；默认不写历史、记忆、关系或工具。

要求：

- 不再使用固定“今晚下雨”五行摘要冒充 Prompt 预览。
- 清晰区分“草稿编译”和“当前线上已保存版本”。
- 显示 `characterId`、revision、snapshot hash、cutover profile、Provider 能力。
- 敏感位置、日历、关系边界默认打码，用户主动展开。
- 支持复制脱敏调试包。

### 7.5 自由度与安全边界

用户可以：

- 写任意合法角色身份、世界观、关系、成人角色设定和表达风格。
- 使用长 Prompt、示例对话、世界书和自定义后置指令。
- 导入第三方卡并保留未知字段。
- 关闭默认陪伴风格，制作冷淡、尖锐、非人、无性别或强自主角色。

用户不能：

- 覆盖平台安全、凭据保护、真实动作证明和权限策略。
- 让导入 Prompt 自动授予设备/网络/文件权限。
- 让角色把未执行动作说成已完成。
- 把另一用户的私有关系偏好打包导出。

### 7.6 可访问性与移动端

- 320、360、390、412、768、1024、1440 px 验收。
- 所有输入有 label、说明和错误关联。
- Tab 键顺序正确；弹窗 focus trap；Esc 可关闭非破坏性弹窗。
- 触控目标至少 44 CSS px。
- 字符/Token 警告不能只依赖颜色。
- 长 Prompt 编辑使用稳定滚动、光标不跳、中文输入法 composition 不触发错误保存。
- 低端 Android 上 50,000 字编辑不应锁 UI；统计使用 debounce/worker 或增量估算。

## 8. 高质量冷启动

### 8.1 三条路径

1. **快速建立（约 2 分钟）**
   - 角色身份/性别/代词。
   - 用户希望被怎样称呼。
   - 关系类型。
   - 陪伴目的（最多 3）。
   - 支持方式 + 主动频率。
   - 边界与免打扰。
2. **认真建立（约 5–8 分钟）**
   - 快速路径全部。
   - 角色价值观与自主性。
   - 亲密/调情强度。
   - 冲突与修复方式。
   - 共同过去（明确标识为双方约定设定，不伪装真实发生）。
   - 督促策略、日记/动态意愿。
   - 预览与调整。
3. **导入角色**
   - 真正打开导入器。
   - 先解析/展示字段级报告。
   - 保留导入角色身份与 Prompt。
   - 仅补问当前用户私有的称呼、关系、陪伴目的与边界。
   - 用户选择“新建角色”或“覆盖当前角色”；默认新建。

### 8.2 必问与可跳过

必问：

- 角色名或明确“暂不命名”。
- 角色性别/代词或明确“暂不设定”。
- 用户希望被怎样称呼。
- 关系类型或“暂不定义”。
- 陪伴目的至少一个或“不确定”。
- 主动联系是否允许。
- 硬边界与免打扰确认。

可跳过：

- 共同过去。
- 价值观细节。
- 调情强度（默认 off，除非明确选择）。
- 嫉妒表达（默认 off，除非明确选择）。
- 自动日记/动态（默认 off，除非明确选择）。

### 8.3 字段来源

每一字段保存 `explicit/default/skipped/import_review`。

- Skip 不得被解释为同意。
- Quick 的默认值只用于行为保守降级，不写成“用户喜欢”。
- Import 字段来自角色卡；用户确认后标记 `import_review`。
- 冷启动重做只修改用户×角色偏好；不得覆盖角色卡，除非用户明确进入角色编辑。

### 8.4 预览与首个真实回合

- 预览回复可由模型生成，但提交不依赖模型成功；模型失败时使用确定性预览。
- 用户可选择“更直接 / 更安静 / 更主动 / 少安慰 / 保持这样”。
- 选择结果必须映射到明确字段，不只改变一次预览文案。
- 首个真实 assistant message 使用**已提交的完整 PreparedModelRequest**生成。
- 若离线或模型失败，使用角色名、关系与一个已选偏好生成克制 fallback；不得编造共同经历。
- 首句话至少体现两项角色/关系特异信息，但不得像复述问卷。
- 首个用户回合必须能看到正确身份、正确代词、正确称呼与边界。

## 9. 工具能力闭环

### 9.1 两阶段模型路径

推荐：

1. Planner（非流式，小输出）：
   - 输入当前 TurnExecutionSnapshot 与可 request 的 tools schema。
   - 只产 tool calls 或“无需工具”。
2. Policy / Approval / Executor：
   - 参数 schema 校验。
   - 证据、权限、风险、当前状态重校验。
   - 创建/更新 ToolRun。
   - 执行并生成结构化 receipt。
3. Final Persona Render（可流式）：
   - 输入真实 receipt、当前人格和关系合同。
   - 用角色口吻回应结果。
   - 未成功/unknown/待批准不得声称完成。

### 9.2 Provider 兼容

- 启动或首次使用时协商：
  - 支持 tool calling。
  - 支持 tool role。
  - 支持流式 tool calls。
  - 多 tool call 语义。
- Hosted 模型使用受测适配器。
- BYOK 不支持 tool calling 时：
  - 允许使用受控 TurnUnderstanding planner fallback。
  - UI 明确“当前模型不支持自主工具调用”。
  - 禁止从普通文本猜 tool call。
- 每轮限制 planner 次数、tool call 数、总时长和 Credits。

### 9.3 安全与幂等

- 所有有副作用动作必须有稳定 `toolRunId` / `idempotencyKey`。
- R0 读取可自动执行，但结果必须有来源/时间。
- R1 仅明确命令且可撤销时自动。
- R2 必须确认准确影响。
- R3 二次确认。
- 拒绝、超时、重启、App 切后台后状态可恢复。
- executor 返回 `unknown` 时进入对账，不自动重试副作用。
- Tool output 是非可信数据；必须 schema 校验、限长、分隔后回灌。
- 旧正则只允许检测明确的低风险读取；否定、引用和歧义时 fail closed。

## 10. Tavern / SillyTavern 兼容计划

### 10.1 支持矩阵

至少覆盖：

- V2 JSON。
- V3 JSON。
- PNG `chara` tEXt/iTXt/zTXt。
- 常见 WebP embedded metadata（若无法安全支持，明确 unsupported）。

字段：

- `name`
- `description`
- `personality`
- `scenario`
- `first_mes`
- `alternate_greetings`
- `mes_example`
- `system_prompt`
- `post_history_instructions`
- `creator_notes`
- `creator`
- `character_version`
- `tags`
- `extensions`
- `character_book`
- avatar / image

### 10.2 导入报告

每个路径输出：

- `preserved`
- `transformed`
- `demoted_untrusted`
- `dropped`
- `unsupported`
- `unsafe_ignored`

报告必须在确认前展示；严重丢失需二次确认。

### 10.3 世界书与示例

- `character_book.entries` 转换为角色关联 lore entries。
- 保留 keys、secondary keys、position、depth、priority/order、enabled、selective、constant 等可表示语义。
- 无法表示的字段保留 raw metadata 并报告。
- `mes_example` 不直接整段常驻 Prompt；解析为示例片段，按预算选择。
- greeting 不直接写入历史；新建会话时用户从 primary/alternate 中选或随机。

### 10.4 媒体

- PNG 本体可作为头像候选。
- 远程 URL 不自动抓取；需明确同意。
- 图片进入 media store，不把大 data URL 常驻 CharacterRecord。
- 校验 MIME、签名、尺寸、像素与字节上限。

## 11. 持久化、迁移与删除语义

### 11.1 Repository 事务

统一 CharacterRepository / PreferenceRepository / ConversationRepository / ToolRunRepository。

- IndexedDB/SQLite 使用真实多 store/表事务。
- localStorage fallback 使用 journaled saga：
  - `prepare`
  - 写 staged records
  - `commit marker`
  - 发布 cache/event
  - 崩溃恢复或回滚

First Light 一次 commit 涉及：

- CharacterProfileV2
- UserCompanionPreferenceV2
- relationship seed
- autonomy policy
- conversation
- opening message
- onboarding completion marker

任何一步失败都不得显示“已完成”。

### 11.2 旧数据迁移

- 不复用 substring 判断 stock Prompt；使用已知版本 hash。
- 自定义 Prompt 原字节保留。
- 先 dry-run，生成 field-level migration report。
- migration ledger 记录版本、输入 hash、输出 revision 与结果。
- 中断后可恢复，重复执行幂等。
- 架构切流与权限授权分开。
- 明确 legacy pin 的用户不自动迁移到敏感能力。
- 新 Profile 进入 `internal_v2` 验收；通过后才有 `production_v2`。
- 回滚只切读取/执行路径，不删除 V2 数据。

### 11.3 删除、覆盖、复制

必须定义每个角色关联实体的行为：

- Conversation：默认保留并 tombstone character；用户可选择连历史删除。
- Preference：默认随角色 tombstone，恢复角色时可恢复。
- Memory/Timeline/Lore：按 sourceRef 标记，不直接物理级联删除；提供清除选项。
- Media：引用计数为 0 后再清理。
- Pending ToolRun：角色删除后取消未执行项；执行中的进入 unknown/reconcile。
- 覆盖导入：产生新 revision 和备份；与“导入为新角色”分离。
- 复制角色：复制 CharacterProfile，不复制用户关系、历史、记忆和 pending tools。

## 12. 实施波次

### P0：权威源与跨角色止血

目标：不再串 Prompt，保存与预览可证明。

任务：

1. 定义 V2 schema、revision 和 Repository 接口。
2. 建立 TurnExecutionSnapshot / PreparedModelRequest。
3. `compilePrompt` 去 DOM 化。
4. 切角色时重新读取 Store；编辑草稿绑定角色/revision。
5. 实现显式保存、冲突、失败反馈和真实请求 Inspector。
6. 增加跨角色/多标签/刷新测试。

结束条件：

- 任意 500 次 A/B 角色切换、编辑、预览、发送无一次 Prompt 串线。
- Inspector 的 request hash 与实际发出请求 hash 一致。
- 保存失败保留草稿；刷新后已提交内容一致。

### P1：高质量冷启动与 Prompt 编辑器

目标：首轮具有明确角色与关系特异性。

任务：

1. CharacterProfileV2 / UserCompanionPreferenceV2 UI。
2. Quick / Careful / Import 三路径。
3. 字段 explicitness 与 tri-state consent。
4. 六层 Prompt 编译与预算保护。
5. Basic / Advanced Prompt 编辑器。
6. 首轮模型生成 + 离线 fallback。
7. App / 手机共用编辑容器。

结束条件：

- 冷启动字段到记录再到 Prompt 的覆盖率 100%。
- 角色设定性别/代词时，首轮与后续 100 个测试回合无错误代词。
- 未设定时不猜测。
- 首轮不使用客服腔、不复述问卷、不编造过去。

### P2：统一工具执行权

目标：模型真正会调用可用能力，并诚实反馈。

任务：

1. CapabilityOperationV2 自注册。
2. ToolRun ledger 与状态机。
3. Planner Provider adapters。
4. Policy/approval/executor/receipt。
5. App/手机审批 UI。
6. Final persona render。
7. 旧 TurnUnderstanding/正则/OpenClaw 接入同一 ledger。

结束条件：

- 任何“已完成”声明都有 receipt。
- 日历确认双击、刷新、重试只写一条。
- 权限拒绝、网络失败、unknown outcome 均不假成功。

### P3：角色卡兼容与完整生命周期

目标：常见酒馆卡不再静默丢失。

任务：

1. V2/V3 schema 与 path-level mapping。
2. PNG compressed chunk parser 与恶意输入防护。
3. greeting / example / scenario / prompts 持久化。
4. character_book 转 worldbook。
5. field-level loss report。
6. 新建/覆盖/复制/删除/恢复。
7. `.nychar` 导出对齐 V2 模型。

结束条件：

- 支持矩阵 fixture 全绿。
- 所有输入路径都有报告。
- worldbook、首句、示例和后置指令可在导入后刷新并生效。

### P4：切流、评测与发布

目标：以真实行为而非 Node verify 宣布完成。

任务：

1. `internal_v2` 灰度。
2. 浏览器两壳 E2E。
3. Android 真机。
4. Hosted / BYOK Provider matrix。
5. Prompt/工具/迁移观测。
6. 红队与非操控陪伴评测。
7. `production_v2` 发布门。

结束条件见第 13 节。

## 13. 完整验收标准

### 13.1 数据与持久化

- [ ] Character 与 Preference schema 运行时校验 100%。
- [ ] 所有用户输入字段有长度、类型、来源和 revision。
- [ ] First Light commit 任意一步失败均可恢复，不留下“完成但缺数据”状态。
- [ ] Web IndexedDB、Android SQLite、localStorage fallback 各完成一次中断恢复测试。
- [ ] 多标签 CAS 冲突不会静默覆盖。
- [ ] 保存后刷新、重启、切壳、切角色数据一致。

### 13.2 Prompt 正确性

- [ ] Prompt 编译路径无 DOM 读取。
- [ ] 角色 Identity、用户关系、当前事实、历史、工具结果来源可追踪。
- [ ] Character A 的任何字段不会进入 Character B 的 request。
- [ ] 当前 user input、硬边界、角色身份永不因预算被裁掉。
- [ ] 所有裁剪都出现在预算 ledger。
- [ ] Preview 编译零持久化副作用。
- [ ] Inspector hash 与网络请求 hash 一致。
- [ ] Imported Prompt 无法覆盖 Platform Reality。

### 13.3 冷启动质量

建立至少 60 个固定 persona × preference 组合与 20 个自由文本/导入组合。

- [ ] 100% 使用正确角色名。
- [ ] 已明确性别/代词时错误率 0；未明确时猜测率 0。
- [ ] 100% 使用正确用户称呼。
- [ ] 100% 遵守 hard boundary 与 quiet-hours policy。
- [ ] ≥90% 回合在盲评中体现所选 support/initiative/conflict style。
- [ ] ≥90% 首轮至少体现两项具体角色/关系信息。
- [ ] ≤5% 首轮出现客服式总结、问卷复述或“作为 AI”元话术。
- [ ] 不因“亲密/调情”选择而默认产生操控、嫉妒勒索或现实隔离建议。
- [ ] 角色能在至少 80% 的分歧测试中自然表达不同意见，而不是机械附和。

### 13.4 Prompt 编辑 UI

- [ ] Basic / Advanced 读写同一数据。
- [ ] 大纲字段、自由文本、世界书、示例、首句均可编辑。
- [ ] 用户可明确看到每段 Prompt 的权威级别和是否随卡导出。
- [ ] 字符、Token、上下文占用与裁剪原因可见。
- [ ] 保存/撤销/diff/恢复/冲突流程完整。
- [ ] 50,000 字编辑在目标 Android 上无超过 200ms 的连续主线程阻塞。
- [ ] 320–1440 px 响应式通过。
- [ ] 键盘、读屏、focus、44px 触控和错误提示达到 WCAG 2.1 AA。

### 13.5 工具真实性

- [ ] 主聊天实际发送 tools schema，或明确走受控 fallback；禁止只发文本 manifest。
- [ ] planner/tool/final 三阶段 trace 可关联同一 turnExecutionId。
- [ ] 100% 成功声明有 trusted receipt。
- [ ] 0 次 pending/failed/unknown 被说成已完成。
- [ ] 0 次双执行副作用。
- [ ] R2/R3 无批准执行数为 0。
- [ ] 权限、网络、账号、前台状态变化后执行前重校验。
- [ ] Hosted/BYOK 不支持 tool calling 时 UI 明确降级。
- [ ] weather、web search、calendar read/create/update/delete、location、notification 的成功/失败/拒绝路径均有 E2E。

### 13.6 角色卡兼容

- [ ] V2/V3 JSON fixture。
- [ ] PNG tEXt/iTXt/zTXt fixture。
- [ ] malformed、压缩炸弹、路径穿越、超大像素、恶意 Prompt fixture。
- [ ] `first_mes`、alternate greetings、`mes_example`、scenario、system/post-history、character_book 导入后刷新仍存在。
- [ ] 每个源字段有 loss report。
- [ ] 私有 Preference、历史、记忆不会出现在 `.nychar`。
- [ ] 导出→导入 round trip 的已承诺字段一致。

### 13.7 性能

在受控网络与目标 Hosted 模型下记录，不用单次结果冒充保证：

- [ ] 无工具聊天首 token：P50 ≤ 2.5s，P95 ≤ 6s。
- [ ] 工具 planner 决策：P95 ≤ 3s。
- [ ] R0 查询完整回复：P95 ≤ 10s。
- [ ] Prompt 编译：P95 ≤ 150ms（不含检索/模型）。
- [ ] 角色切换 UI：P95 ≤ 200ms。
- [ ] 冷启动提交：本地持久化 P95 ≤ 500ms。

若真实 Provider 无法达标，报告实测值并调整产品承诺，不得伪造通过。

### 13.8 隐私与安全

- [ ] Inspector 默认遮蔽位置、日历、用户边界与私密关系文本。
- [ ] 导入卡、网页和工具输出均按非可信数据处理。
- [ ] Prompt、日志、导出、trace 不含 API Key、凭据或 billing token。
- [ ] 远程头像不自动请求。
- [ ] `.nychar` 不含 UserCompanionPreference、聊天、记忆与支付信息。
- [ ] Prompt injection 无法触发未授权工具。

### 13.9 发布门

发布 `production_v2` 前必须全部满足：

- [ ] 相关 Node 单测/合约测试全绿。
- [ ] 浏览器 App + 小手机全旅程通过，SKIP=0，内部 Repository 直调替代 UI=0。
- [ ] Android 至少两种目标尺寸完成冷启动、编辑、重启、导入、聊天、工具审批。
- [ ] Hosted + 至少一个支持工具的 BYOK Provider 通过。
- [ ] 至少一个不支持工具的 BYOK Provider 正确降级。
- [ ] 真实迁移样本 ≥ 3 类：纯旧 builtin、自定义 Prompt、多角色/导入卡。
- [ ] 灰度 canary 无跨角色、重复工具或持久化部分提交。
- [ ] 可一键回滚读取/执行路径，V2 数据不丢。
- [ ] C8 新门返回非零时不能打包正式版本。

## 14. 主要风险与缓解

1. **范围过大**
   - 按 P0–P4 独立落地，每个波次可运行、可回滚。
2. **双写继续存在**
   - P0 后禁止模型路径读取 legacy DOM/localStorage；legacy 只作为迁移输入。
3. **Prompt 变长反而变差**
   - 存储与单轮注入分离；保护核心、选择性检索、预算 ledger。
4. **工具重复执行**
   - 唯一 ToolRun ledger + 单 executor + idempotency。
5. **迁移覆盖用户创作**
   - hash 识别 stock Prompt；custom 原字节保留；dry-run + report + rollback。
6. **Provider 差异**
   - capability negotiation + adapter matrix + fallback。
7. **“取悦”滑向操控**
   - 非操控行为评测、双方边界、不同意测试与主动频率硬限制。
8. **角色卡 Prompt injection**
   - 导入内容降权、结构化 delimiting、工具策略不读卡片指令。

## 15. 计划决策默认值

若产品未另行修改，实施采用：

- 角色性别/代词：可自定义、可不设；不猜测。
- 调情/嫉妒/自动日记/自动动态：默认 off，必须明确选择。
- 主动联系：冷启动必须明确选择；旧用户沿用原设置，不静默改变。
- 导入：默认新建角色，不覆盖。
- Prompt 编辑：草稿自动保存，提交必须显式点击保存。
- 自定义 Prompt：高自由度，但处于 Character Identity 补充层，不得覆盖 Platform Reality。
- 工具：一个 persisted ToolRun ledger；旧路径只做 detection。
- 新切流：`internal_v2 → production_v2`，不把未过门的 `production_v1` 直接当完成。

## 16. Definition of Done

只有同时满足以下条件才算“月栖数字伴侣 V2 完成”：

1. 数据合同、Prompt 编译、工具执行和 UI 使用同一权威源。
2. 冷启动所有明确答案都能证明进入记录与 Prompt。
3. 首轮通过行为评测，体现具体人格、关系、自主性与边界。
4. 用户可自由编辑/导入，并明确知道哪些内容保存、注入、裁剪和导出。
5. 模型能调用真实工具，且没有 receipt 就不会声称成功。
6. 角色切换、刷新、重启、迁移、删除和失败恢复不串数据。
7. 浏览器、Android、Hosted/BYOK 和真实迁移证据全部通过。
8. 发布门不能 SKIP 或假绿。

