/**
 * C5 — Product cutover migration runner with persistent ledger.
 *
 * - Loads browser-shaped fixtures (localStorage + indexedDB.memories)
 * - Migrates diary.memory → Diary Repository (idempotent)
 * - Quarantines orphan palace rows without sourceRef as legacy_unverified
 * - Writes migration ledger entries to yueqi.memory.migration.ledger.v1
 *
 * Usage:
 *   node scripts/product-cutover-migrate.mjs
 *   node scripts/product-cutover-migrate.mjs --fixture docs/qa/product-cutover/fixtures/c5-browser-dump.json --apply
 *   node scripts/product-cutover-migrate.mjs --apply --triple
 *   npm run product-cutover:migrate
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_FIXTURE = join(root, "docs/qa/product-cutover/fixtures/c5-browser-dump.json");

function resolveRepoPath(p) {
  if (!p) return "";
  return isAbsolute(p) ? p : join(root, p);
}

function parseArgs(argv) {
  const out = {
    fixture: DEFAULT_FIXTURE,
    storageJson: "",
    memoriesJson: "",
    outJson: "",
    outStorage: "",
    outMemories: "",
    apply: false,
    triple: false,
    palaceRebuild: false,
    force: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--fixture") out.fixture = resolveRepoPath(argv[++i] || "");
    else if (a === "--storage-json") out.storageJson = resolveRepoPath(argv[++i] || "");
    else if (a === "--memories-json") out.memoriesJson = resolveRepoPath(argv[++i] || "");
    else if (a === "--out") out.outJson = resolveRepoPath(argv[++i] || "");
    else if (a === "--out-storage") out.outStorage = resolveRepoPath(argv[++i] || "");
    else if (a === "--out-memories") out.outMemories = resolveRepoPath(argv[++i] || "");
    else if (a === "--apply") out.apply = true;
    else if (a === "--triple") out.triple = true;
    else if (a === "--palace-rebuild") out.palaceRebuild = true;
    else if (a === "--force") out.force = true;
  }
  return out;
}

function memoryStorage(seed = {}) {
  const map = new Map();
  for (const [k, v] of Object.entries(seed)) {
    map.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
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
    entries() {
      return [...map.entries()];
    },
    _map: map,
  };
}

function safeParse(raw) {
  if (raw == null) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

function loadJson(path) {
  if (!path || !existsSync(path)) return null;
  return safeParse(readFileSync(path, "utf8"));
}

/**
 * Accepts:
 * - Combined fixture { localStorage, indexedDB: { memories } }
 * - Or separate --storage-json + --memories-json (M9 shape)
 */
function loadFixture(args) {
  /** @type {Record<string, string>} */
  let storageSeed = {};
  /** @type {object[]} */
  let memories = [];
  let fixturePath = args.fixture || "";

  if (args.storageJson || args.memoriesJson) {
    if (args.storageJson) {
      const raw = loadJson(args.storageJson);
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error(`--storage-json must be a JSON object: ${args.storageJson}`);
      }
      storageSeed = raw;
    }
    if (args.memoriesJson) {
      const raw = loadJson(args.memoriesJson);
      if (!Array.isArray(raw)) {
        throw new Error(`--memories-json must be a JSON array: ${args.memoriesJson}`);
      }
      memories = raw;
    }
    return {
      storageSeed,
      memories,
      sourceLabel: {
        storageJson: args.storageJson || null,
        memoriesJson: args.memoriesJson || null,
        fixture: null,
      },
    };
  }

  const dump = loadJson(fixturePath);
  if (!dump || typeof dump !== "object") {
    throw new Error(`Fixture not found or invalid: ${fixturePath}`);
  }

  if (dump.localStorage && typeof dump.localStorage === "object") {
    storageSeed = { ...dump.localStorage };
  } else if (!dump.indexedDB && !Array.isArray(dump)) {
    // Flat localStorage dump
    storageSeed = { ...dump };
  }

  if (dump.indexedDB?.memories && Array.isArray(dump.indexedDB.memories)) {
    memories = dump.indexedDB.memories;
  } else if (Array.isArray(dump.memories)) {
    memories = dump.memories;
  } else if (Array.isArray(dump)) {
    memories = dump;
  }

  // Also accept IDB dump nested under stores.memories
  if (!memories.length && dump.stores?.memories && Array.isArray(dump.stores.memories)) {
    memories = dump.stores.memories;
  }

  return {
    storageSeed,
    memories,
    sourceLabel: { fixture: fixturePath, storageJson: null, memoriesJson: null },
  };
}

function dumpStorage(storage) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [k, v] of storage.entries()) out[k] = v;
  return out;
}

function countDiaryLegacy(memories) {
  return memories.filter(
    (r) => r && (r.source === "diary.memory" || (Array.isArray(r.tags) && r.tags.includes("diary"))),
  ).length;
}

/**
 * @param {{
 *   storage: ReturnType<typeof memoryStorage>,
 *   memories: object[],
 *   apply: boolean,
 *   force: boolean,
 *   palaceRebuild: boolean,
 *   sourceLabel: object,
 * }} ctx
 */
async function runOnce(ctx) {
  const { storage, memories, apply, force, palaceRebuild, sourceLabel } = ctx;
  globalThis.localStorage = storage;
  globalThis.window = {
    localStorage: storage,
    dispatchEvent() {},
    addEventListener() {},
    removeEventListener() {},
  };

  const {
    beginMigrationRun,
    finalizeMigrationRun,
    quarantineOrphanPalaceRows,
    MIGRATION_LEDGER_KEY,
    readMigrationLedger,
  } = await import("../src/memory/migration-ledger.js");

  const {
    __setDiaryStorageForTests,
    migrateLegacyDiaryMemories,
    listDiaryEntries,
  } = await import("../src/diary/repository.js");

  __setDiaryStorageForTests(storage);

  let profile = null;
  try {
    const raw = storage.getItem("yueqi.cutover.profile.v1");
    const parsed = safeParse(raw);
    profile = typeof parsed === "string" ? parsed : null;
  } catch {
    profile = null;
  }

  const beforeTotal = listDiaryEntries({ includeDeleted: true }).length;
  const sourceSummary = {
    ...sourceLabel,
    diaryLegacyCount: countDiaryLegacy(memories),
    palaceRowCount: memories.length,
    diaryBeforeTotal: beforeTotal,
    storageKeys: storage.entries().map(([k]) => k).length,
  };

  const begun = beginMigrationRun({
    mode: apply ? "apply" : "dry-run",
    profile,
    sourceSummary,
  });
  if (!begun.ok) {
    throw new Error(`ledger begin failed: ${begun.reason}`);
  }

  /** @type {string[]} */
  const failures = [];
  /** @type {object|null} */
  let diaryApply = null;

  try {
    if (apply) {
      diaryApply = await migrateLegacyDiaryMemories({ memories, force });
    } else {
      // Dry-run plan only via apply=false (no writes)
      diaryApply = {
        ok: true,
        dryRun: true,
        scanned: countDiaryLegacy(memories),
        imported: 0,
        skipped: 0,
        updated: 0,
        note: "Dry-run: pass --apply to import diary.memory → repository.",
      };
      // Still compute would-import via a non-mutating check
      const { getDiaryEntry } = await import("../src/diary/repository.js");
      let wouldImport = 0;
      let wouldSkip = 0;
      for (const row of memories) {
        if (!row || !(row.source === "diary.memory" || (Array.isArray(row.tags) && row.tags.includes("diary")))) {
          continue;
        }
        const id = String(row.id || "").trim();
        const body = String(row.rawText || row.body || row.text || "").trim();
        if (!id || !body) continue;
        if (getDiaryEntry(id, { includeDeleted: true })) wouldSkip += 1;
        else wouldImport += 1;
      }
      diaryApply.wouldImport = wouldImport;
      diaryApply.wouldSkip = wouldSkip;
    }
  } catch (error) {
    failures.push({ stage: "diary_migrate", message: error?.message || String(error) });
  }

  const afterTotal = listDiaryEntries({ includeDeleted: true }).length;

  // Quarantine orphan palace rows (no sourceRef) as legacy_unverified
  const q = quarantineOrphanPalaceRows(memories, { apply });
  let nextMemories = q.rows;

  /** @type {object|null} */
  let palaceRebuildResult = null;
  if (palaceRebuild) {
    try {
      const { rebuildPalaceFromSources, createMemoryPalaceIndexStore } = await import(
        "../src/memory/palace/rebuild.js"
      );
      const diaryEntries = listDiaryEntries({ includeDeleted: false });
      const bookChunks = nextMemories.filter(
        (r) => r && r.source === "book.chunk" && r.quarantineStatus !== "legacy_unverified",
      );
      const store = createMemoryPalaceIndexStore();
      const result = await rebuildPalaceFromSources({
        diaryEntries,
        bookChunks,
        store,
        clearFirst: true,
        projectDrawers: false,
        nowIso: "2026-08-08T00:00:00.000Z",
      });
      palaceRebuildResult = {
        dryRun: true,
        ok: result.ok,
        projected: result.projected,
        from: result.from,
        errorCount: (result.errors || []).length,
        note: "In-memory index rebuild only; does not write IndexedDB drawers.",
      };
    } catch (error) {
      failures.push({ stage: "palace_rebuild", message: error?.message || String(error) });
    }
  }

  const result = {
    diary: {
      beforeTotal,
      afterTotal,
      apply: diaryApply,
      newImported: apply ? Number(diaryApply?.imported || 0) : Number(diaryApply?.wouldImport || 0),
    },
    quarantine: {
      scanned: q.scanned,
      orphanCount: q.orphanCount,
      applied: apply,
      tag: "legacy_unverified",
    },
    palaceRebuild: palaceRebuildResult,
    ledgerKey: MIGRATION_LEDGER_KEY,
  };

  const finalized = finalizeMigrationRun(begun.run.id, {
    result,
    quarantine: q.quarantined,
    failures,
  });

  const ledger = readMigrationLedger();

  return {
    ok: failures.length === 0 && (diaryApply?.ok !== false),
    run: finalized.run || begun.run,
    result,
    quarantine: q.quarantined,
    failures,
    memories: nextMemories,
    ledger,
    storage,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const loaded = loadFixture(args);
  let storage = memoryStorage(loaded.storageSeed);
  let memories = loaded.memories.map((r) => (r && typeof r === "object" ? { ...r } : r));

  const passes = args.triple ? 3 : 1;
  /** @type {object[]} */
  const reports = [];

  for (let i = 0; i < passes; i += 1) {
    const once = await runOnce({
      storage,
      memories,
      apply: args.apply,
      force: args.force,
      palaceRebuild: args.palaceRebuild && i === 0,
      sourceLabel: {
        ...loaded.sourceLabel,
        pass: i + 1,
        of: passes,
      },
    });
    memories = once.memories;
    storage = once.storage;
    reports.push({
      pass: i + 1,
      ok: once.ok,
      runId: once.run?.id,
      diary: once.result.diary,
      quarantineCount: once.quarantine.length,
      newImported: once.result.diary.newImported,
      failures: once.failures,
    });
  }

  const report = {
    schemaVersion: 1,
    wave: "C5",
    generatedAt: new Date().toISOString(),
    mode: args.apply ? "apply" : "dry-run",
    triple: args.triple === true,
    fixture: loaded.sourceLabel,
    passes: reports,
    idempotent:
      args.triple && args.apply
        ? reports[1]?.newImported === 0 && reports[2]?.newImported === 0
        : null,
    latestLedgerRun: reports[reports.length - 1]?.runId || null,
  };

  // Attach full ledger dump from last storage
  try {
    const raw = storage.getItem("yueqi.memory.migration.ledger.v1");
    report.ledger = safeParse(raw);
  } catch {
    report.ledger = null;
  }

  const text = JSON.stringify(report, null, 2);
  console.log(text);

  const outPath =
    args.outJson || join(root, "docs/qa/product-cutover/C5_MIGRATE_RUN.json");
  try {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${text}\n`, "utf8");
    console.error(`\nWrote ${outPath}`);
  } catch (error) {
    console.error("\nCould not write report JSON:", error?.message || error);
  }

  if (args.apply && args.outStorage) {
    try {
      mkdirSync(dirname(args.outStorage), { recursive: true });
      writeFileSync(args.outStorage, `${JSON.stringify(dumpStorage(storage), null, 2)}\n`, "utf8");
      console.error(`Wrote storage dump ${args.outStorage}`);
    } catch (error) {
      console.error("Could not write --out-storage:", error?.message || error);
      process.exitCode = 1;
    }
  }

  if (args.apply && args.outMemories) {
    try {
      mkdirSync(dirname(args.outMemories), { recursive: true });
      writeFileSync(args.outMemories, `${JSON.stringify(memories, null, 2)}\n`, "utf8");
      console.error(`Wrote memories dump ${args.outMemories}`);
    } catch (error) {
      console.error("Could not write --out-memories:", error?.message || error);
      process.exitCode = 1;
    }
  }

  if (args.triple && args.apply && report.idempotent === false) {
    console.error("\nFAIL: triple apply was not idempotent (2nd/3rd imported > 0)");
    process.exitCode = 1;
  }

  return report;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
