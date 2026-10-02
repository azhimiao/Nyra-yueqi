# OPENCLAW_MOBILE_BUNDLE_REPORT

> CP-5.5 · 2026-07-30 · UTF-8  
> 构建：`npm run build:openclaw-mobile-slice`  
> 探针：`.tmp/openclaw-mobile-build-probe.json`

## 体积

| 度量 | 值 |
|------|-----|
| JS Bundle | **218 320 bytes** (~213 KB) |
| Gzip | **52 796 bytes** (~52 KB) |
| 最大 chunk | 单文件 lib bundle（同上） |
| OpenClaw/Vendored 贡献 | vendor dist ~21 文件 + `@openclaw/ai` / `typebox` / `json5` 被打入 |

对比：

| 口径 | 体积 |
|------|------|
| 完整 npm 安装树 | ~302 MB（**不是** Bundle） |
| CP-5 agent-core 静态闭包上界 | ~4.4 MB |
| 本移动端 Slice Bundle | **~213 KB** / gzip **~52 KB** |

## 产物检查

构建后扫描：

- **无** `node:child_process`
- **无** `taskkill`
- **无** `node-pty`
- **含** `UNSUPPORTED_RUNTIME_CAPABILITY`（fail-closed stub）

## 禁止能力

Bundle 内 Node Shell / 进程树实现已替换为抛错 stub；Gateway/CLI 未打入窄入口。
