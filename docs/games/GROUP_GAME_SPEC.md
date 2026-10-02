# Group Game Spec (G1–G4)

Kind: `nyra.group-game.v1` · Runtime: `group`

| ID | Package id | Title | Players | Features |
|----|------------|-------|---------|----------|
| G1 | `nyra.just-one` | Just One 风格 | 3–7 | Parallel private clues → guess |
| G2 | `nyra.same-thought` | 同一想法 | 3–8 | Shared prompt / sync answers |
| G3 | `nyra.undercover` | 谁是卧底 | 4–10 | Private words, discuss, vote |
| G4 | `nyra.one-night` | 一夜身份局 | 4–8 | Night roles, day vote |

## Runtime pieces

| Module | Role |
|--------|------|
| `GroupGameRuntime` | Session create/start/advance/finish |
| `orchestrator` | Bounded `advance()` directives |
| `scheduler` | Ordered / parallel / discussion / vote |
| `referee` | Apply legal actions, tallies |
| `VisibilityEngine` | Actor-scoped observation only |
| `GroupGameBridge` | Group chat / ephemeral room adapter |

## Engine contract

`definition`, `createInitialState`, `observation`, `legalActions`, `applyAction`, `isFinished`, `result`, `fallbackAction`, plus optional `nextPolicy` / `pendingActorIds` / `applyRule`.

## Integration

- Catalog: `listGames()` in `src/games/group/games/index.js`
- Adapter: `src/games/adapters/group-bridge.js` → `startEphemeralGroupGame`
- Smoke: `src/games/group/smoke.mjs`
- Sims: `simulateGroupGame` in `src/games/simulate/group-sim.js`
