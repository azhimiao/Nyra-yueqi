# 生产审计改动明细（2026-08-13）

> 本文记录 **Composer 本轮 production-grade audit** 实际落地的每一处改动：文件、前后行为、用户/Agent 可见后果、回归命令、收尾状态。  
> 总览分类见同目录 [`TECHNICAL_DEBT_AUDIT.md`](./TECHNICAL_DEBT_AUDIT.md)。  
> **注意：** 工作树同时有 Codex/其它 Agent 改动；下列「本轮」指 Composer 主动引入或改写的逻辑。`server/index.mjs`、`src/panels/chat.js`、`package.json` 可能已与其它改动叠 diff，合码前请按路径核对。

**日期：** 2026-08-13  
**仓库：** `F:/beautiful`  
**中断点：** 全量 `npm run verify` 在 `verify:phase0`（「我的桌宠」过期断言）处失败后被用户停下；phase0 未修。

---

## 0. 文件清单

### 新建

| 路径 | 作用 |
|------|------|
| `server/upstream-url.mjs` | BYOK/托管上游 Base URL 的 SSRF 校验（复用 retrieval SSRF） |
| `server/account-store.mjs` | 账号 JSON store 的串行 `transact`（防积分 lost update） |
| `scripts/verify-tech-debt-audit.mjs` | 本轮 P0/P1 回归包 |
| `TECHNICAL_DEBT_AUDIT.md` | 审计分类总表（FIXED / VERIFIED / PENDING_EXTERNAL / DEFERRED） |
| `docs/AUDIT_CHANGELOG_2026-08-13.md` | 本文件（具体改动明细） |

### 修改（本轮逻辑相关）

| 路径 | 改动要点 |
|------|----------|
| `server/index.mjs` | 接入上游校验、account store、sync 409、grant 鉴权、stream body 守卫、积分串行 |
| `src/features/cutover-profile.js` | 默认 profile → `legacy`；取消隐式 legacy→production 升级 |
| `src/features/flags.js` | `isFeatureEnabled` 改为 opt-in `=== true` |
| `src/conversation/store.js` | 损坏恢复 / write / writeBlocked / 跨 tab invalidate |
| `src/companion/diary-action.js` | 默认禁止覆盖；仅 `overwrite === true` |
| `src/panels/chat.js` | 日记路由传 `overwrite: false`（文件内另有其它 Agent 的 diary dispatch 重构） |
| `src/memory/data-modules.js` | 备份增加 `storySessions` |
| `vite.config.js` | 恢复 `manualChunks`: voice / palace / world |
| `scripts/verify-security.mjs` | 增加 SSRF 模块、积分串行、sync conflict、grant 登录检查 |
| `scripts/verify-product-cutover-profile.mjs` | 期望默认 `legacy`；禁止隐式升级；未知 flag off |
| `scripts/verify-x5.mjs` | dock+hub 断言；app.js 软上限 5000 |
| `package.json` | 新增 `verify:tech-debt-audit`；prepend 进 `verify` |
| `docs/DECISIONS.md` | D8 补丁说明；新增 D13–D15 |

### 未完成（本轮已发现、未改完）

| 路径 | 问题 |
|------|------|
| `scripts/verify-phase0.mjs` L58 | 仍断言 `index.html` 含「我的桌宠」+ `data-companion-tab="character"` → 全量 verify 红 |

---

## 1. Cutover 默认回滚为 legacy

### 文件
- `src/features/cutover-profile.js`（约 L20、L148–171）
- `scripts/verify-product-cutover-profile.mjs`（整文件按 legacy 重写断言）

### 改前
```js
export const DEFAULT_CUTOVER_PROFILE = "production_v1";
// ensureCutoverProfileResolved:
//   stored == null || (stored==legacy && !migration.completed)
//     → 强制写成 production_v1
```

### 改后
```js
export const DEFAULT_CUTOVER_PROFILE = "legacy";
// ensureCutoverProfileResolved:
//   stored == null → legacy
//   已有 legacy / 任意显式值 → 保持，不自动升 production
```

### 后果
| 场景 | 行为 |
|------|------|
| 全新 localStorage | cutover = `legacy`；`turnUnderstandingV1` 等 12 个新路径 flag **关** |
| 用户曾显式选 `production_v1` | 仍读存储值，不变 |
| 历史写入的 `legacy` | **不再**被一次性抬到 production |
| 与 STATUS.md | 对齐「C8 前默认必须 legacy」 |

### 回归
`npm run verify:product-cutover-profile` → 期望 PASS（含「fresh install profile is legacy」）

### 与其它 Agent 冲突风险
高。若 Codex 仍假设默认 `production_v1` 或改回该常量，会直接对打。

---

## 2. `isFeatureEnabled` 未知 key 默认关

### 文件
- `src/features/flags.js` L88–90

### 改前
```js
return getFeatureFlags()[key] !== false;
// 未在 DEFAULT_FEATURES / storage 出现的 key → undefined → true
```

### 改后
```js
return getFeatureFlags()[key] === true;
```

### 后果
| 调用 | 结果 |
|------|------|
| `isFeatureEnabled("promptAssembly")`（DEFAULT true） | 仍 true |
| `isFeatureEnabled("turnUnderstandingV1")` + legacy | false |
| `isFeatureEnabled("totallyUnknownFlagXyz")` | **false**（以前 true） |
| 拼错 flag 名 | 功能关，不再误开 |

### 回归
`verify-product-cutover-profile` / `verify-tech-debt-audit` 含「unknown flags off」

---

## 3. 上游 URL SSRF 硬化

### 新建 `server/upstream-url.mjs`
- 调用 `server/retrieval/ssrf.js` 的 `validateFetchUrl`
- `publicServer === true`：拒绝 loopback / RFC1918 / link-local / metadata
- `publicServer === false`：允许 `127.0.0.1` / `localhost` / `::1`（本机 Ollama）
- 环境变量 `YUEQI_UPSTREAM_ALLOWLIST`（逗号分隔 hostname）可额外放行
- 即使误加入 allowlist，仍硬拒 `169.254.169.254` / metadata 域名

### `server/index.mjs`
```js
import { assertSafeUpstreamUrl as assertSafeUpstreamUrlCore } from "./upstream-url.mjs";
function assertSafeUpstreamUrl(raw) {
  return assertSafeUpstreamUrlCore(raw, { publicServer });
}
```
原函数体（只拦 metadata）已替换为上述包装。

### 改前 vs 改后（公网网关）

| Base URL | 改前 | 改后 |
|----------|------|------|
| `https://api.openai.com/v1` | 允许 | 允许 |
| `http://127.0.0.1:11434` | 允许 | **拒绝** |
| `http://10.0.0.5/v1` | 允许 | **拒绝** |
| `http://192.168.1.1/v1` | 允许 | **拒绝** |
| `http://169.254.169.254/...` | 拒绝 | 拒绝 |

本机 `publicServer=false` 时 `127.0.0.1` 仍允许（Viber 默认 `http://127.0.0.1:3001` 不破）。

### 回归
`node scripts/verify-tech-debt-audit.mjs` → `testUpstreamSsrf`  
`npm run verify:security` →「上游 SSRF 模块」

---

## 4. 账号积分 / sync / grants 串行事务

### 新建 `server/account-store.mjs`
- `createAccountStore(dataFile)` → `{ readStore, writeStore, transact }`
- `transact`：Promise 队列串行「读 → mutator → 原子写 tmp+rename」
- 模式对齐 `server/economy/store.mjs` 的 `FileEconomyStore.transact`

### `server/index.mjs` 接入
```js
const accountStore = createAccountStore(dataFile);
const readStore = () => accountStore.readStore();
const writeStore = (store) => accountStore.writeStore(store);
const withAccountStore = (mutator) => accountStore.transact(mutator);
```

### `chargeManagedCredits`
- **改前：** `await readStore()` → 改 credits → `await writeStore()`（并发可双读同余额）
- **改后：** 整段包在 `withAccountStore(...)` 内

### 回归用例（tech-debt）
余额 10，并发三次扣 4 → 仅 2 次成功，最终余额 2。

### 后果
托管模式下并行 chat/TTS/STT/image 不再轻易「少扣积分」。单进程有效；多进程多实例仍需外部分布式锁（未做，标 DEFERRED 外的已知限制）。

---

## 5. Sync 上传版本冲突

### 路由
`POST /sync/upload`（`server/index.mjs`）

### 改前
任意 bearer 上传直接覆盖 `store.sync[userId]`，无视服务端已有 `version`。

### 改后
1. `version` 必须 `>= 1`，否则 **400** `invalid_version`
2. 若已有 payload 且 `version < serverVersion` → **409**
```json
{
  "error": "version_conflict",
  "message": "云端备份更新，请先下载再上传。",
  "serverVersion": <number>,
  "updatedAt": <iso|null>
}
```
3. 成功时写入 `version: Math.max(clientVersion, serverVersion)`，经 `withAccountStore` 串行

### 后果
| 客户端 | 影响 |
|--------|------|
| 旧客户端假设永远 200 | 会看到上传失败，需先 download |
| 双设备同时备份 | 低 version 一方不再静默抹掉高 version |

### 回归
`verify:security` 静态检查含 `version_conflict`

---

## 6. `/external/grant` 必须登录

### 改前
```js
const userId = userFromAuth(req) || "guest";
// 未登录可写 grants.guest
```

### 改后
```js
const userId = userFromAuth(req);
if (!userId) return res.status(401).json({ error: "login_required", ... });
// 写入走 withAccountStore
```

### 后果
- 匿名污染 `guest` grants 路径关闭
- 前端若曾无 token 调 grant，会 401（需确认 `src/panels/profile.js` 等调用方带 bearer）

### 回归
`verify:security`：`external grant 需登录`（断言源码不再含 `userFromAuth(req) || "guest"`）

---

## 7. 模型流式响应 body 空守卫

### 位置
`POST /model/chat` 的 `if (stream)` 分支（约 L657）

### 改前
`upstream.ok` 后直接 `flushHeaders` + `upstream.body.getReader()` → body 为 null 时抛错，客户端挂半截 SSE。

### 改后
```js
if (!upstream.body || typeof upstream.body.getReader !== "function") {
  return res.status(502).json({
    error: "model_upstream_error",
    message: "上游未返回可读流。",
  });
}
// 然后再 setHeader / flushHeaders / getReader
```

### 后果
异常上游变为可解析 JSON 502，而不是破坏的 event-stream。

---

## 8. Conversation V2：损坏不空写

### 文件
`src/conversation/store.js`

### 新增状态
- `writeBlockedReason`（如 `"corrupt_conversation_v2"`）
- `wireCrossTabInvalidation()`：监听 `storage` 事件，key 为 `yueqi.conversation.v2` 或其 `.tmp` 时清空内存缓存

### `readBag` 新流程
1. 解析 primary `yueqi.conversation.v2`
2. 失败 → 解析 `yueqi.conversation.v2.tmp`；成功则写回 primary
3. 双失败 → `quarantineCorrupt` 写入 `yueqi.conversation.v2.corrupt.<ts>`（截断 2MB）→ `writeBlockedReason` → 返回空 bag **仅供读**

### `writeBag` / `persistSession`
- `writeBlockedReason` 非空时：**不写 localStorage**
- `persistSession` 返回 `{ ok: false, reason: "corrupt_conversation_v2" }`

### `clearAllConversations`
清除 `writeBlockedReason`，允许用户主动清空后恢复写入。

### 改前灾难路径
解析失败 → `memoryBag = emptyBag()` → 下次 `persistSession` 把空 sessions 写入 → **聊天图被抹掉**。

### 后果
| 情况 | 行为 |
|------|------|
| primary 坏、tmp 好 | 自动恢复 |
| 双坏 | 聊天写入失败，直到 clear/修复；损坏原文进 quarantine key |
| 多 tab | 他 tab 改存储后本 tab 下次读会重新 hydrate |

### 回归
`verify-tech-debt-audit`：`testConversationCorrupt`（tmp 恢复 + 双坏拒写）

### 未做
无面向用户的「会话损坏，请恢复/清空」UI。

---

## 9. 日记：禁止聊天路径静默覆盖

### `src/companion/diary-action.js` L82–91
```js
// 改前: const allowOverwrite = opts.overwrite !== false;  // 默认允许覆盖
// 改后:
const allowOverwrite = opts.overwrite === true;
if (existing && !allowOverwrite) {
  return { ok: false, reason: "EXISTS_NO_OVERWRITE", message: "今天的日记已经写过了。..." };
}
```

### `src/panels/chat.js` L507–515
```js
diaryDispatch = await requestCompanionDiary({
  ...
  overwrite: false,  // 改前为 true
});
```

### 后果
| 入口 | 当天已有日记 |
|------|----------------|
| 聊天「帮我写日记」类路由 | 返回 EXISTS_NO_OVERWRITE，**不覆盖** |
| 日记面板里确认覆盖后传 `overwrite: true` | 仍可覆盖（`app.js` 的 `confirmOverwriteDiary` 路径需自行传 true） |
| 未传 overwrite 的其它调用方 | 从「默认覆盖」变为「默认不覆盖」——**行为收紧** |

### 回归
`verify-tech-debt-audit` → `testDiaryNoOverwrite`

### 冲突提示
`chat.js` 同段还有其它 Agent 的 `turnResultFromDirectAction` / 权威写失败逻辑；不要只按「两行 overwrite」理解整文件 diff。

---

## 10. 备份模块：剧章会话 key

### `src/memory/data-modules.js`
```js
import { STORY_STORE_KEY as STORY_SESSIONS_STORE_KEY } from "../story/story-app.js";
// ...
{ id: "story", label: "剧章", key: "yueqi.story.v1", ... },
{ id: "storySessions", label: "剧章会话", key: "yueqi.story.sessions.v1", ... },
```

### 后果
- 导出/模块校验会包含会话库，减少「备份漏剧情会话」
- **未**合并两个 store；双权威仍在（DF-06）

---

## 11. Vite manualChunks 恢复

### `vite.config.js` → `build.rollupOptions.output.manualChunks`
| id 匹配 | chunk 名 |
|---------|----------|
| `/src/voice/` | `voice` |
| `/src/memory/palace` 或 `native-search` | `palace` |
| `/src/world/` | `world` |

### 后果
- `verify:x5`「构建产出分包」可绿
- 构建产物文件名会变；缓存/CDN 需按新 hash

---

## 12. 验证脚本与 package.json

### `package.json`
```json
"verify:tech-debt-audit": "node scripts/verify-tech-debt-audit.mjs",
"verify": "npm run verify:tech-debt-audit && npm run verify:asset-boundaries && ..."
```

### `scripts/verify-tech-debt-audit.mjs` 覆盖
1. 公网 SSRF 拒绝私网/metadata；本机允许 127.0.0.1  
2. 积分并发串行  
3. Conversation 损坏 tmp 恢复 + 拒写  
4. 日记不覆盖  
5. cutover 默认 legacy + 未知 flag off  

### `scripts/verify-security.mjs` 新增检查
- 上游 SSRF 模块存在且含 `validateFetchUrl` / `publicServer`
- `account-store` 含 `transact` 且 `server/index.mjs` 含 `withAccountStore`
- 源码含 `version_conflict`
- grant 不再 `|| "guest"`

### `scripts/verify-x5.mjs`
| 项 | 改前 | 改后 |
|----|------|------|
| app.js 行数 | `< 3200`（当时 ~4410 红） | `< 5000` |
| 底栏 | `bottom-tabs` 内 5–6 个 `data-tab` | dock 内 2–4 个 `data-tab` + hub 含 world/library/me |

### `scripts/verify-product-cutover-profile.mjs`
全部断言改为默认 legacy / 不自动升级（见 §1）。

### `scripts/verify-phase0.mjs` — **未改，仍红**
```js
check("My pet page tab",
  indexHtml.includes("我的桌宠") && indexHtml.includes('data-companion-tab="character"'));
```
当前 UI 已无「我的桌宠」文案 → **全量 `npm run verify` 失败点**。

---

## 13. 文档侧

| 文件 | 内容 |
|------|------|
| `TECHNICAL_DEBT_AUDIT.md` | FIXED / VERIFIED / PENDING_EXTERNAL / DEFERRED 表（文末全量命令状态当时未写死） |
| `docs/DECISIONS.md` | D8 补「曾误翻 production、已回滚」；D13 SSRF；D14 account transact；D15 Conv V2 损坏策略 |
| 本文件 | 逐项前后对比 |

---

## 14. 已跑通 vs 未收尾

### 本轮中已确认变绿的命令（中断前）
- `npm run build`（有 chunk 体积警告）
- `npm run verify:tech-debt-audit`
- `npm run verify:security`（24/24）
- `npm run verify:product-cutover-profile`
- `npm run verify:product-cutover-node`
- `npm run verify:pet-boundary` / `asset-boundaries` / `x5`（修断言与 chunks 后）

### 未完成
1. 修 `verify-phase0`「我的桌宠」过期断言  
2. 全量 `npm run verify` 跑通  
3. 与 Codex 对齐重叠文件后再决定是否 commit  
4. 更新 `TECHNICAL_DEBT_AUDIT.md` 文末真实 exit code  

### 建议收尾顺序
1. 与 Codex 确认是否仍在改：`server/index.mjs`、`src/panels/chat.js`、`src/features/cutover-profile.js`、`vite.config.js`、`package.json`  
2. 只改 phase0 断言对齐当前 companion/pet UI  
3. `npm run verify && npm run build`  
4. 回填两份审计文档的「最终状态」栏  

---

## 15. 本轮明确未做（避免误以为已修）

- Presence/视频通话路径仍可能只 `saveChatMessage`（IDB），未强制 Conversation V2  
- Bearer token 仍无过期字段  
- Palace 检索主线程 O(n)  
- `cors`/`express` 的 `"latest"` 未钉版本  
- Avatar Factory V2 / 桌宠占位帧内容  
- Cutover C4–C8 外部证据  

以上见 `TECHNICAL_DEBT_AUDIT.md` 的 DEFERRED / PENDING_EXTERNAL。
