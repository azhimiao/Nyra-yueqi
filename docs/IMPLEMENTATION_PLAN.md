# 月栖 Companion · 分步实现路线

> 配合 [PRODUCT_ROADMAP.md](./PRODUCT_ROADMAP.md) 使用  
> 产品规则以路线图 **§0.2** 为准  
> **用法**：在对话里说「执行 Step N」，按本文件该步的改法落地并验收

---

## 执行总览

```
Step 00     基线确认（build + 规则对齐）
Step 01–12  日记闭环（§0.2）          → 目标 v0.5.0-alpha
Step 13–18  记忆/Prompt 基础诚实化     → 目标 v0.5.0
Step 19–28   主动消息引擎（§0.2+§0.3） → 目标 v0.6.0-alpha
Step 29–36   日历 + MCP 集成            → 目标 v0.6.0
Step 37–48   生活库 AI 感知（P5）       → 目标 v0.7.0
Step 49–54   多模态聊天（P6）           → 目标 v0.8.0
Step 55–60   云同步与交付（P7）         → 目标 v0.9.0–v1.0
```

**建议起点：Step 00**（基线）→ **Step 01**（日记字段）

---

## Step 00 · 基线确认

**目标**：改代码前确认环境与规则对齐

**做什么**

1. `npm run build` 通过
2. 产品规则见 [PRODUCT_ROADMAP.md §0.2](./PRODUCT_ROADMAP.md)
3. 占位页（世界/换装）本阶段不改

**验收**：构建绿色；§0.2 与 IMPLEMENTATION_PLAN 一致

---

## 进度追踪

| Step | 标题 | 状态 |
|------|------|------|
| 00 | 基线确认 | ✅ |
| 01 | 日记数据字段 | ✅ |
| 02 | 24h 消息上下文 | ✅ |
| 03 | 角色名读人物卡 | ✅ |
| 04 | 日记 CRUD 模块 | ✅ |
| 05 | 按钮与文案调整 | ✅ |
| 06 | 生成即入库 | ✅ |
| 07 | 同日覆盖确认 | ✅ |
| 08 | 定时设置 UI | ✅ |
| 09 | 定时调度器 | ✅ |
| 10 | 收藏仅 pin | ✅ |
| 11 | 备份含 diary 设置 | ✅ |
| 12 | 日记验收 | ✅ |
| 13 | 消息总数读 messages | ✅ |
| 14 | styleId 展示与检索 | ✅ |
| 15 | Prompt 持久化 | ✅ |
| 16 | Memory Budget | ✅ |
| 17 | Injection Order | ✅ |
| 18 | Checkpoint B | ✅ |
| 19 | lib/time.js | ✅ |
| 20 | 分段发送 | ✅ |
| 21 | 主动频率配置 | ✅ |
| 22 | 不活跃心跳 | ✅ |
| 23 | 日历事件引擎 | ✅ |
| 24 | 主动消息管道 | ✅ |
| 25 | ProactiveScheduler | ✅ |
| 26 | 三种联动模式 | ✅ |
| 27 | 主动消息上下文 | ✅ |
| 28 | Checkpoint C | ✅ |
| 29 | MCP registry | ✅ |
| 30 | MCP 双向同步 | ✅ |
| 31 | free-busy | ✅ |
| 32 | ICS 加强 | ✅ |
| 33 | 纪念日 | ✅ |
| 34 | Checkpoint D | ✅ |
| 35–43 | 生活库 AI | ✅ |
| 44–48 | 多模态/备份/同步 | ✅ |
| 49–50 | 占位标注 / v1 RC | ✅ |

---

## Step 01 · 日记数据字段

**目标**：每条日记有稳定、`styleId`、`diaryDay`（自然日 YYYY-MM-DD，用于「一天一篇」）

**依赖**：无

**改什么**

1. `src/storage/db.js` — `normalizeMemory` 增加可选字段：
   - `styleId: string`
   - `diaryDay: string`（仅 `source === "diary.memory"` 时使用）
2. `src/constants.js` — seed 日记补 `styleId` / `diaryDay`（可从 tags 推断）
3. 写入路径统一经 helper（Step 04 会建；本步先在 `ingestMemoryAndRender` 调用处预留）

**验收**

- DevTools → IndexedDB memories：seed 日记可见 `styleId`、`diaryDay`
- 旧数据无字段时不报错（默认 `styleId: "literary"`）

---

## Step 02 · 24h 消息上下文

**目标**：日记生成读 **过去 24 小时**消息，不是「今日 8 条」

**依赖**：Step 01（可选，不阻塞）

**改什么**

1. `src/diary/generate.js` — `buildDiaryContext`：
   ```js
   const since = Date.now() - 24 * 60 * 60 * 1000;
   const windowMessages = messages.filter(m => new Date(m.createdAt).getTime() >= since);
   ```
   - `excerpt`：取 window 内最多 20 条，格式 `{用户称呼}：` / `{角色名}：`
   - `messageCount` 改为 window 内条数
   - `date` 仍用当天日期作日记标题用
2. 记忆 hints：优先 window 内 ingest 的 chat.memory，仍保留少量历史 diary 摘要

**验收**

- 改系统时间或造 25h 前消息：生成日记 excerpt **不含** 25h 前内容
- 24h 内消息全部进入 excerpt（超 20 条则截断并注明）

---

## Step 03 · 角色名读人物卡

**目标**：日记 prompt / fallback **不写死「沈既白」**

**依赖**：无

**改什么**

1. `src/diary/styles.js`
   - `buildDiarySystemPrompt(style, { characterName, userName })`
   - fallback 故事风格里第三人称用 `characterName`
2. `src/diary/generate.js`
   - `buildDiaryContext` 增加 `characterName`、`userName`（来自 `collectProfileState`）
   - excerpt 里助手侧用 `characterName`
3. `generateTodayDiary(deps)` 传入 profile

**验收**

- 设定页改姓名为「测试角色」→ 生成日记 system prompt 与 excerpt 标签变为「测试角色」

---

## Step 04 · 日记 CRUD 模块

**目标**：集中「一天一篇」查询与写入，避免 `app.js` 散落逻辑

**依赖**：Step 01

**新建** `src/diary/records.js`

```js
// 建议导出
getDiaryForDay(diaryDay)        // 按 diaryDay 查唯一 diary.memory
listDiaries()                   // 档案列表，按时间倒序
saveDiary({ title, body, styleId, diaryDay, pinned?, id? })  // 新建或覆盖
toggleDiaryPin(id)              // 仅改 pinned
deleteDiary(id)
todayDiaryDay()                 // 本地 YYYY-MM-DD
```

- `saveDiary` 覆盖时保留原 `id`（同 diaryDay 更新）
- `role` 读 profile.name；`wing: Relationship`；`room: Diary`

**改什么**

- `app.js` 中 `ingestTodayDiary`、`diaryForm` submit 逐步迁到本模块（Step 06 一并接）

**验收**

- 单元或控制台：`saveDiary` 两次同 `diaryDay` → 一条记录被更新

---

## Step 05 · 按钮与文案调整

**目标**：UI 与 §0.2 语义一致

**依赖**：无（可与 Step 06 同 PR）

**改什么** — `index.html`

| 现文案 | 改为 |
|--------|------|
| `生成今日日记` | `立即生成`（或 `生成日记`） |
| `收藏今日` | `收藏到收藏馆`（仅 pin，见 Step 10） |
| 页头 `记录` | 保持 — 手写新日记 |

- 陪伴 · 记忆区增加说明小字：`定时生成可在下方设置`（Step 08 加控件）

**验收**

- 按钮文案与路线图一致；无「收藏今日 = 生成」误导

---

## Step 06 · 生成即入库

**目标**：点「立即生成」→ **直接写入档案**，不再只开弹窗

**依赖**：Step 02–04

**改什么**

1. `app.js` — `generateAndOpenTodayDiary` 重命名为 `generateDiaryNow`：
   - 调用 `generateTodayDiary` → `saveDiary`（`pinned: false`）
   - 刷新 `renderDiaryList` / `renderGallery` / `renderMemoryState`
   - **可选**：生成成功后 toast「已写入日记档案」；提供「编辑」跳转弹窗
2. 删除/废弃 `ingestTodayDiary` 里「生成+入库+置顶」逻辑（Step 10 接收藏）
3. 弹窗「重新生成」：只改表单内容；**保存**才写库（编辑已有 id）

**验收**

- 点立即生成 → 日记档案多一条，**收藏馆不变**（未 pin）
- 弹窗手动保存仍可用

---

## Step 07 · 同日覆盖确认

**目标**：当日已有日记时再点立即生成 → **提示 → 覆盖 / 取消**

**依赖**：Step 04、06

**改什么**

1. `src/ui/confirm.js`（新建轻量 confirm 模态，或 `window.confirm` 第一版）
2. `generateDiaryNow` 开头：
   ```js
   const existing = await getDiaryForDay(todayDiaryDay());
   if (existing && !await confirmOverwrite()) return;
   await saveDiary({ ...generated, id: existing?.id, diaryDay });
   ```
3. **定时生成**（Step 09）：默认同逻辑，自动覆盖或跳过 — **建议自动覆盖**（用户已设定时即表示要刷新）；在 Step 08 UI 加勾选「定时覆盖已有」默认开

**验收**

- 已有今日日记 → 点立即生成 → 对话框 → 取消则无变化
- 选覆盖 → 档案仍一条，内容更新

---

## Step 08 · 定时设置 UI

**目标**：用户配置 **每天几点** + **默认风格** + **是否启用**

**依赖**：Step 01

**改什么**

1. `src/settings/preferences.js`
   ```js
   DEFAULT_DIARY = {
     style: "literary",
     scheduleEnabled: false,
     scheduleTime: "23:00",      // HH:mm
     scheduleOverwrite: true,    // 定时是否覆盖同日已有
   };
   ```
2. `index.html` — 今日日记区块下增加：
   - `[data-diary-schedule-enabled]` checkbox
   - `[data-diary-schedule-time]` time input
   - 风格仍用现有 `data-diary-style-grid` 选中项作为默认定时风格
3. `app.js` — 变更时 `saveDiarySettings` + 调用 `rescheduleDiary()`（Step 09）

**验收**

- 刷新页面后设置保留
- 关闭定时 → Step 09 不触发

---

## Step 09 · 定时调度器

**目标**：到点自动执行过去 24h 摘要 + 入库

**依赖**：Step 02、04、07、08

**新建** `src/diary/schedule.js`

```js
export function startDiarySchedule({ getSettings, runGenerate }) {
  // 计算下一个 scheduleTime 的 delay
  // setTimeout → runGenerate({ source: "schedule" })
  // 完成后再次 schedule（每日）
}
export function rescheduleDiary() { clear + start }
```

**改什么**

1. `runGenerate`：与立即生成共用内核，区别 `source: "schedule"` 可写 tags
2. `bootstrapApp()` 末尾 `startDiarySchedule(...)`
3. App 从后台恢复时 `rescheduleDiary`（可接现有 `native-bridge` resume）

**验收**

- 设 1 分钟后定时 + 启用 → 等待 → 档案自动多一条
- 免打扰：**日记定时不受 DND 限制**（产品未要求；若你要加再说）

---

## Step 10 · 收藏仅 pin

**目标**：「收藏到收藏馆」= toggle `pinned`，不生成、不写新记录

**依赖**：Step 04、05、06

**改什么**

1. 移除 `data-diary-ingest` 上的生成逻辑
2. 新逻辑 `favoriteTodayDiary`：
   - `getDiaryForDay(today)` 无则提示「请先生成今日日记」
   - 有则 `toggleDiaryPin(id, true)` 或 toggle
3. 日记档案行内「收藏」按钮：仅 `pinned` toggle
4. `renderGallery`：只显示 `diary.memory && pinned`

**验收**

- 收藏不增加档案条数
- 取消收藏 → 档案仍在，收藏馆移除

---

## Step 11 · 备份含 diary 设置

**目标**：导出/导入/云同步包含 `settings.diary`（含 schedule）

**依赖**：Step 08

**改什么**

- `src/memory/backup.js` — payload 增加 `settings: { diary, rag, ... }` 或已有 settings 键
- `restoreImportPayload` 写回并 `rescheduleDiary()`

**验收**

- 导出 JSON → 改 schedule → 导入 → 定时恢复

---

## Step 12 · 日记验收（Checkpoint A）

**手工清单**

- [x] 24h 窗口 excerpt 正确
- [x] 立即生成入库，收藏馆不自动增加
- [x] 收藏 / 取消收藏行为正确
- [x] 同日立即生成：提示 + 覆盖/取消
- [x] 定时到点自动生成
- [x] 角色名来自人物卡
- [x] 备份恢复 schedule

**通过后**：README 标记 v0.5.0-alpha 日记完成

**自动化**：`npm run verify:diary-checkpoint`

---

## Step 13 · 消息总数读 messages 表

**依赖**：Checkpoint A 可选并行

**改什么**：`renderMemoryState` — `messageTotal` 改 `getMessagesBySession` count

**验收**：聊天后消息总数增加，与 memories 条数脱钩

---

## Step 14 · styleId 展示与检索

**依赖**：Step 01

**改什么**：`diaryStyleBadge` 读 `record.styleId`；RAG dev 搜索可筛 diary + style

---

## Step 15 · Prompt System/Developer 持久化

**改什么**

1. `profile.promptSystem` / `promptDeveloper` 字段
2. `index.html` textarea 加 `data-prompt-system` 等
3. `assemblePrompt` 读取；`data-reset-profile` 恢复默认

**验收**：改 System 文案 → 聊天 prompt 变化（dev 面板可见）

---

## Step 16 · Memory Budget 三档（简版）

**新建** `src/memory/tiers.js`

- 先实现 **token 估算 + topK 裁剪**，不强行 L0–L3 命名
- 设定页 select 绑定 `settings.prompt.budget`: `900 | 1800 | 3200`

**验收**：选「轻量」→ `assemblePrompt` 记忆段变短

---

## Step 17 · Injection Order 可配置

**改什么**：`assemblePrompt` 段顺序按 `settings.prompt.order` 数组重排

**验收**：调换顺序后 preview 文本顺序变化

---

## Step 18 · Checkpoint B（v0.5.0）

- [x] Step 13–17 验收
- [x] `npm run build` 通过

**自动化**：`npm run verify:checkpoints`

---

## Step 19 · 时间工具 lib/time.js

**新建** `src/lib/time.js`：`nextOccurrence(hhmm)`、`isWithinDnd`、`minutesUntil`

**供**：Step 09 复用、Step 20+ 主动消息

---

## Step 20 · 分段发送 chat/segmented-send.js

**新建** `src/chat/segmented-send.js`

```js
export async function deliverSegmentedText(text, { addMessage, delayMs = 1200 }) {
  const parts = splitBySentence(text, { maxParts: 4 });
  for (const part of parts) {
    await addMessage(part, "ai", { persist: true });
    await sleep(delayMs);
  }
}
```

**验收**：主动消息与（可选）长聊天回复可分段

---

## Step 21 · 主动频率滑条 → 配置

**改什么**

1. `collectProfileState` 已有滑条「主动频率」→ 存 `profile.proactiveFrequency`（0–100）
2. `src/proactive/config.js`：
   ```js
   export function heartbeatIntervalMs(freq) {
     // freq 0 → 4h, freq 100 → 30min 线性或分段
   }
   ```

**验收**：滑条改变 → 心跳间隔变化（日志可见）

---

## Step 22 · 不活跃心跳

**新建** `src/proactive/heartbeat.js`

- 记录 `lastUserMessageAt`（用户发消息时更新）
- 定时检查：静默 > threshold → 触发 pipeline（Step 24）
- threshold / 检查周期来自 Step 21

**验收**：5 分钟无聊天（测试可调短）→ 收到主动消息（需通知授权）

---

## Step 23 · 日历事件引擎（带 date）

**新建** `src/calendar/engine.js`

- 事件结构强制 `date: YYYY-MM-DD`（新建默认选中 day）
- 迁移旧 event：无 date 的挂到「每月同日」或导入时补全
- 替换 `integrations/context.js` 里 `eventsForDate` 歧义逻辑

**验收**：选不同月份同一天，事件不串

---

## Step 24 · 主动消息统一管道

**新建** `src/proactive/pipeline.js`

```js
export async function runProactiveAction(event, { mode, status, grants }) {
  if (isWithinDnd()) return;
  const text = await generateProactiveBody(event, status); // 从 app.js 迁入
  if (mode === "可主动消息") {
    await deliverSegmentedText(text, { addMessage });
    await ingestMemory(...);
    await showCompanionNotification(text);
  } else if (mode === "仅提醒") {
    await showCompanionNotification(text);
  }
  // 不联动：不进入此函数
}
```

**改什么**：删除 `app.js` 内联 `scheduleProactiveMessages` 大段逻辑

---

## Step 25 · ProactiveScheduler 统一调度

**新建** `src/proactive/scheduler.js`

```
startProactiveScheduler({
  sources: [calendarSource, heartbeatSource],
  pipeline: runProactiveAction,
})
```

- **calendarSource**：按 event.date + time 触发（非纯 HH:mm 重复）
- **heartbeatSource**：Step 22
- 用户发消息 → `scheduler.resetHeartbeat()`

**验收**：日历「可主动消息」仅在该 **date** 触发；心跳独立工作

---

## Step 26 · 三种联动模式 UI 与行为

**依赖**：Step 23–25

**改什么**

- 确认 event `mode` 三值与 pipeline 分支一致
- 日历种子数据补 `date`

**验收**：仅提醒 → 只有通知；不联动 → 无通知无聊天

---

## Step 27 · 主动消息上下文增强

**改什么**：`generateProactiveBody` prompt 增加：

- 过去 24h 聊天摘要（reuse diary context builder）
- 今日 diary 标题一行
- RAG top2 记忆（可选）

**验收**：主动消息内容明显引用最近聊过的话题

---

## Step 28 · Checkpoint C（v0.6.0-alpha 主动消息）

- [x] 日历 + 心跳同时开不冲突
- [x] 分段发送 2–4 条
- [x] 主动频率滑条生效
- [x] DND 内静默

**自动化**：`npm run verify:checkpoints`

---

## Step 29 · integrations/registry.js

**新建** MCP grant 注册表；替换 `collectExternalGrants` 散落逻辑

---

## Step 30 · MCP 卡片与 grants 双向同步

**改什么**：`data-sync-mcp` 不再无脑全开；`flags.external` 关闭时清空注入

---

## Step 31 · calendar/free-busy.js

输出今日空闲块 → `buildExternalContext`

---

## Step 32 · calendar/ics.js 加强

RRULE / DTEND 基础解析

---

## Step 33 · 纪念日「在一起」

设定页日期 → 周年主动消息（接 pipeline）

---

## Step 34 · Checkpoint D（v0.6.0）

- [x] MCP 五卡片与 prompt 一致
- [x] ICS 导入后 date 正确
- [x] 空闲时间出现在 dev prompt

**自动化**：`npm run verify:checkpoints`

---

## Step 43 · Checkpoint E（v0.7.0）

- [x] 书籍 txt/epub 导入与记忆摘要
- [x] 相册导入触发 summary 队列
- [x] 音频 ID3 标题解析

**自动化**：`npm run verify:v1`

---

## Step 50 · Checkpoint G（v1.0.0 RC）

- [x] PRODUCT_ROADMAP §7 核心项已落地或优雅降级
- [x] `npm run verify` 全通过
- [x] 世界 / 衣橱标注建设中

**自动化**：`npm run verify`

---

## Step 35 · ai/perception.js 骨架

队列 + 重试；stub 方法 `summarizeImage`、`chunkBook`

---

## Step 36 · 书籍 fileId + txt/md 导入

**新建** `src/library/books.js`；epub 留 Step 37

---

## Step 37 · epub 导入（epub.js）

---

## Step 38 · 书籍章节摘要 → memories

`source: book.chunk`

---

## Step 39 · 相册 summary 字段 + 导入后队列

---

## Step 40 · vision 调用 summarizeImage

---

## Step 41 · MCP 相册上下文带 summary

---

## Step 42 · 音频 ID3 元数据

---

## Step 43 · Checkpoint E（v0.7.0）

---

## Step 44 · 聊天附件图片送 vision 模型

---

## Step 45 · 附件文本全文注入

---

## Step 46 · Checkpoint F（v0.8.0）

---

## Step 47 · 备份含 avatar + media 清单

---

## Step 48 · 云同步冲突策略 UI

---

## Step 49 · 占位页标注「建设中」

世界 + 衣橱加 pill，避免用户误以为已可用

---

## Step 50 · Checkpoint G（v1.0.0 RC）

跑 PRODUCT_ROADMAP §7 全清单

---

## 文件新建一览

| 路径 | 最早 Step |
|------|-----------|
| `src/diary/records.js` | 04 |
| `src/diary/schedule.js` | 09 |
| `src/ui/confirm.js` | 07 |
| `src/lib/time.js` | 19 |
| `src/chat/segmented-send.js` | 20 |
| `src/proactive/config.js` | 21 |
| `src/proactive/heartbeat.js` | 22 |
| `src/proactive/pipeline.js` | 24 |
| `src/proactive/scheduler.js` | 25 |
| `src/calendar/engine.js` | 23 |
| `src/calendar/free-busy.js` | 31 |
| `src/calendar/ics.js` | 32 |
| `src/integrations/registry.js` | 29 |
| `src/memory/tiers.js` | 16 |
| `src/library/books.js` | 36 |
| `src/ai/perception.js` | 35 |

---

## 与 app.js 的拆分原则

`app.js` 目前 ~2200 行。每步尽量：

1. 逻辑迁到新模块
2. `app.js` 只保留 DOM 查询 + 事件绑定 + 调用模块
3. 单步 PR 控制在 5–15 个文件内

---

## 建议执行顺序（给你拍板用）

| 批次 | Steps | 说明 |
|------|-------|------|
| **第一批** | 01 → 12 | 日记全做完，最快可见价值 |
| **第二批** | 19 → 28 | 主动消息（可与 13–18 交错） |
| **第三批** | 13 → 18 | Prompt 诚实化 |
| **第四批** | 29 → 34 | 日历 MCP |
| **第五批** | 35 → 43 | 生活库 |
| **第六批** | 44–50 | 多模态 + 交付 |

---

*说「执行 Step 01」即从 Step 01 开始改代码并验收。*
