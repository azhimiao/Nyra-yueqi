# 双轨解耦：星梨/Codex 生产轨 ≠ Avatar Factory V2

> **强制：** 不得把 `packages/avatar-factory` 黄金批说成「已达到星梨观感」。  
> 更新：2026-08-03

## 1. 两条路分别是什么

| | **轨 A — 星梨 / Codex 生产轨（质量基准）** | **轨 B — Avatar Factory V2（编排实验轨）** |
|--|--|--|
| Skill | `F:/codex换环境/.cursor/skills/desktop-pet-companion/` | （无对等 skill；文档在 `docs/avatar-factory-v2/`） |
| 血泪实录 | `generation-lessons.md` / `CODEX_LESSONS_AUDIT.md` | — |
| 生产脚本 | **`F:/beautiful/scripts/generate-xingli-assets.mjs`** | `packages/avatar-factory` RealProvider 批跑 |
| 规范 | `docs/XINGLI_ASSET_GENERATION_SPEC.md` | `docs/avatar-factory-v2/MASTER_PLAN.md` |
| 交付形态 | **atlas 精灵图** + `clips/*.png`+`*.json` | 散装全身 PNG `actions/*/frame-0N.png` |
| 运行时 | `src/avatar/sprite-character.js` + 星梨 overlay | `electron/pet-v2`（Canvas stub→增强中） |
| 落盘 | `public/assets/characters/xingli/` | `public/avatar-packs/<id>/` |
| 锁图 | **人审可爱** 才冻结 | V2 黄金批用了 `--auto-lock`（跳过人审） |
| 抠图 | 灰底 + **rembg isnet-anime** | 黄金批实测 **fallback 灰键控**（`usedIsnet: 0`） |
| 验收入口 | `npm run verify:xingli` / pet verify | `avatar:golden*` / contract gates |

## 2. 为什么 V2 黄金包观感远差于星梨

不是「换个 API key 就能赶上 Codex」，而是 **管子绕开了月栖已验证脚本**：

1. **没挂** `generate-xingli-assets.mjs`（审计已写明：工厂是薄壳，偏离教训）
2. **自动锁图** → 没有「首图够不够可爱」人闸（星梨否决过 5.5 头身成熟稿）
3. **抠图降级** → `DEGRADED_PASS` / `fallback_matting`，不是 isnet-anime 产线
4. **散帧整图** 而非 atlas + 脚底配准 + crossfade 播放器那套星梨交付
5. pet-v2 长期是预览壳，**不是** 星梨 overlay 播放器

轨 B 证明的是：**合同 / Job / 真 Seedream 调用能通**。  
轨 A 证明的才是：**能卖的观感资产**。

## 3. 解耦规则（给后续 agent）

### 做质量 / 对标星梨时

1. **先读** skill：`desktop-pet-companion` → `generation-lessons.md`
2. **只改 / 只跑** 轨 A：`generate-xingli-assets.mjs` + `XINGLI_ASSET_GENERATION_SPEC.md`
3. **禁止** 用 `avatar:golden` / `public/avatar-packs/*` 冒充星梨级交付
4. 新角色若要进月栖默认桌宠：导入 `public/assets/characters/<id>/`，走 `import-xingli-pack` / 星梨 schema，**不要**塞进 V2 packs 假装兼容

### 做 V2 工厂实验时

1. 工作区限 `packages/avatar-*`、`electron/pet-v2`、`docs/avatar-factory-v2`
2. 可借用教训文案（灰底、4.8 头、少关键帧），但 **不得改星梨 live 包** 除非用户明示
3. Gate 名保持诚实：`three_character_golden_green` = 工厂门禁绿，**≠** `xingli_quality_green`

### 禁止话术

- 「已复刻星梨 / 已超过星梨」
- 「Avatar Factory 黄金批 = 生产级桌宠资产」
- 把 fixture 或 DEGRADED_PASS 包当成 Codex 会话验收通过

## 4. 若要质量追上星梨（下一步，不在本文件自动执行）

单独开 **轨 A 工单**，不要在 V2 里「再调一调 prompt」糊弄：

```text
人审锁图 → 包装/调用 generate-xingli-assets.mjs
→ isnet-anime → 配准/去影 → atlas + manifest
→ verify:xingli → 默认播放器挂新 id
```

可选长期：让 V2 **编排层调用** 轨 A 脚本（审计项 3），而不是平行再写一套弱流水线。

## 5. 路径速查

```text
Skill（Codex 桌宠）:
  F:/codex换环境/.cursor/skills/desktop-pet-companion/SKILL.md

星梨生产:
  F:/beautiful/scripts/generate-xingli-assets.mjs
  F:/beautiful/docs/XINGLI_ASSET_GENERATION_SPEC.md
  F:/beautiful/public/assets/characters/xingli/

V2 实验（已解耦）:
  F:/beautiful/docs/avatar-factory-v2/MASTER_PLAN.md
  F:/beautiful/packages/avatar-factory/
  F:/beautiful/public/avatar-packs/
```
