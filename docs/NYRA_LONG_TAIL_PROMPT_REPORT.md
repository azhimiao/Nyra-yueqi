# NYRA Long-Tail Prompt Report

## Registered this round

| ID | Purpose |
| --- | --- |
| `adventure.scene.advance` | Adventure DM system; NL follows conversation language |
| `errors.recovery` | User-facing recovery for timeout / network / credits |

## Already in registry (prior)

companion.*, proactive.heartbeat, moments.auto_post, diary.system, scenario.director, first_light.preview_polish, memory.extract, agent.user_facing

## Adventure

`src/adventure/dm.js` builds system via `renderPrompt("adventure.scene.advance")` + LanguageContext. Tool/schema fields stay English.

## Deferred long-tail

| Area | Notes |
| --- | --- |
| Skill play-packs | Large CN copy in `skill-platform/play-packs-data.js` |
| Scroll / cocreate player UI prompts | Partial |
| Director offline fixed beats | Content pack, not prompt registry |

## Rules unchanged

No “please reply in English” tacked onto Chinese blobs; registry + LanguageContext remain authoritative.
