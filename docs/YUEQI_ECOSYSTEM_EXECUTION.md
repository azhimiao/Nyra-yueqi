# 月栖 · 栖市 / YEOS 可执行落地计划

> 状态：**可直接按波次执行**  
> 日期：2026-07-28  
> 产品定义：[APP_MARKETPLACE_ECOSYSTEM.md](./APP_MARKETPLACE_ECOSYSTEM.md)  
> OS 标准：[sdk/YUEQI_EXPERIENCE_OS.md](./sdk/YUEQI_EXPERIENCE_OS.md)  
> 基线扩展：[align/F7.md](./align/F7.md) · 已有 `src/phone-ext/`  
> 质量门槛：[align/_QUALITY_BAR.md](./align/_QUALITY_BAR.md)

---

## 0. 目标（用户可感知）

用户能在 **栖市** 侧载 / 安装：

1. **游戏包**（单文件 HTML + `NyraGame`，和角色一起玩）；  
2. **Pop 插件**（骰子等挂进单聊/群聊）；  
3. **体验包**（情景剧 / 漫卷 / 冒险 / 共创 的可更新模式资源）；  

开发者只读 YEOS 标准 + 复制模板即可出包分享，**不必改宿主源码**。

---

## 1. 总原则

| 原则 | 含义 |
|------|------|
| 本地优先 | E0–E3 不依赖云商店；侧载 zip 必须闭环 |
| Clean-room | 自研 bridge；可借鉴「iframe + 宿主注入」形态，不搬外部源码 |
| 扩展 F7 | 不拆掉已有 `yueqi-phone-ext`；新 kind 平行扩展 |
| 密钥不出宿主 | `callLLM` / `callGlobalLLM` 仅宿主代调 |
| 场景隔离 | `appId` 必须为 `game:<id>` / `pop-plugin:<id>` / `xp:<id>` |
| 文案 | 用户可见禁用竞品品牌名 |

---

## 2. 波次总览

| 波次 | 名称 | 用户可感知结果 | 依赖 |
|------|------|----------------|------|
| **E0** | 契约与校验器 | 三种新 kind 的 manifest 能校验；有模板 zip | 无 |
| **E1** | 栖市统一安装器 | 侧载游戏包 → 已安装 → 桌面/游戏厅打开 iframe | E0、F7 H1 可复用 |
| **E2** | NyraGame Bridge | 样例游戏能选角、调 LLM、存档、写局终事件 | E1 |
| **E3** | Pop 插件 | 投骰子插件出现在 Pop 工具条，单聊可用 | E0 |
| **E4** | 体验包挂载 | 漫卷/冒险/共创至少各 1 个可侧载资源包驱动现有运行时 | E0、现有 theater/cocreate |
| **E5** | 生态抛光 | 更新通道、权限人话、开发者文档页内链、备份模块 | E1–E4 |

每波结束必须满足 §9 验收命令；未过不得开下一波「感觉上差不多」。

---

## 3. E0 · 契约与校验器

### 3.1 交付物

| 路径 | 动作 |
|------|------|
| `src/yeos/kinds.js` | kind 常量、`PermissionId` 并集、ID/semver 正则 |
| `src/yeos/manifest-schema.js` | `validateGameManifest` / `validatePluginManifest` / `validateExperienceManifest` |
| `src/yeos/package-io.js` | 读 zip → 抽出 `manifest.json` + 入口文件（可复用 `phone-ext/package-io` 模式） |
| `sdk/game-package/template/**` | 已提供模板 |
| `sdk/pop-plugin/template/**` | 已提供模板 |
| `sdk/experience-package/template/**` | 已提供模板 |
| `scripts/verify-yeos-manifest.mjs` | 校验三个模板 + 故意坏包失败用例 |

### 3.2 完成定义

- [ ] 合法模板 `validate*` → `{ ok: true }`  
- [ ] 缺 kind / 坏 id / 未知权限 / 路径含 `..` → 稳定 `code` + 中文 `message`  
- [ ] `node scripts/verify-yeos-manifest.mjs` 退出码 0  

### 3.3 不做

云目录、签名、付费、联机房间。

---

## 4. E1 · 栖市统一安装器

### 4.1 产品行为

栖市侧载文件选择支持：

`.yueqi-ext.zip` | `.yueqi-game.zip` | `.yueqi-plugin.zip` | `.yueqi-xp.zip`

（亦允许无后缀 zip，靠 `manifest.kind` 识别。）

安装成功后：

| kind | 去向 |
|------|------|
| phone-ext | 既有扩展桌面 `ext:<id>` |
| game | 「游戏」App 已安装列表 + 可选钉桌面 `game:<id>` |
| pop-plugin | 设置/栖市「聊天插件」列表；Pop 工具条在 E3 显现 |
| experience | 「演出中心」或情景剧门厅「来自栖市」书架 |

### 4.2 代码落点

| 路径 | 职责 |
|------|------|
| `src/yeos/registry-games.js` | CRUD `yueqi.yeos.games.v1` |
| `src/yeos/registry-plugins.js` | CRUD `yueqi.yeos.plugins.v1` |
| `src/yeos/registry-experiences.js` | CRUD `yueqi.yeos.experiences.v1` |
| `src/yeos/installer.js` | 统一 `installPackage(file)` 分发 |
| `src/phone-shell/` 栖市 UI | 侧载入口复用 F7；列表按 Tab 分 kind |
| `src/phone-shell/apps-catalog.js` | 解析 `game:<id>` 桌面 id（仿 `ext:`） |

### 4.3 完成定义

- [ ] 侧载样例游戏包 → 栖市「已安装」可见  
- [ ] 点开进入全屏壳（可先空白 iframe 加载 `game.html`，API 可 stub）  
- [ ] 卸载后列表与桌面图标消失  
- [ ] 坏包错态人话化（U7）  

### 4.4 不做

真实 LLM、Pop 工具条、体验运行时接线。

---

## 5. E2 · NyraGame Bridge（对标「写 HTML 导入游戏」）

### 5.1 宿主能力（必须实现）

按 [YUEQI_EXPERIENCE_OS.md §4.2](./sdk/YUEQI_EXPERIENCE_OS.md)：

| API | 实现要点 |
|-----|----------|
| `listCharacters` | 读角色 store，只暴露摘要 |
| `getPlayerProfile` | 用户显示名 |
| `getRoleLightPackage` / `getRoleFullPackage` | 组装 messages；`appId: game:<id>` |
| `callLLM` / `callGlobalLLM` | 走现有 chat/llm 管线；无密钥进 iframe |
| `saveGame` / `loadGame` | `yueqi.yeos.saves.v1[pkgId]` |
| `recordGameEvent` | 写同栖时间线 + 可选短期投影；校验 summary 含非泛称（可 lint 警告） |
| `setChrome` / `close` | 返回钮样式 / 关壳 |

### 5.2 代码落点

| 路径 | 职责 |
|------|------|
| `src/yeos/bridge-game.js` | postMessage 路由 + 权限门 |
| `src/yeos/role-package.js` | light/full 组装（可参考自有 prompt 装配，不抄外部仓） |
| `src/yeos/game-shell-ui.js` | iframe 壳、安全区 CSS 变量、崩溃重试 |
| `sdk/game-package/template/game.html` | 官方样例跑通选角→一回合对话→存档→局终事件 |

### 5.3 完成定义

- [ ] 样例包在真机/桌面预览：选角 → 角色说一句 → 杀进程重进读到存档  
- [ ] 未授 `llm.character` 时调用失败，页内提示「去授权」  
- [ ] 网络面板/日志中 iframe 侧不可见 API Key  
- [ ] `recordGameEvent` 后时间线出现 `appId: game:sample-…`  

### 5.4 开发者文档动作

- [ ] 栖市内「如何做游戏」链到 `docs/sdk/YUEQI_EXPERIENCE_OS.md` §7  
- [ ] 提供「复制示例 HTML」按钮（读 template 文本）  

---

## 6. E3 · Pop 插件（骰子先行）

### 6.1 产品行为

1. 侧载 `sample-dice` 插件。  
2. 打开 Pop 单聊 → 工具条出现「骰子」。  
3. 点开半屏 → 选骰面 → 注入一条系统/局内结果气泡。  
4. 群聊：`hosts` 含 `group` 时同样可用。  

### 6.2 代码落点

| 路径 | 职责 |
|------|------|
| `src/yeos/bridge-pop.js` | `NyraPop` 实现 |
| `src/yeos/plugin-loader.js` | 加载 `plugin.js`（blob module） |
| `src/characters/` 或 Pop UI | 工具条插槽 `data-pop-plugins` |
| `sdk/pop-plugin/template/` | 骰子样例 |

### 6.3 完成定义

- [ ] 单聊掷骰可见结果气泡  
- [ ] 停用插件后工具条入口消失  
- [ ] `pop.inject` 无法伪造「用户自己发的」样式  

### 6.4 次样例（同波或紧随）

- [ ] `sample-werewolf-skeleton`：仅开局/发身份/结束三阶段骨架（可不接完整平衡数值）  

---

## 7. E4 · 体验包挂载

### 7.1 策略

**不重写**现有情景剧/共创引擎；增加「从 YEOS 体验包喂资源」适配层。

| category | 适配 |
|----------|------|
| `theater` | 映射为 `ScenarioScript` 入库 / 门厅书架 |
| `scroll` | 新 `scroll-v1` 最小帧阅读器（可先只支持 JSON 帧列表 + 选项） |
| `adventure` | 新 `adventure-v1` 最小地图事件卡（节点 + DM 一句话） |
| `cocreate` | 映射章节草稿进共创项目 |

### 7.2 代码落点

| 路径 | 职责 |
|------|------|
| `src/yeos/xp-adapter-theater.js` | xp → scenario |
| `src/yeos/xp-adapter-scroll.js` | 帧运行时 MVP |
| `src/yeos/xp-adapter-adventure.js` | 地图事件 MVP |
| `src/yeos/xp-adapter-cocreate.js` | 章节导入 |
| `sdk/experience-package/template/` | 四类各至少一种最小资源（可先 theater + scroll） |

### 7.3 完成定义

- [ ] 侧载 theater 体验包 → 情景剧门厅可开演  
- [ ] 侧载 scroll 包 → 能翻至少 3 帧并选一次枝  
- [ ] 更新包版本后存档策略明确（保留或提示）  

---

## 8. E5 · 生态抛光

- [ ] 同 id 更高版本「更新」按钮  
- [ ] 备份 `DATA_MODULES` 纳入 yeos* 键  
- [ ] 成年确认与 `contentRating: mature`（复用 F7 H4）  
- [ ] 举报入口对游戏/插件复用 H5 队列  
- [ ] 栖市「开发者」页：三种模板下载说明（本地说明，非外链必达）  
- [ ] 可选：云精选目录开关默认关（只展示元数据）  

---

## 9. 验收与命令（每波）

```bash
# E0
node scripts/verify-yeos-manifest.mjs

# E1+（实现后补）
npm run verify:yeos-install   # 或 node scripts/verify-yeos-install.mjs
npm run verify:yeos-game      # bridge 单测 / 无头 iframe smoke
npm run verify:yeos-plugin    # 插件 registry + inject mock
```

手工清单（E2）：

1. 强刷 → 栖市 → 侧载 template zip  
2. 打开游戏 → 选角 → 生成一句 → 杀进程 → 重进有存档  
3. 设置里撤销 `llm.character` → 再调失败有提示  

---

## 10. 文件树（目标态）

```text
src/yeos/
  kinds.js
  manifest-schema.js
  package-io.js
  installer.js
  registry-games.js
  registry-plugins.js
  registry-experiences.js
  bridge-game.js
  bridge-pop.js
  role-package.js
  game-shell-ui.js
  plugin-loader.js
  xp-adapter-*.js
  saves.js

sdk/
  game-package/template/
  pop-plugin/template/
  experience-package/template/

docs/
  APP_MARKETPLACE_ECOSYSTEM.md      # 产品
  sdk/YUEQI_EXPERIENCE_OS.md        # 标准
  YUEQI_ECOSYSTEM_EXECUTION.md      # 本执行文档
```

---

## 11. 与现有模块关系

| 现有 | 关系 |
|------|------|
| `src/phone-ext/*` | 保留；installer 分发 `yueqi-phone-ext` 仍走它 |
| `src/games/lobby-ui.js` | E1/E2 改为「内置玩法 + YEOS 已装游戏」双源 |
| `src/scenario/*` | E4 theater 适配写入其 script/run |
| `src/skills/*` | **不混用**；Skill = Agent 能力，YEOS = 体验/游戏包 |
| 角色包 / 世界包 | 仍走创作者 SDK；栖市只做推荐组合，不吞并 |

---

## 12. 风险与降级

| 风险 | 降级 |
|------|------|
| iframe 存档丢 | 存宿主 `saves` 表，不靠 iframe localStorage |
| LLM 贵 | UI 标明「高级互动」；默认 light 包 |
| 恶意包 | 无远程脚本；权限白名单；可卸载 |
| 插件刷屏 | `pop.inject` 限频；match 模式需显式开局 |
| 体验包过大 | E1 限 8MB；超出人话拒绝 |

---

## 13. 建议执行顺序（给 Agent）

1. 实现 E0 校验器 + 跑通 `verify-yeos-manifest`。  
2. E1 安装器接栖市侧载（先 game）。  
3. E2 bridge + 官方样例游戏。  
4. E3 骰子插件。  
5. E4 theater/scroll 适配。  
6. E5 抛光与备份。  

每步提交应可独立演示；禁止「先搭完美商店 UI 再做 bridge」。

---

## 14. 完成判据（整条产品线）

当下列全部为真，可称「YEOS 1.0 可分享」：

1. 外部开发者只靠标准文档 + 模板 zip，能做出可安装游戏并在真机与角色互动。  
2. 至少 1 个 Pop 插件在单聊可用。  
3. 至少 1 个体验包能驱动非硬编码内容。  
4. 卸载干净；权限拒绝可理解；无密钥进包。  
