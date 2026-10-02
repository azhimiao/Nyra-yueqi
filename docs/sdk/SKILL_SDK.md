# 月栖 Skill SDK（PAIOS P5）

> 第三方可增加能力，但不能破坏用户信任或角色连续性。  
> 代码入口：`src/skills/` · 模板：`sdk/skill-package/template/`

## 1. 包格式与版本协议

### `skill.json`

| 字段 | 说明 |
|------|------|
| `schemaId` | 必须为 `yueqi.skill.package.v1` |
| `sdkVersion` | 包声明的 SDK 主版本（整数） |
| `id` | `^[a-z][a-z0-9-]{1,63}$`，且不得占用首发能力 ID |
| `version` | `MAJOR.MINOR.PATCH` |
| `risk` | `R0`–`R3`（与 Agent Runtime 一致） |
| `permissions` | 子集：`network` / `file` / `clipboard` / `credentials` / `character_memory_shared` / `character_memory_private` |
| `entry` | 相对路径，禁止 `..` 与绝对路径 |
| `uiSlots` | `task_center_row` / `approval_extra` / `settings_panel` / `none` |
| `minHostSdk` / `maxHostSdk` | 宿主兼容窗口 |
| `characterMemoryAccess` | `none` \| `shared` \| `private` |

**兼容规则**

- 宿主只加载 `SKILL_SDK_MIN_SUPPORTED`…`SKILL_SDK_MAX_SUPPORTED` 窗口内的包。
- 升级：同 major 的 minor/patch，或 major  bump（必须写入 rollback 快照）。
- 降级请走 `rollbackSkill`，不要用 upgrade。
- Schema 漂移（错误 `schemaId`、越界 `sdkVersion`、未知权限）→ 安装/加载失败。

## 2. 生命周期

```text
validate → hash/sign → conformance → install
                ↓
         upgrade (snapshot) → conformance → replace
                ↓
         rollback ← snapshot
                ↓
         uninstall → purge data + task ids + UI slots
```

- **Install**：`installSkillPackage`
- **Upgrade**：`upgradeSkillPackage`（先快照）
- **Rollback**：`rollbackSkill`
- **Uninstall**：`uninstallSkill` — 不遗留 skill data、rollback slot、登记的 taskIds

生产加载：`loadSkillIntoProduction` — **conformance 失败则拒绝**。

## 3. 沙箱与权限

默认拒绝：`network`、`file`、`clipboard`、`credentials`、`character_memory_private`。

仅 **清单声明且用户/策略授予** 后可通过 `sandbox.require(perm)`。  
未声明的网络/文件访问被自动阻断；路径穿越（`..`、绝对路径）一律拒绝。

风险一致性：

- `network` / `file` ≥ R1
- `credentials` ≥ R2
- R3 外部写需要 `network`

## 4. 数据最小化

- 技能只能读取调用方显式传入的输入与已授权记忆。
- `characterMemoryAccess: "none"`（默认）不得读角色包记忆。
- `private` / `sensitive` 记忆需要 `character_memory_private` **且** access=`private`。
- 跨 `characterId` 永远隔离。
- 卸载后 skill-local `data` 清空；不得把私密记忆写入未声明存储。

## 5. UI 规范

- 不得占用消费者默认首页（桌宠/今天/小手机主路径）。
- 仅可贡献已声明 slot；`settings_panel` 标题禁止暴露签名/hash/debug 字样。
- 文案短、可解释；每个 slot ≤3 个动作。

## 6. 错误规范

| reason | 含义 |
|--------|------|
| `schema_drift` | 清单不符合 schema |
| `sdk_version_incompatible` | 宿主窗口不匹配 |
| `undeclared_permission` / `permission_denied` | 权限 |
| `conformance_failed` / `cannot_load_production` | 一致性门禁 |
| `hash_mismatch` / `signature_mismatch` | 完整性 |
| `duplicate_call` / `timeout` / `cancelled` / `offline` | 模拟器/运行时故障 |
| `unauthorized_private_memory` | 角色私密记忆越权 |
| `reserved_capability_id` | 试图覆盖首发能力 |

对外错误应对用户可读；详细 reason 留在任务中心/审计。

## 7. 本地模拟器

`runSkillSimulator` / `runSimulatorFaultMatrix` 覆盖：

1. `permission_deny`
2. `offline`
3. `timeout`
4. `cancel`
5. `duplicate`

模板技能：`sdk/skill-package/template`（`local-echo-status`）。

## 8. Typed APIs

| API | 模块 |
|-----|------|
| Capability | `capability-api.js` → `defineSkillCapability` |
| UI slot | `ui-slot-api.js` → `contributeUiSlot` |
| Events | `event-api.js` → `createEventBus` |

事件类型见 `SKILL_EVENT_TYPES`（install/uninstall/upgrade/rollback/invoke/permission/conformance）。

## 9. 签名、来源与回滚

- `hashSkillPackage`：SHA-256（canonical JSON）
- `signPackageHash` / `verifyPackageSignature`：HMAC-SHA256（本地发布密钥）
- `buildProvenance`：publisher / source / previousHash
- 升级自动写入 `yueqi.skills.rollback.v1`；`rollbackSkill` 恢复

## 10. 验收命令

```bash
npm run verify:core-p5
```
