# First Light Design Spec

Internal name: **First Light**. Not shown to users.

## Intent

Users decide *what kind of person arrives, and in what relationship* — not fill a character card.

## Placement

Runs **after** CP-16 product gate (`yueqi.onboarding.v1`) and **before** formal chat seed / autonomy preset picker.

Legacy users with prior companion use are migrated once (`migratedFromLegacy`) and skip First Light.

## Visual language

| Token | Direction |
| --- | --- |
| Atmosphere | Moonlight, breath, quiet layers |
| Background | Soft wash from product `--bg` / `--accent`; slight warm/cool by intimacy tone |
| Emphasis | Single accent from theme |
| Type | Outfit + Noto Sans SC; short titles; body ≤ 3 lines |
| Density | One question, short hint, 2–5 choices, one secondary path |
| Forbidden | Cyberpunk, dating-game pink, glass stacks, dashboards, step `4/18` |

## Layout

- **Phone:** single column, safe-area padding, 44px targets
- **Tablet / wide (≥900px):** wider shell, scene max ~34rem centered — not a stretched phone clone
- **Web:** same overlay; `first-light-active` locks page scroll

## Stage track

Top micro-track (not a percentage):

`相遇 · 关系 · 性格 · 边界 · 开始`

## UI path (actual)

| Stage | Focus |
| --- | --- |
| WELCOME | Opening lines |
| ENTRY_MODE | 认真认识 / 快速开始 / 导入 / 跳过 |
| PURPOSE | Multi-select ≤3 |
| RELATIONSHIP_TYPE | 恋人 / 朋友 / … |
| RELATIONSHIP_START | Lover narrative start (now / long / slow / scenario) |
| SHARED_HISTORY | Optional past beat when `long` |
| STYLE_* | One life-scene question each |
| LIVE_PREVIEW | Sample lines + soft adjust |
| BOUNDARIES_* | Core three + advanced expand |
| APPEARANCE_OPTIONAL | Name now / later / generate |
| DRAFT_REVIEW | Natural-language four blocks |
| COMMITTING → FIRST_REAL_MESSAGE → COMPLETED | Transactional write + chat open |

## Files

- `src/first-light/*` — state, controller, UI, copy, presets, preview, commit, motion
- `src/first-light/first-light.css`
- Mount: `startFirstLightIfNeeded` from `src/app.js` after onboarding

## Out of scope this round

No second Companion runtime, no OpenClaw in First Light, no free-form agent loop driving the flow.
