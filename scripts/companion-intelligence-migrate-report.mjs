/**
 * W8 / plan §15 — Read-only migration census for companion-intelligence cutover.
 *
 * Counts:
 * - legacy numeric relationship keys (intimacy/trust/tension) in experience + life-state
 * - timeline events without an explicit status field
 * - palace/memory rows without sourceType
 *
 * Non-destructive. Does not migrate, delete, or rewrite storage.
 *
 * Usage:
 *   node scripts/companion-intelligence-migrate-report.mjs
 *   node scripts/companion-intelligence-migrate-report.mjs --storage-json path/to/localStorage.json
 *   node scripts/companion-intelligence-migrate-report.mjs --memories-json path/to/memories.json
 *
 * storage-json shape: { "yueqi.timeline.events.v1": "<json string or object>", ... }
 * memories-json shape: [ { id, sourceType?, ... }, ... ]
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RELATIONSHIP_STORE_KEY } from "../src/experience/relationship.js";
import { LIFE_STATE_KEY } from "../src/companion/life-state.js";
import { TIMELINE_STORE_KEY } from "../src/timeline/repository.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const NUMERIC_KEYS = ["intimacy", "trust", "tension"];

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

function countNumericKeysInObject(obj, path = "") {
  /** @type {{ path: string, key: string, value: number }[]} */
  const hits = [];
  if (!obj || typeof obj !== "object") return hits;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => hits.push(...countNumericKeysInObject(item, `${path}[${i}]`)));
    return hits;
  }
  for (const [k, v] of Object.entries(obj)) {
    const next = path ? `${path}.${k}` : k;
    if (NUMERIC_KEYS.includes(k) && typeof v === "number" && Number.isFinite(v)) {
      hits.push({ path: next, key: k, value: v });
    } else if (v && typeof v === "object") {
      hits.push(...countNumericKeysInObject(v, next));
    }
  }
  return hits;
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const seed = loadStorageSeed(args.storageJson);
  const storage = memoryStorage(seed);
  globalThis.localStorage = storage;
  globalThis.window = { localStorage: storage };

  const relationshipBag = safeParse(storage.getItem(RELATIONSHIP_STORE_KEY)) || {};
  const lifeBag = safeParse(storage.getItem(LIFE_STATE_KEY)) || {};
  const timelineBag = safeParse(storage.getItem(TIMELINE_STORE_KEY)) || { events: [] };

  const relationshipHits = countNumericKeysInObject(relationshipBag, "experience.relationship");
  const lifeHits = countNumericKeysInObject(lifeBag, "companion.life");
  const events = Array.isArray(timelineBag.events) ? timelineBag.events.filter(Boolean) : [];
  const eventsWithoutStatus = events.filter((e) => {
    if (e.tombstone) return false;
    const hasTop = e.status != null && String(e.status).trim() !== "";
    const hasPayload = e.payload?.status != null && String(e.payload.status).trim() !== "";
    return !hasTop && !hasPayload;
  });

  const memories = loadMemories(args.memoriesJson);
  let palaceReport = {
    available: false,
    note: "Pass --memories-json <dump> (IndexedDB memories export) to census palace rows.",
    total: 0,
    withoutSourceType: 0,
    withSourceType: 0,
    samples: [],
  };
  if (memories) {
    const without = [];
    let withSource = 0;
    for (const row of memories) {
      if (!row || typeof row !== "object") continue;
      const st = String(row.sourceType || "").trim();
      if (st) withSource += 1;
      else without.push({
        id: row.id || "",
        source: row.source || "",
        preview: String(row.content || row.rawText || row.text || "").slice(0, 60),
      });
    }
    palaceReport = {
      available: true,
      note: "Read-only census from --memories-json",
      total: memories.length,
      withoutSourceType: without.length,
      withSourceType: withSource,
      samples: without.slice(0, 15),
    };
  }

  const report = {
    schemaVersion: 1,
    wave: "W8",
    generatedAt: new Date().toISOString(),
    destructive: false,
    storageSource: args.storageJson || "(empty in-memory — no browser localStorage in Node)",
    memoriesSource: args.memoriesJson || null,
    legacyNumericRelationship: {
      experienceRelationshipKey: RELATIONSHIP_STORE_KEY,
      lifeStateKey: LIFE_STATE_KEY,
      experienceHitCount: relationshipHits.length,
      lifeHitCount: lifeHits.length,
      totalHits: relationshipHits.length + lifeHits.length,
      samples: [...relationshipHits, ...lifeHits].slice(0, 25),
      note: "Legacy intimacy/trust/tension retained read-only; ordinary chat must not update/read for UX when relationshipContinuityV1 is on (§15.1).",
    },
    timeline: {
      key: TIMELINE_STORE_KEY,
      totalEvents: events.length,
      eventsWithoutStatus: eventsWithoutStatus.length,
      samples: eventsWithoutStatus.slice(0, 15).map((e) => ({
        eventId: e.eventId || "",
        eventType: e.eventType || "",
        companionId: e.companionId || "",
        source: e.source || "",
      })),
      note: "Events missing status are treated as active/legacy by resolveEventStatus; migrate to sourceType=legacy_timeline / observation when cutover (§15.2).",
    },
    palace: palaceReport,
  };

  const text = JSON.stringify(report, null, 2);
  console.log(text);

  const outPath = args.outJson
    || join(root, "docs/qa/companion-intelligence/W8_MIGRATE_REPORT.json");
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
