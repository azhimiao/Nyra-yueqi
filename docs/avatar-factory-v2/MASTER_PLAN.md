# Avatar Factory V2 — 完整执行计划（强制对照文档）

> **每个子 agent / 每轮实现必须先读本文**，不得改栈回 Live2D/Rive/Spine/VRM，不得伪造成真图成功，不得硬编码 `xingli`。  
> 仓库根：`F:/beautiful`  
> 状态真相：`docs/avatar-factory-v2/STATUS.md`  
> **与星梨解耦：** `docs/avatar-factory-v2/DECOUPLE_FROM_XINGLI.md` —— 本轨 **不是** Codex/星梨质量产线；对标可爱观感必须走 `desktop-pet-companion` skill + `scripts/generate-xingli-assets.mjs`。

---

## -1. 双轨声明（禁止混谈）

| 轨 | 用途 | 入口 |
|----|------|------|
| **A 星梨/Codex** | 可卖观感、atlas、人审锁图 | skill `desktop-pet-companion`；`generate-xingli-assets.mjs` |
| **B 本文件 V2** | 合同/Job/散帧包/pet-v2 实验 | `packages/avatar-factory` |

V2 gate 全绿 **≠** 星梨观感。禁止用 `public/avatar-packs` 黄金批对外宣称「已达星梨」。

---

## 0. 验收北极星

```text
character.spec.json
→ 候选 → Identity Lock（默认可人闸；fixture/--auto-lock 可自动）
→ canonical / 动作关键帧 / 面部图层
→ rembg isnet-anime 抠图 + 配准 + QA
→ 统一角色包 public/avatar-packs/<id>/
→ Electron pet-v2 透明桌宠加载
→ Pop / Artifact / TTS 幅度联动（无第二套人格）
```

V1 栈锁定：

```text
生产：Node 编排 + Python media worker + Image Provider + rembg isnet-anime + OpenCV + Sharp/PNG
运行：Electron 透明置顶 + Pixi/Canvas + 图集 + Crossfade + 独立眼嘴眉道具层
```

禁止：Live2D、Rive、Spine、Unity、VRM、百帧逐帧、运行时视频扩散、桌宠专用 LLM、用户上传角色。

---

## 1. 门禁（禁止百分比）

| Gate | 含义 | 命令/证据 |
|------|------|-----------|
| `contract_green` | 合同与校验 | `npm run avatar:verify-contract` |
| `fixture_green` | 三角色 fixture 批处理 | `npm run avatar:fixture-green` |
| `runtime_green` | 无硬编码加载切换 | `npm run avatar:verify-runtime` + pet-v2 |
| `real_provider_green` | 真 Provider 单角色跑通 | Job `provider!=fixture` + provenance 真模型 + 非 `_fixture` 包 |
| `qa_green` | 自动 QA/降级/重试 | quality-report 含 PASS/RETRYABLE_FAIL/DEGRADED_PASS/HARD_FAIL |
| `product_integrated_green` | Pop/TTS/Artifact/deepLink | 适配器测试绿 |
| `three_character_golden_green` | 三真角色黄金验收 | 三包 publishable 候选 + 人工只做发布通过/驳回位 |

---

## 2. Checkpoint 定义

### CP-AV1 — 合同与目录 【目标：contract_green】
- packages/avatar-contract、目录骨架、JOB_STATES、validators、文档  
- **完成标准：** `avatar:verify-contract` PASS

### CP-AV2 — Fixture 全链路 【目标：fixture_green】
- FixtureProvider、可恢复 Job、后处理、打包至 `_fixture/`、catalog  
- **完成标准：** `avatar:batch` 三角色 ready；fixture 永不 publishable

### CP-AV3 — Electron pet-v2 【目标：runtime_green】
- frameless/transparent/alwaysOnTop、catalog 切换、preload 安全 API  
- **完成标准：** `avatar:verify-runtime` PASS；`desktop:pet-v2` 可开

### CP-AV4 — Real Image Provider 【目标：real_provider_green】
实现 `AvatarImageProvider`：
- `generateIdentity` / `generateCanonical` / `generateActionFrame` / `inpaintFacePart`
- `RealProviderAdapter`：封装 ARK/Seedream（读 `ARK_API_KEY`/`ARK_BASE_URL`/`ARK_IMAGE_MODEL`）
- 无 Key → Job `failed` + `PROVIDER_NOT_CONFIGURED`（禁止假图）
- Prompt 遵守 VISUAL_PROTOCOL（灰底 `#B8B8B8`、半 Q、全身、禁棋盘透明）
- 流水线：`--provider real` 时走真图；成功包装入 `public/avatar-packs/<id>/`（非 `_fixture`）
- **完成标准：** 至少 1 个真实 Job `ready`，provenance.model 非 fixture，`avatar:verify --pack` PASS

### CP-AV5 — 自动 QA 与降级 【目标：qa_green】
- Python worker 默认抠图（isnet-anime）；灰键控仅 `fallback_matting`
- 配准阈值：脚底≤4px、中心≤8px、高度≤3%；超限平移→重试帧→降级关键帧数
- 面部失败降级 A→B→C→D，不阻塞整包
- quality-report 强制枚举结果码
- 重复文件冒充动作 → HARD_FAIL
- **完成标准：** fixture 与 real 路径均写出合规 quality-report；单测覆盖 matting/register/degrade

### CP-AV6 — 月栖产品联动 【目标：product_integrated_green】
适配器（桌宠不碰 DB/Provider）：
- Pop 生成中 → thinking
- TTS 播放 → speaking + mouthOpen(RMS)
- 完成 → idle
- Artifact ready → show_artifact + prop + deepLink 打开**具体实体**
- opened receipt
- **完成标准：** `avatar-deep-link.test` 等绿；无第二套角色状态

### CP-AV7 — 三角色黄金验收 【目标：three_character_golden_green】
三份真实 CharacterSpec（文静长发 / 活泼短发 / 成熟冷淡）：
- 同一流水线、同一运行时
- 无逐角色代码/手工抠图/专用动作配置
- 仅 Identity Lock 人闸（或记录 auto-lock 决策）
- 完整 QA + provenance
- **完成标准：** 三包在 `public/avatar-packs/`（非仅 `_fixture`），runtime 可切换，STATUS 标记该 gate

---

## 3. 子 agent 执行协议（防偏差）

每一轮 prompt **必须**包含：

1. 全文或路径：`F:/beautiful/docs/avatar-factory-v2/MASTER_PLAN.md`
2. 当前目标 CP 与目标 gate
3. 禁止项列表（第二节栈锁定）
4. 完成后更新 `STATUS.md` 对应行
5. 运行相关 verify 命令，失败不得宣称完成
6. 工作目录仅 `F:/beautiful`（密钥用环境变量，不写入仓库）

完成一轮后：父 agent 对照 STATUS 选下一未完成 CP，再开子 agent，**直到全部 gate PASS 或撞上不可解除外部阻塞（如实写入 STATUS）**。

---

## 4. 当前进度（父 agent 维护）

见 `STATUS.md`（2026-08-03）：**全部 gate PASS**（含 `real_provider_green` + `three_character_golden_green`）。

---

## 5. 实现原则

- 不为兼容旧星梨降低新架构；可读旧代码，不复制硬编码  
- V2 并行，黄金验收后再迁默认角色  
- 无真实 Provider 验证只能标 `fixture_green`，不得标 `production_factory_green`  
- 输出每个 CP 报告：完成项 / 失败项 / 外部依赖 / 下一门禁  
