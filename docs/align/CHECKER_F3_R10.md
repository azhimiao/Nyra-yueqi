# Checker · F3 · R10 自检

> Impl-F3 落地后自检（对照 [F3.md](./F3.md) §9 + [_QUALITY_BAR.md](./_QUALITY_BAR.md)）  
> 日期：2026-07-25

```
阶段: F3
结论: 放行（R10 · 主 Agent 复核 verify 26/26 + F0–F2 未回归）
质量门槛: U✓ E✓ P✓（主路径）；观感签字需人工扫 375 宽
§9 手测: 可执行（见下方）；自动 verify 绿
风险: seed 曲目无 mediaId 时播放钮 disabled（符合 §9 反向）；日历到点需系统时间/dev hook
必改: （无阻塞项）
```

## 9.0 通用质量门槛

- [x] 已阅读 _QUALITY_BAR U1–U12 / E1–E10 / P1–P3
- [x] 一起听 / 一起看（含阅读器）/ 日历 / 栖店（列表+详情）：栖机 App 闭环
- [x] 播放 / 阅读进度 / 下单有 playing·paused·loading / disabled 态（U6）
- [x] E1 存储（ledger/orders/library）/ 引擎 / UI（phone-listen|reader|shop）三分
- [x] E2 键：`coListenStateKey` / `shopOrdersKey` 入 `constants.js`；`shopOrders` 入 data-modules
- [x] E5 `npm run verify:align-f3`（26/26）
- [x] E6 无 key / 无 media：元数据可展，播放 disabled，不 throw
- [x] E4 `appId` listen/read/shop/calendar 经 `appendCohabitEvent`；无 G4
- [x] P1 共听/共读/下单可写同栖时间线；P3 日历经 `rescheduleProactiveScheduler` + 既有 DND/feature
- [x] **不适用：** 侧写 C6 UI（F2）；G4 在线音乐；D2/D7/D8

## 9.1 功能路径（实现覆盖）

1. **D3** Home → 一起听 → 进度条 / 播放暂停 / 共听 Switch / 曲目切歌 / `yueqi.coListenState.v1` 持久化 / recentPlays / co-listen-sync
2. **D4** Home → 一起看 → 书架进度标签 → 阅读器滚动 → `scrollRatio` + coReadAnchor → 继续共读注入 Pop 草稿
3. **D5** 日历模板 chip（提醒/同步听歌/共读）→ 保存/删除后 `rescheduleProactiveScheduler`
4. **D6** 栖店商品卡 → 确认 sheet（余额不足 disabled）→ `placeOrder` → ledger `shop.purchase` → 订单列表/详情（`orderId` monospace）→ `shopOrderToSidewriteC6Row`

## 9.3 自动

- [x] `npm run verify:align-f3` → **26/26 passed**
- [x] 未破坏 `verify:align-f0` 16/16 · `f1` 24/24 · `f2` 29/29

## 明确未做

- D2 便签墙 / D7 黑市 / D8 住所 / E2–E4 / **G4 在线音乐 API**
- F2 侧写 C6 UI（仅提供 C6 投影纯函数与订单字段对齐）
- 歌词 API、OAuth、流媒体搜索主路径
