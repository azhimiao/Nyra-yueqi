# CP-AV6 完成报告 — product_integrated_green

对照：`MASTER_PLAN.md`

## 完成
- product-adapter + pet-v2-bridge
- `electron/pet-v2/create-window.mjs` / `wire-ipc.mjs` / `product-ipc.mjs`
- `electron/main.mjs` 加法接入（不破坏 v1 pet）
- `preload-app.cjs`：`sendPetV2` / deep-link / opened-receipt
- `host-core.mjs` 投影辅助
- `npm run avatar:verify-product` PASS

## Gate
**`product_integrated_green` = PASS**（投影与 deepLink 契约；真 Pop 运行时联调可在限额恢复后做）
