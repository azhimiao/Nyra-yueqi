# NYRA I18N + Prompt Language Audit

**Date:** 2026-07-31 (updated after bilingual implementation)  
**Repo:** 月栖 / Nyra (`f:\beautiful`)

## Current scheme

| Item | Finding |
| --- | --- |
| API | `src/i18n/index.js` — `t()`, `getLocale()`, `setLocale()`, `applyI18n()`, `wireLanguageUi()` |
| Prefs | `src/i18n/language-prefs.js` — `appLocale` vs `conversationLanguage` / mode |
| Context | `src/i18n/language-context.js` — directives on model calls |
| Packs | `src/i18n/locales/zh-CN.js`, `en.js` |
| Locale ids | `zh-CN`, `en` (product `en-US` aliases to `en`) |
| Persistence | Settings `locale` + `yueqi.language.prefs.v1` |
| Brand | zh → 月栖; en → Nyra |
| Prompts | `src/prompts/registry.js` |

**UI coverage:** App shell + onboarding + Me/settings (including App vs Conversation language). Phone shell still partial.

**First Light:** Formal packs under `src/first-light/locales/` with in-flow language switch.

## Remaining gaps

- Phone-shell / YEOS preset bulk copy
- Calendar mode Chinese enum values (`可主动消息`) — IDs deferred
- Adventure / cocreate / story long-tail prompts
- Native OS permission strings outside app

See `docs/NYRA_BILINGUAL_COMPLETION_REPORT.md` for delivery status.
