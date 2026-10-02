# CP-17 完成报告：桌宠状态统一 — 与 Companion 一致

> 2026-07-30 · **PASSED**（Node）

## 闭环

| 能力 | 实现 |
|------|------|
| **单一 presence 模型** | `src/companion/pet-presence-bridge.js` 从 `life-state.currentMood` 推导 emotion / idle pose / asleep / statusLabel；无独立 overlay pet mood store |
| **实时接线** | life tick → `emitCompanionLifeChanged` → desktop / overlay / runtime `syncLifePresence` → `pushState` 无需 reload |
| **身份** | `resolvePetSpritePack`：有角色 look/action 媒体时用 `legacy`，优先 Pop 角色包而非 generic xingli/boy |
| **短聊** | overlay `sendTurn` → Electron/Android → `submitExternalTurn` → Pop `form.requestSubmit()`；**不**走 OpenClaw 每消息循环 |

## 映射（life-state → 桌宠）

| `currentMood` | emotion | idle action | 状态文案 |
|---------------|---------|-------------|----------|
| calm | calm | idle_default | 在你身边 |
| warm | warm | sit_idle | 想陪你聊聊 |
| playful | happy | greet | 心情不错 |
| pensive | neutral | thinking | 在想事情 |
| tired | neutral | sleep_pose (+ asleep) | 有点累了 |

活跃聊天 playback（talking / thinking / listening 等）优先于 idle mood 映射。

## 新增 / 修改

* `src/companion/pet-presence-bridge.js` — 桥接模块
* `src/companion/life-wake.js` — tick 后 emit `yueqi:companion-life`
* `src/runtime/companion-runtime.js` — `syncLifePresence` + 监听 life event
* `src/ui/desktop-presence-wire.js` / `overlay-presence-wire.js` — buildState 合并 life presence
* `src/ui/companion-float.js` — `presenceLabel`；tired/asleep 时暂停随机 idle 动作
* `src/overlay/overlay-app.js` — status 显示 life presenceLabel
* `src/app.js` — `bindPetPresenceBridge`

## 验证

```bash
npm run verify:pet-cp17
npm run verify:pet-boundary
npm run verify:companion-presence   # 可选回归
```

## 刻意不做（CP-18+）

* OpenClaw 桌宠每 tap 回复
* 第二套 pet-only LLM loop
* NAR / Android BYOK 阻塞项

## 数据流

```
life-state.currentMood
  → derivePetPresenceFromLifeState(characterId, runtimeSnapshot)
  → mergePetPresenceIntoState (idle) / runtime active playback wins (chat)
  → desktop-presence-wire / overlay / companion-float / overlay-app
```
