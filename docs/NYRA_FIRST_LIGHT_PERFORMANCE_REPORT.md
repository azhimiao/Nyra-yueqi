# First Light Performance Report

## Budgets (target)

| Metric | Target |
| --- | --- |
| Click feedback | &lt; 100ms (CSS instant 120ms cap) |
| Scene change feel | &lt; 300ms (`--fl-normal` 280ms) |
| Boot visual wait | Prefer skip; hint after ~1.5s (product gate handles boot) |
| FPS | Avoid continuous particles; static aura only |

## What First Light does **not** load

- OpenClaw runtime / mobile slice
- Explore / YEOS / Skill market
- Full companion history
- Large 3D avatar assets
- Extra font families beyond existing app fonts

## Load surface

| Asset | Notes |
| --- | --- |
| `first-light.css` | Linked from `index.html` |
| `src/first-light/*` | ESM; mounted after CP-16 via `startFirstLightIfNeeded` |
| Preview model | Optional; template fallback if fail |

## Persistence cost

- Draft: `localStorage` key `yueqi.firstLight.v1` (small JSON)
- Commit: character upsert + relationship row + autonomy prefs + one chat message

## Measurement

Automated: `npm run verify:first-light` (logic / offline / resume).  
Frame timing and low-end Android traces: **not** captured in this CI pass — recommend Chrome Performance on mid-tier WebView when packaging.

## Recommendations

1. Keep First Light CSS out of critical OpenClaw chunks (already separate).  
2. Do not prefetch companion life-tick during overlay.  
3. Appearance “generate” stays deferred — no heavy asset pipeline in-flow.
