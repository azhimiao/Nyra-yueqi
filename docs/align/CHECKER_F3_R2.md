# Checker · F3 详细化评审（R2）

> 日期：2026-07-25  
> 对象：`docs/align/F3.md`（审稿中对齐 F0/F1 已落地事实后放行）  
> 对照：[\_QUALITY_BAR.md](./_QUALITY_BAR.md) · [\_PROMPT_TEMPLATE.md](./_PROMPT_TEMPLATE.md) · [CHECKER_R2.md](./CHECKER_R2.md)  
> 已落地事实：`appendCohabitEvent` / `CohabitTimelineEvent`（`src/memory/cohabit-timeline.js`）；钱包 `src/wallet/ledger.js`

```
阶段: F3
结论: 放行（R2 · 修稿后）
质量门槛: U✓ E✓ P✓
§9 手测: 可执行
风险: 四 App 同波工期大，可按 D3/D4→D5→D6 切片；F2b C6 原 CNY 草稿已被本文 nyra_coin 取代，落地 C6 时跟 F3
必改: （无阻塞项；初审必改已关）
```

## 初审必改（已关闭）

| # | 问题 | 修回 |
|---|------|------|
| 1 | §5.7 / §5.1 用 `living-timeline` + `sourceApp`/`sceneTag` 草案 | ✓ 钉死 F0 `appendCohabitEvent` + `{ id,at,appId,kind,summary,characterId,meta }` |
| 2 | §5.3 发明 `debitWallet` / `kind:"shop"` / `currency:"CNY"` / 新建 `wallet/store.js` | ✓ 复用 `ledger.js`：`applyDebit`/`debit`，`reason:"shop.purchase"`，`nyra_coin` |
| 3 | UI/手测仍写 ¥ / `kind: shop` / 无 wallet 则 balance 0 | ✓ 栖币文案；初始 200；ledger 断言对齐源码 |

## 模板符合度

| 检查项 | 结果 |
|--------|------|
| §0–§10 齐全 + 文首链模板/质量门槛 | ✓ |
| §2 D3–D6 与总计划一致；全局锁死 D2/D7/D8/E2–E4/G4 | ✓ |
| §4 四 App 界面分区 / 动效 / 空态非空话 | ✓ |
| §5 字段级（共听态 / 订单 / C6 / 日历 / 时间线） | ✓（修后对齐 F0/F1） |
| §6 存储/引擎/UI 分文件；复用 ledger + cohabit-timeline | ✓ |
| §9 = 9.0 + 路径手测 + 观感 + verify 断言列表 | ✓ |

## 放行后动作

- 状态板：F3 Checker → **R2 放行**；可在 F2a 后进实现队列（或按 D3–D6 切片穿插）
- 实现口令：「按 F3 实现 D3–D6」；**勿**另起钱包或时间线协议
