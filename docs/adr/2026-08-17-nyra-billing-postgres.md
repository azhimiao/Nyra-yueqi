# ADR: Nyra Credits live in a dedicated Postgres ledger

Date: 2026-08-17

## Decision

Nyra Hosted Credits are stored in a Nyra-owned PostgreSQL database selected by
`YUEQI_BILLING_DATABASE_URL`. Auth users/sessions stay in `YUEQI_DATA_FILE`.

## Why

CogPrism Studio credits live in `ai_memory_os` as `StudioUser.credits` +
`CreditLedgerEntry`. Sharing that schema would mix 栖币/Studio balances with
Nyra Credits, share idempotency keys and Whop webhooks, and couple migrations.

Nyra copies CogPrism *patterns* (ledger + unique idempotency + checkout
metadata + plan allowlist) and hardens them with an advisory lock plus unique
indexes. It does not share tables, Prisma clients, or `/webhooks/whop`.

## Consequences

- Public servers fail closed without `YUEQI_BILLING_DATABASE_URL`.
- JSON billing remains a local/test fallback and an import source.
- `scripts/migrate-json-billing.mjs` is dry-run by default, checksum-guarded,
  and never deletes the JSON file.
- PGlite is test-only (`YUEQI_BILLING_DRIVER=pglite` plus an explicit allow flag).
