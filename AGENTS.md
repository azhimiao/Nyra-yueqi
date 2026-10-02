# AGENTS.md — 月栖 Companion（强制）

> 任意 Coding Agent（Cursor / Codex / Claude Code / Gemini CLI）进入 `F:/beautiful` 前先读本文件。  
> 功能含义先查 `.cursor/skills/yueqi-feature-map/SKILL.md`，不要全库分析。  
> 更细的架构见 `docs/ARCHITECTURE.md`；状态见 `docs/CURRENT_STATE.md`。

## 0. 一句话产品

**本地优先的 AI 陪伴 OS**：双壳（App / 小手机）+ 可选 Electron 桌宠 + Capacitor 移动端 + Node 商业网关。厚原型，**不是**已过发版门禁的消费品。

两条产品形态，不要混：
- **`F:/beautiful`**：付费完整形态（托管模型、Credits、运营网关、打包工程）。官网 / GitHub 上的 `nyra-latest.apk` 用这一棵打。
- **`F:/yueqi-open` / GitHub `Nyra-yueqi`**：免费源码形态（自带 API、本地网关、无云登录、无支付）。仓库可以挂商业版 APK 下载，源码本身不包含登录/计费。

## 1. 硬约束（违反即坏）

1. **桌宠 ≠ 角色**  
   - 外观：`yueqi.selectedPetId` / `src/avatar/pet-catalog.js`  
   - 身份与记忆：`yueqi.activeCharacterId` / `src/characters/store.js`  
   - 禁止用桌宠 ID 当事伴身份，禁止用角色立绘冒充桌宠帧。

2. **Avatar Factory V2 = PAUSED**  
   - 活跃轨：`npm run generate:xingli|yueqi-female|yueqi-male` + import  
   - 见 `docs/ACTIVE_PET_PIPELINE.md`。禁止把 `packages/avatar-factory` 黄金包当观感验收。

3. **Feature flags 默认 OFF**  
   - Companion intelligence / unified memory 等在 `src/constants.js` `DEFAULT_FEATURES` 多为 false。  
   - **代码存在 ≠ 产品行为开启**。Cutover profile 默认 `legacy`。

4. **Conversation V2 权威**  
   - 权威会话：`yueqi.conversation.v2` + `src/conversation/`  
   - 禁止「只写 IndexedDB messages 就当聊天成功」。

5. **BillingCredit ≠ NyraCoin**  
   - 两套账本禁止互转。见 `docs/AI_ECONOMY_V1.md`。

6. **密钥永不进客户端包 / Git**  
   - Managed：`YUEQI_MODEL_API_KEY` / `ARK_*` 只在服务器环境。  
   - BYOK：用户 Key 经网关转发，不落服务端 DB。  
   - 禁止把聊天里的 Key 写入仓库。

7. **关系数值默认不在普通聊天里涨**  
   - Continuity 是投影，不是亲密度打分 UI。

8. **发版断言必须有外部证据**  
   - 禁止把 Node verify PASS 说成「Android / Live BYOK 已过」。

## 2. 必读文件（最短路径）

| 顺序 | 路径 |
|------|------|
| 0 | `.cursor/skills/yueqi-feature-map/SKILL.md`（功能含义；别名见同目录 `reference.md`） |
| 1 | `docs/CURRENT_STATE.md` |
| 2 | `docs/qa/product-cutover/STATUS.md` |
| 3 | `docs/ARCHITECTURE.md` |
| 4 | `docs/MODEL_RUNTIME_PRODUCTION.md` |
| 5 | `docs/ACTIVE_PET_PIPELINE.md` |
| 6 | `src/panels/chat.js` · `src/model/client.js` · `src/memory/data-modules.js` |

## 3. 核心入口（改功能先定位）

| 域 | 入口 |
|----|------|
| Boot | `src/main.js` → `src/app.js` `bootstrapApp` |
| 聊天回合 | `src/panels/chat.js` |
| 路由 | `src/agent-orchestrator/index.js` |
| 会话权威 | `src/conversation/` |
| Prompt | `src/prompt/assemble.js` + `src/app.js` `compilePrompt` |
| 模型网关客户端 | `src/model/client.js` · `src/model/runtime.js` |
| Runtime 标记 | `src/runtime/protocol.js`（`<yueqi-runtime>`） |
| 记忆 | `src/memory/` · `src/storage/db.js` |
| 角色 | `src/characters/store.js` |
| 桌宠 | `src/avatar/pet-catalog.js` · `src/ui/companion-float.js` |
| 视觉相册 | `src/visual-memory/` · `src/phone-shell/phone-gallery.js` |
| 引导 | `src/onboarding/wizard.js`（**不含**桌宠选型） |
| 服务端 | `server/index.mjs` |
| Electron | `electron/main.mjs` |

## 4. 常用命令

```bash
cd F:/beautiful
npm install
npm run start              # Vite 5173 + 可选 8787
npm run server             # 仅网关
npm run build              # → www/
npm run verify:security    # 安全静态门
npm run verify:onboarding-cp16
npm run verify:product-cutover-node
# 全量 verify 极长；先跑与改动相关的 verify:* 脚本
```

完整表：`docs/TESTING.md`、`docs/DEVELOPMENT.md`。

## 5. 容易误改的地方

- `src/agent/` vs `src/agents/` vs `src/skill-platform/` vs `src/studio-assist/` vs OpenClaw — **情人聊天不是工具 Agent 循环**。
- `palaceProjectionV1` ≠ `palaceProjectionOnlyV1`。
- Web IndexedDB ≠ 真机 SQLite（`src/storage/sqlite-adapter.js`）。
- README 旧 Phase 清单 **低估** 当前 OS；以 `docs/CURRENT_STATE.md` 为准。
- 脏工作树巨大属常态；**禁止**未经用户确认的 `git reset --hard` / force push。

## 6. 提交与 Git

- 仅在用户明确要求时 commit / push。
- 不把 `.env`、密钥、`server/data/*.json` 打进提交。

## 7. 交接包

平行镜像：`F:/jiaojie/`（含本文件副本与 `HANDOFF_AUDIT_REPORT.md`）。
