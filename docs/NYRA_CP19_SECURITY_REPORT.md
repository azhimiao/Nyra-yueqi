# CP-19 完成报告：安全加固 — 威胁测试

> 2026-07-30 · **PASSED**（Node） · `b587cac`

## 目标

在 CP-14/15/16 已有权限、备份 scrub、错误 redact 基础上，补充 **威胁导向** 的回归断言，并加固 phone-shell / explore / chat 路径上的关键 sink 与 toast 泄漏面。

## 威胁矩阵

| 威胁 | 控制面 | 验证 |
|------|--------|------|
| **T1 密钥泄漏（备份）** | `scrubExportPayload` / `assertNoSecretsInExport` | 集成：provider、ecosystem token、voice keys、gate token、Bearer 模式均 redact |
| **T2 密钥泄漏（用户可见）** | `redactSecrets` / `formatUserError` / `safeUserFacingText` | 集成：API key、stack trace 不出现在格式化文案 |
| **T3 Skill 默认拒绝** | `checkPermission` + `createSandbox` | 未声明 / 未授予 / 未知权限 → deny；network/file 默认 blocked |
| **T4 安装缺 grant** | `validateInstallGrants` | 空 grant、部分 grant、越权 grant → `grants_required` / `undeclared_grant` |
| **T5 XSS / HTML sink** | `escapeHtml` + 静态 allowlist 扫描 | 高危文件必须 import `escapeHtml`；未转义 innerHTML 插值被扫描拦截 |
| **T6 Agent 未批准写入** | `runTask` R2 gate + `approveAndContinue` | R2 任务停于 `awaiting_approval`；无 `approved` 不可继续 |
| **T7 主动内容 guardrail** | `violatesContentGuardrails` (CP-10) | 情感勒索 / 假紧急 / 付费威胁 blocked；温和 copy allowed |

## 加固修复

| 区域 | 变更 |
|------|------|
| Toast / 错误面 | 新增 `safeUserFacingText`；explore-ui、skill-session-ui、pop-chat-plugins 错误 toast 走 redact |
| Phone toast | 已有 `escapeHtml` 于 action toast；plain toast 用 `textContent` |
| 备份 / 权限 / Agent | 无行为变更；威胁测试覆盖现有 CP-14/15/16 实现 |

## 验证

```bash
npm run verify:security-cp19
npm run verify:security
npm run verify:backup-cp15
npm run verify:skill-cp14
```

| Script | 职责 |
|--------|------|
| `scripts/verify-security-cp19.mjs` | 静态 wiring + XSS sink 扫描 + 集成 |
| `tests/integration/security-cp19.mjs` | T1–T7 威胁断言 |
| `scripts/verify-security.mjs` | 既有角色包 / CORS / token 回归（保持绿） |

## 刻意不做（CP-20+）

* 全仓库 innerHTML 审计与大规模 DOM 重构
* 实时 exploit PoC / 渗透测试
* OpenClaw 每消息重写或 NAR 架构变更
* 云 Gate / BYOK E2E 浏览器实测
