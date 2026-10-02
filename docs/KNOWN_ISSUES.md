# Known Issues & Footguns

Updated: 2026-08-13

## Release / QA

| ID | Issue | Impact |
|----|--------|--------|
| KI-C6 | Product-cutover browser E2E 7/12 FAIL | 阻塞 C8 |
| KI-C4 | 无真搜索 Key 的 staging JSON | C4 product BLOCKED |
| KI-C5 | 无真机迁移样本 | C5 BLOCKED |
| KI-C7 | Android device 旅程未跑 | 阻塞发版 |
| KI-README | README Phase 清单过时 | **FIXED** 2026-08-13 — 根 README 改指向 AGENTS / CURRENT_STATE |

## Product / UX

| ID | Issue | Impact |
|----|--------|--------|
| KI-PET-STUB | 月栖昼/夜多动作帧=idle 占位 | 点击动作无观感变化；已 UI 过滤 placeholder |
| KI-SELFIE-DRIFT | 无身份参考仍可生图 | 不像角色；需引导补「她自己」 |
| KI-ARK-WIRE | 火山控制台已开全 ≠ 代码默认走 Ark | **FIXED 2026-08-15** — Hosted catalog/route 已收成 Ark-only；TTS/STT 仍非 Hosted |
| KI-ALBUM-SCROLL | 相册曾无法滚动 / 露滑块 | 2026-08-12 已修 overflow + 隐藏滚动条 |

## Architecture footguns（未来 Agent 最易踩）

1. **petId vs characterId** — 混用导致记忆串角色。  
2. **开 flag 当发版** — `DEFAULT_FEATURES` 多为 false。  
3. **V2 avatar-factory** — paused；勿当主验收。  
4. **多套 Agent 目录** — 情人聊天 ≠ OpenClaw 工具环。  
5. **Web vs SQLite** — 浏览器绿 ≠ 真机绿。  
6. **palaceProjectionV1 vs OnlyV1** — 两个 flag。  
7. **密钥进聊天记录** — 立即轮换；勿写入 `.env` 到 Git。  
8. **巨型 `npm run verify`** — 先跑域内脚本。  
9. **脏 git tree** — 禁止擅自 reset --hard。  
10. **`compilePrompt` 仍在庞大 `app.js`** — 改 prompt 注意副作用。

## Security

| ID | Issue | Status |
|----|--------|--------|
| KI-SEC-CAL | verify 仍查 `escapeHtml(event.title)` 但日历已用 displayTitle | **FIXED** 2026-08-13 in `scripts/verify-security.mjs` |
| KI-PROP-TTL | `expireStale` 用 `Date.now()` 忽略测试/产品 clock → C2 verify 假红 | **FIXED** 2026-08-13 — `proposal-repository` 用 `getClock().nowMs()` |
| KI-SEC-KEYSTORE | Native 密钥仍 Preferences | 规划见 `docs/NATIVE_SECRETS_PLAN.md` |

## Debt inventory (short)

- 重复记忆/会话存储层  
- CP 完成报告通胀  
- `packages/avatar-factory` 与轨 A 双轨残留  
- Electron pet-v2 与 in-app float 双实现需边界清晰（`verify:pet-boundary`）
