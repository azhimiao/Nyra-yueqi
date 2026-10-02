# 月栖 Avatar：预生成动作 + LLM 实时控人方案

> **文档用途**：供团队/研究人员评审技术路线合理性。  
> **版本**：Draft 1.1 · 2026-06-27  
> **状态**：规划阶段，尚未实现（**换装已列为核心能力**）

---

## 0. 一句话定义

**A symbolic, state-driven avatar system powered by LLMs**：多模态交互被分解为离散行为原语（预制作动作/表情/口型/**服装**），LLM 只输出对话文本与行为符号，确定性状态机负责选片、拼片、对口型、**换装**——**不做生成式视频，不做实时 3D 物理仿真**。

---

## 1. 目标与非目标

### 1.1 要做什么

| 目标 | 说明 |
|------|------|
| 预生成动作库 | 离线制作 idle / talk / nod / comfort 等动作资产 |
| **一键换装 / 衣橱系统** | **同角色多套装；手动切换 + 场景/LLM 推荐；动作库共用** |
| 实时 LLM 控人 | 模型输出结构化 JSON → 播放器切换动作 + 表情 + 口型 + 可选 outfit |
| 人格/关系显式建模 | 亲密度、边界、意图影响「能做什么动作、解锁哪些服装」 |
| 与现有月栖衔接 | 保留聊天、记忆 RAG、世界书、**天气 MCP**；Avatar 作为新表现层 |

### 1.2 明确不做

| 非目标 | 原因 |
|--------|------|
| Sora / Runway 等 AI 生视频 | 延迟高、不可控、与「符号化原语」哲学冲突 |
| 实时 3D 渲染 / 物理引擎 | 成本高，非 MVP 必需 |
| 自托管大模型 | LLM 层全部 API 化，降低运维 |
| 自建向量服务集群 | 记忆优先 Supabase Vector / 本地 Chroma |
| **AI 实时生成服装贴图** | 换装用预制作 Live2D Part/纹理；不用 diffusion 生衣 |

---

## 2. 总体架构

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend（表现层）                                            │
│  Vite/Next.js · PixiJS · Live2D · Framer Motion · 字幕/UI   │
│  XState（播放器：idle → speaking → react）                    │
│  **Wardrobe UI（一键换装 · 衣橱抽屉）**                        │
└───────────────────────────┬─────────────────────────────────┘
                            │ WebSocket / SSE / REST
┌───────────────────────────▼─────────────────────────────────┐
│ AI Orchestration（编排层）                                    │
│  LangGraph：感知 → 意图 → 关系 → outfit → compose → validate │
│  LLM API：OpenAI / Claude / Gemini（structured output）       │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┬─────────────┐
        ▼                   ▼                   ▼             ▼
   Memory Layer         TTS Layer          Action Library   **Outfit Library**
   Supabase Vector      ElevenLabs API     motions + video  **outfits/*.json + 纹理**
   或 Chroma 本地        或 Coqui XTTS       + manifest       **wardrobe.manifest.json**
```

### 2.1 与现有月栖 Companion 的关系

当前仓库（v0.4.0）已实现：

- 聊天 + SSE 流式、IndexedDB/SQLite 记忆、Prompt 组装、MCP 上下文、Capacitor 多端

**本方案新增模块（规划路径）**：

```
src/
  avatar/                 # 新增：播放器、Live2D 驱动、口型、**换装驱动**
  ai/
    langgraph/            # 新增：人格/关系/动作合法性/**outfit 推荐**（可独立 Node 服务）
packages/
  action-library/         # 新增：预生成动作资产 + manifest
  outfit-library/         # 新增：套装定义、纹理、解锁规则
```

现有 `src/prompt/assemble.js`、`src/model/client.js` **不替换**，Avatar 层消费其输出的文本，并逐步改为消费 **结构化 JSON**。

---

## 3. 技术选型与合理性分析

### 3.1 LLM 层（全部 API 化）

| 选型 | 角色 | 合理性 | 风险 |
|------|------|--------|------|
| **OpenAI GPT-4.1 / GPT-4o** | 主模型，structured output 成熟 | JSON schema 稳定，tool calling 生态好 | 成本、国内访问 |
| **Anthropic Claude 3.5 Sonnet** | 备选，长上下文、角色扮演 | 对话质量高，适合陪伴场景 | 同上 |
| **Google Gemini 1.5 Pro** | 备选，多模态扩展 | 未来可接图片理解 | API 行为差异需适配层 |
| **Vercel AI SDK** | 前端/Edge 流式 + schema | 与 Next.js 集成好，streaming UX | 当前项目是 Vite，可作参考或局部引入 |
| **LangChain** | Tool calling 胶水 | 记忆/工具链接成熟 | 抽象过重，MVP 可不用 |
| **LangGraph** | **人格/关系状态机（推荐）** | 显式图结构，可审计、可调试 | 学习曲线，需独立服务或 Edge |

**决策**：MVP 用 **OpenAI structured output + 薄适配层**；人格/关系复杂后引入 **LangGraph** 独立服务，前端只收 `{ text, actions, emotion, outfit? }`。

**不选自托管 LLM 的原因**：团队重点是「行为编排与表现」，不是模型运维。

---

### 3.2 状态机 / 人格系统（产品灵魂）

| 选型 | 层级 | 合理性 | 风险 |
|------|------|--------|------|
| **LangGraph** | 人格、关系、意图、动作合法性 | 图节点=可测试业务单元；适合「trust<0.4 禁止 confess」类规则 | 需 Python 或 JS 运行时 |
| **XState** | UI/播放器：idle/speaking/react | 与 React/Vanilla 兼容；可视化状态图 | 不承载长期记忆 |
| finite-state-machine | 轻量备选 | 简单场景够用 | 复杂边条件难维护 |
| Temporal | 工业级工作流 | 可靠但过重 | MVP 过度工程 |

**决策**：

- **LangGraph** → 业务人格层（Backend）
- **XState** → 播放器表现层（Frontend）
- 两层分离：**LangGraph 决定「能不能做、穿哪套」；XState 决定「怎么播、怎么切」**

---

### 3.3 记忆系统（轻量，不自建服务器）

| 选型 | 场景 | 合理性 | 风险 |
|------|------|--------|------|
| **现有 SQLite + embedding（月栖已有）** | 本地优先、离线 | 已实现 BM25+hash embedding，零额外成本 | 语义能力弱于云端向量 |
| **Supabase Vector** | 云同步 + 托管向量 | 低运维，与账号体系自然结合 | 依赖 Supabase |
| **ChromaDB** | 本地/自托管向量 | 轻量，适合研究环境 | 需额外进程 |
| Pinecone / Weaviate Cloud | 大规模 | 性能好 | 成本高，MVP 不必 |

**决策**：短期 **沿用月栖现有记忆栈**；云化阶段 **Supabase Vector** 作为可选升级，Avatar 层不直接依赖向量库。

---

### 3.4 TTS / 语音（全部 API 或轻部署）

| 选型 | 角色 | 合理性 | 风险 |
|------|------|--------|------|
| **ElevenLabs API** | **MVP 首选** | 音质好，部分模型带 word/phoneme 时间戳 → 口型 | 按量计费 |
| Coqui TTS (XTTS) | 自托管备选 | 开源、可本地 | 部署与 GPU |
| OpenVoice | 声音克隆 | 角色声线一致 | 合规与训练数据 |

**决策**：MVP **ElevenLabs**；口型用返回的时间戳或 forced alignment；后期评估 XTTS 降本。

---

### 3.5 动作系统（本项目关键）

#### A. 逻辑层（动作管理）

| 选型 | 合理性 |
|------|--------|
| 自研 Action Registry + Manifest | 动作 id 与资产路径解耦，LLM 只认符号 |
| **XState** 映射 UI/播放器 | 打断、队列、crossfade 逻辑清晰 |

#### B. 表现层（2D Avatar）

| 方案 | 实时性 | 成本 | 推荐 |
|------|--------|------|------|
| **Live2D + pixi-live2d-display** | 极好 | 中（需 Cubism 模型） | **主方案** |
| 预渲染 WebM 片段拼片 | 好 | 低 | **Fallback / 分享录屏** |
| Spine 2D | 好 | 中 | 备选，非 Live2D 生态 |
| PixiJS + GSAP 纯精灵 | 极好 | 低 | 极简 MVP 占位 |
| Lottie | 好 | 低 | 适合 UI 微动效，不适合全身 |

**决策**：**Hybrid 2.5D**

- **运行时主渲染**：Live2D（口型、表情、微动作实时）
- **离线预渲染**：每个 Macro Action 导出 2–4s WebM（透明/绿幕），用于弱设备、OBS、社交分享

#### C. 不采用的方案

| 方案 | 原因 |
|------|------|
| 生成式视频 (Sora 等) | 不可控、高延迟、无法符号化 |
| Three.js 实时 3D | 与「2D 陪伴、轻量多端」目标不符 |
| VTube Studio 直接依赖 | 适合参考，不适合 Web 嵌入式产品 |

---

### 3.6 表情 / 动作资源

| 来源 | 用途 | 许可注意 |
|------|------|----------|
| **Mixamo** | 人体动作参考 → 转 Live2D 关键帧 | Adobe 条款 |
| Live2D Cubism | 模型与 motion3.json 标准 | 商业模型授权 |
| 自研 motion3.json | 角色专属动作 | — |
| emoji mapping | 最简表情 fallback | — |
| facial expression sprites | 无 Live2D 时的 2D 备选 | 素材授权 |

**决策**：动作库 **自研为主 + Mixamo 作参考**，不依赖运行时下载 Mixamo。

---

### 3.7 UI / 前端

| 选型 | 本仓库现状 | 规划 |
|------|------------|------|
| Vite + Vanilla JS | 当前月栖 | 短期在现有架构加 `src/avatar/` |
| Next.js | 未使用 | 若独立 Avatar 产品可拆 App Router |
| TailwindCSS | 未使用 | 可选，非阻塞 |
| Framer Motion | 未使用 | 字幕/气泡动效 |
| **PixiJS** | 未使用 | **Live2D 渲染容器（推荐）** |

**决策**：**不强制迁移 Next.js**；在月栖 Vite 壳内集成 PixiJS + Live2D，降低与现有 PWA/Capacitor 的冲突。

---

### 3.8 换装系统（核心能力，与动作并列）

| 选型 | 角色 | 合理性 | 风险 |
|------|------|--------|------|
| **Live2D Part / Drawable 切换** | 运行时换部件可见性、换纹理 | Cubism 原生能力；**动作 motion 可共用**，不必每套衣服重导全部动画 | 模型需按「可拆分 Part」规范制作 |
| **wardrobe.manifest.json** | 套装符号表，与 action manifest 同级 | LLM / UI 只认 `outfit_id`，与动作库同一套符号哲学 | 需维护 Part 命名规范 |
| **OutfitRegistry（自研）** | 一键换装、blend 过渡、持久化当前套装 | 逻辑简单，可单测 | — |
| VTube Studio 衣橱 | 参考交互 | 产品形态参考 | 不运行时依赖 VTS |
| 每套衣服单独 Live2D 模型 | 备选 | 实现最简单 | **动作需重复制作，维护成本爆炸** → **不采用** |
| 每套衣服单独 WebM 库 | 仅 fallback | 弱设备可用 | 体积大；仅特殊展示用 |

**决策（重要）**：

1. **一个 Live2D 模型 + 多套装 Part/纹理配置**（不是多个完整模型）
2. **动作库全局共用**；仅极少数动作可有 `outfit_overrides`（如「撩外套」仅某套启用）
3. **三种换装触发**（均为一等公民）：
   - **用户一键**：衣橱 UI 点击 → 立即切换（带 300ms crossfade）
   - **场景自动**：月栖已有天气/每日状态 MCP → 规则映射（如 `rain` → `rainy_night`）
   - **LLM 建议**：structured output 可选 `outfit` 字段 → `validate_outfit` 节点裁决
4. **解锁**：默认套装全员可用；特殊套装可绑 `relationship_min` / 纪念日 / 用户购买（后期）

**与「换皮」的区别**：

| 概念 | 范围 | 用户感知 |
|------|------|----------|
| **换装（outfit）** | 同一角色 `avatar_id` 下换 Part/纹理 | 沈既白今天穿居家服 / 雨夜外套 |
| **换皮（skin）** | 换整个 `avatar_id` + 动作库 | 换成另一个角色 |

两者 manifest 分层：`avatar_id` → `outfits{}` → `parts/textures`。

---

## 4. 动作与换装设计方案

### 4.1 四层行为模型（含换装层）

```
Layer 0 · Outfit（服装层，与动作正交）          ← 新增，核心
  default | home_casual | rainy_night | formal | sleepwear | …

Layer 1 · Macro State（关系/场景态，LangGraph 维护）
  calm | intimate | distant | playful | serious

Layer 2 · Intent Action（语义动作，LLM 可选，最多 2 个/轮）
  greet | comfort | tease | confess | refuse | think | listen | reach_hand | …

Layer 3 · Micro Motion（表现原语，播放器自动插入）
  idle_variant | blink | talk_loop | nod | look_away | blush | sigh | …
```

**原则**：

- **换装（Layer 0）与动作（Layer 2/3）解耦**：换 `rainy_night` 不影响 `comfort` 动作能否播放。
- LLM **只输出 Layer 2 + emotion + face + 可选 outfit**；Layer 3 由 XState 补全。
- 每个 `action.id` 必须在 `actions.manifest.json` 注册；每个 `outfit.id` 必须在 `wardrobe.manifest.json` 注册。

### 4.2 LLM 输出 Schema（Structured Output）

```json
{
  "text": "自然语言回复",
  "emotion": "warm",
  "intensity": 0.6,
  "actions": [
    { "id": "comfort", "priority": 1, "at": "start" },
    { "id": "reach_hand", "priority": 2, "at": "end" }
  ],
  "face": {
    "expression": "soft_smile",
    "blush": 0.3
  },
  "outfit": {
    "id": "rainy_night",
    "reason": "scene_weather",
    "force": false
  },
  "voice": {
    "style": "low",
    "speed": 0.95
  }
}
```

约束：

- `actions.length ≤ 2`
- `id` ∈ Action Library 枚举
- `outfit.id` 可选；若 present 须 ∈ Wardrobe 枚举且已通过 `validate_outfit`
- `outfit.force === false` 时，用户手动锁定套装则忽略 LLM 建议
- `relationship.trust < 0.4` 时 LangGraph 节点剔除 `confess`、`reach_hand` 等

### 4.3 LangGraph 节点（人格层）

| 节点 | 输入 | 输出 |
|------|------|------|
| `perceive` | 用户消息 + 记忆检索 + **当前天气/场景** | 上下文包 |
| `infer_intent` | 上下文 | intent 标签 |
| `relationship_update` | intent + 历史 | trust / intimacy 数值 |
| **`resolve_outfit`** | 天气规则 + 用户偏好 + LLM 建议 | 候选 `outfit_id` |
| **`validate_outfit`** | 候选 + 解锁表 + 用户锁定 | 最终 `outfit_id` 或 null（保持现状） |
| `compose_reply` | 上述 + 角色卡 | 调 LLM → JSON |
| `validate_actions` | JSON + 关系状态 | 合法化 / 替换非法动作 |
| `dispatch` | 最终 JSON + outfit | 推前端 + TTS 队列 |

### 4.4 XState 播放器（表现层）

```
idle ──SPEAK──► speaking ──END──► react ──DONE──► idle
  │                  │
  └──TIMEOUT──► micro_blink
```

| 状态 | 播放 | 可打断 |
|------|------|--------|
| idle | idle_A/B/C 随机循环 | 是 |
| speaking | talk_loop + TTS 口型 | 用户插话时可打断 |
| react | oneshot（nod/shy/…） | 队列播放 |

### 4.5 换装系统详细设计（核心）

#### 4.5.1 一键换装 UX

| 入口 | 位置 | 行为 |
|------|------|------|
| **衣橱按钮** | Avatar Stage 角标 / 聊天页工具栏 | 打开 Wardrobe Drawer |
| **套装卡片** | 抽屉内网格 | 点击 → `OutfitRegistry.apply(outfit_id)` |
| **当前套装** | 抽屉顶部 | 显示名称 + 缩略图 |
| **锁定** | 套装卡片长按 / 开关 | `user_outfit_locked=true` 时忽略场景/LLM 自动换 |
| **预览** | 点击前 hover | 300ms 临时预览，松手还原（可选） |

切换动画：**300ms crossfade**（Part 透明度 + 纹理 swap），不打断当前 `speaking` 口型。

#### 4.5.2 Live2D 实现要点

```typescript
// 伪代码：同一 model，换 Part 可见性与纹理
outfitRegistry.apply("rainy_night", {
  parts: {
    PartCoat: { visible: true, texture: "textures/coat_wet.png" },
    PartScarf: { visible: true, texture: "textures/scarf.png" },
    PartAccessory: { visible: false },
  },
});
```

Cubism 模型制作规范（给美术）：

- 外套 / 内搭 / 配饰 / 发饰 分 **独立 Part**
- Part 命名写入 `wardrobe.manifest.json`，与代码枚举一致
- **同骨架**保证所有套装共用 `talk_loop`、`idle_*` motion

#### 4.5.3 场景自动换装（接月栖 MCP）

| 场景信号（已有） | 规则示例 | 目标 outfit |
|------------------|----------|-------------|
| `weather.condition === "rain"` | 自动 | `rainy_night` |
| `dailyStatus.asleep === true` | 自动 | `sleepwear` |
| `calendar.event === "纪念日"` | 自动 | `formal` |
| 默认 | — | `home_casual` |

规则文件：`packages/outfit-library/scene-rules.json`，**不经过 LLM**，确定性映射，可审计。

#### 4.5.4 Wardrobe Manifest 示例

```json
{
  "avatar_id": "shen-jibai",
  "version": "1.0.0",
  "default_outfit": "home_casual",
  "outfits": {
    "home_casual": {
      "label": "居家",
      "thumbnail": "thumbs/home_casual.webp",
      "unlock": { "type": "free" },
      "parts": {
        "PartCoat": { "visible": false },
        "PartShirt": { "texture": "textures/shirt_casual.png" },
        "PartPants": { "texture": "textures/pants_casual.png" }
      }
    },
    "rainy_night": {
      "label": "雨夜外套",
      "thumbnail": "thumbs/rainy_night.webp",
      "unlock": { "type": "free" },
      "tags": ["rain", "night"],
      "parts": {
        "PartCoat": { "visible": true, "texture": "textures/coat_rain.png" },
        "PartScarf": { "visible": true, "texture": "textures/scarf_dark.png" }
      }
    },
    "formal": {
      "label": "正式",
      "thumbnail": "thumbs/formal.webp",
      "unlock": { "type": "relationship", "min_trust": 0.6 },
      "parts": { "PartCoat": { "visible": true, "texture": "textures/coat_formal.png" } }
    }
  }
}
```

#### 4.5.5 持久化与同步

| 字段 | 存储 | 说明 |
|------|------|------|
| `current_outfit_id` | localStorage / Capacitor Preferences | 上次穿着 |
| `user_outfit_locked` | 同上 | 是否锁定手动选择 |
| `unlocked_outfits[]` | 同上 + 可选云同步 | 解锁进度 |

换装状态纳入月栖 **export/import payload**（与 profile 同级），换机可恢复衣橱进度。

#### 4.5.6 MVP 衣橱规模

| 阶段 | 套装数 | 示例 |
|------|--------|------|
| **Phase A** | **3 套 + 一键切换** | `home_casual`, `rainy_night`, `sleepwear` |
| Phase B | 8–12 套 | 加 `formal`, `date_night`, 纪念日限定… |
| Phase C | 解锁/付费套装 | `relationship_min`、活动限定 |

**Phase A 验收**：衣橱抽屉打开 → 点击「雨夜外套」→ 300ms 内 Live2D 外观切换 → 刷新页面后仍保持。

---

## 5. 视频 / 资产生成方案

### 5.1 路线：预生成 + 实时合成（非 AI 生视频）

```
离线 Pipeline                         运行时
─────────────                         ──────
Live2D 模型 + 表情 preset      →      pixi-live2d-display 渲染
手工/Mixamo 参考 → motion3.json  →    按 action.id 播放 motion
可选：Cubism/OBS 批量导出 WebM   →    弱设备 / 录屏 fallback
TTS 样本 → viseme 映射表         →    口型 ParamMouthOpenY 驱动
actions.manifest.json            →    Registry 查表 + XState 调度
wardrobe.manifest.json           →    OutfitRegistry 一键换装
scene-rules.json                 →    天气/作息 → 自动换装
```

### 5.2 预渲染规格（WebM Fallback）

| 项 | 值 |
|----|-----|
| 分辨率 | 720p（移动端 540p 变体） |
| 帧率 | 30fps |
| 格式 | WebM VP9 + Alpha 或绿幕 MP4 |
| 单段时长 | 循环类不限；oneshot 1.5–4s |
| 命名 | `{action_id}_{variant}.webm` |

### 5.3 Action Manifest 示例

```json
{
  "avatar_id": "shen-jibai",
  "version": "1.0.0",
  "actions": {
    "idle_A": {
      "type": "loop",
      "live2d": "motions/idle_A.motion3.json",
      "video": "video/idle_A.webm",
      "blend_in_ms": 300,
      "blend_out_ms": 300,
      "interruptible": true
    },
    "comfort": {
      "type": "oneshot",
      "live2d": "motions/comfort.motion3.json",
      "video": "video/comfort.webm",
      "duration_ms": 2400,
      "emotion_tags": ["warm", "sad"],
      "relationship_min": 0.2
    },
    "talk_loop": {
      "type": "loop",
      "live2d": "motions/talk_loop.motion3.json",
      "lip_sync": true
    }
  },
  "expressions": {
    "soft_smile": {
      "params": { "ParamMouthForm": 0.6, "ParamEyeSmile": 0.4 }
    }
  },
  "current_outfit": "home_casual"
}
```

> 完整衣橱定义见 **§4.5.4 `wardrobe.manifest.json`**，与 `actions.manifest.json` 分文件维护。

---

## 6. 实时链路时序

```
T0  用户消息 / 用户点击衣橱 / 天气变化
T0a [可选] OutfitRegistry.apply(outfit_id) — 一键换装，300ms crossfade
T1  LangGraph：记忆检索 + intent + 关系 + resolve_outfit / validate_outfit
T2  LLM streaming（structured）
    ├─ 首包：emotion + actions + outfit?（若有）
    └─ 后续：text delta
T2a 若 outfit 变化且用户未锁定 → OutfitRegistry.apply
T3  XState：idle → speaking；加载 talk_loop + expression
T4  TTS 并行（ElevenLabs）→ audio + 时间戳
T5  口型驱动（viseme → Live2D 参数）
T6  文本结束 → react 队列（nod / reach_hand）
T7  回 idle 变体
```

---

## 7. MVP 动作库规模

### Phase A（2 周可演示）

| 类别 | 数量 | 示例 id |
|------|------|---------|
| **套装（一键换装）** | **3** | **home_casual, rainy_night, sleepwear** |
| 循环 | 4 | idle_A/B/C, talk_loop |
| 一次 | 8 | nod, shake_head, think, listen, comfort, tease, shy, reach_hand |
| 表情 | 8 | neutral, soft_smile, serious, blush, look_away, sleepy, worried, playful |
| 场景规则 | 2 | rain→rainy_night, asleep→sleepwear |

### Phase B（产品级）

- **套装**：8–12 套 + 解锁规则
- Macro actions：25–40
- Micro motions：15+
- 关系解锁动作：~10（如 `first_hand_hold` 需 trust > 0.7）

---

## 8. 规划目录结构（给 Cursor / 研发）

```
packages/action-library/
  motions/*.motion3.json
  video/*.webm
  expressions/*.json
  actions.manifest.json

packages/outfit-library/
  wardrobe.manifest.json
  scene-rules.json
  textures/**/*.png
  thumbs/**/*.webp

src/avatar/
  action-registry.js       # 读 manifest，校验 id
  outfit-registry.js       # 一键换装、持久化、解锁校验
  wardrobe-ui.js           # 衣橱抽屉 UI
  xstate-player.js         # idle/speaking/react
  live2d-driver.js         # pixi-live2d-display 封装 + Part/纹理切换
  lip-sync.js              # TTS 时间戳 → 口型
  video-fallback.js        # WebM 拼片播放器

src/ai/langgraph/
  flow.js
  relationship.js
  action-validator.js
  outfit-resolver.js       # resolve_outfit + validate_outfit

server/
  avatar/                  # 可选 BFF：聚合 LLM + TTS + LangGraph
    compose.mjs
```

---

## 9. 参考项目与文献（结构参考，非直接 fork）

### 9.1 AI VTuber / 虚拟主播

| 项目 | 参考价值 | 链接 |
|------|----------|------|
| Open-LLM-VTuber | LLM + Live2D + TTS 全链路结构 | https://github.com/Open-LLM-VTuber/Open-LLM-VTuber |
| AI-Vtuber-Chatbot | 简化版对话+形象驱动 | https://github.com/swordswild/AI-Vtuber-Chatbot |
| LLM Live2D Assistant | Web Live2D 集成思路 | GitHub 搜索 `LLM Live2D` 多个实现 |

### 9.2 Live2D 生态

| 项目 | 参考价值 | 链接 |
|------|----------|------|
| Live2D Cubism SDK | 模型与 motion 标准 | https://www.live2d.com/sdk/download/web/ |
| pixi-live2d-display | **Web 渲染（计划采用）** | https://github.com/guansss/pixi-live2d-display |
| VTube Studio | 驱动与表情预设、**衣橱交互参考** | https://denchisoft.com/ |

### 9.3 编排与 SDK

| 项目 | 参考价值 | 链接 |
|------|----------|------|
| LangGraph | 人格/关系状态图 | https://langchain-ai.github.io/langgraph/ |
| XState | 播放器状态机 | https://stately.ai/docs/xstate |
| Vercel AI SDK | 流式 + structured output | https://sdk.vercel.ai/docs |
| LangChain | Tool calling 模式 | https://python.langchain.com/ |

### 9.4 动画资源

| 来源 | 用途 | 链接 |
|------|------|------|
| Mixamo | 动作参考 | https://www.mixamo.com/ |
| Spine | 2D 骨骼动画备选 | http://esotericsoftware.com/ |
| Lottie | UI 级动效 | https://lottiefiles.com/ |

### 9.5 TTS

| 服务 | 链接 |
|------|------|
| ElevenLabs API | https://elevenlabs.io/docs/api-reference |
| Coqui XTTS | https://github.com/coqui-ai/TTS |

---

## 10. 风险与合理性自检清单

评审时可逐条打分（高/中/低）。

| # | 问题 | 评估 | 缓解 |
|---|------|------|------|
| 1 | Live2D 商业授权与模型成本 | 中 | 提前采购/自制模型；**Part 分层规范**便于换装 |
| 11 | **换装 Part 命名不一致** | **中** | wardrobe.manifest 为唯一真相；美术 checklist |
| 12 | **一键换装与 speaking 冲突** | 低 | 纹理 swap 不打断口型；motion 共用骨架 |
| 13 | **LLM 乱推荐 outfit** | 低 | validate_outfit + 用户锁定 + 仅 registered id |
| 2 | LLM structured output 不稳定 | 中 | validate 节点 + JSON repair + fallback 纯文本 |
| 3 | 口型与 TTS 不同步 | 中 | 优先 ElevenLabs 时间戳；不行则简化为音量驱动口型 |
| 4 | 动作数量爆炸难维护 | 中 | 严格三层模型；LLM 只选 Layer 2 |
| 5 | LangGraph + XState 双状态机复杂度 | 中 | 文档化边界；单测覆盖 validate 规则 |
| 6 | 与现有 Vite 架构集成 PixiJS | 低 | 独立 Canvas 层，不 refactor 全 UI |
| 7 | 预渲染 WebM 体积 | 低 | 仅 fallback；主路径 Live2D 矢量级 |
| 8 | 多 LLM 供应商差异 | 低 | 统一 `LLMOutput` 类型 + 适配器 |
| 9 | 记忆与 Avatar 耦合 | 低 | Avatar 只读记忆摘要，不写记忆 |
| 10 | 生成式视频诱惑偏离路线 | — | 本文档 Non-Goals 已明确禁止 |

---

## 11. 分阶段实施计划

| 阶段 | 内容 | 依赖 | 验收 |
|------|------|------|------|
| **R0 文档** | 本文档评审 | — | 团队签字 |
| **R1 骨架** | action manifest + **wardrobe manifest（3 套）** + XState mock + **衣橱 UI** | 无 | 一键切换 mock 套装 |
| **R2 Live2D** | pixi-live2d-display + 1 模型（**Part 分层**）+ 8 动作 + **3 套纹理** | Cubism 模型 | 浏览器内 **一键换装** + nod |
| **R3 LLM** | structured output 接入现有 model client | OpenAI/Claude key | 真实对话驱动动作 |
| **R4 TTS** | ElevenLabs + 口型 | API key | 说话时有口型 |
| **R5 LangGraph** | 关系/意图/validate + **outfit 自动规则** | Python 或 JS 运行时 | 低 trust 禁止 confess；**下雨换 raincoat** |
| **R6 Fallback** | WebM 预渲染 + 弱设备检测 | OBS/导出流水线 | 无 WebGL 时仍可播 |
| **R7 月栖集成** | 聊天页嵌入 Avatar Stage | R1–R4 | 月栖主流程可看到形象 |

---

## 12. 待决策项（评审时请确认）

1. **第一版主渲染**：Live2D（推荐） vs 纯 WebM 拼片（更轻但扩展性差）？
2. **LangGraph 运行时**：Python 微服务 vs `@langchain/langgraph` JS？
3. **TTS**：ElevenLabs only vs 预留 XTTS 自托管？
4. **是否拆独立 Next.js 应用**，还是在月栖 Vite 内集成？
5. **角色模型来源**：自研 Live2D / 购买授权 / 占位精灵先跑通？
6. **换装 MVP 套装清单**：居家 / 雨夜 / 睡衣是否足够？是否要「正式装」进 Phase A？
7. **自动换装默认开还是关**？用户是否首次需确认「允许根据天气自动换装」？

---

## 13. 变更记录

| 日期 | 版本 | 说明 |
|------|------|------|
| 2026-06-27 | Draft 1.1 | **换装列为核心能力**：§3.8 §4.5 衣橱/一键切换/场景规则/MVP |
| 2026-06-27 | Draft 1.0 | 初稿：动作设计 + 预生成视频方案 + 技术选型与参考 |

---

## 附录 A：LLM System Prompt 片段（动作约束）

```
你是行为编排器，不是动画师。
- 只能从 Action Library 列表选择 actions[].id
- 只能从 Wardrobe 列表选择 outfit.id（可选，多数轮次不输出 outfit）
- 每轮最多 2 个动作；多数轮次 0–1 个即可
- 必须输出合法 JSON，包含 text、emotion、actions、face
- 禁止描述画面过程；禁止输出未注册的 action id 或 outfit id
- 用户已锁定套装时，不要输出 outfit 字段
```

## 附录 B：与研究人员分享的一句话

**Symbolic action video + wardrobe**：LLM 负责语言与符号决策（含可选 outfit），状态机负责合法性、换装与动作时序，播放器负责预生成资产与 Live2D Part 的实时合成。
