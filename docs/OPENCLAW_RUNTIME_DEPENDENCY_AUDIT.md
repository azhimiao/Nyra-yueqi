# OPENCLAW_RUNTIME_DEPENDENCY_AUDIT

> CP-5 · 2026-07-30 · UTF-8  
> 数据源：`scripts/audit-openclaw-runtime-deps.mjs` → `.tmp/openclaw-dep-audit.json`  
> 包：`openclaw@2026.7.1-2` @ `F:\clawtry\app\node_modules\openclaw`

## 结论摘要

| 度量 | 值 | 含义 |
|------|-----|------|
| npm 安装目录总体积 | **301.75 MB** | 含嵌套依赖、docs、全量 dist；**不是**最小运行时 Bundle |
| `plugin-sdk/agent-core` 静态闭包 | **~4.4 MB / 551 文件** | 从公开入口 BFS 静态 import 得到的上界（barrel 再导出导致偏大） |
| Loop 主体 chunk | `proxy-BzhBz8iM.js` **~156 KB** | 含 `runAgentLoop` 实现 |
| Stream 辅助 | `stream-BcRkg2P0.js` **~30 KB** | `completeSimple` / `streamSimple` |
| agent-core 入口 | **~3.7 KB** | 再导出 + 注入 `openClawAgentCoreRuntime` |
| Web Vite 探测 | **失败** | 首个硬失败：`node:child_process`（`kill-tree-*.js`） |

**禁止**把 301 MB 安装树复制进月栖客户端。  
**禁止**把 `openclaw/plugin-sdk/agent-core` 打进 Capacitor WebView bundle（见兼容性报告）。

---

## 1. `runAgentLoop` 实际加载哪些模块

公开入口：

```text
openclaw/plugin-sdk/agent-core
→ dist/plugin-sdk/agent-core.js
→ dist/proxy-BzhBz8iM.js          (runAgentLoop)
→ dist/stream-BcRkg2P0.js
→ dist/kill-tree-Cr15jS_s.js      (node:child_process)
→ dist/errors-wmH7Ncz4.js
→ dist/llm-CjsEPovZ.js
→ …大量 barrel 关联 dist/* 与 undici 等
```

CP-4/CP-5 实测：Node 22 下 `import` + `runAgentLoop(...)` 可运行。

## 2. `Agent` 实际加载哪些模块

同一入口 `agent-core.js`：`class Agent extends Agent$1`，依赖同一 `proxy-*.js` barrel 与 `openClawAgentCoreRuntime`（`completeSimple` / `streamSimple`）。  
**本轮 Adapter 使用 `runAgentLoop`，未强制构造 `Agent`。**

## 3. 静态 import 依赖

审计脚本对 `agent-core.js` 做 BFS：

- 闭包文件数：551  
- 闭包体积：~4414.9 KB  
- 最大文件示例：`schemas-*.js` (~427 KB)、`ids-*.js` (~323 KB)、`proxy-*.js` (~156 KB)、`undici` fetch 等  

说明：`proxy` barrel **静态再导出大量符号**，静态图会把非 Loop 必需模块算进来；真实执行未必全部求值，但 **bundler 仍可能一并打包**。

## 4. 动态 import 依赖

闭包内可见动态 import 提示（节选）：

- `fetch-guard-*.js` → `./runtime-*.js`
- `official-external-plugin-catalog-*.js` → snapshot / fetch-guard
- `undici` 内部动态加载 types / stream

动态路径使「精确最小集合」难在不跑覆盖率的情况下钉死；产品侧应假设 **公开 agent-core 入口不是浏览器安全子集**。

## 5. Node 内置模块依赖（静态扫描）

闭包触及（节选）：

```text
node:assert, async_hooks, buffer, child_process, console, crypto,
diagnostics_channel, dns, events, fs, fs/promises, http, http2, https,
module, net, os, path, perf_hooks, process, querystring, readline, sqlite,
stream, timers, tls, tty, url, util, worker_threads, zlib
```

任一进入 WebView 都需要 polyfill；本项目 **禁止用大量 polyfill 强行掩盖**。

## 6. 可选 / 嵌套依赖（安装树 Top）

`node_modules` 内 Top（MB）：

| 依赖 | MB | 与 agent-core Loop 关系 |
|------|-----|-------------------------|
| typescript | 24.35 | 无关（工具链） |
| tree-sitter-bash | 20.28 | CLI/技能无关 |
| @google/genai | 16.2 | Provider SDK |
| playwright-core | 12.7 | Browser 自动化 |
| @lydell/node-pty-win32-x64 | 12.45 | PTY/Shell |
| @opentelemetry/* | ~12 | 观测 |
| openai / anthropic / mistral | 大 | Provider |
| undici | 1.68 | HTTP（Node 运行时可能触及） |

## 7. CLI / Dashboard / Channel / Browser / Docker / 语音 / 媒体

`package.json` exports 中大量与 Loop 无关的公开子路径（样本见审计 JSON `irrelevantExportHintsSample`），例如：

- `plugin-sdk/cli-runtime`、`gateway-runtime`
- `channel-*`、`discord`、`browser-config`
- `media-*`、`approval-gateway-runtime`

这些主要贡献 **dist 体积与嵌套依赖**，不是月栖 Adapter 所需。

## 8. 最小可运行文件集合（实践口径）

**Node Adapter 正式路径（推荐）：**

1. 不 Vendoring；通过 `OPENCLAW_APP_ROOT` / 桌面 sidecar 的 `node_modules/openclaw` 解析公开 exports。  
2. 仅 import：`openclaw/plugin-sdk/agent-core`、`openclaw/plugin-sdk/llm`（Fake/stream 辅助）。  
3. 接受该入口的 Node 运行时依赖（含 `child_process` 等），隔离在 Node 进程。

**若强行列「Loop 核心 chunk」下界（非完整可运行证明）：**

```text
dist/plugin-sdk/agent-core.js
dist/proxy-BzhBz8iM.js
dist/stream-BcRkg2P0.js
dist/kill-tree-Cr15jS_s.js
dist/errors-wmH7Ncz4.js
dist/llm-CjsEPovZ.js
+ TypeBox（嵌套依赖，Tool schema）
+ 运行时实际 resolve 的其余 proxy 依赖
```

下界 **不足以** 作为浏览器 Bundle 依据。

## 9. 最小生产依赖集合

| 环境 | 集合 |
|------|------|
| 桌面 Electron / Node sidecar | `openclaw@2026.7.1-2`（完整包或锁定的生产 install）+ 月栖 Adapter；**不要**再拷 docs/skills 到应用资源 |
| Capacitor Web | **空** — 不打包 openclaw |
| Android/iOS 进程内 | **空** — 走 Sidecar 或后续合法 Vendoring 子集（本轮未做） |

## 10. Bundle 后的实际体积

| 探测 | 结果 |
|------|------|
| Vite 浏览器 lib build（`scripts/probe-openclaw-web-bundle.mjs`） | **失败**，无产物 |
| 失败模块 | `node:child_process` / `spawn`（`kill-tree-*.js`，由 agent-core 静态导入） |
| 产物字节 | `null` |

因此：**没有**「成功的 Web Bundle 体积」可报；不得用 301 MB 冒充 Bundle，也不得假装已 tree-shake 到可上架大小。

---

## 300 MB 中哪些是无关内容

| 部分 | ~MB | 判定 |
|------|-----|------|
| 嵌套 `node_modules` | 214 | 大部分对月栖 Adapter **无关或仅间接**（TS、playwright、pty、多 Provider SDK） |
| `dist` 全量 | 78 | 含 channel/cli/gateway 等；Adapter 只需其中少数 chunk，但入口 barrel 难拆 |
| `docs` | 8.8 | 无关 |
| `skills` / `scripts` | <1 | 无关 |

---

## 裁定顺序（Capacitor 进不去时）

1. ~~只打包公开 agent-core 子入口~~ → **已试，仍拉 `child_process`**  
2. Bundler alias 移除 CLI/Gateway → **不能消除 agent-core 对 kill-tree 的静态依赖**  
3. 更小上游发布入口 → **当前包无「browser-safe agent-core」export**  
4. Vendoring 最小上游子集 → **未实施**；若做必须保留 License/版本/来源/修改记录  
5. **Node Sidecar（推荐）**  
6. 移植上游最小循环 → **禁止**根据设计自写等价循环  

---

## 复现命令

```bash
npm run audit:openclaw-deps
npm run probe:openclaw-web
```
