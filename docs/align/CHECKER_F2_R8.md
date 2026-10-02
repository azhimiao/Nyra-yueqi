# Checker · F2a · R8 自检

> Impl-F2a 落地后自检（对照 [F2.md](./F2.md) §9 + [_QUALITY_BAR.md](./_QUALITY_BAR.md)）  
> 日期：2026-07-25

```
阶段: F2a
结论: 放行（R8 · 主 Agent 复核 verify 29/29 + 落点清单）
质量门槛: U1–U12 主路径已覆盖；E1–E9 过；E10 列表量级本波 fixture 远低于阈值；P1–P2 投影/角色隔离已接线；P3 本波不适用（无后台轰炸）
§9 手测: 可执行（见下方路径）；自动 verify 绿
风险: 无 LLM key 时「生成痕迹」走 fixture；真机观感需 R8 人工扫一眼 375 宽
必改: （无阻塞项）F2b/F2c 明确未做
```

## 9.0 通用质量门槛

- [x] 已阅读 _QUALITY_BAR U1–U12 / E1–E10 / P1–P3
- [x] 选角台、TA 的屏幕、C5/C4/C8/C2 列表+详情：独立桌面（状态栏/壁纸/网格/Dock）+ 子 App 闭环
- [x] E1 存储 / generate / UI 分层于 `src/sidewrite/**`
- [x] E3 校验 + degrade；坏 JSON 不 throw
- [x] E4 `appId/sourceApp: sidewrite`；`livingTimelineBlock` 仅有事件时注入
- [x] E5 `npm run verify:align-f2`（29/29）
- [x] E6 无 key → fixture / 空态可演示
- [x] E9 先出壳再异步加载 payload
- [x] 不适用：U10 红包信物（F1）；G4

## 9.1 F2a 功能路径（实现覆盖）

1. 栖机 Home → 侧写 → 选角台（头像/名）
2. 选角 → TA 的屏幕（`ta-status-bar` + 壁纸 + 4 图标 + Dock）
3. C5/C4/C8/C2：列表 → 详情 → 回 TA 桌面（非外层 Home）
4. 空态 / 生成中 / 失败文案 + 生成痕迹（无 key 用 fixture）
5. 投影写入同栖时间线；assemble 注入「同栖时间线（侧写）」

## 9.3 自动

- [x] `npm run verify:align-f2` → **29/29 passed**

## 明确未做（F2b / F2c）

- C1/C3/C6/C7/C9/C14/C15（F2b）
- C10–C13/C16 与桌面池抽选（F2c）
- D2/D7/D8、E2/E3/E4、G4（全局锁死）
