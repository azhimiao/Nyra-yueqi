# NYRA Bilingual Completion Report

**Date:** 2026-07-31  
**Locales:** `zh-CN`, `en-US` (pack `en`)  
**Scope:** App vs conversation language split + prompt-aware localization. No new languages. No second Companion / Memory / Relationship runtime.

## Delivered

| Area | Result |
| --- | --- |
| Audit | `docs/NYRA_I18N_PROMPT_AUDIT.md` |
| Architecture | `docs/NYRA_BILINGUAL_ARCHITECTURE.md` |
| Prompt spec | `docs/NYRA_PROMPT_LOCALIZATION_SPEC.md` |
| EN / ZH copy guides | `docs/NYRA_ENGLISH_COPY_GUIDE.md`, `docs/NYRA_CHINESE_COPY_GUIDE.md` |
| Language prefs | `src/i18n/language-prefs.js` — appLocale, conversationLanguageMode, follow-user heuristics |
| LanguageContext | `src/i18n/language-context.js` — directives on model paths |
| Prompt registry | `src/prompts/registry.js` — companion, proactive, diary, moments, scenario, memory.extract, agent.user_facing |
| First Light | Formal packs `src/first-light/locales/zh-CN.js` + `en.js`, in-flow language switch |
| Companion assemble | Language-aware defaults, contracts, character block, history token facts |
| Proactive | Registry + LanguageContext; notification shell uses app locale |
| Diary / Moments / Scenario | Conversation language on generation prompts |
| 栖机助手 | Assist prompt + `agent.user_facing` directive |
| Settings | App Language vs Conversation Language controls in Me → Language |
| Errors / notifications | Expanded `errors.*` keys; notification titles locale-aware |
| Verify | Extended `scripts/verify-i18n.mjs` |

## Coverage notes

| Surface | Coverage |
| --- | --- |
| UI i18n | Existing `t()` packs + new language settings keys; phone-shell strings still partial (documented gap) |
| Prompt i18n | Core companion + background generators wired; adventure/cocreate/story long-tail deferred |
| First Light | Full zh/en formal copy for stages |
| Memory | Extract template language-neutral + summary language; no duplicate zh/en memory rows |
| Relationship | Enum IDs unchanged; First Light labels localized |
| Active Event | Proactive pipeline language-aware |
| Agent | User-facing directive; tool IDs stay English |
| Migration | `ensureLanguagePrefsMigrated()` on boot |

## Gaps / deferred

- Full phone-shell string extraction
- Calendar proactive mode values still Chinese enums (`可主动消息`) — display-only migration later
- Every YEOS / preset scenario script pair not bulk-translated this round
- Multilingual vector recall hardening beyond structured tags + original text
- Native OS permission strings outside app control

## Suggested commits

```text
feat(i18n): add zh-CN and en-US application localization
feat(prompts): add language-aware prompt registry
feat(companion): separate app locale from conversation language
feat(memory): support multilingual evidence and localized summaries
feat(agent): localize user-facing agent output
test(i18n): cover bilingual onboarding companion and background flows
docs(i18n): add Chinese and English copy standards
```

## Acceptance

English users can complete First Light → chat → proactive → assist without Chinese system leakage on wired paths. Chinese experience remains default-compatible; language switch does not duplicate memories or reset relationships.
