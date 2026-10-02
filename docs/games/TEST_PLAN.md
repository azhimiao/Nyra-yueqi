# Games Launch — Test Plan

## Automated (`npm run verify:games-launch`)

| Check | Target |
|-------|--------|
| Package schemas | All duo + group definitions via `validateGamePackage` |
| Catalog sizes | 10 duo, 4 group |
| Group smoke | `src/games/group/smoke.mjs` if present |
| Duo sims | ≥20 finished sims per duo game (≥200 total) |
| Group sims | ≥100 finished sims per group game (≥400 total) |
| Visibility | Undercover words, one-night seer view, Just One parallel clues |
| Memory isolation | `game_only` policy helper + observation privateState scoping |

Env knobs (optional): `GAMES_DUO_SIMS`, `GAMES_GROUP_SIMS`, `GAMES_DUO_MAX_STEPS`, `GAMES_GROUP_MAX_STEPS`.

## Manual / product

1. Lobby shows 「和 TA 一起玩」 / 「群聊游戏」 / 「其他小游戏」.
2. Pop start binds duo session + `memoryPolicy: game_only`.
3. Group / ephemeral room start does not create a permanent group without explicit promote.
4. Character replies never invent hidden roles/words not in observation.

## Out of scope this gate

Android device BYOK, billing, YEOS rewrite, full multiplayer networking.
