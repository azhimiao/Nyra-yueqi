# Games Launch Gate

## Command

```bash
npm run verify:games-launch
# → node scripts/verify-games-launch.mjs
```

Exit **0** only if every printed line is `PASS …` and summary is `GAMES LAUNCH VERIFY PASS`.

## Must pass

1. Schemas valid for D1–D10 and G1–G4  
2. Catalog counts 10 + 4  
3. Group smoke green (when file present)  
4. Duo sims ≥200 finished; group sims ≥400 finished  
5. Visibility + memory isolation suites green  

## Product claims allowed after green

- Duo/Group engines are headless-simulatable without LLM  
- Private info isolation holds for undercover / one-night / Just One clue phase  
- Game turns default to `game_only` memory policy helper  

## Claims **not** authorized by this gate alone

- Store release / Android certification  
- Live multiplayer rooms  
- Full character personality quality during play  
- YEOS or billing readiness  

See [TEST_PLAN](./TEST_PLAN.md) and [ARCHITECTURE](./ARCHITECTURE.md).
