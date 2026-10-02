# CP-8 完成报告：栖机助手能力扩展

> 2026-07-30 · **PASSED**（Node）

## 新增

* 助手 Local Agent：世界书合并（复用 `task-runtime`）
* 主题候选：`nyra.theme.*` → 审批后 Direct Action `appearance.apply_theme`
* 情景剧：`nyra.scenario.inspect/validate/create_candidate`（Workspace）
* 资源包：`nyra.resource.inspect_manifest/validate_references/create_repaired_candidate`
* 夜间模式等仍走 Direct Action

## 验证

`npm run verify:assistant-cp8` + CP-6 / CP-7 回归
