# CP-12 完成报告：情景剧 ↔ 关系记忆闭环

> 2026-07-30 · **PASSED**（Node）

## 目标

情景剧谢幕后，用户应能在 Pop 聊天中自然引用**共同经历摘要**，而不把剧场对白原文灌进 Pop IM 历史。

## 新增

* **经历摘要桥** `src/companion/scenario-memory-bridge.js`
  * `buildScenarioExperienceRecord` — `runId`、剧本标题、叙事摘要、关系变化候选、重要事实候选
  * `ingestScenarioFinaleToCompanion` — 幂等键 `scenario-finale:{runId}` → context graph（`companion.scenario_finale`）+ 可选 CP-9 关系规划
  * `formatScenarioExperiencePromptBlock` — Pop / `compilePrompt` 可读块（摘要标签，非对白原文）
  * `onScenarioEventCompleted` — CP-11 `scenario.event.completed` 过滤后兜底写入

## 接线

| 路径 | 行为 |
|------|------|
| `commitFinaleMemory` | 日记 + cohabit/life（C6）→ companion ingest → 丰富 CP-11 事件 |
| `bindScenarioMemoryBridgeListeners` | `life-wake.js` 订阅谢幕事件（幂等兜底） |
| `prompt/assemble.js` | `scenario_shared_experience` 隐式块 priority 78 |
| `life/confluence.recordScenarioFinale` | 既有幂等 cohabit / DayPack 投影（复用） |

## Pop 如何看到摘要

1. **Prompt 组装**：`compilePrompt` → `assemblePromptBundle` 注入 `formatScenarioExperiencePromptBlock(characterId)`，标签为「共同经历摘要（情景剧谢幕，非剧场对白原文）」。
2. **Context graph**：`ingestScenarioFinaleToCompanion` 写入 `episodic` + 可选 `semantic` 事实项，`sourceRef = scenario-finale:{runId}`。
3. **Life 消费者**：`listSharedLifeSummaries` / `consumeDiarySharedExperiences` 仍可读 cohabit 谢幕行（C6 路径）。
4. **不污染 IM**：剧场 turn/beats **不**写入 Pop 消息表；仅用户确认的谢幕摘要进入记忆层。

## 边界

* **不**在每条 Pop 消息调用 OpenClaw / Agent 循环
* CP-9 关系规划仅在谢幕 ingest 时确定性触发（重要事件启发式），非 per-message
* 幂等：重复谢幕提交不重复刷屏 cohabit / context graph

## 验证

```text
npm run verify:companion-cp12
npm run verify:world-cp11
npm run verify:companion-cp9
```

## Commit

`46c1628` — `feat(companion): close scenario experience into shared memory`
