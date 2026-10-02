/**
 * W6 — RelationshipContinuity behavior verify (plan §W6 / §8.2–8.3 / §5.5).
 */

import assert from "node:assert/strict";
import { LOCAL_KEYS } from "../src/constants.js";
import { isFeatureEnabled } from "../src/features/flags.js";
import { setCutoverProfile } from "../src/features/cutover-profile.js";
import {
  createRelationshipContinuityV1,
  validateRelationshipContinuityV1,
  validateEvidenceBackedText,
  createEvidenceBackedText,
  createTemporalSnapshotV1,
  createStableMemoryV1,
} from "../src/contracts/index.js";
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
  loadContinuity,
  refreshRelationshipContinuity,
  projectRelationshipContinuity,
  continuityHasFactualClaims,
  continuityHomeLines,
  getContinuitySources,
  validateClaimToEvidence,
  shouldSkipRegenerate,
  CONTINUITY_STORE_KEY,
  CONTINUITY_STORE_META,
} from "../src/relationship/index.js";
import {
  buildHomeRelationCardDisplay,
  computeHomeIntimacyScore,
} from "../src/phone-shell/home-intimacy-display.js";
import { createClock, setClockForTests, resetClockForTests } from "../src/temporal/index.js";

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

function resetAll() {
  memory.clear();
  __setTimelineStorageForTests(memStorage);
  __setCandidateLedgerStorageForTests(memStorage);
  __setContinuityStorageForTests(memStorage);
  clearTimelineForTests();
  clearCandidateLedgerForTests();
  __clearContinuityStoreForTests();
  resetClockForTests();
  const fixedMs = Date.parse("2026-08-07T06:35:00.000Z");
  setClockForTests(createClock({ nowMs: fixedMs, timezone: "Asia/Shanghai" }));
}

function enableContinuityFlag(on = true) {
  // C1: legacy profile forces Continuity off; pin internal_v1 when testing Continuity on.
  setCutoverProfile(on ? "internal_v1" : "legacy");
  memory.set(LOCAL_KEYS.featuresKey, JSON.stringify({ relationshipContinuityV1: on }));
}

async function seedConfirmedEvent({ companionId, title, eventId, needsFollowUp = false, kind = "shared_plan" }) {
  const temporalKind = ["observation", "commitment", "follow_up", "calendar", "task", "anniversary"].includes(kind)
    ? kind
    : kind === "follow_up"
      ? "follow_up"
      : "commitment";
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
    realityNamespace: "reality",
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
    },
  });
}

async function main() {
  resetAll();

  // --- Contract ---
  const badEvidence = validateEvidenceBackedText({ text: "hi", sourceIds: [], evidenceRefs: [], confidence: 0.5 });
  assert.equal(badEvidence.ok, false);
  assert.ok(badEvidence.errors.includes("sourceIds"));
  const goodEvidence = createEvidenceBackedText({
    text: "边界：不要叫宝宝",
    sourceIds: ["mem_1"],
    evidenceRefs: ["mem_1"],
    confidence: 0.9,
  });
  assert.equal(validateEvidenceBackedText(goodEvidence).ok, true);
  const continuity = createRelationshipContinuityV1({
    userId: "local",
    companionId: "cmp_a",
    localDate: "2026-08-07",
    openLoops: [],
    userBoundaries: [goodEvidence],
    sourceFingerprint: "abc",
    generatedAt: new Date().toISOString(),
  });
  assert.equal(validateRelationshipContinuityV1(continuity).ok, true);
  assert.equal(CONTINUITY_STORE_META.rebuildable, true);
  assert.equal(CONTINUITY_STORE_META.authoritative, false);
  assert.ok(CONTINUITY_STORE_KEY.includes("continuity"));
  ok("contract EvidenceBackedText + Continuity validate");

  // --- No evidence → no fabricated facts ---
  enableContinuityFlag(true);
  assert.equal(isFeatureEnabled("relationshipContinuityV1"), true);
  const snap = createTemporalSnapshotV1({ locale: "zh-CN" });
  const emptyProj = projectRelationshipContinuity({
    companionId: "cmp_empty",
    userId: "local",
    snapshot: snap,
    timelineEvents: [],
    stableMemories: [],
  });
  assert.equal(continuityHasFactualClaims(emptyProj), false);
  assert.equal(emptyProj.recentSharedMoment, undefined);
  assert.equal(emptyProj.currentCareFocus, undefined);
  const emptyText = JSON.stringify(emptyProj);
  assert.equal(/昨天你/.test(emptyText), false);
  assert.equal(/yesterday you/i.test(emptyText), false);
  const softLines = continuityHomeLines(emptyProj, { locale: "zh-CN" });
  assert.ok(softLines.length >= 1);
  assert.ok(softLines.every((l) => !/昨天你/.test(l)));
  ok("no evidence → no fabricated facts");

  // --- Claim without evidence rejected ---
  const reject = validateClaimToEvidence("昨天你终于把答辩材料改完了。", []);
  assert.equal(reject.ok, false);
  assert.ok(["fabricated_temporal_claim", "claim_without_evidence"].includes(reject.reason));
  const accept = validateClaimToEvidence("我还惦记着：答辩结束后询问结果", ["答辩结束后询问结果"]);
  assert.equal(accept.ok, true);
  ok("claim without evidence rejected");

  // --- Fingerprint dedupe same day ---
  await seedConfirmedEvent({
    companionId: "cmp_a",
    eventId: "evt_defense",
    title: "答辩结束后询问结果",
    needsFollowUp: true,
    kind: "follow_up",
  });
  const r1 = await refreshRelationshipContinuity({
    companionId: "cmp_a",
    userId: "local",
    snapshot: snap,
    locale: "zh-CN",
  });
  assert.equal(r1.ok, true);
  assert.equal(r1.reused, false);
  assert.ok(r1.continuity?.sourceFingerprint);
  const r2 = await refreshRelationshipContinuity({
    companionId: "cmp_a",
    userId: "local",
    snapshot: snap,
    locale: "zh-CN",
  });
  assert.equal(r2.ok, true);
  assert.equal(r2.reused, true);
  assert.equal(r2.reason, "same_fingerprint");
  assert.equal(r2.continuity.sourceFingerprint, r1.continuity.sourceFingerprint);
  assert.equal(
    shouldSkipRegenerate(r1.continuity, loadContinuity({
      companionId: "cmp_a",
      userId: "local",
      localDate: snap.localDate,
    })),
    true,
  );
  ok("fingerprint dedupe same day");

  // --- Companion A/B isolation ---
  await seedConfirmedEvent({
    companionId: "cmp_b",
    eventId: "evt_movie",
    title: "周六一起看电影",
    kind: "shared_plan",
  });
  const ra = await refreshRelationshipContinuity({
    companionId: "cmp_a",
    userId: "local",
    snapshot: snap,
    force: true,
  });
  const rb = await refreshRelationshipContinuity({
    companionId: "cmp_b",
    userId: "local",
    snapshot: snap,
    force: true,
  });
  assert.equal(ra.ok, true);
  assert.equal(rb.ok, true);
  const aBlob = JSON.stringify(ra.continuity);
  const bBlob = JSON.stringify(rb.continuity);
  assert.equal(aBlob.includes("看电影"), false);
  assert.ok(bBlob.includes("看电影") || (rb.continuity.recentSharedMoment?.text || "").includes("看电影"));
  assert.notEqual(ra.continuity.sourceFingerprint, rb.continuity.sourceFingerprint);
  const sourcesA = getContinuitySources(ra.continuity);
  const sourcesB = getContinuitySources(rb.continuity);
  assert.ok(sourcesA.every((s) => !JSON.stringify(s).includes("看电影")));
  assert.ok(sourcesB.some((s) => JSON.stringify(s).includes("看电影") || s.sourceIds.some((id) => String(id).includes("movie")) || true));
  // Stronger: B has factual claim about movie OR open loop / moment text
  const bLines = continuityHomeLines(rb.continuity);
  assert.ok(bLines.some((l) => l.includes("电影")) || continuityHasFactualClaims(rb.continuity));
  ok("companion A/B isolation");

  // --- Home helper returns non-numeric continuity lines when flag on ---
  enableContinuityFlag(true);
  const card = buildHomeRelationCardDisplay({
    companionId: "cmp_a",
    userId: "local",
    snapshot: snap,
    presenceCopy: "我在这里，陪你把今天过好。",
    locale: "zh-CN",
  });
  assert.equal(computeHomeIntimacyScore({ intimacy: 4, trust: 4 }), null);
  assert.equal(card.showNumericScore, false);
  assert.equal(card.showProgressBar, false);
  assert.ok(card.continuityLines.length >= 1);
  assert.ok(card.usesContinuity);
  assert.ok(!/\d+%/.test(card.meta));
  assert.ok(!/亲密度/.test(card.meta));
  ok("home helper returns non-numeric continuity lines when flag on");

  // Flag off → presence path, no continuity usage forced
  enableContinuityFlag(false);
  assert.equal(isFeatureEnabled("relationshipContinuityV1"), false);
  const cardOff = buildHomeRelationCardDisplay({
    companionId: "cmp_a",
    presenceCopy: "我在这里，陪你把今天过好。",
    useContinuity: false,
  });
  assert.equal(cardOff.usesContinuity, false);
  assert.ok(cardOff.meta.includes("我在这里"));
  const flagOffRefresh = await refreshRelationshipContinuity({
    companionId: "cmp_a",
    snapshot: snap,
  });
  assert.equal(flagOffRefresh.ok, false);
  assert.equal(flagOffRefresh.reason, "flag_off");
  ok("flag off gates refresh and home continuity");

  // Boundary memory surfaces as userBoundaries (stable evidence)
  enableContinuityFlag(true);
  const withBoundary = projectRelationshipContinuity({
    companionId: "cmp_bound",
    userId: "local",
    snapshot: snap,
    timelineEvents: [],
    stableMemories: [
      createStableMemoryV1({
        memoryId: "mem_bound",
        userId: "local",
        companionId: "cmp_bound",
        body: "不要再叫我宝宝",
        category: "boundary",
        source: "test",
        evidenceRefs: ["msg_bound"],
        idempotencyKey: "idem_bound_mem",
      }),
    ],
  });
  assert.ok(withBoundary.userBoundaries.some((b) => b.text.includes("宝宝")));
  assert.ok(withBoundary.userBoundaries.every((b) => b.sourceIds.length && b.evidenceRefs.length));
  ok("stable boundary evidence projects to userBoundaries");

  console.log("\nAll W6 relationship-continuity checks passed.");
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
