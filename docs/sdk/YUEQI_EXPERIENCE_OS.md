# 月栖体验操作系统（YEOS）标准

> 品牌：**月栖**（Nyra）  
> 标准名：**YEOS**（Yueqi Experience Operating System）  
> 版本：**1.0.0-draft**  
> 日期：2026-07-28  
> 产品定义：[APP_MARKETPLACE_ECOSYSTEM.md](../APP_MARKETPLACE_ECOSYSTEM.md)  
> 执行计划：[YUEQI_ECOSYSTEM_EXECUTION.md](../YUEQI_ECOSYSTEM_EXECUTION.md)  
> 既有扩展基线：[align/F7.md](../align/F7.md) · `src/phone-ext/`

---

## 0. 标准要解决什么

月栖小手机不只是几个内置 App，而是一套 **可安装体验的操作系统面**：

| 层 | 职责 |
|----|------|
| **栖市** | 发现 / 安装 / 更新 / 卸载 |
| **包契约** | manifest + 权限 + 入口文件 |
| **运行时** | iframe / 舞台宿主 + Host Bridge |
| **宿主 API** | 角色、模型、存档、Pop、时间线（开发者只调 API，不碰密钥） |
| **记忆回写** | 局终 / 谢幕事件进同栖时间线与短期记忆 |

开发者用 **单文件 HTML（或小 ZIP）** 写游戏 / 插件 / 模式包 → 侧载进栖市 → 用户打开即玩。  
设计参考业界常见的「游戏大厅 + iframe 沙盒 + 宿主注入全局对象」模式；月栖对外一律使用本标准命名，不出现竞品品牌。

---

## 1. 包种类（kind）

所有可安装物必须是 ZIP，根目录含 `manifest.json`。

| `kind` | 后缀建议 | 入口 | 宿主全局对象 | 货架 Tab |
|--------|----------|------|--------------|----------|
| `yueqi-phone-ext` | `.yueqi-ext.zip` | `index.html` | `window.NyraHost` | 工具 / 扩展 |
| `yueqi-game` | `.yueqi-game.zip` | `game.html` | `window.NyraGame` | 游戏 |
| `yueqi-pop-plugin` | `.yueqi-plugin.zip` | `plugin.js` 或 `index.html` | `window.NyraPop` | 聊天插件 |
| `yueqi-experience` | `.yueqi-xp.zip` | 按 `category` | 运行时内置 + 可选 `window.NyraXp` | 演出 |

兼容：`yueqi-phone-ext` 保持 F7 已实现契约；本标准在其上 **扩展** 游戏 / 插件 / 体验，不破坏旧包。

### 1.1 通用 manifest 字段

```ts
{
  schemaVersion: 1,
  kind: "yueqi-game" | "yueqi-pop-plugin" | "yueqi-experience" | "yueqi-phone-ext",
  id: string,                 // ^[a-z][a-z0-9-]{2,48}$
  name: string,               // ≤ 32
  version: string,            // semver x.y.z
  author?: string,
  description?: string,       // ≤ 200
  contentRating: "general" | "mature",
  icon?: string,              // 相对路径，禁 ..
  minHostVersion?: string,    // 对照 APP_VERSION
  permissions: PermissionId[],
  category?: ExperienceCategory | "game" | "utility",
  tags?: string[]
}
```

### 1.2 体验类 category

| category | 对用户 | AI 姿态 | 运行时 |
|----------|--------|---------|--------|
| `theater` | 情景剧 | 演这场戏 | Stage |
| `scroll` | 漫卷 | 演 Gal 吐帧 | Frame Reader |
| `adventure` | 冒险 | DM 推地图事件 | Map Runtime |
| `cocreate` | 共创 | 合著者改章节档 | Cocreate Canvas |

---

## 2. 权限枚举（YEOS 全表）

F7 已有权限继续有效。游戏 / 插件新增：

| PermissionId | 中文 | 说明 |
|--------------|------|------|
| `calendar.read` / `calendar.write` | 日历 | F7 |
| `chat.read` / `chat.send` / `chat.send_token` | Pop | F7 |
| `storage.read` / `storage.write` | 包私有存储 | F7；命名空间 `pkg:<id>:` |
| `notification.show` | 通知 | F7 |
| `timeline.write` | 同栖时间线 | F7；`appId` 必须带包 id |
| `profile.read` | 角色摘要 | F7 |
| `character.list` | 列出可选角色 | 仅 id/名/头像/一句副标题 |
| `character.package.light` | 角色轻量包 | 卡 + 世界书 + 核心/长期记忆摘要，无 API Key |
| `character.package.full` | 角色全量包 | 含更多近期上下文；贵，勿每回合调 |
| `llm.character` | 代调角色模型 | 宿主代调；开发者无密钥 |
| `llm.global` | 代调全局模型 | 裁判/旁白/NPC；不绑角色卡 |
| `game.save` | 读写本游戏存档 | 按 `pkgId + user` 隔离 |
| `game.event` | 写入游戏结束事件 | 仅局终一次推荐 |
| `pop.plugin` | 在 Pop 挂载插件 UI | 工具条 / 半屏 |
| `pop.session` | 读当前会话元数据 | 单聊/群聊类型、会话 id、脱敏成员摘要 |
| `pop.inject` | 向当前会话注入局内消息 | 系统旁白或局内身份；不可伪造用户气泡 |
| `xp.mode` | 注册/驱动体验模式 | 漫卷帧、冒险事件、共创章节写入口 |

**风险提示规则：**

- 仅用 `game.save` / `close` → 低风险，可静默或轻提示。  
- 触及 `character.*` / `llm.*` / `game.event` → 安装或首次运行需 **高级互动确认**。  
- `pop.inject` → 首次在该会话启用插件时确认。

---

## 3. 包格式细则

### 3.1 游戏包 `yueqi-game`

```text
my-dice.yueqi-game.zip
├── manifest.json
├── game.html          # 必填，单页主入口（推荐单文件含 CSS/JS）
├── icon.png           # 可选
└── assets/            # 可选，相对引用；禁止外链密钥/CDN 依赖（建议）
```

`manifest.json` 示例：

```json
{
  "schemaVersion": 1,
  "kind": "yueqi-game",
  "id": "sample-dice-quest",
  "name": "骰声奇遇",
  "version": "1.0.0",
  "author": "示例作者",
  "description": "和角色一起掷骰推进小奇遇",
  "contentRating": "general",
  "entry": "game.html",
  "icon": "icon.png",
  "category": "game",
  "permissions": [
    "character.list",
    "character.package.light",
    "llm.character",
    "llm.global",
    "game.save",
    "game.event",
    "profile.read"
  ],
  "game": {
    "viewport": "phone",
    "allowExternalControl": false,
    "singleFilePreferred": true
  }
}
```

**开发者约定（对标业界「粘贴 HTML 即玩」）：**

1. 优先 **一个 `game.html`** 含全部 UI/逻辑。  
2. `html, body { width:100%; height:100%; margin:0; overflow:hidden; }`。  
3. 主容器预留顶部安全区：`padding-top: var(--nyra-game-safe-top, 72px)`。  
4. 禁止读取模型密钥、角色私库直连、任意 `parent` 逃逸。  
5. 只通过 `window.NyraGame` 调宿主。

### 3.2 Pop 插件 `yueqi-pop-plugin`

```text
werewolf.yueqi-plugin.zip
├── manifest.json
├── plugin.js            # 或 index.html（半屏面板）
└── icon.png
```

```json
{
  "schemaVersion": 1,
  "kind": "yueqi-pop-plugin",
  "id": "sample-dice",
  "name": "投骰子",
  "version": "1.0.0",
  "entry": "plugin.js",
  "contentRating": "general",
  "permissions": ["pop.plugin", "pop.session", "pop.inject", "storage.read", "storage.write", "llm.global"],
  "pop": {
    "hosts": ["dm", "group"],
    "toolbarLabel": "骰子",
    "toolbarIcon": "dices",
    "panel": "sheet",
    "sessionModes": ["tool", "match"]
  }
}
```

| `pop.sessionModes` | 含义 |
|--------------------|------|
| `tool` | 一次性工具（掷一次骰） |
| `match` | 有开局/结束的本局（狼人杀） |

### 3.3 体验包 `yueqi-experience`

不强制开发者重写舞台引擎；多数情况交付 **模式资源 + 策略**：

```text
rain-scroll.yueqi-xp.zip
├── manifest.json
├── premise.md
├── frames/                 # scroll
├── map/world.json          # adventure
├── chapters/               # cocreate
└── prompts/director.txt
```

```json
{
  "schemaVersion": 1,
  "kind": "yueqi-experience",
  "id": "night-rain-scroll",
  "name": "夜雨漫卷",
  "version": "1.0.0",
  "category": "scroll",
  "entry": "frames/index.json",
  "permissions": ["xp.mode", "character.package.light", "llm.character", "timeline.write"],
  "experience": {
    "runtime": "scroll-v1",
    "saveKey": "night-rain-scroll"
  }
}
```

内置运行时（宿主提供）：`theater-v1` / `scroll-v1` / `adventure-v1` / `cocreate-v1`。  
体验包默认 **声明式**；若需自定义 UI，可另附 `shell.html` 并声明 `experience.customShell: true`（E2+）。

---

## 4. 宿主桥接 API

### 4.1 注入时机

- 游戏：iframe `sandbox` 加载 `game.html` 后，父页注入 `window.NyraGame`（`postMessage` 代理）。  
- 扩展：沿用 F7 `NyraHost`。  
- 插件：Pop 挂载时注入 `window.NyraPop`（同页模块或微型 iframe）。

通信：`{ channel: "nyra-yeos", pkgId, requestId, method, args }` ↔ `{ ok, result, error }`。

### 4.2 `window.NyraGame`（游戏必读）

```ts
interface NyraGame {
  // 壳
  setChrome(opts: {
    material?: "clear" | "solid" | "glass";
    buttonColor?: string;
    buttonBackground?: string;
  }): Promise<void>;
  close(): Promise<void>;

  // 身份
  getPlayerProfile(): Promise<{ name: string; avatarUrl?: string }>;
  listCharacters(): Promise<Array<{ id: string; name: string; avatar?: string; subtitle?: string }>>;

  // 角色包（需权限）
  getRoleLightPackage(characterId: string, opts?: { activationContext?: string }): Promise<RolePackage>;
  getRoleFullPackage(characterId: string, opts?: { activationContext?: string }): Promise<RolePackage>;

  // 模型（宿主代调，无密钥）
  callLLM(input: {
    characterId: string;
    messages: Array<{ role: string; content: string }>;
  }): Promise<{ content: string; model?: string }>;
  callGlobalLLM(input: {
    messages: Array<{ role: string; content: string }>;
  }): Promise<{ content: string; model?: string }>;

  // 存档 / 事件
  saveGame(data: unknown): Promise<void>;
  loadGame(): Promise<unknown | null>;
  recordGameEvent(input: {
    characterIds: string[];
    summary: string;           // 必须用真实名字，禁止「玩家/用户/角色A」
  }): Promise<void>;
}
```

**推荐最小回路（开发者抄这段就能出可玩包）：**

```js
async function boot() {
  const player = await NyraGame.getPlayerProfile();
  const characters = await NyraGame.listCharacters();
  // 自绘选角 UI …
}

async function playTurn(characterId, characterName, playerName, situation) {
  const pkg = await NyraGame.getRoleLightPackage(characterId);
  const { content } = await NyraGame.callLLM({
    characterId,
    messages: [
      ...pkg.messages,
      { role: "system", content: "你在月栖小游戏里以角色第一人称行动，3 句以内。" },
      { role: "user", content: situation }
    ]
  });
  await NyraGame.saveGame({ last: content, characterId });
  return content;
}

async function finish(characterId, characterName, playerName) {
  await NyraGame.recordGameEvent({
    characterIds: [characterId],
    summary: `${playerName}和${characterName}玩完了本局小游戏。`
  });
}
```

### 4.3 `window.NyraPop`（聊天插件）

```ts
interface NyraPop {
  getSession(): Promise<{
    sessionId: string;
    kind: "dm" | "group";
    title: string;
    members?: Array<{ id: string; name: string; isSelf?: boolean; isAi?: boolean }>;
  }>;
  setToolbarBadge(text: string | null): Promise<void>;
  openPanel(opts?: { height?: "half" | "full" }): Promise<void>;
  closePanel(): Promise<void>;
  inject(input: {
    kind: "system" | "match" | "npc";
    text: string;
    meta?: Record<string, unknown>;
  }): Promise<void>;
  storage: {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
  };
  callGlobalLLM?(input: { messages: Array<{ role: string; content: string }> }): Promise<{ content: string }>;
  endMatch?(summary?: string): Promise<void>;
}
```

插件 `plugin.js` 导出：

```js
export default {
  async onInstall(ctx) {},
  async onToolbarClick(ctx) { await ctx.host.openPanel(); },
  async onMessage(ctx, msg) {},   // 可选：监听会话新消息（只读摘要）
  async onUnload(ctx) {}
};
```

### 4.4 体验运行时回调（宿主内部，包作者多写资源）

体验包作者主要填资源；若自定义 shell：

```ts
interface NyraXp {
  getRun(): Promise<{ runId: string; category: string; save: unknown }>;
  patchSave(patch: unknown): Promise<void>;
  emitBeat(beat: { type: string; payload?: unknown }): Promise<void>;
  requestDirector(input: unknown): Promise<unknown>; // 轻导演 / DM
  finish(summary: string): Promise<void>;
}
```

---

## 5. 安全与沙箱

| 规则 | 要求 |
|------|------|
| iframe | `sandbox="allow-scripts allow-forms"`；禁止 `allow-same-origin` 与父页同权（资源用 blob/srcdoc 或隔离 origin） |
| 密钥 | 包内任何代码不得接触 API Key；`callLLM` 仅宿主代调 |
| 路径 | manifest 相对路径禁 `..`、绝对盘符 |
| 体积 | 单包建议 ≤ 8MB（E1）；资源可后置 |
| 外链 | 默认禁远程脚本；E3 前不允许任意 CDN |
| 伪造 | `pop.inject` 不得冒充真实用户气泡 |
| 场景标签 | 所有 LLM 调用带 `appId: "game:<id>" \| "pop-plugin:<id>" \| "xp:<id>"`，不污染默认 Pop 上下文 |

---

## 6. 安装 / 更新 / 卸载语义

```text
选 zip → 解压 → validateManifest(kind)
      → 权限摘要 UI → 用户确认
      → 写入 registry（按 kind 分表或统一表带 kind）
      → 可选「放到桌面」
      → 游戏进「游戏」已安装；插件进 Pop 工具条；体验进演出中心/桌面
```

| 动作 | 行为 |
|------|------|
| 更新同 `id` 更高 semver | 替换文件快照；存档默认保留（`saveKey` 不变） |
| 卸载 | 删包文件；可选清存档（二次确认） |
| 停用 | 桌面/工具条隐藏，数据保留 |

存储键（建议）：

| 键 | 内容 |
|----|------|
| `yueqi.phone.extensions.v1` | F7 扩展（已有） |
| `yueqi.yeos.games.v1` | 已装游戏 |
| `yueqi.yeos.plugins.v1` | 已装 Pop 插件 |
| `yueqi.yeos.experiences.v1` | 已装体验包 |
| `yueqi.yeos.saves.v1` | `pkgId → save` |
| 备份模块 | `yeosGames` / `yeosPlugins` / `yeosExperiences` / `yeosSaves` |

---

## 7. 开发者快速上手（15 分钟）

1. 复制 `sdk/game-package/template/`。  
2. 改 `manifest.json` 的 `id` / `name`。  
3. 在 `game.html` 里用上一节「推荐最小回路」。  
4. 打 zip（根目录直接是 `manifest.json`，不要多包一层文件夹名）。  
5. 栖机 → 栖市 → 侧载 → 打开试玩。  
6. 分享 zip 或日后上架精选。

Pop 插件：复制 `sdk/pop-plugin/template/`，实现 `onToolbarClick`，侧载后在 Pop 工具条出现。

体验包：复制 `sdk/experience-package/template/`，按 category 填资源，侧载后从演出中心打开。

---

## 8. 文案与命名（对外）

| 对内 | 对用户 |
|------|--------|
| YEOS | （可不说缩写）栖机可安装体验 |
| NyraGame | （开发者文档）宿主游戏接口 |
| yueqi-game | 游戏安装包 |
| yueqi-pop-plugin | 聊天插件 |
| yueqi-experience | 体验 / 玩法包 |
| Advanced interaction | 需要角色与模型互动 |

用户可见文案禁止竞品品牌名。

---

## 9. 验收清单（标准符合性）

包被认定为「符合 YEOS 1.0」当且仅当：

1. manifest 通过对应 `kind` 校验器。  
2. 入口可在沙箱加载且无密钥泄漏。  
3. 权限未授时 API 抛可识别错误，UI 有人话提示。  
4. 游戏结束 `recordGameEvent`（若声明了权限）summary 含真实名字。  
5. 卸载后工具条/桌面图标消失。  
6. LLM 调用带正确 `appId` 场景标签。

---

## 10. 模板与代码落点

| 路径 | 用途 |
|------|------|
| `sdk/game-package/template/` | 游戏包模板 |
| `sdk/pop-plugin/template/` | Pop 插件模板 |
| `sdk/experience-package/template/` | 体验包模板 |
| `docs/sdk/YUEQI_EXPERIENCE_OS.md` | 本标准 |
| `src/yeos/`（执行期新建） | 校验、registry、bridge、安装器 |
| `src/phone-ext/` | 既有扩展，保持兼容 |
