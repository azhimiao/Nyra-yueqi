# CP-AV3 完成报告

- [x] `electron/pet-v2` frameless transparent alwaysOnTop
- [x] preload 仅暴露 catalog / openCharacter / deepLink / state hooks
- [x] 无角色 ID 硬编码；下拉切换 catalog 内角色
- [x] 位置持久化 userData

运行：`npm run desktop:pet-v2`

**Gate:** `runtime_green`（fixture 包存在 + pet-v2 可加载切换；自动化以 `avatar:verify-runtime` 为准）
