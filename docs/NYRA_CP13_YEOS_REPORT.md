# CP-13 完成报告：YEOS 最小闭环

> 2026-07-30 · **PASSED**（Node） · `2736f97`

## 闭环

| 阶段 | 实现 |
|------|------|
| **安装** | `installPackage` / `installPackageBytes` → `registry-games.js`（`yueqi.yeos.games.v1`） |
| **存档** | NyraGame `saveGame` / `loadGame` → `saves.js`（`yueqi.yeos.saves.v1`），非 iframe localStorage |
| **局终事件** | `recordGameEvent` → 同栖时间线 + **`game.session.completed`**（CP-11 总线） |
| **大厅** | `lobby-ui.js` 展示 Pop / 已装 YEOS / 内置练手；`data-games-yeos` 真开壳 |

## 接线要点

* **`src/yeos/bridge-game.js`** — `recordGameEvent` 在写入 cohabit 后 `emitAppEvent("game.session.completed", { appId, pkgId, summary, characterIds, score? })`
* **`src/games/lobby-ui.js`** — 已有 `listInstalledGames` + `onOpenYeosGame`；内置小品经 `onSessionCompleted` 发事件
* **样例包** — `sdk/game-package/sample-first-scene.yueqi-game.zip`（模板同源）

## 验证

```bash
npm run verify:yeos-cp13
npm run verify:yeos-manifest
npm run verify:world-cp11
npm run verify:companion-cp12
```

## 刻意不做（CP-14+）

* Skill 平台与 YEOS 游戏包混用
* 云商店 / 签名 / 联机房间
