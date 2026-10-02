# 月栖数字伴侣 V2 — Implementation Checklist

权威规格：`docs/DIGITAL_COMPANION_V2_MASTER_PLAN.md`  
实施说明：`tasks/plan.md`

## Phase 0 — Contract and Baseline

- [x] 0.1 冻结当前行为与失败门禁
  - [x] 记录 legacy profile 与有效 flags
  - [x] 复现 Prompt preview ≠ request
  - [x] 复现 A/B 角色 Prompt 串源
  - [x] 记录主聊天无 tools 字段
  - [x] 记录 First Light 与角色卡字段损失
- [x] 0.2 定义并校验 V2 contracts
  - [x] CharacterProfileV2
  - [x] UserCompanionPreferenceV2
  - [x] TurnExecutionSnapshotV1
  - [x] PreparedModelRequestV1
  - [x] CapabilityOperationV2 / ToolRunV1
  - [x] CharacterImportReportV1
- [x] 0.3 Repository transaction / journal
  - [x] IndexedDB transaction
  - [x] SQLite transaction
  - [x] localStorage saga + commit marker
  - [x] 中断恢复与幂等测试

### Gate 0

- [ ] 合同 review 通过
- [x] 存储失败注入测试通过
- [ ] 未修改/重置无关脏工作树

## Phase 1 — Single Authority and Prompt Correctness

- [x] 1.1 Character Store V2 additive migration
- [x] 1.2 Per-character draft + explicit CAS save
- [x] 1.3 Complete immutable TurnExecutionSnapshot
- [x] 1.4 Prompt Compiler 去 DOM 化
- [x] 1.5 PreparedModelRequest + budget ledger

### Gate 1

- [x] A/B 角色切换/编辑/发送 500 次串线数 = 0
- [x] 当前输入、身份、边界、receipt 永不被预算裁掉
- [x] Preview 编译零持久化副作用
- [ ] Inspector request hash = 实际网络请求 hash

## Phase 2 — Prompt Editor UX

- [x] 2.1 App/手机共享 editor container
- [x] 2.2 身份/性别/代词/人格/关系结构化编辑
- [x] 2.3 Advanced Prompt workspace
  - [x] system supplement
  - [x] developer supplement
  - [x] post-history instructions
  - [x] scenario
  - [x] primary/alternate greetings
  - [x] example dialogue
  - [ ] worldbook links
- [x] 2.4 Request Inspector
  - [x] 草稿 / 已保存 / 上次发送三态
  - [x] block/provenance/token/truncation
  - [x] tools/capability reason
  - [x] 敏感信息默认遮蔽
  - [x] 无副作用 sandbox
- [x] 2.5 Revision history / diff / restore

### Gate 2

- [x] Basic / Advanced 无损切换
- [x] App / 手机保存与读取一致
- [x] 保存失败保留草稿并显示错误
- [x] 多标签冲突不静默覆盖
- [ ] 320/360/390/412/768/1024/1440 响应式通过
- [x] WCAG 2.1 AA、44px 触控、IME 稳定
- [x] 50k 字编辑无 >200ms 连续主线程阻塞

## Phase 3 — High-Quality First Light

- [x] 3.1 First Light V2 state machine
  - [x] Quick
  - [x] Careful
  - [x] Import
  - [x] explicit/default/skipped/import_review
- [x] 3.2 Questionnaire UI
  - [x] 角色名
  - [x] 性别/代词/暂不设定
  - [x] 用户称呼/代词
  - [x] 关系类型
  - [x] 陪伴目的
  - [x] support style
  - [x] initiative cadence
  - [x] intimacy/flirt
  - [x] conflict repair
  - [x] autonomy
  - [x] nudge/quiet hours
  - [x] hard boundaries
- [x] 3.3 Atomic First Light commit
- [x] 3.4 Field→record→Prompt 100% compiler coverage
- [x] 3.5 Model preview + deterministic fallback + first real message

### Gate 3

- [x] Quick 路径 ≤2 分钟
- [x] Careful pause/resume 无答案丢失
- [x] 导入路径真实打开 importer
- [x] Identity/pronoun/address 正确率 100%
- [x] 未设定性别时猜测率 0
- [x] First Light 字段 Prompt 覆盖率 100%
- [x] 首轮具体人格/关系信息 ≥2 项
- [x] 首轮客服腔/问卷复述/AI 元话术 ≤5%
- [ ] 偏好盲评遵循率 ≥90%
- [ ] 分歧场景自然表达不同意见 ≥80%
- [x] 操控、嫉妒勒索、现实隔离建议 = 0

## Phase 4 — Governed Tool Loop

- [x] 4.1 CapabilityOperationV2 self-registering descriptors
- [x] 4.2 Persisted ToolRun state machine
- [x] 4.3 Hosted/BYOK tool provider negotiation
- [x] 4.4 Planner→policy→executor→receipt→final render
- [x] 4.5 Regex/TurnUnderstanding/OpenClaw 进入同一 ledger
- [x] 4.6 App/手机 persistent approval UI

### Gate 4

- [ ] 成功声明 receipt 覆盖率 100%
- [ ] pending/failed/unknown 假成功 = 0
- [ ] 重复副作用 = 0
- [ ] R2/R3 未批准执行 = 0
- [ ] 双击/刷新/重试日历只写一条
- [ ] 执行前重校验权限/网络/账号/前台状态
- [ ] 不支持 tool calling 的 Provider 明确降级
- [ ] weather/search/calendar/location/notification 成功与失败 E2E

## Phase 5 — Tavern Compatibility and Lifecycle

- [x] 5.1 V2/V3 path-level support matrix
- [x] 5.2 JSON + PNG tEXt/iTXt/zTXt safe parser
- [x] 5.3 Persist greetings/examples/scenario/prompts
- [x] 5.4 character_book → character-scoped worldbook
- [x] 5.5 Import report + new/overwrite + cold-start merge
- [x] 5.6 Export/privacy/delete/copy/tombstone semantics

### Gate 5

- [ ] V2 JSON fixture
- [ ] V3 JSON fixture
- [ ] PNG compressed metadata fixture
- [ ] malformed/bomb/oversized/malicious fixtures
- [ ] first_mes/alternate/mes_example/scenario/prompts/worldbook 刷新后存在
- [ ] 每个输入字段有 preserved/transformed/demoted/dropped 报告
- [ ] `.nychar` 无用户偏好、历史、记忆、支付和凭据
- [ ] 承诺字段 round trip 一致

## Phase 6 — Migration, Evaluation, and Release

- [x] 6.1 Dry-run legacy migration + ledger
- [x] 6.2 internal_v2 cutover + privacy-safe observability
- [x] 6.3 Companion behavior evaluation corpus
- [ ] 6.4 Browser two-shell E2E
- [ ] 6.5 Android real-device journeys
- [x] 6.6 Hosted/BYOK provider matrix
- [x] 6.7 production_v2 release gate + rollback rehearsal

### Final Release Gate

- [ ] Node/contract tests green
- [ ] Browser App + phone full journeys green
- [ ] Browser SKIP = 0
- [ ] Browser repository bypass = 0
- [ ] Console errors = 0
- [ ] Android evidence complete
- [ ] Hosted + supported BYOK tools green
- [ ] Unsupported BYOK degradation green
- [ ] Real migration samples ≥3 classes
- [ ] Canary has zero cross-character bleed
- [ ] Canary has zero duplicate tool side effect
- [ ] Canary has zero partial onboarding commit
- [ ] Performance thresholds met or product promise revised
- [ ] Rollback rehearsed without deleting V2 data
- [ ] `npm run verify:companion-v2-release` fails on every missing artifact
- [ ] production_v2 may become default

## Definition of Done

- [ ] One authority per Prompt, character, preference and tool execution path
- [ ] Cold-start answer coverage 100%
- [ ] Specific, bounded, non-manipulative first-turn companion behavior
- [ ] High-freedom Prompt editor with visible limits and truncation
- [ ] Receipt-backed truthful tools
- [ ] No cross-character/user leakage
- [ ] No silent character-card field loss
- [ ] Browser + Android + Provider + migration evidence complete

