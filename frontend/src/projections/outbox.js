/**
 * Projection Outbox V1 — enqueue projection jobs after authoritative writes.
 * Idempotent by sourceRef.sourceId + sourceRef.sourceVersion + projectionKind.
 *
 * Flag `memoryProjectionOutboxV1` gates automatic product wiring (later waves).
 * Explicit enqueue still validates and stores so unit tests can exercise the path
 * while the flag defaults to false.
 */

import { isFeatureEnabled } from "../features/flags.js";
import {
  createSourceRefV1,
  sourceRefProjectionKey,
  validateSourceRefV1,
} from "../contracts/source-ref-v1.js";

export const PROJECTION_JOB_STATUSES = Object.freeze([
  "pending",
  "running",
  "complete",
  "failed",
  "dead",
]);

export const PROJECTION_OPERATIONS = Object.freeze([
  "timeline",
  "candidate",
  "palace",
  "graph",
  "delivery",
]);

/** @type {Map<string, object>} */
let jobsByKey = new Map();
/** @type {Map<string, object>} */
let jobsById = new Map();

let testStore = null;

/**
 * @param {{ get: Function, set: Function, delete?: Function, clear?: Function, values?: Function } | null} store
 */
export function __setProjectionOutboxStoreForTests(store) {
  testStore = store;
  if (!store) {
    jobsByKey = new Map();
    jobsById = new Map();
  }
}

export function __clearProjectionOutboxForTests() {
  testStore = null;
  jobsByKey = new Map();
  jobsById = new Map();
}

export function isProjectionOutboxEnabled() {
  try {
    return isFeatureEnabled("memoryProjectionOutboxV1") === true;
  } catch {
    return false;
  }
}

function mintJobId() {
  return `pjob-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
}

function readMaps() {
  if (testStore && typeof testStore.values === "function") {
    const byKey = new Map();
    const byId = new Map();
    for (const job of testStore.values()) {
      if (job?.idempotencyKey) byKey.set(job.idempotencyKey, job);
      if (job?.jobId) byId.set(job.jobId, job);
    }
    return { byKey, byId };
  }
  return { byKey: jobsByKey, byId: jobsById };
}

function persistJob(job) {
  if (testStore && typeof testStore.set === "function") {
    testStore.set(job.idempotencyKey, job);
    return job;
  }
  jobsByKey.set(job.idempotencyKey, job);
  jobsById.set(job.jobId, job);
  return job;
}

/**
 * Normalize operations list.
 * @param {unknown} raw
 * @returns {string[]}
 */
function normalizeOperations(raw) {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : ["palace"];
  return [...new Set(list.map((op) => String(op || "").trim()).filter((op) => PROJECTION_OPERATIONS.includes(op)))];
}

/**
 * @param {object} input
 * @param {{ force?: boolean }} [opts] — force=true stores even when flag is off (tests / explicit)
 * @returns {{ ok: boolean, job?: object, deduped?: boolean, errors?: string[], skipped?: boolean }}
 */
export function enqueueProjectionJob(input = {}, opts = {}) {
  const sourceRefRaw = input.sourceRef && typeof input.sourceRef === "object" ? input.sourceRef : null;
  if (!sourceRefRaw) return { ok: false, errors: ["sourceRef"] };
  const sourceRef = createSourceRefV1(sourceRefRaw);
  const refCheck = validateSourceRefV1(sourceRef);
  if (!refCheck.ok) return { ok: false, errors: refCheck.errors.map((e) => `sourceRef.${e}`) };

  const projectionKind = String(input.projectionKind || "").trim();
  if (!projectionKind) return { ok: false, errors: ["projectionKind"] };

  const flagOn = isProjectionOutboxEnabled();
  const force = opts.force === true;
  // Explicit API always stores when force or when caller is intentional infrastructure.
  // Product wiring (diary/chat) must check the flag before calling; M1 has no such wiring.
  if (!flagOn && !force && opts.requireFlag === true) {
    return { ok: true, skipped: true };
  }

  const idempotencyKey =
    String(input.idempotencyKey || "").trim() ||
    sourceRefProjectionKey(sourceRef, projectionKind);

  const { byKey } = readMaps();
  const existing = byKey.get(idempotencyKey);
  if (existing) {
    return { ok: true, job: existing, deduped: true };
  }

  const now = new Date().toISOString();
  const job = {
    jobId: String(input.jobId || mintJobId()),
    schemaVersion: 1,
    sourceRef,
    projectionKind,
    operations: normalizeOperations(input.operations),
    status: PROJECTION_JOB_STATUSES.includes(input.status) ? input.status : "pending",
    attempts: Number(input.attempts) > 0 ? Number(input.attempts) : 0,
    nextAttemptAt: String(input.nextAttemptAt || now),
    lastError: input.lastError != null ? String(input.lastError) : null,
    idempotencyKey,
    createdAt: String(input.createdAt || now),
    updatedAt: now,
    payload: input.payload && typeof input.payload === "object" ? input.payload : {},
  };

  persistJob(job);
  return { ok: true, job, deduped: false };
}

/** @returns {object[]} */
export function listProjectionJobs({ status = "" } = {}) {
  const { byId } = readMaps();
  const rows = [...byId.values()];
  const want = String(status || "").trim();
  if (!want) return rows.slice();
  return rows.filter((j) => j.status === want);
}

/**
 * @param {string} jobId
 */
export function getProjectionJob(jobId) {
  const { byId } = readMaps();
  return byId.get(String(jobId || "")) || null;
}

/**
 * @param {string} jobId
 * @param {Partial<object>} patch
 */
export function updateProjectionJob(jobId, patch = {}) {
  const job = getProjectionJob(jobId);
  if (!job) return null;
  const next = {
    ...job,
    ...patch,
    jobId: job.jobId,
    idempotencyKey: job.idempotencyKey,
    sourceRef: patch.sourceRef && typeof patch.sourceRef === "object" ? patch.sourceRef : job.sourceRef,
    updatedAt: new Date().toISOString(),
  };
  persistJob(next);
  return next;
}
