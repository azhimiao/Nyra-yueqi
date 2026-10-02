# 月栖功能可见性与运行控制 — 完成报告

**日期：** 2026-07-31  
**范围：** 产品化既有 CP-7～21 能力（不新增 Agent/Companion/Skill/情景剧/YEOS 底层）  
**验证：** `npm run verify:feature-control`

## 交付物

| 文档 / 代码 | 说明 |
|---|---|
| `docs/NYRA_FEATURE_CONTROL_AUDIT.md` | 真实 UI/接线审计矩阵 |
| `docs/NYRA_RUNTIME_LIFECYCLE_REPORT.md` | OpenClaw / 主动调度生命周期 |
| `docs/NYRA_FEATURE_CONTROL_COMPLETION_REPORT.md` | 本报告 |
| `docs/NYRA_USER_RUNTIME_GUIDE.md` | 普通用户 / 开发者问答指南 |
| `src/companion/autonomy-prefs.js` | AI 自主生活 prefs + 预设 + 预算 |
| `src/companion/activity-log.js` | 活动中心日志 |
| `src/companion/feature-control-ui.js` | 设置 / 活动 / 权限 / 诊断 / 首启 HTML |
| `src/companion/feature-control-bind.js` | 接线与持久化生效 |
| `src/agent/capabilities/prefs.js` | Agent 权限扩展 |
| `scripts/verify-feature-control.mjs` | §九 用例自动化 |

## 用户可见入口（栖机）

- **设置 → 活动中心 / 陪伴与主动行为 / Agent 权限 / 任务中心**
- **首次进入小手机**：未完成 onboarding 时弹出模式选择（安静 / 陪伴 / 沉浸）
- **开发者诊断**：仅当 `localStorage.yueqi.developerMode === "1"` 时在设置「高级」显示

## 门控生效点

| 行为 | 门控 |
|---|---|
| 主动消息 / 心跳 / 日历 | `isAiAutonomousLifeEnabled` + 分项 + 安静时段 + 日限额 |
| 自动日记定时 | `autoDiary` + 自主生活 |
| 自动动态 | `autoMoments`；按 `nextPostAfter` 调度（去掉 60s 空转） |
| 情景剧记忆写入 | `scenarioMemory` |
| Local Agent 启动 | `localAgentEnabled`（lazy-agent 入口） |
| 探索读文件 | `exploreFilesEnabled` |
| Skill 安装 | `allowInstallSkills` |
| OpenClaw workspace | 任务 `finally` 删除 |

## §九 用例对照

| # | 结果 |
|---|---|
| 1 关 AI 自主生活 | PASS（verify） |
| 2 Pop 聊天仍可用 | PASS（不经 OpenClaw / 不经主动门禁） |
| 3 安静模式 | PASS |
| 4 陪伴每日上限 | PASS |
| 5 安静时间 | PASS |
| 6 记忆类关闭 | PASS（情景剧；游戏分项同 prefs） |
| 7 助手权限关 | PASS |
| 8 未授权资源 | PASS（chat/diary deny + explore files） |
| 9 活动中心原因 | PASS |
| 10 任务取消后 Runtime 停 | PASS（workspace/controller 释放） |
| 11 普通聊天不加载 OpenClaw | PASS（边界 + verify 标记） |
| 12 任务加载/释放 | PASS |
| 13 低电量 | PASS |
| 14 设置持久化 | PASS |
| 15 诊断与 Runtime | PASS（devtools 读真实 state / 加载旗标） |

## 已知边界

- YEOS「游戏经历进入记忆」尚无独立写入桥；分项开关已预留，沉浸模式开启 `gameMemory`。
- 开发者模式需手动设 `yueqi.developerMode=1`（不进入默认导航）。
- OpenClaw 模块缓存不会在任务结束后从 JS heap 卸载（浏览器模块语义）；任务 workspace 会释放。

本轮停止，不扩展新产品能力。
