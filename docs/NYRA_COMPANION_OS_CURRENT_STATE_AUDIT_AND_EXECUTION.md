# 月栖 Companion OS 当前状态审计与下一步执行总令

> 文档版本：1.1（收紧重构边界与商业化并行规则）  
> 审计日期：2026-07-31  
> 审计对象：F:\beautiful 当前工作树，而非某个历史提交  
> 当前定级：当前发布证据红灯 · 架构整合期（已有模块实现不作废）  
> 本文用途：替代“功能数量即完成度”的旧判断，作为下一位 AI、Cursor 或开发者继续施工时的当前状态入口；它约束后续施工，但不自动否定已有模块级成果

---

## 0. 下一位 AI 先读这里

### 0.0 先正确理解“红灯”

本文中的“红灯”只表示：**当前工作树还没有足够证据被称为可发布版本**。

它不表示：

- 以前的代码全部无效。
- 所有通过的合同测试都是假的。
- OpenClaw、Skill、Companion、Qiji 或 Experience 必须推倒重写。
- 发现一个界面错误，就可以扩大为全仓库重构。

后续必须把状态拆成四项分别汇报：

1. **模块实现状态**：代码、接口、状态机和合同测试是否存在并通过。
2. **浏览器产品路径状态**：真实用户是否看得见、点得到、走得通，并且控制台无未解释错误。
3. **原生设备状态**：Android、iOS、Windows 的真机或真实宿主是否验证。
4. **架构主权状态**：同一类数据是否只有一个权威写入者，其他模块是否只是适配器或投影。

任何局部失败，只能否定它直接覆盖的状态范围，不能自动把所有已有成果归零。

### 0.1 当前不是“已经做完，只差真机”

月栖已经拥有大量真实代码和不少可运行界面，但现在仍不能定级为产品完成、Release Candidate 或 Product Review。

准确描述是：

**月栖是一个能力很厚的 Companion OS 架构原型；多个子系统分别能运行，但身份、数据、Agent、Skill、任务、权限、模型和验收尚未收成一条权威主链。**

当前禁止使用以下说法：

- P0–P6 已完整做完。
- CP0–CP21 全绿，所以产品已完成。
- 只差真机和外部账号。
- Skill ZIP 已可自动导入。
- Agent 已使用真实模型执行任务。
- 托管模型、会员和积分系统已经具备基础。
- 自动合同测试通过等于用户体验通过。

### 0.2 下一步只允许先做 R0

下一位 AI 的第一轮任务不是继续加新 App、作品、Skill、页面或商业功能，而是完成本文第 13 章的 R0“止血与基线恢复”。

R0 必须先解决四个已复现的真实阻断：

1. First Light 在浏览器真实运行时崩溃。
2. Explore 的任务与市场标签虽然存在于 DOM，但尺寸为 0，用户不可见、不可操作。
3. Skills 与 Context Enterprise 的既有总验证不是全绿。
4. OpenClaw 手机切片仍有 1 项失败，产品路径默认仍可能走 Fake Stream。

R0 未绿，不得开始大规模 Timeline、Agent 或 Billing 重写。R0 的目的只是恢复可信基线，不是借机重新设计整个产品。

### 0.3 开工前保护当前工作树

当前 master 工作树已有大量未提交修改。它们属于现有工作，不得被覆盖、重置或当作噪声删除。

开工者必须：

1. 记录 git status --short。
2. 记录当前 HEAD。
3. 把本轮新增和修改文件列入自己的变更清单。
4. 禁止 git reset --hard、强制 checkout 或批量覆盖。
5. 历史报告只能作为线索，当前源码、当前运行结果和当前证据优先。

---

## 1. 本次审计依据

本次结论同时依据以下内容：

### 1.1 新总纲

- 月栖 Companion OS 核心架构重构总纲。
- 月栖付费、会员、积分与托管模型设计补充。

### 1.2 当前仓库

重点读取和交叉检查了：

- src/conversation
- src/context
- src/memory
- src/life
- src/companion
- src/experience
- src/scenario
- src/adventure
- src/scroll
- src/cocreate
- src/agent
- src/agents
- src/skill-platform
- src/skills
- src/studio-assist
- src/integrations/openclaw
- src/integrations/openclaw-mobile
- src/phone-shell
- android
- electron
- server
- package.json
- docs 下既有计划、审计、完成报告和 QA 状态

### 1.3 真实运行与验证

本次不是只看文档，也检查了当前浏览器运行结果，并执行了具有代表性的验证命令。

结果见第 8 章。

### 1.4 架构审计的证据纪律

后续任何“合并、删除、推倒或重写”的提案，都必须先给出证据表，至少说明：

- 两套实现分别负责什么。
- 当前真实用户路径调用哪一套。
- 谁是当前权威写入方。
- 是否真的双写同一状态。
- 双写是否已经造成冲突、丢失、重复或不可恢复。
- 是否可以先通过 Adapter、Repository 或只读投影收敛。
- 为什么最小修复不足以解决问题。

仅仅发现目录多、类名相似或概念重叠，不足以批准大规模重写。

以下三类数据默认语义不同，不得未经证明强行物理合并：

- Conversation Message：原始交流证据。
- Relationship Timeline Event：共同生活和关系中的权威事件。
- Agent Task / Execution Log：任务步骤、工具调用和执行审计。

它们需要统一 ID、来源和关联关系，但不必成为一张万能表。

---

## 2. 产品北极星：月栖到底是什么

月栖不是虚拟手机模拟器，不是功能抽屉，不是桌宠换图工具，也不是把几十个 AI 功能放在一起的工具箱。

月栖的唯一核心是：

**一个跨聊天、桌宠、语音、共同生活、动态、日记、体验、专业 Agent 和现实行动持续存在的长期 AI 伴侣。**

这个伴侣必须具备：

- 稳定身份。
- 稳定人格。
- 用户明确选择的关系身份。
- 可持续发展的关系状态。
- 可查看、可纠正、可遗忘的用户理解。
- 跨表面一致的共同历史。
- 对权限和现实行动保持克制。
- 在需要专业能力时，可以装配 Agent 和 Skill。
- 在需要执行多步骤任务时，可以调用 OpenClaw。
- 在进入情景、冒险、漫卷、共创时，保持同一个 TA，但把虚构事实隔离在正确命名空间。

任何新功能都必须回答：

1. 它服务的是同一个伴侣，还是偷偷创建了第二个角色？
2. 它读写哪一个权威数据源？
3. 它是否形成可追溯的共同事件？
4. 它是否需要权限？
5. 它是否应进入现实用户理解？
6. 它由普通聊天、Agent、Skill、Experience 还是 OpenClaw 负责？

答不清这六个问题，就不能进入实现。

---

## 3. 五层语义决议

这是本次审计最重要的架构裁决。后续代码不得再把这些概念混用。

### 3.1 Companion Core

职责：

- 唯一 Companion Identity。
- 人格种子和表达风格。
- Relationship Contract。
- Relationship Timeline。
- 用户理解与稳定记忆。
- 对话连续性。
- 语言、称呼、边界和关系安全。
- 跨表面的 Context Builder。

普通陪伴聊天始终从这里开始。

Companion Core 不是 Skill，也不由 OpenClaw 接管。

### 3.2 Selectable Agent

Agent 是用户主动选择的专业工作模式，例如：

- 恋爱咨询。
- 生活梳理。
- 学习教练。
- 创作搭档。
- 游戏主持人。
- 旅行规划。
- 栖机系统助手。

Agent 可以有独立的 working formulation、会话目标和专业方法，但默认不能创建第二套用户身份、关系数据库或权限系统。

用户必须能选择：

- 使用独立 Agent 会话副本。
- 继续使用当前会话。
- 是否读取全局伴侣记忆。
- 是否把结果写回全局记忆。
- 只写回摘要、写回候选，或完全不写回。

### 3.3 Skill Package

Skill 是 Agent 可装配的专业知识、工作流、规则、游戏或工具能力。

Skill 可以包含：

- SKILL.md。
- 结构化清单。
- 参考资料。
- Prompt 片段。
- 表单或步骤 Schema。
- 受控工具声明。
- 局部资源和 UI 元数据。

Skill 不等于任意代码插件。默认禁止包内脚本获得无约束执行权。

Skill 不得拥有平行的：

- Relationship Store。
- Global User Profile。
- Permission Runtime。
- Billing Ledger。
- Model Client。
- 任意 Shell 执行器。

### 3.4 Experience Runtime

Experience Runtime 统一承载：

- 情景。
- 冒险。
- 漫卷。
- 视觉小说。
- 共创故事。
- YEOS。
- 游戏型 Skill。

它的目标不是播放固定节点树，而是让同一个长期伴侣进入一个由作品包定义、由模型持续运行的开放场景。

必须区分以下数据域：

- reality：现实事实。
- shared_fiction：共同虚构经历。
- simulation：模拟与演练。
- creative_work：共同创作的作品内容。

虚构选择可以成为“我们一起经历过这段故事”，但不能自动变成“用户现实中就是这样的人”。

### 3.5 OpenClaw

OpenClaw 是获得授权后的多步骤行动执行器。

适用：

- 多步骤任务。
- 需要检查、修改、重试和审计的任务。
- 需要调用多个已注册工具的任务。
- 需要 Proposal、Diff 和 Approval 的现实行动。

不适用：

- 普通恋爱聊天。
- 每轮情绪分析。
- 记忆检索。
- 普通日记生成。
- 简单确定性的页面导航。
- 没有工具需求的 Skill 对话。

OpenClaw 不得成为所有功能的总 Runtime。

---

## 4. 唯一运行路由

用户输入必须先经过一个统一的 Agent Orchestrator，再选择正确路径。

    用户输入
      ↓
    Agent Orchestrator
      ├─ 普通陪伴表达 → Companion Conversation Runtime
      ├─ 简单确定性操作 → Direct Action + Policy Engine
      ├─ 用户选择专业 Agent → Agent Session + Skill Host
      ├─ 多步骤现实任务 → Unified Task Runtime → OpenClaw
      └─ 情景/冒险/漫卷/共创 → Experience Runtime

路由规则：

1. 默认永远是伴侣聊天，不得把每句话都任务化。
2. 用户显式选择 Agent 时，界面和行为必须真实改变，而不只是显示一个 Chip。
3. Skill 被触发时，授权 Context Envelope 必须真正进入模型上下文。
4. 需要现实写入时，必须经过统一 Policy Engine。
5. 需要多步骤执行时，必须创建统一 Task Record。
6. 任何模型失败都不能静默播放预制“成功剧情”或 Fake Agent 结果。
7. 无法执行时必须诚实说明能力边界。

---

## 5. 关系语义必须拆成三层

当前代码存在把显式关系、发展数值和用户理解混在一起的风险，必须正式拆开。

### 5.1 Relationship Identity

用户显式选定，例如：

- 恋人。
- 伴侣。
- 朋友。
- 家人式陪伴。
- 自定义关系。

它是用户合同，立即生效。

任何 intimacy、trust、level 或任务进度不得反向否定“我们已经是恋人”。

### 5.2 Relationship Development

表示相处过程中的：

- 熟悉。
- 信任。
- 安全感。
- 冲突与修复。
- 共同历史。
- 未完成约定。

它可以影响表达细腻度和回访方式，但不应以游戏化好感条替代真实关系连续性。

### 5.3 User Understanding

表示系统对用户的渐进理解：

- 偏好。
- 习惯。
- 边界。
- 支持方式。
- 重要人物。
- 长期目标。
- 反复出现的需求。

它必须有：

- 证据。
- 置信度。
- 作用域。
- 反例。
- 用户纠正。
- 忘记与删除状态。

一次表达不能直接晋升全局人格结论。

---

## 6. 当前真实能力盘点

### 6.1 已真实存在

| 领域 | 当前真实能力 | 定级 |
|---|---|---|
| 伴侣聊天 | 流式模型、角色 Prompt、记忆、关系、日记、主动消息、语音等已进入聊天热路径 | Real but fragmented |
| Conversation V2 | 会话、分支、候选回复、非破坏编辑和历史协调已有实现 | Real, not sole authority |
| Context | Context Broker、用途策略、共同生活压缩、证据跨度等已有实现 | Real, incomplete consolidation |
| Skill Platform | SKILL.md 解析、资源分类、完整性、授权、安装记录、运行记录、记忆候选 | Real core, broken product intake |
| Local Agent | 任务状态机、审批、审计、暂停、取消与恢复 | Real but parallel authority |
| Android Host | TYPE_APPLICATION_OVERLAY、前台服务、拖动、停止入口、截屏同意流程 | Real implementation, device pending |
| Windows Host | Electron 透明置顶、托盘、IPC、屏幕捕获宿主 | Real implementation, release pending |
| 小手机 | 锁屏、首页、应用结构和较完整产品 UI | Real UI |
| Pop 与生活能力 | 聊天、共同生活、日记、动态、游戏等拥有大量实现 | Real features, uneven semantics |
| 栖机助手 | 设置工具、能力目录和助手界面较完整 | Real UI, model path incomplete |
| Experience | 情景、冒险、漫卷、共创等已有多个 Runtime 和页面 | Real prototypes, duplicated semantics |
| Android 构建 | 存在约 12.36 MB 的 Debug APK | Build artifact only |

### 6.2 部分实现或仍是假链路

| 领域 | 当前问题 | 结论 |
|---|---|---|
| ZIP Skill 导入 | UI 接受 zip/yueqi-skill，但主要按文本文件读取，没有真正走统一解压安装 | Not done |
| 手机私有沙盒部署 | host-sandbox 仍返回 native_host_not_implemented | Not done |
| Agent 选择 | 主要改变 UI 标识，未成为所有输入的真实路由依据 | Partial |
| routeSkillInvocation | 有实现，但没有稳定产品调用主链 | Unwired |
| Skill Context | 计算了 Context Envelope，但模型消息没有完整注入 | Incorrect |
| 栖机助手模型 | 产品路径未稳定传入真实 streamFn，可能落入 createFakeStreamFn | Not production |
| OpenClaw BYOK | 协议与适配器验证较多，产品默认真实模型链路未闭环 | Implementation partial |
| 本地文件 | 主要为内存 VFS | Demo capability |
| 本地研究 | 主要为固定离线语料 | Demo capability |
| 手机模型服务 | 默认依赖 127.0.0.1:8787，Capacitor 内并未捆绑 Node 服务 | Deployment blocker |
| 公共 Skill 市场 | 当前主要是本地种子与本地导入 | Not done |
| Windows 发布链 | 无完整 installer、签名、自动更新证据 | Not done |
| Android OEM | 无覆盖主要厂商的真机权限、保活与 30 分钟证据 | Device pending |
| 会员与付费积分 | 尚无真正服务器权威账户、账本和结算系统 | Not started |

---

## 7. 当前最严重的重复真相源

本章给出的是**目标主权裁决**，不是立即删除旧模块的命令。迁移必须遵循：

```text
先证明双写或冲突
→ 定义唯一 Repository 与写入者
→ 建立 Adapter 和迁移工具
→ 双跑核对
→ 切换权威路径
→ 最后才删除旧写入
```

禁止先删旧实现，再希望新实现以后补齐。

### 7.1 对话

当前聊天仍可能先写旧 IDB，再 best-effort 镜像到 Conversation V2。

问题：

- 文档说 Conversation V2 权威。
- 产品热路径仍依赖旧消息库。
- 两边写入失败时没有统一事务。
- 分支、候选、再生和普通消息可能出现语义分裂。

最终裁决：

- Conversation V2 必须成为唯一写入权威。
- 旧 IDB 只能作为迁移来源或只读投影。
- 所有表面通过 Conversation Repository 访问会话。

### 7.2 任务

当前至少有：

- yueqi.agent.tasks.v1
- yueqi.assist.agent.tasks.v1
- yueqi.skills.runs.v1

最终裁决：

- 只保留一个 Task Record。
- 只保留一个状态机。
- 只保留一个 Approval Gateway。
- Skill、栖机助手和 OpenClaw 只能作为执行适配器。

### 7.3 包与扩展

当前 Skill Platform、开发者 JS Skills、Phone Extensions、YEOS、Character Package 和 Experience Package 各自拥有部分清单、安装或权限概念。

最终裁决：

- 建立统一 Package Intake。
- Package Type 可以不同，但安全检查、版本、哈希、来源、权限预览、原子安装、更新、回滚和卸载必须共用。
- Character、Skill 和 Experience 不应互相冒充，但应共享基础包管理协议。

### 7.4 记忆与共同历史

当前存在：

- 传统 memories。
- Context Graph。
- Cohabit Timeline。
- Life State。
- Scenario Memory。
- Experience Relationship Store。
- Skill Memory Candidates。

最终裁决：

- 事件进入 Relationship Timeline。
- 推断进入 Understanding Candidate Ledger。
- 稳定事实进入 Stable Memory。
- UI 页面只读取 Projection。
- 禁止各功能直接写一份自己的“最终真相”。

### 7.5 权限

当前 OS 权限、Skill grants、Skill scopes、开发者 Skill 权限和 Agent approvals 分散。

最终裁决：

- 所有能力声明进入 Capability Registry。
- 所有授权进入 Policy Engine。
- 所有执行记录关联 principal、agentId、skillId、packageVersion、operationId 和 grantId。
- 系统权限与 App 内授权取交集，任一缺失都不得执行。

---

## 8. 本轮真实验证结果

### 8.1 构建

命令：npm run build

结果：通过。

但存在明确性能和模块边界警告：

- 主 JS 约 1,370.68 KB，gzip 后约 456.61 KB。
- vendor 约 922.94 KB。
- pixi 约 843.14 KB。
- 主 CSS 约 575.31 KB。
- 存在 openclaw-mobile → vendor → openclaw-mobile 循环。
- 存在 agent-runtime → world → agent-runtime 循环。
- 多个模块同时被静态和动态导入，懒加载没有真正生效。

所以“能 build”不能推出“移动端启动和按需加载合格”。

### 8.2 Skills 总验证

命令：npm run verify:skills

结果：失败。

已通过：

- import 19/19。
- scopes。
- runtime。
- agent。

失败位置：Explore UI。

主要表现：

- 旧测试期望与当前应用字段不一致。
- 当前 Explore 有三个标签，而旧断言期望两个。
- 更严重的是，真实浏览器检查发现三个标签虽然存在于 DOM，计算尺寸均为 0。

这不是简单“更新测试即可”；产品本身确实不可发现、不可操作。

### 8.3 Context Enterprise

命令：npm run verify:context-enterprise

结果：在正式断言前失败。

错误：

    src/i18n/language-prefs.js:97
    window.dispatchEvent is not a function

说明验证环境的 window stub 与当前实现不匹配。

在该问题修复前，不能继续引用旧的 41/41 作为当前证据。

### 8.4 OpenClaw

命令：npm run verify:openclaw-agent-spike

结果：24/24 通过，但使用 Fake Model Node。

命令：npm run verify:openclaw-adapter

结果：19/19 通过。

命令：npm run verify:openclaw-mobile-slice

结果：14/15，失败项为 node mobile fixed character。

结论：

- OpenClaw 的协议和适配器骨架有真实进展。
- 产品真实模型链路与手机切片仍不能签发完成状态。

### 8.5 First Light

命令：verify:first-light

脚本结果：通过。

真实浏览器结果：崩溃。

控制台错误：

    ReferenceError: getBrandName is not defined
    at mountFirstLight
    src/first-light/ui.js:515

原因：

- ui.js 调用了 getBrandName。
- 当前导入只包含 getLocale 和 setLocale。

结果：

- 新用户入门流程中断。
- 用户可能直接落到“未命名”角色。
- 自动合同测试没有覆盖真实挂载。

这是典型假绿，必须作为 R0 第一修复项。

### 8.6 App 模式与小手机真实观感

观察：

- 小手机锁屏和首页已有较完整产品感。
- App 模式的主聊天仍显得空，信息结构和入口发现性不均衡。
- Explore 在小手机中打开后只有稀疏聊天界面，任务与市场入口不可见。
- App 模式侧边导航没有清晰的 Explore 入口。
- 栖机助手 UI 比 Explore 完整，但真实 Agent 模型链仍不闭环。
- “我的/设置”内容中出现桌宠角色图，违背“桌宠资产不能泄露到其他业务组件”的既定边界。

结论：

- 当前自动 asset boundary 检查没有覆盖真实视觉语义。
- UI 验收必须加入几何、可见性、可点击性和资产来源检查。

---

## 9. 当前代码级高风险问题

### 9.1 commitSkillTurn 不是真正零提交

现状：

- 先追加 assistant message。
- 再修改 Skill 状态、保存记忆候选或创建任务。
- 后续失败时返回 zeroCommit: true。
- 已追加的消息没有可靠回滚。

风险：

- UI 以为失败没有副作用，实际会留下部分状态。
- 重试会生成重复消息或不一致任务。

修复原则：

- 先在事务草稿中计算全部变更。
- 校验通过后一次提交。
- 任一步失败，消息、状态、记忆和任务都不得新增。
- UI 必须消费 commit 结果并显示明确失败状态。

### 9.2 授权 Context 没有真正给模型

Skill Host 虽计算授权 Context Envelope，但模型消息主要包含 Skill 资源、近期历史和当前输入。

风险：

- 用户授权了关系记忆，模型却看不到。
- UI 显示“已读取上下文”，实际行为没有变化。
- Skill 可能因为缺失上下文而重复询问或做出错误判断。

修复原则：

- Context Envelope 由统一 Context Builder 生成。
- 模型请求必须显式包含经过预算和权限过滤的 Envelope。
- 记录实际发送的字段和 Token，而不是只记录“理论可用”。

### 9.3 Relationship Timeline 存在重复投影与循环写入风险

当前 cohabit、life、scenario memory、relationship event 等多条路径互相投影或再写入。

风险：

    Timeline → Diary → Timeline
    Scenario Summary → Context Graph → Relationship Plan
    Cohabit Event → Life → Cohabit Event

修复原则：

- canonical event 只能由受控入口写入。
- Projection 记录 sourceEventId 和 projectionVersion。
- Projection 不得反向产生同义 canonical event。
- 用户编辑投影时创建新的 revision/superseding event。

### 9.4 虚构体验可能污染现实理解

当前情景总结可能写入 Context Graph 和关系计划。

风险：

- 用户在剧情中扮演的选择，被当成现实人格。
- 角色把虚构剧情当真实生活事实。

修复原则：

- 每个事件必须有 reality namespace。
- shared_fiction 默认不能晋升现实 Stable Memory。
- 用户可明确选择“把这段经历当作我们的共同纪念”，但仍保留虚构来源。

### 9.5 本地存储不适合企业级任务与商业数据

当前多类任务、授权、Skill 和配置依赖 localStorage 或 Preferences。

风险：

- 无事务。
- 易被篡改。
- 升级和迁移脆弱。
- 清理缓存后丢失。
- 无法安全承载商业余额。

修复原则：

- 本地业务状态迁入版本化 Repository。
- 原生端使用 SQLite 或平台安全存储。
- API Key 使用 Android Keystore、iOS Keychain。
- 商业积分只在服务端权威数据库中。

### 9.6 服务端仅适合开发

当前 server 主要是 JSON 文件账户和模型代理。

缺少：

- 生产数据库事务。
- Token 到期、刷新和撤销。
- 角色与管理员权限。
- 正式限流。
- Entitlement 校验。
- 完整 SSRF 防护。
- 模型白名单与供应商路由。
- 用量结算。

不能直接作为商业托管服务上线。

---

## 10. 权威数据模型

### 10.1 必须只有一张数据所有权矩阵

| 数据域 | 唯一权威 | 唯一写入者 | 其他模块 |
|---|---|---|---|
| Companion Identity | Companion Repository | First Light / Character Editor | 只读 |
| Relationship Contract | Relationship Repository | 用户显式设置与受控迁移 | 只读 |
| Conversation | Conversation V2 | Conversation Service | 投影 |
| Canonical Event | Relationship Timeline | Timeline Command Service | 投影 |
| Understanding Candidate | Candidate Ledger | Analysis Pipeline / 用户明确陈述 | 检索与审核 |
| Stable Memory | Memory Repository | Candidate Promotion / 用户显式添加 | 只读 |
| Relationship State | Timeline Reducer | Reducer | 不允许直接改数值 |
| Agent Profile | Agent Registry | Agent Manager | 引用 |
| Skill Package | Package Registry | Package Manager | 引用 |
| Task | Unified Task Repository | Task Runtime | 适配器 |
| Approval | Policy Engine | Approval Gateway | 引用 |
| Experience Session | Experience Repository | Experience Runtime | 投影 |
| Projection | Projection Store | Projection Workers | 不得回写同义事件 |
| Billing Account | Server Billing Core | Billing Service | 只读余额 |
| NyraCoin | 本地虚拟钱包 | 游戏与虚拟商城 | 与 Billing 隔离 |

### 10.2 Timeline 最小 Schema

每个 canonical event 至少包含：

- schemaVersion。
- eventId。
- eventType。
- source。
- sourceId。
- sourceEventId。
- idempotencyKey。
- dedupKey。
- revision。
- actor。
- principal。
- companionId。
- relationshipId。
- userId。
- agentId。
- skillId。
- packageVersion。
- experienceId。
- realityNamespace。
- occurredAt。
- timezone。
- locale。
- causationId。
- correlationId。
- payload。
- evidenceRefs。
- visibility。
- deletion/tombstone metadata。
- device/sync origin。

### 10.3 数据生命周期

    Raw Evidence
      ↓
    Canonical Timeline Event
      ↓
    Understanding Candidate
      ↓
    Stable Memory
      ↓
    Relationship State / Summary
      ↓
    Context Retrieval
      ↓
    Surface Projection

硬规则：

- 模型只产生结构化候选。
- 确定性代码负责去重、门槛、迁移和状态变化。
- 用户明确陈述优先于模型推断。
- 用户纠正立即 supersede 旧结论。
- 反例降低置信度。
- 被拒绝或遗忘的信息不得再次进入 Context。
- Prompt 预算不得随历史线性增长。

---

## 11. 权限和行动模型

### 11.1 四类写入

必须区分：

1. 内部分析写入：候选、摘要缓存、检索索引。
2. 用户数据写入：记忆、日历、笔记、关系设置。
3. 外部系统写入：邮件、文件、第三方日历、网络服务。
4. 主动触发：通知、后台行为、自动发送和定时任务。

不是所有内部缓存都需要弹窗审批，但所有用户可感知写入、外部写入和高风险行动都必须走 Policy Engine。

### 11.2 权限主体

每次授权必须标识：

- userId。
- companionId。
- agentId。
- skillId。
- packageVersion。
- capability。
- scope。
- duration。
- foreground/background。
- data boundary。
- system permission state。

Skill 更新版本后，不得默认继承高风险永久授权。

### 11.3 标准执行链

    inspect
      ↓
    proposal
      ↓
    diff
      ↓
    policy evaluation
      ↓
    approval or existing grant
      ↓
    idempotent execution
      ↓
    audit
      ↓
    result projection

Direct Action 也必须经过 Policy Engine，不能成为绕过审批的捷径。

---

## 12. Skill ZIP 与手机部署的正确含义

用户不应理解文件结构、JSON、路径或 Prompt。

正确产品行为是：

1. 用户选择 ZIP、文件夹或 yueqi-skill。
2. 系统复制到 App 私有临时目录。
3. 检查 zip-slip、绝对路径、符号链接、zip bomb、文件数、体积、类型和可执行文件。
4. 解压到隔离临时目录。
5. 自动发现 SKILL.md 与 Manifest。
6. 解析能力、知识、工作流、工具和权限。
7. 用自然语言向用户说明“它能做什么、会读取什么、可能修改什么”。
8. 用户确认安装和权限。
9. 原子移动到版本化安装目录。
10. 建立哈希、来源、版本和安装记录。
11. 失败时删除临时内容，保持旧版本不变。
12. 支持禁用、卸载、更新和回滚。

硬安全边界：

- 禁止路径穿越。
- 禁止任意 Shell。
- 禁止自动运行未知脚本。
- 禁止包声明未注册工具。
- 禁止包绕过 Agent Orchestrator。
- 禁止包自建全局记忆和权限。
- 禁止包读取未授权的伴侣数据。

---

## 13. 完整执行计划

## R0：止血、恢复可信基线

### 目标

让“当前仓库是否可继续开发”重新变成可验证事实，消除已知假绿。

### 必做

1. 固化当前工作树清单与 HEAD。
2. 修复 First Light 的 getBrandName 运行时错误。
3. 增加真实浏览器 E2E：语言选择 → 离线/在线选择 → 模式选择 → 角色创建 → 进入产品。
4. 修复 Explore 三个标签的可见性、尺寸、键盘导航和点击行为。
5. 在 App 模式和小手机模式提供明确 Explore 入口。
6. 更新 Explore UI 测试，使其检查几何与可操作性，不只数 DOM。
7. 修复 Context Enterprise window stub。
8. 修复 OpenClaw mobile slice 14/15。
9. 让 Skills、Context、OpenClaw、First Light 与 build 当前全绿。
10. 将旧完成报告标记为 Historical/Superseded，不删除历史证据。
11. 建立 docs/qa/companion-os/R0。

### 禁止

- 不新增功能面。
- 不重写 Timeline。
- 不接 Billing。
- 不进行大规模 UI 换皮。
- 不以 force click 掩盖不可操作控件。

### 退出条件

- 新用户黄金路径真实浏览器通过。
- Explore 的 Chat、Tasks、Market 均可见、可键盘操作、可点击。
- npm run build 通过。
- verify:skills 通过。
- verify:context-enterprise 通过。
- verify:openclaw-mobile-slice 通过。
- 证据包含截图、trace、控制台零未解释错误。

## R1：领域合同与唯一主权

### 目标

先把概念、ID、Repository 和唯一写入者定死，再迁移代码。

### 必做

1. 编写 Companion/Agent/Skill/Experience/OpenClaw ADR。
2. 编写数据所有权矩阵。
3. 定义统一 ID：
   - userId
   - companionId
   - relationshipId
   - conversationId
   - branchId
   - agentId
   - skillId
   - taskId
   - experienceId
   - eventId
4. 定义 TimelineEvent V1。
5. 定义 UnderstandingCandidate V1。
6. 定义 StableMemory V1。
7. 定义 UnifiedTask V1。
8. 定义 Capability、Grant、Approval 和 Audit V1。
9. 定义 Package Manifest 与 Package Type。
10. 定义 managed/BYOK Provider Contract，但本阶段不实现收费。

### 退出条件

- 每一类状态只有一个唯一权威和唯一写入者。
- 所有旧模块有明确 Adapter 或迁移归属。
- 禁止新增新的 localStorage 真相源。
- Schema 有版本、幂等、来源、现实命名空间和删除语义。

## R2：Conversation、Timeline 与投影基础

### 目标

建立跨表面连续性的真实底座。

### 必做

1. Conversation V2 改为先写权威。
2. 旧消息库降为迁移来源或只读投影。
3. 建立 Timeline Repository。
4. 建立 idempotent append、revision、supersede 和 tombstone。
5. 建立 Projection Registry。
6. 把 cohabit、life、scenario、relationship event 写路径接入 Adapter。
7. 阻断 Projection → canonical event 的循环。
8. 建立事件重放和投影重建工具。

### 退出条件

- 相同 idempotencyKey 只产生一个事件。
- 重放产生相同投影。
- 对话失败不会出现旧库成功、新库失败。
- 同一“周末看电影”事件可被日历、锁屏、回访和日记引用同一 sourceEventId。

## R3：Context 与企业级记忆生命周期

### 目标

把散落的记忆实现收为 Evidence → Candidate → Stable Memory → Context。

### 必做

1. 所有推断进入 Candidate Ledger。
2. 用户明确陈述可进入高优先级候选，但仍保留来源。
3. 加入反例、纠正、拒绝、过期和遗忘状态。
4. 统一 ContextRequest，增加 skill 和 agent purpose。
5. 区分回复前快速感知与回复后异步分析。
6. 完成现实与虚构命名空间隔离。
7. 把 Skill Memory Candidate 接入统一 Ledger。
8. 把 scenario memory、traditional memory、Context Graph 迁入或适配。
9. 建立 Token 硬预算和检索性能测试。
10. 建立级联删除和脱敏审计墓碑。

### 退出条件

- 用户纠正后，旧偏好不再召回。
- 单次观察不会晋升全局人格。
- shared_fiction 不进入现实用户理解。
- 1000 条隔离矩阵无跨角色、跨群聊、跨 Agent 污染。
- Prompt 大小不随历史线性增长。

## R4：统一权限、任务与 Agent Orchestrator

### 目标

让用户选择 Agent 真正改变行为，并让所有现实行动共享一套任务和审批主权。

### 必做

1. 建立唯一 Agent Orchestrator。
2. Pop、Explore、栖机助手和专业 Agent 输入全部接入。
3. 建立 Agent Session Policy：
   - 独立副本。
   - 共享当前会话。
   - 是否读取全局记忆。
   - 是否写回候选。
4. 合并三套任务记录为 Unified Task。
5. 合并 approvals、grants、scopes 和 OS permissions。
6. Skill、栖机助手和 OpenClaw 改为 Task Adapter。
7. 修复 commitSkillTurn 事务。
8. Context Envelope 真正进入模型请求。
9. 所有写入进入标准执行链。
10. 删除产品默认 Fake Stream。

### 退出条件

- 选择不同 Agent 后，Prompt、Context、工具和结果真实不同。
- 普通恋爱聊天不创建任务。
- 多步骤任务只产生一个 Task Record。
- 拒绝授权后无副作用。
- 失败的 Skill Turn 零消息、零状态、零记忆、零任务写入。
- 栖机助手与专业 Agent 共用同一模型与任务内核。

## R5：统一 Package Intake 与 Skill 产品化

### 目标

让普通用户真正可以导入、理解、安装、使用和制作 Skill。

### 必做

1. 文件、文件夹、ZIP 和 yueqi-skill 进入统一 Intake。
2. 手机端使用 SAF 与 App 私有沙盒。
3. 接入真实 fflate 解压，而不是 file.text。
4. 完成安全限制、原子安装和失败清理。
5. 自动发现并解析 SKILL.md。
6. 生成自然语言能力摘要和权限预览。
7. 建立 Agent 与多个 Skill 的装配关系。
8. 支持禁用、卸载、更新和回滚。
9. 提供知识、工作流、游戏、工具四类样例。
10. 提供自然语言 Skill Studio：
    - 用户描述目标。
    - 助手生成草案。
    - 用户预览能力与权限。
    - 沙盒模拟。
    - 验证通过后打包安装。

### 退出条件

- 用户无需查看 JSON 或路径即可完成安装。
- ZIP 安全测试覆盖 zip-slip、zip bomb、符号链接、绝对路径、文件数和体积。
- 更新失败保持旧版本可用。
- Skill 不能绕过工具注册、权限和任务 Runtime。
- 一个新 Skill 能同时被专业 Agent 与栖机助手选择性装配。

## R6：统一 Experience Runtime

### 目标

把情景、冒险、漫卷、视觉小说和共创从多个 Demo 收为开放式体验内核。

### 必做

1. 定义 ExperiencePackage：
   - 角色。
   - 世界观。
   - 多开场。
   - 世界书。
   - 规则。
   - 回复格式。
   - 视觉资源。
   - 结束条件。
2. 定义统一 Session、State、Event、Turn 和 Ending。
3. 情景改为角色驱动的开放式场景，不再依赖关键词固定路由。
4. 冒险增加目标、资源、地图/地点和 DM 状态。
5. 漫卷聚焦点读、背景、立绘、节奏与存档。
6. 共创聚焦章节、设定、版本和改稿，不冒充聊天。
7. 视觉只服务角色状态，不把桌宠资产当头像或幕布。
8. 体验结束写入 shared_fiction 共同事件。
9. 允许用户选择是否提炼关系纪念，但不得自动推断现实人格。

### 退出条件

- 四类产品语义互不混淆。
- 同一伴侣在不同体验中身份一致。
- 用户自由输入能真实改变后续。
- 分支、编辑、再生和时间线可恢复。
- 体验结束幂等。
- 桌宠资产不泄露到情景、查手机、设置等无关 UI。

## R7：共同生活投影、原生宿主与产品质量

### 目标

让月栖从“功能样板间”变成可以长期使用的产品。

### 必做

1. 日记、Moments、相册、日历、锁屏和桌宠提示统一读取 Projection。
2. 桌宠只作为独立存在入口，不嵌入无关卡片。
3. Android 完成 OEM 权限引导、保活、截屏、前台服务和 30 分钟连续测试。
4. Windows 完成多屏、DPI、透明、置顶、点击穿透、崩溃恢复和 30 分钟测试。
5. 修复模块循环和失效懒加载。
6. 拆分 app.js 与 phone-shell.js 的编排责任。
7. 建立中英文视觉与文案矩阵。
8. 建立资产边界静态检查与截图检查。
9. 完成安装包、签名、升级与回滚设计。

### 退出条件

- Android 与 Windows 真实设备证据齐全。
- 普通启动不加载 OpenClaw 和重型 Experience 资源。
- 小手机和 App 模式子页面均通过多视口 QA。
- 桌宠没有进入无关业务页面。
- 不存在控制台错误、不可见控件和 force click。

## 商业化并行轨道说明

商业化不能早于 R0 和 R1 的身份、主键与领域合同，但也不必机械等待 R2—R7 全部完成。

R1 通过后，允许开启一条独立的服务端商业基础轨道：

```text
B1：会员、商品、兑换码与服务端积分账本
B2：CatFK / Whop 外部售码入口与兑换页面
```

这两项只依赖稳定的 userId、商品权益和服务器事务，不依赖 Experience、Skill ZIP 或原生桌宠全部完成。

但以下能力必须等待 R4 的统一任务主权和 R9 的统一模型网关合同：

```text
模型 Token 自动计量
托管调用预冻结与结算
Agent / Skill / OpenClaw 多次调用汇总
Experience、语音和生图的统一用量记录
```

因此商业化分为：

- **先收款入账基础**：会员、兑换、积分账本可以在 R1 后并行。
- **后接真实使用扣费**：必须经过统一模型网关和任务合同。

任何情况下，都不得为了尽快收费而复用本地栖币作为商业积分。

## R8：商业领域隔离与服务器 Billing Core

### 目标

在 R1 的身份与领域合同稳定后，建立简单、可信、可直接商业化的会员与积分底座；该服务端基础可与后续 Companion OS 整合并行，但不得提前接入未统一的模型扣费路径。

### 首要 ADR

必须永久区分：

    NyraCoin / 栖币
    = 角色世界中的本地虚拟货币

    BillingCredit / 月栖积分
    = 用户购买、支付真实供应商成本的服务器权威资产

禁止：

- 共表。
- 互相兑换。
- 本地备份商业余额。
- Relationship Timeline 记录余额变化。
- 角色用恋爱话术催充值。

### 服务器最小表

- memberships。
- billing_products。
- purchase_channels。
- redemption_batches。
- redemption_codes。
- credit_accounts。
- credit_ledger。
- credit_reservations。
- provider_models。
- provider_prices。
- model_usage_records。
- billing_admin_audit。

数据库必须支持真实事务和行锁。建议 PostgreSQL。

### 退出条件

- 同一码 100 并发只成功一次。
- 账本可重算余额。
- 1000 次并发冻结和结算后余额不为负。
- 本地篡改无法改变商业积分。

## R9：统一 Model Gateway 与真实模型

### 目标

所有模型调用走同一合同，managed 和 BYOK 只改变来源与计费，不改变伴侣身份和记忆。

### 请求合同

- billingSource。
- operation。
- requestId。
- idempotencyKey。
- userId。
- companionId。
- agentId。
- skillId。
- experienceId。
- modelTier。
- messages。
- tools。
- stream。

### Managed

必须完成：

- 身份与会员检查。
- 模型白名单。
- 余额检查。
- 预冻结。
- 供应商调用。
- usage 捕获。
- 实际结算。
- 失败释放。
- 幂等。

### BYOK

固定：

- chargedCredits = 0。
- billingSource = BYOK。
- Key 只进入安全存储和受控网关。

### 退出条件

- 普通聊天、主动消息、Experience、Skill、Agent、OpenClaw、TTS/STT 和生图统一记录 usage。
- 流式取消、超时和部分输出只结算一次。
- managed → BYOK → managed 不改变任何 Companion 主键。
- OpenClaw 多次模型调用有逐次明细和任务汇总。

## R10：会员、积分和管理 UI

### 用户 UI

在“我的”中提供：

- 会员与积分。
- 充值。
- 兑换码。
- 消费明细。
- managed/BYOK 切换。
- 单次 Agent 任务用量展开。

Managed 页面不显示 Key；BYOK 页面才显示供应商设置。

### 最小后台

- 商品。
- CatFK/Whop 外部购买链接。
- 兑换批次。
- 兑换码禁用。
- 会员查询与延长。
- 积分账本。
- 冲正和补偿。
- 模型价格版本。
- 用量异常审计。

首版不做：

- 复杂多级会员。
- 自动续费。
- CatFK/Whop 深度 API 集成。
- 自动退款。
- 收益分成市场。

## R11：迁移、全旅程验收与发布裁决

### 必做黄金旅程

1. First Light 创建关系。
2. App 聊天与小手机连续对话。
3. 桌宠收起、主动出现、展开聊天。
4. 用户一次发多条，角色可基于完整上下文连续回复多句。
5. 用户纠正记忆，下一次不再召回旧结论。
6. 动态“让 TA 看到”开关真实生效。
7. 选择专业 Agent，并选择是否共享或写回记忆。
8. 导入 ZIP Skill，预览、安装、运行、禁用、升级和回滚。
9. Agent 创建多步骤任务，审批后由 OpenClaw 执行。
10. 进入情景自由互动，结束后只形成 shared_fiction 共同经历。
11. 日记、Moments、日历和锁屏引用同一事件。
12. managed 和 BYOK 切换不丢角色、关系和历史。
13. managed 调用产生可解释消费明细。
14. Android Overlay 和 Windows 桌宠连续运行。

### 发布状态

只有满足以下条件才允许升级：

- implementation_green：代码与合同验证通过。
- evidence_green：真实浏览器、trace、截图和长旅程通过。
- device_green：Windows/Android 真机矩阵通过。
- security_green：权限、Key、账本和删除通过。
- user_accepted：用户真实手测签字。

任何一项缺失，都不得称为 Release Candidate。

---

## 14. Billing 当前真实定级

当前只存在：

- PASSED_BYOK_BASIC_PROXY。
- PASSED_LOCAL_VIRTUAL_WALLET。

当前不存在：

- NOT_STARTED_MEMBERSHIP_REDEMPTION。
- NOT_STARTED_CREDIT_LEDGER。
- NOT_STARTED_MODEL_TOKEN_METERING。
- NOT_STARTED_MANAGED_CREDIT_SETTLEMENT。
- NOT_STARTED_BILLING_UI。
- NOT_STARTED_BILLING_ADMIN。
- NOT_STARTED_OPENCLAW_BILLING。

现有 src/wallet/ledger.js 是本地虚拟栖币：

- 默认余额。
- localStorage。
- JavaScript 浮点。
- 可被本地备份覆盖。
- 流水会截断。
- 幂等仅在进程内。

它绝不能复用为商业积分。

---

## 15. 安全红线

以下事项未完成前不得公开托管或收费：

1. Android API Key 迁入 Keystore。
2. iOS API Key 迁入 Keychain。
3. SQLite 不再使用无加密模式保存敏感数据。
4. TTS、STT、生图和模型 Key 不进入 localStorage。
5. 服务端 Token 有到期、刷新、撤销和角色权限。
6. 托管网关不允许用户自由指定任意上游 URL。
7. 完整 SSRF、限流、请求体、并发和成本限制。
8. Billing 使用事务数据库。
9. 所有现实行动可审计、可撤销或可说明不可撤销。
10. 用户遗忘能覆盖原始数据、向量、摘要、缓存、投影和备份。

---

## 16. UI 与产品语义验收规则

自动化不得只检查元素存在。

每个入口还必须检查：

- width > 0。
- height > 0。
- 非 display:none。
- 非 visibility:hidden。
- 在 viewport 内。
- 可点击。
- 可键盘聚焦。
- 中文和英文均有文案。
- 移动与桌面视口均可用。
- 不依赖 force click。

资产边界：

- 桌宠资产只出现在桌宠 Runtime、动作编辑器、角色资产管理和明确的桌宠预览。
- 查手机不得把桌宠图当手机内容头像。
- 情景不得把桌宠帧当舞台立绘。
- 设置卡片不得随意装饰桌宠大图。
- 聊天头像使用角色 Avatar 资产。
- Experience 使用自己的 Stage/Portrait 资产。

---

## 17. 旧文档如何处理

以下类型文档不得再单独作为当前完成结论：

- NYRA_APP_COMPLETION_AUDIT。
- NYRA_APP_COMPLETION_LEDGER。
- NYRA_APP_COMPLETION_REPORT。
- CP0–CP21 单波次完成报告。
- 只包含合同数量的 EXECUTION_STATE。

正确处理：

1. 保留，不删除。
2. 在顶部标记 Historical Evidence 或 Superseded。
3. 引用本文件作为当前状态入口。
4. 只有重新执行并生成当前证据后，旧数字才可被引用。

原因：

- 历史报告曾基于不同工作树。
- 一些测试已与当前 UI 漂移。
- 真实浏览器已复现自动测试未发现的崩溃和不可见控件。

---

## 18. 下一位 AI 的精确首轮工单

### 工单名称

R0-BASELINE-RECOVERY

### 允许修改

- src/first-light/ui.js 及其直接测试。
- Explore UI、样式、入口注册与直接测试。
- Context Enterprise 验证 stub。
- OpenClaw mobile slice 的直接实现与测试。
- docs/qa/companion-os/R0。
- 旧完成报告的 Superseded 标识。

### 不允许修改

- Billing。
- Timeline 总体重构。
- Experience 大改。
- 新 Skill 功能。
- 新 App。
- 全局设计系统换皮。
- 用户已有资产。

### 执行步骤

1. 保存 git status、HEAD 和变更所有权清单。
2. 为 First Light 崩溃补真实浏览器失败测试。
3. 修复 getBrandName 导入与挂载。
4. 为 Explore 三标签补几何、点击和键盘失败测试。
5. 修复 App 与小手机入口、标签布局和空状态。
6. 修复 verify:skills。
7. 修复 Context Enterprise window stub，并让真实断言运行。
8. 修复 OpenClaw mobile slice 最后一项。
9. 重跑 build、Skills、Context、OpenClaw、First Light。
10. 录制新用户和 Explore 两条浏览器旅程。
11. 生成 R0_REPORT.md，逐项列出命令、退出码、截图、trace、限制和未完成项。
12. 停止，不自动开始 R1；把 R0 证据交给用户审阅。
13. 不得把 R0 中发现的新局部错误自动扩大成 Timeline、Agent、Skill、Experience 或 Billing 总体重构；需要另行提交证据表。

### R0 报告必须使用的状态词

- evidence_red。
- implementation_green。
- evidence_green。
- device_pending。
- external_pending。
- blocked。

禁止自创“基本完成”“大体可用”“只差一点”等模糊词。

---

## 19. 最终成功标准

月栖完成这轮重构后，用户应该感受到的不是“多了一个 Agent 页”或“多了一个 Skill 市场”，而是：

1. TA 在任何表面都是同一个人。
2. TA 记得共同生活，但不会乱记、串记或拿剧情当现实。
3. 用户可以看懂 TA 为什么记住某件事，也可以纠正和忘记。
4. 用户能主动选择最专业的 Agent 梳理生活、关系、创作或游戏。
5. 用户能直接导入 ZIP，让系统自动理解、解释、安装和使用 Skill。
6. 栖机助手与专业 Agent 使用同一企业级内核。
7. 简单操作直接完成，复杂任务进入可暂停、可审批、可追踪的执行链。
8. 桌宠一直是桌宠，不再被当成头像、幕布或装饰图到处复用。
9. managed 与 BYOK 只改变模型和计费，不改变 TA、关系、记忆与历史。
10. 每一次“完成”都有真实界面、真实模型、真实设备和真实用户证据。

这才是 Companion OS，而不是功能合集。

---

## 20. 本次审计最终裁决

### 当前状态

先按人能看懂的四个维度汇报：

- **模块实现**：已有大量真实实现，可复用，但部分主路径未接通。
- **浏览器发布证据**：红灯；First Light 和 Explore 存在已复现阻断。
- **原生设备证据**：待验证。
- **架构主权**：整合中；对话、任务、记忆和权限存在需要收权的写入路径。

机器可读状态码：

    RELEASE_EVIDENCE_RED
    ARCHITECTURE_INTEGRATION
    BUILD_GREEN_WITH_WARNINGS
    FIRST_LIGHT_RUNTIME_RED
    EXPLORE_USABILITY_RED
    SKILLS_VERIFY_RED
    CONTEXT_VERIFY_RED
    OPENCLAW_PROTOCOL_PARTIAL
    REAL_MODEL_PRODUCT_PATH_PARTIAL
    PACKAGE_INTAKE_RED
    DEVICE_PENDING
    BILLING_NOT_STARTED

### 已具备的优势

- 真实功能覆盖广。
- Companion、Context、Conversation、Agent、Skill、Android Overlay 和 Windows Host 都已有可复用实现。
- 小手机已经形成明确产品外壳。
- 当前不是推倒重来，而是需要收权、接真链路和重做证据。

### 最大风险

- 继续按页面或功能波次堆代码。
- 继续让每个子系统拥有自己的状态和权限。
- 用合同计数代替真实用户旅程。
- 用 Fake Stream 或预制数据伪装 Agent 成功。
- 先做 Billing，再补身份、任务和用量主权。

### 唯一正确下一步

**先完成 R0-BASELINE-RECOVERY，恢复真实可信的开发基线。R0 通过并经用户审阅后，再依据证据进入 R1；后续允许按依赖关系并行施工，但不得跳过前置合同、不得跨范围自签完成。**



---

## 21. 给执行 AI 的一句话提醒

这不是“推倒月栖重新做”的命令。

这是：

```text
先把已经做出来的东西真实跑通
→ 再规定每类数据谁说了算
→ 用适配和迁移把重复系统收拢
→ 最后接真实模型、权限、收费和设备证据
```

优先修路，不要重造所有车辆；优先统一总账，不要删除仍在工作的业务能力。
