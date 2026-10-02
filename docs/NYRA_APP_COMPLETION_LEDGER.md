# 月栖应用完成台账

> **Historical / Superseded** — 2026-07-31  
> 当前状态入口：[`NYRA_COMPANION_OS_CURRENT_STATE_AUDIT_AND_EXECUTION.md`](./NYRA_COMPANION_OS_CURRENT_STATE_AUDIT_AND_EXECUTION.md)

> 更新：2026-07-30

| CP | 状态 | Commit | 备注 |
|----|------|--------|------|
| 0–3 | PASSED | `4365e2b` | 文档纠偏 |
| 4 | PASSED | `54f4580` | Spike |
| 5 | PASSED_NODE_ONLY | `08f52ef` | Node Adapter |
| 5.5 | PASSED_BROWSER_ANDROID_PENDING | `08e2cb2` | Mobile slice |
| 6 | PASSED_ASSISTANT_INTEGRATION | `e25f3a9` | 助手接入 |
| 6.1 | 路由/幂等/BYOK 协议 | `22af7cf` | Android/Live BYOK pending |
| 7 | PASSED | `985bb60` | 探索 Task Runtime + 世界书合并（`118e6a7` 样式） |
| 8 | PASSED | `2c033a5` | 助手世界书/主题/情景剧/资源包 |
| 9 | PASSED | `cbaabb5` | Companion 关系规划 + 记忆整理 |
| 10 | PASSED | `0f1d060` | 离散主动陪伴 / 生活事件调度 |
| 11 | PASSED | `6e20b73` | 栖机应用事件总线 + 注册表 |
| 12 | PASSED | `46c1628` | 情景剧谢幕 → Pop 共同经历摘要 |
| 13 | PASSED | `2736f97` | YEOS 安装 / 存档 / 局终事件闭环 |
| 14 | PASSED | `601434c` | 声明式 Skill 权限安装闭环 |
| 15 | PASSED | `33ce970` | 备份迁移 + 隐私 scrub / 选择性清除 |
| 16 | PASSED | `f7c8279` | 首次启动引导 + 错误文案 |
| 17 | PASSED | `d0dc0ff` | 桌宠状态与 Companion life-state 统一 |
| 18 | PASSED | `68a1007` | 懒加载 Agent / OpenClaw off 冷启动 |
| 19 | PASSED | `b587cac` | 威胁测试 + sink 加固 |
| 20 | PASSED | `60c7db8` | 跨端构建准备 + 外部 checklist |
| 21 | PASSED | `9b572b6` | E2E 验收 + 完成报告 |

## 外部门禁（不阻塞）

| 项 | 状态 |
|----|------|
| Android App 内 Agent | IMPLEMENTED_PENDING_ANDROID_RUNTIME |
| Live BYOK | IMPLEMENTED_PENDING_EXTERNAL_BYOK |
| iOS | IMPLEMENTED_PENDING_IOS_BUILD（待） |
| 商店 | 后置 |
