# NYRA English Leakage Audit

**Date:** 2026-07-31  
**Scope:** User-visible Chinese when `appLocale=en-US` / `conversationLanguage=en-US`

## Method

Scanned `src/`, phone-shell, calendar, yeos, scenario, adventure, notifications. Classified hits; fixed high-impact UI/prompt/enum paths in this round.

## Classification legend

| Class | Meaning |
| --- | --- |
| USER_VISIBLE_UI | Buttons, titles, toasts, empty states |
| USER_VISIBLE_GENERATED | Model-facing prompts that shape user text |
| INTERNAL_ENUM | Stored business values |
| TEST_ONLY / DOC_ONLY | Allowed Chinese |
| USER_CONTENT / CHARACTER_CONTENT | Must not auto-translate |
| PROPER_NOUN | Brand / product names |
| FALSE_POSITIVE | Comments, logs |

## High-impact findings → fixed

| Location | Class | Fix |
| --- | --- | --- |
| `calendar` mode `可主动消息` etc. | INTERNAL_ENUM | Stable IDs + migration (`src/calendar/modes.js`) |
| `phone-shell/apps-catalog.js` labels | USER_VISIBLE_UI | `phone.apps.*` / `phone.jobs.*` via `t()` |
| `phone-shell` toasts | USER_VISIBLE_UI | Toast key map → `phone.toast.*` |
| `phone-shell/app-screens.js` titles | USER_VISIBLE_UI | `pt("screens.*")` for calendar/diary/memory/settings |
| `yeos/kinds.js` labels | USER_VISIBLE_UI | `yeos.perm.*` + `permissionLabel()` |
| `adventure/dm.js` system prompt | USER_VISIBLE_GENERATED | Registry `adventure.scene.advance` |
| Scenario / experience titles | USER_VISIBLE_UI | `scenario/localize.js`, `experience/localize.js` |
| Notifications | USER_VISIBLE_UI | Already locale-aware shells (prior round) |

## Allowed Chinese retained

| Item | Class | Reason |
| --- | --- | --- |
| `src/i18n/locales/zh-CN.js` | USER_VISIBLE_UI | Formal zh pack |
| First Light `locales/zh-CN.js` | USER_VISIBLE_UI | Formal zh pack |
| Scenario beat body Chinese source | CHARACTER_CONTENT | Graph content; EN overlay for titles/premise; full beat EN deferred partially |
| User chat / imported cards | USER_CONTENT | Must not rewrite |
| Docs / tests / fixtures | DOC_ONLY / TEST_ONLY | Allowed |
| Brand 月栖 in zh | PROPER_NOUN | zh brand |

## Remaining deferred (documented, not blocking English core)

- Dense phone-shell HTML still contains Chinese strings outside mapped toasts/titles (screens continue extraction)
- Full EN beat-by-beat scenario dialogue graphs
- Skill play-packs (`skill-platform/play-packs-data.js`)
- Scroll / cocreate UI long-tail
- Native iOS/Android system permission strings

## Dev guard

`src/i18n/leak-guard.js` — `[I18N_LEAK]` warnings in DEV when en-US UI renders Han characters (whitelist via `data-i18n-allow-zh`). Production never blocks.
