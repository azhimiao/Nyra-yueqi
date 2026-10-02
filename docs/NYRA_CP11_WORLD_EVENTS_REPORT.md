# CP-11 完成报告：栖机应用事件总线 + 注册表

> 2026-07-30 · **PASSED**（Node）

## 新增

* **事件总线** `src/world/app-events.js` — `emitAppEvent` / `subscribeAppEvent` / `listRecentAppEvents`；localStorage 环形缓冲（`yueqi.world.app-events.v1`，64 条）；密钥与路径 redaction
* **Companion 过滤** `selectEventsForCompanion` — 仅 message / diary / feed like / calendar / scenario 等有意义事件，丢弃 UI 噪声（如 `feed.post.viewed`、`gallery.photo.created`）
* **应用注册表** `src/phone-shell/app-registry.js` — 每个 home app：`id`、`label`、`hasUi`、`hasStore`、`hasEvents`、`status: live | minimal | closed`

## 事件类型

| 类型 | 来源 |
|------|------|
| `pop.message.sent` | Pop 发送成功 |
| `pop.message.read` | 进入会话 / 助手回复可见 |
| `feed.post.created` | 朋友圈发布 |
| `feed.post.viewed` | 打开朋友圈（独立 App 或 Pop Tab） |
| `feed.post.liked` | 点赞 |
| `diary.created` | `saveDiary` 新建 |
| `diary.viewed` | 打开日记 App |
| `gallery.photo.created` | `addPhotoToGroup` |
| `calendar.event.reached` | 主动调度器日历触发 |
| `scenario.event.completed` | 情景剧谢幕写入记忆 |
| `game.session.completed` | 游戏大厅本局结束 |
| `assist.task.completed` | 助手 Agent 批准提交 |
| `explore.task.completed` | 探索世界书合并批准 |

## CP-10 接线

* `src/companion/life-wake.js` — 订阅过滤后 app 事件 → `wakeCompanionLife`（如 `feed.post.liked` → `like_feed`）
* 不将每个 UI click 送入模型；Companion 仅消费 `selectEventsForCompanion` 子集

## 验证

`npm run verify:world-cp11` + `npm run verify:companion-cp10`
