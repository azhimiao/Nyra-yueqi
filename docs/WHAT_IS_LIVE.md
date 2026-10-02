# 月栖：现在真正生效的部分

Updated: 2026-09-14

这份文档只写**默认会跑、用户能碰到**的路径。  
代码在、界面在、某次 verify 绿了，都不算生效。

发版能不能上架：看 `docs/qa/product-cutover/STATUS.md`（当前 **NOT READY**）。  
工程厚薄：看 `docs/CURRENT_STATE.md`。  
改功能先对表：`.cursor/skills/yueqi-feature-map/SKILL.md`。

## 一句话

本地优先的 AI 陪伴 OS：双壳 + 可选桌宠 + 可选 Android 悬浮 + Node 网关。  
厚原型。**不是**已过 C8 的上架产品。新安装默认 `legacy`，智能/统一记忆 flags **关**。

## 新用户实际会走的路

```text
开屏 Nyra 字标
  → 产品门 CP-16：语言 → 账号 → App / 小手机（不选角色、不选桌宠）
  → First Light v2 关系问卷（老用户有痕迹会迁移并跳过）
  → 进壳：聊天（Pop）或小手机桌面
```

入口：`src/splash/` → `src/onboarding/wizard.js` → `src/first-light/production-v2.js` → `src/app.js` / `src/phone-shell/`。

引导**不**选桌宠。桌宠是进壳之后可选打开的。

## 默认就接通（不改 flag 也在）

| 表面 | 用户实际得到的 | 入口 | 要什么才会「真的说话/干活」 |
|---|---|---|---|
| App 壳 | 底栏：聊天 / 空间 / 陪伴 | `index.html` `.app-shell` | 选了 App 模式 |
| 小手机 | 同一份数据的图标桌面 | `src/phone-shell/` | 选了小手机模式 |
| 中/英 | 界面文案切换 | `src/i18n/` | 产品门选语言 |
| Pop 聊天 | 主会话、流式回复、通讯录 | `src/panels/chat.js` | 配好 Hosted 或 BYOK |
| Conversation V2 | 回合写入的权威会话 | `src/conversation/` | 聊天成功必须写这里 |
| 角色卡 | 名、称呼、系统提示、边界 | `src/characters/store.js` | 内置 `char-xingli`；First Light 可改 |
| Prompt 拼装 | 人设 + 契约 + 检索进模型 | `compilePrompt`，`src/prompt/` | 模型能通 |
| 路由 | 「你好」走 `companion_chat`；自拍/日记可短路径 | `src/agent-orchestrator/` | — |
| Runtime 标记 | `<yueqi-runtime>` 驱动表情/动作 | `src/runtime/protocol.js` | 模型按协议回 |
| 宫殿 RAG | 按本轮检索旧记忆 | `src/memory/rag.js` | 库里有可检索内容；新用户常空 |
| 世界书 | 设定条目可进 Prompt | `src/worldbook/` | 用户写了条目 |
| 摘要 / 主动找你 | flag 默认开 | `DEFAULT_FEATURES` | 主动行为还受问卷/开关约束 |
| 日记 / 相册 / 日历 | 界面和本地存储在 | diary、`visual-memory`、calendar | 日记要用户写；日历写系统日历要授权 |
| 一起听 / 一起看 | 共听、共读 EPUB 等 | library / listen / read | 有资源 |
| 朋友圈 | 小手机动态 | phone `moments` | **未授权不进 Prompt** |
| 桌宠外观 | 月栖·昼 / 夜、星梨、气泡 | `src/avatar/pet-catalog.js` | 用户打开开关后才浮出来 |
| 应用内浮宠 | 月栖里面的可点角色 | `src/ui/companion-float.js` | `yueqi.browserPetEnabled=1` |
| 创意栈 | 情景剧 / 漫卷 / 共创 / 冒险 / 游戏 | 各 phone app | 打开对应图标才进；游戏要已装 |
| 栖机助手 / 探索 / 任务 | 改设置、选 Agent、审批 | `studio-assist`、`skill-platform`、task-center | 高风险要确认；默认拒网/拒文件 |
| 商城 / 栖市 | 栖币与应用市场 UI | economy | 与 BillingCredit **隔离、不互转** |

普通聊天**默认不涨**关系分数。 Continuity 是投影，不是亲密度打分条。

## 要条件才生效（界面在，没配就不工作）

| 条件 | 生效的东西 | 没配时 |
|---|---|---|
| 账号 + 网关 Hosted 密钥 | 托管模型、按次扣 BillingCredit | 聊不了托管档 |
| 用户自己填 BYOK | 网关转发，Key 不落服务端库 | 接口页是空的 |
| 语音凭据或设备 TTS | 朗读 / 识别 | 语音按钮在，出不了声或走设备 TTS |
| 网关 `GET /notices/active` 有通告 | App 内通告或强制更新窗 | 不弹；不是系统通知 |
| Android「显示在其他应用上层」 | 离开月栖后的系统桌宠 | 人在 App 里只看应用内浮宠 |
| Electron 桌面宿主 | Windows 桌宠窗 | 浏览器里没有系统桌宠 |
| 运营配好更新包签名 | 强制更新挡板 | 更新接口可 503 |

桌宠 ≠ 角色：`yueqi.selectedPetId` 是样子，`yueqi.activeCharacterId` 是身份和记忆。不要混用。

当前源码里：月栖在前台藏系统悬浮窗，只留应用内浮宠；离开应用再出系统窗。系统窗要能加载 `/assets/characters/...`（已映射到 Capacitor `/public/assets/`）。**手里旧 APK 没有这套逻辑，必须重打才能在真机上对上。**

## 默认不生效（代码在也不要当产品行为）

`src/constants.js` `DEFAULT_FEATURES` 里这些是 **false**：

- 智能：`temporalContextV1`、`turnUnderstandingV1`、`relationshipContinuityV1`、`palaceProjectionV1`、`webRetrievalV1`
- 统一记忆：`unifiedMemoryAdaptersV1`、`memoryProjectionOutboxV1`、`diaryRepositoryV1`、`palaceProjectionOnlyV1`、`contextGraphProjectionOnlyV1`、`singleBrokerRetrievalV1`、`unifiedMemoryForgetV1`

Cutover 默认 `legacy`（`src/features/cutover-profile.js`）。  
`palaceProjectionV1` ≠ `palaceProjectionOnlyV1`。

另外默认不要当真：

| 项 | 实际 |
|---|---|
| Avatar Factory V2 | **PAUSED**。活跃轨是 generate-xingli / yueqi-*-source，见 `docs/ACTIVE_PET_PIPELINE.md` |
| 设定页「开场白 / 后置指令 / 场景 / 示例」栏 | 有栏，**保存未进模型** |
| 统一记忆 / 网页检索 | 要显式改 profile 或 flags，且 C4 真检索证据仍缺 |
| 火山全家桶 | Hosted 文本/生图可走方舟档；语音要另配凭据+单价 |
| Native Keystore | 仍有 Preferences 路径；不要说「密钥已进系统钥匙串」 |
| iOS 系统悬浮 | 不承诺 Android 同款跨应用桌宠 |

## 平台各自生效到哪

| 宿主 | 真正在用的 | 不要当成已过门禁 |
|---|---|---|
| 浏览器 `npm run start` | 双壳、聊天、First Light、应用内浮宠 | 不是上架包 |
| Capacitor Android | 同上 + 可选系统悬浮 | C7 真机矩阵未过；旧包桌宠曾「已打开但空白」 |
| Electron | 桌面透明宠窗 | 仅桌面 |
| `server/` :8787 | 模型/语音/图/账本/通告 | 无 `.env` 密钥则托管全灭 |
| 官网 memprism.com | **另一仓** `F:/nyra-website`，不是本 App | 网页改了 ≠ App 改了 |

Web IndexedDB ≠ 真机 SQLite（`src/storage/sqlite-adapter.js`）。

## 本地怎么确认「生效」

```bash
cd F:/beautiful
npm run start          # Vite 5173，可选带 8787
# 走完语言/账号/壳 → First Light → 聊天
# 接口页配 OpenAI 兼容或托管后，才能听到角色说话
```

相关门禁（绿了只证明合同，不证明真机）：

- `npm run verify:onboarding-cp16`
- `npm run verify:companion-presence`
- `npm run verify:phase1`
- `npm run verify:notices`（通告策略；服务端没通告仍不弹窗）

全量 `npm run verify` 极长，且 **C8 仍 FAIL**。

## 允许说 / 禁止说

**可以说：** 本地能走完引导和 Pop；Conversation V2 是会话权威；flags 默认关；某条 Node verify PASS。

**不能说：** 已过审、可上架、统一记忆已对用户开、Avatar V2 已达观感验收、Android / Live BYOK 已过（除非有当次真机或线上证据）。
