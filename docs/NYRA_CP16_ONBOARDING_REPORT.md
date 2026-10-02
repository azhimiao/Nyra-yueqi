# CP-16 完成报告：首次启动 UX — 引导 + 错误文案

> 2026-07-30 · **PASSED**（Node） · `f7c8279`

## 闭环

| 能力 | 实现 |
|------|------|
| **首次引导** | 空 `yueqi.onboarding.v1` 冷启动 → 多步向导（语言 → 离线/登录 → App/小手机 → 进入）；完成写入 `done: true` 且不再弹出 |
| **真实选择** | 每步写入 prefs：`setLocale`、`accountMode`、`yueqi.app.mode`（App/Phone） |
| **跳过/续接** | 已完成或 legacy `localeChosen` 一次性迁移跳过；未完成从 `account` 续接（若已选语言） |
| **重新引导** | 设置 → 语言 →「重新引导」调用 `resetOnboarding()` + `reopenWizard()`；设 `resetAt` 防止 locale 自动关闸 |
| **错误文案** | `src/onboarding/errors.js` 集中 `formatUserError` / `redactSecrets`；i18n `errors.*` 键 |

## 错误覆盖

| 场景 | 键 / 模块 |
|------|-----------|
| 未配置 API Key | `errors.noApiKey` |
| 模型不可用 | `errors.modelUnavailable` |
| 网络失败 | `errors.networkFail` |
| External Required (BYOK) | `errors.externalRequired` + `externalRequiredBody` |
| Agent 取消 | `errors.agentCancelled` |
| 备份导入失败 | `errors.backupImportFail`（Me 面板 + formatter） |
| Skill grants_required | `errors.grantsRequired`（Explore 安装） |

密钥与 stack trace 经 `redactSecrets` 剥离，不进入 toast/alert。

## 验证

```bash
npm run verify:onboarding-cp16
npm run verify:backup-cp15
```

## 刻意不做（CP-17+）

* 全量出厂重置 / wipe IDB
* Live BYOK 真机 E2E
* 装饰性向导步骤

## 首次启动路径

```
冷启动 → hasOnboardingDone? ─no→ 显示 data-onboard-gate
  language → account (offline|online[+可选登录]) → ui (app|phone) → 进入
  markOnboardingDone + setAppMode → 关闸 → 主界面
已完成 / legacy locale ─yes→ 直接进入主界面
设置「重新引导」→ resetOnboarding → reopenWizard（从 account 或 language）
```
