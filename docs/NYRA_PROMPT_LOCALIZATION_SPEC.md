# NYRA Prompt Localization Spec

## Registry

Templates live in `src/prompts/registry.js` via `registerPromptTemplate` / `renderPrompt`.

Each template declares:

| Field | Meaning |
| --- | --- |
| `id` | Stable id (`companion.default_system`, `proactive.heartbeat`, …) |
| `version` | Bump on semantic change |
| `purpose` | Human note |
| `supportedLocales` | `zh-CN` / `en-US` / `language-neutral` |
| `render(ctx)` | Returns string or message list; `ctx.language` is LanguageContext |

## Classes

### User-output sensitive (must have zh + en prose)

- First Light preview / first message (`first_light.*`, First Light locales)
- Companion defaults (`companion.default_system`, `companion.default_developer`)
- Proactive (`proactive.heartbeat`)
- Diary (`diary.system` + `diary/styles.js` bilingual builders)
- Moments (`moments.auto_post`)
- Scenario director (`scenario.director`)
- Agent user-facing (`agent.user_facing`)
- Error / notification shells via `t("errors.*")`

### Structured internal (English template OK)

- Memory extract (`memory.extract`)
- Safety / tool selection / JSON schema tasks

Must still include:

```text
Any user-visible natural-language fields must be written in: {{conversationLanguage}}.
Enum values, IDs, JSON keys remain English.
```

## Assembly

`src/prompt/assemble.js`:

- Resolves default system via registry (not Chinese-only constants alone)
- Appends `formatLanguageDirective` + `outputLanguageRule`
- Chat / experience post-history contracts select by conversation language
- Character block bilingual

## Forbidden

- Appending only “请用英文回答” to a Chinese system blob
- Hardcoding large Chinese prompts in callers when a registry template exists
- Translating tool names / JSON keys / file paths
- Runtime Google-Translate of formal product copy

## Tests

See `scripts/verify-i18n.mjs` and First Light verify for bilingual opening / contract presence.
