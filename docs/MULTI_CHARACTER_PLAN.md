# 月栖 · 多角色卡改造计划

> 参考：`E:\AIPlatform\warmland-effect`（`characters` 库 + `companion.activeContact` + 1:1 会话）  
> 日期：2026-07-18 · 更新：2026-07-25  
> 关联：[SCENARIO_THEATER_PLAN](./SCENARIO_THEATER_PLAN.md)

---

## 0. 目标

| 规则 | 含义 |
|------|------|
| **可创建多张角色卡** | 角色库 + 创建/编辑/删除/激活 |
| **多角色聊天** | 每角色独立 DM 会话；另支持 **创建群聊** |
| **桌宠 ↔ 激活角色** | 皮肤绑 `activeCharacterId` 的 `petId` |
| **Pop 列表** | 多条 1:1 + 群会话 |
| **情景剧** | 开幕多选卡司 |

**群聊回复（已定）：** 每轮点将 **1** 个成员回一条；可用 `@角色名` 指定。不做同轮多气泡连麦。

---

## 1. 心智模型

```
Character  = 一张角色卡（角色库）
Contact    = Pop 通讯录好友（显式添加，创建/导入不自动加）
Active     = 陪伴主角色（桌宠）
DM         = sessionId char:{characterId}（仅 contacts 出现在列表）
Group      = sessionId group:{uuid} + memberIds（成员来自 contacts）
Scenario   = cast.leadId + memberIds
```

**角色库 ≠ 通讯录：** 创建/导入只进 `characters`；在 Pop → 通讯录 →「添加朋友」后才可私聊/拉群。一次性迁移会把升级前已有角色写入通讯录，避免老用户空列表。见 `src/characters/contacts.js`。

---

## 2. 数据模型

见 `src/characters/store.js` · `src/characters/ids.js` · `src/characters/contacts.js`。

`CharacterRecord`：`id, name, alias, avatarUrl, profile, petId, loreEntryIds, createdAt, updatedAt, source`

`PopContact`：`characterId, nickname?, addedAt` → `localStorage` key `yueqi.pop.contacts.v1`

`activeCharacterId` → `localStorage` key `yueqi.activeCharacterId`

事件：`yueqi:characters-changed` · `yueqi:companion-changed` · `yueqi:pop-contacts-changed`

---

## 3. 分期

| 阶段 | 状态 | 交付 |
|------|------|------|
| **M0** | ✅ 完成 | 角色库 CRUD、迁移、active API、`verify:characters-m0` |
| **M1** | ✅ 完成 | `session-context`、按卡 profile、分会话收发、`verify:characters-m1` |
| **M2** | ✅ 完成 | pet 绑激活角色；float/phone 听 companion-changed；`verify:characters-m2` |
| **M3** | ✅ 完成 | Pop 会话列表 + DM 线程 + 通讯录动态；`verify:characters-m3` |
| **M4** | ✅ 完成 | 创建群聊 + 点将/@；`verify:characters-m4` |
| **M5** | ✅ 完成 | 情景剧卡司多选 + 导演注入；`verify:characters-m5` |

### M0 落点

| 路径 | 说明 |
|------|------|
| `src/characters/ids.js` | `BUILTIN_CHARACTER_ID`、`dmSessionId` |
| `src/characters/store.js` | CRUD / active / `ensureCharactersMigrated` |
| `src/constants.js` | `MEMORY_DB_VERSION=6`、`characters` keys |
| `src/storage/db.js` | `characters` object store |
| `src/app.js` | 启动调用迁移 |
| `scripts/verify-characters-m0.mjs` | `npm run verify:characters-m0` |

迁移：`yueqi.profile.v1` → `char-xingli`；`default-session` → `char:char-xingli`；`selectedPetId` → 该卡 `petId`。

### M1 落点

| 路径 | 说明 |
|------|------|
| `src/characters/session-context.js` | `getChatFocus` / `setChatFocusCharacter` / `ensureDmConversation` |
| `src/characters/profile.js` | store ↔ prompt profile 映射 |
| `src/app.js` | `collectCharacterProfile(id)`、动态 session、focus 切换重载历史 |
| `src/panels/chat.js` | `getSessionId()` 写入与组消息 |
| `src/prompt/assemble.js` | `sessionId` 选历史 |
| `scripts/verify-characters-m1.mjs` | `npm run verify:characters-m1` |

### M2 落点

| 路径 | 说明 |
|------|------|
| `src/avatar/pet-catalog.js` | `bindCharacterPetBridge`；读写走激活卡 `petId` |
| `src/characters/store.js` | bridge：sync 写缓存 + 持久化 |
| `src/ui/companion-float.js` | 听 `yueqi:companion-changed` remount |
| `src/phone-shell/phone-shell.js` | 同上 +「绑定到：{名}」 |
| `src/runtime/companion-runtime.js` | 名跟 `getCompanionCharacterId`（激活角色） |
| `scripts/verify-characters-m2.mjs` | `npm run verify:characters-m2` |

### M3 落点

| 路径 | 说明 |
|------|------|
| `src/characters/sessions.js` | `listDmSessions` / `openDm` |
| `src/phone-shell/phone-shell.js` | 列表↔线程、发起聊天 sheet、通讯录设陪伴 |
| `src/ui/phone-shell.css` | 会话行 / sheet 样式 |
| `scripts/verify-characters-m3.mjs` | `npm run verify:characters-m3` |

### M4 落点

| 路径 | 说明 |
|------|------|
| `src/characters/group-chat.js` | `createGroupConversation` / `pickGroupSpeaker` / `@` 点将 |
| `src/characters/session-context.js` | `kind:"group"` focus + speaker meta |
| `src/characters/sessions.js` | `listPopSessions` 含群 |
| `src/prompt/assemble.js` | `groupRoster` 注入 |
| `src/app.js` / `src/panels/chat.js` | 群回合选发言人并写入 metadata |
| `src/phone-shell/phone-shell.js` | 新建私聊/群聊、群气泡发言人 |
| `scripts/verify-characters-m4.mjs` | `npm run verify:characters-m4` |

### M5 落点

| 路径 | 说明 |
|------|------|
| `src/scenario/cast.js` | `normalizeCast` / `buildCastPromptBlock` |
| `src/scenario/presets.js` | 开箱剧本 |
| `src/scenario/store.js` | scripts / runs + `cast` |
| `src/scenario/director.js` | 导演 prompt 注入卡司 |
| `src/scenario/theater-ui.js` | Lobby / Curtain 多选卡司 / Stage / Finale |
| `src/ui/scenario-theater.css` | 舞台视觉 |
| `src/phone-shell/apps-catalog.js` | app `scenario` |
| `src/phone-shell/phone-shell.js` | 挂载情景剧屏 |
| `scripts/verify-characters-m5.mjs` | `npm run verify:characters-m5` |

---

## 4. 明确不做（远期）

- 同轮多角色连麦  
- 每角色独立记忆宫殿分库  
- mask 多账号分区  
