# Avatar Factory V2 — Gate Status

对照计划：`MASTER_PLAN.md` · **解耦：** [DECOUPLE_FROM_XINGLI.md](DECOUPLE_FROM_XINGLI.md)  
Updated: 2026-08-03

> **诚实声明：** 下列 gate 只证明 **V2 编排轨**通了。  
> **不**证明达到星梨 / `generate-xingli-assets` 观感。黄金包 QA=`DEGRADED_PASS`（fallback 抠图、`--auto-lock`）。

| Gate | Status | Evidence |
|------|--------|----------|
| `contract_green` | **PASS** | `npm run avatar:verify-contract` |
| `fixture_green` | **PASS** | `npm run avatar:fixture-green` |
| `runtime_green` | **PASS** | `npm run avatar:verify-runtime` |
| `real_provider_green` | **PASS** | Seedream live；`public/avatar-packs/<id>/` |
| `qa_green` | **PASS** | 工厂 QA 枚举；真包多为 `DEGRADED_PASS` |
| `product_integrated_green` | **PASS** | `npm run avatar:verify-product` |
| `three_character_golden_green` | **PASS** | 三角色 real + publishable（**工厂门禁 ≠ 星梨质量**） |
| `xingli_quality_green` | **NOT_THIS_TRACK** | 轨 A：`desktop-pet-companion` + `generate-xingli-assets.mjs` |

## V2 黄金批（编排证据，非质量验收）

| characterId | packPath |
|-------------|----------|
| cool_mature | `public/avatar-packs/cool_mature` |
| lively_shorthair | `public/avatar-packs/lively_shorthair` |
| quiet_longhair | `public/avatar-packs/quiet_longhair` |

## 质量要追上星梨时

**已切换：** 见 `docs/ACTIVE_PET_PIPELINE.md` —— 轨 A ACTIVE，本 V2 轨 **PAUSED**。
