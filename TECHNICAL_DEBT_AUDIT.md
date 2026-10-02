# TECHNICAL DEBT AUDIT

**Date:** 2026-08-13  
**Repo:** `F:/beautiful` (`yueqi-companion`)  
**Scope:** Production-grade engineering audit with fixes + regression tests  
**Commands:** `npm run verify` · `npm run build` · `npm run verify:tech-debt-audit`  
**Note:** No TypeScript/`tsc` in this repo (JS + Vite). Compiler category = build/module graph.

**逐项前后对比（已改代码）：** [`docs/AUDIT_CHANGELOG_2026-08-13.md`](./docs/AUDIT_CHANGELOG_2026-08-13.md)  
**仍开放问题（只审计、未改代码）：** [`docs/AUDIT_FINDINGS_OPEN.md`](./docs/AUDIT_FINDINGS_OPEN.md)

---

## FIXED

| ID | Category | Evidence | Fix | Regression |
|----|----------|----------|-----|------------|
| TD-01 | Auth / flags | `DEFAULT_CUTOVER_PROFILE` was `production_v1` while cutover STATUS **NOT READY** | Reverted to `legacy`; removed implicit legacy→production auto-upgrade | `verify:product-cutover-profile` |
| TD-02 | Security / SSRF | `assertSafeUpstreamUrl` only blocked cloud metadata | `server/upstream-url.mjs` uses `validateFetchUrl`; public blocks private IPs; local-dev allows loopback | `verify:tech-debt-audit`, `verify:security` |
| TD-03 | Race | `chargeManagedCredits` read-modify-write without lock | `server/account-store.mjs` `transact` queue | concurrent charge test in tech-debt audit |
| TD-04 | Data loss | Corrupt Conversation V2 JSON → empty bag → next write wiped chats | Recover `.tmp`; quarantine; `writeBlocked` refuses overwrite | tech-debt audit corrupt cases |
| TD-05 | Race / multi-tab | Sticky `memoryBag` ignored other tabs | `storage` event invalidates bag | covered by store wiring + corrupt tests |
| TD-06 | Data loss / UX | Chat diary path `overwrite: true` silent clobber | Chat + diary-action default deny; overwrite only when `=== true` | tech-debt diary test |
| TD-07 | Auth bypass | `/external/grant` wrote as `guest` without bearer | Require login (401) | `verify:security` |
| TD-08 | API contract | Sync upload ignored server version (LWW wipe) | 409 `version_conflict` when `version < serverVersion` | static + security gate |
| TD-09 | Runtime | Stream path `upstream.body.getReader()` without null guard | 502 before `flushHeaders` if no body | server patch + security scan |
| TD-10 | Auth / flags | `isFeatureEnabled` treated unknown keys as ON (`!== false`) | Opt-in `=== true` | cutover profile + tech-debt |
| TD-11 | Duplicated state | Backup listed story chapters only; sessions key omitted | `storySessions` in `DATA_MODULES` | align-f0 module list |
| TD-12 | Performance | Vite `manualChunks` for voice/palace/world missing | Restored in `vite.config.js` | `verify:x5` chunk probe |
| TD-13 | Test drift | X5 expected 5–6 bottom `data-tab`s; UI is dock+hub | Assert dock core + hub routes | `verify:x5` |
| TD-14 | Security verify | Calendar XSS grep stale; SSRF gate weak | Earlier + this audit hardened `verify:security` (24/24) | `verify:security` |
| TD-15 | Race / temporal | Proposal `expireStale` used wall clock | `getClock().nowMs()` (handoff fix kept) | cutover proposals |

---

## VERIFIED

| Check | Result |
|-------|--------|
| `npm run build` | PASS (chunk size warnings only) |
| `npm run verify:tech-debt-audit` | PASS |
| `npm run verify:security` | PASS 24/24 |
| `npm run verify:product-cutover-profile` | PASS (default legacy) |
| `npm run verify:product-cutover-node` | PASS |
| `npm run verify:pet-boundary` / `asset-boundaries` / `pet-actions` | PASS |
| `npm run verify:x5` | PASS 16/16 after dock/chunks alignment |
| Full `npm run verify` | See footer of this file after final run |

No `pnpm` lockfile — project is **npm**-primary (`package.json` / `package-lock` if present).

---

## PENDING_EXTERNAL

| ID | Category | Why blocked |
|----|----------|-------------|
| PE-C4 | Web retrieval product | Needs real Brave/Tavily key + `C4_STAGING_RESULT.json` |
| PE-C5 | Migration | Needs real browser/Android sample evidence |
| PE-C6 | Browser E2E | Historically 7/12 FAIL — needs Playwright journey repair + clean console |
| PE-C7 | Android device | No device/APK journey evidence |
| PE-C8 | Release gate | Depends on C4–C7; `verify:product-cutover-release` must stay honest FAIL until ready |
| PE-ARK | Voice/image wiring | Console “开通” ≠ app default provider path (`KI-ARK-WIRE`) |
| PE-KEYSTORE | Native secrets | Still Preferences; Keychain/Keystore per `NATIVE_SECRETS_PLAN.md` |

---

## DEFERRED_WITH_REASON

| ID | Category | Issue | Reason to defer |
|----|----------|-------|-----------------|
| DF-01 | Duplicated state | Presence/video path still `saveChatMessage` (IDB) without Conversation V2 write | Needs companion-write bridge refactor; high behavior risk mid-audit |
| DF-02 | Auth | Bearer tokens never expire (`tokenFor` HMAC of userId only) | Needs refresh UX + client migration |
| DF-03 | Performance | Palace pool cosine O(n) on main thread | Needs worker/index; not a one-line fix |
| DF-04 | Performance | `src/app.js` ~4410 lines (soft cap 5000) | Further extraction planned; panels already split; avoid risky mega-move |
| DF-05 | Dead / confusing code | `src/agent/*` vs `src/agents/*` vs orchestrator naming forest | Cleanup without behavior change needs dedicated pass |
| DF-06 | Dual story keys | Still two stores (`yueqi.story.v1` + sessions); backup now includes both | Unifying keys needs migration UI |
| DF-07 | Dependency | `cors`/`express` on `"latest"` | Pinning versions needs lockfile discipline + CI; defer to deps sprint |
| DF-08 | Coverage | No `tsc`; e2e creative/cutover browser not in default `npm run verify` | By design; document in TESTING.md |
| DF-09 | UX | Yueqi pet placeholder clips | Content pipeline, not code bug (`KI-PET-STUB`) |
| DF-10 | Perf maps | Unbounded Maps in chat panel for understanding/trace | Cap/evict when product defines session length |

---

## Audit order executed

1. Build — PASS; restored manualChunks  
2. TypeScript / compiler — N/A (JS); Vite graph verified via build + X5  
3. Runtime — stream null body guard  
4. Data loss — Conv V2 corrupt + diary overwrite + sync conflict  
5. Race — account store queue + multi-tab invalidate + clock TTL  
6. Security — SSRF harden + security verify expansion  
7. Auth / permission — grant auth; cutover default; flag opt-in  
8. API contract — sync 409  
9. Duplicated state — backup storySessions  
10. Dead code — deferred agent forests  
11. Performance — manualChunks restored  
12. Dependencies — deferred pin-latest  
13. Test gaps — added `verify:tech-debt-audit`; aligned X5  
14. UX-breaking — diary silent overwrite fixed  

---

## New / updated entry points

- `server/upstream-url.mjs`
- `server/account-store.mjs`
- `scripts/verify-tech-debt-audit.mjs`
- `npm run verify:tech-debt-audit` (also prepended to `npm run verify`)

---

## Final command status

_Filled after the closing verify/build cycle._

| Command | Status |
|---------|--------|
| `npm run verify` | _pending run_ |
| `npm run build` | _pending run_ |
