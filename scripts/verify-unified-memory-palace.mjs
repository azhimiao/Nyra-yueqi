/**
 * Unified memory M7 — MemPalace projection-only (index rebuildable; no direct authority).
 *
 * Run: npm run verify:unified-memory-palace
 * Alias: npm run verify:unified-memory-m7
 */

import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCAL_KEYS } from "../src/constants.js";

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
  memory.set(
    LOCAL_KEYS.cutoverProfileKey || "yueqi.cutover.profile.v1",
    JSON.stringify("internal_v1"),
  );
  memory.set(LOCAL_KEYS.featuresKey, JSON.stringify(partial));
}

function resetAll() {
  memory.clear();
  setFlags({});
}

const cases = [];
function record(id, pass, detail = "") {
  cases.push({ id, pass: Boolean(pass), detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}${detail ? ` — ${detail}` : ""}`);
}

const {
  filterPalaceHitsBySourceRef,
  rowHasUsableSourceRef,
  assertPalaceProjectionWriteAllowed,
  fileDrawer,
  rebuildPalaceFromSources,
  projectToPalaceIndex,
} = await import("../src/memory/palace/index.js");

const {
  createMemoryPalaceIndexStore,
  __setDefaultPalaceIndexStoreForTests,
  __clearDefaultPalaceIndexStoreForTests,
} = await import("../src/memory/projection/project-to-palace.js");

const { DEFAULT_FEATURES } = await import("../src/constants.js");

// --- 0. Flag default false ---
{
  resetAll();
  assert.equal(DEFAULT_FEATURES.palaceProjectionOnlyV1, false);
  record("flag_default_false", true);
}

// --- 1. Orphan without sourceRef filtered when flag on ---
{
  resetAll();
  setFlags({ palaceProjectionOnlyV1: true });
  const hits = [
    { id: "orphan-1", rawText: "legacy orphan drawer", source: "chat.memory" },
    {
      id: "sourced-1",
      rawText: "diary body about sleep",
      source: "diary.memory",
      sourceType: "diary",
      sourceId: "d1",
      sourceRef: { sourceType: "diary", sourceId: "d1", companionId: "c1" },
      companionId: "c1",
    },
    {
      id: "flat-sourced",
      rawText: "stable claim",
      sourceType: "stable_memory",
      sourceId: "m1",
      companionId: "c1",
    },
  ];
  const filtered = filterPalaceHitsBySourceRef(hits, { flagOn: true });
  assert.equal(filtered.length, 2, "orphans must be dropped");
  assert.ok(!filtered.some((h) => h.id === "orphan-1"));
  assert.equal(rowHasUsableSourceRef(hits[0]), false);
  assert.equal(rowHasUsableSourceRef(hits[1]), true);
  record("orphan_without_source_ref_filtered_when_flag_on", true, `kept=${filtered.length}`);
}

// --- 2. Flag off: orphans not filtered ---
{
  resetAll();
  setFlags({ palaceProjectionOnlyV1: false });
  const hits = [
    { id: "orphan-1", rawText: "legacy", source: "chat.memory" },
    {
      id: "sourced-1",
      sourceType: "diary",
      sourceId: "d1",
      sourceRef: { sourceId: "d1" },
    },
  ];
  const filtered = filterPalaceHitsBySourceRef(hits);
  assert.equal(filtered.length, 2, "flag off must keep orphans");
  record("flag_off_orphans_not_filtered", true);
}

// --- 3. Rebuild restores searchable entries from fake sources ---
{
  resetAll();
  __clearDefaultPalaceIndexStoreForTests();
  const store = createMemoryPalaceIndexStore();
  __setDefaultPalaceIndexStoreForTests(store);

  // Seed a stale orphan that clearFirst should remove for companion
  store.upsert({
    indexId: "px:orphan:c1:x",
    sourceType: "artifact",
    sourceId: "x",
    companionId: "c1",
    contentHash: "x",
    indexedAt: "2020-01-01T00:00:00.000Z",
    searchableText: "stale orphan",
  });

  const result = await rebuildPalaceFromSources({
    store,
    companionId: "c1",
    clearFirst: true,
    nowIso: "2026-08-08T00:00:00.000Z",
    diaryEntries: [
      {
        id: "diary-1",
        companionId: "c1",
        title: "睡眠",
        body: "昨晚睡得很好，梦见下雨",
        contentHash: "h-diary-1",
        sourceRef: { sourceType: "diary", sourceId: "diary-1", companionId: "c1" },
      },
    ],
    stableMemory: [
      {
        memoryId: "stable-1",
        companionId: "c1",
        body: "用户喜欢安静陪伴",
      },
      {
        memoryId: "stable-other",
        companionId: "c2",
        body: "should skip other companion",
      },
    ],
    timelineSummaries: [
      {
        eventId: "ev-1",
        companionId: "c1",
        title: "一起听歌",
        summary: "雨天听那首歌",
      },
    ],
    bookChunks: [
      {
        sourceId: "book-a:c0",
        companionId: "c1",
        rawText: "第一章：车站的雨",
        title: "夜雨列车",
        bookId: "book-a",
        sourceRef: { sourceType: "book_chunk", sourceId: "book-a:c0", companionId: "c1" },
      },
    ],
  });

  assert.equal(result.ok, true, `rebuild errors: ${JSON.stringify(result.errors)}`);
  assert.ok(result.projected >= 4, `expected >=4 projected, got ${result.projected}`);
  const live = store.list({ companionId: "c1" });
  assert.ok(live.length >= 4, `live rows=${live.length}`);
  assert.ok(
    live.every((row) => row.sourceId && (row.sourceType || row.sourceRef)),
    "rebuilt rows must be source-traceable",
  );
  const texts = live.map((r) => r.searchableText || "").join("\n");
  assert.ok(texts.includes("睡得很好") || texts.includes("安静陪伴"));
  assert.ok(texts.includes("听歌") || texts.includes("车站的雨"));
  // Orphan cleared
  assert.equal(store.get("px:orphan:c1:x"), null);

  // Searchable via filter (strict)
  setFlags({ palaceProjectionOnlyV1: true });
  const searchable = filterPalaceHitsBySourceRef(live, { flagOn: true, companionId: "c1" });
  assert.ok(searchable.length >= 4, `searchable after rebuild=${searchable.length}`);
  record(
    "rebuild_restores_searchable_from_fake_sources",
    true,
    `projected=${result.projected} searchable=${searchable.length}`,
  );
}

// --- 4. Direct fileDrawer without projection meta blocked when flag on ---
{
  resetAll();
  setFlags({ palaceProjectionOnlyV1: true });
  const gate = assertPalaceProjectionWriteAllowed({
    rawText: "direct business write",
    source: "diary.memory",
  });
  assert.equal(gate.ok, false);
  assert.equal(gate.reason, "palace_projection_only_direct_write_blocked");

  let threw = false;
  try {
    await fileDrawer({
      rawText: "direct business write",
      source: "diary.memory",
      companionId: "c1",
    });
  } catch (error) {
    threw = String(error?.message || error).includes("palace_projection_only");
  }
  assert.equal(threw, true, "fileDrawer must throw when blocked");

  // noop path
  const noop = await fileDrawer(
    { rawText: "also blocked", source: "book.chunk" },
    { onBlocked: "noop" },
  );
  assert.equal(noop, null);

  // allowed with allowProjectionWrite / sourceRef / projectionKind
  assert.equal(
    assertPalaceProjectionWriteAllowed(
      { rawText: "x", allowProjectionWrite: true },
    ).ok,
    true,
  );
  assert.equal(
    assertPalaceProjectionWriteAllowed({
      rawText: "x",
      sourceRef: { sourceId: "d1", sourceType: "diary" },
    }).ok,
    true,
  );
  assert.equal(
    assertPalaceProjectionWriteAllowed({
      rawText: "x",
      projectionKind: "palace_text",
    }).ok,
    true,
  );
  record("direct_fileDrawer_blocked_when_flag_on", true);
}

// --- 5. Flag off: direct fileDrawer gate allows ---
{
  resetAll();
  setFlags({ palaceProjectionOnlyV1: false });
  const gate = assertPalaceProjectionWriteAllowed({
    rawText: "legacy write",
    source: "diary.memory",
  });
  assert.equal(gate.ok, true);
  record("flag_off_fileDrawer_gate_allows", true);
}

// --- 6. projectToPalaceIndex tags projection meta ---
{
  resetAll();
  __clearDefaultPalaceIndexStoreForTests();
  const store = createMemoryPalaceIndexStore();
  __setDefaultPalaceIndexStoreForTests(store);
  setFlags({ palaceProjectionOnlyV1: true });

  let filedParams = null;
  const result = await projectToPalaceIndex(
    {
      kind: "diary",
      diaryId: "d-proj",
      companionId: "c1",
      body: "投影写入日记正文",
      sourceRef: {
        sourceType: "diary",
        sourceId: "d-proj",
        companionId: "c1",
        contentHash: "h1",
      },
      projectionKind: "palace_text",
    },
    {
      store,
      fileDrawer: async (params) => {
        filedParams = params;
        return { id: "drawer-1", drawerId: "drawer-1" };
      },
    },
  );
  assert.equal(result.ok, true);
  assert.ok(result.value?.sourceId === "d-proj");
  assert.equal(filedParams?.allowProjectionWrite, true);
  assert.ok(filedParams?.sourceRef || filedParams?.projectionKind);
  // Gate would allow these params
  assert.equal(assertPalaceProjectionWriteAllowed(filedParams).ok, true);
  record("projectToPalaceIndex_passes_projection_meta", true);
}

// --- 7. Reading-style allowProjectionWrite present ---
{
  resetAll();
  setFlags({ palaceProjectionOnlyV1: true });
  const readingParams = {
    rawText: "chunk text",
    source: "book.chunk",
    sourceRef: { sourceType: "book_chunk", sourceId: "b:c0" },
    projectionKind: "palace_chunk",
    allowProjectionWrite: true,
  };
  assert.equal(assertPalaceProjectionWriteAllowed(readingParams).ok, true);
  record("reading_adapter_allow_flag_accepted", true);
}

__clearDefaultPalaceIndexStoreForTests();

const failed = cases.filter((c) => !c.pass);
const summary = {
  wave: "M7",
  name: "unified-memory-palace",
  total: cases.length,
  passed: cases.filter((c) => c.pass).length,
  failed: failed.length,
  cases,
  at: new Date().toISOString(),
};

writeFileSync(join(evidenceDir, "M7_VERIFY.json"), `${JSON.stringify(summary, null, 2)}\n`);

if (failed.length) {
  console.error(`\nFAIL ${failed.length}/${cases.length} unified-memory palace / M7`);
  for (const f of failed) console.error(`  - ${f.id}: ${f.detail}`);
  process.exit(1);
}

console.log(`\nOK ${cases.length}/${cases.length} unified-memory palace / M7`);
