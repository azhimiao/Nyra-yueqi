# 月栖陪伴智能与统一记忆：产品切流和发布收口计划

> 适用仓库：`F:/beautiful`  
> 前置计划：
> - `docs/TEMPORAL_RELATIONSHIP_AUTOMATION_MEMORY_UNIFICATION_PLAN.md`
> - `docs/UNIFIED_MEMORY_FEATURE_CONTEXT_CURSOR_PLAN.md`
> 当前基线：W0-W8、M0-M10 的 flags-off 代码基线和 Node 合约已落地；产品切流、交互闭环、真实迁移、浏览器 E2E、Android 真机和真实联网尚未完成。

## 1. 本轮唯一目标

把已经存在的时间、关系连续性、ActionProposal、统一记忆、Context Broker 和 Web Retrieval 从“默认关闭的代码能力”变成 App 版、小手机版、桌宠和主动消息共同使用的正式产品链路，并完成真实旧数据迁移与真机验收。

本轮不继续扩展新的记忆概念，不重做视觉风格，不增加新的 App，不增加关系数值，不把 Node fixture 当产品验收。

## 2. 当前状态的统一口径

### 2.1 已完成

- TemporalSnapshot、TodayContext、TemporalEvent 基础合同和时间解析。
- TurnUnderstanding、ActionProposal 风险分级、日历审批执行 API。
- 普通关系数值停止写入，RelationshipContinuity 基础投影。
- SourceRef、各功能 Repository/Adapter、Candidate -> Stable、Suppression、MemPalace/Context Graph 投影。
- Context Broker 单入口和按 `sourceRef` 去重的 Node 路径。
- Node 级日记、听歌、阅读、日历、情景剧、忘记、重建和多角色隔离测试。
- Web Retrieval Gateway 的协议、来源合同和 SSRF 防护。

### 2.2 尚未完成

- 12 个新链路开关默认关闭，产品没有正式切流。
- 设置页没有可用的内部切流入口。
- App/小手机聊天没有 ActionProposal 确认、拒绝、撤销 UI。
- ActionProposal 当前运行时存储不能保证刷新/重启后恢复。
- Web Search Provider 仍是 stub。
- 桌宠、主动消息和 App/小手机没有统一消费同一份 Continuity 展示模型。
- 真实浏览器 IndexedDB/localStorage 和 Android WebView 数据没有迁移验收。
- 浏览器 E2E 默认 SKIP，开启后也只有根节点加载 smoke。
- Android 真机十条产品旅程未运行。
- 旧 `fileDrawer`、旧场景 candidate 等分支仍存在。
- 当前成果尚未形成独立、可回滚、可审查的发布基线。

## 3. 禁止再次使用的“完成”口径

以下任一情况只能标记为 `code-complete` 或 `pending product acceptance`，不得标记波次完成：

1. 功能开关仍默认关闭且真实产品入口没有启用。
2. 只有 Node 测试，没有通过浏览器 UI 完成同一旅程。
3. E2E 返回 `SKIP`、只检查根节点存在，或直接调用内部 Repository 绕过 UI。
4. 只生成 API，没有用户可见的确认、结果和失败反馈。
5. Provider 是 stub、固定 fixture 或无来源假结果。
6. 只迁移测试 JSON，没有迁移真实浏览器/Android 数据。
7. 只在小手机生效，App、桌宠或主动消息仍读取旧状态。
8. 旧权威写入仍可能与新 Repository 双写而没有来源绑定。
9. Android 没有安装 APK 实测。
10. 验收脚本即使跳过关键步骤仍返回 0。

## 4. 正式产品数据链路

```text
用户操作/聊天
  -> 冻结 TurnExecutionScope + TemporalSnapshot
  -> Conversation V2 保存原始消息
  -> TurnUnderstanding 生成观察、时间事件和 ActionProposal
  -> 风险策略：R0 自动 / R1 可撤销 / R2 明确确认 / R3 二次确认
  -> 对应 Repository 执行真实写入
  -> Timeline 记录共享经历
  -> Candidate Ledger 提交候选理解
  -> Stable Memory 只接收满足证据门的长期结论
  -> Projection Outbox 更新 Context Graph / MemPalace
  -> RelationshipContinuity 从权威源重建
  -> Context Broker 按当前目的取回少量上下文
  -> App / 小手机 / 桌宠 / 主动消息读取同一展示模型
```

权威边界保持不变：

- 聊天原文：Conversation V2。
- 日记原文：Diary Repository。
- 日历准确日期和计划：Calendar Repository。
- 任务状态：UnifiedTask Repository。
- 听歌、阅读、情景剧等原始状态：各自 Repository。
- 共同经历：Timeline。
- 长期成立的用户认识：Stable Memory。
- Context Graph 和 MemPalace：可删除、可重建的索引，不是事实源。

## 5. 波次总览

| 波次 | 目标 | 结束条件 |
|---|---|---|
| C0 | 冻结当前基线 | 变更归属清晰，现有测试报告固定，不覆盖用户无关改动 |
| C1 | 正式切流配置 | 新安装默认走新链路，旧用户可迁移，内部可一键回滚 |
| C2 | ActionProposal 产品闭环 | App/小手机可确认、拒绝、撤销，刷新后仍可恢复 |
| C3 | Continuity 四端统一 | App、小手机、桌宠、主动消息表达同一关系事实 |
| C4 | 真实联网检索 | 真实 Provider、来源、时间、失败和服务端安全完整 |
| C5 | 真实数据迁移与旧链关闭 | 真实旧数据三次迁移幂等，残余直接权威写入为 0 |
| C6 | 浏览器产品 E2E | 两种壳完整旅程通过，不允许 SKIP |
| C7 | Android 真机验收 | 冷启动、重启、后台、离线、时区和十条旅程通过 |
| C8 | 灰度、观测与发布门 | 可灰度、可诊断、可回滚，发布命令不能假绿 |

## 6. C0：冻结当前基线

### 工作

1. 不执行 reset、checkout 或覆盖当前脏工作树。
2. 生成本轮相关文件清单，区分：既有用户改动、W/M 两计划改动、本轮新增改动。
3. 固定以下命令的当前结果：
   - `npm run verify:companion-intelligence-v1`
   - `npm run verify:unified-memory-v1`
   - `npm run verify:memory-pipeline`
   - `npm run verify:multi-companion`
   - `npm run verify:context-enterprise`
   - `npm run verify:context-surfaces`
4. 建立 `docs/qa/product-cutover/C0_BASELINE.md`，记录 HEAD、工作树状态、命令结果和已知缺口。
5. 在用户允许提交时，把本轮相关改动放进独立分支/提交；不夹带无关资源删除和 UI 试验。

### 验收

- 六组基线命令全绿。
- 能明确回答每个未提交文件属于哪个计划。
- 没有通过还原工作树破坏已有用户改动。

## 7. C1：正式切流配置

### 设计

不要给普通用户暴露 12 个技术开关。新增一个产品级切流配置：

```text
legacy       旧链，仅用于紧急回滚
internal_v1  新链全开，供开发和迁移验收
production_v1 新安装正式配置
```

详细 flag 只放在开发者诊断页。产品代码通过统一 resolver 获取有效开关，不允许各模块自行拼 localStorage 默认值。

### 主要文件

- 新增 `src/features/cutover-profile.js`
- 修改 `src/features/flags.js`
- 修改 `src/constants.js`
- 修改 `src/main.js` / `src/app.js` 的启动顺序
- 修改 `src/ui/settings-router.js`
- 修改设置页对应 HTML/CSS
- 新增 `scripts/verify-product-cutover-profile.mjs`

### 行为要求

1. `internal_v1` 同时开启 W/M 所需新链路。
2. `production_v1` 在 C2-C7 全部通过前不得成为发布默认。
3. 新安装读取正式 profile；旧安装先运行迁移，再原子切 profile。
4. 服务端 kill switch 可以关闭 Web Retrieval、主动消息和外部动作，但不得把权威数据写回旧系统。
5. 回滚只改变读取/执行路径，不删除新 Repository 中的数据。
6. 启动第一条 Prompt 前必须完成 profile 解析，不能先走旧链后热切换。

### 验收

- 设置页开发者区域可以选择 profile，并显示每个有效 flag 和来源。
- 刷新、重启和切换 App/小手机后 profile 不丢失。
- 新旧 profile 各有一条真实聊天 smoke。
- `internal_v1` 下代码确认不走旧的双检索 Prompt 路径。

## 8. C2：ActionProposal 产品闭环

### 必须补齐的数据层

当前 proposal store 不能只依赖内存 Map。新增持久化 Repository：

- 新增 `src/turn-understanding/proposal-repository.js`
- 状态至少包含：`proposed`、`approved`、`executing`、`completed`、`rejected`、`failed`、`undone`、`expired`
- 保存 `proposalId`、`correlationId`、`turnId`、scope、风险等级、准确影响、时间快照、执行结果和撤销信息。
- 与 UnifiedTask、Calendar event 和 Conversation message 通过 ID 关联。
- 刷新/重启后恢复未完成 proposal；过期 proposal 自动失效，不自动执行。

### 必须补齐的 UI

- 新增 `src/ui/action-proposal-card.js`
- 新增对应样式，复用现有 App 和小手机设计系统。
- 修改 `src/panels/chat.js`
- 修改小手机聊天挂载路径 `src/phone-shell/phone-shell.js`

卡片必须显示：

- 将要做什么。
- 精确日期、时间和时区；没有精确时间时明确写“下午”等区间，禁止猜 15:00。
- 将修改哪个日历/任务/设置。
- 风险等级对应的确认方式。
- `确认`、`拒绝`；执行成功后提供可用的 `撤销`。
- 执行中、成功、失败、已过期、已撤销状态。

### 安全与交互要求

- R0 查询可自动执行，但必须显示来源与结果。
- R1 只在用户明确命令且可撤销时自动执行。
- R2 必须显示精确影响并由用户确认。
- R3 必须二次确认；没有真实能力时不得显示“已发送”。
- 重复点击只执行一次。
- App 和小手机操作同一 proposal 时状态实时一致。
- 结果作为结构化系统消息写回 Conversation V2，并产生对应 Timeline/Task 状态。
- 触控目标不小于 44 CSS px；按下立即有反馈，禁用态不吞事件。

### 验收

通过 UI 完成以下用例：

1. “我明天下午答辩”不创建日历。
2. “帮我明天下午三点加答辩提醒”出现确认卡，确认后只创建一条。
3. 拒绝后无日历副作用。
4. 双击确认仍只有一条事件。
5. 刷新页面后待确认卡仍存在。
6. 执行后撤销，日历和任务状态同步更新。
7. App 发起、小手机确认；反向也成立。

## 9. C3：RelationshipContinuity 四端统一

### 设计

新增统一展示服务，不允许各端自行解释 Stable Memory 或重新计算关系状态：

- 新增 `src/relationship/surface-service.js`
- 输入：companion、当前时间、surface、最近 Timeline、开放约定、Stable Memory、日记/日历等 sourceRef。
- 输出：`headline`、`todayLine`、`recentSharedMoment`、`openLoop`、`suggestedAction`、`evidenceRefs`、`fingerprint`。
- 禁止输出亲密度、信任、张力百分比。

### 触发更新

- 聊天会话完成。
- 日记保存、编辑、删除。
- 日历创建、改期、取消、完成。
- 一起听完成或用户明确表达偏好。
- 阅读摘录/读完一本书。
- 情景剧结局，只进入 `shared_fiction`，不得伪装为现实事实。
- 用户执行忘记或纠正。

### 四端接入

- App：首页/聊天头部读取统一展示模型。
- 小手机：首页关系组件读取同一模型。
- 桌宠：只读取适合短文案的 `todayLine/openLoop`，不另造事实。
- 主动消息：只基于 confirmed event、open loop 和明确偏好触发。

### 主动反馈规则

- 日记写完后允许产生一次“我收到了/我注意到”的 Artifact 回执，但不得复述私密全文。
- 同一 sourceRef + fingerprint 只通知一次。
- 尊重免打扰、频率上限和用户关闭主动消息的设置。
- 没有证据时不生成具体事实。
- 桌宠和通知点击后回到对应 Conversation/Diary/Calendar source。

### 验收

- 同一时刻四端展示的 `fingerprint` 一致。
- 日记保存后四端均能感知；删除后全部消失且不会被 Palace 复活。
- 切换角色后零串线。
- 同日没有新事件时不重复通知。
- 主动消息关闭后不发送，但 Context 仍可在聊天中召回。

## 10. C4：真实 Web Retrieval

### 服务端实现

- 在 `server/retrieval/providers/` 下实现统一 Provider 接口。
- 至少接入一个真实生产 Provider；API Key 只存在服务端环境变量。
- `server/retrieval/index.mjs` 根据配置选择 Provider，不得对未知 Provider 返回伪结果。
- 正常化为 `WebEvidenceV1`：标题、URL、摘要、发布时间、抓取时间、Provider。
- 加入超时、取消、限流、缓存、最大结果数、域名策略和审计日志。
- 搜索与页面抓取继续执行 SSRF、私网 IP、重定向和协议校验。

### 客户端行为

- 只在用户明确询问实时信息或模型明确需要外部证据时触发。
- 回复必须展示可点击来源和检索时间。
- 超时、断网、额度不足和 Provider 失败必须显示诚实状态。
- Web 证据默认只用于当前回复/研究 Artifact，不自动成为用户 Stable Memory。

### 验收

- 测试环境用受控 mock HTTP 验证字段、重试和安全。
- staging 使用真实 Provider 完成至少五类查询。
- 无来源时不能进入 `completed`。
- 客户端构建产物中没有 API Key。
- 断网时普通离线聊天仍可使用。

## 11. C5：真实数据迁移与旧链关闭

### 迁移输入

- 真实浏览器 IndexedDB 导出。
- 真实浏览器 localStorage 导出。
- Android WebView 旧版本数据。
- 至少一份旧完整备份和一份损坏/缺字段备份。
- 多角色、旧 diary.memory、旧 Palace orphan、旧 Timeline、旧关系数值样本。

### 迁移机制

- 新增持久化 migration ledger：版本、开始/结束时间、来源摘要、结果、quarantine 和失败原因。
- 启动只执行轻量检查；大量迁移和重建分批后台运行，不能阻塞首屏。
- 迁移前创建可恢复备份。
- 同一迁移连续执行三次，第二、三次新增记录必须为 0。
- 迁移后从权威 Repository 重建 Context Graph/MemPalace，不复制旧索引作为新事实。
- 无法确定来源的数据进入 `legacy_unverified` 或 quarantine，不自动成为 Stable Memory。

### 旧链删除门

在 internal profile 完整验收后：

- 删除/封死日记对 Palace 的权威写入。
- 删除普通业务直接 `fileDrawer` 权威路径。
- 删除普通关系数值读取和写入。
- 删除 Context Graph 的独立事实写入。
- 删除 TurnUnderstanding flag-on 时的旧 timeline 直写。
- 旧 cohabit localStorage 只作为可重建投影。
- `unified-memory-static-scan --strict` 的未豁免直接权威写入必须为 0。

### 验收

- 真实样本三次迁移幂等。
- 迁移中强杀 App，重启后安全续跑。
- 迁移失败可回滚读取 profile，原数据不丢。
- 旧备份恢复后可重建全部索引。
- 删除/忘记的数据重建后不会复活。

## 12. C6：真实浏览器产品 E2E

重写 `e2e/unified-memory-journey.spec.mjs`。默认必须运行真实 Playwright；缺少服务或浏览器时应失败，不允许 `SKIP` 返回 0。

### 测试约束

- 只能通过可见 UI 操作，不得直接调用 Repository 函数制造结果。
- 使用真实 IndexedDB/localStorage 和真实页面刷新。
- App 版和小手机版分别执行关键旅程。
- 中文、英文至少各完成一次核心聊天/确认流程。
- 失败时保存截图、DOM、console、network 和当前数据摘要。
- 页面有未捕获异常、横向溢出、遮挡关键按钮或点击无响应时失败。

### 必跑旅程

1. 新安装进入 `production_v1`，首条 Prompt 含 TodayContext。
2. 用户明确偏好 -> Candidate -> Stable -> 第二次聊天自然召回。
3. 日记保存 -> 角色回执 -> 可搜索；删除后四端不可召回。
4. 日历 ActionProposal 确认、拒绝、重复点击、撤销、刷新恢复。
5. 一起听只生成开始/完成等低噪声事件，进度 seek 不刷 Timeline。
6. 阅读 chunk 有 sourceRef，删除书后索引消失。
7. 情景剧结局进入 shared_fiction，不污染现实 Stable Memory。
8. 忘记/纠正后旧事实不再召回，索引重建后仍不复活。
9. Companion A/B 的聊天、日记、Stable、Continuity、主动消息完全隔离。
10. 删除 MemPalace/Graph 后从权威源重建，回答保持一致且不重复注入。
11. App、小手机、桌宠模拟层读取同一 Continuity fingerprint。
12. 真实 Web 查询有来源；断网时诚实失败且离线聊天可用。

### 验收

- `npm run e2e:product-cutover-browser` 全绿。
- 报告中 `skipped=0`、`failed=0`。
- 两种壳均有截图和操作证据。

## 13. C7：Android 真机验收

### 设备与安装场景

- 至少一台目标常用 Android 和一台性能较低设备。
- 卸载重装的新用户路径。
- 覆盖安装的旧用户迁移路径。
- App 版和小手机版各跑一轮。

### 必测

- 冷启动、温启动、强杀恢复、锁屏/后台恢复。
- 输入法弹起、发送、确认卡、滚动、返回键、触控反馈。
- 时区切换、跨午夜、过期/改期/取消。
- 在线、弱网、完全离线。
- 日记、日历、听歌、阅读、情景剧、忘记、角色切换和重建。
- 桌宠从 App 退出后继续存在、点击可用、位置/大小恢复。
- 主动消息和通知点击回到正确角色及 source。
- 旧数据迁移期间退出/强杀后无损恢复。

### 性能门

- 迁移不阻塞可操作首屏，不出现长时间纯色“正在打开月栖”。
- 触控后 100ms 内出现视觉反馈。
- 普通聊天发送不等待记忆整理完成；整理在响应后异步执行。
- Prompt 本地组装和索引检索不得形成可感知的秒级阻塞。
- 记录冷/温启动、迁移耗时、Prompt 组装、索引查询和内存峰值；超预算必须给出 trace，不用 loading 遮盖。

### 证据

- `docs/qa/product-cutover/android/` 保存设备信息、APK hash、录屏、截图、logcat、每条旅程结果和缺陷关闭记录。
- 没有 APK 安装和操作证据不得标记 C7 完成。

## 14. C8：观测、灰度、回滚与发布门

### 隐私安全的观测指标

只记录结构化状态和耗时，不上传聊天/日记正文：

- profile 与有效 flags。
- migration 成功/失败/quarantine 数量。
- proposal proposed/completed/rejected/failed/expired/duplicate 数量。
- projection outbox backlog、失败和延迟。
- Broker 各来源命中、去重和预算耗时。
- Continuity 重建原因、fingerprint 变化和跨端不一致。
- Web Provider 成功、失败、超时和无来源拒绝。

### 灰度

1. internal：开发设备全开。
2. staging：真实 Provider + 真实迁移样本。
3. 5%：监控迁移失败、重复写入、proposal 卡死和启动耗时。
4. 25%：验证主动消息频率、角色隔离和 Web 成本。
5. 100%：确认无 P0/P1 后成为新安装默认。

### 回滚

- 一键切回 `legacy` 读取/执行 profile。
- 不删除新 Repository 数据，不回滚到双权威写入。
- Web、主动消息、外部动作有独立 kill switch。
- 每次灰度都先演练回滚，并验证用户数据仍可读取。

## 15. 最终发布命令

新增严格聚合命令：

```text
npm run verify:product-cutover-node
npm run verify:product-cutover-migration
npm run e2e:product-cutover-browser
npm run verify:product-cutover-release
```

`verify:product-cutover-release` 必须检查：

1. W/M Node 套件和旧回归全绿。
2. production profile 需要的 flags 全部有效。
3. 未豁免的旧权威写入为 0。
4. 真实 Provider 已配置且 staging 查询有来源。
5. 浏览器 E2E `skipped=0`。
6. Android 验收报告存在、APK hash 匹配且十条旅程全通过。
7. migration 三次幂等和备份恢复通过。
8. 当前构建没有未解释的 console error、数据隔离错误或 P0/P1 缺陷。

任何一项缺失必须非零退出，不能输出绿色发布结论。

## 16. Cursor 执行纪律

1. 严格按 C0 -> C8 顺序，不并行修改同一核心文件。
2. 每次只完成一个波次；波次结束后先跑验收，再更新状态。
3. 每波提交：变更文件、行为说明、命令原始结果、截图/录屏、已知缺口和回滚方法。
4. 子 agent 可以做独立调查或测试，但主 agent 必须复核代码和真实产品行为。
5. 不得把 fixture、stub、直接 Repository 调用或 `SKIP` 结果作为产品证据。
6. 不得为了过测试硬编码固定回复、固定检索结果或绕过 UI。
7. 不得修改小手机/App 的无关视觉风格；只添加完成闭环所需的卡片、状态和诊断入口。
8. 不得恢复亲密度、信任、张力数值。
9. 不得让索引成为第二事实库。
10. 每波如果发现前置波次不成立，立即回到前置波次修复，不继续堆新模块。

## 17. 最终 Definition of Done

只有同时满足以下条件，两份前置计划才可以从“代码基线完成”改为“产品完成”：

- 新安装和迁移后的旧用户默认走正式新链路。
- 用户能在聊天里看见并操作所有需要审批的动作。
- App、小手机、桌宠、主动消息读取同一时间、记忆和 Continuity 结果。
- 日记、日历、听歌、阅读和情景剧均有唯一权威源及可追溯 sourceRef。
- Candidate -> Stable 是唯一长期记忆提升路径。
- Context Broker 是唯一 Prompt 检索入口，重复 sourceRef 不重复注入。
- MemPalace/Context Graph 可完全删除并从权威源重建。
- 删除、忘记和纠正跨所有表面生效，旧事实不会复活。
- 联网检索是真实服务端 Provider，结果有来源，断网不伪造完成。
- 浏览器 12 条旅程和 Android 真机十条旅程全通过，零 SKIP。
- 真实旧数据迁移、强杀恢复、备份恢复和三次幂等通过。
- 发布有观测、灰度、kill switch 和已演练的非破坏性回滚。

在此之前，对外只能表述为“底层架构已实现，产品切流与发布验收进行中”。
