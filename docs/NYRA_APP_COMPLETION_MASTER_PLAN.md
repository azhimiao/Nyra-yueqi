# 月栖应用完成总计划

> 2026-07-30 · 自 CP-7 连续执行至只剩外部门禁

## 原则

1. 复用 `runAgentLoop` / `OpenClawMobileRuntimeAdapter`，不自研 Loop  
2. Pop ≠ OpenClaw 每条消息  
3. 本地优先；外部门禁后置 CP-20/21  
4. 优先接线现有模块，不造第二套 Store/UI  

## 阶段

| CP | 主题 | 本环境完成标准 |
|----|------|----------------|
| 7 | 探索 ↔ 统一 Task Runtime | 世界书合并闭环 + 测试 + commit |
| 8 | 助手扩展世界书/主题/情景剧/资源 | 工具+审批+测试 |
| 9 | Companion 三层 | 关系规划+记忆整理接线 |
| 10 | 离散主动事件 | 本地调度+预算 |
| 11 | 栖机应用事件 | 事件总线+核心 App 闭环 |
| 12 | 情景剧↔记忆 | 经历摘要进 Pop |
| 13 | YEOS 最小闭环 | 安装存档事件 |
| 14 | 声明式 Skill + 栖市 | 权限安装 |
| 15 | 备份迁移隐私 | 导入导出 |
| 16 | 首次启动 UX | 引导+错误文案 |
| 17 | 桌宠状态统一 | 与 Companion 一致 |
| 18 | 性能减重 | 懒加载 Agent |
| 19 | 安全加固 | 威胁测试 |
| 20 | 跨端构建准备 | APK + 外部 checklist |
| 21 | E2E 验收脚本 | 可重复流程 |

## CP-7 设计

```text
探索「任务」页
→ Explore Intent（复用/扩展 route）
→ 共享 AssistantTask + Mobile Adapter
→ Workspace 副本
→ Candidate / Diff / 批准
→ worldbook/store 新建条目（原条目不变）
→ External Required 明确提示
```

共享模块：`src/studio-assist/agent/*`（不复制 Loop）。
