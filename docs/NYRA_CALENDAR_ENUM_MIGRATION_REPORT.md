# NYRA Calendar Enum Migration Report

## Change

Stored event `mode` values:

| Legacy (Chinese) | Stable ID |
| --- | --- |
| 可主动消息 | `proactive_message` |
| 仅提醒 | `notification_only` |
| 不联动 | `none` |
| (unknown) | `legacy_unknown` (+ `_legacyModeRaw`) |

## Module

`src/calendar/modes.js`

- `normalizeEventMode` — idempotent
- `migrateEventModeFields` — preserves date/time/title
- `eventModeLabel` / `eventModeOptions` — locale display via `calendar.mode.*`
- Helpers: `isProactiveMessageMode`, `isNotificationOnlyMode`, `isNoLinkMode`, `isSchedulableMode`

## Consumers updated

`engine.js`, `library.js`, `proactive/*`, `phone-data`, `app-screens`, `phone-shell`, `constants`, `anniversaries`, `calendar` panel, `ics`, `app.js`

## Guarantees

- Idempotent migrate
- No silent delete
- Dates/times unchanged
- Unknown values marked `legacy_unknown`
- Display never stores translated strings
