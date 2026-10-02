# 问题审计（只报告，不改代码）

**日期：** 2026-08-13（续）  
**仓库：** `F:/beautiful`  
**约束：** 本文只记录「可能有问题」的点 + 判断依据；**不包含修复方案实现、不改代码**。  
**相关：** 已落地改动见 [`AUDIT_CHANGELOG_2026-08-13.md`](./AUDIT_CHANGELOG_2026-08-13.md)；分类总表见 [`../TECHNICAL_DEBT_AUDIT.md`](../TECHNICAL_DEBT_AUDIT.md)。

---

## 怎么读这份文档

| 字段 | 含义 |
|------|------|
| 严重度 | P0 影响发版判断 / 大面积数据或安全；P1 真实故障或可利用；P2 规模化或边界才痛 |
| 置信度 | high = 代码路径清楚；medium = 需结合部署/调用才爆；low = 嫌疑 |
| 状态 | `仍开放` / `补丁不完整` / `已补丁需复验` / `运营脚枪（设计如此但易误用）` |

只收录我认为**值得后期处理**的项；风格/命名/已暂停 Avatar Factory V2（除非拖垮主应用）不写。

---

## P0 — 发版 / 产品真相

### AUD-01 · Cutover 仍 NOT READY，Node 绿 ≠ 可发版

| | |
|--|--|
| **类别** | test-gap / footgun |
| **严重度** | P0 |
| **置信度** | high |
| **状态** | 仍开放 |

**依据**
- `docs/qa/product-cutover/STATUS.md`：Release verdict **NOT READY**；C4/C5 BLOCKED，C6 E2E FAIL 7/12，C7 未跑，C8 FAIL。
- `npm run verify:product-cutover-node` 可以 PASS；`verify:product-cutover-release` 设计上应诚实 FAIL。
- `AGENTS.md` / `CURRENT_STATE` 已写「历史 CP 完成报告 ≠ 可发版」。

**为什么算问题**  
用全量 `npm run verify` 或 Node cutover 绿去宣称 production_v1 / 上架，会把未验证的浏览器/真机/搜索路径当成已验收。

**后期怎么验**  
读 STATUS；跑 `verify:product-cutover-release`；不要把 Node 绿当 C8。

---

## P1 — 数据丢失 / 双权威 / 安全

### AUD-02 · 云同步「version 冲突」形同虚设（schema 版本当修订号）

| | |
|--|--|
| **类别** | api-contract / data-loss |
| **严重度** | P1 |
| **置信度** | high |
| **状态** | **补丁不完整**（changelog 曾标 FIXED） |

**依据**
- 服务端 `POST /sync/upload`：仅当 `version < serverVersion` 才 409；成功写 `Math.max(version, serverVersion)`。
- 客户端 `src/sync/client.js` L31–32：每次上传固定 `version: SYNC_PAYLOAD_VERSION`。
- `src/constants.js`：`SYNC_PAYLOAD_VERSION = 2` —— 这是**备份 schema 常量**，不是单调递增的同步修订号。
- 客户端无 `version_conflict` 处理（`rg version_conflict src/sync` 无业务分支）。
- `verify:security` 只 grep 源码有没有字符串 `version_conflict`。

**失败模式**  
设备 A 上传后 serverVersion=2；设备 B 再上传仍带 version=2 → `2 < 2` 为假 → **200 静默覆盖**。双设备 / 自动同步仍是 last-write-wins。正常客户端几乎永远打不到 409。

**后期怎么验**  
同一账号两次上传不同 payload、version 都为 2；第二次应仍 200 且 download 为后者。再确认客户端无 409 重试/merge。

---

### AUD-03 · Presence / 语音视频路径只写 IDB，绕过 Conversation V2

| | |
|--|--|
| **类别** | duplicated-state / data-loss |
| **严重度** | P1 |
| **置信度** | high |
| **状态** | 仍开放 |

**依据**
- `src/ui/companion-presence-wire.js`：视频截帧 / 语音气泡直接 `saveChatMessage(...)`（约 L277、L339）。
- 主路径：`src/conversation/companion-write.js` + Pop `writePopTurn` 以 V2 为权威；`app.js` `addMessage` 在 V2 失败时打日志「refusing IDB-only」。
- Presence wire **不走**该门闸。

**失败模式**  
语音/视频回合出现在 IndexedDB，但不进 `yueqi.conversation.v2` → 备份、多端、prompt 装配、多 companion 作用域与 UI 历史不一致。

**后期怎么验**  
走一通视频截帧或语音落盘 → 对比 V2 bag 与 IDB `messages` 是否都有该内容。

---

### AUD-04 · 桌面 Pop 开始游戏 system 消息直接 IDB

| | |
|--|--|
| **类别** | duplicated-state |
| **严重度** | P1 |
| **置信度** | high |
| **状态** | 仍开放 |

**依据**
- `src/panels/chat.js` `startDesktopPopGame`（约 L1083–1089）：`saveChatMessage` 写 `kind: "pop-game-start"`，无 `writePopTurn` / companion-write。

**失败模式**  
与 AUD-03 同类：系统横幅进 IDB、不一定进 V2。

**后期怎么验**  
开始一次桌面 Pop 玩法 → 查 V2 是否有对应 system turn。

---

### AUD-05 · Bearer 永不过期、不可按会话吊销

| | |
|--|--|
| **类别** | auth |
| **严重度** | P1 |
| **置信度** | high |
| **状态** | 仍开放 |

**依据**
- `server/index.mjs` `tokenFor` / `userFromAuth`：payload 仅 `{ u, s }`（HMAC(userId)），无 `exp` / `iat` / `jti`。
- 只要 `YUEQI_AUTH_SECRET`（或派生 secret）不变，旧 token 永久可用。

**失败模式**  
token 泄露 → 无限期 sync / model / 商业接口访问。单端「登出」无法作废其它端，除非轮换全局 secret（伤及所有用户）。

**后期怎么验**  
登录拿 token，隔任意时间调 `/sync/download`；解码 payload 确认无过期字段。

---

### AUD-06 · 账号 store 锁不完整：多数写路径绕过 `transact`

| | |
|--|--|
| **类别** | race |
| **严重度** | P1 |
| **置信度** | high |
| **状态** | **补丁不完整**（积分 charge 已串行） |

**依据**
- `server/account-store.mjs`：`transact` 有队列。
- `server/index.mjs`：`writeStore = accountStore.writeStore`（**不经队列**）。
- `chargeManagedCredits` / sync upload / grant 用 `withAccountStore`。
- register / login / productMode / `admin/subscriptions/activate` 等仍是 `readStore` + `writeStore`。

**失败模式**  
扣积分与管理员改 credits / 改订阅状态并发 → 丢更新（积分回滚或订阅被旧快照覆盖）。单 Node 进程即可复现。

**后期怎么验**  
并行：托管 chat 扣费 + admin activate 改同一用户 credits；对比最终 `store.json`。静态：`rg "await writeStore|withAccountStore" server/index.mjs`。

---

### AUD-07 · Native 密钥仍落在 Capacitor Preferences

| | |
|--|--|
| **类别** | security |
| **严重度** | P1 |
| **置信度** | high |
| **状态** | 仍开放 |

**依据**
- `src/platform/secure-store.js`：原生走 Preferences（前缀 `yueqi.secret.`）；注释指向 `NATIVE_SECRETS_PLAN.md`，Keystore/Keychain 未落地。
- Web 侧 sessionStorage 相对更短命。

**失败模式**  
Android/iOS 上 BYOK key 可被备份/取证/root 场景读出，非硬件安全区。

**后期怎么验**  
真机写入 provider key 后检查 Preferences 是否出现明文/可导出项。

---

### AUD-08 · 本机网关默认非 publicServer：可达网络时 BYOK 可打内网

| | |
|--|--|
| **类别** | security / footgun |
| **严重度** | P1 |
| **置信度** | medium |
| **状态** | 运营脚枪（SSRF 模块已存在，默认模式仍宽） |

**依据**
- `YUEQI_PUBLIC_SERVER === "1"` 才是公网硬化；默认 false → `assertSafeUpstreamUrl` **允许** loopback（Ollama 场景）。
- 默认 `HOST` 多为 `127.0.0.1`，但若部署写成 `0.0.0.0` 且未开 publicServer，认证用户（或被盗 bearer，见 AUD-05）可把网关当 SSRF 跳板打内网。
- `/model/chat` 等不走 `requireLocalToken`（local token 主要用于 `/world/viber/forward` 等）。

**失败模式**  
错误部署的「开发者模式网关」暴露在局域网/公网 → 内网探测 / 元数据周边（公网模式会拦，本模式不拦私网）。

**后期怎么验**  
`HOST=0.0.0.0` 且不设 publicServer，登录后 BYOK `baseUrl=http://10.x`；对比 `YUEQI_PUBLIC_SERVER=1` 应拒绝。

---

### AUD-09 · Cutover / feature flag 易被 Agent 误判为「已开启」

| | |
|--|--|
| **类别** | footgun |
| **严重度** | P1（对错误产品结论） |
| **置信度** | high |
| **状态** | 行为已偏安全（默认 legacy + opt-in）；脚枪仍在 |

**依据**
- `DEFAULT_CUTOVER_PROFILE = "legacy"`；`isFeatureEnabled` 为 `=== true`。
- `DEFAULT_FEATURES` 里 W*/M* 多为 false；且存在易混的 `palaceProjectionV1` vs `palaceProjectionOnlyV1`。
- 文档已警告，但代码存在 ≠ 用户路径开启。

**失败模式**  
Agent/人把「实现了 turn understanding」当成线上默认行为；或未经验证就切 `production_v1`。

**后期怎么验**  
`verify:product-cutover-profile`；冷启动确认 `turnUnderstandingV1` 等为 off。

---

### AUD-10 · 桌宠 ID ≠ 角色 ID（记忆串线脚枪）

| | |
|--|--|
| **类别** | footgun |
| **严重度** | P1 |
| **置信度** | high |
| **状态** | 仍开放（产品边界，非单点 bug） |

**依据**
- `AGENTS.md` / `KNOWN_ISSUES`：`selectedPetId` vs `activeCharacterId`。
- Electron pet-v2 与 in-app float 双栈；边界靠 verify，新代码易接错。

**失败模式**  
记忆/会话/prompt 绑到 petId → 换桌宠外观串角色记忆。

**后期怎么验**  
`verify:pet-boundary` / `verify:asset-boundaries`；review 任何把 `selectedPetId` 写入 conversation 的新路径。

---

## P2 — 规模化 / UX / 依赖

### AUD-11 · Conversation V2 损坏后：UI 可能显示成功但未落盘

| | |
|--|--|
| **类别** | ux-break / data-loss |
| **严重度** | P2 |
| **置信度** | medium |
| **状态** | 补丁防「空写抹库」已在；用户可见恢复仍弱 |

**依据**
- `store.js`：`writeBlockedReason` 时 `persistSession` 失败、不写盘。
- `app.js` `addMessage`：DOM 往往先画；V2 失败主要 `console.error`，未见统一阻断/toast。
- 损坏防抹库已测于 `verify:tech-debt-audit`。

**失败模式**  
用户以为发出去了，刷新后最近几条消失（比整库清空好，仍伤信任）。

**后期怎么验**  
故意破坏 `yueqi.conversation.v2`（及 `.tmp`）→ 发消息 → 刷新 → 看是否丢失且有 `.corrupt.*` key。

---

### AUD-12 · `addMessage` 在 `skipConversationWrite` 等分支仍可只写 IDB

| | |
|--|--|
| **类别** | duplicated-state |
| **严重度** | P2 |
| **置信度** | medium |
| **状态** | 仍开放（有意分支需盘点） |

**依据**
- `app.js` ~L942–949：`else if (type === user|ai)` 直接 `saveChatMessage`（当未走 V2 分支时）。
- 需逐个调用方确认 `skipConversationWrite` / `persist` 语义，避免「以为权威写了」。

**失败模式**  
辅助表面误用 options → 又一条 IDB-only 历史。

**后期怎么验**  
`rg "addMessage\(|skipConversationWrite" src` 做调用图。

---

### AUD-13 · 记忆宫殿候选池主线程 O(n) 余弦

| | |
|--|--|
| **类别** | performance |
| **严重度** | P2 |
| **置信度** | high |
| **状态** | 仍开放 |

**依据**
- `src/memory/palace/pool-rank.js` `buildCandidatePool`：对全部 record 算 `cosineSimilarity` 再 sort。

**失败模式**  
宫殿条目上千后，开 RAG 的聊天回合主线程卡顿。

**后期怎么验**  
灌入大量带 embedding 记录，Performance 面板看 palace search。

---

### AUD-14 · 剧章双 key 双权威

| | |
|--|--|
| **类别** | duplicated-state |
| **严重度** | P2 |
| **置信度** | high |
| **状态** | 仍开放（备份已两边都列，未合并） |

**依据**
- `yueqi.story.v1`（`story/store.js`）与 `yueqi.story.sessions.v1`（`story-app.js`）。
- `DATA_MODULES` 现含 `story` + `storySessions`。

**失败模式**  
UI 读 A、恢复只关心 B → 剧情「空了」或只恢复一半。

**后期怎么验**  
两边都造数据 → 导出导入 → 两 UI 是否一致。

---

### AUD-15 · `cors` / `express` 依赖 `"latest"`

| | |
|--|--|
| **类别** | deps |
| **严重度** | P2 |
| **置信度** | high |
| **状态** | 仍开放 |

**依据**
- `package.json` dependencies：`"cors": "latest"`, `"express": "latest"`。

**失败模式**  
不同时间 `npm install` 解析到不同大版本 → 网关行为不可复现或突然 break。

**后期怎么验**  
两台干净机隔天 `npm ls express cors` 对比 resolved。

---

### AUD-16 · Admin 订阅激活仅靠共享 `YUEQI_ADMIN_TOKEN`

| | |
|--|--|
| **类别** | auth |
| **严重度** | P2 |
| **置信度** | medium |
| **状态** | 仍开放（有 token 门，但无审计/过期/分权） |

**依据**
- `POST /admin/subscriptions/activate`：校验 `x-yueqi-admin-token` vs env；通过后可改任意用户订阅与 credits（且写路径见 AUD-06）。

**失败模式**  
admin token 泄露 = 任意开订阅/刷积分；无操作审计字段时难追溯。

**后期怎么验**  
无 token / 错 token → 401；对 token 泄露面做威胁模型（日志、CI、共享 env）。

---

## 本轮复核：不上升为「仍开放 P0/P1」的项

| 主题 | 结论 |
|------|------|
| Cutover 默认 legacy + flag opt-in | 磁盘上仍在；作脚枪见 AUD-09，不当未修安全洞 |
| 上游 SSRF 模块 + stream body 守卫 | 仍在；部署默认见 AUD-08 |
| Conv V2 quarantine / writeBlocked | 仍在；UX 残留见 AUD-11 |
| `/external/grant` 需登录 | 磁盘上仍为鉴权 + `withAccountStore`（勿信过期 Read 缓存） |
| `verify-phase0`「我的桌宠」 | **changelog 过时**：当前脚本已 PASS 29/29 |
| 日历等 escapeHtml | 抽样未见明确 XSS 洞；`innerHTML` 多处需个案审，未单列为 P1 |
| `data-i18n-html` | 仓库 `index.html` 无匹配；风险取决于翻译源是否可信 |

---

## 建议后期处理顺序（仍不改代码，仅优先级）

1. **AUD-02** 同步真正修订号 + 客户端 409 策略（否则「冲突检测」是假安全）  
2. **AUD-03 / AUD-04** Presence + Pop game 纳入 V2 权威写  
3. **AUD-06** 所有 account 写进 `transact`（或禁止裸 `writeStore`）  
4. **AUD-05 / AUD-07** token 过期 + native Keystore  
5. **AUD-08** 部署检查清单（HOST / PUBLIC_SERVER）  
6. **AUD-01** 发版纪律（C8 证据）  
7. P2：宫殿性能、story 合并、deps pin、损坏 UI  

---

## 复验命令包（只读）

```bash
npm run verify:tech-debt-audit
npm run verify:security
npm run verify:product-cutover-profile
npm run verify:phase0
npm run verify:pet-boundary
# 手工：AUD-02 双端 sync LWW；AUD-06 charge∥admin write
```
