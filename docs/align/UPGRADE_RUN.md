# 月栖 · 栖机全面升级编排（UPGRADE RUN）

> ## 冻结声明（2026-07-25 · CEV2）
>
> **本文件不再是产品完成依据。**  
> 旧 F0–F7「core 已落地 / 放行」一律重定级为 **L1 Contract Green**（契约/管道测试通过），**不等于**产品体验完成，**不得**据此宣称 L3/L4。  
> 唯一施工依据：[`docs/CORE_EXPERIENCE_CORRECTION_PLAN.md`](../CORE_EXPERIENCE_CORRECTION_PLAN.md)（Core Experience V2，阶段 C0–C7）。  
> 状态板见 [`docs/qa/core-experience/STATUS.md`](../qa/core-experience/STATUS.md)。  
> C0–C6 全部 L3 前：禁止新增消费者顶层 App；禁止实现者自签产品放行。
>
> ---
>
> 基线提交：`02afac5`（initial local baseline before living-phone upgrade）  
> 启动日：2026-07-25  
> 协议：历史 Impl/Checker 轮次仅作档案；新工作按 CEV2 执行。  
> 质量：旧 [_QUALITY_BAR.md](./_QUALITY_BAR.md) 仍可参考；CEV2 一票否决与 L 等级优先。

---

## 1. 子任务分配

| Agent 角色 | 阶段 | 负责文件 | 职责 |
|------------|------|----------|------|
| Impl-F0 | F0 | [F0.md](./F0.md) → 代码 | 底座 / 同栖时间线 / 壳 |
| Impl-F1 | F1 | [F1.md](./F1.md) → 代码 | 信物社交 |
| Impl-F2 | F2 | [F2.md](./F2.md) → 代码 | 侧写（先 F2a） |
| Impl-F3 | F3 | [F3.md](./F3.md) → 代码 | 生活 / 栖店 |
| Impl-F4 | F4 | [F4.md](./F4.md) → 代码 | 剧章 / 共创 / 游戏 |
| Impl-F5 | F5 | [F5.md](./F5.md) → 代码 | 创作系统 |
| Impl-F6 | F6 | [F6.md](./F6.md) → 代码 | 多媒体 |
| Impl-F7 | F7 | [F7.md](./F7.md) → 代码 | 栖市 / 扩展 |
| **Checker** | 全波 | 各 Fn + diff | 对照质量门槛打回 / 放行 |

**依赖硬规则：** 写代码时 F1+ 不得在 F0 放行前合并主路径；F2b 订单对齐依赖 F1 钱包与 F3 订单约定。  
**详细化可并行**（只改各自 `docs/align/Fn.md`）。

---

## 2. 轮次计划（约 12+ 轮）

| 轮次 | 动作 | 通过标准 |
|------|------|----------|
| **R1** | 并行「详细化」F0–F7（只写文档） | 每份 Fn 状态=已详细化；含字段级 §4–§9 |
| **R2** | Checker 审详细化稿 | 全部放行或列出必改；Impl 修回 |
| **R3** | 落地 F0 代码 + verify | `verify:align-f0` 绿 |
| **R4** | Checker 审 F0 | U/E/P + §9 勾选；放行才进 F1 |
| **R5** | 落地 F1 | `verify:align-f1` |
| **R6** | Checker 审 F1 | 放行 |
| **R7** | 落地 F2a | `verify:align-f2`（MVP） |
| **R8** | Checker 审 F2a | 放行 |
| **R9** | 落地 F3 | `verify:align-f3` |
| **R10** | Checker 审 F3 | 放行 |
| **R11** | 落地 F4 或 F5（取详细化更完整者） | 对应 verify |
| **R12** | Checker + 扫尾：F2b/F6/F7 排期或开下一迭代窗口 | 更新本文件状态表 |

若某轮被打回：同阶段加一轮 `Rn.b` 修复，不跳阶段。

---

## 3. 状态板

| 阶段 | 详细化 | 代码 | Checker | 备注 |
|------|--------|------|---------|------|
| F0 | 已详细化 | **core 已落地** | core 放行 / UI 待 R3.b | `verify:align-f0` 16/16 |
| F1 | 已详细化 | **core 已落地** | R5 自检放行（管道）| `verify:align-f1`；完整 B4–B13 待 R6 |
| F2 | 已详细化 | **F2a core 已落地** | **R8 放行** | `verify:align-f2` 29/29；F2b/c 未做；见 CHECKER_F2_R8 |
| F3 | **已详细化** | **core 已落地** | **R10 放行** | `verify:align-f3` 26/26；见 [CHECKER_F3_R10.md](./CHECKER_F3_R10.md) |
| F4 | 已详细化 | **core 已落地** | **R11 放行** | `verify:align-f4` 24/24；E8 local 未做；见 [CHECKER_F4_R11.md](./CHECKER_F4_R11.md) |
| F5 | **已详细化** | **core 已落地** | **R12 放行** | `verify:align-f5` 20/20；见 [CHECKER_F5_R12.md](./CHECKER_F5_R12.md) |
| F6 | **已详细化** | **core 已落地** | **R12 放行** | `verify:align-f6`；**G5 场景工坊已删除**；保留绘境+Pop 语音 |
| F7 | 已详细化 | **core 已落地** | **R12 放行** | `verify:align-f7` 28/28；见 [CHECKER_F7_R12.md](./CHECKER_F7_R12.md) |

### 本窗口结论（2026-07-25）

**F0–F7 core 管道已全部落地且 verify 绿。** 下窗口可选扫尾（非阻塞）：

| 项 | 说明 |
|----|------|
| F0 UI R3.b | 桌面 widget 真数据、日记→时间线观感 |
| F1 扩面 | 主聊天信物卡、羁绊 B10、B6/B8/B9… |
| F2b / F2c | 侧写生活证据与桌面池 |
| F4 E8 local | 可选局域网联机 |
| 真机手测 | F6 Key 出图/语音、F7 侧载 zip 真机 |

图例：`—` 未开始 · `进行中` · `已详细化` · `已落地` · `打回` · `放行`

---

## 4. Checker 放行清单（每轮必填）

对每个被审阶段输出：

```
阶段: Fn
结论: 放行 | 打回
质量门槛: U? E? P? （列未过编号）
§9 手测: 可执行 / 空话
风险: …
必改: 1. … 2. …
```

---

## 5. 变更记录

| 轮次 | 日期 | 摘要 |
|------|------|------|
| 基线 | 2026-07-25 | git init + `02afac5`；编排提交 `5131183` |
| R1 | 2026-07-25 | 详细化并行；F2/F4/F7 完成；F1/F3/F5/F6 重开 |
| R3 | 2026-07-25 | **F0-core 落地**：场景标签 + 同栖时间线 + 备份模块 + verify 16/16；检查官 core 放行 |
| R1.b | 2026-07-25 | **F6 详细化完成**：绘境 / Pop 语音 / 场景工坊；状态板同步 |
| R2.b | 2026-07-25 | **F4 文档复审放行**：同栖时间线对齐 F0；E8 默认 deferred；见 CHECKER_F4_R2b |
| R5 | 2026-07-25 | **F1-core 落地**：信物卡 + 钱包 + 动态基础；`verify:align-f1` |
| R7 | 2026-07-25 | **主 Agent 自治启动**：派 F2a 实现；并行 R2 审 F6；F3/F5 状态板对齐为已详细化 |
| R8 | 2026-07-25 | **F2a R8 放行**：`verify:align-f2` 29/29；主 Agent 复核 CHECKER_F2_R8 |
| R9 | 2026-07-25 | **派 F3 实现**：一起听 / 一起看 / 日历 / 栖店 |
| R10 | 2026-07-25 | **F3 R10 放行**：`verify:align-f3` 26/26；F0–F2 未回归 |
| R11 | 2026-07-25 | **派 F4 实现**：剧章 / 情景剧加深 / 共创 / 游戏 / E8 deferred |
| R11 | 2026-07-25 | **F4-core 落地**：E1/E5/E6/E7 + E8 deferred；`verify:align-f4` 24/24；E8 local 未做；见 CHECKER_F4_R11 |
| R11.b | 2026-07-25 | **F4 R11 放行**（主 Agent 复核）；派 **F5 创作管线** 实现 |
| R12 | 2026-07-25 | **F5-core 落地并放行**：`verify:align-f5` 20/20；派 **F6 多媒体** 实现 |
| R12.b | 2026-07-25 | **F6-core 落地并放行**：`verify:align-f6` 28/28；派 **F7 栖市/扩展**（计划末波） |
| R12.c | 2026-07-25 | **F7-core 落地并放行**：`verify:align-f7` 28/28；**UPGRADE_RUN F0–F7 core 窗口完成** |
| 扫尾 | 2026-07-25 | **删除 G5 场景工坊**（含 three）；F6 仅保留绘境 + Pop TTS/STT |
| R12.c | 2026-07-25 | **F7-core 落地**：H1 栖市 / H2 扩展 SDK / H3–H5 门禁举报 / H6 本地聊天助手；`verify:align-f7`；见 CHECKER_F7_R12 |
| R12 | 2026-07-25 | **F6-core 落地**：G1 绘境 / G2 TTS / G3 STT / G5 场景工坊；`verify:align-f6` 28/28；无 G4；见 CHECKER_F6_R12 |
| R10 | 2026-07-25 | **F3-core 落地**：D3–D6 + `verify:align-f3` 26/26；见 CHECKER_F3_R10 |
| R2 | 2026-07-25 | **F3/F5 文档放行**：对齐 F0 时间线 + F1 `ledger.js`；F5 钉死 `qijian` 场景标签；见 CHECKER_F3_R2 / CHECKER_F5_R2 |
| R2.b | 2026-07-25 | **F6 文档复审放行**：同栖时间线可选投影钉 F0；见 CHECKER_F6_R2 |
