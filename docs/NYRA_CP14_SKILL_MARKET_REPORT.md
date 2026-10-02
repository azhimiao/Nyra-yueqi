# CP-14 完成报告：声明式 Skill + 栖市 · 权限安装

> 2026-07-30 · **PASSED**（Node） · `601434c`

## 闭环

| 阶段 | 实现 |
|------|------|
| **浏览** | Explore「插件市场」列表已装 Skill；栖市「已装」展示声明式 Skill 分区 |
| **审阅权限** | 导入预览展示 `requestedCapabilities` 授权勾选（grant sheet） |
| **授予 / 拒绝** | `installSkillWithGrants` 校验 ⊆ manifest；缺 grant → `grants_required`；未声明 grant → `undeclared_grant` |
| **安装 / 启用** | `importSkillBundle` 写入 `grants.capabilities`（不再自动全授）；Explore / 栖市可启用停用 |
| **运行** | `isCapabilityGranted` 三重门（manifest ∩ install grant ∩ run grant）；PAIOS `checkPermission` + sandbox 默认拒绝 |
| **卸载 / 停用** | `uninstallSkillFromPlatform` / `setSkillEnabled`；Explore 市场行「卸载」；栖市 Skill 分区停用/卸载 |

## 接线要点

* **`src/skill-platform/grants.js`** — grant 归一化与 `validateInstallGrants`
* **`src/skill-platform/install-flow.js`** — 安装编排（grant 门 + 卸载/停用）
* **`src/skill-platform/importer.js`** — 接受 `grantedCapabilities`，默认不自动授权
* **`src/skill-platform/ui/explore-ui.js`** — 预览 grant sheet → `installSkillWithGrants`；启用/停用/卸载
* **`src/qishi/skill-install.js`** — 栖市桥接（与 YEOS zip 侧载分离）
* **`src/qishi/qishi-app.js`** — 「声明式 Skill」已装列表 + 停用/卸载

## 运行时强制权限

| 层 | 机制 |
|----|------|
| Skill 平台 capability | `structured-notes`, `calendar-draft`, `note-from-chat`, `page-summary` — `isCapabilityGranted` |
| PAIOS sandbox | `network`, `file`, `clipboard`, `credentials`, `character_memory_*` — `checkPermission` + `createSandbox().require()` |

## 验证

```bash
npm run verify:skill-cp14
npm run verify:skills:import
npm run verify:skills:agent
npm run verify:yeos-cp13
```

## 刻意不做（CP-15+）

* YEOS 游戏包与 Skill 混装
* 云签名商店 / 任意 JS 执行
* 角色包进栖市核心货架
