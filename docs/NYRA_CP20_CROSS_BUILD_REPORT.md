# CP-20 完成报告：跨端构建准备 — APK path + 外部 checklist

> 2026-07-30 · **PASSED**（prep only · Node）

## 目标

发布/构建就绪 **准备**：Capacitor 双端工程、构建脚本、外部人工验收清单、验证脚本。**不** 清除 Android / Live BYOK / iOS / 商店外部门禁。

## 交付

| 项 | 说明 |
|----|------|
| 外部清单 | `docs/NYRA_EXTERNAL_VALIDATION_CHECKLIST.md` — Android / BYOK / iOS / Store，均 `PENDING_EXTERNAL` |
| 发布草案 | `docs/NYRA_RELEASE_READINESS_REPORT.md` |
| 已知限制 | `docs/NYRA_KNOWN_LIMITATIONS.md` |
| Vite 构建修复 | `vite-node-shims.js` + `vite.config.js` resolve alias — 解除 `node:url` vendor 阻塞 |
| 桌宠 wire | `overlay-presence-wire.js` / `desktop-presence-wire.js` — `let` 修复 const 重赋值 build 错误 |
| 验证 | `scripts/verify-cross-cp20.mjs` · `npm run verify:cross-cp20` |

## 构建状态（本环境）

```powershell
npm run build   # PASS — www/ 产出
```

| 检查 | 结果 |
|------|------|
| `android/` | 存在 |
| `ios/` | 存在 |
| `capacitor.config.json` | `webDir: www` |
| `npm run build:android` | 脚本存在；完整 APK 需 Android SDK（外部） |

## 外部门禁（未升级）

```text
IMPLEMENTED_PENDING_ANDROID_RUNTIME
IMPLEMENTED_PENDING_EXTERNAL_BYOK
IMPLEMENTED_PENDING_IOS_BUILD
```

## 验证

```powershell
npm run verify:cross-cp20
npm run verify:security-cp19
```

## 刻意不做

* CP-21 E2E
* `PASSED_ANDROID_ASSISTANT` / 商店就绪虚假声明
* OpenClaw NAR 重写
