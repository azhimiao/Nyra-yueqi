/**
 * W5 — MemPalace projection: source contract, forget cascade, rebuild, isolation.
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCAL_KEYS } from "../src/constants.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/qa/companion-intelligence");
mkdirSync(outDir, { recursive: true });

const memory = new Map();
const memStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};
globalThis.localStorage = memStorage;
globalThis.window = { localStorage: memStorage, dispatchEvent() {} };

let resetCutoverProfileCache = () => {};
function setFlag(on) {
  memory.set(LOCAL_KEYS.cutoverProfileKey, JSON.stringify(on ? "internal_v1" : "legacy"));
  memory.set(LOCAL_KEYS.featuresKey, JSON.stringify({ palaceProjectionV1: on }));
  resetCutoverProfileCache();
}

function ok(name) {
  console.log(`PASS ${name}`);
}

const {
  createMemoryPalaceIndexStore,
  __setDefaultPalaceIndexStoreForTests,
  __clearDefaultPalaceIndexStoreForTests,
  projectStableMemory,
  projectAndUpsert,
  hasValidSourceRefs,
  rebuildPalaceIndex,
  preferSourcedPalaceHits,
  sweepStalePalaceEntries,
} = await import("../src/memory/projection/index.js");

const {
  __setCandidateLedgerStorageForTests,
  clearCandidateLedgerForTests,
  submitCandidate,
  promoteCandidateToStable,
  forgetUnderstanding,
} = await import("../src/memory/candidate-ledger.js");

const {
  consolidateSessionMemory,
  __setConsolidationBagForTests,
  __clearConsolidationForTests,
} = await import("../src/companion/memory-consolidator.js");

const { __setContextStorageForTests } = await import("../src/context/store.js");
const { __resetCutoverProfileCacheForTests } = await import("../src/features/cutover-profile.js");

__setCandidateLedgerStorageForTests(memStorage);
__setContextStorageForTests(memStorage);
resetCutoverProfileCache = __resetCutoverProfileCacheForTests;

const cases = [];
function record(id, pass, detail = "") {
  cases.push({ id, pass: Boolean(pass), detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}${detail ? ` — ${detail}` : ""}`);
}

// --- 1. Project record has source fields ---
{
  memory.clear();
  clearCandidateLedgerForTests();
  __clearDefaultPalaceIndexStoreForTests();
  const store = createMemoryPalaceIndexStore();
  __setDefaultPalaceIndexStoreForTests(store);

  const created = projectStableMemory({
    memoryId: "mem_w5_1",
    companionId: "comp_a",
    body: "用户不喜欢空洞鼓励",
  });
  assert.equal(created.ok, true);
  const row = created.value;
  assert.equal(row.sourceType, "stable_memory");
  assert.equal(row.sourceId, "mem_w5_1");
  assert.equal(row.companionId, "comp_a");
  assert.ok(row.contentHash);
  assert.ok(row.indexedAt);
  assert.equal(hasValidSourceRefs(row), true);
  store.upsert(row);
  record("project_has_source_fields", true, `hash=${row.contentHash}`);
}

// --- 2. Flag off: forget does not cascade to palace ---
{
  memory.clear();
  clearCandidateLedgerForTests();
  setFlag(false);
  const store = createMemoryPalaceIndexStore();
  __setDefaultPalaceIndexStoreForTests(store);

  const submitted = submitCandidate({
    companionId: "comp_a",
    claim: "喜欢抹茶",
    userStated: true,
    confidence: 0.95,
    evidenceRefs: ["u1"],
    source: "verify.w5",
  });
  assert.equal(submitted.ok, true, `submit failed: ${submitted.reason}`);
  const promoted = promoteCandidateToStable(submitted.value.candidateId);
  assert.equal(promoted.ok, true, `promote failed: ${promoted.reason}`);
  const memId = promoted.value.memoryId;
  await projectAndUpsert({
    kind: "stable_memory",
    memoryId: memId,
    companionId: "comp_a",
    body: promoted.value.body,
  }, { store });
  assert.equal(store.list({ sourceId: memId }).length, 1);

  const forgotten = forgetUnderstanding({
    companionId: "comp_a",
    claimIncludes: "抹茶",
    palaceStore: store,
  });
  assert.equal(forgotten.ok, true);
  assert.equal(forgotten.palaceSweep, null);
  assert.equal(store.list({ sourceId: memId }).length, 1, "flag off must leave palace index");
  record("flag_off_no_palace_cascade", true);
}

// --- 3. Flag on: forget + sweep invalidates ---
{
  memory.clear();
  clearCandidateLedgerForTests();
  setFlag(true);
  const store = createMemoryPalaceIndexStore();
  __setDefaultPalaceIndexStoreForTests(store);

  const submitted = submitCandidate({
    companionId: "comp_a",
    claim: "讨厌空洞鼓励",
    userStated: true,
    confidence: 0.95,
    evidenceRefs: ["u2"],
    source: "verify.w5",
  });
  assert.equal(submitted.ok, true, `submit failed: ${submitted.reason}`);
  const promoted = promoteCandidateToStable(submitted.value.candidateId);
  assert.equal(promoted.ok, true, `promote failed: ${promoted.reason}`);
  const memId = promoted.value.memoryId;
  await projectAndUpsert({
    kind: "stable_memory",
    memoryId: memId,
    companionId: "comp_a",
    body: promoted.value.body,
  }, { store });

  const forgotten = forgetUnderstanding({
    companionId: "comp_a",
    claimIncludes: "空洞鼓励",
    palaceStore: store,
  });
  assert.equal(forgotten.ok, true);
  assert.ok(forgotten.palaceSweep?.ok);
  assert.ok(forgotten.palaceSweep.swept >= 1);
  assert.equal(store.list({ sourceId: memId }).length, 0, "active list excludes invalidated");
  assert.equal(
    store.list({ sourceId: memId, includeInvalidated: true }).length,
    1,
    "row still present as invalidated",
  );
  assert.ok(store.list({ sourceId: memId, includeInvalidated: true })[0].invalidatedAt);
  record("forget_sweep_invalidates", true, `swept=${forgotten.palaceSweep.swept}`);
}

// --- 4. Rebuild callable ---
{
  const store = createMemoryPalaceIndexStore();
  const result = rebuildPalaceIndex({
    store,
    clearFirst: true,
    companionId: "comp_rebuild",
    nowIso: "2026-08-08T00:00:00.000Z",
    stableMemory: [
      { memoryId: "m1", companionId: "comp_rebuild", body: "喜欢雨天" },
      { memoryId: "m2", companionId: "comp_other", body: "should skip" },
      { memoryId: "m3", companionId: "comp_rebuild", body: "gone", deleted: true },
    ],
    timelineEvents: [
      { eventId: "e1", companionId: "comp_rebuild", title: "答辩", summary: "明天下午" },
    ],
    artifacts: [
      { artifactId: "a1", companionId: "comp_rebuild", body: "日记片段", sourceType: "diary" },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.projected, 3);
  assert.equal(store.list({ companionId: "comp_rebuild" }).length, 3);
  record("rebuild_callable", true, `projected=${result.projected}`);
}

// --- 5. Multi-companion sourceId isolation ---
{
  const store = createMemoryPalaceIndexStore();
  await projectAndUpsert({
    kind: "stable_memory",
    memoryId: "shared_key",
    companionId: "comp_x",
    body: "X only",
  }, { store });
  await projectAndUpsert({
    kind: "stable_memory",
    memoryId: "shared_key",
    companionId: "comp_y",
    body: "Y only",
  }, { store });

  const sweepX = sweepStalePalaceEntries({
    store,
    companionId: "comp_x",
    sourceIds: ["shared_key"],
  });
  assert.equal(sweepX.swept, 1);
  assert.equal(store.list({ companionId: "comp_x" }).length, 0);
  assert.equal(store.list({ companionId: "comp_y" }).length, 1);
  assert.equal(store.list({ companionId: "comp_y" })[0].searchableText, "Y only");
  record("multi_companion_sourceId_isolation", true);
}

// --- 6. prefer sourced hits ---
{
  const mixed = preferSourcedPalaceHits([
    { text: "orphan", id: "o1" },
    { text: "sourced", sourceType: "stable_memory", sourceId: "m9" },
  ]);
  assert.equal(mixed.length, 1);
  assert.equal(mixed[0].sourceId, "m9");
  const legacyOnly = preferSourcedPalaceHits([{ text: "legacy" }]);
  assert.equal(legacyOnly.length, 1, "soft prefer keeps legacy when no sourced");
  const strict = preferSourcedPalaceHits([{ text: "legacy" }], { strict: true });
  assert.equal(strict.length, 0);
  record("prefer_sourced_hits", true);
}

// --- 7. CP-9 consolidator softens when flag on ---
{
  memory.clear();
  __clearConsolidationForTests();
  __setConsolidationBagForTests({ sessions: {} });
  __setContextStorageForTests(memStorage);
  setFlag(true);

  const result = consolidateSessionMemory({
    characterId: "comp_cp9",
    sessionId: "sess_1",
    messages: [
      { role: "user", content: "记住我喜欢猫" },
      { role: "assistant", content: "好的，我记住了。" },
    ],
    nowIso: "2026-08-08T01:00:00.000Z",
  });
  assert.equal(result.ok, true);
  assert.equal(result.authority, "projection");
  assert.equal(result.skippedFactIngest, true);
  assert.equal(result.ingested.length, 0);
  assert.equal(result.facts.length, 0);
  record("cp9_softened_under_flag", true, result.authority);
}

// --- 8. Flag off consolidator still ingests (behavior preserved) ---
{
  memory.clear();
  __clearConsolidationForTests();
  __setConsolidationBagForTests({ sessions: {} });
  __setContextStorageForTests(memStorage);
  setFlag(false);

  const result = consolidateSessionMemory({
    characterId: "comp_cp9b",
    sessionId: "sess_2",
    messages: [
      { role: "user", content: "记住我喜欢狗" },
      { role: "assistant", content: "好。" },
    ],
    nowIso: "2026-08-08T01:00:00.000Z",
    ingest: false, // avoid depending on hot-path extract counts; assert authority path
  });
  assert.equal(result.ok, true);
  assert.equal(result.authority, "consolidator");
  assert.equal(result.skippedFactIngest, false);
  record("cp9_unchanged_flag_off", true);
}

const failed = cases.filter((c) => !c.pass);
const summary = {
  wave: "W5",
  name: "palace-projection",
  passed: failed.length === 0,
  total: cases.length,
  failed: failed.map((c) => c.id),
  cases,
  at: new Date().toISOString(),
};

writeFileSync(join(outDir, "W5_PALACE_PROJECTION.verify.json"), JSON.stringify(summary, null, 2));

if (failed.length) {
  console.error(`FAIL ${failed.length}/${cases.length}`);
  process.exit(1);
}
console.log(`OK verify:palace-projection ${cases.length}/${cases.length}`);
ok("verify:palace-projection");
