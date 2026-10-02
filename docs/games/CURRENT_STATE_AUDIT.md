# Nyra Games — Current State Audit (Launch v1)

Audit date: 2026-08-16  
Scope: Games Vertical Slice only. No Companion OS rewrite.

## Taxonomy legend

| Tag | Meaning |
|-----|---------|
| EXISTING_REUSABLE | Keep and call as-is |
| NEEDS_ADAPTER | Thin bridge / metadata / extension slot |
| NEEDS_MIGRATION | Replace placeholder with real runtime (in-scope) |
| CONFLICTING | Semantics clash — resolve by adapter, not rewrite |
| MISSING | Must build for Launch v1 |
| OUT_OF_SCOPE | Do not touch this round |

---

## Inventory

### EXISTING_REUSABLE

| Asset | Path | Notes |
|-------|------|-------|
| Pop invite placeholders | `src/games/pop-games.js` | 4 prompt-only games; catalog UI entry point |
| Chat game run bag | `src/games/chat-game-session.js` (`yueqi.chat.games.v1`) | Active run per conversation sessionId |
| Game message cards | `src/chat/game-message.js` | `game_event` metadata → UI cards |
| Desktop Pop start | `src/panels/chat.js` `startDesktopPopGame` | Starts run + injects invite text |
| Phone Pop picker | `src/phone-shell/pop-chat-plugins.js` | Sheet UI for 「一起玩」 |
| Lobby (native + YEOS) | `src/games/lobby-ui.js` | Aggregates Pop + match-pairs + tap-rhythm + YEOS |
| Native mini scores | `src/games/store.js` (`yueqi.games.v1`) | match-pairs / tap-rhythm |
| Native engines | `match-pairs.js`, `tap-rhythm.js` | Solo practice |
| YEOS game registry | `src/yeos/registry-games.js` | Installed iframe games |
| YEOS game bridge/shell | `bridge-game.js`, `game-shell-ui.js` | Keep unchanged |
| Group conversation CRUD | `src/characters/group-chat.js` | create/list members; rotate speaker |
| Conversation V2 writes | `src/conversation/*` | Authoritative chat persistence |
| Memory write policy helpers | turn-understanding / web-retrieval | Pattern for `memoryPolicy` field |
| Prompt assemble | `src/prompt/assemble.js` | Can take a tiny game observation slot |

### NEEDS_ADAPTER

| Concern | Approach |
|---------|----------|
| Pop active game → DuoRuntime | Extend `chat-game-session` / start path with `platformSessionId` + `DuoGameBridge` |
| Message metadata | Extend `game` / `memoryPolicy: "game_only"` on game messages |
| Context Builder game slot | `extensions.game` via `src/games/adapters/context-slot.js` + minimal assemble read |
| Skip long-term memory ingest during games | Gate `extractAndApplyMemoryOperations` when active duo/group session |
| Lobby taxonomy | Split UI sections: 「和 TA 玩」/「群聊游戏」/「其他小游戏」 without exposing RuntimeKind |
| Legacy Pop IDs | Map old invite IDs → new duo ids or retire from picker |
| Group Chat → GroupRuntime | `GroupGameBridge` + ephemeral room; reuse `appendMessage` / speaker pick thinly |
| Safe facts for D10 | Read-only adapter; curated fallback if Memory lacks safe summary API |

### NEEDS_MIGRATION

| Item | From | To |
|------|------|----|
| Pop 「一起玩」 catalog | Prompt-only invitations | 10 Duo packages + DuoRuntime |
| 「办公室狼人杀」 LLM host | Invite text asking character to GM | Out of duo catalog; Group games replace social deduction |
| Round/result cards | Cosmetic round counters | Engine-authored GameEvent cards |

### CONFLICTING

| Conflict | Resolution |
|----------|------------|
| Current games treat Character as host/rule engine | Engine owns facts; Character only expresses |
| `office-werewolf` in duo Pop list | Remove from Duo catalog; Group G3/G4 cover deduction |
| Group chat = one speaker per turn | GroupRuntime multi-agent scheduler is separate; Group Chat is presentation |
| YEOS sandbox scripts vs `.nygame` no-JS rule | Keep YEOS path; new duo/group packages are declarative/JSON only |

### MISSING (built this launch)

| Capability | Location |
|------------|----------|
| Common registry / session / events / persistence | `src/games/platform/*` |
| Package kinds `nyra.duo-game.v1` / `nyra.group-game.v1` | platform + definitions |
| DuoRuntime + 10 games | `src/games/duo/**` |
| GroupRuntime + Referee/Scheduler/Visibility/Orchestrator | `src/games/group/**` |
| 4 Group games | `src/games/group/games/**` |
| Headless simulation harness | `src/games/simulate/**` |
| Launch docs + verify gate | `docs/games/*`, `scripts/verify-games-launch.mjs` |

### OUT_OF_SCOPE

Character store, memory engine rewrite, relationship engine, AgentLoop core, Model Adapter, Tool architecture, Billing/Usage rewrite, Economy, Timeline architecture rewrite, YEOS rewrite, Backup/portability, ordinary Pop/Group chat rewrite, long-form werewolf, TRPG GM, multiplayer marketplace.

---

## Ten audit questions

1. **Pop user message send** — `src/panels/chat.js` captures turn scope, writes Conversation V2 user message, then routes to model / Agent path. Phone shell mirrors via pop plugins + same conversation bridge.

2. **Character reply path** — Pop companion replies are **`compilePrompt` → `assemblePrompt` → `callModel`**, not OpenClaw `runAgentLoop`. (OpenClaw AgentLoop is tool/mobile only — OUT_OF_SCOPE for companion Duo/Group games.) YEOS sandbox games use `createNyraGameBridge` → host `callModel`.

3. **Group multi-character** — `pickGroupSpeaker` + `buildGroupRosterBlock`; one speaker per turn, not parallel game agents.

4. **Active game session** — Yes: `getActiveChatGameSession(sessionId)` in `yueqi.chat.games.v1` (runId, gameId, round, status). No platform session / phase / RNG / events.

5. **Game state persistence** — Chat run bag in localStorage; native scores in `yueqi.games.v1`; YEOS saves via `yeos/saves.js`. No authoritative GameEvent log for Pop invites.

6. **YEOS lobby registration** — `listInstalledGames()` merged in `lobby-ui.js` with Pop + native. Unchanged for Launch v1.

7. **Message metadata** — Yes (`metadata.kind`, `gameEvent`, mediaType). Extend with `memoryPolicy` / richer `game` payload; do not replace message model.

8. **Context Builder extension** — Broker had no game purpose; Launch v1 added `src/games/adapters/context-slot.js` + `gameContextBlock` in `assemble.js` (minimal slot, no broker rewrite).

9. **Game vs long-term memory** — Launch v1 gates `extractAndApplyMemoryOperations` / relationship emit when an active chat game exists (`memoryPolicy: game_only`).

10. **Lobby aggregation** — `lobby-ui.js` sections: 「和 TA 一起玩」/「群聊游戏」/「其他小游戏」(YEOS + native).

---

## Follow-up notes (post Phase A deep audit)

Late audit ([Audit games and chat bridges](0f531921-9f17-4764-9cf1-6d401af9164b)) confirmed the same boundaries and added:

| Finding | Disposition |
|---------|-------------|
| `yueqi.gamess.v1` does not exist | Typo; real keys are `yueqi.chat.games.v1` + `yueqi.games.v1` + `yueqi.yeos.games.v1` |
| Companion ≠ OpenClaw AgentLoop | Documented above; Duo/Group reuse `callModel` / character observation slot |
| `yueqi.chat.games.v1` not in `data-modules` backup | **Deferred** — optional portability add; not required for Launch engine gate |
| `verify:pop-games` missing from package.json | Superseded by `npm run verify:games-launch` |
| No Duo/Group bridges at audit time | Implemented under `src/games/duo/**`, `src/games/group/**`, `src/games/adapters/**` |

## Gate A — PASS

Boundaries confirmed. Proceed Phase B→J within Games scope + thin adapters only.
