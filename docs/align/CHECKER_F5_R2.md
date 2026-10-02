# Checker · F5 详细化评审（R2）

> 日期：2026-07-25  
> 对象：`docs/align/F5.md`（审稿中补 `qijian` 场景标签硬约束后放行）  
> 对照：[\_QUALITY_BAR.md](./_QUALITY_BAR.md) · [\_PROMPT_TEMPLATE.md](./_PROMPT_TEMPLATE.md) · [CHECKER_R2.md](./CHECKER_R2.md)  
> 已落地事实：F0 `SCENE_APP_IDS`（尚无 `qijian`，本波须扩展）；不写同栖时间线（P1 N/A）

```
阶段: F5
结论: 放行（R2 · 修稿后）
质量门槛: U✓ E✓ P✓（P1 N/A 已注明）
§9 手测: 可执行
风险: 波内产品 ID 亦称 F1–F6，易与总计划波次混淆——文内已区分；六能力同波工期大，可按 §8 切片
必改: （无阻塞项；初审必改已关）
```

## 初审必改（已关闭）

| # | 问题 | 修回 |
|---|------|------|
| 1 | `appId:"qijian"` 未在 F0 `SCENE_APP_IDS`；缺扩展落点则 `normalizeSceneAppId` 回落 `pop` | ✓ §5.8 / §6 / §8 / §9.3 钉死注册 `qijian` + policy + verify #9–10 |
| 2 | §4.1「二次 confirm」易踩 `window.confirm` 禁令 | ✓ 改为二次确认 sheet |

## 模板符合度

| 检查项 | 结果 |
|--------|------|
| §0–§10 齐全 + 文首链模板/质量门槛 | ✓ |
| §2 波内 F1–F6 与总计划创作段一致；全局锁死 | ✓ |
| §4 导入 / 世界书 / 预设 / 正则 / 栖笺 / 资源库路径级 | ✓ |
| §5 字段级 + assemble 衔接 | ✓ |
| §6 存储/引擎/UI 分文件；含 `scene-tags.js` | ✓ |
| §9 = 9.0 + 六路径手测 + 观感 + verify ≥9 条 | ✓ |

## 亮点

- 栖笺强制 diff + 采用/丢弃；正则失败降级不白屏（E3）
- 资源库四宫格空态分区；无 key 离线栖笺可演示（E6）
- Clean-room：开放 JSON 角色卡，不写外部品牌

## 放行后动作

- 状态板：F5 Checker → **R2 放行**；实现可与 F3/F4 按工期穿插（建议 F0/F1 已就绪后）
- 实现口令：「执行 F5」；落地第一步须改 `scene-tags.js` 注册 `qijian`
