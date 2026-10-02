/**
 * Feature control productization — autonomy, agent gates, activity, runtime lifecycle.
 * Cases map to product checklist §九 1–15 (unit/integration level).
 */

import assert from "node:assert/strict";
import {
  __clearAutonomyBagForTests,
  __setAutonomyBagForTests,
  applyAutonomyPreset,
  assertAutonomyAllowed,
  filterAutonomyCandidates,
  isAiAutonomousLifeEnabled,
  isAutonomyCapabilityEnabled,
  isWithinAutonomyQuietHours,
  loadAutonomyPrefs,
  saveAutonomyPrefs,
  AUTONOMY_PREFS_KEY,
} from "../src/companion/autonomy-prefs.js";
import { runCompanionLifeTick } from "../src/companion/life-tick.js";
import { __clearLifeStateForTests, saveLifeState, createEmptyLifeState } from "../src/companion/life-state.js";
import {
  __clearActivityLogForTests,
  appendActivity,
  listActivity,
} from "../src/companion/activity-log.js";
import {
  __setAgentPrefsStorageForTests,
  assertLocalAgentAllowed,
  assertExploreFilesAllowed,
  assertAgentResourceAccess,
  saveAgentPrefs,
  getAgentPrefs,
  AGENT_PREFS_KEY,
} from "../src/agent/capabilities/prefs.js";
import { ingestScenarioFinaleToCompanion, __clearScenarioMemoryForTests } from "../src/companion/scenario-memory-bridge.js";
import { runCharacterFixAgentTask } from "../src/studio-assist/agent/lazy-agent.js";
import { OpenClawMobileRuntimeAdapter } from "../src/integrations/openclaw-mobile/OpenClawMobileRuntimeAdapter.js";

const memory = new Map();
const memStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};

globalThis.localStorage = memStorage;

function ok(name) {
  console.log(`PASS ${name}`);
}

function todayLocalKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function setup() {
  memory.clear();
  __clearAutonomyBagForTests();
  __clearActivityLogForTests();
  __clearScenarioMemoryForTests();
  __clearLifeStateForTests?.();
  __setAgentPrefsStorageForTests(memStorage);
  __setAutonomyBagForTests(null);
}

async function main() {
  setup();

  // 1 + 3: autonomy off / quiet → no proactive candidates
  applyAutonomyPreset("quiet");
  assert.equal(isAiAutonomousLifeEnabled(), false);
  assert.equal(assertAutonomyAllowed("message").ok, false);
  assert.equal(assertAutonomyAllowed("diary").ok, false);
  assert.equal(assertAutonomyAllowed("feed").ok, false);
  ok("1/3 quiet blocks proactive kinds");

  // 2: Pop path not gated by autonomy (chat is separate) — autonomy off does not throw
  assert.equal(isAutonomyCapabilityEnabled("deskPetVisible"), false);
  ok("2 desk pet stays off until the user opens it");

  // 4 companion daily cap
  applyAutonomyPreset("companion");
  saveAutonomyPrefs({ dailyCap: 2, dailyProactiveBudget: 2, proactiveUsedToday: 2, budgetDate: todayLocalKey(), quietStart: "00:00", quietEnd: "00:00" });
  assert.equal(assertAutonomyAllowed("message").reason, "daily_cap");
  ok("4 companion daily cap");

  // 5 quiet hours
  applyAutonomyPreset("companion");
  saveAutonomyPrefs({ quietStart: "00:00", quietEnd: "23:59" });
  assert.equal(isWithinAutonomyQuietHours(new Date()), true);
  assert.equal(assertAutonomyAllowed("message").reason, "quiet_hours");
  ok("5 quiet hours block");

  // 6 scenario memory off
  applyAutonomyPreset("companion"); // scenarioMemory false
  const denied = ingestScenarioFinaleToCompanion({
    runId: "run-test-1",
    characterId: "char-1",
    narrativeSummary: "一次雨天散步",
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, "scenario_memory_disabled");
  applyAutonomyPreset("immersive");
  assert.equal(isAutonomyCapabilityEnabled("scenarioMemory"), true);
  assert.equal(isAutonomyCapabilityEnabled("gameMemory"), true);
  ok("6 scenario/game memory gated by autonomy");

  // 7 local agent off
  saveAgentPrefs({ localAgentEnabled: false });
  assert.equal(assertLocalAgentAllowed().ok, false);
  const agentSkip = await runCharacterFixAgentTask({ dryRun: true });
  assert.equal(agentSkip.skipped || agentSkip.ok === false, true);
  saveAgentPrefs({ localAgentEnabled: true });
  ok("7 local agent kill-switch");

  // 8 resource deny
  saveAgentPrefs({ resources: { ...getAgentPrefs().resources, chat: "deny", diary: "deny" } });
  assert.equal(assertAgentResourceAccess("chat", "read").ok, false);
  assert.equal(assertAgentResourceAccess("diary", "read").ok, false);
  saveAgentPrefs({ exploreFilesEnabled: false });
  assert.equal(assertExploreFilesAllowed().ok, false);
  saveAgentPrefs({ exploreFilesEnabled: true });
  ok("8 resource + explore file gates");

  // 9 activity center log
  __clearActivityLogForTests();
  appendActivity({
    title: "因用户长期离线，角色写了一篇日记",
    reason: "long_offline",
    capability: "自动日记",
    resourcesRead: ["生活状态"],
    usedModel: false,
  });
  assert.equal(listActivity(5)[0].title.includes("日记"), true);
  ok("9 activity log records reason");

  // 10 + 12 workspace release
  const adapter = new OpenClawMobileRuntimeAdapter();
  const events = [];
  for await (const ev of adapter.run({
    runId: "ws-release-1",
    maxSteps: 1,
    testScenario: "happy",
    allowFakeStream: true,
    instruction: "noop",
  })) {
    events.push(ev);
  }
  assert.equal(adapter.workspaces.has("ws-release-1"), true);
  assert.equal(adapter.controllers.has("ws-release-1"), false);
  assert.equal(Boolean(globalThis.__NYRA_OPENCLAW_SLICE_LOADED__), true);
  ok("10/12 task end releases controller and preserves artifacts; slice load flag set");

  // 11 Pop does not load OpenClaw — static import check via package boundary already CP-18;
  // here we only assert chat path marker: autonomy filter does not require openclaw
  const filtered = filterAutonomyCandidates([{ kind: "message", text: "hi" }]);
  assert.ok(Array.isArray(filtered));
  ok("11 autonomy filter independent of OpenClaw");

  // 13 low battery
  applyAutonomyPreset("companion");
  saveAutonomyPrefs({ quietStart: "00:00", quietEnd: "00:00", proactiveUsedToday: 0, budgetDate: todayLocalKey() });
  const low = assertAutonomyAllowed("message", { batteryLevel: 0.1, charging: false });
  assert.equal(low.ok, false);
  assert.equal(low.reason, "low_battery");
  ok("13 low battery policy");

  // 14 persistence
  applyAutonomyPreset("immersive");
  const raw = JSON.parse(memStorage.getItem(AUTONOMY_PREFS_KEY));
  assert.equal(raw.preset, "immersive");
  assert.equal(raw.aiAutonomousLife, true);
  const agentRaw = JSON.parse(memStorage.getItem(AGENT_PREFS_KEY));
  assert.equal(agentRaw.schemaVersion, 2);
  ok("14 prefs persist");

  // 15 life tick respects autonomy off
  __clearLifeStateForTests?.();
  applyAutonomyPreset("quiet");
  saveLifeState?.("char-x", createEmptyLifeState({ characterId: "char-x", nextWakeAt: 0, lastTickAt: 0 }));
  const tick = runCompanionLifeTick({
    characterId: "char-x",
    source: "long_offline",
    force: true,
    isFeatureEnabled: () => true,
  });
  // force bypasses wake gate — but candidates filtered by autonomy
  const emitted = (tick.candidates || []).length;
  assert.equal(emitted, 0);
  ok("15 quiet mode emits no candidates even on forced tick");

  // master switch off after companion
  applyAutonomyPreset("companion");
  saveAutonomyPrefs({ aiAutonomousLife: false });
  assert.equal(isAiAutonomousLifeEnabled(), false);
  assert.equal(assertAutonomyAllowed("message").ok, false);
  ok("1 master AI自主生活 off stops proactive");

  console.log("\nAll feature-control checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
