# Checker · F6 详细化评审（R2 → R2.b）

> 评审轮次：**R2**（初审打回）→ **R2.b**（修稿放行）  
> 评审日：2026-07-25  
> 对照：[_QUALITY_BAR.md](./_QUALITY_BAR.md) · [_PROMPT_TEMPLATE.md](./_PROMPT_TEMPLATE.md) · [CHECKER_R2.md](./CHECKER_R2.md) · F0 `appendCohabitEvent` / `CohabitTimelineEvent`  
> 对象：[F6.md](./F6.md)（状态：已详细化）

---

## R2.b 放行结论（现行）

```
阶段: F6
结论: 放行
质量门槛: U✓ E✓ P✓（P1 明确 N/A；可选投影钉死 F0 canonical）
§9 手测: 可执行
风险: 生图 BYOK 依赖本地代理；Three/glb 资产许可与体积需落地时自检；Pop 语音与 App 版行为对齐回归面
必改: （无）
```

**范围核对：** 仅 G1 / G2 / G3 / G5；**无 G4**（§0 / §2 / §3 / §9.0 多重锁死）。  
**E6：** §0 硬约束 + 绘境空态 / Pop 钮 hidden|disabled / 工坊零 Key 可进 / §9.1 环境 A 路径，写清。  
**竞品品牌名：** 用户可见文案无竞品名；`openai-compatible` / `dall-e-3` 仅为 BYOK 协议与默认 model id，可接受。

---

## R2 初审必改（已关闭）

| # | 必改 | 修回 |
|---|------|------|
| 1 | §5.8「若写入同栖时间线」未钉 F0 API，易漂到 cocoon / F2 `LivingTimelineEvent` | ✓ 重写 §5.8：默认不强制写线；可选投影必须 `appendCohabitEvent` → `CohabitTimelineEvent`；显式禁止旧称与 F2 草案；§6 增可选消费行 |
| 2 | §9.0 P1「可选」表述含糊，未写清 N/A 条件 | ✓ **P1 = N/A**；若做可选投影指向 §5.8 |
| 3 | §4.3「回归不回归」笔误，实现口令歧义 | ✓ 改为「回归验证、不重写」 |

---

## 模板符合度

| 检查项 | 结果 |
|--------|------|
| §0–§10 齐全 | ✓ |
| 引用 _QUALITY_BAR + _PROMPT_TEMPLATE + LIVING_PHONE_PLAN | ✓ |
| §2 ID = G1/G2/G3/G5，无 G4 | ✓ |
| §4 界面分区 / 空错态 / 无 Key 路径非空话 | ✓ |
| §5 字段级（settings / job / media / prefs / 代理） | ✓ |
| §5.8 时间线 = F0 canonical（非 cocoon；非 LivingTimelineEvent） | ✓（R2.b） |
| §6 新建/修改路径可落地；E1 拆分 | ✓ |
| §9 = 9.0 + 路径手测（环境 A/B）+ 观感 + verify 断言 | ✓（非「手测通过」一句） |
| E6 无 Key 降级写清 | ✓ |
| 无竞品品牌名（UI/验收） | ✓ |

**亮点：** 绘境「生成→结果→存相册→AI 创作分组」闭环到 `media`+`library`；场景工坊 E9 出壳 + poster 降级；Pop TTS/STT 与接口页配置同波对齐。

---

## 放行后动作

- 状态板：F6 Checker → **R2.b 放行**；可进实现队列（发「执行 F6」）
- 实现时以 §5.8 为准：不强制写同栖时间线；若投影只用 `src/memory/cohabit-timeline.js`
