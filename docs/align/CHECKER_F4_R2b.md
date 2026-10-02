# Checker · F4 文档复审（R2.b）

> 日期：2026-07-25  
> 对象：`docs/align/F4.md`（[按检查官修 F4 文档](a179686e-a003-4330-8021-4b5fb8337ebb) 修回稿）  
> 对照：`CHECKER_R2.md` 必改 1–4；**F0 已落地** `CohabitTimelineEvent` / `appendCohabitEvent`

```
阶段: F4
结论: 放行
质量门槛: U✓ E✓ P✓（时间线对接点已钉死为 F0 canonical）
§9 手测: 可执行
风险: 五能力同波工期仍大；E8 local 为加分，勿阻塞
必改: （无）
```

## 必改核对

| # | R2 要求 | 修回结果 |
|---|---------|----------|
| 1 | 同栖时间线事件对齐底座 | ✓ §5.5 / §4.2 使用 F0 `{ id, at, appId, kind, summary, characterId, meta }`，`appId: "scenario"`；显式拒绝 F2 `LivingTimelineEvent` 漂移；`scriptId`/`runId` 进 `meta` |
| 2 | §9.0 工程条款去歧义 | ✓ 前缀「质量门槛 E1–E8」，注明勿与产品 ID E2 / 本波 E1 混读 |
| 3 | E8 默认 B deferred | ✓ §2 / §4.5 / §5.8 / §8 / §9.1 / verify #8 一律默认 `deferred`；A local 可选 |
| 4 | 文首链模板 | ✓ `> 模板：_PROMPT_TEMPLATE.md` |

## Canonical 裁决（相对 R2 初稿措辞）

R2 初稿曾写「对齐 F2 §5.7 `LivingTimelineEvent`」。**F0-core 已落地并以代码为准**：`appendCohabitEvent` → `CohabitTimelineEvent`。本复审以 **F0 / 源码** 为 I2 canonical；F4 修稿正确，**不要求**再改回 F2 草案字段名。

## 放行后动作

- 状态板：F4 Checker → **R2.b 放行**；可进实现队列（排在 F2a 之后或按工期穿插）
- `CHECKER_R2.md` 摘要表同步为 F4 放行
