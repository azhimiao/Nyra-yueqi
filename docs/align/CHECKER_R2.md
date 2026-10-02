# Checker · R2 详细化评审报告

> 评审轮次：**R2**（详细化稿）  
> 评审日：2026-07-25  
> 对照：[\_QUALITY_BAR.md](./_QUALITY_BAR.md) · [\_PROMPT_TEMPLATE.md](./_PROMPT_TEMPLATE.md) · [LIVING_PHONE_PLAN.md](../LIVING_PHONE_PLAN.md)  
> 对象：F2 · F4 · F7（状态均为「已详细化」）

---

## 总览

| 阶段 | 文档结论 | 可否进实现队列 | 说明 |
|------|----------|----------------|------|
| **F2** | **放行** | **F2a 待 F0 代码落地后排队** | 文档达「一次 Prompt 可执行」标准；F2b/c 切片 schema 占位可接受 |
| **F4** | **放行（R2.b）** | **可排队实现** | 时间线对齐 F0 `CohabitTimelineEvent`；E8 默认 deferred；见 [CHECKER_F4_R2b.md](./CHECKER_F4_R2b.md) |
| **F7** | **放行** | **待 F0 代码落地后排队** | 字段级完整；信物卡对 F1 有 documented fallback |

## 全局阻塞（已更新 2026-07-25）

1. ~~F0 骨架~~ → **F0-core 已落地**（`61d54ad`，`verify:align-f0` 16/16）。观感 R3.b 仍待。
2. F1+ 可开始依赖 F0 管道；实现时 API 名为 `cohabit-timeline` / `appendCohabitEvent`（非文档旧称 cocoon）。
3. F4 文档 **R2.b 已放行**（[CHECKER_F4_R2b.md](./CHECKER_F4_R2b.md)）。

### 可进实现队列（文档层面）

- **可排队**：F2a、F3、F4、F5、F7（F0-core 与 F1-core 已落地）。
- **文档待 / 审中**：F6（R2 审稿中）。

---

## 分阶段放行清单

### F2 · 侧写

```
阶段: F2
结论: 放行
质量门槛: U✓ E✓(E10 未写长列表策略，MVP 20 线程内可接受) P✓
§9 手测: 可执行
风险: F0 未落地时 timeline-bridge 后备与 assemble 注入需与 F0 最终路径二次合并；F2b 订单对齐依赖 F1 钱包 + F3 栖店字段约定
必改: （无阻塞项）建议：F0 详细化时采纳 F2 §5.7 事件 schema 为 I2  canonical；F2b 开写前补 C6/C7 字段级 schema
```

**模板符合度**

| 检查项 | 结果 |
|--------|------|
| §0–§10 齐全 | ✓ |
| 引用 _QUALITY_BAR + _PROMPT_TEMPLATE + LIVING_PHONE_PLAN | ✓ |
| §2 ID 与总计划 C0–C18 一致 | ✓ |
| §4 界面分区/动效/空态非空话 | ✓（TA 桌面硬门槛、四子 App 路径级描述） |
| §5 字段级（F2a 四 App + manifest + 投影） | ✓ |
| §6 新建/修改路径可落地 | ✓ |
| §9 = 9.0 + 路径手测 + 观感 + verify 断言 | ✓（非「手测通过」一句） |
| F2a/F2b/F2c 切片与执行口令 | ✓ |

**亮点**：内层「TA 的屏幕」独立状态栏/壁纸/网格/Dock 写进 §2 验收硬门槛与 §9.1 步骤 2，直接回应 _QUALITY_BAR U1/U4；`timeline-bridge.js` 后备降低 F0 并行风险。

---

### F4 · 剧章 / 情景剧 / 共创 / 游戏 / 联机

> **R2.b**：初审打回项已修回 → **放行**。详见 [CHECKER_F4_R2b.md](./CHECKER_F4_R2b.md)。

```
阶段: F4
结论: 放行（R2.b）
质量门槛: U✓ E✓ P✓
§9 手测: 可执行
风险: 五能力同波工期仍大；E8 local 为加分，勿阻塞
必改: （无）
```

**R2 初审必改（已关闭）**：时间线 → F0 `CohabitTimelineEvent`；§9.0「质量门槛 E*」措辞；E8 默认 deferred；文首链模板。

---

### F7 · 栖市 / 栖机扩展

```
阶段: F7
结论: 放行
质量门槛: U✓ E✓ P✓
§9 手测: 可执行
风险: 样例扩展信物卡 U10 依赖 F1；§5.4 已写最小 fallback；H6 文档 `LOCAL_CHAT_ASSISTANT.md` 尚不存在（本波新建，可接受）
必改: （无阻塞项）建议：F0 备份契约预留 extensions/gatePrefs/reports 模块 id；与 F2 一样在 F0 详细化时锁定 timeline.write 事件形状
```

**模板符合度**

| 检查项 | 结果 |
|--------|------|
| §0–§10 齐全 | ✓ |
| 引用 _QUALITY_BAR + _PROMPT_TEMPLATE + LIVING_PHONE_PLAN | ✓ |
| §2 H1–H6 与总计划一致 | ✓（H6 用语「本地聊天助手」符合 clean-room，优于总计划表「微信本地助手」） |
| §4 栖市三屏 / 权限 sheet / 门禁 / 举报 / H6 | ✓ |
| §5 manifest + 10 项权限表 + gate prefs + 举报 | ✓ |
| §6 Host API / registry / runtime 落点 | ✓ |
| §9 十步手测 + 反向 + verify 8 条断言 | ✓ |
| P3 云能力默认关 | ✓（§5.5 默认值 + §9.1 前置确认） |

**亮点**：权限枚举中英对照 + `PermissionDeniedError` 形状 + U7 拒绝路径写进 §4.2/§9.1 步骤 4，工程可测性强。

---

## 交叉一致性备忘（供 F0 详细化吸收）

| 主题 | F2 | F4 | F7 | 建议 |
|------|----|----|-----|------|
| 时间线事件 | §5.7 草案 | §5.5 **已对齐 F0** | timeline.write → `appId: phone-ext:*` | **canonical = F0 `CohabitTimelineEvent`**；F2 落地时跟进 |
| assemble 注入 | memory 后、daily 前 | 仅提及 appId | 扩展 LLM 带 sceneTag | F0 统一 `assemblePrompt` 块格式 |
| 备份 DATA_MODULES | sidewrite | story/cocreate/games | extensions/gatePrefs/reports | F0 §5 一次性列齐 |
| 信物消息 | — | — | §5.4 → F1 或 fallback | F1 与 F7 可并行约定 `token_card` 形状 |

---

## R2 结论摘要

| 动作 | 负责 |
|------|------|
| **F4 已放行**（R2.b）→ 可进实现队列 | — |
| **F3 / F5 已放行**（R2）→ 见 CHECKER_F3_R2 / CHECKER_F5_R2 | Checker |
| **并行详细化 F0**（已完成 core） | — |
| **F2 / F7 文档维持放行**，分别发「执行 F2a」「执行 F7」 | — |
| F4 修稿记录见 [CHECKER_F4_R2b.md](./CHECKER_F4_R2b.md) | Checker |

---

## 变更记录

| 日期 | 变更 |
|------|------|
| 2026-07-25 | R2 初稿：F2/F7 放行，F4 打回 |
| 2026-07-25 | **R2.b**：F4 修稿复审放行（canonical = F0 CohabitTimelineEvent） |
| 2026-07-25 | **R2**：F3/F5 修稿放行（ledger + cohabit；qijian 场景标签） |
