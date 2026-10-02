# NYRA Bilingual Architecture

**Product locales:** `zh-CN` | `en-US` (UI pack id `en` aliases `en-US`)

## Three language planes

| Plane | Field | Controls |
| --- | --- | --- |
| App UI | `LanguagePreferences.appLocale` | Menus, settings, system chrome, First Light UI, error shells, notification chrome |
| Conversation | `conversationLanguage` + `conversationLanguageMode` | Companion replies, proactive body, diary/moments/scenario dialogue, agent user-facing text |
| Internal prompts | Prompt registry + English directives | Tool IDs, JSON keys, schemas stay English; natural-language fields follow conversation language |

They must not collapse into one field. Example: English UI + Chinese chat is valid.

## Storage

- Key: `yueqi.language.prefs.v1`
- Modes: `follow-user` | `fixed-zh-CN` | `fixed-en-US` | `character-default`
- Enums in DB stay English IDs (`romantic_partner`, `immediate_established`, …)
- Display strings come from locale packs at render time

## Core modules

```text
src/i18n/index.js              t(), setLocale, wireLanguageUi
src/i18n/language-prefs.js     prefs + detect/switch heuristics
src/i18n/language-context.js   LanguageContext + directives
src/prompts/registry.js        versioned prompt templates
src/first-light/locales/*      First Light formal copy (zh/en)
```

## LanguageContext

Every model call should receive:

```ts
{
  appLocale,
  conversationLanguage,
  userMessagePrimaryLanguage?,
  characterDefaultLanguage?,
  preserveQuotedLanguage: true
}
```

Directive (always attached):

```text
Current app locale: …
Current conversation language: …
Respond to the user in: …
```

## follow-user rules

- Need ~3 agreeing votes in last 5 user messages before switching
- Short / code / URL-like messages ignored
- Explicit “以后用英文 / speak in English” switches immediately

## Background tasks

Proactive / diary / moments must read saved `conversationLanguage`, never hard-default to Chinese when the user is offline.

## Migration

Existing users: prefs bootstrapped from UI `locale`; conversation language starts as app locale until messages update it.
