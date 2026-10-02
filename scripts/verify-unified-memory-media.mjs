/**
 * Unified memory M3 — Listen + Reading adapters.
 *
 * Run: npm run verify:unified-memory-media
 * Alias: npm run verify:unified-memory-m3
 */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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
  memory.set(LOCAL_KEYS.featuresKey, JSON.stringify(partial));
}

const cases = [];
function record(id, pass, detail = "") {
  cases.push({ id, pass: Boolean(pass), detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}${detail ? ` — ${detail}` : ""}`);
}

const {
  recordListenProgress,
  endListenSession,
  submitListenPreference,
  ensureListenAdapterRegistered,
  __clearListenSessionsForTests,
  __resetListenAdapterRegistrationForTests,
} = await import("../src/memory/adapters/listen.js");

const {
  ingestBookChunksWithSourceRef,
  tombstoneBookChunks,
  submitReadingPreference,
  bookChunkSourceId,
  ensureReadingAdapterRegistered,
  __resetReadingAdapterRegistrationForTests,
} = await import("../src/memory/adapters/reading.js");

const { ingestBookChunks, deleteBookMemoryIndex } = await import("../src/library/books-import.js");

const {
  createMemoryPalaceIndexStore,
  __setDefaultPalaceIndexStoreForTests,
  __clearDefaultPalaceIndexStoreForTests,
} = await import("../src/memory/projection/project-to-palace.js");

const { __clearFeatureMemoryAdaptersForTests } = await import("../src/memory/adapters/registry.js");
const { __setCandidateLedgerStorageForTests } = await import("../src/memory/candidate-ledger.js");
const { CONTEXT_GRAPH_KEY } = await import("../src/context/schema.js");

function resetAll() {
  memory.clear();
  __clearListenSessionsForTests();
  __clearFeatureMemoryAdaptersForTests();
  __resetListenAdapterRegistrationForTests();
  __resetReadingAdapterRegistrationForTests();
  __clearDefaultPalaceIndexStoreForTests();
  __setCandidateLedgerStorageForTests(memStorage);
  const store = createMemoryPalaceIndexStore();
  __setDefaultPalaceIndexStoreForTests(store);
  ensureListenAdapterRegistered();
  ensureReadingAdapterRegistered();
  return store;
}

async function main() {
  // --- 1. 100 seek ticks → ≤ 2 Timeline events (start + end) via injectable append ---
  {
    resetAll();
    setFlags({ unifiedMemoryAdaptersV1: true });
    const timeline = [];
    const appendTimeline = (event) => {
      timeline.push(event);
      return { ok: true, value: event };
    };

    const trackId = "track-seek-100";
    const companionId = "companion-m3";

    // First tick opens session (start)
    recordListenProgress(
      {
        trackId,
        position: 0,
        duration: 200,
        companionId,
        title: "雨夜电台",
        kind: "start",
      },
      { appendTimeline, nowMs: 1_000 },
    );

    for (let i = 1; i <= 100; i += 1) {
      recordListenProgress(
        {
          trackId,
          position: i,
          duration: 200,
          companionId,
          title: "雨夜电台",
          kind: "progress",
        },
        { appendTimeline, nowMs: 1_000 + i * 10 },
      );
    }

    endListenSession(
      { trackId, companionId, position: 100, title: "雨夜电台" },
      { appendTimeline, nowMs: 3_000 },
    );

    assert.ok(timeline.length <= 2, `expected ≤2 timeline events, got ${timeline.length}`);
    assert.ok(timeline.length >= 1, "session start must emit");
    const types = timeline.map((e) => e.eventType);
    assert.ok(types.includes("listen.started") || types.includes("listen.shared"), `start type missing: ${types}`);
    if (timeline.length === 2) {
      assert.equal(types[1], "listen.completed");
    }
    record("seek_ticks_coalesce_timeline", true, `events=${timeline.length} types=${types.join(",")}`);
  }

  // --- 2. Book chunk has sourceRef when flag/force ---
  {
    resetAll();
    setFlags({ unifiedMemoryAdaptersV1: true });
    const filed = [];
    const fakeDrawer = async (params) => {
      filed.push(params);
      return { id: params.id, ...params };
    };
    const book = {
      id: "book-m3-src",
      title: "月栖手记",
      author: "测试",
      format: "txt",
      body: "第一章。窗外的雨停了。\n\n第二章。我们继续听歌。\n\n第三章。记忆分层。",
      companionId: "companion-m3",
    };
    const result = await ingestBookChunksWithSourceRef(book, {
      force: true,
      fileDrawer: fakeDrawer,
      companionId: "companion-m3",
      splitText: (text) => String(text).split(/\n\n+/).filter(Boolean),
    });
    assert.equal(result.ok, true);
    assert.ok(filed.length >= 1, "chunks filed");
    const first = filed[0];
    assert.ok(first.sourceRef && typeof first.sourceRef === "object", "sourceRef present");
    assert.equal(first.sourceRef.sourceType, "book_chunk");
    assert.equal(first.sourceId, bookChunkSourceId("book-m3-src", 0));
    assert.equal(first.bookId, "book-m3-src");
    assert.ok(first.chapterId, "chapterId set");
    assert.equal(first.sourceVersion, 1);

    // books-import wrapper also attaches when flag on
    filed.length = 0;
    await ingestBookChunks(book, {
      force: true,
      fileDrawer: fakeDrawer,
      companionId: "companion-m3",
      splitText: (text) => String(text).split(/\n\n+/).filter(Boolean),
    });
    assert.ok(filed[0]?.sourceRef, "wrapper attaches sourceRef");
    record("book_chunk_has_source_ref", true, `chunks=${filed.length} sourceId=${filed[0].sourceId}`);
  }

  // --- 3. Delete book invalidates chunks (injectable palace store) ---
  {
    const store = resetAll();
    setFlags({ unifiedMemoryAdaptersV1: true });
    const book = {
      id: "book-m3-del",
      title: "待删之书",
      body: "段落一内容足够长。\n\n段落二继续写。",
      companionId: "companion-m3",
    };
    await ingestBookChunksWithSourceRef(book, {
      force: true,
      palaceStore: store,
      companionId: "companion-m3",
      fileDrawer: async (p) => ({ id: p.id, ...p }),
      splitText: (text) => String(text).split(/\n\n+/).filter(Boolean),
    });
    const before = store.list({ sourceType: "book_chunk", includeInvalidated: true });
    assert.ok(before.length >= 1, "index rows exist");
    assert.ok(before.every((r) => !r.invalidatedAt), "active before delete");

    const tomb = tombstoneBookChunks("book-m3-del", {
      companionId: "companion-m3",
      palaceStore: store,
    });
    assert.equal(tomb.ok, true);
    assert.ok(tomb.invalidated >= 1, "invalidated count");

    const active = store.list({ sourceType: "book_chunk" });
    assert.equal(active.length, 0, "no active chunks after delete");
    const all = store.list({ sourceType: "book_chunk", includeInvalidated: true });
    assert.ok(all.every((r) => r.invalidatedAt), "all tombstoned");

    const viaImport = deleteBookMemoryIndex("book-m3-del", {
      force: true,
      companionId: "companion-m3",
      palaceStore: store,
    });
    assert.equal(viaImport.ok, true);
    record("delete_book_invalidates_chunks", true, `invalidated=${tomb.invalidated}`);
  }

  // --- 4. Preference → candidate not graph ---
  {
    resetAll();
    setFlags({ unifiedMemoryAdaptersV1: true });
    const candidates = [];
    let graphCalls = 0;
    const submitCandidate = (c) => {
      candidates.push(c);
      return { ok: true, value: c };
    };
    const ingestCandidate = () => {
      graphCalls += 1;
      return { ok: true };
    };

    const listenPref = submitListenPreference(
      {
        claim: "喜欢这首歌",
        trackId: "track-fav",
        title: "雨夜电台",
        companionId: "companion-m3",
        polarity: "like",
      },
      { submitCandidate, ingestCandidate },
    );
    assert.equal(listenPref.ok, true);
    assert.equal(listenPref.graphIngested, false);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].status, "pending");
    assert.match(candidates[0].claim, /喜欢/);

    const readingPref = submitReadingPreference(
      {
        claim: "喜欢这本书",
        bookId: "book-fav",
        title: "月栖手记",
        companionId: "companion-m3",
      },
      { submitCandidate, ingestCandidate },
    );
    assert.equal(readingPref.ok, true);
    assert.equal(readingPref.graphIngested, false);
    assert.equal(candidates.length, 2);
    assert.equal(graphCalls, 0, "must never call ingestCandidate");

    // Graph bag must stay empty (no accidental writes via real ledger path either)
    const graphRaw = memStorage.getItem(CONTEXT_GRAPH_KEY);
    assert.ok(!graphRaw || graphRaw === "null", "context graph untouched");
    record("preference_candidate_not_graph", true, `candidates=${candidates.length} graphCalls=${graphCalls}`);
  }

  // --- 5. Flag off: delete / adapter paths skip without force ---
  {
    resetAll();
    setFlags({ unifiedMemoryAdaptersV1: false });
    const skip = deleteBookMemoryIndex("book-legacy", {});
    assert.equal(skip.skipped, true);
    const gated = await ingestBookChunksWithSourceRef(
      { id: "book-legacy", title: "旧路径", body: "仅一段正文。" },
      { force: false },
    );
    assert.equal(gated.ok, false);
    assert.equal(gated.reason, "flag_off");
    record("flag_off_adapter_gated", true, "ingest gated + delete skipped");
  }

  // --- 6. Registry registration ---
  {
    resetAll();
    const { getFeatureMemoryAdapter, listFeatureMemoryAdapterIds } = await import(
      "../src/memory/adapters/registry.js"
    );
    ensureListenAdapterRegistered();
    ensureReadingAdapterRegistered();
    assert.ok(getFeatureMemoryAdapter("listen"));
    assert.ok(getFeatureMemoryAdapter("reading"));
    const ids = listFeatureMemoryAdapterIds();
    assert.ok(ids.includes("listen") && ids.includes("reading"));
    record("adapters_registered", true, ids.join(","));
  }

  const passed = cases.filter((c) => c.pass).length;
  const failed = cases.length - passed;
  const report = {
    wave: "M3",
    name: "unified-memory-media",
    passed,
    failed,
    total: cases.length,
    cases,
    at: new Date().toISOString(),
  };
  writeFileSync(join(evidenceDir, "M3_VERIFY.json"), JSON.stringify(report, null, 2));

  const evidencePath = join(evidenceDir, "M3_MEDIA.md");
  if (!existsSync(evidencePath)) {
    /* written separately */
  }

  console.log(`\n${failed ? "FAIL" : "OK"}  ${passed}/${cases.length} unified-memory media / M3`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
