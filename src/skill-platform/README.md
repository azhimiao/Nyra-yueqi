# Skill×Agent User Platform — Immutable Constraints

> Plan: `docs/SKILL_AGENT_EXPLORATION_PLATFORM_PLAN.md` v1.2  
> Phase: P0–P3 baseline · Runtime/router implemented (P3)

---

## Layering decision

| Path | Purpose |
|------|---------|
| **`src/skills/`** | PAIOS P5 **Developer Skill SDK** — `skill.json`, JS entry, sandbox, conformance (`docs/sdk/SKILL_SDK.md`). **Do not add user-facing explore/import code here.** |
| **`src/skill-platform/`** | User-facing **SKILL.md** registry, importer, host runtime, router, runs, scopes, explore UI |
| **`src/agents/`** | **Agent Profile** store, selection, composer (user picks "关系探索", not raw Skill IDs) |
| **`src/agent/`** | Existing **Task Runtime** — reuse `createTaskDraft` / `proposeTask` / approvals / audit |

This split avoids colliding with `npm run verify:core-p5` and keeps developer packages separate from end-user Agent experiences.

---

## Product invariants (must not violate)

1. **Users choose Agents, not Skill files.** `SKILL.md`, manifests, hashes, and tool IDs are internal. No user-facing JSON/Manifest editors in explore flows.

2. **No fake Skill UI.** Pages, buttons, or strings that imply working Skill import/router/runtime without passing plan verify gates are forbidden.

3. **Host-only model invocation.** Imported skills cannot recurse-call models or tools. `disable-model-invocation` → host envelope only.

4. **No arbitrary code execution (L1–L3 launch).** Reject or quarantine `.js`, `.py`, `.exe`, shell, HTML injection, unknown binaries, zip-slip, oversize bundles.

5. **Context Broker is mandatory.** Every skill model call goes through `buildContextEnvelope` with an authorized `ContextRequest` — never direct localStorage/IDB reads from imported content.

6. **Four independent authorizations per run** (defaults conservative):
   - `conversationRead`: `none` | `snapshot` | `shared_live`
   - `memoryRead`: `none` | `global_personal` | `selected_character` | `relationship`
   - `characterVisibility`: `private` | `selected_character`
   - `memoryWrite`: `off` | `propose_personal` | `propose_character` | `propose_both`  
   Never infer one from another. `memoryWrite` always produces **candidates** — never auto-commit.

7. **Three conversation modes** (user picks at run start):
   - `isolated_new` — new skill session, no lover chat bleed
   - `snapshot_copy` — frozen copy at start; no live sync afterward
   - `shared_live` — same Conversation V2 session; messages tagged `meta.origin=skill`, `meta.skillId`, `meta.skillRunId`

8. **Atomic SkillTurn commit.** Invalid JSON, illegal state patch, over-privileged capability, or failed validation → zero writes to conversation, state, memory, or tasks.

9. **Task path uses Agent Runtime.** `taskProposals` → grant check → `createTaskDraft` → `proposeTask` → R2/R3 approval in task center. Skills must not claim completion before task outcome.

10. **Deskpet exclusion.** Deskpet assets/actions are not explore App, skill detail, or skill session primary visuals.

11. **Relationship exploration defaults:** `isolated_new` + `memoryRead:none` + `characterVisibility:private` + `memoryWrite:off`.

12. **Versioning.** Same skill `id` + new version → upgrade candidate; running SkillRuns pin start version until user migrates.

13. **Backup integrity.** Skill catalog/files/grants/runs must round-trip via `src/memory/backup.js`; hash mismatch after restore → disable skill and prompt user.

14. **Audit linkage.** Skill audit events associate `skillRunId` and `taskId` where applicable (P6).

---

## Reuse PAIOS SDK selectively

From `src/skills/` import only integrity/security helpers (e.g. `signature.js`, `memory-gate.js`, `risk.js`) — **not** `lifecycle.js` / `runtime.js` production JS-invoke paths for user SKILL.md bundles.

Developer `skill.json` packages remain a parallel track for third-party JS capabilities; user platform compiles `SKILL.md` → internal `yueqi-skill-manifest.v1`.

---

## Verify gates (plan §10 — to be added)

| Command | Minimum bar |
|---------|-------------|
| `verify:skills:import` | Manifest, zip safety, hash, version, delete, restore |
| `verify:skills:scopes` | 3 session modes, 4 authorizations, isolation |
| `verify:skills:runtime` | Router, prompt resources, SkillTurn atomic validation |
| `verify:skills:agent` | Capability grant, approval, audit, cancel/resume |
| `verify:skills:relationship` | Relationship state machine, safety, memory candidates |
| `e2e:skills` | Playwright golden paths with trace/video |

Until these exist and pass, do **not** claim "探索 App 已完成" or "Skill Agent 已上线".

---

## Related docs

- `docs/qa/skill-platform/P0/AUDIT.md` — evidence-backed baseline inventory
- `docs/qa/skill-platform/P0/LAYERING.md` — directory layout
- `docs/sdk/SKILL_SDK.md` — PAIOS developer SDK (sibling under `src/skills/`)
