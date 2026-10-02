# NYRA English Product QA Report

## Gates run

| Command | Result |
| --- | --- |
| `npm run verify:i18n` | (see final report) |
| `npm run verify:first-light` | (see final report) |
| `npm run verify:english-product` | New gate |
| `npm run build` | (see final report) |
| `npm run verify:e2e-cp21` | (see final report) |

Scripts **not** present: `lint`, `typecheck`, `test` (unit) — not claimed.

## Coverage checked by `verify:english-product`

- Calendar enum migration idempotency
- First Light EN copy presence
- Phone Moments / Qiji naming
- Adventure + errors.recovery EN render
- Scenario / experience EN overlays
- Model language mismatch detector
- Required docs present

## Visual QA

Artifacts folder: `artifacts/i18n/english-product/`  
Browser screenshots at 390×844 / 768×1024 / 1024×1366 / 1440×900 are **manual capture** for review; CI records structural gate only.

## Status codes (when gates pass)

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

Forbidden claims: FULLY_GLOBALIZED / ALL_LANGUAGES_SUPPORTED / NATIVE_DEVICE_VERIFIED
