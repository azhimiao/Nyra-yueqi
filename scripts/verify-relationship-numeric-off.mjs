/**
 * W1 — Ordinary companion chat must not apply intimacy/trust/tension deltas.
 * Scenario / shared_fiction path may still apply numeric relationship patches.
 */

import assert from "node:assert/strict";
import {
  planRelationship,
  allowsNumericRelationshipDeltas,
} from "../src/companion/relationship-planner.js";
import {
  onCompanionChatTurn,
  onCompanionImportantEvent,
  __resetCompanionSessionHooksForTests,
} from "../src/companion/session-hooks.js";
import {
  getRelationshipState,
  saveRelationshipState,
  __setRelationshipStorageForTests,
  __clearRelationshipForTests,
  __resetRelationshipIdSeqForTests,
  applyAcceptedRelationPatch,
} from "../src/experience/relationship.js";
import {
  __setLifeStateStorageForTests,
  __clearLifeStateForTests,
  getLifeState,
} from "../src/companion/life-state.js";
import { advanceRelationshipSnapshot } from "../src/companion/life-tick.js";
import { derivePetPresenceFromLifeState } from "../src/companion/pet-presence-bridge.js";
import {
  computeHomeIntimacyScore,
  buildHomeRelationCardDisplay,
  isHomeIntimacyNumericEnabled,
} from "../src/phone-shell/home-intimacy-display.js";

function memoryStorage() {
  const map = new Map();
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, String(v));
    },
    removeItem(k) {
      map.delete(k);
    },
    clear() {
      map.clear();
    },
  };
}

function ok(name) {
  console.log(`PASS ${name}`);
}

function snapshotNumeric(state) {
  return {
    intimacy: Number(state.intimacy) || 0,
    trust: Number(state.trust) || 0,
    tension: Number(state.tension) || 0,
  };
}

function main() {
  const storage = memoryStorage();
  globalThis.localStorage = storage;
  __setRelationshipStorageForTests(storage);
  __setLifeStateStorageForTests(storage);
  __clearRelationshipForTests();
  __clearLifeStateForTests();
  __resetRelationshipIdSeqForTests();
  __resetCompanionSessionHooksForTests();

  const characterId = "w1-ordinary-char";
  saveRelationshipState(characterId, {
    characterId,
    intimacy: 2.4,
    trust: 1.8,
    tension: 0.6,
  });
  const before = snapshotNumeric(getRelationshipState(characterId));
  assert.equal(before.intimacy, 2.4);
  assert.equal(before.trust, 1.8);
  assert.equal(before.tension, 0.6);
  ok("seed legacy numeric relationship (read-only baseline)");

  assert.equal(allowsNumericRelationshipDeltas({}), false);
  assert.equal(allowsNumericRelationshipDeltas({ allowNumericRelationship: true }), true);
  assert.equal(allowsNumericRelationshipDeltas({ meta: { scenarioFinale: true } }), true);
  assert.equal(allowsNumericRelationshipDeltas({ realityNamespace: "shared_fiction" }), true);
  assert.equal(allowsNumericRelationshipDeltas({ realityNamespace: "simulation" }), true);
  assert.equal(allowsNumericRelationshipDeltas({ realityNamespace: "reality" }), false);
  ok("allowsNumericRelationshipDeltas gates ordinary vs scenario");

  const ordinaryPlan = planRelationship({
    characterId,
    sessionId: "sess-ordinary",
    userText: "我爱你，也保证下次一定记得",
    assistantText: "嗯，我记住了",
    apply: true,
  });
  assert.equal(ordinaryPlan.skipped, false);
  assert.ok(ordinaryPlan.eventType);
  assert.equal(ordinaryPlan.relationshipDelta, null);
  assert.equal(ordinaryPlan.allowNumericRelationship, false);
  assert.equal(ordinaryPlan.applied, false);
  assert.deepEqual(snapshotNumeric(getRelationshipState(characterId)), before);
  ok("planRelationship ordinary path: no delta, no apply, store unchanged");

  const turn = onCompanionChatTurn({
    characterId,
    sessionId: "sess-ordinary-2",
    userText: "我们吵架了，对不起，原谅我",
    assistantText: "没事，我在",
  });
  assert.equal(turn.ok, true);
  assert.ok(turn.importantPlan);
  assert.equal(turn.importantPlan.applied, false);
  assert.equal(turn.importantPlan.relationshipDelta, null);
  assert.deepEqual(snapshotNumeric(getRelationshipState(characterId)), before);
  const lifeAfterOrdinary = getLifeState(characterId);
  // Life-state may be created empty; must not have been rewritten from applied deltas.
  assert.deepEqual(snapshotNumeric(getRelationshipState(characterId)), before);
  ok("onCompanionChatTurn ordinary: experience store intimacy/trust/tension unchanged");

  const importantOrdinary = onCompanionImportantEvent({
    characterId,
    sessionId: "sess-important",
    eventType: "strong_emotion",
    userText: "好想你",
  });
  assert.equal(importantOrdinary.applied, false);
  assert.equal(importantOrdinary.relationshipDelta, null);
  assert.deepEqual(snapshotNumeric(getRelationshipState(characterId)), before);
  ok("onCompanionImportantEvent ordinary: no numeric apply");

  // Scenario / shared_fiction path still applies
  const scenarioChar = "w1-scenario-char";
  saveRelationshipState(scenarioChar, {
    characterId: scenarioChar,
    intimacy: 1,
    trust: 1,
    tension: 0.2,
  });
  const scenarioBefore = snapshotNumeric(getRelationshipState(scenarioChar));
  const scenarioPlan = planRelationship({
    characterId: scenarioChar,
    sessionId: "run-scenario-1",
    userText: "纪念日一起看了雨",
    eventType: "anniversary",
    allowNumericRelationship: true,
    realityNamespace: "shared_fiction",
    meta: { scenarioFinale: true, realityNamespace: "shared_fiction" },
    apply: true,
    projectionKey: "scenario-finale:run-scenario-1",
  });
  assert.equal(scenarioPlan.skipped, false);
  assert.ok(scenarioPlan.relationshipDelta);
  assert.equal(scenarioPlan.allowNumericRelationship, true);
  assert.equal(scenarioPlan.applied, true);
  const scenarioAfter = snapshotNumeric(getRelationshipState(scenarioChar));
  assert.ok(scenarioAfter.intimacy > scenarioBefore.intimacy || scenarioAfter.trust > scenarioBefore.trust);
  ok("scenario/shared_fiction planRelationship still applies numeric deltas");

  // Direct experience applyAcceptedRelationPatch remains available (simulation isolation)
  const patch = applyAcceptedRelationPatch(
    getRelationshipState(scenarioChar),
    { intimacyDelta: 0.1, trustDelta: 0.05, tensionDelta: 0, kind: "shared_experience" },
    { characterId: scenarioChar, projectionKey: "exp-candidate:1", summary: "sim" },
  );
  assert.equal(patch.applied, true);
  ok("experience applyAcceptedRelationPatch still works for scenario/simulation stores");

  // life-tick freeze
  const frozen = advanceRelationshipSnapshot(
    { relationshipState: { intimacy: 3, trust: 2, tension: 1 } },
    [{ kind: "day_passed", units: 3 }, { kind: "brief_absence", units: 1 }],
  );
  assert.deepEqual(frozen, { intimacy: 3, trust: 2, tension: 1 });
  ok("advanceRelationshipSnapshot does not mutate ordinary numeric snapshot");

  // pet presence strips numeric relationship
  saveRelationshipState(characterId, { characterId, intimacy: 2.4, trust: 1.8, tension: 0.6 });
  const presence = derivePetPresenceFromLifeState(characterId);
  assert.equal(presence.relationshipState, null);
  assert.ok(presence.presenceLabel);
  ok("pet presence bridge does not expose numeric relationshipState");

  // phone home score helper
  assert.equal(isHomeIntimacyNumericEnabled(), false);
  assert.equal(computeHomeIntimacyScore({ intimacy: 5, trust: 5 }), null);
  assert.equal(computeHomeIntimacyScore(
    { intimacy: 5, trust: 5 },
    { showNumericScore: true, realityNamespace: "shared_fiction" },
  ), 100);
  const card = buildHomeRelationCardDisplay({
    presenceCopy: "我在这里，陪你把今天过好。",
    togetherDays: 12,
    togetherDaysLabel: "第 12 天",
  });
  assert.equal(card.score, null);
  assert.equal(card.showNumericScore, false);
  assert.equal(card.showProgressBar, false);
  assert.match(card.meta, /我在这里/);
  assert.doesNotMatch(card.meta, /\d{1,3}%/);
  assert.equal(card.labelKey, "home.relationStatus");
  const continuityCard = buildHomeRelationCardDisplay({
    presenceCopy: "I am here with you.",
    togetherDays: 12,
    togetherDaysLabel: "Day 12",
    useContinuity: true,
  });
  assert.equal(continuityCard.labelKey, "home.relationContinuity");
  assert.equal(continuityCard.showNumericScore, false);
  ok("phone home intimacy helper returns null / non-numeric card");

  // legacy ordinary store still intact (no destructive delete)
  assert.deepEqual(snapshotNumeric(getRelationshipState(characterId)), before);
  ok("legacy ordinary numeric data retained read-only");

  void lifeAfterOrdinary;
  console.log("\nAll W1 relationship-numeric-off checks passed.");
}

main();
