# CP-AV2 完成报告

- [x] FixtureProvider（合成灰底 + 红条标记）
- [x] 可恢复 Job（`.avatar-factory/jobs/<id>/job.json` + stageHashes）
- [x] Identity → Canonical → Actions → Face → Matting(fixture) → Register → Package
- [x] 包写入 `public/avatar-packs/_fixture/<id>/`，`publishable: false`
- [x] catalog.json 无 xingli 硬编码
- [x] `npm run avatar:batch` 三角色

**Gate:** `fixture_green` = `npm run avatar:fixture-green`
