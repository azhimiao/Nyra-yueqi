/**
 * CP-12 Companion — scenario finale → shared memory bridge.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildScenarioExperienceRecord,
  deriveImportantFactCandidates,
  deriveRelationshipDeltaFromRun,
  formatScenarioExperiencePromptBlock,
  getCommittedScenarioExperience,
  ingestScenarioFinaleToCompanion,
  onScenarioEventCompleted,
  scenarioFinaleIdempotentKey,
  __clearScenarioMemoryForTests,
  __setScenarioMemoryBagForTests,
} from "../../src/companion/scenario-memory-bridge.js";
import {
  __clearRelationshipForTests,
  __resetRelationshipIdSeqForTests,
  __setRelationshipStorageForTests,
} from "../../src/experience/relationship.js";
import { __setContextStorageForTests, clearAllContextItems, listItems } from "../../src/context/store.js";
import {
  __setCohabitStorageForTests,
} from "../../src/memory/cohabit-timeline.js";
import { __setLifeStorageForTests } from "../../src/life/store.js";
import { recordScenarioFinale, findCohabitByIdempotentKey } from "../../src/life/confluence.js";
import { emitAppEvent, __clearAppEventsForTests, __setAppEventStorageForTests } from "../../src/world/app-events.js";
import {
  applyAutonomyPreset,
  __clearAutonomyBagForTests,
  __setAutonomyBagForTests,
} from "../../src/companion/autonomy-prefs.js";

const failures = [];
function assert(c, m) {
  if (!c) failures.push(m);
}

function makeMemoryStorage() {
  const map = new Map();
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, v);
    },
    removeItem(k) {
      map.delete(k);
    },
  };
}

const storage = makeMemoryStorage();
globalThis.localStorage = storage;
globalThis.window = { localStorage: storage };
__setAutonomyBagForTests(null);
__clearAutonomyBagForTests();
// Scenario memory requires immersive (or custom) autonomy capability.
applyAutonomyPreset("immersive");

console.log("=== CP-12 Experience record ===");
{
  const record = buildScenarioExperienceRecord({
    runId: "run-cp12-1",
    scriptId: "script-rain-station",
    scriptTitle: "夜雨车站",
    summary: "伞下并肩等车，雨声把话声压得很轻。",
    characterId: "char-a",
    memoryCandidate: "夜雨车站，伞下并肩等车。",
    directorState: { intimacy: 2, trust: 2, tension: 1 },
  });
  assert(record.runId === "run-cp12-1", "runId");
  assert(record.scriptTitle === "夜雨车站", "scriptTitle");
  assert(record.narrativeSummary.includes("伞下"), "narrative summary");
  assert(record.idempotentKey === "scenario-finale:run-cp12-1", "idempotent key");
  assert(record.relationshipDeltaCandidates.length >= 1, "relationship delta candidates");
  assert(record.importantFactCandidates.length >= 1, "fact candidates");
}

console.log("=== CP-12 Derivation helpers ===");
{
  const delta = deriveRelationshipDeltaFromRun({ directorState: { intimacy: 3, trust: 2 } });
  assert(delta.kind === "shared_experience", "delta kind");
  assert(delta.intimacyDelta > 0, "positive intimacy delta");
  const facts = deriveImportantFactCandidates("我们约定下次一起看展", "记住这个约定");
  assert(facts.length >= 2, "multiple fact candidates");
}

console.log("=== CP-12 Idempotent companion ingest ===");
__clearScenarioMemoryForTests();
__setScenarioMemoryBagForTests({ committed: {} });
clearAllContextItems();
__setContextStorageForTests(storage);
__setCohabitStorageForTests(storage);
__setLifeStorageForTests(storage);
__clearRelationshipForTests();
__resetRelationshipIdSeqForTests();
__setRelationshipStorageForTests(storage);
{
  const rawTheater = "【舞台】角色：「台词一」\n用户：「台词二」";
  const summary = "夜雨车站谢幕，伞下并肩等车。";

  const life = recordScenarioFinale({
    characterId: "char-a",
    runId: "run-cp12-1",
    scriptId: "script-rain-station",
    scriptTitle: "夜雨车站",
    summary,
    diaryId: "diary-1",
  });
  assert(life.ok === true, "life confluence written");

  const first = ingestScenarioFinaleToCompanion({
    runId: "run-cp12-1",
    scriptId: "script-rain-station",
    scriptTitle: "夜雨车站",
    summary,
    characterId: "char-a",
    diaryId: "diary-1",
    memoryCandidate: "夜雨车站，伞下并肩等车。",
    directorState: { intimacy: 2, trust: 2 },
  });
  assert(first.ok && !first.alreadyCommitted, "first ingest ok");
  assert(getCommittedScenarioExperience("run-cp12-1")?.runId === "run-cp12-1", "committed bag");

  const second = ingestScenarioFinaleToCompanion({
    runId: "run-cp12-1",
    scriptId: "script-rain-station",
    scriptTitle: "夜雨车站",
    summary,
    characterId: "char-a",
  });
  assert(second.ok && second.alreadyCommitted === true, "second ingest idempotent");

  const items = listItems({ characterId: "char-a", limit: 50 }).filter(
    (i) => i.source === "companion.scenario_finale",
  );
  assert(items.length >= 1, "context graph has scenario finale item");
  assert(!items.some((i) => String(i.content).includes(rawTheater)), "no raw theater dump");

  const block = formatScenarioExperiencePromptBlock("char-a");
  assert(block.includes("共同经历摘要"), "prompt block label");
  assert(block.includes("夜雨") || block.includes("谢幕"), "prompt block has summary");
  assert(!block.includes("【舞台】"), "prompt block excludes theater markup");

  const cohabit = findCohabitByIdempotentKey("char-a", scenarioFinaleIdempotentKey("run-cp12-1"));
  assert(Boolean(cohabit), "cohabit idempotent row");
}

console.log("=== CP-12 CP-11 event fallback ===");
__clearAppEventsForTests();
__setAppEventStorageForTests(storage);
{
  const evt = emitAppEvent("scenario.event.completed", {
    appId: "scenario",
    runId: "run-cp12-2",
    scriptId: "script-rooftop",
    scriptTitle: "夏夜屋顶",
    characterId: "char-b",
    summary: "晚风里把秘密说得很轻。",
    narrativeSummary: "晚风里把秘密说得很轻。",
    importantFactCandidates: ["夏夜屋顶的秘密"],
    idempotentKey: scenarioFinaleIdempotentKey("run-cp12-2"),
  });
  const handled = onScenarioEventCompleted(evt);
  assert(handled.ok, "event handler ingests");
  assert(getCommittedScenarioExperience("run-cp12-2")?.scriptTitle === "夏夜屋顶", "event record stored");
  const again = onScenarioEventCompleted(evt);
  assert(again.alreadyCommitted === true, "event handler idempotent");
}

console.log("=== CP-12 Source wiring ===");
{
  const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const persistence = readFileSync(join(root, "src/scenario/runtime/persistence.js"), "utf8");
  const assemble = readFileSync(join(root, "src/prompt/assemble.js"), "utf8");
  const lifeWake = readFileSync(join(root, "src/companion/life-wake.js"), "utf8");
  assert(persistence.includes("ingestScenarioFinaleToCompanion"), "persistence wires bridge");
  assert(persistence.includes("narrativeSummary"), "event carries narrative summary");
  assert(assemble.includes("formatScenarioExperiencePromptBlock"), "prompt assemble reads block");
  assert(lifeWake.includes("bindScenarioMemoryBridgeListeners"), "life wake binds bridge");
}

if (failures.length) {
  console.error("FAILED", failures);
  process.exit(1);
}
console.log("CP-12 companion verify PASSED");
