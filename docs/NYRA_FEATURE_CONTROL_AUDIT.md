# 月栖功能可见性与控制审计

**日期：** 2026-07-31  
**范围：** 真实 UI / prefs / 调度接线（不以旧计划宣称入口存在）  
**结论摘要：** CP-7～21 能力大多已有后端与部分开关；缺统一「AI 自主生活」总控、活动中心、Agent 权限面板、自动动态开关、情景剧记忆开关、开发者诊断页。

图例：Y = 具备 · N = 不具备 · P = 部分

| 能力 | 入口 | 开关 | 默认 | 权限说明 | 状态 | 最近活动 | 失败提示 | 暂停/取消 | 数据说明 | 测试 |
|---|---|---|---|---|---|---|---|---|---|---|
| Companion 即时聊天 | Y Pop / App 聊天 | N（常开） | 默认面板 | N | P 运行态 | Y 消息列表 | Y toast | Y 离开会话 | N | e2e / core |
| 关系规划 | N | N | 会话钩子自动 | N | N | N | stub 日志 | N | N | companion-cp9 |
| 记忆整理（宫殿） | Y App 记忆 | Y | enabled | P | Y 统计 | P | console | Y 关开关 | P | verify |
| 记忆整理（会话合并） | N | N | 会话结束 | N | N | N | N | N | N | companion-cp9 |
| 主动消息 | Y 角色行为 / App 日常 | Y `proactive` + wake | **开** | P wake 文案 | P 消息标签 | N 专用 | P | Y / DND | P | scheduler / cp10 |
| 自动日记 | Y 设置日记 | Y `scheduleEnabled` | **关** | P | P | N | console | Y | P | diary-checkpoint |
| 自动动态 | Y 朋友圈浏览 | **N** | **常开 poll** | N | N | N | N | 仅代码 stop | N | moments-auto |
| 离散事件 | N 专用 | P≈proactive+DND | LIFE_TICK_LIMITS | N | N | N | skip reason | P | N | companion-cp10 |
| 桌宠 | Y 设置/App | Y | 开除非 `"0"` | Y 文案 | Y | N | 平台提示 | Y | P | pet-cp17 |
| 助手 Agent | Y 助手 | N 总杀 | 可用 | P 审批卡 | P 日志 | P | Y | Y 暂停/取消 | P 审批 | assistant-cp8 |
| 探索 Agent | Y 探索 | P 安装授权 | 可用 | Y grants | Y 任务 | Y | Y | Y | Y | explore-cp7 |
| 情景剧记忆 | N 开关 | **N** | 谢幕写入 | N | P 上下文中心 | N | N | N | N | companion-cp12 |
| YEOS 记忆 | N 产品面 | N | 存档键 | P 扩展权限 | N | N | N | N | N | yeos-cp13 |
| Skill | Y 探索/栖市 | Y 安装授权 | 未装 | Y | P | P | Y | 卸载 | Y | skill-cp14 |
| 备份 | Y 设置备份 | N（动作） | 本地优先 | Y 覆盖提示 | Y | N | Y | N/A | Y | backup-cp15 |
| 通知 | Y App MCP；手机 **缺** | Y grant+DND | DND 22–08 | Y | Y badge | N | throw | DND | P | 间接 |

## 关键缺口（本轮产品化目标）

1. 无「AI 自主生活」总开关与预设模式；首次启动可静默开启主动（`proactive` 默认 true + 动态常开）。
2. 自动动态无用户开关；60s 轮询。
3. 情景剧/游戏经历写记忆无分项开关。
4. 任务中心已实现但无桌面入口；无统一「活动中心」。
5. `dailyBriefingEnabled` / `authorizedFileRoots` 无设置 UI。
6. 无开发者诊断页；无普通用户可理解的「为何主动 / 读了什么」视图。
7. 手机端缺通知授权与安静时间设置（App 有）。

## Prefs 键（审计时）

| 键 | 用途 |
|---|---|
| `yueqi.features.v1` | 含 `proactive` 等 |
| `yueqi.proactive.wake.v1` | 概率/静默窗/检查间隔 |
| `yueqi.settings.v1`.diary | 定时日记 |
| `yueqi.moments.auto.schedule.v1` | 动态排程（无 enable） |
| `yueqi.companion.life.v1` | 离散生活态 |
| `yueqi.companion.scenario-memory.v1` | 情景剧记忆提交 |
| `yueqi.agent.prefs.v1` | briefing / 文件根 |
| `yueqi.browserPetEnabled` | 桌宠 |

## 调度门控（审计时）

| 管道 | 门控 |
|---|---|
| `proactive/scheduler.js` | `isFeatureEnabled("proactive")` + 通知 grant |
| `diary/schedule.js` | `scheduleEnabled` |
| `moments/auto-post.js` | **无** |
| `life-tick.js` | proactive + DND + 预算 |

本轮实现见 `NYRA_FEATURE_CONTROL_COMPLETION_REPORT.md`（新增 `yueqi.autonomy.v1`、活动中心、Agent 权限、诊断页等）。
