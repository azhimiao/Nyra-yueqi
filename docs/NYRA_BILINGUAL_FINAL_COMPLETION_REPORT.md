# NYRA Bilingual Final Completion Report

**Date:** 2026-07-31  
**Locales:** zh-CN, en-US only  
**HEAD (docs commit):** `bb3ba43`

## Architecture (unchanged / reused)

- `language-prefs.js` / `language-context.js`
- Prompt Registry
- First Light locale packs
- Companion language routing
- Notification language routing

## This round

| Area | Result |
| --- | --- |
| Phone Shell | App labels, jobs, toasts, key screen titles localized; Qiji naming frozen |
| Calendar | Chinese mode enums → stable IDs + migration |
| YEOS | Bilingual permission / kind labels |
| Scenario / Experience | Formal zh/en display overlays; shared IDs |
| Adventure | `adventure.scene.advance` in registry |
| Errors / media / empty | Expanded `errors.*`, `media.*`, `empty.*` keys |
| Leak guard | DEV `[I18N_LEAK]` + model mismatch detector |
| Gate | `npm run verify:english-product` (33/33) |

## Commits (this round)

| SHA | Message |
| --- | --- |
| `0704227` | refactor(calendar): replace localized values with stable enums |
| `3c02e10` | feat(i18n): localize qiji phone shell surfaces |
| `4ccdb96` | feat(yeos): add formal zh-CN and en-US content packs |
| `da7a826` | feat(scenarios): add localized preset content |
| `cdf0dad` | feat(prompts): migrate adventure and long-tail prompts |
| `320b15a` | feat(i18n): localize errors notifications and media states |
| `51b0d4c` | test(i18n): add full English product experience gate |
| `ba21860` | docs(i18n): record final bilingual coverage and remaining exclusions |

## Gates

| Command | Result |
| --- | --- |
| `npm run verify:i18n` | PASS 27/27 |
| `npm run verify:first-light` | PASS |
| `npm run verify:english-product` | PASS 33/33 |
| `npm run build` | PASS |
| `npm run verify:e2e-cp21` | PASS (after toast escape fix) |
| `lint` / `typecheck` / unit `test` | Scripts not present — not claimed |

## Status codes

```text
PASSED_I18N_CORE_RUNTIME
PASSED_I18N_CORE_PROMPTS
PASSED_FIRST_LIGHT_BILINGUAL
PASSED_PHONE_SHELL_BILINGUAL
PASSED_CALENDAR_ENUM_MIGRATION
PASSED_LOCALIZED_CONTENT_PACKS
PASSED_LONG_TAIL_PROMPT_AUDIT
PASSED_ENGLISH_PRODUCT_EXPERIENCE
IMPLEMENTED_PENDING_ANDROID_NATIVE_I18N_QA
IMPLEMENTED_PENDING_IOS_NATIVE_I18N_QA
IMPLEMENTED_PENDING_NATIVE_NOTIFICATION_QA
```

## Allowed Chinese

User input, imported character cards, zh locale packs, docs/tests, proper nouns, quoted content.

## Remaining exclusions

- Dense phone-shell HTML beyond mapped titles/toasts (continued extraction)
- Full EN beat dialogue graphs for offline scenario trees
- Skill play-pack bulk copy
- Native OS permission / notification chrome

## Forbidden claims

Not claimed: FULLY_GLOBALIZED / ALL_LANGUAGES_SUPPORTED / NATIVE_DEVICE_VERIFIED
