/**
 * Unified memory M5 — Scenario fiction isolation + Life privacy.
 *
 * Run: npm run verify:unified-memory-fiction
 * Alias: npm run verify:unified-memory-m5
 */

import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCAL_KEYS } from "../src/constants.js";
import {
  CUTOVER_PROFILE_KEY,
  __resetCutoverProfileCacheForTests,
} from "../src/features/cutover-profile.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = join(root, "docs/qa/unified-memory");
mkdirSync(evidenceDir, { recursive: true });

const memory = new Map();
const memStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};
globalThis.localStorage = memStorage;
globalThis.window = {
  localStorage: memStorage,
  dispatchEvent() {},
  addEventListener() {},
  removeEventListener() {},
};

function setFlags(partial = {}) {
  memory.set(LOCAL_KEYS.featuresKey, JSON.stringify(partial));
  const usesNewPath = Object.entries(partial).some(([, value]) => value === true);
  memory.set(CUTOVER_PROFILE_KEY, JSON.stringify(usesNewPath ? "internal_v1" : "legacy"));
  __resetCutoverProfileCacheForTests();
}

const cases = [];
function record(id, pass, detail = "") {
  cases.push({ id, pass: Boolean(pass), detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}${detail ? ` — ${detail}` : ""}`);
}

const {
  attemptScenarioDialogueRealityStable,
  emitScenarioFinaleTimeline,
  onScenarioFinale,
  ensureScenarioAdapterRegistered,
  __resetScenarioAdapterRegistrationForTests,
  SCENARIO_FINALE_EVENT_TYPE,
  SCENARIO_REALITY_NAMESPACE,
} = await import("../src/memory/adapters/scenario.js");

const {
  assertLifeFactShareable,
  buildLifePromptBag,
  projectLifeFactToPalace,
  ensureLifeAdapterRegistered,
  __resetLifeAdapterRegistrationForTests,
  classifyLifeShareClass,
} = await import("../src/memory/adapters/life.js");

const {
  ingestScenarioFinaleToCompanion,
  __setScenarioMemoryBagForTests,
  __clearScenarioMemoryForTests,
} = await import("../src/companion/scenario-memory-bridge.js");

const {
  __setAutonomyBagForTests,
} = await import("../src/companion/autonomy-prefs.js");

const {
  __setCandidateLedgerStorageForTests,
  promoteCandidateToStable,
  submitCandidate,
  STABLE_MEMORY_KEY,
} = await import("../src/memory/candidate-ledger.js");

const { __clearFeatureMemoryAdaptersForTests, getFeatureMemoryAdapter } = await import(
  "../src/memory/adapters/registry.js"
);

function resetAll() {
  memory.clear();
  __clearFeatureMemoryAdaptersForTests();
  __resetScenarioAdapterRegistrationForTests();
  __resetLifeAdapterRegistrationForTests();
  __clearScenarioMemoryForTests();
  __setScenarioMemoryBagForTests({ committed: {} });
  __setCandidateLedgerStorageForTests(memStorage);
  __setAutonomyBagForTests({
    onboardingComplete: true,
    aiAutonomousLife: true,
    scenarioMemory: true,
    preset: "immersive",
  });
  ensureScenarioAdapterRegistered();
  ensureLifeAdapterRegistered();
}

async function main() {
  // --- 1. Scenario dialogue line cannot become reality Stable ---
  {
    resetAll();
    setFlags({ unifiedMemoryAdaptersV1: true });
    const blocked = attemptScenarioDialogueRealityStable({
      line: "夜雨列车上我们在虚构站台牵了手",
      characterId: "companion-m5",
      companionId: "companion-m5",
      runId: "run-fiction-1",
    });
    assert.equal(blocked.blocked, true);
    assert.equal(blocked.promoted, false);
    assert.ok(
      blocked.reason === "fiction_reality_blocked"
        || blocked.reason === "shared_fiction_blocked",
      `unexpected reason: ${blocked.reason}`,
    );

    // Direct ledger: shared_fiction candidate cannot promote
    const submitted = submitCandidate({
      companionId: "companion-m5",
      claim: "虚构对白晋升尝试",
      category: "episodic",
      source: "scenario_dialogue",
      userStated: true,
      confidence: 0.99,
      realityNamespace: "shared_fiction",
      evidenceRefs: ["scenario:x"],
      idempotencyKey: "m5-fiction-promote-block",
    });
    assert.equal(submitted.ok, true);
    const promoted = promoteCandidateToStable(submitted.value.candidateId);
    assert.equal(promoted.ok, false);
    assert.equal(promoted.reason, "shared_fiction_blocked");

    const stableRaw = memStorage.getItem(STABLE_MEMORY_KEY);
    const stable = stableRaw ? JSON.parse(stableRaw) : { items: [] };
    assert.equal((stable.items || []).filter((m) => !m.deleted).length, 0);

    record(
      "scenario_line_not_reality_stable",
      true,
      `blocked=${blocked.reason}; promote=${promoted.reason}`,
    );
  }

  // --- 2. Finale produces exactly one Timeline event (injectable) ---
  {
    resetAll();
    setFlags({ unifiedMemoryAdaptersV1: true });
    const timeline = [];
    const appendTimeline = (event) => {
      timeline.push(event);
      return { ok: true, value: event };
    };

    const once = onScenarioFinale(
      {
        runId: "run-finale-1",
        summary: "谢幕：雨停后一起下了车",
        characterId: "companion-m5",
        companionId: "companion-m5",
        scriptTitle: "夜雨列车",
      },
      { appendTimeline },
    );
    assert.equal(once.ok, true);
    assert.equal(timeline.length, 1, "exactly one timeline event");
    assert.equal(timeline[0].eventType, SCENARIO_FINALE_EVENT_TYPE);
    assert.equal(timeline[0].realityNamespace, SCENARIO_REALITY_NAMESPACE);
    assert.equal(once.allowNumericRelationship, false);

    // Idempotent key via emit twice with same key → still one logical finale (caller may replace)
    const timeline2 = [];
    const append2 = (event) => {
      const key = event.idempotencyKey;
      const idx = timeline2.findIndex((e) => e.idempotencyKey === key);
      if (idx >= 0) timeline2[idx] = event;
      else timeline2.push(event);
      return { ok: true, value: event };
    };
    emitScenarioFinaleTimeline(
      {
        runId: "run-finale-2",
        summary: "同一谢幕",
        characterId: "companion-m5",
        companionId: "companion-m5",
        idempotencyKey: "scenario-finale:run-finale-2:experience.completed",
      },
      { appendTimeline: append2 },
    );
    emitScenarioFinaleTimeline(
      {
        runId: "run-finale-2",
        summary: "同一谢幕",
        characterId: "companion-m5",
        companionId: "companion-m5",
        idempotencyKey: "scenario-finale:run-finale-2:experience.completed",
      },
      { appendTimeline: append2 },
    );
    assert.equal(timeline2.length, 1, "idempotent finale collapses to one");

    // Bridge path also routes adapter and skips ordinary intimacy
    const bridgeTimeline = [];
    const bridge = ingestScenarioFinaleToCompanion({
      runId: "run-bridge-1",
      summary: "桥接谢幕摘要",
      characterId: "companion-m5",
      scriptTitle: "夜雨列车",
      appendTimeline: (event) => {
        bridgeTimeline.push(event);
        return { ok: true, value: event };
      },
    });
    assert.equal(bridge.ok, true);
    assert.equal(bridge.adapterPath, true);
    assert.equal(bridge.allowNumericRelationship, false);
    assert.equal(bridge.relationshipPlan?.allowNumericRelationship, false);
    assert.equal(bridgeTimeline.length, 1);
    assert.equal(bridgeTimeline[0].realityNamespace, "shared_fiction");

    record(
      "finale_one_timeline_event",
      true,
      `adapter=1 bridge=1 idempotent=1 ns=${SCENARIO_REALITY_NAMESPACE}`,
    );
  }

  // --- 3. privateFacts rejected from palace projector ---
  {
    resetAll();
    setFlags({ unifiedMemoryAdaptersV1: true });
    let fileCalls = 0;
    let kgCalls = 0;
    const gate = assertLifeFactShareable({
      text: "样本柜第三层有一张未写完的便签",
      isPrivateFact: true,
      sourceField: "privateFacts",
      visibility: "private",
    });
    assert.equal(gate.ok, false);
    assert.equal(gate.reason, "private_fact_blocked");

    const projected = await projectLifeFactToPalace(
      {
        text: "礼物候选是深绿色围巾",
        isPrivateFact: true,
        visibility: "private",
      },
      {
        fileDrawer: async () => {
          fileCalls += 1;
          return { id: "should-not" };
        },
        extractKg: async () => {
          kgCalls += 1;
          return { ok: true };
        },
      },
    );
    assert.equal(projected.ok, false);
    assert.equal(projected.reason, "private_fact_blocked");
    assert.equal(fileCalls, 0, "fileDrawer must not run");
    assert.equal(kgCalls, 0, "KG extract must not run");

    // Shared summary may project
    const sharedOk = await projectLifeFactToPalace(
      {
        text: "一起在食堂吃了晚饭",
        visibility: "shared",
        summary: "一起在食堂吃了晚饭",
      },
      {
        fileDrawer: async (p) => {
          fileCalls += 1;
          return { id: "drawer-ok", ...p };
        },
      },
    );
    assert.equal(sharedOk.ok, true);
    assert.equal(fileCalls, 1);

    record(
      "privateFacts_rejected_palace",
      true,
      `blocked=${gate.reason}; sharedFiled=${sharedOk.filed}`,
    );
  }

  // --- 4. discoverable unobserved not in prompt bag helper ---
  {
    resetAll();
    setFlags({ unifiedMemoryAdaptersV1: true });
    const secret = "未观察的发现痕迹不应进入提示词";
    const pack = {
      events: [
        {
          id: "ev-shared",
          visibility: "shared",
          summary: "和你打了招呼",
          occurredAt: "2026-08-08T10:00:00.000Z",
          privateFacts: ["绝对不能泄漏的私密念头"],
          evidenceIds: [],
        },
        {
          id: "ev-disc",
          visibility: "discoverable",
          summary: "在咖啡馆写了未寄出的信",
          occurredAt: "2026-08-08T11:00:00.000Z",
          privateFacts: [],
          evidenceIds: ["evd-1"],
        },
      ],
      evidence: [
        {
          id: "evd-1",
          discoverable: true,
          title: "草稿信",
          content: secret,
        },
      ],
    };

    const bag = buildLifePromptBag({
      pack,
      observedIds: new Set(), // nothing observed
      maxLines: 10,
    });

    assert.ok(
      bag.facts.every((f) => f.shareClass === "shared"),
      "only shared facts when unobserved",
    );
    assert.ok(
      !bag.lines.some((l) => l.includes(secret)),
      "discoverable unobserved content absent",
    );
    assert.ok(
      !bag.lines.some((l) => l.includes("绝对不能泄漏")),
      "privateFacts absent from bag",
    );
    assert.ok(
      bag.blocked.some((b) => b.reason === "discoverable_unobserved"),
      "discoverable_unobserved recorded",
    );
    assert.ok(
      bag.blocked.some((b) => b.reason === "private_fact_blocked"),
      "privateFacts blocked",
    );
    assert.equal(classifyLifeShareClass({ visibility: "discoverable" }), "discoverable");

    // After observation, discoverable may enter
    const bag2 = buildLifePromptBag({
      pack,
      observedIds: new Set(["evd-1"]),
      maxLines: 10,
    });
    assert.ok(
      bag2.lines.some((l) => l.includes("草稿信") || l.includes(secret.slice(0, 8))),
      "observed discoverable enters bag",
    );

    record(
      "discoverable_unobserved_not_in_prompt_bag",
      true,
      `blocked=${bag.blocked.length}; lines=${bag.lines.length}; afterObs=${bag2.lines.length}`,
    );
  }

  // --- 5. Adapters registered ---
  {
    resetAll();
    assert.ok(getFeatureMemoryAdapter("scenario"));
    assert.ok(getFeatureMemoryAdapter("life"));
    record("adapters_registered", true, "scenario,life");
  }

  const passed = cases.filter((c) => c.pass).length;
  const failed = cases.length - passed;
  const report = {
    wave: "M5",
    name: "unified-memory-fiction",
    passed,
    failed,
    total: cases.length,
    cases,
    at: new Date().toISOString(),
  };
  writeFileSync(join(evidenceDir, "M5_VERIFY.json"), JSON.stringify(report, null, 2));

  console.log(`\n${failed ? "FAIL" : "OK"}  ${passed}/${cases.length} unified-memory fiction / M5`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
