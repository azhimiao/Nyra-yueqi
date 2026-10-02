# 月栖 Companion · 语音聊天实施计划

> 版本草案：2026-07-11  
> 原则：**云 API 优先、本地 Key、与现有文字聊天共用会话**  
> 产品定位：增强聊天体验，**不依赖** Avatar / Live2D

---

## 1. 目标

| 阶段 | 用户可感知 | 优先级 |
|------|------------|--------|
| **V1 · 听** | AI 回复可朗读；角色固定声线 | P0 |
| **V2 · 说** | 按住说话 → 转文字 → 走现有发送链路 | P1 |
| **V3 · 自动** | 开启「自动朗读」；流式 TTS 边生成边读 | P2 |
| **远期** | 口型 / Live2D / 实时双向 | 见 AVATAR_ACTION_VIDEO_PLAN |

**不在本计划内：** 声音克隆训练、离线 TTS、视频通话。

---

## 2. 技术选型（云 API）

与 [`AVATAR_ACTION_VIDEO_PLAN.md`](./AVATAR_ACTION_VIDEO_PLAN.md) §3.4 一致，但 **V1 可先不做口型**。

### 2.1 TTS（文字 → 人声）

| 供应商 | 用途 | 理由 |
|--------|------|------|
| **ElevenLabs** | **V1 默认** | 音质好；支持 `voice_id` 固定角色；部分模型带时间戳（留作 Avatar 扩展） |
| OpenAI `tts-1` / `tts-1-hd` | 备选 | 与 Whisper 同 Key，接入简单；音质略逊 ElevenLabs |
| Azure Neural TTS | 备选 | 国内延迟可能更好；需单独 Key |

**V1 决策：ElevenLabs 为主，OpenAI TTS 为「同一接口页可切换」备选。**

### 2.2 STT（语音 → 文字）

| 供应商 | 用途 | 理由 |
|--------|------|------|
| **OpenAI Whisper API** | **V2 默认** | `audio/transcriptions` 成熟；与现有 OpenAI 生态一致 |
| ElevenLabs Scribe | 备选 | 若 TTS 已用 ElevenLabs 可统一账单 |
| 浏览器 `SpeechRecognition` | 仅 Web 降级 | 免费但不稳定、音质差、Capacitor WebView 支持不一 |

**V2 决策：Whisper API；Native 录音用 `MediaRecorder` → blob → 上传。**

### 2.3 代理层

沿用现有模式：`server/index.mjs` 已有 `/model/chat` 代理，避免前端 CORS 与 Key 暴露策略混乱。

新增：

```
POST /voice/tts    → 转发 ElevenLabs / OpenAI TTS
POST /voice/stt    → 转发 Whisper（multipart audio）
GET  /voice/health → 配置探测
```

前端：`src/voice/client.js` 对称于 `src/model/client.js`。

---

## 3. 架构

```
┌─────────────────────────────────────────────────────────┐
│ 聊天页 UI                                                │
│  [按住说话] [朗读] [自动朗读开关]                         │
└────────────┬───────────────────────────────┬────────────┘
             │ STT (V2)                       │ TTS (V1)
             ▼                                ▼
      src/voice/stt.js                   src/voice/tts.js
             │                                │
             └────────────┬───────────────────┘
                          ▼
                 server/index.mjs
                 /voice/tts  /voice/stt
                          ▼
              ElevenLabs / OpenAI 云 API
                          │
             文字仍走现有 callModel → 不变
```

**关键原则：**

1. **语音不改变 prompt 组装** — 只是 I/O 层换形态。  
2. **STT 结果 = 普通用户消息** — 入库、记忆、RAG 与打字相同。  
3. **TTS 输入 = 助手最终文本** — 可对 `splitBySentence` 每段分别合成（更自然停顿）。  
4. **Key 存本机** — `LOCAL_KEYS.voiceKey` + Native `secure-store`（与 provider Key 同策略）。  
5. **需麦克风权限** — 扩展 `src/platform/permissions.js`：`microphone`。

---

## 4. 配置与 UI

### 4.1 接口页（`data-panel="api"`）

在「模型接口」下方增加 **「语音接口」** 面板：

| 字段 | 说明 |
|------|------|
| TTS 供应商 | ElevenLabs / OpenAI |
| TTS API Key | password 输入 |
| Voice ID | ElevenLabs 角色声线（预设 + 自定义） |
| 模型 | `eleven_multilingual_v2` 等 |
| STT 供应商 | OpenAI Whisper（V2 显示） |
| STT API Key | 可与 TTS 共用 OpenAI Key |
| 测试朗读 | 输入样例句 → 播放 |
| 测试识别 | 录 3 秒 → 显示转写 |

### 4.2 设定页（可选）

| 开关 | 说明 |
|------|------|
| `data-feature-voice` | 总开关：关闭后聊天页不显示语音控件 |
| 自动朗读 | 每条 AI 回复完成后自动 TTS |
| 朗读速度 / 音量 | 本地 preferences |

### 4.3 聊天页

| 控件 | 行为 |
|------|------|
| 🔊 消息气泡旁 | 单条朗读 / 停止 |
| 输入栏 🎤 | 按住录音，松手转写并填入或发送（V2） |
| 顶部小图标 | 自动朗读 on/off |

### 4.4 权限

- Native：`microphone` 权限（Capacitor 或 WebView prompt）  
- 生活页已有 `storage` 权限模式可复用 UI 组件  

---

## 5. 分步实施（Step 51–58）

与 [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) 衔接。

### Step 51 · 语音配置与常量

**新建 / 修改**

- `src/constants.js` — `LOCAL_KEYS.voiceKey`、`DEFAULT_VOICE`
- `src/settings/voice-preferences.js` — get/save voice settings
- `index.html` — 接口页语音面板

**验收**

- 配置可保存/恢复；无 Key 时测试按钮给出明确错误

---

### Step 52 · 服务端 TTS 代理

**修改** `server/index.mjs`

- `POST /voice/tts` body: `{ provider, apiKey, voiceId, model, text }`
- 返回 `audio/mpeg` 或 base64 + mime
- 错误码与 `/model/chat` 风格一致

**新建** `src/voice/tts.js`

- `synthesizeSpeech(text, config)` → `Blob` / object URL
- `playSpeech(blob)` — 封装 `Audio` 播放与 abort

**验收**

- 接口页「测试朗读」可播放中文样例句
- `npm run build` 通过

---

### Step 53 · 聊天单条朗读（V1 交付）

**修改**

- `src/app.js` — AI 消息渲染增加朗读按钮
- `src/ui/chat-messages.js`（若已拆分）或消息 DOM 模板
- 播放中状态：同一条再次点击 = 停止；新消息播放 = 打断上一条

**验收**

- 文字聊天后点 🔊 可听到 ElevenLabs 人声
- 未配置 Key 时按钮 disabled + tooltip
- 主动消息气泡也可朗读（可选同 PR）

---

### Step 54 · 麦克风权限 + 录音

**修改**

- `src/platform/permissions.js` — `microphone` check/request
- **新建** `src/voice/record.js` — `MediaRecorder` 封装，最长 60s，wav/webm blob

**验收**

- Web + Capacitor 可弹出麦克风授权
- 拒绝权限有明确提示

---

### Step 55 · STT 代理与按住说话（V2）

**修改** `server/index.mjs`

- `POST /voice/stt` multipart `file` + `apiKey` + `model`

**新建** `src/voice/stt.js`

- `transcribeAudio(blob, config)` → `{ text }`

**修改** 聊天 composer — 按住 🎤 → 录音 → 转写 → 填入 `messageInput` 或直接 `submit`

**验收**

- 说「今天下雨了」→ 输入框出现文本 → 发送 → AI 正常文字回复
- 转写失败不丢录音（可重试）

---

### Step 56 · 自动朗读与分段 TTS（V3）

**修改**

- 设定页「自动朗读」
- AI 流式结束后：对 `splitBySentence` 各段顺序请求 TTS 并排队播放
- 用户发送新消息时 abort 播放队列

**验收**

- 长回复分 2–4 段，段间有自然停顿
- 自动朗读可关

---

### Step 57 · 备份、降级与隐私

**修改**

- `src/memory/backup.js` — 导出 `settings.voice`（**不含** Key；Key 仍走 secure-store）
- 无网络 / 无 Key：隐藏或禁用语音控件，文字聊天不受影响
- 接口页说明：「朗读内容会发送至 TTS 服务商」

**验收**

- 备份导入后 voice 偏好恢复
- 飞行模式无报错

---

### Step 58 · 自动化验收

**新建** `scripts/verify-voice.mjs`

- 静态：接口页 DOM、`/voice/tts` 路由存在、permissions 含 microphone
- 可选集成：mock fetch 测 `tts.js` 解析

**修改** `package.json`

```json
"verify:voice": "node scripts/verify-voice.mjs"
```

**验收**

- `npm run verify` 全绿

---

## 6. 文件清单

| 路径 | 作用 |
|------|------|
| `docs/VOICE_CHAT_PLAN.md` | 本文档 |
| `server/index.mjs` | TTS/STT 代理 |
| `src/voice/tts.js` | 合成与播放 |
| `src/voice/stt.js` | 转写 |
| `src/voice/record.js` | 录音 |
| `src/voice/client.js` | 统一入口 + URL |
| `src/settings/voice-preferences.js` | 偏好持久化 |
| `src/platform/permissions.js` | +microphone |
| `index.html` | 接口页 + 聊天控件 |
| `styles.css` | 录音按钮、播放态 |
| `scripts/verify-voice.mjs` | 验收 |

---

## 7. 成本与限制（给用户看）

| 项 | 说明 |
|----|------|
| ElevenLabs | 按字符计费；建议设定单条上限（如 500 字） |
| Whisper | 按音频分钟计费 |
| 延迟 | TTS 通常 +0.5–2s；可显示「合成中…」 |
| 隐私 | 用户消息文本 / 音频会离开本机到云 API |
| 离线 | 不支持；无网仅文字 |

---

## 8. 里程碑

| 版本 | 步骤 | 交付 |
|------|------|------|
| **v1.1.0-alpha** | 51–53 | 能听 AI 说话 |
| **v1.1.0** | 54–55 | 能按住说话 |
| **v1.2.0** | 56–58 | 自动朗读 + 验收 |

预估：**V1 约 3–5 天 · V2 约 2–3 天 · V3 约 2 天**（单人全职）。

---

## 9. 验收清单（产品）

- [ ] 接口页配置 ElevenLabs Key + Voice ID 后可测试朗读
- [ ] 任意 AI 回复可点击朗读，声音自然、中文清晰
- [ ] 按住说话 → 转写 → 发送 → 回复可朗读（V2）
- [ ] 麦克风/未配置 Key 时有明确提示，不白屏
- [ ] 关闭「语音功能」开关后 UI 恢复纯文字
- [ ] 文字聊天、记忆、日记逻辑无回归

---

## 10. 执行方式

在对话中说：

- **「执行 Step 51」** — 从配置与常量开始  
- **「做到 V1」** — 执行 Step 51–53  
- **「语音全做」** — 执行 Step 51–58  

---

*维护：完成后更新 PRODUCT_ROADMAP §2.1 聊天、§6 里程碑，README 增加 ElevenLabs / Whisper 环境说明。*
