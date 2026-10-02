/**
 * C3: Unified Continuity display model across App / phone / pet / proactive.
 *
 * @see docs/COMPANION_PRODUCT_CUTOVER_RELEASE_PLAN.md §9
 */

import assert from "node:assert/strict";
import { LOCAL_KEYS } from "../src/constants.js";
import { createTemporalSnapshotV1 } from "../src/contracts/index.js";
import { setCutoverProfile } from "../src/features/cutover-profile.js";
import {
  createClock,
  setClockForTests,
  resetClockForTests,
} from "../src/temporal/index.js";
import {
  __setTimelineStorageForTests,
  clearTimelineForTests,
  appendTimelineEvent,
} from "../src/timeline/repository.js";
import {
  __setCandidateLedgerStorageForTests,
  clearCandidateLedgerForTests,
} from "../src/memory/candidate-ledger.js";
import {
  __setContinuityStorageForTests,
  __clearContinuityStoreForTests,
  getCompanionSurfaceModel,
  surfaceModelHasNumericIntimacy,
  COMPANION_SURFACES,
  refreshRelationshipContinuity,
} from "../src/relationship/index.js";
import { buildHomeRelationCardDisplay } from "../src/phone-shell/home-intimacy-display.js";
import { derivePetPresenceFromLifeState } from "../src/companion/pet-presence-bridge.js";
import {
  evaluateContinuityProactiveGate,
  __setContinuityProactiveStorageForTests,
  clearContinuityProactiveNotifiedForTests,
  wasContinuityProactiveNotified,
} from "../src/proactive/continuity-gate.js";
import { AUTONOMY_PREFS_KEY } from "../src/companion/autonomy-prefs.js";

const memory = new Map();
const memStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
  clear: () => memory.clear(),
};
globalThis.localStorage = memStorage;
globalThis.window = { localStorage: memStorage };

function ok(name) {
  console.log(`PASS ${name}`);
}

function enableFlags() {
  // C1 profile: legacy forces Continuity off; internal_v1 turns new-path ON.
  setCutoverProfile("internal_v1");
  memory.set(LOCAL_KEYS.featuresKey, JSON.stringify({
    relationshipContinuityV1: true,
    proactive: true,
  }));
  memory.set(AUTONOMY_PREFS_KEY, JSON.stringify({
    schemaVersion: 1,
    onboardingComplete: true,
    preset: "companion",
    aiAutonomousLife: true,
    proactiveMessage: true,
    autoDiary: true,
    autoMoments: false,
    anniversaryProactive: true,
    scenarioMemory: false,
    gameMemory: false,
    systemNotifications: true,
    deskPetVisible: true,
    frequency: "medium",
    dailyCap: 5,
    quietStart: "23:00",
    quietEnd: "06:00",
    dailyProactiveBudget: 5,
    budgetDate: "2026-08-07",
    proactiveUsedToday: 0,
    modelUsedToday: 0,
  }));
}

function resetAll() {
  memory.clear();
  __setTimelineStorageForTests(memStorage);
  __setCandidateLedgerStorageForTests(memStorage);
  __setContinuityStorageForTests(memStorage);
  __setContinuityProactiveStorageForTests(memStorage);
  clearTimelineForTests();
  clearCandidateLedgerForTests();
  __clearContinuityStoreForTests();
  clearContinuityProactiveNotifiedForTests();
  resetClockForTests();
  const fixedMs = Date.parse("2026-08-07T06:35:00.000Z");
  setClockForTests(createClock({ nowMs: fixedMs, timezone: "Asia/Shanghai" }));
  enableFlags();
}

async function seedEvent({
  companionId,
  title,
  eventId,
  needsFollowUp = false,
  kind = "shared_plan",
  realityNamespace = "reality",
}) {
  const temporalKind = kind === "follow_up" ? "follow_up" : "commitment";
  return appendTimelineEvent({
    eventId,
    eventType: kind,
    source: "conversation",
    sourceId: `msg_${eventId}`,
    idempotencyKey: `idem_${eventId}`,
    actor: "user",
    principal: "local",
    companionId,
    userId: "local",
    relationshipId: `rel:local:${companionId}`,
    realityNamespace,
    status: "confirmed",
    kind: temporalKind,
    title,
    temporalText: title,
    needsFollowUp,
    evidenceRefs: [`msg_${eventId}`],
    payload: {
      kind,
      title,
      summary: title,
      needsFollowUp,
      status: "confirmed",
      shared: kind === "shared_plan" || kind === "shared_moment",
    },
  });
}

async function main() {
  resetAll();
  const snap = createTemporalSnapshotV1({ locale: "zh-CN" });
  const now = Date.parse("2026-08-07T06:35:00.000Z");

  await seedEvent({
    companionId: "cmp_a",
    eventId: "evt_cafe",
    title: "周末去咖啡馆写作业",
    kind: "shared_plan",
  });
  await seedEvent({
    companionId: "cmp_a",
    eventId: "evt_follow",
    title: "答辩结束后询问结果",
    needsFollowUp: true,
    kind: "follow_up",
  });

  await refreshRelationshipContinuity({
    companionId: "cmp_a",
    userId: "local",
    snapshot: snap,
    locale: "zh-CN",
    force: true,
  });

  // --- Four surfaces same fingerprint ---
  const models = {};
  for (const surface of COMPANION_SURFACES) {
    models[surface] = getCompanionSurfaceModel({
      companionId: "cmp_a",
      userId: "local",
      surface,
      snapshot: snap,
      now,
      locale: "zh-CN",
    });
  }
  const fp = models.app.fingerprint;
  assert.ok(fp && fp !== "flag_off" && fp !== "empty");
  for (const surface of COMPANION_SURFACES) {
    assert.equal(
      models[surface].fingerprint,
      fp,
      `${surface} fingerprint mismatch`,
    );
    assert.equal(models[surface].companionId, "cmp_a");
  }
  // Phone helper + pet bridge consume the same fingerprint
  const phoneCard = buildHomeRelationCardDisplay({
    companionId: "cmp_a",
    userId: "local",
    snapshot: snap,
    locale: "zh-CN",
    presenceCopy: "我在这里",
  });
  assert.equal(phoneCard.fingerprint, fp);
  assert.ok(phoneCard.usesContinuity);
  const pet = derivePetPresenceFromLifeState("cmp_a", { userId: "local", now });
  assert.equal(pet.continuityFingerprint, fp);
  assert.ok(typeof pet.todayLine === "string");
  // pet exposes only short copy fields (todayLine/openLoop), not intimacy
  assert.equal(pet.relationshipState, null);
  ok("four surfaces same fingerprint for same companion/time");

  // --- No numeric intimacy fields ---
  for (const surface of COMPANION_SURFACES) {
    assert.equal(surfaceModelHasNumericIntimacy(models[surface]), false);
    const blob = JSON.stringify(models[surface]);
    assert.equal(/"intimacy"\s*:/.test(blob), false);
    assert.equal(/"trust"\s*:/.test(blob), false);
    assert.equal(/"tension"\s*:/.test(blob), false);
    assert.ok(models[surface].headline);
    assert.ok(models[surface].todayLine);
    assert.ok(Array.isArray(models[surface].evidenceRefs));
  }
  assert.ok(models.app.openLoop || models.app.recentSharedMoment || models.app.evidenceRefs.length);
  ok("no numeric intimacy fields in surface model");

  // --- Companion A/B isolation ---
  await seedEvent({
    companionId: "cmp_b",
    eventId: "evt_movie",
    title: "周六一起看电影",
    kind: "shared_plan",
  });
  await refreshRelationshipContinuity({
    companionId: "cmp_b",
    userId: "local",
    snapshot: snap,
    locale: "zh-CN",
    force: true,
  });
  const modelB = getCompanionSurfaceModel({
    companionId: "cmp_b",
    userId: "local",
    surface: "app",
    snapshot: snap,
    now,
  });
  const modelA2 = getCompanionSurfaceModel({
    companionId: "cmp_a",
    userId: "local",
    surface: "phone",
    snapshot: snap,
    now,
  });
  assert.notEqual(modelA2.fingerprint, modelB.fingerprint);
  const aBlob = JSON.stringify(modelA2);
  const bBlob = JSON.stringify(modelB);
  assert.equal(aBlob.includes("看电影"), false);
  assert.ok(bBlob.includes("看电影") || (modelB.recentSharedMoment || "").includes("电影"));
  ok("companion A/B isolation");

  // --- Fiction not in reality headline ---
  await seedEvent({
    companionId: "cmp_a",
    eventId: "evt_fiction",
    title: "雾港灯塔终章并肩站在悬崖",
    kind: "shared_moment",
    realityNamespace: "shared_fiction",
  });
  const afterFiction = getCompanionSurfaceModel({
    companionId: "cmp_a",
    userId: "local",
    surface: "app",
    snapshot: snap,
    now,
    forceProject: true,
  });
  const fictionBlob = [
    afterFiction.headline,
    afterFiction.todayLine,
    afterFiction.recentSharedMoment,
    afterFiction.openLoop,
  ].join("\n");
  assert.equal(fictionBlob.includes("雾港灯塔"), false);
  assert.equal(fictionBlob.includes("悬崖"), false);
  // Reality facts still present
  assert.ok(
    fictionBlob.includes("咖啡")
    || fictionBlob.includes("答辩")
    || afterFiction.evidenceRefs.some((id) => String(id).includes("cafe") || String(id).includes("follow")),
  );
  ok("fiction not in reality headline");

  // --- Proactive gate: evidence + dedupe by fingerprint+sourceRef ---
  const sourceRef = afterFiction.evidenceRefs[0] || "msg_evt_follow";
  const gate1 = evaluateContinuityProactiveGate({
    companionId: "cmp_a",
    userId: "local",
    sourceRef,
    snapshot: snap,
    wakeSource: "long_offline",
    markNotified: true,
  });
  assert.equal(gate1.ok, true, gate1.reason);
  assert.equal(gate1.fingerprint, afterFiction.fingerprint);
  assert.equal(wasContinuityProactiveNotified(afterFiction.fingerprint, sourceRef), true);
  const gate2 = evaluateContinuityProactiveGate({
    companionId: "cmp_a",
    userId: "local",
    sourceRef,
    snapshot: snap,
    wakeSource: "long_offline",
    markNotified: true,
  });
  assert.equal(gate2.ok, false);
  assert.equal(gate2.reason, "deduped");

  // Storage override under internal_v1 turns proactive off for diagnosis.
  memory.set(LOCAL_KEYS.featuresKey, JSON.stringify({
    relationshipContinuityV1: true,
    proactive: false,
  }));
  const gateOff = evaluateContinuityProactiveGate({
    companionId: "cmp_a",
    userId: "local",
    sourceRef: "msg_other",
    snapshot: snap,
    wakeSource: "long_offline",
  });
  assert.equal(gateOff.ok, false);
  assert.equal(gateOff.reason, "proactive_flag_off");
  ok("proactive gate respects flag and dedupes fingerprint+sourceRef");

  console.log("\nAll C3 product-cutover continuity checks passed.");
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
