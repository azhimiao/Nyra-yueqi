# NYRA Phone Shell I18N Report

## Naming (frozen)

| zh-CN | en-US |
| --- | --- |
| 栖机 | Qiji |
| 栖机助手 | Qiji Assistant |
| 栖市 | Qiji Market |
| 朋友圈 | Moments |

First mention may use: “Qiji, your companion's little phone”.

## Coverage this round

| Surface | Status |
| --- | --- |
| App icon labels / jobs | `labelKey` / `jobKey` → `phone.apps.*` / `phone.jobs.*` |
| Common toasts | Mapped through `phone.toast.*` |
| Calendar / Diary / Memory / Settings titles | `pt("screens.*")` |
| Locale segmented control | Existing zh/en |
| Full screen HTML density | Partial — remaining strings tracked in leakage audit |

## Modules

- `src/phone-shell/i18n.js` — `pt()`, `applyPhoneI18n`, `phoneAppLabel`
- `src/phone-shell/apps-catalog.js` — localized resolve
- Locale packs: `phone.*` in `zh-CN.js` / `en.js`

## Not reinvented

Uses existing `t()` / locale packs. No second translation library.
