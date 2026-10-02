/**
 * M9 / plan §13 — Read-only Legacy Census + cutover counts for unified memory.
 *
 * Counts:
 * - diary.memory / book.chunk / chat.memory / worldbook.memory in palace dump
 * - legacy_unscoped + missing companionId/sourceRef (via censusPalaceRows)
 * - Context Graph accepted items without sourceRef
 * - Cohabit dual keys (canonical Timeline + localStorage projection)
 * - Palace orphans without sourceRef
 *
 * Non-destructive. Does not migrate, delete, or rewrite storage.
 *
 * Usage:
 *   node scripts/unified-memory-migrate-report.mjs
 *   node scripts/unified-memory-migrate-report.mjs --storage-json path/to/localStorage.json
 *   node scripts/unified-memory-migrate-report.mjs --memories-json path/to/memories.json
 *   npm run unified-memory:migrate-report
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { censusPalaceRows } from "../src/memory/palace/legacy-census.js";
import { CONTEXT_GRAPH_KEY } from "../src/context/schema.js";
import { COHABIT_TIMELINE_KEY } from "../src/memory/cohabit-timeline.js";
import { TIMELINE_STORE_KEY } from "../src/timeline/repository.js";
import { DIARY_STORE_KEY } from "../src/diary/repository.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const out = { storageJson: "", memoriesJson: "", outJson: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--storage-json") out.storageJson = argv[++i] || "";
    else if (a === "--memories-json") out.memoriesJson = argv[++i] || "";
    else if (a === "--out") out.outJson = argv[++i] || "";
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
    throw new Error(`--storage-json must be a JSON object of localStorage key→value: ${path}`);
  }
  return raw;
}

function loadMemories(path) {
  if (!path) return null;
  const raw = safeParse(readFileSync(path, "utf8"));
  if (!Array.isArray(raw)) {
    throw new Error(`--memories-json must be a JSON array: ${path}`);
  }
  return raw;
}

function hasSourceRef(row) {
  if (!row || typeof row !== "object") return false;
  const ref = row.sourceRef;
  if (ref && typeof ref === "object") {
    return Boolean(String(ref.sourceId || ref.sourceType || "").trim());
  }
  return Boolean(String(ref || row.sourceId || "").trim());
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const seed = loadStorageSeed(args.storageJson);
  const storage = memoryStorage(seed);
  globalThis.localStorage = storage;
  globalThis.window = { localStorage: storage };

  const memories = loadMemories(args.memoriesJson);
  const palaceCensus = memories
    ? censusPalaceRows(memories)
    : {
        total: 0,
        scoped: 0,
        legacyUnscoped: 0,
        legacyMissingRelationship: 0,
        bySource: {},
        byClassification: {},
        sampleUnscoped: [],
      };

  const bySource = palaceCensus.bySource || {};
  const diaryMemoryCount = Number(bySource["diary.memory"] || 0);
  const bookChunkCount = Number(bySource["book.chunk"] || 0);
  const chatMemoryCount = Number(bySource["chat.memory"] || 0);
  const worldbookMemoryCount = Number(bySource["worldbook.memory"] || 0);

  let orphansWithoutSourceRef = 0;
  /** @type {object[]} */
  const orphanSamples = [];
  if (memories) {
    for (const row of memories) {
      if (!row || typeof row !== "object") continue;
      if (hasSourceRef(row)) continue;
      orphansWithoutSourceRef += 1;
      if (orphanSamples.length < 15) {
        orphanSamples.push({
          id: row.id || "",
          source: row.source || "",
          companionId: row.companionId || row.characterId || "",
          preview: String(row.rawText || row.content || row.text || "").slice(0, 60),
        });
      }
    }
  }

  const graphBag = safeParse(storage.getItem(CONTEXT_GRAPH_KEY)) || {};
  const graphItems = Array.isArray(graphBag.items) ? graphBag.items.filter(Boolean) : [];
  const acceptedWithoutSource = graphItems.filter((item) => {
    const status = String(item.memoryStatus || item.status || "").trim();
    if (status && status !== "accepted") return false;
    // Treat missing status as accepted-legacy for census.
    if (!status) {
      /* count as candidate accepted-like only when explicitly accepted below */
    }
    const isAccepted = !status || status === "accepted";
    if (!isAccepted) return false;
    return !hasSourceRef(item) && !String(item.sourceId || "").trim();
  });
  const acceptedExplicitWithoutSource = graphItems.filter((item) => {
    const status = String(item.memoryStatus || item.status || "").trim();
    if (status !== "accepted") return false;
    return !hasSourceRef(item) && !String(item.sourceId || "").trim();
  });

  const timelineBag = safeParse(storage.getItem(TIMELINE_STORE_KEY)) || { events: [] };
  const timelineEvents = Array.isArray(timelineBag.events) ? timelineBag.events.filter(Boolean) : [];
  const cohabitBag = safeParse(storage.getItem(COHABIT_TIMELINE_KEY)) || { events: [] };
  const cohabitEvents = Array.isArray(cohabitBag.events) ? cohabitBag.events.filter(Boolean) : [];
  const cohabitWithoutSourceEventId = cohabitEvents.filter(
    (e) => !String(e.sourceEventId || "").trim(),
  );
  const cohabitProjectionMarked = cohabitEvents.filter((e) => e.projection === true);

  const diaryRepoBag = safeParse(storage.getItem(DIARY_STORE_KEY)) || { entries: [] };
  const diaryRepoEntries = Array.isArray(diaryRepoBag.entries) ? diaryRepoBag.entries.filter(Boolean) : [];

  const report = {
    schemaVersion: 1,
    wave: "M9",
    generatedAt: new Date().toISOString(),
    destructive: false,
    storageSource: args.storageJson || "(empty in-memory — no browser localStorage in Node)",
    memoriesSource: args.memoriesJson || null,
    palace: {
      available: Boolean(memories),
      note: memories
        ? "Read-only census from --memories-json"
        : "Pass --memories-json <dump> (IndexedDB memories export) to census palace rows.",
      ...palaceCensus,
      counts: {
        "diary.memory": diaryMemoryCount,
        "book.chunk": bookChunkCount,
        "chat.memory": chatMemoryCount,
        "worldbook.memory": worldbookMemoryCount,
        legacy_unscoped: palaceCensus.legacyUnscoped || 0,
        orphansWithoutSourceRef,
      },
      orphanSamples,
    },
    contextGraph: {
      key: CONTEXT_GRAPH_KEY,
      totalItems: graphItems.length,
      acceptedWithoutSourceRef: acceptedExplicitWithoutSource.length,
      acceptedOrLegacyMissingSourceRef: acceptedWithoutSource.length,
      samples: acceptedExplicitWithoutSource.slice(0, 15).map((item) => ({
        id: item.id || "",
        memoryStatus: item.memoryStatus || "",
        characterId: item.characterId || "",
        contentPreview: String(item.content || "").slice(0, 60),
      })),
      note: "Accepted graph rows without sourceRef should be downgraded to legacy_unverified on cutover (§13.3).",
    },
    cohabitDualKeys: {
      timelineKey: TIMELINE_STORE_KEY,
      cohabitProjectionKey: COHABIT_TIMELINE_KEY,
      timelineEventCount: timelineEvents.length,
      cohabitEventCount: cohabitEvents.length,
      cohabitMissingSourceEventId: cohabitWithoutSourceEventId.length,
      cohabitMarkedProjection: cohabitProjectionMarked.length,
      samplesMissingSourceEventId: cohabitWithoutSourceEventId.slice(0, 15).map((e) => ({
        id: e.id || "",
        appId: e.appId || "",
        kind: e.kind || "",
        characterId: e.characterId || "",
      })),
      note: "Timeline is event authority; cohabit localStorage is a non-authoritative projection when unifiedMemoryAdaptersV1 is on (projection: true).",
    },
    diaryRepository: {
      key: DIARY_STORE_KEY,
      entryCount: diaryRepoEntries.length,
      note: "Authority for diary text when diaryRepositoryV1 is on; migrate via migrateLegacyDiaryMemories.",
    },
  };

  const text = JSON.stringify(report, null, 2);
  console.log(text);

  const outPath = args.outJson || join(root, "docs/qa/unified-memory/M9_MIGRATE_REPORT.json");
  try {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${text}\n`, "utf8");
    console.error(`\nWrote ${outPath}`);
  } catch (error) {
    console.error("\nCould not write evidence JSON:", error?.message || error);
  }

  return report;
}

main();
