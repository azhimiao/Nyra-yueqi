# First Light Completion Report

## Verdict

First Light conversational onboarding is implemented as a deterministic state machine with local preview fallback, resumable draft, and transactional commit into character / relationship / autonomy / first chat message. Product gate (CP-16) remains unchanged; First Light runs after it.

## Actual UI path

`src/first-light/ui.js` overlay `[data-first-light]`:

```text
WELCOME → ENTRY_MODE → PURPOSE → RELATIONSHIP_TYPE
  → (lover|roleplay) RELATIONSHIP_START → (long) SHARED_HISTORY
  → STYLE_* → LIVE_PREVIEW (careful)
  → BOUNDARIES_CORE → (optional) BOUNDARIES_ADVANCED
  → APPEARANCE_OPTIONAL → DRAFT_REVIEW → commit → chat
```

Quick path skips most style beats and live preview (`STYLE_INTIMACY` → `BOUNDARIES_CORE`).

## Key modules

| Module | Role |
| --- | --- |
| `state.js` | `yueqi.firstLight.v1`, stages, track, pause/`resumeStage`, legacy migrate |
| `controller.js` | Choices, preview tone, commit hooks |
| `ui.js` + `first-light.css` | Overlay, track, options, review |
| `copy.js` | User-facing Chinese copy |
| `presets.js` | Structural mapping + review prose + prompt patch |
| `preview.js` | Template preview + optional model polish |
| `commit.js` | Transactional write; no OpenClaw |
| `motion-tokens.js` | Shared timings |

## Relationship branches

- **Lover now** — contract language + intimate first message  
- **Lover long** — shared history step; opening cites one fragment  
- **Lover slow** — no formal “我是你的恋人” promise  
- **Friend / family / partner / undefined / roleplay** — matching openings  

## Preview

After autonomy style (careful path): local templates; adjust softer/direct/proactive/lessComfort; model polish optional; failure shows offline notice and continues.

## Weak net

`polishPreviewLines` catches errors → templates. Commit failure → `ERROR_RECOVERABLE`, draft kept, no half jump to main.

## Data write

On「就这样开始」:

1. Upsert active character name + `promptSystem`  
2. `saveRelationshipState` with intimacy/trust/flags  
3. `saveAutonomyPrefs` (marks `onboardingComplete`)  
4. `yueqi.firstLight.companionPrefs.v1` structural map  
5. One assistant chat message (`kind: first_light_opening`)  
6. `markFirstLightDone`

## Layout notes (phone / tablet / web)

- Phone: single column overlay  
- Tablet/Web ≥900px: wider shell, centered scene  
- Night: dark gradient overrides in CSS  

**Screenshots:** not captured in this agent pass (no attached image run). Capture manually from `[data-first-light].is-open` on phone / tablet / desktop widths for store review.

## Motion

See `NYRA_FIRST_LIGHT_MOTION_SPEC.md`. Tokens applied via `applyMotionTokens`.

## E2E / verify

```bash
npm run verify:first-light
```

Covers: quick lover, careful + preview adjust, offline preview, pause/resume stage restore, slow-burn copy, long-history cite, structural hiding, autonomy defaults, legacy migration gate, stage graph, motion tokens, copy restraint.

## Performance

See `NYRA_FIRST_LIGHT_PERFORMANCE_REPORT.md`. First Light does not preload OpenClaw / Explore / YEOS.

## Accessibility

See `NYRA_FIRST_LIGHT_ACCESSIBILITY_REPORT.md`.

## Not finished on device

- True iOS Taptic / custom confirmation sounds  
- Store screenshot set  
- Full VoiceOver script on physical iPhone  
- Instrumented 60fps trace on low-end Android WebView  

## Status codes (post visual QA)

```text
PASSED_FIRST_LIGHT_FUNCTIONAL
PASSED_FIRST_LIGHT_BROWSER_VISUAL
IMPLEMENTED_PENDING_DEVICE_MOTION_VALIDATION
IMPLEMENTED_PENDING_IOS_HAPTIC_VOICEOVER
```

Not claimed: `FULLY_POLISHED` / `DEVICE_VERIFIED` / `APPLE_LEVEL_UX`.

## Suggested commits (created)

```text
a36ea4f feat(first-light): add conversational relationship onboarding
fc8c868 feat(first-light): add responsive restrained onboarding experience
edfccfa fix(first-light): harden commit idempotency and resume behavior
7d1131a test(first-light): add visual flows and relationship mode coverage
```
