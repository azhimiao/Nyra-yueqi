/**
 * M9 / plan §13.3–13.4 — Idempotent unified-memory migrations.
 *
 * - Diary: migrateLegacyDiaryMemories (palace diary.memory → Diary Repository)
 * - Optional: palace rebuild dry-run from repository + book.chunk fixtures
 *
 * Default is dry-run (no writes). Pass --apply to mutate in-memory/fixture storage.
 * Safe to run three times: second/third apply must not grow diary totals.
 *
 * Usage:
 *   node scripts/unified-memory-migrate-run.mjs
 *   node scripts/unified-memory-migrate-run.mjs --memories-json fixtures/memories.json
 *   node scripts/unified-memory-migrate-run.mjs --apply --memories-json ... --out-storage out.json
 *   npm run unified-memory:migrate-run
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function resolveRepoPath(p) {
  if (!p) return "";
  return isAbsolute(p) ? p : join(root, p);
}

function parseArgs(argv) {
  const out = {
    storageJson: "",
    memoriesJson: "",
    outJson: "",
    outStorage: "",
    apply: false,
    palaceRebuild: false,
    force: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--storage-json") out.storageJson = argv[++i] || "";
    else if (a === "--memories-json") out.memoriesJson = argv[++i] || "";
    else if (a === "--out") out.outJson = argv[++i] || "";
    else if (a === "--out-storage") out.outStorage = argv[++i] || "";
    else if (a === "--apply") out.apply = true;
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

function loadStorageSeed(path) {
  if (!path) return {};
  const raw = safeParse(readFileSync(path, "utf8"));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`--storage-json must be a JSON object: ${path}`);
  }
  return raw;
}

function loadMemories(path) {
  if (!path) return [];
  const raw = safeParse(readFileSync(path, "utf8"));
  if (!Array.isArray(raw)) {
    throw new Error(`--memories-json must be a JSON array: ${path}`);
  }
  return raw;
}

function dumpStorage(storage) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [k, v] of storage.entries()) out[k] = v;
  return out;
}

function planDiaryMigration(memories, getDiaryEntry) {
  const legacy = memories.filter(
    (r) => r && (r.source === "diary.memory" || (Array.isArray(r.tags) && r.tags.includes("diary"))),
  );
  let wouldImport = 0;
  let wouldSkip = 0;
  let wouldSkipEmpty = 0;
  for (const row of legacy) {
    const id = String(row.id || "").trim();
    if (!id) {
      wouldSkipEmpty += 1;
      continue;
    }
    const body = String(row.rawText || row.body || row.text || "").trim();
    if (!body) {
      wouldSkipEmpty += 1;
      continue;
    }
    if (getDiaryEntry(id, { includeDeleted: true })) wouldSkip += 1;
    else wouldImport += 1;
  }
  return {
    scanned: legacy.length,
    wouldImport,
    wouldSkip,
    wouldSkipEmpty,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const seed = loadStorageSeed(args.storageJson);
  const memories = loadMemories(args.memoriesJson);
  const storage = memoryStorage(seed);
  globalThis.localStorage = storage;
  globalThis.window = {
    localStorage: storage,
    dispatchEvent() {},
    addEventListener() {},
    removeEventListener() {},
  };

  const {
    __setDiaryStorageForTests,
    migrateLegacyDiaryMemories,
    listDiaryEntries,
    getDiaryEntry,
  } = await import("../src/diary/repository.js");

  __setDiaryStorageForTests(storage);

  const beforeTotal = listDiaryEntries({ includeDeleted: true }).length;
  const plan = planDiaryMigration(memories, getDiaryEntry);

  /** @type {object|null} */
  let applyResult = null;
  if (args.apply) {
    applyResult = await migrateLegacyDiaryMemories({
      memories,
      force: args.force === true,
    });
  }

  const afterTotal = listDiaryEntries({ includeDeleted: true }).length;

  /** @type {object|null} */
  let palaceRebuild = null;
  if (args.palaceRebuild) {
    const { rebuildPalaceFromSources, createMemoryPalaceIndexStore } = await import(
      "../src/memory/palace/rebuild.js"
    );
    const diaryEntries = listDiaryEntries({ includeDeleted: false });
    const bookChunks = memories.filter((r) => r && r.source === "book.chunk");
    const store = createMemoryPalaceIndexStore();
    const result = await rebuildPalaceFromSources({
      diaryEntries,
      bookChunks,
      store,
      clearFirst: true,
      projectDrawers: false,
      nowIso: "2026-08-08T00:00:00.000Z",
    });
    palaceRebuild = {
      dryRun: true,
      ok: result.ok,
      projected: result.projected,
      from: result.from,
      errorCount: (result.errors || []).length,
      note: "In-memory index rebuild only; does not write IndexedDB drawers.",
    };
  }

  const report = {
    schemaVersion: 1,
    wave: "M9",
    generatedAt: new Date().toISOString(),
    mode: args.apply ? "apply" : "dry-run",
    destructive: args.apply === true,
    storageSource: args.storageJson || "(empty in-memory)",
    memoriesSource: args.memoriesJson || null,
    diary: {
      beforeTotal,
      afterTotal,
      plan,
      apply: applyResult,
      note: args.apply
        ? "migrateLegacyDiaryMemories applied (idempotent by diary id)."
        : "Dry-run: no writes. Pass --apply to import diary.memory → repository.",
    },
    palaceRebuild,
  };

  const text = JSON.stringify(report, null, 2);
  console.log(text);

  const outPath = args.outJson || join(root, "docs/qa/unified-memory/M9_MIGRATE_RUN.json");
  try {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${text}\n`, "utf8");
    console.error(`\nWrote ${outPath}`);
  } catch (error) {
    console.error("\nCould not write report JSON:", error?.message || error);
  }

  if (args.apply && args.outStorage) {
    try {
      const outAbs = resolveRepoPath(args.outStorage);
      mkdirSync(dirname(outAbs), { recursive: true });
      writeFileSync(outAbs, `${JSON.stringify(dumpStorage(storage), null, 2)}\n`, "utf8");
      console.error(`Wrote storage dump ${outAbs}`);
    } catch (error) {
      console.error("Could not write --out-storage:", error?.message || error);
      process.exitCode = 1;
    }
  }

  return report;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
