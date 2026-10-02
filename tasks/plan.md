# Implementation Plan: 月栖数字伴侣 V2

## Overview

本计划把 `docs/DIGITAL_COMPANION_V2_MASTER_PLAN.md` 拆成可独立验证、可回滚的纵向任务。实现顺序固定为：

`权威数据源 → Prompt 编译与编辑器 → 冷启动 → 工具闭环 → 角色卡兼容 → 切流与发布`

禁止先改 Prompt 文案再补数据链路；禁止同时保留 DOM 与 Store 为模型权威源。

## Architecture Decisions

1. 每轮聊天使用不可变 `TurnExecutionSnapshot`，而非实时读取 activeCharacter/DOM。
2. `CharacterProfileV2` 是可分享角色实体；`UserCompanionPreferenceV2` 是 `(userId, characterId)` 私有关系数据。
3. Prompt Compiler 是纯函数；Preview 与真实请求共享 `PreparedModelRequest`。
4. 草稿自动保存，提交显式保存；使用 `baseRevision` compare-and-swap。
5. 所有工具路径进入一个持久化 `ToolRun` ledger；只有一个 executor 可产生副作用。
6. 导入卡内容是非可信角色数据，不能提升为平台策略或工具权限。
7. `internal_v2` 全链验收后才允许 `production_v2`。

## Dependency Graph

```text
Contracts + repositories
  ├─ Character editor save/revision
  ├─ First Light V2 commit
  ├─ TurnExecutionSnapshot
  │    └─ Pure Prompt Compiler
  │         ├─ Request Inspector
  │         ├─ Companion behavior eval
  │         └─ Tool planner/final render
  ├─ ToolRun repository
  │    └─ Unified executor + approval UI
  └─ Character import mapping
       └─ Greetings/examples/lore runtime

All vertical slices
  └─ migration + internal_v2
       └─ browser/Android/provider gates
            └─ production_v2
```

## Phase 0: Contract and Baseline

### Task 0.1: Freeze behavioral baseline

**Description:** Record the current behavior and failing release gates before changing authorities.

**Acceptance criteria:**
- Current cutover profile, prompt preview mismatch, First Light field loss, tool request shape, and import loss are captured.
- Existing dirty worktree is not reset or overwritten.
- Baseline includes one A/B character contamination reproduction.

**Verification:**
- `npm run verify:onboarding-cp16`
- `npm run verify:product-cutover-node`
- Targeted browser reproduction recorded under `docs/qa/companion-v2/P0_BASELINE.md`.

**Dependencies:** None

**Likely files:**
- `docs/qa/companion-v2/P0_BASELINE.md`
- `scripts/verify-companion-v2-baseline.mjs`

**Scope:** S

### Task 0.2: Define V2 contracts and validators

**Description:** Add runtime-validated contracts for CharacterProfileV2, UserCompanionPreferenceV2, TurnExecutionSnapshotV1, PreparedModelRequestV1, ToolRunV1, and CharacterImportReportV1.

**Acceptance criteria:**
- Every contract separates `schemaVersion` and mutable `revision`.
- IDs, limits, provenance, explicitness, sensitivity, and error shapes are defined.
- Invalid or oversized inputs fail at boundaries with stable reason codes.

**Verification:**
- Contract unit tests for valid, missing, unknown, oversized, and migration inputs.

**Dependencies:** Task 0.1

**Likely files:**
- `src/contracts/character-profile-v2.js`
- `src/contracts/user-companion-preference-v2.js`
- `src/contracts/turn-execution-snapshot-v1.js`
- `src/contracts/prepared-model-request-v1.js`
- `src/contracts/tool-run-v1.js`

**Scope:** M (split into two commits if >5 files)

### Task 0.3: Add repository transaction/journal abstraction

**Description:** Provide atomic multi-record writes for IndexedDB/SQLite and journaled saga fallback for localStorage.

**Acceptance criteria:**
- Commit events/cache publication happen only after durable commit.
- Crash at every intermediate step resumes or rolls back deterministically.
- Same idempotency key cannot create duplicate character/opening/preference records.

**Verification:**
- Injected failure tests for IndexedDB, SQLite adapter, quota error, and restart recovery.

**Dependencies:** Task 0.2

**Likely files:**
- `src/storage/transaction.js`
- `src/storage/journal.js`
- `src/storage/db.js`
- `src/storage/sqlite-adapter.js`
- `src/storage/transaction.test.mjs`

**Scope:** M

### Checkpoint 0

- Contracts and failure semantics reviewed.
- Baseline remains reproducible.
- Storage failure tests green.

## Phase 1: Single Authority and Prompt Correctness

### Task 1.1: Migrate Character store to V2 repository

**Description:** Wrap existing character records in additive V2 normalization while preserving unknown/custom fields and legacy IDs.

**Acceptance criteria:**
- Existing custom Prompt bytes are preserved.
- Stock prompts are recognized only by version/hash, never substring.
- Create/read/update/delete/list remain backward compatible.

**Verification:**
- Existing `verify-characters-m0..m5`.
- New legacy→V2 fixtures and custom-prompt preservation tests.

**Dependencies:** Tasks 0.2–0.3

**Likely files:**
- `src/characters/store.js`
- `src/characters/profile.js`
- `src/characters/migration-v2.js`
- `scripts/verify-characters-v2.mjs`

**Scope:** M

### Task 1.2: Add per-character draft and CAS save service

**Description:** Separate auto-saved drafts from committed character records and bind drafts to `editingCharacterId + baseRevision`.

**Acceptance criteria:**
- Switching characters never moves one draft to another.
- Revision conflict returns a visible conflict object; no silent overwrite.
- Save failure keeps the draft.

**Verification:**
- Two-tab stale save test.
- Switch A→B→A with unsaved edits test.
- Reload preserves committed record and draft separately.

**Dependencies:** Task 1.1

**Likely files:**
- `src/characters/draft-store.js`
- `src/characters/editor-service.js`
- `src/characters/store.js`
- `src/characters/editor-service.test.mjs`

**Scope:** M

### Task 1.3: Build complete TurnExecutionSnapshot

**Description:** Freeze session, speaker, participants, character revisions, relationship scope, locale, preset, provider and capability state before prompt assembly.

**Acceptance criteria:**
- DM and group snapshots validate all referenced records.
- Deleted/revised/mismatched records fail closed or trigger an explicit rebuild.
- Snapshot is immutable and has deterministic hash.

**Verification:**
- Mid-turn active-character switch does not change request.
- Group speaker and participant revisions are stable.
- Delete character mid-turn produces controlled failure.

**Dependencies:** Task 1.1

**Likely files:**
- `src/conversation/turn-execution-snapshot.js`
- `src/characters/session-context.js`
- `src/panels/chat.js`
- `src/conversation/turn-execution-snapshot.test.mjs`

**Scope:** M

### Task 1.4: Make Prompt Compiler pure and DOM-free

**Description:** Compile only from TurnExecutionSnapshot and repositories; remove `collectPromptTexts` from model path and eliminate duplicate custom supplements.

**Acceptance criteria:**
- No prompt/model module reads input/textarea DOM.
- Character Identity and user relationship data come from one snapshot.
- Preview compilation has zero writes and zero one-shot context consumption.

**Verification:**
- Static check forbids DOM selectors in prompt/model modules.
- Golden block-order tests.
- A/B 500-cycle contamination test returns zero failures.

**Dependencies:** Tasks 1.2–1.3

**Likely files:**
- `src/app.js`
- `src/prompt/assemble.js`
- `src/prompt/companion-contract-v2.js`
- `scripts/verify-prompt-authority-v2.mjs`

**Scope:** M

### Task 1.5: Introduce PreparedModelRequest and budget ledger

**Description:** Finalize messages, tools, output reserve, truncation and provenance in one object before network transport.

**Acceptance criteria:**
- Protected blocks cannot be evicted by examples/lore/history.
- Every omitted/truncated block has a reason.
- Request hash is deterministic after provider normalization.

**Verification:**
- Extreme prompt/lore/history budget tests.
- Current input, identity, boundaries, receipts and output reserve always survive.

**Dependencies:** Task 1.4

**Likely files:**
- `src/prompt/finalize-model-request.js`
- `src/prompt/budget.js`
- `src/panels/chat.js`
- `src/prompt/finalize-model-request.test.mjs`

**Scope:** M

### Checkpoint 1

- Model path has one authority.
- Cross-character contamination test is zero.
- Final request is inspectable and budget-safe.

## Phase 2: Prompt Editor UX

### Task 2.1: Build shared editor container

**Description:** Create a shared data/state container used by App and phone shells for Basic and Advanced editing.

**Acceptance criteria:**
- Both shells read/write the same draft and committed revision.
- Basic and Advanced mode do not lose fields when toggled.
- Unsaved changes prompt appears on navigation/switch/close.

**Verification:**
- Browser tests at 320/360/390/412/768/1024/1440.
- Cross-shell edit/save/reload journey.

**Dependencies:** Tasks 1.2, 1.4

**Likely files:**
- `src/characters/editor-controller.js`
- `src/panels/profile.js`
- `src/phone-shell/phone-shell.js`
- `src/phone-shell/app-screens.js`
- `styles.css`

**Scope:** M

### Task 2.2: Implement structured identity/persona/relationship sections

**Description:** Add identity, gender/pronouns, personality, values, voice, relationship and private preference editors.

**Acceptance criteria:**
- Private user×character fields are visibly marked and excluded from exports.
- Gender/pronouns support custom and unset states.
- Sensitive defaults remain off unless explicit.

**Verification:**
- Field-level form validation and accessibility tests.
- Export fixture proves private fields absent.

**Dependencies:** Task 2.1

**Likely files:**
- `src/characters/editor-sections.js`
- `src/relationship/preference-editor.js`
- `src/i18n/locales/zh-CN.js`
- `src/i18n/locales/en.js`
- `styles.css`

**Scope:** M

### Task 2.3: Implement Advanced Prompt workspace

**Description:** Add editable Character System Supplement, Developer Supplement, post-history, scenario, greetings, examples and authority explanations.

**Acceptance criteria:**
- Limits and effective injection budgets are visible.
- Users can store long content without forcing all of it into each turn.
- Imported prompts are labelled untrusted/demoted.

**Verification:**
- 50k-character IME/performance test.
- Limit warning at 70/90/100%.
- No custom content overrides Platform Reality in compiled output.

**Dependencies:** Tasks 2.1–2.2

**Likely files:**
- `src/characters/prompt-workspace.js`
- `src/characters/editor-controller.js`
- `src/prompt/assemble.js`
- `styles.css`

**Scope:** M

### Task 2.4: Replace fake preview with Request Inspector

**Description:** Show saved/draft diff, blocks, messages, provenance, budget, tools and sandbox effect from PreparedModelRequest.

**Acceptance criteria:**
- Inspector clearly labels draft vs saved vs last-sent.
- Sensitive data is masked by default.
- Sandbox has no writes to conversation, memory, relationship or tools.

**Verification:**
- Inspector hash equals intercepted network request hash.
- Preview side-effect test compares all repositories before/after.

**Dependencies:** Tasks 1.5, 2.3

**Likely files:**
- `src/prompt/inspector-ui.js`
- `src/companion/debug-console.js`
- `src/panels/profile.js`
- `index.html`
- `styles.css`

**Scope:** M

### Task 2.5: Add version history, diff and restore

**Description:** Retain 20 local committed revisions and provide restore as a new revision.

**Acceptance criteria:**
- Restore never erases newer revision history.
- Imported overwrite automatically creates a restorable revision.
- Diff includes structured and free-text fields.

**Verification:**
- Save 21 revisions, restore old revision, reload.
- Conflict and restore interaction test.

**Dependencies:** Task 2.1

**Likely files:**
- `src/characters/revision-repository.js`
- `src/characters/editor-controller.js`
- `src/characters/revision-ui.js`
- `src/characters/revision-repository.test.mjs`

**Scope:** M

### Checkpoint 2

- App and phone editor parity.
- WCAG/IME/responsive gates green.
- Preview proves actual compiled request.

## Phase 3: High-Quality First Light

### Task 3.1: Define First Light V2 state machine

**Description:** Model Quick, Careful and Import paths with field explicitness and tri-state consent.

**Acceptance criteria:**
- Required/unset/skipped are distinct.
- Quick defaults are conservative and not recorded as user preference.
- Import path records `importedCharacterId` and does not overwrite identity.

**Verification:**
- State transition/property tests for back/resume/restart/error.

**Dependencies:** Tasks 0.2, 1.1

**Likely files:**
- `src/first-light/state-v2.js`
- `src/first-light/controller-v2.js`
- `src/first-light/state-v2.test.mjs`

**Scope:** M

### Task 3.2: Build V2 questionnaire UI

**Description:** Collect identity/gender/pronouns, user address, relationship, purposes, support, initiative, intimacy, autonomy, conflict repair, nudge and boundaries.

**Acceptance criteria:**
- Quick completes in ≤2 minutes in usability test.
- Careful can pause/resume with no answer loss.
- No sensitive behavior is enabled from skipped/default fields.

**Verification:**
- Keyboard/touch/screen-reader journeys.
- 320–412 px mobile screenshots and browser E2E.

**Dependencies:** Task 3.1

**Likely files:**
- `src/first-light/ui-v2.js`
- `src/first-light/locales/zh-CN.js`
- `src/first-light/locales/en.js`
- `styles/first-light-v2.css`

**Scope:** M

### Task 3.3: Implement atomic First Light commit

**Description:** Commit character, private preference, relationship, autonomy, conversation and opening message as one transaction/saga.

**Acceptance criteria:**
- Any failure resumes or rolls back.
- Same commit id is idempotent.
- No completed marker before all authorities commit.

**Verification:**
- Failure injection at every write boundary.
- Double tap/reload during commit creates one opening message.

**Dependencies:** Tasks 0.3, 3.1–3.2

**Likely files:**
- `src/first-light/commit-v2.js`
- `src/first-light/migration-v2.js`
- `src/first-light/commit-v2.test.mjs`

**Scope:** M

### Task 3.4: Compile all explicit First Light fields

**Description:** Map V2 character and preference records to Character Identity and Relationship Contract blocks.

**Acceptance criteria:**
- Field→record→block coverage is 100%.
- No duplicate Platform Kernel inside Character Identity.
- Shared fiction/history is labelled as agreed setup, not real-world fact.

**Verification:**
- Golden snapshots across 60 persona/preference combinations.
- Field coverage meta-test fails when a new field has no compiler mapping.

**Dependencies:** Tasks 1.4, 3.3

**Likely files:**
- `src/prompt/character-identity-v2.js`
- `src/prompt/relationship-contract-v2.js`
- `src/prompt/assemble.js`
- `scripts/verify-first-light-prompt-coverage.mjs`

**Scope:** M

### Task 3.5: Generate preview and first real message

**Description:** Preview can use model or deterministic fallback; first real message uses committed PreparedModelRequest.

**Acceptance criteria:**
- Preview adjustments update durable structured fields.
- First message expresses ≥2 specific identity/relationship details without questionnaire recap.
- Failure fallback uses no invented shared history.

**Verification:**
- Model success/failure/offline fixtures.
- First-turn quality evaluation suite.

**Dependencies:** Tasks 2.4, 3.4

**Likely files:**
- `src/first-light/preview-v2.js`
- `src/first-light/opening-message.js`
- `src/first-light/ui-v2.js`
- `scripts/eval-first-light-v2.mjs`

**Scope:** M

### Checkpoint 3

- Cold-start persistence and prompt coverage 100%.
- Identity/pronoun/address correctness 100%.
- First-turn behavioral quality meets master-plan thresholds.

## Phase 4: Governed Tool Loop

### Task 4.1: Convert capabilities to executable operation descriptors

**Description:** Each operation owns schemas, state resolver, risk, permissions, executor, receipt and undo contract.

**Acceptance criteria:**
- Advertised availability is operation-specific with reason codes.
- Feature/platform/account/network/permission/provider state is intersected.
- Risk cannot be supplied by model/imported content.

**Verification:**
- Descriptor completeness test.
- Every implemented registry row has executor and schemas.

**Dependencies:** Task 0.2

**Likely files:**
- `src/capabilities/operation-registry-v2.js`
- `src/capabilities/device-tools.js`
- `src/capabilities/registry.js`
- `src/capabilities/operation-registry-v2.test.mjs`

**Scope:** M

### Task 4.2: Implement persisted ToolRun repository/state machine

**Description:** Store planning, approval, execution, unknown, reconciliation and undo with stable idempotency.

**Acceptance criteria:**
- Reload resumes pending approval.
- Side-effect retry cannot duplicate execution.
- Unknown outcome never auto-retries.

**Verification:**
- Double click, timeout-after-commit, crash, reload and reconciliation tests.

**Dependencies:** Tasks 0.3, 4.1

**Likely files:**
- `src/tools/tool-run-repository.js`
- `src/tools/tool-run-state.js`
- `src/tools/tool-run-repository.test.mjs`

**Scope:** M

### Task 4.3: Add provider tool-capability adapters

**Description:** Normalize Hosted/BYOK function-calling differences and negotiate support.

**Acceptance criteria:**
- Non-supporting providers return explicit capability status.
- Tool arguments and tool-role transcripts normalize consistently.
- Planner calls are bounded by rounds, calls, time and Credits.

**Verification:**
- Fixtures for OpenAI-compatible variants, empty content, multiple calls, malformed args and rejected tool role.

**Dependencies:** Tasks 1.5, 4.1

**Likely files:**
- `src/model/tool-provider-adapter.js`
- `src/model/client.js`
- `server/index.mjs`
- `src/model/tool-provider-adapter.test.mjs`

**Scope:** M

### Task 4.4: Implement planner→policy→executor→receipt→final render

**Description:** Connect the main companion turn to actual tools and final persona response.

**Acceptance criteria:**
- Chat sends actual tools or a declared governed fallback.
- Final reply sees trusted receipts and pending/failed/unknown states.
- No execution claim without receipt.

**Verification:**
- Weather, search, calendar read/write, location and permission-denied E2E.

**Dependencies:** Tasks 1.5, 4.2–4.3

**Likely files:**
- `src/tools/companion-tool-loop.js`
- `src/panels/chat.js`
- `src/capabilities/registry.js`
- `src/model/client.js`
- `src/tools/companion-tool-loop.test.mjs`

**Scope:** M

### Task 4.5: Route legacy detectors and OpenClaw through ToolRun

**Description:** Make regex, TurnUnderstanding, shortcuts and OpenClaw detection-only producers of ToolRun proposals.

**Acceptance criteria:**
- Exactly one side-effect executor exists.
- Regex does not execute negated/quoted/ambiguous writes.
- Timeout planner and fallback cannot race.

**Verification:**
- Duplicate-intent and negation corpus.
- Static test forbids direct executor calls outside ToolRun service.

**Dependencies:** Task 4.4

**Likely files:**
- `src/turn-understanding/dispatcher.js`
- `src/turn-understanding/executor.js`
- `src/integrations/openclaw/OpenClawToolAdapter.js`
- `src/agent-orchestrator/index.js`
- `scripts/verify-single-tool-authority.mjs`

**Scope:** M

### Task 4.6: Complete approval UI parity

**Description:** App and phone show one persistent proposal card state and support confirm/reject/undo/reconcile.

**Acceptance criteria:**
- Exact effect, risk, target, time/timezone and status are visible.
- App initiation/phone confirmation and reverse both work.
- 44px touch and keyboard/reader accessibility.

**Verification:**
- Browser two-shell E2E and Android confirmation flow.

**Dependencies:** Tasks 4.2, 4.4

**Likely files:**
- `src/ui/action-proposal-card.js`
- `src/panels/chat.js`
- `src/phone-shell/phone-shell.js`
- `styles.css`

**Scope:** M

### Checkpoint 4

- Tool execution exactly once.
- Truthful receipt-backed responses.
- Provider fallback and approvals proven.

## Phase 5: Tavern Compatibility and Lifecycle

### Task 5.1: Publish path-level V2/V3 compatibility schema

**Description:** Define every supported path and mapping result before changing parser.

**Acceptance criteria:**
- JSON/PNG paths and character_book semantics documented.
- Unknown extension preservation and macro policy defined.
- No “full parity” claim beyond matrix.

**Verification:** Compatibility document review and schema fixtures.

**Dependencies:** Task 0.2

**Likely files:**
- `docs/formats/GENERIC_CHARACTER_CARD_COMPATIBILITY.md`
- `src/portability/character-card-schema.js`
- `tests/fixtures/character-cards/*`

**Scope:** M

### Task 5.2: Complete generic parser and safe image extraction

**Description:** Parse V2/V3 JSON and bounded PNG tEXt/iTXt/zTXt into a staged source model.

**Acceptance criteria:**
- Malformed/compressed-bomb/oversized inputs fail safely.
- PNG body can become avatar candidate.
- Unknown fields remain preserved raw but never injected directly.

**Verification:** Valid and malicious fixture suite.

**Dependencies:** Task 5.1

**Likely files:**
- `src/characters/import.js`
- `src/portability/nychar/import.js`
- `src/portability/png-metadata.js`
- `tests/integration/character-card-import.mjs`

**Scope:** M

### Task 5.3: Persist greetings, examples, scenario and prompts

**Description:** Map staged card fields into CharacterProfileV2 without silent loss.

**Acceptance criteria:**
- first/alternate greetings, examples, scenario, system/post-history survive reload.
- Imported prompts remain demoted/untrusted.
- Every source path appears in import report.

**Verification:** Import→reload→compile tests.

**Dependencies:** Tasks 1.1, 5.2

**Likely files:**
- `src/characters/import.js`
- `src/portability/nychar/import.js`
- `src/characters/store.js`
- `src/characters/import-report.js`

**Scope:** M

### Task 5.4: Map character_book to scoped worldbook

**Description:** Create/update character-linked lore entries with sourceRef and preserve unsupported semantics.

**Acceptance criteria:**
- Entries are linked only to imported character.
- Trigger/position/priority semantics map deterministically.
- Delete/overwrite/copy policies follow lifecycle contract.

**Verification:** Two-character lore isolation and round-trip tests.

**Dependencies:** Tasks 5.1–5.3

**Likely files:**
- `src/worldbook/import-character-book.js`
- `src/worldbook/repository.js`
- `src/portability/nychar/import.js`
- `src/worldbook/import-character-book.test.mjs`

**Scope:** M

### Task 5.5: Redesign import confirmation and cold-start import path

**Description:** Open the real importer, show loss report, select new/overwrite, and then collect private relationship preferences.

**Acceptance criteria:**
- Cold-start Import never skips parser.
- Default is import-as-new.
- Overwrite creates restorable revision.

**Verification:** Browser and Android import journeys.

**Dependencies:** Tasks 2.5, 3.1, 5.3–5.4

**Likely files:**
- `src/characters/import-ui.js`
- `src/first-light/ui-v2.js`
- `src/first-light/controller-v2.js`
- `styles.css`

**Scope:** M

### Task 5.6: Complete export and lifecycle semantics

**Description:** Export promised fields, exclude private data, and implement delete/overwrite/copy/tombstone rules.

**Acceptance criteria:**
- `.nychar` includes allowed identity/greetings/examples/lore/assets.
- Private preferences/history/memory/billing are absent.
- Delete/restore/copy behavior is deterministic.

**Verification:** Round trip, privacy scan, orphan reference tests.

**Dependencies:** Tasks 1.1, 5.3–5.5

**Likely files:**
- `src/portability/nychar/export.js`
- `src/characters/export-ui.js`
- `src/characters/lifecycle.js`
- `tests/integration/nychar-runtime.mjs`

**Scope:** M

### Checkpoint 5

- Compatibility matrix green.
- No silent field loss.
- Privacy and lifecycle tests green.

## Phase 6: Migration, Evaluation, and Release

### Task 6.1: Implement dry-run legacy migration

**Description:** Migrate legacy profile/First Light/character records without overwriting custom prompts or enabling permissions.

**Acceptance criteria:**
- Field-level report and migration ledger.
- Stock prompt detection uses hash/version.
- Interrupted/repeated migrations are idempotent.

**Verification:** Three real-shape fixtures and interruption tests.

**Dependencies:** Checkpoints 3 and 5

**Likely files:**
- `src/characters/migration-v2.js`
- `src/first-light/migration-v2.js`
- `src/storage/migration-ledger.js`
- `scripts/verify-companion-v2-migration.mjs`

**Scope:** M

### Task 6.2: Add internal_v2 cutover and observability

**Description:** Route official internal builds through V2 while keeping sensitive grants explicit.

**Acceptance criteria:**
- Cutover profile and permission grants are separate.
- Rollback changes read/execute path without deleting V2 data.
- Privacy-safe counters cover fallback, truncation, migration and ToolRun mismatch.

**Verification:** Profile switch/restart/rollback E2E.

**Dependencies:** Task 6.1 and Checkpoint 4

**Likely files:**
- `src/features/cutover-profile.js`
- `src/features/flags.js`
- `src/observability/companion-v2-metrics.js`
- `scripts/verify-companion-v2-cutover.mjs`

**Scope:** M

### Task 6.3: Build companion behavior evaluation suite

**Description:** Evaluate first-turn specificity, pronouns, user address, preference adherence, disagreement, anti-manipulation, prompt injection and tool truth.

**Acceptance criteria:**
- Fixed versioned corpus and rubric.
- Managed and BYOK results are reported separately.
- Failures retain redacted traces and reproducible seeds.

**Verification:** Thresholds in master plan are machine-enforced where deterministic and human-reviewed where behavioral.

**Dependencies:** Checkpoints 3–5

**Likely files:**
- `evals/companion-v2/cases.json`
- `scripts/eval-companion-v2.mjs`
- `docs/qa/companion-v2/EVAL_REPORT.md`

**Scope:** M

### Task 6.4: Browser and Android release journeys

**Description:** Run full UI journeys with no repository bypass and no SKIP.

**Acceptance criteria:**
- Both shells pass cold start, edit/save/conflict, import, chat, tool approval, restart and role switching.
- Android evidence includes target screen sizes and background/restore.
- Console errors and direct internal fallbacks are zero.

**Verification:** Browser E2E + real Android evidence.

**Dependencies:** Task 6.2

**Likely files:**
- `e2e/companion-v2-browser.spec.mjs`
- `docs/qa/companion-v2/BROWSER_REPORT.md`
- `docs/qa/companion-v2/ANDROID_REPORT.md`

**Scope:** M

### Task 6.5: production_v2 release gate

**Description:** Make every missing artifact or threshold a non-zero gate and publish rollback instructions.

**Acceptance criteria:**
- Release cannot pass with SKIP, missing real provider, missing Android, missing migration sample or failed behavior threshold.
- APK/build metadata records V2 profile and contract versions.
- Rollback procedure is rehearsed.

**Verification:**
- `npm run verify:companion-v2-release`
- Deliberately remove each evidence file and confirm failure.

**Dependencies:** Tasks 6.1–6.4

**Likely files:**
- `scripts/verify-companion-v2-release.mjs`
- `package.json`
- `docs/qa/companion-v2/RELEASE_GATE.md`
- `docs/COMPANION_V2_ROLLBACK.md`

**Scope:** M

## Final Checkpoint

- All master-plan acceptance criteria are met.
- `production_v2` is default only after real release gate passes.
- Legacy path remains emergency rollback only, with deprecation date documented.
- No Prompt source, tool executor, or character store has two authorities.

## Parallelization

Safe after contracts are frozen:

- Prompt editor UI and ToolRun repository.
- First Light UI and card parser fixtures.
- Behavior evaluation corpus and migration fixtures.

Must remain sequential:

- Contracts → repositories → compiler.
- Tool descriptors → ToolRun → loop → approval UI.
- Import schema → parser → persistence → UI.
- All features → migration/cutover → release gate.

## Risks

- Existing dirty worktree: isolate each task and never reset unrelated changes.
- Scope explosion: each task capped at ~5 files; split any larger task before implementation.
- Hidden legacy readers/writers: add static authority checks before cutover.
- Provider variance: capability negotiation, not provider-name assumptions.
- Behavioral eval false confidence: combine deterministic invariants, model corpus, and manual blind review.

## Open Product Decisions

Defaults proposed in the master plan:

- Gender/pronouns optional, never guessed.
- Flirt/jealousy/auto diary/auto moments default off.
- Import as new by default.
- Draft autosave + explicit commit.
- High custom-prompt freedom below immutable Platform Reality.
- `internal_v2 → production_v2`, not direct promotion of current `production_v1`.

