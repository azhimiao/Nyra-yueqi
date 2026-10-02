# First Light — Source Integrity Report

Generated: 2026-07-31

## Duplicate declaration hunt

Searched:

```text
const sessionId = dmSessionId(characterId)
const firstText = lines.join
fl-first-
```

| Location | Result |
| --- | --- |
| `src/first-light/commit.js` | **Single** `firstText` / `sessionId` / `messageId = fl-first-${characterId}` |
| Docs / other modules | No duplicate declarations in same scope |
| Report hallucination risk | Earlier completion notes mentioned a double `sessionId` line; **source is clean** |

## Hardening applied this round

| Issue | Fix |
| --- | --- |
| Double commit / rapid click | Module `commitInflight` mutex; UI `flCommitLock`; `confirmAndCommit` rejects while `COMMITTING` |
| Duplicate first message | Idempotent id `fl-first-${characterId}`; skip write if message exists; early exit if `done` |
| Double First Light mount | `mountFirstLight` singleton + shared `onComplete` in `app.js` |
| Double `markFirstLightDone` | Only inside `commit.js` |
| Pause loses stage | `resumeStage` persisted |
| Reduced motion | Fade replaces translate; blur disabled |
| Review copy person mismatch | Third-person mapping in `buildReviewSections` |
| CP-10/12 suite vs autonomy defaults | Integration tests opt into companion/immersive + non-colliding quiet hours |
| CP-8 theme candidate flake | Fallback to `targetThemeId` when workspace JSON incomplete |

## Scripts present vs requested

| Requested | Repo reality |
| --- | --- |
| `npm run lint` | **Missing** — recorded, not invented |
| `npm run typecheck` | **Missing** |
| `npm test` | **Missing** |
| `npm run build` | **PASS** |
| `npm run verify:e2e-cp21` | **PASS** (after CP-8/10/12 harness fixes) |
| `npm run verify:first-light` | **PASS** (incl. idempotency early-exit) |

## Bundle / First Light load surface

Production build (`www/assets/`):

- First Light CSS folded into `main-*.css` (~572 kB total CSS chunk)
- First Light JS in `main-*.js` entry (not OpenClaw chunk)
- Separate lazy chunks remain: `openclaw-mobile-*.js`, `agent-runtime-*.js`, `world-*.js`, `pixi-*.js`

Browser capture evidence: `__NYRA_OPENCLAW_SLICE_LOADED__ === false` through First Light completion.

Vite reporter notes dynamic+static import of `first-light/state.js` / `session-context.js` — non-blocking; First Light still does not import OpenClaw / Explore / YEOS / Skill market.

## Status codes

```text
PASSED_FIRST_LIGHT_FUNCTIONAL
IMPLEMENTED_PENDING_DEVICE_MOTION_VALIDATION
IMPLEMENTED_PENDING_IOS_HAPTIC_VOICEOVER
```

Not claimed: `FULLY_POLISHED` / `DEVICE_VERIFIED` / `APPLE_LEVEL_UX`.
