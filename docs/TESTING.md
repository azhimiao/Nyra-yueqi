# Testing & Verification

Source: `F:/beautiful/package.json` scripts.

## Philosophy

- 合同/静态门：`scripts/verify-*.mjs`（Node，快）  
- 浏览器：`e2e/*.spec.mjs`（Playwright）  
- **Node 绿 ≠ 真机绿 ≠ Live BYOK 绿**

## Smoke（每次接手建议）

```bash
cd F:/beautiful
npm run verify:security
npm run verify:onboarding-cp16
npm run verify:pet-actions
npm run verify:asset-boundaries
```

2026-08-13 实测：`verify:security` 20/20（修日历转义检查后）、`verify:onboarding-cp16` PASS、`verify:pet-actions` 18/18。

## Domain packs

| 域 | 命令 |
|----|------|
| 安全 | `npm run verify:security` |
| 引导/商业 | `npm run verify:onboarding-cp16` · `verify:commercial-access-v1` |
| 角色 | `verify:characters-m0` … `m5` · `verify:pop-contacts` |
| 桌宠 | `verify:pet-actions` · `verify:pet-boundary` · `verify:xingli` |
| 模型生产合同 | `verify:model-production` |
| Cutover Node | `verify:product-cutover-node` |
| Cutover 浏览器 | `e2e:product-cutover-browser`（当前预期可能 FAIL） |
| Cutover 发版 | `verify:product-cutover-release`（当前 FAIL 诚实） |
| 统一记忆 | `verify:unified-memory-v1` |
| Companion intelligence | `verify:companion-intelligence-v1` |
| Companion OS R0–R11 | `verify:companion-os` |
| 创意模式 | `verify:creative-modes` · `e2e:creative-modes` |
| i18n | `verify:i18n` |
| 全量历史 | `npm run verify`（**极长**，勿盲目当默认） |

## E2E prerequisites

```bash
npm run e2e:p0:install   # playwright chromium
```

## Build sanity

```bash
npm run build
```

## When adding features

1. 优先加/更新对应 `scripts/verify-*.mjs`  
2. 涉及 XSS：确保 `escapeHtml`，并更新 `verify:security` 模式  
3. 涉及双壳：App + phone 都点路径或写 e2e  
4. 禁止用「删断言」装绿

## External validation checklist

源仓：`docs/NYRA_EXTERNAL_VALIDATION_CHECKLIST.md`  
未跑真 Key / 真机前，报告必须标 **PENDING_EXTERNAL**。
