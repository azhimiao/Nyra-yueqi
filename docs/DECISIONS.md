# Decisions (ADR-style)

Updated: 2026-08-15. 新 Agent **不得**在无用户确认时推翻下列决策。

## D1 — 本地优先 + 可选云网关

- **Decision:** 记忆/聊天权威在设备；模型经本地或自建 `server/index.mjs` 网关。  
- **Why:** 陪伴数据敏感；可 BYOK。  
- **Reject:** 纯云端会话库作为唯一权威。

## D2 — Nyra Hosted | BYOK（Billing v1 修订）

- **Decision:** 不存在 Subscription。Nyra Hosted 绑定在线账号并只按可用 Billing
  Credits 判断；BYOK 可在离线模式使用。首次真实购买 Credits 永久写入
  `memberSince`，但 Member Badge 不参与权限判断。
- **Supersedes:** 旧 `developer | subscription` 双产品模式。
- **Docs:** `docs/BILLING_V1.md`, `docs/MODEL_RUNTIME_PRODUCTION.md`.

## D3 — 桌宠外观 ≠ 角色身份

- **Decision:** 引导不选桌宠；桌宠在库中后换。角色卡管人格/记忆。  
- **Why:** 用户明确：桌宠不是角色。  
- **Code:** `src/onboarding/wizard.js`, `src/avatar/pet-catalog.js`.

## D4 — Avatar 质量轨 A（星梨/月栖 generate）ACTIVE；V2 PAUSED

- **Docs:** `docs/ACTIVE_PET_PIPELINE.md`.

## D5 — Conversation V2 为聊天权威写路径

- **Decision:** 助手落盘必须过 Conversation V2；拒绝 IDB-only 伪成功。  
- **Code:** `src/conversation/`, `src/panels/chat.js`.

## D6 — Runtime 标记用 `<yueqi-runtime>` JSON

- **Decision:** 不用自由 `[[action]]` 作为生产协议。  
- **Code:** `src/runtime/protocol.js`.

## D7 — BillingCredit ≠ NyraCoin

- **Docs:** `docs/AI_ECONOMY_V1.md`.

## D8 — Cutover profile 默认 legacy

- **Decision:** 发版前保持 legacy；C8 前禁止宣称 production_v1。  
- **Status:** `docs/qa/product-cutover/STATUS.md`.  
- **Fix 2026-08-13:** 代码曾误翻 `DEFAULT_CUTOVER_PROFILE=production_v1`；审计已回滚为 `legacy`，并禁止隐式 legacy→production 自动升级。

## D9 — 关系 Continuity 非数值亲密度 UI

- **Decision:** W1 后普通聊天不写 intimacy/trust 增量（除非显式产品开关）。

## D10 — 视觉记忆「她自己」为拍照必需桶

- **Decision:** 相册仅「她自己」标必需；经历/共享可后补。  
- **Code:** `src/visual-memory/bridge-library.js`, gallery UI.

## D11 — 安全静态门保持诚实

- **Decision:** `verify:security` 必须跟当前转义实现；过期 grep 要修脚本或修代码，禁止删检查装绿。  
- **Fix 2026-08-13:** 日历改用 `escapeHtml(displayTitle)` 后更新 `scripts/verify-security.mjs`。

## D12 — 时间权威走 `getClock()`

- **Decision:** TTL / expire / 测试时间一律用 `src/temporal/clock.js` 的注入时钟；禁止裸 `Date.now()` 做提案过期。  
- **Fix 2026-08-13:** `expireStale` 默认 `getClock().nowMs()`（否则固定时钟下的 C2 提案会被墙钟 TTL 误过期）。

## D13 — 公网上游 SSRF 硬化

- **Decision:** BYOK Base URL 走 `server/upstream-url.mjs` + `validateFetchUrl`；公网拒绝私网/metadata；本机开发允许 loopback（Ollama）。  
- **Verify:** `npm run verify:tech-debt-audit` · `verify:security`.

## D14 — 账号积分与 sync 串行事务

- **Decision:** `server/account-store.mjs` `transact` 串行化 credits / sync / grants，避免 lost update。  
- **Sync:** 上传 `version < serverVersion` → 409 `version_conflict`.

## D15 — Conversation V2 损坏不空写

- **Decision:** 解析失败先恢复 `.tmp`；双失败则 quarantine 并 `writeBlocked`，禁止用空 bag 覆盖聊天权威。

## D16 — First Light 对新用户是必经流程

- **Decision:** 产品门（CP-16 语言/账号/模式/界面）之后，新装必须走首次点亮；只有 CP-16 之前就有陪伴使用痕迹的老用户才自动标记完成。
- **Why 2026-08-14:** `ensureFirstLightMigration` 原来只看 `hasProductOnboardingDone`，而向导 `onComplete` 紧接着就调它，导致全新用户在引导结束那一刻被当成老用户迁移（`done:true` + `deferredFromMandatoryOnboarding:true`），首次点亮永不出现。
- **Repair:** 被这条分支误标的本机状态（`deferredFromMandatoryOnboarding` 且无 `committedCharacterId`、无使用痕迹）在下次启动时归还流程。
- **Code:** `src/first-light/state.js`, `src/first-light/ui.js`, `src/app.js`.
- **Verify:** `npm run verify:first-light` · `verify:onboarding-cp16`.

## D17 — Data portability taxonomy（实体 / 资源 / 用户数据 / 备份）

- **Decision:** Character = structured entity；Book / Music / Image = resource；chat / relationship / memory / settings = user data；backup = snapshot。`.nychar` 只装可分享角色实体，排除私有关系与历史；`.nyra` 是一次性用户数据归档快照。目标格式仍为 **TARGET/DRAFT**，不得当作已实现运行时能力。
- **Why:** 可分享实体、用户隐私数据、媒体资源与设备快照边界必须分开，避免把私有历史打进角色包或把遗留导出误称为 `.nyra`。
- **Docs:** `docs/architecture/adr/002-data-entities-resources-portability.md`, `docs/formats/README.md`.
