# Duo Game Spec (D1–D10)

Kind: `nyra.duo-game.v1` · Runtime: `duo` · Players: `{ human: 1, character: 1 }`

| ID | Package id | Title | Idea |
|----|------------|-------|------|
| D1 | `nyra.resonance` | 同频 | Spectrum clue → guess position |
| D2 | `nyra.rating-guess` | 默契评分 | Rate self + predict partner |
| D3 | `nyra.cipher` | 暗语格子 | Clue + count; claim grid cells |
| D4 | `nyra.heartbeat` | 心跳同步 | The Mind–like ascending plays |
| D5 | `nyra.twenty-questions` | 猜我所想 | Yes/no toward a hidden word |
| D6 | `nyra.taboo` | 禁忌提示 | Clue without banned terms |
| D7 | `nyra.secret-sequence` | 秘密序列 | Mastermind-style color sequence |
| D8 | `nyra.if-we` | 如果我们 | Scenario option sync |
| D9 | `nyra.leave-three` | 留下三个 | Rank/leave items from a pool |
| D10 | `nyra.we-remember` | 我们记得 | Quiz from safe shared facts |

## Engine contract

Each package exports: `definition`, `createInitialState`, `observation`, `applyUserAction`, `applyCharacterAction`, `legalActions`, `isFinished`, `result`, `fallbackCharacterAction`.

`DuoGameRuntime` owns session lifecycle (`create` → `start` → actions → `finished`/`aborted`).

## Integration

- Catalog: `listPopGames()` / `src/games/duo/games/index.js`
- Chat adapter: `src/games/adapters/pop-duo.js`
- Sims: `simulateDuoGame` in `src/games/simulate/duo-sim.js`
