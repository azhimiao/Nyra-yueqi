# 月栖 · 情景剧模式完整计划（含 UI 美化）

> 品牌：**月栖**（英文 **Nyra**）  
> 产品名（对用户）：**今晚一起演戏** / 情景剧  
> 日期：2026-07-18  
> 关联：[PRODUCT_ROADMAP](./PRODUCT_ROADMAP.md) · [FEATURE_EXPANSION_PLAN](./FEATURE_EXPANSION_PLAN.md) · 世界书（已有）

---

## 0. 一句话目标

在小手机里做一套 **「选情境 → 上台演 → 选项/自由说 → 轻导演推进 → 收束」** 的共创剧场体验；视觉要像 **沉浸式舞台**，而不是又一个聊天列表或节点编辑器。

**不做：** 完整视觉小说节点编辑器、公网联机、重型 Live2D 换装（可后接）。

---

## 1. 用户旅程（IA）

```
桌面 / Dock「情景剧」
        │
        ▼
┌───────────────────┐
│  剧场门厅 Lobby   │  今晚想演什么 · 继续未完 · 我的剧本
└─────────┬─────────┘
          │ 选一幕 / 新建 / 续演
          ▼
┌───────────────────┐
│  开幕 Curtain     │  标题 · 一句话设定 ·「开幕」大按钮
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  舞台 Stage       │  全屏氛围 · 旁白/对白 · 选项 · 输入
│  （主体验）        │  轻导演条 · 收束入口
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  谢幕 Finale      │  今晚演了什么 · 存进记忆/日记 · 再演一幕
└───────────────────┘
```

| 入口 | 说明 |
|------|------|
| 小手机桌面图标「情景剧」 | 主入口（`apps-catalog` 新 app） |
| 聊天页次级入口（可选 S2） | 「把这段聊变成一幕戏」 |
| 世界书联动（S2） | 剧本可挂 lore 条目，上台自动注入 |

---

## 2. 产品规则（体验约束）

| 规则 | 含义 |
|------|------|
| 一晚一戏 | 同时只开一场 `run`；可暂停/续演 |
| 舞台优先 | Stage 第一屏只服务「演」，不塞设定面板 |
| 选项 + 自由说 | 导演给 2–4 个选项；始终可自由输入 |
| 轻导演 | 幕后推进节奏/冲突，不暴露「节点图」 |
| 可退出 | 随时「暂离舞台」回门厅，进度本地保存 |
| 月栖语言 | 文案用「开幕 / 台上 / 谢幕」，不用 ST/VN 黑话 |

---

## 3. 数据模型（本地优先）

### 3.1 剧本 `ScenarioScript`

```ts
{
  id: string
  title: string
  premise: string          // 一句话设定
  mood: "night" | "rain" | "warm" | "city" | "custom"
  backdropKey?: string     // 预设氛围图 key 或自定义 URL
  openingBeat: string      // 开场旁白
  castHint?: string        // 对角色的演技提示（注入 system）
  loreEntryIds?: string[]  // 关联世界书
  tags?: string[]
  createdAt: number
  updatedAt: number
  source: "preset" | "user" | "ai"
}
```

### 3.2 场次 `ScenarioRun`

```ts
{
  id: string
  scriptId: string
  status: "active" | "paused" | "ended"
  beats: ScenarioBeat[]    // 已发生的节拍
  directorState: {
    tension: 0 | 1 | 2 | 3  // 轻量张力
    lastBeatType: "narration" | "dialogue" | "choice" | "twist" | "ending"
    flags: Record<string, string | boolean>
  }
  startedAt: number
  updatedAt: number
  endedAt?: number
  summary?: string         // 谢幕摘要 → 可写日记/记忆
}
```

### 3.3 节拍 `ScenarioBeat`

```ts
{
  id: string
  at: number
  kind: "narration" | "npc" | "user" | "choice" | "system"
  text: string
  choiceId?: string
  meta?: { emotion?: string; stageDirection?: string }
}
```

### 3.4 导演输出（模型约束 JSON，对用户不可见）

```ts
{
  narration?: string       // 旁白 / 环境
  reply: string            // 角色台上对白
  choices?: { id: string; label: string }[]  // 2–4
  tensionDelta?: -1 | 0 | 1
  suggestEnding?: boolean
  stageHint?: string       // UI：灯光/天气微动（可选）
}
```

存储建议：`localStorage` / 现有 prefs 体系旁新增 `scenario-store.js`；备份包纳入 `scripts` + `runs`。

---

## 4. Prompt 组装（接现有管道）

复用 `prompt/assemble.js` 思路，新增 **情景剧通道**：

```
System（演技 + 舞台规则 + JSON 契约）
  → 角色卡（精简）
  → 剧本 premise / castHint
  → 关联世界书（命中或强制挂载）
  → 近期 beats（Memory Budget 截断）
  → 用户本轮：选项 id 或自由文本
```

规则：
- 普通聊天与情景剧 **会话隔离**（不混进日常 chat 历史）
- 谢幕可一键「把今晚写进日记 / 记忆宫殿」
- 导演 JSON 解析失败时降级为纯对白 + 默认选项模板

---

## 5. UI 美化规范（顶级舞台感）

### 5.1 视觉方向（月栖剧场）

与小手机青绿壳一致，但舞台是 **另一套氛围**：

| Token | 建议值 | 用途 |
|-------|--------|------|
| `--stage-ink` | `#f4efe6` | 台上主字 |
| `--stage-mute` | `rgba(244,239,230,.62)` | 次要字 |
| `--stage-ember` | `#e8a87c` | CTA / 高光（暖琥珀，非紫） |
| `--stage-deep` | `#0c1418` | 舞台底 |
| `--stage-mist` | 径向雾 + 细颗粒 | 大气 |
| 显示字体 | `"Cormorant Garamond"` / `"Noto Serif SC"` | 标题、旁白 |
| UI 字体 | 沿用 `Outfit` + `Noto Sans SC` | 按钮、选项 |

**禁止（本功能）：** 紫靛渐变、奶油衬线 Terracotta 模板、报纸多栏、卡片堆叠门厅、hero 上浮标贴纸。

### 5.2 四屏构图（Hero 预算）

#### A. 门厅 Lobby（一屏一职）

- **一构图**：全出血氛围底（剧院帷幕 / 夜窗剪影），非 inset 卡片墙
- **品牌级信号**：大字「今晚一起演戏」或「情景剧」占视觉重心
- **一句支持**：「和星梨共创一幕，选项或随口说都行」
- **CTA 组**：继续未完 · 选一幕 · 自写剧本
- **不要**：统计条、今日排期、多列剧本卡栅格塞满首屏

剧本列表放在 **下滑第二屏** 或 sheet，首屏保持干净。

#### B. 开幕 Curtain

- 全屏暗底 + 帷幕开合动效（CSS）
- 居中：剧本标题（衬线大字）+ premise 一行
- 单一主按钮「开幕」
- 无次要营销块

#### C. 舞台 Stage（核心）

```
┌─────────────────────────────┐
│  氛围层（全出血 backdrop）   │
│  轻 vignette + 可选颗粒      │
│                             │
│     （上 1/3 留给「空」）     │
│                             │
│  旁白：衬线、淡入            │
│  对白：角色名小标 + 正文     │
│                             │
│  ┌─────────────────────┐   │
│  │ 选项 1 / 2 / 3      │   │  ← 非卡片化：底栏上浮条带
│  └─────────────────────┘   │
│  [ 自由说…          送出 ]  │
│  暂离 · 轻导演 · 谢幕       │
└─────────────────────────────┘
```

- **全出血舞台**：backdrop 是 edge-to-edge，不是圆角媒体卡
- **无 hero 浮标**：不在背景上贴 badge / chip
- **选项**：半透明条带 + 细分隔，不要三张 elevation 卡片
- **动效（至少 2–3 个）**：
  1. 开幕帷幕上拉 / 淡出
  2. 新旁白/对白 stagger fade-up
  3. 选项出现时轻微上浮 + 张力变化时灯光色温微移

#### D. 谢幕 Finale

- 暗场收光 → 一句「今晚我们演完了」
- 摘要短段落（可编辑）
- CTA：写入日记 · 再演一幕 · 回门厅
- 一屏一事，无多模块仪表盘

### 5.3 动效与可达性

| 项 | 要求 |
|----|------|
| `prefers-reduced-motion` | 帷幕改为淡入淡出，取消颗粒漂移 |
| 触控 | 选项热区 ≥ 44px；底栏不挡安全区 |
| 对比度 | 台上字在暗底上 WCAG AA |
| 手机壳内 | 适配现有 `mini-phone` 高度；键盘弹起时舞台内容上推 |

### 5.4 与现有壳的关系

| 层 | 策略 |
|----|------|
| 桌面图标 | 新 app id `scenario`，走 `apps-catalog` + Dock/网格 |
| 壳内导航 | Stage 隐藏底 Tab（沉浸）；Lobby 可保留状态栏 |
| CSS | 新文件 `src/ui/scenario-theater.css` + tokens；不污染全局紫/暗默认 |
| 字体 | Google/本地：Cormorant + Noto Serif SC（仅剧场页加载） |

---

## 6. 模块与文件规划

| 模块 | 路径（建议） | 职责 |
|------|----------------|------|
| 目录 / 预设 | `src/scenario/presets.js` | 3–5 个开箱剧本 |
| 存储 | `src/scenario/store.js` | scripts / runs CRUD |
| 导演 | `src/scenario/director.js` | 组 prompt、解析 JSON、张力 |
| UI 壳 | `src/scenario/theater-ui.js` | Lobby / Curtain / Stage / Finale |
| 样式 | `src/ui/scenario-theater.css` | 舞台视觉 |
| 接入小手机 | `apps-catalog.js` + `app-screens.js` / `phone-shell.js` | 入口与路由 |
| i18n | `locales` 键 `scenario.*` | 中英 |
| 验证 | `scripts/verify-scenario.mjs`（可选） | schema / 预设完整性 |

---

## 7. 分阶段交付（可验收）

### S0 · 骨架与视觉壳（约 2–3 天）

- [x] App 入口 + Lobby / Curtain / Stage / Finale **空壳可点通**
- [x] 落实 §5 视觉 tokens、全出血舞台、开幕动效、衬线标题
- [x] 1 个硬编码演示剧本（无模型也可点选项看转场）
- **验收：** 在小手机里走完「门厅→开幕→台上→谢幕」；首屏通过品牌测试（去 nav 仍知是月栖剧场）  
  → **M5 已交付可玩切片**（含卡司多选；离线导演可用）

### S1 · 真聊天与导演（约 4–6 天）

- [x] `director.js` 接现有 LLM 调用链（有 key 走模型，否则离线）
- [x] 选项点击 / 自由输入 → beats 追加（非流式，整段上屏）
- [x] `ScenarioRun` 持久化、暂停续演
- [x] JSON 降级路径
- [ ] 流式上屏（可选后续）
- **验收：** 用真实 API 演完一幕；刷新后可续；对白不像系统提示泄漏

### S2 · 共创与深度（约 3–5 天）

- [ ] 用户自写剧本（标题 / premise / 开场旁白 / mood）
- [ ] 关联世界书条目
- [ ] 谢幕写入日记 / 记忆（复用现有 API）
- [ ] 预设剧本扩到 5 个（夜雨 / 咖啡店 / 屋顶 / 考试前夜 / 重逢）
- **验收：** 自写一幕可演；世界书内容出现在台上表现；谢幕有日记痕迹

### S3 · 打磨（约 2–3 天）

- [ ] 张力驱动舞台色温 / 微动效
- [ ] 英文文案 `scenario.*`
- [ ] 无障碍与 reduced-motion
- [ ] 备份包纳入 scripts/runs
- **验收：** `verify` 绿；手测中英；弱网/坏 JSON 不崩

---

## 8. 风险与决策

| 风险 | 缓解 |
|------|------|
| 模型不遵守 JSON | 宽松解析 + 默认选项模板 + 纯文本回退 |
| 舞台像「又一个聊天」 | 旁白/对白分层样式；选项条带；限制历史密度（只露最近 N 拍） |
| 与日常聊天记忆串味 | 独立 run；谢幕才主动写入 |
| 工期膨胀成 VN 编辑器 | S2 仅表单建剧本，不做节点图画布 |

**待你确认的产品点：**

1. 默认角色是否固定为当前人物卡（星梨），还是可选多卡？  
2. 谢幕默认写日记还是需用户点确认？  
3. S0 是否先做「无模型演示」方便先看 UI？

---

## 9. 成功标准（总）

用户能在小手机里 **5 分钟内** 完成：选一幕 → 开幕 → 选两次选项 + 说一句 → 感到「在演戏」→ 谢幕有情绪收束；且第一眼觉得 **高级、沉浸、像月栖**，而不是设置页或表单工具。

---

## 10. 建议开工顺序

1. 确认 §8 三个产品点  
2. 实装 **S0 视觉壳**（可先看效果）  
3. 再接 **S1 导演**  
4. S2 / S3 按反馈插队  

确认本计划后，从 S0 开始改代码。
