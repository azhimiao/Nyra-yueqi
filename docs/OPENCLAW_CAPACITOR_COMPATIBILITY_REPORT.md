# OPENCLAW_CAPACITOR_COMPATIBILITY_REPORT

> CP-5 · 2026-07-30 · UTF-8  
> 关联：`docs/OPENCLAW_RUNTIME_DEPENDENCY_AUDIT.md`、`.tmp/openclaw-web-bundle-probe.json`

## 总表

| 环境 | 结论 | 说明 |
|------|------|------|
| **Node** | **PASSED** | Adapter + Fake/Mock 集成 19/19 |
| **Vite / Web Build** | **NOT usable for agent-core** | 探测失败于 `node:child_process` |
| **Capacitor WebView** | **NOT_VERIFIED / 不可进程内跑 Loop** | 与 Web 同因 |
| **Android** | **NOT_VERIFIED**（静态：可编译宿主 App ≠ 能跑 Agent） | 工程存在 `android/`；本轮未跑 Gradle Agent Smoke |
| **iOS** | **IMPLEMENTED_PENDING_EXTERNAL** | 有 `ios/` 工程；无本机签名/真机验证 |

四层能力必须分开写：

| 能力 | WebView | Android 宿主 | iOS 宿主 | Node Sidecar |
|------|---------|--------------|----------|--------------|
| 能编译月栖 App | 是（现有 Vite/Cap） | 预期是（现有工程） | 待外部 | 是 |
| 能启动 UI | 是 | 预期是 | 待外部 | n/a |
| 能执行 OpenClaw Agent Loop | **否** | **否（进程内）** | **否（进程内）** | **是** |
| 能执行月栖 Tool（经 Adapter） | **否（无 Loop）** | **否（进程内）** | **否（进程内）** | **是** |

---

## A. Node

- Runtime：OpenClaw `2026.7.1-2` via `OPENCLAW_APP_ROOT`  
- 要求：Node **≥ 22**  
- 验证：`npm run verify:openclaw-adapter`  
- 状态：**PASSED**

## B. Vite / Web Build

命令：`npm run probe:openclaw-web`

实测失败头（UTF-8 日志）：

```text
kill-tree-Cr15jS_s.js: import { spawn } from "node:child_process"
→ "spawn" is not exported by "__vite-browser-external"
```

失败模块：`node:child_process` / `child_process`  
该文件由 `dist/plugin-sdk/agent-core.js` **静态 import**，无法靠「只 import runAgentLoop」避开。

**未**添加 Node polyfill 掩盖。

## C. Capacitor Android

静态分析：

- `capacitor.config.json` → `webDir: www`  
- `android/app/build.gradle` 存在  
- 月栖生产路径 **未** import `src/integrations/openclaw`（CP-5 不接助手/探索）

构建 Smoke：本轮 **未**执行完整 `gradle assemble`（耗时/环境）；即便 APK 可编译，也 **不能** 推断 WebView 内可跑 Agent Loop。

结论标签：**NOT_VERIFIED**（进程内 Agent）+ **宿主工程存在**。

## D. iOS

- `ios/` 工程存在  
- 无本机 Xcode 签名与真机跑通记录  

结论：**IMPLEMENTED_PENDING_EXTERNAL**

---

## 推荐执行方案（CP-5 裁定）

```text
PASSED_NODE_ONLY
→ 桌面 Electron / 本地 Node Sidecar 执行 OpenClawRuntimeAdapter
→ Capacitor 仅 UI + 调用 Sidecar（未来 CP）
→ 禁止手机 WebView 进程内 OpenClaw
```

Vendoring：本轮 **不需要**；若未来要做，必须保留 License / 版本 / 来源 / 修改记录，且不得自写等价 Loop。
