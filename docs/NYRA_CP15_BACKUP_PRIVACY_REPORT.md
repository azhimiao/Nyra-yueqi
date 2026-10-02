# CP-15 完成报告：备份迁移与隐私

> 2026-07-30 · **PASSED**（Node） · `33ce970`

## 闭环

| 能力 | 实现 |
|------|------|
| **导出完整性** | `buildExportPayload` 覆盖 CP-9…14 持久化模块：`companionLife`、`appEvents`（短环）、`yeosGames`、`yeosSaves`；`DATA_MODULES` 同步登记 |
| **导入** | `restoreImportPayload` 按模块恢复；接受 `version` 1 或 2；未知高版本拒绝 |
| **隐私** | `scrubExportPayload` 剥离 API Key / 会话 token；门禁 token 导出为 `[redacted]`；云同步与本机导出共用 scrub |
| **UI** | 设置页「导出 ZIP（无媒体）」「清除事件缓冲」已接线；原有轻量/完整/导入仍可用 |

## 新增 / 扩展模块

| 模块 | 存储键 | 导出 helper |
|------|--------|-------------|
| 陪伴生活状态 | `yueqi.companion.life.v1` | `exportCompanionLifeBag` |
| 应用事件缓冲 | `yueqi.world.app-events.v1` | `exportAppEventsBag` |
| YEOS 已装游戏 | `yueqi.yeos.games.v1` | `exportYeosGamesBag`（registry-games） |
| YEOS 存档 | `yueqi.yeos.saves.v1` | `exportYeosSavesBag` |

## 刻意不包含（备份外）

* `yueqi.provider.v1` / Capacitor secure store 中的 BYOK
* 生态 `ecosystem.token`、语音 `ttsApiKey` / `sttApiKey`
* 门禁 live `gateSessionToken`（占位 `[redacted]`，导入时不恢复会话）

## 版本

* `SYNC_PAYLOAD_VERSION` **1 → 2**（新增字段向后兼容；v1 备份仍可导入）

## 验证

```bash
npm run verify:backup-cp15
npm run verify:skill-cp14
npm run verify:companion-cp12
npm run verify:yeos-cp13
```

## 隐私 affordances

1. **导出 ZIP（无媒体）** — `buildFullBackupZip({ includeMedia: false })`
2. **清除事件缓冲** — `clearLocalModules(["appEvents"])`
3. **导出 scrub** — 所有 `buildExportPayload` 输出经 `scrubExportPayload`

## 刻意不做（CP-16+）

* 全量「恢复出厂」一键 wipe IDB
* 云备份 E2E 浏览器实测
