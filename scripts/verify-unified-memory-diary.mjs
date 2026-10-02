/**
 * Unified memory M2 — Diary Repository authority.
 *
 * Run: npm run verify:unified-memory-diary
 * Alias: npm run verify:unified-memory-m2
 */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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
  if (Object.prototype.hasOwnProperty.call(partial, "diaryRepositoryV1")) {
    memory.set(
      CUTOVER_PROFILE_KEY,
      JSON.stringify(partial.diaryRepositoryV1 ? "internal_v1" : "legacy"),
    );
    __resetCutoverProfileCacheForTests();
  }
}

function seedLegacyMemories(rows) {
  memory.set(LOCAL_KEYS.memoryKey, JSON.stringify(rows));
}

const cases = [];
function record(id, pass, detail = "") {
  cases.push({ id, pass: Boolean(pass), detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}${detail ? ` — ${detail}` : ""}`);
}

const {
  __setDiaryStorageForTests,
  __clearDiaryRepositoryForTests,
  migrateLegacyDiaryMemories,
  listDiaryEntries,
  getDiaryEntry,
} = await import("../src/diary/repository.js");

const {
  saveDiary,
  getDiaryById,
  listDiaries,
  deleteDiaryRecord,
} = await import("../src/diary/records.js");

const {
  createMemoryPalaceIndexStore,
  __setDefaultPalaceIndexStoreForTests,
  __clearDefaultPalaceIndexStoreForTests,
} = await import("../src/memory/projection/project-to-palace.js");

const { __setTimelineStorageForTests } = await import("../src/timeline/repository.js");
const {
  __clearProjectionOutboxForTests,
  __clearProjectionRegistryForTests,
} = await import("../src/projections/index.js");
const { __resetDiaryAdapterRegistrationForTests } = await import("../src/memory/adapters/diary.js");
const { __clearFeatureMemoryAdaptersForTests } = await import("../src/memory/adapters/registry.js");

function resetAll() {
  memory.clear();
  __setDiaryStorageForTests(memStorage);
  __setTimelineStorageForTests(memStorage);
  __clearDiaryRepositoryForTests();
  __clearDefaultPalaceIndexStoreForTests();
  __clearProjectionOutboxForTests();
  __clearProjectionRegistryForTests();
  __clearFeatureMemoryAdaptersForTests();
  __resetDiaryAdapterRegistrationForTests();
  const store = createMemoryPalaceIndexStore();
  __setDefaultPalaceIndexStoreForTests(store);
  return store;
}

async function main() {
  // --- 1. Flag on: delete all palace index → diary still opens from repository ---
  {
    const store = resetAll();
    setFlags({ diaryRepositoryV1: true });
    const saved = await saveDiary({
      id: "diary-m2-open",
      title: "雨夜",
      body: "今天的雨停在窗沿上。",
      companionId: "companion-a",
      diaryDay: "2026-08-08",
      styleId: "literary",
    });
    assert.equal(saved.id, "diary-m2-open");
    assert.ok(getDiaryEntry("diary-m2-open"), "repo row exists");
    assert.ok(store.size() >= 1, "palace projection created");

    // Wipe all palace index rows for diary
    for (const row of store.list({ sourceType: "diary", includeInvalidated: true })) {
      store.remove(row.indexId);
    }
    assert.equal(store.list({ sourceType: "diary" }).length, 0);

    const opened = await getDiaryById("diary-m2-open");
    assert.ok(opened, "opens without palace");
    assert.equal(opened.rawText || opened.body, "今天的雨停在窗沿上。");
    assert.equal(opened.authority, "diary_repository");
    record("flag_on_open_without_palace", true, `id=${opened.id}`);
  }

  // --- 2. Edit bumps sourceVersion, no duplicate diary id ---
  {
    resetAll();
    setFlags({ diaryRepositoryV1: true });
    await saveDiary({
      id: "diary-m2-edit",
      title: "初稿",
      body: "第一版正文",
      companionId: "companion-a",
      diaryDay: "2026-08-07",
    });
    const v1 = getDiaryEntry("diary-m2-edit");
    assert.equal(v1.sourceVersion, 1);

    await saveDiary({
      id: "diary-m2-edit",
      title: "改稿",
      body: "第二版正文",
      companionId: "companion-a",
      diaryDay: "2026-08-07",
    });
    const v2 = getDiaryEntry("diary-m2-edit");
    assert.equal(v2.sourceVersion, 2);
    assert.equal(v2.body, "第二版正文");

    const all = listDiaryEntries({ companionId: "companion-a" });
    const sameId = all.filter((r) => r.id === "diary-m2-edit");
    assert.equal(sameId.length, 1, "single row for diary id");
    const listed = await listDiaries("companion-a");
    assert.equal(listed.filter((r) => r.id === "diary-m2-edit").length, 1);
    record("edit_bumps_source_version_no_dup", true, `v=${v2.sourceVersion}`);
  }

  // --- 3. Migration idempotent 3x ---
  {
    resetAll();
    setFlags({ diaryRepositoryV1: true });
    seedLegacyMemories([
      {
        id: "diary-legacy-1",
        title: "旧日记",
        rawText: "来自 memories 的正文",
        source: "diary.memory",
        diaryDay: "2026-08-01",
        companionId: "companion-b",
        characterId: "companion-b",
        createdAt: "2026-08-01T12:00:00.000Z",
        tags: ["diary", "文学"],
      },
      {
        id: "diary-legacy-2",
        title: "另一篇",
        rawText: "第二篇旧文",
        source: "diary.memory",
        diaryDay: "2026-08-02",
        companionId: "companion-b",
        createdAt: "2026-08-02T12:00:00.000Z",
        tags: ["diary"],
      },
    ]);

    const r1 = await migrateLegacyDiaryMemories({});
    const r2 = await migrateLegacyDiaryMemories({});
    const r3 = await migrateLegacyDiaryMemories({});
    assert.equal(r1.imported, 2);
    assert.equal(r2.imported, 0);
    assert.equal(r3.imported, 0);
    assert.equal(r1.total, r2.total);
    assert.equal(r2.total, r3.total);
    assert.equal(listDiaryEntries({ companionId: "companion-b" }).length, 2);
    // force still does not duplicate ids
    const rf = await migrateLegacyDiaryMemories({ force: true });
    assert.equal(listDiaryEntries({ companionId: "companion-b" }).length, 2);
    assert.ok(rf.updated + rf.skipped + rf.imported >= 2);
    record(
      "migration_idempotent_triple",
      true,
      `imported=${r1.imported}/${r2.imported}/${r3.imported} total=${r3.total}`,
    );
  }

  // --- 4. Flag off: legacy path still works (smoke) ---
  {
    resetAll();
    setFlags({ diaryRepositoryV1: false });
    // Seed empty memories; saveDiary legacy uses fileDrawer → storeRecord → localStorage fallback
    seedLegacyMemories([]);
    const saved = await saveDiary({
      id: "diary-m2-legacy",
      title: "旧路径",
      body: "flag off 仍写 memories",
      companionId: "companion-c",
      diaryDay: "2026-08-06",
    });
    assert.equal(saved.id, "diary-m2-legacy");
    assert.equal(getDiaryEntry("diary-m2-legacy"), null, "repo unused when flag off");
    const opened = await getDiaryById("diary-m2-legacy");
    assert.ok(opened);
    assert.equal(String(opened.rawText || "").includes("flag off"), true);
    // Repository list stays empty
    assert.equal(listDiaryEntries({}).length, 0);
    record("flag_off_legacy_path_smoke", true, `id=${opened.id}`);
  }

  // --- 5. Dual-read: repo preferred over legacy twin ---
  {
    resetAll();
    setFlags({ diaryRepositoryV1: true });
    seedLegacyMemories([
      {
        id: "diary-dual-1",
        title: "旧副本",
        rawText: "legacy body",
        source: "diary.memory",
        diaryDay: "2026-08-05",
        companionId: "companion-d",
        createdAt: "2026-08-05T10:00:00.000Z",
      },
    ]);
    await migrateLegacyDiaryMemories({});
    await saveDiary({
      id: "diary-dual-1",
      title: "新权威",
      body: "repository body",
      companionId: "companion-d",
      diaryDay: "2026-08-05",
    });
    const opened = await getDiaryById("diary-dual-1");
    assert.equal(opened.body || opened.rawText, "repository body");
    assert.equal(opened.authority, "diary_repository");
    record("dual_read_prefers_repository", true);
  }

  // --- 6. Delete tombstones palace projection ---
  {
    const store = resetAll();
    setFlags({ diaryRepositoryV1: true });
    await saveDiary({
      id: "diary-m2-del",
      title: "将删",
      body: "删前正文",
      companionId: "companion-e",
      diaryDay: "2026-08-04",
    });
    assert.ok(store.list({ sourceType: "diary", sourceId: "diary-m2-del" }).length >= 1);
    await deleteDiaryRecord("diary-m2-del");
    assert.equal(await getDiaryById("diary-m2-del"), null);
    const remaining = store.list({ sourceType: "diary", sourceId: "diary-m2-del" });
    assert.equal(remaining.length, 0, "active palace rows cleared/invalidated");
    record("delete_clears_active_palace", true);
  }

  // Artifact files exist
  record(
    "artifacts_present",
    existsSync(join(root, "src/diary/schema.js")) &&
      existsSync(join(root, "src/diary/repository.js")) &&
      existsSync(join(root, "src/memory/adapters/contract.js")) &&
      existsSync(join(root, "src/memory/adapters/diary.js")) &&
      existsSync(join(root, "src/memory/adapters/registry.js")),
  );

  const passed = cases.filter((c) => c.pass).length;
  const failed = cases.filter((c) => !c.pass).length;
  const report = {
    wave: "M2",
    script: "verify-unified-memory-diary.mjs",
    passed,
    failed,
    total: cases.length,
    cases,
    at: new Date().toISOString(),
  };
  writeFileSync(join(evidenceDir, "M2_VERIFY.json"), JSON.stringify(report, null, 2), "utf8");

  console.log(`\n${failed ? "FAIL" : "OK"}  ${passed}/${cases.length} unified-memory diary / M2`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
