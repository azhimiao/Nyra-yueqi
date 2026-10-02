# NYRA Localized Content Pack Report

## YEOS

- Permission **IDs** remain English (`calendar.read`, …)
- Labels via `yeos.perm.*` + `permissionLabel()`
- Sideloaded package content keeps `contentLanguage`; host does not machine-translate user packages

## Scenario presets

- Shared IDs (`script-rain-station`, `script-rooftop`, …)
- Formal overlays: `src/scenario/localize.js` (zh-CN + en-US titles/premise/opening/memorySummary)
- Library list uses localized titles
- Structured completion event: `{ eventType: "scenario_completed", scenarioId }` — no duplicate memories by language

## Experience packages

- `src/experience/localize.js` for `exp-night-rain-station`, `exp-mist-harbor-lighthouse`
- Same package ID; localized title/subtitle/synopsis

## Gaps

- Full EN dialogue graphs for every beat (offline director beats still Chinese source)
- User-authored YEOS: no silent MT publish
