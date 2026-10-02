# Architecture — 月栖 Companion OS

> 真实架构，不是 README 宣传语。源仓：`F:/beautiful`。Updated: 2026-08-15.

## 1. 系统鸟瞰

```text
┌─────────────────────────────────────────────────────────────┐
│ Clients                                                     │
│  Web/Vite (index.html → www/)                               │
│   ├ App shell (data-app-mode=app)     src/app.js            │
│   └ Phone shell (phone)               src/phone-shell/      │
│  Electron main + pet overlay          electron/             │
│  Capacitor Android / iOS              android/ ios/         │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTPS / local
┌───────────────────────▼─────────────────────────────────────┐
│ Node gateway  server/index.mjs :8787                        │
│  /model/chat  /voice/tts|/stt  /image/generate              │
│  auth · sync · economy · retrieval(+SSRF)                   │
└───────────────────────┬─────────────────────────────────────┘
                        │
         Upstream (OpenAI-compatible / Ark / ElevenLabs / …)
```

## 2. 客户端双壳

| 壳 | 触发 | 入口 |
|----|------|------|
| App | `yueqi.app.mode=app` | `src/app.js` + `index.html` `.app-shell` |
| 小手机 | `yueqi.app.mode=phone` | `src/phone-shell/phone-shell.js` |
| 引导 | `hasOnboardingDone()===false` | `src/onboarding/wizard.js`：语言→账号→产品模式→界面 |

两壳共享：角色、会话 V2、记忆、相册、模型配置。

## 3. 聊天回合数据流（权威）

```text
UI send (panels/chat.js)
  → freeze TurnExecutionScope (conversation/turn-scope.js)
  → conversation.sendUser (Conversation V2)
  → agent-orchestrator.routeUserInput
       ├ selfie / diary → 短路径
       ├ agent / experience / skill → 其他 runtime
       └ companion_chat → requestCharacterReply
  → compilePrompt (app.js) + assemble (prompt/assemble.js)
  → inject <yueqi-runtime> 指令 (runtime/protocol.js)
  → callModel → POST /model/chat (managed 或 BYOK)
  → parseRuntimeTurn → 驱动桌宠/表情
  → writePopTurn(assistant)  【会话写失败则整轮失败】
  → extractAndApplyMemoryOperations (async)
  → continuity / TTS 等副作用
```

## 4. 模块入口地图

| 域 | 入口文件 |
|----|----------|
| Boot | `src/main.js` → `src/app.js` |
| Chat UI | `src/panels/chat.js` |
| Orchestrator | `src/agent-orchestrator/index.js` |
| Conversation | `src/conversation/index.js` |
| Prompt | `src/prompt/assemble.js`, `finalize.js`, `companion-contract-v2.js` |
| Model | `src/model/client.js`, `runtime.js` |
| Runtime markers | `src/runtime/protocol.js` |
| Memory / RAG | `src/memory/rag.js`, `src/storage/db.js` |
| Unified memory | `src/memory/projection/`, adapters（flag 默认关） |
| Turn understanding | `src/turn-understanding/`（flag） |
| Characters | `src/characters/store.js` |
| Pets | `src/avatar/pet-catalog.js`, `xingli-character.js`, `sprite-character.js` |
| Float pet UI | `src/ui/companion-float.js` |
| Visual memory / album | `src/visual-memory/`, `src/phone-shell/phone-gallery.js` |
| Voice | `src/voice/*` |
| Economy | `src/economy/`, `server/economy/` |
| Features | `src/features/flags.js`, `cutover-profile.js` |
| Secrets | `src/platform/secure-store.js`, `web-secrets.js` |
| Server | `server/index.mjs` |
| Retrieval | `server/retrieval/` |
| Electron | `electron/main.mjs`, `electron/pet-v2/` |
| Avatar packages | `packages/avatar-{contract,factory,runtime}`（V2 paused） |

## 5. 存储

### IndexedDB / SQLite

- DB：`yueqi-companion-local` v7（`src/constants.js`）
- Stores：memories, worldbook, settings, media, messages, conversations, palace_kg, characters, …
- Native：Capacitor SQLite 适配（`src/storage/sqlite-adapter.js`）；**Web IndexedDB ≠ 真机行为**

### localStorage（节选）

权威清单：`src/memory/data-modules.js` + `LOCAL_KEYS`。

关键：`yueqi.onboarding.v1`, `yueqi.app.mode`, `yueqi.features.v1`, `yueqi.cutover.profile.v1`, `yueqi.characters.v1`, `yueqi.activeCharacterId`, `yueqi.conversation.v2`, `yueqi.selectedPetId`, `yueqi.visual.memory.v1`, `yueqi.library.v1`, `yueqi.provider.v1`

### 服务端文件

- `server/data/store.json` — 账号/同步/计费元数据  
- `server/data/economy.json` — NyraCoin  
- **禁止打进 APK / 前端 / Git**

### Data portability

Taxonomy（架构决策，非实现声明）：**Character** = structured entity；**Book / Music / Image** = resource；chat / relationship / memory / settings = **user data**；**backup** = snapshot。

| 现状 vs 目标 | 说明 |
|---|---|
| Legacy（当前） | `yueqi-companion-export` v1/v2、best-effort open character card、视觉 ZIP 等既有路径；**不是** `.nyra` / `.nychar` |
| Target（DRAFT） | `.nychar` 可分享角色包（不含私有历史）；`.nyra` 一次性加密归档快照 |

详见 `docs/architecture/adr/002-data-entities-resources-portability.md`、`docs/formats/README.md`；决策索引 `docs/DECISIONS.md` D17。

## 6. 安全边界

| 边界 | 规则 |
|------|------|
| developer | 用户 BYOK，网关转发，密钥不入库 |
| subscription | 服务器环境变量密钥，忽略客户端供应商密钥 |
| SSRF | `server/retrieval/ssrf.js` |
| Secrets | Web=sessionStorage；Native=Preferences（Keystore 仍规划中） |
| Backup | 导出需 scrub 密钥（CP-15/19） |
| Skills | 默认拒绝网络/文件，需 grants |

## 7. 重复 / 易混系统

| A | B | 说明 |
|---|---|------|
| 桌宠 petId | 角色 characterId | 外观 vs 身份 |
| Conversation V2 | IDB messages | V2 权威 |
| `src/agent` | `src/agents` / skill-platform / OpenClaw | 不同任务系统 |
| Avatar Factory V2 | generate-xingli 轨 | V2 paused |
| BillingCredit | NyraCoin | 禁止兑换 |

## 8. 包与构建

- Vite → `www/`（Capacitor `webDir`）  
- `npm run build` = icons + vite + `scripts/build-web.mjs`  
- Android：`npm run build:android`  
- Desktop：`npm run desktop` / `desktop:dev`
