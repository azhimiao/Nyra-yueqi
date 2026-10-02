/**
 * CP-10 Companion — discrete proactive life tick system.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  compressOfflineElapsed,
  runCompanionLifeTick,
  simulateOfflineCatchUp,
  WAKE_SOURCES,
} from "../../src/companion/life-tick.js";
import {
  __clearLifeStateForTests,
  __setLifeStateStorageForTests,
  checkEmitBudget,
  createEmptyBehaviorBudget,
  consumeBudgetSlot,
  getLifeState,
  saveLifeState,
  violatesContentGuardrails,
  ingestRelationshipPlanIntoLifeState,
} from "../../src/companion/life-state.js";
import { LIFE_TICK_LIMITS } from "../../src/proactive/config.js";
import {
  applyAutonomyPreset,
  saveAutonomyPrefs,
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

// Product default is quiet until First Light / autonomy onboarding; tests opt into companion.
const autonomyStorage = makeMemoryStorage();
globalThis.localStorage = autonomyStorage;
__setAutonomyBagForTests(null);
__clearAutonomyBagForTests();
applyAutonomyPreset("companion");
// baseNow is 14:00Z (= 22:00 CST); keep autonomy quiet hours away from that local wall clock.
saveAutonomyPrefs({ quietStart: "03:00", quietEnd: "04:00" });


function isWithinDndAlways() {
  return true;
}

function isWithinDndNever() {
  return false;
}

const baseNow = Date.parse("2026-07-30T14:00:00.000Z");

console.log("=== CP-10 Wake sources ===");
assert(WAKE_SOURCES.includes("user_message"), "user_message source");
assert(WAKE_SOURCES.includes("visibility_restore"), "visibility_restore source");
assert(WAKE_SOURCES.length >= 8, "eight wake sources");

console.log("=== CP-10 Proactive disabled ===");
__clearLifeStateForTests();
__setLifeStateStorageForTests(makeMemoryStorage());
{
  const r = runCompanionLifeTick({
    characterId: "char-a",
    source: "open_app",
    now: baseNow,
    isFeatureEnabled: () => false,
    isWithinDnd: isWithinDndNever,
  });
  assert(r.skipped && r.reason === "proactive_disabled", "skip when proactive off");
}

console.log("=== CP-10 Quiet hours ===");
__clearLifeStateForTests();
{
  const r = runCompanionLifeTick({
    characterId: "char-a",
    source: "long_offline",
    now: baseNow,
    isFeatureEnabled: () => true,
    isWithinDnd: isWithinDndAlways,
    notificationSettings: { dndStart: "00:00", dndEnd: "23:59" },
    force: true,
  });
  assert(r.skipped && r.reason === "quiet_hours", "skip during quiet hours");
}

console.log("=== CP-10 Daily budget + cooldown ===");
__clearLifeStateForTests();
{
  let budget = createEmptyBehaviorBudget();
  budget = consumeBudgetSlot(budget, "message", baseNow);
  budget = consumeBudgetSlot(budget, "message", baseNow + 1000);
  budget = consumeBudgetSlot(budget, "message", baseNow + 2000);
  assert(budget.dailyCounts.message === 3, "daily message limit");

  const cooled = checkEmitBudget(budget, baseNow + 5000, LIFE_TICK_LIMITS);
  assert(!cooled.ok && cooled.reason === "cooldown", "cooldown enforced");
}

console.log("=== CP-10 Offline catch-up compression ===");
{
  const threeDays = compressOfflineElapsed(3 * 24 * 60 * 60 * 1000);
  assert(threeDays.length === 1 && threeDays[0].kind === "day_passed", "compress days");
  assert(threeDays[0].units <= 7, "cap day units");

  const ninetyMinutes = compressOfflineElapsed(90 * 60 * 1000);
  assert(ninetyMinutes.length === 1 && ninetyMinutes[0].kind === "hour_block", "compress hours");
  assert(ninetyMinutes[0].units <= 3, "max 3 hour blocks");

  const perMinute = compressOfflineElapsed(45 * 60 * 1000);
  assert(perMinute.length <= 3, "never per-minute phases");
}

console.log("=== CP-10 No per-minute spam on long offline ===");
__clearLifeStateForTests();
{
  const r = simulateOfflineCatchUp(
    {
      characterId: "char-b",
      isFeatureEnabled: () => true,
      isWithinDnd: isWithinDndNever,
      limits: LIFE_TICK_LIMITS,
      now: baseNow,
    },
    48 * 60 * 60 * 1000,
  );
  assert(r.ok && r.tickCount === 1, "single tick for 48h offline");
  assert((r.catchUp || []).length <= 3, "compressed catch-up phases");
  assert((r.candidates || []).length <= LIFE_TICK_LIMITS.dailyMessageLimit + 2, "budget caps emits");
}

console.log("=== CP-10 Content guardrails ===");
assert(violatesContentGuardrails("你不理我就永远后悔"), "block emotional blackmail");
assert(violatesContentGuardrails("快来救我出事了"), "block fake emergency");
assert(violatesContentGuardrails("充值解锁才能继续"), "block paywall threat");
assert(!violatesContentGuardrails("好久不见，回来就好"), "allow gentle copy");

console.log("=== CP-10 CP-9 plan ingestion ===");
__clearLifeStateForTests();
{
  ingestRelationshipPlanIntoLifeState("char-c", {
    skipped: false,
    eventType: "promise",
    goals: ["记录承诺细节"],
    proactiveCandidates: [{ id: "promise_reminder", tone: "warm", delayHours: 2 }],
    diaryHint: "新的约定",
    relationshipState: { intimacy: 1.2, trust: 1.5, tension: 0.1 },
  });
  const state = getLifeState("char-c");
  assert(state.currentGoals.includes("记录承诺细节"), "goals ingested");
  assert(state.pendingEvents.some((e) => e.id === "promise_reminder"), "pending event from CP-9");
}

console.log("=== CP-10 Deterministic tick emits candidates ===");
__clearLifeStateForTests();
{
  saveLifeState("char-d", {
    characterId: "char-d",
    lastTickAt: baseNow - 8 * 3600000,
    nextWakeAt: baseNow - 1000,
    currentMood: "calm",
    pendingEvents: [{
      id: "welcome_back",
      type: "proactive_candidate",
      tone: "casual",
      dueAt: baseNow - 500,
      source: "cp9_planner",
    }],
  });
  const r = runCompanionLifeTick({
    characterId: "char-d",
    source: "long_offline",
    now: baseNow,
    isFeatureEnabled: () => true,
    isWithinDnd: isWithinDndNever,
    limits: LIFE_TICK_LIMITS,
    force: true,
  });
  assert(r.ok && !r.skipped, "tick runs");
  assert(r.candidates?.length >= 1, "emits at least one candidate");
  assert(r.state?.lastTickAt === baseNow, "updates lastTickAt");
  assert(r.state?.nextWakeAt > baseNow, "schedules nextWakeAt");
}

console.log("=== CP-10 Source wiring ===");
{
  const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const app = readFileSync(join(root, "src/app.js"), "utf8");
  const chat = readFileSync(join(root, "src/panels/chat.js"), "utf8");
  const phone = readFileSync(join(root, "src/phone-shell/phone-shell.js"), "utf8");
  const scheduler = readFileSync(join(root, "src/proactive/scheduler.js"), "utf8");
  assert(app.includes("bindCompanionLifeWakeListeners"), "app binds visibility wake");
  assert(app.includes('wakeCompanionLife("open_app"'), "app resume tick");
  assert(chat.includes('wakeCompanionLife("user_message"'), "chat user message wake");
  assert(phone.includes('tickCompanionLife("view_diary"'), "phone diary wake");
  assert(phone.includes('tickCompanionLife("like_feed"'), "phone like feed wake");
  assert(scheduler.includes("wakeCompanionLife"), "scheduler uses life tick not LLM heartbeat");
  assert(!scheduler.includes("wakeCharacterOnce"), "heartbeat no longer calls LLM every check");
}

if (failures.length) {
  console.error("FAILED", failures);
  process.exit(1);
}
console.log("CP-10 companion verify PASSED");
