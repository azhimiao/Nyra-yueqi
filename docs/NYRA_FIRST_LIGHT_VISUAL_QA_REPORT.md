# First Light — Visual QA Report

Generated: 2026-07-31  
Artifacts: `artifacts/first-light/screenshots/` (47 PNGs)  
Capture: `node scripts/capture-first-light.mjs` against `http://127.0.0.1:5173/`  
Manifest: `artifacts/first-light/screenshots/capture-manifest.json`

## Status

```text
PASSED_FIRST_LIGHT_BROWSER_VISUAL
PASSED_FIRST_LIGHT_FUNCTIONAL
IMPLEMENTED_PENDING_DEVICE_MOTION_VALIDATION
IMPLEMENTED_PENDING_IOS_HAPTIC_VOICEOVER
```

## Viewports captured

| Viewport | Steps 01–09 | Notes |
| --- | --- | --- |
| 390×844 | Yes | Phone reference |
| 360×800 | Yes | Compact phone |
| 768×1024 | Yes | Tablet portrait |
| 1024×1366 | Yes | Large tablet |
| 1440×900 | Yes | Desktop web |
| 390×844 reduced-motion | Welcome sample | `prefers-reduced-motion: reduce` |
| 390×844 dark | Welcome sample | `data-theme=night` |

## Per-screen visual checklist

Checked against real screenshots (not state-machine only).

| Check | Result |
| --- | --- |
| One visual focus per screen | **Pass** — question + options; track is micro |
| Reasonable Chinese line width | **Pass** — scene max ~34em / centered column on wide |
| Excess cards / borders | **Pass** — options are light surfaces; preview uses single accent bar |
| Primary vs secondary actions | **Pass** — primary filled lightly; 返回 / 稍后再说 muted |
| Layout jump on select | **Pass** — fixed min-height options; selection is fill/border only |
| Long Chinese overflow | **Pass** on captured paths |
| Tablet not phone-stretched | **Partial pass** — centered narrow column (intentional); not a full two-pane appearance editor (appearance deferred) |
| Dark contrast | **Pass** on dark welcome sample |
| Back keeps answers | **Pass** (unit + flow; draft persisted) |
| Offline preview continues | **Pass** (`verify:first-light` + templates) |

### Findings fixed during QA

- Review prose used first-person option labels (“主动来找我”) inside third-person summary → remapped to “主动来找你 / 先抱抱你”.

### Residual (non-blocking)

- Wide desktop still single-column (by design for First Light); not a magazine multi-column.
- System font zoom / keyboard occlusion: not instrumented in Playwright pass.
- CLS / long-task traces: not captured with Performance panel recording.

## Motion checklist

| Check | Result |
| --- | --- |
| Transitions use opacity (+ limited translate) | **Pass** — `fl-enter` / CSS vars |
| Continuous blur GPU stress | **Mitigated** — static aura; blur off under reduced motion |
| Click feedback &lt; 100ms target | **Design** — `--fl-instant: 120ms` (slightly over 100ms budget; acceptable) |
| Scene change 180–420ms | **Pass** — `--fl-normal: 280ms`, `--fl-slow: 420ms` |
| Reduced motion → fade | **Pass** — `fl-fade`; no translate dependency for meaning |
| Commit once | **Pass** — lock + idempotent message id; capture shows single opening |

## Relationship mode evidence

| Mode | Evidence |
| --- | --- |
| Immediate lover | Capture first chat: “过来一点…”; manifest `chatSnippets`; not cold / not re-asking |
| Long history | Unit: opening cites one shared fragment; metadata `notLivedExperience` |
| Slow-burn | Unit: no “我就是你的恋人” promise |
| Roleplay / scenario | Copy + flags `fl:lover_scenario`; scenario facts tagged init |

## Interrupt / double-submit

| Scenario | Result |
| --- | --- |
| Pause mid-style → resume | Unit: `resumeStage` restored |
| Double「就这样开始」 | Mutex + lock + same `fl-first-*` id |
| Re-open after done | `hasFirstLightDone` → overlay does not restart |

## Performance notes (browser session)

- OpenClaw flag false at completion
- First Light does not preload Explore / YEOS / Skill market chunks during overlay
- Exact TTI / commit ms not profiled with DevTools Performance export this pass

## Screenshot index (phone 390)

```text
artifacts/first-light/screenshots/390x844/01-welcome.png
…/02-purpose.png
…/03-relationship.png
…/04-lover-start.png
…/05-style.png
…/06-preview.png
…/07-boundaries.png
…/08-review.png
…/09-first-chat.png
```
