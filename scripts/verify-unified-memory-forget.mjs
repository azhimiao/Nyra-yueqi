/**
 * Unified memory M6 — Candidate → Stable authority, Graph projection, forget/suppress.
 *
 * Run: npm run verify:unified-memory-forget
 * Alias: npm run verify:unified-memory-m6
 */

import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCAL_KEYS } from "../src/constants.js";
import {
  CUTOVER_NEW_PATH_FLAGS,
  getCutoverProfile,
  setCutoverProfile,
  __resetCutoverProfileCacheForTests,
} from "../src/features/cutover-profile.js";
import { getFeatureFlags } from "../src/features/flags.js";

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
}

function setInternalFlags(partial = {}) {
  setCutoverProfile("internal_v1");
  // Isolate each feature under test without enabling unrelated internal paths.
  setFlags({ ...Object.fromEntries(CUTOVER_NEW_PATH_FLAGS.map((key) => [key, false])), ...partial });
  assert.equal(getCutoverProfile(), "internal_v1");
}

function resetAll() {
  memory.clear();
  __resetCutoverProfileCacheForTests();
  setFlags({});
}

const cases = [];
function record(id, pass, detail = "") {
  cases.push({ id, pass: Boolean(pass), detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}${detail ? ` — ${detail}` : ""}`);
}

const {
  __setCandidateLedgerStorageForTests,
  clearCandidateLedgerForTests,
  submitCandidate,
  promoteCandidateToStable,
  recallStableMemory,
  forgetUnderstanding,
  PROMOTE_MIN_CONFIDENCE,
  PROMOTE_MIN_EVIDENCE,
} = await import("../src/memory/candidate-ledger.js");

const {
  __setSuppressionLedgerStorageForTests,
  clearSuppressionLedgerForTests,
  isSuppressed,
  suppressionFingerprint,
} = await import("../src/memory/suppression-ledger.js");

const { __setContextStorageForTests, listItems, clearAllContextItems } = await import(
  "../src/context/store.js"
);

const { ingestCandidate } = await import("../src/context/pipeline.js");
const { retrieveContext } = await import("../src/context/retrieve.js");

const {
  consolidateSessionMemory,
  __setConsolidationBagForTests,
  __clearConsolidationForTests,
} = await import("../src/companion/memory-consolidator.js");

const {
  __clearProjectionOutboxForTests,
  listProjectionJobs,
} = await import("../src/projections/outbox.js");

const { projectStableUnderstanding } = await import("../src/memory/stable-projection.js");

__setCandidateLedgerStorageForTests(memStorage);
__setSuppressionLedgerStorageForTests(memStorage);
__setContextStorageForTests(memStorage);

// --- 1. shared_fiction cannot auto-promote to reality stable ---
{
  resetAll();
  clearCandidateLedgerForTests();
  clearSuppressionLedgerForTests();
  setFlags({});

  const fiction = submitCandidate({
    userId: "u1",
    companionId: "c1",
    claim: "was a pirate captain in the shared scene",
    confidence: 0.99,
    userStated: true,
    evidenceRefs: ["a", "b"],
    realityNamespace: "shared_fiction",
    source: "scenario",
    idempotencyKey: "m6-fiction-1",
  });
  assert.equal(fiction.ok, true, fiction.reason);
  const promo = promoteCandidateToStable(fiction.value.candidateId);
  const pass = !promo.ok && promo.reason === "shared_fiction_blocked";
  record("shared_fiction_cannot_auto_promote", pass, promo.reason || "ok");
}

// --- 2. single low-confidence model guess does not promote ---
{
  resetAll();
  clearCandidateLedgerForTests();
  setFlags({});

  const low = submitCandidate({
    userId: "u1",
    companionId: "c1",
    claim: "maybe likes olives",
    confidence: 0.4,
    userStated: false,
    evidenceRefs: ["obs-only"],
    source: "model.guess",
    idempotencyKey: "m6-low-1",
  });
  assert.equal(low.ok, true, low.reason);
  const promo = promoteCandidateToStable(low.value.candidateId);
  const pass =
    !promo.ok
    && (promo.reason === "confidence_too_low" || promo.reason === "single_observation_blocked");
  record(
    "low_confidence_single_guess_blocked",
    pass,
    `${promo.reason}; minConf=${PROMOTE_MIN_CONFIDENCE}; minEv=${PROMOTE_MIN_EVIDENCE}`,
  );
}

// --- 3. forget → suppressed; recall filter drops it ---
{
  resetAll();
  clearCandidateLedgerForTests();
  clearSuppressionLedgerForTests();
  clearAllContextItems();
  setInternalFlags({ unifiedMemoryForgetV1: true });

  const stated = submitCandidate({
    userId: "u1",
    companionId: "c1",
    claim: "prefers quiet mornings",
    userStated: true,
    confidence: 0.95,
    evidenceRefs: ["user-msg-1"],
    source: "user_stated",
    idempotencyKey: "m6-quiet-1",
  });
  assert.equal(stated.ok, true, stated.reason);
  const promo = promoteCandidateToStable(stated.value.candidateId);
  assert.equal(promo.ok, true, promo.reason);
  const memId = promo.value.memoryId;

  const before = recallStableMemory({ companionId: "c1" });
  assert.ok(before.some((m) => m.memoryId === memId));

  const forgotten = forgetUnderstanding({
    companionId: "c1",
    claimIncludes: "quiet mornings",
  });
  assert.equal(forgotten.ok, true);
  assert.ok(forgotten.suppression?.ok, "suppression ledger write");

  const after = recallStableMemory({ companionId: "c1" });
  const dropped = !after.some((m) => m.memoryId === memId || /quiet mornings/i.test(m.body || ""));
  const suppressed =
    isSuppressed(memId)
    && isSuppressed(`stable:${memId}`)
    && isSuppressed(suppressionFingerprint("prefers quiet mornings"));

  record(
    "forget_suppresses_and_recall_drops",
    dropped && suppressed,
    `dropped=${dropped} suppressed=${suppressed} touched=${forgotten.touched}`,
  );
}

// --- 4. consolidator cannot resurrect forgotten id when flag on ---
{
  resetAll();
  clearCandidateLedgerForTests();
  clearSuppressionLedgerForTests();
  clearAllContextItems();
  __clearConsolidationForTests();
  __setConsolidationBagForTests({ sessions: {} });
  setInternalFlags({
    unifiedMemoryForgetV1: true,
    // keep projection-only OFF so consolidator attempts fact ingest and hits suppression
    contextGraphProjectionOnlyV1: false,
    palaceProjectionV1: false,
  });

  const claim = "讨厌空洞鼓励";
  const stated = submitCandidate({
    userId: "u1",
    companionId: "c1",
    claim,
    userStated: true,
    confidence: 0.95,
    evidenceRefs: ["u-enc"],
    source: "user_stated",
    idempotencyKey: "m6-enc-1",
  });
  const promo = promoteCandidateToStable(stated.value.candidateId);
  assert.equal(promo.ok, true, promo.reason);
  forgetUnderstanding({ companionId: "c1", claimIncludes: "空洞鼓励" });
  assert.ok(isSuppressed(suppressionFingerprint(claim)));

  // Direct graph re-ingest of forgotten claim must fail under forget flag.
  const direct = ingestCandidate({
    content: claim,
    kind: "semantic",
    characterId: "c1",
    source: "companion.consolidated",
    sourceRef: "session:resurrect:direct",
    memoryStatus: "accepted",
    confidence: 0.7,
  });
  assert.equal(direct.ok, false);
  assert.equal(direct.reason, "suppressed");

  const consolidated = consolidateSessionMemory({
    characterId: "c1",
    sessionId: "sess-m6-resurrect",
    messages: [
      { role: "user", content: "我讨厌空洞鼓励，别再这样说" },
      { role: "assistant", content: "好的，我记住了。" },
    ],
    ingest: true,
  });
  assert.equal(consolidated.ok, true);

  const resurrectedViaIngest = (consolidated.ingested || []).some(
    (r) => r.ok && r.stage !== "suppressed" && /空洞鼓励/.test(String(r.item?.content || r.content || "")),
  );
  const graphHits = listItems({ characterId: "c1", limit: 200 }).filter((item) =>
    /空洞鼓励/.test(String(item.content || "")),
  );
  const retrieve = retrieveContext({ characterId: "c1", limit: 20 });
  const retrieveHits = (retrieve.items || []).filter((row) =>
    /空洞鼓励/.test(String(row.item?.content || "")),
  );

  record(
    "consolidator_cannot_resurrect_forgotten",
    direct.reason === "suppressed"
      && !resurrectedViaIngest
      && graphHits.length === 0
      && retrieveHits.length === 0,
    `direct=${direct.reason} ingestOk=${resurrectedViaIngest} graph=${graphHits.length} retrieve=${retrieveHits.length}`,
  );
}

// --- 5. contextGraphProjectionOnlyV1: ingestCandidate tags projection (non-authority) ---
{
  resetAll();
  clearAllContextItems();
  setInternalFlags({ contextGraphProjectionOnlyV1: true });

  const result = ingestCandidate({
    content: "chat inferred likes tea",
    kind: "semantic",
    characterId: "c1",
    source: "chat.inferred",
    sourceRef: "turn-tea-1",
    memoryStatus: "accepted",
    confidence: 0.6,
  });
  assert.equal(result.ok, true, result.reason);
  const item = result.item;
  const pass =
    item?.authority === "projection"
    && item?.meta?.authority === "projection"
    && Array.isArray(item?.tags)
    && item.tags.includes("projection");
  record("graph_ingest_tagged_projection_when_flag_on", pass, `authority=${item?.authority}`);
}

// --- 6. promote under projection-only → graph mirror sourceRef stable + outbox/sync ---
{
  resetAll();
  clearCandidateLedgerForTests();
  clearAllContextItems();
  __clearProjectionOutboxForTests();
  setInternalFlags({
    contextGraphProjectionOnlyV1: true,
    memoryProjectionOutboxV1: false,
  });

  const stated = submitCandidate({
    userId: "u1",
    companionId: "c1",
    claim: "likes rainy afternoons",
    userStated: true,
    confidence: 0.95,
    evidenceRefs: ["u-rain"],
    source: "user_stated",
    idempotencyKey: "m6-rain-1",
  });
  const promo = promoteCandidateToStable(stated.value.candidateId);
  assert.equal(promo.ok, true, promo.reason);
  assert.ok(promo.projection && promo.projection.ok !== false, "projection attached");
  assert.equal(promo.projection.mode, "sync");

  const mirrors = listItems({ characterId: "c1", limit: 50 }).filter(
    (item) => item.source === "candidate_promotion" || item.meta?.sourceStableId === promo.value.memoryId,
  );
  const mirrorOk =
    mirrors.length >= 1
    && mirrors.every((m) => m.authority === "projection")
    && mirrors.some((m) => String(m.sourceRef).includes(promo.value.memoryId));

  record(
    "promote_projects_graph_mirror_with_stable_ref",
    mirrorOk,
    `mirrors=${mirrors.length} mode=${promo.projection?.mode}`,
  );
}

// --- 7. outbox path when memoryProjectionOutboxV1 on ---
{
  resetAll();
  clearCandidateLedgerForTests();
  __clearProjectionOutboxForTests();
  setInternalFlags({
    contextGraphProjectionOnlyV1: true,
    memoryProjectionOutboxV1: true,
  });

  const stated = submitCandidate({
    userId: "u1",
    companionId: "c1",
    claim: "keeps a small desk plant",
    userStated: true,
    confidence: 0.95,
    evidenceRefs: ["u-plant"],
    source: "user_stated",
    idempotencyKey: "m6-plant-1",
  });
  const promo = promoteCandidateToStable(stated.value.candidateId);
  assert.equal(promo.ok, true, promo.reason);
  const jobs = listProjectionJobs();
  const kinds = new Set(jobs.map((j) => j.projectionKind));
  const pass =
    promo.projection?.mode === "outbox"
    && kinds.has("stable_graph")
    && kinds.has("stable_palace");
  record(
    "promote_enqueues_graph_palace_outbox",
    pass,
    `mode=${promo.projection?.mode} jobs=${jobs.length}`,
  );
}

// --- 8. default legacy: explicit forgetting works without enabling experimental paths ---
{
  resetAll();
  clearCandidateLedgerForTests();
  clearSuppressionLedgerForTests();
  __clearProjectionOutboxForTests();
  assert.equal(getCutoverProfile(), "legacy");
  const defaults = getFeatureFlags();
  assert.ok(CUTOVER_NEW_PATH_FLAGS.every((key) => defaults[key] === false));
  setFlags(Object.fromEntries(CUTOVER_NEW_PATH_FLAGS.map((key) => [key, true])));
  const legacy = getFeatureFlags();
  assert.ok(CUTOVER_NEW_PATH_FLAGS.every((key) => legacy[key] === false), "legacy profile must override raw flags");

  const stated = submitCandidate({
    userId: "u1",
    companionId: "c1",
    claim: "drinks black coffee",
    userStated: true,
    confidence: 0.95,
    evidenceRefs: ["u-coffee"],
    source: "user_stated",
    idempotencyKey: "m6-coffee-1",
  });
  const promo = promoteCandidateToStable(stated.value.candidateId);
  assert.equal(promo.ok, true, promo.reason);
  assert.equal(promo.projection, null);

  const forgotten = forgetUnderstanding({
    companionId: "c1",
    claimIncludes: "black coffee",
  });
  assert.equal(forgotten.ok, true);
  assert.equal(forgotten.suppression?.ok, true);
  assert.equal(isSuppressed(promo.value.memoryId), true);

  // Explicit project helper still skips without force when flag off
  const skipped = projectStableUnderstanding(promo.value);
  record(
    "default_legacy_forget_suppresses_without_auto_project",
    forgotten.suppression?.ok === true && promo.projection == null && skipped.skipped === true,
    `suppression=${forgotten.suppression} projection=${promo.projection} skip=${skipped.skipped}`,
  );
}

// --- 9. consolidator projection-only under contextGraphProjectionOnlyV1 ---
{
  resetAll();
  clearAllContextItems();
  __clearConsolidationForTests();
  __setConsolidationBagForTests({ sessions: {} });
  setInternalFlags({
    contextGraphProjectionOnlyV1: true,
    palaceProjectionV1: false,
    unifiedMemoryForgetV1: false,
  });

  const consolidated = consolidateSessionMemory({
    characterId: "c1",
    sessionId: "sess-m6-proj",
    messages: [
      { role: "user", content: "我喜欢抹茶拿铁" },
      { role: "assistant", content: "记下了。" },
    ],
    ingest: true,
  });
  assert.equal(consolidated.ok, true);
  assert.equal(consolidated.skippedFactIngest, true);
  assert.equal(consolidated.authority, "projection");
  record(
    "consolidator_projection_only_under_graph_flag",
    consolidated.skippedFactIngest === true
      && consolidated.authority === "projection"
      && (consolidated.facts || []).length === 0,
    `authority=${consolidated.authority}`,
  );
}

const passed = cases.filter((c) => c.pass).length;
const failed = cases.length - passed;
const report = {
  wave: "M6",
  script: "scripts/verify-unified-memory-forget.mjs",
  passed,
  failed,
  total: cases.length,
  cases,
  at: new Date().toISOString(),
};

writeFileSync(join(evidenceDir, "M6_VERIFY.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("");
if (failed) {
  console.error(`FAIL  ${failed}/${cases.length} unified-memory forget / M6`);
  process.exitCode = 1;
} else {
  console.log(`OK  ${passed}/${cases.length} unified-memory forget / M6`);
}
