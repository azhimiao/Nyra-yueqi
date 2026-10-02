# 月栖发布就绪报告（CP-20 草案）

> 2026-07-30 · **ENVIRONMENT-COMPLETE PASSED**（CP-7…21 · 外部门禁未清）  
> 本报告描述 **环境内可验证** vs **待外部** 的边界，不构成商店上架声明。

## 总览

| 域 | 本环境状态 | 外部门禁 |
|----|------------|----------|
| Web / PWA 生产构建 | **READY**（`npm run build`） | — |
| Capacitor Android 工程 | **READY**（`android/` + sync 脚本） | App 内 Agent runtime |
| Capacitor iOS 工程 | **STRUCTURE READY** | Xcode 签名 / 真机 build |
| OpenClaw Mobile Slice | **READY**（Browser + vendor bundle） | 真机 WebView 长任务 |
| Live BYOK | **PROTOCOL READY** | Live FC 凭证 |
| 安全 / 备份 / Skill | **PASSED**（CP-14–19） | 渗透 / 商店审核 |
| E2E 环境内验收（CP-7…20） | **PASSED** | `npm run verify:e2e-cp21` |

## 构建脚本

| 命令 | 本环境 | 说明 |
|------|--------|------|
| `npm run build` | ✅ 通过 | Vite → `www/`；OpenClaw node shims 已 alias |
| `npm run cap:sync` | ✅ 可用 | build + `cap sync` |
| `npm run build:android` | ⏳ 待 Gradle 环境 | 需 Android SDK + 磁盘；见外部清单 |
| `npm run ios` | ⏳ 待 macOS | sync only；编译需 Xcode |

## 外部门禁（台账一致）

| 项 | 状态 | 解除条件 |
|----|------|----------|
| Android App 内 Agent | `IMPLEMENTED_PENDING_ANDROID_RUNTIME` | 清单 §1：APK + in-app smoke |
| Live BYOK | `IMPLEMENTED_PENDING_EXTERNAL_BYOK` | 清单 §2：Live FC 凭证 smoke |
| iOS | `IMPLEMENTED_PENDING_IOS_BUILD` | 清单 §3：Xcode build |
| Play / App Store | 后置 | 清单 §4 |

## CP-20 交付物

| 文件 | 用途 |
|------|------|
| `docs/NYRA_EXTERNAL_VALIDATION_CHECKLIST.md` | 人工验收步骤 |
| `docs/NYRA_KNOWN_LIMITATIONS.md` | 已知限制与 workaround |
| `scripts/verify-cross-cp20.mjs` | 结构 + 文档 + 构建探测 |
| `src/integrations/openclaw-mobile/vite-node-shims.js` | 主 Vite 构建 Node alias（修复 `node:url` vendor 阻塞） |

## CP-21 交付物

| 文件 | 用途 |
|------|------|
| `scripts/verify-e2e-cp21.mjs` | 编排 CP-7…20 verify + smoke |
| `docs/NYRA_APP_COMPLETION_REPORT.md` | Master plan 环境内总判定 |
| `docs/NYRA_CP21_E2E_REPORT.md` | CP-21 报告 |

## 验证

```powershell
npm run verify:e2e-cp21
```

## 刻意不做（master plan 已完结）

* 商店提审材料终稿
* OpenClaw 架构重写 / NAR
* 虚假升级 `PASSED_ANDROID_ASSISTANT` 或 Live BYOK 全绿
* CP-22（无后续 CP）
