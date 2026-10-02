# 主动产线：星梨轨（轨 A）

Updated: 2026-08-03

## 决定

用户确认：**停用 Avatar Factory V2 作为质量路线**，改走星梨 / Codex 路径。

| 轨 | 状态 |
|----|------|
| **A 星梨** `generate-xingli-assets.mjs` + atlas + 星梨播放器 | **ACTIVE** |
| **B V2** `packages/avatar-factory` / `public/avatar-packs` | **PAUSED**（仅实验归档，不作观感验收） |

解耦说明仍见：`docs/avatar-factory-v2/DECOUPLE_FROM_XINGLI.md`

## 当前步骤（skill P2）

```text
[1] npm run generate:xingli -- --stage lock   → 3 候选
[2] 人工选 cute enough → --select N 冻结 character_lock
[3] set XINGLI_REMBG_PYTHON=… 
    npm run generate:xingli -- --stage poses --select N --require-rembg
[4] npm run generate:xingli -- --stage qa --select N   → GATE D
[5] 人工抽查 contact sheet（sit/sleep/comfort/talk）→ GATE E
[6] npm run import:xingli → 默认桌宠播放器验收（非 pet-v2）
```

禁止：`--auto-lock`、跳过人审、无 rembg 却宣称星梨级、用 V2 黄金包冒充。  
对齐表：`F:/codex换环境/.cursor/skills/desktop-pet-companion/ALIGNMENT.md`
