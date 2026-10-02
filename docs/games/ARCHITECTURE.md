# Nyra Games — Architecture (Launch v1)

Local-first companion games: **engine owns facts**, characters only express moves from scoped observations.

## Runtimes

| Runtime | Path | Players | Entry |
|---------|------|---------|-------|
| Duo | `src/games/duo/` | 1 human + 1 character | `DuoGameRuntime` / Pop chat |
| Group | `src/games/group/` | 2–N (user + agents) | `GroupGameRuntime` / group chat or ephemeral room |
| Native | `match-pairs`, `tap-rhythm` | Solo practice | Lobby 「其他小游戏」 |
| YEOS | `src/yeos/` | Sandboxed iframe | Lobby 「其他小游戏」 |

## Layers

```
Lobby UI / Pop / Group Chat
        │
   adapters (pop-duo, group-bridge, memory-policy, context-slot)
        │
   platform (package validate, registry, session skeleton, events, rng)
        │
   ┌────┴────┐
 DuoRuntime  GroupRuntime (+ Referee / Scheduler / Visibility / Orchestrator)
   └────┬────┘
     game packages (D1–D10 / G1–G4)
```

## Hard rules

1. **Character ≠ GM** — no inventing hidden state; act only on `observation` + `legalActions`.
2. **VisibilityEngine** — never return full `session.state` to an actor.
3. **Memory** — active game sessions use `memoryPolicy: "game_only"` (no long-term ingest of game chatter by default).
4. **Packages** — Launch v1 JSON/declarative only; no arbitrary script fields (`validateGamePackage`).
5. **Ephemeral rooms** — lobby group games do not auto-create permanent groups.

## Simulation & gate

- Harness: `src/games/simulate/*`
- Verify: `npm run verify:games-launch` → `scripts/verify-games-launch.mjs`

See also: [DUO_GAME_SPEC](./DUO_GAME_SPEC.md), [GROUP_GAME_SPEC](./GROUP_GAME_SPEC.md), [PACKAGE_FORMAT](./PACKAGE_FORMAT.md), [TEST_PLAN](./TEST_PLAN.md), [LAUNCH_GATE](./LAUNCH_GATE.md).
