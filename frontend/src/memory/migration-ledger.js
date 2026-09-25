/**
 * C5 — Persistent migration ledger for product cutover runs.
 *
 * Key: yueqi.memory.migration.ledger.v1
 * Fields per run: version, startedAt, endedAt, sourceSummary, result, quarantine, failures
 *
 */

import { LOCAL_KEYS } from "../constants.js";
import { rowHasUsableSourceRef } from "./palace/source-validator.js";

export const MIGRATION_LEDGER_KEY =
  LOCAL_KEYS.migrationLedgerKey || "yueqi.memory.migration.ledger.v1";

export const MIGRATION_LEDGER_VERSION = 1;

/** Quarantine tag for palace/index rows that cannot be bound to an authority source. */
export const LEGACY_UNVERIFIED = "legacy_unverified";

/** @type {null | { getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem?(k:string):void }} */
let testStorage = null;

export function __setMigrationLedgerStorageForTests(storage) {
  testStorage = storage;
}

export function __clearMigrationLedgerForTests() {
  try {
    ls()?.removeItem?.(MIGRATION_LEDGER_KEY);
  } catch {
    /* ignore */
  }
}

function ls() {
  if (testStorage) return testStorage;
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    /* ignore */
  }
  try {
    if (typeof globalThis !== "undefined" && globalThis.localStorage) return globalThis.localStorage;
  } catch {
    /* ignore */
  }
  return null;
}

function emptyLedger() {
  return {
    schemaVersion: MIGRATION_LEDGER_VERSION,
    key: MIGRATION_LEDGER_KEY,
    runs: [],
  };
}

/**
 * @returns {{ schemaVersion: number, key: string, runs: object[] }}
 */
export function readMigrationLedger() {
  try {
    const raw = ls()?.getItem(MIGRATION_LEDGER_KEY);
    if (!raw) return emptyLedger();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return emptyLedger();
    const runs = Array.isArray(parsed.runs) ? parsed.runs : [];
    return {
      schemaVersion: Number(parsed.schemaVersion) || MIGRATION_LEDGER_VERSION,
      key: MIGRATION_LEDGER_KEY,
      runs,
    };
  } catch {
    return emptyLedger();
  }
}

function writeLedger(bag) {
  try {
    ls()?.setItem(MIGRATION_LEDGER_KEY, JSON.stringify(bag));
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error?.message || "write_failed" };
  }
}

function mintRunId() {
  return `mig-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Begin a migration run (persisted immediately with endedAt=null).
 *
 * @param {{
 *   version?: number,
 *   sourceSummary?: object,
 *   mode?: string,
 *   profile?: string,
 * }} [input]
 */
export function beginMigrationRun(input = {}) {
  const bag = readMigrationLedger();
  const run = {
    id: mintRunId(),
    version: Number(input.version) || MIGRATION_LEDGER_VERSION,
    startedAt: new Date().toISOString(),
    endedAt: null,
    mode: String(input.mode || "dry-run"),
    profile: input.profile != null ? String(input.profile) : null,
    sourceSummary: input.sourceSummary && typeof input.sourceSummary === "object"
      ? input.sourceSummary
      : {},
    result: null,
    quarantine: [],
    failures: [],
  };
  bag.runs.push(run);
  // Cap history to keep localStorage small.
  if (bag.runs.length > 40) bag.runs = bag.runs.slice(-40);
  const written = writeLedger(bag);
  if (!written.ok) {
    return { ok: false, reason: written.reason, run: null };
  }
  return { ok: true, run };
}

/**
 * Finalize an open run by id.
 *
 * @param {string} runId
 * @param {{
 *   result?: object,
 *   quarantine?: object[],
 *   failures?: Array<string|object>,
 *   endedAt?: string,
 * }} [patch]
 */
export function finalizeMigrationRun(runId, patch = {}) {
  const id = String(runId || "").trim();
  if (!id) return { ok: false, reason: "run_id_required" };
  const bag = readMigrationLedger();
  const idx = bag.runs.findIndex((r) => r && String(r.id) === id);
  if (idx < 0) return { ok: false, reason: "run_not_found" };

  const prev = bag.runs[idx];
  bag.runs[idx] = {
    ...prev,
    endedAt: patch.endedAt || new Date().toISOString(),
    result: patch.result != null ? patch.result : prev.result,
    quarantine: Array.isArray(patch.quarantine) ? patch.quarantine : (prev.quarantine || []),
    failures: Array.isArray(patch.failures) ? patch.failures : (prev.failures || []),
  };
  const written = writeLedger(bag);
  if (!written.ok) return { ok: false, reason: written.reason };
  return { ok: true, run: bag.runs[idx] };
}

/**
 * Append a fully-formed run (for tests / importers). Prefer begin+finalize in product paths.
 * @param {object} entry
 */
export function appendMigrationRun(entry = {}) {
  const bag = readMigrationLedger();
  const run = {
    id: String(entry.id || mintRunId()),
    version: Number(entry.version) || MIGRATION_LEDGER_VERSION,
    startedAt: entry.startedAt || new Date().toISOString(),
    endedAt: entry.endedAt || new Date().toISOString(),
    mode: String(entry.mode || "dry-run"),
    profile: entry.profile != null ? String(entry.profile) : null,
    sourceSummary: entry.sourceSummary && typeof entry.sourceSummary === "object"
      ? entry.sourceSummary
      : {},
    result: entry.result != null ? entry.result : null,
    quarantine: Array.isArray(entry.quarantine) ? entry.quarantine : [],
    failures: Array.isArray(entry.failures) ? entry.failures : [],
  };
  bag.runs.push(run);
  if (bag.runs.length > 40) bag.runs = bag.runs.slice(-40);
  const written = writeLedger(bag);
  if (!written.ok) return { ok: false, reason: written.reason, run: null };
  return { ok: true, run };
}

/**
 * True when a row is a diary.memory authority source (migrated to Diary Repository).
 * Those are not palace orphans — migration moves them; quarantine targets index debris.
 */
function isDiaryAuthoritySource(row) {
  if (!row || typeof row !== "object") return false;
  if (row.source === "diary.memory") return true;
  return Array.isArray(row.tags) && row.tags.includes("diary") && !row.source;
}

/**
 * Detect palace/index rows lacking a usable sourceRef (excludes diary.memory sources).
 * @param {object[]} rows
 */
export function listOrphanPalaceRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (!row || typeof row !== "object") return false;
    if (isDiaryAuthoritySource(row)) return false;
    return !rowHasUsableSourceRef(row);
  });
}

/**
 * Mark orphan palace rows as legacy_unverified (quarantine). Does not promote to Stable.
 * Skips diary.memory rows (handled by Diary Repository migration).
 *
 * @param {object[]} rows
 * @param {{ apply?: boolean, nowIso?: string }} [opts]
 * @returns {{
 *   scanned: number,
 *   orphanCount: number,
 *   quarantined: object[],
 *   rows: object[],
 * }}
 */
export function quarantineOrphanPalaceRows(rows = [], opts = {}) {
  const apply = opts.apply === true;
  const nowIso = opts.nowIso || new Date().toISOString();
  const list = Array.isArray(rows) ? rows.map((r) => (r && typeof r === "object" ? { ...r } : r)) : [];
  /** @type {object[]} */
  const quarantined = [];

  for (let i = 0; i < list.length; i += 1) {
    const row = list[i];
    if (!row || typeof row !== "object") continue;
    if (isDiaryAuthoritySource(row)) continue;
    if (rowHasUsableSourceRef(row)) continue;
    const already =
      row.quarantineStatus === LEGACY_UNVERIFIED
      || row.memoryStatus === LEGACY_UNVERIFIED
      || row.legacyUnverified === true;
    const entry = {
      id: String(row.id || "").trim() || null,
      source: row.source || null,
      companionId: String(row.companionId || row.characterId || "").trim() || null,
      reason: "missing_source_ref",
      quarantineStatus: LEGACY_UNVERIFIED,
      already,
    };
    quarantined.push(entry);
    if (apply) {
      list[i] = {
        ...row,
        quarantineStatus: LEGACY_UNVERIFIED,
        memoryStatus: LEGACY_UNVERIFIED,
        legacyUnverified: true,
        orphan: true,
        orphanReason: "missing_source_ref",
        searchable: false,
        quarantinedAt: row.quarantinedAt || nowIso,
      };
    }
  }

  return {
    scanned: list.length,
    orphanCount: quarantined.length,
    quarantined,
    rows: list,
  };
}

/**
 * Latest completed run (endedAt set), or null.
 */
export function getLatestMigrationRun() {
  const bag = readMigrationLedger();
  for (let i = bag.runs.length - 1; i >= 0; i -= 1) {
    const r = bag.runs[i];
    if (r && r.endedAt) return r;
  }
  return null;
}
