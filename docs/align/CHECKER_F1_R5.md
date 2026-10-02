# Checker · F1 工程验收（R5 自检）

> 日期：2026-07-25  
> 对象：F1 最小可验切片（B7 信物 + I3 钱包 + B4 动态基础）

```
阶段: F1-core
结论: 放行（管道）| 完整 B4–B13 待 R6 手测
质量门槛: U10/E3/E5 过；U5–U9 部分路径未覆盖
§9 手测: 可执行（见 F1.md 路径 D + A 基础）
风险: 主聊天 panels/chat.js 未接信物卡；羁绊 B10 未落地；B6/B8/B9/B11/B13 未做
必改（下轮可选）:
1. 主 App 聊天与 Pop 共用 message-render 路径
2. 羁绊 store + Pop「我」进度条数据绑定
3. §9 路径 D 全量手测记录
```

## 已交付

| 项 | 路径 | 状态 |
|----|------|------|
| 钱包 ledger | `src/wallet/ledger.js` | ✓ 初始 200、append-only、applyTokenSettlement |
| 信物解析 | `src/chat/token-message.js` | ✓ `[信物:…]` + `[红包\|8.88\|…]` + metadata |
| Pop 卡片渲染 | `src/phone-shell/phone-shell.js` | ✓ 非裸文本 |
| CSS | `src/ui/phone-shell.css` | ✓ coral/teal mini-token-* |
| 备份 wallet | `backup.js` + `data-modules.js` | ✓ |
| 动态空态/多图 | `moments/store.js` + renderMoments | ✓ 基础 |
| verify | `scripts/verify-align-f1.mjs` | ✓ |

`npm run verify:align-f1`：**24/24 PASS**

## 质量对照

- **U10**：红包/转账/收款为卡片 DOM，非 `[transfer]50`
- **E3**：非法金额 validate → text 降级；parse 失败不抛错
- **E5**：verify 覆盖 parse / ledger / idempotent / wiring / keys
- **P1**：领取信物写 `appendCohabitEvent(appId:pop)`

## 本切片明确未做

B5 语音完整链路、B6 通话 UI、B8 贴纸、B9 满屏特效、B10 羁绊、B11 作息、B13 栖息唤醒、主聊天信物卡。
