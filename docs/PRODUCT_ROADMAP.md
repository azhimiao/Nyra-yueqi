# 月栖 Companion · 产品路线图

> 版本：**v1.0.0 RC**（2026-07-10）  
> 更新：2026-07-10  
> 原则：**本地优先、授权可控、可备份可迁移**。路线图只排「产品已定义、要做实」的能力；**占位页不在近期排期**，等产品确认后再写进计划。

本文档汇总待落实功能与分阶段计划。与 [README](../README.md) 的 P0–P2 互补。

---

## 0. 占位功能（暂不排期）

以下页面**仅为 UI 占位**，当前没有真实业务逻辑，**不应出现在 v1.0 核心里程碑里**。产品定义清楚后再单独立项。

| 功能 | 现状 | 说明 |
|------|------|------|
| **世界** | Mock 帖子 + 静态「世界观察」文案 | 无平台接入、无真实 AI 浏览；[WORLD_PLATFORM_API](./WORLD_PLATFORM_API.md) 仅为接口草案 |
| **人物 · 衣橱 / 换装** | 可上传立绘、切换预设套装图 | 无 Live2D、无 LLM 自动换装、锁定开关未接入聊天；[AVATAR_ACTION_VIDEO_PLAN](./AVATAR_ACTION_VIDEO_PLAN.md) 为远期设想 |

---

## 0.2 产品已确认（2026-07-10，§10 已闭环）

> 以下为用户确认的规则，后续实现以此为准。代码现状若不一致，应改代码而非改规则。

### 日记

| 项 | 规则 |
|----|------|
| **视角** | **AI 第一人称**写日记 |
| **人物** | 「沈既白」仅为占位名；角色来自设定页人物卡，**不要写死唯一角色** |
| **频率** | **一天一篇** |
| **内容来源** | 汇总 **过去 24 小时**的聊天消息（滚动窗口，非自然日 0 点截断） |
| **定时** | 用户配置 **每天几点生成** + **默认记忆风格**；到点 **自动执行**，无需再点「生成」 |
| **手动** | 仍可「立即生成」/「记录」补写；若 **当日已有日记**，先 **提示已有**，由用户选择 **覆盖** 或 **取消**（不静默覆盖） |
| **生成** | **生成即入库** → 进入 **日记档案**（`diary.memory`） |
| **编辑** | 入库后用户可修改 |
| **收藏** | **仅 pin 到「收藏馆」**展示；**不写新记录**。取消收藏 = `pinned: false`，**不删档案** |
| **列表关系** | **日记档案** = 全部日记；**收藏馆** = `pinned === true` 的子集 |

### 主动消息

| 项 | 规则 |
|----|------|
| **可主动消息** | 系统通知 + 聊天气泡 + 写入记忆 |
| **分段发送** | 长内容拆成多条气泡，间隔发出 |
| **主动频率滑条** | 影响心跳间隔 / 触发概率 / 打扰程度 |
| **触发策略** | **日历事件 + 不活跃心跳** 一起做（§0.3）；不单靠「每天固定 HH:mm」 |
| **仅提醒** | 仅系统通知，不进聊天、不入记忆 |
| **不联动** | 仅在日历展示，不触发 |

### 占位（不做进 v1.0 核心）

- **世界**、**换装 / Avatar** — 保持 UI 占位即可

---

## 0.3 主动消息 · 业界常见做法（供 P4 设计参考）

用户要求「查一下别人怎么实现」。常见模式可**组合**使用，而不是只选一种：

| 模式 | 代表 | 做法 | 适合月栖的点 |
|------|------|------|--------------|
| **静默心跳** | [Donna proactive](https://moonmidas-donna.mintlify.app/proactive/overview)、[Lattice](https://github.com/chriskevini/lattice) | 后台每隔 N 分钟检查；AI 决定「要不要发、发什么、下次何时再检查」 | 与「主动频率」滑条联动；用户聊过则重置间隔 |
| **不活跃触达** | [AstrBot proactive_chat](https://github.com/DBJD-CR/astrbot_plugin_proactive_chat) | 会话静默超过阈值 → 随机延迟 → 人设一致的开场 | 补充「用户没打开 App 也会想起你」 |
| **用户日程 / Cron** | Donna cron、Sebastian appointments | 用户设「今晚 22:40 睡前」→ 到点触发 | 对应日历里三种联动模式 |
| **上下文跟进** | Replika、Nomi | 基于**最近对话**跟进，而非固定话术 | 主动消息应带 RAG / 今日日记 / 日程摘要 |
| **安静窗口** | Donna quiet hours、月栖 DND | 免打扰时段不发 | 已有 DND，需与心跳/日程统一 |
| **分段呈现** | 聊天产品常见 | 一条生成结果拆 2–4 条气泡，间隔 1–3 秒 | 对应用户要的「分段发送」 |

**P4 架构（已确认）**：

```
ProactiveScheduler
├── 来源 A：日历事件（可主动消息 / 仅提醒 / 不联动）
├── 来源 B：不活跃心跳（间隔由「主动频率」映射；用户发消息则重置）
├── 来源 C：日记定时（用户配置的 HH:mm → 触发过去 24h 摘要生成，见 §0.2）
└── 统一管道：respect DND → LLM 生成 → 分段发送 → 按 mode 分发（通知 / 聊天 / 记忆）
```

**与现状**：P3–P7 已按 §0.2 / §0.3 落地；自动化验收见 `npm run verify`。

---

## 0.1 当前代码行为（日记 · 主动消息）— 已与 §0.2 对齐 ✅

以下为 **v1.0.0** 代码实际逻辑（2026-07-10）。

### 日记（`src/diary/` + `app.js`）

| 入口 | 行为 | 与产品规则 |
|------|------|------------|
| **生成今日日记** | 生成 → **入库** | ✅ |
| **收藏今日** | **仅 toggle `pinned`** | ✅ |
| **记录** | 手写弹窗保存 | ✅ |
| **一天一篇** | 同日再生成 → 提示 → 覆盖/取消 | ✅ |
| **角色** | 读人物卡姓名 | ✅ |
| **定时 + 24h 窗口** | `diarySchedule` + `buildDiaryContext` 24h | ✅ |

### 主动消息（`src/proactive/scheduler.js`）

| 条件 | 行为 | 与产品规则 |
|------|------|------------|
| 功能开关 + 通知授权 | 扫描日历 + 心跳 + 纪念日 | ✅ |
| 触发 | **日历 date+time** + 不活跃心跳 | ✅ |
| 免打扰 | DND 内跳过 | ✅ |
| 送达 | 按 mode：聊天 / 通知 / 仅展示 | ✅ |
| 分段发送 | 2–4 条气泡间隔发出 | ✅ |
| 主动频率滑条 | 映射心跳间隔 | ✅ |
| 仅提醒 / 不联动 | 三种联动模式 | ✅ |

---

## 1. 当前基线（v1.0.0 RC）

| 域 | 状态 | 说明 |
|----|------|------|
| 聊天 + 流式回复 | ✅ | 多轮上下文、SSE、历史持久化；附件文本/图片多模态 |
| Prompt 组装 | ✅ | 角色卡、世界书、RAG、Memory Budget、Injection Order、自定义 System/Developer |
| 记忆 RAG | ✅ | BM25 + hash embedding；`styleId` 过滤；导出导入 |
| 日记 | ✅ | §0.2 全闭环：24h、定时、生成即入库、收藏仅 pin |
| 世界书 | ✅ | CRUD、触发词注入 prompt |
| 生活库 | ✅ | 音乐播放；txt/md/epub 导入；相册 vision 摘要队列 |
| 日历 | ✅ | 月视图、ICS、三种联动、空闲时间、纪念日 |
| 外部上下文 / MCP | ✅ | `integrations/registry`；五卡片 grant 与 prompt 一致 |
| 主动消息 | ✅ | 日历 + 心跳 + 纪念日；分段发送；频率滑条 |
| 世界页 | 🚧 占位 | UI 标注「建设中」 |
| 人物 · 衣橱 | 🚧 占位 | UI 标注「建设中」 |
| 云同步 | ✅ | JSON 同步；冲突策略 UI；备份含 avatar + mediaManifest |

---

## 2. 前端承诺清单（须全部落地）

以下按**导航页**列出 UI 文案/控件所承诺的能力，并标注差距。

### 2.1 聊天

| 承诺 | 现状 | 目标 |
|------|------|------|
| 情绪 / 天气 / 睡眠 / bpm 状态条 | 已实现（`status/weather.js`） | 与日历、音乐、相册事件联动刷新 |
| 深度思考链路摘要 | 已实现 | 支持分段发送模式下的多段摘要 |
| 附件（图片/文本） | 仅文件名前缀 | 多模态：图片理解、文本全文注入 |
| 侧边栏「online · 4/8」 | 静态 | 能力计分：已授权 MCP、模型可用、同步状态 |

### 2.2 陪伴 · 记忆

| 承诺 | 现状 | 目标 |
|------|------|------|
| 消息/日记/在一起天数 | 已实现 | 消息数改读 `messages` 表；「在一起」可配置纪念日 |
| 收藏馆、搜索、备份 | 已实现 | 备份含媒体索引与 avatar |
| 今日日记 · 四种风格 | 已实现 | 风格持久化到每条日记 metadata |
| 生成贴合真实对话 | 依赖模型配置 | 无模型时模板降级已做；需质量评测用例 |
| Prompt Lab：L0–L3、Memory Budget、Injection Order | **仅 UI** | 见 §3.1 |
| System / Developer 文本框 | **仅 UI** | 可编辑、持久化、参与 `prompt.compile` |

### 2.3 陪伴 · 人物 · 衣橱 · 🚧 占位

UI 可上传立绘、切换预设套装；**无自动换装、无 Live2D 渲染**。远期方案见 [AVATAR_ACTION_VIDEO_PLAN](./AVATAR_ACTION_VIDEO_PLAN.md)，**等产品定义后再排期**。

### 2.4 世界 · 🚧 占位

UI 演示信息流；**无真实平台、无 AI 浏览**。接口草案见 [WORLD_PLATFORM_API](./WORLD_PLATFORM_API.md)，**等产品定义后再排期**。

### 2.5 设定

| 承诺 | 现状 | 目标 |
|------|------|------|
| 人物设定、甜度等滑条 | 已实现 | 对话模型选择与接口页模型统一 |
| AI 日常状态（作息/天气/注入） | 已实现 | 睡眠时长计算用于主动消息窗口 |
| 世界书 CRUD | 已实现 | 语义/模糊触发（可选 embedding 触发） |

### 2.6 生活 · 音乐

| 承诺 | 现状 | 目标 |
|------|------|------|
| 导入本地音频、播放、拖拽排序 | 已实现 | 扩展格式见 §3.5 |
| Now Playing 注入上下文 | 标题文本 | AI「一起听」：歌词/情绪摘要（可选） |
| MCP「读取正在播放」 | 文本 | 系统媒体会话（Android/iOS）可选 |

### 2.7 生活 · 一起读

| 承诺 | 现状 | 目标 |
|------|------|------|
| 添加书籍（书名/作者/进度） | 列表 CRUD | 见 §3.6 |
| 「未来同步阅读进度、摘录和感想」 | 未实现 | 文件导入、章节进度、AI 摘录、与既白共读 |
| 书籍进入 RAG / 聊天 | 未实现 | 章节摘要向量化、对话引用 |

### 2.8 生活 · 相册

| 承诺 | 现状 | 目标 |
|------|------|------|
| 导入图片、色调标签 | 已实现 | 见 §3.7 |
| MCP「相册标签」 | 仅标题列表 | **每张图 AI 总结** + 可选 vision 注入 |
| 既白「看相册」 | 未实现 | 聊天中请求总结/回忆某张图 |

### 2.9 日历

| 承诺 | 现状 | 目标 |
|------|------|------|
| 月历、选日、ICS 导入 | 已实现（ICS 简版） | 完整 VEVENT、时区、重复规则 |
| 联动：可主动消息 / 仅提醒 / 不联动 | 仅第一种有效 | 见 §3.3 |
| MCP「空闲时间、纪念日、提醒」 | 今日事件文本 | 空闲块计算、周年纪念日、系统提醒 |

### 2.10 接口 · MCP

| 承诺 | 现状 | 目标 |
|------|------|------|
| 模型供应商、RAG TopK | 已实现 | Embedding API 可选切换 |
| 外部 MCP 五卡片 + 免打扰 | UI + 文本上下文 | 见 §3.2 |
| `external.open` / Developer API | 概念列表 | 统一 `integrations/registry` + 可选 HTTP MCP |
| 云端 / 登录 / 社群 | 部分 | 真实账号或保持「本地匿名 + 可选同步」并改文案 |

---

## 3. 分阶段实施计划

### 总览

```
P3  记忆与 Prompt 闭环（4–6 周）     ← 含日记逻辑定稿后的实现
P4  MCP 与日历 · 主动消息引擎（4–6 周）← 含主动消息逻辑定稿后的实现
P5  生活库：文件导入与 AI 感知（6–8 周）
P6  多模态聊天与附件（4–6 周）
P7  云同步、账号与交付打磨（4–6 周）

远期（占位，不排期）：世界平台 · Avatar/Live2D/换装
```

---

### P3 · 记忆与 Prompt 闭环

**目标：** 设定页与接口页描述的记忆分层、Prompt 实验室与 RAG 行为一致。

| 任务 | 交付物 | 验收标准 |
|------|--------|----------|
| P3-1 L0–L3 记忆分层 | `memory/tiers.js`，`assemblePrompt` 预算裁剪 | Memory Budget 三档对应不同 token 上限；注入顺序可配置 |
| P3-2 L0 当前对话窗口 | 滑动窗口 + 摘要压缩 | 超长会话不撑爆 context |
| P3-3 System/Developer 持久化 | `profile.promptLayers` | 设定页编辑后写入 prompt；恢复默认可用 |
| P3-4 真实 embedding 可选 | `settings` + `db` 迁移 | 配置 API 后用模型 embedding；否则保持 hash |
| P3-5 日记闭环 | `diary/schedule.js`、`settings` | §0.2：定时自动写、24h 消息、生成即入库；**同日再生成 → 提示 → 用户选覆盖/取消** |
| P3-5b 收藏馆 | `pinned` + UI | 收藏 = pin；取消收藏不删档案 |
| P3-5c 上下文 | `buildDiaryContext` | 由「今日 8 条」改为 **rolling 24h** + 可选记忆 hints |
| P3-6 记忆指标修正 | `renderMemoryState` | 消息总数来自 `messages`；导出含 `media` 索引 |
| P3-7 RAG 评测 | `scripts/rag-eval.mjs` | 10+ 固定 query 回归分数/排序 |

**依赖：** 模型接口已配置（P0 已有）。

---

### P4 · MCP 与日历 · 主动消息引擎

**目标：** 「外部 MCP 集成」从文案卡片变为可审计的权限化工具层；日历三种联动模式真实可用；**主动消息按产品规则重写**（当前实现见 §0.1，可能整体不符合预期）。

| 任务 | 交付物 | 验收标准 |
|------|--------|----------|
| P4-1 集成注册表 | `integrations/registry.js` | `calendar` `location` `music` `album` `notification` `books` 统一 grant API |
| P4-2 Grant 与功能开关联动 | `flags.external` + MCP 卡片 | 关 external 时不注入；卡片状态与 `grants` 双向同步 |
| P4-3 日历引擎 | `calendar/engine.js` | 事件带完整 `date`；跨月正确；`eventsForDate` 废弃 day-of-month 歧义 |
| P4-4 空闲时间计算 | `calendar/free-busy.js` | 输出今日空闲块 → 注入上下文 / 主动消息 |
| P4-5 纪念日 | `calendar/anniversaries.js` | 设定「在一起」日期；周年触发主动消息与记忆 ingest |
| P4-6 主动消息引擎 | `proactive/scheduler.js` | §0.2：**日历 + 不活跃心跳**；频率滑条；分段发送 |
| P4-6b 仅提醒 / 不联动 | 同上 | 仅提醒 = 通知 only；不联动 = 仅展示 |
| P4-7 ICS 完整解析 | `calendar/ics.js` | DTEND、RRULE、VALARM 基础支持 |
| P4-8 时间工具 | `lib/time.js` | 时区、相对时间、睡眠计划 vs 实际（接 `status/weather`） |
| P4-9 分段发送 | `model/client.js` + chat UI | 长回复按句/段 SSE；摘要面板多段；通知卡片承诺兑现 |
| P4-10 MCP 同步按钮 | 替换「全开」stub | 从 registry 拉取能力说明；无服务器时显示离线 |

**可选（P4+）：** 真 MCP Protocol（stdio/SSE）服务端，供高级用户挂接自建工具。

---

### P5 · 生活库：文件导入与 AI 感知

**目标：** 音乐、书籍、相册不仅「存文件」，还能被 AI **读取、播放上下文、总结**。

#### 3.5 音乐

| 格式 | 导入 | AI 能力 |
|------|------|---------|
| mp3, m4a, wav, flac, ogg | P5-1 `media/audio` 统一 | 元数据（ID3）提取标题/艺术家 |
| 播放列表 | 已有 | 曲库分组注入 |
| 系统正在播放 | P5-2 原生 Media Session | Android/iOS 可选 |

| 任务 | 验收标准 |
|------|----------|
| P5-1 音频管道 | 导入失败有提示；大文件分块；native 走 Filesystem |
| P5-3 AI 听歌上下文 | 授权后 prompt 含：正在播放、最近播放、曲风标签（规则或 LLM 批处理） |
| P5-4 「同步听歌」日程 | 日历事件 `同步听歌` 触发播放建议或主动消息 |

#### 3.6 书籍 · 一起读

| 格式 | 导入 | AI 能力 |
|------|------|---------|
| txt, md | P5-5 | 分章解析、进度锚点 |
| epub | P5-6 | `epub.js` 或服务端解压 spine |
| pdf | P5-7 | 文本层提取；扫描版提示 OCR 未支持 |

| 任务 | 验收标准 |
|------|----------|
| P5-5 书籍实体升级 | `books` 增加 `fileId` `format` `chapters[]` `progressAnchor` |
| P5-8 阅读进度 UI | 章节选择器、百分比、上次位置 |
| P5-9 AI 读书记忆 | 按章生成摘要 → `memories`（source: `book.chunk`） |
| P5-10 共读对话 | 聊天工具 `book.quote`：引用当前章节片段 + 既白感想 |
| P5-11 进度同步 | 改进度写入日记可选片段；导出备份含书籍元数据 |

#### 3.7 相册

| 格式 | 导入 | AI 能力 |
|------|------|---------|
| jpg, png, webp, heic | 已有 + HEIC 转码 | 缩略图持久化 |
| gif | P5-12 | 首帧缩略图 |

| 任务 | 验收标准 |
|------|----------|
| P5-13 相册总结任务队列 | 导入后后台调用 vision 模型（或本地小模型） |
| P5-14 每图 `summary` 字段 | 相册卡片展示摘要；可编辑 |
| P5-15 MCP 相册上下文 | 由「标题列表」升级为「标题 + 摘要」；TopN 张 |
| P5-16 聊天看图 | 用户说「看看那张雨夜的」→ RAG 命中 photo.summary |
| P5-17 相册备份 | 导出含 media blob 或分卷 zip；云同步可选仅元数据+外链 |

---

### P6 · 多模态聊天

| 任务 | 交付物 | 验收标准 |
|------|--------|----------|
| P6-1 聊天附件多模态 | `model/client.js` | 图片 base64/URL；接口页显示 vision 模型提示 |
| P6-2 世界书语义触发 | embedding 或 BM25 触发词 | 降低漏触发 |

---

### P7 · 云同步、账号与交付打磨

| 任务 | 验收标准 |
|------|----------|
| P7-1 备份完整性 | avatar、books、photo summaries、media 清单 |
| P7-2 同步冲突 | `local_wins` / `remote_wins` / `merge` 三策略可配 |
| P7-3 加密上传 | 可选用户 passphrase |
| P7-4 登录文案诚实 | 匿名可用；登录仅影响 sync/community |
| P7-5 社群深链 | QQ/Discord 从 `GET /community` 打开 |
| P7-6 全站无障碍与移动端 | 生活/陪伴分栏键盘可用；底部 7 tab 不溢出 |

---

### 远期 · 世界 & Avatar（占位，产品定义后单独立项）

- **世界**：平台适配器、AI 只读浏览 — 见 [WORLD_PLATFORM_API.md](./WORLD_PLATFORM_API.md)
- **Avatar / 换装**：见 [AVATAR_ACTION_VIDEO_PLAN.md](./AVATAR_ACTION_VIDEO_PLAN.md)

---

## 4. 跨域架构约定

### 4.1 媒体与文件 ID

```
import file → hash/id → media store (IndexedDB / SQLite / Filesystem)
                ↓
         entity 引用 (track.mediaId | book.fileId | photo.mediaId)
                ↓
         AI 任务队列 (summarize | chunk | embed)
                ↓
         memories / externalContext / chat tools
```

### 4.2 「AI 读取」统一接口

建议新增 `src/ai/perception.js`：

| 方法 | 用途 |
|------|------|
| `summarizeImage(mediaId)` | 相册单图 |
| `summarizeAudio(mediaId)` | 可选：曲风/情绪 |
| `chunkBook(fileId)` | 书籍分章 + 摘要 |
| `digestWorldPosts(postIds)` | 世界页（占位，远期） |

所有方法：**需模型配置**；失败时写本地队列重试，不阻塞 UI。

### 4.3 Prompt 注入顺序（与 UI 一致）

默认：`角色卡 → 世界书 → 本地记忆(L0–L3) → 外部 MCP 上下文 → 附件/工具结果`

可由设定页 Injection Order 覆盖。

### 4.4 权限矩阵

| 能力 | 需用户授权 | 功能开关 |
|------|------------|----------|
| 日历 | MCP 日历 + grant | external |
| 位置 | 浏览器定位 + grant | external |
| 音乐 | grant | external |
| 相册 | grant + vision 模型 | external |
| 书籍 | grant + 文件 | external |
| 通知 | grant + 系统权限 | proactive |
| 世界浏览 | 世界页 + 平台 token | 独立 |

---

## 5. 前端功能 → 模块映射表

| UI 位置 | 目标模块 |
|---------|----------|
| 陪伴 / 记忆 / 搜索 | `memory/rag.js` |
| 陪伴 / 记忆 / 日记 | `diary/generate.js`, `diary/styles.js` |
| 陪伴 / 人物 | `avatar/character-page.js` |
| 生活 / 音乐 | `app.js` + `platform/media-files.js` + P5 audio |
| 生活 / 一起读 | `library/books.js`（新建） |
| 生活 / 相册 | `library/photos.js`（新建） + P5 vision |
| 日历 | `calendar/*`（新建） |
| 接口 / MCP | `integrations/registry.js` |
| 世界（占位） | `world/platform-adapter.js` |
| 聊天 / 附件 | `chat/attachments.js`（新建） |

---

## 6. 里程碑与版本号建议

| 版本 | 阶段 | 用户可感知变化 |
|------|------|----------------|
| v0.5.0 | P3 | 设定页 Prompt 与记忆分层生效；日记带风格标签 |
| v0.6.0 | P4 | 日历提醒与空闲时间；MCP 卡片真实授权 |
| v0.7.0 | P5 | 书籍导入与共读；相册 AI 摘要 |
| v0.8.0 | P6 | 聊天发图 / 多模态 |
| v0.9.0 | P7 | 完整备份与同步 |
| v1.0.0 | P3–P7 | 核心体验做实；**世界 / 换装保持占位或明确标注** |

---

## 7. 测试与验收清单（v1.0）

> 自动化：`npm run verify`（日记 9/9 · checkpoints 13/13 · v1 15/15）

- [x] 设定页 Memory Budget / Injection Order 改变后，dev 检索与真实聊天 prompt 长度变化可观测（`verify:checkpoints`）
- [x] 日历：三种联动模式行为符合标签；ICS 导入后当月打点正确（`verify:checkpoints`）
- [x] 音乐：导入 mp3 可播；授权后 prompt 含 now playing（ID3 标题 + 既有播放链路）
- [x] 书籍：导入 txt/epub 至少一种；进度保存；AI 摘要进入记忆检索（`verify:v1`）
- [x] 相册：每张图有 summary；聊天可引用（vision 队列 + MCP 注入）
- [x] MCP：关闭「外部集成」后 external 块消失；单卡片关闭后对应上下文消失（`verify:checkpoints`）
- [x] 世界 / 换装：仍为占位，或 UI 明确标注「建设中」（`verify:v1`）
- [x] 备份导入后 avatar 与 mediaManifest 可恢复（媒体 blob 需本地重导入）
- [x] 无模型时：各 AI 功能优雅降级，UI 无死按钮（模板日记 + 感知队列跳过）

---

## 8. 相关文档

| 文档 | 内容 |
|------|------|
| **[功能扩展计划](./FEATURE_EXPANSION_PLAN.md)** | **v1.0 之后扩展波次 X1–X5（月栖 / Nyra）** |
| **[分步实现路线](./IMPLEMENTATION_PLAN.md)** | **Step 01–50 可逐步执行清单**（你说「执行 Step N」即可开工） |
| [陪伴临场能力](./FEATURES_COMPANION_PRESENCE.md) | 主题 / 语音条 / 一起听看 / 视频通话 |
| [README.md](../README.md) | 安装、脚本、P0–P2 已实现 |
| [WORLD_PLATFORM_API.md](./WORLD_PLATFORM_API.md) | 世界平台只读适配器契约 |
| [AVATAR_ACTION_VIDEO_PLAN.md](./AVATAR_ACTION_VIDEO_PLAN.md) | 立绘、换装、Live2D、视频 |
| [MOBILE_BUILD.md](../MOBILE_BUILD.md) | Android/iOS 构建 |

---

## 9. 优先级说明（若资源有限）

**v1.0 核心（P3–P7）已闭环。** 之后优先级见 [FEATURE_EXPANSION_PLAN](./FEATURE_EXPANSION_PLAN.md) §11：

1. **X1 陪伴临场加深**（同步听 / 通话流式）  
2. **X2 品牌与语言**（全站 i18n · 月栖 / Nyra）  
3. **X3 聊天体验打磨**  
4. **X4 生活库加深**  
5. **X5 工程与交付**  
6. **世界 / Avatar**：等产品定义，不在扩展主路径  

---

*维护：产品规则以 §0.2 为准；扩展进度以 FEATURE_EXPANSION_PLAN 为准。*
